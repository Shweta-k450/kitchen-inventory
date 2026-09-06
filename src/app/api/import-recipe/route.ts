import { NextResponse } from 'next/server';
import { callClaudeForJson } from '@/lib/anthropicServer';

/**
 * Best-effort recipe import from a URL. Prefers schema.org/Recipe JSON-LD
 * structured data (which most recipe sites embed); falls back to handing the
 * trimmed page text to Claude when there's nothing structured.
 */

function isSafeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) return null;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
  return u;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function textFrom(v: unknown): string {
  if (typeof v === 'string') return decodeEntities(v).replace(/\s+/g, ' ').trim();
  if (v && typeof v === 'object' && 'text' in (v as object)) return textFrom((v as { text: unknown }).text);
  return '';
}

function collectRecipes(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) { node.forEach((n) => collectRecipes(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) out.push(obj);
  if (obj['@graph']) collectRecipes(obj['@graph'], out);
}

function findRecipeLd(html: string): Record<string, unknown> | null {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const found: Record<string, unknown>[] = [];
  for (const b of blocks) {
    const jsonText = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>\s*$/i, '').trim();
    try { collectRecipes(JSON.parse(jsonText), found); } catch { /* not valid JSON — skip */ }
  }
  return found[0] || null;
}

function yieldToNumber(y: unknown): number | null {
  const arr = Array.isArray(y) ? y : [y];
  for (const v of arr) {
    const m = String(v).match(/\d+/);
    if (m) { const n = parseInt(m[0], 10); if (n > 0 && n < 100) return n; }
  }
  return null;
}

function instructionsToText(ins: unknown): string {
  if (typeof ins === 'string') return decodeEntities(stripTags(ins));
  if (!Array.isArray(ins)) return '';
  const lines: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (o['@type'] === 'HowToSection' && o.itemListElement) { walk(o.itemListElement); return; }
      const t = textFrom(o.text ?? o.name);
      if (t) lines.push(t);
      return;
    }
    const s = textFrom(node);
    if (s) lines.push(s);
  };
  walk(ins);
  return lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
}

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KitchenInventoryBot/1.0)', Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) { const e = new Error('fetch_failed') as Error & { code: string }; e.code = 'fetch_failed'; throw e; }
    const buf = await res.arrayBuffer();
    return new TextDecoder('utf-8').decode(buf.slice(0, 2_000_000));
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = body && typeof body.url === 'string' ? body.url.trim() : '';
  const url = raw ? isSafeUrl(raw) : null;
  if (!url) return NextResponse.json({ error: 'bad_url' }, { status: 400 });

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    const code = (err as { name?: string })?.name === 'AbortError' ? 'timeout' : ((err as { code?: string })?.code || 'fetch_failed');
    return NextResponse.json({ error: code }, { status: 502 });
  }

  // 1) schema.org/Recipe structured data
  const ld = findRecipeLd(html);
  if (ld) {
    const name = textFrom(ld.name);
    const ingredients = Array.isArray(ld.recipeIngredient) ? (ld.recipeIngredient as unknown[]).map(textFrom).filter(Boolean) : [];
    if (name && ingredients.length) {
      return NextResponse.json({
        recipe: {
          name,
          servings: yieldToNumber(ld.recipeYield),
          ingredientsText: ingredients.join('\n'),
          instructions: instructionsToText(ld.recipeInstructions),
          source: 'structured',
        },
      });
    }
  }

  // 2) fall back to Claude on the trimmed page text
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const pageText = stripTags(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  ).slice(0, 8000);
  const prompt =
    'The following is text scraped from a web page that may contain a recipe. Extract the recipe as JSON: ' +
    '{"name": the recipe title (string), "servings": number of servings as an integer, or null, ' +
    '"ingredients": array of ingredient line strings exactly as written on the page, ' +
    '"instructions": the method as one string with numbered steps separated by newlines, or ""}. ' +
    'If the page is not a recipe, reply {"name": null}. Reply with ONLY the JSON object.\n\n' +
    (titleMatch ? 'Page title: ' + decodeEntities(titleMatch[1]) + '\n\n' : '') + pageText;

  try {
    const result = await callClaudeForJson({ prompt });
    const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const ingredients = Array.isArray(r.ingredients) ? (r.ingredients as unknown[]).map((x) => String(x).trim()).filter(Boolean) : [];
    if (!name || !ingredients.length) return NextResponse.json({ error: 'no_recipe' }, { status: 422 });
    return NextResponse.json({
      recipe: {
        name,
        servings: typeof r.servings === 'number' && r.servings > 0 ? Math.round(r.servings) : null,
        ingredientsText: ingredients.join('\n'),
        instructions: typeof r.instructions === 'string' ? r.instructions : '',
        source: 'ai',
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code || 'upstream_error';
    return NextResponse.json({ error: code }, { status: code === 'not_configured' ? 501 : 502 });
  }
}

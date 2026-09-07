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

function imageUrlFrom(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) { for (const x of v) { const s = imageUrlFrom(x); if (s) return s; } return ''; }
  if (v && typeof v === 'object') return imageUrlFrom((v as { url?: unknown }).url);
  return '';
}

function ogImage(html: string): string {
  const m = html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i);
  return m ? decodeEntities(m[1]).trim() : '';
}

/** Fetch an image and inline it as a data URL; hand back the plain URL if it's too big to inline. */
async function fetchImage(src: string, base: URL): Promise<string | null> {
  let u: URL;
  try { u = new URL(src, base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(u.toString(), { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KitchenInventoryBot/1.0)' } });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim() || 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    if (Number(res.headers.get('content-length') || 0) > 3_000_000) return u.toString();
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 480_000) return u.toString();
    return `data:${type};base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

// ---------- YouTube ----------
// We can't watch the video, but the recipe usually lives in the video description
// (creators paste it there) and/or the auto-caption transcript. Grab both and let
// Claude reconstruct the recipe from that text.

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);

function youtubeVideoId(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  let id = '';
  if (host === 'youtu.be' || host === 'www.youtu.be') id = parts[0] || '';
  else if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
  else if (['shorts', 'live', 'embed', 'v'].includes(parts[0] || '')) id = parts[1] || '';
  return /^[\w-]{11}$/.test(id) ? id : null;
}

async function ytFetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: 'CONSENT=YES+cb; PREF=hl=en',
      },
    });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    return new TextDecoder('utf-8').decode(buf.slice(0, 3_000_000));
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** JSON-unescape a string captured from raw page JSON (handles \n, \uXXXX, \" …). */
function jsonStr(raw: string): string {
  try { return JSON.parse('"' + raw + '"'); } catch { return raw; }
}

async function fetchYouTubeContext(id: string): Promise<{ title: string; description: string; thumbnailUrl: string; transcript: string }> {
  let title = '';
  let description = '';
  let thumbnailUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  let transcript = '';

  // (a) Data API — most reliable for the full description + title, when a key is set.
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${key}`, { signal: controller.signal });
      if (res.ok) {
        const j = (await res.json()) as { items?: { snippet?: { title?: string; description?: string; thumbnails?: Record<string, { url?: string }> } }[] };
        const sn = j.items?.[0]?.snippet;
        if (sn) {
          title = sn.title || '';
          description = sn.description || '';
          const th = sn.thumbnails || {};
          thumbnailUrl = th.maxres?.url || th.standard?.url || th.high?.url || th.medium?.url || thumbnailUrl;
        }
      }
    } catch { /* fall through to scraping */ } finally { clearTimeout(timer); }
  }

  // (b) Scrape the watch page — fills in description/title if there's no key, and
  // carries the caption tracks we need for a transcript.
  const html = await ytFetchText(`https://www.youtube.com/watch?v=${id}&hl=en`, 10000);
  if (html) {
    if (!description) {
      const m = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
      if (m) description = jsonStr(m[1]);
    }
    if (!title) {
      const m = html.match(/<title>([^<]*)<\/title>/i);
      if (m) title = decodeEntities(m[1]).replace(/\s*-\s*YouTube\s*$/i, '').trim();
    }
  }

  // (c) Transcript — only bother when the description is too short to hold the recipe.
  if (html && description.replace(/\s+/g, ' ').trim().length < 600) {
    try {
      const tm = html.match(/"captionTracks":(\[[\s\S]*?\])(?=,"[a-zA-Z])/);
      if (tm) {
        const tracks = JSON.parse(tm[1]) as { baseUrl?: string; languageCode?: string; kind?: string }[];
        const track =
          tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ||
          tracks.find((t) => t.languageCode === 'en') ||
          tracks[0];
        let tu: URL | null = null;
        try { tu = track?.baseUrl ? new URL(track.baseUrl) : null; } catch { tu = null; }
        if (tu && tu.protocol === 'https:' && (tu.hostname === 'www.youtube.com' || tu.hostname.endsWith('.youtube.com'))) {
          const xml = await ytFetchText(tu.toString(), 8000);
          const parts = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((x) => decodeEntities(stripTags(x[1])));
          transcript = parts.join(' ').replace(/\s+/g, ' ').trim();
        }
      }
    } catch { /* transcript is a bonus — ignore failures */ }
  }

  return { title, description, thumbnailUrl, transcript };
}

async function importFromYouTube(id: string, url: URL) {
  const ctx = await fetchYouTubeContext(id);
  const material = [
    ctx.title ? `Video title: ${ctx.title}` : '',
    ctx.description ? `Video description:\n${ctx.description.slice(0, 6000)}` : '',
    ctx.transcript ? `Auto-generated spoken transcript (rough — quantities may be approximate):\n${ctx.transcript.slice(0, 10000)}` : '',
  ].filter(Boolean).join('\n\n');

  if (material.replace(/\s+/g, '').length < 40) {
    return NextResponse.json({ error: 'no_recipe' }, { status: 422 });
  }

  const prompt =
    'The text below is the title, description and (sometimes) an auto-generated transcript of a cooking video. ' +
    'Reconstruct the recipe as JSON: {"name": recipe title as a string, "servings": number of servings as an integer or null, ' +
    '"ingredients": array of ingredient line strings including quantities where stated (e.g. "2 cups flour") — prefer an explicit ' +
    'ingredient list in the description over inferring amounts from the transcript, ' +
    '"instructions": the method as one string with numbered steps separated by newlines}. ' +
    'Ignore sponsor reads, "like and subscribe", links and off-topic chatter. ' +
    'If there is no recipe here, reply {"name": null}. Reply with ONLY the JSON object.\n\n' + material;

  let result: unknown;
  try {
    result = await callClaudeForJson({ prompt, maxTokens: 3072 });
  } catch (err) {
    const code = (err as { code?: string })?.code || 'upstream_error';
    return NextResponse.json({ error: code }, { status: code === 'not_configured' ? 501 : 502 });
  }

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
      photoDataUrl: ctx.thumbnailUrl ? await fetchImage(ctx.thumbnailUrl, url) : null,
      source: 'ai',
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = body && typeof body.url === 'string' ? body.url.trim() : '';
  const url = raw ? isSafeUrl(raw) : null;
  if (!url) return NextResponse.json({ error: 'bad_url' }, { status: 400 });

  const ytId = youtubeVideoId(url);
  if (ytId) {
    try {
      return await importFromYouTube(ytId, url);
    } catch (err) {
      const code = (err as { name?: string })?.name === 'AbortError' ? 'timeout' : ((err as { code?: string })?.code || 'fetch_failed');
      return NextResponse.json({ error: code }, { status: 502 });
    }
  }

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    const code = (err as { name?: string })?.name === 'AbortError' ? 'timeout' : ((err as { code?: string })?.code || 'fetch_failed');
    return NextResponse.json({ error: code }, { status: 502 });
  }

  const photoSrc = (v: unknown) => imageUrlFrom(v) || ogImage(html);

  // 1) schema.org/Recipe structured data
  const ld = findRecipeLd(html);
  if (ld) {
    const name = textFrom(ld.name);
    const ingredients = Array.isArray(ld.recipeIngredient) ? (ld.recipeIngredient as unknown[]).map(textFrom).filter(Boolean) : [];
    if (name && ingredients.length) {
      const src = photoSrc(ld.image);
      return NextResponse.json({
        recipe: {
          name,
          servings: yieldToNumber(ld.recipeYield),
          ingredientsText: ingredients.join('\n'),
          instructions: instructionsToText(ld.recipeInstructions),
          photoDataUrl: src ? await fetchImage(src, url) : null,
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
    const src = ogImage(html);
    return NextResponse.json({
      recipe: {
        name,
        servings: typeof r.servings === 'number' && r.servings > 0 ? Math.round(r.servings) : null,
        ingredientsText: ingredients.join('\n'),
        instructions: typeof r.instructions === 'string' ? r.instructions : '',
        photoDataUrl: src ? await fetchImage(src, url) : null,
        source: 'ai',
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code || 'upstream_error';
    return NextResponse.json({ error: code }, { status: code === 'not_configured' ? 501 : 502 });
  }
}

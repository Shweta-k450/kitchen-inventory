import { NextResponse } from 'next/server';
import { callClaudeForJson } from '@/lib/anthropicServer';
import { CATEGORIES } from '@/lib/constants';

/**
 * Best-effort recipe import from a URL. Prefers schema.org/Recipe JSON-LD
 * structured data (which most recipe sites embed); falls back to handing the
 * trimmed page text to Claude when there's nothing structured.
 */

// Ask Claude for ingredients already in the app's structured shape, so the recipe
// flow can use them straight away instead of re-parsing the text (which is where
// long lists used to fail).
const CAT_IDS = CATEGORIES.map((c) => c.id).join(', ');
const RECIPE_UNITS_SET = new Set(['g', 'kg', 'mL', 'L', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'clove', 'slice', 'pinch', 'pack', 'count']);
const CAT_ID_SET = new Set(CATEGORIES.map((c) => c.id));

const STRUCTURED_INGREDIENTS_SPEC =
  '"ingredients": an array of objects, one per real ingredient — skip section headings like "For the masala:" — each object being ' +
  '{"text": the ingredient written as on a recipe card (e.g. "2 cups chopped onion"), ' +
  '"name": a short lowercase singular core name with quantity/unit/prep words removed (e.g. "onion"), ' +
  '"quantity": the amount and size as written, or null, ' +
  '"amount": the numeric quantity as a decimal, converting fractions (1/4 -> 0.25, 1 1/2 -> 1.5), or null if the line has no number, ' +
  '"unit": exactly one of g, kg, mL, L, tsp, tbsp, cup, oz, lb, clove, slice, pinch, pack, count — matching how it is measured (use "count" for whole items like "2 eggs"), or null when there is no amount, ' +
  '"category": exactly one of these ids — ' + CAT_IDS + ' — whichever fits best, or null, ' +
  '"trackable": false ONLY for plain water or ice, true for everything else}';

type IngRow = { text: string; name: string; quantity: string | null; amount: number | null; unit: string | null; category: string | null; trackable: boolean };

function normalizeIngredients(raw: unknown): IngRow[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: IngRow[] = [];
  for (const it of arr) {
    if (typeof it === 'string') {
      const t = it.trim();
      if (t) out.push({ text: t, name: t.toLowerCase(), quantity: null, amount: null, unit: null, category: null, trackable: true });
      continue;
    }
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const text = typeof o.text === 'string' && o.text.trim() ? o.text.trim() : (typeof o.name === 'string' ? o.name.trim() : '');
    if (!text) continue;
    const amount = typeof o.amount === 'number' && Number.isFinite(o.amount) && o.amount > 0 ? o.amount : null;
    out.push({
      text,
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().toLowerCase() : text.toLowerCase(),
      quantity: typeof o.quantity === 'string' && o.quantity.trim() ? o.quantity.trim() : null,
      amount,
      unit: amount != null && typeof o.unit === 'string' && RECIPE_UNITS_SET.has(o.unit) ? o.unit : null,
      category: typeof o.category === 'string' && CAT_ID_SET.has(o.category) ? o.category : null,
      trackable: o.trackable === false ? false : true,
    });
  }
  return out;
}

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
    STRUCTURED_INGREDIENTS_SPEC + ' — prefer amounts written in the description over inferring them from the transcript, ' +
    '"instructions": the method as one string with numbered steps separated by newlines}. ' +
    'Ignore sponsor reads, "like and subscribe", links and off-topic chatter. ' +
    'If there is no recipe here, reply {"name": null}. Reply with ONLY the JSON object.\n\n' + material;

  let result: unknown;
  try {
    result = await callClaudeForJson({ prompt, maxTokens: 4096 });
  } catch (err) {
    const code = (err as { code?: string })?.code || 'upstream_error';
    return NextResponse.json({ error: code }, { status: code === 'not_configured' ? 501 : 502 });
  }

  const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const ingredients = normalizeIngredients(r.ingredients);
  if (!name || !ingredients.length) return NextResponse.json({ error: 'no_recipe' }, { status: 422 });

  return NextResponse.json({
    recipe: {
      name,
      servings: typeof r.servings === 'number' && r.servings > 0 ? Math.round(r.servings) : null,
      ingredientsText: ingredients.map((i) => i.text).join('\n'),
      ingredients,
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
          ingredients: null,
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
    STRUCTURED_INGREDIENTS_SPEC + ', ' +
    '"instructions": the method as one string with numbered steps separated by newlines, or ""}. ' +
    'If the page is not a recipe, reply {"name": null}. Reply with ONLY the JSON object.\n\n' +
    (titleMatch ? 'Page title: ' + decodeEntities(titleMatch[1]) + '\n\n' : '') + pageText;

  try {
    const result = await callClaudeForJson({ prompt, maxTokens: 4096 });
    const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const ingredients = normalizeIngredients(r.ingredients);
    if (!name || !ingredients.length) return NextResponse.json({ error: 'no_recipe' }, { status: 422 });
    const src = ogImage(html);
    return NextResponse.json({
      recipe: {
        name,
        servings: typeof r.servings === 'number' && r.servings > 0 ? Math.round(r.servings) : null,
        ingredientsText: ingredients.map((i) => i.text).join('\n'),
        ingredients,
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

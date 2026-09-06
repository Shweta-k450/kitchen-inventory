import { NextResponse } from 'next/server';
import { callClaudeForJson } from '@/lib/anthropicServer';
import { CATEGORIES } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const imageBase64 = body && typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const mimeType = body && typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  if (!imageBase64) {
    return NextResponse.json({ error: 'missing_image' }, { status: 400 });
  }

  const catIds = CATEGORIES.map((c) => c.id).join(', ');
  const prompt =
    'Look at this photo of a single grocery or pantry item and identify it.\n\n' +
    'Reply with ONLY one JSON object: {"name": a short clean product name in Title Case, "category": one of exactly these ids — ' +
    catIds + ' — pick the closest match, "needsDate": true if this is the kind of product that typically has an expiry or use-by date (fresh produce, dairy, meat, opened condiments), false for shelf-stable staples that usually aren\'t dated (dry spices, rice, dried beans)}.\n\n' +
    'If you cannot tell what the item is, make your best guess rather than refusing.';

  try {
    const result = await callClaudeForJson({ prompt, imageBase64, imageMediaType: mimeType, maxTokens: 512 }) as Record<string, unknown>;
    const name = typeof result?.name === 'string' && result.name.trim() ? result.name.trim() : null;
    if (!name) return NextResponse.json({ error: 'invalid_json' }, { status: 502 });
    const category = CATEGORIES.some((c) => c.id === result.category) ? result.category : null;
    const needsDate = result.needsDate !== false;
    return NextResponse.json({ item: { name, category, needsDate } });
  } catch (err) {
    const code = (err as { code?: string })?.code || 'upstream_error';
    return NextResponse.json({ error: code }, { status: code === 'not_configured' ? 501 : 502 });
  }
}

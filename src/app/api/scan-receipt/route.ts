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
    'Read this grocery store receipt photo and list the individual grocery products purchased ' +
    '(skip tax, subtotal, total, discounts, coupons, payment method, membership/loyalty numbers, and store header/footer text).\n\n' +
    'For each product reply with one JSON object: {"name": a short clean product name in Title Case (expand abbreviations, remove SKU/PLU codes), ' +
    '"category": one of exactly these ids — ' + catIds + ' — pick the closest match, "quantity": a short quantity or size string as shown on the receipt (e.g. "2 lb", "1"), or null if not shown}.\n\n' +
    'Reply with ONLY a JSON array of these objects, in the order they appear on the receipt. If this image is not a grocery receipt or no items are legible, reply with [].';

  try {
    const result = await callClaudeForJson({ prompt, imageBase64, imageMediaType: mimeType, maxTokens: 4096 });
    const items = Array.isArray(result) ? result : [];
    return NextResponse.json({ items });
  } catch (err) {
    const code = (err as { code?: string })?.code || 'upstream_error';
    return NextResponse.json({ error: code }, { status: code === 'not_configured' ? 501 : 502 });
  }
}

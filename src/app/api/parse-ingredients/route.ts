import { NextResponse } from 'next/server';
import { callClaudeForJson } from '@/lib/anthropicServer';
import { CATEGORIES } from '@/lib/constants';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'missing_text' }, { status: 400 });
  }

  const catIds = CATEGORIES.map((c) => c.id).join(', ');
  const prompt =
    'Read this pasted list of recipe ingredients (one per line, possibly with quantities, units, or prep notes) and convert each ingredient into a structured object.\n\n' +
    'Skip blank lines, section headings (like "For the sauce:"), and anything that is not an ingredient.\n\n' +
    'For each ingredient reply with one JSON object: {"text": the ingredient line as written, "name": a short lowercase singular core ingredient name with quantities/units/prep words removed (e.g. "2 cups chopped yellow onion" -> "onion"), "quantity": the amount or size as written, or null if none, "category": one of exactly these ids — ' +
    catIds +
    ' — whichever best matches, or null if none fit well, "trackable": false ONLY for universally-available basics not worth tracking or shopping for (plain water, ice), true for everything else}.\n\n' +
    'Reply with ONLY a JSON array of these objects, in the original order.\n\nIngredients:\n' + text;

  try {
    const result = await callClaudeForJson({ prompt });
    const items = Array.isArray(result) ? result : [];
    return NextResponse.json({ items });
  } catch (err) {
    const code = (err as { code?: string })?.code || 'upstream_error';
    return NextResponse.json({ error: code }, { status: code === 'not_configured' ? 501 : 502 });
  }
}

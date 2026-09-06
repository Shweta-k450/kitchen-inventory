import { NextResponse } from 'next/server';
import { callClaudeForJson } from '@/lib/anthropicServer';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = body && typeof body.name === 'string' ? body.name : 'Recipe';
  const servings = body && Number.isFinite(body.servings) ? body.servings : null;
  const lines: string[] = Array.isArray(body?.ingredientLines) ? body.ingredientLines : [];
  if (!servings || !lines.length) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const prompt =
    'Estimate approximate nutrition for ONE serving of this home-cooked recipe. This is a casual estimate for a home cook, not a certified nutrition label — a reasonable approximation is fine.\n\n' +
    'Recipe: ' + name + '\nServings the whole recipe makes: ' + servings + '\nIngredients (for the whole recipe):\n' + lines.join('\n') + '\n\n' +
    'Reply with ONLY one JSON object: {"calories": number (kcal per serving), "proteinG": number (grams protein per serving), "carbsG": number (grams carbohydrate per serving), "fatG": number (grams fat per serving)}. Round every value to a whole number.';

  try {
    const result = await callClaudeForJson({ prompt, maxTokens: 512 }) as Record<string, unknown>;
    const cal = Math.round(Number(result?.calories));
    const pro = Math.round(Number(result?.proteinG));
    const carb = Math.round(Number(result?.carbsG));
    const fat = Math.round(Number(result?.fatG));
    const valid = [cal, pro, carb, fat].every((n) => Number.isFinite(n) && n >= 0);
    if (!valid) return NextResponse.json({ error: 'invalid_json' }, { status: 502 });
    return NextResponse.json({ nutrition: { calories: cal, protein: pro, carbs: carb, fat: fat } });
  } catch (err) {
    const code = (err as { code?: string })?.code || 'upstream_error';
    return NextResponse.json({ error: code }, { status: code === 'not_configured' ? 501 : 502 });
  }
}

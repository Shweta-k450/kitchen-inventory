import { resizeImageFileToDataUrl } from './logic';
import type { Ingredient, Nutrition } from './types';

function dataUrlToBase64(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!match) throw new Error('invalid_data_url');
  return { mimeType: match[1], base64: match[2] };
}

export type ApiErrorCode = string;

export interface ImportedRecipe {
  name: string;
  servings: number | null;
  ingredientsText: string;
  /** Pre-structured ingredient rows when the importer could build them (AI paths); null otherwise. */
  ingredients: Partial<Ingredient>[] | null;
  instructions: string;
  photoDataUrl: string | null;
  source: 'structured' | 'ai';
}

export async function importRecipeApi(url: string): Promise<{ recipe?: ImportedRecipe; error?: ApiErrorCode }> {
  try {
    const res = await fetch('/api/import-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'upstream_error' };
    return { recipe: data.recipe };
  } catch {
    return { error: 'network_error' };
  }
}

export async function parseIngredientsApi(text: string): Promise<{ items?: Partial<Ingredient>[]; error?: ApiErrorCode }> {
  try {
    const res = await fetch('/api/parse-ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'upstream_error' };
    return { items: data.items };
  } catch {
    return { error: 'network_error' };
  }
}

export async function estimateNutritionApi(name: string, servings: number, ingredientLines: string[]): Promise<{ nutrition?: Nutrition; error?: ApiErrorCode }> {
  try {
    const res = await fetch('/api/estimate-nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, servings, ingredientLines }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'upstream_error' };
    return { nutrition: data.nutrition };
  } catch {
    return { error: 'network_error' };
  }
}

export async function scanReceiptApi(file: File): Promise<{ items?: { name: string; category: string; quantity: string | null }[]; error?: ApiErrorCode }> {
  try {
    const dataUrl = await resizeImageFileToDataUrl(file, 1600, 0.85);
    const { base64, mimeType } = dataUrlToBase64(dataUrl);
    const res = await fetch('/api/scan-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'upstream_error' };
    return { items: data.items };
  } catch {
    return { error: 'network_error' };
  }
}

export async function scanItemApi(file: File): Promise<{ item?: { name: string; category: string | null; needsDate: boolean }; error?: ApiErrorCode }> {
  try {
    const dataUrl = await resizeImageFileToDataUrl(file, 900, 0.8);
    const { base64, mimeType } = dataUrlToBase64(dataUrl);
    const res = await fetch('/api/scan-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'upstream_error' };
    return { item: data.item };
  } catch {
    return { error: 'network_error' };
  }
}

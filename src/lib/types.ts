export type LocationId = 'pantry' | 'fridge' | 'freezer' | 'spare-fridge' | 'spare-freezer';
export type ItemStatus = 'ok' | 'low' | 'out' | 'buy-now' | 'skip';
export type DateType = 'expiry' | 'consume-by' | null;

export interface CategoryDef {
  id: string;
  label: string;
  color: string;
}

export interface StoreDef {
  id: string;
  label: string;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  location: LocationId;
  bin: string;
  store: string | null;
  status: ItemStatus;
  dateType: DateType;
  date: string | null; // ISO date string, or null
  quantity?: number | null; // amount on hand, paired with `unit`
  unit?: string | null; // 'kg' | 'g' | 'L' | 'mL' | 'lb' | 'oz' | 'count' | 'pack'
}

export interface Ingredient {
  ingId: string;
  text: string;
  name: string;
  quantity: string; // free text as written, kept for display
  amount?: number | null; // structured amount, for meal-plan shopping math
  unit?: string | null; // g kg mL L tsp tbsp cup oz lb count clove slice pinch pack
  category: string | null;
  trackable: boolean;
}

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: Ingredient[];
  instructions: string;
  photoDataUrl: string;
  servings: number | null;
  nutrition: Nutrition | null;
}

/** One recipe scheduled onto a day of the rolling meal plan. */
export interface MealPlanEntry {
  id: string;
  recipeId: string;
  date: string; // 'YYYY-MM-DD'
  servings: number; // servings to make that day
}

export interface ManualGroceryItem {
  id: string;
  name: string;
}

// The five built-ins ship in code; the household can add more (stored in Firestore),
// so a location id is any string. 'pantry' keeps its special bin-grid behaviour.
export type LocationId = string;
export type LocationIcon = 'box' | 'fridge' | 'snow';

export interface LocationDef {
  id: string;
  label: string;
  color: string;
  icon: LocationIcon;
}
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
  needsSorting?: boolean | null; // just bought from the grocery list — user still has to place it / confirm quantity
  sortReason?: 'new' | 'restocked' | null; // why it's in the "to be sorted" bucket
}

export interface Ingredient {
  ingId: string;
  text: string;
  name: string;
  quantity: string; // free text as written, kept for display
  amount?: number | null; // structured amount (parsed), for meal-plan shopping math
  amountText?: string | null; // amount exactly as typed, e.g. "1/4" — round-trips the editor field
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
  category?: string | null; // recipe category, e.g. "Dinner", "South Indian"
}

export type MealSlot = 'breakfast' | 'brunch' | 'lunch' | 'snack' | 'dinner';

/** One recipe scheduled onto a day of the rolling meal plan. */
export interface MealPlanEntry {
  id: string;
  recipeId: string;
  date: string; // 'YYYY-MM-DD'
  servings: number; // servings to make that day
  meal?: MealSlot | null; // which meal of the day
  cooked?: boolean;
  cookedAt?: string | null; // 'YYYY-MM-DD' the day it was cooked
  preparedId?: string | null; // links to the PreparedFood record it produced
}

/** Something the cook-off subtracted from inventory, kept so a cook can be undone. */
export interface Deduction {
  itemId: string;
  amount: number | null; // subtracted from item.quantity in `unit`; null = status-only nudge
  unit: string | null;
  prevStatus: ItemStatus | null; // set when the cook also changed the item's status
}

/** A cooked dish sitting in the fridge, tracked by servings. */
export interface PreparedFood {
  id: string;
  recipeId: string | null;
  name: string;
  madeOn: string; // 'YYYY-MM-DD'
  servingsMade: number;
  useBy: string | null; // 'YYYY-MM-DD'
  planEntryId: string | null;
  deductions: Deduction[];
  eaten: { date: string; servings: number }[];
}

export interface ManualGroceryItem {
  id: string;
  name: string;
}

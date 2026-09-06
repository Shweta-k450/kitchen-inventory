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
}

export interface Ingredient {
  ingId: string;
  text: string;
  name: string;
  quantity: string;
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
  planned: boolean;
  servings: number | null;
  nutrition: Nutrition | null;
}

export interface ManualGroceryItem {
  id: string;
  name: string;
}

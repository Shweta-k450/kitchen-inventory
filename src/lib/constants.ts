import type { CategoryDef, StoreDef, Item, DateType, LocationId } from './types';

export const CATEGORIES: CategoryDef[] = [
  { id: 'indian-spices', label: 'Indian Spices', color: '#741b21' },
  { id: 'western-spices', label: 'Western Spices', color: '#cf303b' },
  { id: 'grains', label: 'Grains', color: '#cf986e' },
  { id: 'lentils', label: 'Lentils', color: '#a16436' },
  { id: 'beans', label: 'Beans', color: '#827217' },
  { id: 'pasta', label: 'Pasta', color: '#c98d5e' },
  { id: 'breakfast', label: 'Breakfast', color: '#c775b7' },
  { id: 'baking-supplies', label: 'Baking Supplies', color: '#734726' },
  { id: 'condiments', label: 'Condiments', color: '#983e86' },
  { id: 'bread', label: 'Bread', color: '#bf7740' },
  { id: 'vegetables', label: 'Vegetables', color: '#b6a020' },
  { id: 'fruits', label: 'Fruits', color: '#da626a' },
  { id: 'herbs', label: 'Herbs', color: '#dfc849' },
  { id: 'oils', label: 'Oils', color: '#574c0f' },
  { id: 'frozen-foods', label: 'Frozen Foods', color: '#9275c7' },
  { id: 'frozen-snacks', label: 'Frozen Snacks', color: '#5e3e98' },
  { id: 'frozen-veggies', label: 'Frozen Veggies', color: '#4b818b' },
  { id: 'frozen-fruit', label: 'Frozen Fruit', color: '#81b1bb' },
];
export const CATEGORY_MAP: Record<string, CategoryDef> = {};
CATEGORIES.forEach((c) => { CATEGORY_MAP[c.id] = c; });

export const DATE_TYPE_BY_CATEGORY: Record<string, DateType> = {
  'indian-spices': null, 'western-spices': null, grains: null, lentils: null,
  beans: null, pasta: null, breakfast: null, 'baking-supplies': null,
  condiments: 'expiry', bread: 'expiry', vegetables: 'consume-by', fruits: 'consume-by',
  herbs: 'consume-by', oils: 'expiry', 'frozen-foods': 'expiry', 'frozen-snacks': null,
  'frozen-veggies': 'expiry', 'frozen-fruit': 'expiry',
};

export const DEFAULT_LOCATION_BY_CATEGORY: Record<string, LocationId> = {
  'indian-spices': 'pantry', 'western-spices': 'pantry', grains: 'pantry', lentils: 'pantry',
  beans: 'pantry', pasta: 'pantry', breakfast: 'pantry', 'baking-supplies': 'pantry',
  condiments: 'pantry', bread: 'pantry', vegetables: 'fridge', fruits: 'fridge',
  herbs: 'fridge', oils: 'pantry', 'frozen-foods': 'freezer', 'frozen-snacks': 'freezer',
  'frozen-veggies': 'freezer', 'frozen-fruit': 'freezer',
};

export const LOCATIONS: { id: LocationId; label: string }[] = [
  { id: 'pantry', label: 'Pantry' },
  { id: 'fridge', label: 'Fridge' },
  { id: 'freezer', label: 'Freezer' },
  { id: 'spare-fridge', label: 'Spare Fridge' },
  { id: 'spare-freezer', label: 'Spare Freezer' },
];
export const LOCATION_MAP: Record<string, { id: LocationId; label: string }> = {};
LOCATIONS.forEach((l) => { LOCATION_MAP[l.id] = l; });

export const STORES: StoreDef[] = [
  { id: 'indian-store', label: 'Indian Store' },
  { id: 'costco', label: 'Costco' },
  { id: 'grecos', label: "Greco's" },
];
export const STORE_MAP: Record<string, StoreDef> = {};
STORES.forEach((s) => { STORE_MAP[s.id] = s; });

export const STATUS_COLORS: Record<string, string> = { ok: '#73650e', low: '#4d3181', out: '#a31c26', 'buy-now': '#7e4c25', skip: '#78745e' };
export const STATUS_LABELS: Record<string, string> = { low: 'Low', out: 'Out', 'buy-now': 'Buy Now', skip: 'Skip' };

export const BIN_PRESETS = ['Baking Bin', 'Noodle and Pasta Bin', 'Condiment Shelf', 'Snack Shelf', 'Indian Spices Bin', 'Indian Pantry Bin', 'Drinks Shelf', 'Spice Drawer', 'Breakfast Shelf', 'Dry Ingredients Shelf', 'Island'];

export const INITIAL_ITEMS: Item[] = [
  { id: 'p1', name: 'Basmati Rice', category: 'grains', location: 'pantry', bin: 'Dry Ingredients Shelf', store: 'indian-store', status: 'ok', dateType: null, date: null },
  { id: 'p2', name: 'Toor Dal', category: 'lentils', location: 'pantry', bin: 'Indian Pantry Bin', store: 'indian-store', status: 'low', dateType: null, date: null },
  { id: 'p3', name: 'Dried Chickpeas', category: 'beans', location: 'pantry', bin: 'Dry Ingredients Shelf', store: 'costco', status: 'ok', dateType: null, date: null },
  { id: 'p4', name: 'Garam Masala', category: 'indian-spices', location: 'pantry', bin: 'Indian Spices Bin', store: 'indian-store', status: 'out', dateType: null, date: null },
  { id: 'p5', name: 'Turmeric Powder', category: 'indian-spices', location: 'pantry', bin: 'Indian Spices Bin', store: 'indian-store', status: 'ok', dateType: null, date: null },
  { id: 'p6', name: 'Cumin Seeds', category: 'indian-spices', location: 'pantry', bin: 'Indian Spices Bin', store: 'indian-store', status: 'ok', dateType: null, date: null },
  { id: 'p7', name: 'Dried Oregano', category: 'western-spices', location: 'pantry', bin: 'Spice Drawer', store: 'costco', status: 'ok', dateType: null, date: null },
  { id: 'p8', name: 'Black Peppercorns', category: 'western-spices', location: 'pantry', bin: 'Spice Drawer', store: 'costco', status: 'low', dateType: null, date: null },
  { id: 'p9', name: 'Penne Pasta', category: 'pasta', location: 'pantry', bin: 'Noodle and Pasta Bin', store: 'costco', status: 'ok', dateType: null, date: null },
  { id: 'p10', name: 'All-Purpose Flour', category: 'baking-supplies', location: 'pantry', bin: 'Baking Bin', store: 'costco', status: 'low', dateType: null, date: null },
  { id: 'p11', name: 'Granulated Sugar', category: 'baking-supplies', location: 'pantry', bin: 'Baking Bin', store: 'costco', status: 'ok', dateType: null, date: null },
  { id: 'p12', name: 'Rolled Oats', category: 'breakfast', location: 'pantry', bin: 'Breakfast Shelf', store: 'costco', status: 'buy-now', dateType: null, date: null },
  { id: 'p13', name: 'Granola Bars', category: 'breakfast', location: 'pantry', bin: 'Snack Shelf', store: 'costco', status: 'out', dateType: null, date: null },
  { id: 'p14', name: 'Peanut Butter', category: 'condiments', location: 'pantry', bin: 'Condiment Shelf', store: 'costco', status: 'ok', dateType: 'expiry', date: '2027-01-01' },
  { id: 'p15', name: 'Sourdough Bread', category: 'bread', location: 'pantry', bin: 'Island', store: 'grecos', status: 'ok', dateType: 'expiry', date: '2026-09-08' },
  { id: 'p16', name: 'Olive Oil', category: 'oils', location: 'pantry', bin: 'Condiment Shelf', store: 'costco', status: 'ok', dateType: 'expiry', date: '2027-06-01' },
  { id: 'p17', name: 'Sesame Oil', category: 'oils', location: 'pantry', bin: 'Indian Pantry Bin', store: 'indian-store', status: 'low', dateType: 'expiry', date: '2026-12-01' },
  { id: 'p18', name: 'Instant Ramen (Store Brand)', category: 'pasta', location: 'pantry', bin: 'Noodle and Pasta Bin', store: 'costco', status: 'skip', dateType: null, date: null },
  { id: 'f1', name: 'Baby Spinach', category: 'vegetables', location: 'fridge', bin: '', store: 'costco', status: 'ok', dateType: 'consume-by', date: '2026-09-05' },
  { id: 'f2', name: 'Red & Yellow Bell Peppers', category: 'vegetables', location: 'fridge', bin: '', store: 'costco', status: 'ok', dateType: 'consume-by', date: '2026-09-10' },
  { id: 'f3', name: 'Carrots', category: 'vegetables', location: 'fridge', bin: '', store: 'costco', status: 'ok', dateType: 'consume-by', date: '2026-09-14' },
  { id: 'f4', name: 'Cilantro', category: 'herbs', location: 'fridge', bin: '', store: 'indian-store', status: 'ok', dateType: 'consume-by', date: '2026-09-06' },
  { id: 'f5', name: 'Mint', category: 'herbs', location: 'fridge', bin: '', store: 'indian-store', status: 'low', dateType: 'consume-by', date: '2026-09-07' },
  { id: 'f6', name: 'Mangoes', category: 'fruits', location: 'fridge', bin: '', store: 'grecos', status: 'buy-now', dateType: 'consume-by', date: '2026-09-09' },
  { id: 'f7', name: 'Mayonnaise', category: 'condiments', location: 'fridge', bin: '', store: 'costco', status: 'ok', dateType: 'expiry', date: '2026-11-01' },
  { id: 'f8', name: 'Ketchup', category: 'condiments', location: 'fridge', bin: '', store: 'costco', status: 'low', dateType: 'expiry', date: '2027-02-01' },
  { id: 'z1', name: 'Frozen Peas', category: 'frozen-veggies', location: 'freezer', bin: '', store: 'costco', status: 'ok', dateType: 'expiry', date: '2027-03-01' },
  { id: 'z2', name: 'Frozen Mixed Berries', category: 'frozen-fruit', location: 'freezer', bin: '', store: 'costco', status: 'low', dateType: 'expiry', date: '2027-02-01' },
  { id: 'z3', name: 'Chicken Tikka (Homemade)', category: 'frozen-foods', location: 'freezer', bin: '', store: null, status: 'ok', dateType: 'expiry', date: '2026-11-01' },
  { id: 'z4', name: 'Frozen Parathas', category: 'frozen-foods', location: 'freezer', bin: '', store: 'indian-store', status: 'ok', dateType: 'expiry', date: '2027-01-01' },
  { id: 'z5', name: 'Frozen Samosas', category: 'frozen-snacks', location: 'freezer', bin: '', store: 'indian-store', status: 'out', dateType: null, date: null },
  { id: 'z6', name: 'Frozen Mango Chunks', category: 'frozen-fruit', location: 'freezer', bin: '', store: 'grecos', status: 'skip', dateType: null, date: null },
  { id: 's1', name: 'Overflow Ketchup', category: 'condiments', location: 'spare-fridge', bin: '', store: 'costco', status: 'low', dateType: 'expiry', date: '2027-01-01' },
  { id: 's2', name: 'Backup Apples', category: 'fruits', location: 'spare-fridge', bin: '', store: 'grecos', status: 'ok', dateType: 'consume-by', date: '2026-09-20' },
  { id: 's3', name: 'Extra Bell Peppers', category: 'vegetables', location: 'spare-fridge', bin: '', store: 'costco', status: 'ok', dateType: 'consume-by', date: '2026-09-12' },
  { id: 's4', name: 'Extra Mint', category: 'herbs', location: 'spare-fridge', bin: '', store: 'indian-store', status: 'ok', dateType: 'consume-by', date: '2026-09-08' },
  { id: 'sf1', name: 'Bulk Frozen Corn', category: 'frozen-veggies', location: 'spare-freezer', bin: '', store: 'costco', status: 'ok', dateType: 'expiry', date: '2027-04-01' },
  { id: 'sf2', name: 'Bulk Frozen Berries', category: 'frozen-fruit', location: 'spare-freezer', bin: '', store: 'costco', status: 'ok', dateType: 'expiry', date: '2027-03-01' },
  { id: 'sf3', name: 'Extra Frozen Samosas', category: 'frozen-snacks', location: 'spare-freezer', bin: '', store: 'indian-store', status: 'ok', dateType: null, date: null },
  { id: 'sf4', name: 'Ice Cream Bars', category: 'frozen-snacks', location: 'spare-freezer', bin: '', store: 'grecos', status: 'buy-now', dateType: null, date: null },
];

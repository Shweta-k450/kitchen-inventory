import type { CSSProperties } from 'react';
import { CATEGORIES, LOCATIONS, MEAL_SLOTS, STORE_MAP, STATUS_COLORS, STATUS_LABELS, BIN_PRESETS, STORES, RECIPE_UNITS, RECIPE_CATEGORY_PRESETS } from './constants';
import type { Item, ItemStatus, LocationId, LocationDef, LocationIcon, MealSlot, Ingredient, Recipe, PreparedFood, Deduction } from './types';

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr + 'T00:00:00').getTime();
  return Math.round((t - Date.now()) / 86400000);
}

export function formatDate(dateStr: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(dateStr + 'T00:00:00');
  return months[d.getMonth()] + ' ' + d.getDate();
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6',
  '⅐': '1/7', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅑': '1/9', '⅒': '1/10',
};

/** Parse "1/4", "1 1/2", "0.25", "1½", "2" into a number, or null. */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]/g, (m) => ' ' + UNICODE_FRACTIONS[m]).trim();
  if (!s) return null;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/); // "1 1/2"
  if (m) { const n = Number(m[1]) + Number(m[2]) / Number(m[3]); return n > 0 && Number.isFinite(n) ? round(n) : null; }
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/); // "1/2"
  if (m) { const n = Number(m[1]) / Number(m[2]); return n > 0 && Number.isFinite(n) ? round(n) : null; }
  if (/^\d*\.?\d+$/.test(s)) { const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? round(n) : null; }
  return null;
}

const COMMON_FRACTIONS: [number, string][] = [
  [0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔'], [0.125, '⅛'], [0.375, '⅜'], [0.625, '⅝'], [0.875, '⅞'],
];

/** Display a number as a tidy fraction/mixed number where it's a common one, else a short decimal. */
export function formatAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '';
  if (Number.isInteger(n)) return String(n);
  const whole = Math.floor(n);
  const frac = n - whole;
  for (const [v, glyph] of COMMON_FRACTIONS) {
    if (Math.abs(frac - v) < 0.02) return whole > 0 ? `${whole} ${glyph}` : glyph;
  }
  return String(Number(n.toFixed(2)));
}

/** Human label for a quantity+unit pair, e.g. "2 kg", "½ tsp", "3" (count), or "" when unset. */
export function formatQty(quantity: number | null | undefined, unit: string | null | undefined): string {
  if (quantity == null || Number.isNaN(quantity)) return '';
  const n = formatAmount(quantity) || String(quantity);
  return unit && unit !== 'count' ? `${n} ${unit}` : n;
}

/** Best-effort parse of a free-text quantity like "2 lb", "500g", "1" into a structured amount + unit. */
export function parseQtyString(raw: string | null | undefined): { quantity: number | null; unit: string | null } {
  const s = (raw || '').trim().toLowerCase();
  const m = s.match(/([\d]+(?:\.\d+)?)\s*([a-z]*)/);
  if (!m) return { quantity: null, unit: null };
  const quantity = parseFloat(m[1]);
  if (Number.isNaN(quantity)) return { quantity: null, unit: null };
  const u = m[2];
  const map: Record<string, string> = {
    kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
    g: 'g', gram: 'g', grams: 'g', gm: 'g',
    l: 'L', liter: 'L', litre: 'L', liters: 'L', litres: 'L',
    ml: 'mL', mls: 'mL',
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    oz: 'oz', ounce: 'oz', ounces: 'oz',
    pack: 'pack', packs: 'pack', pk: 'pack', ct: 'count', count: 'count', x: 'count',
  };
  return { quantity, unit: u && map[u] ? map[u] : 'count' };
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

/** Readable text color (near-black or white) to sit on top of a solid `hex` fill. */
export function onColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#2a2016' : '#ffffff';
}

/** A muted variant of onColor(), for secondary text on the same fill. */
export function onColorMuted(hex: string): string {
  return onColor(hex) === '#ffffff' ? 'rgba(255,255,255,0.78)' : 'rgba(42,32,22,0.66)';
}

// Category chips are always the category's solid color; the selected one gets a
// contrasting ring in its own text color.
export function chipStyle(selected: boolean, color: string): CSSProperties {
  const fg = onColor(color);
  return {
    background: color,
    color: fg,
    border: `2px solid ${selected ? fg : 'rgba(0,0,0,0.10)'}`,
    fontWeight: selected ? 800 : 600,
    opacity: selected ? 1 : 0.72,
  };
}

export function neutralChipStyle(selected: boolean): CSSProperties {
  if (selected) return { background: '#f7e3e5', border: '1.5px solid #621117', color: '#621117', fontWeight: 700 };
  return { background: '#f9f6f3', border: '1.5px solid #dacabe', color: '#7a7452', fontWeight: 500 };
}

export interface DecoratedItem extends Item {
  catLabel: string;
  catDot: string;
  catColor: string;
  locationLabel: string;
  locColor: string;
  fullLocationLabel: string;
  storeLabel: string;
  hasStore: boolean;
  dateText: string;
  dateColor: string;
  hasDate: boolean;
  qtyText: string;
  hasQty: boolean;
  badgeText: string;
  hasBadge: boolean;
  badgeStyle: { background: string; color: string } | null;
  needsRestock: boolean;
  soonOrUrgent: boolean;
  needsSorting: boolean;
  sortReason: 'new' | 'restocked' | null;
}

// ---------- item thumbnails ----------
// A representative emoji for an item, matched on its name (most specific first),
// then falling back to its category, then a generic jar. Emoji keeps thumbnails
// crisp at any size and needs no image hosting / network.
const NAME_EMOJI: [RegExp, string][] = [
  [/peanut ?butter|almond butter|nut butter/, '🥜'],
  [/ice[- ]?cream|kulfi/, '🍦'],
  [/whipp|heavy cream|double cream/, '🥛'],
  [/bell ?pepper|capsicum/, '🫑'],
  [/black ?pepper|peppercorn|white pepper/, '🧂'],
  [/chill?i|chile|jalapeno|serrano|cayenne|paprika|red chil/, '🌶️'],
  [/curry ?leaf|curry ?leaves/, '🌿'],
  [/bay ?leaf|bay ?leaves|oregano|thyme|rosemary|basil|parsley|cilantro|coriander leaf|dill|mint|sage|tarragon|herb/, '🌿'],
  [/spring onion|scallion|green onion|leek/, '🌱'],
  [/eggplant|aubergine|brinjal/, '🍆'],
  [/tomato|passata|marinara/, '🍅'],
  [/cucumber|gherkin/, '🥒'],
  [/onion|shallot/, '🧅'],
  [/garlic/, '🧄'],
  [/ginger/, '🫚'],
  [/potato|aloo/, '🥔'],
  [/sweet ?potato|yam/, '🍠'],
  [/carrot|gajar/, '🥕'],
  [/broccoli|broccolini/, '🥦'],
  [/spinach|palak|kale|lettuce|cabbage|chard|greens|methi|fenugreek leaf/, '🥬'],
  [/mushroom/, '🍄'],
  [/corn|maize|makai/, '🌽'],
  [/pea\b|peas\b|matar/, '🫛'],
  [/avocado/, '🥑'],
  [/bottle gourd|lauki|zucchini|courgette|squash|pumpkin|marrow/, '🥒'],
  [/olive/, '🫒'],
  [/lemon|nimbu/, '🍋'],
  [/lime/, '🍈'],
  [/banana|kela/, '🍌'],
  [/mango|aam/, '🥭'],
  [/apple|seb/, '🍎'],
  [/blueberr/, '🫐'],
  [/strawberr|berry|berries|raspberr|blackberr/, '🍓'],
  [/grape/, '🍇'],
  [/orange|clementine|mandarin|tangerine/, '🍊'],
  [/pineapple/, '🍍'],
  [/coconut|nariyal/, '🥥'],
  [/peach|nectarine|plum|apricot/, '🍑'],
  [/watermelon|melon/, '🍉'],
  [/cherr/, '🍒'],
  [/pear/, '🍐'],
  [/kiwi/, '🥝'],
  [/rice|basmati|jasmine rice|poha|rava|sooji|semolina/, '🍚'],
  [/flour|atta|maida|cornstarch|cornflour|besan/, '🌾'],
  [/oat|muesli|granola/, '🥣'],
  [/wheat|barley|quinoa|millet|bajra|jowar|couscous|bulgur/, '🌾'],
  [/pasta|penne|spaghetti|macaroni|noodle|ramen|fusilli|farfalle|lasagn/, '🍝'],
  [/paratha|roti|naan|chapati|tortilla|pita|flatbread/, '🫓'],
  [/bagel/, '🥯'],
  [/croissant/, '🥐'],
  [/bread|sourdough|loaf|bun|baguette|brioche/, '🍞'],
  [/pretzel/, '🥨'],
  [/egg/, '🥚'],
  [/butter|ghee/, '🧈'],
  [/milk|yogurt|yoghurt|curd|dahi|kefir|buttermilk/, '🥛'],
  [/cheese|paneer|mozzarella|cheddar|parmesan|feta/, '🧀'],
  [/honey|shahad/, '🍯'],
  [/maple syrup|syrup/, '🍁'],
  [/jam|jelly|marmalade|preserve/, '🍓'],
  [/ketchup|catsup/, '🍅'],
  [/mustard/, '🌭'],
  [/mayo|mayonnaise|aioli/, '🥚'],
  [/soy sauce|soya sauce|tamari|fish sauce|worcestershire|hot sauce|sriracha|sauce|chutney|salsa|dip/, '🥫'],
  [/vinegar/, '🧴'],
  [/olive oil|vegetable oil|canola|sunflower oil|sesame oil|coconut oil|mustard oil|\boil\b/, '🫗'],
  [/salt|namak/, '🧂'],
  [/sugar|jaggery|gur|cane sugar|powdered sugar|brown sugar/, '🧁'],
  [/baking soda|baking powder|yeast|cocoa|vanilla|food colour|food color/, '🧁'],
  [/lentil|dal\b|dhal|toor|masoor|urad|moong|mung/, '🫘'],
  [/chickpea|chana|garbanzo|kidney bean|rajma|black bean|pinto|cannellini|bean/, '🫘'],
  [/tofu|tempeh/, '🧊'],
  [/peanut|cashew|almond|walnut|pistachio|pecan|hazelnut|nut\b|seeds?\b|sesame|flax|chia|sunflower seed/, '🥜'],
  [/chicken|murgh/, '🍗'],
  [/fish|salmon|tuna|cod|tilapia|mackerel/, '🐟'],
  [/prawn|shrimp|jhinga/, '🦐'],
  [/beef|mutton|lamb|pork|steak|mince|keema|meat/, '🥩'],
  [/bacon/, '🥓'],
  [/sausage|hot dog|frankfurter/, '🌭'],
  [/samosa|dumpling|momo|gyoza|wonton|potsticker/, '🥟'],
  [/tikka|curry|biryani|masala|korma/, '🍛'],
  [/chocolate|cocoa|nutella/, '🍫'],
  [/cookie|biscuit/, '🍪'],
  [/cracker|khakhra|papad/, '🍘'],
  [/\bbar\b|energy bar|granola bar|protein bar/, '🍫'],
  [/chips|crisps|wafer|nachos/, '🍟'],
  [/popcorn/, '🍿'],
  [/tea|chai/, '🍵'],
  [/coffee|espresso/, '☕'],
  [/juice|smoothie/, '🧃'],
  [/soda|cola|soft drink|sparkling/, '🥤'],
  [/wine/, '🍷'],
  [/beer|ale|lager/, '🍺'],
  [/water\b/, '💧'],
  [/turmeric|haldi/, '🟡'],
  [/cumin|jeera|mustard seed|coriander seed|fennel|fenugreek|carom|ajwain|nigella|asafoetida|hing/, '🫙'],
  [/garam masala|masala|five spice|za'?atar|spice mix|spice blend/, '🥘'],
  [/cinnamon|clove|cardamom|elaichi|nutmeg|mace|star anise|allspice|saffron|kesar/, '🫙'],
  [/tomato soup|soup|broth|stock/, '🍲'],
  [/frozen|kulcha/, '🧊'],
];
const CATEGORY_EMOJI: Record<string, string> = {
  'indian-spices': '🫙', 'western-spices': '🧂', grains: '🌾', lentils: '🫘', beans: '🫘',
  pasta: '🍝', breakfast: '🥣', 'baking-supplies': '🧁', condiments: '🥫', bread: '🍞',
  vegetables: '🥬', fruits: '🍎', herbs: '🌿', oils: '🫗', 'frozen-foods': '🧊',
  'frozen-snacks': '🍦', 'frozen-veggies': '🥦', 'frozen-fruit': '🫐',
};

export function itemEmoji(name: string | null | undefined, category?: string | null): string {
  const n = (name || '').toLowerCase();
  for (const [re, emoji] of NAME_EMOJI) if (re.test(n)) return emoji;
  if (category && CATEGORY_EMOJI[category]) return CATEGORY_EMOJI[category];
  return '🫙';
}

// ---------- item categories ----------
// Preset categories have a fixed id + colour (constants.ts). A category the user
// types in is stored on the item as its own label; these helpers hand any category
// string a stable label + colour so the rest of the app never has to care which
// kind it is.
const CATEGORY_PALETTE = ['#2488C5', '#B2DD9E', '#FFA9A5', '#AD9547', '#601A00', '#D2423A', '#2D3F35', '#EFCB84', '#F4E4D9'];

export function normCategory(cat: string | null | undefined): string {
  return (cat || '').trim().toLowerCase();
}

/** {id,label,color} for any category value — a preset (matched by id or label) or a custom one. */
export function categoryMeta(cat: string | null | undefined): { id: string; label: string; color: string } {
  const raw = (cat || '').trim();
  if (!raw) return { id: '', label: 'Uncategorized', color: '#a6a496' };
  const key = normCategory(raw);
  const preset = CATEGORIES.find((c) => normCategory(c.id) === key || normCategory(c.label) === key);
  if (preset) return preset;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return { id: raw, label: titleCaseWords(raw), color: CATEGORY_PALETTE[h % CATEGORY_PALETTE.length] };
}

/** Preset categories plus any custom ones in use, deduped by normalized name (presets first, then custom A–Z). */
export function knownItemCategories(items: Item[]): { id: string; label: string; color: string }[] {
  const presetNorms = new Set(CATEGORIES.flatMap((c) => [normCategory(c.id), normCategory(c.label)]));
  const custom = new Map<string, { id: string; label: string; color: string }>();
  items.forEach((i) => {
    const key = normCategory(i.category);
    if (!key || presetNorms.has(key) || custom.has(key)) return;
    custom.set(key, categoryMeta(i.category));
  });
  return [...CATEGORIES, ...[...custom.values()].sort((a, b) => a.label.localeCompare(b.label))];
}

/** Fold a typed category onto an existing one (preset or custom-in-use), else return the trimmed input. */
export function canonicalItemCategory(input: string, items: Item[]): string {
  const t = input.trim();
  if (!t) return t;
  const key = normCategory(t);
  const found = knownItemCategories(items).find((c) => normCategory(c.id) === key || normCategory(c.label) === key);
  return found ? found.id : t;
}

/** Order a set of category keys: presets in their canonical order first, then custom A–Z. */
function orderCategoryKeys(keys: string[]): string[] {
  const rank = new Map<string, number>(CATEGORIES.map((c, i) => [normCategory(c.id), i] as [string, number]));
  const rankOf = (k: string) => (rank.has(normCategory(k)) ? rank.get(normCategory(k))! : 999);
  return [...keys].sort((a, b) => rankOf(a) - rankOf(b) || categoryMeta(a).label.localeCompare(categoryMeta(b).label));
}

// ---------- storage locations ----------
export function guessLocationIcon(label: string): LocationIcon {
  const s = (label || '').toLowerCase();
  if (/\bfreez/.test(s) || /\bdeep\s*fridge/.test(s)) return 'snow';
  if (/fridge|refriger|chiller|cool/.test(s)) return 'fridge';
  return 'box';
}

/** Resolve any location id to its {id,label,color,icon}, falling back to a readable label. */
export function locationMeta(id: string | null | undefined, locations: LocationDef[]): LocationDef {
  const raw = (id || '').trim();
  const found = locations.find((l) => l.id === raw || normCategory(l.label) === normCategory(raw));
  if (found) return found;
  return { id: raw, label: titleCaseWords(raw.replace(/[-_]+/g, ' ')) || 'Other', color: '#a6a496', icon: guessLocationIcon(raw) };
}

/** Fold a typed location name onto an existing one (any casing), else return it trimmed. */
export function canonicalLocation(input: string, locations: LocationDef[]): string {
  const t = input.trim();
  if (!t) return t;
  const found = locations.find((l) => normCategory(l.label) === normCategory(t) || l.id === t);
  return found ? found.id : t;
}

export function decorateItem(item: Item, locations: LocationDef[] = LOCATIONS): DecoratedItem {
  const cat = categoryMeta(item.category);
  const loc = locationMeta(item.location, locations);
  const days = item.date ? daysUntil(item.date) : null;
  const urgency = days === null ? 'none' : days <= 2 ? 'urgent' : days <= 5 ? 'soon' : 'normal';
  let dateText = '';
  if (item.date && days !== null) {
    const verb = item.dateType === 'consume-by' ? 'Use by ' : 'Expires ';
    const pastVerb = item.dateType === 'consume-by' ? 'Was due ' : 'Expired ';
    dateText = (days < 0 ? pastVerb : verb) + formatDate(item.date);
  }
  const dateColor = (urgency === 'urgent' || (days ?? 0) < 0) ? '#a31c26' : urgency === 'soon' ? '#7e4c25' : '#7a7452';
  const badgeText = STATUS_LABELS[item.status] || '';
  const badgeStyle = badgeText ? { background: hexToRgba(STATUS_COLORS[item.status], 0.16), color: STATUS_COLORS[item.status] } : null;
  const store = item.store ? STORE_MAP[item.store] : null;
  return {
    ...item,
    catLabel: cat.label,
    catDot: cat.color,
    catColor: cat.color,
    locationLabel: loc.label,
    locColor: loc.color,
    fullLocationLabel: item.bin ? loc.label + ' · ' + item.bin : loc.label,
    storeLabel: store ? store.label : '',
    hasStore: !!store,
    dateText,
    dateColor,
    hasDate: !!item.date,
    qtyText: formatQty(item.quantity, item.unit),
    hasQty: item.quantity != null && !Number.isNaN(item.quantity),
    badgeText,
    hasBadge: !!badgeText,
    badgeStyle,
    needsRestock: item.status === 'out' || item.status === 'low' || item.status === 'buy-now',
    soonOrUrgent: urgency === 'urgent' || urgency === 'soon',
    needsSorting: item.needsSorting === true,
    sortReason: item.sortReason ?? null,
  };
}

export interface SectionRow {
  id: string;
  name: string;
  dotColor: string;
  meta?: string;
  metaColor?: string;
  hasBadge: boolean;
  badgeText: string;
  badgeStyle: { background: string; color: string } | null;
  onOpen?: () => void;
  onCheck?: () => void;
  hasMeta?: boolean;
}

export interface Section {
  sectionTitle: string;
  rows: SectionRow[];
}

// ---------- pantry bins ----------
// Bins are free-text, so "Oil Drawer", "oil drawer" and " Oil Drawer " are the same
// bin. Everything keys off the normalized name; the first non-normalized spelling
// seen (or a matching preset's casing) is what gets shown.
const PRESET_BIN_ORDER = BIN_PRESETS.map((b) => b.trim().toLowerCase());

/** Normalized key for a bin name — trims and lowercases so casing/whitespace variants collapse. */
export function normBin(bin: string | null | undefined): string {
  return (bin || '').trim().toLowerCase();
}

/** Display casing for a bin: a preset's canonical spelling if it matches, else the trimmed name. */
export function displayBin(bin: string): string {
  const n = normBin(bin);
  return BIN_PRESETS.find((b) => normBin(b) === n) || bin.trim();
}

/** Distinct pantry bins in use plus the presets, deduped by normalized name (presets first, then custom A–Z). */
export function knownPantryBins(items: Item[]): string[] {
  const presetNorms = new Set(PRESET_BIN_ORDER);
  const custom = new Map<string, string>();
  items.forEach((i) => {
    if (i.location !== 'pantry') return;
    const n = normBin(i.bin);
    if (!n || presetNorms.has(n) || custom.has(n)) return;
    custom.set(n, i.bin.trim());
  });
  return [...BIN_PRESETS, ...[...custom.values()].sort((a, b) => a.localeCompare(b))];
}

/** Fold a typed-in bin name onto an existing bin (in any casing), else return it trimmed. */
export function canonicalBin(input: string, items: Item[]): string {
  const t = input.trim();
  if (!t) return t;
  const n = normBin(t);
  return knownPantryBins(items).find((b) => normBin(b) === n) || t;
}

/** Dedupe a list of bin names by normalized key, keeping the first spelling seen. */
export function dedupeBins(list: (string | null | undefined)[]): string[] {
  const m = new Map<string, string>();
  list.forEach((b) => {
    const n = normBin(b);
    if (n && !m.has(n)) m.set(n, (b || '').trim());
  });
  return [...m.values()];
}

interface BinGroup { title: string; items: DecoratedItem[]; }

function groupPantryByBin(decorated: DecoratedItem[]): BinGroup[] {
  const groups = new Map<string, BinGroup>();
  decorated.filter((i) => i.location === 'pantry').forEach((i) => {
    const raw = i.bin || 'Other';
    const key = normBin(raw);
    let g = groups.get(key);
    if (!g) { g = { title: displayBin(raw), items: [] }; groups.set(key, g); }
    g.items.push(i);
  });
  return [...groups.keys()]
    .sort((a, b) => PRESET_BIN_ORDER.indexOf(a) - PRESET_BIN_ORDER.indexOf(b))
    .map((k) => groups.get(k)!);
}

export function buildPantrySections(decorated: DecoratedItem[], openItem: (id: string) => () => void): Section[] {
  return groupPantryByBin(decorated).map((g) => ({
    sectionTitle: g.title,
    rows: g.items.map((i) => ({
      id: i.id, name: i.name, dotColor: i.catDot,
      meta: [i.catLabel, i.qtyText, i.dateText].filter(Boolean).join(' · '),
      metaColor: i.dateText ? i.dateColor : '#7a7452',
      hasBadge: i.hasBadge, badgeText: i.badgeText, badgeStyle: i.badgeStyle,
      onOpen: openItem(i.id),
    })),
  }));
}

export interface PantryBinSummary {
  bin: string;
  count: number;
  alerts: number;
}

/** One entry per pantry bin (empty-bin items bucket under "Other"), ordered like buildPantrySections. */
export function buildPantryBinSummaries(decorated: DecoratedItem[]): PantryBinSummary[] {
  return groupPantryByBin(decorated).map((g) => ({
    bin: g.title,
    count: g.items.length,
    alerts: g.items.filter((i) => i.needsRestock || i.soonOrUrgent).length,
  }));
}

/** Items in a single pantry bin, grouped by category (like the fridge/freezer screens). */
export function buildPantryBinCategorySections(decorated: DecoratedItem[], bin: string, openItem: (id: string) => () => void): Section[] {
  const target = normBin(bin);
  const items = decorated.filter((i) => i.location === 'pantry' && normBin(i.bin || 'Other') === target);
  const map: Record<string, DecoratedItem[]> = {};
  items.forEach((i) => { (map[i.category] = map[i.category] || []).push(i); });
  return orderCategoryKeys(Object.keys(map)).map((key) => ({
    sectionTitle: categoryMeta(key).label,
    rows: map[key].map((i) => ({
      id: i.id, name: i.name, dotColor: i.catDot,
      meta: [i.qtyText, i.hasDate ? i.dateText : 'No date needed'].filter(Boolean).join(' · '),
      metaColor: i.hasDate ? i.dateColor : '#7a7452',
      hasBadge: i.hasBadge, badgeText: i.badgeText, badgeStyle: i.badgeStyle,
      onOpen: openItem(i.id),
    })),
  }));
}

export function buildLocationCategorySections(decorated: DecoratedItem[], locationId: LocationId, filter: string | null, openItem: (id: string) => () => void): Section[] {
  let items = decorated.filter((i) => i.location === locationId);
  if (filter) items = items.filter((i) => normCategory(i.category) === normCategory(filter));
  const map: Record<string, DecoratedItem[]> = {};
  items.forEach((i) => { (map[i.category] = map[i.category] || []).push(i); });
  return orderCategoryKeys(Object.keys(map)).map((key) => ({
    sectionTitle: categoryMeta(key).label,
    rows: map[key].map((i) => ({
      id: i.id, name: i.name, dotColor: i.catDot,
      meta: [i.qtyText, i.hasDate ? i.dateText : 'No date needed'].filter(Boolean).join(' · '),
      metaColor: i.hasDate ? i.dateColor : '#7a7452',
      hasBadge: i.hasBadge, badgeText: i.badgeText, badgeStyle: i.badgeStyle,
      onOpen: openItem(i.id),
    })),
  }));
}

export function categoryChipsForLocation(decorated: DecoratedItem[], locationId: LocationId, activeFilter: string | null, setFilter: (id: string | null) => void) {
  const present = new Set(decorated.filter((i) => i.location === locationId).map((i) => i.category));
  const cats = orderCategoryKeys([...present]).map(categoryMeta);
  const items: { id: string | null; label: string; color: string | null }[] = [{ id: null, label: 'All', color: null }, ...cats];
  return items.map((c) => ({
    id: c.id, label: c.label,
    style: c.color === null ? neutralChipStyle(activeFilter === c.id) : chipStyle(activeFilter === c.id, c.color),
    onClick: () => setFilter(c.id),
  }));
}

export function buildGrocerySections(
  decorated: DecoratedItem[],
  manualItems: { id: string; name: string }[],
  storeFilter: string | null,
  toggleAuto: (id: string) => () => void,
  removeManual: (id: string) => () => void
): Section[] {
  const sections: Section[] = [];
  if (manualItems.length) {
    sections.push({
      sectionTitle: 'Added by you',
      rows: manualItems.map((m) => ({
        id: m.id, name: m.name, dotColor: '#621117',
        hasMeta: false, meta: '', hasBadge: false, badgeText: '', badgeStyle: null,
        onCheck: removeManual(m.id),
      })),
    });
  }
  let autoItems = decorated.filter((i) => i.needsRestock);
  if (storeFilter) autoItems = autoItems.filter((i) => i.store === storeFilter);
  const map: Record<string, DecoratedItem[]> = {};
  autoItems.forEach((i) => { (map[i.category] = map[i.category] || []).push(i); });
  orderCategoryKeys(Object.keys(map)).forEach((key) => {
    sections.push({
      sectionTitle: categoryMeta(key).label,
      rows: map[key].map((i) => ({
        id: i.id, name: i.name, dotColor: i.catDot,
        hasMeta: true, meta: i.fullLocationLabel,
        hasBadge: i.hasBadge, badgeText: i.badgeText, badgeStyle: i.badgeStyle,
        onCheck: toggleAuto(i.id),
      })),
    });
  });
  return sections;
}

export function storeChipsForGrocery(decorated: DecoratedItem[], activeFilter: string | null, setFilter: (id: string | null) => void) {
  const present = new Set(decorated.filter((i) => i.needsRestock).map((i) => i.store).filter(Boolean));
  const stores = STORES.filter((s) => present.has(s.id));
  const items: { id: string | null; label: string }[] = [{ id: null, label: 'All' }, ...stores];
  return items.map((s) => ({
    id: s.id, label: s.label,
    style: neutralChipStyle(activeFilter === s.id),
    onClick: () => setFilter(s.id),
  }));
}

export function titleCaseWords(str: string | null | undefined): string {
  if (!str) return '';
  return String(str).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function buildIngredientRow(raw: Partial<Ingredient> & { text?: string }, idx: number): Ingredient {
  const catId = raw && CATEGORIES.some((c) => c.id === raw.category) ? (raw.category as string) : null;
  const text = raw && raw.text && String(raw.text).trim() ? String(raw.text).trim() : 'Ingredient ' + (idx + 1);
  const name = raw && raw.name && String(raw.name).trim() ? String(raw.name).trim().toLowerCase() : text.toLowerCase();
  const quantity = raw && raw.quantity != null && String(raw.quantity).trim() ? String(raw.quantity).trim() : '';
  const amount = raw ? parseAmount(raw.amountText ?? raw.amount) : null;
  const amountText = amount != null ? (raw && raw.amountText && String(raw.amountText).trim() ? String(raw.amountText).trim() : (formatAmount(amount) || String(amount))) : null;
  const unit = amount != null && raw && raw.unit && RECIPE_UNITS.includes(raw.unit) ? raw.unit : null;
  return {
    ingId: 'i' + idx + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    text, name, quantity, amount, amountText, unit, category: catId,
    trackable: raw && raw.trackable === false ? false : true,
  };
}

// ---------- meal slots ----------
/** Best guess of which meal a recipe belongs to, from its category. */
export function guessMealSlot(category: string | null | undefined): MealSlot {
  const c = (category || '').toLowerCase();
  if (/brunch/.test(c)) return 'brunch';
  if (/breakfast/.test(c)) return 'breakfast';
  if (/lunch|salad|wrap|sandwich/.test(c)) return 'lunch';
  if (/snack|dessert|sweet|festive/.test(c)) return 'snack';
  return 'dinner';
}

/** {label, color, rank} for a meal slot; falls back to a neutral "Other" for null/unknown. */
export function mealSlotMeta(slot: string | null | undefined): { id: string; label: string; color: string; rank: number } {
  const i = MEAL_SLOTS.findIndex((m) => m.id === slot);
  if (i === -1) return { id: 'other', label: 'Other', color: '#dacabe', rank: 99 };
  return { ...MEAL_SLOTS[i], rank: i };
}

const ROUGH_UNITS: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g', kg: 'kg', kgs: 'kg', ml: 'mL', mls: 'mL', l: 'L', litre: 'L', liter: 'L', litres: 'L', liters: 'L',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup', oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice', pinch: 'pinch', pinches: 'pinch',
  pack: 'pack', packet: 'pack', packets: 'pack', can: 'pack', cans: 'pack', tin: 'pack', tins: 'pack',
};
const PREP_WORDS = /\b(chopped|diced|minced|sliced|grated|shredded|crushed|ground|fresh|dried|frozen|large|medium|small|ripe|boneless|skinless|finely|roughly|thinly|halved|quartered|peeled|deseeded|cubed|beaten|softened|melted|packed|heaped|level|plus more|to taste|for garnish|optional)\b/gi;

/** Best-effort local parse of one raw ingredient line — the fallback when the AI parser is unavailable. */
export function roughParseIngredient(line: string): (Partial<Ingredient> & { text: string }) | null {
  const t = (line || '').trim().replace(/^[-*•·•]\s*/, '').replace(/\s+/g, ' ');
  if (!t) return null;
  if (/:\s*$/.test(t) || /^(for\b|method\b|instructions?\b|directions?\b|steps?\b|notes?\b)/i.test(t)) return null;
  const m = t.match(/^(\d+(?:\s+\d+\/\d+|\.\d+|\/\d+)?|[½¼¾⅓⅔⅕⅛])\s*([a-zA-Z.]+)?\s*(.*)$/);
  let amount: number | null = null;
  let unit: string | null = null;
  let rest = t;
  if (m) {
    amount = parseAmount(m[1]);
    const u = (m[2] || '').toLowerCase().replace(/\./g, '');
    if (u && ROUGH_UNITS[u]) { unit = ROUGH_UNITS[u]; rest = m[3] || ''; }
    else if (amount != null) { unit = 'count'; rest = [m[2], m[3]].filter(Boolean).join(' '); }
  }
  let name = ((rest.split(/,| - | – | \(/)[0]) || rest).toLowerCase().replace(PREP_WORDS, '').replace(/\s+/g, ' ').trim();
  if (!name) name = rest.toLowerCase().trim() || t.toLowerCase();
  return {
    text: t,
    name,
    quantity: m ? [m[1], unit && unit !== 'count' ? unit : (m[2] || '')].filter(Boolean).join(' ').trim() : '',
    amount,
    amountText: amount != null ? m![1] : null,
    unit,
    category: null,
    trackable: /\b(water|ice)\b/i.test(name) ? false : true,
  };
}

// ---------- units & meal-plan shopping ----------
const MASS_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOL_ML: Record<string, number> = { mL: 1, L: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588 };

type Dim = 'mass' | 'volume' | 'count';

function unitDim(unit: string | null | undefined): Dim | null {
  if (!unit) return null;
  if (unit in MASS_G) return 'mass';
  if (unit in VOL_ML) return 'volume';
  return 'count'; // count, pack, clove, slice, pinch
}

/** Convert an amount+unit to a canonical value (grams / mL / each). Null when not enough info. */
function toCanonical(amount: number | null | undefined, unit: string | null | undefined): { dim: Dim; value: number } | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const dim = unitDim(unit);
  if (dim === 'mass') return { dim, value: amount * MASS_G[unit as string] };
  if (dim === 'volume') return { dim, value: amount * VOL_ML[unit as string] };
  return { dim: 'count', value: amount };
}

/** Turn a canonical value back into a friendly rounded amount + unit for a shopping line. */
function fromCanonical(value: number, dim: Dim): string {
  if (dim === 'count') return String(Math.max(1, Math.ceil(value - 0.001)));
  if (dim === 'mass') {
    if (value >= 1000) return `${Math.ceil((value / 1000) * 4) / 4} kg`;
    return `${Math.max(10, Math.ceil(value / 10) * 10)} g`;
  }
  if (value >= 1000) return `${Math.ceil((value / 1000) * 4) / 4} L`;
  return `${Math.max(10, Math.ceil(value / 10) * 10)} mL`;
}

function canonToUnit(value: number, unit: string): number {
  if (unit in MASS_G) return value / MASS_G[unit];
  if (unit in VOL_ML) return value / VOL_ML[unit];
  return value;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Convert `amount` of `fromUnit` into `toUnit`; null when the dimensions don't match. */
export function convertAmount(amount: number, fromUnit: string | null | undefined, toUnit: string | null | undefined): number | null {
  const c = toCanonical(amount, fromUnit);
  if (!c || unitDim(toUnit) !== c.dim) return null;
  return round2(canonToUnit(c.value, toUnit as string));
}

// ---------- cook-off ----------
export interface CookEffect {
  itemId: string;
  itemName: string;
  label: string; // ingredient name(s) as shown
  fromText: string;
  toText: string;
  patch: { quantity?: number; status?: ItemStatus };
  deduction: Deduction;
}

/**
 * Work out what cooking `recipe` at `servingsToMake` would do to inventory:
 * subtract exact amounts where units line up, run items to Out at zero, and
 * otherwise nudge a still-"ok" item to "low". Ingredients with no matching item
 * come back in `unmatched` (informational only).
 */
export function planCookEffects(recipe: Recipe, servingsToMake: number, items: Item[]): { effects: CookEffect[]; unmatched: string[] } {
  const scale = recipe.servings && recipe.servings > 0 ? servingsToMake / recipe.servings : 1;
  const unmatched: string[] = [];
  const byItem = new Map<string, { item: Item; labels: string[]; need: { dim: Dim; value: number } | null; uncomputable: boolean }>();

  (recipe.ingredients || []).forEach((ing) => {
    if (ing.trackable === false) return;
    const m = matchIngredient(ing, items);
    const item = m.matchedItem;
    const label = titleCaseWords(ing.name || ing.text);
    if (!item) { unmatched.push(label); return; }
    let g = byItem.get(item.id);
    if (!g) { g = { item, labels: [], need: null, uncomputable: false }; byItem.set(item.id, g); }
    if (!g.labels.includes(label)) g.labels.push(label);
    const canon = ing.amount != null && ing.unit ? toCanonical(ing.amount * scale, ing.unit) : null;
    if (!canon || item.quantity == null || !item.unit || unitDim(item.unit) !== canon.dim) { g.uncomputable = true; return; }
    g.need = g.need ? { dim: canon.dim, value: g.need.value + canon.value } : canon;
  });

  const effects: CookEffect[] = [];
  for (const g of byItem.values()) {
    const { item, labels } = g;
    const label = labels.join(', ');
    if (g.need && item.quantity != null && item.unit) {
      const removed = round2(Math.min(item.quantity, canonToUnit(g.need.value, item.unit)));
      const newQ = round2(Math.max(0, item.quantity - removed));
      if (newQ <= 0.001) {
        effects.push({
          itemId: item.id, itemName: item.name, label,
          fromText: formatQty(item.quantity, item.unit), toText: 'Out of stock',
          patch: { quantity: 0, status: 'out' },
          deduction: { itemId: item.id, amount: removed, unit: item.unit, prevStatus: item.status },
        });
      } else {
        effects.push({
          itemId: item.id, itemName: item.name, label,
          fromText: formatQty(item.quantity, item.unit), toText: formatQty(newQ, item.unit),
          patch: { quantity: newQ },
          deduction: { itemId: item.id, amount: removed, unit: item.unit, prevStatus: null },
        });
      }
    } else if (item.status === 'ok') {
      effects.push({
        itemId: item.id, itemName: item.name, label,
        fromText: 'In stock', toText: 'Running low',
        patch: { status: 'low' },
        deduction: { itemId: item.id, amount: null, unit: null, prevStatus: 'ok' },
      });
    }
  }
  return { effects, unmatched };
}

export function servingsLeft(p: PreparedFood): number {
  return Math.max(0, p.servingsMade - (p.eaten || []).reduce((s, e) => s + e.servings, 0));
}

export function preparedFreshness(p: PreparedFood, todayIso: string): 'fresh' | 'soon' | 'past' {
  if (!p.useBy) return 'fresh';
  if (todayIso > p.useBy) return 'past';
  if (todayIso >= addDays(p.useBy, -1)) return 'soon';
  return 'fresh';
}

/** Monday (local) of the week containing `d`, as 'YYYY-MM-DD'. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return isoDate(x);
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}

/** The 7 ISO dates Mon..Sun for a week whose Monday is `mondayIso`. */
export function weekDates(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));
}

export function weekRangeLabel(mondayIso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y1, m1, d1] = mondayIso.split('-').map(Number);
  const sun = addDays(mondayIso, 6).split('-').map(Number);
  const a = `${months[m1 - 1]} ${d1}`;
  const b = m1 === sun[1] ? String(sun[2]) : `${months[sun[1] - 1]} ${sun[2]}`;
  return `${a} – ${b}, ${sun[0] !== y1 ? sun[0] : y1}`;
}

export function dayLabel(iso: string): { weekday: string; day: string } {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { weekday: wd[dt.getDay()], day: `${m}/${d}` };
}

// ---------- recipe categories ----------
const normCat = (c: string | null | undefined) => (c || '').trim().toLowerCase();

/** Preset categories plus any in use, deduped by normalized name (presets first, then custom A–Z). */
export function knownRecipeCategories(recipes: Recipe[]): string[] {
  const presetNorms = new Set(RECIPE_CATEGORY_PRESETS.map(normCat));
  const custom = new Map<string, string>();
  recipes.forEach((r) => {
    const n = normCat(r.category);
    if (!n || presetNorms.has(n) || custom.has(n)) return;
    custom.set(n, (r.category || '').trim());
  });
  return [...RECIPE_CATEGORY_PRESETS, ...[...custom.values()].sort((a, b) => a.localeCompare(b))];
}

/** Fold a typed category name onto an existing one (any casing), else return it trimmed. */
export function canonicalRecipeCategory(input: string, recipes: Recipe[]): string {
  const t = input.trim();
  if (!t) return t;
  const n = normCat(t);
  return knownRecipeCategories(recipes).find((c) => normCat(c) === n) || t;
}

export interface RecipeCategoryCard { key: string; label: string; count: number }

/** One card per category that has recipes, ordered presets-first; plus Uncategorized when relevant. */
export function recipeCategoryCards(recipes: Recipe[]): RecipeCategoryCard[] {
  const groups = new Map<string, { label: string; count: number }>();
  let uncategorized = 0;
  recipes.forEach((r) => {
    const n = normCat(r.category);
    if (!n) { uncategorized += 1; return; }
    const g = groups.get(n);
    if (g) g.count += 1;
    else groups.set(n, { label: (r.category || '').trim(), count: 1 });
  });
  const order = RECIPE_CATEGORY_PRESETS.map(normCat);
  const rank = (k: string) => { const i = order.indexOf(k); return i === -1 ? 999 : i; };
  const cards = [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1].label.localeCompare(b[1].label))
    .map(([key, g]) => ({ key, label: g.label, count: g.count }));
  if (uncategorized > 0) cards.push({ key: '__uncat__', label: 'Uncategorized', count: uncategorized });
  return cards;
}

export interface MealPlanGroceryRow {
  key: string;
  label: string;
  buyText: string; // '' when it couldn't be quantified
  recipeNames: string[];
}

/**
 * Aggregate the ingredient needs across a set of meal-plan entries, netting against
 * inventory item quantities where the units are compatible.
 */
export function buildMealPlanGroceryRows(
  entries: { recipeId: string; servings: number }[],
  recipes: Recipe[],
  items: Item[],
): MealPlanGroceryRow[] {
  const recipeById = new Map<string, Recipe>(recipes.map((r) => [r.id, r] as [string, Recipe]));
  // key -> { label, dim, need, unstructured, names }
  const acc = new Map<string, { label: string; dim: Dim | null; need: number; unstructured: boolean; names: Set<string> }>();

  entries.forEach((e) => {
    const r = recipeById.get(e.recipeId);
    if (!r) return;
    const scale = r.servings && r.servings > 0 ? e.servings / r.servings : 1;
    (r.ingredients || []).forEach((ing) => {
      if (ing.trackable === false) return;
      const key = (ing.name || ing.text || '').toLowerCase().trim();
      if (!key) return;
      let g = acc.get(key);
      if (!g) { g = { label: titleCaseWords(ing.name || ing.text), dim: null, need: 0, unstructured: false, names: new Set() }; acc.set(key, g); }
      g.names.add(r.name);
      const canon = toCanonical(ing.amount, ing.unit);
      if (!canon) { g.unstructured = true; return; }
      if (g.dim == null) g.dim = canon.dim;
      if (g.dim === canon.dim) g.need += canon.value * scale;
      else g.unstructured = true; // mixed dimensions for the same ingredient
    });
  });

  const rows: MealPlanGroceryRow[] = [];
  for (const [key, g] of acc.entries()) {
    const base = { key, label: g.label, recipeNames: [...g.names] };
    if (g.dim == null || g.need <= 0) {
      // nothing structured to quantify — show name-only
      rows.push({ ...base, buyText: '' });
      continue;
    }
    const match = matchIngredient({ ingId: '', text: g.label, name: key, quantity: '', category: null, trackable: true }, items);
    const haveCanon = match.matchedItem ? toCanonical(match.matchedItem.quantity, match.matchedItem.unit) : null;
    const have = haveCanon && haveCanon.dim === g.dim ? haveCanon.value : 0;
    const buy = g.need - have;
    if (have > 0 && buy <= 0) continue; // already have enough on hand
    rows.push({ ...base, buyText: fromCanonical(buy, g.dim) });
  }
  return rows;
}

export interface MatchResult {
  has: boolean;
  alwaysHave?: boolean;
  matchedItem: Item | null;
}

/** Only an item marked "In Stock" (status "ok") counts as having an ingredient on hand. */
export function matchIngredient(ingredient: Ingredient, items: Item[]): MatchResult {
  if (!ingredient.trackable) return { has: true, alwaysHave: true, matchedItem: null };
  const nameLower = (ingredient.name || '').toLowerCase().trim();
  if (!nameLower) return { has: true, alwaysHave: true, matchedItem: null };
  const nameMatches = (it: Item) => {
    const itNameLower = it.name.toLowerCase();
    return itNameLower.indexOf(nameLower) !== -1 || nameLower.indexOf(itNameLower) !== -1;
  };
  let pool = items.filter((it) => (!ingredient.category || it.category === ingredient.category) && nameMatches(it));
  if (!pool.length) pool = items.filter(nameMatches);
  if (!pool.length) return { has: false, matchedItem: null };
  const inStock = pool.find((it) => it.status === 'ok');
  if (inStock) return { has: true, matchedItem: inStock };
  return { has: false, matchedItem: pool[0] };
}

export interface Readiness {
  haveCount: number;
  totalCount: number;
  missing: (MatchResult & { ingredient: Ingredient })[];
  ready: boolean;
}

export function recipeReadiness(recipe: Recipe, items: Item[]): Readiness {
  const ingredients = recipe.ingredients || [];
  const tracked = ingredients.filter((ing) => ing.trackable !== false);
  const results = tracked.map((ing) => ({ ingredient: ing, ...matchIngredient(ing, items) }));
  const missing = results.filter((r) => !r.has);
  return {
    haveCount: tracked.length - missing.length,
    totalCount: tracked.length,
    missing,
    ready: tracked.length > 0 && missing.length === 0,
  };
}

export function resizeImageFileToDataUrl(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('decode_failed'));
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > h && w > maxDim) { h = Math.round(h * (maxDim / w)); w = maxDim; }
        else if (h >= w && h > maxDim) { w = Math.round(w * (maxDim / h)); h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.72));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

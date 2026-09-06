import type { CSSProperties } from 'react';
import { CATEGORIES, CATEGORY_MAP, LOCATION_MAP, STORE_MAP, STATUS_COLORS, STATUS_LABELS, BIN_PRESETS, STORES, RECIPE_UNITS } from './constants';
import type { Item, LocationId, Ingredient, Recipe } from './types';

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

/** Human label for a quantity+unit pair, e.g. "2 kg", "500 g", "3" (count), or "" when unset. */
export function formatQty(quantity: number | null | undefined, unit: string | null | undefined): string {
  if (quantity == null || Number.isNaN(quantity)) return '';
  const n = Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)));
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
}

export function decorateItem(item: Item): DecoratedItem {
  const cat = CATEGORY_MAP[item.category];
  const loc = LOCATION_MAP[item.location];
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
  return CATEGORIES.filter((c) => map[c.id]).map((c) => ({
    sectionTitle: c.label,
    rows: map[c.id].map((i) => ({
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
  if (filter) items = items.filter((i) => i.category === filter);
  const map: Record<string, DecoratedItem[]> = {};
  items.forEach((i) => { (map[i.category] = map[i.category] || []).push(i); });
  return CATEGORIES.filter((c) => map[c.id]).map((c) => ({
    sectionTitle: c.label,
    rows: map[c.id].map((i) => ({
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
  const cats = CATEGORIES.filter((c) => present.has(c.id));
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
  CATEGORIES.forEach((c) => {
    if (map[c.id]) {
      sections.push({
        sectionTitle: c.label,
        rows: map[c.id].map((i) => ({
          id: i.id, name: i.name, dotColor: i.catDot,
          hasMeta: true, meta: i.fullLocationLabel,
          hasBadge: i.hasBadge, badgeText: i.badgeText, badgeStyle: i.badgeStyle,
          onCheck: toggleAuto(i.id),
        })),
      });
    }
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
  const amountRaw = raw ? Number(raw.amount) : NaN;
  const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;
  const unit = amount != null && raw && raw.unit && RECIPE_UNITS.includes(raw.unit) ? raw.unit : null;
  return {
    ingId: 'i' + idx + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    text, name, quantity, amount, unit, category: catId,
    trackable: raw && raw.trackable === false ? false : true,
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

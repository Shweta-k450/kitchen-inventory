import type { CSSProperties } from 'react';
import { CATEGORIES, CATEGORY_MAP, LOCATION_MAP, STORE_MAP, STATUS_COLORS, STATUS_LABELS, BIN_PRESETS, STORES } from './constants';
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

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

export function chipStyle(selected: boolean, color: string): CSSProperties {
  if (selected) return { background: hexToRgba(color, 0.18), border: '1.5px solid ' + color, color: '#302a06', fontWeight: 700 };
  return { background: '#f9f6f3', border: '1.5px solid #dacabe', color: '#7a7452', fontWeight: 500 };
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
  fullLocationLabel: string;
  storeLabel: string;
  hasStore: boolean;
  dateText: string;
  dateColor: string;
  hasDate: boolean;
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
    fullLocationLabel: item.bin ? loc.label + ' · ' + item.bin : loc.label,
    storeLabel: store ? store.label : '',
    hasStore: !!store,
    dateText,
    dateColor,
    hasDate: !!item.date,
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

export function buildPantrySections(decorated: DecoratedItem[], openItem: (id: string) => () => void): Section[] {
  const items = decorated.filter((i) => i.location === 'pantry');
  const map: Record<string, DecoratedItem[]> = {};
  items.forEach((i) => { const k = i.bin || 'Other'; (map[k] = map[k] || []).push(i); });
  const keys = Object.keys(map).sort((a, b) => BIN_PRESETS.indexOf(a) - BIN_PRESETS.indexOf(b));
  return keys.map((k) => ({
    sectionTitle: k,
    rows: map[k].map((i) => ({
      id: i.id, name: i.name, dotColor: i.catDot,
      meta: i.catLabel + (i.dateText ? ' · ' + i.dateText : ''),
      metaColor: i.dateText ? i.dateColor : '#7a7452',
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
      meta: i.hasDate ? i.dateText : 'No date needed',
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
  return {
    ingId: 'i' + idx + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    text, name, quantity, category: catId,
    trackable: raw && raw.trackable === false ? false : true,
  };
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

'use client';

import { useState, useMemo, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { useKitchenData } from '@/hooks/useKitchenData';
import {
  CATEGORIES, CATEGORY_MAP, LOCATIONS, LOCATION_MAP, LOCATION_PALETTE, MEAL_SLOTS, STORES, STATUS_COLORS, UNITS, RECIPE_UNITS, LEFTOVER_DAYS,
  DATE_TYPE_BY_CATEGORY, DEFAULT_LOCATION_BY_CATEGORY,
} from '@/lib/constants';
import {
  decorateItem, daysUntil, itemEmoji, buildPantrySections, buildLocationCategorySections, categoryChipsForLocation,
  buildPantryBinSummaries, buildPantryBinCategorySections, normBin, knownPantryBins, canonicalBin, dedupeBins, parseQtyString,
  buildGrocerySections, storeChipsForGrocery, chipStyle, neutralChipStyle, hexToRgba, onColor, onColorMuted,
  matchIngredient, recipeReadiness, titleCaseWords, buildIngredientRow, roughParseIngredient, resizeImageFileToDataUrl,
  parseAmount, formatAmount, knownRecipeCategories, canonicalRecipeCategory, recipeCategoryCards,
  categoryMeta, knownItemCategories, canonicalItemCategory, normCategory,
  locationMeta, canonicalLocation, guessLocationIcon, guessMealSlot, mealSlotMeta,
  buildMealPlanGroceryRows, mondayOf, isoDate, addDays, weekDates, weekRangeLabel, dayLabel,
  planCookEffects, servingsLeft, preparedFreshness,
  type Section, type SectionRow, type CookEffect,
} from '@/lib/logic';
import { parseIngredientsApi, estimateNutritionApi, scanReceiptApi, scanItemApi, importRecipeApi } from '@/lib/apiClient';
import type { Item, LocationId, LocationDef, MealSlot, Ingredient, Recipe, PreparedFood } from '@/lib/types';
import { Chip, BackLink } from './Chip';
import PullToRefresh from './PullToRefresh';
import SwipeBack from './SwipeBack';

type Screen =
  | 'home' | 'location' | 'pantryBin' | 'sortBucket' | 'expiring' | 'itemDetail' | 'add1' | 'add2' | 'add3'
  | 'receiptScan' | 'receiptReview' | 'grocery' | 'search'
  | 'recipes' | 'recipeDetail' | 'recipeAdd1' | 'recipeAdd2' | 'recipeAdd3'
  | 'plan' | 'planAdd' | 'planReview' | 'cookConfirm';

interface AddDraft {
  name: string; category: string | null; location: LocationId | null; bin: string;
  store: string | null; date: string; dateType: 'expiry' | 'consume-by'; skipDate: boolean;
  qty: string; unit: string | null;
}
const BLANK_DRAFT: AddDraft = { name: '', category: null, location: null, bin: '', store: null, date: '', dateType: 'expiry', skipDate: false, qty: '', unit: null };

interface ReceiptDraftItem {
  tempId: string; include: boolean; name: string; quantity: string; category: string;
  location: LocationId; bin: string; dateType: 'expiry' | 'consume-by' | null; date: string; skipDate: boolean;
}

interface UiState {
  screen: Screen;
  tab: 'home' | 'grocery' | 'recipes' | 'plan';
  searchQuery: string;
  searchReturnScreen: Screen;
  selectedLocationId: LocationId | null;
  selectedPantryBin: string | null;
  selectedItemId: string | null;
  itemDetailReturnTo: Screen;
  recipeDetailReturnTo: Screen;
  locationCategoryFilter: string | null;
  storeFilter: string | null;
  addReturnTab: 'home' | 'grocery' | 'recipes' | 'plan';
  addReturnScreen: Screen; // exact screen the add flow was started from, to return there
  addDraft: AddDraft;
  manualDraft: string;
  addPhotoStatus: 'idle' | 'loading' | 'error';
  receiptStatus: 'idle' | 'loading' | 'error' | 'unavailable';
  receiptErrorText: string;
  receiptDraftItems: ReceiptDraftItem[];
  receiptStore: string | null;
  expandedReceiptItemId: string | null;
  recipeCatFilter: string | null; // null = category grid; sentinel or category name = filtered list
  recipeCategoryDraft: string; // recipe's category while in the add/edit flow
  selectedRecipeId: string | null;
  editingRecipeId: string | null;
  recipeNameDraft: string;
  recipeIngredientTextDraft: string;
  recipeInstructionsDraft: string;
  recipeUrlDraft: string;
  recipeImportStatus: 'idle' | 'loading' | 'error';
  recipeImportError: string;
  recipeParseStatus: 'idle' | 'loading' | 'error' | 'unavailable';
  recipeParseErrorText: string;
  recipeIngPreParsed: boolean; // import already produced structured rows — skip the AI re-parse on Continue
  recipeIngredientDrafts: Ingredient[];
  expandedRecipeIngredientId: string | null;
  recipePhotoDataUrl: string;
  recipePhotoStatus: 'idle' | 'loading' | 'error';
  recipeServingsDraft: string;
  recipeSaveStatus: 'idle' | 'loading';
  // meal plan
  mealPlanWeek: string; // Monday ISO of the viewed week
  recipeSelectMode: boolean;
  recipeSelection: string[];
  planBatch: { recipeId: string; dates: string[]; servings: string; meal: MealSlot }[];
  planReviewQueue: string[]; // recipe ids awaiting ingredient-amount review
  planEntryEditId: string | null; // meal-plan entry being edited (servings)
  dismissedPlanNeeds: string[]; // shopping-list rows ticked off this session
  planView: 'week' | 'fridge';
  cookEntryId: string | null; // meal-plan entry being confirmed for cooking
}

const initialState: UiState = {
  screen: 'home', tab: 'home', searchQuery: '', searchReturnScreen: 'home',
  selectedLocationId: null, selectedPantryBin: null, selectedItemId: null, itemDetailReturnTo: 'location', recipeDetailReturnTo: 'recipes',
  locationCategoryFilter: null, storeFilter: null,
  addReturnTab: 'home', addReturnScreen: 'home', addDraft: BLANK_DRAFT, manualDraft: '', addPhotoStatus: 'idle',
  receiptStatus: 'idle', receiptErrorText: '', receiptDraftItems: [], receiptStore: null, expandedReceiptItemId: null,
  recipeCatFilter: null, recipeCategoryDraft: '', selectedRecipeId: null, editingRecipeId: null,
  recipeNameDraft: '', recipeIngredientTextDraft: '', recipeInstructionsDraft: '',
  recipeUrlDraft: '', recipeImportStatus: 'idle', recipeImportError: '',
  recipeParseStatus: 'idle', recipeParseErrorText: '', recipeIngPreParsed: false, recipeIngredientDrafts: [], expandedRecipeIngredientId: null,
  recipePhotoDataUrl: '', recipePhotoStatus: 'idle', recipeServingsDraft: '', recipeSaveStatus: 'idle',
  mealPlanWeek: '', recipeSelectMode: false, recipeSelection: [], planBatch: [], planReviewQueue: [], planEntryEditId: null,
  dismissedPlanNeeds: [], planView: 'week', cookEntryId: null,
};

const card = '#f9f6f3';
const border = '#dacabe';
const text = '#302a06';
const muted = '#7a7452';
const accent = '#621117';
const section = '#efe4d8';
const errorColor = '#a31c26';

export default function App() {
  const kitchen = useKitchenData();
  const [st, setStRaw] = useState<UiState>(initialState);
  const patch = (p: Partial<UiState>) => setStRaw((prev) => ({ ...prev, ...p }));

  // Built-in locations (with any saved label/colour/icon overrides applied) plus the
  // locations the household added. Override docs reuse the built-in id; custom ones
  // have their own generated id.
  const allLocations = useMemo<LocationDef[]>(() => {
    const byId = new Map(kitchen.customLocations.map((l) => [l.id, l]));
    const presetIds = new Set(LOCATIONS.map((l) => l.id));
    const merged = LOCATIONS.map((p) => {
      const o = byId.get(p.id);
      return o ? { id: p.id, label: o.label || p.label, color: o.color || p.color, icon: o.icon || p.icon } : p;
    });
    const custom = kitchen.customLocations.filter((l) => !presetIds.has(l.id) && l.label && l.color);
    return [...merged, ...custom];
  }, [kitchen.customLocations]);

  const decorated = useMemo(() => kitchen.items.map((i) => decorateItem(i, allLocations)), [kitchen.items, allLocations]);
  // Items freshly checked off the grocery list live in the "To be sorted" bucket and
  // are held out of the location screens/counts until the user places them.
  const placedDecorated = useMemo(() => decorated.filter((i) => !i.needsSorting), [decorated]);
  const toSortItems = useMemo(() => decorated.filter((i) => i.needsSorting), [decorated]);
  const decoratedRecipes = useMemo(
    () => kitchen.recipes.map((r) => {
      const readiness = recipeReadiness(r, kitchen.items);
      return { ...r, readiness, readyLabel: readiness.totalCount === 0 ? 'No ingredients yet' : `${readiness.haveCount} of ${readiness.totalCount} on hand` };
    }),
    [kitchen.recipes, kitchen.items]
  );

  // ---------- navigation ----------
  const openLocation = (id: LocationId) => () => patch({ screen: 'location', selectedLocationId: id, locationCategoryFilter: null, selectedPantryBin: null });
  const openPantryBin = (bin: string | null) => () => patch({ screen: 'pantryBin', selectedLocationId: 'pantry', selectedPantryBin: bin });
  const backToPantry = () => patch({ screen: 'location', selectedLocationId: 'pantry', selectedPantryBin: null });
  const openToSort = () => patch({ screen: 'sortBucket' });
  const openExpiring = () => patch({ screen: 'expiring' });
  const openItem = (returnTo: Screen) => (id: string) => () => patch({ screen: 'itemDetail', selectedItemId: id, itemDetailReturnTo: returnTo });
  const backToHome = () => patch({ screen: 'home' });
  const closeItemDetail = () => patch({ screen: st.itemDetailReturnTo });
  const goHomeTab = () => patch({ screen: 'home', tab: 'home' });
  const goGroceryTab = () => patch({ screen: 'grocery', tab: 'grocery' });
  const goGrocery = () => patch({ screen: 'grocery', tab: 'grocery' });
  const goRecipesTab = () => patch({ screen: 'recipes', tab: 'recipes', recipeCatFilter: null, recipeSelectMode: false, recipeSelection: [] });
  const goPlanTab = () => patch({ screen: 'plan', tab: 'plan' });
  // From the Plan tab: jump straight into a pick-list of all recipes to add to the plan.
  const goPickRecipesForPlan = () => patch({ screen: 'recipes', tab: 'recipes', recipeCatFilter: '__all__', recipeSelectMode: true, recipeSelection: [] });
  const openSearch = () => patch({ screen: 'search', searchReturnScreen: st.screen });
  const closeSearch = () => patch({ screen: st.searchReturnScreen });
  const setSearchQuery = (e: ChangeEvent<HTMLInputElement>) => patch({ searchQuery: e.target.value });
  const clearSearchQuery = () => patch({ searchQuery: '' });

  // ---------- item mutations ----------
  // Ticking something off the grocery list means it's now in the kitchen. If we
  // already track that item, mark it back in stock (and, when it carries a
  // quantity, flag it for the "To be sorted" bucket so the stale amount gets
  // updated). If it's not tracked yet, create it straight into the bucket to be
  // placed. `existing` is the item the caller resolved the row to, if any.
  const stockCheckedOffItem = (name: string, existing: Item | null | undefined) => {
    if (existing) {
      const tracksQty = existing.unit != null || existing.quantity != null;
      kitchen.setItemStatus(existing.id, tracksQty ? { status: 'ok', needsSorting: true, sortReason: 'restocked' } : { status: 'ok' });
      return;
    }
    if (!name.trim()) return;
    kitchen.saveItem(null, {
      name: name.trim(), category: 'grains', location: 'pantry', bin: '', store: null,
      status: 'ok', dateType: null, date: null, quantity: null, unit: null,
      needsSorting: true, sortReason: 'new',
    });
  };
  // Restock row (an existing item that's low/out): resolves to that same item.
  const toggleAuto = (id: string) => () => {
    const it = kitchen.items.find((i) => i.id === id);
    stockCheckedOffItem(it?.name || '', it);
  };
  // Hand-added grocery row: match by exact name so a slightly different spelling
  // makes a fresh entry rather than silently merging into the wrong item.
  const removeManual = (id: string) => () => {
    const name = (kitchen.groceryExtras.find((g) => g.id === id)?.name || '').trim();
    const existing = name ? kitchen.items.find((i) => i.name.trim().toLowerCase() === name.toLowerCase()) : null;
    stockCheckedOffItem(name, existing);
    kitchen.removeManualGroceryItem(id);
  };
  // "For the Meal Plan" grocery row: resolve it the same fuzzy way the shopping
  // math did, then send it to the kitchen / bucket and clear it off the list.
  const checkPlanNeed = (key: string, label: string) => () => {
    const match = matchIngredient({ ingId: '', text: label, name: key, quantity: '', amount: null, unit: null, category: null, trackable: true }, kitchen.items);
    stockCheckedOffItem(label, match.matchedItem);
    patch({ dismissedPlanNeeds: [...st.dismissedPlanNeeds, key] });
  };
  const setStatus = (status: Item['status']) => () => {
    if (st.selectedItemId) kitchen.setItemStatus(st.selectedItemId, { status });
  };
  const removeItemHandler = () => {
    if (st.selectedItemId) kitchen.removeItem(st.selectedItemId);
    patch({ screen: st.itemDetailReturnTo });
  };
  const markItemSorted = () => {
    const id = st.selectedItemId;
    if (!id) return;
    kitchen.updateItem(id, { needsSorting: false, sortReason: null });
    const stillToSort = decorated.some((i) => i.id !== id && i.needsSorting);
    patch({ screen: st.itemDetailReturnTo === 'sortBucket' && !stillToSort ? 'home' : st.itemDetailReturnTo });
  };
  const setItemLocation = (loc: LocationId) => () => {
    const id = st.selectedItemId;
    if (!id) return;
    const cur = kitchen.items.find((i) => i.id === id);
    const body: Partial<Item> = { location: loc };
    if (loc === 'pantry') {
      if (!cur || !cur.bin) body.bin = 'Unsorted';
    } else {
      body.bin = '';
    }
    kitchen.updateItem(id, body);
  };
  const setItemBin = (b: string) => () => {
    if (st.selectedItemId) kitchen.updateItem(st.selectedItemId, { bin: b });
  };
  const commitItemQty = (raw: string) => {
    const id = st.selectedItemId;
    if (!id) return;
    const cur = kitchen.items.find((i) => i.id === id);
    const n = parseFloat(raw);
    const quantity = raw.trim() && Number.isFinite(n) && n >= 0 ? n : null;
    kitchen.updateItem(id, { quantity, unit: quantity == null ? null : (cur?.unit || 'count') });
  };
  const setItemUnit = (u: string) => () => {
    const id = st.selectedItemId;
    if (!id) return;
    const cur = kitchen.items.find((i) => i.id === id);
    if (cur?.quantity == null) return; // no amount yet — nothing to attach a unit to
    kitchen.updateItem(id, { unit: cur.unit === u ? 'count' : u });
  };

  // ---------- add flow ----------
  // Starting an add from a location/bin screen pre-fills that spot and returns there,
  // so you can add several items in a row without hopping back to a tab.
  const startAdd = () => {
    const loc = st.screen === 'location' ? st.selectedLocationId
      : st.screen === 'pantryBin' ? 'pantry'
      : st.screen === 'itemDetail' ? (kitchen.items.find((i) => i.id === st.selectedItemId)?.location ?? null)
      : null;
    const bin = st.screen === 'pantryBin' && st.selectedPantryBin ? st.selectedPantryBin : '';
    patch({
      screen: 'add1',
      addReturnTab: st.tab,
      addReturnScreen: st.screen,
      addDraft: loc ? { ...BLANK_DRAFT, location: loc, bin } : BLANK_DRAFT,
    });
  };
  const cancelAdd = () => patch({ screen: st.addReturnScreen, addDraft: BLANK_DRAFT, addPhotoStatus: 'idle' });
  const enterManually = () => patch({ screen: 'add2', addDraft: st.addDraft.location ? st.addDraft : BLANK_DRAFT });
  const backToAdd1 = () => patch({ screen: 'add1' });
  const backToAdd2 = () => patch({ screen: 'add2' });
  const goToAdd3 = () => patch({ screen: 'add3' });
  const updateDraft = (p: Partial<AddDraft>) => patch({ addDraft: { ...st.addDraft, ...p } });
  const setDraftName = (e: ChangeEvent<HTMLInputElement>) => updateDraft({ name: e.target.value });
  const pickCategory = (id: string) => () => updateDraft({ category: id, dateType: (id === 'vegetables' || id === 'fruits' || id === 'herbs') ? 'consume-by' : st.addDraft.dateType });
  const addItemCategory = (name: string) => {
    const canon = canonicalItemCategory(name, kitchen.items);
    if (canon) updateDraft({ category: canon });
  };
  const addStorageLocation = (name: string) => {
    const label = name.trim();
    if (!label || allLocations.some((l) => normCategory(l.label) === normCategory(label))) return;
    const used = new Set(allLocations.map((l) => l.color));
    const color = LOCATION_PALETTE.find((c) => !used.has(c)) || LOCATION_PALETTE[allLocations.length % LOCATION_PALETTE.length];
    kitchen.addLocation({ id: 'loc' + Date.now(), label, color, icon: guessLocationIcon(label) });
  };
  const renameLocation = (id: string) => (label: string) => {
    const t = label.trim();
    if (t) kitchen.updateLocation(id, { label: t });
  };
  const renamePantryBin = (label: string) => {
    const cur = st.selectedPantryBin;
    if (!cur) return;
    const canon = canonicalBin(label.trim(), kitchen.items) || label.trim();
    if (!canon || canon === cur) return;
    kitchen.renameBin(cur, canon, kitchen.items);
    patch({ selectedPantryBin: canon });
  };
  const pickLocation = (id: LocationId) => () => updateDraft({ location: id, bin: id === 'pantry' ? st.addDraft.bin : '' });
  const setDraftBin = (e: ChangeEvent<HTMLInputElement>) => updateDraft({ bin: e.target.value });
  const pickBin = (b: string) => () => updateDraft({ bin: b });
  const pickStore = (id: string) => () => updateDraft({ store: id });
  const setDraftDate = (e: ChangeEvent<HTMLInputElement>) => updateDraft({ date: e.target.value });
  const toggleSkipDate = () => updateDraft({ skipDate: !st.addDraft.skipDate, date: '' });
  const setDraftQty = (e: ChangeEvent<HTMLInputElement>) => updateDraft({ qty: e.target.value });
  const pickUnit = (u: string) => () => updateDraft({ unit: st.addDraft.unit === u ? null : u });

  const takePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    patch({ addPhotoStatus: 'loading' });
    const { item, error } = await scanItemApi(file);
    if (error || !item) {
      patch({ addPhotoStatus: 'idle', screen: 'add2', addDraft: BLANK_DRAFT });
      return;
    }
    patch({
      addPhotoStatus: 'idle',
      screen: 'add2',
      addDraft: {
        name: item.name, category: item.category,
        location: st.addDraft.location, bin: st.addDraft.bin, store: null,
        date: '', dateType: 'expiry', skipDate: !item.needsDate, qty: '', unit: null,
      },
    });
  };

  const saveItem = () => {
    const d = st.addDraft;
    const qtyNum = parseFloat(d.qty);
    const quantity = d.qty.trim() && Number.isFinite(qtyNum) && qtyNum >= 0 ? qtyNum : null;
    const body: Omit<Item, 'id'> = {
      name: d.name.trim() ? d.name.trim() : 'New Item',
      category: d.category ? canonicalItemCategory(d.category, kitchen.items) : 'grains',
      location: d.location ? canonicalLocation(d.location, allLocations) : 'pantry',
      bin: (d.location || 'pantry') === 'pantry' ? canonicalBin(d.bin || 'Unsorted', kitchen.items) : '',
      store: d.store || null,
      status: 'ok',
      dateType: d.skipDate ? null : d.dateType,
      date: d.skipDate ? null : (d.date || null),
      quantity,
      unit: quantity == null ? null : (d.unit || 'count'),
    };
    kitchen.saveItem(null, body);
    const toPantry = body.location === 'pantry';
    patch({
      screen: toPantry ? 'pantryBin' : 'location',
      tab: st.addReturnTab,
      selectedLocationId: body.location,
      selectedPantryBin: toPantry ? body.bin : null,
      addDraft: BLANK_DRAFT,
    });
  };

  // ---------- receipt scan ----------
  const startReceiptScan = () => patch({ screen: 'receiptScan', receiptStatus: 'idle', receiptErrorText: '' });
  const backToAdd1FromReceipt = () => patch({ screen: 'add1', receiptStatus: 'idle', receiptErrorText: '' });
  const enterManuallyFromReceipt = () => patch({ screen: 'add2', addDraft: st.addDraft.location ? st.addDraft : BLANK_DRAFT, receiptStatus: 'idle', receiptErrorText: '' });
  const cancelReceiptReview = () => patch({ screen: st.addReturnScreen, receiptDraftItems: [], receiptStore: null, expandedReceiptItemId: null });

  const buildReceiptDraftRow = (raw: { name?: string; category?: string; quantity?: string | null }, idx: number): ReceiptDraftItem => {
    const catId = raw && CATEGORIES.some((c) => c.id === raw.category) ? (raw.category as string) : 'grains';
    const dateType = DATE_TYPE_BY_CATEGORY[catId] || null;
    const location = DEFAULT_LOCATION_BY_CATEGORY[catId] || 'pantry';
    const name = raw?.name?.trim() ? raw.name.trim() : `Item ${idx + 1}`;
    const quantity = raw?.quantity != null && String(raw.quantity).trim() ? String(raw.quantity).trim() : '';
    return {
      tempId: `r${idx}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      include: true, name, quantity, category: catId, location, bin: '', dateType, date: '', skipDate: !dateType,
    };
  };

  const receiptErrorCopyForCode = (code?: string) => {
    if (code === 'not_configured' || code === 'network_error') return { status: 'unavailable' as const, text: "Receipt scanning isn't available right now." };
    if (code === 'invalid_json' || code === 'empty_completion') return { status: 'error' as const, text: "Couldn't read that receipt clearly — try a clearer or brighter photo." };
    return { status: 'error' as const, text: 'Something went wrong reading that receipt. Please try again.' };
  };

  const onReceiptFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    patch({ screen: 'receiptScan', receiptStatus: 'loading', receiptErrorText: '' });
    const { items, error } = await scanReceiptApi(file);
    if (error) {
      const copy = receiptErrorCopyForCode(error);
      patch({ receiptStatus: copy.status, receiptErrorText: copy.text });
      return;
    }
    const rawItems = items || [];
    if (!rawItems.length) {
      patch({ receiptStatus: 'error', receiptErrorText: "We couldn't find any items on that photo. Try a clearer, well-lit photo of the receipt." });
      return;
    }
    const draftItems = rawItems.slice(0, 30).map((raw, idx) => buildReceiptDraftRow(raw, idx));
    patch({ screen: 'receiptReview', receiptStatus: 'idle', receiptDraftItems: draftItems, expandedReceiptItemId: null });
  };

  const toggleReceiptExpand = (tempId: string) => () => patch({ expandedReceiptItemId: st.expandedReceiptItemId === tempId ? null : tempId });
  const updateReceiptItem = (tempId: string, p: Partial<ReceiptDraftItem>) => patch({
    receiptDraftItems: st.receiptDraftItems.map((it) => (it.tempId === tempId ? { ...it, ...p } : it)),
  });
  const toggleReceiptInclude = (tempId: string) => () => updateReceiptItem(tempId, { include: !st.receiptDraftItems.find((i) => i.tempId === tempId)?.include });
  const toggleReceiptSkipDate = (tempId: string) => () => {
    const it = st.receiptDraftItems.find((i) => i.tempId === tempId);
    if (!it) return;
    const nextSkip = !it.skipDate;
    updateReceiptItem(tempId, { skipDate: nextSkip, date: nextSkip ? '' : it.date });
  };
  const pickReceiptCategory = (tempId: string, catId: string) => () => {
    const dt = DATE_TYPE_BY_CATEGORY[catId] || null;
    updateReceiptItem(tempId, { category: catId, dateType: dt, skipDate: !dt, date: '' });
  };
  const pickReceiptLocation = (tempId: string, locId: LocationId) => () => {
    const it = st.receiptDraftItems.find((i) => i.tempId === tempId);
    updateReceiptItem(tempId, { location: locId, bin: locId === 'pantry' ? (it?.bin || '') : '' });
  };
  const removeReceiptItemHandler = (tempId: string) => () => patch({ receiptDraftItems: st.receiptDraftItems.filter((i) => i.tempId !== tempId) });

  const addReceiptItems = () => {
    const included = st.receiptDraftItems.filter((it) => it.include);
    included.forEach((it, idx) => {
      const { quantity, unit } = parseQtyString(it.quantity);
      const body: Omit<Item, 'id'> = {
        name: it.name.trim() ? it.name.trim() : 'New Item',
        category: it.category,
        location: it.location,
        bin: it.location === 'pantry' ? canonicalBin(it.bin.trim() ? it.bin.trim() : 'Unsorted', kitchen.items) : '',
        store: st.receiptStore || null,
        status: 'ok',
        dateType: it.skipDate ? null : it.dateType,
        date: it.skipDate ? null : (it.date || null),
        quantity,
        unit,
      };
      kitchen.saveItem(`r${Date.now()}-${idx}`, body);
    });
    patch({ screen: 'home', tab: 'home', receiptDraftItems: [], receiptStore: null, receiptStatus: 'idle', expandedReceiptItemId: null });
  };

  // ---------- grocery ----------
  const setManualDraft = (e: ChangeEvent<HTMLInputElement>) => patch({ manualDraft: e.target.value });
  const addManualItem = () => {
    const name = st.manualDraft.trim();
    if (!name) return;
    kitchen.addManualGroceryItem(name);
    patch({ manualDraft: '' });
  };
  const setStoreFilter = (id: string | null) => patch({ storeFilter: id });

  // ---------- recipes: list & categories ----------
  const normCat = (c: string | null | undefined) => (c || '').trim().toLowerCase();
  const catCards = recipeCategoryCards(kitchen.recipes);
  const recipeCatLabel = st.recipeCatFilter === '__all__' ? 'All Recipes'
    : st.recipeCatFilter === '__ready__' ? 'Ready to Cook'
    : st.recipeCatFilter === '__uncat__' ? 'Uncategorized'
    : (st.recipeCatFilter || '');
  const filteredRecipes = (() => {
    const f = st.recipeCatFilter;
    if (!f || f === '__all__') return decoratedRecipes;
    if (f === '__ready__') return decoratedRecipes.filter((r) => r.readiness.ready);
    if (f === '__uncat__') return decoratedRecipes.filter((r) => !normCat(r.category));
    return decoratedRecipes.filter((r) => normCat(r.category) === normCat(f));
  })();
  const openRecipeCat = (key: string) => () => patch({ recipeCatFilter: key, recipeSelectMode: false, recipeSelection: [] });
  const backToRecipeCats = () => patch({ recipeCatFilter: null, recipeSelectMode: false, recipeSelection: [] });
  const openRecipe = (returnTo: Screen) => (id: string) => () => patch({ screen: 'recipeDetail', selectedRecipeId: id, recipeDetailReturnTo: returnTo });
  const toggleRecipeSelectMode = () => patch({ recipeSelectMode: !st.recipeSelectMode, recipeSelection: [] });
  const toggleRecipeSelected = (id: string) => () => patch({
    recipeSelection: st.recipeSelection.includes(id) ? st.recipeSelection.filter((x) => x !== id) : [...st.recipeSelection, id],
  });
  const startAddRecipe = () => patch({
    screen: 'recipeAdd1', editingRecipeId: null, recipeNameDraft: '', recipeIngredientTextDraft: '',
    recipeInstructionsDraft: '', recipeParseStatus: 'idle', recipeParseErrorText: '', recipeIngPreParsed: false, recipeIngredientDrafts: [],
    recipeUrlDraft: '', recipeImportStatus: 'idle', recipeImportError: '',
    recipeCategoryDraft: st.recipeCatFilter && !st.recipeCatFilter.startsWith('__') ? st.recipeCatFilter : '',
    recipePhotoDataUrl: '', recipePhotoStatus: 'idle', recipeServingsDraft: '', recipeSaveStatus: 'idle',
  });
  const pickRecipeCategoryDraft = (c: string) => () => patch({ recipeCategoryDraft: normCat(st.recipeCategoryDraft) === normCat(c) ? '' : c });
  const setRecipeCategoryDraft = (e: ChangeEvent<HTMLInputElement>) => patch({ recipeCategoryDraft: e.target.value });

  // ---------- recipes: detail ----------
  const selectedRecipe = decoratedRecipes.find((r) => r.id === st.selectedRecipeId) || null;
  const closeRecipeDetail = () => patch({
    screen: st.recipeDetailReturnTo,
    tab: st.recipeDetailReturnTo === 'plan' ? 'plan' : 'recipes',
  });
  const deleteRecipeHandler = () => {
    if (st.selectedRecipeId) kitchen.deleteRecipe(st.selectedRecipeId);
    patch({ screen: 'recipes', tab: 'recipes' });
  };
  const startEditRecipe = () => {
    if (!selectedRecipe) return;
    patch({
      screen: 'recipeAdd2', editingRecipeId: selectedRecipe.id, recipeNameDraft: selectedRecipe.name,
      recipeInstructionsDraft: selectedRecipe.instructions || '', recipeIngPreParsed: false,
      recipeIngredientDrafts: (selectedRecipe.ingredients || []).map((i) => ({ ...i })),
      recipePhotoDataUrl: selectedRecipe.photoDataUrl || '',
      recipeServingsDraft: selectedRecipe.servings ? String(selectedRecipe.servings) : '',
      recipeCategoryDraft: selectedRecipe.category || '',
      recipeSaveStatus: 'idle', expandedRecipeIngredientId: null,
    });
  };
  const setDetailRecipeCategory = (c: string) => () => {
    if (!selectedRecipe) return;
    const clear = normCat(selectedRecipe.category) === normCat(c);
    kitchen.updateRecipe(selectedRecipe.id, { category: clear ? null : canonicalRecipeCategory(c, kitchen.recipes) });
  };
  const addDetailRecipeCategory = (name: string) => {
    if (!selectedRecipe || !name.trim()) return;
    kitchen.updateRecipe(selectedRecipe.id, { category: canonicalRecipeCategory(name, kitchen.recipes) });
  };

  // ---------- recipes: add/edit step 1 ----------
  const setRecipeNameDraft = (e: ChangeEvent<HTMLInputElement>) => patch({ recipeNameDraft: e.target.value });
  const setRecipeUrlDraft = (e: ChangeEvent<HTMLInputElement>) => patch({ recipeUrlDraft: e.target.value });
  const importRecipeFromUrl = async () => {
    const url = st.recipeUrlDraft.trim();
    if (!url || st.recipeImportStatus === 'loading') return;
    patch({ recipeImportStatus: 'loading', recipeImportError: '' });
    const { recipe, error } = await importRecipeApi(url);
    if (error || !recipe) {
      const msg = error === 'bad_url' ? "That doesn't look like a valid link."
        : error === 'timeout' ? 'That link took too long to respond.'
        : error === 'no_recipe' ? "Couldn't pull a recipe from that link — for a video, the recipe may not be in its description. Try pasting it in below."
        : (error === 'not_configured' || error === 'network_error') ? "Recipe import isn't available right now."
        : "Couldn't read that link — try pasting the recipe in below.";
      patch({ recipeImportStatus: 'error', recipeImportError: msg });
      return;
    }
    // The AI import paths hand back ingredients already structured — keep them so
    // "Continue" doesn't have to run them through the parser again.
    const preParsed = Array.isArray(recipe.ingredients) && recipe.ingredients.length
      ? recipe.ingredients.slice(0, 60).map((raw, idx) => buildIngredientRow(raw, idx))
      : null;
    patch({
      recipeImportStatus: 'idle', recipeImportError: '',
      recipeNameDraft: recipe.name || st.recipeNameDraft,
      recipeServingsDraft: recipe.servings ? String(recipe.servings) : st.recipeServingsDraft,
      recipeIngredientTextDraft: recipe.ingredientsText || st.recipeIngredientTextDraft,
      recipeInstructionsDraft: recipe.instructions || st.recipeInstructionsDraft,
      recipePhotoDataUrl: recipe.photoDataUrl || st.recipePhotoDataUrl,
      recipeIngPreParsed: !!preParsed,
      recipeIngredientDrafts: preParsed || st.recipeIngredientDrafts,
    });
  };
  const setRecipeServingsDraft = (e: ChangeEvent<HTMLInputElement>) => patch({ recipeServingsDraft: e.target.value });
  const setRecipeIngredientTextDraft = (e: ChangeEvent<HTMLTextAreaElement>) => patch({ recipeIngredientTextDraft: e.target.value, recipeIngPreParsed: false });
  const setRecipeInstructionsDraft = (e: ChangeEvent<HTMLTextAreaElement>) => patch({ recipeInstructionsDraft: e.target.value });
  const cancelRecipeAdd = () => patch({ screen: st.editingRecipeId ? 'recipeDetail' : 'recipes', recipeParseStatus: 'idle', recipeParseErrorText: '' });

  const recipeParseErrorCopyForCode = (code?: string) => {
    if (code === 'not_configured' || code === 'network_error') return { status: 'unavailable' as const, text: "Recipe parsing isn't available right now — add ingredients one at a time instead." };
    if (code === 'invalid_json' || code === 'empty_completion') return { status: 'error' as const, text: "Couldn't quite make sense of that ingredient list — try trimming it down or tidying the formatting." };
    return { status: 'error' as const, text: 'Something went wrong reading those ingredients. Please try again.' };
  };

  const parseRecipeIngredients = async () => {
    const textVal = st.recipeIngredientTextDraft.trim();
    if (!textVal) return;
    // Import already gave us structured rows and the text hasn't been edited since — use them as-is.
    if (st.recipeIngPreParsed && st.recipeIngredientDrafts.length) {
      patch({ screen: 'recipeAdd2', recipeParseStatus: 'idle', recipeParseErrorText: '', expandedRecipeIngredientId: null });
      return;
    }
    patch({ recipeParseStatus: 'loading', recipeParseErrorText: '' });
    const { items, error } = await parseIngredientsApi(textVal);
    const rawItems = (items || []).filter((it) => it && (it.text || it.name));
    if (!error && rawItems.length) {
      const drafts = rawItems.slice(0, 60).map((raw, idx) => buildIngredientRow(raw, idx));
      patch({ screen: 'recipeAdd2', recipeParseStatus: 'idle', recipeIngredientDrafts: drafts, expandedRecipeIngredientId: null });
      return;
    }
    // Parser unavailable or gave nothing usable — fall back to a rough local parse
    // rather than dead-ending. The user can fix any row on the next screen.
    const local = textVal.split('\n').map((l) => roughParseIngredient(l)).filter((x): x is NonNullable<typeof x> => !!x);
    if (local.length) {
      const drafts = local.slice(0, 60).map((raw, idx) => buildIngredientRow(raw, idx));
      patch({ screen: 'recipeAdd2', recipeParseStatus: 'idle', recipeParseErrorText: '', recipeIngredientDrafts: drafts, expandedRecipeIngredientId: null });
      return;
    }
    const copy = recipeParseErrorCopyForCode(error || 'no_items');
    patch({ recipeParseStatus: copy.status, recipeParseErrorText: copy.text });
  };
  const skipToManualIngredients = () => patch({ screen: 'recipeAdd2', recipeParseStatus: 'idle', expandedRecipeIngredientId: null });

  // ---------- recipes: add/edit step 2 ----------
  const toggleIngredientExpand = (ingId: string) => () => patch({ expandedRecipeIngredientId: st.expandedRecipeIngredientId === ingId ? null : ingId });
  const updateIngredientDraft = (ingId: string, p: Partial<Ingredient>) => patch({
    recipeIngredientDrafts: st.recipeIngredientDrafts.map((ing) => (ing.ingId === ingId ? { ...ing, ...p } : ing)),
  });
  const removeIngredientDraft = (ingId: string) => () => patch({ recipeIngredientDrafts: st.recipeIngredientDrafts.filter((ing) => ing.ingId !== ingId) });
  const pickIngredientCategory = (ingId: string, catId: string | null) => () => updateIngredientDraft(ingId, { category: catId });
  const setIngredientAmount = (ingId: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    updateIngredientDraft(ingId, { amountText: raw, amount: parseAmount(raw) });
  };
  const pickIngredientUnit = (ingId: string, u: string) => () => {
    const cur = st.recipeIngredientDrafts.find((i) => i.ingId === ingId);
    updateIngredientDraft(ingId, { unit: cur?.unit === u ? null : u });
  };
  const addBlankIngredient = () => {
    const row = buildIngredientRow({ text: '', name: '', quantity: '', category: null, trackable: true }, st.recipeIngredientDrafts.length);
    patch({ recipeIngredientDrafts: [...st.recipeIngredientDrafts, row], expandedRecipeIngredientId: row.ingId });
  };
  const goToRecipeAdd3 = () => patch({ screen: 'recipeAdd3' });
  const backToRecipeAdd1 = () => patch({ screen: 'recipeAdd1' });
  const backToRecipeAdd2 = () => patch({ screen: 'recipeAdd2' });

  // ---------- recipes: add/edit step 3 ----------
  const onRecipePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    patch({ recipePhotoStatus: 'loading' });
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 480, 0.72);
      patch({ recipePhotoDataUrl: dataUrl, recipePhotoStatus: 'idle' });
    } catch {
      patch({ recipePhotoStatus: 'error' });
    }
  };
  const removeRecipePhoto = () => patch({ recipePhotoDataUrl: '', recipePhotoStatus: 'idle' });

  const draftIngredients = (): Ingredient[] => st.recipeIngredientDrafts.map((ing) => {
    const amount = ing.amount ?? null;
    return {
      ingId: ing.ingId, text: ing.text, name: ing.name, quantity: ing.quantity,
      amount, amountText: amount != null ? (ing.amountText || String(amount)) : null,
      unit: amount != null ? (ing.unit || 'count') : null,
      category: ing.category, trackable: ing.trackable !== false,
    };
  });

  const saveRecipe = async () => {
    const name = st.recipeNameDraft.trim() ? st.recipeNameDraft.trim() : 'Untitled Recipe';
    const ingredients = draftIngredients();
    const servingsNum = parseInt(st.recipeServingsDraft, 10);
    const servings = Number.isFinite(servingsNum) && servingsNum > 0 ? servingsNum : null;
    const id = st.editingRecipeId;
    const category = st.recipeCategoryDraft.trim() ? canonicalRecipeCategory(st.recipeCategoryDraft, kitchen.recipes) : null;
    const baseBody: Omit<Recipe, 'id'> = {
      name, ingredients, instructions: st.recipeInstructionsDraft || '', photoDataUrl: st.recipePhotoDataUrl || '',
      servings, nutrition: null, category,
    };

    const finalize = (nutrition: Recipe['nutrition']) => {
      const savedId = kitchen.saveRecipe(id, { ...baseBody, nutrition });
      patch({ screen: 'recipeDetail', selectedRecipeId: savedId || id, editingRecipeId: null, recipeSaveStatus: 'idle' });
    };

    if (!ingredients.length || !servings) {
      finalize(null);
      return;
    }
    patch({ recipeSaveStatus: 'loading' });
    const lines = ingredients.map((i) => `- ${i.quantity ? i.quantity + ' ' : ''}${i.name || i.text}`);
    const { nutrition, error } = await estimateNutritionApi(name, servings, lines);
    finalize(error ? null : nutrition || null);
  };

  // ---------- meal plan ----------
  const weekStart = st.mealPlanWeek || mondayOf(new Date());
  const weekDayIsos = weekDates(weekStart);
  const todayIso = isoDate(new Date());
  const decoratedRecipeById = useMemo(() => {
    const m = new Map<string, (typeof decoratedRecipes)[number]>();
    decoratedRecipes.forEach((r) => m.set(r.id, r));
    return m;
  }, [decoratedRecipes]);
  type PlanRow = { id: string; recipeId: string; date: string; servings: number; meal: MealSlot | null; recipeName: string; ready: boolean; cooked: boolean; preparedId: string | null; canUndoCook: boolean };
  const preparedById = new Map(kitchen.preparedFood.map((p) => [p.id, p] as [string, PreparedFood]));
  const planEntriesByDate: Record<string, PlanRow[]> = {};
  kitchen.mealPlanEntries.forEach((e) => {
    const r = decoratedRecipeById.get(e.recipeId);
    const prep = e.preparedId ? preparedById.get(e.preparedId) : undefined;
    (planEntriesByDate[e.date] = planEntriesByDate[e.date] || []).push({
      id: e.id, recipeId: e.recipeId, date: e.date, servings: e.servings, meal: e.meal ?? null,
      recipeName: r ? r.name : 'Deleted recipe', ready: r ? r.readiness.ready : false,
      cooked: !!e.cooked, preparedId: e.preparedId ?? null,
      canUndoCook: !!prep && (prep.eaten || []).length === 0,
    });
  });
  const shopWeekActive = kitchen.mealPlanShopWeek === weekStart;
  const setShopWeek = () => kitchen.setShopWeek(shopWeekActive ? null : weekStart);
  const shopEntries = shopWeekActive ? kitchen.mealPlanEntries.filter((e) => weekDayIsos.includes(e.date)) : [];
  const mealPlanNeedRows = buildMealPlanGroceryRows(shopEntries, kitchen.recipes, kitchen.items);
  const groceryPlanRows: SectionRow[] = mealPlanNeedRows
    .filter((n) => !st.dismissedPlanNeeds.includes(n.key))
    .map((n) => ({
      id: 'plan-' + n.key,
      name: n.buyText ? `${n.label} — ~${n.buyText}` : n.label,
      dotColor: accent, hasMeta: true, meta: 'For: ' + n.recipeNames.join(', '),
      hasBadge: false, badgeText: '', badgeStyle: null,
      onCheck: checkPlanNeed(n.key, n.label),
    }));
  const changeWeek = (delta: number) => patch({ mealPlanWeek: addDays(weekStart, delta * 7) });
  const setPlanServings = (id: string, delta: number, current: number) => () => kitchen.updateMealPlanEntry(id, { servings: Math.max(1, current + delta) });
  const removePlanEntry = (id: string) => () => kitchen.removeMealPlanEntry(id);
  const setPlanView = (v: 'week' | 'fridge') => patch({ planView: v });

  // ---------- meal plan: cook-off + fridge ----------
  const preparedActive = kitchen.preparedFood
    .map((p) => ({ p, left: servingsLeft(p), fresh: preparedFreshness(p, todayIso) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => (a.p.useBy || '9999').localeCompare(b.p.useBy || '9999'));
  const eatenThisWeek: { date: string; label: string; items: { name: string; servings: number }[] }[] = weekDayIsos
    .map((iso) => {
      const items: { name: string; servings: number }[] = [];
      kitchen.preparedFood.forEach((p) => (p.eaten || []).forEach((e) => { if (e.date === iso) items.push({ name: p.name, servings: e.servings }); }));
      const dl = dayLabel(iso);
      return { date: iso, label: `${dl.weekday} ${dl.day}`, items };
    })
    .filter((d) => d.items.length > 0);

  const startCook = (entryId: string) => () => patch({ screen: 'cookConfirm', cookEntryId: entryId });
  const cancelCook = () => patch({ screen: 'plan', cookEntryId: null });
  const cookEntry = kitchen.mealPlanEntries.find((e) => e.id === st.cookEntryId) || null;
  const cookRecipeObj = cookEntry ? kitchen.recipes.find((r) => r.id === cookEntry.recipeId) || null : null;
  const cookPlan = cookEntry && cookRecipeObj ? planCookEffects(cookRecipeObj, cookEntry.servings, kitchen.items) : { effects: [] as CookEffect[], unmatched: [] as string[] };
  const confirmCook = () => {
    if (!cookEntry || !cookRecipeObj) return;
    const madeOn = todayIso;
    kitchen.cookRecipe({
      entryId: cookEntry.id,
      cookedAt: madeOn,
      prepared: {
        recipeId: cookRecipeObj.id, name: cookRecipeObj.name, madeOn,
        servingsMade: cookEntry.servings, useBy: addDays(madeOn, LEFTOVER_DAYS),
        planEntryId: cookEntry.id, deductions: cookPlan.effects.map((x) => x.deduction), eaten: [],
      },
      itemPatches: cookPlan.effects.map((x) => ({ id: x.itemId, patch: x.patch })),
    });
    patch({ screen: 'plan', tab: 'plan', cookEntryId: null, planView: 'fridge' });
  };
  const undoCookEntry = (preparedId: string) => () => {
    const prep = kitchen.preparedFood.find((p) => p.id === preparedId);
    if (!prep || (prep.eaten || []).length > 0) return;
    const patches = new Map<string, Partial<Item>>();
    prep.deductions.forEach((d) => {
      const cur = kitchen.items.find((i) => i.id === d.itemId);
      if (!cur) return;
      const p: Partial<Item> = patches.get(d.itemId) || {};
      if (d.amount != null && d.unit) p.quantity = Math.round(((p.quantity ?? cur.quantity ?? 0) + d.amount) * 100) / 100;
      if (d.prevStatus) p.status = d.prevStatus;
      patches.set(d.itemId, p);
    });
    kitchen.undoCook({
      entryId: prep.planEntryId, preparedId,
      itemPatches: [...patches.entries()].map(([id, p]) => ({ id, patch: p })),
    });
  };
  const eatServing = (preparedId: string, n: number) => () => {
    const prep = kitchen.preparedFood.find((p) => p.id === preparedId);
    if (!prep) return;
    kitchen.updatePreparedFood(preparedId, { eaten: [...(prep.eaten || []), { date: todayIso, servings: n }] });
  };
  const undoLastEat = (preparedId: string) => () => {
    const prep = kitchen.preparedFood.find((p) => p.id === preparedId);
    if (!prep || !(prep.eaten || []).length) return;
    kitchen.updatePreparedFood(preparedId, { eaten: (prep.eaten || []).slice(0, -1) });
  };
  const setPreparedUseBy = (preparedId: string) => (e: ChangeEvent<HTMLInputElement>) => kitchen.updatePreparedFood(preparedId, { useBy: e.target.value || null });

  // ---------- meal plan: add-from-list flow ----------
  const planDayChoices = [...weekDayIsos, ...weekDates(addDays(weekStart, 7))];
  const startAddToPlan = () => {
    const defaultDay = weekDayIsos.includes(todayIso) ? todayIso : weekDayIsos[0];
    const rows = st.recipeSelection.map((rid) => {
      const r = kitchen.recipes.find((x) => x.id === rid);
      return { recipeId: rid, dates: [defaultDay], servings: String((r && r.servings) || 2), meal: guessMealSlot(r?.category) };
    });
    patch({ screen: 'planAdd', planBatch: rows });
  };
  const updatePlanBatchRow = (recipeId: string, p: Partial<{ dates: string[]; servings: string; meal: MealSlot }>) => patch({
    planBatch: st.planBatch.map((b) => (b.recipeId === recipeId ? { ...b, ...p } : b)),
  });
  const setPlanBatchMeal = (recipeId: string, meal: MealSlot) => updatePlanBatchRow(recipeId, { meal });
  const togglePlanBatchDay = (recipeId: string, iso: string) => patch({
    planBatch: st.planBatch.map((b) => (b.recipeId === recipeId
      ? { ...b, dates: b.dates.includes(iso) ? b.dates.filter((d) => d !== iso) : [...b.dates, iso] }
      : b)),
  });
  const planBatchEntries = () => st.planBatch.flatMap((b) => {
    const servings = Math.max(1, parseInt(b.servings, 10) || 1);
    return b.dates.map((date) => ({ recipeId: b.recipeId, date, servings, meal: b.meal }));
  });
  const cancelPlanAdd = () => patch({ screen: 'recipes', tab: 'recipes', planBatch: [], planReviewQueue: [], recipeSelectMode: false, recipeSelection: [] });

  const loadPlanReview = async (recipeId: string) => {
    const r = kitchen.recipes.find((x) => x.id === recipeId);
    if (!r) return;
    patch({
      screen: 'planReview', editingRecipeId: recipeId, recipeNameDraft: r.name,
      recipeIngredientDrafts: (r.ingredients || []).map((i) => ({ ...i })),
      recipeParseStatus: 'loading', recipeParseErrorText: '', expandedRecipeIngredientId: null,
    });
    const { items } = await parseIngredientsApi((r.ingredients || []).map((i) => i.text).join('\n'));
    patch({
      recipeParseStatus: 'idle',
      recipeIngredientDrafts: (r.ingredients || []).map((ing, idx) => {
        const p = items ? items[idx] : undefined;
        const parsed = p ? parseAmount(p.amount as string | number | null | undefined) : null;
        const amount = parsed ?? ing.amount ?? null;
        const parsedUnit = p && typeof p.unit === 'string' && RECIPE_UNITS.includes(p.unit) ? p.unit : null;
        return {
          ...ing,
          amount,
          amountText: amount != null ? (ing.amountText || formatAmount(amount) || String(amount)) : null,
          unit: parsed != null ? (parsedUnit || ing.unit || 'count') : (ing.unit ?? null),
        };
      }),
    });
  };
  const finishPlanFlow = () => {
    kitchen.addMealPlanEntries(planBatchEntries());
    patch({ screen: 'plan', tab: 'plan', planBatch: [], planReviewQueue: [], editingRecipeId: null, recipeSelectMode: false, recipeSelection: [] });
  };
  const advancePlanReview = (remaining: string[]) => {
    if (remaining.length) { patch({ planReviewQueue: remaining }); loadPlanReview(remaining[0]); }
    else finishPlanFlow();
  };
  const commitPlan = () => {
    if (!planBatchEntries().length) return;
    const queue = st.planBatch.filter((b) => b.dates.length).map((b) => b.recipeId).filter((rid) => {
      const r = kitchen.recipes.find((x) => x.id === rid);
      return !!r && (r.ingredients || []).some((ing) => ing.trackable !== false && ing.amount == null);
    });
    if (!queue.length) { finishPlanFlow(); return; }
    patch({ planReviewQueue: queue });
    loadPlanReview(queue[0]);
  };
  const savePlanReviewAndAdvance = () => {
    const rid = st.editingRecipeId;
    const r = rid ? kitchen.recipes.find((x) => x.id === rid) : null;
    if (r) {
      kitchen.saveRecipe(r.id, {
        name: r.name, ingredients: draftIngredients(), instructions: r.instructions || '',
        photoDataUrl: r.photoDataUrl || '', servings: r.servings ?? null, nutrition: r.nutrition ?? null,
      });
    }
    advancePlanReview(st.planReviewQueue.slice(1));
  };
  const skipPlanReview = () => advancePlanReview(st.planReviewQueue.slice(1));

  // ---------- home stats ----------
  const statsFor = (locId: LocationId) => {
    const items = placedDecorated.filter((i) => i.location === locId);
    const alerts = items.filter((i) => i.needsRestock || i.soonOrUrgent).length;
    return { count: items.length, alerts };
  };
  const pantryStats = statsFor('pantry');
  const homeLocationCards = allLocations.map((l) => {
    const s = statsFor(l.id);
    return { id: l.id, label: l.label, color: l.color, icon: l.icon, count: s.count, alerts: s.alerts, onOpen: openLocation(l.id) };
  });
  const restockCount = placedDecorated.filter((i) => i.needsRestock).length + kitchen.groceryExtras.length;
  const expiringSoonCount = placedDecorated.filter((i) => i.soonOrUrgent).length;

  // ---------- expiring-soon screen ----------
  const expiringSections: Section[] = (() => {
    const buckets: { title: string; rows: SectionRow[] }[] = [
      { title: 'Expired', rows: [] },
      { title: 'Next 2 days', rows: [] },
      { title: 'Later this week', rows: [] },
    ];
    placedDecorated
      .filter((i) => i.soonOrUrgent && i.hasDate)
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach((i) => {
        const d = daysUntil(i.date) ?? 0;
        const row: SectionRow = {
          id: i.id, name: i.name, dotColor: i.catDot,
          meta: [i.fullLocationLabel, i.dateText].filter(Boolean).join(' · '),
          metaColor: muted, hasBadge: false, badgeText: '', badgeStyle: null,
          onOpen: openItem('expiring')(i.id),
        };
        (d < 0 ? buckets[0] : d <= 2 ? buckets[1] : buckets[2]).rows.push(row);
      });
    return buckets.filter((b) => b.rows.length).map((b) => ({ sectionTitle: b.title, rows: b.rows }));
  })();

  // ---------- location screen ----------
  const currentLocationId = st.selectedLocationId || 'pantry';
  const currentLocationIsPantry = currentLocationId === 'pantry';
  const locationSections: Section[] = currentLocationIsPantry
    ? []
    : buildLocationCategorySections(placedDecorated, currentLocationId, st.locationCategoryFilter, openItem('location'));
  const filterChips = currentLocationIsPantry ? [] : categoryChipsForLocation(placedDecorated, currentLocationId, st.locationCategoryFilter, (id) => patch({ locationCategoryFilter: id }));

  // ---------- pantry bin grid + bin detail ----------
  const pantryBinSummaries = useMemo(() => buildPantryBinSummaries(placedDecorated), [placedDecorated]);
  const pantryBinCards = [
    { key: '__all__', label: 'All Items', count: pantryStats.count, alerts: 0, onOpen: openPantryBin(null) },
    ...pantryBinSummaries.map((s) => ({ key: s.bin, label: s.bin, count: s.count, alerts: s.alerts, onOpen: openPantryBin(s.bin) })),
  ];
  const pantryBinIsAll = st.selectedPantryBin === null;
  const pantryBinSections: Section[] = pantryBinIsAll
    ? buildPantrySections(placedDecorated, openItem('pantryBin'))
    : buildPantryBinCategorySections(placedDecorated, st.selectedPantryBin ?? '', openItem('pantryBin'));
  const pantryBinLabel = pantryBinIsAll ? 'All Items' : (st.selectedPantryBin ?? 'Other');
  const pantryBinCount = pantryBinIsAll
    ? pantryStats.count
    : placedDecorated.filter((i) => i.location === 'pantry' && normBin(i.bin || 'Other') === normBin(st.selectedPantryBin)).length;

  // ---------- grocery screen ----------
  const stockGrocerySections: Section[] = buildGrocerySections(placedDecorated, kitchen.groceryExtras, st.storeFilter, toggleAuto, removeManual);
  const grocerySections: Section[] = groceryPlanRows.length
    ? [{ sectionTitle: 'For the Meal Plan', rows: groceryPlanRows }, ...stockGrocerySections]
    : stockGrocerySections;
  const storeFilterChips = storeChipsForGrocery(placedDecorated, st.storeFilter, setStoreFilter);
  const groceryTotal = placedDecorated.filter((i) => i.needsRestock && (!st.storeFilter || i.store === st.storeFilter)).length + kitchen.groceryExtras.length + groceryPlanRows.length;

  // ---------- search ----------
  const searchQ = st.searchQuery.trim().toLowerCase();
  const openItemFromSearch = openItem('search');
  const searchItemRows = !searchQ ? [] : decorated
    .filter((i) =>
      i.name.toLowerCase().includes(searchQ) ||
      i.catLabel.toLowerCase().includes(searchQ) ||
      (i.bin || '').toLowerCase().includes(searchQ) ||
      i.locationLabel.toLowerCase().includes(searchQ) ||
      (i.storeLabel || '').toLowerCase().includes(searchQ)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => ({
      id: i.id, name: i.name, dotColor: i.catDot,
      meta: [i.catLabel, i.qtyText, i.fullLocationLabel].filter(Boolean).join(' · '),
      metaColor: muted,
      hasBadge: i.hasBadge, badgeText: i.badgeText, badgeStyle: i.badgeStyle,
      onOpen: openItemFromSearch(i.id),
    }));
  const searchRecipeRows = !searchQ ? [] : decoratedRecipes
    .filter((r) =>
      r.name.toLowerCase().includes(searchQ) ||
      (r.ingredients || []).some((ing) => (ing.name || ing.text || '').toLowerCase().includes(searchQ))
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({
      id: r.id, name: r.name, dotColor: accent,
      meta: r.readyLabel, metaColor: muted,
      hasBadge: false, badgeText: '', badgeStyle: null as { background: string; color: string } | null,
      onOpen: openRecipe('search')(r.id),
    }));

  // ---------- item detail ----------
  const selectedItem = decorated.find((i) => i.id === st.selectedItemId) || null;
  const statusStyle = (isActive: boolean, color: string) => (isActive ? { background: hexToRgba(color, 0.18), color } : { background: section, color: muted });
  const statusOptionDefs = [
    { key: 'ok' as const, label: 'In Stock', color: STATUS_COLORS.ok },
    { key: 'low' as const, label: 'Running Low', color: STATUS_COLORS.low },
    { key: 'out' as const, label: 'Out of Stock', color: STATUS_COLORS.out },
    { key: 'buy-now' as const, label: 'Buy Now', color: STATUS_COLORS['buy-now'] },
    { key: 'skip' as const, label: 'Skip', color: STATUS_COLORS.skip },
  ];

  // ---------- add step chips ----------
  const draft = st.addDraft;
  const itemCategoryDefs = knownItemCategories(kitchen.items);
  const categoryDefsWithDraft = draft.category && !itemCategoryDefs.some((c) => normCategory(c.id) === normCategory(draft.category))
    ? [...itemCategoryDefs, categoryMeta(draft.category)]
    : itemCategoryDefs;
  const categoryChips = categoryDefsWithDraft.map((c) => ({ id: c.id, label: c.label, style: chipStyle(normCategory(draft.category) === normCategory(c.id), c.color), onClick: pickCategory(c.id) }));
  const locationChips = allLocations.map((l) => ({ id: l.id, label: l.label, style: neutralChipStyle(draft.location === l.id), onClick: pickLocation(l.id) }));
  const binChipsArr = knownPantryBins(kitchen.items).map((b) => ({ label: b, style: neutralChipStyle(normBin(draft.bin) === normBin(b)), onClick: pickBin(b) }));
  const storeChipsArr = STORES.map((s) => ({ id: s.id, label: s.label, style: neutralChipStyle(draft.store === s.id), onClick: pickStore(s.id) }));
  const unitChipsArr = UNITS.map((u) => ({ label: u, style: neutralChipStyle(draft.unit === u), onClick: pickUnit(u) }));
  const receiptStoreChips = STORES.map((s) => ({ id: s.id, label: s.label, style: neutralChipStyle(st.receiptStore === s.id), onClick: () => patch({ receiptStore: s.id }) }));

  const NAV_SCREENS: Screen[] = ['home', 'grocery', 'recipes', 'plan', 'location', 'pantryBin', 'sortBucket', 'expiring', 'itemDetail'];
  const showNav = kitchen.status !== 'connecting' && NAV_SCREENS.includes(st.screen);
  const receiptIncludedCount = st.receiptDraftItems.filter((i) => i.include).length;

  // Screens with a Back/Cancel link — a rightward swipe runs the same handler.
  // Tab roots are absent, so swipe-back is disabled there.
  const swipeBackHandlers: Partial<Record<Screen, () => void>> = {
    location: backToHome,
    pantryBin: backToPantry,
    sortBucket: backToHome,
    expiring: backToHome,
    itemDetail: closeItemDetail,
    add1: cancelAdd,
    receiptScan: backToAdd1FromReceipt,
    receiptReview: cancelReceiptReview,
    add2: backToAdd1,
    add3: backToAdd2,
    recipeDetail: closeRecipeDetail,
    recipeAdd1: cancelRecipeAdd,
    recipeAdd2: backToRecipeAdd1,
    recipeAdd3: backToRecipeAdd2,
    search: closeSearch,
    planAdd: cancelPlanAdd,
    cookConfirm: cancelCook,
  };
  const swipeBackHandler: (() => void) | null = swipeBackHandlers[st.screen] ?? null;

  const swipeBackTargets: Partial<Record<Screen, Screen>> = {
    location: 'home',
    pantryBin: 'location',
    sortBucket: 'home',
    expiring: 'home',
    itemDetail: st.itemDetailReturnTo,
    add1: st.addReturnScreen,
    receiptScan: 'add1',
    receiptReview: st.addReturnScreen,
    add2: 'add1',
    add3: 'add2',
    recipeDetail: st.recipeDetailReturnTo,
    recipeAdd1: st.editingRecipeId ? 'recipeDetail' : 'recipes',
    recipeAdd2: 'recipeAdd1',
    recipeAdd3: 'recipeAdd2',
    search: st.searchReturnScreen,
    planAdd: 'recipes',
    cookConfirm: 'plan',
  };
  const swipeBackTarget: Screen | null = swipeBackHandler ? (swipeBackTargets[st.screen] ?? null) : null;

  const ingredientEditorRows = () => st.recipeIngredientDrafts.map((ing) => ({
    ingId: ing.ingId, name: ing.name, quantity: ing.quantity,
    amount: ing.amountText != null ? ing.amountText : (ing.amount != null ? String(ing.amount) : ''),
    summaryLine: [
      ing.category ? CATEGORY_MAP[ing.category].label : 'Uncategorized',
      ing.amount != null ? `${formatAmount(ing.amount)}${ing.unit && ing.unit !== 'count' ? ' ' + ing.unit : ''}` : (ing.quantity || null),
    ].filter(Boolean).join(' · '),
    catDot: ing.category ? CATEGORY_MAP[ing.category].color : '#a6a496',
    isExpanded: st.expandedRecipeIngredientId === ing.ingId,
    needsAmount: ing.trackable !== false && ing.amount == null,
    onToggleExpand: toggleIngredientExpand(ing.ingId),
    onNameChange: (e: ChangeEvent<HTMLInputElement>) => updateIngredientDraft(ing.ingId, { name: e.target.value }),
    onQuantityChange: (e: ChangeEvent<HTMLInputElement>) => updateIngredientDraft(ing.ingId, { quantity: e.target.value }),
    onAmountChange: setIngredientAmount(ing.ingId),
    unitChips: RECIPE_UNITS.map((u) => ({ label: u, style: neutralChipStyle((ing.unit || 'count') === u), onClick: pickIngredientUnit(ing.ingId, u) })),
    categoryChips: [{ id: null as string | null, label: 'None' }, ...CATEGORIES].map((c) => ({
      id: c.id, label: c.label,
      style: c.id === null ? neutralChipStyle(ing.category === null) : chipStyle(ing.category === c.id, (c as { color?: string }).color || '#000'),
      onClick: pickIngredientCategory(ing.ingId, c.id),
    })),
    onRemove: removeIngredientDraft(ing.ingId),
  }));

  const renderScreen = (s: Screen): ReactNode => {
    switch (s) {
      case 'home':
        return (
          <HomeScreen
            totalItems={kitchen.items.length}
            locationCount={allLocations.length}
            dbStatus={kitchen.status}
            restockCount={restockCount}
            expiringSoonCount={expiringSoonCount}
            goGrocery={goGrocery}
            onExpiring={openExpiring}
            onSearch={openSearch}
            locationCards={homeLocationCards}
            onAddLocation={addStorageLocation}
            toSortCount={toSortItems.length} onOpenToSort={openToSort}
          />
        );
      case 'expiring':
        return (
          <LocationScreen
            label="Expiring Soon"
            count={expiringSections.reduce((n, sec) => n + sec.rows.length, 0)}
            showFilters={false}
            filterChips={[]}
            sections={expiringSections}
            onBack={backToHome}
          />
        );
      case 'sortBucket':
        return (
          <SortBucketScreen
            rows={toSortItems.map((i) => ({
              id: i.id, name: i.name, dotColor: i.catDot,
              meta: i.sortReason === 'new' ? 'New — choose where it goes' : 'Restocked — update the amount on hand',
              metaColor: muted,
              hasBadge: false, badgeText: '', badgeStyle: null as { background: string; color: string } | null,
              onOpen: openItem('sortBucket')(i.id),
            }))}
            onBack={backToHome}
          />
        );
      case 'location':
        return currentLocationIsPantry ? (
          <PantryBinsScreen
            label={locationMeta(currentLocationId, allLocations).label}
            count={pantryStats.count}
            cards={pantryBinCards}
            onBack={backToHome}
            onRename={renameLocation(currentLocationId)}
          />
        ) : (
          <LocationScreen
            label={locationMeta(currentLocationId, allLocations).label}
            count={placedDecorated.filter((i) => i.location === currentLocationId).length}
            showFilters={!currentLocationIsPantry}
            filterChips={filterChips}
            sections={locationSections}
            onBack={backToHome}
            onRename={renameLocation(currentLocationId)}
          />
        );
      case 'pantryBin':
        return (
          <LocationScreen
            label={pantryBinLabel}
            count={pantryBinCount}
            showFilters={false}
            filterChips={[]}
            sections={pantryBinSections}
            onBack={backToPantry}
            onRename={pantryBinIsAll ? undefined : renamePantryBin}
          />
        );
      case 'itemDetail': {
        if (!selectedItem) return null;
        const si = selectedItem;
        const binNames = dedupeBins(['Unsorted', ...knownPantryBins(kitchen.items), si.bin]);
        return (
          <ItemDetailScreen
            key={si.id}
            item={si}
            statusOptions={statusOptionDefs.map((o) => ({ label: o.label, style: statusStyle(si.status === o.key, o.color), onClick: setStatus(o.key) }))}
            locationOptions={allLocations.map((l) => ({ label: l.label, style: chipStyle(si.location === l.id, l.color), onClick: setItemLocation(l.id) }))}
            isPantry={si.location === 'pantry'}
            binOptions={binNames.map((b) => ({ label: b, style: neutralChipStyle(normBin(si.bin) === normBin(b)), onClick: setItemBin(b) }))}
            unitOptions={UNITS.map((u) => ({ label: u, style: neutralChipStyle((si.unit || 'count') === u), onClick: setItemUnit(u) }))}
            onQtyCommit={commitItemQty}
            onRename={(v) => kitchen.updateItem(si.id, { name: v })}
            onClose={closeItemDetail}
            onRemove={removeItemHandler}
            needsSorting={si.needsSorting}
            sortReason={si.sortReason}
            onMarkSorted={markItemSorted}
          />
        );
      }
      case 'add1':
        return (
          <Add1Screen
            onCancel={cancelAdd}
            onTakePhoto={takePhoto}
            photoLoading={st.addPhotoStatus === 'loading'}
            onStartReceiptScan={startReceiptScan}
            onEnterManually={enterManually}
          />
        );
      case 'receiptScan':
        return (
          <ReceiptScanScreen
            status={st.receiptStatus}
            errorText={st.receiptErrorText}
            onCancel={backToAdd1FromReceipt}
            onFileChange={onReceiptFileChange}
            onEnterManually={enterManuallyFromReceipt}
          />
        );
      case 'receiptReview':
        return (
          <ReceiptReviewScreen
            items={st.receiptDraftItems}
            includedCount={receiptIncludedCount}
            storeChips={receiptStoreChips}
            expandedId={st.expandedReceiptItemId}
            onCancel={cancelReceiptReview}
            onToggleExpand={toggleReceiptExpand}
            onToggleInclude={toggleReceiptInclude}
            onNameChange={(tempId) => (e: ChangeEvent<HTMLInputElement>) => updateReceiptItem(tempId, { name: e.target.value })}
            onBinChange={(tempId) => (e: ChangeEvent<HTMLInputElement>) => updateReceiptItem(tempId, { bin: e.target.value })}
            onDateChange={(tempId) => (e: ChangeEvent<HTMLInputElement>) => updateReceiptItem(tempId, { date: e.target.value })}
            onToggleSkipDate={toggleReceiptSkipDate}
            onRemove={removeReceiptItemHandler}
            pickCategory={pickReceiptCategory}
            pickLocation={pickReceiptLocation}
            locations={allLocations}
            onSubmit={addReceiptItems}
            submitDisabled={receiptIncludedCount === 0}
          />
        );
      case 'add2':
        return (
          <Add2Screen
            hasPhoto={false}
            name={draft.name} onNameChange={setDraftName}
            categoryChips={categoryChips}
            onAddCategory={addItemCategory}
            onBack={backToAdd1} onContinue={goToAdd3}
          />
        );
      case 'add3':
        return (
          <Add3Screen
            locationChips={locationChips}
            isPantry={draft.location === 'pantry'}
            bin={draft.bin} onBinChange={setDraftBin} binChips={binChipsArr}
            storeChips={storeChipsArr}
            qty={draft.qty} onQtyChange={setDraftQty} unitChips={unitChipsArr}
            dateHeading={draft.dateType === 'consume-by' ? 'Consume By' : 'Expiry Date'}
            showDateInput={!draft.skipDate} date={draft.date} onDateChange={setDraftDate}
            skipDate={draft.skipDate} onToggleSkipDate={toggleSkipDate}
            onBack={backToAdd2} onSave={saveItem}
          />
        );
      case 'search':
        return (
          <SearchScreen
            query={st.searchQuery}
            onQueryChange={setSearchQuery}
            onClear={clearSearchQuery}
            onClose={closeSearch}
            itemRows={searchItemRows}
            recipeRows={searchRecipeRows}
          />
        );
      case 'grocery':
        return (
          <GroceryScreen
            countLabel={`${groceryTotal} item${groceryTotal === 1 ? '' : 's'} needed`}
            storeFilterChips={storeFilterChips}
            manualDraft={st.manualDraft} onManualDraftChange={setManualDraft} onAddManual={addManualItem}
            sections={grocerySections}
            empty={groceryTotal === 0}
          />
        );
      case 'plan':
        return (
          <PlanScreen
            view={st.planView}
            onSetView={setPlanView}
            weekLabel={weekRangeLabel(weekStart)}
            days={weekDayIsos.map((iso) => ({
              iso, ...dayLabel(iso), isToday: iso === todayIso,
              entries: (planEntriesByDate[iso] || []).map((e) => ({
                id: e.id, name: e.recipeName, servings: e.servings, ready: e.ready, cooked: e.cooked, meal: e.meal,
                onInc: setPlanServings(e.id, 1, e.servings), onDec: setPlanServings(e.id, -1, e.servings),
                onRemove: removePlanEntry(e.id),
                onOpen: openRecipe('plan')(e.recipeId),
                onCook: e.cooked ? null : startCook(e.id),
                onUndoCook: e.cooked && e.canUndoCook && e.preparedId ? undoCookEntry(e.preparedId) : null,
              })),
            }))}
            hasAnyEntries={kitchen.mealPlanEntries.length > 0}
            shopWeekActive={shopWeekActive}
            onToggleShop={setShopWeek}
            onPrevWeek={() => changeWeek(-1)}
            onNextWeek={() => changeWeek(1)}
            needRows={groceryPlanRows.map((r) => ({ id: r.id, text: r.name, sub: r.meta || '' }))}
            onGoGrocery={goGrocery}
            onGoRecipes={goPickRecipesForPlan}
            fridge={preparedActive.map((x) => ({
              id: x.p.id, name: x.p.name, madeOn: x.p.madeOn, servingsLeft: x.left, servingsMade: x.p.servingsMade,
              useBy: x.p.useBy || '', fresh: x.fresh, hasEaten: (x.p.eaten || []).length > 0,
              onEat1: eatServing(x.p.id, 1), onEat2: eatServing(x.p.id, 2), onUndoEat: undoLastEat(x.p.id),
              onUseByChange: setPreparedUseBy(x.p.id),
            }))}
            eatenThisWeek={eatenThisWeek}
          />
        );
      case 'cookConfirm':
        return (
          <CookConfirmScreen
            name={cookRecipeObj ? cookRecipeObj.name : 'Recipe'}
            servings={cookEntry ? cookEntry.servings : 0}
            effects={cookPlan.effects.map((x) => ({ label: x.label, itemName: x.itemName, fromText: x.fromText, toText: x.toText }))}
            unmatched={cookPlan.unmatched}
            onCancel={cancelCook}
            onConfirm={confirmCook}
          />
        );
      case 'planAdd': {
        const totalEntries = planBatchEntries().length;
        return (
          <PlanAddScreen
            rows={st.planBatch.map((b) => {
              const r = kitchen.recipes.find((x) => x.id === b.recipeId);
              return {
                recipeId: b.recipeId, name: r ? r.name : 'Recipe', servings: b.servings, dayCount: b.dates.length,
                dayChips: planDayChoices.map((iso) => {
                  const dl = dayLabel(iso);
                  return { label: `${dl.weekday} ${dl.day}`, active: b.dates.includes(iso), onClick: () => togglePlanBatchDay(b.recipeId, iso) };
                }),
                mealChips: MEAL_SLOTS.map((m) => ({ label: m.label, active: b.meal === m.id, onClick: () => setPlanBatchMeal(b.recipeId, m.id) })),
                onServings: (e: ChangeEvent<HTMLInputElement>) => updatePlanBatchRow(b.recipeId, { servings: e.target.value }),
              };
            })}
            totalEntries={totalEntries}
            onCancel={cancelPlanAdd}
            onConfirm={commitPlan}
          />
        );
      }
      case 'planReview':
        return (
          <RecipeAdd2Screen
            title={`Amounts for ${st.recipeNameDraft}`}
            subtitle={
              st.planReviewQueue.length > 1
                ? `Confirm amounts so this can be shopped for. ${st.planReviewQueue.length - 1} more recipe${st.planReviewQueue.length > 2 ? 's' : ''} after this.`
                : 'Confirm amounts so this recipe can be shopped for.'
            }
            loading={st.recipeParseStatus === 'loading'}
            rows={ingredientEditorRows()}
            onAddBlank={addBlankIngredient}
            onBack={skipPlanReview}
            backLabel="Skip"
            onContinue={savePlanReviewAndAdvance}
            continueLabel={st.planReviewQueue.length > 1 ? 'Next recipe' : 'Add to plan'}
            continueDisabled={false}
          />
        );
      case 'recipes':
        return st.recipeCatFilter === null ? (
          <RecipeCategoriesScreen
            total={kitchen.recipes.length}
            readyCount={decoratedRecipes.filter((r) => r.readiness.ready).length}
            cards={catCards}
            onOpen={openRecipeCat}
            onAdd={startAddRecipe}
          />
        ) : (
          <RecipesScreen
            title={recipeCatLabel}
            onBack={backToRecipeCats}
            recipes={filteredRecipes.map((r) => ({
              id: r.id, name: r.name, hasPhoto: !!r.photoDataUrl, photoDataUrl: r.photoDataUrl || '',
              readyLabel: r.readyLabel,
              readyBadgeStyle: r.readiness.ready ? { background: hexToRgba('#4d7a1e', 0.16), color: '#3d6218' } : { background: section, color: muted },
              selected: st.recipeSelection.includes(r.id),
              onToggleSelect: toggleRecipeSelected(r.id),
              onOpen: openRecipe('recipes')(r.id),
            }))}
            selectMode={st.recipeSelectMode}
            selectionCount={st.recipeSelection.length}
            onToggleSelectMode={toggleRecipeSelectMode}
            onAddSelectedToPlan={startAddToPlan}
            filteredEmpty={filteredRecipes.length === 0}
            onAdd={startAddRecipe}
          />
        );
      case 'recipeDetail':
        return selectedRecipe ? (
          <RecipeDetailScreen
            recipe={selectedRecipe}
            ingredientRows={(selectedRecipe.ingredients || []).map((ing) => {
              const m = matchIngredient(ing, kitchen.items);
              let statusText: string; let statusColor: string;
              if (m.alwaysHave) { statusText = 'Always on hand'; statusColor = muted; }
              else if (m.has) { statusText = 'In stock'; statusColor = '#3d6218'; }
              else if (m.matchedItem) { statusText = ({ low: 'Low', out: 'Out', 'buy-now': 'Buy Now', skip: 'Skip' } as Record<string, string>)[m.matchedItem.status] || 'Not enough'; statusColor = errorColor; }
              else { statusText = 'Not in pantry'; statusColor = errorColor; }
              const amt = ing.quantity || (ing.amount != null ? `${formatAmount(ing.amount)}${ing.unit && ing.unit !== 'count' ? ' ' + ing.unit : ''}` : '');
              return { ingId: ing.ingId, text: titleCaseWords(ing.name) + (amt ? ' — ' + amt : ''), statusText, statusColor, dotColor: (m.has || m.alwaysHave) ? '#3d6218' : errorColor };
            })}
            currentCategory={selectedRecipe.category || null}
            categoryChips={knownRecipeCategories(kitchen.recipes).map((c) => ({ label: c, active: normCat(selectedRecipe.category) === normCat(c), onClick: setDetailRecipeCategory(c) }))}
            onAddCategory={addDetailRecipeCategory}
            onClose={closeRecipeDetail}
            onEdit={startEditRecipe}
            onDelete={deleteRecipeHandler}
          />
        ) : null;
      case 'recipeAdd1':
        return (
          <RecipeAdd1Screen
            title={st.editingRecipeId ? 'Edit Recipe' : 'Add a Recipe'}
            url={st.recipeUrlDraft} onUrlChange={setRecipeUrlDraft} onImport={importRecipeFromUrl}
            importLoading={st.recipeImportStatus === 'loading'} importError={st.recipeImportError}
            name={st.recipeNameDraft} onNameChange={setRecipeNameDraft}
            servings={st.recipeServingsDraft} onServingsChange={setRecipeServingsDraft}
            ingredientText={st.recipeIngredientTextDraft} onIngredientTextChange={setRecipeIngredientTextDraft}
            instructions={st.recipeInstructionsDraft} onInstructionsChange={setRecipeInstructionsDraft}
            parseLoading={st.recipeParseStatus === 'loading'}
            parseProblem={st.recipeParseStatus === 'error' || st.recipeParseStatus === 'unavailable'}
            parseErrorText={st.recipeParseErrorText}
            onCancel={cancelRecipeAdd}
            onContinue={parseRecipeIngredients}
            onSkipManual={skipToManualIngredients}
          />
        );
      case 'recipeAdd2':
        return (
          <RecipeAdd2Screen
            title="Review Ingredients"
            subtitle="Tap any ingredient to fix its name, amount, or category before saving."
            loading={false}
            rows={ingredientEditorRows()}
            onAddBlank={addBlankIngredient}
            onBack={backToRecipeAdd1}
            backLabel="Back"
            onContinue={goToRecipeAdd3}
            continueLabel="Continue"
            continueDisabled={st.recipeIngredientDrafts.length === 0}
          />
        );
      case 'recipeAdd3':
        return (
          <RecipeAdd3Screen
            hasPhoto={!!st.recipePhotoDataUrl}
            photoDataUrl={st.recipePhotoDataUrl}
            photoLoading={st.recipePhotoStatus === 'loading'}
            onPhotoChange={onRecipePhotoChange}
            onRemovePhoto={removeRecipePhoto}
            categoryDraft={st.recipeCategoryDraft}
            categoryChips={knownRecipeCategories(kitchen.recipes).map((c) => ({ label: c, active: normCat(st.recipeCategoryDraft) === normCat(c), onClick: pickRecipeCategoryDraft(c) }))}
            onCategoryTextChange={setRecipeCategoryDraft}
            onBack={backToRecipeAdd2}
            onSave={saveRecipe}
            saveLabel={st.recipeSaveStatus === 'loading' ? 'Estimating nutrition…' : (st.editingRecipeId ? 'Save Changes' : 'Save Recipe')}
            saveDisabled={st.recipeSaveStatus === 'loading'}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-white" style={{ color: text }}>
      <div className="flex-1 min-h-0 relative">
        {kitchen.status === 'connecting' ? (
          <LoadingOverlay solid icon="fridge" title="Kit'in" label="Loading your kitchen…" />
        ) : (
          <SwipeBack
            enabled={swipeBackHandler !== null}
            onBack={swipeBackHandler ?? (() => {})}
            back={swipeBackTarget ? renderScreen(swipeBackTarget) : null}
            screenKey={st.screen}
          >
            <PullToRefresh onRefresh={kitchen.refresh}>
              {renderScreen(st.screen)}
            </PullToRefresh>
          </SwipeBack>
        )}
      </div>

      {showNav && (
        <BottomNav
          activeTab={st.tab}
          onHome={goHomeTab} onRecipes={goRecipesTab} onPlan={goPlanTab} onGrocery={goGroceryTab}
          addVariant={st.screen === 'plan' ? 'plan' : 'item'}
          onAdd={st.screen === 'plan' ? goPickRecipesForPlan : startAdd}
        />
      )}
    </div>
  );
}

// ============================================================
// Screens
// ============================================================

function HomeScreen(props: {
  totalItems: number; locationCount: number; dbStatus: string; restockCount: number; expiringSoonCount: number; goGrocery: () => void; onExpiring: () => void; onSearch: () => void;
  locationCards: { id: string; label: string; color: string; icon: 'box' | 'fridge' | 'snow'; count: number; alerts: number; onOpen: () => void }[];
  onAddLocation: (name: string) => void;
  toSortCount: number; onOpenToSort: () => void;
}) {
  const { totalItems, locationCount, dbStatus, restockCount, expiringSoonCount, goGrocery, onExpiring, onSearch, locationCards, onAddLocation, toSortCount, onOpenToSort } = props;
  const showSyncBanner = dbStatus === 'unavailable' || dbStatus === 'error';
  const [locOpen, setLocOpen] = useState(false);
  const [newLoc, setNewLoc] = useState('');
  const addLoc = () => { if (!newLoc.trim()) return; onAddLocation(newLoc); setNewLoc(''); setLocOpen(false); };
  return (
    <div className="noscroll absolute inset-0 overflow-y-auto px-5 pt-6 pb-[100px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: accent }}>Kitchen Inventory</div>
          <div className="text-[26px] font-extrabold mt-1" style={{ color: text }}>Our Kitchen</div>
          <div className="text-sm mt-1" style={{ color: muted }}>{totalItems} items across {locationCount} location{locationCount === 1 ? '' : 's'}</div>
        </div>
        <button onClick={onSearch} aria-label="Search" className="shrink-0 mt-1 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: section }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        </button>
      </div>

      {showSyncBanner && (
        <div className="mt-3.5 px-3.5 py-2.5 rounded-xl text-[12.5px] font-semibold" style={{ background: section, border: `1.5px solid ${border}`, color: muted }}>
          {dbStatus === 'unavailable' ? "Working offline — changes here won't be saved." : 'Having trouble saving right now — your changes may not stick.'}
        </div>
      )}

      {(restockCount > 0 || expiringSoonCount > 0) && (
        <div className="flex gap-2.5 mt-5">
          {restockCount > 0 && (
            <div onClick={goGrocery} className="flex-1 rounded-2xl p-4 cursor-pointer" style={{ background: card, border: `1.5px solid ${border}` }}>
              <div className="text-[22px] font-extrabold" style={{ color: accent }}>{restockCount}</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: muted }}>to restock</div>
            </div>
          )}
          {expiringSoonCount > 0 && (
            <div onClick={onExpiring} className="flex-1 rounded-2xl p-4 cursor-pointer" style={{ background: card, border: `1.5px solid ${border}` }}>
              <div className="text-[22px] font-extrabold" style={{ color: errorColor }}>{expiringSoonCount}</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: muted }}>expiring soon</div>
            </div>
          )}
        </div>
      )}

      {toSortCount > 0 && (
        <div onClick={onOpenToSort} className="flex items-center gap-3 mt-5 rounded-2xl p-4 cursor-pointer" style={{ background: accent }}>
          <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M6 12h12M10 17h4" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-bold text-white">To be sorted</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: 'rgba(255,255,255,0.8)' }}>{toSortCount} item{toSortCount === 1 ? '' : 's'} to place or update</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M9 5l7 7-7 7" /></svg>
        </div>
      )}

      <div className="flex items-center gap-2 mt-7 mb-3">
        <div className="text-[15px] font-bold" style={{ color: text }}>Storage</div>
        <button
          onClick={() => setLocOpen((v) => !v)}
          aria-label={locOpen ? 'Cancel new storage' : 'Add a storage location'}
          className="w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: locOpen ? accent : section }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={locOpen ? '#fff' : accent} strokeWidth="2.6" strokeLinecap="round" style={{ transform: locOpen ? 'rotate(45deg)' : 'none' }}><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
      {locOpen && (
        <div className="flex gap-2 mb-3">
          <input
            value={newLoc}
            autoFocus
            onChange={(e) => setNewLoc(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addLoc(); }}
            placeholder="e.g. Garage Shelf, Basement Freezer"
            className="flex-1 min-w-0 h-[42px] rounded-xl px-3.5 text-sm outline-none"
            style={{ border: `1.5px solid ${border}`, background: card, color: text }}
          />
          <button onClick={addLoc} disabled={!newLoc.trim()} className="shrink-0 px-4 h-[42px] rounded-xl text-white text-[13px] font-bold disabled:opacity-50" style={{ background: accent }}>Add</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {locationCards.map((c) => {
          const fg = onColor(c.color);
          return (
            <div key={c.id} onClick={c.onOpen} className="relative rounded-2xl p-4 cursor-pointer" style={{ background: c.color, border: '1px solid rgba(0,0,0,0.06)' }}>
              {c.alerts > 0 && (
                <div className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center" style={{ background: '#fff', color: errorColor }}>
                  {c.alerts}
                </div>
              )}
              <StorageIcon kind={c.icon} color={fg} />
              <div className="text-[15px] font-bold mt-2.5" style={{ color: fg }}>{c.label}</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: onColorMuted(c.color) }}>{c.count} item{c.count === 1 ? '' : 's'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StorageIcon({ kind, color = accent }: { kind: 'box' | 'fridge' | 'snow'; color?: string }) {
  if (kind === 'fridge') {
    return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M6 9h12M9 5.5v2M9 12v2" /></svg>;
  }
  if (kind === 'snow') {
    return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M5 7l14 10M19 7 5 17M3 12h18" /></svg>;
  }
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M12 4v16M9 8v.01M15 8v.01" /></svg>;
}

function RowCard({ row }: { row: { id: string; name: string; dotColor: string; meta?: string; metaColor?: string; hasBadge: boolean; badgeText: string; badgeStyle: { background: string; color: string } | null; onOpen?: () => void } }) {
  const bg = row.dotColor;
  const fg = onColor(bg);
  const fgMuted = onColorMuted(bg);
  return (
    <div onClick={row.onOpen} className="flex items-center gap-3 rounded-2xl px-3.5 py-3 mb-2 cursor-pointer" style={{ background: bg, border: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[19px] leading-none" style={{ background: 'rgba(255,255,255,0.55)' }}>
        <span aria-hidden>{itemEmoji(row.name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-semibold" style={{ color: fg }}>{row.name}</div>
        {row.meta && <div className="text-[12.5px] mt-0.5" style={{ color: fgMuted }}>{row.meta}</div>}
      </div>
      {row.hasBadge && (
        <div className="shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.92)', color: row.badgeStyle?.color || '#302a06' }}>{row.badgeText}</div>
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={fgMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M9 5l7 7-7 7" /></svg>
    </div>
  );
}

// A heading that can be renamed in place: tap the pencil to swap in an input.
function EditableTitle({ value, onSave, textClass, textStyle }: {
  value: string; onSave: (v: string) => void; textClass: string; textStyle?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    const commit = () => {
      const t = draft.trim();
      if (t && t !== value) onSave(t);
      setEditing(false);
    };
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={`${textClass} w-full rounded-lg px-2 py-0.5 outline-none`}
        style={{ ...textStyle, border: `1.5px solid ${border}`, background: card }}
      />
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className={textClass} style={textStyle}>{value}</div>
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        aria-label="Rename"
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: section }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </button>
    </div>
  );
}

// A little pressure cooker whistling off steam — our "working on it" animation.
function CookerLoader() {
  return (
    <svg width="78" height="78" viewBox="0 0 64 64" fill="none" aria-hidden>
      <g fill="#b7a89a">
        <ellipse className="ck-steam" cx="29" cy="13" rx="3" ry="4.2" />
        <ellipse className="ck-steam" style={{ animationDelay: '0.5s' }} cx="35" cy="13" rx="2.4" ry="3.4" />
        <ellipse className="ck-steam" style={{ animationDelay: '1s' }} cx="32" cy="12" rx="2" ry="3" />
      </g>
      <g className="ck-shake">
        <rect className="ck-rattle" x="29" y="15" width="6" height="8" rx="2" fill={accent} />
        <rect x="10.5" y="21" width="43" height="7.5" rx="3.75" fill="#f7e3e5" stroke={accent} strokeWidth="2.4" />
        <path d="M15 28.5 h34 v14 a6 6 0 0 1 -6 6 h-22 a6 6 0 0 1 -6 -6 z" fill="#f7e3e5" stroke={accent} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M10.5 32 q-4.5 0 -4.5 4.5 M53.5 32 q4.5 0 4.5 4.5" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// A fridge door swinging open and shut, with a little wobble — the app's boot loader.
function FridgeLoader() {
  return (
    <svg width="86" height="86" viewBox="0 0 64 64" fill="none" aria-hidden>
      <g className="fr-shake">
        {/* interior revealed as the door swings */}
        <rect x="17" y="6" width="30" height="52" rx="4" fill="#efe4d8" stroke={accent} strokeWidth="2.4" />
        <path d="M20 22 h24 M20 38 h24" stroke={accent} strokeWidth="1.6" strokeOpacity="0.4" strokeLinecap="round" />
        {/* the door */}
        <g className="fr-door">
          <rect x="17" y="6" width="30" height="52" rx="4" fill="#f7e3e5" stroke={accent} strokeWidth="2.4" />
          <path d="M17 26 h30" stroke={accent} strokeWidth="2.2" />
          <path d="M41 13 v9 M41 32 v13" stroke={accent} strokeWidth="2.6" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

// A magnifying glass roaming over an open book — used while an AI call reads a recipe.
function BookSearchLoader() {
  return (
    <svg width="84" height="84" viewBox="0 0 64 64" fill="none" aria-hidden>
      <g className="bk-bob">
        <path d="M32 15c-6-4-15-4-23-1v34c8-3 17-3 23 1 6-4 15-4 23-1V14c-8-3-17-3-23 1z" fill="#f7e3e5" stroke={accent} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M32 15v34" stroke={accent} strokeWidth="2.2" />
        <path d="M13 22h13M13 29h13M38 22h13M38 29h13" stroke={accent} strokeWidth="1.6" strokeOpacity="0.45" strokeLinecap="round" />
        <g className="bk-glass">
          <circle cx="33" cy="31" r="8" fill="rgba(255,255,255,0.55)" stroke={accent} strokeWidth="2.6" />
          <path d="M39 37l6 6" stroke={accent} strokeWidth="3.2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

function LoadingOverlay({ label, title, solid, icon }: { label: string; title?: string; solid?: boolean; icon?: 'cooker' | 'fridge' | 'book' }) {
  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 px-8 text-center"
      style={solid ? { background: '#fff' } : { background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
    >
      {icon === 'fridge' ? <FridgeLoader /> : icon === 'book' ? <BookSearchLoader /> : <CookerLoader />}
      {title && <div className="text-[22px] font-extrabold mt-1.5 tracking-tight" style={{ color: accent }}>{title}</div>}
      <div className="text-[13px] font-semibold" style={{ color: muted }}>{label}</div>
    </div>
  );
}

function LocationScreen(props: { label: string; count: number; showFilters: boolean; filterChips: { id: string | null; label: string; style: CSSProperties; onClick: () => void }[]; sections: Section[]; onBack: () => void; onRename?: (v: string) => void }) {
  const { label, count, showFilters, filterChips, sections, onBack, onRename } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-5 pb-3 shrink-0">
        <BackLink label="Back" onClick={onBack} />
        <div className="mt-2.5">
          {onRename
            ? <EditableTitle value={label} onSave={onRename} textClass="text-[24px] font-extrabold" textStyle={{ color: text }} />
            : <div className="text-[24px] font-extrabold" style={{ color: text }}>{label}</div>}
        </div>
        <div className="text-[13.5px] mt-0.5" style={{ color: muted }}>{count} items</div>
        {showFilters && (
          <div className="noscroll flex gap-2 mt-3.5 overflow-x-auto pb-0.5">
            {filterChips.map((c) => <Chip key={String(c.id)} label={c.label} style={c.style} onClick={c.onClick} />)}
          </div>
        )}
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-24">
        {sections.map((sec) => (
          <div key={sec.sectionTitle}>
            <div className="text-[12.5px] font-bold uppercase tracking-wide my-3.5" style={{ color: muted }}>{sec.sectionTitle}</div>
            {sec.rows.map((row) => <RowCard key={row.id} row={row} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function PantryBinsScreen(props: {
  label: string;
  count: number;
  cards: { key: string; label: string; count: number; alerts: number; onOpen: () => void }[];
  onBack: () => void;
  onRename: (v: string) => void;
}) {
  const { label, count, cards, onBack, onRename } = props;
  const binColor = LOCATION_MAP['pantry'].color;
  const fg = onColor(binColor);
  const fgMuted = onColorMuted(binColor);
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-5 pb-3 shrink-0">
        <BackLink label="Back" onClick={onBack} />
        <div className="mt-2.5">
          <EditableTitle value={label} onSave={onRename} textClass="text-[24px] font-extrabold" textStyle={{ color: text }} />
        </div>
        <div className="text-[13.5px] mt-0.5" style={{ color: muted }}>{count} items</div>
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-2 pb-24">
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.key} onClick={c.onOpen} className="relative rounded-2xl p-4 cursor-pointer" style={{ background: binColor, border: '1px solid rgba(0,0,0,0.06)' }}>
              {c.alerts > 0 && (
                <div className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center" style={{ background: '#fff', color: errorColor }}>
                  {c.alerts}
                </div>
              )}
              <div className="text-[15px] font-bold pr-6 leading-snug" style={{ color: fg }}>{c.label}</div>
              <div className="text-[12.5px] mt-1" style={{ color: fgMuted }}>{c.count} item{c.count === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SortBucketScreen(props: {
  rows: { id: string; name: string; dotColor: string; meta?: string; metaColor?: string; hasBadge: boolean; badgeText: string; badgeStyle: { background: string; color: string } | null; onOpen?: () => void }[];
  onBack: () => void;
}) {
  const { rows, onBack } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-5 pb-3 shrink-0">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[24px] font-extrabold mt-2.5" style={{ color: text }}>To be sorted</div>
        <div className="text-[13.5px] mt-0.5" style={{ color: muted }}>
          {rows.length === 0 ? 'Nothing waiting — all put away.' : `${rows.length} item${rows.length === 1 ? '' : 's'} bought but not placed yet`}
        </div>
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-24">
        {rows.length === 0 ? (
          <div className="text-center py-16 px-5 text-sm" style={{ color: muted }}>
            When you check something off the grocery list, it lands here so you can give it a spot and quantity.
          </div>
        ) : (
          rows.map((row) => <RowCard key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}

function ItemDetailScreen(props: {
  item: ReturnType<typeof decorateItem>;
  statusOptions: { label: string; style: CSSProperties; onClick: () => void }[];
  locationOptions: { label: string; style: CSSProperties; onClick: () => void }[];
  isPantry: boolean;
  binOptions: { label: string; style: CSSProperties; onClick: () => void }[];
  unitOptions: { label: string; style: CSSProperties; onClick: () => void }[];
  onQtyCommit: (raw: string) => void;
  onRename: (v: string) => void;
  onClose: () => void;
  onRemove: () => void;
  needsSorting: boolean;
  sortReason: 'new' | 'restocked' | null;
  onMarkSorted: () => void;
}) {
  const { item, statusOptions, locationOptions, isPantry, binOptions, unitOptions, onQtyCommit, onRename, onClose, onRemove, needsSorting, sortReason, onMarkSorted } = props;
  const [qtyDraft, setQtyDraft] = useState(item.quantity != null ? String(item.quantity) : '');
  const commitQty = () => { if (qtyDraft.trim() !== (item.quantity != null ? String(item.quantity) : '')) onQtyCommit(qtyDraft); };
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-24">
        <BackLink label="Back" onClick={onClose} />
        <div className="flex items-center gap-3.5 mt-4">
          <div className="shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-[34px] leading-none" style={{ background: section }}>
            <span aria-hidden>{itemEmoji(item.name, item.category)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <EditableTitle value={item.name} onSave={onRename} textClass="text-[21px] font-extrabold leading-tight" textStyle={{ color: text }} />
          </div>
        </div>
        {needsSorting && (
          <div className="mt-3 rounded-2xl p-3.5" style={{ background: hexToRgba(accent, 0.08), border: `1.5px solid ${hexToRgba(accent, 0.25)}` }}>
            <div className="text-[13px] font-bold" style={{ color: accent }}>
              {sortReason === 'new' ? 'New from your grocery run' : 'Just restocked'}
            </div>
            <div className="text-[12.5px] mt-1" style={{ color: muted }}>
              {sortReason === 'new'
                ? 'Set its category, location and amount, then mark it sorted.'
                : 'Update the amount on hand (and its spot if it moved), then mark it sorted.'}
            </div>
            <div onClick={onMarkSorted} className="mt-3 text-center py-2.5 rounded-xl text-[13px] font-bold text-white cursor-pointer" style={{ background: accent }}>
              Mark as sorted
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-2.5">
          <div className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: item.catColor, color: onColor(item.catColor), border: '1px solid rgba(0,0,0,0.06)' }}>{item.catLabel}</div>
          <div className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: item.locColor, color: onColor(item.locColor), border: '1px solid rgba(0,0,0,0.06)' }}>{item.fullLocationLabel}</div>
          {item.hasQty && <div className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: section, color: text }}>{item.qtyText}</div>}
          {item.hasStore && <div className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: section, color: text }}>{item.storeLabel}</div>}
        </div>
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Status</div>
        <div className="grid grid-cols-3 gap-2">
          {statusOptions.map((o) => (
            <div key={o.label} onClick={o.onClick} className="text-center px-1 py-2.5 rounded-xl text-[12.5px] font-semibold cursor-pointer" style={o.style}>{o.label}</div>
          ))}
        </div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Quantity</div>
        <input
          value={qtyDraft}
          onChange={(e) => setQtyDraft(e.target.value)}
          onBlur={commitQty}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          inputMode="decimal"
          placeholder="Amount on hand"
          className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none"
          style={{ border: `1.5px solid ${border}`, background: card, color: text }}
        />
        <div className="flex flex-wrap gap-2 mt-2.5">
          {unitOptions.map((o) => <Chip key={o.label} label={o.label} style={o.style} onClick={o.onClick} />)}
        </div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Location</div>
        <div className="flex flex-wrap gap-2">
          {locationOptions.map((o) => <Chip key={o.label} label={o.label} style={o.style} onClick={o.onClick} />)}
        </div>
        {isPantry && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Cupboard / Bin</div>
            <div className="flex flex-wrap gap-2">
              {binOptions.map((o) => <Chip key={o.label} label={o.label} style={o.style} onClick={o.onClick} />)}
            </div>
          </>
        )}

        {item.hasDate && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>{item.dateType === 'consume-by' ? 'Consume By' : 'Expiry'}</div>
            <div className="flex items-center gap-2.5 rounded-2xl p-3.5" style={{ background: card, border: `1.5px solid ${border}` }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={item.dateColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
              <div className="text-[14.5px] font-semibold" style={{ color: item.dateColor }}>{item.dateText}</div>
            </div>
          </>
        )}
        <div className="mt-8 flex justify-center">
          <button
            onClick={onRemove}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-[13.5px] font-bold text-white"
            style={{ background: errorColor, boxShadow: `0 2px 10px ${hexToRgba(errorColor, 0.35)}` }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></svg>
            Remove Item
          </button>
        </div>
      </div>
    </div>
  );
}

function Add1Screen(props: { onCancel: () => void; onTakePhoto: (e: ChangeEvent<HTMLInputElement>) => void; photoLoading: boolean; onStartReceiptScan: () => void; onEnterManually: () => void }) {
  const { onCancel, onTakePhoto, photoLoading, onStartReceiptScan, onEnterManually } = props;
  const cardClass = 'flex-1 min-h-0 rounded-[20px] flex flex-col items-center justify-center gap-2.5 cursor-pointer text-center px-4';
  const cardStyle: CSSProperties = { border: `2px dashed ${border}`, background: card };
  const iconWrap = 'w-16 h-16 rounded-full flex items-center justify-center shrink-0';
  return (
    <div className="absolute inset-0 flex flex-col px-5 pt-5 pb-6">
      <BackLink label="Cancel" onClick={onCancel} />
      <div className="text-[24px] font-extrabold mt-3.5" style={{ color: text }}>Add New Item</div>
      <div className="text-[13.5px] mt-1" style={{ color: muted }}>Pick how you&apos;d like to add it.</div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 mt-5">
        <label className={cardClass} style={cardStyle}>
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onTakePhoto} />
          <div className={iconWrap} style={{ background: '#f7e3e5' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></svg>
          </div>
          <div className="text-[14.5px] font-semibold" style={{ color: text }}>{photoLoading ? 'Identifying…' : 'Take a photo'}</div>
          <div className="text-[12px]" style={{ color: muted }}>Claude identifies the item for you</div>
        </label>

        <div onClick={onStartReceiptScan} className={cardClass} style={cardStyle}>
          <div className={iconWrap} style={{ background: '#f7e3e5' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4V3z" /><path d="M9 8h6M9 12h6" /></svg>
          </div>
          <div className="text-[14.5px] font-semibold" style={{ color: text }}>Scan a grocery receipt</div>
          <div className="text-[12px]" style={{ color: muted }}>Pull items from a photo of your bill</div>
        </div>

        <div onClick={onEnterManually} className={cardClass} style={cardStyle}>
          <div className={iconWrap} style={{ background: '#f7e3e5' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15.5V20h4.5L20 8.5 15.5 4 4 15.5z" /><path d="M13.5 6l4.5 4.5" /></svg>
          </div>
          <div className="text-[14.5px] font-semibold" style={{ color: text }}>Enter details manually</div>
          <div className="text-[12px]" style={{ color: muted }}>Type the name and details yourself</div>
        </div>
      </div>
    </div>
  );
}

function ReceiptScanScreen(props: { status: string; errorText: string; onCancel: () => void; onFileChange: (e: ChangeEvent<HTMLInputElement>) => void; onEnterManually: () => void }) {
  const { status, errorText, onCancel, onFileChange, onEnterManually } = props;
  return (
    <div className="absolute inset-0 flex flex-col px-5 pt-5 pb-6">
      <BackLink label="Cancel" onClick={onCancel} />
      <div className="text-[24px] font-extrabold mt-3.5" style={{ color: text }}>Scan a Receipt</div>
      <div className="text-[13.5px] mt-1" style={{ color: muted }}>Upload a photo of your grocery bill and we&apos;ll pull out the items for you to review.</div>

      {status === 'idle' && (
        <label className="mt-6 flex-1 rounded-[20px] flex flex-col items-center justify-center gap-2.5 cursor-pointer" style={{ border: `2px dashed ${border}`, background: card }}>
          <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: '#f7e3e5' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13M7 11l5 5 5-5" /><path d="M4 18v1.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V18" /></svg>
          </div>
          <div className="text-[14.5px] font-semibold" style={{ color: text }}>Tap to upload a receipt photo</div>
          <div className="text-[12.5px]" style={{ color: muted }}>JPG or PNG</div>
        </label>
      )}
      {status === 'loading' && (
        <div className="mt-6 flex-1 rounded-[20px] flex flex-col items-center justify-center gap-3" style={{ border: `2px dashed ${border}`, background: card }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse" style={{ background: '#f7e3e5' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4a8 8 0 1 0 8 8" /></svg>
          </div>
          <div className="text-[14.5px] font-semibold" style={{ color: text }}>Reading your receipt…</div>
          <div className="text-[12.5px]" style={{ color: muted }}>This can take up to a minute.</div>
        </div>
      )}
      {(status === 'error' || status === 'unavailable') && (
        <div className="mt-6 flex-1 rounded-[20px] flex flex-col items-center justify-center gap-3 p-6" style={{ border: `1.5px solid ${border}`, background: card }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#f7e3e5' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={errorColor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v5M12 16v.01" /><circle cx="12" cy="12" r="9" /></svg>
          </div>
          <div className="text-sm font-semibold text-center" style={{ color: text }}>{errorText}</div>
          {status === 'error' && (
            <label className="mt-1 px-5 py-2.5 rounded-xl text-white text-[13.5px] font-bold cursor-pointer" style={{ background: accent }}>
              Try Again
              <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            </label>
          )}
        </div>
      )}
      <div onClick={onEnterManually} className="mt-4 text-center text-[13.5px] font-semibold cursor-pointer" style={{ color: accent }}>Enter details manually instead</div>
    </div>
  );
}

function ReceiptReviewScreen(props: {
  items: ReceiptDraftItem[]; includedCount: number;
  storeChips: { id: string; label: string; style: CSSProperties; onClick: () => void }[];
  expandedId: string | null;
  onCancel: () => void; onToggleExpand: (id: string) => () => void; onToggleInclude: (id: string) => () => void;
  onNameChange: (id: string) => (e: ChangeEvent<HTMLInputElement>) => void;
  onBinChange: (id: string) => (e: ChangeEvent<HTMLInputElement>) => void;
  onDateChange: (id: string) => (e: ChangeEvent<HTMLInputElement>) => void;
  onToggleSkipDate: (id: string) => () => void; onRemove: (id: string) => () => void;
  pickCategory: (id: string, catId: string) => () => void; pickLocation: (id: string, locId: LocationId) => () => void;
  locations: LocationDef[];
  onSubmit: () => void; submitDisabled: boolean;
}) {
  const { items, includedCount, storeChips, expandedId, onCancel, onToggleExpand, onToggleInclude, onNameChange, onBinChange, onDateChange, onToggleSkipDate, onRemove, pickCategory, pickLocation, locations, onSubmit, submitDisabled } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Cancel" onClick={onCancel} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Review Items</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>We found {items.length} item{items.length === 1 ? '' : 's'} — uncheck any that shouldn&apos;t be added.</div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Which store is this receipt from?</div>
        <div className="flex flex-wrap gap-2">{storeChips.map((c) => <Chip key={c.id} label={c.label} style={c.style} onClick={c.onClick} />)}</div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Items ({includedCount} of {items.length})</div>

        {items.map((it) => {
          const cat = categoryMeta(it.category);
          const loc = locationMeta(it.location, locations);
          const isExpanded = expandedId === it.tempId;
          return (
            <div key={it.tempId} className="rounded-2xl p-3.5 mb-2.5" style={{ background: card, border: `1.5px solid ${border}` }}>
              <div className="flex items-center gap-2.5">
                <input type="checkbox" checked={it.include} onChange={onToggleInclude(it.tempId)} className="w-[18px] h-[18px] shrink-0" />
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
                <div onClick={onToggleExpand(it.tempId)} className="flex-1 min-w-0 cursor-pointer">
                  <div className="text-[14.5px] font-semibold" style={{ color: text }}>{it.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: muted }}>{cat.label} · {loc.label}{it.quantity ? ' · ' + it.quantity : ''}</div>
                </div>
                <div onClick={onToggleExpand(it.tempId)} className="cursor-pointer shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a6a496" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </div>
              </div>
              {isExpanded && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${border}` }}>
                  <input value={it.name} onChange={onNameChange(it.tempId)} placeholder="Item name" className="w-full h-[42px] rounded-[10px] px-3 text-sm outline-none" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                  <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3.5 mb-1.5" style={{ color: muted }}>Category</div>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((c) => <Chip key={c.id} label={c.label} style={chipStyle(it.category === c.id, c.color)} onClick={pickCategory(it.tempId, c.id)} />)}
                  </div>
                  <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3.5 mb-1.5" style={{ color: muted }}>Where does this go?</div>
                  <div className="flex flex-wrap gap-1.5">
                    {locations.map((l) => <Chip key={l.id} label={l.label} style={neutralChipStyle(it.location === l.id)} onClick={pickLocation(it.tempId, l.id)} />)}
                  </div>
                  {it.location === 'pantry' && (
                    <input value={it.bin} onChange={onBinChange(it.tempId)} placeholder="Cupboard or bin (optional)" className="w-full h-[42px] rounded-[10px] px-3 text-sm outline-none mt-2.5" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                  )}
                  <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3.5 mb-1.5" style={{ color: muted }}>{it.dateType === 'consume-by' ? 'Consume By' : 'Expiry Date'}</div>
                  {!it.skipDate && (
                    <input type="date" value={it.date} onChange={onDateChange(it.tempId)} className="w-full h-[42px] rounded-[10px] px-3 text-sm outline-none" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                  )}
                  <div className="flex items-center gap-2 mt-2.5">
                    <input type="checkbox" checked={it.skipDate} onChange={onToggleSkipDate(it.tempId)} className="w-4 h-4" />
                    <div className="text-[13px]" style={{ color: text }}>No date needed</div>
                  </div>
                  <div onClick={onRemove(it.tempId)} className="mt-3.5 text-center text-[12.5px] font-semibold cursor-pointer" style={{ color: errorColor }}>Remove this item</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onSubmit} disabled={submitDisabled} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold disabled:opacity-50" style={{ background: accent }}>
          Add {includedCount} Item{includedCount === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

function Add2Screen(props: { hasPhoto: boolean; name: string; onNameChange: (e: ChangeEvent<HTMLInputElement>) => void; categoryChips: { id: string; label: string; style: CSSProperties; onClick: () => void }[]; onAddCategory: (name: string) => void; onBack: () => void; onContinue: () => void }) {
  const { hasPhoto, name, onNameChange, categoryChips, onAddCategory, onBack, onContinue } = props;
  const [newCat, setNewCat] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const addCat = () => { if (!newCat.trim()) return; onAddCategory(newCat); setNewCat(''); setCatOpen(false); };
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Confirm Details</div>
        {hasPhoto && <div className="inline-block mt-3.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#f7e3e5', color: accent }}>Detected automatically — edit if needed</div>}
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Item name</div>
        <input value={name} onChange={onNameChange} placeholder="e.g. Baby Spinach" className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
        <div className="flex items-center gap-2 mt-5 mb-2">
          <div className="text-[12.5px] font-bold uppercase tracking-wide" style={{ color: muted }}>Category</div>
          <button
            onClick={() => setCatOpen((v) => !v)}
            aria-label={catOpen ? 'Cancel new category' : 'Add a category'}
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: catOpen ? accent : section }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={catOpen ? '#fff' : accent} strokeWidth="2.6" strokeLinecap="round" style={{ transform: catOpen ? 'rotate(45deg)' : 'none' }}><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
        {catOpen && (
          <div className="flex gap-2 mb-2.5">
            <input
              value={newCat}
              autoFocus
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCat(); }}
              placeholder="New category…"
              className="flex-1 min-w-0 h-[42px] rounded-xl px-3.5 text-sm outline-none"
              style={{ border: `1.5px solid ${border}`, background: card, color: text }}
            />
            <button onClick={addCat} disabled={!newCat.trim()} className="shrink-0 px-4 h-[42px] rounded-xl text-white text-[13px] font-bold disabled:opacity-50" style={{ background: accent }}>Add</button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">{categoryChips.map((c) => <Chip key={c.id} label={c.label} style={c.style} onClick={c.onClick} />)}</div>
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onContinue} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold" style={{ background: accent }}>Continue</button>
      </div>
    </div>
  );
}

function Add3Screen(props: {
  locationChips: { id: string; label: string; style: CSSProperties; onClick: () => void }[]; isPantry: boolean;
  bin: string; onBinChange: (e: ChangeEvent<HTMLInputElement>) => void; binChips: { label: string; style: CSSProperties; onClick: () => void }[];
  storeChips: { id: string; label: string; style: CSSProperties; onClick: () => void }[];
  qty: string; onQtyChange: (e: ChangeEvent<HTMLInputElement>) => void; unitChips: { label: string; style: CSSProperties; onClick: () => void }[];
  dateHeading: string; showDateInput: boolean; date: string; onDateChange: (e: ChangeEvent<HTMLInputElement>) => void;
  skipDate: boolean; onToggleSkipDate: () => void; onBack: () => void; onSave: () => void;
}) {
  const { locationChips, isPantry, bin, onBinChange, binChips, storeChips, qty, onQtyChange, unitChips, dateHeading, showDateInput, date, onDateChange, skipDate, onToggleSkipDate, onBack, onSave } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Storage Details</div>
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Where does this go?</div>
        <div className="flex flex-wrap gap-2">{locationChips.map((c) => <Chip key={c.id} label={c.label} style={c.style} onClick={c.onClick} />)}</div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>How much? (optional)</div>
        <input value={qty} onChange={onQtyChange} inputMode="decimal" placeholder="e.g. 2" className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
        <div className="flex flex-wrap gap-2 mt-2.5">{unitChips.map((c) => <Chip key={c.label} label={c.label} style={c.style} onClick={c.onClick} />)}</div>

        {isPantry && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Which cupboard or bin?</div>
            <input value={bin} onChange={onBinChange} placeholder="e.g. Spice Drawer" className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
            <div className="flex flex-wrap gap-2 mt-2.5">{binChips.map((c) => <Chip key={c.label} label={c.label} style={c.style} onClick={c.onClick} />)}</div>
          </>
        )}
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Which store is this from?</div>
        <div className="flex flex-wrap gap-2">{storeChips.map((c) => <Chip key={c.id} label={c.label} style={c.style} onClick={c.onClick} />)}</div>
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>{dateHeading}</div>
        {showDateInput && <input type="date" value={date} onChange={onDateChange} className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />}
        <div className="flex items-center gap-2 mt-3">
          <input type="checkbox" checked={skipDate} onChange={onToggleSkipDate} className="w-[18px] h-[18px]" />
          <div className="text-[13.5px]" style={{ color: text }}>This item doesn&apos;t need a date</div>
        </div>
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onSave} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold" style={{ background: accent }}>Save Item</button>
      </div>
    </div>
  );
}

type SearchRow = { id: string; name: string; dotColor: string; meta?: string; metaColor?: string; hasBadge: boolean; badgeText: string; badgeStyle: { background: string; color: string } | null; onOpen?: () => void };

function SearchScreen(props: {
  query: string;
  onQueryChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onClose: () => void;
  itemRows: SearchRow[];
  recipeRows: SearchRow[];
}) {
  const { query, onQueryChange, onClear, onClose, itemRows, recipeRows } = props;
  const trimmed = query.trim();
  const totalCount = itemRows.length + recipeRows.length;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-5 pb-3 shrink-0">
        <BackLink label="Done" onClick={onClose} />
        <div className="text-[26px] font-extrabold mt-2" style={{ color: text }}>Search</div>
        <div className="flex items-center gap-2 mt-3.5 h-[46px] rounded-xl px-3.5" style={{ border: `1.5px solid ${border}`, background: card }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            value={query}
            onChange={onQueryChange}
            autoFocus
            placeholder="Search items and recipes…"
            className="flex-1 min-w-0 bg-transparent text-[15px] outline-none"
            style={{ color: text }}
          />
          {trimmed !== '' && (
            <div onClick={onClear} className="shrink-0 cursor-pointer" aria-label="Clear search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </div>
          )}
        </div>
        {trimmed !== '' && (
          <div className="text-[13px] mt-2.5" style={{ color: muted }}>{totalCount} match{totalCount === 1 ? '' : 'es'}</div>
        )}
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-[100px]">
        {trimmed === '' && (
          <div className="text-center py-16 px-5 text-sm" style={{ color: muted }}>Search your kitchen by item name, category, location, or recipe.</div>
        )}
        {trimmed !== '' && totalCount === 0 && (
          <div className="text-center py-16 px-5 text-sm" style={{ color: muted }}>No matches for &ldquo;{trimmed}&rdquo;.</div>
        )}
        {itemRows.length > 0 && (
          <div>
            <div className="text-[12.5px] font-bold uppercase tracking-wide my-3.5" style={{ color: muted }}>Items</div>
            {itemRows.map((row) => <RowCard key={row.id} row={row} />)}
          </div>
        )}
        {recipeRows.length > 0 && (
          <div>
            <div className="text-[12.5px] font-bold uppercase tracking-wide my-3.5" style={{ color: muted }}>Recipes</div>
            {recipeRows.map((row) => <RowCard key={row.id} row={row} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function GroceryScreen(props: {
  countLabel: string; storeFilterChips: { id: string | null; label: string; style: CSSProperties; onClick: () => void }[];
  manualDraft: string; onManualDraftChange: (e: ChangeEvent<HTMLInputElement>) => void; onAddManual: () => void;
  sections: Section[]; empty: boolean;
}) {
  const { countLabel, storeFilterChips, manualDraft, onManualDraftChange, onAddManual, sections, empty } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-6 pb-3 shrink-0">
        <div className="text-[26px] font-extrabold" style={{ color: text }}>Grocery List</div>
        <div className="text-sm mt-1" style={{ color: muted }}>{countLabel}</div>
        <div className="noscroll flex gap-2 mt-3.5 overflow-x-auto pb-0.5">
          {storeFilterChips.map((c) => <Chip key={String(c.id)} label={c.label} style={c.style} onClick={c.onClick} />)}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={manualDraft} onChange={onManualDraftChange} placeholder="Add an item…" className="flex-1 h-[42px] rounded-xl px-3.5 text-sm outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
          <button onClick={onAddManual} className="w-[42px] h-[42px] rounded-xl text-white flex items-center justify-center" style={{ background: accent }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-[100px]">
        {empty && <div className="text-center py-16 px-5 text-sm" style={{ color: muted }}>All stocked up — nothing needed right now.</div>}
        {sections.map((sec) => (
          <div key={sec.sectionTitle}>
            <div className="text-[12.5px] font-bold uppercase tracking-wide my-3.5" style={{ color: muted }}>{sec.sectionTitle}</div>
            {sec.rows.map((row) => {
              const bg = row.dotColor;
              const fg = onColor(bg);
              const fgMuted = onColorMuted(bg);
              return (
                <div key={row.id} className="flex items-center gap-3 rounded-2xl px-3.5 py-3 mb-2" style={{ background: bg, border: '1px solid rgba(0,0,0,0.06)' }}>
                  <div onClick={row.onCheck} className="shrink-0 w-6 h-6 rounded-full cursor-pointer" style={{ border: `2px solid ${fgMuted}` }} />
                  <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[19px] leading-none" style={{ background: 'rgba(255,255,255,0.55)' }}>
                    <span aria-hidden>{itemEmoji(row.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-semibold" style={{ color: fg }}>{row.name}</div>
                    {row.hasMeta && <div className="text-[12.5px] mt-0.5" style={{ color: fgMuted }}>{row.meta}</div>}
                  </div>
                  {row.hasBadge && <div className="shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.92)', color: row.badgeStyle?.color || '#302a06' }}>{row.badgeText}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipeCategoriesScreen(props: {
  total: number; readyCount: number;
  cards: { key: string; label: string; count: number }[];
  onOpen: (key: string) => () => void;
  onAdd: () => void;
}) {
  const { total, readyCount, cards, onOpen, onAdd } = props;
  const gridCards = [
    { key: '__all__', label: 'All Recipes', count: total },
    { key: '__ready__', label: 'Ready to Cook', count: readyCount },
    ...cards,
  ];
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-6 pb-3 shrink-0">
        <div className="text-[26px] font-extrabold" style={{ color: text }}>Recipes</div>
        <button onClick={onAdd} className="w-full h-11 mt-3.5 rounded-xl text-white text-[14.5px] font-bold flex items-center justify-center gap-1.5" style={{ background: accent }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Add Recipe
        </button>
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-2 pb-[100px]">
        {total === 0 ? (
          <div className="text-center py-16 px-5 text-sm" style={{ color: muted }}>No recipes yet — add the ones you cook at home.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {gridCards.map((c) => (
              <div key={c.key} onClick={onOpen(c.key)} className="relative rounded-2xl p-4 cursor-pointer" style={{ background: card, border: `1.5px solid ${border}` }}>
                <div className="text-[15px] font-bold pr-2 leading-snug" style={{ color: text }}>{c.label}</div>
                <div className="text-[12.5px] mt-1" style={{ color: muted }}>{c.count} recipe{c.count === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecipesScreen(props: {
  title: string; onBack: () => void;
  recipes: { id: string; name: string; hasPhoto: boolean; photoDataUrl: string; readyLabel: string; readyBadgeStyle: CSSProperties; selected: boolean; onToggleSelect: () => void; onOpen: () => void }[];
  selectMode: boolean; selectionCount: number; onToggleSelectMode: () => void; onAddSelectedToPlan: () => void;
  filteredEmpty: boolean; onAdd: () => void;
}) {
  const { title, onBack, recipes, selectMode, selectionCount, onToggleSelectMode, onAddSelectedToPlan, filteredEmpty, onAdd } = props;
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? recipes.filter((r) => r.name.toLowerCase().includes(q)) : recipes;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-5 pb-3 shrink-0">
        <BackLink label="Categories" onClick={onBack} />
        <div className="flex items-center justify-between mt-2">
          <div className="text-[24px] font-extrabold" style={{ color: text }}>{title}</div>
          <div onClick={onToggleSelectMode} className="text-[13.5px] font-bold cursor-pointer" style={{ color: accent }}>
            {selectMode ? 'Done' : 'Select'}
          </div>
        </div>
        {selectMode ? (
          <button onClick={onAddSelectedToPlan} disabled={selectionCount === 0} className="w-full h-11 mt-3 rounded-xl text-white text-[14.5px] font-bold disabled:opacity-50" style={{ background: accent }}>
            Add {selectionCount || ''} to meal plan
          </button>
        ) : (
          <button onClick={onAdd} className="w-full h-11 mt-3 rounded-xl text-white text-[14.5px] font-bold flex items-center justify-center gap-1.5" style={{ background: accent }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add Recipe
          </button>
        )}
        {!filteredEmpty && (
          <div className="flex items-center gap-2 mt-3 h-[42px] rounded-xl px-3.5" style={{ border: `1.5px solid ${border}`, background: card }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes…" className="flex-1 min-w-0 bg-transparent text-sm outline-none" style={{ color: text }} />
            {query && (
              <div onClick={() => setQuery('')} className="shrink-0 cursor-pointer" aria-label="Clear search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-[100px]">
        {filteredEmpty && <div className="text-center py-16 px-5 text-sm" style={{ color: muted }}>No recipes here yet.</div>}
        {!filteredEmpty && q && shown.length === 0 && <div className="text-center py-16 px-5 text-sm" style={{ color: muted }}>No recipes match &ldquo;{query.trim()}&rdquo;.</div>}
        {shown.map((r) => (
          <div
            key={r.id}
            onClick={selectMode ? r.onToggleSelect : r.onOpen}
            className="flex gap-3 rounded-2xl p-3 mb-2.5 cursor-pointer items-center"
            style={{ background: card, border: `1.5px solid ${r.selected ? accent : border}` }}
          >
            {selectMode && (
              <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ border: `2px solid ${r.selected ? accent : '#a6a496'}`, background: r.selected ? accent : 'transparent' }}>
                {r.selected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
              </div>
            )}
            <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden flex items-center justify-center" style={{ background: section }}>
              {r.hasPhoto ? <img src={r.photoDataUrl} alt="" className="w-full h-full object-cover" /> : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9a2 2 0 0 1 2 2v15l-6.5-3.5L4 20V5a2 2 0 0 1 2-2z" /></svg>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              <div className="text-[14.5px] font-semibold truncate" style={{ color: text }}>{r.name}</div>
              <div className="text-[11.5px] font-bold px-2 py-0.5 rounded-full inline-block w-fit" style={r.readyBadgeStyle}>{r.readyLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipeDetailScreen(props: {
  recipe: Recipe & { readiness: ReturnType<typeof recipeReadiness>; readyLabel: string };
  ingredientRows: { ingId: string; text: string; statusText: string; statusColor: string; dotColor: string }[];
  currentCategory: string | null;
  categoryChips: { label: string; active: boolean; onClick: () => void }[];
  onAddCategory: (name: string) => void;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { recipe, ingredientRows, currentCategory, categoryChips, onAddCategory, onClose, onEdit, onDelete } = props;
  const [newCat, setNewCat] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const hasServings = !!recipe.servings;
  const hasNutrition = !!(recipe.nutrition && Number.isFinite(recipe.nutrition.calories));
  const needsServings = !hasNutrition && !hasServings;
  const nutritionUnavailable = !hasNutrition && hasServings;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onClose} />
        <div className="w-full rounded-2xl mt-4 relative overflow-hidden flex items-center justify-center" style={{ aspectRatio: '16/10', background: section }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9a2 2 0 0 1 2 2v15l-6.5-3.5L4 20V5a2 2 0 0 1 2-2z" /></svg>
          {recipe.photoDataUrl && <img src={recipe.photoDataUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        </div>
        <div className="text-[22px] font-extrabold mt-4.5" style={{ color: text }}>{recipe.name}</div>
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <div className="px-3 py-1.5 rounded-full text-[12.5px] font-bold" style={recipe.readiness.ready ? { background: hexToRgba('#4d7a1e', 0.16), color: '#3d6218' } : { background: section, color: muted }}>{recipe.readyLabel}</div>
          <div onClick={() => setCatOpen((v) => !v)} className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold cursor-pointer" style={{ background: currentCategory ? hexToRgba(accent, 0.12) : section, color: currentCategory ? accent : muted }}>
            {currentCategory || 'Add category'} {catOpen ? '▴' : '▾'}
          </div>
        </div>
        {catOpen && (
          <div className="mt-3 rounded-2xl p-3.5" style={{ background: card, border: `1.5px solid ${border}` }}>
            <div className="flex flex-wrap gap-2">
              {categoryChips.map((c) => (
                <Chip key={c.label} label={c.label} style={c.active ? { background: accent, color: 'white', border: 'none', fontWeight: 700 } : { background: 'white', color: text, border: `1.5px solid ${border}`, fontWeight: 500 }} onClick={c.onClick} />
              ))}
            </div>
            <div className="flex gap-2 mt-2.5">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category…" className="flex-1 min-w-0 h-[40px] rounded-lg px-3 text-sm outline-none" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
              <button onClick={() => { onAddCategory(newCat); setNewCat(''); }} disabled={!newCat.trim()} className="shrink-0 px-3.5 h-[40px] rounded-lg text-white text-[13px] font-bold disabled:opacity-50" style={{ background: accent }}>Add</button>
            </div>
          </div>
        )}
        {hasServings && <div className="text-[12.5px] mt-2" style={{ color: muted }}>Makes {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}</div>}

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Ingredients</div>
        {ingredientRows.map((ing) => (
          <div key={ing.ingId} className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: ing.dotColor }} />
            <div className="flex-1 min-w-0 text-sm" style={{ color: text }}>{ing.text}</div>
            <div className="shrink-0 text-xs font-semibold" style={{ color: ing.statusColor }}>{ing.statusText}</div>
          </div>
        ))}

        {hasNutrition && recipe.nutrition && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Nutrition (per serving)</div>
            <div className="grid grid-cols-2 gap-2">
              {[['Calories', String(recipe.nutrition.calories)], ['Protein', recipe.nutrition.protein + 'g'], ['Carbs', recipe.nutrition.carbs + 'g'], ['Fat', recipe.nutrition.fat + 'g']].map(([label, val]) => (
                <div key={label} className="rounded-xl p-3.5" style={{ background: card, border: `1.5px solid ${border}` }}>
                  <div className="text-[18px] font-extrabold" style={{ color: text }}>{val}</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: muted }}>{label}</div>
                </div>
              ))}
            </div>
            <div className="text-[11.5px] mt-2" style={{ color: '#a6a496' }}>Estimated by AI from the ingredient list — not a certified nutrition label.</div>
          </>
        )}
        {needsServings && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Nutrition (per serving)</div>
            <div className="text-[13px]" style={{ color: '#a6a496' }}>Add a serving count to this recipe to get a nutrition estimate.</div>
          </>
        )}
        {nutritionUnavailable && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Nutrition (per serving)</div>
            <div className="text-[13px]" style={{ color: '#a6a496' }}>Couldn&apos;t estimate this — try saving the recipe again.</div>
          </>
        )}

        {recipe.instructions && recipe.instructions.trim() && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Instructions</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: text }}>{recipe.instructions}</div>
          </>
        )}

        <div className="flex gap-2.5 mt-7">
          <button
            onClick={onEdit}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[13.5px] font-bold cursor-pointer"
            style={{ background: card, border: `1.5px solid ${border}`, color: text }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            Edit Recipe
          </button>
          <button
            onClick={onDelete}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[13.5px] font-bold text-white"
            style={{ background: errorColor, boxShadow: `0 2px 10px ${hexToRgba(errorColor, 0.35)}` }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></svg>
            Delete Recipe
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipeAdd1Screen(props: {
  title: string;
  url: string; onUrlChange: (e: ChangeEvent<HTMLInputElement>) => void; onImport: () => void;
  importLoading: boolean; importError: string;
  name: string; onNameChange: (e: ChangeEvent<HTMLInputElement>) => void;
  servings: string; onServingsChange: (e: ChangeEvent<HTMLInputElement>) => void;
  ingredientText: string; onIngredientTextChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  instructions: string; onInstructionsChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  parseLoading: boolean; parseProblem: boolean; parseErrorText: string;
  onCancel: () => void; onContinue: () => void; onSkipManual: () => void;
}) {
  const { title, url, onUrlChange, onImport, importLoading, importError, name, onNameChange, servings, onServingsChange, ingredientText, onIngredientTextChange, instructions, onInstructionsChange, parseLoading, parseProblem, parseErrorText, onCancel, onContinue, onSkipManual } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Cancel" onClick={onCancel} />
        <div className="text-2xl font-extrabold mt-3.5" style={{ color: text }}>{title}</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>Import from a recipe page or a YouTube link, or paste it in — either way you&apos;ll review the ingredients next.</div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Import from a link</div>
        <div className="flex gap-2">
          <input value={url} onChange={onUrlChange} inputMode="url" placeholder="Recipe page or YouTube link…" className="flex-1 min-w-0 h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
          <button onClick={onImport} disabled={importLoading || !url.trim()} className="shrink-0 px-4 h-[46px] rounded-xl text-white text-[14px] font-bold disabled:opacity-50" style={{ background: accent }}>
            {importLoading ? '…' : 'Fetch'}
          </button>
        </div>
        {importError && <div className="mt-2 p-3 rounded-xl text-[13px] font-semibold" style={{ background: card, border: `1.5px solid ${border}`, color: errorColor }}>{importError}</div>}

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Recipe name</div>
        <input value={name} onChange={onNameChange} placeholder="e.g. Chicken Tikka Masala" className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Servings</div>
        <input value={servings} onChange={onServingsChange} placeholder="e.g. 4" type="number" min={1} className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
        <div className="text-xs mt-1" style={{ color: '#a6a496' }}>Used to estimate nutrition per serving.</div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Ingredients</div>
        <textarea value={ingredientText} onChange={onIngredientTextChange} placeholder="Paste ingredients here, one per line…" className="w-full h-[140px] rounded-xl p-3.5 text-sm outline-none resize-none" style={{ border: `1.5px solid ${border}`, background: card, color: text, fontFamily: 'inherit' }} />

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Instructions (optional)</div>
        <textarea value={instructions} onChange={onInstructionsChange} placeholder="Paste or type the steps…" className="w-full h-[100px] rounded-xl p-3.5 text-sm outline-none resize-none" style={{ border: `1.5px solid ${border}`, background: card, color: text, fontFamily: 'inherit' }} />

        {parseProblem && <div className="mt-4 p-3.5 rounded-xl text-[13px] font-semibold" style={{ background: card, border: `1.5px solid ${border}`, color: errorColor }}>{parseErrorText}</div>}

        <div onClick={onSkipManual} className="mt-4 text-center text-[13.5px] font-semibold cursor-pointer" style={{ color: accent }}>Add ingredients one at a time instead</div>
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onContinue} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold" style={{ background: accent }}>Continue</button>
      </div>
      {(importLoading || parseLoading) && (
        <LoadingOverlay label={
          parseLoading ? 'Sorting your ingredients…'
            : /youtu\.?be/i.test(url) ? 'Reading the video description & captions…'
            : 'Reading that page…'
        } />
      )}
    </div>
  );
}

interface IngredientEditorRow {
  ingId: string; name: string; quantity: string; amount: string; summaryLine: string; catDot: string;
  isExpanded: boolean; needsAmount: boolean;
  onToggleExpand: () => void;
  onNameChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onQuantityChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onAmountChange: (e: ChangeEvent<HTMLInputElement>) => void;
  unitChips: { label: string; style: CSSProperties; onClick: () => void }[];
  categoryChips: { id: string | null; label: string; style: CSSProperties; onClick: () => void }[];
  onRemove: () => void;
}

function RecipeAdd2Screen(props: {
  title: string; subtitle: string; loading: boolean;
  rows: IngredientEditorRow[];
  onAddBlank: () => void;
  onBack: () => void; backLabel: string;
  onContinue: () => void; continueLabel: string; continueDisabled: boolean;
}) {
  const { title, subtitle, loading, rows, onAddBlank, onBack, backLabel, onContinue, continueLabel, continueDisabled } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label={backLabel} onClick={onBack} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>{title}</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>{subtitle}</div>

        {rows.map((row) => {
          const bg = row.catDot;
          const fg = onColor(bg);
          const fgMuted = onColorMuted(bg);
          return (
            <div key={row.ingId} className="rounded-2xl p-3.5 mt-3" style={{ background: bg, border: '1px solid rgba(0,0,0,0.06)' }}>
              <div className="flex items-center gap-2.5">
                <div onClick={row.onToggleExpand} className="flex-1 min-w-0 cursor-pointer">
                  <div className="text-[14.5px] font-semibold capitalize" style={{ color: fg }}>{row.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: fgMuted }}>{row.summaryLine}</div>
                </div>
                {row.needsAmount && <div className="shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.92)', color: errorColor }}>needs amount</div>}
                <div onClick={row.onToggleExpand} className="cursor-pointer shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={fgMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </div>
              </div>
              {row.isExpanded && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${fgMuted}` }}>
                  <input value={row.name} onChange={row.onNameChange} placeholder="Ingredient name" className="w-full h-[42px] rounded-[10px] px-3 text-sm outline-none" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                  <input value={row.amount} onChange={row.onAmountChange} placeholder="Amount — e.g. 2, 0.25, or 1/4" className="w-full h-[42px] rounded-[10px] px-3 text-sm outline-none mt-2" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                  <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3 mb-1.5" style={{ color: fgMuted }}>Unit</div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.unitChips.map((c) => <Chip key={c.label} label={c.label} style={c.style} onClick={c.onClick} />)}
                  </div>
                  <input value={row.quantity} onChange={row.onQuantityChange} placeholder="As written (optional, e.g. “a handful”)" className="w-full h-[42px] rounded-[10px] px-3 text-sm outline-none mt-3" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                  <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3.5 mb-1.5" style={{ color: fgMuted }}>Category</div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.categoryChips.map((c) => <Chip key={String(c.id)} label={c.label} style={c.style} onClick={c.onClick} />)}
                  </div>
                  <div onClick={row.onRemove} className="mt-3.5 text-center text-[12.5px] font-semibold cursor-pointer px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.9)', color: errorColor }}>Remove this ingredient</div>
                </div>
              )}
            </div>
          );
        })}

        <div onClick={onAddBlank} className="mt-3.5 text-center p-3 rounded-xl text-[13.5px] font-semibold cursor-pointer" style={{ border: `1.5px dashed ${border}`, color: accent }}>+ Add an ingredient</div>
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onContinue} disabled={continueDisabled} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold disabled:opacity-50" style={{ background: accent }}>{continueLabel}</button>
      </div>
      {loading && <LoadingOverlay icon="book" label="Reading amounts…" />}
    </div>
  );
}

function RecipeAdd3Screen(props: {
  hasPhoto: boolean; photoDataUrl: string; photoLoading: boolean;
  onPhotoChange: (e: ChangeEvent<HTMLInputElement>) => void; onRemovePhoto: () => void;
  categoryDraft: string;
  categoryChips: { label: string; active: boolean; onClick: () => void }[];
  onCategoryTextChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void; onSave: () => void; saveLabel: string; saveDisabled: boolean;
}) {
  const { hasPhoto, photoDataUrl, photoLoading, onPhotoChange, onRemovePhoto, categoryDraft, categoryChips, onCategoryTextChange, onBack, onSave, saveLabel, saveDisabled } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Finishing Touches</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>Category and a photo — both optional.</div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Category</div>
        <input value={categoryDraft} onChange={onCategoryTextChange} placeholder="e.g. Dinner, or type a new one" className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
        <div className="flex flex-wrap gap-2 mt-2.5">
          {categoryChips.map((c) => <Chip key={c.label} label={c.label} style={c.active ? { background: accent, color: 'white', border: 'none', fontWeight: 700 } : { background: 'white', color: text, border: `1.5px solid ${border}`, fontWeight: 500 }} onClick={c.onClick} />)}
        </div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Photo</div>

        {hasPhoto ? (
          <>
            <div className="w-full rounded-[18px] mt-5 overflow-hidden" style={{ aspectRatio: '16/10' }}>
              <img src={photoDataUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div onClick={onRemovePhoto} className="mt-3 text-center text-[13px] font-semibold cursor-pointer" style={{ color: errorColor }}>Remove photo</div>
          </>
        ) : (
          <label className="mt-5 flex flex-col items-center justify-center gap-2.5 py-10 px-5 rounded-[20px] cursor-pointer" style={{ border: `2px dashed ${border}`, background: card }}>
            <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#f7e3e5' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></svg>
            </div>
            <div className="text-sm font-semibold" style={{ color: text }}>Tap to add a photo</div>
          </label>
        )}
        {photoLoading && <div className="mt-3.5 text-center text-[13px]" style={{ color: muted }}>Preparing photo…</div>}
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onSave} disabled={saveDisabled} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold disabled:opacity-50" style={{ background: accent }}>{saveLabel}</button>
      </div>
    </div>
  );
}

interface PlanEntryRow {
  id: string; name: string; servings: number; ready: boolean; cooked: boolean; meal: MealSlot | null;
  onInc: () => void; onDec: () => void; onRemove: () => void; onOpen: () => void;
  onCook: (() => void) | null; onUndoCook: (() => void) | null;
}
interface FridgeRow {
  id: string; name: string; madeOn: string; servingsLeft: number; servingsMade: number;
  useBy: string; fresh: 'fresh' | 'soon' | 'past'; hasEaten: boolean;
  onEat1: () => void; onEat2: () => void; onUndoEat: () => void; onUseByChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

function PlanScreen(props: {
  view: 'week' | 'fridge'; onSetView: (v: 'week' | 'fridge') => void;
  weekLabel: string;
  days: { iso: string; weekday: string; day: string; isToday: boolean; entries: PlanEntryRow[] }[];
  hasAnyEntries: boolean;
  shopWeekActive: boolean; onToggleShop: () => void;
  onPrevWeek: () => void; onNextWeek: () => void;
  needRows: { id: string; text: string; sub: string }[];
  onGoGrocery: () => void; onGoRecipes: () => void;
  fridge: FridgeRow[];
  eatenThisWeek: { date: string; label: string; items: { name: string; servings: number }[] }[];
}) {
  const { view, onSetView, weekLabel, days, hasAnyEntries, shopWeekActive, onToggleShop, onPrevWeek, onNextWeek, needRows, onGoGrocery, onGoRecipes, fridge, eatenThisWeek } = props;
  const weekHasEntries = days.some((d) => d.entries.length);
  const freshColor = (f: 'fresh' | 'soon' | 'past') => (f === 'past' ? errorColor : f === 'soon' ? '#7e4c25' : '#3d6218');
  const mealGroups = (entries: PlanEntryRow[]) => {
    const buckets = new Map<string, PlanEntryRow[]>();
    entries.forEach((e) => {
      const key = e.meal || 'other';
      const arr = buckets.get(key) ?? [];
      arr.push(e);
      buckets.set(key, arr);
    });
    return [...buckets.entries()]
      .map(([key, es]) => ({ meta: mealSlotMeta(key === 'other' ? null : key), entries: es }))
      .sort((a, b) => a.meta.rank - b.meta.rank);
  };
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-6 pb-3 shrink-0">
        <div className="text-[26px] font-extrabold" style={{ color: text }}>Meal Plan</div>
        <div className="flex gap-1.5 mt-3 p-1 rounded-xl" style={{ background: section }}>
          {(['week', 'fridge'] as const).map((v) => (
            <div key={v} onClick={() => onSetView(v)} className="flex-1 text-center py-1.5 rounded-lg text-[13px] font-bold cursor-pointer" style={view === v ? { background: '#fff', color: accent } : { color: muted }}>
              {v === 'week' ? 'This Week' : 'In the Fridge'}
            </div>
          ))}
        </div>
        {view === 'week' && (
          <>
            <div className="flex items-center justify-between mt-3">
              <button onClick={onPrevWeek} aria-label="Previous week" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: section }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
              <div className="text-[14.5px] font-bold" style={{ color: text }}>{weekLabel}</div>
              <button onClick={onNextWeek} aria-label="Next week" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: section }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div onClick={onToggleShop} className="flex items-center gap-2 mt-3 cursor-pointer select-none">
              <div className="w-[30px] h-[17px] rounded-full flex items-center px-[2px] shrink-0" style={{ background: shopWeekActive ? accent : '#d8d2c2', transition: 'background 150ms ease' }}>
                <div className="w-[13px] h-[13px] rounded-full bg-white" style={{ transform: shopWeekActive ? 'translateX(13px)' : 'translateX(0)', transition: 'transform 150ms ease' }} />
              </div>
              <div className="text-[12.5px] font-semibold" style={{ color: shopWeekActive ? accent : muted }}>Shop for this week</div>
            </div>
          </>
        )}
      </div>

      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-[100px]">
        {view === 'week' && (
          <>
            {!hasAnyEntries && (
              <div className="text-center py-14 px-5">
                <div className="text-sm" style={{ color: muted }}>Nothing planned yet.</div>
                <button onClick={onGoRecipes} className="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: accent }}>Pick recipes</button>
              </div>
            )}
            {hasAnyEntries && days.map((d) => (
              <div key={d.iso} className="mt-3.5">
                <div className="text-[12.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: d.isToday ? accent : muted }}>
                  {d.weekday} {d.day}{d.isToday ? ' · Today' : ''}
                </div>
                {d.entries.length === 0 && <div className="text-[12.5px] px-1 py-1" style={{ color: '#a6a496' }}>—</div>}
                {mealGroups(d.entries).map((g, _gi, arr) => (
                  <div key={g.meta.id}>
                    {!(arr.length === 1 && g.meta.id === 'other') && (
                      <div className="flex items-center gap-2 mt-2.5 mb-1.5">
                        <div className="w-1 h-3.5 rounded-full shrink-0" style={{ background: g.meta.color }} />
                        <div className="text-[10.5px] font-bold uppercase tracking-[0.09em]" style={{ color: muted }}>{g.meta.label}</div>
                      </div>
                    )}
                    {g.entries.map((e) => (
                      <div key={e.id} className="rounded-2xl px-3.5 py-3 mb-2" style={{ background: card, border: `1.5px solid ${border}`, opacity: e.cooked ? 0.7 : 1 }}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.cooked ? muted : (e.ready ? '#3d6218' : errorColor) }} />
                          <div onClick={e.onOpen} className="flex-1 min-w-0 cursor-pointer">
                            <div className="text-[14px] font-semibold truncate" style={{ color: text }}>{e.name}</div>
                            <div className="text-[12px] mt-0.5" style={{ color: muted }}>{e.cooked ? `Cooked · ${e.servings} servings` : (e.ready ? 'Ready to cook' : 'Missing ingredients')}</div>
                          </div>
                          {!e.cooked && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={e.onDec} className="w-6 h-6 rounded-full text-[15px] font-bold" style={{ background: section, color: text }}>−</button>
                              <div className="text-[12.5px] font-bold w-12 text-center" style={{ color: text }}>{e.servings} srv</div>
                              <button onClick={e.onInc} className="w-6 h-6 rounded-full text-[15px] font-bold" style={{ background: section, color: text }}>+</button>
                            </div>
                          )}
                          <div onClick={e.onRemove} className="shrink-0 cursor-pointer" aria-label="Remove">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a6a496" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          </div>
                        </div>
                        {e.onCook && (
                          <div className="flex justify-end mt-2">
                            <button onClick={e.onCook} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold" style={{ background: hexToRgba(accent, 0.09), color: accent }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11h16M6 11v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-6M8.5 7c0-1.4.8-2 .8-3M12 7c0-1.4.8-2 .8-3M15.5 7c0-1.4.8-2 .8-3" /></svg>
                              Cook this
                            </button>
                          </div>
                        )}
                        {e.cooked && e.onUndoCook && (
                          <div className="flex justify-end mt-1.5">
                            <div onClick={e.onUndoCook} className="text-[11.5px] font-semibold cursor-pointer" style={{ color: muted }}>Undo cook</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {shopWeekActive && weekHasEntries && (
              <div className="mt-6">
                <div className="text-[12.5px] font-bold uppercase tracking-wide mb-2" style={{ color: muted }}>This week&apos;s shopping</div>
                {needRows.length === 0 && <div className="text-[13px]" style={{ color: '#a6a496' }}>Everything for this week is already on hand.</div>}
                {needRows.map((n) => (
                  <div key={n.id} className="rounded-xl px-3.5 py-2.5 mb-2" style={{ background: card, border: `1.5px solid ${border}` }}>
                    <div className="text-[13.5px] font-semibold" style={{ color: text }}>{n.text}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: muted }}>{n.sub}</div>
                  </div>
                ))}
                <div onClick={onGoGrocery} className="mt-1 text-center text-[13px] font-semibold cursor-pointer" style={{ color: accent }}>Open in Grocery list →</div>
              </div>
            )}
            {hasAnyEntries && (
              <div onClick={onGoRecipes} className="mt-6 text-center text-[13px] font-semibold cursor-pointer" style={{ color: accent }}>+ Add more recipes from Recipes</div>
            )}
          </>
        )}

        {view === 'fridge' && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-4 mb-2" style={{ color: muted }}>What&apos;s in the fridge</div>
            {fridge.length === 0 && <div className="text-[13px] py-4" style={{ color: '#a6a496' }}>Nothing cooked right now. Cook a planned recipe from the This Week tab.</div>}
            {fridge.map((f) => (
              <div key={f.id} className="rounded-2xl p-3.5 mb-2.5" style={{ background: card, border: `1.5px solid ${border}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold" style={{ color: text }}>{f.name}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: muted }}>{f.servingsLeft} of {f.servingsMade} servings left</div>
                  </div>
                  <div className="text-[11.5px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: hexToRgba(freshColor(f.fresh), 0.16), color: freshColor(f.fresh) }}>
                    {f.fresh === 'past' ? 'Past use-by' : f.fresh === 'soon' ? 'Use soon' : 'Fresh'}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={f.onEat1} className="flex-1 h-9 rounded-lg text-[13px] font-bold" style={{ background: section, color: text }}>Ate 1</button>
                  <button onClick={f.onEat2} className="flex-1 h-9 rounded-lg text-[13px] font-bold" style={{ background: section, color: text }}>Ate 2</button>
                  {f.hasEaten && <div onClick={f.onUndoEat} className="text-[12px] font-semibold cursor-pointer px-2" style={{ color: accent }}>undo</div>}
                </div>
                <div className="flex items-center gap-2 mt-2.5">
                  <div className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: muted }}>Use by</div>
                  <input type="date" value={f.useBy} onChange={f.onUseByChange} className="h-[34px] rounded-lg px-2 text-[13px] outline-none" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                </div>
              </div>
            ))}

            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Eaten this week</div>
            {eatenThisWeek.length === 0 && <div className="text-[13px]" style={{ color: '#a6a496' }}>Nothing logged yet.</div>}
            {eatenThisWeek.map((d) => (
              <div key={d.date} className="rounded-xl px-3.5 py-2.5 mb-2" style={{ background: card, border: `1.5px solid ${border}` }}>
                <div className="text-[12.5px] font-bold" style={{ color: text }}>{d.label}</div>
                <div className="text-[12.5px] mt-0.5" style={{ color: muted }}>{d.items.map((i) => `${i.name} ×${i.servings}`).join(', ')}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function CookConfirmScreen(props: {
  name: string; servings: number;
  effects: { label: string; itemName: string; fromText: string; toText: string }[];
  unmatched: string[];
  onCancel: () => void; onConfirm: () => void;
}) {
  const { name, servings, effects, unmatched, onCancel, onConfirm } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Cancel" onClick={onCancel} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Cook {name}?</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>Making {servings} serving{servings === 1 ? '' : 's'}. This deducts from your inventory:</div>

        {effects.length === 0 && <div className="text-[13px] mt-4" style={{ color: '#a6a496' }}>Nothing to deduct — no tracked ingredients matched an item with a quantity.</div>}
        {effects.map((x, i) => (
          <div key={i} className="rounded-xl px-3.5 py-2.5 mt-2" style={{ background: card, border: `1.5px solid ${border}` }}>
            <div className="text-[13.5px] font-semibold" style={{ color: text }}>{x.itemName}</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: muted }}>{x.fromText} → {x.toText}</div>
          </div>
        ))}

        {unmatched.length > 0 && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-1.5" style={{ color: muted }}>Not in inventory</div>
            <div className="text-[13px]" style={{ color: '#a6a496' }}>{unmatched.join(', ')} — not deducted.</div>
          </>
        )}
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onConfirm} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold" style={{ background: accent }}>Cook & update inventory</button>
      </div>
    </div>
  );
}

function PlanAddScreen(props: {
  rows: { recipeId: string; name: string; servings: string; dayCount: number;
    dayChips: { label: string; active: boolean; onClick: () => void }[];
    mealChips: { label: string; active: boolean; onClick: () => void }[];
    onServings: (e: ChangeEvent<HTMLInputElement>) => void }[];
  totalEntries: number;
  onCancel: () => void; onConfirm: () => void;
}) {
  const { rows, totalEntries, onCancel, onConfirm } = props;
  const chipStyleFor = (active: boolean) => (active
    ? { background: accent, color: 'white', border: 'none', fontWeight: 700 }
    : { background: 'white', color: text, border: `1.5px solid ${border}`, fontWeight: 500 });
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Cancel" onClick={onCancel} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Add to Meal Plan</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>Pick the meal and one or more days for each recipe. You may be asked to confirm ingredient amounts next.</div>
        {rows.map((row) => (
          <div key={row.recipeId} className="rounded-2xl p-3.5 mt-3" style={{ background: card, border: `1.5px solid ${border}` }}>
            <div className="text-[14.5px] font-semibold" style={{ color: text }}>{row.name}</div>
            <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3 mb-1.5" style={{ color: muted }}>Meal</div>
            <div className="flex flex-wrap gap-1.5">
              {row.mealChips.map((c) => (
                <Chip key={c.label} label={c.label} style={chipStyleFor(c.active)} onClick={c.onClick} />
              ))}
            </div>
            <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3 mb-1.5" style={{ color: muted }}>Days{row.dayCount === 0 ? ' — pick at least one' : ''}</div>
            <div className="noscroll flex gap-1.5 overflow-x-auto pb-1">
              {row.dayChips.map((c) => (
                <Chip key={c.label} label={c.label} style={chipStyleFor(c.active)} onClick={c.onClick} />
              ))}
            </div>
            <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3 mb-1.5" style={{ color: muted }}>Servings to make</div>
            <input value={row.servings} onChange={row.onServings} inputMode="numeric" placeholder="e.g. 4" className="w-24 h-[42px] rounded-[10px] px-3 text-sm outline-none" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
          </div>
        ))}
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onConfirm} disabled={totalEntries === 0} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold disabled:opacity-50" style={{ background: accent }}>
          {totalEntries === 0 ? 'Add to plan' : `Add ${totalEntries} to plan`}
        </button>
      </div>
    </div>
  );
}

function BottomNav(props: { activeTab: string; addVariant?: 'item' | 'plan'; onHome: () => void; onRecipes: () => void; onPlan: () => void; onGrocery: () => void; onAdd: () => void }) {
  const { activeTab, addVariant, onHome, onRecipes, onPlan, onGrocery, onAdd } = props;
  const col = (t: string) => (activeTab === t ? accent : '#a6a496');
  return (
    <div className="relative shrink-0 h-[86px] flex items-start justify-around pt-2.5" style={{ background: card, borderTop: `1px solid ${border}` }}>
      <div onClick={onHome} className="flex flex-col items-center gap-0.5 cursor-pointer w-[62px]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col('home')} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" /></svg>
        <div className="text-[11.5px] font-semibold" style={{ color: col('home') }}>Home</div>
      </div>
      <div onClick={onRecipes} className="flex flex-col items-center gap-0.5 cursor-pointer w-[62px]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col('recipes')} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9a2 2 0 0 1 2 2v15l-6.5-3.5L4 20V5a2 2 0 0 1 2-2z" /></svg>
        <div className="text-[11.5px] font-semibold" style={{ color: col('recipes') }}>Recipes</div>
      </div>
      <div onClick={onAdd} aria-label={addVariant === 'plan' ? 'Add recipes to the plan' : 'Add an item'} className="relative -top-[22px] w-14 h-14 rounded-full flex items-center justify-center cursor-pointer shadow-lg" style={{ background: accent }}>
        {addVariant === 'plan' ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M8 3v3M16 3v3M12 12.5v5M9.5 15h5" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        )}
      </div>
      <div onClick={onPlan} className="flex flex-col items-center gap-0.5 cursor-pointer w-[62px]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col('plan')} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M8 3v4M16 3v4M9 14h6" /></svg>
        <div className="text-[11.5px] font-semibold" style={{ color: col('plan') }}>Plan</div>
      </div>
      <div onClick={onGrocery} className="flex flex-col items-center gap-0.5 cursor-pointer w-[62px]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col('grocery')} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M3 4h2l2.4 12.2a1.5 1.5 0 0 0 1.48 1.3h8.24a1.5 1.5 0 0 0 1.47-1.2L21 8H6" /></svg>
        <div className="text-[11.5px] font-semibold" style={{ color: col('grocery') }}>Grocery</div>
      </div>
    </div>
  );
}

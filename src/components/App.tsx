'use client';

import { useState, useMemo, type ChangeEvent, type CSSProperties } from 'react';
import { useKitchenData } from '@/hooks/useKitchenData';
import {
  CATEGORIES, CATEGORY_MAP, LOCATIONS, LOCATION_MAP, STORES, STATUS_COLORS,
  BIN_PRESETS, DATE_TYPE_BY_CATEGORY, DEFAULT_LOCATION_BY_CATEGORY,
} from '@/lib/constants';
import {
  decorateItem, buildPantrySections, buildLocationCategorySections, categoryChipsForLocation,
  buildGrocerySections, storeChipsForGrocery, chipStyle, neutralChipStyle, hexToRgba,
  matchIngredient, recipeReadiness, titleCaseWords, buildIngredientRow, resizeImageFileToDataUrl,
  type Section,
} from '@/lib/logic';
import { parseIngredientsApi, estimateNutritionApi, scanReceiptApi, scanItemApi } from '@/lib/apiClient';
import type { Item, LocationId, Ingredient, Recipe } from '@/lib/types';
import { Chip, BackLink } from './Chip';

type Screen =
  | 'home' | 'location' | 'itemDetail' | 'add1' | 'add2' | 'add3'
  | 'receiptScan' | 'receiptReview' | 'grocery'
  | 'recipes' | 'recipeDetail' | 'recipeAdd1' | 'recipeAdd2' | 'recipeAdd3';

interface AddDraft {
  name: string; category: string | null; location: LocationId | null; bin: string;
  store: string | null; date: string; dateType: 'expiry' | 'consume-by'; skipDate: boolean;
}
const BLANK_DRAFT: AddDraft = { name: '', category: null, location: null, bin: '', store: null, date: '', dateType: 'expiry', skipDate: false };

interface ReceiptDraftItem {
  tempId: string; include: boolean; name: string; quantity: string; category: string;
  location: LocationId; bin: string; dateType: 'expiry' | 'consume-by' | null; date: string; skipDate: boolean;
}

interface UiState {
  screen: Screen;
  tab: 'home' | 'grocery' | 'recipes';
  selectedLocationId: LocationId | null;
  selectedItemId: string | null;
  itemDetailReturnTo: Screen;
  locationCategoryFilter: string | null;
  storeFilter: string | null;
  addReturnTab: 'home' | 'grocery' | 'recipes';
  addDraft: AddDraft;
  manualDraft: string;
  addPhotoStatus: 'idle' | 'loading' | 'error';
  receiptStatus: 'idle' | 'loading' | 'error' | 'unavailable';
  receiptErrorText: string;
  receiptDraftItems: ReceiptDraftItem[];
  receiptStore: string | null;
  expandedReceiptItemId: string | null;
  recipeFilter: 'all' | 'ready';
  selectedRecipeId: string | null;
  editingRecipeId: string | null;
  recipeNameDraft: string;
  recipeIngredientTextDraft: string;
  recipeInstructionsDraft: string;
  recipeParseStatus: 'idle' | 'loading' | 'error' | 'unavailable';
  recipeParseErrorText: string;
  recipeIngredientDrafts: Ingredient[];
  expandedRecipeIngredientId: string | null;
  recipePhotoDataUrl: string;
  recipePhotoStatus: 'idle' | 'loading' | 'error';
  recipeServingsDraft: string;
  recipeSaveStatus: 'idle' | 'loading';
  dismissedRecipeNeeds: string[];
}

const initialState: UiState = {
  screen: 'home', tab: 'home',
  selectedLocationId: null, selectedItemId: null, itemDetailReturnTo: 'location',
  locationCategoryFilter: null, storeFilter: null,
  addReturnTab: 'home', addDraft: BLANK_DRAFT, manualDraft: '', addPhotoStatus: 'idle',
  receiptStatus: 'idle', receiptErrorText: '', receiptDraftItems: [], receiptStore: null, expandedReceiptItemId: null,
  recipeFilter: 'all', selectedRecipeId: null, editingRecipeId: null,
  recipeNameDraft: '', recipeIngredientTextDraft: '', recipeInstructionsDraft: '',
  recipeParseStatus: 'idle', recipeParseErrorText: '', recipeIngredientDrafts: [], expandedRecipeIngredientId: null,
  recipePhotoDataUrl: '', recipePhotoStatus: 'idle', recipeServingsDraft: '', recipeSaveStatus: 'idle',
  dismissedRecipeNeeds: [],
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

  const decorated = useMemo(() => kitchen.items.map(decorateItem), [kitchen.items]);
  const decoratedRecipes = useMemo(
    () => kitchen.recipes.map((r) => {
      const readiness = recipeReadiness(r, kitchen.items);
      return { ...r, readiness, readyLabel: readiness.totalCount === 0 ? 'No ingredients yet' : `${readiness.haveCount} of ${readiness.totalCount} on hand` };
    }),
    [kitchen.recipes, kitchen.items]
  );

  // ---------- navigation ----------
  const openLocation = (id: LocationId) => () => patch({ screen: 'location', selectedLocationId: id, locationCategoryFilter: null });
  const openItem = (returnTo: Screen) => (id: string) => () => patch({ screen: 'itemDetail', selectedItemId: id, itemDetailReturnTo: returnTo });
  const backToHome = () => patch({ screen: 'home' });
  const closeItemDetail = () => patch({ screen: st.itemDetailReturnTo });
  const goHomeTab = () => patch({ screen: 'home', tab: 'home' });
  const goGroceryTab = () => patch({ screen: 'grocery', tab: 'grocery' });
  const goGrocery = () => patch({ screen: 'grocery', tab: 'grocery' });
  const goRecipesTab = () => patch({ screen: 'recipes', tab: 'recipes' });

  // ---------- item mutations ----------
  const toggleAuto = (id: string) => () => kitchen.setItemStatus(id, { status: 'ok' });
  const removeManual = (id: string) => () => kitchen.removeManualGroceryItem(id);
  const setStatus = (status: Item['status']) => () => {
    if (st.selectedItemId) kitchen.setItemStatus(st.selectedItemId, { status });
  };
  const removeItemHandler = () => {
    if (st.selectedItemId) kitchen.removeItem(st.selectedItemId);
    patch({ screen: st.itemDetailReturnTo });
  };

  // ---------- add flow ----------
  const startAdd = () => patch({ screen: 'add1', addReturnTab: st.tab });
  const cancelAdd = () => patch({ screen: st.addReturnTab, addDraft: BLANK_DRAFT, addPhotoStatus: 'idle' });
  const enterManually = () => patch({ screen: 'add2', addDraft: BLANK_DRAFT });
  const backToAdd1 = () => patch({ screen: 'add1' });
  const backToAdd2 = () => patch({ screen: 'add2' });
  const goToAdd3 = () => patch({ screen: 'add3' });
  const updateDraft = (p: Partial<AddDraft>) => patch({ addDraft: { ...st.addDraft, ...p } });
  const setDraftName = (e: ChangeEvent<HTMLInputElement>) => updateDraft({ name: e.target.value });
  const pickCategory = (id: string) => () => updateDraft({ category: id, dateType: (id === 'vegetables' || id === 'fruits' || id === 'herbs') ? 'consume-by' : st.addDraft.dateType });
  const pickLocation = (id: LocationId) => () => updateDraft({ location: id, bin: id === 'pantry' ? st.addDraft.bin : '' });
  const setDraftBin = (e: ChangeEvent<HTMLInputElement>) => updateDraft({ bin: e.target.value });
  const pickBin = (b: string) => () => updateDraft({ bin: b });
  const pickStore = (id: string) => () => updateDraft({ store: id });
  const setDraftDate = (e: ChangeEvent<HTMLInputElement>) => updateDraft({ date: e.target.value });
  const toggleSkipDate = () => updateDraft({ skipDate: !st.addDraft.skipDate, date: '' });

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
        name: item.name, category: item.category, location: null, bin: '', store: null,
        date: '', dateType: 'expiry', skipDate: !item.needsDate,
      },
    });
  };

  const saveItem = () => {
    const d = st.addDraft;
    const body: Omit<Item, 'id'> = {
      name: d.name.trim() ? d.name.trim() : 'New Item',
      category: d.category || 'grains',
      location: d.location || 'pantry',
      bin: (d.location || 'pantry') === 'pantry' ? (d.bin || 'Unsorted') : '',
      store: d.store || null,
      status: 'ok',
      dateType: d.skipDate ? null : d.dateType,
      date: d.skipDate ? null : (d.date || null),
    };
    kitchen.saveItem(null, body);
    patch({ screen: 'location', tab: st.addReturnTab, selectedLocationId: body.location, addDraft: BLANK_DRAFT });
  };

  // ---------- receipt scan ----------
  const startReceiptScan = () => patch({ screen: 'receiptScan', receiptStatus: 'idle', receiptErrorText: '' });
  const backToAdd1FromReceipt = () => patch({ screen: 'add1', receiptStatus: 'idle', receiptErrorText: '' });
  const enterManuallyFromReceipt = () => patch({ screen: 'add2', addDraft: BLANK_DRAFT, receiptStatus: 'idle', receiptErrorText: '' });
  const cancelReceiptReview = () => patch({ screen: st.addReturnTab, receiptDraftItems: [], receiptStore: null, expandedReceiptItemId: null });

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
      const body: Omit<Item, 'id'> = {
        name: it.name.trim() ? it.name.trim() : 'New Item',
        category: it.category,
        location: it.location,
        bin: it.location === 'pantry' ? (it.bin.trim() ? it.bin.trim() : 'Unsorted') : '',
        store: st.receiptStore || null,
        status: 'ok',
        dateType: it.skipDate ? null : it.dateType,
        date: it.skipDate ? null : (it.date || null),
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

  // ---------- recipes: list ----------
  const setRecipeFilter = (f: 'all' | 'ready') => patch({ recipeFilter: f });
  const togglePlanned = (id: string, current: boolean) => () => kitchen.toggleRecipePlanned(id, current);
  const filteredRecipes = st.recipeFilter === 'ready' ? decoratedRecipes.filter((r) => r.readiness.ready) : decoratedRecipes;
  const openRecipe = (id: string) => () => patch({ screen: 'recipeDetail', selectedRecipeId: id });
  const startAddRecipe = () => patch({
    screen: 'recipeAdd1', editingRecipeId: null, recipeNameDraft: '', recipeIngredientTextDraft: '',
    recipeInstructionsDraft: '', recipeParseStatus: 'idle', recipeParseErrorText: '', recipeIngredientDrafts: [],
    recipePhotoDataUrl: '', recipePhotoStatus: 'idle', recipeServingsDraft: '', recipeSaveStatus: 'idle',
  });

  // ---------- recipes: detail ----------
  const selectedRecipe = decoratedRecipes.find((r) => r.id === st.selectedRecipeId) || null;
  const closeRecipeDetail = () => patch({ screen: 'recipes' });
  const deleteRecipeHandler = () => {
    if (st.selectedRecipeId) kitchen.deleteRecipe(st.selectedRecipeId);
    patch({ screen: 'recipes' });
  };
  const startEditRecipe = () => {
    if (!selectedRecipe) return;
    patch({
      screen: 'recipeAdd2', editingRecipeId: selectedRecipe.id, recipeNameDraft: selectedRecipe.name,
      recipeInstructionsDraft: selectedRecipe.instructions || '',
      recipeIngredientDrafts: (selectedRecipe.ingredients || []).map((i) => ({ ...i })),
      recipePhotoDataUrl: selectedRecipe.photoDataUrl || '',
      recipeServingsDraft: selectedRecipe.servings ? String(selectedRecipe.servings) : '',
      recipeSaveStatus: 'idle', expandedRecipeIngredientId: null,
    });
  };

  // ---------- recipes: add/edit step 1 ----------
  const setRecipeNameDraft = (e: ChangeEvent<HTMLInputElement>) => patch({ recipeNameDraft: e.target.value });
  const setRecipeServingsDraft = (e: ChangeEvent<HTMLInputElement>) => patch({ recipeServingsDraft: e.target.value });
  const setRecipeIngredientTextDraft = (e: ChangeEvent<HTMLTextAreaElement>) => patch({ recipeIngredientTextDraft: e.target.value });
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
    patch({ recipeParseStatus: 'loading', recipeParseErrorText: '' });
    const { items, error } = await parseIngredientsApi(textVal);
    if (error) {
      const copy = recipeParseErrorCopyForCode(error);
      patch({ recipeParseStatus: copy.status, recipeParseErrorText: copy.text });
      return;
    }
    const rawItems = items || [];
    if (!rawItems.length) {
      patch({ recipeParseStatus: 'error', recipeParseErrorText: "Couldn't find any ingredients in that text — try pasting just the ingredient list." });
      return;
    }
    const drafts = rawItems.slice(0, 40).map((raw, idx) => buildIngredientRow(raw, idx));
    patch({ screen: 'recipeAdd2', recipeParseStatus: 'idle', recipeIngredientDrafts: drafts, expandedRecipeIngredientId: null });
  };
  const skipToManualIngredients = () => patch({ screen: 'recipeAdd2', recipeParseStatus: 'idle', expandedRecipeIngredientId: null });

  // ---------- recipes: add/edit step 2 ----------
  const toggleIngredientExpand = (ingId: string) => () => patch({ expandedRecipeIngredientId: st.expandedRecipeIngredientId === ingId ? null : ingId });
  const updateIngredientDraft = (ingId: string, p: Partial<Ingredient>) => patch({
    recipeIngredientDrafts: st.recipeIngredientDrafts.map((ing) => (ing.ingId === ingId ? { ...ing, ...p } : ing)),
  });
  const removeIngredientDraft = (ingId: string) => () => patch({ recipeIngredientDrafts: st.recipeIngredientDrafts.filter((ing) => ing.ingId !== ingId) });
  const pickIngredientCategory = (ingId: string, catId: string | null) => () => updateIngredientDraft(ingId, { category: catId });
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

  const saveRecipe = async () => {
    const name = st.recipeNameDraft.trim() ? st.recipeNameDraft.trim() : 'Untitled Recipe';
    const ingredients = st.recipeIngredientDrafts.map((ing) => ({
      ingId: ing.ingId, text: ing.text, name: ing.name, quantity: ing.quantity, category: ing.category, trackable: ing.trackable !== false,
    }));
    const servingsNum = parseInt(st.recipeServingsDraft, 10);
    const servings = Number.isFinite(servingsNum) && servingsNum > 0 ? servingsNum : null;
    const id = st.editingRecipeId;
    const existing = id ? kitchen.recipes.find((r) => r.id === id) : null;
    const baseBody: Omit<Recipe, 'id'> = {
      name, ingredients, instructions: st.recipeInstructionsDraft || '', photoDataUrl: st.recipePhotoDataUrl || '',
      planned: existing ? !!existing.planned : false, servings, nutrition: null,
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

  // ---------- recipes -> grocery integration ----------
  const plannedRecipes = decoratedRecipes.filter((r) => r.planned);
  const recipeGroceryMap: Record<string, { key: string; label: string; recipeNames: string[]; matchedItem: Item | null }> = {};
  plannedRecipes.forEach((r) => {
    (r.readiness.missing || []).forEach((m) => {
      const key = (m.ingredient.name || '').toLowerCase().trim();
      if (!key) return;
      if (!recipeGroceryMap[key]) recipeGroceryMap[key] = { key, label: titleCaseWords(m.ingredient.name), recipeNames: [], matchedItem: m.matchedItem || null };
      if (recipeGroceryMap[key].recipeNames.indexOf(r.name) === -1) recipeGroceryMap[key].recipeNames.push(r.name);
    });
  });
  const dismissRecipeGroceryNeed = (key: string) => () => patch({ dismissedRecipeNeeds: [...st.dismissedRecipeNeeds, key] });
  const matchedRecipeNeedsByItemId: Record<string, string[]> = {};
  Object.keys(recipeGroceryMap).forEach((k) => {
    const n = recipeGroceryMap[k];
    if (n.matchedItem) matchedRecipeNeedsByItemId[n.matchedItem.id] = (matchedRecipeNeedsByItemId[n.matchedItem.id] || []).concat(n.recipeNames);
  });
  const recipeGroceryRows = Object.keys(recipeGroceryMap)
    .map((k) => recipeGroceryMap[k])
    .filter((n) => !n.matchedItem)
    .filter((n) => st.dismissedRecipeNeeds.indexOf(n.key) === -1)
    .map((n) => ({
      id: n.key, name: n.label, dotColor: accent, hasMeta: true, meta: 'For: ' + n.recipeNames.join(', '),
      hasBadge: false, badgeText: '', badgeStyle: null as { background: string; color: string } | null,
      onCheck: dismissRecipeGroceryNeed(n.key),
    }));

  // ---------- home stats ----------
  const statsFor = (locId: LocationId) => {
    const items = decorated.filter((i) => i.location === locId);
    const alerts = items.filter((i) => i.needsRestock || i.soonOrUrgent).length;
    return { count: items.length, alerts };
  };
  const pantryStats = statsFor('pantry');
  const fridgeStats = statsFor('fridge');
  const freezerStats = statsFor('freezer');
  const spareStats = statsFor('spare-fridge');
  const spareFreezerStats = statsFor('spare-freezer');
  const restockCount = decorated.filter((i) => i.needsRestock).length + kitchen.groceryExtras.length;
  const expiringSoonCount = decorated.filter((i) => i.soonOrUrgent).length;

  // ---------- location screen ----------
  const currentLocationId = st.selectedLocationId || 'pantry';
  const currentLocationIsPantry = currentLocationId === 'pantry';
  const locationSections: Section[] = currentLocationIsPantry
    ? buildPantrySections(decorated, openItem('location'))
    : buildLocationCategorySections(decorated, currentLocationId, st.locationCategoryFilter, openItem('location'));
  const filterChips = currentLocationIsPantry ? [] : categoryChipsForLocation(decorated, currentLocationId, st.locationCategoryFilter, (id) => patch({ locationCategoryFilter: id }));

  // ---------- grocery screen ----------
  const taggedGrocerySections: Section[] = buildGrocerySections(decorated, kitchen.groceryExtras, st.storeFilter, toggleAuto, removeManual).map((sec) => ({
    sectionTitle: sec.sectionTitle,
    rows: sec.rows.map((row) => {
      const names = matchedRecipeNeedsByItemId[row.id];
      if (!names || !names.length) return row;
      return { ...row, hasMeta: true, meta: (row.meta ? row.meta + ' · ' : '') + 'For: ' + names.join(', ') };
    }),
  }));
  const grocerySections: Section[] = recipeGroceryRows.length
    ? [{ sectionTitle: 'For Recipes', rows: recipeGroceryRows }, ...taggedGrocerySections]
    : taggedGrocerySections;
  const storeFilterChips = storeChipsForGrocery(decorated, st.storeFilter, setStoreFilter);
  const groceryTotal = decorated.filter((i) => i.needsRestock && (!st.storeFilter || i.store === st.storeFilter)).length + kitchen.groceryExtras.length + recipeGroceryRows.length;

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
  const categoryChips = CATEGORIES.map((c) => ({ id: c.id, label: c.label, style: chipStyle(draft.category === c.id, c.color), onClick: pickCategory(c.id) }));
  const locationChips = LOCATIONS.map((l) => ({ id: l.id, label: l.label, style: neutralChipStyle(draft.location === l.id), onClick: pickLocation(l.id) }));
  const binChipsArr = BIN_PRESETS.map((b) => ({ label: b, style: neutralChipStyle(draft.bin === b), onClick: pickBin(b) }));
  const storeChipsArr = STORES.map((s) => ({ id: s.id, label: s.label, style: neutralChipStyle(draft.store === s.id), onClick: pickStore(s.id) }));
  const receiptStoreChips = STORES.map((s) => ({ id: s.id, label: s.label, style: neutralChipStyle(st.receiptStore === s.id), onClick: () => patch({ receiptStore: s.id }) }));

  const showNav = st.screen === 'home' || st.screen === 'grocery' || st.screen === 'recipes';
  const receiptIncludedCount = st.receiptDraftItems.filter((i) => i.include).length;

  return (
    <div className="min-h-dvh flex flex-col bg-[#ead7c8]" style={{ color: text }}>
      <div className="flex-1 min-h-0 relative">
        {st.screen === 'home' && (
          <HomeScreen
            totalItems={kitchen.items.length}
            dbStatus={kitchen.status}
            restockCount={restockCount}
            expiringSoonCount={expiringSoonCount}
            goGrocery={goGrocery}
            pantryStats={pantryStats} fridgeStats={fridgeStats} freezerStats={freezerStats}
            spareStats={spareStats} spareFreezerStats={spareFreezerStats}
            openPantry={openLocation('pantry')} openFridge={openLocation('fridge')} openFreezer={openLocation('freezer')}
            openSpare={openLocation('spare-fridge')} openSpareFreezer={openLocation('spare-freezer')}
          />
        )}

        {st.screen === 'location' && (
          <LocationScreen
            label={LOCATION_MAP[currentLocationId]?.label || ''}
            count={decorated.filter((i) => i.location === currentLocationId).length}
            showFilters={!currentLocationIsPantry}
            filterChips={filterChips}
            sections={locationSections}
            onBack={backToHome}
          />
        )}

        {st.screen === 'itemDetail' && selectedItem && (
          <ItemDetailScreen
            item={selectedItem}
            statusOptions={statusOptionDefs.map((o) => ({ label: o.label, style: statusStyle(selectedItem.status === o.key, o.color), onClick: setStatus(o.key) }))}
            onClose={closeItemDetail}
            onRemove={removeItemHandler}
          />
        )}

        {st.screen === 'add1' && (
          <Add1Screen
            onCancel={cancelAdd}
            onTakePhoto={takePhoto}
            photoLoading={st.addPhotoStatus === 'loading'}
            onStartReceiptScan={startReceiptScan}
            onEnterManually={enterManually}
          />
        )}

        {st.screen === 'receiptScan' && (
          <ReceiptScanScreen
            status={st.receiptStatus}
            errorText={st.receiptErrorText}
            onCancel={backToAdd1FromReceipt}
            onFileChange={onReceiptFileChange}
            onEnterManually={enterManuallyFromReceipt}
          />
        )}

        {st.screen === 'receiptReview' && (
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
            onSubmit={addReceiptItems}
            submitDisabled={receiptIncludedCount === 0}
          />
        )}

        {st.screen === 'add2' && (
          <Add2Screen
            hasPhoto={false}
            name={draft.name} onNameChange={setDraftName}
            categoryChips={categoryChips}
            onBack={backToAdd1} onContinue={goToAdd3}
          />
        )}

        {st.screen === 'add3' && (
          <Add3Screen
            locationChips={locationChips}
            isPantry={draft.location === 'pantry'}
            bin={draft.bin} onBinChange={setDraftBin} binChips={binChipsArr}
            storeChips={storeChipsArr}
            dateHeading={draft.dateType === 'consume-by' ? 'Consume By' : 'Expiry Date'}
            showDateInput={!draft.skipDate} date={draft.date} onDateChange={setDraftDate}
            skipDate={draft.skipDate} onToggleSkipDate={toggleSkipDate}
            onBack={backToAdd2} onSave={saveItem}
          />
        )}

        {st.screen === 'grocery' && (
          <GroceryScreen
            countLabel={`${groceryTotal} item${groceryTotal === 1 ? '' : 's'} needed`}
            storeFilterChips={storeFilterChips}
            manualDraft={st.manualDraft} onManualDraftChange={setManualDraft} onAddManual={addManualItem}
            sections={grocerySections}
            empty={groceryTotal === 0}
          />
        )}

        {st.screen === 'recipes' && (
          <RecipesScreen
            filterChips={[{ id: 'all' as const, label: 'All Recipes' }, { id: 'ready' as const, label: 'Ready to Cook' }].map((f) => ({
              id: f.id, label: f.label, style: neutralChipStyle(st.recipeFilter === f.id), onClick: () => setRecipeFilter(f.id),
            }))}
            recipes={filteredRecipes.map((r) => ({
              id: r.id, name: r.name, hasPhoto: !!r.photoDataUrl, photoDataUrl: r.photoDataUrl || '',
              readyLabel: r.readyLabel,
              readyBadgeStyle: r.readiness.ready ? { background: hexToRgba('#4d7a1e', 0.16), color: '#3d6218' } : { background: section, color: muted },
              plannedLabel: r.planned ? 'Planned ✓' : 'Plan to Cook',
              plannedStyle: r.planned ? { background: accent, color: 'white' } : { background: card, border: `1.5px solid ${border}`, color: accent },
              onTogglePlanned: togglePlanned(r.id, !!r.planned),
              onOpen: openRecipe(r.id),
            }))}
            empty={kitchen.recipes.length === 0}
            filteredEmpty={kitchen.recipes.length > 0 && filteredRecipes.length === 0}
            onAdd={startAddRecipe}
          />
        )}

        {st.screen === 'recipeDetail' && selectedRecipe && (
          <RecipeDetailScreen
            recipe={selectedRecipe}
            ingredientRows={(selectedRecipe.ingredients || []).map((ing) => {
              const m = matchIngredient(ing, kitchen.items);
              let statusText: string; let statusColor: string;
              if (m.alwaysHave) { statusText = 'Always on hand'; statusColor = muted; }
              else if (m.has) { statusText = 'In stock'; statusColor = '#3d6218'; }
              else if (m.matchedItem) { statusText = ({ low: 'Low', out: 'Out', 'buy-now': 'Buy Now', skip: 'Skip' } as Record<string, string>)[m.matchedItem.status] || 'Not enough'; statusColor = errorColor; }
              else { statusText = 'Not in pantry'; statusColor = errorColor; }
              return { ingId: ing.ingId, text: titleCaseWords(ing.name) + (ing.quantity ? ' — ' + ing.quantity : ''), statusText, statusColor, dotColor: (m.has || m.alwaysHave) ? '#3d6218' : errorColor };
            })}
            onClose={closeRecipeDetail}
            onEdit={startEditRecipe}
            onDelete={deleteRecipeHandler}
            onTogglePlanned={togglePlanned(selectedRecipe.id, !!selectedRecipe.planned)}
          />
        )}

        {st.screen === 'recipeAdd1' && (
          <RecipeAdd1Screen
            title={st.editingRecipeId ? 'Edit Recipe' : 'Add a Recipe'}
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
        )}

        {st.screen === 'recipeAdd2' && (
          <RecipeAdd2Screen
            rows={st.recipeIngredientDrafts.map((ing) => ({
              ingId: ing.ingId, name: ing.name, quantity: ing.quantity,
              summaryLine: (ing.category ? CATEGORY_MAP[ing.category].label : 'Uncategorized') + (ing.quantity ? ' · ' + ing.quantity : ''),
              catDot: ing.category ? CATEGORY_MAP[ing.category].color : '#a6a496',
              isExpanded: st.expandedRecipeIngredientId === ing.ingId,
              onToggleExpand: toggleIngredientExpand(ing.ingId),
              onNameChange: (e: ChangeEvent<HTMLInputElement>) => updateIngredientDraft(ing.ingId, { name: e.target.value }),
              onQuantityChange: (e: ChangeEvent<HTMLInputElement>) => updateIngredientDraft(ing.ingId, { quantity: e.target.value }),
              categoryChips: [{ id: null as string | null, label: 'None' }, ...CATEGORIES].map((c) => ({
                id: c.id, label: c.label,
                style: c.id === null ? neutralChipStyle(ing.category === null) : chipStyle(ing.category === c.id, (c as { color?: string }).color || '#000'),
                onClick: pickIngredientCategory(ing.ingId, c.id),
              })),
              onRemove: removeIngredientDraft(ing.ingId),
            }))}
            onAddBlank={addBlankIngredient}
            onBack={backToRecipeAdd1}
            onContinue={goToRecipeAdd3}
            continueDisabled={st.recipeIngredientDrafts.length === 0}
          />
        )}

        {st.screen === 'recipeAdd3' && (
          <RecipeAdd3Screen
            hasPhoto={!!st.recipePhotoDataUrl}
            photoDataUrl={st.recipePhotoDataUrl}
            photoLoading={st.recipePhotoStatus === 'loading'}
            onPhotoChange={onRecipePhotoChange}
            onRemovePhoto={removeRecipePhoto}
            onBack={backToRecipeAdd2}
            onSave={saveRecipe}
            saveLabel={st.recipeSaveStatus === 'loading' ? 'Estimating nutrition…' : (st.editingRecipeId ? 'Save Changes' : 'Save Recipe')}
            saveDisabled={st.recipeSaveStatus === 'loading'}
          />
        )}
      </div>

      {showNav && (
        <BottomNav
          activeTab={st.tab}
          onHome={goHomeTab} onRecipes={goRecipesTab} onGrocery={goGroceryTab} onAdd={startAdd}
        />
      )}
    </div>
  );
}

// ============================================================
// Screens
// ============================================================

function HomeScreen(props: {
  totalItems: number; dbStatus: string; restockCount: number; expiringSoonCount: number; goGrocery: () => void;
  pantryStats: { count: number; alerts: number }; fridgeStats: { count: number; alerts: number };
  freezerStats: { count: number; alerts: number }; spareStats: { count: number; alerts: number }; spareFreezerStats: { count: number; alerts: number };
  openPantry: () => void; openFridge: () => void; openFreezer: () => void; openSpare: () => void; openSpareFreezer: () => void;
}) {
  const { totalItems, dbStatus, restockCount, expiringSoonCount, goGrocery, pantryStats, fridgeStats, freezerStats, spareStats, spareFreezerStats, openPantry, openFridge, openFreezer, openSpare, openSpareFreezer } = props;
  const showSyncBanner = dbStatus === 'unavailable' || dbStatus === 'error';
  const cards = [
    { label: 'Pantry', stats: pantryStats, onOpen: openPantry, icon: 'box' as const },
    { label: 'Fridge', stats: fridgeStats, onOpen: openFridge, icon: 'fridge' as const },
    { label: 'Freezer', stats: freezerStats, onOpen: openFreezer, icon: 'snow' as const },
    { label: 'Spare Fridge', stats: spareStats, onOpen: openSpare, icon: 'fridge' as const },
    { label: 'Spare Freezer', stats: spareFreezerStats, onOpen: openSpareFreezer, icon: 'snow' as const },
  ];
  return (
    <div className="noscroll absolute inset-0 overflow-y-auto px-5 pt-6 pb-[100px]">
      <div className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: accent }}>Kitchen Inventory</div>
      <div className="text-[26px] font-extrabold mt-1" style={{ color: text }}>Our Kitchen</div>
      <div className="text-sm mt-1" style={{ color: muted }}>{totalItems} items across 5 locations</div>

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
            <div className="flex-1 rounded-2xl p-4" style={{ background: card, border: `1.5px solid ${border}` }}>
              <div className="text-[22px] font-extrabold" style={{ color: errorColor }}>{expiringSoonCount}</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: muted }}>expiring soon</div>
            </div>
          )}
        </div>
      )}

      <div className="text-[15px] font-bold mt-7 mb-3" style={{ color: text }}>Storage</div>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.label} onClick={c.onOpen} className="relative rounded-2xl p-4 cursor-pointer" style={{ background: card, border: `1.5px solid ${border}` }}>
            {c.stats.alerts > 0 && (
              <div className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full text-white text-[11px] font-bold flex items-center justify-center" style={{ background: errorColor }}>
                {c.stats.alerts}
              </div>
            )}
            <StorageIcon kind={c.icon} />
            <div className="text-[15px] font-bold mt-2.5" style={{ color: text }}>{c.label}</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: muted }}>{c.stats.count} items</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StorageIcon({ kind }: { kind: 'box' | 'fridge' | 'snow' }) {
  if (kind === 'fridge') {
    return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M6 9h12M9 5.5v2M9 12v2" /></svg>;
  }
  if (kind === 'snow') {
    return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M5 7l14 10M19 7 5 17M3 12h18" /></svg>;
  }
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M12 4v16M9 8v.01M15 8v.01" /></svg>;
}

function RowCard({ row }: { row: { id: string; name: string; dotColor: string; meta?: string; metaColor?: string; hasBadge: boolean; badgeText: string; badgeStyle: { background: string; color: string } | null; onOpen?: () => void } }) {
  return (
    <div onClick={row.onOpen} className="flex items-center gap-3 rounded-2xl px-3.5 py-3 mb-2 cursor-pointer" style={{ background: card, border: `1.5px solid ${border}` }}>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: row.dotColor }} />
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-semibold" style={{ color: text }}>{row.name}</div>
        {row.meta && <div className="text-[12.5px] mt-0.5" style={{ color: row.metaColor || muted }}>{row.meta}</div>}
      </div>
      {row.hasBadge && (
        <div className="shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-full" style={row.badgeStyle || {}}>{row.badgeText}</div>
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={border} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M9 5l7 7-7 7" /></svg>
    </div>
  );
}

function LocationScreen(props: { label: string; count: number; showFilters: boolean; filterChips: { id: string | null; label: string; style: CSSProperties; onClick: () => void }[]; sections: Section[]; onBack: () => void }) {
  const { label, count, showFilters, filterChips, sections, onBack } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-5 pb-3 shrink-0">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[24px] font-extrabold mt-2.5" style={{ color: text }}>{label}</div>
        <div className="text-[13.5px] mt-0.5" style={{ color: muted }}>{count} items</div>
        {showFilters && (
          <div className="noscroll flex gap-2 mt-3.5 overflow-x-auto pb-0.5">
            {filterChips.map((c) => <Chip key={String(c.id)} label={c.label} style={c.style} onClick={c.onClick} />)}
          </div>
        )}
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-10">
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

function ItemDetailScreen(props: { item: ReturnType<typeof decorateItem>; statusOptions: { label: string; style: CSSProperties; onClick: () => void }[]; onClose: () => void; onRemove: () => void }) {
  const { item, statusOptions, onClose, onRemove } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onClose} />
        <div className="w-full rounded-2xl mt-4 flex items-center justify-center" style={{ aspectRatio: '16/10', background: section }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" /><path d="M4 8l8 4 8-4M12 12v8" /></svg>
        </div>
        <div className="text-[22px] font-extrabold mt-4.5" style={{ color: text }}>{item.name}</div>
        <div className="flex flex-wrap gap-2 mt-2.5">
          <div className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: hexToRgba(item.catColor, 0.16), color: item.catColor }}>{item.catLabel}</div>
          <div className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: section, color: text }}>{item.fullLocationLabel}</div>
          {item.hasStore && <div className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: section, color: text }}>{item.storeLabel}</div>}
        </div>
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>Status</div>
        <div className="grid grid-cols-3 gap-2">
          {statusOptions.map((o) => (
            <div key={o.label} onClick={o.onClick} className="text-center px-1 py-2.5 rounded-xl text-[12.5px] font-semibold cursor-pointer" style={o.style}>{o.label}</div>
          ))}
        </div>
        {item.hasDate && (
          <>
            <div className="text-[12.5px] font-bold uppercase tracking-wide mt-6 mb-2" style={{ color: muted }}>{item.dateType === 'consume-by' ? 'Consume By' : 'Expiry'}</div>
            <div className="flex items-center gap-2.5 rounded-2xl p-3.5" style={{ background: card, border: `1.5px solid ${border}` }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={item.dateColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
              <div className="text-[14.5px] font-semibold" style={{ color: item.dateColor }}>{item.dateText}</div>
            </div>
          </>
        )}
        <div onClick={onRemove} className="mt-7 text-center text-[13.5px] font-semibold cursor-pointer" style={{ color: errorColor }}>Remove Item</div>
      </div>
    </div>
  );
}

function Add1Screen(props: { onCancel: () => void; onTakePhoto: (e: ChangeEvent<HTMLInputElement>) => void; photoLoading: boolean; onStartReceiptScan: () => void; onEnterManually: () => void }) {
  const { onCancel, onTakePhoto, photoLoading, onStartReceiptScan, onEnterManually } = props;
  return (
    <div className="absolute inset-0 flex flex-col px-5 pt-5 pb-6">
      <BackLink label="Cancel" onClick={onCancel} />
      <div className="text-[24px] font-extrabold mt-3.5" style={{ color: text }}>Add New Item</div>
      <div className="text-[13.5px] mt-1" style={{ color: muted }}>Snap a photo and Claude will identify it.</div>
      <label className="mt-6 flex-1 rounded-[20px] flex flex-col items-center justify-center gap-2.5 cursor-pointer" style={{ border: `2px dashed ${border}`, background: card }}>
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onTakePhoto} />
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: '#f7e3e5' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></svg>
        </div>
        <div className="text-[14.5px] font-semibold" style={{ color: text }}>{photoLoading ? 'Identifying…' : 'Tap to take a photo'}</div>
      </label>
      <div onClick={onStartReceiptScan} className="mt-4 text-center text-[13.5px] font-semibold cursor-pointer" style={{ color: accent }}>Scan a grocery receipt instead</div>
      <div onClick={onEnterManually} className="mt-3 text-center text-[13.5px] font-semibold cursor-pointer" style={{ color: accent }}>Enter details manually instead</div>
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
  onSubmit: () => void; submitDisabled: boolean;
}) {
  const { items, includedCount, storeChips, expandedId, onCancel, onToggleExpand, onToggleInclude, onNameChange, onBinChange, onDateChange, onToggleSkipDate, onRemove, pickCategory, pickLocation, onSubmit, submitDisabled } = props;
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
          const cat = CATEGORY_MAP[it.category];
          const loc = LOCATION_MAP[it.location];
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
                    {LOCATIONS.map((l) => <Chip key={l.id} label={l.label} style={neutralChipStyle(it.location === l.id)} onClick={pickLocation(it.tempId, l.id)} />)}
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

function Add2Screen(props: { hasPhoto: boolean; name: string; onNameChange: (e: ChangeEvent<HTMLInputElement>) => void; categoryChips: { id: string; label: string; style: CSSProperties; onClick: () => void }[]; onBack: () => void; onContinue: () => void }) {
  const { hasPhoto, name, onNameChange, categoryChips, onBack, onContinue } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Confirm Details</div>
        {hasPhoto && <div className="inline-block mt-3.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#f7e3e5', color: accent }}>Detected automatically — edit if needed</div>}
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Item name</div>
        <input value={name} onChange={onNameChange} placeholder="e.g. Baby Spinach" className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Category</div>
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
  dateHeading: string; showDateInput: boolean; date: string; onDateChange: (e: ChangeEvent<HTMLInputElement>) => void;
  skipDate: boolean; onToggleSkipDate: () => void; onBack: () => void; onSave: () => void;
}) {
  const { locationChips, isPantry, bin, onBinChange, binChips, storeChips, dateHeading, showDateInput, date, onDateChange, skipDate, onToggleSkipDate, onBack, onSave } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Storage Details</div>
        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Where does this go?</div>
        <div className="flex flex-wrap gap-2">{locationChips.map((c) => <Chip key={c.id} label={c.label} style={c.style} onClick={c.onClick} />)}</div>
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
            {sec.rows.map((row) => (
              <div key={row.id} className="flex items-center gap-3 rounded-2xl px-3.5 py-3 mb-2" style={{ background: card, border: `1.5px solid ${border}` }}>
                <div onClick={row.onCheck} className="shrink-0 w-6 h-6 rounded-full cursor-pointer" style={{ border: '2px solid #a6a496' }} />
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: row.dotColor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold" style={{ color: text }}>{row.name}</div>
                  {row.hasMeta && <div className="text-[12.5px] mt-0.5" style={{ color: muted }}>{row.meta}</div>}
                </div>
                {row.hasBadge && <div className="shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-full" style={row.badgeStyle || {}}>{row.badgeText}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipesScreen(props: {
  filterChips: { id: string; label: string; style: CSSProperties; onClick: () => void }[];
  recipes: { id: string; name: string; hasPhoto: boolean; photoDataUrl: string; readyLabel: string; readyBadgeStyle: CSSProperties; plannedLabel: string; plannedStyle: CSSProperties; onTogglePlanned: () => void; onOpen: () => void }[];
  empty: boolean; filteredEmpty: boolean; onAdd: () => void;
}) {
  const { filterChips, recipes, empty, filteredEmpty, onAdd } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="px-5 pt-6 pb-3 shrink-0">
        <div className="text-[26px] font-extrabold" style={{ color: text }}>Recipes</div>
        <div className="flex gap-2 mt-3.5">{filterChips.map((c) => <Chip key={c.id} label={c.label} style={c.style} onClick={c.onClick} />)}</div>
      </div>
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-[100px]">
        {empty && (
          <div className="text-center py-16 px-5">
            <div className="text-sm" style={{ color: muted }}>No recipes yet — add the ones you cook at home.</div>
            <button onClick={onAdd} className="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: accent }}>Add a Recipe</button>
          </div>
        )}
        {filteredEmpty && <div className="text-center py-16 px-5 text-sm" style={{ color: muted }}>Nothing&apos;s ready to cook right now.</div>}
        {recipes.map((r) => (
          <div key={r.id} onClick={r.onOpen} className="flex gap-3 rounded-2xl p-3 mb-2.5 cursor-pointer" style={{ background: card, border: `1.5px solid ${border}` }}>
            <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden flex items-center justify-center" style={{ background: section }}>
              {r.hasPhoto ? <img src={r.photoDataUrl} alt="" className="w-full h-full object-cover" /> : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9a2 2 0 0 1 2 2v15l-6.5-3.5L4 20V5a2 2 0 0 1 2-2z" /></svg>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              <div className="text-[14.5px] font-semibold truncate" style={{ color: text }}>{r.name}</div>
              <div className="flex items-center gap-2">
                <div className="text-[11.5px] font-bold px-2 py-0.5 rounded-full inline-block" style={r.readyBadgeStyle}>{r.readyLabel}</div>
              </div>
              <div onClick={(e) => { e.stopPropagation(); r.onTogglePlanned(); }} className="text-[12px] font-bold px-2.5 py-1 rounded-lg inline-block w-fit cursor-pointer" style={r.plannedStyle}>{r.plannedLabel}</div>
            </div>
          </div>
        ))}
      </div>
      {!empty && (
        <button onClick={onAdd} className="absolute bottom-[110px] right-5 w-12 h-12 rounded-full text-white flex items-center justify-center shadow-lg" style={{ background: accent }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
    </div>
  );
}

function RecipeDetailScreen(props: {
  recipe: Recipe & { readiness: ReturnType<typeof recipeReadiness>; readyLabel: string };
  ingredientRows: { ingId: string; text: string; statusText: string; statusColor: string; dotColor: string }[];
  onClose: () => void; onEdit: () => void; onDelete: () => void; onTogglePlanned: () => void;
}) {
  const { recipe, ingredientRows, onClose, onEdit, onDelete, onTogglePlanned } = props;
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
        <div className="inline-block mt-2.5 px-3 py-1.5 rounded-full text-[12.5px] font-bold" style={recipe.readiness.ready ? { background: hexToRgba('#4d7a1e', 0.16), color: '#3d6218' } : { background: section, color: muted }}>{recipe.readyLabel}</div>
        {hasServings && <div className="text-[12.5px] mt-2" style={{ color: muted }}>Makes {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}</div>}

        <div onClick={onTogglePlanned} className="mt-3.5 text-center p-2.5 rounded-2xl text-sm font-bold cursor-pointer" style={recipe.planned ? { background: accent, color: 'white' } : { background: card, border: `1.5px solid ${border}`, color: accent }}>
          {recipe.planned ? 'Planned to Cook ✓' : 'Plan to Cook'}
        </div>

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
          <div onClick={onEdit} className="flex-1 text-center p-3 rounded-2xl text-[13.5px] font-bold cursor-pointer" style={{ background: card, border: `1.5px solid ${border}`, color: text }}>Edit Recipe</div>
          <div onClick={onDelete} className="flex-1 text-center p-3 rounded-2xl text-[13.5px] font-bold cursor-pointer" style={{ background: card, border: `1.5px solid ${border}`, color: errorColor }}>Delete</div>
        </div>
      </div>
    </div>
  );
}

function RecipeAdd1Screen(props: {
  title: string; name: string; onNameChange: (e: ChangeEvent<HTMLInputElement>) => void;
  servings: string; onServingsChange: (e: ChangeEvent<HTMLInputElement>) => void;
  ingredientText: string; onIngredientTextChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  instructions: string; onInstructionsChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  parseLoading: boolean; parseProblem: boolean; parseErrorText: string;
  onCancel: () => void; onContinue: () => void; onSkipManual: () => void;
}) {
  const { title, name, onNameChange, servings, onServingsChange, ingredientText, onIngredientTextChange, instructions, onInstructionsChange, parseLoading, parseProblem, parseErrorText, onCancel, onContinue, onSkipManual } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Cancel" onClick={onCancel} />
        <div className="text-2xl font-extrabold mt-3.5" style={{ color: text }}>{title}</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>Paste the ingredient list and we&apos;ll sort it into something we can check against your kitchen.</div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Recipe name</div>
        <input value={name} onChange={onNameChange} placeholder="e.g. Chicken Tikka Masala" className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Servings</div>
        <input value={servings} onChange={onServingsChange} placeholder="e.g. 4" type="number" min={1} className="w-full h-[46px] rounded-xl px-3.5 text-[15px] outline-none" style={{ border: `1.5px solid ${border}`, background: card, color: text }} />
        <div className="text-xs mt-1" style={{ color: '#a6a496' }}>Used to estimate nutrition per serving.</div>

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Ingredients</div>
        <textarea value={ingredientText} onChange={onIngredientTextChange} placeholder="Paste ingredients here, one per line…" className="w-full h-[140px] rounded-xl p-3.5 text-sm outline-none resize-none" style={{ border: `1.5px solid ${border}`, background: card, color: text, fontFamily: 'inherit' }} />

        <div className="text-[12.5px] font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: muted }}>Instructions (optional)</div>
        <textarea value={instructions} onChange={onInstructionsChange} placeholder="Paste or type the steps…" className="w-full h-[100px] rounded-xl p-3.5 text-sm outline-none resize-none" style={{ border: `1.5px solid ${border}`, background: card, color: text, fontFamily: 'inherit' }} />

        {parseLoading && <div className="mt-4 text-center text-[13.5px] font-semibold" style={{ color: muted }}>Sorting your ingredients…</div>}
        {parseProblem && <div className="mt-4 p-3.5 rounded-xl text-[13px] font-semibold" style={{ background: card, border: `1.5px solid ${border}`, color: errorColor }}>{parseErrorText}</div>}

        <div onClick={onSkipManual} className="mt-4 text-center text-[13.5px] font-semibold cursor-pointer" style={{ color: accent }}>Add ingredients one at a time instead</div>
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onContinue} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold" style={{ background: accent }}>Continue</button>
      </div>
    </div>
  );
}

function RecipeAdd2Screen(props: {
  rows: { ingId: string; name: string; quantity: string; summaryLine: string; catDot: string; isExpanded: boolean; onToggleExpand: () => void; onNameChange: (e: ChangeEvent<HTMLInputElement>) => void; onQuantityChange: (e: ChangeEvent<HTMLInputElement>) => void; categoryChips: { id: string | null; label: string; style: CSSProperties; onClick: () => void }[]; onRemove: () => void }[];
  onAddBlank: () => void; onBack: () => void; onContinue: () => void; continueDisabled: boolean;
}) {
  const { rows, onAddBlank, onBack, onContinue, continueDisabled } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Review Ingredients</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>Tap any ingredient to fix the name or category before saving.</div>

        {rows.map((row) => (
          <div key={row.ingId} className="rounded-2xl p-3.5 mt-3" style={{ background: card, border: `1.5px solid ${border}` }}>
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: row.catDot }} />
              <div onClick={row.onToggleExpand} className="flex-1 min-w-0 cursor-pointer">
                <div className="text-[14.5px] font-semibold capitalize" style={{ color: text }}>{row.name}</div>
                <div className="text-xs mt-0.5" style={{ color: muted }}>{row.summaryLine}</div>
              </div>
              <div onClick={row.onToggleExpand} className="cursor-pointer shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a6a496" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </div>
            </div>
            {row.isExpanded && (
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${border}` }}>
                <input value={row.name} onChange={row.onNameChange} placeholder="Ingredient name" className="w-full h-[42px] rounded-[10px] px-3 text-sm outline-none" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                <input value={row.quantity} onChange={row.onQuantityChange} placeholder="Quantity (optional)" className="w-full h-[42px] rounded-[10px] px-3 text-sm outline-none mt-2" style={{ border: `1.5px solid ${border}`, background: 'white', color: text }} />
                <div className="text-[11.5px] font-bold uppercase tracking-wide mt-3.5 mb-1.5" style={{ color: muted }}>Category</div>
                <div className="flex flex-wrap gap-1.5">
                  {row.categoryChips.map((c) => <Chip key={String(c.id)} label={c.label} style={c.style} onClick={c.onClick} />)}
                </div>
                <div onClick={row.onRemove} className="mt-3.5 text-center text-[12.5px] font-semibold cursor-pointer" style={{ color: errorColor }}>Remove this ingredient</div>
              </div>
            )}
          </div>
        ))}

        <div onClick={onAddBlank} className="mt-3.5 text-center p-3 rounded-xl text-[13.5px] font-semibold cursor-pointer" style={{ border: `1.5px dashed ${border}`, color: accent }}>+ Add an ingredient</div>
      </div>
      <div className="shrink-0 px-5 pt-3.5 pb-5.5" style={{ borderTop: `1px solid ${border}` }}>
        <button onClick={onContinue} disabled={continueDisabled} className="w-full h-12 rounded-2xl text-white text-[15px] font-bold disabled:opacity-50" style={{ background: accent }}>Continue</button>
      </div>
    </div>
  );
}

function RecipeAdd3Screen(props: {
  hasPhoto: boolean; photoDataUrl: string; photoLoading: boolean;
  onPhotoChange: (e: ChangeEvent<HTMLInputElement>) => void; onRemovePhoto: () => void;
  onBack: () => void; onSave: () => void; saveLabel: string; saveDisabled: boolean;
}) {
  const { hasPhoto, photoDataUrl, photoLoading, onPhotoChange, onRemovePhoto, onBack, onSave, saveLabel, saveDisabled } = props;
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="noscroll flex-1 min-h-0 overflow-y-auto px-5 py-5">
        <BackLink label="Back" onClick={onBack} />
        <div className="text-[22px] font-extrabold mt-3.5" style={{ color: text }}>Add a Photo</div>
        <div className="text-[13.5px] mt-1" style={{ color: muted }}>Optional, but it makes the recipe book nicer to browse.</div>

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

function BottomNav(props: { activeTab: string; onHome: () => void; onRecipes: () => void; onGrocery: () => void; onAdd: () => void }) {
  const { activeTab, onHome, onRecipes, onGrocery, onAdd } = props;
  const homeColor = activeTab === 'home' ? accent : '#a6a496';
  const groceryColor = activeTab === 'grocery' ? accent : '#a6a496';
  const recipesColor = activeTab === 'recipes' ? accent : '#a6a496';
  return (
    <div className="relative shrink-0 h-[86px] flex items-start justify-around pt-2.5" style={{ background: card, borderTop: `1px solid ${border}` }}>
      <div onClick={onHome} className="flex flex-col items-center gap-0.5 cursor-pointer w-[70px]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={homeColor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" /></svg>
        <div className="text-[11.5px] font-semibold" style={{ color: homeColor }}>Home</div>
      </div>
      <div onClick={onRecipes} className="flex flex-col items-center gap-0.5 cursor-pointer w-[70px]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={recipesColor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9a2 2 0 0 1 2 2v15l-6.5-3.5L4 20V5a2 2 0 0 1 2-2z" /></svg>
        <div className="text-[11.5px] font-semibold" style={{ color: recipesColor }}>Recipes</div>
      </div>
      <div onClick={onAdd} className="relative -top-[22px] w-14 h-14 rounded-full flex items-center justify-center cursor-pointer shadow-lg" style={{ background: accent }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </div>
      <div onClick={onGrocery} className="flex flex-col items-center gap-0.5 cursor-pointer w-[70px]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={groceryColor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M3 4h2l2.4 12.2a1.5 1.5 0 0 0 1.48 1.3h8.24a1.5 1.5 0 0 0 1.47-1.2L21 8H6" /></svg>
        <div className="text-[11.5px] font-semibold" style={{ color: groceryColor }}>Grocery</div>
      </div>
    </div>
  );
}

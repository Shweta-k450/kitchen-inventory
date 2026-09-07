'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection, doc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { getDb, firebaseConfigured } from '@/lib/firebase';
import { INITIAL_ITEMS } from '@/lib/constants';
import type { Item, Recipe, ManualGroceryItem, MealPlanEntry, PreparedFood, LocationDef } from '@/lib/types';

// Firestore rejects document IDs matching /__.*__/, so this can't be "__settings__".
const PLAN_SETTINGS_ID = 'settings';

export type SyncStatus = 'connecting' | 'synced' | 'unavailable' | 'error';

export function useKitchenData() {
  const [items, setItems] = useState<Item[]>([]);
  const [customLocations, setCustomLocations] = useState<LocationDef[]>([]);
  const [groceryExtras, setGroceryExtras] = useState<ManualGroceryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealPlanEntries, setMealPlanEntries] = useState<MealPlanEntry[]>([]);
  const [mealPlanShopWeek, setMealPlanShopWeek] = useState<string | null>(null);
  const [preparedFood, setPreparedFood] = useState<PreparedFood[]>([]);
  const [status, setStatus] = useState<SyncStatus>(firebaseConfigured ? 'connecting' : 'unavailable');
  const seededRef = useRef(false);

  useEffect(() => {
    if (!firebaseConfigured) {
      return;
    }
    const db = getDb();
    if (!db) {
      return;
    }

    const unsubItems = onSnapshot(
      collection(db, 'items'),
      (snap) => {
        if (snap.empty && !seededRef.current) {
          seededRef.current = true;
          const batch = writeBatch(db);
          INITIAL_ITEMS.forEach((it) => {
            const { id, ...body } = it;
            batch.set(doc(db, 'items', id), body);
          });
          batch.commit().catch(() => {});
          return;
        }
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }));
        setItems(next);
        setStatus('synced');
      },
      () => setStatus('error')
    );

    const unsubLocations = onSnapshot(
      collection(db, 'locations'),
      (snap) => {
        setCustomLocations(snap.docs.map((d) => {
          const l = d.data() as Partial<Omit<LocationDef, 'id'>>;
          return { id: d.id, label: l.label || '', color: l.color || '', icon: l.icon || 'box' };
        }));
      },
      () => {}
    );

    const unsubGrocery = onSnapshot(
      collection(db, 'groceryExtras'),
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ManualGroceryItem, 'id'>) }));
        setGroceryExtras(next);
      },
      () => {}
    );

    const unsubRecipes = onSnapshot(
      collection(db, 'recipes'),
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recipe, 'id'>) }));
        setRecipes(next);
      },
      () => {}
    );

    const unsubPlan = onSnapshot(
      collection(db, 'mealPlan'),
      (snap) => {
        const entries: MealPlanEntry[] = [];
        let shopWeek: string | null = null;
        snap.docs.forEach((d) => {
          if (d.id === PLAN_SETTINGS_ID) {
            const s = d.data() as { shopWeekOf?: string | null };
            shopWeek = s.shopWeekOf ?? null;
          } else {
            const e = d.data() as Omit<MealPlanEntry, 'id'>;
            entries.push({
              id: d.id,
              recipeId: e.recipeId,
              date: e.date,
              servings: e.servings,
              cooked: e.cooked ?? false,
              cookedAt: e.cookedAt ?? null,
              preparedId: e.preparedId ?? null,
            });
          }
        });
        setMealPlanEntries(entries);
        setMealPlanShopWeek(shopWeek);
      },
      () => {}
    );

    const unsubPrepared = onSnapshot(
      collection(db, 'preparedFood'),
      (snap) => {
        setPreparedFood(snap.docs.map((d) => {
          const p = d.data() as Omit<PreparedFood, 'id'>;
          return { id: d.id, ...p, deductions: p.deductions || [], eaten: p.eaten || [] };
        }));
      },
      () => {}
    );

    return () => {
      unsubItems();
      unsubLocations();
      unsubGrocery();
      unsubRecipes();
      unsubPlan();
      unsubPrepared();
    };
  }, []);

  const setItemStatus = useCallback((id: string, patch: Partial<Item>) => {
    const db = getDb();
    if (!db) return;
    updateDoc(doc(db, 'items', id), patch).catch(() => {});
  }, []);

  /** Patch arbitrary fields on an existing item (location, bin, …). */
  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    const db = getDb();
    if (!db) return;
    updateDoc(doc(db, 'items', id), patch).catch(() => {});
  }, []);

  const saveItem = useCallback((id: string | null, body: Omit<Item, 'id'>) => {
    const db = getDb();
    if (!db) return;
    const finalId = id || 'item' + Date.now();
    setDoc(doc(db, 'items', finalId), body, { merge: true }).catch(() => {});
  }, []);

  const removeItem = useCallback((id: string) => {
    const db = getDb();
    if (!db) return;
    deleteDoc(doc(db, 'items', id)).catch(() => {});
  }, []);

  const addReceiptItems = useCallback((newItems: Omit<Item, 'id'>[]) => {
    const db = getDb();
    if (!db) return;
    const batch = writeBatch(db);
    newItems.forEach((body, i) => {
      const id = 'item' + Date.now() + '-' + i;
      batch.set(doc(db, 'items', id), body);
    });
    batch.commit().catch(() => {});
  }, []);

  const addLocation = useCallback((loc: LocationDef) => {
    const db = getDb();
    if (!db) return;
    const { id, ...body } = loc;
    setDoc(doc(db, 'locations', id), body).catch(() => {});
  }, []);

  /** Patch a location's label/color/icon. For a built-in id this writes an override doc. */
  const updateLocation = useCallback((id: string, patch: Partial<Omit<LocationDef, 'id'>>) => {
    const db = getDb();
    if (!db || !id) return;
    setDoc(doc(db, 'locations', id), patch, { merge: true }).catch(() => {});
  }, []);

  /** Rename a pantry bin everywhere it's used (one batch over the matching items). */
  const renameBin = useCallback((fromBin: string, toBin: string, allItems: Item[]) => {
    const db = getDb();
    const to = toBin.trim();
    if (!db || !to) return;
    const from = fromBin.trim().toLowerCase();
    const affected = allItems.filter((i) => i.location === 'pantry' && (i.bin || '').trim().toLowerCase() === from);
    if (!affected.length) return;
    const batch = writeBatch(db);
    affected.forEach((i) => batch.update(doc(db, 'items', i.id), { bin: to }));
    batch.commit().catch(() => {});
  }, []);

  const addManualGroceryItem = useCallback((name: string) => {
    const db = getDb();
    if (!db) return;
    const id = 'manual' + Date.now();
    setDoc(doc(db, 'groceryExtras', id), { name }).catch(() => {});
  }, []);

  const removeManualGroceryItem = useCallback((id: string) => {
    const db = getDb();
    if (!db) return;
    deleteDoc(doc(db, 'groceryExtras', id)).catch(() => {});
  }, []);

  const saveRecipe = useCallback((id: string | null, body: Omit<Recipe, 'id'>) => {
    const db = getDb();
    if (!db) return id;
    const finalId = id || 'rec' + Date.now();
    setDoc(doc(db, 'recipes', finalId), body, { merge: !!id }).catch(() => {});
    return finalId;
  }, []);

  const updateRecipe = useCallback((id: string, patch: Partial<Recipe>) => {
    const db = getDb();
    if (!db) return;
    updateDoc(doc(db, 'recipes', id), patch).catch(() => {});
  }, []);

  const deleteRecipe = useCallback((id: string) => {
    const db = getDb();
    if (!db) return;
    deleteDoc(doc(db, 'recipes', id)).catch(() => {});
  }, []);

  const addMealPlanEntry = useCallback((recipeId: string, date: string, servings: number) => {
    const db = getDb();
    if (!db) return;
    const id = 'mpe' + Date.now() + Math.floor(Math.random() * 1000);
    setDoc(doc(db, 'mealPlan', id), { recipeId, date, servings }).catch(() => {});
  }, []);

  const addMealPlanEntries = useCallback((rows: { recipeId: string; date: string; servings: number }[]) => {
    const db = getDb();
    if (!db || !rows.length) return;
    const batch = writeBatch(db);
    rows.forEach((r, i) => {
      batch.set(doc(db, 'mealPlan', 'mpe' + Date.now() + '-' + i), r);
    });
    batch.commit().catch(() => {});
  }, []);

  const updateMealPlanEntry = useCallback((id: string, patch: Partial<MealPlanEntry>) => {
    const db = getDb();
    if (!db) return;
    updateDoc(doc(db, 'mealPlan', id), patch).catch(() => {});
  }, []);

  const removeMealPlanEntry = useCallback((id: string) => {
    const db = getDb();
    if (!db) return;
    deleteDoc(doc(db, 'mealPlan', id)).catch(() => {});
  }, []);

  const setShopWeek = useCallback((mondayIso: string | null) => {
    const db = getDb();
    if (!db) return;
    setDoc(doc(db, 'mealPlan', PLAN_SETTINGS_ID), { shopWeekOf: mondayIso }).catch(() => {});
  }, []);

  const updatePreparedFood = useCallback((id: string, patch: Partial<PreparedFood>) => {
    const db = getDb();
    if (!db) return;
    updateDoc(doc(db, 'preparedFood', id), patch).catch(() => {});
  }, []);

  const removePreparedFood = useCallback((id: string) => {
    const db = getDb();
    if (!db) return;
    deleteDoc(doc(db, 'preparedFood', id)).catch(() => {});
  }, []);

  /** Cook a planned recipe: one batch creates the dish, patches the used items, and marks the entry cooked. */
  const cookRecipe = useCallback((args: {
    entryId: string;
    cookedAt: string;
    prepared: Omit<PreparedFood, 'id'>;
    itemPatches: { id: string; patch: Partial<Item> }[];
  }) => {
    const db = getDb();
    if (!db) return;
    const batch = writeBatch(db);
    const preparedId = 'pf' + Date.now();
    batch.set(doc(db, 'preparedFood', preparedId), args.prepared);
    args.itemPatches.forEach((p) => batch.update(doc(db, 'items', p.id), p.patch));
    batch.update(doc(db, 'mealPlan', args.entryId), { cooked: true, cookedAt: args.cookedAt, preparedId });
    batch.commit().catch(() => {});
  }, []);

  /** Reverse a cook: delete the dish, restore the items, un-mark the entry. */
  const undoCook = useCallback((args: {
    entryId: string | null;
    preparedId: string;
    itemPatches: { id: string; patch: Partial<Item> }[];
  }) => {
    const db = getDb();
    if (!db) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'preparedFood', args.preparedId));
    args.itemPatches.forEach((p) => batch.update(doc(db, 'items', p.id), p.patch));
    if (args.entryId) batch.update(doc(db, 'mealPlan', args.entryId), { cooked: false, cookedAt: null, preparedId: null });
    batch.commit().catch(() => {});
  }, []);

  /**
   * Manually re-fetches everything from Firestore right now, instead of waiting on the
   * live onSnapshot listeners. The listeners should already push updates in real time
   * (e.g. when someone else adds an item), but a phone that's been backgrounded for a
   * while or briefly lost signal can end up with a stalled connection, so this backs a
   * pull-to-refresh gesture as a reliable "get me current data" fallback.
   */
  const refresh = useCallback(async () => {
    const db = getDb();
    if (!db) {
      setStatus('unavailable');
      return;
    }
    try {
      const [itemsSnap, groceriesSnap, recipesSnap, locationsSnap] = await Promise.all([
        getDocs(collection(db, 'items')),
        getDocs(collection(db, 'groceryExtras')),
        getDocs(collection(db, 'recipes')),
        getDocs(collection(db, 'locations')),
      ]);
      setItems(itemsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) })));
      setCustomLocations(locationsSnap.docs.map((d) => {
        const l = d.data() as Omit<LocationDef, 'id'>;
        return { id: d.id, label: l.label, color: l.color, icon: l.icon || 'box' };
      }));
      setGroceryExtras(groceriesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ManualGroceryItem, 'id'>) })));
      setRecipes(recipesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recipe, 'id'>) })));
      setStatus('synced');
    } catch {
      setStatus('error');
      return;
    }
    // Meal plan is a newer collection; if its security rules aren't published yet
    // a failure here shouldn't drag the whole app into an error state.
    try {
      const planSnap = await getDocs(collection(db, 'mealPlan'));
      const planEntries: MealPlanEntry[] = [];
      let shopWeek: string | null = null;
      planSnap.docs.forEach((d) => {
        if (d.id === PLAN_SETTINGS_ID) shopWeek = (d.data() as { shopWeekOf?: string | null }).shopWeekOf ?? null;
        else { const e = d.data() as Omit<MealPlanEntry, 'id'>; planEntries.push({ id: d.id, recipeId: e.recipeId, date: e.date, servings: e.servings, cooked: e.cooked ?? false, cookedAt: e.cookedAt ?? null, preparedId: e.preparedId ?? null }); }
      });
      setMealPlanEntries(planEntries);
      setMealPlanShopWeek(shopWeek);
      const prepSnap = await getDocs(collection(db, 'preparedFood'));
      setPreparedFood(prepSnap.docs.map((d) => {
        const p = d.data() as Omit<PreparedFood, 'id'>;
        return { id: d.id, ...p, deductions: p.deductions || [], eaten: p.eaten || [] };
      }));
    } catch {
      /* meal plan / prepared food unavailable — leave prior state */
    }
  }, []);

  return {
    items, customLocations, groceryExtras, recipes, mealPlanEntries, mealPlanShopWeek, preparedFood, status,
    setItemStatus, updateItem, saveItem, removeItem, addReceiptItems, addLocation, updateLocation, renameBin,
    addManualGroceryItem, removeManualGroceryItem,
    saveRecipe, updateRecipe, deleteRecipe,
    addMealPlanEntry, addMealPlanEntries, updateMealPlanEntry, removeMealPlanEntry, setShopWeek,
    updatePreparedFood, removePreparedFood, cookRecipe, undoCook,
    refresh,
  };
}

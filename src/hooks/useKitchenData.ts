'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection, doc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { getDb, firebaseConfigured } from '@/lib/firebase';
import { INITIAL_ITEMS } from '@/lib/constants';
import type { Item, Recipe, ManualGroceryItem, MealPlanEntry } from '@/lib/types';

const PLAN_SETTINGS_ID = '__settings__';

export type SyncStatus = 'connecting' | 'synced' | 'unavailable' | 'error';

export function useKitchenData() {
  const [items, setItems] = useState<Item[]>([]);
  const [groceryExtras, setGroceryExtras] = useState<ManualGroceryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [mealPlanEntries, setMealPlanEntries] = useState<MealPlanEntry[]>([]);
  const [mealPlanShopWeek, setMealPlanShopWeek] = useState<string | null>(null);
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
            entries.push({ id: d.id, recipeId: e.recipeId, date: e.date, servings: e.servings });
          }
        });
        setMealPlanEntries(entries);
        setMealPlanShopWeek(shopWeek);
      },
      () => {}
    );

    return () => {
      unsubItems();
      unsubGrocery();
      unsubRecipes();
      unsubPlan();
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
      const [itemsSnap, groceriesSnap, recipesSnap, planSnap] = await Promise.all([
        getDocs(collection(db, 'items')),
        getDocs(collection(db, 'groceryExtras')),
        getDocs(collection(db, 'recipes')),
        getDocs(collection(db, 'mealPlan')),
      ]);
      setItems(itemsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) })));
      setGroceryExtras(groceriesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ManualGroceryItem, 'id'>) })));
      setRecipes(recipesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recipe, 'id'>) })));
      const planEntries: MealPlanEntry[] = [];
      let shopWeek: string | null = null;
      planSnap.docs.forEach((d) => {
        if (d.id === PLAN_SETTINGS_ID) shopWeek = (d.data() as { shopWeekOf?: string | null }).shopWeekOf ?? null;
        else { const e = d.data() as Omit<MealPlanEntry, 'id'>; planEntries.push({ id: d.id, recipeId: e.recipeId, date: e.date, servings: e.servings }); }
      });
      setMealPlanEntries(planEntries);
      setMealPlanShopWeek(shopWeek);
      setStatus('synced');
    } catch {
      setStatus('error');
    }
  }, []);

  return {
    items, groceryExtras, recipes, mealPlanEntries, mealPlanShopWeek, status,
    setItemStatus, updateItem, saveItem, removeItem, addReceiptItems,
    addManualGroceryItem, removeManualGroceryItem,
    saveRecipe, deleteRecipe,
    addMealPlanEntry, addMealPlanEntries, updateMealPlanEntry, removeMealPlanEntry, setShopWeek,
    refresh,
  };
}

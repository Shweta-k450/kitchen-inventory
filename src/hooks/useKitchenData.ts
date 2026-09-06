'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { getDb, firebaseConfigured } from '@/lib/firebase';
import { INITIAL_ITEMS } from '@/lib/constants';
import type { Item, Recipe, ManualGroceryItem } from '@/lib/types';

export type SyncStatus = 'connecting' | 'synced' | 'unavailable' | 'error';

export function useKitchenData() {
  const [items, setItems] = useState<Item[]>([]);
  const [groceryExtras, setGroceryExtras] = useState<ManualGroceryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
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

    return () => {
      unsubItems();
      unsubGrocery();
      unsubRecipes();
    };
  }, []);

  const setItemStatus = useCallback((id: string, patch: Partial<Item>) => {
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

  const toggleRecipePlanned = useCallback((id: string, current: boolean) => {
    const db = getDb();
    if (!db) return;
    updateDoc(doc(db, 'recipes', id), { planned: !current }).catch(() => {});
  }, []);

  return {
    items, groceryExtras, recipes, status,
    setItemStatus, saveItem, removeItem, addReceiptItems,
    addManualGroceryItem, removeManualGroceryItem,
    saveRecipe, deleteRecipe, toggleRecipePlanned,
  };
}

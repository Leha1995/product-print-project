import { useCallback, useEffect, useState } from 'react';
import { Category, categories as seedCategories } from '@/data/products';
import { fetchCatalog, pushCategories } from '@/lib/catalogApi';

const CACHE_KEY = 'asap-categories-cache-v2';

const withSeeds = (list: Category[]): Category[] => {
  const known = new Set(list.map((c) => c.id));
  const missing = seedCategories.filter((c) => !known.has(c.id));
  return missing.length ? [...list, ...missing] : list;
};

const readCache = (): Category[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return seedCategories;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return seedCategories;
    return withSeeds(parsed as Category[]);
  } catch {
    return seedCategories;
  }
};

const writeCache = (next: Category[]) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* cache is optional */
  }
};

const slug = (label: string) =>
  `cat-${label
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)}-${Date.now().toString(36).slice(-4)}`;

export const useCategories = () => {
  const [list, setList] = useState<Category[]>(readCache);

  const sync = useCallback((next: Category[]) => {
    setList(next);
    writeCache(next);
    pushCategories(next).catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchCatalog()
      .then((snap) => {
        if (!alive || !snap.categories.length) return;
        const merged = withSeeds(snap.categories);
        setList(merged);
        writeCache(merged);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const addCategory = useCallback(
    (label: string, icon = 'Utensils') => {
      const clean = label.trim();
      if (!clean) return null;
      const item: Category = { id: slug(clean), label: clean, icon };
      setList((prev) => {
        const next = [...prev, item];
        writeCache(next);
        pushCategories(next).catch(() => undefined);
        return next;
      });
      return item;
    },
    [],
  );

  const renameCategory = useCallback((id: string, label: string, icon?: string) => {
    setList((prev) => {
      const next = prev.map((c) =>
        c.id === id ? { ...c, label: label.trim() || c.label, icon: icon ?? c.icon } : c,
      );
      writeCache(next);
      pushCategories(next).catch(() => undefined);
      return next;
    });
  }, []);

  const removeCategory = useCallback((id: string) => {
    setList((prev) => {
      const next = prev.filter((c) => c.id !== id);
      writeCache(next);
      pushCategories(next).catch(() => undefined);
      return next;
    });
  }, []);

  const resetCategories = useCallback(() => sync(seedCategories), [sync]);

  const replaceCategories = useCallback((next: Category[]) => sync(next), [sync]);

  return {
    categories: list,
    addCategory,
    renameCategory,
    removeCategory,
    resetCategories,
    replaceCategories,
  };
};

export default useCategories;

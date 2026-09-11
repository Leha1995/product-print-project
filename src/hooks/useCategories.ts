import { useCallback, useEffect, useState } from 'react';
import { Category, categories as seedCategories } from '@/data/products';

const STORAGE_KEY = 'asap-categories-v1';

const load = (): Category[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedCategories;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as Category[]) : seedCategories;
  } catch {
    return seedCategories;
  }
};

const save = (next: Category[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
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
  const [list, setList] = useState<Category[]>(seedCategories);

  useEffect(() => {
    setList(load());
  }, []);

  const addCategory = useCallback((label: string, icon = 'Utensils') => {
    const clean = label.trim();
    if (!clean) return null;
    const item: Category = { id: slug(clean), label: clean, icon };
    setList((prev) => {
      const next = [...prev, item];
      save(next);
      return next;
    });
    return item;
  }, []);

  const renameCategory = useCallback((id: string, label: string, icon?: string) => {
    setList((prev) => {
      const next = prev.map((c) =>
        c.id === id ? { ...c, label: label.trim() || c.label, icon: icon ?? c.icon } : c,
      );
      save(next);
      return next;
    });
  }, []);

  const removeCategory = useCallback((id: string) => {
    setList((prev) => {
      const next = prev.filter((c) => c.id !== id);
      save(next);
      return next;
    });
  }, []);

  const resetCategories = useCallback(() => {
    setList(seedCategories);
    save(seedCategories);
  }, []);

  return { categories: list, addCategory, renameCategory, removeCategory, resetCategories };
};

export default useCategories;

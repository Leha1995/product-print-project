import { useCallback } from 'react';
import { Category, categories as seedCategories } from '@/data/products';

const slug = (label: string) =>
  `cat-${label
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)}-${Date.now().toString(36).slice(-4)}`;

export const useCategories = (
  list: Category[],
  persist: (next: Category[]) => void | Promise<void>,
) => {
  const addCategory = useCallback(
    (label: string, icon = 'Utensils') => {
      const clean = label.trim();
      if (!clean) return null;
      const item: Category = { id: slug(clean), label: clean, icon };
      persist([...list, item]);
      return item;
    },
    [list, persist],
  );

  const renameCategory = useCallback(
    (id: string, label: string, icon?: string) => {
      persist(
        list.map((c) =>
          c.id === id ? { ...c, label: label.trim() || c.label, icon: icon ?? c.icon } : c,
        ),
      );
    },
    [list, persist],
  );

  const removeCategory = useCallback(
    (id: string) => {
      persist(list.filter((c) => c.id !== id));
    },
    [list, persist],
  );

  const resetCategories = useCallback(() => {
    persist(seedCategories);
  }, [persist]);

  const replaceCategories = useCallback(
    (next: Category[]) => {
      persist(next);
    },
    [persist],
  );

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

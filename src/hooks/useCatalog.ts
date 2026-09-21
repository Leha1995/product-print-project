import { useCallback, useEffect, useState } from 'react';
import { Category, Product, categories as seedCategories, products as seedProducts } from '@/data/products';
import {
  UserPrefs,
  deleteProduct,
  fetchCatalog,
  pushCategories,
  pushPrefs,
  pushProduct,
  replaceAll,
  seedCatalog,
} from '@/lib/catalogApi';
import { toast } from '@/hooks/use-toast';

export const useCatalog = (userId?: number | null) => {
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [prefs, setPrefs] = useState<UserPrefs>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!userId) {
      setItems([]);
      setCategories([]);
      setPrefs({});
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        let snap = await fetchCatalog();
        if (!snap.seeded) {
          const res = await seedCatalog(seedProducts, seedCategories);
          snap = {
            products: res.products ?? seedProducts,
            categories: res.categories ?? seedCategories,
            prefs: {},
            seeded: true,
          };
        }
        if (!alive) return;
        setItems(snap.products);
        setCategories(snap.categories.length ? snap.categories : seedCategories);
        setPrefs(snap.prefs);
      } catch {
        if (alive) toast({ title: 'Не удалось загрузить ваш каталог' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const saveProduct = useCallback(async (product: Product) => {
    try {
      const res = await pushProduct(product);
      setItems(res.products ?? []);
    } catch {
      toast({ title: 'Не удалось сохранить продукт' });
    }
  }, []);

  const removeProduct = useCallback(async (id: string) => {
    try {
      const res = await deleteProduct(id);
      setItems(res.products ?? []);
    } catch {
      toast({ title: 'Не удалось удалить продукт' });
    }
  }, []);

  const replaceCatalog = useCallback(async (next: Product[]) => {
    try {
      const res = await replaceAll(next);
      setItems(res.products ?? next);
    } catch {
      toast({ title: 'Не удалось обновить каталог' });
    }
  }, []);

  const resetCatalog = useCallback(async () => {
    await replaceCatalog(seedProducts);
  }, [replaceCatalog]);

  const saveCategories = useCallback(async (next: Category[]) => {
    setCategories(next);
    try {
      await pushCategories(next);
    } catch {
      toast({ title: 'Не удалось сохранить категории' });
    }
  }, []);

  const savePrefs = useCallback((next: UserPrefs) => {
    setPrefs(next);
    pushPrefs(next).catch(() => undefined);
  }, []);

  return {
    items,
    categories,
    prefs,
    loading,
    saveProduct,
    removeProduct,
    resetCatalog,
    replaceCatalog,
    saveCategories,
    savePrefs,
  };
};

export default useCatalog;

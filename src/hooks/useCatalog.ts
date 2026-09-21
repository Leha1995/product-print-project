import { useCallback, useEffect, useState } from 'react';
import { Category, Product, categories as seedCategories, products as seedProducts } from '@/data/products';
import {
  PrintHistoryMap,
  UserPrefs,
  deleteProduct,
  fetchCatalog,
  pushCategories,
  pushHistory,
  pushPrefs,
  pushProduct,
  pushProducts,
  replaceAll,
  seedCatalog,
  setTargetUser,
} from '@/lib/catalogApi';
import { toast } from '@/hooks/use-toast';

const LEGACY_KEY = 'asap-print-history-v1';

const readLegacyHistory = (): PrintHistoryMap => {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const clean: PrintHistoryMap = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!key.startsWith('name:') && typeof value === 'number') clean[key] = value;
    });
    return clean;
  } catch {
    return {};
  }
};

const clearLegacyHistory = () => {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage unavailable */
  }
};

export const useCatalog = (userId?: number | null, targetId?: number | null) => {
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [prefs, setPrefs] = useState<UserPrefs>({});
  const [history, setHistory] = useState<PrintHistoryMap>({});
  const [loading, setLoading] = useState(true);

  const viewedId = targetId || userId;
  setTargetUser(targetId && targetId !== userId ? targetId : null);

  useEffect(() => {
    let alive = true;
    if (!viewedId) {
      setItems([]);
      setCategories([]);
      setPrefs({});
      setHistory({});
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
            history: {},
            seeded: true,
          };
        }
        if (!alive) return;
        setItems(snap.products);
        setCategories(snap.categories.length ? snap.categories : seedCategories);
        setPrefs(snap.prefs);

        let merged = snap.history;
        if (!targetId || targetId === userId) {
          const legacy = readLegacyHistory();
          const patch: PrintHistoryMap = {};
          Object.entries(legacy).forEach(([key, stamp]) => {
            if (typeof stamp === 'number' && stamp > (merged[key] ?? 0)) patch[key] = stamp;
          });
          if (Object.keys(patch).length) {
            merged = { ...merged, ...patch };
            pushHistory(patch).catch(() => undefined);
          }
          clearLegacyHistory();
        }
        setHistory(merged);
      } catch {
        if (alive) toast({ title: 'Не удалось загрузить ваш каталог' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [viewedId]);

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

  const addProducts = useCallback(async (list: Product[]) => {
    if (!list.length) return 0;
    try {
      let last: Product[] = [];
      for (let i = 0; i < list.length; i += 40) {
        const res = await pushProducts(list.slice(i, i + 40));
        last = res.products ?? last;
      }
      setItems(last);
      return list.length;
    } catch {
      toast({ title: 'Не удалось добавить карточки' });
      return 0;
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

  const saveHistory = useCallback((patch: PrintHistoryMap) => {
    setHistory((prev) => ({ ...prev, ...patch }));
    pushHistory(patch).catch(() => undefined);
  }, []);

  return {
    items,
    categories,
    prefs,
    history,
    saveHistory,
    loading,
    saveProduct,
    addProducts,
    removeProduct,
    resetCatalog,
    replaceCatalog,
    saveCategories,
    savePrefs,
  };
};

export default useCatalog;
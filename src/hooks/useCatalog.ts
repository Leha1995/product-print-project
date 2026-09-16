import { useCallback, useEffect, useState } from 'react';
import { Product, products as seedProducts, categories as seedCategories } from '@/data/products';
import {
  deleteProduct,
  fetchCatalog,
  pushProduct,
  pushProducts,
  replaceAll,
  seedCatalog,
} from '@/lib/catalogApi';
import { toast } from '@/hooks/use-toast';

const CACHE_KEY = 'asap-catalog-cache-v2';

const readCache = (): Product[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return seedProducts;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return seedProducts;
    return parsed as Product[];
  } catch {
    return seedProducts;
  }
};

const writeCache = (list: Product[]) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* cache is optional */
  }
};

export const useCatalog = () => {
  const [items, setItems] = useState<Product[]>(readCache);
  const [syncing, setSyncing] = useState(true);

  const apply = useCallback((list: Product[]) => {
    setItems(list);
    writeCache(list);
  }, []);

  const refresh = useCallback(async () => {
    const snap = await fetchCatalog();
    if (!snap.seeded) {
      const local = readCache();
      const base = local.length ? local : seedProducts;
      const res = await seedCatalog(base, seedCategories);
      apply(res.products ?? base);
      return;
    }
    apply(snap.products);
  }, [apply]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refresh();
      } catch {
        if (alive) {
          toast({ title: 'Нет связи с облаком', description: 'Показан сохранённый каталог' });
        }
      } finally {
        if (alive) setSyncing(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchCatalog()
        .then((snap) => {
          if (snap.seeded) apply(snap.products);
        })
        .catch(() => undefined);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [apply]);

  const saveProduct = useCallback(
    async (product: Product) => {
      setItems((prev) => {
        const exists = prev.some((p) => p.id === product.id);
        return exists ? prev.map((p) => (p.id === product.id ? product : p)) : [product, ...prev];
      });
      try {
        const res = await pushProduct(product);
        apply(res.products ?? []);
      } catch {
        toast({ title: 'Не удалось сохранить в облако', description: 'Проверьте интернет' });
      }
    },
    [apply],
  );

  const removeProduct = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((p) => p.id !== id));
      try {
        const res = await deleteProduct(id);
        apply(res.products ?? []);
      } catch {
        toast({ title: 'Не удалось удалить в облаке' });
      }
    },
    [apply],
  );

  const resetCatalog = useCallback(async () => {
    try {
      const res = await replaceAll(seedProducts, seedCategories);
      apply(res.products ?? seedProducts);
    } catch {
      toast({ title: 'Не удалось сбросить каталог' });
    }
  }, [apply]);

  const replaceCatalog = useCallback(
    async (next: Product[]) => {
      apply(next);
      try {
        const res = await replaceAll(next);
        apply(res.products ?? next);
      } catch {
        toast({ title: 'Не удалось загрузить каталог в облако' });
      }
    },
    [apply],
  );

  const addProducts = useCallback(
    async (list: Product[]) => {
      try {
        const res = await pushProducts(list);
        apply(res.products ?? items);
      } catch {
        toast({ title: 'Не удалось добавить карточки' });
      }
    },
    [apply, items],
  );

  return {
    items,
    syncing,
    refresh,
    saveProduct,
    removeProduct,
    resetCatalog,
    replaceCatalog,
    addProducts,
  };
};

export default useCatalog;

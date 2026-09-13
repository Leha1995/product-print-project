import { useCallback, useEffect, useState } from 'react';
import {
  CATEGORY_IMAGE,
  FALLBACK_IMG,
  Product,
  products as seedProducts,
} from '@/data/products';
import { toast } from '@/hooks/use-toast';

const STORAGE_KEY = 'asap-catalog-v1';

const load = (): Product[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedProducts;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedProducts;
    const clean = (parsed as Product[]).filter((p) => p && p.id && p.name);
    const unique = Array.from(new Map(clean.map((p) => [p.id, p])).values());
    const seedById = new Map(seedProducts.map((p) => [p.id, p]));
    return unique.map((p) =>
      p.image?.trim()
        ? p
        : {
            ...p,
            image:
              seedById.get(p.id)?.image ?? CATEGORY_IMAGE[p.category] ?? FALLBACK_IMG,
          },
    );
  } catch {
    return seedProducts;
  }
};

const write = (next: Product[]): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    try {
      const light = next.map((p) =>
        p.image?.startsWith('data:')
          ? { ...p, image: CATEGORY_IMAGE[p.category] ?? FALLBACK_IMG }
          : p,
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
      toast({
        title: 'Памяти браузера не хватило',
        description: 'Позиции сохранены, но часть загруженных фото пришлось убрать',
      });
      return true;
    } catch {
      toast({
        title: 'Не удалось сохранить каталог',
        description: 'Память браузера переполнена. Выгрузите каталог в файл и очистите список',
      });
      return false;
    }
  }
};

export const useCatalog = () => {
  const [items, setItems] = useState<Product[]>(seedProducts);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(load());
    setReady(true);
  }, []);

  const persist = useCallback((next: Product[]) => {
    setItems(next);
    write(next);
  }, []);

  const saveProduct = useCallback(
    (product: Product) => {
      setItems((prev) => {
        const exists = prev.some((p) => p.id === product.id);
        const next = exists
          ? prev.map((p) => (p.id === product.id ? product : p))
          : [product, ...prev];
        write(next);
        return next;
      });
    },
    [],
  );

  const removeProduct = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      write(next);
      return next;
    });
  }, []);

  const resetCatalog = useCallback(() => persist(seedProducts), [persist]);

  const replaceCatalog = useCallback((next: Product[]) => persist(next), [persist]);

  return { items, ready, saveProduct, removeProduct, resetCatalog, replaceCatalog };
};

export default useCatalog;
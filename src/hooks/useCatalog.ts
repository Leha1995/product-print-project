import { useCallback, useEffect, useState } from 'react';
import { Product, products as seedProducts } from '@/data/products';

const STORAGE_KEY = 'asap-catalog-v1';

const load = (): Product[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedProducts;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as Product[]) : seedProducts;
  } catch {
    return seedProducts;
  }
};

export const useCatalog = () => {
  const [items, setItems] = useState<Product[]>(seedProducts);

  useEffect(() => {
    setItems(load());
  }, []);

  const persist = useCallback((next: Product[]) => {
    setItems(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const saveProduct = useCallback(
    (product: Product) => {
      setItems((prev) => {
        const exists = prev.some((p) => p.id === product.id);
        const next = exists
          ? prev.map((p) => (p.id === product.id ? product : p))
          : [product, ...prev];
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
    },
    [],
  );

  const removeProduct = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const resetCatalog = useCallback(() => persist(seedProducts), [persist]);

  return { items, saveProduct, removeProduct, resetCatalog };
};

export default useCatalog;

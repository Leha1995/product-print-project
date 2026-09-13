import { useCallback, useEffect, useRef, useState } from 'react';
import { Product, products as seedProducts } from '@/data/products';
import {
  IMG_PREFIX,
  compressImage,
  getAllImages,
  putImage,
  removeImage,
} from '@/lib/imageStore';
import { toast } from '@/hooks/use-toast';

const STORAGE_KEY = 'asap-catalog-v1';

const loadRaw = (): Product[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedProducts;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return seedProducts;
    const clean = (parsed as Product[]).filter((p) => p && p.id && p.name);
    return Array.from(new Map(clean.map((p) => [p.id, p])).values());
  } catch {
    return seedProducts;
  }
};

const write = (list: Product[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    toast({
      title: 'Не удалось сохранить каталог',
      description: 'Память браузера переполнена — выгрузите каталог в файл',
    });
  }
};

export const useCatalog = () => {
  const [items, setItems] = useState<Product[]>(seedProducts);
  const imagesRef = useRef<Record<string, string>>({});

  const resolve = useCallback(
    (list: Product[]) =>
      list.map((p) =>
        p.image?.startsWith(IMG_PREFIX)
          ? { ...p, image: imagesRef.current[p.image.slice(IMG_PREFIX.length)] ?? '' }
          : p,
      ),
    [],
  );

  useEffect(() => {
    let alive = true;
    const boot = async () => {
      const stored = loadRaw();
      try {
        imagesRef.current = await getAllImages();
      } catch {
        imagesRef.current = {};
      }
      if (!alive) return;
      setItems(
        stored.map((p) =>
          p.image?.startsWith(IMG_PREFIX)
            ? { ...p, image: imagesRef.current[p.image.slice(IMG_PREFIX.length)] ?? '' }
            : p,
        ),
      );
    };
    boot();
    return () => {
      alive = false;
    };
  }, []);

  const toStored = useCallback(async (product: Product): Promise<Product> => {
    if (!product.image?.startsWith('data:')) return product;
    const key = `img-${product.id}`;
    const small = await compressImage(product.image);
    imagesRef.current[key] = small;
    try {
      await putImage(key, small);
      return { ...product, image: `${IMG_PREFIX}${key}` };
    } catch {
      return { ...product, image: small };
    }
  }, []);

  const persist = useCallback(
    async (next: Product[]) => {
      const stored = await Promise.all(next.map(toStored));
      write(stored);
      setItems(resolve(stored));
    },
    [resolve, toStored],
  );

  const saveProduct = useCallback(
    async (product: Product) => {
      const stored = await toStored(product);
      const prev = loadRaw();
      const exists = prev.some((p) => p.id === stored.id);
      const next = exists
        ? prev.map((p) => (p.id === stored.id ? stored : p))
        : [stored, ...prev];
      write(next);
      setItems(resolve(next));
    },
    [resolve, toStored],
  );

  const removeProduct = useCallback(
    (id: string) => {
      const next = loadRaw().filter((p) => p.id !== id);
      write(next);
      setItems(resolve(next));
      removeImage(`img-${id}`).catch(() => undefined);
    },
    [resolve],
  );

  const resetCatalog = useCallback(() => {
    write(seedProducts);
    setItems(seedProducts);
  }, []);

  const replaceCatalog = useCallback((next: Product[]) => persist(next), [persist]);

  return { items, saveProduct, removeProduct, resetCatalog, replaceCatalog };
};

export default useCatalog;

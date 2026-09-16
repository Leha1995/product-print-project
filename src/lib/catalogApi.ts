import { Category, Product } from '@/data/products';
import { getAdminPin } from '@/hooks/useAdmin';

const API = 'https://functions.poehali.dev/189bcae7-31a1-4023-9d91-07dee22dad90';

export interface CatalogSnapshot {
  products: Product[];
  categories: Category[];
  seeded: boolean;
}

export const normalize = (list: unknown): Product[] =>
  (Array.isArray(list) ? list : []).map((raw) => {
    const p = raw as Product & { shelfLifeHours?: number | null; storageText?: string | null };
    return {
      ...p,
      shelfLifeHours: p.shelfLifeHours ?? undefined,
      storageText: p.storageText || undefined,
    } as Product;
  });

const post = async (body: Record<string, unknown>, method = 'POST') => {
  const res = await fetch(API, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': getAdminPin() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  if (data.products) data.products = normalize(data.products);
  return data;
};

export const fetchCatalog = async (): Promise<CatalogSnapshot> => {
  const res = await fetch(API);
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return {
    products: normalize(data.products),
    categories: Array.isArray(data.categories) ? data.categories : [],
    seeded: Boolean(data.seeded),
  };
};

export const seedCatalog = (products: Product[], categories: Category[]) =>
  post({ action: 'seed', products, categories });

export const pushProduct = (product: Product) => post({ product });

export const pushProducts = (products: Product[]) => post({ products });

export const deleteProduct = (id: string) => post({ id }, 'DELETE');

export const pushCategories = (categories: Category[]) =>
  post({ action: 'categories', categories });

export const replaceAll = (products: Product[], categories?: Category[]) =>
  post({ action: 'replace', products, categories });
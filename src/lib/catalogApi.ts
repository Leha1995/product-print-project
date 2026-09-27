import { apiUrl } from '@/lib/apiBase';
import { Category, Product } from '@/data/products';
import { getToken } from '@/lib/authApi';

const API = apiUrl('catalog');

export interface UserPrefs {
  activeCategory?: string;
  shelfFilter?: number | 'all';
  onlyExpired?: boolean;
  onlySoon?: boolean;
}

export type PrintHistoryMap = Record<string, number>;

export interface CatalogSnapshot {
  products: Product[];
  categories: Category[];
  prefs: UserPrefs;
  history: PrintHistoryMap;
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

let targetUserId: number | null = null;

export const setTargetUser = (id: number | null) => {
  targetUserId = id;
};

const authHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Auth-Token': getToken(),
  };
  if (targetUserId) headers['X-Target-User'] = String(targetUserId);
  return headers;
};

const post = async (body: Record<string, unknown>, method = 'POST') => {
  const res = await fetch(API, {
    method,
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  if (data.products) data.products = normalize(data.products);
  return data;
};

export const fetchCatalog = async (): Promise<CatalogSnapshot> => {
  const res = await fetch(API, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return {
    products: normalize(data.products),
    categories: Array.isArray(data.categories) ? data.categories : [],
    prefs: (data.prefs || {}) as UserPrefs,
    history: (data.history || {}) as PrintHistoryMap,
    seeded: Boolean(data.seeded),
  };
};

export const pushHistory = (history: PrintHistoryMap) =>
  post({ action: 'history', history });

export interface OverviewItem {
  id: string;
  name: string;
  expiresAt: number;
  leftMs: number;
}

export interface StaffOverview {
  id: number;
  username: string;
  fullName: string;
  expired: OverviewItem[];
  soon: OverviewItem[];
  total: number;
}

export const fetchOverview = async (): Promise<StaffOverview[]> => {
  const res = await fetch(`${API}?action=overview`, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return Array.isArray(data.staff) ? (data.staff as StaffOverview[]) : [];
};

export const seedCatalog = (products: Product[], categories: Category[]) =>
  post({ action: 'seed', products, categories });

export const pushProduct = (product: Product) => post({ product });

export const pushProducts = (products: Product[]) => post({ products });

export const deleteProduct = (id: string) => post({ id }, 'DELETE');

export const pushCategories = (categories: Category[]) =>
  post({ action: 'categories', categories });

export const pushPrefs = (prefs: UserPrefs) => post({ action: 'prefs', prefs });

export const replaceAll = (products: Product[], categories?: Category[]) =>
  post({ action: 'replace', products, categories });

export const clearProducts = () => post({ action: 'replace', products: [] });

const MAX_CHUNK_BYTES = 900000;

const chunkProducts = (products: Product[]): Product[][] => {
  const chunks: Product[][] = [];
  let current: Product[] = [];
  let size = 0;
  products.forEach((p) => {
    const weight = JSON.stringify(p).length;
    if (current.length && (size + weight > MAX_CHUNK_BYTES || current.length >= 60)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += weight;
  });
  if (current.length) chunks.push(current);
  return chunks;
};

export const replaceAllChunked = async (
  products: Product[],
  categories?: Category[],
  onProgress?: (done: number, total: number) => void,
) => {
  const chunks = chunkProducts(products);
  let result: { products?: Product[] } = {};
  if (!chunks.length) return replaceAll([], categories);
  result = await post({ action: 'replace', products: chunks[0], categories });
  onProgress?.(chunks[0].length, products.length);
  let done = chunks[0].length;
  for (let i = 1; i < chunks.length; i += 1) {
    result = await post({ products: chunks[i] });
    done += chunks[i].length;
    onProgress?.(done, products.length);
  }
  return result;
};
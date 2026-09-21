import { Category, Product } from '@/data/products';
import { getToken } from '@/lib/authApi';

const API = 'https://functions.poehali.dev/189bcae7-31a1-4023-9d91-07dee22dad90';

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
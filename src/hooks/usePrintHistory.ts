import { useCallback, useEffect, useState } from 'react';
import { Product } from '@/data/products';

const STORAGE_KEY = 'asap-print-history-v1';

export type PrintHistory = Record<string, number>;

const load = (): PrintHistory => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as PrintHistory;
  } catch {
    return {};
  }
};

const save = (history: PrintHistory) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* storage unavailable */
  }
};

const nameKey = (name: string) => `name:${name.trim().toLowerCase()}`;

export const SOON_MS = 3600000;

export interface ExpiryStatus {
  expired: boolean;
  soon: boolean;
  label: string | null;
}

export const formatLeft = (ms: number) => {
  if (ms <= 0) return '0 мин';
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin} мин`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) return mins ? `${hours} ч ${mins} мин` : `${hours} ч`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} сут ${restHours} ч` : `${days} сут`;
};

export const usePrintHistory = (products: Product[] = []) => {
  const [history, setHistory] = useState<PrintHistory>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setHistory(load());
  }, []);

  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setHistory(load());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const markPrinted = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const stamp = Date.now();
      setHistory((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = stamp;
          const product = products.find((p) => p.id === id);
          if (product?.name) next[nameKey(product.name)] = stamp;
        });
        save(next);
        return next;
      });
      setNow(stamp);
    },
    [products],
  );

  const clearHistory = useCallback(() => {
    setHistory({});
    save({});
  }, []);

  const getExpiry = useCallback(
    (product: Product) => {
      const byId = history[product.id];
      const byName = product.name ? history[nameKey(product.name)] : undefined;
      const printedAt = Math.max(byId ?? 0, byName ?? 0) || null;
      if (!printedAt || product.shelfLifeHours === undefined) {
        return { printedAt, expiresAt: null, expired: false, leftMs: null };
      }
      const expiresAt = printedAt + product.shelfLifeHours * 3600000;
      return {
        printedAt,
        expiresAt,
        expired: now >= expiresAt,
        leftMs: expiresAt - now,
      };
    },
    [history, now],
  );

  const getStatus = useCallback(
    (product: Product): ExpiryStatus => {
      const { expiresAt, leftMs } = getExpiry(product);
      if (!expiresAt || leftMs === null) return { expired: false, soon: false, label: null };
      if (leftMs <= 0) return { expired: true, soon: false, label: 'Срок вышел' };
      return { expired: false, soon: leftMs <= SOON_MS, label: formatLeft(leftMs) };
    },
    [getExpiry],
  );

  return { history, markPrinted, clearHistory, getExpiry, getStatus, now };
};

export default usePrintHistory;

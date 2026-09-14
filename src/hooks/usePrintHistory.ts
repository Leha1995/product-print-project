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

export const usePrintHistory = () => {
  const [history, setHistory] = useState<PrintHistory>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setHistory(load());
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const markPrinted = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const stamp = Date.now();
    setHistory((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = stamp;
      });
      save(next);
      return next;
    });
    setNow(stamp);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory({});
    save({});
  }, []);

  const getExpiry = useCallback(
    (product: Product) => {
      const printedAt = history[product.id];
      if (!printedAt || product.shelfLifeHours === undefined) {
        return { printedAt: printedAt ?? null, expiresAt: null, expired: false, leftMs: null };
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

  return { history, markPrinted, clearHistory, getExpiry, now };
};

export default usePrintHistory;

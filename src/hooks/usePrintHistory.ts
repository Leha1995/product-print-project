import { useCallback, useEffect, useState } from 'react';
import { Product } from '@/data/products';
import { PrintHistoryMap } from '@/lib/catalogApi';

export type PrintHistory = PrintHistoryMap;

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

export const usePrintHistory = (
  history: PrintHistory = {},
  onSave?: (patch: PrintHistory) => void,
) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const markPrinted = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const stamp = Date.now();
      const patch: PrintHistory = {};
      ids.forEach((id) => {
        patch[id] = stamp;
      });
      onSave?.(patch);
      setNow(stamp);
    },
    [onSave],
  );

  const clearHistory = useCallback(() => {
    const patch: PrintHistory = {};
    Object.keys(history).forEach((id) => {
      patch[id] = 0;
    });
    onSave?.(patch);
  }, [history, onSave]);

  const getExpiry = useCallback(
    (product: Product) => {
      const printedAt = history[product.id] || null;
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

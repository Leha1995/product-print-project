import { useEffect, useMemo, useRef } from 'react';
import { Product } from '@/data/products';
import { toast } from '@/hooks/use-toast';
import { playAlertTune, playFuneralTune, unlockAudio } from '@/lib/chiptune';

interface ExpiryAlertsParams {
  items: Product[];
  getExpiry: (p: Product) => { expired: boolean };
  getStatus: (p: Product) => { soon: boolean };
  now: unknown;
  alertTune: string;
  expiredTune: string;
}

const useExpiryAlerts = ({
  items,
  getExpiry,
  getStatus,
  now,
  alertTune,
  expiredTune,
}: ExpiryAlertsParams) => {
  const expiredIds = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => {
      if (getExpiry(p).expired) set.add(p.id);
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, getExpiry, now]);

  const soonIds = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => {
      if (getStatus(p).soon) set.add(p.id);
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, getStatus, now]);

  const alertedRef = useRef<Set<string>>(new Set());
  const deadRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const fresh = Array.from(soonIds).filter((id) => !alertedRef.current.has(id));
    alertedRef.current.forEach((id) => {
      if (!soonIds.has(id) && !expiredIds.has(id)) alertedRef.current.delete(id);
    });
    if (!fresh.length) return;
    fresh.forEach((id) => alertedRef.current.add(id));
    playAlertTune(alertTune as Parameters<typeof playAlertTune>[0], 10);
    const names = fresh
      .map((id) => items.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    toast({
      title: 'Меньше часа до конца срока',
      description: names || `${fresh.length} позиций пора перепечатать`,
    });
  }, [soonIds, expiredIds, items, alertTune]);

  useEffect(() => {
    deadRef.current.forEach((id) => {
      if (!expiredIds.has(id)) deadRef.current.delete(id);
    });
    const fresh = Array.from(expiredIds).filter((id) => !deadRef.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => deadRef.current.add(id));
    playFuneralTune(expiredTune as Parameters<typeof playFuneralTune>[0], 17);
    const names = fresh
      .map((id) => items.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    toast({
      title: 'Срок годности вышел',
      description: names || `${fresh.length} позиций нужно снять и перепечатать`,
    });
  }, [expiredIds, items, expiredTune]);

  return { expiredIds, soonIds };
};

export default useExpiryAlerts;

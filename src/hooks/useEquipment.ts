import { useCallback, useEffect, useState } from 'react';
import {
  Equipment,
  InventorySession,
  deleteEquipment,
  fetchEquipment,
  saveEquipment,
  setEquipmentTarget,
} from '@/lib/equipmentApi';

const useEquipment = (userId?: number, targetId?: number | null) => {
  const [items, setItems] = useState<Equipment[]>([]);
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEquipment();
      setItems(data.items);
      setSessions(data.sessions);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    setEquipmentTarget(targetId ?? null);
    reload();
  }, [userId, targetId, reload]);

  const save = useCallback(async (item: Partial<Equipment>) => {
    const res = await saveEquipment(item);
    if (res?.items) setItems(res.items);
    return res?.items ?? [];
  }, []);

  const remove = useCallback(async (id: string) => {
    const res = await deleteEquipment(id);
    if (res?.items) setItems(res.items);
  }, []);

  return { items, sessions, loading, reload, save, remove, setSessions };
};

export default useEquipment;

import { useCallback, useEffect, useState } from 'react';
import {
  Equipment,
  EquipmentTask,
  InventorySession,
  TechnicianRef,
  deleteEquipment,
  fetchEquipment,
  saveEquipment,
  setEquipmentTarget,
} from '@/lib/equipmentApi';

const useEquipment = (userId?: number, targetId?: number | null) => {
  const [items, setItems] = useState<Equipment[]>([]);
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<EquipmentTask[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianRef[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEquipment();
      setItems(data.items);
      setSessions(data.sessions);
      setTasks(data.tasks);
      setTechnicians(data.technicians);
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

  return {
    items,
    sessions,
    tasks,
    technicians,
    loading,
    reload,
    save,
    remove,
    setItems,
    setSessions,
    setTasks,
  };
};

export default useEquipment;
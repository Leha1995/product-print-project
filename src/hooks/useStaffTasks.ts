import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { playTune, unlockAudio } from '@/lib/chiptune';
import {
  StaffTasksData,
  fetchStaffTasks,
  isTaskDue,
  markStaffTaskDone,
  todayKey,
} from '@/lib/staffTasksApi';

const empty: StaffTasksData = { mine: [], manage: [], assignees: [], canManage: false };

export const useStaffTasks = (enabled: boolean) => {
  const [data, setData] = useState<StaffTasksData>(empty);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const lastRing = useRef<Map<number, number>>(new Map());
  const dayRef = useRef(todayKey());

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setData(await fetchStaffTasks());
    } catch {
      /* повторим при следующем опросе */
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setData(empty);
      return;
    }
    load();
    const poll = window.setInterval(load, 60000);
    return () => window.clearInterval(poll);
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const tick = window.setInterval(() => {
      const d = new Date();
      setNow(d);
      if (todayKey(d) !== dayRef.current) {
        dayRef.current = todayKey(d);
        lastRing.current.clear();
        load();
      }
    }, 15000);
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, load]);

  const due = useMemo(() => data.mine.filter((t) => isTaskDue(t, now)), [data.mine, now]);

  useEffect(() => {
    if (!due.length) return;
    const stamp = now.getTime();
    const ringing = due.filter((t) => {
      const last = lastRing.current.get(t.id);
      return last === undefined || stamp - last >= t.intervalMin * 60000 - 5000;
    });
    if (!ringing.length) return;
    ringing.forEach((t) => lastRing.current.set(t.id, stamp));
    playTune(ringing[0].tune, 8, true);
    toast({
      title: ringing.length > 1 ? `Пора выполнить задания: ${ringing.length}` : 'Пора выполнить задание',
      description: ringing.map((t) => t.title).join(', '),
    });
  }, [due, now]);

  const confirm = useCallback(async (taskId: number) => {
    const next = await markStaffTaskDone(taskId);
    lastRing.current.delete(taskId);
    setData(next);
  }, []);

  return { data, setData, loading, due, now, reload: load, confirm };
};

export default useStaffTasks;

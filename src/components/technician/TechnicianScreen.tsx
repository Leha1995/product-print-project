import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import RepairReturnDialog from '@/components/equipment/RepairReturnDialog';
import {
  Equipment,
  EquipmentTask,
  TechRepair,
  fetchTechRepairs,
  techReturnRepair,
  techTaskDone,
} from '@/lib/equipmentApi';
import TaskCard from '@/components/equipment/TaskCard';
import TaskDoneDialog from '@/components/technician/TaskDoneDialog';
import { toast } from '@/hooks/use-toast';
import useHardwareScanner from '@/hooks/useHardwareScanner';
import { playScanSound } from '@/lib/scanSound';
import RepairPhotos from '@/components/equipment/RepairPhotos';

interface TechnicianScreenProps {
  userName: string;
  onLogout: () => void;
  viewTechId?: number | null;
  inline?: boolean;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');

const daysIn = (iso: string | null) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0;

const asEquipment = (r: TechRepair): Equipment => ({
  id: r.id,
  name: r.name,
  code: r.code,
  price: 0,
  location: r.location,
  note: '',
  image: r.image,
  serial: r.serial,
  active: true,
  inRepair: true,
  repairCost: r.repairCost,
  repairs: [
    { id: 0, sentAt: r.repairSentAt, returnedAt: null, cost: 0, description: r.description, photos: r.photos },
  ],
});

const TechnicianScreen = ({ userName, onLogout, viewTechId = null, inline = false }: TechnicianScreenProps) => {
  const viewOnly = Boolean(viewTechId);
  const [list, setList] = useState<TechRepair[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<TechRepair | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tasks, setTasks] = useState<EquipmentTask[]>([]);
  const [tab, setTab] = useState<'tasks' | 'repairs'>('tasks');
  const [doneTask, setDoneTask] = useState<EquipmentTask | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTechRepairs(viewTechId);
      setList(data.repairs);
      setTasks(data.tasks);
    } catch {
      toast({ title: 'Не удалось загрузить список', description: 'Проверь интернет и обнови' });
    } finally {
      setLoading(false);
    }
  }, [viewTechId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.name, r.location, r.ownerName, r.code, r.description].some((v) => v.toLowerCase().includes(q)),
    );
  }, [list, query]);

  const owners = useMemo(() => new Set(list.map((r) => r.ownerId)).size, [list]);

  const openReturn = (r: TechRepair) => {
    setCurrent(r);
    setDialogOpen(true);
  };

  useHardwareScanner(!viewOnly && !dialogOpen && !doneOpen, (code) => {
    const hit = list.find((r) => r.code.toLowerCase() === code.trim().toLowerCase());
    playScanSound(Boolean(hit));
    if (hit) {
      setTab('repairs');
      openReturn(hit);
    }
    else toast({ title: 'Этой позиции нет в ремонте', description: `Код: ${code}` });
  });

  const openTasks = tasks.filter((t) => t.status === 'open');
  const closedTasks = tasks.filter((t) => t.status !== 'open');

  const confirmDone = async (task: EquipmentTask, comment: string, cost: number) => {
    try {
      const res = await techTaskDone(task.id, comment, cost);
      setTasks(res.tasks);
      toast({ title: 'Задача закрыта', description: `№${task.id}` });
    } catch {
      toast({ title: 'Не удалось сохранить', description: 'Проверь интернет и повтори' });
      load();
      throw new Error('save_failed');
    }
  };

  const confirm = async (_item: Equipment, cost: number, description: string) => {
    if (!current) return;
    try {
      const res = await techReturnRepair(current.ownerId, current.id, cost, description);
      setList(res.repairs);
      toast({ title: 'Возвращено из ремонта', description: current.name });
    } catch {
      toast({ title: 'Не удалось сохранить', description: 'Проверь интернет и повтори' });
      load();
      throw new Error('save_failed');
    }
  };

  return (
    <div
      className={
        inline ? 'bg-background' : viewOnly ? 'fixed inset-0 z-50 overflow-y-auto bg-background' : 'min-h-screen bg-background'
      }
    >
      {viewOnly && (
        <div className="flex items-center justify-center gap-2 border-b-2 border-primary bg-warning px-4 py-2 text-center font-head text-[0.72rem] font-bold uppercase text-warning-foreground">
          <Icon name="Eye" size={15} strokeWidth={2.5} />
          Режим просмотра — так кабинет видит техник
        </div>
      )}
      <header className="flex items-center justify-between gap-3 border-b-2 border-primary bg-card px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
            <Icon name="Wrench" size={20} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="font-head text-[0.95rem] font-black uppercase text-primary">Кабинет техника</p>
            <p className="truncate text-[12px] text-muted-foreground">{`Техник · ${userName}`}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex shrink-0 items-center gap-1.5 border-2 border-primary bg-background px-3 py-2 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
        >
          <Icon name={viewOnly ? 'X' : 'LogOut'} size={15} strokeWidth={2.5} />
          <span className="hidden sm:inline">{viewOnly ? 'Закрыть' : 'Выйти'}</span>
        </button>
      </header>

      <main className="px-4 py-6 md:px-8">
        <div className="mb-4 grid grid-cols-2 border-2 border-primary sm:inline-grid sm:w-auto">
          {(
            [
              ['tasks', 'ClipboardList', `Задачи · ${openTasks.length}`],
              ['repairs', 'Wrench', `В ремонте · ${list.length}`],
            ] as const
          ).map(([key, icon, text]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 font-head text-[0.75rem] font-bold uppercase transition-colors ${
                tab === key ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
              }`}
            >
              <Icon name={icon} size={16} strokeWidth={2.5} />
              {text}
            </button>
          ))}
        </div>

        {tab === 'tasks' && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-head text-2xl font-black uppercase text-primary md:text-3xl">Задачи</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {loading ? 'Загружаю…' : `Открытых: ${openTasks.length}`}
                </p>
              </div>
              {closedTasks.length > 0 && (
                <button
                  onClick={() => setShowClosed((v) => !v)}
                  className="flex items-center gap-1.5 border-2 border-primary bg-card px-3 py-2 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="History" size={15} strokeWidth={2.5} />
                  {showClosed ? 'Скрыть выполненные' : `Выполненные за неделю · ${closedTasks.length}`}
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[...openTasks, ...(showClosed ? closedTasks : [])].map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  showOwner
                  action={
                    t.status === 'open' && !viewOnly ? (
                      <button
                        onClick={() => {
                          setDoneTask(t);
                          setDoneOpen(true);
                        }}
                        className="flex min-h-[56px] w-full items-center justify-center gap-2.5 border-2 border-primary bg-success px-4 py-3.5 font-head text-base font-black uppercase tracking-[0.04em] text-success-foreground shadow-[3px_3px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
                      >
                        <Icon name="CircleCheck" size={24} strokeWidth={2.5} />
                        Выполнено
                      </button>
                    ) : undefined
                  }
                />
              ))}
            </div>
            {!loading && !openTasks.length && !showClosed && (
              <div className="mt-6 border-2 border-dashed border-primary px-4 py-10 text-center">
                <Icon name="CircleCheck" size={32} className="mx-auto text-primary" strokeWidth={2} />
                <p className="mt-2 font-head text-[0.85rem] font-bold uppercase text-primary">Задач нет</p>
                <p className="mt-1 text-[13px] text-muted-foreground">Новые задачи от точек появятся здесь</p>
              </div>
            )}
          </>
        )}

        {tab === 'repairs' && (
        <>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-head text-2xl font-black uppercase text-primary md:text-3xl">В ремонте</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {loading
                ? 'Загружаю…'
                : `${list.length} ${list.length === 1 ? 'позиция' : 'позиций'}${owners > 1 ? ` · точек: ${owners}` : ''} · отсканируй QR, чтобы принять`}
            </p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
          >
            <Icon name="RefreshCw" size={16} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>
        </div>

        {list.length > 3 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию, точке или поломке"
            className="mt-4 w-full border-2 border-primary bg-background px-3 py-2.5 font-body text-[14px] text-primary outline-none"
          />
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <div key={`${r.ownerId}-${r.id}`} className="flex flex-col justify-between gap-3 border-2 border-primary bg-card p-3">
              <div className="flex min-w-0 gap-3">
                {r.image && (
                  <img
                    src={r.image}
                    alt=""
                    loading="lazy"
                    className="h-[72px] w-[72px] shrink-0 border-2 border-primary object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-head text-[0.9rem] font-black uppercase text-primary">{r.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {[r.ownerName, r.location, r.serial].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="mt-1.5 inline-flex items-center gap-1 border-2 border-warning bg-warning px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-warning-foreground">
                    <Icon name="Clock" size={12} strokeWidth={2.5} />
                    {`С ${day(r.repairSentAt)} · ${daysIn(r.repairSentAt)} дн.`}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-[13px] text-primary">
                    {r.description || <span className="text-muted-foreground">Описание поломки не указано</span>}
                  </p>
                  <RepairPhotos photos={r.photos || []} size={64} />
                </div>
              </div>
              {!viewOnly && (
              <button
                onClick={() => openReturn(r)}
                className="flex w-full items-center justify-center gap-1.5 border-2 border-primary bg-accent px-2 py-2.5 font-head text-[0.72rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon name="CircleCheck" size={15} strokeWidth={2.5} />
                Вернуть из ремонта
              </button>
              )}
            </div>
          ))}
        </div>

        {!loading && !list.length && (
          <div className="mt-6 border-2 border-dashed border-primary px-4 py-10 text-center">
            <Icon name="CircleCheck" size={32} className="mx-auto text-primary" strokeWidth={2} />
            <p className="mt-2 font-head text-[0.85rem] font-bold uppercase text-primary">В ремонте ничего нет</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Когда оборудование отправят в ремонт, оно появится здесь
            </p>
          </div>
        )}
        </>
        )}
      </main>

      <TaskDoneDialog task={doneTask} open={doneOpen} onOpenChange={setDoneOpen} onConfirm={confirmDone} />
      <RepairReturnDialog
        item={current ? asEquipment(current) : null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={confirm}
      />
    </div>
  );
};

export default TechnicianScreen;

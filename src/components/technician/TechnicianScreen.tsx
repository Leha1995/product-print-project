import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import RepairReturnDialog from '@/components/equipment/RepairReturnDialog';
import { Equipment, TechRepair, fetchTechRepairs, techReturnRepair } from '@/lib/equipmentApi';
import { toast } from '@/hooks/use-toast';
import useHardwareScanner from '@/hooks/useHardwareScanner';
import { playScanSound } from '@/lib/scanSound';

interface TechnicianScreenProps {
  userName: string;
  onLogout: () => void;
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
    { id: 0, sentAt: r.repairSentAt, returnedAt: null, cost: 0, description: r.description },
  ],
});

const TechnicianScreen = ({ userName, onLogout }: TechnicianScreenProps) => {
  const [list, setList] = useState<TechRepair[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<TechRepair | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await fetchTechRepairs());
    } catch {
      toast({ title: 'Не удалось загрузить список', description: 'Проверь интернет и обнови' });
    } finally {
      setLoading(false);
    }
  }, []);

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

  useHardwareScanner(!dialogOpen, (code) => {
    const hit = list.find((r) => r.code.toLowerCase() === code.trim().toLowerCase());
    playScanSound(Boolean(hit));
    if (hit) openReturn(hit);
    else toast({ title: 'Этой позиции нет в ремонте', description: `Код: ${code}` });
  });

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
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between gap-3 border-b-2 border-primary bg-card px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
            <Icon name="Wrench" size={20} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="font-head text-[0.95rem] font-black uppercase text-primary">Ремонт оборудования</p>
            <p className="truncate text-[12px] text-muted-foreground">{`Техник · ${userName}`}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex shrink-0 items-center gap-1.5 border-2 border-primary bg-background px-3 py-2 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
        >
          <Icon name="LogOut" size={15} strokeWidth={2.5} />
          <span className="hidden sm:inline">Выйти</span>
        </button>
      </header>

      <main className="px-4 py-6 md:px-8">
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
                </div>
              </div>
              <button
                onClick={() => openReturn(r)}
                className="flex w-full items-center justify-center gap-1.5 border-2 border-primary bg-accent px-2 py-2.5 font-head text-[0.72rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon name="CircleCheck" size={15} strokeWidth={2.5} />
                Вернуть из ремонта
              </button>
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
      </main>

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

import { useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import EquipmentFormDialog from '@/components/equipment/EquipmentFormDialog';
import QrPrintDialog from '@/components/equipment/QrPrintDialog';
import ScanDialog from '@/components/equipment/ScanDialog';
import ScanResultDialog from '@/components/equipment/ScanResultDialog';
import InventoryHistoryDialog from '@/components/equipment/InventoryHistoryDialog';
import RepairReturnDialog from '@/components/equipment/RepairReturnDialog';
import RepairSendDialog from '@/components/equipment/RepairSendDialog';
import RepairHistory from '@/components/equipment/RepairHistory';
import FindQrDialog from '@/components/equipment/FindQrDialog';
import TaskCreateDialog, { TaskDraft } from '@/components/equipment/TaskCreateDialog';
import TasksPanel from '@/components/equipment/TasksPanel';
import TransferDialog from '@/components/equipment/TransferDialog';
import ImportEquipmentDialog from '@/components/equipment/ImportEquipmentDialog';
import TelegramConnect from '@/components/TelegramConnect';
import useHardwareScanner from '@/hooks/useHardwareScanner';
import { playScanSound } from '@/lib/scanSound';
import useEquipment from '@/hooks/useEquipment';
import {
  Equipment,
  EquipmentTask,
  FinishResult,
  cancelTask,
  cancelTransfer,
  createTask,
  finishInventory,
  markQrFixed,
  resolveMissing,
  restoreEquipment,
  returnFromRepair,
  sendToRepair,
} from '@/lib/equipmentApi';
import { toast } from '@/hooks/use-toast';
import { TaskPriority } from '@/lib/taskPriority';
import { hasDepreciation, residualValue, totalResidual } from '@/lib/depreciation';
import { exportEquipmentList, exportInventory, pickEquipment } from '@/lib/inventoryExport';

interface EquipmentSectionProps {
  userId?: number;
  targetId?: number | null;
  isAdmin: boolean;
  canTransfer?: boolean;
  readOnly?: boolean;
}

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

const EquipmentSection = ({
  userId,
  targetId,
  isAdmin,
  readOnly = false,
  canTransfer = false,
}: EquipmentSectionProps) => {
  const {
    items,
    sessions,
    tasks,
    technicians,
    loading,
    save,
    remove,
    setItems,
    setSessions,
    setTasks,
  } = useEquipment(
    userId,
    targetId,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [qrItems, setQrItems] = useState<Equipment[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [findOpen, setFindOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskItem, setTaskItem] = useState<Equipment | null>(null);
  const [foundId, setFoundId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [repairItem, setRepairItem] = useState<Equipment | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [sendItem, setSendItem] = useState<Equipment | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [transferItem, setTransferItem] = useState<Equipment | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.location.toLowerCase().includes(q) ||
            i.code.toLowerCase().includes(q),
        )
      : items;
    if (!foundId) return list;
    const hit = items.find((i) => i.id === foundId);
    return hit ? [hit, ...list.filter((i) => i.id !== foundId)] : list;
  }, [items, query, foundId]);

  const findByCode = (raw: string) => {
    const code = raw.trim().toLowerCase();
    const hit = items.find((i) => i.code.toLowerCase() === code);
    setFindOpen(false);
    playScanSound(Boolean(hit));
    if (!hit) {
      toast({ title: 'Оборудование не найдено', description: `Код: ${raw.trim()}` });
      return;
    }
    setQuery('');
    setFoundId(hit.id);
    requestAnimationFrame(() =>
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const anyDialogOpen =
    formOpen || transferOpen || qrOpen || scanOpen || resultOpen || historyOpen || repairOpen || sendOpen || findOpen || taskOpen;
  useHardwareScanner(!anyDialogOpen && items.length > 0, findByCode);

  const totalPrice = items.reduce((sum, i) => (i.active ? sum + i.price : sum), 0);
  const residualTotal = totalResidual(items.filter((i) => i.active));
  const lastSession = sessions[0];
  const inRepairCount = items.filter((i) => i.active && i.inRepair).length;

  const handleCreateTask = async (draft: TaskDraft) => {
    try {
      const res = await createTask(draft);
      setTasks(res.tasks);
      setFoundId(null);
      const tech = technicians.find((t) => t.id === draft.technicianId);
      toast({
        title: 'Задача отправлена',
        description: tech ? `Технику: ${tech.name}` : technicians.length ? 'Закреплённым техникам' : 'Техник пока не закреплён',
      });
    } catch {
      toast({ title: 'Не удалось отправить задачу', description: 'Проверь интернет и повтори' });
      throw new Error('save_failed');
    }
  };

  const handleCancelTask = async (task: EquipmentTask) => {
    if (!window.confirm(`Отменить задачу №${task.id}?`)) return;
    try {
      const res = await cancelTask(task.id);
      setTasks(res.tasks);
      toast({ title: 'Задача отменена' });
    } catch {
      toast({ title: 'Не удалось отменить', description: 'Проверь интернет и повтори' });
    }
  };

  const handleSendRepair = async (
    item: Equipment,
    description: string,
    photos: string[],
    priority: TaskPriority,
  ) => {
    try {
      const res = await sendToRepair(item.id, description, photos, priority);
      setItems(res.items);
      if (res.tasks) setTasks(res.tasks);
      setFoundId((cur) => (cur === item.id ? null : cur));
      toast({ title: 'Отправлено в ремонт', description: `${item.name} — техник получил задачу` });
    } catch {
      toast({ title: 'Не удалось сохранить', description: 'Проверь интернет и повтори' });
      throw new Error('save_failed');
    }
  };

  const handleReturnRepair = async (item: Equipment, cost: number, description: string) => {
    try {
      const res = await returnFromRepair(item.id, cost, description);
      setItems(res.items);
      if (res.tasks) setTasks(res.tasks);
      setFoundId((cur) => (cur === item.id ? null : cur));
      toast({
        title: 'Принято с ремонта',
        description: cost > 0 ? `${item.name} · ${money(cost)}` : item.name,
      });
    } catch {
      toast({ title: 'Не удалось сохранить', description: 'Проверь интернет и повтори' });
      throw new Error('save_failed');
    }
  };

  const handleFinish = async (scanned: string[]) => {
    try {
      const res = await finishInventory(scanned);
      setResult(res);
      setSessions(res.sessions);
      setScanOpen(false);
      setResultOpen(true);
    } catch {
      toast({ title: 'Не удалось сохранить итог', description: 'Проверь интернет и повтори' });
    }
  };

  const handleResolve = async (item: Equipment, mode: 'qr_broken' | 'write_off') => {
    if (!result) return;
    try {
      const res = await resolveMissing(item.id, mode, result.sessionId);
      setItems(res.items);
      setSessions(res.sessions);
      const missing = result.missing.filter((m) => m.id !== item.id);
      setResult({
        ...result,
        missing,
        found:
          mode === 'qr_broken'
            ? [...result.found, { ...item, qrBroken: true }]
            : result.found,
        total: mode === 'write_off' ? Math.max(0, result.total - 1) : result.total,
        totalPrice:
          mode === 'write_off' ? Math.max(0, result.totalPrice - item.price) : result.totalPrice,
        missingPrice: missing.reduce((sum, m) => sum + m.price, 0),
        sessions: res.sessions,
      });
      toast({
        title: mode === 'qr_broken' ? 'Отмечено: нужен новый QR' : 'Оборудование списано',
        description: item.name,
      });
    } catch {
      toast({ title: 'Не удалось сохранить', description: 'Проверь интернет и повтори' });
    }
  };

  return (
    <section id="equipment" className="px-4 py-6 md:px-8">
      {isAdmin && (
        <button
          onClick={() => {
            setTaskItem(null);
            setTaskOpen(true);
          }}
          className="mb-5 flex w-full items-center justify-center gap-3 border-2 border-primary bg-success px-6 py-4 font-head text-base font-black uppercase tracking-[0.04em] text-success-foreground shadow-[4px_4px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 active:translate-y-0 md:text-lg"
        >
          <Icon name="ClipboardPlus" fallback="ClipboardList" size={26} strokeWidth={2.5} />
          Создать задачу технику
        </button>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-head text-2xl font-black uppercase text-primary md:text-3xl">
            Инвентаризация
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {`Оборудование кухни · ${items.filter((i) => i.active).length} в работе · куплено на ${money(
              totalPrice,
            )}${inRepairCount ? ` · ${inRepairCount} в ремонте` : ''}`}
          </p>
          <p className="mt-0.5 font-head text-[0.85rem] font-bold text-primary">
            {`Остаточная стоимость: ${money(residualTotal)}`}
            {totalPrice > residualTotal && (
              <span className="ml-1.5 font-body text-[12px] font-normal text-muted-foreground">
                {`(−${money(totalPrice - residualTotal)} амортизация)`}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              <Icon name="Plus" size={16} strokeWidth={2.5} />
              Добавить
            </button>
          )}
          {isAdmin && !readOnly && (
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              <Icon name="FileUp" fallback="Upload" size={16} strokeWidth={2.5} />
              Загрузить Excel
            </button>
          )}
          {sessions.some((s) => s.finishedAt) && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              <Icon name="History" size={16} strokeWidth={2.5} />
              История
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={() => {
                if (lastSession?.finishedAt) {
                  const pick = (ids: string[]) => pickEquipment(items, ids);
                  exportInventory({
                    sessionId: lastSession.id,
                    found: pick(lastSession.scanned),
                    missing: pick(lastSession.missing),
                    total: lastSession.total,
                    totalPrice: lastSession.totalPrice,
                    missingPrice: lastSession.missingPrice,
                    sessions,
                  }, lastSession.finishedAt, items);
                  return;
                }
                exportEquipmentList(items);
              }}
              className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              <Icon name="FileSpreadsheet" size={16} strokeWidth={2.5} />
              Excel
            </button>
          )}
          {isAdmin && items.length > 0 && (
            <button
              onClick={() => {
                setQrItems(items.filter((i) => i.active));
                setQrOpen(true);
              }}
              className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              <Icon name="QrCode" size={16} strokeWidth={2.5} />
              Все наклейки
            </button>
          )}
          {!readOnly && (
          <button
            onClick={() => {
              if (!items.some((i) => i.active)) {
                toast({ title: 'Сначала добавь оборудование' });
                return;
              }
              if (!items.some((i) => i.active && !i.inRepair)) {
                toast({ title: 'Всё оборудование в ремонте', description: 'Проверять нечего' });
                return;
              }
              setScanOpen(true);
            }}
            className="flex items-center gap-2 border-2 border-primary bg-accent px-4 py-2.5 font-head text-[0.8rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            <Icon name="ScanLine" size={18} strokeWidth={2.5} />
            Начать инвентаризацию
          </button>
          )}
        </div>
      </div>

      {lastSession?.finishedAt && (
        <button
          onClick={() => setHistoryOpen(true)}
          className="mt-3 flex w-full items-center justify-between gap-2 border-2 border-dashed border-primary px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <span>
            {`Последняя проверка: ${new Date(lastSession.finishedAt).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })} · не найдено ${lastSession.missing.length} из ${lastSession.total}`}
          </span>
          <Icon name="ChevronRight" size={16} strokeWidth={2.5} className="shrink-0 text-primary" />
        </button>
      )}

      {isAdmin && !readOnly && (!targetId || targetId === userId) && (
        <div className="mt-4">
          <TelegramConnect compact hint="Сообщим в Telegram, когда техник выполнит задачу" />
        </div>
      )}
      <TasksPanel tasks={tasks} canManage={isAdmin} onCancel={handleCancelTask} />

      {items.length > 0 && (
        <div className="mt-4 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const code = query.trim().toLowerCase();
              if (code && items.some((i) => i.code.toLowerCase() === code)) findByCode(query);
            }}
            placeholder="Поиск по названию, месту или коду"
            className="min-w-0 flex-1 border-2 border-primary bg-background px-3 py-2.5 font-body text-[14px] text-primary outline-none"
          />
          <button
            onClick={() => setFindOpen(true)}
            className="flex shrink-0 items-center gap-2 border-2 border-primary bg-accent px-3 py-2.5 font-head text-[0.72rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            <Icon name="ScanQrCode" fallback="QrCode" size={18} strokeWidth={2.5} />
            <span className="hidden sm:inline">Найти по QR</span>
          </button>
        </div>
      )}

      <div ref={listRef} className="mt-4 grid scroll-mt-4 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`relative flex flex-col justify-between gap-3 border-2 bg-card p-3 ${
              item.active ? 'border-primary' : 'border-muted-foreground opacity-60'
            } ${item.id === foundId ? 'animate-fade-in ring-4 ring-accent sm:col-span-2 xl:col-span-3' : ''}`}
          >
            {item.id === foundId && (
              <div className="-mx-3 -mt-3 flex items-center justify-between gap-2 border-b-2 border-primary bg-accent px-3 py-1.5">
                <span className="flex items-center gap-1.5 font-head text-[0.68rem] font-bold uppercase text-accent-foreground">
                  <Icon name="ScanQrCode" fallback="QrCode" size={14} strokeWidth={2.5} />
                  Найдено по QR-коду
                </span>
                <div className="flex items-center gap-1.5">
                {item.active && isAdmin && (
                  <button
                    onClick={() => {
                      if (item.inRepair) {
                        setRepairItem(item);
                        setRepairOpen(true);
                      } else {
                        setSendItem(item);
                        setSendOpen(true);
                      }
                    }}
                    className="flex items-center gap-1.5 border-2 border-primary bg-card px-2.5 py-1 font-head text-[0.65rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                  >
                    <Icon name={item.inRepair ? 'CircleCheck' : 'Wrench'} size={13} strokeWidth={2.5} />
                    {item.inRepair ? 'Принять с ремонта' : 'Отправить в ремонт'}
                  </button>
                )}
                {item.active && isAdmin && (
                  <button
                    onClick={() => {
                      setTaskItem(item);
                      setTaskOpen(true);
                    }}
                    className="flex items-center gap-1.5 border-2 border-primary bg-card px-2.5 py-1 font-head text-[0.65rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                  >
                    <Icon name="ClipboardPlus" fallback="ClipboardList" size={13} strokeWidth={2.5} />
                    Задача
                  </button>
                )}
                <button
                  onClick={() => setFoundId(null)}
                  aria-label="Убрать отметку"
                  className="flex h-6 w-6 items-center justify-center text-accent-foreground hover:opacity-70"
                >
                  <Icon name="X" size={14} strokeWidth={2.5} />
                </button>
                </div>
              </div>
            )}
            <div className="flex min-w-0 gap-3">
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  loading="lazy"
                  className="h-[72px] w-[72px] shrink-0 border-2 border-primary object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
              <p className="truncate font-head text-[0.9rem] font-black uppercase text-primary">
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {`${item.location || 'место не указано'}${item.serial ? ` · ${item.serial}` : ''}`}
              </p>
              {hasDepreciation(item) ? (
                <div className="mt-1">
                  <p className="font-head text-[0.95rem] font-bold text-primary">
                    {`Остаток ${money(residualValue(item))}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {`Куплено за ${money(item.price)} · −${(item.depreciationPerDay || 0).toLocaleString('ru-RU')} ₽/день`}
                  </p>
                  <div className="mt-1 h-1.5 w-full border border-primary bg-background">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.round((residualValue(item) / item.price) * 100)}%` }}
                    />
                  </div>
                  {residualValue(item) <= 0 && (
                    <p className="mt-1 text-[11px] font-bold text-destructive">Полностью самортизировано</p>
                  )}
                </div>
              ) : (
                <p className="mt-1 font-head text-[0.95rem] font-bold text-primary">
                  {money(item.price)}
                </p>
              )}
              <p className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                <Icon name="CalendarCheck" size={13} strokeWidth={2.5} />
                {item.commissionedAt
                  ? `В эксплуатации с ${new Date(`${item.commissionedAt.slice(0, 10)}T00:00:00`).toLocaleDateString('ru-RU')}`
                  : 'Дата ввода не указана'}
              </p>
              <p className="mt-1 truncate text-[11px] tracking-[0.04em] text-muted-foreground">
                {item.code}
              </p>
              {item.note && (
                <p className="mt-1 text-[12px] text-muted-foreground">{item.note}</p>
              )}
              {item.qrBroken && item.active && (
                <p className="mt-1.5 inline-flex items-center gap-1 border-2 border-warning bg-warning px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-warning-foreground">
                  <Icon name="TriangleAlert" size={12} strokeWidth={2.5} />
                  Заменить QR
                </p>
              )}
              {tasks.some((t) => t.status === 'open' && t.equipmentId === item.id) && (
                <p className="mt-1.5 mr-1 inline-flex items-center gap-1 border-2 border-primary bg-background px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-primary">
                  <Icon name="ClipboardList" size={12} strokeWidth={2.5} />
                  {`Задач: ${tasks.filter((t) => t.status === 'open' && t.equipmentId === item.id).length}`}
                </p>
              )}
              {item.inRepair && item.active && (
                <p className="mt-1.5 inline-flex items-center gap-1 border-2 border-warning bg-warning px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-warning-foreground">
                  <Icon name="Wrench" size={12} strokeWidth={2.5} />
                  {item.repairSentAt
                    ? `В ремонте с ${new Date(item.repairSentAt).toLocaleDateString('ru-RU')}`
                    : 'В ремонте'}
                </p>
              )}
              {item.transferTo && item.active && (
                <p className="mt-1.5 mr-1 inline-flex items-center gap-1 border-2 border-primary bg-accent px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-accent-foreground">
                  <Icon name="ArrowRightLeft" size={12} strokeWidth={2.5} />
                  {`Перемещается → ${item.transferTo}`}
                  {isAdmin && !readOnly && (
                    <button
                      onClick={async () => {
                        if (!window.confirm('Отменить перемещение?')) return;
                        try {
                          const res = await cancelTransfer(item.id);
                          setItems(res.items);
                          toast({ title: 'Перемещение отменено', description: item.name });
                        } catch {
                          toast({ title: 'Не удалось отменить', description: 'Проверь интернет и повтори' });
                        }
                      }}
                      aria-label="Отменить перемещение"
                      className="ml-1 underline"
                    >
                      отменить
                    </button>
                  )}
                </p>
              )}
              {!item.active && (
                <p className="mt-1.5 inline-flex items-center gap-1 border-2 border-destructive bg-destructive px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-destructive-foreground">
                  <Icon name="Archive" size={12} strokeWidth={2.5} />
                  Списано
                </p>
              )}
              </div>
            </div>

            <RepairHistory item={item} />

            <div className="flex flex-wrap gap-1.5">
              {item.qrBroken && item.active && isAdmin && (
                <button
                  onClick={async () => {
                    const res = await markQrFixed(item.id);
                    setItems(res.items);
                    const fresh = res.items.find((i) => i.id === item.id);
                    if (fresh) {
                      setQrItems([fresh]);
                      setQrOpen(true);
                    }
                    toast({ title: 'Создан новый QR-код', description: 'Распечатай наклейку' });
                  }}
                  className="flex w-full items-center justify-center gap-1.5 border-2 border-warning bg-warning px-2 py-2 font-head text-[0.68rem] font-bold uppercase text-warning-foreground transition-transform hover:-translate-y-0.5"
                >
                  <Icon name="RefreshCw" size={14} strokeWidth={2.5} />
                  Новый QR и печать
                </button>
              )}
              {item.active && isAdmin && (
                item.inRepair ? (
                  <button
                    onClick={() => {
                      setRepairItem(item);
                      setRepairOpen(true);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 border-2 border-primary bg-accent px-2 py-2 font-head text-[0.68rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
                  >
                    <Icon name="CircleCheck" size={14} strokeWidth={2.5} />
                    Принять с ремонта
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSendItem(item);
                      setSendOpen(true);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 border-2 border-primary bg-card px-2 py-2 font-head text-[0.68rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                  >
                    <Icon name="Wrench" size={14} strokeWidth={2.5} />
                    Отправить в ремонт
                  </button>
                )
              )}
              {!item.active && isAdmin && (
                <button
                  onClick={async () => {
                    const res = await restoreEquipment(item.id);
                    setItems(res.items);
                    toast({ title: 'Возвращено в работу', description: item.name });
                  }}
                  className="flex w-full items-center justify-center gap-1.5 border-2 border-primary bg-card px-2 py-2 font-head text-[0.68rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="Undo2" size={14} strokeWidth={2.5} />
                  Вернуть в работу
                </button>
              )}
              {item.active && isAdmin && (
                <button
                  onClick={() => {
                    setTaskItem(item);
                    setTaskOpen(true);
                  }}
                  aria-label="Создать задачу технику"
                  title="Задача технику"
                  className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary bg-background text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="ClipboardPlus" fallback="ClipboardList" size={14} strokeWidth={2.5} />
                </button>
              )}
              <button
                onClick={() => {
                  setQrItems([item]);
                  setQrOpen(true);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 border-2 border-primary bg-background px-2 py-2 font-head text-[0.68rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
              >
                <Icon name="QrCode" size={14} strokeWidth={2.5} />
                QR
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                  aria-label="Изменить"
                  className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary bg-background text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="Pencil" size={14} strokeWidth={2.5} />
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => {
                    remove(item.id);
                    toast({ title: 'Оборудование удалено', description: item.name });
                  }}
                  aria-label="Удалить"
                  className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary bg-background text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Icon name="Trash2" size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!loading && !items.length && (
        <div className="mt-6 border-2 border-dashed border-primary px-4 py-10 text-center">
          <Icon name="Wrench" size={32} className="mx-auto text-primary" strokeWidth={2} />
          <p className="mt-2 font-head text-[0.85rem] font-bold uppercase text-primary">
            Оборудования пока нет
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Добавь печи, холодильники и другое — система сама создаст QR-код для каждой позиции
          </p>
        </div>
      )}

      <EquipmentFormDialog
        item={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
        onTransfer={
          readOnly || !canTransfer
            ? undefined
            : (item) => {
                setTransferItem(item);
                setTransferOpen(true);
              }
        }
        onSave={async (item) => {
          await save(item);
          toast({
            title: editing ? 'Оборудование обновлено' : 'Оборудование добавлено',
            description: item.name,
          });
        }}
      />
      <ImportEquipmentDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existing={items}
        onDone={setItems}
      />
      <TransferDialog
        item={transferItem}
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onDone={(list, name) => {
          setItems(list);
          toast({ title: 'Отправлено на подтверждение', description: name ? `Админ: ${name}` : undefined });
        }}
      />
      <TaskCreateDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        items={items}
        technicians={technicians}
        presetItem={taskItem}
        onConfirm={handleCreateTask}
      />
      <FindQrDialog open={findOpen} onOpenChange={setFindOpen} onCode={findByCode} />
      <RepairSendDialog
        item={sendItem}
        open={sendOpen}
        onOpenChange={setSendOpen}
        onConfirm={handleSendRepair}
      />
      <RepairReturnDialog
        item={repairItem}
        open={repairOpen}
        onOpenChange={setRepairOpen}
        onConfirm={handleReturnRepair}
      />
      <QrPrintDialog items={qrItems} open={qrOpen} onOpenChange={setQrOpen} />
      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        items={items}
        onFinish={handleFinish}
      />
      <ScanResultDialog
        result={result}
        open={resultOpen}
        onOpenChange={setResultOpen}
        onRescan={() => {
          setResultOpen(false);
          setScanOpen(true);
        }}
        onResolve={handleResolve}
        items={items}
      />
      <InventoryHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        sessions={sessions}
        items={items}
      />
    </section>
  );
};

export default EquipmentSection;
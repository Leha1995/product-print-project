import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import { getTune } from '@/lib/chiptune';
import {
  StaffTask,
  StaffTaskInput,
  StaffTasksData,
  createStaffTask,
  deleteStaffTask,
  isTaskDue,
  isTaskOverdue,
  todayKey,
  updateStaffTask,
} from '@/lib/staffTasksApi';
import StaffTaskFormDialog from '@/components/staff-tasks/StaffTaskFormDialog';

interface StaffTasksSectionProps {
  data: StaffTasksData;
  setData: (data: StaffTasksData) => void;
  loading: boolean;
  now: Date;
  onConfirm: (taskId: number) => Promise<void>;
  viewedId?: number | null;
}

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';

const dateLabel = (key: string | null) => {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
};

const scheduleText = (t: StaffTask) =>
  `${t.kind === 'daily' ? 'Каждый день' : dateLabel(t.date)} с ${t.startTime}${t.endTime ? ` до ${t.endTime}` : ''}`;

const StaffTasksSection = ({ data, setData, loading, now, onConfirm, viewedId = null }: StaffTasksSectionProps) => {
  const viewed = viewedId ? data.assignees.find((a) => a.id === viewedId) ?? null : null;
  const [tab, setTab] = useState<'mine' | 'manage'>(
    data.canManage && (viewedId || !data.mine.length) ? 'manage' : 'mine',
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffTask | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<number | 'all'>(viewedId ?? 'all');

  useEffect(() => {
    if (!data.canManage) return;
    if (viewedId && data.assignees.some((a) => a.id === viewedId)) {
      setFilter(viewedId);
      setTab('manage');
    } else {
      setFilter('all');
    }
  }, [viewedId, data.canManage, data.assignees]);

  const mine = useMemo(() => {
    const rank = (t: StaffTask) => (isTaskDue(t, now) ? 0 : t.doneAt ? 2 : 1);
    return [...data.mine].sort((a, b) => rank(a) - rank(b) || a.startTime.localeCompare(b.startTime));
  }, [data.mine, now]);

  const manage = useMemo(
    () => data.manage.filter((t) => filter === 'all' || t.assigneeId === filter),
    [data.manage, filter],
  );

  const dueCount = mine.filter((t) => isTaskDue(t, now)).length;
  const today = todayKey(now);

  const confirm = async (t: StaffTask) => {
    setBusyId(t.id);
    try {
      await onConfirm(t.id);
      toast({ title: 'Отмечено как выполненное', description: t.title });
    } catch {
      toast({ title: 'Не удалось отметить', description: 'Проверьте интернет и нажмите ещё раз' });
    } finally {
      setBusyId(null);
    }
  };

  const save = async (input: StaffTaskInput) => {
    const next = editing ? await updateStaffTask(editing.id, input) : await createStaffTask(input);
    setData(next);
    const count = input.assigneeIds.length;
    toast({
      title: editing ? 'Задание обновлено' : count > 1 ? `Задание поставлено ${count} сотрудникам` : 'Задание создано',
      description: input.title,
    });
  };

  const remove = async (t: StaffTask) => {
    if (!window.confirm(`Удалить задание «${t.title}»?`)) return;
    try {
      setData(await deleteStaffTask(t.id));
      toast({ title: 'Задание удалено' });
    } catch {
      toast({ title: 'Не удалось удалить' });
    }
  };

  const statusBadge = (t: StaffTask) => {
    if (t.doneAt) {
      return (
        <span className="inline-flex items-center gap-1 border-2 border-success bg-success px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-success-foreground">
          <Icon name="CircleCheck" size={12} strokeWidth={2.5} />
          {`Выполнено ${timeOf(t.doneAt)}${t.doneBy ? ` · ${t.doneBy}` : ''}`}
        </span>
      );
    }
    if (isTaskOverdue(t, now)) {
      return (
        <span className="inline-flex items-center gap-1 border-2 border-destructive bg-destructive px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-destructive-foreground">
          <Icon name="TriangleAlert" fallback="AlertTriangle" size={12} strokeWidth={2.5} />
          {t.endTime && !(t.kind === 'once' && t.date && t.date < today) ? `Просрочено · срок был ${t.endTime}` : 'Просрочено'}
        </span>
      );
    }
    if (isTaskDue(t, now)) {
      return (
        <span className="inline-flex items-center gap-1 border-2 border-destructive bg-destructive px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-destructive-foreground">
          <Icon name="BellRing" size={12} strokeWidth={2.5} />
          {t.endTime ? `Ждёт выполнения · до ${t.endTime}` : 'Ждёт выполнения'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 border-2 border-primary bg-card px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-primary">
        <Icon name="Clock" size={12} strokeWidth={2.5} />
        {t.kind === 'once' && t.date && t.date > today ? `Запланировано на ${dateLabel(t.date)}` : `Начнётся в ${t.startTime}`}
      </span>
    );
  };

  return (
    <section className="px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-head text-2xl font-black uppercase text-primary md:text-3xl">
            {viewed && tab === 'manage' ? `Задания · ${viewed.name}` : 'Задания'}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {loading ? 'Загружаю…' : dueCount ? `Ждут выполнения: ${dueCount}` : 'Сигнал звучит, пока задание не отмечено выполненным'}
          </p>
        </div>
        {data.canManage && (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="flex items-center gap-2 border-2 border-primary bg-accent px-4 py-2.5 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            <Icon name="Plus" size={17} strokeWidth={2.5} />
            {viewed ? `Задание для ${viewed.name}` : 'Новое задание'}
          </button>
        )}
      </div>

      {data.canManage && (
        <div className="mt-4 grid grid-cols-2 border-2 border-primary sm:inline-grid sm:w-auto">
          {(
            [
              ['mine', 'BellRing', `Мои · ${data.mine.length}`],
              ['manage', 'ClipboardList', `Сотрудникам · ${data.manage.length}`],
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
      )}

      {(tab === 'mine' || !data.canManage) && (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((t) => {
              const due = isTaskDue(t, now);
              return (
                <div
                  key={t.id}
                  className={`flex flex-col justify-between gap-3 border-2 p-3 ${
                    due ? 'border-destructive bg-destructive/10' : 'border-primary bg-card'
                  } ${t.doneAt ? 'opacity-70' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5">{statusBadge(t)}</div>
                    <p className="mt-2 font-head text-[1.05rem] font-black uppercase leading-tight text-primary">
                      {t.title}
                    </p>
                    {t.note && <p className="mt-1 whitespace-pre-line text-[14px] text-primary">{t.note}</p>}
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      {`${scheduleText(t)} · сигнал каждые ${t.intervalMin} мин${t.createdByName ? ` · поставил ${t.createdByName}` : ''}`}
                    </p>
                  </div>
                  {!t.doneAt && (
                    <button
                      onClick={() => confirm(t)}
                      disabled={busyId === t.id}
                      className="flex min-h-[56px] w-full items-center justify-center gap-2.5 border-2 border-primary bg-success px-4 py-3.5 font-head text-base font-black uppercase tracking-[0.04em] text-success-foreground shadow-[3px_3px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                    >
                      <Icon name={busyId === t.id ? 'Loader' : 'CircleCheck'} size={24} strokeWidth={2.5} />
                      Выполнено
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!loading && !mine.length && (
            <div className="mt-6 border-2 border-dashed border-primary px-4 py-10 text-center">
              <Icon name="CircleCheck" size={32} className="mx-auto text-primary" strokeWidth={2} />
              <p className="mt-2 font-head text-[0.85rem] font-bold uppercase text-primary">Заданий нет</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Когда руководитель поставит задание, оно появится здесь</p>
            </div>
          )}
        </>
      )}

      {tab === 'manage' && data.canManage && (
        <>
          {data.assignees.length > 1 && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="mt-4 w-full border-2 border-primary bg-background px-3 py-2.5 font-body text-[14px] text-primary outline-none sm:w-auto"
            >
              <option value="all">Все сотрудники</option>
              {data.assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {manage.map((t) => (
              <div key={t.id} className="flex flex-col justify-between gap-3 border-2 border-primary bg-card p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    {statusBadge(t)}
                    <span className="inline-flex items-center gap-1 border-2 border-primary bg-background px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-primary">
                      <Icon name={t.kind === 'daily' ? 'Repeat' : 'CalendarCheck'} size={12} strokeWidth={2.5} />
                      {t.kind === 'daily' ? 'Ежедневно' : 'Разово'}
                    </span>
                  </div>
                  <p className="mt-2 font-head text-[1rem] font-black uppercase leading-tight text-primary">{t.title}</p>
                  {t.note && <p className="mt-1 whitespace-pre-line text-[13px] text-primary">{t.note}</p>}
                  <p className="mt-1.5 flex items-center gap-1 text-[13px] font-semibold text-primary">
                    <Icon name="User" size={14} strokeWidth={2.5} />
                    {t.assigneeName || '—'}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {`${scheduleText(t)} · каждые ${t.intervalMin} мин · ${getTune(t.tune).name}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(t);
                      setFormOpen(true);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 border-2 border-primary bg-background px-3 py-2 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                  >
                    <Icon name="Pencil" size={14} strokeWidth={2.5} />
                    Изменить
                  </button>
                  <button
                    onClick={() => remove(t)}
                    aria-label="Удалить задание"
                    className="flex items-center justify-center border-2 border-destructive bg-background px-3 py-2 text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Icon name="Trash2" size={15} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!loading && !manage.length && (
            <div className="mt-6 border-2 border-dashed border-primary px-4 py-10 text-center">
              <Icon name="ListPlus" size={32} className="mx-auto text-primary" strokeWidth={2} />
              <p className="mt-2 font-head text-[0.85rem] font-bold uppercase text-primary">Заданий пока нет</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {data.assignees.length ? 'Нажмите «Новое задание», чтобы поставить первое' : 'Нет сотрудников, которым можно поставить задание'}
              </p>
            </div>
          )}
        </>
      )}

      <StaffTaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        assignees={data.assignees}
        onSave={save}
        defaultAssigneeId={filter === 'all' ? viewedId : filter}
      />
    </section>
  );
};

export default StaffTasksSection;
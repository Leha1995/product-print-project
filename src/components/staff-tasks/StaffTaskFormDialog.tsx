import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { TUNES, previewTune, unlockAudio } from '@/lib/chiptune';
import { StaffAssignee, StaffTask, StaffTaskInput, StaffTaskKind, todayKey } from '@/lib/staffTasksApi';

interface StaffTaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: StaffTask | null;
  assignees: StaffAssignee[];
  onSave: (input: StaffTaskInput) => Promise<void>;
  defaultAssigneeId?: number | null;
}

const roleLabel: Record<string, string> = { user: 'сотрудник', admin: 'админ', manager: 'управляющий' };
const intervals = [1, 2, 3, 5, 10, 15, 20, 30, 60];

const inputClass =
  'w-full border-2 border-primary bg-background px-3 py-2.5 font-body text-[15px] text-primary outline-none focus:bg-muted';
const labelClass = 'mb-1 block font-head text-[0.7rem] font-bold uppercase tracking-[0.06em] text-primary';

const StaffTaskFormDialog = ({
  open,
  onOpenChange,
  task,
  assignees,
  onSave,
  defaultAssigneeId = null,
}: StaffTaskFormDialogProps) => {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<StaffTaskKind>('daily');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [date, setDate] = useState(todayKey());
  const [intervalMin, setIntervalMin] = useState(5);
  const [tune, setTune] = useState('beep');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setNote(task?.note ?? '');
    setKind(task?.kind ?? 'daily');
    setStartTime(task?.startTime ?? '09:00');
    setEndTime(task?.endTime ?? '');
    setDate(task?.date ?? todayKey());
    setIntervalMin(task?.intervalMin ?? 5);
    setTune(task?.tune ?? 'beep');
    const preset = defaultAssigneeId && assignees.some((a) => a.id === defaultAssigneeId) ? defaultAssigneeId : null;
    const initial = task?.assigneeId ?? preset ?? (assignees.length === 1 ? assignees[0].id : null);
    setAssigneeIds(initial ? [initial] : []);
    setError('');
  }, [open, task, assignees, defaultAssigneeId]);

  const allPicked = assignees.length > 0 && assignees.every((a) => assigneeIds.includes(a.id));

  const toggle = (id: number) =>
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (!title.trim()) return setError('Напишите, что нужно сделать');
    if (!assigneeIds.length) return setError('Выберите хотя бы одного сотрудника');
    if (!startTime) return setError('Укажите время');
    if (endTime && endTime <= startTime) return setError('«Выполнить до» должно быть позже времени начала');
    if (kind === 'once' && !date) return setError('Укажите дату');
    setBusy(true);
    setError('');
    try {
      await onSave({
        title: title.trim(),
        note: note.trim(),
        kind,
        startTime,
        endTime: endTime || null,
        date: kind === 'once' ? date : null,
        intervalMin,
        tune,
        assigneeIds,
      });
      onOpenChange(false);
    } catch {
      setError('Не удалось сохранить — проверьте интернет и повторите');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[520px] overflow-y-auto border-2 border-primary bg-background p-0">
        <div className="flex items-center gap-2 border-b-2 border-primary bg-primary px-5 py-3 font-head text-base font-black uppercase tracking-[0.06em] text-primary-foreground">
          <Icon name={task ? 'Pencil' : 'ListPlus'} size={18} strokeWidth={2.5} />
          {task ? 'Изменить задание' : 'Новое задание'}
        </div>
        <div className="grid gap-4 p-5">
          <label>
            <span className={labelClass}>Что сделать</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: проверить температуру холодильников"
              className={inputClass}
              maxLength={200}
            />
          </label>
          <label>
            <span className={labelClass}>Подробности (необязательно)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              maxLength={1000}
            />
          </label>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={`${labelClass} mb-0`}>
                Кому{assigneeIds.length > 1 ? ` · выбрано ${assigneeIds.length}` : ''}
              </span>
              {assignees.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setAssigneeIds(allPicked ? (task ? [task.assigneeId] : []) : assignees.map((a) => a.id))
                  }
                  className="font-head text-[0.65rem] font-bold uppercase tracking-[0.04em] text-primary underline underline-offset-2 hover:text-secondary"
                >
                  {allPicked ? 'Снять всех' : 'Выбрать всех'}
                </button>
              )}
            </div>
            <div className="max-h-[220px] overflow-y-auto border-2 border-primary bg-background">
              {assignees.map((a) => {
                const checked = assigneeIds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-center gap-3 border-b border-primary/20 px-3 py-2.5 last:border-b-0 ${
                      checked ? 'bg-accent text-accent-foreground' : 'text-primary hover:bg-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(a.id)}
                      className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{a.name}</span>
                    {a.role !== 'user' && (
                      <span className="shrink-0 text-[12px] opacity-75">{roleLabel[a.role] ?? a.role}</span>
                    )}
                  </label>
                );
              })}
              {!assignees.length && (
                <p className="px-3 py-3 text-[13px] text-muted-foreground">Нет сотрудников, которым можно поставить задание</p>
              )}
            </div>
            {task && assigneeIds.length > 1 && (
              <span className="mt-1 block text-[12px] text-muted-foreground">
                Остальным выбранным создадутся такие же задания.
              </span>
            )}
          </div>

          <div>
            <span className={labelClass}>Как часто</span>
            <div className="grid grid-cols-2 border-2 border-primary">
              {(
                [
                  ['daily', 'Repeat', 'Каждый день'],
                  ['once', 'CalendarCheck', 'Один раз'],
                ] as const
              ).map(([key, icon, text]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKind(key)}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase transition-colors ${
                    kind === key ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
                  }`}
                >
                  <Icon name={icon} size={16} strokeWidth={2.5} />
                  {text}
                </button>
              ))}
            </div>
          </div>

          {kind === 'once' && (
            <label>
              <span className={labelClass}>Дата</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelClass}>Начать звонить с</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
            </label>
            <label>
              <span className={labelClass}>Выполнить до</span>
              <div className="flex gap-1">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputClass}
                />
                {endTime && (
                  <button
                    type="button"
                    onClick={() => setEndTime('')}
                    aria-label="Убрать срок"
                    className="flex shrink-0 items-center border-2 border-primary bg-background px-2 text-primary hover:bg-muted"
                  >
                    <Icon name="X" size={16} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </label>
          </div>
          <span className="-mt-2 block text-[12px] text-muted-foreground">
            {endTime
              ? `Не выполнено к ${endTime} — задание попадёт в «Сводку» как просроченное и продолжит звонить.`
              : 'Срок «до» необязателен. Без него задание не считается просроченным.'}
          </span>

          <label>
            <span className={labelClass}>Повторять сигнал каждые</span>
            <select
              value={intervalMin}
              onChange={(e) => setIntervalMin(Number(e.target.value))}
              className={inputClass}
            >
              {intervals.map((m) => (
                <option key={m} value={m}>
                  {m === 60 ? '1 час' : `${m} мин`}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[12px] text-muted-foreground">
              Сигнал звучит, пока сотрудник не нажмёт «Выполнено».
            </span>
          </label>

          <div>
            <span className={labelClass}>Мелодия сигнала</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {TUNES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTune(t.id);
                    unlockAudio();
                    previewTune(t.id, 4);
                  }}
                  className={`flex items-center gap-1.5 border-2 border-primary px-2 py-2 text-left font-head text-[0.68rem] font-bold uppercase transition-colors ${
                    tune === t.id ? 'bg-accent text-accent-foreground' : 'bg-card text-primary hover:bg-muted'
                  }`}
                >
                  <Icon name={tune === t.id ? 'Volume2' : 'Music'} size={14} strokeWidth={2.5} />
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[13px] font-semibold text-destructive">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.8rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
            >
              <Icon name={busy ? 'Loader' : 'Check'} size={17} strokeWidth={2.5} />
              {busy ? 'Сохраняю…' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-center gap-2 border-2 border-primary bg-background px-4 py-3 font-head text-[0.8rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              Отмена
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StaffTaskFormDialog;

import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import PhotoPicker from '@/components/equipment/PhotoPicker';
import { Equipment, TechnicianRef } from '@/lib/equipmentApi';
import { PRIORITY_OPTIONS, TaskPriority } from '@/lib/taskPriority';

export interface TaskDraft {
  description: string;
  photos: string[];
  equipmentId: string | null;
  technicianId: number | null;
  priority: TaskPriority;
}

interface TaskCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Equipment[];
  technicians: TechnicianRef[];
  presetItem?: Equipment | null;
  onConfirm: (draft: TaskDraft) => Promise<void>;
}

const field =
  'mt-1 w-full border-2 border-primary bg-card px-3 py-2.5 font-body text-[14px] text-primary outline-none';
const label = 'font-head text-[0.68rem] font-bold uppercase tracking-[0.06em] text-primary';

const TaskCreateDialog = ({
  open,
  onOpenChange,
  items,
  technicians,
  presetItem,
  onConfirm,
}: TaskCreateDialogProps) => {
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setPhotos([]);
    setPriority('normal');
    setEquipmentId(presetItem?.id || '');
    setTechnicianId(technicians.length === 1 ? String(technicians[0].id) : '');
    setBusy(false);
  }, [open, presetItem, technicians]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || busy || reading) return;
    setBusy(true);
    try {
      await onConfirm({
        description: description.trim(),
        photos,
        equipmentId: equipmentId || null,
        technicianId: technicianId ? Number(technicianId) : null,
        priority,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const active = items.filter((i) => i.active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-[480px] overflow-y-auto border-2 border-primary bg-background p-5">
        <form onSubmit={submit}>
          <h3 className="pr-8 font-head text-lg font-black uppercase text-primary">Новая задача технику</h3>

          <label className="mt-4 block">
            <span className={label}>Что нужно сделать</span>
            <textarea
              autoFocus
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Подтянуть дверцу холодильника, заменить лампу в вытяжке…"
              className={`${field} resize-none`}
            />
          </label>

          <div className="mt-3">
            <span className={label}>Срочность</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {PRIORITY_OPTIONS.map((p) => {
                const on = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    aria-pressed={on}
                    className={`flex min-h-[64px] flex-col items-center justify-center gap-1 border-2 px-1 py-2 text-center transition-all ${
                      on ? `${p.chip} scale-[1.03] shadow-[3px_3px_0_0_hsl(var(--primary))]` : `${p.border} bg-card text-primary opacity-70 hover:opacity-100`
                    }`}
                  >
                    <Icon name={p.icon} fallback="Flag" size={20} strokeWidth={2.5} />
                    <span className="font-head text-[0.68rem] font-black uppercase leading-tight">{p.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {PRIORITY_OPTIONS.find((p) => p.value === priority)?.hint}
            </p>
          </div>

          <label className="mt-3 block">
            <span className={label}>Оборудование</span>
            <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className={field}>
              <option value="">Без привязки к оборудованию</option>
              {active.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.location ? `${i.name} · ${i.location}` : i.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className={label}>Техник</span>
            {technicians.length ? (
              <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className={field}>
                {technicians.length > 1 && <option value="">Всем закреплённым техникам</option>}
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 flex items-start gap-1.5 border-2 border-warning bg-warning px-3 py-2 text-[12px] text-warning-foreground">
                <Icon name="TriangleAlert" size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
                За этой точкой пока не закреплён ни один техник. Задача сохранится и появится у техника,
                как только его закрепят.
              </p>
            )}
          </label>

          <div className="mt-3">
            <PhotoPicker photos={photos} onChange={setPhotos} onBusyChange={setReading} />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="border-2 border-primary bg-card px-4 py-2.5 font-head text-[0.72rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!description.trim() || busy || reading}
              className="flex flex-1 items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-2.5 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Icon
                name={busy ? 'Loader2' : 'Send'}
                size={16}
                strokeWidth={2.5}
                className={busy ? 'animate-spin' : ''}
              />
              Отправить технику
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TaskCreateDialog;

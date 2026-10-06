import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Equipment } from '@/lib/equipmentApi';
import { readFile, shrink } from '@/lib/imageFile';
import { PRIORITY_OPTIONS, TaskPriority } from '@/lib/taskPriority';

const MAX_PHOTOS = 4;

interface RepairSendDialogProps {
  item: Equipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: Equipment, description: string, photos: string[], priority: TaskPriority) => Promise<void>;
}

const RepairSendDialog = ({ item, open, onOpenChange, onConfirm }: RepairSendDialogProps) => {
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('soon');

  useEffect(() => {
    if (open) {
      setPhotos([]);
      setDescription('');
      setPriority('soon');
      setBusy(false);
    }
  }, [open]);

  if (!item) return null;

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    try {
      const list = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, MAX_PHOTOS - photos.length);
      const ready = await Promise.all(list.map(async (f) => shrink(await readFile(f), 1280, 0.8)));
      setPhotos((prev) => [...prev, ...ready].slice(0, MAX_PHOTOS));
    } finally {
      setReading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(item, description.trim(), photos, priority);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] border-2 border-primary bg-background p-5">
        <form onSubmit={submit}>
          <h3 className="pr-8 font-head text-lg font-black uppercase text-primary">Отправить в ремонт</h3>
          <p className="mt-1 truncate text-[13px] text-muted-foreground">{item.name}</p>

          <label className="mt-4 block">
            <span className="font-head text-[0.68rem] font-bold uppercase tracking-[0.06em] text-primary">
              Что сломалось
            </span>
            <textarea
              autoFocus
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Не греет нижний тэн, ошибка E3"
              className="mt-1 w-full resize-none border-2 border-primary bg-card px-3 py-2.5 font-body text-[14px] text-primary outline-none"
            />
          </label>
          <div className="mt-3">
            <span className="font-head text-[0.68rem] font-bold uppercase tracking-[0.06em] text-primary">
              Срочность ремонта
            </span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {PRIORITY_OPTIONS.map((p) => {
                const on = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    aria-pressed={on}
                    className={`flex min-h-[60px] flex-col items-center justify-center gap-1 border-2 px-1 py-2 text-center transition-all ${
                      on
                        ? `${p.chip} scale-[1.03] shadow-[3px_3px_0_0_hsl(var(--primary))]`
                        : `${p.border} bg-card text-primary opacity-70 hover:opacity-100`
                    }`}
                  >
                    <Icon name={p.icon} fallback="Flag" size={18} strokeWidth={2.5} />
                    <span className="font-head text-[0.66rem] font-black uppercase leading-tight">{p.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {PRIORITY_OPTIONS.find((p) => p.value === priority)?.hint}
            </p>
          </div>

          <div className="mt-3">
            <span className="font-head text-[0.68rem] font-bold uppercase tracking-[0.06em] text-primary">
              {`Фото поломки · ${photos.length} из ${MAX_PHOTOS}`}
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {photos.map((src, i) => (
                <div key={i} className="relative h-16 w-16 border-2 border-primary">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Убрать фото"
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center border-2 border-primary bg-destructive text-destructive-foreground"
                  >
                    <Icon name="X" size={12} strokeWidth={3} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 border-2 border-dashed border-primary bg-card text-primary transition-colors hover:bg-muted">
                  <Icon name={reading ? 'Loader2' : 'Camera'} size={18} strokeWidth={2.5} className={reading ? 'animate-spin' : ''} />
                  <span className="font-head text-[0.55rem] font-bold uppercase">Добавить</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <p className="mt-2 text-[12px] text-muted-foreground">
            На время ремонта позиция не участвует в инвентаризации
          </p>

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
              disabled={busy || reading}
              className="flex flex-1 items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-2.5 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Icon name={busy ? 'Loader2' : 'Wrench'} size={16} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} />
              Отправить
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RepairSendDialog;

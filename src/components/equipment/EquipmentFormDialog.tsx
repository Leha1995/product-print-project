import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Equipment } from '@/lib/equipmentApi';

interface EquipmentFormDialogProps {
  item: Equipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (item: Partial<Equipment>) => void;
}

const empty = {
  name: '',
  price: '',
  location: '',
  serial: '',
  commissionedAt: '',
  note: '',
  image: '',
};

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const shrink = (dataUrl: string, max = 900) =>
  new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

const EquipmentFormDialog = ({ item, open, onOpenChange, onSave }: EquipmentFormDialogProps) => {
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? {
            name: item.name,
            price: item.price ? String(item.price) : '',
            location: item.location,
            serial: item.serial,
            commissionedAt: item.commissionedAt ? item.commissionedAt.slice(0, 10) : '',
            note: item.note,
            image: item.image || '',
          }
        : empty,
    );
  }, [open, item]);

  const set = (key: keyof typeof empty, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      id: item?.id,
      code: item?.code,
      name: form.name.trim(),
      price: Number(form.price.replace(',', '.')) || 0,
      location: form.location.trim(),
      serial: form.serial.trim(),
      commissionedAt: form.commissionedAt || null,
      note: form.note.trim(),
      image: form.image,
      active: item?.active ?? true,
    });
    onOpenChange(false);
  };

  const field =
    'mt-1 w-full border-2 border-primary bg-background px-3 py-2.5 font-body text-[15px] text-primary outline-none';
  const label =
    'font-head text-[0.72rem] font-medium uppercase tracking-[0.08em] text-primary';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[520px] overflow-y-auto border-2 border-primary bg-background p-5">
        <form onSubmit={submit}>
          <h3 className="font-head text-lg font-black uppercase text-primary">
            {item ? 'Изменить оборудование' : 'Новое оборудование'}
          </h3>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden border-2 border-primary bg-card">
              {form.image ? (
                <img src={form.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon name="ImagePlus" size={26} className="text-muted-foreground" strokeWidth={2} />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="flex cursor-pointer items-center justify-center gap-2 border-2 border-primary bg-background px-3 py-2 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted">
                <Icon name="Camera" size={16} strokeWidth={2.5} />
                {form.image ? 'Заменить фото' : 'Добавить фото'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    const raw = await readFile(file);
                    set('image', await shrink(raw));
                  }}
                />
              </label>
              {form.image && (
                <button
                  type="button"
                  onClick={() => set('image', '')}
                  className="border-2 border-primary bg-background px-3 py-1.5 font-head text-[0.68rem] font-bold uppercase text-destructive transition-colors hover:bg-muted"
                >
                  Убрать фото
                </button>
              )}
            </div>
          </div>

          <label className="mt-4 block">
            <span className={label}>Название</span>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Печь конвейерная"
              className={field}
            />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Стоимость, ₽</span>
              <input
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                inputMode="decimal"
                placeholder="185000"
                className={field}
              />
            </label>
            <label className="block">
              <span className={label}>Место</span>
              <input
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="Горячий цех"
                className={field}
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Серийный номер</span>
              <input
                value={form.serial}
                onChange={(e) => set('serial', e.target.value)}
                placeholder="Необязательно"
                className={field}
              />
            </label>
            <label className="block">
              <span className={label}>В эксплуатации с</span>
              <input
                type="date"
                value={form.commissionedAt}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set('commissionedAt', e.target.value)}
                className={field}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={label}>Заметка</span>
            <textarea
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              rows={2}
              className={`${field} resize-none`}
            />
          </label>

          {item && (
            <p className="mt-3 border-2 border-dashed border-primary px-3 py-2 text-[12px] text-muted-foreground">
              {`QR-код карточки: ${item.code}`}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-2 border-primary bg-card px-4 py-3 font-head text-[0.8rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex flex-[1.4] items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.8rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              <Icon name="Check" size={18} strokeWidth={2.5} />
              Сохранить
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EquipmentFormDialog;
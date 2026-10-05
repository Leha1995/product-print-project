import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Equipment } from '@/lib/equipmentApi';

interface RepairReturnDialogProps {
  item: Equipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: Equipment, cost: number) => Promise<void>;
}

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

const RepairReturnDialog = ({ item, open, onOpenChange, onConfirm }: RepairReturnDialogProps) => {
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCost('');
      setBusy(false);
    }
  }, [open]);

  if (!item) return null;

  const value = Math.max(0, Number(cost.replace(/\s/g, '').replace(',', '.')) || 0);
  const invalid = cost.trim() !== '' && Number.isNaN(Number(cost.replace(/\s/g, '').replace(',', '.')));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    try {
      await onConfirm(item, value);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] border-2 border-primary bg-background p-5">
        <form onSubmit={submit}>
          <h3 className="pr-8 font-head text-lg font-black uppercase text-primary">Принять с ремонта</h3>
          <p className="mt-1 truncate text-[13px] text-muted-foreground">{item.name}</p>

          <label className="mt-4 block">
            <span className="font-head text-[0.68rem] font-bold uppercase tracking-[0.06em] text-primary">
              Сколько потрачено на ремонт, ₽
            </span>
            <input
              autoFocus
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={`mt-1 w-full border-2 bg-card px-3 py-2.5 font-head text-lg font-bold text-primary outline-none ${
                invalid ? 'border-destructive' : 'border-primary'
              }`}
            />
          </label>

          <p className="mt-2 text-[12px] text-muted-foreground">
            {`Всего на ремонт будет: ${money((item.repairCost || 0) + value)}`}
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
              disabled={invalid || busy}
              className="flex flex-1 items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-2.5 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Icon name={busy ? 'Loader2' : 'CircleCheck'} size={16} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} />
              Принять в работу
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RepairReturnDialog;

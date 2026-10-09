import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { IncomingTransfer, decideTransfer, fetchIncomingTransfers } from '@/lib/equipmentApi';
import { toast } from '@/hooks/use-toast';

interface IncomingTransfersProps {
  enabled: boolean;
  onAccepted?: () => void;
}

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

const IncomingTransfers = ({ enabled, onAccepted }: IncomingTransfersProps) => {
  const [list, setList] = useState<IncomingTransfer[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchIncomingTransfers()
      .then(setList)
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, [enabled, load]);

  const current = list[0];

  const decide = async (accept: boolean) => {
    if (!current) return;
    setBusy(true);
    try {
      const rest = await decideTransfer(current.id, accept);
      setList(rest);
      toast({
        title: accept ? 'Перемещение подтверждено' : 'Перемещение отклонено',
        description: accept ? `${current.name} → ${current.toName || 'админ'}` : current.name,
      });
      if (accept) onAccepted?.();
    } catch {
      toast({ title: 'Не удалось сохранить', description: 'Проверь интернет и повтори' });
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || !current) return null;

  return (
    <Dialog open onOpenChange={() => null}>
      <DialogContent
        className="max-w-[440px] border-2 border-primary bg-background p-5 [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <h3 className="flex items-center gap-2 font-head text-lg font-black uppercase text-primary">
          <Icon name="PackageCheck" size={20} strokeWidth={2.5} />
          Перемещение оборудования
        </h3>
        <p className="text-[13px] text-muted-foreground">
          {`От: ${current.fromName}${current.toName ? ` → ${current.toName}` : ''}`}
          {list.length > 1 && ` · ещё ${list.length - 1} в очереди`}
        </p>

        <div className="mt-2 flex gap-3 border-2 border-primary bg-card p-3">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden border-2 border-primary bg-background">
            {current.image ? (
              <img src={current.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="Wrench" size={24} className="text-muted-foreground" strokeWidth={2} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-head text-[0.95rem] font-bold uppercase text-primary">{current.name}</p>
            {current.price > 0 && <p className="text-[13px] text-primary">{money(current.price)}</p>}
            {current.location && (
              <p className="text-[12px] text-muted-foreground">{`Место: ${current.location}`}</p>
            )}
            {current.serial && (
              <p className="text-[12px] text-muted-foreground">{`S/N: ${current.serial}`}</p>
            )}
            <p className="truncate text-[11px] text-muted-foreground">{current.code}</p>
          </div>
        </div>

        <p className="text-[12px] text-muted-foreground">
          {`После подтверждения карточка появится в оборудовании${current.toName ? ` админа ${current.toName}` : ''} и попадёт в его инвентаризацию.`}
        </p>

        <div className="mt-2 flex gap-2">
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 border-2 border-primary bg-card px-4 py-3 font-head text-[0.8rem] font-bold uppercase text-destructive transition-colors hover:bg-muted disabled:opacity-60"
          >
            Отклонить
          </button>
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex flex-[1.4] items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.8rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon name="Check" size={18} strokeWidth={2.5} />
            Подтвердить
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IncomingTransfers;

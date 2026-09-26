import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { FinishResult } from '@/lib/equipmentApi';

interface ScanResultDialogProps {
  result: FinishResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescan: () => void;
}

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

const ScanResultDialog = ({ result, open, onOpenChange, onRescan }: ScanResultDialogProps) => {
  if (!result) return null;
  const clean = result.missing.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[540px] overflow-y-auto border-2 border-primary bg-background p-5">
        <h3 className="font-head text-lg font-black uppercase text-primary">Итог инвентаризации</h3>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="border-2 border-primary bg-card px-2 py-2 text-center">
            <p className="font-head text-xl font-black text-primary">{result.total}</p>
            <p className="text-[11px] uppercase text-muted-foreground">Всего</p>
          </div>
          <div className="border-2 border-success bg-success px-2 py-2 text-center text-success-foreground">
            <p className="font-head text-xl font-black">{result.found.length}</p>
            <p className="text-[11px] uppercase">Найдено</p>
          </div>
          <div
            className={`border-2 px-2 py-2 text-center ${
              clean
                ? 'border-primary bg-card text-primary'
                : 'border-destructive bg-destructive text-destructive-foreground'
            }`}
          >
            <p className="font-head text-xl font-black">{result.missing.length}</p>
            <p className="text-[11px] uppercase">Не найдено</p>
          </div>
        </div>

        {clean ? (
          <p className="mt-4 flex items-center gap-2 border-2 border-success bg-success/10 px-3 py-3 font-head text-[0.8rem] font-bold uppercase text-primary">
            <Icon name="PartyPopper" size={18} strokeWidth={2.5} />
            Всё оборудование на месте
          </p>
        ) : (
          <div className="mt-4">
            <p className="font-head text-[0.75rem] font-bold uppercase text-destructive">
              {`Не отсканировано · ${money(result.missingPrice)}`}
            </p>
            <div className="mt-2 grid gap-1.5">
              {result.missing.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 border-2 border-destructive bg-card px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {item.image && (
                      <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="h-[52px] w-[52px] shrink-0 border-2 border-destructive object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-head text-[0.8rem] font-bold uppercase text-primary">
                        {item.name}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {`${item.location || 'без места'} · ${item.code}`}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-head text-[0.8rem] font-bold text-destructive">
                    {money(item.price)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 border-2 border-dashed border-primary px-3 py-2 text-[12px] text-muted-foreground">
          {`Стоимость всего оборудования: ${money(result.totalPrice)}`}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 border-2 border-primary bg-card px-4 py-3 font-head text-[0.78rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
          >
            Закрыть
          </button>
          {!clean && (
            <button
              onClick={onRescan}
              className="flex flex-[1.3] items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.78rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              <Icon name="ScanLine" size={18} strokeWidth={2.5} />
              Досканировать
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScanResultDialog;
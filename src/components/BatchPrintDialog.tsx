import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Product } from '@/data/products';

interface BatchPrintDialogProps {
  products: Product[];
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (list: Product[]) => void;
}

const BatchPrintDialog = ({
  products,
  label,
  open,
  onOpenChange,
  onConfirm,
}: BatchPrintDialogProps) => {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) {
      setCounts(Object.fromEntries(products.map((p) => [p.id, 1])));
    }
  }, [open, products]);

  const total = useMemo(
    () => products.reduce((sum, p) => sum + (counts[p.id] ?? 0), 0),
    [counts, products],
  );

  const setCount = (id: string, next: number) =>
    setCounts((prev) => ({ ...prev, [id]: Math.max(0, Math.min(99, next)) }));

  const setAll = (value: number) =>
    setCounts(Object.fromEntries(products.map((p) => [p.id, value])));

  const handleConfirm = () => {
    const list: Product[] = [];
    products.forEach((p) => {
      const n = counts[p.id] ?? 0;
      for (let i = 0; i < n; i += 1) list.push(p);
    });
    if (!list.length) return;
    onConfirm(list);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-[720px] flex-col overflow-hidden border-2 border-primary bg-background p-0">
        <div className="border-b-2 border-primary p-5">
          <span className="inline-block border-2 border-primary bg-primary px-2 py-1 font-head text-[0.7rem] font-medium uppercase tracking-[0.1em] text-primary-foreground">
            Печать партии
          </span>
          <h2 className="mt-3 font-head text-[26px] font-medium uppercase leading-tight text-primary">
            {label}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setAll(0)}
              className="border-2 border-primary bg-card px-3 py-1.5 font-head text-[0.72rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
            >
              Снять все
            </button>
            <button
              onClick={() => setAll(1)}
              className="border-2 border-primary bg-card px-3 py-1.5 font-head text-[0.72rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
            >
              По одной
            </button>
            <button
              onClick={() => setAll(2)}
              className="border-2 border-primary bg-card px-3 py-1.5 font-head text-[0.72rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
            >
              По две
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            {products.map((p) => {
              const n = counts[p.id] ?? 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 border-2 p-2 transition-colors ${
                    n > 0 ? 'border-primary bg-card' : 'border-muted bg-muted/40'
                  }`}
                >
                  <img
                    src={p.image}
                    alt={p.name}
                    className="h-12 w-12 shrink-0 border-2 border-primary object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-head text-[0.85rem] font-bold uppercase leading-tight text-primary">
                      {p.name}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {p.shelfLifeHours !== undefined
                        ? p.shelfLifeHours < 24
                          ? `Срок ${p.shelfLifeHours} ч`
                          : `Срок ${Math.round(p.shelfLifeHours / 24)} сут`
                        : 'Срок по настройкам'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => setCount(p.id, n - 1)}
                      aria-label={`Меньше этикеток: ${p.name}`}
                      className="flex h-9 w-9 items-center justify-center border-2 border-primary bg-card text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Icon name="Minus" size={16} strokeWidth={3} />
                    </button>
                    <input
                      value={n}
                      onChange={(e) => setCount(p.id, Number(e.target.value.replace(/\D/g, '')) || 0)}
                      inputMode="numeric"
                      className="h-9 w-12 border-2 border-primary bg-card text-center font-head text-[0.95rem] font-bold text-primary outline-none"
                    />
                    <button
                      onClick={() => setCount(p.id, n + 1)}
                      aria-label={`Больше этикеток: ${p.name}`}
                      className="flex h-9 w-9 items-center justify-center border-2 border-primary bg-card text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Icon name="Plus" size={16} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t-2 border-primary p-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-primary">
            Всего этикеток: {total}
          </span>
          <button
            onClick={handleConfirm}
            disabled={!total}
            className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-6 py-3 font-head text-[0.95rem] font-medium uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
          >
            <Icon name="Printer" size={18} strokeWidth={2.5} />
            Печатать
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BatchPrintDialog;

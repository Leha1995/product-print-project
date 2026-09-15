import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Product } from '@/data/products';
import { DefrostInfo } from '@/components/ReceiptPreview';

export const defrostTemps = [
  { value: 'Хранить при +2…+4 °C', label: '+2…+4 °C', hint: 'Холодильник, рыба' },
  { value: 'Хранить при +2…+6 °C', label: '+2…+6 °C', hint: 'Холодильник, общий' },
  { value: 'Хранить при 0…+2 °C', label: '0…+2 °C', hint: 'Дефрост-камера' },
  { value: 'Хранить при -18 °C', label: '-18 °C', hint: 'Морозильник' },
];

interface DefrostDialogProps {
  products: Product[];
  staffList: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (product: Product, info: DefrostInfo, copies: number) => void;
}

const DefrostDialog = ({
  products,
  staffList,
  open,
  onOpenChange,
  onConfirm,
}: DefrostDialogProps) => {
  const [query, setQuery] = useState('');
  const [productId, setProductId] = useState('');
  const [staff, setStaff] = useState('');
  const [temp, setTemp] = useState(defrostTemps[0].value);
  const [copies, setCopies] = useState(1);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setProductId('');
    setStaff(staffList[0] ?? '');
    setTemp(defrostTemps[0].value);
    setCopies(1);
  }, [open, staffList]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 60);
  }, [products, query]);

  const product = products.find((p) => p.id === productId) ?? null;
  const ready = Boolean(product && staff);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[720px] overflow-y-auto border-2 border-primary bg-background p-0">
        <div className="border-b-2 border-primary bg-primary px-5 py-4">
          <div className="flex items-center gap-2 font-head text-lg font-black uppercase tracking-[0.08em] text-primary-foreground">
            <Icon name="Snowflake" size={22} strokeWidth={2.5} />
            Маркировка дефроста
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 font-head text-[0.7rem] font-medium uppercase tracking-[0.1em] text-primary">
              Позиция
            </div>
            <label className="flex items-center gap-3 border-2 border-primary bg-card px-3 py-3">
              <Icon name="Search" size={18} className="text-primary" strokeWidth={2.5} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию"
                className="w-full bg-transparent font-body text-[15px] text-primary outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div className="mt-2 max-h-[220px] overflow-y-auto border-2 border-primary">
              {list.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProductId(p.id)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-primary/20 px-3 py-2.5 text-left font-body text-[14px] last:border-b-0 transition-colors ${
                    p.id === productId
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-primary hover:bg-muted'
                  }`}
                >
                  <span className="truncate font-semibold uppercase">{p.name}</span>
                  <span className="shrink-0 text-[12px] opacity-70">{p.weight}</span>
                </button>
              ))}
              {!list.length && (
                <div className="px-3 py-4 text-center text-[13px] text-muted-foreground">
                  Ничего не найдено
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 font-head text-[0.7rem] font-medium uppercase tracking-[0.1em] text-primary">
              Выложил
            </div>
            <div className="flex flex-wrap gap-2">
              {staffList.map((name) => (
                <button
                  key={name}
                  onClick={() => setStaff(name)}
                  className={`border-2 border-primary px-4 py-2.5 font-head text-[0.8rem] font-medium uppercase tracking-[0.04em] transition-colors ${
                    staff === name
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-card text-primary hover:bg-muted'
                  }`}
                >
                  {name}
                </button>
              ))}
              {!staffList.length && (
                <p className="text-[13px] text-muted-foreground">
                  Список поваров пуст — добавьте фамилии в настройках этикетки
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 font-head text-[0.7rem] font-medium uppercase tracking-[0.1em] text-primary">
              Температурный режим хранения
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {defrostTemps.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTemp(option.value)}
                  className={`flex items-center gap-2 border-2 border-primary px-3 py-2.5 text-left transition-colors ${
                    temp === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-primary hover:bg-muted'
                  }`}
                >
                  <Icon name="Thermometer" size={16} strokeWidth={2.5} className="shrink-0" />
                  <span>
                    <span className="block font-head text-[0.9rem] font-bold">{option.label}</span>
                    <span className="block text-[11px] opacity-70">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-2 border-primary p-3">
            <span className="font-head text-[0.75rem] font-medium uppercase tracking-[0.08em] text-primary">
              Копий
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCopies((c) => Math.max(1, c - 1))}
                className="flex h-8 w-8 items-center justify-center border-2 border-primary text-primary transition-colors hover:bg-accent"
                aria-label="Меньше копий"
              >
                <Icon name="Minus" size={16} strokeWidth={3} />
              </button>
              <span className="w-6 text-center font-head text-lg font-bold text-primary">
                {copies}
              </span>
              <button
                onClick={() => setCopies((c) => Math.min(20, c + 1))}
                className="flex h-8 w-8 items-center justify-center border-2 border-primary text-primary transition-colors hover:bg-accent"
                aria-label="Больше копий"
              >
                <Icon name="Plus" size={16} strokeWidth={3} />
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              if (!product) return;
              onConfirm(product, { staff, temp }, copies);
              onOpenChange(false);
            }}
            disabled={!ready}
            className="flex w-full items-center justify-center gap-2 border-2 border-primary bg-accent px-6 py-4 font-head text-lg font-medium uppercase tracking-[0.02em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
          >
            <Icon name="Printer" size={20} strokeWidth={2.5} />
            Печатать дефрост
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DefrostDialog;

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import EquipmentFormDialog from '@/components/equipment/EquipmentFormDialog';
import QrPrintDialog from '@/components/equipment/QrPrintDialog';
import ScanDialog from '@/components/equipment/ScanDialog';
import ScanResultDialog from '@/components/equipment/ScanResultDialog';
import useEquipment from '@/hooks/useEquipment';
import { Equipment, FinishResult, finishInventory } from '@/lib/equipmentApi';
import { toast } from '@/hooks/use-toast';

interface EquipmentSectionProps {
  userId?: number;
  targetId?: number | null;
  isAdmin: boolean;
}

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

const EquipmentSection = ({ userId, targetId, isAdmin }: EquipmentSectionProps) => {
  const { items, sessions, loading, save, remove, setSessions } = useEquipment(userId, targetId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [qrItems, setQrItems] = useState<Equipment[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.location.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q),
    );
  }, [items, query]);

  const totalPrice = items.reduce((sum, i) => (i.active ? sum + i.price : sum), 0);
  const lastSession = sessions[0];

  const handleFinish = async (scanned: string[]) => {
    try {
      const res = await finishInventory(scanned);
      setResult(res);
      setSessions(res.sessions);
      setScanOpen(false);
      setResultOpen(true);
    } catch {
      toast({ title: 'Не удалось сохранить итог', description: 'Проверь интернет и повтори' });
    }
  };

  return (
    <section id="equipment" className="px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-head text-2xl font-black uppercase text-primary md:text-3xl">
            Инвентаризация
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {`Оборудование кухни · ${items.length} позиций · ${money(totalPrice)}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              <Icon name="Plus" size={16} strokeWidth={2.5} />
              Добавить
            </button>
          )}
          {isAdmin && items.length > 0 && (
            <button
              onClick={() => {
                setQrItems(items.filter((i) => i.active));
                setQrOpen(true);
              }}
              className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              <Icon name="QrCode" size={16} strokeWidth={2.5} />
              Все наклейки
            </button>
          )}
          <button
            onClick={() => {
              if (!items.some((i) => i.active)) {
                toast({ title: 'Сначала добавь оборудование' });
                return;
              }
              setScanOpen(true);
            }}
            className="flex items-center gap-2 border-2 border-primary bg-accent px-4 py-2.5 font-head text-[0.8rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            <Icon name="ScanLine" size={18} strokeWidth={2.5} />
            Начать инвентаризацию
          </button>
        </div>
      </div>

      {lastSession?.finishedAt && (
        <p className="mt-3 border-2 border-dashed border-primary px-3 py-2 text-[12px] text-muted-foreground">
          {`Последняя проверка: ${new Date(lastSession.finishedAt).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })} · не найдено ${lastSession.missing.length} из ${lastSession.total}`}
        </p>
      )}

      {items.length > 4 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию, месту или коду"
          className="mt-4 w-full border-2 border-primary bg-background px-3 py-2.5 font-body text-[14px] text-primary outline-none"
        />
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`flex flex-col justify-between gap-3 border-2 bg-card p-3 ${
              item.active ? 'border-primary' : 'border-muted-foreground opacity-60'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate font-head text-[0.9rem] font-black uppercase text-primary">
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {`${item.location || 'место не указано'}${item.serial ? ` · ${item.serial}` : ''}`}
              </p>
              <p className="mt-1 font-head text-[0.95rem] font-bold text-primary">
                {money(item.price)}
              </p>
              <p className="mt-1 truncate text-[11px] tracking-[0.04em] text-muted-foreground">
                {item.code}
              </p>
              {item.note && (
                <p className="mt-1 text-[12px] text-muted-foreground">{item.note}</p>
              )}
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setQrItems([item]);
                  setQrOpen(true);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 border-2 border-primary bg-background px-2 py-2 font-head text-[0.68rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
              >
                <Icon name="QrCode" size={14} strokeWidth={2.5} />
                QR
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                  aria-label="Изменить"
                  className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary bg-background text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="Pencil" size={14} strokeWidth={2.5} />
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => {
                    remove(item.id);
                    toast({ title: 'Оборудование удалено', description: item.name });
                  }}
                  aria-label="Удалить"
                  className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary bg-background text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Icon name="Trash2" size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!loading && !items.length && (
        <div className="mt-6 border-2 border-dashed border-primary px-4 py-10 text-center">
          <Icon name="Wrench" size={32} className="mx-auto text-primary" strokeWidth={2} />
          <p className="mt-2 font-head text-[0.85rem] font-bold uppercase text-primary">
            Оборудования пока нет
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Добавь печи, холодильники и другое — система сама создаст QR-код для каждой позиции
          </p>
        </div>
      )}

      <EquipmentFormDialog
        item={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={async (item) => {
          await save(item);
          toast({
            title: editing ? 'Оборудование обновлено' : 'Оборудование добавлено',
            description: item.name,
          });
        }}
      />
      <QrPrintDialog items={qrItems} open={qrOpen} onOpenChange={setQrOpen} />
      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        items={items}
        onFinish={handleFinish}
      />
      <ScanResultDialog
        result={result}
        open={resultOpen}
        onOpenChange={setResultOpen}
        onRescan={() => {
          setResultOpen(false);
          setScanOpen(true);
        }}
      />
    </section>
  );
};

export default EquipmentSection;

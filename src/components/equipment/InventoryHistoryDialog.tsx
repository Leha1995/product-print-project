import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Equipment, InventorySession } from '@/lib/equipmentApi';
import { exportInventory } from '@/lib/inventoryExport';

interface InventoryHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: InventorySession[];
  items: Equipment[];
}

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const InventoryHistoryDialog = ({
  open,
  onOpenChange,
  sessions,
  items,
}: InventoryHistoryDialogProps) => {
  const [openId, setOpenId] = useState<number | null>(null);

  const byId = new Map(items.map((i) => [i.id, i]));
  const pick = (ids: string[]) =>
    ids
      .map(
        (id) =>
          byId.get(id) ||
          ({
            id,
            name: 'Удалённая позиция',
            code: id,
            price: 0,
            location: '',
            note: '',
            image: '',
            serial: '',
            active: false,
          } as Equipment),
      )
      .filter(Boolean);

  const done = sessions.filter((s) => s.finishedAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[620px] overflow-y-auto border-2 border-primary bg-background p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
            <Icon name="History" size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="font-head text-lg font-black uppercase text-primary">
              История проверок
            </h3>
            <p className="text-[13px] text-muted-foreground">
              {done.length ? `Всего проверок: ${done.length}` : 'Проверок пока не было'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {done.map((s) => {
            const expanded = openId === s.id;
            const missing = pick(s.missing);
            const clean = s.missing.length === 0;
            return (
              <div key={s.id} className="border-2 border-primary bg-card">
                <button
                  onClick={() => setOpenId(expanded ? null : s.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="font-head text-[0.82rem] font-bold uppercase text-primary">
                      {when(s.finishedAt)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {clean
                        ? `Всё на месте · ${s.total} позиций`
                        : `Не найдено ${s.missing.length} из ${s.total} · ${money(s.missingPrice)}`}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`flex h-7 min-w-7 items-center justify-center border-2 px-1.5 font-head text-[0.75rem] font-black ${
                        clean
                          ? 'border-success bg-success text-success-foreground'
                          : 'border-destructive bg-destructive text-destructive-foreground'
                      }`}
                    >
                      {clean ? '✓' : s.missing.length}
                    </span>
                    <Icon
                      name={expanded ? 'ChevronUp' : 'ChevronDown'}
                      size={18}
                      strokeWidth={2.5}
                      className="text-primary"
                    />
                  </span>
                </button>

                {expanded && (
                  <div className="border-t-2 border-primary px-3 py-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="border-2 border-primary bg-background px-2 py-1.5 text-center">
                        <p className="font-head text-base font-black text-primary">{s.total}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">Всего</p>
                      </div>
                      <div className="border-2 border-success bg-background px-2 py-1.5 text-center">
                        <p className="font-head text-base font-black text-primary">
                          {s.scanned.length}
                        </p>
                        <p className="text-[10px] uppercase text-muted-foreground">Найдено</p>
                      </div>
                      <div className="border-2 border-destructive bg-background px-2 py-1.5 text-center">
                        <p className="font-head text-base font-black text-destructive">
                          {s.missing.length}
                        </p>
                        <p className="text-[10px] uppercase text-muted-foreground">Не найдено</p>
                      </div>
                    </div>

                    {missing.length > 0 && (
                      <div className="mt-2 grid gap-1">
                        {missing.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 border-2 border-destructive bg-background px-2 py-1.5"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {item.image && (
                                <img
                                  src={item.image}
                                  alt=""
                                  loading="lazy"
                                  className="h-9 w-9 shrink-0 border border-destructive object-cover"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-head text-[0.72rem] font-bold uppercase text-primary">
                                  {item.name}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {item.location || 'без места'}
                                </p>
                              </div>
                            </div>
                            <span className="shrink-0 font-head text-[0.72rem] font-bold text-destructive">
                              {money(item.price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() =>
                        exportInventory(
                          {
                            sessionId: s.id,
                            found: pick(s.scanned),
                            missing,
                            total: s.total,
                            totalPrice: s.totalPrice,
                            missingPrice: s.missingPrice,
                            sessions,
                          },
                          s.finishedAt,
                        )
                      }
                      className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-primary bg-background px-3 py-2 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                    >
                      <Icon name="FileSpreadsheet" size={15} strokeWidth={2.5} />
                      Выгрузить в Excel
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {done.length === 0 && (
            <p className="border-2 border-dashed border-primary px-3 py-6 text-center text-[13px] text-muted-foreground">
              Здесь появятся все завершённые инвентаризации
            </p>
          )}
        </div>

        <button
          onClick={() => onOpenChange(false)}
          className="mt-4 w-full border-2 border-primary bg-card px-4 py-3 font-head text-[0.78rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
        >
          Закрыть
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryHistoryDialog;

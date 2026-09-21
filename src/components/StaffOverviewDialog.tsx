import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { StaffOverview, fetchOverview } from '@/lib/catalogApi';
import { formatLeft } from '@/hooks/usePrintHistory';
import { toast } from '@/hooks/use-toast';

interface StaffOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenStaff: (id: number) => void;
}

const StaffOverviewDialog = ({ open, onOpenChange, onOpenStaff }: StaffOverviewDialogProps) => {
  const [staff, setStaff] = useState<StaffOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchOverview()
      .then((list) => {
        setStaff(list);
        setExpanded(list.find((s) => s.total > 0)?.id ?? null);
      })
      .catch(() => toast({ title: 'Не удалось загрузить сводку' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const totalExpired = staff.reduce((sum, s) => sum + s.expired.length, 0);
  const totalSoon = staff.reduce((sum, s) => sum + s.soon.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[760px] overflow-y-auto border-2 border-primary bg-background p-0">
        <div className="border-b-2 border-primary bg-primary px-5 py-4">
          <div className="flex items-center gap-2 font-head text-lg font-black uppercase tracking-[0.08em] text-primary-foreground">
            <Icon name="ClipboardList" size={22} strokeWidth={2.5} />
            Сводка по сотрудникам
          </div>
          <p className="mt-1 text-[12px] text-primary-foreground/70">
            Просрочено: {totalExpired} · Скоро истекает: {totalSoon}
          </p>
        </div>

        <div className="space-y-3 p-5">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 border-2 border-primary bg-card px-4 py-2 font-head text-[0.75rem] font-bold uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Icon name="RefreshCw" size={15} strokeWidth={2.5} />
            Обновить
          </button>

          {loading && <p className="py-6 text-center text-muted-foreground">Загружаем…</p>}

          {!loading && !staff.length && (
            <p className="py-6 text-center text-muted-foreground">
              За вами пока не закреплены сотрудники
            </p>
          )}

          {!loading &&
            staff.map((person) => {
              const isOpen = expanded === person.id;
              const clean = !person.total;
              return (
                <div
                  key={person.id}
                  className={`border-2 ${
                    person.expired.length
                      ? 'border-destructive bg-destructive/10'
                      : person.soon.length
                        ? 'border-warning bg-warning/15'
                        : 'border-primary bg-card'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <button
                      onClick={() => setExpanded(isOpen ? null : person.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Icon
                        name={clean ? 'CircleCheck' : isOpen ? 'ChevronDown' : 'ChevronRight'}
                        size={18}
                        strokeWidth={2.5}
                        className="shrink-0 text-primary"
                      />
                      <span className="truncate font-head text-[0.9rem] font-bold uppercase text-primary">
                        {person.fullName || person.username}
                      </span>
                    </button>

                    {person.expired.length > 0 && (
                      <span className="shrink-0 border-2 border-destructive bg-destructive px-2 py-1 font-head text-[0.7rem] font-bold uppercase text-destructive-foreground">
                        Просрочено: {person.expired.length}
                      </span>
                    )}
                    {person.soon.length > 0 && (
                      <span className="shrink-0 border-2 border-warning bg-warning px-2 py-1 font-head text-[0.7rem] font-bold uppercase text-warning-foreground">
                        Истекает: {person.soon.length}
                      </span>
                    )}
                    {clean && (
                      <span className="shrink-0 border-2 border-primary bg-background px-2 py-1 font-head text-[0.7rem] font-bold uppercase text-primary">
                        Всё в сроке
                      </span>
                    )}

                    <button
                      onClick={() => {
                        onOpenStaff(person.id);
                        onOpenChange(false);
                      }}
                      className="flex shrink-0 items-center gap-1.5 border-2 border-primary bg-accent px-3 py-1.5 font-head text-[0.7rem] font-bold uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5"
                    >
                      <Icon name="ArrowRight" size={14} strokeWidth={2.5} />
                      В каталог
                    </button>
                  </div>

                  {isOpen && person.total > 0 && (
                    <div className="space-y-1 border-t-2 border-primary bg-background/60 p-3">
                      {person.expired.map((item) => (
                        <div
                          key={`e-${item.id}`}
                          className="flex items-center justify-between gap-3 border-2 border-destructive bg-background px-2.5 py-1.5"
                        >
                          <span className="truncate font-head text-[0.8rem] font-bold uppercase text-destructive">
                            {item.name}
                          </span>
                          <span className="shrink-0 text-[12px] font-bold uppercase text-destructive">
                            Срок вышел
                          </span>
                        </div>
                      ))}
                      {person.soon.map((item) => (
                        <div
                          key={`s-${item.id}`}
                          className="flex items-center justify-between gap-3 border-2 border-warning bg-background px-2.5 py-1.5"
                        >
                          <span className="truncate font-head text-[0.8rem] font-bold uppercase text-primary">
                            {item.name}
                          </span>
                          <span className="shrink-0 text-[12px] font-bold uppercase text-warning-foreground">
                            Осталось {formatLeft(item.leftMs)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StaffOverviewDialog;

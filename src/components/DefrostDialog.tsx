import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { DefrostInfo } from '@/components/DefrostLabel';

export const defrostTemps = [
  { value: 'Хранить при +2…+4 °C', label: '+2…+4 °C', hint: 'Режим хранения дефроста' },
];

interface DefrostDialogProps {
  staffList: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (info: DefrostInfo, copies: number) => void;
}

const DefrostDialog = ({ staffList, open, onOpenChange, onConfirm }: DefrostDialogProps) => {
  const [staff, setStaff] = useState('');
  const [temp, setTemp] = useState(defrostTemps[0].value);
  const [copies, setCopies] = useState(1);
  const hours = 12;

  useEffect(() => {
    if (!open) return;
    setStaff(staffList[0] ?? '');
    setTemp(defrostTemps[0].value);
    setCopies(1);
  }, [open, staffList]);

  const bestBefore = new Date(Date.now() + hours * 3600000).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[620px] overflow-y-auto border-2 border-primary bg-background p-0">
        <div className="border-b-2 border-primary bg-primary px-5 py-4">
          <div className="flex items-center gap-2 font-head text-lg font-black uppercase tracking-[0.08em] text-primary-foreground">
            <Icon name="Snowflake" size={22} strokeWidth={2.5} />
            Маркировка дефроста
          </div>
        </div>

        <div className="space-y-5 p-5">
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
            <div className="flex items-center gap-2 border-2 border-primary bg-primary px-3 py-2.5 text-primary-foreground">
              <Icon name="Thermometer" size={16} strokeWidth={2.5} className="shrink-0" />
              <span>
                <span className="block font-head text-[0.9rem] font-bold">
                  {defrostTemps[0].label}
                </span>
                <span className="block text-[11px] opacity-70">{defrostTemps[0].hint}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-2 border-primary p-3">
            <span className="font-head text-[0.75rem] font-medium uppercase tracking-[0.08em] text-primary">
              Годен до
            </span>
            <span className="font-head text-[0.95rem] font-bold text-primary">
              {bestBefore} <span className="text-[12px] font-medium opacity-70">(12 ч)</span>
            </span>
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
              onConfirm({ staff, temp, hours }, copies);
              onOpenChange(false);
            }}
            disabled={!staff}
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
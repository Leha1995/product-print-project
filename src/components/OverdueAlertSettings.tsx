import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { MaxStatus, fetchMaxStatus, saveOverdueSettings } from '@/lib/maxApi';

const PRESETS: { label: string; from: string; to: string }[] = [
  { label: 'Круглосуточно', from: '00:00', to: '23:59' },
  { label: 'Рабочий день 9–18', from: '09:00', to: '18:00' },
  { label: 'Смена 8–22', from: '08:00', to: '22:00' },
  { label: 'Вечер и ночь 18–9', from: '18:00', to: '09:00' },
];

const windowText = (from: string, to: string) =>
  from === '00:00' && to === '23:59' ? 'в любое время' : `с ${from} до ${to}`;

const OverdueAlertSettings = () => {
  const [status, setStatus] = useState<MaxStatus | null>(null);
  const [from, setFrom] = useState('00:00');
  const [to, setTo] = useState('23:59');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMaxStatus()
      .then((s) => {
        setStatus(s);
        setFrom(s.overdueFrom || '00:00');
        setTo(s.overdueTo || '23:59');
      })
      .catch(() => setStatus(null));
  }, []);

  if (!status?.canReport) return null;

  const enabled = status.overdueEnabled !== false;
  const savedFrom = status.overdueFrom || '00:00';
  const savedTo = status.overdueTo || '23:59';
  const changed = from !== savedFrom || to !== savedTo;

  const save = async (nextEnabled: boolean, nextFrom: string, nextTo: string) => {
    if (busy) return;
    if (nextFrom === nextTo) {
      toast({ title: 'Начало и конец совпадают', description: 'Выберите разное время' });
      return;
    }
    setBusy(true);
    try {
      const s = await saveOverdueSettings(nextEnabled, nextFrom, nextTo);
      setStatus(s);
      setFrom(s.overdueFrom || nextFrom);
      setTo(s.overdueTo || nextTo);
      toast({
        title: nextEnabled ? `Уведомления о просрочках ${windowText(nextFrom, nextTo)}` : 'Уведомления о просрочках выключены',
        description: nextEnabled ? 'Просрочки вне этого времени придут одним сообщением, как только оно начнётся' : undefined,
      });
    } catch {
      toast({ title: 'Не удалось сохранить', description: 'Попробуйте ещё раз' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-primary bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary bg-destructive text-destructive-foreground">
          <Icon name="TriangleAlert" fallback="AlertTriangle" size={18} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-head text-[0.8rem] font-black uppercase text-primary">Уведомления о просрочках</p>
          <p className="text-[12px] text-muted-foreground">
            {enabled
              ? `Сразу, как сотрудник не успел к сроку — ${windowText(savedFrom, savedTo)}, в MAX и Telegram`
              : 'Выключены — просрочки видны в сводке и в приложении'}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          onCheckedChange={(v) => save(v, savedFrom, savedTo)}
          aria-label="Включить уведомления о просрочках"
        />
      </div>

      {enabled && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = savedFrom === p.from && savedTo === p.to;
              return (
                <button
                  key={p.label}
                  onClick={() => save(true, p.from, p.to)}
                  disabled={busy}
                  className={`min-h-[40px] border-2 border-primary px-3 py-1.5 font-head text-[0.68rem] font-bold uppercase transition-colors disabled:opacity-60 ${
                    active ? 'bg-primary text-primary-foreground' : 'bg-background text-primary hover:bg-muted'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-primary">
            <span>Своё время: с</span>
            <input
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-[40px] border-2 border-primary bg-background px-2 py-1.5 font-body text-[14px] text-primary outline-none"
              aria-label="Начало"
            />
            <span>до</span>
            <input
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-h-[40px] border-2 border-primary bg-background px-2 py-1.5 font-body text-[14px] text-primary outline-none"
              aria-label="Конец"
            />
            {changed && (
              <button
                onClick={() => save(true, from, to)}
                disabled={busy || !from || !to}
                className="flex min-h-[40px] items-center gap-1.5 border-2 border-primary bg-accent px-3 py-1.5 font-head text-[0.7rem] font-bold uppercase text-accent-foreground disabled:opacity-60"
              >
                <Icon name={busy ? 'Loader2' : 'Check'} size={14} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} />
                Сохранить
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default OverdueAlertSettings;

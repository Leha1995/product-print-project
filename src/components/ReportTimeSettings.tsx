import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { MaxStatus, fetchMaxStatus, saveReportSettings } from '@/lib/maxApi';

const PRESETS = ['09:00', '12:00', '18:00', '21:00', '23:00'];

const ReportTimeSettings = () => {
  const [status, setStatus] = useState<MaxStatus | null>(null);
  const [time, setTime] = useState('23:00');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMaxStatus()
      .then((s) => {
        setStatus(s);
        if (s.reportTime) setTime(s.reportTime);
      })
      .catch(() => setStatus(null));
  }, []);

  if (!status?.canReport) return null;

  const enabled = status.reportEnabled !== false;
  const saved = status.reportTime || '23:00';

  const save = async (nextTime: string, nextEnabled: boolean) => {
    if (busy || !/^\d{2}:\d{2}$/.test(nextTime)) return;
    setBusy(true);
    try {
      const s = await saveReportSettings(nextTime, nextEnabled);
      setStatus(s);
      setTime(s.reportTime || nextTime);
      toast({
        title: nextEnabled ? `Сводка будет приходить в ${nextTime}` : 'Ежедневная сводка выключена',
        description: nextEnabled ? 'В MAX и Telegram — туда, что подключено' : undefined,
      });
    } catch {
      toast({ title: 'Не удалось сохранить время', description: 'Попробуйте ещё раз' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-primary bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
          <Icon name="AlarmClock" size={18} strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-head text-[0.8rem] font-black uppercase text-primary">Ежедневная сводка</p>
          <p className="text-[12px] text-muted-foreground">
            {enabled
              ? `Каждый день в ${saved} — по вашим точкам и сотрудникам, в MAX и Telegram`
              : 'Выключена — сводку можно запросить у бота MAX вручную'}
          </p>
        </div>
        <Switch checked={enabled} disabled={busy} onCheckedChange={(v) => save(saved, v)} aria-label="Включить сводку" />
      </div>

      {enabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => save(p, true)}
              disabled={busy}
              className={`min-h-[40px] border-2 border-primary px-3 py-1.5 font-head text-[0.72rem] font-bold transition-colors disabled:opacity-60 ${
                saved === p ? 'bg-primary text-primary-foreground' : 'bg-background text-primary hover:bg-muted'
              }`}
            >
              {p}
            </button>
          ))}
          <div className="flex items-center gap-1.5">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="min-h-[40px] border-2 border-primary bg-background px-2 py-1.5 font-body text-[14px] text-primary outline-none"
              aria-label="Своё время"
            />
            {time !== saved && (
              <button
                onClick={() => save(time, true)}
                disabled={busy}
                className="flex min-h-[40px] items-center gap-1.5 border-2 border-primary bg-accent px-3 py-1.5 font-head text-[0.7rem] font-bold uppercase text-accent-foreground disabled:opacity-60"
              >
                <Icon name={busy ? 'Loader2' : 'Check'} size={14} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} />
                Сохранить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportTimeSettings;

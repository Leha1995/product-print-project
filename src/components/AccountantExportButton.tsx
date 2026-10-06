import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import { fetchAllPoints } from '@/lib/equipmentApi';
import { ExportPeriod, exportAllPoints } from '@/lib/pointsExport';

type Preset = 'month' | 'prevMonth' | 'quarter' | 'prevQuarter' | 'year' | 'all' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ru = (s: string) => (s ? s.split('-').reverse().join('.') : '');

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

const presetRange = (preset: Preset, now = new Date()): ExportPeriod | null => {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);
  if (preset === 'month') {
    return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), label: `${MONTHS[m]} ${y}` };
  }
  if (preset === 'prevMonth') {
    const d = new Date(y, m - 1, 1);
    return {
      from: iso(d),
      to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    };
  }
  if (preset === 'quarter') {
    return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)), label: `${q + 1} квартал ${y}` };
  }
  if (preset === 'prevQuarter') {
    const d = new Date(y, q * 3 - 3, 1);
    const pq = Math.floor(d.getMonth() / 3);
    return {
      from: iso(d),
      to: iso(new Date(d.getFullYear(), d.getMonth() + 3, 0)),
      label: `${pq + 1} квартал ${d.getFullYear()}`,
    };
  }
  if (preset === 'year') {
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y} год` };
  }
  return null;
};

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'Этот месяц' },
  { key: 'prevMonth', label: 'Прошлый месяц' },
  { key: 'quarter', label: 'Этот квартал' },
  { key: 'prevQuarter', label: 'Прошлый квартал' },
  { key: 'year', label: 'Этот год' },
  { key: 'all', label: 'Всё время' },
  { key: 'custom', label: 'Свои даты' },
];

const AccountantExportButton = () => {
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState(() => presetRange('month')?.from || '');
  const [to, setTo] = useState(() => iso(new Date()));

  const range = useMemo<ExportPeriod | null>(() => {
    if (preset !== 'custom') return presetRange(preset);
    if (!from && !to) return null;
    const label = from && to ? `${ru(from)} – ${ru(to)}` : from ? `с ${ru(from)}` : `по ${ru(to)}`;
    return { from, to, label };
  }, [preset, from, to]);

  const invalid = preset === 'custom' && Boolean(from && to && from > to);

  const run = async () => {
    if (busy) return;
    if (invalid) {
      toast({ title: 'Дата «с» позже даты «по»', description: 'Поправьте период' });
      return;
    }
    setBusy(true);
    try {
      const points = await fetchAllPoints(range?.from, range?.to);
      if (!points.length) {
        toast({ title: 'За вами не закреплено ни одной точки', description: 'Обратитесь к супер-админу' });
        return;
      }
      exportAllPoints(points, range);
      toast({
        title: 'Файл выгружен',
        description: `${range ? range.label : 'За всё время'} · точек: ${points.length}`,
      });
    } catch {
      toast({ title: 'Не удалось выгрузить', description: 'Проверьте интернет и повторите' });
    } finally {
      setBusy(false);
    }
  };

  const dateClass =
    'border-2 border-primary bg-background px-2 py-1.5 font-body text-[14px] text-primary outline-none';

  return (
    <div className="print-hide border-b-2 border-primary bg-card px-4 py-3 md:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-head text-[0.8rem] font-black uppercase text-primary">Отчёт по всем точкам</p>
            <p className="text-[12px] text-muted-foreground">
              {`Ремонты и выполненные задачи — ${range ? range.label : 'за всё время'}. Стоимость и остаток — на сегодня`}
            </p>
          </div>
          <button
            onClick={run}
            disabled={busy || invalid}
            className="flex min-h-[44px] items-center gap-2 border-2 border-primary bg-success px-4 py-2 font-head text-[0.78rem] font-black uppercase text-success-foreground shadow-[3px_3px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon
              name={busy ? 'Loader2' : 'FileSpreadsheet'}
              size={18}
              strokeWidth={2.5}
              className={busy ? 'animate-spin' : ''}
            />
            {busy ? 'Собираю файл…' : 'Excel по всем точкам'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Icon name="CalendarRange" fallback="Calendar" size={16} strokeWidth={2.5} className="mr-1 text-primary" />
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`border-2 border-primary px-2.5 py-1.5 font-head text-[0.68rem] font-bold uppercase transition-colors ${
                preset === p.key ? 'bg-primary text-primary-foreground' : 'bg-background text-primary hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-primary">
            <span>с</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={dateClass} />
            <span>по</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={dateClass} />
            {invalid && <span className="font-bold text-destructive">Дата «с» позже даты «по»</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountantExportButton;

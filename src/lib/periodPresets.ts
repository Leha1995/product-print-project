export interface ExportPeriod {
  from: string;
  to: string;
  label: string;
}

export type Preset = 'month' | 'prevMonth' | 'quarter' | 'prevQuarter' | 'year' | 'all' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ruDay = (s: string) => (s ? s.split('-').reverse().join('.') : '');

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

export const presetRange = (preset: Preset, now = new Date()): ExportPeriod | null => {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);
  if (preset === 'month') {
    return { from: isoDay(new Date(y, m, 1)), to: isoDay(new Date(y, m + 1, 0)), label: `${MONTHS[m]} ${y}` };
  }
  if (preset === 'prevMonth') {
    const d = new Date(y, m - 1, 1);
    return {
      from: isoDay(d),
      to: isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    };
  }
  if (preset === 'quarter') {
    return { from: isoDay(new Date(y, q * 3, 1)), to: isoDay(new Date(y, q * 3 + 3, 0)), label: `${q + 1} квартал ${y}` };
  }
  if (preset === 'prevQuarter') {
    const d = new Date(y, q * 3 - 3, 1);
    return {
      from: isoDay(d),
      to: isoDay(new Date(d.getFullYear(), d.getMonth() + 3, 0)),
      label: `${Math.floor(d.getMonth() / 3) + 1} квартал ${d.getFullYear()}`,
    };
  }
  if (preset === 'year') return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y} год` };
  return null;
};

export const customRange = (from: string, to: string): ExportPeriod | null => {
  if (!from && !to) return null;
  const label = from && to ? `${ruDay(from)} – ${ruDay(to)}` : from ? `с ${ruDay(from)}` : `по ${ruDay(to)}`;
  return { from, to, label };
};

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'Этот месяц' },
  { key: 'prevMonth', label: 'Прошлый месяц' },
  { key: 'quarter', label: 'Этот квартал' },
  { key: 'prevQuarter', label: 'Прошлый квартал' },
  { key: 'year', label: 'Этот год' },
  { key: 'all', label: 'Всё время' },
  { key: 'custom', label: 'Свои даты' },
];

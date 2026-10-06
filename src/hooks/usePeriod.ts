import { useMemo, useState } from 'react';
import { ExportPeriod, Preset, customRange, isoDay, presetRange } from '@/lib/periodPresets';

const usePeriod = (initial: Preset = 'month') => {
  const [preset, setPreset] = useState<Preset>(initial);
  const [from, setFrom] = useState(() => presetRange('month')?.from || '');
  const [to, setTo] = useState(() => isoDay(new Date()));

  const range = useMemo<ExportPeriod | null>(
    () => (preset === 'custom' ? customRange(from, to) : presetRange(preset)),
    [preset, from, to],
  );
  const invalid = preset === 'custom' && Boolean(from && to && from > to);

  return { preset, setPreset, from, setFrom, to, setTo, range, invalid };
};

export type PeriodState = ReturnType<typeof usePeriod>;
export default usePeriod;

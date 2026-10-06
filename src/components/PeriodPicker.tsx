import Icon from '@/components/ui/icon';
import { PRESETS } from '@/lib/periodPresets';
import { PeriodState } from '@/hooks/usePeriod';

const dateClass =
  'border-2 border-primary bg-background px-2 py-1.5 font-body text-[14px] text-primary outline-none';

const PeriodPicker = ({ period }: { period: PeriodState }) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-1.5">
      <Icon name="CalendarRange" fallback="Calendar" size={16} strokeWidth={2.5} className="mr-1 text-primary" />
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => period.setPreset(p.key)}
          className={`border-2 border-primary px-2.5 py-1.5 font-head text-[0.68rem] font-bold uppercase transition-colors ${
            period.preset === p.key ? 'bg-primary text-primary-foreground' : 'bg-background text-primary hover:bg-muted'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
    {period.preset === 'custom' && (
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-primary">
        <span>с</span>
        <input
          type="date"
          value={period.from}
          max={period.to || undefined}
          onChange={(e) => period.setFrom(e.target.value)}
          className={dateClass}
        />
        <span>по</span>
        <input
          type="date"
          value={period.to}
          min={period.from || undefined}
          onChange={(e) => period.setTo(e.target.value)}
          className={dateClass}
        />
        {period.invalid && <span className="font-bold text-destructive">Дата «с» позже даты «по»</span>}
      </div>
    )}
  </div>
);

export default PeriodPicker;

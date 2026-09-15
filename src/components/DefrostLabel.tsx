import Icon from '@/components/ui/icon';
import { LabelSettings, getPaper } from '@/hooks/useLabelSettings';

export interface DefrostInfo {
  staff: string;
  temp: string;
}

interface DefrostLabelProps {
  info: DefrostInfo;
  printedAt: Date;
  settings: LabelSettings;
}

const DefrostLabel = ({ info, printedAt, settings }: DefrostLabelProps) => {
  const paper = getPaper(settings.paper);
  const tiny = paper.widthMm <= 45;
  const micro = tiny && (paper.heightMm ?? 99) <= 30;
  const large = paper.widthMm >= 105;

  const stamp = printedAt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: micro ? '2-digit' : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`print-area animate-print-out mx-auto border-2 border-primary bg-white font-body text-primary ${micro ? 'p-1.5' : tiny ? 'p-2' : 'p-4'}`}
      style={{ maxWidth: `${paper.widthMm * 3.5}px` }}
    >
      <div
        className={`text-center font-head font-black uppercase tracking-[0.04em] ${large ? 'text-lg' : micro ? 'text-[8px] leading-none' : tiny ? 'text-[10px] leading-tight' : 'text-sm'}`}
      >
        {settings.shopName}
      </div>

      <div
        className={`border-primary bg-primary text-center font-head font-black uppercase tracking-[0.14em] text-primary-foreground ${
          micro
            ? 'mt-1 border py-0.5 text-[11px]'
            : tiny
              ? 'mt-1.5 border-2 py-1 text-[15px]'
              : large
                ? 'mt-3 border-2 py-3 text-4xl'
                : 'mt-3 border-2 py-2 text-2xl'
        }`}
      >
        Дефрост
      </div>

      <dl
        className={`${
          micro ? 'mt-1 space-y-0 text-[8px] leading-[1.25]' : tiny ? 'mt-2 space-y-0.5 text-[10px]' : 'mt-3 space-y-1 text-[14px]'
        }`}
      >
        <div className="flex justify-between gap-2">
          <dt className="shrink-0">Выложено</dt>
          <dd className="font-semibold">{stamp}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0">Выложил</dt>
          <dd className="truncate font-semibold">{info.staff || '—'}</dd>
        </div>
      </dl>

      <div
        className={`flex items-center justify-center gap-1 border-primary font-head font-bold uppercase leading-tight ${
          micro
            ? 'mt-1 border px-1 py-px text-[8px]'
            : tiny
              ? 'mt-1.5 border-2 px-1 py-0.5 text-[9px]'
              : 'mt-3 border-2 px-2 py-1.5 text-[13px] tracking-[0.04em]'
        }`}
      >
        <Icon
          name="Thermometer"
          size={micro ? 9 : tiny ? 11 : 15}
          strokeWidth={2.5}
          className="shrink-0"
        />
        <span>{info.temp}</span>
      </div>
    </div>
  );
};

export default DefrostLabel;

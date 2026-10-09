import { LabelSettings, getPaper } from '@/hooks/useLabelSettings';

export interface DefrostInfo {
  staff: string;
  temp: string;
  hours?: number;
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

  const fmt = (d: Date) =>
    d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: micro ? '2-digit' : 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const stamp = fmt(printedAt);
  const bestBefore = info.hours
    ? fmt(new Date(printedAt.getTime() + info.hours * 3600000))
    : null;

  const textLabel = JSON.stringify({
    title: 'Дефрост',
    center: true,
    rows: [
      { label: 'Выложено', value: stamp },
      ...(bestBefore ? [{ label: 'Годен до', value: bestBefore, bold: true }] : []),
      { label: 'Выложил', value: info.staff || '—' },
    ],
    footer: info.temp,
  });

  return (
    <div
      data-text-label={textLabel}
      className={`print-area animate-print-out mx-auto border-y-2 border-primary bg-white font-body text-primary ${micro ? 'p-1' : tiny ? 'p-2' : 'p-4'}`}
      style={{ maxWidth: `${paper.widthMm * 3.5}px`, minHeight: micro ? `${paper.heightMm! * 3.5}px` : undefined }}
    >
      <div className="flex h-full w-full flex-col justify-between">
        <div
          className={`text-center font-head font-bold uppercase leading-tight text-primary ${
            large ? 'text-2xl' : micro ? 'text-[19px]' : tiny ? 'text-[11px]' : 'text-lg'
          }`}
        >
          Дефрост
        </div>

        <dl
          className={`${
            micro
              ? 'space-y-0 text-[10px] leading-[1.2]'
              : tiny
                ? 'mt-2 space-y-0.5 text-[10px]'
                : 'mt-3 space-y-1 text-[14px]'
          }`}
        >
          <div className="flex justify-between gap-1">
            <dt className="shrink-0">Выложено</dt>
            <dd className="font-semibold">{stamp}</dd>
          </div>
          {bestBefore && (
            <div
              className={`flex items-baseline justify-between gap-1 font-head font-bold ${
                large ? 'text-2xl' : micro ? 'text-[13px]' : tiny ? 'text-[13px]' : 'text-lg'
              }`}
            >
              <dt className="shrink-0">Годен до</dt>
              <dd>{bestBefore}</dd>
            </div>
          )}
          <div className="flex justify-between gap-1">
            <dt className="shrink-0">Выложил</dt>
            <dd className="truncate font-semibold">{info.staff || '—'}</dd>
          </div>
        </dl>

        <div
          className={`flex items-center justify-center font-head font-bold uppercase leading-tight ${
            micro
              ? 'px-1 py-0.5 text-[10px]'
              : tiny
                ? 'mt-1.5 px-1 py-0.5 text-[9px]'
                : 'mt-3 px-2 py-1.5 text-[13px] tracking-[0.04em]'
          }`}
        >
          <span>{info.temp}</span>
        </div>
      </div>
    </div>
  );
};

export default DefrostLabel;
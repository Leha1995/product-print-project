import Icon from '@/components/ui/icon';
import { Product } from '@/data/products';
import { LabelSettings, defaultLabelSettings, getPaper } from '@/hooks/useLabelSettings';

export interface DefrostInfo {
  staff: string;
  temp: string;
}

interface ReceiptPreviewProps {
  product: Product;
  copies: number;
  printedAt: Date;
  settings?: LabelSettings;
  defrost?: DefrostInfo | null;
}

const ReceiptPreview = ({
  product,
  copies,
  printedAt,
  settings = defaultLabelSettings,
  defrost = null,
}: ReceiptPreviewProps) => {
  const paper = getPaper(settings.paper);
  const tiny = paper.widthMm <= 45;
  const micro = tiny && (paper.heightMm ?? 99) <= 30;

  const fmt = (date: Date) =>
    date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: micro ? '2-digit' : 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const stamp = fmt(printedAt);
  const hours = product.shelfLifeHours ?? settings.shelfLifeHours;
  const expiry = fmt(new Date(printedAt.getTime() + hours * 3600000));
  const compact = paper.widthMm <= 58;
  const large = paper.widthMm >= 105;

  return (
    <div
      className={`print-area animate-print-out mx-auto border-2 border-primary bg-white font-body text-primary ${micro ? 'p-1.5' : tiny ? 'p-2' : 'p-4'}`}
      style={{ maxWidth: `${paper.widthMm * 3.5}px` }}
    >
      {settings.logo && !micro && (
        <img
          src={settings.logo}
          alt=""
          className={`mx-auto mb-1 w-auto object-contain ${tiny ? 'max-h-[26px]' : 'mb-2 max-h-[52px]'}`}
        />
      )}
      <div
        className={`text-center font-head font-black uppercase tracking-[0.04em] ${large ? 'text-lg' : micro ? 'text-[8px] leading-none' : tiny ? 'text-[10px] leading-tight' : 'text-sm'}`}
      >
        {settings.shopName}
      </div>

      {defrost && (
        <div
          className={`mt-1 border-primary bg-primary text-center font-head font-black uppercase tracking-[0.12em] text-primary-foreground ${
            micro ? 'border py-px text-[8px]' : tiny ? 'border-2 py-0.5 text-[10px]' : 'border-2 py-1 text-sm'
          }`}
        >
          Дефрост
        </div>
      )}

      <div
        className={`border-dashed border-primary ${micro ? 'my-0.5 border-t' : tiny ? 'my-1.5 border-t-2' : 'my-3 border-t-2'}`}
      />

      <div
        className={`font-head font-bold uppercase leading-tight ${large ? 'text-2xl' : micro ? 'line-clamp-2 text-[9px]' : tiny ? 'text-[11px]' : compact ? 'text-base' : 'text-lg'}`}
      >
        {product.name}
      </div>
      {settings.showComposition && (
        <div
          className={`mt-1 ${micro ? 'line-clamp-2 text-[7px] leading-[1.15]' : tiny ? 'line-clamp-2 text-[9px] leading-tight' : 'text-[13px]'}`}
        >
          {product.composition}
        </div>
      )}

      <div
        className={`border-dashed border-primary ${micro ? 'my-0.5 border-t' : tiny ? 'my-1.5 border-t-2' : 'my-3 border-t-2'}`}
      />

      <dl
        className={
          micro ? 'space-y-0 text-[7px] leading-[1.25]' : tiny ? 'space-y-0.5 text-[9px]' : 'space-y-1 text-[13px]'
        }
      >
        {settings.showWeight && (
          <div className="flex justify-between">
            <dt>{micro ? 'Вес' : 'Вес / объём'}</dt>
            <dd className="font-semibold">{product.weight}</dd>
          </div>
        )}
        {!tiny && (
          <div className="flex justify-between">
            <dt>Копий</dt>
            <dd className="font-semibold">{copies} шт.</dd>
          </div>
        )}
        {settings.showDate && (
          <div className="flex justify-between">
            <dt className="shrink-0">
              {defrost ? (micro ? 'Выл.' : 'Выложено') : micro ? 'Изгот.' : 'Изготовлено'}
            </dt>
            <dd className="font-semibold">{stamp}</dd>
          </div>
        )}
        {defrost && (
          <div className="flex justify-between gap-2">
            <dt className="shrink-0">Выложил</dt>
            <dd className="truncate font-semibold">{defrost.staff || '—'}</dd>
          </div>
        )}
        {!defrost &&
          settings.showStaff &&
          (micro ? (
            <div className="flex justify-between gap-1">
              <dt className="shrink-0">Изг. / пров.</dt>
              <dd className="truncate font-semibold">
                {settings.makerName || '—'} / {settings.checkerName || '—'}
              </dd>
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-2">
                <dt className="shrink-0">Изготовил</dt>
                <dd className="truncate font-semibold">{settings.makerName || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="shrink-0">Проверил</dt>
                <dd className="truncate font-semibold">{settings.checkerName || '—'}</dd>
              </div>
            </>
          ))}
      </dl>

      {settings.showExpiry && (
        <>
          <div
            className={`border-dashed border-primary ${micro ? 'my-0.5 border-t' : tiny ? 'my-1.5 border-t-2' : 'my-3 border-t-2'}`}
          />

          <div className="text-center">
            <div
              className={`font-head uppercase tracking-[0.1em] ${micro ? 'text-[7px] leading-none' : tiny ? 'text-[9px]' : 'text-xs'}`}
            >
              Годен до
            </div>
            <div
              className={`font-head font-black leading-tight ${large ? 'text-3xl' : micro ? 'text-[10px]' : tiny ? 'text-[13px]' : compact ? 'text-lg' : 'text-xl'}`}
            >
              {expiry}
            </div>
            {!micro && (
              <div className={`mt-0.5 ${tiny ? 'text-[8px]' : 'text-[11px]'}`}>
                Срок хранения {hours} ч
              </div>
            )}
          </div>
        </>
      )}

      {(settings.showStorage || defrost) && (
        <div
          className={`flex items-center justify-center gap-1 border border-primary font-head font-bold uppercase leading-tight ${
            micro
              ? 'mt-1 px-1 py-px text-[7px]'
              : tiny
                ? 'mt-1.5 border-2 px-1 py-0.5 text-[8px]'
                : 'mt-3 border-2 px-2 py-1 text-[11px] tracking-[0.04em]'
          }`}
        >
          <Icon
            name="Thermometer"
            size={micro ? 8 : tiny ? 10 : 14}
            strokeWidth={2.5}
            className="shrink-0"
          />
          <span>{defrost ? defrost.temp : settings.storageText}</span>
        </div>
      )}

      {settings.showBarcode && (
        <>
          <div
            className={`flex items-end gap-[2px] overflow-hidden ${micro ? 'mt-1 h-3.5' : tiny ? 'mt-1.5 h-5' : 'mt-4 h-10'}`}
          >
            {product.barcode
              .split('')
              .concat(product.barcode.split('').reverse())
              .map((digit, i) => (
                <span
                  key={`${digit}-${i}`}
                  className="block bg-primary"
                  style={{
                    width: (Number(digit) % 3) + 1,
                    height: `${60 + ((Number(digit) * 7) % 40)}%`,
                  }}
                />
              ))}
          </div>
          <div
            className={`mt-0.5 text-center ${micro ? 'text-[7px] tracking-[0.08em]' : tiny ? 'text-[8px] tracking-[0.15em]' : 'text-[11px] tracking-[0.3em]'}`}
          >
            {product.barcode}
          </div>
        </>
      )}
    </div>
  );
};

export default ReceiptPreview;
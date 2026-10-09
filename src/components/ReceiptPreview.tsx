import { Product } from '@/data/products';
import { LabelSettings, defaultLabelSettings, getPaper } from '@/hooks/useLabelSettings';

interface ReceiptPreviewProps {
  product: Product;
  copies: number;
  printedAt: Date;
  settings?: LabelSettings;
}

const ReceiptPreview = ({
  product,
  copies,
  printedAt,
  settings = defaultLabelSettings,
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
      className={`print-area animate-print-out mx-auto border-y-2 border-primary bg-white font-body text-primary ${micro ? 'p-1.5' : tiny ? 'p-2' : 'p-4'}`}
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
        className={`font-head font-bold uppercase leading-tight ${large ? 'text-2xl' : micro ? 'line-clamp-2 text-[9px]' : tiny ? 'text-[11px]' : compact ? 'text-base' : 'text-lg'}`}
      >
        {product.name}
      </div>
      <div
        className={`border-dashed border-primary ${micro ? 'my-0.5 border-t' : tiny ? 'my-1.5 border-t-2' : 'my-3 border-t-2'}`}
      />

      <dl
        className={
          micro ? 'space-y-0 text-[7px] leading-[1.25]' : tiny ? 'space-y-0.5 text-[9px]' : 'space-y-1 text-[13px]'
        }
      >
        {!tiny && (
          <div className="flex justify-between">
            <dt>Копий</dt>
            <dd className="font-semibold">{copies} шт.</dd>
          </div>
        )}
        {settings.showDate && (
          <div className="flex justify-between">
            <dt className="shrink-0">{micro ? 'Изгот.' : 'Изготовлено'}</dt>
            <dd className="font-semibold">{stamp}</dd>
          </div>
        )}
        {settings.showStaff &&
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
        {settings.showExpiry && (
          <div
            className={`flex items-baseline justify-between gap-1 font-head font-bold ${
              large ? 'text-2xl' : micro ? 'text-[10px]' : tiny ? 'text-[12px]' : 'text-lg'
            }`}
          >
            <dt className="shrink-0">Годен до</dt>
            <dd>{expiry}</dd>
          </div>
        )}
        {settings.showExpiry && !micro && (
          <div className="flex justify-between gap-1">
            <dt className="shrink-0">Срок хранения</dt>
            <dd className="font-semibold">{hours} ч</dd>
          </div>
        )}
      </dl>

      {settings.showStorage && (
        <div
          className={`flex items-center justify-center font-head font-bold uppercase leading-tight ${
            micro
              ? 'mt-1 px-1 py-px text-[7px]'
              : tiny
                ? 'mt-1.5 px-1 py-0.5 text-[8px]'
                : 'mt-3 px-2 py-1 text-[11px] tracking-[0.04em]'
          }`}
        >
          <span>{product.storageText || settings.storageText}</span>
        </div>
      )}

      {settings.showBarcode && !micro && (
        <>
          <div
            className={`flex items-end gap-[2px] overflow-hidden ${tiny ? 'mt-1.5 h-5' : 'mt-4 h-10'}`}
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
            className={`mt-0.5 text-center ${tiny ? 'text-[8px] tracking-[0.15em]' : 'text-[11px] tracking-[0.3em]'}`}
          >
            {product.barcode}
          </div>
        </>
      )}
    </div>
  );
};

export default ReceiptPreview;
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
  const fmt = (date: Date) =>
    date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const stamp = fmt(printedAt);
  const hours = product.shelfLifeHours ?? settings.shelfLifeHours;
  const expiry = fmt(new Date(printedAt.getTime() + hours * 3600000));

  const paper = getPaper(settings.paper);
  const tiny = paper.widthMm <= 45;
  const compact = paper.widthMm <= 58;
  const large = paper.widthMm >= 105;

  return (
    <div
      className={`print-area animate-print-out mx-auto border-2 border-primary bg-white font-body text-primary ${tiny ? 'p-2' : 'p-4'}`}
      style={{ maxWidth: `${paper.widthMm * 3.5}px` }}
    >
      {settings.logo && (
        <img
          src={settings.logo}
          alt=""
          className={`mx-auto mb-1 w-auto object-contain ${tiny ? 'max-h-[26px]' : 'mb-2 max-h-[52px]'}`}
        />
      )}
      <div
        className={`text-center font-head font-black uppercase tracking-[0.04em] ${large ? 'text-lg' : tiny ? 'text-[10px] leading-tight' : 'text-sm'}`}
      >
        {settings.shopName}
      </div>
      {!tiny && (
        <div className="mt-1 text-center text-[11px] uppercase tracking-[0.12em]">
          Ценник · касса 1
        </div>
      )}

      <div className={`border-t-2 border-dashed border-primary ${tiny ? 'my-1.5' : 'my-3'}`} />

      <div
        className={`font-head font-bold uppercase leading-tight ${large ? 'text-3xl' : tiny ? 'text-[13px]' : compact ? 'text-lg' : 'text-xl'}`}
      >
        {product.name}
      </div>
      {settings.showComposition && (
        <div className={`mt-1 ${tiny ? 'line-clamp-2 text-[9px] leading-tight' : 'text-[13px]'}`}>
          {product.composition}
        </div>
      )}

      <div className={`border-t-2 border-dashed border-primary ${tiny ? 'my-1.5' : 'my-3'}`} />

      <dl className={tiny ? 'space-y-0.5 text-[9px]' : 'space-y-1 text-[13px]'}>
        {settings.showWeight && (
          <div className="flex justify-between">
            <dt>Вес / объём</dt>
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
            <dt>Изготовлено</dt>
            <dd className="font-semibold">{stamp}</dd>
          </div>
        )}
      </dl>

      {settings.showExpiry && (
        <>
          <div className={`border-t-2 border-dashed border-primary ${tiny ? 'my-1.5' : 'my-3'}`} />

          <div className={tiny ? 'text-center' : 'text-center'}>
            <div
              className={`font-head uppercase tracking-[0.1em] ${tiny ? 'text-[9px]' : 'text-xs'}`}
            >
              Употребить до
            </div>
            <div
              className={`font-head font-black leading-tight ${large ? 'text-3xl' : tiny ? 'text-[13px]' : compact ? 'text-lg' : 'text-xl'}`}
            >
              {expiry}
            </div>
            <div className={`mt-0.5 ${tiny ? 'text-[8px]' : 'text-[11px]'}`}>
              Срок хранения {hours} ч
            </div>
          </div>
        </>
      )}

      {settings.showBarcode && (
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
            className={`mt-1 text-center ${tiny ? 'text-[8px] tracking-[0.15em]' : 'text-[11px] tracking-[0.3em]'}`}
          >
            {product.barcode}
          </div>
        </>
      )}
    </div>
  );
};

export default ReceiptPreview;
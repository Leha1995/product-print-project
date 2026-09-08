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
  const stamp = printedAt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const paper = getPaper(settings.paper);
  const compact = paper.widthMm <= 58;
  const large = paper.widthMm >= 105;

  return (
    <div
      className="print-area animate-print-out mx-auto border-2 border-primary bg-white p-4 font-body text-primary"
      style={{ maxWidth: `${paper.widthMm * 3.5}px` }}
    >
      {settings.logo && (
        <img
          src={settings.logo}
          alt=""
          className="mx-auto mb-2 max-h-[52px] w-auto object-contain"
        />
      )}
      <div
        className={`text-center font-head font-black uppercase tracking-[0.04em] ${large ? 'text-lg' : 'text-sm'}`}
      >
        {settings.shopName}
      </div>
      <div className="mt-1 text-center text-[11px] uppercase tracking-[0.12em]">
        Ценник · касса 1
      </div>

      <div className="my-3 border-t-2 border-dashed border-primary" />

      <div
        className={`font-head font-bold uppercase leading-tight ${large ? 'text-3xl' : compact ? 'text-lg' : 'text-xl'}`}
      >
        {product.name}
      </div>
      {settings.showComposition && <div className="mt-1 text-[13px]">{product.composition}</div>}

      <div className="my-3 border-t-2 border-dashed border-primary" />

      <dl className="space-y-1 text-[13px]">
        <div className="flex justify-between">
          <dt>Артикул</dt>
          <dd className="font-semibold">{product.id.toUpperCase()}</dd>
        </div>
        {settings.showWeight && (
          <div className="flex justify-between">
            <dt>Вес / объём</dt>
            <dd className="font-semibold">{product.weight}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Копий</dt>
          <dd className="font-semibold">{copies} шт.</dd>
        </div>
        {settings.showDate && (
          <div className="flex justify-between">
            <dt>Дата печати</dt>
            <dd className="font-semibold">{stamp}</dd>
          </div>
        )}
      </dl>

      <div className="my-3 border-t-2 border-dashed border-primary" />

      <div className="flex items-end justify-between">
        <span className="font-head text-xs uppercase tracking-[0.1em]">Цена</span>
        <span
          className={`font-head font-black leading-none ${large ? 'text-6xl' : compact ? 'text-3xl' : 'text-4xl'}`}
        >
          {product.price} ₽
        </span>
      </div>

      {settings.showBarcode && (
        <>
          <div className="mt-4 flex h-10 items-end gap-[2px] overflow-hidden">
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
          <div className="mt-1 text-center text-[11px] tracking-[0.3em]">{product.barcode}</div>
        </>
      )}
    </div>
  );
};

export default ReceiptPreview;

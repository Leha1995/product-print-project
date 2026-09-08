import { Product } from '@/data/products';

interface ReceiptPreviewProps {
  product: Product;
  copies: number;
  printedAt: Date;
}

const ReceiptPreview = ({ product, copies, printedAt }: ReceiptPreviewProps) => {
  const stamp = printedAt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="print-area animate-print-out border-2 border-primary bg-white p-4 font-body text-primary">
      <div className="text-center font-head text-sm font-black uppercase tracking-[0.04em]">
        Автосуши Автопицца
      </div>
      <div className="mt-1 text-center text-[11px] uppercase tracking-[0.12em]">
        Ценник · касса 1
      </div>

      <div className="my-3 border-t-2 border-dashed border-primary" />

      <div className="font-head text-xl font-bold uppercase leading-tight">{product.name}</div>
      <div className="mt-1 text-[13px]">{product.composition}</div>

      <div className="my-3 border-t-2 border-dashed border-primary" />

      <dl className="space-y-1 text-[13px]">
        <div className="flex justify-between">
          <dt>Артикул</dt>
          <dd className="font-semibold">{product.id.toUpperCase()}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Вес / объём</dt>
          <dd className="font-semibold">{product.weight}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Копий</dt>
          <dd className="font-semibold">{copies} шт.</dd>
        </div>
        <div className="flex justify-between">
          <dt>Дата печати</dt>
          <dd className="font-semibold">{stamp}</dd>
        </div>
      </dl>

      <div className="my-3 border-t-2 border-dashed border-primary" />

      <div className="flex items-end justify-between">
        <span className="font-head text-xs uppercase tracking-[0.1em]">Цена</span>
        <span className="font-head text-4xl font-black leading-none">{product.price} ₽</span>
      </div>

      <div className="mt-4 flex h-10 items-end gap-[2px] overflow-hidden">
        {product.barcode
          .split('')
          .concat(product.barcode.split('').reverse())
          .map((digit, i) => (
            <span
              key={`${digit}-${i}`}
              className="block bg-primary"
              style={{ width: (Number(digit) % 3) + 1, height: `${60 + ((Number(digit) * 7) % 40)}%` }}
            />
          ))}
      </div>
      <div className="mt-1 text-center text-[11px] tracking-[0.3em]">{product.barcode}</div>
    </div>
  );
};

export default ReceiptPreview;

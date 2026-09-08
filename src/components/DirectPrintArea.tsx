import { useEffect } from 'react';
import ReceiptPreview from '@/components/ReceiptPreview';
import { LabelSettings } from '@/hooks/useLabelSettings';
import { Product } from '@/data/products';

interface DirectPrintAreaProps {
  product: Product | null;
  settings: LabelSettings;
  printedAt: Date;
  onDone: (product: Product) => void;
}

const DirectPrintArea = ({ product, settings, printedAt, onDone }: DirectPrintAreaProps) => {
  useEffect(() => {
    if (!product) return;
    let cancelled = false;

    const id = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        window.print();
        onDone(product);
      }),
    );

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [product, onDone]);

  if (!product) return null;

  return (
    <div aria-hidden className="hidden print:block">
      <ReceiptPreview product={product} copies={1} printedAt={printedAt} settings={settings} />
    </div>
  );
};

export default DirectPrintArea;

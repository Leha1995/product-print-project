import { useEffect, useRef } from 'react';
import ReceiptPreview from '@/components/ReceiptPreview';
import { printNodeHtml } from '@/components/DirectPrintArea';
import { LabelSettings, getPaper } from '@/hooks/useLabelSettings';
import { downloadBartenderBatch } from '@/lib/bartender';
import { Product } from '@/data/products';

interface BatchPrintAreaProps {
  products: Product[] | null;
  settings: LabelSettings;
  printedAt: Date;
  onDone: (products: Product[]) => void;
}

const BatchPrintArea = ({ products, settings, printedAt, onDone }: BatchPrintAreaProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!products || !products.length) return;

    if (settings.printMode === 'bartender') {
      const id = window.setTimeout(() => {
        downloadBartenderBatch(products, 1, printedAt, settings);
        onDone(products);
      }, 60);
      return () => window.clearTimeout(id);
    }

    const id = window.setTimeout(() => {
      const nodes = Array.from(ref.current?.querySelectorAll('.print-area') ?? []);
      if (nodes.length) {
        const paper = getPaper(settings.paper);
        printNodeHtml(
          nodes.map((n) => n.outerHTML).join(''),
          paper.widthMm,
          paper.heightMm,
          settings.rotate90,
        );
      }
      onDone(products);
    }, 120);

    return () => window.clearTimeout(id);
  }, [products, settings, printedAt, onDone]);

  if (!products || !products.length) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="print-hide pointer-events-none fixed left-[-10000px] top-0 w-[320px]"
    >
      {products.map((product) => (
        <ReceiptPreview
          key={product.id}
          product={product}
          copies={1}
          printedAt={printedAt}
          settings={settings}
        />
      ))}
    </div>
  );
};

export default BatchPrintArea;

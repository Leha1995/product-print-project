import { useEffect, useRef } from 'react';
import ReceiptPreview from '@/components/ReceiptPreview';
import { LabelSettings, getPaper } from '@/hooks/useLabelSettings';
import { Product } from '@/data/products';

interface DirectPrintAreaProps {
  product: Product | null;
  settings: LabelSettings;
  printedAt: Date;
  onDone: (product: Product) => void;
}

export const printNodeHtml = (html: string, widthMm: number, heightMm?: number) => {
  const styles = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  )
    .map((node) => node.outerHTML)
    .join('\n');

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) return;

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${styles}
<style>
  @page { size: ${widthMm}mm ${heightMm ? `${heightMm}mm` : 'auto'}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .label-root { width: ${widthMm}mm; ${heightMm ? `height: ${heightMm}mm;` : ''} overflow: hidden; }
  .label-root .print-area {
    position: static !important;
    width: 100% !important;
    max-width: none !important;
    border: none !important;
    box-shadow: none !important;
    animation: none !important;
    transform: none !important;
    background: #fff !important;
    color: #000 !important;
    padding: 2mm !important;
  }
</style></head><body><div class="label-root">${html}</div></body></html>`);
  doc.close();

  const fire = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1000);
  };

  if (doc.readyState === 'complete') {
    window.setTimeout(fire, 250);
  } else {
    iframe.onload = () => window.setTimeout(fire, 250);
  }
};

const DirectPrintArea = ({ product, settings, printedAt, onDone }: DirectPrintAreaProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!product) return;
    const node = ref.current?.firstElementChild as HTMLElement | undefined;
    if (!node) return;

    const paper = getPaper(settings.paper);
    const id = window.setTimeout(() => {
      printNodeHtml(node.outerHTML, paper.widthMm, paper.heightMm);
      onDone(product);
    }, 60);

    return () => window.clearTimeout(id);
  }, [product, settings, onDone]);

  if (!product) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="print-hide pointer-events-none fixed left-[-10000px] top-0 w-[320px]"
    >
      <ReceiptPreview product={product} copies={1} printedAt={printedAt} settings={settings} />
    </div>
  );
};

export default DirectPrintArea;

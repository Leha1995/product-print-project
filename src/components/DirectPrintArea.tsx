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

  const pageH = heightMm ?? Math.round(widthMm * 1.4);

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${styles}
<style>
  @page { size: ${widthMm}mm ${pageH}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page {
    position: relative;
    width: ${widthMm}mm;
    height: ${pageH}mm;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
  }
  .page:last-child { break-after: auto; page-break-after: auto; }
  .rot {
    position: absolute;
    top: 0;
    left: 0;
    width: ${pageH}mm;
    height: ${widthMm}mm;
    transform-origin: top left;
    transform: translateX(${widthMm}mm) rotate(90deg);
  }
  .rot .print-area {
    position: static !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: space-between !important;
    box-sizing: border-box !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    border: none !important;
    box-shadow: none !important;
    animation: none !important;
    background: #fff !important;
    color: #000 !important;
    padding: 1.5mm 2mm !important;
  }
  .rot .print-area > * { flex: 0 0 auto; }
</style></head><body></body></html>`);
  doc.close();

  const build = () => {
    const holder = doc.createElement('div');
    holder.innerHTML = html;
    const labels = Array.from(holder.querySelectorAll('.print-area'));
    labels.forEach((label) => {
      const page = doc.createElement('div');
      page.className = 'page';
      const rot = doc.createElement('div');
      rot.className = 'rot';
      rot.appendChild(label);
      page.appendChild(rot);
      doc.body.appendChild(page);
    });
  };

  const fire = () => {
    build();
    doc.querySelectorAll('.rot').forEach((node) => {
      const rot = node as HTMLElement;
      const area = rot.firstElementChild as HTMLElement | null;
      if (!area) return;
      const avail = rot.clientHeight;
      const needed = area.scrollHeight;
      if (needed > avail && avail > 0) {
        const scale = avail / needed;
        area.style.height = `${100 / scale}%`;
        area.style.transformOrigin = 'top left';
        area.style.transform = `scale(${scale})`;
        area.style.width = `${100 / scale}%`;
      }
    });
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
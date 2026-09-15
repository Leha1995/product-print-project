import { useEffect, useRef } from 'react';
import ReceiptPreview from '@/components/ReceiptPreview';
import { LabelSettings, getPaper } from '@/hooks/useLabelSettings';
import { downloadBartenderJob } from '@/lib/bartender';
import { Product } from '@/data/products';

interface DirectPrintAreaProps {
  product: Product | null;
  settings: LabelSettings;
  printedAt: Date;
  onDone: (product: Product) => void;
  copies?: number;
}

export const printNodeHtml = (
  html: string,
  widthMm: number,
  heightMm?: number,
  rotate90 = false,
  offsetXmm = 0,
  offsetYmm = 0,
) => {
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
    width: ${rotate90 ? pageH : widthMm}mm;
    height: ${rotate90 ? widthMm : pageH}mm;
    transform-origin: top left;
    ${
      rotate90
        ? `transform: translate(${widthMm + offsetXmm}mm, ${offsetYmm}mm) rotate(90deg) translateY(2mm);`
        : `transform: translate(${2 + offsetXmm}mm, ${offsetYmm}mm);`
    }
  }
  .rot .print-area {
    position: static !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: ${widthMm <= 45 ? 'flex-start' : 'space-between'} !important;
    box-sizing: border-box !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    border: none !important;
    box-shadow: none !important;
    animation: none !important;
    background: #fff !important;
    color: #000 !important;
    padding: ${widthMm <= 45 ? '0.8mm 1mm' : '1.5mm 2mm'} !important;
  }
  .rot .print-area > * { flex: 0 0 auto; }
  .rot .print-area * {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
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
      const availH = rot.clientHeight;
      const availW = rot.clientWidth;
      if (!availH || !availW) return;

      area.style.setProperty('height', 'auto', 'important');
      area.style.setProperty('width', `${availW}px`, 'important');
      const neededH = area.scrollHeight;
      const neededW = area.scrollWidth;
      if (!neededH) return;

      const scale = Math.min(1, availH / neededH, availW / neededW);
      area.style.setProperty('height', `${availH / scale}px`, 'important');
      area.style.setProperty('width', `${availW / scale}px`, 'important');
      if (scale < 1) {
        area.style.transformOrigin = 'top left';
        area.style.transform = `scale(${scale})`;
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

const DirectPrintArea = ({
  product,
  settings,
  printedAt,
  onDone,
  copies = 1,
}: DirectPrintAreaProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!product) return;

    if (settings.printMode === 'bartender') {
      const id = window.setTimeout(() => {
        downloadBartenderJob(product, copies, printedAt, settings);
        onDone(product);
      }, 60);
      return () => window.clearTimeout(id);
    }

    const node = ref.current?.firstElementChild as HTMLElement | undefined;
    if (!node) return;

    const paper = getPaper(settings.paper);
    const id = window.setTimeout(() => {
      printNodeHtml(
        Array.from({ length: Math.max(1, copies) }, () => node.outerHTML).join(''),
        paper.widthMm,
        paper.heightMm,
        settings.rotate90,
        settings.offsetXmm,
        settings.offsetYmm,
      );
      onDone(product);
    }, 60);

    return () => window.clearTimeout(id);
  }, [product, settings, printedAt, onDone, copies]);

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
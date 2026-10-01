import { jsPDF } from 'jspdf';
import { getFontEmbedCSS, toPng } from 'html-to-image';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;
const COLS = 3;
const ROWS = 6;
const GAP = 4;

const loadSize = (src: string) =>
  new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });

export const exportQrLabelsPdf = async (nodes: HTMLElement[], fileName: string) => {
  if (!nodes.length) return;
  const fontEmbedCSS = await getFontEmbedCSS(nodes[0]).catch(() => '');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const cellW = (PAGE_W - MARGIN * 2) / COLS;
  const cellH = (PAGE_H - MARGIN * 2) / ROWS;
  const perPage = COLS * ROWS;

  for (let i = 0; i < nodes.length; i += 1) {
    const slot = i % perPage;
    if (i > 0 && slot === 0) doc.addPage();
    const png = await toPng(nodes[i], {
      pixelRatio: 3,
      backgroundColor: '#ffffff',
      fontEmbedCSS: fontEmbedCSS || undefined,
    });
    const { w, h } = await loadSize(png);
    const boxW = cellW - GAP;
    const boxH = cellH - GAP;
    const scale = Math.min(boxW / w, boxH / h);
    const drawW = w * scale;
    const drawH = h * scale;
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    const x = MARGIN + col * cellW + (cellW - drawW) / 2;
    const y = MARGIN + row * cellH + (cellH - drawH) / 2;
    doc.addImage(png, 'PNG', x, y, drawW, drawH, undefined, 'FAST');
  }

  doc.save(fileName);
};

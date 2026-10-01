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

const drawCutLines = (doc: jsPDF, count: number, cellW: number, cellH: number) => {
  const has = (col: number, row: number) =>
    col >= 0 && col < COLS && row >= 0 && row * COLS + col < count;
  doc.setLineWidth(0.15);
  doc.setDrawColor(150, 150, 150);
  doc.setLineDashPattern([1.5, 1.5], 0);
  for (let slot = 0; slot < count; slot += 1) {
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    const x = MARGIN + col * cellW;
    const y = MARGIN + row * cellH;
    doc.line(x, y, x + cellW, y);
    doc.line(x, y, x, y + cellH);
    if (!has(col, row + 1)) doc.line(x, y + cellH, x + cellW, y + cellH);
    if (!has(col + 1, row)) doc.line(x + cellW, y, x + cellW, y + cellH);
  }
  doc.setLineDashPattern([], 0);
};

export const exportQrLabelsPdf = async (nodes: HTMLElement[], fileName: string) => {
  if (!nodes.length) return;
  const fontEmbedCSS = await getFontEmbedCSS(nodes[0]).catch(() => '');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const cellW = (PAGE_W - MARGIN * 2) / COLS;
  const cellH = (PAGE_H - MARGIN * 2) / ROWS;
  const perPage = COLS * ROWS;

  for (let i = 0; i < nodes.length; i += 1) {
    const slot = i % perPage;
    if (slot === 0) {
      if (i > 0) doc.addPage();
      drawCutLines(doc, Math.min(perPage, nodes.length - i), cellW, cellH);
    }
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

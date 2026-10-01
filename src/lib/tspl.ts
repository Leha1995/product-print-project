import { toCanvas } from 'html-to-image';

const DOTS_PER_MM = 8;
const MARGIN_MM = 1;

export interface TsplOptions {
  widthMm: number;
  heightMm?: number;
  rotate90?: boolean;
  offsetXmm?: number;
  offsetYmm?: number;
  gapMm?: number;
  density?: number;
  flip?: boolean;
  copies?: number;
}

const encoder = new TextEncoder();

const renderNode = async (node: HTMLElement, targetWidth: number) => {
  const natural = Math.max(1, node.offsetWidth || node.scrollWidth || 280);
  return toCanvas(node, {
    pixelRatio: Math.min(6, Math.max(1, (targetWidth / natural) * 1.5)),
    backgroundColor: '#ffffff',
    style: {
      animation: 'none',
      transform: 'none',
      margin: '0',
      border: 'none',
      boxShadow: 'none',
    },
  });
};

const layoutCanvas = (src: HTMLCanvasElement, opts: TsplOptions) => {
  const pageW = Math.round(opts.widthMm * DOTS_PER_MM);
  const margin = MARGIN_MM * DOTS_PER_MM;
  const fixedH = opts.heightMm ? Math.round(opts.heightMm * DOTS_PER_MM) : 0;
  const rotate = Boolean(opts.rotate90 && fixedH);

  const boxW = (rotate ? fixedH : pageW) - margin * 2;
  let scale = boxW / src.width;
  if (fixedH) {
    const boxH = (rotate ? pageW : fixedH) - margin * 2;
    scale = Math.min(scale, boxH / src.height);
  }
  const drawW = Math.round(src.width * scale);
  const drawH = Math.round(src.height * scale);
  const pageH = fixedH || drawH + margin * 2;

  const label = document.createElement('canvas');
  label.width = rotate ? pageH : pageW;
  label.height = rotate ? pageW : pageH;
  const lctx = label.getContext('2d')!;
  lctx.fillStyle = '#fff';
  lctx.fillRect(0, 0, label.width, label.height);
  lctx.imageSmoothingQuality = 'high';
  lctx.drawImage(src, Math.round((label.width - drawW) / 2), margin, drawW, drawH);

  const page = document.createElement('canvas');
  page.width = pageW;
  page.height = pageH;
  const ctx = page.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, pageW, pageH);
  ctx.save();
  ctx.translate((opts.offsetXmm ?? 0) * DOTS_PER_MM, (opts.offsetYmm ?? 0) * DOTS_PER_MM);
  if (rotate) {
    ctx.translate(pageW, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(label, 0, 0);
  ctx.restore();
  return page;
};

const toBitmap = (canvas: HTMLCanvasElement) => {
  const { width, height } = canvas;
  const rowBytes = Math.ceil(width / 8);
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const out = new Uint8Array(rowBytes * height).fill(0xff);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const alpha = pixels[i + 3];
      if (alpha > 100 && lum < 170) {
        out[y * rowBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
      }
    }
  }
  return { rowBytes, height, data: out };
};

const concat = (parts: Uint8Array[]) => {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  parts.forEach((p) => {
    result.set(p, pos);
    pos += p.length;
  });
  return result;
};

export const canvasToTspl = (canvas: HTMLCanvasElement, opts: TsplOptions) => {
  const { rowBytes, height, data } = toBitmap(canvas);
  const heightMm = opts.heightMm ?? Math.ceil(height / DOTS_PER_MM);
  const gap = opts.heightMm ? (opts.gapMm ?? 2) : 0;
  const head =
    `SIZE ${opts.widthMm} mm,${heightMm} mm\r\n` +
    `GAP ${gap} mm,0 mm\r\n` +
    `DIRECTION ${opts.flip ? 0 : 1},0\r\n` +
    'REFERENCE 0,0\r\n' +
    `DENSITY ${Math.min(15, Math.max(0, opts.density ?? 8))}\r\n` +
    'SPEED 4\r\n' +
    'CLS\r\n' +
    `BITMAP 0,0,${rowBytes},${height},0,`;
  const tail = `\r\nPRINT 1,${Math.max(1, opts.copies ?? 1)}\r\n`;
  return concat([encoder.encode(head), data, encoder.encode(tail)]);
};

export const nodeToTspl = async (node: HTMLElement, opts: TsplOptions) => {
  const src = await renderNode(node, opts.widthMm * DOTS_PER_MM);
  return canvasToTspl(layoutCanvas(src, opts), opts);
};

export const testLabelCanvas = (opts: TsplOptions, title: string) => {
  const w = Math.round(opts.widthMm * DOTS_PER_MM);
  const h = Math.round((opts.heightMm ?? 30) * DOTS_PER_MM);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(Math.min(w / 6, h / 4))}px sans-serif`;
  ctx.fillText('ТЕСТ', w / 2, h * 0.4);
  ctx.font = `${Math.round(Math.min(w / 14, h / 9))}px sans-serif`;
  ctx.fillText(title, w / 2, h * 0.72);
  return canvas;
};

export const testLabelTspl = (opts: TsplOptions, title: string) =>
  canvasToTspl(testLabelCanvas(opts, title), { ...opts, rotate90: false });

export const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const nodeToLabelCanvas = async (node: HTMLElement, opts: TsplOptions) => {
  const src = await renderNode(node, opts.widthMm * DOTS_PER_MM);
  return layoutCanvas(src, opts);
};

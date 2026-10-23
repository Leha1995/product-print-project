import QRCode from 'qrcode';
import { TsplOptions, canvasToTspl } from '@/lib/tspl';

export type TsplCodepage = '1251' | '866' | 'UTF-8';

export type TextLabelSpec =
  | { kind: 'product'; name: string; made?: string; staff?: string; expiry?: string; storage?: string }
  | { kind: 'defrost'; placed: string; expiry?: string; staff: string; temp: string }
  | { kind: 'qr'; name: string; code: string }
  | { kind: 'test'; title: string };

export interface TextTsplOptions extends TsplOptions {
  codepage?: TsplCodepage;
}

const DOTS_PER_MM = 8;

const normalize = (s: string) =>
  String(s ?? '')
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/…/g, '...')
    .replace(/[—–]/g, '-')
    .replace(/[«»“”„"]/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

const FONT_FAMILY = 'Arial, "Helvetica Neue", "Liberation Sans", "DejaVu Sans", sans-serif';
const PAD = 8;
const STEP = 3;

type Op =
  | { t: 'text'; x: number; y: number; size: number; bold: boolean; s: string }
  | { t: 'bar'; x: number; y: number; w: number; h: number }
  | { t: 'qr'; x: number; y: number; cell: number; modules: QRCode.QRCode['modules'] };

const createCanvasLayout = (ctx: CanvasRenderingContext2D, W: number, k: number) => {
  const inner = W - PAD * 2;
  const ops: Op[] = [];
  let y = PAD;
  const px = (n: number) => Math.max(12, Math.round(n * k));
  const font = (size: number, bold: boolean) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
  };
  const measure = (s: string, size: number, bold: boolean) => {
    font(size, bold);
    return ctx.measureText(s).width;
  };
  const cut = (s: string, size: number, bold: boolean, maxW: number) => {
    if (measure(s, size, bold) <= maxW) return s;
    let t = s;
    while (t.length > 1 && measure(`${t}…`, size, bold) > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };
  const wrap = (s: string, size: number, bold: boolean, maxLines: number) => {
    const words: string[] = [];
    s.split(' ').forEach((w) => {
      let rest = w;
      while (rest && measure(rest, size, bold) > inner) {
        let n = rest.length - 1;
        while (n > 1 && measure(rest.slice(0, n), size, bold) > inner) n -= 1;
        words.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      if (rest) words.push(rest);
    });
    const lines: string[] = [];
    let cur = '';
    words.forEach((w) => {
      const next = cur ? `${cur} ${w}` : w;
      if (measure(next, size, bold) <= inner) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    });
    if (cur) lines.push(cur);
    const out = lines.slice(0, maxLines);
    if (lines.length > maxLines) out[maxLines - 1] = cut(`${out[maxLines - 1]}…`, size, bold, inner);
    return out;
  };

  const title = (raw: string, base: number, align: 'left' | 'center', maxLines = 2) => {
    const s = normalize(raw).toUpperCase();
    if (!s) return;
    const size = px(base);
    wrap(s, size, true, maxLines).forEach((line) => {
      const x = align === 'center' ? Math.round((W - measure(line, size, true)) / 2) : PAD;
      ops.push({ t: 'text', x, y, size, bold: true, s: line });
      y += Math.round(size * 1.08);
    });
    y += STEP;
  };

  const row = (labelRaw: string, valueRaw: string, lBase: number, vBase: number) => {
    const label = normalize(labelRaw);
    const value = normalize(valueRaw) || '-';
    const ls = px(lBase);
    let vs = px(vBase);
    const space = Math.round(ls * 0.5);
    const labelW = measure(label, ls, false);
    while (vs > 12 && labelW + space + measure(value, vs, true) > inner) vs -= 1;
    const v = cut(value, vs, true, inner - labelW - space);
    const h = Math.max(ls, vs);
    ops.push({ t: 'text', x: PAD, y: y + (h - ls), size: ls, bold: false, s: label });
    ops.push({ t: 'text', x: W - PAD - Math.round(measure(v, vs, true)), y, size: vs, bold: true, s: v });
    y += Math.round(h * 1.08) + STEP;
  };

  const centered = (raw: string, base: number, bold = true) => {
    const s = normalize(raw);
    if (!s) return;
    let size = px(base);
    while (size > 12 && measure(s, size, bold) > inner) size -= 1;
    const v = cut(s, size, bold, inner);
    ops.push({ t: 'text', x: Math.round((W - measure(v, size, bold)) / 2), y, size, bold, s: v });
    y += Math.round(size * 1.08) + STEP;
  };

  const line = () => {
    ops.push({ t: 'bar', x: PAD, y, w: inner, h: 2 });
    y += 2 + STEP + 1;
  };

  const qr = (data: string, maxH: number) => {
    const modules = QRCode.create(data, { errorCorrectionLevel: 'M' }).modules;
    const cell = Math.max(2, Math.min(10, Math.floor(Math.min(inner, maxH - y) / modules.size)));
    ops.push({ t: 'qr', x: Math.round((W - modules.size * cell) / 2), y, cell, modules });
    y += modules.size * cell + STEP;
  };

  return { title, row, centered, line, qr, ops, used: () => y - STEP + PAD };
};

type CanvasLayout = ReturnType<typeof createCanvasLayout>;

const drawSpec = (spec: TextLabelSpec, l: CanvasLayout, H: number) => {
  if (spec.kind === 'product') {
    l.title(spec.name, 30, 'left');
    l.line();
    if (spec.made) l.row('Изгот.', spec.made, 22, 22);
    if (spec.staff) l.row('Изг./пров.', spec.staff, 22, 22);
    if (spec.expiry) l.row('Годен до', spec.expiry, 22, 26);
    if (spec.storage) l.centered(normalize(spec.storage).toUpperCase(), 22);
  } else if (spec.kind === 'defrost') {
    l.centered('ДЕФРОСТ', 34);
    l.row('Выложено', spec.placed, 22, 22);
    if (spec.expiry) l.row('Годен до', spec.expiry, 22, 26);
    l.row('Выложил', spec.staff || '-', 22, 22);
    if (spec.temp) l.centered(normalize(spec.temp).toUpperCase(), 26);
  } else if (spec.kind === 'qr') {
    l.title(spec.name, 24, 'center');
    l.qr(spec.code, H - PAD);
  } else {
    l.centered('ТЕСТ', 40);
    l.centered(spec.title, 22, false);
    l.centered('Абв Ёё Эюя 0123 °C', 22, false);
  }
};

export const textLabelCanvas = (spec: TextLabelSpec, opts: TsplOptions) => {
  const pw = Math.round(opts.widthMm * DOTS_PER_MM);
  const ph = Math.round((opts.heightMm ?? 30) * DOTS_PER_MM);
  const rotate = Boolean(opts.rotate90 && opts.heightMm);
  const W = rotate ? ph : pw;
  const H = rotate ? pw : ph;

  const label = document.createElement('canvas');
  label.width = W;
  label.height = H;
  const ctx = label.getContext('2d')!;

  let k = 1;
  let layout = createCanvasLayout(ctx, W, k);
  drawSpec(spec, layout, H);
  while (layout.used() > H && k > 0.5) {
    k -= 0.06;
    layout = createCanvasLayout(ctx, W, k);
    drawSpec(spec, layout, H);
  }
  const shiftY = Math.max(0, Math.floor((H - layout.used()) / 2));

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  layout.ops.forEach((op) => {
    if (op.t === 'bar') ctx.fillRect(op.x, op.y + shiftY, op.w, op.h);
    else if (op.t === 'qr') {
      const n = op.modules.size;
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          if (op.modules.get(r, c)) ctx.fillRect(op.x + c * op.cell, op.y + shiftY + r * op.cell, op.cell, op.cell);
        }
      }
    } else {
      ctx.font = `${op.bold ? 'bold ' : ''}${op.size}px ${FONT_FAMILY}`;
      ctx.fillText(op.s, op.x, op.y + shiftY);
    }
  });

  const page = document.createElement('canvas');
  page.width = pw;
  page.height = ph;
  const pctx = page.getContext('2d')!;
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, pw, ph);
  pctx.save();
  pctx.translate(Math.round((opts.offsetXmm ?? 0) * DOTS_PER_MM), Math.round((opts.offsetYmm ?? 0) * DOTS_PER_MM));
  if (rotate) {
    pctx.translate(pw, 0);
    pctx.rotate(Math.PI / 2);
  }
  pctx.drawImage(label, 0, 0);
  pctx.restore();
  return page;
};

export const buildTextTspl = (spec: TextLabelSpec, opts: TextTsplOptions) =>
  canvasToTspl(textLabelCanvas(spec, opts), opts, 140);

export const readTextSpec = (node: HTMLElement): TextLabelSpec | null => {
  const raw = node.getAttribute('data-tspl') ?? node.querySelector('[data-tspl]')?.getAttribute('data-tspl');
  if (!raw) return null;
  try {
    const spec = JSON.parse(raw) as TextLabelSpec;
    return spec && typeof spec.kind === 'string' ? spec : null;
  } catch {
    return null;
  }
};

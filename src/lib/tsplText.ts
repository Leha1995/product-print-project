import QRCode from 'qrcode';
import type { TsplOptions } from '@/lib/tspl';

export type TsplCodepage = '1251' | '866' | 'UTF-8';

export type TextLabelSpec =
  | { kind: 'product'; name: string; made?: string; staff?: string; expiry?: string; storage?: string }
  | { kind: 'defrost'; placed: string; expiry?: string; staff: string; temp: string }
  | { kind: 'qr'; name: string; code: string }
  | { kind: 'test'; title: string };

export interface TextTsplOptions extends TsplOptions {
  codepage?: TsplCodepage;
}

type Font = '1' | '2' | '3' | '4' | '5';

const DOTS_PER_MM = 8;
const MARGIN = 8;
const GAP = 3;
const FONT: Record<Font, { w: number; h: number }> = {
  '1': { w: 8, h: 12 },
  '2': { w: 12, h: 20 },
  '3': { w: 16, h: 24 },
  '4': { w: 24, h: 32 },
  '5': { w: 32, h: 48 },
};
const ORDER: Font[] = ['5', '4', '3', '2', '1'];
const smaller = (f: Font, level: number) => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(f) + level)];

const CP1251: Record<string, number> = { Ё: 0xa8, ё: 0xb8, '№': 0xb9, '°': 0xb0, '±': 0xb1 };
const CP866: Record<string, number> = { Ё: 0xf0, ё: 0xf1, '№': 0xfc, '°': 0xf8 };

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

const encode = (text: string, codepage: TsplCodepage) => {
  if (codepage === 'UTF-8') return new TextEncoder().encode(text);
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (codepage === '1251') {
      if (code >= 0x410 && code <= 0x44f) out.push(code - 0x350);
      else out.push(CP1251[ch] ?? 0x3f);
    } else if (code >= 0x410 && code <= 0x43f) out.push(code - 0x390);
    else if (code >= 0x440 && code <= 0x44f) out.push(code - 0x360);
    else out.push(CP866[ch] ?? 0x3f);
  }
  return Uint8Array.from(out);
};

const width = (s: string, f: Font) => s.length * FONT[f].w;
const cut = (s: string, f: Font, maxW: number) => {
  const max = Math.max(0, Math.floor(maxW / FONT[f].w));
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}.`;
};

const wrap = (s: string, f: Font, maxW: number, maxLines: number) => {
  const perLine = Math.max(1, Math.floor(maxW / FONT[f].w));
  const words = s.split(' ').flatMap((w) => {
    const parts: string[] = [];
    for (let i = 0; i < w.length; i += perLine) parts.push(w.slice(i, i + perLine));
    return parts;
  });
  const lines: string[] = [];
  let current = '';
  words.forEach((w) => {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= perLine) current = next;
    else {
      lines.push(current);
      current = w;
    }
  });
  if (current) lines.push(current);
  const overflow = lines.length > maxLines;
  const result = lines.slice(0, maxLines);
  if (overflow) result[maxLines - 1] = cut(`${result[maxLines - 1]}..`, f, maxW);
  return { lines: result, overflow };
};

type Item =
  | { t: 'text'; x: number; y: number; f: Font; s: string; bold?: boolean }
  | { t: 'bar'; x: number; y: number; w: number; h: number }
  | { t: 'qr'; x: number; y: number; cell: number; size: number; data: string };

const createLayout = (W: number, level: number) => {
  const inner = W - MARGIN * 2;
  const items: Item[] = [];
  let y = MARGIN;
  const fs = (f: Font) => smaller(f, level);

  const title = (raw: string, f0: Font, align: 'left' | 'center', maxLines = 2) => {
    const s = normalize(raw).toUpperCase();
    if (!s) return;
    const f = fs(f0);
    wrap(s, f, inner, maxLines).lines.forEach((line) => {
      const x = align === 'center' ? Math.round((W - width(line, f)) / 2) : MARGIN;
      items.push({ t: 'text', x, y, f, s: line, bold: true });
      y += FONT[f].h + 2;
    });
    y += GAP - 1;
  };

  const row = (labelRaw: string, valueRaw: string, lf0: Font, vf0: Font, bold = false) => {
    const label = normalize(labelRaw);
    const value = normalize(valueRaw) || '-';
    let lf = fs(lf0);
    let vf = fs(vf0);
    while (width(label, lf) + FONT[lf].w + width(value, vf) > inner && (vf !== '1' || lf !== '1')) {
      if (ORDER.indexOf(vf) <= ORDER.indexOf(lf) && vf !== '1') vf = smaller(vf, 1);
      else lf = smaller(lf, 1);
    }
    const h = Math.max(FONT[lf].h, FONT[vf].h);
    const v = cut(value, vf, inner - width(label, lf) - FONT[lf].w);
    items.push({ t: 'text', x: MARGIN, y: y + h - FONT[lf].h, f: lf, s: label });
    items.push({ t: 'text', x: W - MARGIN - width(v, vf), y: y + h - FONT[vf].h, f: vf, s: v, bold });
    y += h + GAP;
  };

  const centered = (raw: string, f0: Font, bold = true) => {
    const s = normalize(raw);
    if (!s) return;
    let f = fs(f0);
    while (width(s, f) > inner && f !== '1') f = smaller(f, 1);
    const v = cut(s, f, inner);
    items.push({ t: 'text', x: Math.round((W - width(v, f)) / 2), y, f, s: v, bold });
    y += FONT[f].h + GAP;
  };

  const line = () => {
    items.push({ t: 'bar', x: MARGIN, y, w: inner, h: 2 });
    y += 2 + GAP;
  };

  const qr = (data: string, maxH: number) => {
    const size = QRCode.create(data, { errorCorrectionLevel: 'M' }).modules.size;
    const cell = Math.max(2, Math.min(10, Math.floor(Math.min(inner, maxH - y) / size)));
    items.push({ t: 'qr', x: Math.round((W - size * cell) / 2), y, cell, size, data });
    y += size * cell + GAP;
  };

  return { title, row, centered, line, qr, items, used: () => y - GAP + MARGIN };
};

type Layout = ReturnType<typeof createLayout>;

const draw = (spec: TextLabelSpec, l: Layout, H: number) => {
  if (spec.kind === 'product') {
    l.title(spec.name, '3', 'left');
    l.line();
    if (spec.made) l.row('Изгот.', spec.made, '2', '2');
    if (spec.staff) l.row('Изг./пров.', spec.staff, '2', '2');
    if (spec.expiry) l.row('Годен до', spec.expiry, '2', '3', true);
    if (spec.storage) l.centered(normalize(spec.storage).toUpperCase(), '2');
  } else if (spec.kind === 'defrost') {
    l.centered('ДЕФРОСТ', '4');
    l.row('Выложено', spec.placed, '2', '2');
    if (spec.expiry) l.row('Годен до', spec.expiry, '2', '3', true);
    l.row('Выложил', spec.staff || '-', '2', '2');
    if (spec.temp) l.centered(normalize(spec.temp).toUpperCase(), '3');
  } else if (spec.kind === 'qr') {
    l.title(spec.name, '3', 'center');
    l.qr(spec.code, H - MARGIN);
  } else {
    l.centered('ТЕСТ', '4');
    l.centered(spec.title, '2', false);
    l.centered('Абв Ёё Эюя 0123', '2', false);
  }
};

export const buildTextTspl = (spec: TextLabelSpec, opts: TextTsplOptions) => {
  const codepage = opts.codepage ?? '1251';
  const pw = Math.round(opts.widthMm * DOTS_PER_MM);
  const ph = Math.round((opts.heightMm ?? 30) * DOTS_PER_MM);
  const rotate = Boolean(opts.rotate90 && opts.heightMm);
  const W = rotate ? ph : pw;
  const H = rotate ? pw : ph;

  let layout = createLayout(W, 0);
  draw(spec, layout, H);
  for (let level = 1; layout.used() > H && level < 4; level += 1) {
    layout = createLayout(W, level);
    draw(spec, layout, H);
  }
  const shiftY = Math.max(0, Math.floor((H - layout.used()) / 2));
  const ox = Math.round((opts.offsetXmm ?? 0) * DOTS_PER_MM);
  const oy = Math.round((opts.offsetYmm ?? 0) * DOTS_PER_MM);
  const at = (x: number, y: number) =>
    rotate ? { x: pw - (y + shiftY) + ox, y: x + oy } : { x: x + ox, y: y + shiftY + oy };

  const cmds: string[] = [];
  layout.items.forEach((it) => {
    if (it.t === 'bar') {
      const p = at(it.x, it.y);
      cmds.push(rotate ? `BAR ${Math.max(0, p.x - it.h)},${p.y},${it.h},${it.w}` : `BAR ${p.x},${p.y},${it.w},${it.h}`);
    } else if (it.t === 'qr') {
      const side = it.size * it.cell;
      const p = at(it.x, it.y);
      cmds.push(`QRCODE ${Math.max(0, rotate ? p.x - side : p.x)},${p.y},M,${it.cell},A,0,"${it.data.replace(/"/g, "'")}"`);
    } else {
      (it.bold ? [0, 1] : [0]).forEach((dx) => {
        const p = at(it.x + dx, it.y);
        cmds.push(`TEXT ${Math.max(0, p.x)},${Math.max(0, p.y)},"${it.f}",${rotate ? 90 : 0},1,1,"${it.s}"`);
      });
    }
  });

  const gap = opts.heightMm ? (opts.gapMm ?? 2) : 0;
  const program = [
    `SIZE ${opts.widthMm} mm,${opts.heightMm ?? 30} mm`,
    `GAP ${gap} mm,0 mm`,
    `DIRECTION ${opts.flip ? 0 : 1},0`,
    'REFERENCE 0,0',
    `DENSITY ${Math.min(15, Math.max(0, opts.density ?? 8))}`,
    'SPEED 4',
    `CODEPAGE ${codepage}`,
    'CLS',
    ...cmds,
    `PRINT 1,${Math.max(1, opts.copies ?? 1)}`,
    '',
  ].join('\r\n');
  return encode(program, codepage);
};

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

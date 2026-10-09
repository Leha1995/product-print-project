import { TsplOptions } from '@/lib/tspl';

export type TsplCodepage = '1251' | '866' | 'UTF-8';

export interface TextLabelRow {
  label: string;
  value: string;
  bold?: boolean;
}

export interface TextLabel {
  title: string;
  rows: TextLabelRow[];
  footer?: string;
  center?: boolean;
}

export interface TextTsplOptions extends TsplOptions {
  codepage?: TsplCodepage;
  sizeShift?: number;
}

const DOTS_PER_MM = 8;
const MARGIN = 10;

const FONTS: Record<string, { w: number; h: number }> = {
  '1': { w: 8, h: 12 },
  '2': { w: 12, h: 20 },
  '3': { w: 16, h: 24 },
  '4': { w: 24, h: 32 },
  '5': { w: 32, h: 48 },
};

const FONT_SETS = [
  { big: '4', small: '3' },
  { big: '3', small: '3' },
  { big: '3', small: '2' },
  { big: '2', small: '2' },
  { big: '2', small: '1' },
  { big: '1', small: '1' },
];

const CP1251_EXTRA: Record<string, number> = {
  Ё: 0xa8, ё: 0xb8, '№': 0xb9, '°': 0xb0, '«': 0xab, '»': 0xbb, '—': 0x97, '–': 0x96, '…': 0x85,
};
const CP866_EXTRA: Record<string, number> = { Ё: 0xf0, ё: 0xf1, '№': 0xfc, '°': 0xf8 };
const FALLBACK: Record<string, string> = { '«': '"', '»': '"', '—': '-', '–': '-', '…': '...' };

const encodeText = (text: string, codepage: TsplCodepage): number[] => {
  if (codepage === 'UTF-8') return Array.from(new TextEncoder().encode(text));
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    if (codepage === '1251') {
      if (code >= 0x410 && code <= 0x44f) out.push(code - 0x410 + 0xc0);
      else if (CP1251_EXTRA[ch] !== undefined) out.push(CP1251_EXTRA[ch]);
      else out.push(0x3f);
      continue;
    }
    if (code >= 0x410 && code <= 0x42f) out.push(code - 0x410 + 0x80);
    else if (code >= 0x430 && code <= 0x43f) out.push(code - 0x430 + 0xa0);
    else if (code >= 0x440 && code <= 0x44f) out.push(code - 0x440 + 0xe0);
    else if (CP866_EXTRA[ch] !== undefined) out.push(CP866_EXTRA[ch]);
    else if (FALLBACK[ch]) out.push(...Array.from(FALLBACK[ch]).map((c) => c.charCodeAt(0)));
    else out.push(0x3f);
  }
  return out;
};

const clean = (text: string) =>
  String(text ?? '')
    .replace(/["\\]/g, "'")
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const fit = (text: string, maxChars: number) =>
  maxChars <= 0 ? '' : text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}.`;

const wrap = (text: string, maxChars: number, maxLines: number) => {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > maxChars ? word.slice(0, maxChars) : word;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && lines.join(' ').length < text.length) {
    lines[maxLines - 1] = fit(`${lines[maxLines - 1]} `, maxChars);
    if (lines[maxLines - 1].endsWith(' .')) lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -2)}.`;
  }
  return lines;
};

interface Item {
  x: number;
  y: number;
  font: string;
  text: string;
  bold?: boolean;
}

interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
}

const layout = (label: TextLabel, W: number, H: number, setIndex: number) => {
  const set = FONT_SETS[Math.min(FONT_SETS.length - 1, Math.max(0, setIndex))];
  const big = FONTS[set.big];
  const small = FONTS[set.small];
  const inner = W - MARGIN * 2;
  const items: Item[] = [];
  const bars: Bar[] = [];
  let y = MARGIN;

  const titleChars = Math.floor(inner / big.w);
  const titleLines = wrap(clean(label.title).toUpperCase(), titleChars, 2);
  titleLines.forEach((t) => {
    const x = label.center ? MARGIN + Math.floor((inner - t.length * big.w) / 2) : MARGIN;
    items.push({ x, y, font: set.big, text: t, bold: true });
    y += big.h + 2;
  });
  y += 1;
  bars.push({ x: MARGIN, y, w: inner, h: 2 });
  y += 5;

  label.rows.forEach((row) => {
    const f = row.bold ? big : small;
    const font = row.bold ? set.big : set.small;
    const total = Math.floor(inner / f.w);
    const value = fit(clean(row.value), total);
    const labelChars = total - value.length - 1;
    const name = labelChars >= 3 ? fit(clean(row.label), labelChars) : '';
    if (name) items.push({ x: MARGIN, y, font, text: name, bold: row.bold });
    items.push({ x: MARGIN + inner - value.length * f.w, y, font, text: value, bold: row.bold });
    y += f.h + 3;
  });

  if (label.footer) {
    const t = fit(clean(label.footer).toUpperCase(), Math.floor(inner / small.w));
    y += 2;
    items.push({ x: MARGIN + Math.floor((inner - t.length * small.w) / 2), y, font: set.small, text: t, bold: true });
    y += small.h;
  }

  return { items, bars, height: y + MARGIN, fits: y + MARGIN <= H };
};

const concat = (parts: number[][]) => Uint8Array.from(parts.flat());

export const textLabelToTspl = (label: TextLabel, opts: TextTsplOptions) => {
  const codepage = opts.codepage ?? '1251';
  const pageW = Math.round(opts.widthMm * DOTS_PER_MM);
  const pageH = Math.round((opts.heightMm ?? 30) * DOTS_PER_MM);
  const rotate = Boolean(opts.rotate90);
  const W = rotate ? pageH : pageW;
  const H = rotate ? pageW : pageH;

  const start = Math.max(0, 1 - (opts.sizeShift ?? 0));
  let result = layout(label, W, H, start);
  for (let i = start + 1; !result.fits && i < FONT_SETS.length; i += 1) {
    result = layout(label, W, H, i);
  }
  const shiftY = result.fits ? Math.floor((H - result.height) / 2) : 0;
  const dx = Math.round((opts.offsetXmm ?? 0) * DOTS_PER_MM);
  const dy = Math.round((opts.offsetYmm ?? 0) * DOTS_PER_MM);

  const place = (x: number, y: number) =>
    rotate ? { x: pageW - (y + shiftY) + dx, y: x + dy, r: 90 } : { x: x + dx, y: y + shiftY + dy, r: 0 };

  const enc = (s: string) => encodeText(s, codepage);
  const parts: number[][] = [
    enc(
      `SIZE ${opts.widthMm} mm,${opts.heightMm ?? 30} mm\r\n` +
        `GAP ${opts.gapMm ?? 2} mm,0 mm\r\n` +
        `DIRECTION ${opts.flip ? 0 : 1},0\r\n` +
        'REFERENCE 0,0\r\n' +
        `DENSITY ${Math.min(15, Math.max(0, opts.density ?? 8))}\r\n` +
        'SPEED 4\r\n' +
        `CODEPAGE ${codepage}\r\n` +
        'CLS\r\n',
    ),
  ];

  result.bars.forEach((b) => {
    const p = place(b.x, b.y);
    parts.push(enc(rotate ? `BAR ${p.x - b.h},${p.y},${b.h},${b.w}\r\n` : `BAR ${p.x},${p.y},${b.w},${b.h}\r\n`));
  });

  result.items.forEach((it) => {
    const passes = it.bold ? [0, 1] : [0];
    passes.forEach((shift) => {
      const p = place(it.x + shift, it.y);
      parts.push(enc(`TEXT ${Math.max(0, p.x)},${Math.max(0, p.y)},"${it.font}",${p.r},1,1,"`), enc(it.text), enc('"\r\n'));
    });
  });

  parts.push(enc(`PRINT 1,${Math.max(1, opts.copies ?? 1)}\r\n`));
  return concat(parts);
};

export const readTextLabel = (node: HTMLElement): TextLabel | null => {
  const raw = node.getAttribute('data-text-label') ?? node.querySelector('[data-text-label]')?.getAttribute('data-text-label');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TextLabel;
    return parsed && typeof parsed.title === 'string' && Array.isArray(parsed.rows) ? parsed : null;
  } catch {
    return null;
  }
};

export const testTextLabel = (title: string): TextLabel => ({
  title: 'Тест: Абвгдеёжз ЭЮЯ',
  rows: [
    { label: 'Принтер', value: title },
    { label: 'Годен до', value: '31.12 23:59', bold: true },
  ],
  footer: 'Хранить при +2…+4 °C',
});

import * as XLSX from 'xlsx-js-style';
import { Equipment, PointEquipment } from '@/lib/equipmentApi';
import { residualValue } from '@/lib/depreciation';

const BOLD = { font: { bold: true } };
const HEAD = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '1F2937' } },
  alignment: { vertical: 'center', wrapText: true },
};
const FILL = (rgb: string) => ({ fill: { patternType: 'solid', fgColor: { rgb } } });
const GREEN = 'C6EFCE';
const YELLOW = 'FFEB9C';
const RED = 'FFC7CE';
const TOTAL = 'D9E1F2';
const MONEY = '#,##0 ₽';

const stamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

const dateText = (iso?: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('ru-RU') : '';

const repairsTotal = (item: Equipment) => {
  const fromHistory = (item.repairs || []).reduce((s, r) => s + (r.returnedAt ? r.cost || 0 : 0), 0);
  return Math.round(Math.max(fromHistory, item.repairCost || 0));
};

const statusOf = (item: Equipment) =>
  !item.active ? 'Списано' : item.inRepair ? 'В ремонте' : 'В работе';

const colorOf = (item: Equipment) => (!item.active ? RED : item.inRepair ? YELLOW : GREEN);

type Cell = string | number;

const styleSheet = (
  sheet: XLSX.WorkSheet,
  opts: { moneyCols: number[]; rowColors?: (string | null)[]; boldRows?: number[]; totalRows?: number[] },
) => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!sheet[ref]) sheet[ref] = { t: 's', v: '' };
      const cell = sheet[ref];
      let s: Record<string, unknown> = {};
      if (r === 0) s = { ...HEAD };
      else {
        const color = opts.rowColors?.[r - 1];
        if (opts.totalRows?.includes(r)) s = { ...FILL(TOTAL), ...BOLD };
        else if (color) s = FILL(color);
        if (opts.boldRows?.includes(r)) s = { ...s, ...BOLD };
      }
      if (r > 0 && opts.moneyCols.includes(c) && cell.t === 'n') cell.z = MONEY;
      cell.s = s;
    }
  }
};

const summarySheet = (points: PointEquipment[]) => {
  const header = [
    'Точка',
    'Позиций в работе',
    'В ремонте',
    'Списано',
    'Стоимость покупки, ₽',
    'Остаточная стоимость, ₽',
    'Амортизация, ₽',
    'Расходы на ремонт, ₽',
  ];
  const rows: Cell[][] = [header];
  const sums = [0, 0, 0, 0, 0, 0, 0];
  points.forEach((p) => {
    const active = p.items.filter((i) => i.active);
    const price = active.reduce((s, i) => s + (i.price || 0), 0);
    const residual = active.reduce((s, i) => s + residualValue(i), 0);
    const vals = [
      active.length,
      active.filter((i) => i.inRepair).length,
      p.items.length - active.length,
      Math.round(price),
      Math.round(residual),
      Math.round(price - residual),
      p.items.reduce((s, i) => s + repairsTotal(i), 0),
    ];
    vals.forEach((v, i) => (sums[i] += v));
    rows.push([p.name, ...vals]);
  });
  rows.push(['ИТОГО по всем точкам', ...sums]);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(sheet, { moneyCols: [4, 5, 6, 7], totalRows: [rows.length - 1] });
  sheet['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 11 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 18 }];
  sheet['!rows'] = [{ hpt: 32 }];
  return sheet;
};

const equipmentSheet = (points: PointEquipment[]) => {
  const header = [
    'Точка',
    'Наименование',
    'Место',
    'Статус',
    'Стоимость покупки, ₽',
    'Остаточная стоимость, ₽',
    'Амортизация, ₽/день',
    'Расходы на ремонт, ₽',
    'Ремонтов',
    'В эксплуатации с',
    'Серийный номер',
    'QR-код',
    'Дата списания',
    'Причина списания',
  ];
  const rows: Cell[][] = [header];
  const colors: (string | null)[] = [];
  const totals: number[] = [];
  points.forEach((p) => {
    const list = [...p.items].sort(
      (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ru'),
    );
    list.forEach((i) => {
      rows.push([
        p.name,
        i.name,
        i.location || '',
        statusOf(i),
        Math.round(i.price || 0),
        i.active ? Math.round(residualValue(i)) : 0,
        i.depreciationPerDay || 0,
        repairsTotal(i),
        (i.repairs || []).filter((r) => r.returnedAt).length,
        dateText(i.commissionedAt),
        i.serial || '',
        i.code,
        dateText(i.writtenOffAt),
        i.writeOffReason || '',
      ]);
      colors.push(colorOf(i));
    });
    const active = p.items.filter((i) => i.active);
    rows.push([
      `Итого: ${p.name}`,
      `${active.length} в работе`,
      '',
      '',
      Math.round(active.reduce((s, i) => s + (i.price || 0), 0)),
      Math.round(active.reduce((s, i) => s + residualValue(i), 0)),
      '',
      p.items.reduce((s, i) => s + repairsTotal(i), 0),
      p.items.reduce((s, i) => s + (i.repairs || []).filter((r) => r.returnedAt).length, 0),
      '', '', '', '', '',
    ]);
    colors.push(null);
    totals.push(rows.length - 1);
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(sheet, { moneyCols: [4, 5, 6, 7], rowColors: colors, totalRows: totals });
  sheet['!cols'] = [
    { wch: 24 }, { wch: 32 }, { wch: 16 }, { wch: 11 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
    { wch: 16 }, { wch: 9 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 13 }, { wch: 26 },
  ];
  sheet['!rows'] = [{ hpt: 32 }];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }) };
  return sheet;
};

const repairsSheet = (points: PointEquipment[]) => {
  const header = ['Точка', 'Оборудование', 'Дата отправки', 'Дата возврата', 'Сумма, ₽', 'Описание поломки'];
  const records = points
    .flatMap((p) => p.items.flatMap((i) => (i.repairs || []).map((r) => ({ p, i, r }))))
    .sort((a, b) => a.p.name.localeCompare(b.p.name, 'ru') || (b.r.sentAt || '').localeCompare(a.r.sentAt || ''));
  const rows: Cell[][] = [header];
  const colors: (string | null)[] = [];
  records.forEach(({ p, i, r }) => {
    rows.push([
      p.name,
      i.name,
      dateText(r.sentAt),
      r.returnedAt ? dateText(r.returnedAt) : 'В ремонте',
      r.returnedAt ? Math.round(r.cost || 0) : '',
      r.description || '',
    ]);
    colors.push(r.returnedAt ? null : YELLOW);
  });
  if (!records.length) {
    rows.push(['', 'Ремонтов пока не было', '', '', '', '']);
    colors.push(null);
  } else {
    rows.push([
      'ИТОГО',
      '',
      '',
      '',
      Math.round(records.reduce((s, { r }) => s + (r.returnedAt ? r.cost || 0 : 0), 0)),
      '',
    ]);
    colors.push(null);
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(sheet, { moneyCols: [4], rowColors: colors, totalRows: records.length ? [rows.length - 1] : [] });
  sheet['!cols'] = [{ wch: 24 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 50 }];
  return sheet;
};

export const exportAllPoints = (points: PointEquipment[]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summarySheet(points), 'Сводка по точкам');
  XLSX.utils.book_append_sheet(book, equipmentSheet(points), 'Оборудование');
  XLSX.utils.book_append_sheet(book, repairsSheet(points), 'Ремонты');
  XLSX.writeFile(book, `Оборудование_все_точки_${stamp()}.xlsx`);
};

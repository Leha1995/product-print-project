import * as XLSX from 'xlsx-js-style';
import { Equipment, EquipmentTask, PointEquipment } from '@/lib/equipmentApi';
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

export interface ExportPeriod {
  from: string;
  to: string;
  label: string;
}

let period: ExportPeriod | null = null;

const dayKey = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const inPeriod = (iso?: string | null) => {
  if (!period) return true;
  const k = dayKey(iso);
  if (!k) return false;
  return (!period.from || k >= period.from) && (!period.to || k <= period.to);
};

const periodRepairs = (item: Equipment) =>
  (item.repairs || []).filter((r) => r.returnedAt && inPeriod(r.returnedAt));

const repairsTotal = (item: Equipment) => {
  const fromHistory = periodRepairs(item).reduce((s, r) => s + (r.cost || 0), 0);
  return Math.round(period ? fromHistory : Math.max(fromHistory, item.repairCost || 0));
};

const tasksOf = (p: PointEquipment) => p.tasks || [];
const tasksCost = (list: EquipmentTask[]) => Math.round(list.reduce((s, t) => s + (t.cost || 0), 0));
const periodSuffix = () => (period ? ` (${period.label})` : '');

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
    `Ремонты оборудования, ₽${periodSuffix()}`,
    `Выполнено задач${periodSuffix()}`,
    `Расходы по задачам, ₽${periodSuffix()}`,
    `Всего на ремонт, ₽${periodSuffix()}`,
  ];
  const rows: Cell[][] = [header];
  const sums = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  points.forEach((p) => {
    const active = p.items.filter((i) => i.active);
    const price = active.reduce((s, i) => s + (i.price || 0), 0);
    const residual = active.reduce((s, i) => s + residualValue(i), 0);
    const repairs = p.items.reduce((s, i) => s + repairsTotal(i), 0);
    const tCost = tasksCost(tasksOf(p));
    const vals = [
      active.length,
      active.filter((i) => i.inRepair).length,
      p.items.length - active.length,
      Math.round(price),
      Math.round(residual),
      Math.round(price - residual),
      repairs,
      tasksOf(p).length,
      tCost,
      repairs + tCost,
    ];
    vals.forEach((v, i) => (sums[i] += v));
    rows.push([p.name, ...vals]);
  });
  rows.push(['ИТОГО по всем точкам', ...sums]);
  if (period) rows.unshift([`Период: ${period.label}`], []);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const shift = period ? 2 : 0;
  styleSheet(sheet, { moneyCols: [4, 5, 6, 7, 9, 10], totalRows: [rows.length - 1] });
  if (period) {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref0 = XLSX.utils.encode_cell({ r: 0, c });
      if (sheet[ref0]) sheet[ref0].s = { font: { bold: true, sz: 13 } };
      const ref1 = XLSX.utils.encode_cell({ r: 1, c });
      if (sheet[ref1]) sheet[ref1].s = {};
      const ref2 = XLSX.utils.encode_cell({ r: 2, c });
      if (sheet[ref2]) sheet[ref2].s = { ...HEAD };
    }
  }
  sheet['!cols'] = [
    { wch: 30 }, { wch: 12 }, { wch: 11 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 16 },
    { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
  ];
  const heights = [] as { hpt: number }[];
  heights[shift] = { hpt: 44 };
  sheet['!rows'] = heights;
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
    `Расходы на ремонт, ₽${periodSuffix()}`,
    `Ремонтов${periodSuffix()}`,
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
        periodRepairs(i).length,
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
      p.items.reduce((s, i) => s + periodRepairs(i).length, 0),
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
    .flatMap((p) =>
      p.items.flatMap((i) =>
        (i.repairs || [])
          .filter((r) => (period ? r.returnedAt && inPeriod(r.returnedAt) : true))
          .map((r) => ({ p, i, r })),
      ),
    )
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
    rows.push(['', period ? 'За период ремонтов не было' : 'Ремонтов пока не было', '', '', '', '']);
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

const PRIORITY: Record<string, string> = { urgent: 'Очень срочно', soon: 'Побыстрее', normal: 'Не срочно' };

const tasksSheet = (points: PointEquipment[]) => {
  const header = [
    'Точка',
    'Дата выполнения',
    '№ задачи',
    'Задача',
    'Оборудование',
    'Срочность',
    'Выполнил',
    'Что сделано',
    'Потрачено, ₽',
  ];
  const records = points
    .flatMap((p) => tasksOf(p).map((t) => ({ p, t })))
    .sort((a, b) => a.p.name.localeCompare(b.p.name, 'ru') || (b.t.doneAt || '').localeCompare(a.t.doneAt || ''));
  const rows: Cell[][] = [header];
  records.forEach(({ p, t }) => {
    rows.push([
      p.name,
      dateText(t.doneAt),
      t.id,
      t.description,
      t.equipmentName || '',
      PRIORITY[t.priority || 'normal'] || '',
      t.doneByName || '',
      t.doneComment || '',
      Math.round(t.cost || 0),
    ]);
  });
  if (!records.length) rows.push(['', period ? 'За период задач не выполнялось' : 'Выполненных задач нет']);
  else rows.push(['ИТОГО', `Задач: ${records.length}`, '', '', '', '', '', '', tasksCost(records.map((r) => r.t))]);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(sheet, { moneyCols: [8], totalRows: records.length ? [rows.length - 1] : [] });
  sheet['!cols'] = [
    { wch: 24 }, { wch: 13 }, { wch: 9 }, { wch: 44 }, { wch: 24 }, { wch: 13 }, { wch: 20 }, { wch: 40 }, { wch: 13 },
  ];
  return sheet;
};

export const exportAllPoints = (points: PointEquipment[], range: ExportPeriod | null = null) => {
  period = range;
  try {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, summarySheet(points), 'Сводка по точкам');
    XLSX.utils.book_append_sheet(book, equipmentSheet(points), 'Оборудование');
    XLSX.utils.book_append_sheet(book, repairsSheet(points), 'Ремонты');
    XLSX.utils.book_append_sheet(book, tasksSheet(points), 'Выполненные задачи');
    const tag = range ? `${range.from || 'начало'}_${range.to || 'сегодня'}` : 'за_всё_время';
    XLSX.writeFile(book, `Оборудование_все_точки_${tag}_${stamp()}.xlsx`);
  } finally {
    period = null;
  }
};

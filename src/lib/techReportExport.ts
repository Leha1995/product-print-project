import * as XLSX from 'xlsx-js-style';
import { AccountantTech, EquipmentTask } from '@/lib/equipmentApi';
import { ExportPeriod } from '@/lib/periodPresets';
import { priorityOf } from '@/lib/taskPriority';

type Cell = string | number;

const HEAD = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '1F2937' } },
  alignment: { vertical: 'center', wrapText: true },
};
const TOTAL = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } } };
const MONEY = '#,##0 ₽';

const dateText = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '');

export const taskSpend = (list: EquipmentTask[]) =>
  list.reduce((s, t) => s + (t.kind === 'repair' ? 0 : t.cost || 0), 0);

export const techTotals = (t: AccountantTech) => {
  const tasksCost = taskSpend(t.done);
  const repairsCost = t.repairs.reduce((s, r) => s + (r.cost || 0), 0);
  return {
    doneCount: t.done.length,
    openCount: t.open.length,
    repairsCount: t.repairs.length,
    tasksCost: Math.round(tasksCost),
    repairsCost: Math.round(repairsCost),
    total: Math.round(tasksCost + repairsCost),
  };
};

const build = (rows: Cell[][], moneyCols: number[], headerRow: number, totalRows: number[], cols: number[]) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[ref];
      if (!cell) continue;
      if (r === 0 && headerRow > 0) cell.s = { font: { bold: true, sz: 13 } };
      if (r === headerRow) cell.s = HEAD;
      if (totalRows.includes(r)) cell.s = TOTAL;
      if (r > headerRow && moneyCols.includes(c) && cell.t === 'n') cell.z = MONEY;
    }
  }
  sheet['!cols'] = cols.map((wch) => ({ wch }));
  return sheet;
};

export const exportTechReport = (techs: AccountantTech[], period: ExportPeriod | null) => {
  const title = `Период: ${period ? period.label : 'всё время'}`;
  const book = XLSX.utils.book_new();

  const sum: Cell[][] = [
    [title],
    [],
    ['Техник', 'Выполнено задач', 'Из них ремонтов', 'Вернул из ремонта', 'Расходы по задачам, ₽', 'Расходы на ремонт оборудования, ₽', 'Всего потрачено, ₽', 'Открытых заявок'],
  ];
  const acc = [0, 0, 0, 0, 0, 0, 0];
  techs.forEach((t) => {
    const x = techTotals(t);
    const vals = [x.doneCount, t.done.filter((d) => d.kind === 'repair').length, x.repairsCount, x.tasksCost, x.repairsCost, x.total, x.openCount];
    vals.forEach((v, i) => (acc[i] += v));
    sum.push([t.name, ...vals]);
  });
  sum.push(['ИТОГО', ...acc]);
  XLSX.utils.book_append_sheet(book, build(sum, [4, 5, 6], 2, [sum.length - 1], [26, 14, 14, 16, 20, 24, 18, 14]), 'Сводка');

  const done: Cell[][] = [
    [title],
    [],
    ['Техник', 'Дата выполнения', '№', 'Точка', 'Оборудование', 'Заявка', 'Срочность', 'Тип', 'Что сделано', 'Потрачено, ₽'],
  ];
  const doneTotals: number[] = [];
  techs.forEach((t) => {
    t.done.forEach((d) =>
      done.push([
        t.name,
        dateText(d.doneAt),
        d.id,
        d.ownerName,
        [d.equipmentName, d.location].filter(Boolean).join(' · '),
        d.description,
        priorityOf(d.priority).label,
        d.kind === 'repair' ? 'Ремонт' : 'Задача',
        d.doneComment,
        Math.round(d.cost || 0),
      ]),
    );
    if (t.done.length) {
      done.push([`Итого: ${t.name}`, `Задач: ${t.done.length}`, '', '', '', '', '', '', '', Math.round(t.done.reduce((s, d) => s + (d.cost || 0), 0))]);
      doneTotals.push(done.length - 1);
    }
  });
  if (done.length === 3) done.push(['', 'За период выполненных задач нет']);
  XLSX.utils.book_append_sheet(book, build(done, [9], 2, doneTotals, [22, 12, 7, 22, 26, 44, 13, 9, 40, 13]), 'Выполненные работы');

  const reps: Cell[][] = [
    [title],
    [],
    ['Техник', 'Точка', 'Оборудование', 'Отправлено', 'Возвращено', 'Сумма, ₽', 'Описание'],
  ];
  const repTotals: number[] = [];
  techs.forEach((t) => {
    t.repairs.forEach((r) =>
      reps.push([t.name, r.ownerName, [r.equipmentName, r.location].filter(Boolean).join(' · '), dateText(r.sentAt), dateText(r.returnedAt), Math.round(r.cost || 0), r.description]),
    );
    if (t.repairs.length) {
      reps.push([`Итого: ${t.name}`, `Ремонтов: ${t.repairs.length}`, '', '', '', Math.round(t.repairs.reduce((s, r) => s + (r.cost || 0), 0)), '']);
      repTotals.push(reps.length - 1);
    }
  });
  if (reps.length === 3) reps.push(['', 'За период ремонтов нет']);
  XLSX.utils.book_append_sheet(book, build(reps, [5], 2, repTotals, [22, 22, 28, 12, 12, 13, 44]), 'Ремонты');

  const open: Cell[][] = [
    ['Открытые заявки на момент выгрузки'],
    [],
    ['Техник', 'Создана', '№', 'Точка', 'Оборудование', 'Заявка', 'Срочность', 'Назначена'],
  ];
  techs.forEach((t) =>
    t.open.forEach((o) =>
      open.push([t.name, dateText(o.createdAt), o.id, o.ownerName, [o.equipmentName, o.location].filter(Boolean).join(' · '), o.description, priorityOf(o.priority).label, o.technicianName || 'любому закреплённому']),
    ),
  );
  if (open.length === 3) open.push(['', 'Открытых заявок нет']);
  XLSX.utils.book_append_sheet(book, build(open, [], 2, [], [22, 12, 7, 22, 26, 44, 13, 22]), 'Открытые заявки');

  const tag = period ? `${period.from || 'начало'}_${period.to || 'сегодня'}` : 'за_всё_время';
  XLSX.writeFile(book, `Техники_${tag}.xlsx`);
};

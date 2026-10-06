import * as XLSX from 'xlsx-js-style';
import { Equipment, EquipmentTask, FinishResult, fetchTasksReport } from '@/lib/equipmentApi';
import { priorityOf } from '@/lib/taskPriority';
import { residualValue, totalResidual } from '@/lib/depreciation';

const stamp = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}_${pad(d.getHours())}-${pad(
    d.getMinutes(),
  )}`;
};

export const pickEquipment = (items: Equipment[], ids: string[]) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.map(
    (id) =>
      byId.get(id) ||
      ({
        id,
        name: 'Удалённая позиция',
        code: id,
        price: 0,
        location: '',
        note: '',
        image: '',
        serial: '',
        active: true,
      } as Equipment),
  );
};

const commissioned = (item: Equipment) =>
  item.commissionedAt
    ? new Date(`${item.commissionedAt.slice(0, 10)}T00:00:00`).toLocaleDateString('ru-RU')
    : '';

const statusText = (item: Equipment, found: boolean) => {
  if (found && item.qrBroken) return 'Найдено, QR повреждён';
  return found ? 'Найдено' : 'Не найдено';
};

const row = (item: Equipment, found: boolean, index: number) => ({
  '№': index + 1,
  Наименование: item.name,
  Статус: statusText(item, found),
  Место: item.location || '',
  'Стоимость, ₽': item.price || 0,
  'Амортизация, ₽/день': item.depreciationPerDay || 0,
  'Ремонт, ₽': item.repairCost || 0,
  'Остаточная стоимость, ₽': Math.round(residualValue(item)),
  'Серийный номер': item.serial || '',
  'В эксплуатации с': commissioned(item),
  'QR-код': item.code,
  Сейчас: item.active ? (item.inRepair ? 'В ремонте' : 'В работе') : 'Списано',
  Заметка: item.note || '',
});

const COLORS = {
  green: 'C6EFCE',
  yellow: 'FFEB9C',
  red: 'FFC7CE',
};

const rowColor = (item: Equipment, found: boolean) => {
  if (!item.active) return COLORS.red;
  if (found && item.qrBroken) return COLORS.yellow;
  if (found) return COLORS.green;
  return null;
};

const paintRows = (sheet: XLSX.WorkSheet, colors: (string | null)[]) => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const head = sheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (head) head.s = { font: { bold: true } };
  }
  colors.forEach((color, i) => {
    if (!color) return;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r: i + 1, c });
      if (!sheet[ref]) sheet[ref] = { t: 's', v: '' };
      sheet[ref].s = { fill: { patternType: 'solid', fgColor: { rgb: color } } };
    }
  });
};

const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '');

const repairsSheet = (items: Equipment[]) => {
  const records = items
    .flatMap((item) => (item.repairs || []).map((r) => ({ item, r })))
    .sort((a, b) => (b.r.sentAt || '').localeCompare(a.r.sentAt || ''));
  type RepairRow = Record<string, string | number>;
  const rows: RepairRow[] = records.length
    ? records.map(({ item, r }, i) => ({
        '№': i + 1,
        Оборудование: item.name,
        'Дата отправки': dateText(r.sentAt),
        'Дата возврата': r.returnedAt ? dateText(r.returnedAt) : 'В ремонте',
        'Сумма, ₽': r.returnedAt ? Math.round(r.cost) : '',
        'Описание поломки': r.description || '',
      }))
    : [
        {
          '№': '',
          Оборудование: 'Ремонтов пока не было',
          'Дата отправки': '',
          'Дата возврата': '',
          'Сумма, ₽': '',
          'Описание поломки': '',
        },
      ];
  if (records.length) {
    rows.push({
      '№': '',
      Оборудование: 'Итого',
      'Дата отправки': '',
      'Дата возврата': '',
      'Сумма, ₽': Math.round(records.reduce((sum, { r }) => sum + (r.returnedAt ? r.cost : 0), 0)),
      'Описание поломки': '',
    });
  }
  const sheet = XLSX.utils.json_to_sheet(rows);
  paintRows(
    sheet,
    records.map(({ r }) => (r.returnedAt ? null : COLORS.yellow)),
  );
  if (records.length) {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r: range.e.r, c });
      if (sheet[ref]) sheet[ref].s = { font: { bold: true } };
    }
    sheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r - 1, c: range.e.c } }),
    };
  }
  for (const ref of Object.keys(sheet)) {
    if (ref.startsWith('F') && ref !== 'F1' && sheet[ref]) {
      sheet[ref].s = { ...(sheet[ref].s || {}), alignment: { wrapText: true, vertical: 'top' } };
    }
  }
  sheet['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 50 }];
  return sheet;
};

const dateTimeText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const taskTitle = (t: EquipmentTask) => {
  const first = (t.description || '').split('\n')[0].trim();
  return first.length > 80 ? `${first.slice(0, 80)}…` : first;
};

const TASK_HEADER = [
  '№',
  'Задача',
  'Оборудование',
  'Срочность',
  'Создана',
  'Выполнена',
  'Потрачено, ₽',
  'Техник',
  'Что сделано',
  'Описание',
];

const tasksSheet = (tasks: EquipmentTask[], from: string | null, to: string | null) => {
  const period = `Период: ${from ? dateTimeText(from) : 'с начала учёта'} — ${to ? dateTimeText(to) : 'сейчас'}`;
  const width = TASK_HEADER.length;
  const done = tasks.filter((t) => t.status === 'done');
  const total = done.reduce((sum, t) => sum + (t.kind === 'repair' ? 0 : t.cost || 0), 0);
  const aoa: (string | number)[][] = [[period], TASK_HEADER];
  tasks.forEach((t, i) => {
    const isDone = t.status === 'done';
    aoa.push([
      i + 1,
      taskTitle(t),
      [t.equipmentName, t.location].filter(Boolean).join(' · ') || '—',
      priorityOf(t.priority).label,
      dateTimeText(t.createdAt),
      isDone ? dateTimeText(t.doneAt) : 'Не выполнена',
      isDone ? Math.round(t.cost || 0) : '',
      isDone ? t.doneByName || t.technicianName || '' : t.technicianName || 'любой закреплённый',
      t.doneComment || '',
      t.description || '',
    ]);
  });
  if (tasks.length) {
    aoa.push(['', `Итого: задач ${tasks.length}, выполнено ${done.length}`, '', '', '', '', Math.round(total), '', '', '']);
  } else {
    aoa.push(['', 'За период задач не было']);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const at = (r: number, c: number) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!sheet[ref]) sheet[ref] = { t: 's', v: '' };
    return sheet[ref];
  };
  at(0, 0).s = { font: { bold: true, sz: 12 } };
  for (let c = 0; c < width; c += 1) {
    at(1, c).s = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'D9D9D9' } } };
  }
  tasks.forEach((t, i) => {
    const color = t.status === 'done' ? COLORS.green : COLORS.yellow;
    for (let c = 0; c < width; c += 1) {
      at(i + 2, c).s = {
        fill: { patternType: 'solid', fgColor: { rgb: color } },
        alignment: { wrapText: c === 1 || c >= 8, vertical: 'top' },
      };
    }
  });
  if (tasks.length) {
    const last = tasks.length + 2;
    for (let c = 0; c < width; c += 1) at(last, c).s = { font: { bold: true } };
    sheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: last - 1, c: width - 1 } }),
    };
  }
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: width - 1 } }];
  sheet['!cols'] = [
    { wch: 5 },
    { wch: 40 },
    { wch: 26 },
    { wch: 14 },
    { wch: 17 },
    { wch: 17 },
    { wch: 13 },
    { wch: 20 },
    { wch: 34 },
    { wch: 50 },
  ];
  return sheet;
};

const loadTasks = async (sessionId?: number | null) => {
  try {
    return await fetchTasksReport(sessionId);
  } catch {
    return null;
  }
};

export const exportInventory = async (
  result: FinishResult,
  finishedAt?: string | null,
  allItems?: Equipment[],
) => {
  const report = await loadTasks(result.sessionId);
  const checkedAt = finishedAt ? new Date(finishedAt) : new Date();
  const all = [
    ...result.found.map((item) => ({ item, found: true })),
    ...result.missing.map((item) => ({ item, found: false })),
  ].sort(
    (a, b) =>
      Number(a.found) - Number(b.found) || a.item.name.localeCompare(b.item.name, 'ru'),
  );
  const rows = all.map(({ item, found }, i) => row(item, found, i));

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 5 },
    { wch: 34 },
    { wch: 22 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 20 },
    { wch: 11 },
    { wch: 28 },
  ];
  sheet['!autofilter'] = { ref: sheet['!ref'] || 'A1' };
  paintRows(
    sheet,
    all.map(({ item, found }) => rowColor(item, found)),
  );

  const summary = XLSX.utils.json_to_sheet([
    {
      Показатель: 'Дата проверки',
      Значение: (finishedAt ? new Date(finishedAt) : new Date()).toLocaleString('ru-RU'),
    },
    { Показатель: 'Всего позиций', Значение: result.total },
    { Показатель: 'Найдено', Значение: result.found.length },
    { Показатель: 'Не найдено', Значение: result.missing.length },
    { Показатель: 'Стоимость всего, ₽', Значение: Math.round(result.totalPrice) },
    { Показатель: 'Стоимость недостачи, ₽', Значение: Math.round(result.missingPrice) },
    {
      Показатель: 'Остаточная стоимость всего, ₽',
      Значение: Math.round(totalResidual([...result.found, ...result.missing], checkedAt)),
    },
    {
      Показатель: 'Остаточная стоимость недостачи, ₽',
      Значение: Math.round(totalResidual(result.missing, checkedAt)),
    },
    ...(report
      ? [
          {
            Показатель: 'Прочие задачи: период',
            Значение: `${report.from ? dateTimeText(report.from) : 'с начала учёта'} — ${
              report.to ? dateTimeText(report.to) : 'сейчас'
            }`,
          },
          { Показатель: 'Задач выполнено', Значение: report.tasks.filter((t) => t.status === 'done').length },
          { Показатель: 'Задач не выполнено', Значение: report.tasks.filter((t) => t.status !== 'done').length },
          {
            Показатель: 'Затраты на прочие задачи, ₽',
            Значение: Math.round(
              report.tasks.reduce((sum, t) => sum + (t.status === 'done' && t.kind !== 'repair' ? t.cost || 0 : 0), 0),
            ),
          },
        ]
      : []),
  ]);
  summary['!cols'] = [{ wch: 34 }, { wch: 36 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summary, 'Итоги');
  XLSX.utils.book_append_sheet(book, sheet, 'Оборудование');
  XLSX.utils.book_append_sheet(book, repairsSheet(allItems || [...result.found, ...result.missing]), 'Ремонты');
  if (report) XLSX.utils.book_append_sheet(book, tasksSheet(report.tasks, report.from, report.to), 'Прочие задачи');
  XLSX.writeFile(book, `Инвентаризация_${stamp(finishedAt)}.xlsx`);
};

export const exportEquipmentList = async (items: Equipment[]) => {
  const report = await loadTasks(null);
  const rows = items.map((item) => ({
    Наименование: item.name,
    Место: item.location || '',
    'Стоимость, ₽': item.price || 0,
  'Амортизация, ₽/день': item.depreciationPerDay || 0,
  'Ремонт, ₽': item.repairCost || 0,
  'Остаточная стоимость, ₽': Math.round(residualValue(item)),
    'Серийный номер': item.serial || '',
  'В эксплуатации с': commissioned(item),
    'QR-код': item.code,
    Статус: item.active ? (item.inRepair ? 'В ремонте' : item.qrBroken ? 'В работе, заменить QR' : 'В работе') : 'Списано',
    'Причина списания': item.writeOffReason || '',
    Заметка: item.note || '',
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  paintRows(
    sheet,
    items.map((item) => (!item.active ? COLORS.red : item.qrBroken ? COLORS.yellow : COLORS.green)),
  );
  sheet['!cols'] = [
    { wch: 34 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
    { wch: 28 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Оборудование');
  XLSX.utils.book_append_sheet(book, repairsSheet(items), 'Ремонты');
  if (report) XLSX.utils.book_append_sheet(book, tasksSheet(report.tasks, report.from, report.to), 'Прочие задачи');
  XLSX.writeFile(book, `Оборудование_${stamp()}.xlsx`);
};
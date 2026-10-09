import * as XLSX from 'xlsx-js-style';
import { Equipment } from '@/lib/equipmentApi';

export const IMPORT_COLUMNS = [
  'Название',
  'Стоимость',
  'Место',
  'Серийный номер',
  'В эксплуатации с',
  'Амортизация в день',
] as const;

export const SAMPLE_ROWS: (string | number)[][] = [
  ['Холодильник Polair ШХ-0,7', 85000, 'Кухня, горячий цех', 'PL-2024-00153', '15.03.2024', 46.5],
  ['Пароконвектомат Abat ПКА 6-1/1', 320000, 'Кухня', 'AB61-778812', '01.09.2023', 175],
  ['Миксер планетарный Kitfort', 18900, 'Кондитерский цех', '', '10.01.2025', 10],
  ['Кофемашина De Longhi', 54000, 'Бар', 'DL-55120034', '', ''],
];

export interface ImportRow {
  line: number;
  item: Partial<Equipment>;
  errors: string[];
  warnings: string[];
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]/g, '');

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['название', 'наименование', 'оборудование', 'имя', 'name'],
  price: ['стоимость', 'цена', 'стоимостьруб', 'ценаруб', 'price'],
  location: ['место', 'расположение', 'местоположение', 'location', 'где'],
  serial: ['серийныйномер', 'серийный', 'серийник', 'sn', 'serial', 'заводскойномер'],
  commissionedAt: ['вэксплуатациис', 'вэксплуатации', 'датаввода', 'датавводавэксплуатацию', 'датапокупки', 'с'],
  depreciationPerDay: ['амортизациявдень', 'амортизация', 'амортизациясутки', 'амортизациявсутки'],
};

const findColumns = (header: unknown[]) => {
  const map: Record<string, number> = {};
  header.forEach((cell, idx) => {
    const key = norm(cell);
    if (!key) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] !== undefined) continue;
      if (aliases.includes(key) || (key.length > 3 && aliases.some((a) => a.length > 3 && key.startsWith(a)))) {
        map[field] = idx;
        return;
      }
    }
  });
  return map;
};

const parseNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v)
    .replace(/[\s\u00a0₽руб.]+$/gi, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(/руб\.?|р\.?|₽/gi, '')
    .replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

const pad = (n: number) => String(n).padStart(2, '0');

const parseDate = (v: unknown): string | null | undefined => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y > 1900) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
    return undefined;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const month = Number(m[2]);
    const day = Number(m[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
    return undefined;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return undefined;
};

export const parseEquipmentFile = async (
  file: File,
): Promise<{ rows: ImportRow[]; missingColumns: string[] }> => {
  const buf = await file.arrayBuffer();
  const book = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return { rows: [], missingColumns: [...IMPORT_COLUMNS] };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });

  let headerIdx = aoa.findIndex((r) => {
    const cols = findColumns(r);
    return cols.name !== undefined;
  });
  if (headerIdx < 0) headerIdx = 0;
  const cols = findColumns(aoa[headerIdx] ?? []);
  const missingColumns: string[] = [];
  if (cols.name === undefined) missingColumns.push('Название');

  const rows: ImportRow[] = [];
  aoa.slice(headerIdx + 1).forEach((r, i) => {
    const get = (f: string) => (cols[f] !== undefined ? r[cols[f]] : '');
    const name = String(get('name') ?? '').trim();
    const rest = ['price', 'location', 'serial', 'commissionedAt', 'depreciationPerDay'].some(
      (f) => String(get(f) ?? '').trim() !== '',
    );
    if (!name && !rest) return;

    const errors: string[] = [];
    const warnings: string[] = [];
    if (!name) errors.push('нет названия');

    const price = parseNumber(get('price'));
    if (Number.isNaN(price)) errors.push('стоимость не число');
    else if (price !== null && price < 0) errors.push('стоимость меньше нуля');

    const dep = parseNumber(get('depreciationPerDay'));
    if (Number.isNaN(dep)) errors.push('амортизация не число');
    else if (dep !== null && dep < 0) errors.push('амортизация меньше нуля');

    const date = parseDate(get('commissionedAt'));
    if (date === undefined) errors.push('дата не распознана (нужно ДД.ММ.ГГГГ)');

    if (dep && !date) warnings.push('без даты амортизация не считается');

    rows.push({
      line: headerIdx + i + 2,
      errors,
      warnings,
      item: {
        name: name.slice(0, 200),
        price: price && !Number.isNaN(price) ? Math.round(price * 100) / 100 : 0,
        location: String(get('location') ?? '').trim().slice(0, 200),
        serial: String(get('serial') ?? '').trim().slice(0, 100),
        commissionedAt: date || null,
        depreciationPerDay: dep && !Number.isNaN(dep) ? Math.round(dep * 100) / 100 : 0,
        note: '',
        image: '',
        active: true,
      },
    });
  });

  return { rows, missingColumns };
};

export const downloadImportTemplate = () => {
  const aoa: (string | number)[][] = [[...IMPORT_COLUMNS], ...SAMPLE_ROWS];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 17 }, { wch: 19 }];
  IMPORT_COLUMNS.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (sheet[ref]) {
      sheet[ref].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '2B2BB5' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };
    }
  });
  for (let r = 1; r <= SAMPLE_ROWS.length; r += 1) {
    const priceRef = XLSX.utils.encode_cell({ r, c: 1 });
    if (sheet[priceRef]) sheet[priceRef].z = '#,##0.00';
    const depRef = XLSX.utils.encode_cell({ r, c: 5 });
    if (sheet[depRef] && sheet[depRef].v !== '') sheet[depRef].z = '#,##0.00';
  }

  const help = XLSX.utils.aoa_to_sheet([
    ['Колонка', 'Обязательно', 'Как заполнять'],
    ['Название', 'да', 'Как оборудование будет называться в списке'],
    ['Стоимость', 'нет', 'Цена покупки в рублях, только число: 85000 или 85000,50'],
    ['Место', 'нет', 'Где стоит: цех, бар, склад'],
    ['Серийный номер', 'нет', 'Заводской номер с шильдика'],
    ['В эксплуатации с', 'нет', 'Дата в формате ДД.ММ.ГГГГ, например 15.03.2024'],
    ['Амортизация в день', 'нет', 'Сколько рублей в день теряет стоимость. Считается от даты ввода'],
    [],
    ['Первая строка — заголовки, порядок колонок любой. Примеры строк удалите и впишите своё.'],
  ]);
  help['!cols'] = [{ wch: 22 }, { wch: 13 }, { wch: 70 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Оборудование');
  XLSX.utils.book_append_sheet(book, help, 'Как заполнять');
  XLSX.writeFile(book, 'shablon-oborudovanie.xlsx');
};

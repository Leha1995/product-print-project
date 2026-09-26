import * as XLSX from 'xlsx';
import { Equipment, FinishResult } from '@/lib/equipmentApi';

const stamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}_${pad(d.getHours())}-${pad(
    d.getMinutes(),
  )}`;
};

const statusText = (item: Equipment, found: boolean) => {
  if (!item.active) return 'Списано';
  if (found && item.qrBroken) return 'Найдено, QR повреждён';
  return found ? 'Найдено' : 'Не найдено';
};

const row = (item: Equipment, found: boolean) => ({
  Наименование: item.name,
  Статус: statusText(item, found),
  Место: item.location || '',
  'Стоимость, ₽': item.price || 0,
  'Серийный номер': item.serial || '',
  'QR-код': item.code,
  Заметка: item.note || '',
});

export const exportInventory = (result: FinishResult) => {
  const rows = [
    ...result.missing.map((i) => row(i, false)),
    ...result.found.map((i) => row(i, true)),
  ];

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 34 },
    { wch: 13 },
    { wch: 20 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 28 },
  ];

  const summary = XLSX.utils.json_to_sheet([
    { Показатель: 'Дата проверки', Значение: new Date().toLocaleString('ru-RU') },
    { Показатель: 'Всего позиций', Значение: result.total },
    { Показатель: 'Найдено', Значение: result.found.length },
    { Показатель: 'Не найдено', Значение: result.missing.length },
    { Показатель: 'Стоимость всего, ₽', Значение: Math.round(result.totalPrice) },
    { Показатель: 'Стоимость недостачи, ₽', Значение: Math.round(result.missingPrice) },
  ]);
  summary['!cols'] = [{ wch: 26 }, { wch: 24 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summary, 'Итоги');
  XLSX.utils.book_append_sheet(book, sheet, 'Оборудование');
  XLSX.writeFile(book, `Инвентаризация_${stamp()}.xlsx`);
};

export const exportEquipmentList = (items: Equipment[]) => {
  const rows = items.map((item) => ({
    Наименование: item.name,
    Место: item.location || '',
    'Стоимость, ₽': item.price || 0,
    'Серийный номер': item.serial || '',
    'QR-код': item.code,
    Статус: item.active ? (item.qrBroken ? 'В работе, заменить QR' : 'В работе') : 'Списано',
    'Причина списания': item.writeOffReason || '',
    Заметка: item.note || '',
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 34 },
    { wch: 20 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
    { wch: 28 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Оборудование');
  XLSX.writeFile(book, `Оборудование_${stamp()}.xlsx`);
};
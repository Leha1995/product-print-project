import { LabelSettings } from '@/hooks/useLabelSettings';
import { Product } from '@/data/products';

const columns = [
  'Template',
  'Copies',
  'Printer',
  'Name',
  'Composition',
  'Weight',
  'Price',
  'Barcode',
  'ProducedAt',
  'ExpiryAt',
  'ShelfLifeHours',
  'Storage',
  'Shop',
  'Maker',
  'Checker',
] as const;

const esc = (value: string | number) => {
  const text = String(value ?? '');
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const fmt = (date: Date) =>
  date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const buildRow = (
  product: Product,
  copies: number,
  printedAt: Date,
  settings: LabelSettings,
) => {
  const hours = product.shelfLifeHours ?? settings.shelfLifeHours;
  const expiry = new Date(printedAt.getTime() + hours * 3600000);

  return [
    settings.bartenderTemplate,
    copies,
    settings.bartenderPrinter,
    product.name,
    settings.showComposition ? product.composition : '',
    settings.showWeight ? product.weight : '',
    product.price,
    product.barcode,
    settings.showDate ? fmt(printedAt) : '',
    settings.showExpiry ? fmt(expiry) : '',
    hours,
    settings.showStorage ? settings.storageText : '',
    settings.shopName,
    settings.showStaff ? settings.makerName : '',
    settings.showStaff ? settings.checkerName : '',
  ];
};

export const buildBartenderCsv = (
  product: Product,
  copies: number,
  printedAt: Date,
  settings: LabelSettings,
) =>
  `${columns.join(',')}\n${buildRow(product, copies, printedAt, settings).map(esc).join(',')}\n`;

export const buildBartenderBatchCsv = (
  products: Product[],
  copies: number,
  printedAt: Date,
  settings: LabelSettings,
) =>
  `${columns.join(',')}\n${products
    .map((p) => buildRow(p, copies, printedAt, settings).map(esc).join(','))
    .join('\n')}\n`;

const saveCsv = (csv: string, fileName: string) => {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const downloadBartenderBatch = (
  products: Product[],
  copies: number,
  printedAt: Date,
  settings: LabelSettings,
) => {
  const stamp = printedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  saveCsv(
    buildBartenderBatchCsv(products, copies, printedAt, settings),
    `labels_batch_${stamp}.csv`,
  );
};

export const downloadBartenderJob = (
  product: Product,
  copies: number,
  printedAt: Date,
  settings: LabelSettings,
) => {
  const csv = buildBartenderCsv(product, copies, printedAt, settings);
  const stamp = printedAt
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  saveCsv(csv, `label_${product.id}_${stamp}.csv`);
};

export default downloadBartenderJob;
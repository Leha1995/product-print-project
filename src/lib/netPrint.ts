import { createElement } from 'react';
import { toast } from '@/hooks/use-toast';
import { ToastAction, ToastActionElement } from '@/components/ui/toast';
import { LabelSettings, getPaper } from '@/hooks/useLabelSettings';
import {
  NetPrinter,
  PrintConfig,
  apiPrintConfig,
  apiPrintJob,
  apiPrintStatus,
} from '@/lib/printApi';
import { TsplOptions, nodeToLabelCanvas, nodeToTspl, toBase64 } from '@/lib/tspl';

type Listener = (config: PrintConfig | null) => void;

let cache: PrintConfig | null = null;
let loading: Promise<PrintConfig | null> | null = null;
const listeners = new Set<Listener>();

export const subscribePrintConfig = (fn: Listener) => {
  listeners.add(fn);
  fn(cache);
  return () => {
    listeners.delete(fn);
  };
};

export const setPrintConfig = (config: PrintConfig | null) => {
  cache = config;
  listeners.forEach((fn) => fn(cache));
};

export const loadPrintConfig = (force = false) => {
  if (cache && !force) return Promise.resolve(cache);
  if (loading && !force) return loading;
  loading = apiPrintConfig()
    .then((c) => {
      setPrintConfig(c);
      return c;
    })
    .catch(() => null)
    .finally(() => {
      loading = null;
    });
  return loading;
};

export const pickPrinter = (settings: LabelSettings, config: PrintConfig | null) => {
  const list = config?.printers ?? [];
  return list.find((p) => p.id === settings.netPrinterId) ?? list[0] ?? null;
};

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export const sendRaw = async (printer: NetPrinter, bytes: Uint8Array) => {
  const job = await apiPrintJob(printer, toBase64(bytes));
  if (!job.online) {
    toast({
      title: 'Помощник печати не в сети',
      description: 'Задание в очереди: напечатается, когда включится компьютер с помощником.',
    });
    return false;
  }
  for (let i = 0; i < 12; i += 1) {
    await sleep(1000);
    const st = await apiPrintStatus(job.id).catch(() => null);
    if (!st) continue;
    if (st.status === 'done') return true;
    if (st.status === 'failed') {
      toast({
        title: `Принтер «${printer.name}» не ответил`,
        description: `Проверь, что он включён и его адрес ${printer.ip}. ${st.error || ''}`.trim(),
      });
      return false;
    }
  }
  toast({
    title: 'Печать задерживается',
    description: 'Задание отправлено, но принтер пока не подтвердил печать.',
  });
  return false;
};

export const networkOptions = (settings: LabelSettings, copies = 1): TsplOptions => {
  const paper = getPaper(settings.paper);
  return {
    widthMm: paper.widthMm,
    heightMm: paper.heightMm,
    rotate90: settings.rotate90,
    offsetXmm: settings.offsetXmm,
    offsetYmm: settings.offsetYmm,
    gapMm: settings.netGapMm,
    density: settings.netDensity,
    flip: settings.netFlip,
    copies,
  };
};

export const isRawMode = (settings: LabelSettings) =>
  settings.printMode === 'network' || settings.printMode === 'rawbt' || settings.printMode === 'share';

const canvasToFile = (canvas: HTMLCanvasElement, name: string) =>
  new Promise<File>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error('png'))),
      'image/png',
    ),
  );

const downloadFiles = (files: File[]) => {
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
};

export const shareLabelFiles = async (files: File[]) => {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (!nav.share || (nav.canShare && !nav.canShare({ files }))) {
    downloadFiles(files);
    toast({
      title: 'Этикетка сохранена картинкой',
      description: 'Этот браузер не умеет передавать файлы в приложения. Открой картинку в Print Label.',
    });
    return false;
  }
  try {
    await nav.share({ files });
    return true;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false;
    toast({
      title: files.length > 1 ? `Этикетки готовы: ${files.length} шт.` : 'Этикетка готова',
      description: 'Нажми «Отправить» и выбери Print Label.',
      action: createElement(
        ToastAction,
        { altText: 'Отправить', onClick: () => nav.share?.({ files }).catch(() => undefined) },
        'Отправить',
      ) as unknown as ToastActionElement,
    });
    return false;
  }
};

const printNodesShare = async (
  nodes: HTMLElement[],
  settings: LabelSettings,
  copies: number,
  override?: Partial<TsplOptions>,
) => {
  try {
    const stamp = String(Date.now());
    const files: File[] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const canvas = await nodeToLabelCanvas(nodes[i], { ...networkOptions(settings, copies), ...override });
      files.push(await canvasToFile(canvas, `etiketka-${stamp}-${i + 1}.png`));
    }
    if (copies > 1) {
      toast({ title: `Копий: ${copies}`, description: 'Укажи количество копий в Print Label.' });
    }
    return await shareLabelFiles(files);
  } catch {
    toast({ title: 'Не удалось подготовить этикетку' });
    return false;
  }
};

const RAWBT_CHUNK = 30;

const openRawbt = (bytes: Uint8Array) => {
  window.location.href = `rawbt:base64,${toBase64(bytes)}`;
};

export const sendToRawbt = async (labels: Uint8Array[]) => {
  for (let i = 0; i < labels.length; i += RAWBT_CHUNK) {
    const part = labels.slice(i, i + RAWBT_CHUNK);
    const total = part.reduce((s, p) => s + p.length, 0);
    const bytes = new Uint8Array(total);
    let pos = 0;
    part.forEach((p) => {
      bytes.set(p, pos);
      pos += p.length;
    });
    if (i > 0) await sleep(2500);
    openRawbt(bytes);
  }
  return true;
};

const printNodesRawbt = async (
  nodes: HTMLElement[],
  settings: LabelSettings,
  copies: number,
  override?: Partial<TsplOptions>,
) => {
  try {
    const labels: Uint8Array[] = [];
    for (const node of nodes) {
      labels.push(await nodeToTspl(node, { ...networkOptions(settings, copies), ...override }));
    }
    return await sendToRawbt(labels);
  } catch {
    toast({ title: 'Не удалось подготовить этикетку для RawBT' });
    return false;
  }
};

export const printNodesNetwork = async (
  nodes: HTMLElement[],
  settings: LabelSettings,
  copies = 1,
  override?: Partial<TsplOptions>,
) => {
  if (settings.printMode === 'share') return printNodesShare(nodes, settings, copies, override);
  if (settings.printMode === 'rawbt') return printNodesRawbt(nodes, settings, copies, override);
  const config = await loadPrintConfig();
  const printer = pickPrinter(settings, config);
  if (!printer) {
    toast({
      title: 'Сетевой принтер не добавлен',
      description: 'Добавь принтер по IP в настройках маркировки.',
    });
    return false;
  }
  try {
    const parts: Uint8Array[] = [];
    for (const node of nodes) {
      parts.push(await nodeToTspl(node, { ...networkOptions(settings, copies), ...override }));
    }
    const total = parts.reduce((s, p) => s + p.length, 0);
    const bytes = new Uint8Array(total);
    let pos = 0;
    parts.forEach((p) => {
      bytes.set(p, pos);
      pos += p.length;
    });
    return await sendRaw(printer, bytes);
  } catch {
    toast({ title: 'Не удалось отправить на принтер' });
    return false;
  }
};
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

type SendResult = 'ok' | 'queued' | 'pending' | 'failed';

const sendRawResult = async (printer: NetPrinter, bytes: Uint8Array, wait = true): Promise<SendResult> => {
  const job = await apiPrintJob(printer, toBase64(bytes));
  if (job.online && !wait) return 'ok';
  if (!job.online) {
    toast({
      title: 'Помощник печати не в сети',
      description: 'Задание в очереди: напечатается, когда включится компьютер с помощником.',
    });
    return 'queued';
  }
  for (let i = 0; i < 12; i += 1) {
    await sleep(1000);
    const st = await apiPrintStatus(job.id).catch(() => null);
    if (!st) continue;
    if (st.status === 'done') return 'ok';
    if (st.status === 'failed') {
      toast({
        title: `Принтер «${printer.name}» не ответил`,
        description: `Проверь, что он включён и его адрес ${printer.ip}. ${st.error || ''}`.trim(),
      });
      return 'failed';
    }
  }
  toast({
    title: 'Печать задерживается',
    description: 'Задание отправлено, но принтер пока не подтвердил печать.',
  });
  return 'pending';
};

export const sendRaw = async (printer: NetPrinter, bytes: Uint8Array, wait = true) =>
  (await sendRawResult(printer, bytes, wait)) === 'ok';

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

export interface PrintProgress {
  sent: number;
  total: number;
  status: 'preparing' | 'sending' | 'done' | 'failed';
  retryCount?: number;
  retrying?: boolean;
}

interface PendingRetry {
  printer: NetPrinter;
  labels: Uint8Array[];
}

let pendingRetry: PendingRetry | null = null;
let retryRunning = false;

type ProgressListener = (progress: PrintProgress | null) => void;

const progressListeners = new Set<ProgressListener>();
let progressHideTimer = 0;

export const subscribePrintProgress = (fn: ProgressListener) => {
  progressListeners.add(fn);
  return () => {
    progressListeners.delete(fn);
  };
};

const emitProgress = (progress: PrintProgress | null) => {
  window.clearTimeout(progressHideTimer);
  progressListeners.forEach((fn) => fn(progress));
  if (progress && progress.status === 'done') {
    progressHideTimer = window.setTimeout(() => emitProgress(null), 2500);
  }
  if (progress && progress.status === 'failed' && !progress.retryCount) {
    progressHideTimer = window.setTimeout(() => emitProgress(null), 5000);
  }
};

export const dismissPrintProgress = () => {
  pendingRetry = null;
  emitProgress(null);
};

const runLabels = async (
  printer: NetPrinter,
  total: number,
  getLabel: (i: number) => Promise<Uint8Array>,
  prepareRest: (from: number) => Promise<Uint8Array[]>,
  track: boolean,
  retrying = false,
) => {
  pendingRetry = null;
  if (track) emitProgress({ sent: 0, total, status: retrying ? 'sending' : 'preparing', retrying });
  const fail = (sent: number, labels: Uint8Array[]) => {
    if (labels.length) pendingRetry = { printer, labels };
    if (track || labels.length) {
      emitProgress({ sent, total, status: 'failed', retryCount: labels.length, retrying });
    }
    return false;
  };
  let next: Promise<Uint8Array> | null = getLabel(0);
  for (let i = 0; i < total; i += 1) {
    let bytes: Uint8Array;
    try {
      bytes = await next!;
    } catch {
      toast({
        title: 'Не удалось подготовить этикетку для печати',
        description: track ? `Отправлено ${i} из ${total}.` : undefined,
      });
      return fail(i, []);
    }
    next = i + 1 < total ? getLabel(i + 1) : null;
    next?.catch(() => undefined);
    let result: SendResult;
    try {
      result = await sendRawResult(printer, bytes, i === total - 1);
    } catch (e) {
      toast({
        title: 'Не удалось отправить на принтер',
        description: track
          ? `Отправлено ${i} из ${total}. ${(e as Error).message || ''}`.trim()
          : (e as Error).message || undefined,
      });
      result = 'failed';
    }
    if (result === 'ok') {
      if (track) emitProgress({ sent: i + 1, total, status: i + 1 === total ? 'done' : 'sending', retrying });
      continue;
    }
    const done = result === 'failed' ? i : i + 1;
    const rest = await prepareRest(i + 1).catch(() => [] as Uint8Array[]);
    return fail(done, result === 'failed' ? [bytes, ...rest] : rest);
  }
  return true;
};

export const retryPendingPrint = async () => {
  if (!pendingRetry || retryRunning) return false;
  const { printer, labels } = pendingRetry;
  retryRunning = true;
  try {
    return await runLabels(
      printer,
      labels.length,
      (i) => Promise.resolve(labels[i]),
      (from) => Promise.resolve(labels.slice(from)),
      true,
      true,
    );
  } finally {
    retryRunning = false;
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
  const total = nodes.length;
  if (!total) return false;
  const opts = { ...networkOptions(settings, copies), ...override };
  const render = (i: number) => nodeToTspl(nodes[i], opts);
  const prepareRest = async (from: number) => {
    const out: Uint8Array[] = [];
    for (let i = from; i < total; i += 1) out.push(await render(i));
    return out;
  };
  return runLabels(printer, total, render, prepareRest, total > 1);
};
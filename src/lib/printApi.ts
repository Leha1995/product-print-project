import { apiUrl } from '@/lib/apiBase';
import { getToken } from '@/lib/authApi';

const API = apiUrl('print');

export interface NetPrinter {
  id: string;
  name: string;
  ip: string;
  port: number;
}

export interface PrintConfig {
  printers: NetPrinter[];
  online: boolean;
  key: string | null;
  canSetup: boolean;
}

const request = async <T>(body: Record<string, unknown>, query = ''): Promise<T> => {
  const res = await fetch(`${API}${query}`, {
    method: query ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
    body: query ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || String(res.status));
  return data as T;
};

export const apiPrintConfig = () => request<PrintConfig>({}, '?action=config');

export const apiSavePrinters = (printers: NetPrinter[]) =>
  request<{ printers: NetPrinter[] }>({ action: 'printers', printers });

export const apiRegenPrintKey = () => request<{ key: string }>({ action: 'regen_key' });

export const apiPrintJob = (printer: NetPrinter, data: string) =>
  request<{ id: number; online: boolean }>({
    action: 'job',
    ip: printer.ip,
    port: printer.port,
    data,
  });

export const apiPrintStatus = (id: number) =>
  request<{ status: string; error: string; online: boolean }>({}, `?action=status&id=${id}`);

export const printEndpoint = () => new URL(API, window.location.href).href;

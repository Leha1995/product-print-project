import func2url from '../../backend/func2url.json';
import { apiUrl, isOwnServer } from '@/lib/apiBase';
import { getToken } from '@/lib/authApi';

export interface MaxStatus {
  canReport?: boolean;
  reportTime?: string | null;
  reportEnabled?: boolean;
  allowed?: boolean;
  configured: boolean;
  linked: boolean;
  name: string;
  linkedAt: string | null;
}

const API = () => apiUrl('max');
const headers = () => ({ 'Content-Type': 'application/json', 'X-Auth-Token': getToken() });

export const fetchMaxStatus = async (): Promise<MaxStatus> => {
  const res = await fetch(API(), { headers: headers() });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

export const requestMaxLink = async (): Promise<{ url: string; botName: string }> => {
  const res = await fetch(API(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      action: 'link',
      webhookUrl: (func2url as Record<string, string>).max,
      ...(isOwnServer() ? { hookUrl: new URL(API(), window.location.href).href } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || String(res.status));
  return data;
};

export const saveReportSettings = async (time: string, enabled: boolean): Promise<MaxStatus> => {
  const res = await fetch(API(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action: 'report_settings', time, enabled, tzOffset: new Date().getTimezoneOffset() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || String(res.status));
  return data;
};

export const unlinkMax = async (): Promise<MaxStatus> => {
  const res = await fetch(API(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action: 'unlink' }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

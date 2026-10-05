import func2url from '../../backend/func2url.json';
import { apiUrl } from '@/lib/apiBase';
import { getToken } from '@/lib/authApi';

export interface TelegramStatus {
  configured: boolean;
  linked: boolean;
  tgName: string;
  linkedAt: string | null;
}

const API = () => apiUrl('telegram');
const headers = () => ({ 'Content-Type': 'application/json', 'X-Auth-Token': getToken() });

export const fetchTelegramStatus = async (): Promise<TelegramStatus> => {
  const res = await fetch(API(), { headers: headers() });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

export const requestTelegramLink = async (): Promise<{ url: string; botName: string }> => {
  const res = await fetch(API(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      action: 'link',
      webhookUrl: (func2url as Record<string, string>).telegram,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || String(res.status));
  return data;
};

export const unlinkTelegram = async (): Promise<TelegramStatus> => {
  const res = await fetch(API(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action: 'unlink' }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

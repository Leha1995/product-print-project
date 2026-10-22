import { apiUrl } from '@/lib/apiBase';
import { getToken } from '@/lib/authApi';

export interface MaxStatus {
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
    body: JSON.stringify({ action: 'link' }),
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

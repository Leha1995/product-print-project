import { apiUrl } from '@/lib/apiBase';
import { getToken } from '@/lib/authApi';

const API = apiUrl('equipment');

export interface Equipment {
  id: string;
  name: string;
  code: string;
  price: number;
  location: string;
  note: string;
  image: string;
  serial: string;
  active: boolean;
  createdAt?: string | null;
  qrBroken?: boolean;
  writtenOffAt?: string | null;
  writeOffReason?: string;
  commissionedAt?: string | null;
  depreciationPerDay?: number;
  repairCost?: number;
}

export interface InventorySession {
  id: number;
  startedAt: string | null;
  finishedAt: string | null;
  scanned: string[];
  missing: string[];
  total: number;
  totalPrice: number;
  missingPrice: number;
}

export interface FinishResult {
  sessionId: number | null;
  found: Equipment[];
  missing: Equipment[];
  total: number;
  totalPrice: number;
  missingPrice: number;
  sessions: InventorySession[];
}

let targetUserId: number | null = null;

export const setEquipmentTarget = (id: number | null) => {
  targetUserId = id;
};

const authHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Auth-Token': getToken(),
  };
  if (targetUserId) headers['X-Target-User'] = String(targetUserId);
  return headers;
};

const send = async (body: Record<string, unknown>, method = 'POST') => {
  const res = await fetch(API, { method, headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

export const fetchEquipment = async (): Promise<{
  items: Equipment[];
  sessions: InventorySession[];
}> => {
  const res = await fetch(API, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return {
    items: Array.isArray(data.items) ? (data.items as Equipment[]) : [],
    sessions: Array.isArray(data.sessions) ? (data.sessions as InventorySession[]) : [],
  };
};

export const saveEquipment = (item: Partial<Equipment>) =>
  send({ item }) as Promise<{ items: Equipment[] }>;

export const deleteEquipment = (id: string) =>
  send({ id }, 'DELETE') as Promise<{ items: Equipment[] }>;

export const finishInventory = (scanned: string[]) =>
  send({ action: 'finish', scanned }) as Promise<FinishResult>;

export const resolveMissing = (
  id: string,
  mode: 'qr_broken' | 'write_off',
  sessionId?: number | null,
  reason?: string,
) =>
  send({ action: 'resolve', id, mode, sessionId, reason }) as Promise<{
    items: Equipment[];
    sessions: InventorySession[];
  }>;

export const markQrFixed = (id: string) =>
  send({ action: 'qr_fixed', id }) as Promise<{ code: string; items: Equipment[] }>;

export const restoreEquipment = (id: string) =>
  send({ action: 'restore', id }) as Promise<{ items: Equipment[] }>;
import { apiUrl } from '@/lib/apiBase';
import { getToken } from '@/lib/authApi';

const API = apiUrl('equipment');

export interface RepairRecord {
  id: number;
  sentAt: string | null;
  returnedAt: string | null;
  cost: number;
  description: string;
  photos?: string[];
}

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
  inRepair?: boolean;
  repairSentAt?: string | null;
  repairs?: RepairRecord[];
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

export interface EquipmentTask {
  id: number;
  ownerId: number;
  equipmentId: string | null;
  technicianId: number | null;
  description: string;
  photos: string[];
  status: 'open' | 'done' | 'cancelled';
  createdAt: string | null;
  doneAt: string | null;
  doneComment: string;
  equipmentName: string;
  location: string;
  code: string;
  ownerName: string;
  technicianName: string;
  createdByName: string;
  doneByName: string;
  priority?: 'urgent' | 'soon' | 'normal';
  cost?: number;
  kind?: 'task' | 'repair';
}

export interface TechnicianRef {
  id: number;
  name: string;
}

export const fetchEquipment = async (): Promise<{
  items: Equipment[];
  sessions: InventorySession[];
  tasks: EquipmentTask[];
  technicians: TechnicianRef[];
}> => {
  const res = await fetch(API, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return {
    items: Array.isArray(data.items) ? (data.items as Equipment[]) : [],
    sessions: Array.isArray(data.sessions) ? (data.sessions as InventorySession[]) : [],
    tasks: Array.isArray(data.tasks) ? (data.tasks as EquipmentTask[]) : [],
    technicians: Array.isArray(data.technicians) ? (data.technicians as TechnicianRef[]) : [],
  };
};

export const createTask = (payload: {
  description: string;
  photos: string[];
  equipmentId?: string | null;
  technicianId?: number | null;
  priority?: 'urgent' | 'soon' | 'normal';
}) => send({ action: 'create_task', ...payload }) as Promise<{ tasks: EquipmentTask[] }>;

export const cancelTask = (taskId: number) =>
  send({ action: 'cancel_task', taskId }) as Promise<{ tasks: EquipmentTask[] }>;

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
export const sendToRepair = (id: string, description = '', photos: string[] = []) =>
  send({ action: 'send_repair', id, description, photos }) as Promise<{ items: Equipment[]; tasks?: EquipmentTask[] }>;

export const returnFromRepair = (id: string, cost: number, description?: string) =>
  send({ action: 'return_repair', id, cost, description }) as Promise<{ items: Equipment[]; tasks?: EquipmentTask[] }>;

export interface TechRepair {
  ownerId: number;
  ownerName: string;
  id: string;
  name: string;
  code: string;
  location: string;
  serial: string;
  image: string;
  repairSentAt: string | null;
  repairCost: number;
  description: string;
  photos?: string[];
}

export interface TechMonthStats {
  month: string;
  isCurrent: boolean;
  tasksDone: number;
  urgentDone: number;
  tasksCost: number;
  repairsReturned: number;
  repairsCost: number;
  totalCost: number;
}

export const fetchTechRepairs = async (
  viewTechId?: number | null,
  month?: string,
): Promise<{ repairs: TechRepair[]; tasks: EquipmentTask[]; stats: TechMonthStats | null }> => {
  const params = new URLSearchParams();
  if (viewTechId) params.set('viewTech', String(viewTechId));
  if (month) params.set('month', month);
  const url = params.toString() ? `${API}?${params}` : API;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return {
    repairs: Array.isArray(data.repairs) ? (data.repairs as TechRepair[]) : [],
    tasks: Array.isArray(data.tasks) ? (data.tasks as EquipmentTask[]) : [],
    stats: data.stats ? (data.stats as TechMonthStats) : null,
  };
};

export const fetchTasksReport = async (
  sessionId?: number | null,
): Promise<{ tasks: EquipmentTask[]; from: string | null; to: string | null }> => {
  const params = new URLSearchParams({ report: 'tasks' });
  if (sessionId) params.set('sessionId', String(sessionId));
  const res = await fetch(`${API}?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return {
    tasks: Array.isArray(data.tasks) ? (data.tasks as EquipmentTask[]) : [],
    from: data.from ?? null,
    to: data.to ?? null,
  };
};

export const techTaskDone = (taskId: number, comment: string, cost = 0) =>
  send({ action: 'task_done', taskId, comment, cost }) as Promise<{ tasks: EquipmentTask[]; repairs?: TechRepair[] }>;

export const techReturnRepair = (ownerId: number, id: string, cost: number, description: string) =>
  send({ action: 'return_repair', ownerId, id, cost, description }) as Promise<{ repairs: TechRepair[]; tasks?: EquipmentTask[] }>;

export interface PointEquipment {
  id: number;
  name: string;
  items: Equipment[];
  tasks?: EquipmentTask[];
}

export const fetchAllPoints = async (from?: string, to?: string): Promise<PointEquipment[]> => {
  const params = new URLSearchParams({ report: 'all_points' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`${API}?${params}`, {
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return Array.isArray(data.points) ? (data.points as PointEquipment[]) : [];
};

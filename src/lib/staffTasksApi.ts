import { apiUrl } from '@/lib/apiBase';
import { getToken } from '@/lib/authApi';

const API = apiUrl('staff-tasks');

export type StaffTaskKind = 'daily' | 'once';

export interface StaffTask {
  id: number;
  title: string;
  note: string;
  kind: StaffTaskKind;
  startTime: string;
  date: string | null;
  intervalMin: number;
  tune: string;
  assigneeId: number;
  assigneeName: string;
  createdByName: string;
  doneAt: string | null;
  doneBy: string;
}

export interface StaffAssignee {
  id: number;
  name: string;
  role: string;
}

export interface StaffTasksData {
  mine: StaffTask[];
  manage: StaffTask[];
  assignees: StaffAssignee[];
  canManage: boolean;
}

export interface StaffTaskInput {
  title: string;
  note: string;
  kind: StaffTaskKind;
  startTime: string;
  date: string | null;
  intervalMin: number;
  tune: string;
  assigneeId: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const headers = () => ({ 'Content-Type': 'application/json', 'X-Auth-Token': getToken() });

const normalize = (data: Partial<StaffTasksData>): StaffTasksData => ({
  mine: Array.isArray(data.mine) ? data.mine : [],
  manage: Array.isArray(data.manage) ? data.manage : [],
  assignees: Array.isArray(data.assignees) ? data.assignees : [],
  canManage: Boolean(data.canManage),
});

export const fetchStaffTasks = async (): Promise<StaffTasksData> => {
  const res = await fetch(`${API}?day=${todayKey()}`, { headers: headers() });
  if (!res.ok) throw new Error(String(res.status));
  return normalize(await res.json());
};

const send = async (body: Record<string, unknown>): Promise<StaffTasksData> => {
  const res = await fetch(API, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ...body, day: todayKey() }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return normalize(await res.json());
};

export const markStaffTaskDone = (taskId: number) => send({ action: 'done', taskId });

export const createStaffTask = (task: StaffTaskInput) => send({ action: 'create', ...task });

export const updateStaffTask = (taskId: number, task: StaffTaskInput) =>
  send({ action: 'update', taskId, ...task });

export const deleteStaffTask = (taskId: number) => send({ action: 'delete', taskId });

export const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const isTaskDue = (task: StaffTask, now = new Date()) => {
  if (task.doneAt) return false;
  const today = todayKey(now);
  if (task.kind === 'once') {
    if (!task.date || task.date > today) return false;
    if (task.date < today) return true;
  }
  return now.getHours() * 60 + now.getMinutes() >= minutesOf(task.startTime);
};

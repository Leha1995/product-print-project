import { Role } from '@/lib/authApi';

export const roleLabel: Record<Role, string> = {
  user: 'Сотрудник',
  admin: 'Админ',
  manager: 'Управляющий',
  superadmin: 'Супер-админ',
  technician: 'Техник',
  accountant: 'Бухгалтер',
};

export const inputClass =
  'w-full border-2 border-primary bg-background px-3 py-2 font-body text-[14px] text-primary outline-none';

export const accessOptions: { days: number | ''; label: string }[] = [
  { days: '', label: 'Без ограничения' },
  { days: 1, label: '1 день' },
  { days: 7, label: '7 дней' },
  { days: 14, label: '14 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
  { days: 180, label: '180 дней' },
  { days: 365, label: '1 год' },
];

export const accessInfo = (until: string | null, inherited = false) => {
  if (!until) return { text: 'Доступ без срока', tone: 'muted' as const };
  const prefix = inherited ? 'По руководителю: ' : '';
  const end = new Date(until.endsWith('Z') ? until : `${until}Z`).getTime();
  const left = end - Date.now();
  const date = new Date(end).toLocaleDateString('ru-RU');
  if (left <= 0) return { text: `${prefix}доступ истёк ${date}`, tone: 'bad' as const };
  const days = Math.ceil(left / 86400000);
  return {
    text: `${prefix}доступ до ${date} · осталось ${days} дн.`,
    tone: left < 7 * 86400000 ? ('bad' as const) : ('good' as const),
  };
};

export const toneClass = { good: 'text-success', bad: 'text-destructive', muted: 'text-muted-foreground' };

export const splitFullName = (full: string) => {
  const [first = '', ...rest] = full.trim().split(/\s+/).filter(Boolean);
  return { first, last: rest.join(' ') };
};

export const joinFullName = (first: string, last: string) =>
  [first.trim(), last.trim()].filter(Boolean).join(' ');

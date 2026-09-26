import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

interface TerminalHeaderProps {
  printedCount: number;
  onNavigate: (target: string) => void;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  userName?: string;
  onUsersClick?: () => void;
  onOverviewClick?: () => void;
  alertCount?: number;
  onAdminClick: () => void;
  accessUntil?: string | null;
}

const accessLeft = (until?: string | null) => {
  if (!until) return null;
  const end = new Date(until.endsWith('Z') ? until : `${until}Z`).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - Date.now();
  if (diff <= 0) return { text: 'Доступ истёк', warn: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const text = days > 0 ? `${days} дн. ${hours} ч.` : `${hours} ч.`;
  return { text, warn: diff < 7 * 86400000 };
};

const links = [
  { label: 'Продукты', target: 'menu' },
];

const TerminalHeader = ({
  printedCount,
  onNavigate,
  isAdmin,
  isSuperAdmin,
  userName,
  onUsersClick,
  onOverviewClick,
  alertCount = 0,
  onAdminClick,
  accessUntil,
}: TerminalHeaderProps) => {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!accessUntil) return;
    const id = setInterval(() => tick((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, [accessUntil]);

  const left = accessLeft(accessUntil);
  return (
    <header className="print-hide sticky top-0 z-40 grid h-[70px] grid-cols-[1fr_auto_1fr] items-center border-b-2 border-primary bg-background px-4 md:px-8">
      <ul className="flex gap-5 md:gap-8">
        {links.map((link) => (
          <li key={link.target}>
            <button
              onClick={() => onNavigate(link.target)}
              className="font-head text-[0.8rem] font-medium uppercase tracking-[0.04em] text-primary transition-colors hover:text-secondary md:text-[0.95rem]"
            >
              {link.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="brand-squeeze font-head text-lg font-black uppercase tracking-[-0.02em] text-primary md:text-2xl">
        Автосуши&nbsp;Автопицца
      </div>

      <div className="flex items-center justify-end gap-3">
        {left && (
          <span
            aria-label="Осталось времени доступа"
            className={`flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap border-2 px-2 font-head text-[0.65rem] font-bold uppercase tracking-[0.06em] ${
              left.warn
                ? 'border-destructive bg-destructive text-destructive-foreground'
                : 'border-success bg-success text-success-foreground'
            }`}
          >
            <Icon name="Clock" size={16} strokeWidth={2.5} />
            {left.text}
          </span>
        )}
        {isAdmin && (
          <button
            onClick={onOverviewClick}
            aria-label="Сводка по сотрудникам"
            className={`relative flex h-[34px] items-center gap-1.5 border-2 border-primary px-2 transition-colors ${
              alertCount
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/80'
                : 'bg-card text-primary hover:bg-muted'
            }`}
          >
            <Icon name="ClipboardList" size={20} strokeWidth={2.5} />
            <span className="hidden font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] sm:inline">
              Сводка{alertCount ? ` · ${alertCount}` : ''}
            </span>
          </button>
        )}
        {isAdmin && (
          <button
            onClick={onUsersClick}
            aria-label="Пользователи"
            className="flex h-[34px] items-center gap-1.5 border-2 border-primary bg-primary px-2 text-primary-foreground transition-colors hover:bg-secondary"
          >
            <Icon name="Users" size={20} strokeWidth={2.5} />
            <span className="hidden font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] sm:inline">
              {isSuperAdmin ? 'Супер-админ' : 'Сотрудники'}
            </span>
          </button>
        )}
        <button
          onClick={onAdminClick}
          aria-label="Профиль"
          className={`flex h-[34px] max-w-[190px] items-center gap-1.5 border-2 border-primary px-2 transition-colors ${
            isAdmin ? 'bg-accent text-accent-foreground' : 'bg-card text-primary hover:bg-muted'
          }`}
        >
          <Icon name={isAdmin ? 'ShieldCheck' : 'CircleUser'} size={20} strokeWidth={2.5} />
          <span className="hidden truncate font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] sm:inline">
            {userName || (isAdmin ? 'Админ' : 'Профиль')}
          </span>
        </button>
        <span className="relative inline-flex h-[30px] w-[34px] items-center justify-center">
          <Icon name="Printer" size={28} className="text-primary" strokeWidth={2} />
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border-2 border-primary bg-accent px-1 font-head text-[0.65rem] font-bold text-accent-foreground">
            {printedCount}
          </span>
        </span>
      </div>
    </header>
  );
};

export default TerminalHeader;
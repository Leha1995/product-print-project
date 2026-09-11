import Icon from '@/components/ui/icon';

interface TerminalHeaderProps {
  printedCount: number;
  onNavigate: (target: string) => void;
  isAdmin: boolean;
  onAdminClick: () => void;
}

const links = [
  { label: 'Меню', target: 'menu' },
];

const TerminalHeader = ({
  printedCount,
  onNavigate,
  isAdmin,
  onAdminClick,
}: TerminalHeaderProps) => {
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

      <div className="flex items-center justify-end gap-4">
        <button
          onClick={onAdminClick}
          aria-label={isAdmin ? 'Режим администратора' : 'Вход администратора'}
          className={`flex h-[34px] items-center gap-1.5 border-2 border-primary px-2 transition-colors ${
            isAdmin ? 'bg-accent text-accent-foreground' : 'bg-card text-primary hover:bg-muted'
          }`}
        >
          <Icon name={isAdmin ? 'ShieldCheck' : 'CircleUser'} size={20} strokeWidth={2.5} />
          <span className="hidden font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] sm:inline">
            {isAdmin ? 'Админ' : 'Вход'}
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
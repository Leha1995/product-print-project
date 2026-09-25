import Icon from '@/components/ui/icon';

const PHONE = '+79111703890';
const PHONE_VIEW = '+7 911 170-38-90';

const links = [
  { href: `https://t.me/${PHONE}`, icon: 'Send', label: 'Telegram' },
  { href: `https://max.ru/${PHONE}`, icon: 'MessageCircle', label: 'MAX' },
];

interface LicenseContactsProps {
  variant?: 'light' | 'dark';
  className?: string;
}

const LicenseContacts = ({ variant = 'light', className = '' }: LicenseContactsProps) => {
  const dark = variant === 'dark';
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <span
        className={`font-head text-[0.9rem] font-black uppercase tracking-[0.06em] ${
          dark ? 'text-primary-foreground' : 'text-primary'
        }`}
      >
        Покупка лицензии
      </span>

      <a
        href={`tel:${PHONE}`}
        className={`flex items-center gap-2 border-2 bg-accent px-3 py-2 font-head text-[0.8rem] font-bold uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5 ${
          dark ? 'border-primary-foreground' : 'border-primary'
        }`}
      >
        <Icon name="Phone" size={16} strokeWidth={2.5} />
        {PHONE_VIEW}
      </a>

      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          aria-label={l.label}
          className={`flex items-center gap-2 border-2 bg-transparent px-3 py-2 font-head text-[0.8rem] font-bold uppercase tracking-[0.04em] transition-colors ${
            dark
              ? 'border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary'
              : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground'
          }`}
        >
          <Icon name={l.icon} size={16} strokeWidth={2.5} />
          {l.label}
        </a>
      ))}
    </div>
  );
};

export default LicenseContacts;

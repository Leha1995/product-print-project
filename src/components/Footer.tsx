import Icon from '@/components/ui/icon';

const PHONE = '+79111703890';
const PHONE_VIEW = '+7 911 170-38-90';

const contacts = [
  {
    href: `https://t.me/${PHONE}`,
    icon: 'Send',
    label: 'Telegram',
  },
  {
    href: `https://max.ru/${PHONE}`,
    icon: 'MessageCircle',
    label: 'MAX',
  },
];

const Footer = () => {
  return (
    <footer className="print-hide border-t-2 border-primary bg-primary px-4 py-8 text-primary-foreground md:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4">
        <span className="brand-squeeze font-head text-xl font-black uppercase">
          Автосуши&nbsp;Автопицца
        </span>
        <span className="font-head text-[0.7rem] uppercase tracking-[0.1em]">
          Терминал печати маркировки · версия 1.0
        </span>
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-[1400px] flex-wrap items-center gap-3 border-t-2 border-primary-foreground/30 pt-6">
        <span className="font-head text-[0.9rem] font-black uppercase tracking-[0.06em]">
          Покупка лицензии
        </span>

        <a
          href={`tel:${PHONE}`}
          className="flex items-center gap-2 border-2 border-primary-foreground bg-accent px-3 py-2 font-head text-[0.8rem] font-bold uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5"
        >
          <Icon name="Phone" size={16} strokeWidth={2.5} />
          {PHONE_VIEW}
        </a>

        {contacts.map((c) => (
          <a
            key={c.label}
            href={c.href}
            target="_blank"
            rel="noreferrer"
            aria-label={c.label}
            className="flex items-center gap-2 border-2 border-primary-foreground bg-transparent px-3 py-2 font-head text-[0.8rem] font-bold uppercase tracking-[0.04em] text-primary-foreground transition-colors hover:bg-primary-foreground hover:text-primary"
          >
            <Icon name={c.icon} size={16} strokeWidth={2.5} />
            {c.label}
          </a>
        ))}
      </div>
    </footer>
  );
};

export default Footer;

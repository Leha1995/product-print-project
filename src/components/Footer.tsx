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
    </footer>
  );
};

export default Footer;
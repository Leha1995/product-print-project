const items = [
  'Тапнул по блюду — чек с составом уже в принтере',
  'Терминал зала · Автосуши Автопицца',
  'Печать маркировки за 2 секунды',
];

const AnnounceStrip = () => {
  return (
    <div className="print-hide h-[34px] w-full overflow-hidden bg-primary text-primary-foreground">
      <div className="flex h-full w-max animate-marquee items-center">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center">
            {items.map((text) => (
              <span
                key={`${copy}-${text}`}
                className="flex items-center gap-5 whitespace-nowrap px-6 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em]"
              >
                <span className="text-[0.7rem]">★</span>
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnnounceStrip;

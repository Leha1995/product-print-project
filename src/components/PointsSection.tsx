import Icon from '@/components/ui/icon';

const points = [
  { city: 'Москва', address: 'ул. Ленина, 14', hours: '10:00 — 23:00', terminal: 'Касса 1, 2' },
  { city: 'Химки', address: 'пр-т Мира, 3', hours: '10:00 — 22:00', terminal: 'Касса 1' },
  { city: 'Подольск', address: 'ул. Садовая, 41', hours: '11:00 — 23:00', terminal: 'Касса 1' },
];

const PointsSection = () => {
  return (
    <section id="points" className="print-hide border-t-2 border-primary bg-background">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
        <h2 className="font-head text-[28px] font-medium uppercase leading-none text-primary md:text-[40px]">
          Точки и терминалы
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {points.map((p) => (
            <div key={p.address} className="border-2 border-primary bg-card p-5">
              <div className="flex items-center gap-2 font-head text-lg font-bold uppercase text-primary">
                <Icon name="MapPin" size={18} strokeWidth={2.5} />
                {p.city}
              </div>
              <p className="mt-2 text-[15px] text-muted-foreground">{p.address}</p>
              <div className="mt-4 space-y-1 border-t-2 border-dashed border-primary pt-3 text-sm text-primary">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Часы</span>
                  <span className="font-semibold">{p.hours}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Терминалы</span>
                  <span className="font-semibold">{p.terminal}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PointsSection;

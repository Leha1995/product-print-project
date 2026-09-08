import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import ProductCard from '@/components/ProductCard';
import { CategoryId, Product, categories, products } from '@/data/products';

interface MenuSectionProps {
  onSelect: (product: Product) => void;
}

const MenuSection = ({ onSelect }: MenuSectionProps) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<CategoryId | 'all'>('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const byCat = active === 'all' || p.category === active;
      const byQuery = !q || p.name.toLowerCase().includes(q) || p.composition.toLowerCase().includes(q);
      return byCat && byQuery;
    });
  }, [query, active]);

  return (
    <section id="menu" className="print-hide border-t-2 border-primary bg-background">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-block border-2 border-primary bg-primary px-2 py-1 font-head text-[0.7rem] font-medium uppercase tracking-[0.1em] text-primary-foreground">
              Терминал зала
            </span>
            <h2 className="mt-3 font-head text-[34px] font-medium uppercase leading-[1.04] text-primary md:text-[52px]">
              Выбери позицию —<br className="hidden md:block" /> ценник уйдёт в принтер
            </h2>
          </div>

          <label className="flex w-full items-center gap-3 border-2 border-primary bg-card px-3 py-3 md:w-[340px]">
            <Icon name="Search" size={20} className="text-primary" strokeWidth={2.5} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию"
              className="w-full bg-transparent font-body text-[15px] text-primary outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Очистить поиск">
                <Icon name="X" size={18} className="text-muted-foreground" />
              </button>
            )}
          </label>
        </div>

        <div className="no-scrollbar mt-8 flex gap-3 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const isActive = active === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActive(cat.id)}
                className={`flex shrink-0 items-center gap-2 border-2 border-primary px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-primary hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon name={cat.icon} size={16} strokeWidth={2.5} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="mt-12 border-2 border-dashed border-primary p-10 text-center">
            <p className="font-head text-lg uppercase text-primary">Ничего не нашли</p>
            <p className="mt-2 text-muted-foreground">Попробуйте другое название или категорию</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default MenuSection;

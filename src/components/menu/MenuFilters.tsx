import { RefObject } from 'react';
import Icon from '@/components/ui/icon';
import { Category, CategoryId, UNCATEGORIZED } from '@/data/products';
import { ShelfOption } from '@/components/menu/shelfOptions';

interface MenuFiltersProps {
  tabsRef: RefObject<HTMLDivElement>;
  scrollTabs: (dir: 1 | -1) => void;
  categories: Category[];
  hasUncategorized: boolean;
  active: CategoryId | 'all';
  setActive: (id: CategoryId | 'all') => void;
  editMode: boolean;
  onAdd: () => void;
  onSharedBase: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  shelfFilter: number | 'all';
  setShelfFilter: (updater: (number | 'all') | ((v: number | 'all') => number | 'all')) => void;
  shelfOptions: ShelfOption[];
}

const MenuFilters = ({
  tabsRef,
  scrollTabs,
  categories,
  hasUncategorized,
  active,
  setActive,
  editMode,
  onAdd,
  onSharedBase,
  onExport,
  onImport,
  shelfFilter,
  setShelfFilter,
  shelfOptions,
}: MenuFiltersProps) => (
  <>
    <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          onClick={() => scrollTabs(-1)}
          aria-label="Прокрутить категории влево"
          className="hidden h-[42px] w-[34px] shrink-0 items-center justify-center border-2 border-primary bg-card text-primary transition-colors hover:bg-accent hover:text-accent-foreground md:flex"
        >
          <Icon name="ChevronLeft" size={18} strokeWidth={2.5} />
        </button>

        <div ref={tabsRef} className="cat-scroll flex min-w-0 flex-1 gap-3 overflow-x-auto pb-2">
          {[
            { id: 'all', label: 'Все продукты', icon: 'LayoutGrid' },
            ...categories,
            ...(hasUncategorized
              ? [{ id: UNCATEGORIZED, label: 'Без категории', icon: 'CircleHelp' }]
              : []),
          ].map((cat) => {
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

        <button
          onClick={() => scrollTabs(1)}
          aria-label="Прокрутить категории вправо"
          className="hidden h-[42px] w-[34px] shrink-0 items-center justify-center border-2 border-primary bg-card text-primary transition-colors hover:bg-accent hover:text-accent-foreground md:flex"
        >
          <Icon name="ChevronRight" size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-3">
        {editMode && (
          <button
            onClick={onAdd}
            className="flex items-center gap-2 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            <Icon name="Plus" size={16} strokeWidth={2.5} />
            Добавить
          </button>
        )}
        {editMode && (
          <>
            <button
              onClick={onSharedBase}
              className="flex items-center gap-2 border-2 border-primary bg-primary px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              <Icon name="Database" size={16} strokeWidth={2.5} />
              Общая база
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-2 border-2 border-primary bg-card px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
            >
              <Icon name="Download" size={16} strokeWidth={2.5} />
              Выгрузить
            </button>
            <label className="flex cursor-pointer items-center gap-2 border-2 border-primary bg-card px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted">
              <Icon name="Upload" size={16} strokeWidth={2.5} />
              Загрузить
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImport(file);
                  e.target.value = '';
                }}
              />
            </label>
          </>
        )}
      </div>
    </div>

    <div className="cat-scroll mt-3 flex gap-3 overflow-x-auto pb-2">
      <button
        onClick={() => setShelfFilter('all')}
        className={`flex shrink-0 items-center gap-2 border-2 border-primary px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors ${
          shelfFilter === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-primary hover:bg-accent hover:text-accent-foreground'
        }`}
      >
        <Icon name="Clock" size={16} strokeWidth={2.5} />
        Все сроки
      </button>
      {shelfOptions.map((opt) => (
        <button
          key={opt.hours}
          onClick={() => setShelfFilter((v) => (v === opt.hours ? 'all' : opt.hours))}
          disabled={!opt.count}
          className={`flex shrink-0 items-center gap-2 border-2 border-primary px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors disabled:opacity-40 ${
            shelfFilter === opt.hours
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-primary hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </>
);

export default MenuFilters;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import ProductCard from '@/components/ProductCard';
import CategoryEditor from '@/components/CategoryEditor';
import VirtualKeyboard from '@/components/VirtualKeyboard';
import { Category, CategoryId, Product, productCategories, UNCATEGORIZED } from '@/data/products';
import { ExpiryStatus } from '@/hooks/usePrintHistory';

const SHELF_STEPS = [3, 12, 48, 72, 120, 168, 720, 1440, 2160, 4320, 8760];

const round = (n: number) => Math.round(n * 10) / 10;

const shelfLabel = (hours: number) => {
  if (hours < 24) return `${round(hours)} ч`;
  const days = hours / 24;
  if (days < 30) return `${round(days)} сут`;
  if (days < 365) return `${round(days / 30)} мес`;
  const years = round(days / 365);
  return `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`;
};

interface MenuSectionProps {
  products: Product[];
  categories: Category[];
  onAddCategory: (label: string, icon: string) => void;
  onRenameCategory: (id: string, label: string) => void;
  onRemoveCategory: (category: Category) => void;
  onResetCategories: () => void;
  onSelect: (product: Product) => void;
  onPrint: (product: Product) => void;
  onPrintBatch: (products: Product[], label: string) => void;
  onDefrost: () => void;
  onAdd: () => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onSharedBase: () => void;
  isAdmin: boolean;
  onRequestAdmin: () => void;
  expiredIds?: Set<string>;
  getStatus?: (product: Product) => ExpiryStatus;
}

const MenuSection = ({
  products,
  categories,
  onAddCategory,
  onRenameCategory,
  onRemoveCategory,
  onResetCategories,
  onSelect,
  onPrint,
  onPrintBatch,
  onDefrost,
  onAdd,
  onEdit,
  onDelete,
  onExport,
  onImport,
  onSharedBase,
  isAdmin,
  onRequestAdmin,
  expiredIds,
  getStatus,
}: MenuSectionProps) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<CategoryId | 'all'>('all');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [rawEditMode, setEditMode] = useState(false);
  const [onlyExpired, setOnlyExpired] = useState(false);
  const [onlySoon, setOnlySoon] = useState(false);
  const [shelfFilter, setShelfFilter] = useState<number | 'all'>('all');
  const editMode = isAdmin && rawEditMode;

  const knownCategoryIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);

  const hasUncategorized = useMemo(
    () =>
      products.some((p) => {
        const cats = productCategories(p);
        return !cats.length || !cats.some((c) => knownCategoryIds.has(c));
      }),
    [products, knownCategoryIds],
  );

  const shelfOptions = useMemo(() => {
    const counts = new Map<number, number>();
    products.forEach((p) => {
      if (typeof p.shelfLifeHours !== 'number') return;
      counts.set(p.shelfLifeHours, (counts.get(p.shelfLifeHours) ?? 0) + 1);
    });
    const all = new Set<number>([...SHELF_STEPS, ...counts.keys()]);
    return [...all]
      .filter((hours) => (counts.get(hours) ?? 0) > 0)
      .sort((a, b) => a - b)
      .map((hours) => ({
        hours,
        label: shelfLabel(hours),
        count: counts.get(hours) ?? 0,
      }));
  }, [products]);

  const expiredCount = useMemo(
    () => products.filter((p) => expiredIds?.has(p.id)).length,
    [products, expiredIds],
  );

  const soonCount = useMemo(
    () => products.filter((p) => getStatus?.(p).soon).length,
    [products, getStatus],
  );

  useEffect(() => {
    if (onlyExpired && expiredCount === 0) setOnlyExpired(false);
  }, [onlyExpired, expiredCount]);

  useEffect(() => {
    if (onlySoon && soonCount === 0) setOnlySoon(false);
  }, [onlySoon, soonCount]);

  useEffect(() => {
    if (shelfFilter !== 'all' && !shelfOptions.some((o) => o.hours === shelfFilter)) {
      setShelfFilter('all');
    }
  }, [shelfFilter, shelfOptions]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => {
        if (onlyExpired && !expiredIds?.has(p.id)) return false;
        if (onlySoon && !getStatus?.(p).soon) return false;
        if (shelfFilter !== 'all' && p.shelfLifeHours !== shelfFilter) return false;
        const cats = productCategories(p);
        const byCat =
          active === 'all'
            ? true
            : active === UNCATEGORIZED
              ? !cats.length || !cats.some((c) => knownCategoryIds.has(c))
              : cats.includes(active);
        const byQuery = !q || p.name.toLowerCase().includes(q) || p.composition.toLowerCase().includes(q);
        return byCat && byQuery;
      })
      .sort((a, b) => {
        const rank = (p: Product) => {
          const st = getStatus?.(p);
          if (st?.expired) return 0;
          if (st?.soon) return 1;
          return 2;
        };
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        const sa = a.shelfLifeHours ?? Number.POSITIVE_INFINITY;
        const sb = b.shelfLifeHours ?? Number.POSITIVE_INFINITY;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, 'ru');
      });
  }, [
    query,
    active,
    products,
    onlyExpired,
    onlySoon,
    shelfFilter,
    expiredIds,
    getStatus,
    knownCategoryIds,
  ]);

  const tabsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    if (!keyboardOpen) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (searchRef.current?.contains(target)) return;
      if (target.closest('[data-virtual-keyboard]')) return;
      setKeyboardOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [keyboardOpen]);

  const handleSelect = useCallback(
    (product: Product) => {
      setKeyboardOpen(false);
      onSelect(product);
    },
    [onSelect],
  );

  const handlePrint = useCallback(
    (product: Product) => {
      setKeyboardOpen(false);
      onPrint(product);
    },
    [onPrint],
  );

  const scrollTabs = (dir: 1 | -1) =>
    tabsRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });

  const activeLabel =
    active === 'all'
      ? 'Все продукты'
      : active === UNCATEGORIZED
        ? 'Без категории'
        : (categories.find((c) => c.id === active)?.label ?? 'Категория');

  useEffect(() => {
    if (active === UNCATEGORIZED && !hasUncategorized) setActive('all');
  }, [active, hasUncategorized]);

  return (
    <section id="menu" className="print-hide border-t-2 border-primary bg-background">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            {editMode && (
              <h2 className="mt-3 font-head text-[34px] font-medium uppercase leading-[1.04] text-primary md:text-[52px]">
                Редактирование и добавление позиций
              </h2>
            )}
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
            <label
              ref={searchRef}
              className="flex w-full items-center gap-3 border-2 border-primary bg-card px-3 py-3 md:w-[340px]"
            >
              <Icon name="Search" size={20} className="text-primary" strokeWidth={2.5} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setKeyboardOpen(true)}
                onClick={() => setKeyboardOpen(true)}
                placeholder="Поиск по названию"
                className="w-full bg-transparent font-body text-[15px] text-primary outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery('');
                    setKeyboardOpen(false);
                  }}
                  aria-label="Очистить поиск"
                >
                  <Icon name="X" size={18} className="text-muted-foreground" />
                </button>
              )}
            </label>

            <button
              onClick={() => {
                if (!isAdmin) {
                  onRequestAdmin();
                  return;
                }
                setEditMode((v) => !v);
              }}
              className={`flex shrink-0 items-center justify-center gap-2 border-2 border-primary px-4 py-3 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors ${
                editMode
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-primary hover:bg-muted'
              }`}
            >
              <Icon
                name={editMode ? 'Check' : isAdmin ? 'SlidersHorizontal' : 'Lock'}
                size={16}
                strokeWidth={2.5}
              />
              {editMode ? 'Готово' : 'Редактировать'}
            </button>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => {
              setKeyboardOpen(false);
              onDefrost();
            }}
            className="flex items-center justify-center gap-3 border-2 border-primary bg-card px-6 py-4 font-head text-[0.95rem] font-medium uppercase tracking-[0.06em] text-primary transition-transform hover:-translate-y-0.5 hover:bg-muted"
          >
            <Icon name="Snowflake" size={20} strokeWidth={2.5} />
            Дефрост
          </button>

          <button
            onClick={() => {
              setKeyboardOpen(false);
              setOnlySoon(false);
              setOnlyExpired((v) => !v);
            }}
            disabled={!expiredCount && !onlyExpired}
            className={`flex items-center justify-center gap-3 border-2 px-6 py-4 font-head text-[0.95rem] font-medium uppercase tracking-[0.06em] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${
              onlyExpired
                ? 'border-destructive bg-destructive text-destructive-foreground'
                : 'border-destructive bg-card text-destructive'
            }`}
          >
            <Icon name={onlyExpired ? 'ListRestart' : 'AlarmClock'} size={20} strokeWidth={2.5} />
            {onlyExpired ? 'Показать все' : 'Только просроченные'}
            <span className="border-l-2 border-current pl-3 tabular-nums">{expiredCount}</span>
          </button>

          <button
            onClick={() => {
              setKeyboardOpen(false);
              setOnlyExpired(false);
              setOnlySoon((v) => !v);
            }}
            disabled={!soonCount && !onlySoon}
            className={`flex items-center justify-center gap-3 border-2 border-primary px-6 py-4 font-head text-[0.95rem] font-medium uppercase tracking-[0.06em] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${
              onlySoon ? 'bg-accent text-accent-foreground' : 'bg-card text-primary'
            }`}
          >
            <Icon name={onlySoon ? 'ListRestart' : 'Timer'} size={20} strokeWidth={2.5} />
            {onlySoon ? 'Показать все' : 'Скоро истекает'}
            <span className="border-l-2 border-current pl-3 tabular-nums">{soonCount}</span>
          </button>

          <button
            onClick={() => {
              setKeyboardOpen(false);
              onPrintBatch(
                visible,
                onlyExpired ? 'Просроченные' : onlySoon ? 'Скоро истекает' : activeLabel,
              );
            }}
            disabled={!visible.length}
            className="flex items-center justify-center gap-3 border-2 border-primary bg-accent px-6 py-4 font-head text-[0.95rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 md:text-[1.05rem]"
          >
            <Icon name="Printer" size={20} strokeWidth={2.5} />
            {onlyExpired
              ? 'Печатать просроченные'
              : onlySoon
                ? 'Печатать истекающие'
                : 'Печатать всю категорию'}
            <span className="border-l-2 border-accent-foreground/40 pl-3">{visible.length}</span>
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              onClick={() => scrollTabs(-1)}
              aria-label="Прокрутить категории влево"
              className="hidden h-[42px] w-[34px] shrink-0 items-center justify-center border-2 border-primary bg-card text-primary transition-colors hover:bg-accent hover:text-accent-foreground md:flex"
            >
              <Icon name="ChevronLeft" size={18} strokeWidth={2.5} />
            </button>

            <div
              ref={tabsRef}
              className="cat-scroll flex min-w-0 flex-1 gap-3 overflow-x-auto pb-2"
            >
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

        {editMode && (
          <CategoryEditor
            categories={categories}
            onAdd={onAddCategory}
            onRename={onRenameCategory}
            onRemove={onRemoveCategory}
            onReset={onResetCategories}
          />
        )}

        {visible.length === 0 ? (
          <div className="mt-12 border-2 border-dashed border-primary p-10 text-center">
            <p className="font-head text-lg uppercase text-primary">
              {onlyExpired ? 'Просроченных нет' : onlySoon ? 'Истекающих нет' : 'Ничего не нашли'}
            </p>
            <p className="mt-2 text-muted-foreground">
              {onlyExpired || onlySoon
                ? 'Все позиции в этой категории с действующим сроком'
                : 'Попробуйте другое название или категорию'}
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
            {visible.map((product, i) => (
              <div key={product.id} className="relative">
                <ProductCard
                  product={product}
                  index={i}
                  onSelect={handleSelect}
                  onPrint={handlePrint}
                  status={getStatus?.(product)}
                />
                {editMode && (
                  <div className="absolute right-1 top-1/2 flex -translate-y-1/2 flex-col gap-1">
                    <button
                      onClick={() => onEdit(product)}
                      aria-label="Изменить продукт"
                      className="flex h-9 w-9 items-center justify-center border-2 border-primary bg-background text-primary transition-colors hover:bg-accent"
                    >
                      <Icon name="Pencil" size={18} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => onDelete(product)}
                      aria-label="Удалить продукт"
                      className="flex h-9 w-9 items-center justify-center border-2 border-primary bg-background text-primary transition-colors hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Icon name="Trash2" size={18} strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <VirtualKeyboard
        open={keyboardOpen}
        value={query}
        onChange={setQuery}
        onClose={() => setKeyboardOpen(false)}
      />
      {keyboardOpen && <div className="h-[320px] md:h-[360px]" aria-hidden />}
    </section>
  );
};

export default MenuSection;
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CategoryEditor from '@/components/CategoryEditor';
import VirtualKeyboard from '@/components/VirtualKeyboard';
import MenuToolbar from '@/components/menu/MenuToolbar';
import MenuFilters from '@/components/menu/MenuFilters';
import MenuProductGrid from '@/components/menu/MenuProductGrid';
import { SHELF_STEPS, shelfLabel } from '@/components/menu/shelfOptions';
import { Category, CategoryId, Product, productCategories, UNCATEGORIZED } from '@/data/products';
import { UserPrefs } from '@/lib/catalogApi';
import { ExpiryStatus } from '@/hooks/usePrintHistory';

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
  prefs?: UserPrefs;
  onPrefsChange?: (prefs: UserPrefs) => void;
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
  prefs,
  onPrefsChange,
}: MenuSectionProps) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<CategoryId | 'all'>('all');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [rawEditMode, setEditMode] = useState(false);
  const [onlyExpired, setOnlyExpired] = useState(false);
  const [onlySoon, setOnlySoon] = useState(false);
  const [shelfFilter, setShelfFilter] = useState<number | 'all'>('all');
  const editMode = isAdmin && rawEditMode;

  const prefsLoaded = useRef(false);

  useEffect(() => {
    if (prefsLoaded.current || !prefs) return;
    prefsLoaded.current = true;
    if (prefs.activeCategory) setActive(prefs.activeCategory);
    if (prefs.shelfFilter !== undefined) setShelfFilter(prefs.shelfFilter);
    if (prefs.onlyExpired !== undefined) setOnlyExpired(prefs.onlyExpired);
    if (prefs.onlySoon !== undefined) setOnlySoon(prefs.onlySoon);
  }, [prefs]);

  useEffect(() => {
    if (!prefsLoaded.current || !onPrefsChange) return;
    const id = setTimeout(
      () => onPrefsChange({ activeCategory: active, shelfFilter, onlyExpired, onlySoon }),
      600,
    );
    return () => clearTimeout(id);
  }, [active, shelfFilter, onlyExpired, onlySoon, onPrefsChange]);

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
        <MenuToolbar
          searchRef={searchRef}
          query={query}
          setQuery={setQuery}
          setKeyboardOpen={setKeyboardOpen}
          editMode={editMode}
          isAdmin={isAdmin}
          onRequestAdmin={onRequestAdmin}
          setEditMode={setEditMode}
          onDefrost={onDefrost}
          onlyExpired={onlyExpired}
          setOnlyExpired={setOnlyExpired}
          onlySoon={onlySoon}
          setOnlySoon={setOnlySoon}
          expiredCount={expiredCount}
          soonCount={soonCount}
          visibleCount={visible.length}
          onPrintBatchClick={() => {
            setKeyboardOpen(false);
            onPrintBatch(
              visible,
              onlyExpired ? 'Просроченные' : onlySoon ? 'Скоро истекает' : activeLabel,
            );
          }}
        />

        <MenuFilters
          tabsRef={tabsRef}
          scrollTabs={scrollTabs}
          categories={categories}
          hasUncategorized={hasUncategorized}
          active={active}
          setActive={setActive}
          editMode={editMode}
          onAdd={onAdd}
          onSharedBase={onSharedBase}
          onExport={onExport}
          onImport={onImport}
          shelfFilter={shelfFilter}
          setShelfFilter={setShelfFilter}
          shelfOptions={shelfOptions}
        />

        {editMode && (
          <CategoryEditor
            categories={categories}
            onAdd={onAddCategory}
            onRename={onRenameCategory}
            onRemove={onRemoveCategory}
            onReset={onResetCategories}
          />
        )}

        <MenuProductGrid
          visible={visible}
          onlyExpired={onlyExpired}
          onlySoon={onlySoon}
          editMode={editMode}
          handleSelect={handleSelect}
          handlePrint={handlePrint}
          getStatus={getStatus}
          onEdit={onEdit}
          onDelete={onDelete}
        />
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

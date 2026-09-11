import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import ProductCard from '@/components/ProductCard';
import CategoryEditor from '@/components/CategoryEditor';
import { Category, CategoryId, Product } from '@/data/products';

interface MenuSectionProps {
  products: Product[];
  categories: Category[];
  onAddCategory: (label: string, icon: string) => void;
  onRenameCategory: (id: string, label: string) => void;
  onRemoveCategory: (category: Category) => void;
  onResetCategories: () => void;
  onSelect: (product: Product) => void;
  onPrint: (product: Product) => void;
  onAdd: () => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onReset: () => void;
  isAdmin: boolean;
  onRequestAdmin: () => void;
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
  onAdd,
  onEdit,
  onDelete,
  onReset,
  isAdmin,
  onRequestAdmin,
}: MenuSectionProps) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<CategoryId | 'all'>('all');
  const [rawEditMode, setEditMode] = useState(false);
  const editMode = isAdmin && rawEditMode;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const byCat = active === 'all' || p.category === active;
      const byQuery = !q || p.name.toLowerCase().includes(q) || p.composition.toLowerCase().includes(q);
      return byCat && byQuery;
    });
  }, [query, active, products]);

  return (
    <section id="menu" className="print-hide border-t-2 border-primary bg-background">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-block border-2 border-primary bg-primary px-2 py-1 font-head text-[0.7rem] font-medium uppercase tracking-[0.1em] text-primary-foreground">
              Терминал зала
            </span>
            {editMode && (
              <h2 className="mt-3 font-head text-[34px] font-medium uppercase leading-[1.04] text-primary md:text-[52px]">
                Редактируем каталог —<br className="hidden md:block" /> меняем цены и позиции
              </h2>
            )}
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

        <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {[{ id: 'all', label: 'Всё меню', icon: 'LayoutGrid' }, ...categories].map((cat) => {
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

          <div className="flex shrink-0 gap-3">
            <button
              onClick={() => {
                if (!isAdmin) {
                  onRequestAdmin();
                  return;
                }
                setEditMode((v) => !v);
              }}
              className={`flex items-center gap-2 border-2 border-primary px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors ${
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
            {editMode && (
              <button
                onClick={onAdd}
                className="flex items-center gap-2 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon name="Plus" size={16} strokeWidth={2.5} />
                Добавить
              </button>
            )}
          </div>
        </div>

        {editMode && (
          <div className="mt-4 flex flex-col gap-2 border-2 border-dashed border-primary p-3 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Нажмите на карандаш, чтобы изменить цену или название. Изменения сохраняются в этом
              терминале.
            </span>
            <button
              onClick={onReset}
              className="flex shrink-0 items-center gap-1.5 font-head text-[0.7rem] font-medium uppercase tracking-[0.06em] text-primary underline-offset-4 hover:underline"
            >
              <Icon name="RotateCcw" size={14} strokeWidth={2.5} />
              Вернуть исходный список
            </button>
          </div>
        )}

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
            <p className="font-head text-lg uppercase text-primary">Ничего не нашли</p>
            <p className="mt-2 text-muted-foreground">Попробуйте другое название или категорию</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
            {visible.map((product, i) => (
              <div key={product.id} className="relative">
                <ProductCard
                  product={product}
                  index={i}
                  onSelect={onSelect}
                  onPrint={onPrint}
                />
                {editMode && (
                  <div className="absolute right-1 top-1 flex gap-1">
                    <button
                      onClick={() => onEdit(product)}
                      aria-label="Изменить товар"
                      className="flex h-6 w-6 items-center justify-center border-2 border-primary bg-background text-primary transition-colors hover:bg-accent"
                    >
                      <Icon name="Pencil" size={11} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => onDelete(product)}
                      aria-label="Удалить товар"
                      className="flex h-6 w-6 items-center justify-center border-2 border-primary bg-background text-primary transition-colors hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Icon name="Trash2" size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default MenuSection;
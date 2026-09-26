import Icon from '@/components/ui/icon';
import ProductCard from '@/components/ProductCard';
import { Product } from '@/data/products';
import { ExpiryStatus } from '@/hooks/usePrintHistory';

interface MenuProductGridProps {
  visible: Product[];
  onlyExpired: boolean;
  onlySoon: boolean;
  editMode: boolean;
  handleSelect: (product: Product) => void;
  handlePrint: (product: Product) => void;
  getStatus?: (product: Product) => ExpiryStatus;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

const MenuProductGrid = ({
  visible,
  onlyExpired,
  onlySoon,
  editMode,
  handleSelect,
  handlePrint,
  getStatus,
  onEdit,
  onDelete,
}: MenuProductGridProps) => {
  if (visible.length === 0) {
    return (
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
    );
  }

  return (
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
  );
};

export default MenuProductGrid;

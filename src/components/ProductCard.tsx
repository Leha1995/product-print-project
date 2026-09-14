import { Product } from '@/data/products';
import { ExpiryStatus } from '@/hooks/usePrintHistory';

interface ProductCardProps {
  product: Product;
  index: number;
  onSelect: (product: Product) => void;
  onPrint: (product: Product) => void;
  status?: ExpiryStatus;
}

const ProductCard = ({ product, index, onSelect, onPrint, status }: ProductCardProps) => {
  const expired = status?.expired;
  const soon = status?.soon;

  const frame = expired
    ? 'border-destructive bg-destructive/10 shadow-[0_0_0_2px_hsl(var(--destructive))]'
    : soon
      ? 'border-warning bg-warning/15 shadow-[0_0_0_2px_hsl(var(--warning))]'
      : 'border-primary bg-card';

  const edge = expired ? 'border-destructive' : soon ? 'border-warning' : 'border-primary';
  const title = expired ? 'text-destructive' : soon ? 'text-warning-foreground' : 'text-primary';

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={`group flex animate-fade-in flex-col border-2 text-left transition-transform duration-150 hover:-translate-y-1 ${frame}`}
    >
      <button
        onClick={() => onPrint(product)}
        aria-label={`Печатать маркировку: ${product.name}`}
        className="relative aspect-square w-full overflow-hidden bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary active:opacity-80"
      >
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {product.shelfLifeHours !== undefined && (
          <span className="absolute right-0 top-1 border-2 border-r-0 border-primary bg-card px-1 py-px font-head text-[0.5rem] font-bold uppercase tracking-[0.06em] text-primary">
            {product.shelfLifeHours < 24
              ? `${product.shelfLifeHours} ч`
              : `${Math.round(product.shelfLifeHours / 24)} сут`}
          </span>
        )}
        {status?.label && (
          <span
            className={`absolute inset-x-0 bottom-0 border-t-2 px-1 py-0.5 text-center font-head text-[0.5rem] font-bold uppercase tracking-[0.06em] ${
              expired
                ? 'border-destructive bg-destructive text-destructive-foreground'
                : soon
                  ? 'border-warning bg-warning text-warning-foreground'
                  : 'border-primary bg-card text-primary'
            }`}
          >
            {expired ? status.label : `Осталось ${status.label}`}
          </span>
        )}
        {product.hit && !expired && !soon && (
          <span className="absolute left-0 top-1 border-2 border-l-0 border-primary bg-accent px-1 py-px font-head text-[0.5rem] font-bold uppercase tracking-[0.06em] text-accent-foreground">
            Хит
          </span>
        )}
      </button>

      <button
        onClick={() => onSelect(product)}
        className={`flex flex-1 items-center justify-center border-t-2 p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${edge}`}
      >
        <h3
          className={`line-clamp-2 text-center font-head text-[0.7rem] font-bold uppercase leading-tight ${title}`}
        >
          {product.name}
        </h3>
      </button>
    </div>
  );
};

export default ProductCard;

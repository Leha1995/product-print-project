import Icon from '@/components/ui/icon';
import { Product } from '@/data/products';

interface ProductCardProps {
  product: Product;
  index: number;
  onSelect: (product: Product) => void;
}

const ProductCard = ({ product, index, onSelect }: ProductCardProps) => {
  return (
    <button
      onClick={() => onSelect(product)}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className="group flex animate-fade-in flex-col border-2 border-primary bg-card text-left transition-transform duration-150 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-secondary">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {product.hit && (
          <span className="absolute left-0 top-1 border-2 border-l-0 border-primary bg-accent px-1 py-px font-head text-[0.5rem] font-bold uppercase tracking-[0.06em] text-accent-foreground">
            Хит
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-1 border-t-2 border-primary p-1.5">
        <h3 className="line-clamp-2 text-center font-head text-[0.65rem] font-bold uppercase leading-tight text-primary">
          {product.name}
        </h3>
        <Icon
          name="Printer"
          size={60}
          strokeWidth={2}
          className="mt-auto shrink-0 text-primary transition-transform duration-150 group-hover:scale-110"
        />
      </div>
    </button>
  );
};

export default ProductCard;
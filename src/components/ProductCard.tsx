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
          <span className="absolute left-0 top-3 border-2 border-l-0 border-primary bg-accent px-2 py-0.5 font-head text-[0.65rem] font-bold uppercase tracking-[0.08em] text-accent-foreground">
            Хит
          </span>
        )}
        <span className="absolute bottom-0 right-0 border-l-2 border-t-2 border-primary bg-background px-3 py-1 font-head text-lg font-black text-primary">
          {product.price} ₽
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t-2 border-primary p-3">
        <h3 className="font-head text-base font-bold uppercase leading-tight text-primary">
          {product.name}
        </h3>
        <p className="line-clamp-2 text-[13px] text-muted-foreground">{product.composition}</p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
            {product.weight}
          </span>
          <span className="flex items-center gap-1 border-2 border-primary bg-accent px-2 py-1 font-head text-[0.7rem] font-bold uppercase tracking-[0.06em] text-accent-foreground">
            <Icon name="Printer" size={14} strokeWidth={2.5} />
            Печать
          </span>
        </div>
      </div>
    </button>
  );
};

export default ProductCard;

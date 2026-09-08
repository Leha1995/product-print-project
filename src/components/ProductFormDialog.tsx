import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { CategoryId, Product, categories } from '@/data/products';

interface ProductFormDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (product: Product) => void;
}

const CATEGORY_IMG: Record<CategoryId, string> = {
  sushi:
    'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/cbab4a1a-834a-470d-91c8-8ebdd00c9168.jpg',
  pizza:
    'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/b0382c00-473e-4cf3-839b-83fb3871e7ae.jpg',
  drinks:
    'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/49154051-03a6-4ed5-87d0-181e5dda8ca5.jpg',
};

const emptyForm = {
  name: '',
  category: 'sushi' as CategoryId,
  price: '',
  weight: '',
  composition: '',
  image: '',
  barcode: '',
  hit: false,
};

const fieldClass =
  'w-full border-2 border-primary bg-card px-3 py-2 font-body text-[15px] text-primary outline-none placeholder:text-muted-foreground focus:bg-muted';
const labelClass =
  'font-head text-[0.7rem] font-medium uppercase tracking-[0.08em] text-primary';

const ProductFormDialog = ({ product, open, onOpenChange, onSave }: ProductFormDialogProps) => {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            category: product.category,
            price: String(product.price),
            weight: product.weight,
            composition: product.composition,
            image: product.image,
            barcode: product.barcode,
            hit: Boolean(product.hit),
          }
        : emptyForm,
    );
  }, [open, product]);

  const set = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('image', String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(form.price.replace(',', '.'));
    if (!form.name.trim() || Number.isNaN(price)) return;

    onSave({
      id: product?.id ?? `usr-${Date.now().toString(36)}`,
      name: form.name.trim(),
      category: form.category,
      price: Math.round(price),
      weight: form.weight.trim() || '—',
      composition: form.composition.trim() || 'Состав не указан',
      image: form.image.trim() || CATEGORY_IMG[form.category],
      barcode: form.barcode.trim() || String(4600000000000 + Math.floor(Math.random() * 999999)),
      hit: form.hit,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[620px] overflow-y-auto border-2 border-primary bg-background p-0">
        <form onSubmit={submit} className="p-5 md:p-6">
          <h3 className="font-head text-2xl font-bold uppercase leading-tight text-primary">
            {product ? 'Изменить товар' : 'Новый товар'}
          </h3>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Название, цена и состав попадут в ценник при печати
          </p>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5">
              <span className={labelClass}>Название</span>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Филадельфия классик"
                required
                className={fieldClass}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className={labelClass}>Цена, ₽</span>
                <input
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                  inputMode="decimal"
                  placeholder="489"
                  required
                  className={fieldClass}
                />
              </label>
              <label className="grid gap-1.5">
                <span className={labelClass}>Категория</span>
                <select
                  value={form.category}
                  onChange={(e) => set('category', e.target.value as CategoryId)}
                  className={fieldClass}
                >
                  {categories
                    .filter((c) => c.id !== 'all')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className={labelClass}>Вес / объём</span>
                <input
                  value={form.weight}
                  onChange={(e) => set('weight', e.target.value)}
                  placeholder="260 г"
                  className={fieldClass}
                />
              </label>
              <label className="grid gap-1.5">
                <span className={labelClass}>Штрих-код</span>
                <input
                  value={form.barcode}
                  onChange={(e) => set('barcode', e.target.value)}
                  placeholder="4600001000018"
                  className={fieldClass}
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className={labelClass}>Состав</span>
              <textarea
                value={form.composition}
                onChange={(e) => set('composition', e.target.value)}
                rows={2}
                placeholder="Лосось, сыр творожный, огурец, рис, нори"
                className={`${fieldClass} resize-none`}
              />
            </label>

            <div className="grid gap-1.5">
              <span className={labelClass}>Фото</span>
              <div className="flex items-center gap-3">
                <div className="h-[64px] w-[64px] shrink-0 overflow-hidden border-2 border-primary bg-muted">
                  <img
                    src={form.image || CATEGORY_IMG[form.category]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 border-2 border-primary bg-card px-3 py-2 font-head text-[0.75rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-accent">
                  <Icon name="Upload" size={16} strokeWidth={2.5} />
                  Загрузить фото
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            <label className="flex items-center gap-3 border-2 border-primary p-3">
              <input
                type="checkbox"
                checked={form.hit}
                onChange={(e) => set('hit', e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className={labelClass}>Отметить как «Хит»</span>
            </label>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-2 border-primary bg-card px-4 py-3 font-head text-[0.85rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex flex-[1.4] items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.9rem] font-medium uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              <Icon name="Check" size={18} strokeWidth={2.5} />
              Сохранить
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProductFormDialog;

import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Category, CategoryId, Product, productCategories } from '@/data/products';

interface ProductFormDialogProps {
  product: Product | null;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (product: Product) => void;
}

const DEFAULT_IMG =
  'https://cdn.poehali.dev/projects/3ae3beb2-6f64-4c04-99be-0b8f386617e0/files/cbab4a1a-834a-470d-91c8-8ebdd00c9168.jpg';

const CATEGORY_IMG: Record<string, string> = {
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
  categories: [] as CategoryId[],
  price: '',
  weight: '',
  composition: '',
  image: '',
  barcode: '',
  shelfLifeHours: '',
  hit: false,
};

const fieldClass =
  'w-full border-2 border-primary bg-card px-3 py-2 font-body text-[15px] text-primary outline-none placeholder:text-muted-foreground focus:bg-muted';
const labelClass =
  'font-head text-[0.7rem] font-medium uppercase tracking-[0.08em] text-primary';

const ProductFormDialog = ({
  product,
  categories,
  open,
  onOpenChange,
  onSave,
}: ProductFormDialogProps) => {
  const [form, setForm] = useState(emptyForm);
  const fallbackImg = (cat: CategoryId) => CATEGORY_IMG[cat] ?? DEFAULT_IMG;

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            category: product.category,
            categories: productCategories(product),
            price: String(product.price),
            weight: product.weight,
            composition: product.composition,
            image: product.image,
            barcode: product.barcode,
            shelfLifeHours: product.shelfLifeHours ? String(product.shelfLifeHours) : '',
            hit: Boolean(product.hit),
          }
        : {
            ...emptyForm,
            category: categories[0]?.id ?? 'sushi',
            categories: [categories[0]?.id ?? 'sushi'],
          },
    );
  }, [open, product, categories]);

  const set = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleCategory = (id: CategoryId) =>
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(id)
        ? prev.categories.filter((c) => c !== id)
        : [...prev.categories, id],
    }));

  const handleFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 420;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          set('image', String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        set('image', canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => set('image', String(reader.result));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const price = Number(form.price.replace(',', '.'));
    if (!form.name.trim() || Number.isNaN(price)) return;

    const picked = form.categories.length ? form.categories : [form.category];

    onSave({
      id:
        product?.id ??
        `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: form.name.trim(),
      category: picked[0],
      categories: picked,
      price: Math.round(price),
      weight: form.weight.trim() || '—',
      composition: form.composition.trim() || 'Состав не указан',
      image: form.image.trim() || fallbackImg(picked[0]),
      barcode: form.barcode.trim() || String(4600000000000 + Math.floor(Math.random() * 999999)),
      shelfLifeHours: form.shelfLifeHours ? Number(form.shelfLifeHours) : undefined,
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
            Название, цена и состав попадут в маркировку при печати
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

            <div className="grid gap-1.5">
              <span className={labelClass}>Категории — можно выбрать несколько</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const on = form.categories.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(c.id)}
                      className={`flex items-center gap-1.5 border-2 border-primary px-3 py-1.5 font-head text-[0.7rem] font-medium uppercase tracking-[0.06em] transition-colors ${
                        on
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon name={on ? 'Check' : 'Plus'} size={14} strokeWidth={3} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
              {!form.categories.length && (
                <span className="text-[12px] text-muted-foreground">
                  Выберите хотя бы одну категорию
                </span>
              )}
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
              <span className={labelClass}>Срок хранения, часов</span>
              <input
                value={form.shelfLifeHours}
                onChange={(e) => set('shelfLifeHours', e.target.value)}
                inputMode="numeric"
                placeholder="Оставьте пустым — возьмём общий срок"
                className={fieldClass}
              />
            </label>

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
                    src={form.image || fallbackImg(form.categories[0] ?? form.category)}
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
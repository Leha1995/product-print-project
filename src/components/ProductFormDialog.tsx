import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Category, CategoryId, Product, productCategories, storagePresets } from '@/data/products';
import { hasOwnPhoto, productImage } from '@/lib/productImage';

interface ProductFormDialogProps {
  product: Product | null;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (product: Product) => void;
}

const emptyForm = {
  name: '',
  category: 'sushi' as CategoryId,
  categories: [] as CategoryId[],
  weight: '',
  composition: '',
  image: '',
  barcode: '',
  shelfLifeHours: '',
  storageText: storagePresets[0],
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

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            category: product.category,
            categories: productCategories(product),
            weight: product.weight,
            composition: product.composition,
            image: hasOwnPhoto(product.image) ? product.image : '',
            barcode: product.barcode,
            shelfLifeHours: product.shelfLifeHours ? String(product.shelfLifeHours) : '',
            storageText: product.storageText || storagePresets[0],
            hit: Boolean(product.hit),
          }
        : { ...emptyForm },
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
    reader.onload = () => set('image', String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const picked = form.categories;

    onSave({
      id: product?.id ?? `usr-${Date.now().toString(36)}`,
      name: form.name.trim(),
      category: picked[0] ?? '',
      categories: picked,
      weight: form.weight.trim() || '—',
      composition: form.composition.trim() || 'Состав не указан',
      image: form.image.trim(),
      barcode: form.barcode.trim() || String(4600000000000 + Math.floor(Math.random() * 999999)),
      shelfLifeHours: form.shelfLifeHours ? Number(form.shelfLifeHours) : undefined,
      storageText: form.storageText.trim() || undefined,
      hit: form.hit,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[620px] overflow-y-auto border-2 border-primary bg-background p-0">
        <form onSubmit={submit} className="p-5 md:p-6">
          <h3 className="font-head text-2xl font-bold uppercase leading-tight text-primary">
            {product ? 'Изменить продукт' : 'Новый продукт'}
          </h3>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Название, срок и температура хранения попадут в маркировку при печати
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
                  Без категории — продукт попадёт в фильтр «Без категории»
                </span>
              )}
            </div>

            <label className="grid gap-1.5">
              <span className={labelClass}>Штрих-код</span>
              <input
                value={form.barcode}
                onChange={(e) => set('barcode', e.target.value)}
                placeholder="4600001000018"
                className={fieldClass}
              />
            </label>

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

            <div className="grid gap-1.5">
              <span className={labelClass}>Температура хранения</span>
              <input
                value={form.storageText}
                onChange={(e) => set('storageText', e.target.value)}
                placeholder="Хранить при +2…+4 °C"
                className={fieldClass}
              />
              <div className="flex flex-wrap gap-2">
                {storagePresets.map((t) => {
                  const on = form.storageText === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set('storageText', t)}
                      className={`flex items-center gap-1.5 border-2 border-primary px-2.5 py-1.5 text-[12px] transition-colors ${
                        on
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon name="Thermometer" size={13} strokeWidth={2.5} />
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className={labelClass}>Фото</span>
              <div className="flex items-center gap-3">
                <div className="h-[64px] w-[64px] shrink-0 overflow-hidden border-2 border-primary bg-muted">
                  <img
                    src={productImage(form.image)}
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
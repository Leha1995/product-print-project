import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { Category } from '@/data/products';

interface CategoryEditorProps {
  categories: Category[];
  onAdd: (label: string, icon: string) => void;
  onRename: (id: string, label: string) => void;
  onRemove: (category: Category) => void;
  onReset: () => void;
}

const iconChoices: { name: string; title: string }[] = [
  { name: 'Utensils', title: 'Блюда' },
  { name: 'Fish', title: 'Рыба' },
  { name: 'Pizza', title: 'Пицца' },
  { name: 'CupSoda', title: 'Напитки' },
  { name: 'Salad', title: 'Салаты' },
  { name: 'Soup', title: 'Супы' },
  { name: 'Cake', title: 'Торты' },
  { name: 'Coffee', title: 'Кофе' },
  { name: 'Beef', title: 'Мясо' },
  { name: 'Sandwich', title: 'Бутерброды' },
  { name: 'IceCream', title: 'Мороженое' },
  { name: 'Croissant', title: 'Выпечка' },
];

const fieldClass =
  'w-full border-2 border-primary bg-card px-3 py-2 font-body text-[15px] text-primary outline-none placeholder:text-muted-foreground focus:bg-muted';

const CategoryEditor = ({
  categories,
  onAdd,
  onRename,
  onRemove,
  onReset,
}: CategoryEditorProps) => {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('Utensils');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    onAdd(label, icon);
    setLabel('');
    setIcon('Utensils');
  };

  return (
    <div className="mt-4 border-2 border-dashed border-primary p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-head text-[0.75rem] font-medium uppercase tracking-[0.08em] text-primary">
          Категории меню
        </span>
        <button
          onClick={onReset}
          className="flex shrink-0 items-center gap-1.5 font-head text-[0.7rem] font-medium uppercase tracking-[0.06em] text-primary underline-offset-4 hover:underline"
        >
          <Icon name="RotateCcw" size={14} strokeWidth={2.5} />
          Сбросить
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-2 border-2 border-primary bg-card px-2 py-1.5"
          >
            <Icon name={cat.icon} size={16} strokeWidth={2.5} className="shrink-0 text-primary" />
            {editingId === cat.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  onRename(cat.id, editValue);
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRename(cat.id, editValue);
                    setEditingId(null);
                  }
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="w-[120px] bg-transparent font-head text-[0.8rem] uppercase text-primary outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setEditingId(cat.id);
                  setEditValue(cat.label);
                }}
                className="font-head text-[0.8rem] font-medium uppercase tracking-[0.04em] text-primary"
              >
                {cat.label}
              </button>
            )}
            <button
              onClick={() => onRemove(cat)}
              aria-label={`Удалить категорию ${cat.label}`}
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <Icon name="X" size={14} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Название категории, например «Салаты»"
            className={fieldClass}
          />
          <button
            type="submit"
            className="flex shrink-0 items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            <Icon name="Plus" size={16} strokeWidth={2.5} />
            Добавить
          </button>
        </div>

        <div>
          <span className="font-head text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Значок категории
          </span>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {iconChoices.map((choice) => {
              const active = icon === choice.name;
              return (
                <button
                  key={choice.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setIcon(choice.name)}
                  className={`flex flex-col items-center gap-1 border-2 border-primary px-2 py-2 transition-transform hover:-translate-y-0.5 ${
                    active ? 'bg-accent text-accent-foreground' : 'bg-card text-primary'
                  }`}
                >
                  <Icon name={choice.name} size={20} strokeWidth={2.5} />
                  <span className="font-head text-[0.65rem] font-medium uppercase tracking-[0.04em]">
                    {choice.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </div>
  );
};

export default CategoryEditor;
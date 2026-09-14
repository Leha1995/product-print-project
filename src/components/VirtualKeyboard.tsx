import { useState } from 'react';
import Icon from '@/components/ui/icon';

interface VirtualKeyboardProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const ruRows = [
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
  ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
  ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю'],
];

const enRows = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const keyClass =
  'flex h-12 min-w-[38px] flex-1 items-center justify-center border-2 border-primary bg-card font-head text-[16px] uppercase text-primary transition-colors active:bg-primary active:text-primary-foreground md:h-14 md:text-[18px]';

const VirtualKeyboard = ({ open, value, onChange, onClose }: VirtualKeyboardProps) => {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');

  if (!open) return null;

  const rows = lang === 'ru' ? ruRows : enRows;
  const press = (char: string) => onChange(value + char);

  return (
    <div data-virtual-keyboard className="print-hide fixed inset-x-0 bottom-0 z-50 border-t-2 border-primary bg-background p-3 shadow-[0_-8px_0_0_rgba(0,0,0,0.08)]">
      <div className="mx-auto w-full max-w-[900px]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate border-2 border-primary bg-card px-3 py-1.5 font-body text-[15px] text-primary">
            {value || 'Поиск по названию'}
          </span>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
            className="flex shrink-0 items-center gap-1.5 border-2 border-primary bg-card px-3 py-1.5 font-head text-[0.7rem] font-medium uppercase tracking-[0.06em] text-primary hover:bg-muted"
          >
            <Icon name="ChevronDown" size={16} strokeWidth={2.5} />
            Скрыть
          </button>
        </div>

        <div className="grid gap-1.5" onMouseDown={(e) => e.preventDefault()}>
          <div className="flex gap-1.5">
            {digits.map((d) => (
              <button key={d} className={keyClass} onClick={() => press(d)}>
                {d}
              </button>
            ))}
          </div>

          {rows.map((row, i) => (
            <div key={i} className="flex gap-1.5">
              {row.map((k) => (
                <button key={k} className={keyClass} onClick={() => press(k)}>
                  {k}
                </button>
              ))}
            </div>
          ))}

          <div className="flex gap-1.5">
            <button
              className={`${keyClass} max-w-[110px] bg-muted`}
              onClick={() => setLang((l) => (l === 'ru' ? 'en' : 'ru'))}
            >
              {lang === 'ru' ? 'ENG' : 'РУС'}
            </button>
            <button className={`${keyClass} flex-[3]`} onClick={() => press(' ')}>
              Пробел
            </button>
            <button
              className={`${keyClass} max-w-[110px] bg-muted`}
              onClick={() => onChange(value.slice(0, -1))}
            >
              <Icon name="Delete" size={20} strokeWidth={2.5} />
            </button>
            <button
              className={`${keyClass} max-w-[110px] bg-muted`}
              onClick={() => onChange('')}
            >
              <Icon name="X" size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VirtualKeyboard;
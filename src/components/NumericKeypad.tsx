import Icon from '@/components/ui/icon';

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  maxLength?: number;
}

const keyClass =
  'flex h-14 items-center justify-center border-2 border-primary bg-card font-head text-[22px] text-primary transition-colors active:bg-primary active:text-primary-foreground';

const NumericKeypad = ({ value, onChange, onSubmit, maxLength = 12 }: NumericKeypadProps) => {
  const press = (d: string) => {
    if (value.length >= maxLength) return;
    onChange(value + d);
  };

  return (
    <div className="grid grid-cols-3 gap-2" onMouseDown={(e) => e.preventDefault()}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" className={keyClass} onClick={() => press(d)}>
          {d}
        </button>
      ))}
      <button
        type="button"
        className={`${keyClass} bg-muted`}
        onClick={() => onChange('')}
        aria-label="Очистить"
      >
        <Icon name="X" size={20} strokeWidth={2.5} />
      </button>
      <button type="button" className={keyClass} onClick={() => press('0')}>
        0
      </button>
      <button
        type="button"
        className={`${keyClass} bg-muted`}
        onClick={() => onChange(value.slice(0, -1))}
        aria-label="Удалить символ"
      >
        <Icon name="Delete" size={20} strokeWidth={2.5} />
      </button>
      {onSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          className="col-span-3 flex h-14 items-center justify-center gap-2 border-2 border-primary bg-accent font-head text-[0.9rem] font-medium uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5"
        >
          <Icon name="LogIn" size={18} strokeWidth={2.5} />
          Войти
        </button>
      )}
    </div>
  );
};

export default NumericKeypad;

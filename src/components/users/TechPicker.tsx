import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Icon from '@/components/ui/icon';
import { ManagedUser } from '@/lib/authApi';

interface TechPickerProps {
  technicians: ManagedUser[];
  value: number[];
  onChange: (ids: number[]) => void;
  className?: string;
}

const nameOf = (u: ManagedUser) => u.fullName || u.username;

const TechPicker = ({ technicians, value, onChange, className = '' }: TechPickerProps) => {
  const picked = technicians.filter((t) => value.includes(t.id));
  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const label = !picked.length
    ? 'никого'
    : picked.length <= 2
      ? picked.map(nameOf).join(', ')
      : `${picked.length}: ${picked.slice(0, 2).map(nameOf).join(', ')}…`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center justify-between gap-2 border-2 border-primary bg-background px-3 py-2 text-left font-body text-[14px] text-primary outline-none ${className}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="Wrench" size={15} strokeWidth={2.5} className="shrink-0" />
            <span className="truncate">{`Техники: ${label}`}</span>
          </span>
          <Icon name="ChevronDown" size={15} strokeWidth={2.5} className="shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] max-w-[92vw] border-2 border-primary bg-card p-0">
        <div className="max-h-[320px] overflow-y-auto py-1">
          {technicians.map((t) => {
            const on = value.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 border-primary ${
                    on ? 'bg-primary text-primary-foreground' : 'bg-background'
                  }`}
                >
                  {on && <Icon name="Check" size={13} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-primary">{nameOf(t)}</span>
                {!t.active && <span className="text-[11px] text-destructive">отключён</span>}
              </button>
            );
          })}
          {!technicians.length && <p className="px-3 py-4 text-[13px] text-muted-foreground">Техников пока нет</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TechPicker;

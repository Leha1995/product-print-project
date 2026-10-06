import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Icon from '@/components/ui/icon';
import { ManagedUser } from '@/lib/authApi';

interface TechScopePickerProps {
  heads: ManagedUser[];
  value: number[];
  onChange: (ids: number[]) => void;
  className?: string;
  adminsOnly?: boolean;
}

const nameOf = (u: ManagedUser) => u.fullName || u.username;

const TechScopePicker = ({ heads, value, onChange, className = '', adminsOnly = false }: TechScopePickerProps) => {
  const managers = adminsOnly ? [] : heads.filter((h) => h.role === 'manager');
  const admins = heads.filter((h) => h.role === 'admin');
  const picked = heads.filter((h) => value.includes(h.id));

  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const label = !picked.length
    ? adminsOnly
      ? 'никого'
      : 'Все точки'
    : picked.length <= 2
      ? picked.map(nameOf).join(', ')
      : `${picked.length} привязки: ${picked.slice(0, 2).map(nameOf).join(', ')}…`;

  const group = (title: string, list: ManagedUser[], hint: string) =>
    list.length > 0 && (
      <div className="py-1">
        <p className="px-3 pb-1 pt-2 font-head text-[0.62rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          {title}
        </p>
        {list.map((h) => {
          const on = value.includes(h.id);
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => toggle(h.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 border-primary ${
                  on ? 'bg-primary text-primary-foreground' : 'bg-background'
                }`}
              >
                {on && <Icon name="Check" size={13} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-primary">{nameOf(h)}</span>
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center justify-between gap-2 border-2 border-primary bg-background px-3 py-2 text-left font-body text-[14px] text-primary outline-none ${className}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="MapPin" size={15} strokeWidth={2.5} className="shrink-0" />
            <span className="truncate">{`${adminsOnly ? 'Админы' : 'Обслуживает'}: ${label}`}</span>
          </span>
          <Icon name="ChevronDown" size={15} strokeWidth={2.5} className="shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] max-w-[92vw] border-2 border-primary bg-card p-0">
        <div className="max-h-[320px] overflow-y-auto">
          {!adminsOnly && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2.5 border-b-2 border-primary px-3 py-2.5 text-left transition-colors hover:bg-muted"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 border-primary ${
                value.length ? 'bg-background' : 'bg-primary text-primary-foreground'
              }`}
            >
              {!value.length && <Icon name="Check" size={13} strokeWidth={3} />}
            </span>
            <span className="font-head text-[0.75rem] font-bold uppercase text-primary">Все точки</span>
          </button>
          )}
          {group('Управляющие', managers, 'все точки этого управляющего')}
          {group('Точки (админы)', admins, 'только эта точка')}
          {!(adminsOnly ? admins.length : heads.length) && (
            <p className="px-3 py-4 text-[13px] text-muted-foreground">
              {adminsOnly ? 'Нет админов' : 'Нет управляющих и админов'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TechScopePicker;

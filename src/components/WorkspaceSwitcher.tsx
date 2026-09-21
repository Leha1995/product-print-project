import Icon from '@/components/ui/icon';
import { ManagedTarget } from '@/lib/authApi';

interface WorkspaceSwitcherProps {
  managed: ManagedTarget[];
  currentId: number;
  targetId: number;
  onChange: (id: number) => void;
}

const roleShort: Record<string, string> = {
  user: 'Сотрудник',
  admin: 'Админ',
  superadmin: 'Супер-админ',
};

const WorkspaceSwitcher = ({
  managed,
  currentId,
  targetId,
  onChange,
}: WorkspaceSwitcherProps) => {
  if (managed.length < 2) return null;

  const viewing = managed.find((m) => m.id === targetId);
  const foreign = targetId !== currentId;

  return (
    <div
      className={`print-hide border-b-2 border-primary px-4 py-3 md:px-8 ${
        foreign ? 'bg-accent' : 'bg-card'
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3">
        <span
          className={`flex items-center gap-2 font-head text-[0.75rem] font-bold uppercase tracking-[0.08em] ${
            foreign ? 'text-accent-foreground' : 'text-primary'
          }`}
        >
          <Icon name="UserCog" size={18} strokeWidth={2.5} />
          Каталог сотрудника
        </span>

        <select
          value={targetId}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-[220px] border-2 border-primary bg-background px-3 py-2 font-body text-[14px] text-primary outline-none"
        >
          {managed.map((m) => (
            <option key={m.id} value={m.id}>
              {(m.fullName || m.username) + (m.id === currentId ? ' — мой' : '')} ·{' '}
              {roleShort[m.role] || m.role}
            </option>
          ))}
        </select>

        {foreign && (
          <>
            <span className="font-head text-[0.7rem] font-bold uppercase tracking-[0.06em] text-accent-foreground">
              Изменения сохранятся в каталог «{viewing?.fullName || viewing?.username}»
            </span>
            <button
              onClick={() => onChange(currentId)}
              className="ml-auto flex items-center gap-2 border-2 border-primary bg-background px-3 py-2 font-head text-[0.7rem] font-bold uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
            >
              <Icon name="Undo2" size={15} strokeWidth={2.5} />
              Вернуться к своему
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkspaceSwitcher;

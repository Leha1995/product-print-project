import Icon from '@/components/ui/icon';
import { ManagedTarget } from '@/lib/authApi';
import WorkspaceTreePicker from '@/components/WorkspaceTreePicker';

interface WorkspaceSwitcherProps {
  managed: ManagedTarget[];
  currentId: number;
  targetId: number;
  onChange: (id: number | null) => void;
  label?: string;
  minCount?: number;
  placeholder?: string;
  allowEmpty?: boolean;
  viewingName?: string;
}

const roleShort: Record<string, string> = {
  user: 'Сотрудник',
  admin: 'Админ',
  manager: 'Управляющий',
  superadmin: 'Супер-админ',
  technician: 'Техник',
};

const WorkspaceSwitcher = ({
  managed,
  currentId,
  targetId,
  onChange,
  label = 'Каталог сотрудника',
  minCount = 2,
  placeholder,
  allowEmpty = false,
  viewingName,
}: WorkspaceSwitcherProps) => {
  if (managed.length < minCount) return null;

  const picked = allowEmpty ? Boolean(viewingName) : true;
  const viewing = managed.find((m) => m.id === targetId);
  const self = managed.some((m) => m.id === currentId);
  const foreign = allowEmpty ? picked : self && targetId !== currentId;

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
          {label}
        </span>

        <WorkspaceTreePicker
          managed={managed}
          currentId={currentId}
          value={allowEmpty && !picked ? null : targetId}
          onChange={onChange}
          roleShort={roleShort}
          placeholder={placeholder}
          allowEmpty={allowEmpty}
        />

        {foreign && (
          <>
            <span className="font-head text-[0.7rem] font-bold uppercase tracking-[0.06em] text-accent-foreground">
              {allowEmpty
                ? `Смотришь маркировку «${viewingName}»`
                : `Изменения сохранятся в каталог «${viewing?.fullName || viewing?.username}»`}
            </span>
            <button
              onClick={() => onChange(allowEmpty ? null : currentId)}
              className="ml-auto flex items-center gap-2 border-2 border-primary bg-background px-3 py-2 font-head text-[0.7rem] font-bold uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
            >
              <Icon name="Undo2" size={15} strokeWidth={2.5} />
              {allowEmpty ? 'К оборудованию' : 'Вернуться к своему'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkspaceSwitcher;
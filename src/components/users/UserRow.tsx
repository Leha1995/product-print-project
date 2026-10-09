import Icon from '@/components/ui/icon';
import { ManagedUser, Role, StructureRef, apiUpdateUser } from '@/lib/authApi';
import TechScopePicker from '@/components/users/TechScopePicker';
import TechPicker from '@/components/users/TechPicker';
import { accessInfo, roleLabel, toneClass } from '@/components/users/userUi';

interface UserRowProps {
  u: ManagedUser;
  depth: number;
  ancestors: number[];
  adminCount: number;
  staffCount: number;
  collapsed: number[];
  toggleGroup: (id: number) => void;
  treeMode: boolean;
  isSuperAdmin: boolean;
  readOnly: boolean;
  currentId?: number;
  structures: StructureRef[];
  users: ManagedUser[];
  scopeHeads: ManagedUser[];
  allTechs: ManagedUser[];
  admins: ManagedUser[];
  managers: ManagedUser[];
  patch: (payload: Parameters<typeof apiUpdateUser>[0], msg: string) => void;
  onViewTechnician?: (id: number, name: string) => void;
  onPrinter: (u: ManagedUser) => void;
  onEdit: (u: ManagedUser) => void;
  onRemove: (u: ManagedUser) => void;
}

const UserRow = ({
  u,
  depth,
  ancestors,
  adminCount,
  staffCount,
  collapsed,
  toggleGroup,
  treeMode,
  isSuperAdmin,
  readOnly,
  currentId,
  structures,
  users,
  scopeHeads,
  allTechs,
  admins,
  managers,
  patch,
  onViewTechnician,
  onPrinter,
  onEdit,
  onRemove,
}: UserRowProps) => {
  const isGroup = adminCount + staffCount > 0;
  const isCollapsed = collapsed.includes(u.id);
  const hiddenRow = ancestors.some((id) => collapsed.includes(id));
  return (
    <div
      hidden={hiddenRow}
      className={`flex flex-wrap items-center gap-2 border-2 border-primary px-3 py-2 ${
        u.role === 'manager' && treeMode ? 'bg-muted' : 'bg-card'
      } ${depth === 1 ? 'ml-4 border-l-8 md:ml-8' : ''} ${
        depth >= 2 ? 'ml-8 border-l-8 md:ml-16' : ''
      } ${hiddenRow ? 'hidden' : ''}`}
    >
      {depth > 0 && (
        <Icon
          name="CornerDownRight"
          size={16}
          strokeWidth={2.5}
          className="shrink-0 text-muted-foreground"
        />
      )}
      {isGroup && (
        <button
          onClick={() => toggleGroup(u.id)}
          aria-label={isCollapsed ? 'Развернуть ветку' : 'Свернуть ветку'}
          className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-primary bg-background text-primary transition-colors hover:bg-muted"
        >
          <Icon
            name={isCollapsed ? 'ChevronRight' : 'ChevronDown'}
            size={16}
            strokeWidth={2.5}
          />
        </button>
      )}
      <div
        className={`min-w-0 flex-1 ${isGroup ? 'cursor-pointer' : ''}`}
        onClick={isGroup ? () => toggleGroup(u.id) : undefined}
      >
        <p className="truncate font-head text-[0.85rem] font-bold uppercase text-primary">
          {u.username}
          {!u.active && <span className="ml-2 text-destructive">(отключён)</span>}
          {isGroup && (
            <span className="ml-2 text-[11px] font-bold text-muted-foreground">
              {`·${adminCount ? ` админов: ${adminCount} ·` : ''} сотрудников: ${staffCount}${
                isCollapsed ? ' (свёрнуто)' : ''
              }`}
            </span>
          )}
        </p>
        {isSuperAdmin && structures.length > 0 && (u.role === 'technician' || u.role === 'superadmin') && (
          <p className="truncate text-[11px] font-semibold text-muted-foreground">Вне структур · видит все</p>
        )}
        {isSuperAdmin && structures.length > 1 && u.role !== 'superadmin' && u.role !== 'technician' && (
          <p className="truncate text-[11px] font-semibold text-primary">
            {(u.structureIds || []).length
              ? `Структуры: ${(u.structureIds || [])
                  .map((sid) => structures.find((x) => x.id === sid)?.name)
                  .filter(Boolean)
                  .join(', ')}`
              : 'Без структуры'}
          </p>
        )}
        <p className="truncate text-[12px] text-muted-foreground">
          {`${u.fullName || '—'} · ${roleLabel[u.role]}${
            u.managerId && depth === 0
              ? ` · руководитель: ${
                  users.find((a) => a.id === u.managerId)?.fullName ||
                  users.find((a) => a.id === u.managerId)?.username ||
                  '—'
                }`
              : ''
          }${
            u.role === 'technician' || u.role === 'accountant'
              ? ` · ${
                  u.scopeIds?.length
                    ? u.scopeIds
                        .map((id) => {
                          const h = users.find((x) => x.id === id);
                          return h ? h.fullName || h.username : null;
                        })
                        .filter(Boolean)
                        .join(', ')
                    : u.role === 'accountant'
                      ? 'админы не закреплены'
                      : 'все точки'
                }`
              : ''
          }`}
        </p>
        {u.role !== 'superadmin' && u.role !== 'technician' && u.role !== 'accountant' && (
          <p
            className={`truncate text-[12px] font-bold ${toneClass[accessInfo(u.accessUntil, !u.accessOwn).tone]}`}
          >
            {accessInfo(u.accessUntil, !u.accessOwn).text}
          </p>
        )}
      </div>
      {isSuperAdmin && (
        <select
          value={u.role}
          disabled={u.id === currentId}
          onChange={(e) =>
            patch({ id: u.id, role: e.target.value as Role }, 'Роль обновлена')
          }
          className="border-2 border-primary bg-background px-2 py-1 font-body text-[13px] text-primary outline-none disabled:opacity-50"
        >
          <option value="user">Сотрудник</option>
          <option value="admin">Админ</option>
          <option value="manager">Управляющий</option>
          <option value="technician">Техник</option>
          <option value="accountant">Бухгалтер</option>
          <option value="superadmin">Супер-админ</option>
        </select>
      )}
      {isSuperAdmin && u.role === 'technician' && onViewTechnician && (
        <button
          type="button"
          onClick={() => onViewTechnician(u.id, u.fullName || u.username)}
          className="flex items-center gap-1.5 border-2 border-primary bg-accent px-2 py-1 font-head text-[0.68rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
        >
          <Icon name="Eye" size={14} strokeWidth={2.5} />
          Кабинет
        </button>
      )}
      {isSuperAdmin && (u.role === 'technician' || u.role === 'accountant') && (
        <TechScopePicker
          heads={scopeHeads}
          value={u.scopeIds || []}
          adminsOnly={u.role === 'accountant'}
          onChange={(ids) =>
            patch(
              { id: u.id, scopeIds: ids },
              u.role === 'accountant' ? 'Админы бухгалтера обновлены' : 'Точки техника обновлены',
            )
          }
          className="max-w-[260px] py-1 text-[13px]"
        />
      )}
      {isSuperAdmin && u.role === 'accountant' && (
        <TechPicker
          technicians={allTechs}
          value={u.techIds || []}
          onChange={(ids) => patch({ id: u.id, techIds: ids }, 'Техники бухгалтера обновлены')}
          className="max-w-[260px] py-1 text-[13px]"
        />
      )}
      {isSuperAdmin && u.role === 'user' && (
        <select
          value={u.managerId ?? ''}
          onChange={(e) =>
            patch(
              { id: u.id, managerId: e.target.value ? Number(e.target.value) : null },
              'Руководитель обновлён',
            )
          }
          className="border-2 border-primary bg-background px-2 py-1 font-body text-[13px] text-primary outline-none"
        >
          <option value="">Без руководителя</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName || a.username}
            </option>
          ))}
        </select>
      )}
      {isSuperAdmin && u.role === 'admin' && (
        <select
          value={u.managerId ?? ''}
          onChange={(e) =>
            patch(
              { id: u.id, managerId: e.target.value ? Number(e.target.value) : null },
              'Управляющий обновлён',
            )
          }
          className="border-2 border-primary bg-background px-2 py-1 font-body text-[13px] text-primary outline-none"
        >
          <option value="">Без управляющего</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName || m.username}
            </option>
          ))}
        </select>
      )}
      {!readOnly && u.role === 'user' && (
        <button
          onClick={() => onPrinter(u)}
          className="flex items-center gap-1 border-2 border-primary bg-background px-2 py-1 font-head text-[0.7rem] uppercase text-primary transition-colors hover:bg-muted"
        >
          <Icon name="Printer" size={14} strokeWidth={2.5} />
          Принтер
        </button>
      )}
      {!readOnly && (
      <button
        onClick={() => onEdit(u)}
        className="flex items-center gap-1 border-2 border-primary bg-background px-2 py-1 font-head text-[0.7rem] uppercase text-primary transition-colors hover:bg-muted"
      >
        <Icon name="Pencil" size={14} strokeWidth={2.5} />
        Изменить
      </button>
      )}
      {!readOnly && (
      <button
        onClick={() => patch({ id: u.id, active: !u.active }, u.active ? 'Доступ закрыт' : 'Доступ открыт')}
        disabled={u.id === currentId}
        className={`flex items-center gap-1 border-2 px-2 py-1 font-head text-[0.7rem] uppercase transition-colors disabled:opacity-40 ${
          u.active
            ? 'border-destructive bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground'
            : 'border-primary bg-background text-primary hover:bg-muted'
        }`}
      >
        <Icon name={u.active ? 'UserX' : 'UserCheck'} size={14} strokeWidth={2.5} />
        {u.active ? 'Отключить' : 'Включить'}
      </button>
      )}
      {isSuperAdmin && (
        <button
          onClick={() => onRemove(u)}
          disabled={u.id === currentId}
          className="flex items-center gap-1 border-2 border-destructive bg-destructive px-2 py-1 font-head text-[0.7rem] uppercase text-destructive-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
        >
          <Icon name="Trash2" size={14} strokeWidth={2.5} />
          Удалить
        </button>
      )}
    </div>
  );
};

export default UserRow;

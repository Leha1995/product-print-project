import Icon from '@/components/ui/icon';
import { ManagedUser, Role, StructureRef } from '@/lib/authApi';
import TechScopePicker from '@/components/users/TechScopePicker';
import TechPicker from '@/components/users/TechPicker';
import { accessOptions, inputClass } from '@/components/users/userUi';

interface CreateUserFormProps {
  isSuperAdmin: boolean;
  username: string;
  setUsername: (v: string) => void;
  fullName: string;
  setFullName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  role: Role;
  setRole: (v: Role) => void;
  managerId: number | '';
  setManagerId: (v: number | '') => void;
  scopeIds: number[];
  setScopeIds: (v: number[]) => void;
  techIds: number[];
  setTechIds: (v: number[]) => void;
  accessDays: number | '';
  setAccessDays: (v: number | '') => void;
  newStructures: number[];
  setNewStructures: (fn: (prev: number[]) => number[]) => void;
  outsideRole: boolean;
  structures: StructureRef[];
  scopeHeads: ManagedUser[];
  allTechs: ManagedUser[];
  admins: ManagedUser[];
  managers: ManagedUser[];
  busy: boolean;
  onCreate: () => void;
}

const CreateUserForm = ({
  isSuperAdmin,
  username,
  setUsername,
  fullName,
  setFullName,
  lastName,
  setLastName,
  password,
  setPassword,
  role,
  setRole,
  managerId,
  setManagerId,
  scopeIds,
  setScopeIds,
  techIds,
  setTechIds,
  accessDays,
  setAccessDays,
  newStructures,
  setNewStructures,
  outsideRole,
  structures,
  scopeHeads,
  allTechs,
  admins,
  managers,
  busy,
  onCreate,
}: CreateUserFormProps) => (
  <div className="mt-2 grid gap-2 border-2 border-primary bg-card p-4 md:grid-cols-2">
    <input
      value={username}
      onChange={(e) => setUsername(e.target.value)}
      placeholder="Логин"
      className={inputClass}
    />
    <input
      value={fullName}
      onChange={(e) => setFullName(e.target.value)}
      placeholder="Имя сотрудника"
      className={inputClass}
    />
    <input
      value={lastName}
      onChange={(e) => setLastName(e.target.value)}
      placeholder="Фамилия"
      className={inputClass}
    />
    <input
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      placeholder="Пароль"
      className={inputClass}
    />
    {isSuperAdmin && (
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className={inputClass}
      >
        <option value="user">Сотрудник</option>
        <option value="admin">Админ</option>
        <option value="manager">Управляющий</option>
        <option value="technician">Техник</option>
        <option value="accountant">Бухгалтер</option>
        <option value="superadmin">Супер-админ</option>
      </select>
    )}
    {isSuperAdmin && (role === 'technician' || role === 'accountant') && (
      <TechScopePicker
        heads={scopeHeads}
        value={scopeIds}
        onChange={setScopeIds}
        adminsOnly={role === 'accountant'}
        className="md:col-span-2"
      />
    )}
    {isSuperAdmin && role === 'accountant' && (
      <TechPicker technicians={allTechs} value={techIds} onChange={setTechIds} className="md:col-span-2" />
    )}
    {isSuperAdmin && role === 'user' && (
      <select
        value={managerId}
        onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : '')}
        className={`${inputClass} md:col-span-2`}
      >
        <option value="">Без руководителя</option>
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            Закрепить за: {a.fullName || a.username}
          </option>
        ))}
      </select>
    )}
    {isSuperAdmin && role === 'admin' && (
      <select
        value={managerId}
        onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : '')}
        className={`${inputClass} md:col-span-2`}
      >
        <option value="">Без управляющего</option>
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            Управляющий: {m.fullName || m.username}
          </option>
        ))}
      </select>
    )}
    {role === 'admin' && (
      <select
        value={accessDays}
        onChange={(e) => setAccessDays(e.target.value ? Number(e.target.value) : '')}
        className={`${inputClass} md:col-span-2`}
      >
        {accessOptions.map((o) => (
          <option key={String(o.days)} value={o.days}>
            Срок доступа: {o.label}
          </option>
        ))}
      </select>
    )}
    {isSuperAdmin && structures.length > 0 && (
      <div className="md:col-span-2">
        <p className="mb-1 font-head text-[0.7rem] font-bold uppercase text-primary">
          Привязать к структуре
        </p>
        {outsideRole ? (
          <p className="border-2 border-dashed border-primary px-3 py-2 text-[12px] text-muted-foreground">
            {role === 'technician' ? 'Техник' : 'Супер-админ'} работает вне структур и видит все.
          </p>
        ) : (
          <div className="grid gap-1 border-2 border-primary bg-background p-2 sm:grid-cols-2">
            {structures.map((st) => (
              <label key={st.id} className="flex items-center gap-2 text-[13px] text-primary">
                <input
                  type="checkbox"
                  checked={newStructures.includes(st.id)}
                  onChange={(e) =>
                    setNewStructures((prev) =>
                      e.target.checked ? [...prev, st.id] : prev.filter((x) => x !== st.id),
                    )
                  }
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className="truncate">{st.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    )}
    <button
      onClick={onCreate}
      disabled={busy}
      className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60 md:col-span-2"
    >
      <Icon name="UserPlus" size={16} strokeWidth={2.5} />
      Добавить пользователя
    </button>
  </div>
);

export default CreateUserForm;

import Icon from '@/components/ui/icon';
import { ManagedUser, StructureRef } from '@/lib/authApi';
import { accessInfo, accessOptions, inputClass } from '@/components/users/userUi';

interface EditUserModalProps {
  editId: number;
  users: ManagedUser[];
  isSuperAdmin: boolean;
  structures: StructureRef[];
  editLogin: string;
  setEditLogin: (v: string) => void;
  editName: string;
  setEditName: (v: string) => void;
  editLastName: string;
  setEditLastName: (v: string) => void;
  editPass: string;
  setEditPass: (v: string) => void;
  editStructures: number[];
  setEditStructures: (fn: (prev: number[]) => number[]) => void;
  editAccess: number | '' | 'keep';
  setEditAccess: (v: number | '' | 'keep') => void;
  busy: boolean;
  onSave: (u: ManagedUser) => void;
  onCancel: () => void;
}

const EditUserModal = ({
  editId,
  users,
  isSuperAdmin,
  structures,
  editLogin,
  setEditLogin,
  editName,
  setEditName,
  editLastName,
  setEditLastName,
  editPass,
  setEditPass,
  editStructures,
  setEditStructures,
  editAccess,
  setEditAccess,
  busy,
  onSave,
  onCancel,
}: EditUserModalProps) => (
  <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-primary/40 p-6">
    <div className="w-full max-w-[420px] border-2 border-primary bg-background">
      <div className="border-b-2 border-primary bg-primary px-5 py-3">
        <div className="flex items-center gap-2 font-head text-base font-black uppercase tracking-[0.08em] text-primary-foreground">
          <Icon name="Pencil" size={18} strokeWidth={2.5} />
          Изменить пользователя
        </div>
      </div>
      <div className="grid gap-3 p-5">
        <div>
          <p className="mb-1 font-head text-[0.7rem] font-bold uppercase text-primary">Логин</p>
          <input
            value={editLogin}
            onChange={(e) => setEditLogin(e.target.value)}
            placeholder="Логин"
            className={inputClass}
          />
        </div>
        <div>
          <p className="mb-1 font-head text-[0.7rem] font-bold uppercase text-primary">Имя</p>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Имя сотрудника"
            className={inputClass}
          />
        </div>
        <div>
          <p className="mb-1 font-head text-[0.7rem] font-bold uppercase text-primary">Фамилия</p>
          <input
            value={editLastName}
            onChange={(e) => setEditLastName(e.target.value)}
            placeholder="Фамилия сотрудника"
            className={inputClass}
          />
        </div>
        <div>
          <p className="mb-1 font-head text-[0.7rem] font-bold uppercase text-primary">
            Новый пароль
          </p>
          <input
            value={editPass}
            onChange={(e) => setEditPass(e.target.value)}
            placeholder="Оставьте пустым, чтобы не менять"
            className={inputClass}
          />
        </div>
        {isSuperAdmin &&
          structures.length > 0 &&
          !['superadmin', 'technician'].includes(users.find((x) => x.id === editId)?.role ?? '') && (
          <div>
            <p className="mb-1 font-head text-[0.7rem] font-bold uppercase text-primary">Структуры</p>
            <div className="grid gap-1 border-2 border-primary bg-card p-2">
              {structures.map((st) => (
                <label key={st.id} className="flex items-center gap-2 text-[13px] text-primary">
                  <input
                    type="checkbox"
                    checked={editStructures.includes(st.id)}
                    onChange={(e) =>
                      setEditStructures((prev) =>
                        e.target.checked ? [...prev, st.id] : prev.filter((x) => x !== st.id),
                      )
                    }
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  {st.name}
                </label>
              ))}
            </div>
            {!editStructures.length && (
              <p className="mt-1 text-[12px] text-destructive">
                Без структуры пользователь не увидит ни одного сотрудника и общей базы.
              </p>
            )}
          </div>
        )}
        {isSuperAdmin && users.find((x) => x.id === editId)?.role === 'admin' && (
          <div>
            <p className="mb-1 font-head text-[0.7rem] font-bold uppercase text-primary">
              Срок доступа админа и его сотрудников
            </p>
            <select
              value={editAccess}
              onChange={(e) => {
                const v = e.target.value;
                setEditAccess(v === 'keep' ? 'keep' : v === '' ? '' : Number(v));
              }}
              className={inputClass}
            >
              <option value="keep">Не менять</option>
              {accessOptions.map((o) => (
                <option key={String(o.days)} value={o.days}>
                  {o.days === '' ? 'Снять ограничение' : `Продлить на ${o.label}`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {accessInfo(users.find((x) => x.id === editId)?.accessUntil ?? null).text}
            </p>
          </div>
        )}
        <div className="mt-1 flex gap-2">
          <button
            onClick={() => {
              const target = users.find((x) => x.id === editId);
              if (target) onSave(target);
            }}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon name="Check" size={15} strokeWidth={2.5} />
            Сохранить
          </button>
          <button
            onClick={onCancel}
            className="flex items-center justify-center gap-1.5 border-2 border-primary bg-background px-4 py-2 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
          >
            <Icon name="X" size={15} strokeWidth={2.5} />
            Отмена
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default EditUserModal;

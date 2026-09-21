import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import {
  apiCreateUser,
  apiDeleteUser,
  apiUpdateUser,
  apiUsers,
  ManagedUser,
  Role,
} from '@/lib/authApi';
import { toast } from '@/hooks/use-toast';

interface UsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId?: number;
}

const roleLabel: Record<Role, string> = {
  user: 'Сотрудник',
  admin: 'Админ',
  superadmin: 'Супер-админ',
};

const inputClass =
  'w-full border-2 border-primary bg-background px-3 py-2 font-body text-[14px] text-primary outline-none';

const UsersDialog = ({ open, onOpenChange, currentId }: UsersDialogProps) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiUsers()
      .then((r) => setUsers(r.users))
      .catch(() => toast({ title: 'Не удалось загрузить пользователей' }));
  }, [open]);

  const create = async () => {
    if (username.trim().length < 3 || password.length < 4) {
      toast({ title: 'Логин от 3 символов, пароль от 4' });
      return;
    }
    setBusy(true);
    try {
      const r = await apiCreateUser({ username: username.trim(), password, fullName, role });
      setUsers(r.users);
      setUsername('');
      setFullName('');
      setPassword('');
      setRole('user');
      toast({ title: 'Пользователь добавлен' });
    } catch (e) {
      toast({
        title: String(e).includes('username_taken') ? 'Такой логин уже есть' : 'Не удалось добавить',
      });
    } finally {
      setBusy(false);
    }
  };

  const patch = async (payload: Parameters<typeof apiUpdateUser>[0], msg: string) => {
    try {
      const r = await apiUpdateUser(payload);
      setUsers(r.users);
      toast({ title: msg });
    } catch {
      toast({ title: 'Не удалось сохранить' });
    }
  };

  const remove = async (u: ManagedUser) => {
    if (!window.confirm(`Удалить пользователя «${u.username}»? Отменить это нельзя.`)) return;
    try {
      const r = await apiDeleteUser(u.id);
      setUsers(r.users);
      toast({ title: 'Пользователь удалён' });
    } catch (e) {
      toast({
        title: String(e).includes('last_superadmin')
          ? 'Нельзя удалить последнего супер-админа'
          : 'Не удалось удалить',
      });
    }
  };

  const resetPassword = (u: ManagedUser) => {
    const next = window.prompt(`Новый пароль для «${u.username}»`, '');
    if (!next) return;
    if (next.length < 4) {
      toast({ title: 'Пароль от 4 символов' });
      return;
    }
    patch({ id: u.id, password: next }, 'Пароль обновлён');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[720px] overflow-y-auto border-2 border-primary bg-background p-0">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
              <Icon name="Users" size={22} strokeWidth={2.5} />
            </span>
            <div>
              <h3 className="font-head text-xl font-bold uppercase leading-tight text-primary">
                Пользователи
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Добавляйте сотрудников и управляйте доступом
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 border-2 border-primary bg-card p-4 md:grid-cols-2">
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              className={inputClass}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={inputClass}
            >
              <option value="user">Сотрудник</option>
              <option value="admin">Админ</option>
              <option value="superadmin">Супер-админ</option>
            </select>
            <button
              onClick={create}
              disabled={busy}
              className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60 md:col-span-2"
            >
              <Icon name="UserPlus" size={16} strokeWidth={2.5} />
              Добавить пользователя
            </button>
          </div>

          <div className="mt-5 grid gap-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-2 border-2 border-primary bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-head text-[0.85rem] font-bold uppercase text-primary">
                    {u.username}
                    {!u.active && <span className="ml-2 text-destructive">(отключён)</span>}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {u.fullName || '—'} · {roleLabel[u.role]}
                  </p>
                </div>
                <select
                  value={u.role}
                  disabled={u.id === currentId}
                  onChange={(e) => patch({ id: u.id, role: e.target.value as Role }, 'Роль обновлена')}
                  className="border-2 border-primary bg-background px-2 py-1 font-body text-[13px] text-primary outline-none disabled:opacity-50"
                >
                  <option value="user">Сотрудник</option>
                  <option value="admin">Админ</option>
                  <option value="superadmin">Супер-админ</option>
                </select>
                <button
                  onClick={() => resetPassword(u)}
                  className="flex items-center gap-1 border-2 border-primary bg-background px-2 py-1 font-head text-[0.7rem] uppercase text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="KeyRound" size={14} strokeWidth={2.5} />
                  Пароль
                </button>
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
                <button
                  onClick={() => remove(u)}
                  disabled={u.id === currentId}
                  className="flex items-center gap-1 border-2 border-destructive bg-destructive px-2 py-1 font-head text-[0.7rem] uppercase text-destructive-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
                >
                  <Icon name="Trash2" size={14} strokeWidth={2.5} />
                  Удалить
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UsersDialog;
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
  isSuperAdmin?: boolean;
  onChanged?: () => void;
}

const roleLabel: Record<Role, string> = {
  user: 'Сотрудник',
  admin: 'Админ',
  superadmin: 'Супер-админ',
};

const inputClass =
  'w-full border-2 border-primary bg-background px-3 py-2 font-body text-[14px] text-primary outline-none';

const UsersDialog = ({
  open,
  onOpenChange,
  currentId,
  isSuperAdmin = false,
  onChanged,
}: UsersDialogProps) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [managerId, setManagerId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editLogin, setEditLogin] = useState('');
  const [editPass, setEditPass] = useState('');

  const admins = users.filter((u) => u.role === 'admin' || u.role === 'superadmin');

  const apply = (list: ManagedUser[]) => {
    setUsers(list);
    onChanged?.();
  };

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
      const r = await apiCreateUser({
        username: username.trim(),
        password,
        fullName,
        role,
        managerId: role === 'user' ? managerId || null : null,
      });
      apply(r.users);
      setUsername('');
      setFullName('');
      setPassword('');
      setRole('user');
      setManagerId('');
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
      apply(r.users);
      toast({ title: msg });
    } catch {
      toast({ title: 'Не удалось сохранить' });
    }
  };

  const remove = async (u: ManagedUser) => {
    if (!window.confirm(`Удалить пользователя «${u.username}»? Отменить это нельзя.`)) return;
    try {
      const r = await apiDeleteUser(u.id);
      apply(r.users);
      toast({ title: 'Пользователь удалён' });
    } catch (e) {
      toast({
        title: String(e).includes('last_superadmin')
          ? 'Нельзя удалить последнего супер-админа'
          : 'Не удалось удалить',
      });
    }
  };

  const startEdit = (u: ManagedUser) => {
    setEditId(u.id);
    setEditName(u.fullName || '');
    setEditLogin(u.username);
    setEditPass('');
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditPass('');
  };

  const saveEdit = async (u: ManagedUser) => {
    const login = editLogin.trim().toLowerCase();
    if (login.length < 3) {
      toast({ title: 'Логин от 3 символов' });
      return;
    }
    if (editPass && editPass.length < 4) {
      toast({ title: 'Пароль от 4 символов' });
      return;
    }
    setBusy(true);
    try {
      const r = await apiUpdateUser({
        id: u.id,
        username: login !== u.username ? login : undefined,
        fullName: editName.trim(),
        password: editPass || undefined,
      });
      apply(r.users);
      cancelEdit();
      toast({ title: 'Данные сохранены' });
    } catch (e) {
      toast({
        title: String(e).includes('username_taken') ? 'Такой логин уже есть' : 'Не удалось сохранить',
      });
    } finally {
      setBusy(false);
    }
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
                {isSuperAdmin
                  ? 'Добавляйте сотрудников и управляйте доступом'
                  : 'Ваши сотрудники: смена пароля и доступа'}
              </p>
            </div>
          </div>

          {isSuperAdmin && (
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
            {isSuperAdmin && (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className={inputClass}
              >
                <option value="user">Сотрудник</option>
                <option value="admin">Админ</option>
                <option value="superadmin">Супер-админ</option>
              </select>
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
            <button
              onClick={create}
              disabled={busy}
              className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60 md:col-span-2"
            >
              <Icon name="UserPlus" size={16} strokeWidth={2.5} />
              Добавить пользователя
            </button>
          </div>
          )}

          <div className="mt-5 grid gap-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-2 border-2 border-primary bg-card px-3 py-2"
              >
                {editId === u.id ? (
                  <div className="grid w-full gap-2 md:grid-cols-2">
                    <input
                      value={editLogin}
                      onChange={(e) => setEditLogin(e.target.value)}
                      placeholder="Логин"
                      className={inputClass}
                    />
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Имя сотрудника"
                      className={inputClass}
                    />
                    <input
                      value={editPass}
                      onChange={(e) => setEditPass(e.target.value)}
                      placeholder="Новый пароль (не обязательно)"
                      className={`${inputClass} md:col-span-2`}
                    />
                    <div className="flex gap-2 md:col-span-2">
                      <button
                        onClick={() => saveEdit(u)}
                        disabled={busy}
                        className="flex items-center gap-1.5 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                      >
                        <Icon name="Check" size={15} strokeWidth={2.5} />
                        Сохранить
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 border-2 border-primary bg-background px-4 py-2 font-head text-[0.75rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
                      >
                        <Icon name="X" size={15} strokeWidth={2.5} />
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                <>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-head text-[0.85rem] font-bold uppercase text-primary">
                    {u.username}
                    {!u.active && <span className="ml-2 text-destructive">(отключён)</span>}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {u.fullName || '—'} · {roleLabel[u.role]}
                    {u.managerId
                      ? ` · руководитель: ${
                          users.find((a) => a.id === u.managerId)?.fullName ||
                          users.find((a) => a.id === u.managerId)?.username ||
                          '—'
                        }`
                      : ''}
                  </p>
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
                    <option value="superadmin">Супер-админ</option>
                  </select>
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
                <button
                  onClick={() => startEdit(u)}
                  className="flex items-center gap-1 border-2 border-primary bg-background px-2 py-1 font-head text-[0.7rem] uppercase text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="Pencil" size={14} strokeWidth={2.5} />
                  Изменить
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
                {isSuperAdmin && (
                  <button
                    onClick={() => remove(u)}
                    disabled={u.id === currentId}
                    className="flex items-center gap-1 border-2 border-destructive bg-destructive px-2 py-1 font-head text-[0.7rem] uppercase text-destructive-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
                  >
                    <Icon name="Trash2" size={14} strokeWidth={2.5} />
                    Удалить
                  </button>
                )}
                </>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UsersDialog;
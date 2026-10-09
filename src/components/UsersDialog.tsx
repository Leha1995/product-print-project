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
  StructureRef,
} from '@/lib/authApi';
import { toast } from '@/hooks/use-toast';
import StructuresPanel from '@/components/users/StructuresPanel';
import StaffPrintersDialog from '@/components/users/StaffPrintersDialog';
import CreateUserForm from '@/components/users/CreateUserForm';
import UserRow from '@/components/users/UserRow';
import EditUserModal from '@/components/users/EditUserModal';
import { joinFullName, splitFullName } from '@/components/users/userUi';

interface UsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId?: number;
  isSuperAdmin?: boolean;
  readOnly?: boolean;
  onChanged?: () => void;
  onViewTechnician?: (id: number, name: string) => void;
  structures?: StructureRef[];
  activeStructureId?: number | null;
  onStructuresChanged?: () => void;
}

const UsersDialog = ({
  open,
  onOpenChange,
  currentId,
  isSuperAdmin = false,
  readOnly = false,
  onChanged,
  onViewTechnician,
  structures = [],
  activeStructureId = null,
  onStructuresChanged,
}: UsersDialogProps) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [managerId, setManagerId] = useState<number | ''>('');
  const [scopeIds, setScopeIds] = useState<number[]>([]);
  const [techIds, setTechIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editLogin, setEditLogin] = useState('');
  const [editPass, setEditPass] = useState('');
  const [accessDays, setAccessDays] = useState<number | ''>('');
  const [editAccess, setEditAccess] = useState<number | '' | 'keep'>('keep');
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [editStructures, setEditStructures] = useState<number[]>([]);
  const [newStructures, setNewStructures] = useState<number[]>([]);
  const [printerUser, setPrinterUser] = useState<ManagedUser | null>(null);
  const outsideRole = role === 'technician' || role === 'superadmin';

  useEffect(() => {
    if (open) setNewStructures(activeStructureId ? [activeStructureId] : []);
  }, [open, activeStructureId]);

  const toggleGroup = (id: number) =>
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const admins = users.filter((u) => u.role === 'admin' || u.role === 'superadmin');
  const managers = users.filter((u) => u.role === 'manager');
  const scopeHeads = users.filter((u) => u.role === 'manager' || u.role === 'admin');
  const allTechs = users.filter((u) => u.role === 'technician');

  const treeMode = isSuperAdmin || readOnly;

  const rows = (() => {
    if (!treeMode) {
      return users.map((u) => ({ user: u, depth: 0, ancestors: [] as number[], admins: 0, staff: 0 }));
    }
    const managerIds = new Set(managers.map((m) => m.id));
    const heads = users.filter((u) => u.role !== 'user');
    const staffOf = (id: number) => users.filter((s) => s.role === 'user' && s.managerId === id);
    const adminsOf = (id: number) =>
      users.filter((a) => a.role === 'admin' && a.managerId === id);
    const result: { user: ManagedUser; depth: number; ancestors: number[]; admins: number; staff: number }[] = [];
    const push = (u: ManagedUser, depth: number, ancestors: number[]) => {
      const subAdmins = u.role === 'manager' ? adminsOf(u.id) : [];
      const staff = staffOf(u.id);
      const staffTotal =
        staff.length + subAdmins.reduce((sum, a) => sum + staffOf(a.id).length, 0);
      result.push({ user: u, depth, ancestors, admins: subAdmins.length, staff: staffTotal });
      const next = [...ancestors, u.id];
      subAdmins.forEach((a) => push(a, depth + 1, next));
      staff.forEach((s) => push(s, depth + 1, next));
    };
    heads
      .filter((h) => !(h.role === 'admin' && h.managerId && managerIds.has(h.managerId)))
      .forEach((h) => push(h, 0, []));
    users
      .filter((s) => s.role === 'user' && (!s.managerId || !heads.some((h) => h.id === s.managerId)))
      .forEach((s) => push(s, 0, []));
    return result;
  })();

  const groupIds = rows.filter((r) => r.admins + r.staff > 0).map((r) => r.user.id);

  const apply = (list: ManagedUser[]) => {
    setUsers(list);
    onChanged?.();
  };

  useEffect(() => {
    if (!open) return;
    apiUsers()
      .then((r) => {
        setUsers(r.users);
        setCollapsed(
          r.users
            .filter((u) => u.role !== 'user' && r.users.some((s) => s.managerId === u.id))
            .map((u) => u.id),
        );
      })
      .catch(() => toast({ title: 'Не удалось загрузить пользователей' }));
  }, [open]);

  const create = async () => {
    if (username.trim().length < 3 || password.length < 4) {
      toast({ title: 'Логин от 3 символов, пароль от 4' });
      return;
    }
    if (!outsideRole && structures.length && !newStructures.length) {
      toast({ title: 'Выберите хотя бы одну структуру' });
      return;
    }
    setBusy(true);
    try {
      const r = await apiCreateUser({
        username: username.trim(),
        password,
        fullName: joinFullName(fullName, lastName),
        role,
        managerId: role === 'user' || role === 'admin' ? managerId || null : null,
        scopeIds: role === 'technician' || role === 'accountant' ? scopeIds : undefined,
        techIds: role === 'accountant' ? techIds : undefined,
        accessDays: role === 'admin' ? accessDays || null : null,
        structureIds: !outsideRole && structures.length ? newStructures : undefined,
      });
      apply(r.users);
      if (!outsideRole && structures.length) onStructuresChanged?.();
      setUsername('');
      setFullName('');
      setLastName('');
      setPassword('');
      setRole('user');
      setManagerId('');
      setScopeIds([]);
      setTechIds([]);
      setAccessDays('');
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
      if (payload.structureIds) onStructuresChanged?.();
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
    const parts = splitFullName(u.fullName || '');
    setEditId(u.id);
    setEditName(parts.first);
    setEditLastName(parts.last);
    setEditLogin(u.username);
    setEditPass('');
    setEditAccess('keep');
    setEditStructures(u.structureIds || []);
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
        fullName: joinFullName(editName, editLastName),
        password: editPass || undefined,
        ...(isSuperAdmin && u.role === 'admin' && editAccess !== 'keep'
          ? { accessDays: editAccess === '' ? null : editAccess }
          : {}),
        ...(isSuperAdmin && u.role !== 'superadmin' && u.role !== 'technician' && structures.length
          ? { structureIds: editStructures }
          : {}),
      });
      apply(r.users);
      cancelEdit();
      onStructuresChanged?.();
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
      <DialogContent className="max-h-[90vh] max-w-[900px] overflow-y-auto border-2 border-primary bg-background p-0">
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
                  : readOnly
                    ? 'Все админы и их сотрудники — только просмотр'
                    : 'Ваши сотрудники: имя и фамилия, смена пароля и доступа'}
              </p>
            </div>
          </div>

          {isSuperAdmin && (
            <StructuresPanel
              structures={structures}
              activeId={activeStructureId}
              users={users}
              onChanged={apply}
              onStructuresChanged={() => onStructuresChanged?.()}
            />
          )}

          {isSuperAdmin && (
            <CreateUserForm
              isSuperAdmin={isSuperAdmin}
              username={username}
              setUsername={setUsername}
              fullName={fullName}
              setFullName={setFullName}
              lastName={lastName}
              setLastName={setLastName}
              password={password}
              setPassword={setPassword}
              role={role}
              setRole={setRole}
              managerId={managerId}
              setManagerId={setManagerId}
              scopeIds={scopeIds}
              setScopeIds={setScopeIds}
              techIds={techIds}
              setTechIds={setTechIds}
              accessDays={accessDays}
              setAccessDays={setAccessDays}
              newStructures={newStructures}
              setNewStructures={setNewStructures}
              outsideRole={outsideRole}
              structures={structures}
              scopeHeads={scopeHeads}
              allTechs={allTechs}
              admins={admins}
              managers={managers}
              busy={busy}
              onCreate={create}
            />
          )}

          {treeMode && groupIds.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setCollapsed((prev) => (prev.length ? [] : groupIds))}
                className="flex items-center gap-1.5 border-2 border-primary bg-background px-3 py-1.5 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
              >
                <Icon
                  name={collapsed.length ? 'ChevronsDownUp' : 'ChevronsUpDown'}
                  size={14}
                  strokeWidth={2.5}
                />
                {collapsed.length ? 'Развернуть все' : 'Свернуть все'}
              </button>
            </div>
          )}

          <div className="mt-3 grid gap-2">
            {rows.map(({ user: u, depth, ancestors, admins: adminCount, staff: staffCount }) => (
              <UserRow
                key={u.id}
                u={u}
                depth={depth}
                ancestors={ancestors}
                adminCount={adminCount}
                staffCount={staffCount}
                collapsed={collapsed}
                toggleGroup={toggleGroup}
                treeMode={treeMode}
                isSuperAdmin={isSuperAdmin}
                readOnly={readOnly}
                currentId={currentId}
                structures={structures}
                users={users}
                scopeHeads={scopeHeads}
                allTechs={allTechs}
                admins={admins}
                managers={managers}
                patch={patch}
                onViewTechnician={onViewTechnician}
                onPrinter={setPrinterUser}
                onEdit={startEdit}
                onRemove={remove}
              />
            ))}
          </div>
        </div>
        <StaffPrintersDialog
          userId={printerUser?.id ?? null}
          userName={printerUser ? printerUser.fullName || printerUser.username : ''}
          onClose={() => setPrinterUser(null)}
        />
        {editId !== null && (
          <EditUserModal
            editId={editId}
            users={users}
            isSuperAdmin={isSuperAdmin}
            structures={structures}
            editLogin={editLogin}
            setEditLogin={setEditLogin}
            editName={editName}
            setEditName={setEditName}
            editLastName={editLastName}
            setEditLastName={setEditLastName}
            editPass={editPass}
            setEditPass={setEditPass}
            editStructures={editStructures}
            setEditStructures={setEditStructures}
            editAccess={editAccess}
            setEditAccess={setEditAccess}
            busy={busy}
            onSave={saveEdit}
            onCancel={cancelEdit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UsersDialog;

import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { apiChangePassword, AuthUser } from '@/lib/authApi';
import { toast } from '@/hooks/use-toast';

interface AdminLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser | null;
  onLogout: (forget?: boolean) => void;
}

const roleLabel: Record<string, string> = {
  user: 'Сотрудник',
  admin: 'Администратор',
  superadmin: 'Супер-администратор',
};

const AdminLoginDialog = ({ open, onOpenChange, user, onLogout }: AdminLoginDialogProps) => {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open) setPassword('');
  }, [open]);

  const save = async () => {
    if (password.length < 4) {
      toast({ title: 'Пароль от 4 символов' });
      return;
    }
    try {
      await apiChangePassword(password);
      setPassword('');
      toast({ title: 'Пароль обновлён' });
    } catch {
      toast({ title: 'Не удалось сменить пароль' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] border-2 border-primary bg-background p-0">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
              <Icon name="CircleUser" size={22} strokeWidth={2.5} />
            </span>
            <div>
              <h3 className="font-head text-xl font-bold uppercase leading-tight text-primary">
                {user?.fullName || user?.username || 'Профиль'}
              </h3>
              <p className="text-[13px] text-muted-foreground">
                {roleLabel[user?.role || 'user']} · {user?.username}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2">
            {user?.role === 'superadmin' && (
              <>
                <span className="font-head text-[0.72rem] font-medium uppercase tracking-[0.08em] text-primary">
                  Сменить пароль
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Новый пароль"
                  className="w-full border-2 border-primary bg-card px-3 py-3 font-body text-[15px] text-primary outline-none"
                />
                <button
                  onClick={save}
                  className="flex items-center justify-center gap-2 border-2 border-primary bg-card px-4 py-3 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
                >
                  <Icon name="KeyRound" size={18} strokeWidth={2.5} />
                  Сохранить пароль
                </button>
              </>
            )}
            <button
              onClick={() => {
                onLogout();
                onOpenChange(false);
              }}
              className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.85rem] font-medium uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              <Icon name="LogOut" size={18} strokeWidth={2.5} />
              Выйти
            </button>
            <button
              onClick={() => {
                onLogout(true);
                onOpenChange(false);
              }}
              className="flex items-center justify-center gap-2 border-2 border-primary bg-card px-4 py-2 font-head text-[0.72rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
            >
              <Icon name="UserRoundX" size={16} strokeWidth={2.5} />
              Выйти и забыть устройство
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminLoginDialog;
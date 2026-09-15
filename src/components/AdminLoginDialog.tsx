import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import NumericKeypad from '@/components/NumericKeypad';

interface AdminLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (pin: string) => boolean;
  isAdmin: boolean;
  onLogout: () => void;
}

const fieldClass =
  'w-full select-none border-2 border-primary bg-card px-3 py-3 text-center font-head text-2xl leading-8 tracking-[0.4em] text-primary';

const AdminLoginDialog = ({
  open,
  onOpenChange,
  onLogin,
  isAdmin,
  onLogout,
}: AdminLoginDialogProps) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue('');
      setError('');
    }
  }, [open]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (onLogin(value)) {
      onOpenChange(false);
    } else {
      setError('Неверный пароль. Попробуйте ещё раз');
      setValue('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] border-2 border-primary bg-background p-0">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
              <Icon name={isAdmin ? 'ShieldCheck' : 'Lock'} size={22} strokeWidth={2.5} />
            </span>
            <div>
              <h3 className="font-head text-xl font-bold uppercase leading-tight text-primary">
                {isAdmin ? 'Режим администратора' : 'Вход администратора'}
              </h3>
              <p className="text-[13px] text-muted-foreground">
                {isAdmin
                  ? 'Можно менять фото, названия, сроки и температуру хранения'
                  : 'Введите пароль, чтобы редактировать каталог'}
              </p>
            </div>
          </div>

          {!isAdmin ? (
            <form onSubmit={submit} className="mt-5 grid gap-3">
              <div className={fieldClass}>
                {value ? '•'.repeat(value.length) : <span className="opacity-40">••••••••</span>}
              </div>
              {error && <p className="text-[13px] text-destructive">{error}</p>}
              <NumericKeypad
                value={value}
                onChange={(v) => {
                  setValue(v);
                  setError('');
                }}
                onSubmit={() => submit()}
              />
            </form>
          ) : (
            <div className="mt-5 grid gap-3">
              <button
                onClick={() => {
                  onLogout();
                  onOpenChange(false);
                }}
                className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.85rem] font-medium uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon name="LogOut" size={18} strokeWidth={2.5} />
                Выйти из режима
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminLoginDialog;
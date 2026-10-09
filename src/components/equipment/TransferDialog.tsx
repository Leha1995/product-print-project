import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { AdminRef, Equipment, fetchTransferAdmins, transferEquipment } from '@/lib/equipmentApi';

interface TransferDialogProps {
  item: Equipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (items: Equipment[], adminName: string) => void;
}

const errorText: Record<string, string> = {
  bad_password: 'Неверный пароль на перемещение',
  in_repair: 'Оборудование в ремонте — сначала прими его с ремонта',
  bad_target: 'Этому админу переместить нельзя: у него нет управляющего',
  not_your_admin: 'Отправить может только управляющий, за которым закреплён этот админ',
  not_found: 'Оборудование не найдено или списано',
};

const TransferDialog = ({ item, open, onOpenChange, onDone }: TransferDialogProps) => {
  const [admins, setAdmins] = useState<AdminRef[]>([]);
  const [toUser, setToUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToUser('');
    setPassword('');
    setError('');
    fetchTransferAdmins()
      .then(setAdmins)
      .catch(() => setError('Не удалось загрузить список админов'));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !toUser) {
      setError('Выбери, кому переместить');
      return;
    }
    if (!password) {
      setError('Введи пароль на перемещение');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await transferEquipment(item.id, Number(toUser), password);
      const name = admins.find((a) => a.id === Number(toUser))?.name || '';
      onDone(res.items, name);
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(errorText[code] || 'Не удалось переместить, проверь интернет');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'mt-1 w-full border-2 border-primary bg-background px-3 py-2.5 font-body text-[15px] text-primary outline-none';
  const label = 'font-head text-[0.72rem] font-medium uppercase tracking-[0.08em] text-primary';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] border-2 border-primary bg-background p-5">
        <form onSubmit={submit}>
          <h3 className="flex items-center gap-2 font-head text-lg font-black uppercase text-primary">
            <Icon name="ArrowRightLeft" size={20} strokeWidth={2.5} />
            Переместить
          </h3>
          {item && <p className="mt-1 text-[13px] text-muted-foreground">{item.name}</p>}

          <label className="mt-4 block">
            <span className={label}>Кому (админ)</span>
            <select value={toUser} onChange={(e) => setToUser(e.target.value)} className={field}>
              <option value="">— выбери админа —</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className={label}>Пароль на перемещение</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </label>

          <p className="mt-3 text-[12px] text-muted-foreground">
            Админ получит карточку и должен подтвердить перемещение. До подтверждения оборудование остаётся на текущей точке.
          </p>

          {error && <p className="mt-2 text-[13px] font-semibold text-destructive">{error}</p>}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-2 border-primary bg-card px-4 py-3 font-head text-[0.8rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex flex-[1.4] items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.8rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              <Icon name={busy ? 'Loader2' : 'Send'} size={18} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} />
              Переместить
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransferDialog;
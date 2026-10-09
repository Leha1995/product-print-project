import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { NetPrinter, apiSaveStaffPrinters, apiStaffPrinters } from '@/lib/printApi';
import { toast } from '@/hooks/use-toast';

interface StaffPrintersDialogProps {
  userId: number | null;
  userName: string;
  onClose: () => void;
}

const fieldClass =
  'w-full border-2 border-primary bg-background px-3 py-2 font-body text-[14px] text-primary outline-none placeholder:text-muted-foreground';

const ipValid = (ip: string) =>
  /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) && ip.split('.').every((p) => Number(p) <= 255);

const StaffPrintersDialog = ({ userId, userName, onClose }: StaffPrintersDialogProps) => {
  const [printers, setPrinters] = useState<NetPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('9100');

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setName('');
    setIp('');
    setPort('9100');
    apiStaffPrinters(userId)
      .then((r) => setPrinters(r.printers || []))
      .catch(() => toast({ title: 'Не удалось загрузить принтеры сотрудника' }))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  const save = async (list: NetPrinter[], msg: string) => {
    setBusy(true);
    try {
      const r = await apiSaveStaffPrinters(userId, list);
      setPrinters(r.printers);
      toast({ title: msg, description: userName });
      return true;
    } catch {
      toast({ title: 'Не удалось сохранить' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const cleanIp = ip.trim();
    if (!ipValid(cleanIp)) {
      toast({ title: 'Проверьте IP-адрес', description: 'Например: 192.168.1.50' });
      return;
    }
    const printer: NetPrinter = {
      id: `pr-${Date.now().toString(36)}`,
      name: name.trim() || `Принтер ${printers.length + 1}`,
      ip: cleanIp,
      port: Number(port) || 9100,
    };
    if (await save([...printers, printer], 'Принтер сохранён')) {
      setName('');
      setIp('');
      setPort('9100');
    }
  };

  const remove = (p: NetPrinter) => {
    if (!window.confirm(`Удалить принтер «${p.name}» у сотрудника?`)) return;
    save(
      printers.filter((x) => x.id !== p.id),
      'Принтер удалён',
    );
  };

  const makeMain = (p: NetPrinter) =>
    save([p, ...printers.filter((x) => x.id !== p.id)], 'Основной принтер выбран');

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-primary/40 p-6">
      <div className="w-full max-w-[460px] border-2 border-primary bg-background">
        <div className="flex items-center justify-between gap-2 border-b-2 border-primary bg-primary px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 font-head text-base font-black uppercase tracking-[0.06em] text-primary-foreground">
            <Icon name="Printer" size={18} strokeWidth={2.5} />
            <span className="truncate">{`Принтеры · ${userName}`}</span>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="text-primary-foreground">
            <Icon name="X" size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="grid gap-3 p-5">
          <p className="text-[12px] text-muted-foreground">
            Эти принтеры сохраняются за сотрудником и подставляются у него на любом устройстве. Первый в списке —
            основной. Если список пуст, сотрудник печатает на принтеры своего админа.
          </p>

          {loading ? (
            <p className="text-[13px] text-muted-foreground">Загружаю…</p>
          ) : printers.length ? (
            <div className="grid gap-1.5">
              {printers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-head text-[0.8rem] font-bold uppercase text-primary">
                      {p.name}
                      {i === 0 && <span className="ml-2 text-[11px] text-success">· основной</span>}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{`${p.ip}:${p.port}`}</p>
                  </div>
                  {i > 0 && (
                    <button
                      onClick={() => makeMain(p)}
                      disabled={busy}
                      className="border-2 border-primary bg-background px-2 py-1 font-head text-[0.65rem] font-bold uppercase text-primary hover:bg-muted disabled:opacity-60"
                    >
                      Основной
                    </button>
                  )}
                  <button
                    onClick={() => remove(p)}
                    disabled={busy}
                    aria-label="Удалить принтер"
                    className="border-2 border-destructive bg-background px-2 py-1 text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-60"
                  >
                    <Icon name="Trash2" size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="border-2 border-dashed border-primary px-3 py-3 text-[13px] text-muted-foreground">
              Своих принтеров нет — используются принтеры админа.
            </p>
          )}

          <div className="grid gap-2 border-2 border-primary bg-card p-3">
            <p className="font-head text-[0.7rem] font-bold uppercase text-primary">Добавить принтер</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название (необязательно)" className={fieldClass} />
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP, например 192.168.1.50" inputMode="decimal" className={fieldClass} />
              <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} placeholder="Порт" inputMode="numeric" className={fieldClass} />
            </div>
            <button
              onClick={add}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              <Icon name="Plus" size={15} strokeWidth={2.5} />
              Сохранить принтер
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffPrintersDialog;

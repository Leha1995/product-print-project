import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import { MaxStatus, fetchMaxStatus, requestMaxLink, unlinkMax } from '@/lib/maxApi';

interface MaxConnectProps {
  hint?: string;
  compact?: boolean;
}

const errorText: Record<string, string> = {
  not_configured: 'Бот MAX ещё не настроен — нужен токен бота',
  bad_token: 'MAX не принял токен бота — проверьте его',
  forbidden_role: 'Уведомления доступны только админам, управляющим, техникам и супер-админу',
  max_unavailable: 'MAX не отвечает, попробуйте через минуту',
};

const MaxConnect = ({ hint, compact = false }: MaxConnectProps) => {
  const [status, setStatus] = useState<MaxStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetchMaxStatus();
      setStatus(s);
      if (s.linked) setWaiting(false);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(load, 3000);
    const stop = window.setTimeout(() => setWaiting(false), 180000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      window.removeEventListener('focus', onFocus);
    };
  }, [waiting, load]);

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    const tab = window.open('', '_blank');
    try {
      const { url } = await requestMaxLink();
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setWaiting(true);
    } catch (e) {
      tab?.close();
      const code = e instanceof Error ? e.message : '';
      toast({ title: 'Не удалось подключить MAX', description: errorText[code] || 'Попробуйте ещё раз' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setStatus(await unlinkMax());
      toast({ title: 'Уведомления в MAX отключены' });
    } catch {
      toast({ title: 'Не удалось отключить', description: 'Попробуйте ещё раз' });
    } finally {
      setBusy(false);
    }
  };

  if (!status || status.allowed === false || (!status.configured && !status.linked)) return null;

  const linked = status.linked;

  return (
    <div
      className={`border-2 ${linked ? 'border-success bg-success/10' : 'border-primary bg-card'} ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 border-primary ${
            linked ? 'bg-success text-success-foreground' : 'bg-[#6C4CF5] text-white'
          }`}
        >
          <Icon name={linked ? 'BellRing' : 'MessageCircle'} size={18} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-head text-[0.8rem] font-black uppercase text-primary">
            {linked ? 'MAX подключён' : 'Уведомления в MAX'}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {linked
              ? `Сообщения приходят${status.name ? ` в аккаунт ${status.name}` : ''}`
              : waiting
                ? 'Нажмите «Начать» в открывшемся боте MAX — статус обновится сам'
                : hint || 'Получайте уведомления прямо в MAX'}
          </p>
        </div>
        {linked ? (
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 border-2 border-primary bg-background px-3 py-2 font-head text-[0.68rem] font-bold uppercase text-primary transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Icon name="BellOff" size={14} strokeWidth={2.5} />
            Отключить
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={busy}
            className="flex min-h-[44px] shrink-0 items-center gap-2 border-2 border-primary bg-[#6C4CF5] px-4 py-2 font-head text-[0.75rem] font-black uppercase text-white shadow-[3px_3px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon
              name={busy || waiting ? 'Loader2' : 'MessageCircle'}
              size={16}
              strokeWidth={2.5}
              className={busy || waiting ? 'animate-spin' : ''}
            />
            {waiting ? 'Жду подтверждения…' : 'Подключить MAX'}
          </button>
        )}
      </div>
    </div>
  );
};

export default MaxConnect;

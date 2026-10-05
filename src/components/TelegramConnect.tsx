import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import {
  TelegramStatus,
  fetchTelegramStatus,
  requestTelegramLink,
  unlinkTelegram,
} from '@/lib/telegramApi';

interface TelegramConnectProps {
  hint?: string;
  compact?: boolean;
}

const errorText: Record<string, string> = {
  not_configured: 'Бот ещё не настроен — нужен токен бота в настройках проекта',
  bad_token: 'Токен бота неверный — проверьте его в настройках проекта',
  forbidden_role: 'Уведомления доступны только админам, управляющим, техникам и супер-админу',
  telegram_unavailable: 'Telegram не отвечает, попробуйте через минуту',
};

const TelegramConnect = ({ hint, compact = false }: TelegramConnectProps) => {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetchTelegramStatus();
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
      const { url } = await requestTelegramLink();
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setWaiting(true);
    } catch (e) {
      tab?.close();
      const code = e instanceof Error ? e.message : '';
      toast({ title: 'Не удалось подключить', description: errorText[code] || 'Попробуйте ещё раз' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setStatus(await unlinkTelegram());
      toast({ title: 'Уведомления в Telegram отключены' });
    } catch {
      toast({ title: 'Не удалось отключить', description: 'Попробуйте ещё раз' });
    } finally {
      setBusy(false);
    }
  };

  if (!status || status.allowed === false) return null;

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
            linked ? 'bg-success text-success-foreground' : 'bg-[#229ED9] text-white'
          }`}
        >
          <Icon name={linked ? 'BellRing' : 'Send'} size={18} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-head text-[0.8rem] font-black uppercase text-primary">
            {linked ? 'Telegram подключён' : 'Уведомления в Telegram'}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {linked
              ? `Сообщения приходят${status.tgName ? ` в аккаунт ${status.tgName}` : ''}`
              : waiting
                ? 'Нажмите «Старт» в открывшемся боте — статус обновится сам'
                : hint || 'Получайте уведомления о задачах прямо в Telegram'}
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
            className="flex min-h-[44px] shrink-0 items-center gap-2 border-2 border-primary bg-[#229ED9] px-4 py-2 font-head text-[0.75rem] font-black uppercase text-white shadow-[3px_3px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon
              name={busy || waiting ? 'Loader2' : 'Send'}
              size={16}
              strokeWidth={2.5}
              className={busy || waiting ? 'animate-spin' : ''}
            />
            {waiting ? 'Жду подтверждения…' : 'Подключить Telegram'}
          </button>
        )}
      </div>
    </div>
  );
};

export default TelegramConnect;

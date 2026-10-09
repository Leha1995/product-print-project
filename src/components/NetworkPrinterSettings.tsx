import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import { LabelSettings } from '@/hooks/useLabelSettings';
import { NetPrinter, PrintConfig, apiRegenPrintKey, apiSavePrinters, printEndpoint } from '@/lib/printApi';
import { loadPrintConfig, networkOptions, pickPrinter, sendRaw, setPrintConfig, subscribePrintConfig } from '@/lib/netPrint';
import { downloadHelper } from '@/lib/printHelper';
import { testLabelTspl } from '@/lib/tspl';

interface NetworkPrinterSettingsProps {
  settings: LabelSettings;
  onChange: (patch: Partial<LabelSettings>) => void;
}

const fieldClass =
  'w-full border-2 border-primary bg-card px-3 py-2 font-body text-[14px] text-primary outline-none placeholder:text-muted-foreground focus:bg-muted';
const labelClass = 'font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary';
const ipValid = (ip: string) =>
  /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) &&
  ip.split('.').every((p) => Number(p) <= 255);

const NetworkPrinterSettings = ({ settings, onChange }: NetworkPrinterSettingsProps) => {
  const [config, setConfig] = useState<PrintConfig | null>(null);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('9100');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState('');

  useEffect(() => subscribePrintConfig(setConfig), []);

  useEffect(() => {
    loadPrintConfig(true);
    const id = window.setInterval(() => loadPrintConfig(true), 15000);
    return () => window.clearInterval(id);
  }, []);

  const printers = config?.printers ?? [];
  const current = pickPrinter(settings, config);
  const canSetup = Boolean(config?.canSetup);

  const save = async (list: NetPrinter[]) => {
    setBusy(true);
    try {
      const r = await apiSavePrinters(list);
      if (config) setPrintConfig({ ...config, printers: r.printers });
      return r.printers;
    } catch {
      toast({ title: 'Не удалось сохранить принтер' });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const cleanIp = ip.trim();
    if (!ipValid(cleanIp)) {
      toast({ title: 'Проверь IP-адрес', description: 'Например, 192.168.1.50' });
      return;
    }
    const printer: NetPrinter = {
      id: `pr-${Date.now().toString(36)}`,
      name: name.trim() || `Принтер ${printers.length + 1}`,
      ip: cleanIp,
      port: Number(port) || 9100,
    };
    const saved = await save([...printers, printer]);
    if (!saved) return;
    onChange({ netPrinterId: printer.id });
    setName('');
    setIp('');
    setPort('9100');
    toast({ title: 'Принтер добавлен' });
  };

  const remove = async (p: NetPrinter) => {
    if (!window.confirm(`Удалить принтер «${p.name}»?`)) return;
    await save(printers.filter((x) => x.id !== p.id));
  };

  const test = async (p: NetPrinter) => {
    setTesting(p.id);
    const ok = await sendRaw(p, testLabelTspl(networkOptions(settings), `${p.name} · ${p.ip}`));
    setTesting('');
    if (ok) toast({ title: 'Тестовая этикетка напечатана' });
  };

  const getHelper = () => {
    if (!config?.key) return;
    downloadHelper(printEndpoint(), config.key);
    toast({
      title: 'Помощник скачан',
      description: 'Запусти файл asap-pechat.bat на компьютере в точке — он установится и будет работать в фоне.',
    });
  };

  const regenKey = async () => {
    if (!window.confirm('Старый помощник перестанет работать, его нужно будет скачать заново. Продолжить?'))
      return;
    try {
      const r = await apiRegenPrintKey();
      if (config) setPrintConfig({ ...config, key: r.key, online: false });
      toast({ title: 'Ключ обновлён — скачай помощник заново' });
    } catch {
      toast({ title: 'Не удалось обновить ключ' });
    }
  };

  return (
    <div className="mt-3 grid gap-3 border-2 border-dashed border-primary p-3">
      <div
        className={`flex items-center gap-2 border-2 px-3 py-2 ${
          config?.online ? 'border-primary bg-card' : 'border-destructive bg-card'
        }`}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${config?.online ? 'bg-green-600' : 'bg-destructive'}`}
        />
        <span className="font-head text-[0.7rem] font-bold uppercase tracking-[0.04em] text-primary">
          {config === null
            ? 'Проверяем помощник печати…'
            : config.online
              ? 'Помощник печати в сети'
              : 'Помощник печати не запущен'}
        </span>
      </div>
      {config && !config.online && (
        <p className="text-[11px] leading-snug text-destructive">
          Помощник привязан к сайту, с которого его скачали. Если сайт переехал на новый адрес —
          скачай помощник заново здесь{config.canSetup ? '' : ' под старшим аккаунтом точки'} и
          запусти его на компьютере в точке.
        </p>
      )}
      {config?.personal && !config.canSetup && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Принтеры для вас настроил админ — они сохранены за вашим аккаунтом.
        </p>
      )}
      {config?.canSetup && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Один помощник на компьютере печатает задания этого аккаунта и всех привязанных к нему
          сотрудников. Скачивай его под старшим аккаунтом точки.
        </p>
      )}

      {printers.length > 0 && (
        <div className="grid gap-2">
          <span className={labelClass}>Принтеры по IP</span>
          {printers.map((p) => {
            const active = current?.id === p.id;
            return (
              <div
                key={p.id}
                className={`flex flex-wrap items-center gap-2 border-2 border-primary px-2 py-2 ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-card text-primary'
                }`}
              >
                <button
                  onClick={() => onChange({ netPrinterId: p.id })}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Icon name={active ? 'CircleCheck' : 'Circle'} size={16} strokeWidth={2.5} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-head text-[0.75rem] font-bold uppercase">{p.name}</span>
                    <span className={`block text-[11px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
                      {p.ip}:{p.port}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => test(p)}
                  disabled={Boolean(testing)}
                  className="flex items-center gap-1 border-2 border-primary bg-background px-2 py-1 font-head text-[0.65rem] uppercase text-primary transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Icon name={testing === p.id ? 'Loader' : 'Printer'} size={13} strokeWidth={2.5} className={testing === p.id ? 'animate-spin' : ''} />
                  Тест
                </button>
                {canSetup && (
                  <button
                    onClick={() => remove(p)}
                    aria-label="Удалить принтер"
                    className="flex h-7 w-7 items-center justify-center border-2 border-destructive bg-background text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Icon name="Trash2" size={13} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canSetup && (
        <div className="grid gap-2">
          <span className={labelClass}>Добавить принтер</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название, например «Кухня»" className={fieldClass} />
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="IP, например 192.168.1.50"
              inputMode="decimal"
              className={fieldClass}
            />
            <input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              placeholder="9100"
              inputMode="numeric"
              className={fieldClass}
            />
          </div>
          <button
            onClick={add}
            disabled={busy}
            className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-3 py-2 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon name="Plus" size={16} strokeWidth={2.5} />
            Добавить принтер
          </button>
        </div>
      )}

      {!canSetup && printers.length === 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Принтеры по IP добавляет админ. Попроси его подключить принтер в настройках маркировки.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className={labelClass}>Зазор, мм</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={settings.netGapMm}
            onChange={(e) => onChange({ netGapMm: Number(e.target.value) })}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1">
          <span className={labelClass}>Яркость 0–15</span>
          <input
            type="number"
            min={0}
            max={15}
            value={settings.netDensity}
            onChange={(e) => onChange({ netDensity: Number(e.target.value) })}
            className={fieldClass}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-primary">
        <input
          type="checkbox"
          checked={settings.netFlip}
          onChange={(e) => onChange({ netFlip: e.target.checked })}
          className="h-4 w-4 accent-[hsl(var(--primary))]"
        />
        Этикетка выходит вверх ногами — перевернуть
      </label>

      {canSetup && (
        <div className="grid gap-2 border-t-2 border-dashed border-primary pt-3">
          <span className={labelClass}>Помощник печати для Windows</span>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Браузер не может сам отправить этикетку на IP-адрес. Её передаёт маленький помощник на
            любом компьютере в той же Wi-Fi сети, что и принтер. Запусти скачанный файл один раз — он
            установится, будет работать в фоне без окна и сам запускаться при включении компьютера.
            Повторный запуск файла перезапускает помощник. Планшеты и телефоны печатают через него.
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={getHelper}
              disabled={!config?.key}
              className="flex items-center justify-center gap-2 border-2 border-primary bg-card px-3 py-2 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Icon name="Download" size={15} strokeWidth={2.5} />
              Скачать помощник
            </button>
            <button
              onClick={regenKey}
              title="Сменить ключ"
              aria-label="Сменить ключ помощника"
              className="flex items-center justify-center border-2 border-primary bg-card px-3 text-primary transition-colors hover:bg-muted"
            >
              <Icon name="KeyRound" size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkPrinterSettings;
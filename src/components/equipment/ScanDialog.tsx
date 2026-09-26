import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Equipment } from '@/lib/equipmentApi';

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Equipment[];
  onFinish: (scanned: string[]) => void;
}

const ScanDialog = ({ open, onOpenChange, items, onFinish }: ScanDialogProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [scanned, setScanned] = useState<string[]>([]);
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [last, setLast] = useState<{ name: string; ok: boolean } | null>(null);
  const [manual, setManual] = useState('');
  const [attempt, setAttempt] = useState(0);

  const active = items.filter((i) => i.active);
  const codeMap = new Map(active.map((i) => [i.code, i]));

  const accept = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const found = codeMap.get(code);
      setLast({ name: found ? found.name : `Чужой код: ${code}`, ok: Boolean(found) });
      if (!found) return;
      setScanned((prev) => (prev.includes(code) ? prev : [...prev, code]));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  useEffect(() => {
    if (!open) return;
    setScanned([]);
    setLast(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCamera('starting');
    let stopped = false;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (result) accept(result.getText());
      })
      .then((controls) => {
        if (stopped) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setCamera('on');
      })
      .catch(() => {
        if (!stopped) setCamera('off');
      });

    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, accept, attempt]);

  const total = active.length;
  const left = total - scanned.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-[520px] overflow-y-auto border-2 border-primary bg-background p-4">
        <h3 className="font-head text-lg font-black uppercase text-primary">Сканирование</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {camera === 'off'
            ? `Камера недоступна — вводи коды вручную. Отмечено ${scanned.length} из ${total}`
            : `Наведи камеру на QR-код. Отмечено ${scanned.length} из ${total}`}
        </p>

        {camera === 'off' ? (
          <div className="mt-3 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary bg-card px-4 py-6 text-center">
            <Icon name="CameraOff" size={28} strokeWidth={2} className="text-muted-foreground" />
            <p className="font-head text-[0.75rem] font-bold uppercase text-primary">
              Камера не подключилась
            </p>
            <p className="max-w-[320px] text-[12px] text-muted-foreground">
              Инвентаризацию можно провести полностью вручную — вводи коды в поле ниже
            </p>
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-1 flex items-center gap-1.5 border-2 border-primary bg-background px-3 py-1.5 font-head text-[0.68rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              <Icon name="RefreshCw" size={14} strokeWidth={2.5} />
              Попробовать снова
            </button>
          </div>
        ) : (
          <div className="relative mt-3 overflow-hidden border-2 border-primary bg-black">
            <video ref={videoRef} playsInline muted className="h-[46vh] w-full object-cover" />
            {camera === 'starting' && (
              <p className="absolute inset-0 flex items-center justify-center font-head text-[0.72rem] font-bold uppercase text-white/80">
                Включаю камеру…
              </p>
            )}
          </div>
        )}

        {last && (
          <p
            className={`mt-2 flex items-center gap-2 border-2 px-3 py-2 font-head text-[0.78rem] font-bold uppercase ${
              last.ok
                ? 'border-success bg-success text-success-foreground'
                : 'border-destructive bg-destructive text-destructive-foreground'
            }`}
          >
            <Icon name={last.ok ? 'Check' : 'X'} size={16} strokeWidth={2.5} />
            {last.name}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              accept(manual);
              setManual('');
            }}
            autoFocus={camera === 'off'}
            placeholder="Ввести код вручную"
            className="flex-1 border-2 border-primary bg-background px-3 py-2.5 font-body text-[14px] text-primary outline-none"
          />
          <button
            onClick={() => {
              accept(manual);
              setManual('');
            }}
            className="border-2 border-primary bg-card px-4 font-head text-[0.72rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
          >
            Ок
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between border-2 border-primary bg-card px-3 py-2">
          <span className="font-head text-[0.72rem] font-bold uppercase text-primary">
            Осталось найти
          </span>
          <span className="font-head text-lg font-black text-primary">{left}</span>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 border-2 border-primary bg-card px-4 py-3 font-head text-[0.78rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
          >
            Прервать
          </button>
          <button
            onClick={() => onFinish(scanned)}
            className="flex flex-[1.5] items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.78rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            <Icon name="ClipboardCheck" size={18} strokeWidth={2.5} />
            Завершить и сверить
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScanDialog;
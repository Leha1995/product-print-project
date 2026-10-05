import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Equipment } from '@/lib/equipmentApi';
import { cameraSupported, openCamera } from '@/lib/cameraPermission';
import useHardwareScanner from '@/hooks/useHardwareScanner';
import { playScanSound, unlockScanSound } from '@/lib/scanSound';

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
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'asking' | 'on' | 'off'>('idle');
  const [last, setLast] = useState<{ name: string; ok: boolean } | null>(null);
  const [manual, setManual] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [framed, setFramed] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torch, setTorch] = useState(false);

  const active = items.filter((i) => i.active);
  const codeMapRef = useRef(new Map<string, Equipment>());
  codeMapRef.current = new Map(active.map((i) => [i.code, i]));

  const lastHitRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const accept = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const found = codeMapRef.current.get(code);
    const now = Date.now();
    const repeat = lastHitRef.current.code === code && now - lastHitRef.current.at < 1500;
    lastHitRef.current = { code, at: now };
    if (!repeat) playScanSound(Boolean(found));
    setLast({ name: found ? found.name : `Чужой код: ${code}`, ok: Boolean(found) });
    if (!found) return;
    setScanned((prev) => (prev.includes(code) ? prev : [...prev, code]));
  }, []);

  useHardwareScanner(open, accept);

  useEffect(() => {
    if (!open) return;
    unlockScanSound();
    lastHitRef.current = { code: '', at: 0 };
    setScanned([]);
    setLast(null);
    setError('');
    setFramed(false);
    setStatus('idle');
    setAttempt(0);
    setHasTorch(false);
    setTorch(false);
  }, [open]);

  useEffect(() => {
    if (!open || !attempt) return;
    setError('');
    setFramed(false);
    setStatus('asking');
    setHasTorch(false);
    setTorch(false);
    let stopped = false;
    let stream: MediaStream | null = null;
    const reader = new BrowserMultiFormatReader();

    const start = async () => {
      if (!window.isSecureContext) {
        setStatus('off');
        setError('Камера работает только по защищённому соединению (https). Вводи коды вручную.');
        return;
      }
      if (!cameraSupported()) {
        setStatus('off');
        setError('Браузер не умеет работать с камерой. Вводи коды вручную.');
        return;
      }

      try {
        stream = await openCamera();
      } catch (err) {
        const name = (err as DOMException)?.name || '';
        console.error('camera error', name, err);
        setStatus('off');
        if (window.self !== window.top) {
          setFramed(true);
          setError(
            'Окно предпросмотра не пропускает камеру внутрь. Открой сайт в отдельной вкладке — там камера включится сразу.',
          );
          return;
        }
        setError(
          name === 'NotAllowedError'
            ? 'Браузер заблокировал камеру. Проверь значок камеры в адресной строке и в настройках системы, затем нажми «Включить камеру».'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'Камера не найдена. Подключи камеру или вводи коды вручную.'
              : name === 'NotReadableError'
                ? 'Камера занята другим приложением. Закрой его и попробуй снова.'
                : 'Не удалось включить камеру. Попробуй снова или вводи коды вручную.',
        );
        return;
      }

      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const track = stream.getVideoTracks()[0];
      trackRef.current = track || null;
      const caps = (track?.getCapabilities?.() || {}) as Record<string, unknown>;
      setHasTorch(Boolean(caps.torch));
      if (track && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        track
          .applyConstraints({
            // @ts-expect-error нестандартная, но поддерживаемая настройка
            advanced: [{ focusMode: 'continuous' }],
          })
          .catch(() => undefined);
      }

      try {
        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current ?? undefined,
          (result) => {
            if (result) accept(result.getText());
          },
        );
        if (stopped) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus('on');
      } catch (err) {
        console.error('scanner start error', err);
        if (stopped) return;
        setStatus('off');
        setError('Не удалось запустить распознавание. Попробуй снова или вводи коды вручную.');
      }
    };

    start();

    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      trackRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, accept, attempt]);

  const total = active.length;
  const left = total - scanned.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[94vh] sm:w-full sm:max-w-[520px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:border-2 sm:border-primary sm:p-4">
        <div className="shrink-0 px-3 pb-2 pt-3 sm:p-0">
          <h3 className="pr-10 font-head text-base font-black uppercase text-primary sm:text-lg">
            Сканирование
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {status === 'idle'
              ? `Сканируй сканером, включи камеру или вводи коды вручную. Отмечено ${scanned.length} из ${total}`
              : status === 'off'
                ? `Камера недоступна — вводи коды вручную. Отмечено ${scanned.length} из ${total}`
                : `Наведи камеру на QR-код. Отмечено ${scanned.length} из ${total}`}
          </p>
        </div>

        {status === 'idle' ? (
          <div className="mx-3 flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto border-2 border-dashed border-primary bg-card px-4 py-6 text-center sm:mx-0 sm:mt-3 sm:flex-none">
            <Icon name="ScanBarcode" size={32} strokeWidth={2} className="text-primary" />
            <p className="max-w-[320px] font-head text-[0.78rem] font-bold uppercase text-primary">
              Сканер готов — просто сканируй QR-коды
            </p>
            <p className="max-w-[320px] text-[13px] text-muted-foreground">
              Или включи камеру: браузер спросит разрешение, подтверди его, и сканирование начнётся.
            </p>
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="flex items-center gap-2 border-2 border-primary bg-accent px-5 py-3 font-head text-[0.78rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              <Icon name="Camera" size={18} strokeWidth={2.5} />
              Включить камеру
            </button>
          </div>
        ) : status === 'off' ? (
          <div className="mx-3 flex flex-1 flex-col items-center justify-center gap-2 overflow-y-auto border-2 border-dashed border-primary bg-card px-4 py-5 text-center sm:mx-0 sm:mt-3 sm:flex-none">
            <Icon name="CameraOff" size={28} strokeWidth={2} className="text-muted-foreground" />
            <p className="max-w-[340px] text-[13px] text-muted-foreground">{error}</p>
            {framed && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex items-center gap-1.5 border-2 border-primary bg-accent px-3 py-2 font-head text-[0.7rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon name="ExternalLink" size={15} strokeWidth={2.5} />
                Открыть в новой вкладке
              </a>
            )}
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className={`mt-1 flex items-center gap-1.5 border-2 border-primary px-3 py-2 font-head text-[0.7rem] font-bold uppercase transition-transform hover:-translate-y-0.5 ${
                framed ? 'bg-background text-primary' : 'bg-accent text-accent-foreground'
              }`}
            >
              <Icon name="Camera" size={15} strokeWidth={2.5} />
              Включить камеру
            </button>
          </div>
        ) : (
          <div className="relative min-h-[160px] w-full flex-1 overflow-hidden border-y-2 border-primary bg-black sm:mt-3 sm:aspect-[4/3] sm:flex-none sm:border-2">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
            />

            {status === 'on' && (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative h-[62%] w-[62%]">
                    <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-accent" />
                    <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-accent" />
                    <span className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-accent" />
                    <span className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-accent" />
                  </div>
                </div>
                {hasTorch && (
                  <button
                    onClick={async () => {
                      const next = !torch;
                      try {
                        await trackRef.current?.applyConstraints({
                          // @ts-expect-error нестандартная, но поддерживаемая настройка
                          advanced: [{ torch: next }],
                        });
                        setTorch(next);
                      } catch {
                        setHasTorch(false);
                      }
                    }}
                    className={`absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center border-2 border-primary transition-colors ${
                      torch ? 'bg-accent text-accent-foreground' : 'bg-black/60 text-white'
                    }`}
                  >
                    <Icon name={torch ? 'Flashlight' : 'FlashlightOff'} size={20} strokeWidth={2.5} />
                  </button>
                )}
              </>
            )}

            {status === 'asking' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 px-4 text-center">
                <Icon name="Camera" size={26} strokeWidth={2} className="text-white/80" />
                <p className="font-head text-[0.72rem] font-bold uppercase text-white/90">
                  Запрашиваю доступ к камере
                </p>
                <p className="text-[12px] text-white/60">Нажми «Разрешить» в окне браузера</p>
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:p-0">
          {last && (
            <p
              className={`flex items-center gap-2 border-2 px-3 py-1.5 font-head text-[0.72rem] font-bold uppercase ${
                last.ok
                  ? 'border-success bg-success text-success-foreground'
                  : 'border-destructive bg-destructive text-destructive-foreground'
              }`}
            >
              <Icon name={last.ok ? 'Check' : 'X'} size={16} strokeWidth={2.5} />
              <span className="truncate">{last.name}</span>
            </p>
          )}

          <div className="mt-2 flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                accept(manual);
                setManual('');
              }}
              autoFocus={status === 'off'}
              placeholder="Ввести код вручную"
              className="min-w-0 flex-1 border-2 border-primary bg-background px-3 py-2 font-body text-[14px] text-primary outline-none"
            />
            <button
              onClick={() => {
                accept(manual);
                setManual('');
              }}
              className="shrink-0 border-2 border-primary bg-card px-4 font-head text-[0.72rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              Ок
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 items-center justify-between border-2 border-primary bg-card px-3 py-2">
              <span className="font-head text-[0.68rem] font-bold uppercase text-primary">
                Осталось
              </span>
              <span className="font-head text-lg font-black text-primary">{left}</span>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="shrink-0 border-2 border-primary bg-card px-4 py-2.5 font-head text-[0.7rem] font-bold uppercase text-primary transition-colors hover:bg-muted"
            >
              Прервать
            </button>
          </div>

          <button
            onClick={() => onFinish(scanned)}
            className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.78rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
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
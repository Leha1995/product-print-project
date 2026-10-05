import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { cameraSupported, openCamera } from '@/lib/cameraPermission';
import useHardwareScanner from '@/hooks/useHardwareScanner';
import { unlockScanSound } from '@/lib/scanSound';

interface FindQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCode: (code: string) => void;
}

const FindQrDialog = ({ open, onOpenChange, onCode }: FindQrDialogProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'asking' | 'on' | 'off'>('asking');
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const doneRef = useRef(false);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const submit = (raw: string) => {
    const code = raw.trim();
    if (!code || doneRef.current) return;
    doneRef.current = true;
    onCodeRef.current(code);
  };

  useHardwareScanner(open, submit);

  useEffect(() => {
    if (!open) return;
    unlockScanSound();
    doneRef.current = false;
    setManual('');
    setError('');
    setStatus('asking');
    let stopped = false;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;

    const start = async () => {
      if (!cameraSupported()) {
        setStatus('off');
        setError('Камера недоступна. Отсканируй сканером или введи код вручную.');
        return;
      }
      try {
        stream = await openCamera();
      } catch {
        if (stopped) return;
        setStatus('off');
        setError(
          window.self !== window.top
            ? 'Окно предпросмотра не пропускает камеру. Открой сайт в отдельной вкладке или используй сканер.'
            : 'Не удалось включить камеру. Отсканируй сканером или введи код вручную.',
        );
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      try {
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromStream(stream, videoRef.current ?? undefined, (result) => {
          if (result) submit(result.getText());
        });
        if (stopped) {
          controls.stop();
          return;
        }
        setStatus('on');
      } catch {
        if (stopped) return;
        setStatus('off');
        setError('Не удалось запустить распознавание. Используй сканер или введи код вручную.');
      }
    };

    start();
    return () => {
      stopped = true;
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-w-[440px] border-2 border-primary bg-background p-4"
      >
        <h3 className="pr-8 font-head text-lg font-black uppercase text-primary">Найти по QR-коду</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Наведи камеру на наклейку или отсканируй сканером
        </p>

        {status === 'off' ? (
          <div className="mt-3 flex flex-col items-center gap-2 border-2 border-dashed border-primary bg-card px-4 py-6 text-center">
            <Icon name="ScanBarcode" size={30} strokeWidth={2} className="text-primary" />
            <p className="max-w-[320px] text-[13px] text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden border-2 border-primary bg-black">
            <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
            {status === 'on' ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[62%] w-[62%]">
                  <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-accent" />
                  <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-accent" />
                  <span className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-accent" />
                  <span className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-accent" />
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 px-4 text-center">
                <Icon name="Camera" size={26} strokeWidth={2} className="text-white/80" />
                <p className="font-head text-[0.72rem] font-bold uppercase text-white/90">Включаю камеру</p>
                <p className="text-[12px] text-white/60">Если браузер спросит — нажми «Разрешить»</p>
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(manual);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Ввести код вручную"
            className="min-w-0 flex-1 border-2 border-primary bg-card px-3 py-2 font-body text-[14px] text-primary outline-none"
          />
          <button
            type="submit"
            className="shrink-0 border-2 border-primary bg-accent px-4 font-head text-[0.72rem] font-bold uppercase text-accent-foreground"
          >
            Найти
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FindQrDialog;

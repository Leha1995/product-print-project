import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { PrintProgress, dismissPrintProgress, retryPendingPrint, subscribePrintProgress } from '@/lib/netPrint';

const PrintProgressBar = () => {
  const [progress, setProgress] = useState<PrintProgress | null>(null);

  useEffect(() => subscribePrintProgress(setProgress), []);

  if (!progress) return null;

  const { sent, total, status, retryCount = 0, retrying } = progress;
  const percent = total ? Math.round((sent / total) * 100) : 0;
  const failed = status === 'failed';

  const title =
    status === 'preparing'
      ? `Готовим этикетки: ${total} шт.`
      : status === 'done'
        ? retrying
          ? `Допечатано ${total} из ${total}`
          : `Отправлено ${total} из ${total}`
        : failed
          ? `Печать прервана: отправлено ${sent} из ${total}`
          : `Отправлено ${sent} из ${total}`;

  const icon = status === 'done' ? 'CircleCheck' : failed ? 'CircleAlert' : 'Printer';

  return (
    <div className="print-hide pointer-events-none fixed inset-x-0 bottom-4 z-[60] sm:bottom-auto sm:top-4 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={`w-full max-w-sm border-2 bg-card px-4 py-3 shadow-lg ${
          failed ? 'border-destructive' : 'border-primary'
        }`}
      >
        <div className="mb-2 flex items-center gap-2">
          <Icon
            name={icon}
            size={18}
            strokeWidth={2.5}
            className={`shrink-0 ${failed ? 'text-destructive' : 'text-primary'} ${
              status === 'sending' || status === 'preparing' ? 'animate-pulse' : ''
            }`}
          />
          <span className="font-head text-[0.8rem] font-bold uppercase tracking-[0.04em] text-primary">
            {title}
          </span>
        </div>
        <Progress
          value={status === 'preparing' ? 0 : percent}
          className={`h-2.5 rounded-none ${failed ? '[&>div]:bg-destructive' : ''}`}
        />
        {failed && retryCount > 0 && (
          <div className="pointer-events-auto mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => retryPendingPrint()}
              className="flex flex-1 items-center justify-center gap-2 border-2 border-primary bg-primary px-3 py-2 font-head text-[0.8rem] font-bold uppercase tracking-[0.04em] text-primary-foreground active:translate-y-px"
            >
              <Icon name="RotateCw" size={16} strokeWidth={2.5} />
              Допечатать остальные ({retryCount})
            </button>
            <button
              type="button"
              onClick={dismissPrintProgress}
              aria-label="Закрыть"
              className="flex items-center justify-center border-2 border-primary bg-card px-3 text-primary active:translate-y-px"
            >
              <Icon name="X" size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintProgressBar;
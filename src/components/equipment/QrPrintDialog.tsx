import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import QrLabel from '@/components/equipment/QrLabel';
import { printNodeHtml } from '@/components/DirectPrintArea';
import { Equipment } from '@/lib/equipmentApi';
import { defaultLabelSettings } from '@/hooks/useLabelSettings';
import { isRawMode, printNodesNetwork } from '@/lib/netPrint';

const readLabelSettings = () => {
  try {
    const raw = localStorage.getItem('asap-label-settings-v1');
    return raw ? { ...defaultLabelSettings, ...JSON.parse(raw) } : defaultLabelSettings;
  } catch {
    return defaultLabelSettings;
  }
};

interface QrPrintDialogProps {
  items: Equipment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QrPrintDialog = ({ items, open, onOpenChange }: QrPrintDialogProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const id = window.setTimeout(() => setReady(true), 400);
    return () => window.clearTimeout(id);
  }, [open, items]);

  const print = () => {
    const nodes = ref.current?.querySelectorAll('.print-area');
    if (!nodes?.length) return;
    const settings = readLabelSettings();
    if (isRawMode(settings)) {
      printNodesNetwork(Array.from(nodes) as HTMLElement[], settings, 1, {
        widthMm: 58,
        heightMm: 40,
        rotate90: false,
        offsetXmm: 0,
        offsetYmm: 0,
      });
      return;
    }
    printNodeHtml(Array.from(nodes).map((n) => n.outerHTML).join(''), 58, 40);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[560px] overflow-y-auto border-2 border-primary bg-background p-5">
        <h3 className="font-head text-lg font-black uppercase text-primary">
          {`Наклейки с QR · ${items.length} шт.`}
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Распечатай и наклей на оборудование — по этим кодам идёт сканирование
        </p>

        <div ref={ref} className="mt-4 grid max-h-[46vh] gap-3 overflow-y-auto pr-1">
          {items.map((item) => (
            <QrLabel key={item.id} item={item} />
          ))}
        </div>

        <button
          onClick={print}
          disabled={!ready}
          className="mt-5 flex w-full items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.85rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          <Icon name={ready ? 'Printer' : 'Loader'} size={18} strokeWidth={2.5} />
          {ready ? 'Печатать наклейки' : 'Готовим коды...'}
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default QrPrintDialog;

import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import ReceiptPreview from '@/components/ReceiptPreview';
import LabelSettingsPanel from '@/components/LabelSettingsPanel';
import { LabelSettings, getPaper } from '@/hooks/useLabelSettings';
import { printNodeHtml } from '@/components/DirectPrintArea';
import { Product } from '@/data/products';

interface PrintDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrinted: (product: Product, copies: number) => void;
  settings: LabelSettings;
  onSettingsChange: (patch: Partial<LabelSettings>) => void;
  onSettingsReset: () => void;
}

const PrintDialog = ({
  product,
  open,
  onOpenChange,
  onPrinted,
  settings,
  onSettingsChange,
  onSettingsReset,
}: PrintDialogProps) => {
  const [copies, setCopies] = useState(1);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [stamp, setStamp] = useState(() => new Date());

  useEffect(() => {
    if (open) {
      setCopies(1);
      setStatus('idle');
      setStamp(new Date());
    }
  }, [open, product?.id]);

  if (!product) return null;

  const handlePrint = () => {
    setStatus('sending');
    setStamp(new Date());
    window.setTimeout(() => {
      setStatus('done');
      onPrinted(product, copies);
      const node = document.querySelector('.print-area');
      const paper = getPaper(settings.paper);
      if (node) {
        printNodeHtml(
          Array.from({ length: copies }, () => node.outerHTML).join(''),
          paper.widthMm,
          paper.heightMm,
          settings.rotate90,
        );
      }
    }, 700);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[900px] overflow-y-auto border-2 border-primary bg-background p-0">
        <div className="grid gap-0 md:grid-cols-[1.15fr_1fr]">
          <div className="print-hide border-b-2 border-primary md:border-b-0 md:border-r-2">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
              <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
              <span className="absolute bottom-0 right-0 border-l-2 border-t-2 border-primary bg-accent px-4 py-2 font-head text-2xl font-black text-accent-foreground">
                {product.price} ₽
              </span>
            </div>

            <div className="p-5">
              <h3 className="font-head text-2xl font-bold uppercase leading-tight text-primary">
                {product.name}
              </h3>
              <p className="mt-2 text-[15px] text-muted-foreground">{product.composition}</p>

              <dl className="mt-4 space-y-2 border-t-2 border-dashed border-primary pt-4 text-sm text-primary">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Артикул</dt>
                  <dd className="font-semibold">{product.id.toUpperCase()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Вес / объём</dt>
                  <dd className="font-semibold">{product.weight}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Штрих-код</dt>
                  <dd className="font-semibold tracking-[0.1em]">{product.barcode}</dd>
                </div>
              </dl>

              <div className="mt-5 flex items-center justify-between border-2 border-primary p-3">
                <span className="font-head text-[0.75rem] font-medium uppercase tracking-[0.08em] text-primary">
                  Копий ценника
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCopies((c) => Math.max(1, c - 1))}
                    className="flex h-8 w-8 items-center justify-center border-2 border-primary text-primary transition-colors hover:bg-accent"
                    aria-label="Меньше копий"
                  >
                    <Icon name="Minus" size={16} strokeWidth={3} />
                  </button>
                  <span className="w-6 text-center font-head text-lg font-bold text-primary">
                    {copies}
                  </span>
                  <button
                    onClick={() => setCopies((c) => Math.min(20, c + 1))}
                    className="flex h-8 w-8 items-center justify-center border-2 border-primary text-primary transition-colors hover:bg-accent"
                    aria-label="Больше копий"
                  >
                    <Icon name="Plus" size={16} strokeWidth={3} />
                  </button>
                </div>
              </div>

              <button
                onClick={handlePrint}
                disabled={status === 'sending'}
                className="mt-4 flex w-full items-center justify-center gap-2 border-2 border-primary bg-accent px-6 py-4 font-head text-lg font-medium uppercase tracking-[0.02em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70"
              >
                <Icon
                  name={status === 'sending' ? 'Loader' : status === 'done' ? 'Check' : 'Printer'}
                  size={20}
                  strokeWidth={2.5}
                  className={status === 'sending' ? 'animate-spin' : ''}
                />
                {status === 'sending'
                  ? 'Отправляем в принтер'
                  : status === 'done'
                    ? 'Отправлено — печатать снова'
                    : 'Печатать ценник'}
              </button>

              <p className="mt-3 text-center text-[12px] uppercase tracking-[0.06em] text-muted-foreground">
                Принтер «Касса 1» · {getPaper(settings.paper).label}
              </p>
            </div>
          </div>

          <div className="bg-muted">
            <div className="p-5">
              <div className="print-hide mb-3 flex items-center gap-2 font-head text-[0.7rem] font-medium uppercase tracking-[0.1em] text-primary">
                <Icon name="ScrollText" size={14} strokeWidth={2.5} />
                Превью ценника
              </div>
              <ReceiptPreview
                product={product}
                copies={copies}
                printedAt={stamp}
                settings={settings}
              />
            </div>
            <LabelSettingsPanel
              settings={settings}
              onChange={onSettingsChange}
              onReset={onSettingsReset}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintDialog;
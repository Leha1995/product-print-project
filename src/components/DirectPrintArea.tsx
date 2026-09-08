import ReceiptPreview from '@/components/ReceiptPreview';
import { LabelSettings } from '@/hooks/useLabelSettings';
import { Product } from '@/data/products';

interface DirectPrintAreaProps {
  product: Product | null;
  settings: LabelSettings;
  printedAt: Date;
}

const DirectPrintArea = ({ product, settings, printedAt }: DirectPrintAreaProps) => {
  if (!product) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-[-9999px] top-0 w-[320px]"
    >
      <ReceiptPreview product={product} copies={1} printedAt={printedAt} settings={settings} />
    </div>
  );
};

export default DirectPrintArea;
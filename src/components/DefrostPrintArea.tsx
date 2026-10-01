import { useEffect, useRef } from 'react';
import DefrostLabel, { DefrostInfo } from '@/components/DefrostLabel';
import { LabelSettings, getPaper } from '@/hooks/useLabelSettings';
import { printNodeHtml } from '@/components/DirectPrintArea';
import { printNodesNetwork } from '@/lib/netPrint';

interface DefrostPrintAreaProps {
  info: DefrostInfo | null;
  settings: LabelSettings;
  printedAt: Date;
  copies: number;
  onDone: (info: DefrostInfo) => void;
}

const DefrostPrintArea = ({
  info,
  settings,
  printedAt,
  copies,
  onDone,
}: DefrostPrintAreaProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!info) return;
    const node = ref.current?.firstElementChild as HTMLElement | undefined;
    if (!node) return;

    if (settings.printMode === 'network') {
      const id = window.setTimeout(() => {
        printNodesNetwork([node], settings, Math.max(1, copies));
        onDone(info);
      }, 60);
      return () => window.clearTimeout(id);
    }

    const paper = getPaper(settings.paper);
    const id = window.setTimeout(() => {
      printNodeHtml(
        Array.from({ length: Math.max(1, copies) }, () => node.outerHTML).join(''),
        paper.widthMm,
        paper.heightMm,
        settings.rotate90,
        settings.offsetXmm,
        settings.offsetYmm,
      );
      onDone(info);
    }, 60);

    return () => window.clearTimeout(id);
  }, [info, settings, printedAt, copies, onDone]);

  if (!info) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="print-hide pointer-events-none fixed left-[-10000px] top-0 w-[320px]"
    >
      <DefrostLabel info={info} printedAt={printedAt} settings={settings} />
    </div>
  );
};

export default DefrostPrintArea;

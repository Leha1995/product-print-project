import Icon from '@/components/ui/icon';
import { LabelSettings } from '@/hooks/useLabelSettings';
import { networkOptions, shareLabelFiles } from '@/lib/netPrint';
import { testLabelCanvas } from '@/lib/tspl';

interface PrintLabelSettingsProps {
  settings: LabelSettings;
}

const sendTest = (settings: LabelSettings) => {
  testLabelCanvas(networkOptions(settings), 'Print Label').toBlob((blob) => {
    if (blob) shareLabelFiles([new File([blob], 'etiketka-test.png', { type: 'image/png' })]);
  }, 'image/png');
};

const PrintLabelSettings = ({ settings }: PrintLabelSettingsProps) => (
  <div className="mt-3 grid gap-3 border-2 border-dashed border-primary p-3">
    <p className="text-[11px] leading-snug text-muted-foreground">
      Сайт готовит этикетку 43×25 картинкой и передаёт её в приложение Print Label на планшете, а оно
      печатает на Xprinter. Один раз на каждом планшете:
    </p>
    <ol className="grid gap-1 pl-4 text-[11px] leading-snug text-muted-foreground">
      <li className="list-decimal">Установи Print Label и подключи в нём свой Xprinter.</li>
      <li className="list-decimal">В приложении выбери размер этикетки 43×25 мм.</li>
      <li className="list-decimal">
        Нажми «Тест» ниже → в списке приложений выбери Print Label → напечатай.
      </li>
    </ol>
    <p className="text-[11px] leading-snug text-muted-foreground">
      Открывай сайт в Chrome. При пакетной печати все этикетки уходят в приложение одной пачкой.
    </p>

    <button
      onClick={() => sendTest(settings)}
      className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-3 py-2 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
    >
      <Icon name="Printer" size={16} strokeWidth={2.5} />
      Тест
    </button>
  </div>
);

export default PrintLabelSettings;

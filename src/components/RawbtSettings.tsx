import Icon from '@/components/ui/icon';
import { LabelSettings } from '@/hooks/useLabelSettings';
import { networkOptions, sendToRawbt } from '@/lib/netPrint';
import { testLabelTspl } from '@/lib/tspl';

interface RawbtSettingsProps {
  settings: LabelSettings;
  onChange: (patch: Partial<LabelSettings>) => void;
}

const fieldClass =
  'w-full border-2 border-primary bg-card px-3 py-2 font-body text-[14px] text-primary outline-none placeholder:text-muted-foreground focus:bg-muted';
const labelClass = 'font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary';

const RawbtSettings = ({ settings, onChange }: RawbtSettingsProps) => (
  <div className="mt-3 grid gap-3 border-2 border-dashed border-primary p-3">
    <p className="text-[11px] leading-snug text-muted-foreground">
      Этикетка уходит с планшета прямо на принтер по Wi-Fi — без компьютера и окна печати. Один раз
      на каждом планшете:
    </p>
    <ol className="grid gap-1 pl-4 text-[11px] leading-snug text-muted-foreground">
      <li className="list-decimal">Установи из Google Play приложение «RawBT».</li>
      <li className="list-decimal">
        В RawBT: «Настройки» → «Подключение» → «Сеть (LAN/Wi-Fi)», впиши IP принтера и порт 9100.
      </li>
      <li className="list-decimal">В «Драйвер» выбери «Без обработки (RAW)» или «TSPL».</li>
      <li className="list-decimal">
        Нажми «Тест» ниже. При первом запуске Android спросит, чем открыть, — выбери RawBT и «Всегда».
      </li>
    </ol>

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

    <button
      onClick={() => sendToRawbt([testLabelTspl(networkOptions(settings), 'RawBT')])}
      className="flex items-center justify-center gap-2 border-2 border-primary bg-accent px-3 py-2 font-head text-[0.75rem] font-bold uppercase text-accent-foreground transition-transform hover:-translate-y-0.5"
    >
      <Icon name="Printer" size={16} strokeWidth={2.5} />
      Тест
    </button>
  </div>
);

export default RawbtSettings;

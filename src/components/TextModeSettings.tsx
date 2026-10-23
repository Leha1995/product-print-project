import { LabelSettings } from '@/hooks/useLabelSettings';

interface TextModeSettingsProps {
  settings: LabelSettings;
  onChange: (patch: Partial<LabelSettings>) => void;
}

const TextModeSettings = ({ settings, onChange }: TextModeSettingsProps) => (
  <div className="grid gap-2 border-2 border-primary bg-card p-2">
    <label className="flex items-start gap-2 text-[12px] text-primary">
      <input
        type="checkbox"
        checked={settings.netTextMode}
        onChange={(e) => onChange({ netTextMode: e.target.checked })}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
      />
      <span>
        <span className="font-bold">Чёткая этикетка</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">
          Крупный жирный шрифт, нарисованный точно под точки принтера — читается даже на мелкой этикетке.
          Логотип и штрих-код при этом не печатаются. Выключи, чтобы печатать копию экрана.
        </span>
      </span>
    </label>
  </div>
);

export default TextModeSettings;

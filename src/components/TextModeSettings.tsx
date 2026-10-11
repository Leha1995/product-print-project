import { LabelSettings } from '@/hooks/useLabelSettings';

interface TextModeSettingsProps {
  settings: LabelSettings;
  onChange: (patch: Partial<LabelSettings>) => void;
}

const codepages: { value: LabelSettings['netCodepage']; label: string }[] = [
  { value: '1251', label: 'Windows-1251 (чаще всего)' },
  { value: '866', label: 'CP866 (DOS)' },
  { value: 'UTF-8', label: 'UTF-8 (новые модели)' },
];

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
        <span className="font-bold">Печатать текстом</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">
          Шрифтами принтера — чётче и в десятки раз быстрее. Логотип и штрих-код при этом не печатаются.
          Выключи, чтобы печатать картинкой как на экране.
        </span>
      </span>
    </label>
    {settings.netTextMode && (
      <label className="grid gap-1">
        <span className="font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary">
          Кодировка русских букв
        </span>
        <select
          value={settings.netCodepage}
          onChange={(e) => onChange({ netCodepage: e.target.value as LabelSettings['netCodepage'] })}
          className="w-full border-2 border-primary bg-background px-3 py-2 font-body text-[14px] text-primary outline-none"
        >
          {codepages.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] leading-snug text-muted-foreground">
          Если вместо русских букв печатаются знаки вопроса или «кракозябры» — выбери другую кодировку и нажми «Тест».
        </span>
      </label>
    )}
  </div>
);

export default TextModeSettings;

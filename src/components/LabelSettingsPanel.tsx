import Icon from '@/components/ui/icon';
import { LabelSettings, paperFormats } from '@/hooks/useLabelSettings';

interface LabelSettingsPanelProps {
  settings: LabelSettings;
  onChange: (patch: Partial<LabelSettings>) => void;
  onReset: () => void;
}

const toggles: { key: keyof LabelSettings; label: string }[] = [
  { key: 'showComposition', label: 'Состав' },
  { key: 'showWeight', label: 'Вес / объём' },
  { key: 'showBarcode', label: 'Штрих-код' },
  { key: 'showDate', label: 'Дата изготовления' },
  { key: 'showExpiry', label: 'Употребить до' },
  { key: 'showStorage', label: 'Температура' },
];

const LabelSettingsPanel = ({ settings, onChange, onReset }: LabelSettingsPanelProps) => {
  const handleLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ logo: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <div className="print-hide border-t-2 border-primary p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-head text-[0.7rem] font-medium uppercase tracking-[0.1em] text-primary">
          <Icon name="Settings2" size={14} strokeWidth={2.5} />
          Настройки ценника
        </span>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-muted-foreground underline-offset-4 hover:underline"
        >
          <Icon name="RotateCcw" size={13} strokeWidth={2.5} />
          Сбросить
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {paperFormats.map((paper) => {
          const active = settings.paper === paper.id;
          return (
            <button
              key={paper.id}
              onClick={() => onChange({ paper: paper.id })}
              className={`border-2 border-primary px-3 py-2 text-left transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
              }`}
            >
              <span className="block font-head text-[0.75rem] font-medium uppercase tracking-[0.04em]">
                {paper.label}
              </span>
              <span className={`block text-[11px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}>
                {paper.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {toggles.map((t) => {
          const active = Boolean(settings[t.key]);
          return (
            <button
              key={t.key}
              onClick={() => onChange({ [t.key]: !active } as Partial<LabelSettings>)}
              className={`flex items-center gap-1.5 border-2 border-primary px-3 py-1.5 font-head text-[0.7rem] font-medium uppercase tracking-[0.06em] transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon name={active ? 'Eye' : 'EyeOff'} size={14} strokeWidth={2.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {settings.showExpiry && (
        <label className="mt-3 flex items-center justify-between gap-3 border-2 border-primary px-3 py-2">
          <span className="font-head text-[0.7rem] font-medium uppercase tracking-[0.06em] text-primary">
            Срок хранения по умолчанию, ч
          </span>
          <input
            type="number"
            min={1}
            max={720}
            value={settings.shelfLifeHours}
            onChange={(e) => onChange({ shelfLifeHours: Math.max(1, Number(e.target.value) || 1) })}
            className="w-[70px] border-2 border-primary bg-card px-2 py-1 text-center font-head text-[15px] text-primary outline-none focus:bg-muted"
          />
        </label>
      )}

      {settings.showStorage && (
        <div className="mt-3 grid gap-2">
          <input
            value={settings.storageText}
            onChange={(e) => onChange({ storageText: e.target.value })}
            placeholder="Условия хранения"
            className="w-full border-2 border-primary bg-card px-3 py-2 font-body text-[14px] text-primary outline-none placeholder:text-muted-foreground focus:bg-muted"
          />
          <div className="flex flex-wrap gap-2">
            {['Хранить при +2…+6 °C', 'Хранить при -18 °C', 'Хранить при +18…+25 °C'].map((t) => (
              <button
                key={t}
                onClick={() => onChange({ storageText: t })}
                className="border-2 border-dashed border-primary px-2 py-1 text-[11px] text-primary transition-colors hover:bg-muted"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-2">
        <input
          value={settings.shopName}
          onChange={(e) => onChange({ shopName: e.target.value })}
          placeholder="Название магазина в шапке ценника"
          className="w-full border-2 border-primary bg-card px-3 py-2 font-body text-[14px] text-primary outline-none placeholder:text-muted-foreground focus:bg-muted"
        />
        <div className="flex items-center gap-2">
          {settings.logo && (
            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden border-2 border-primary bg-white">
              <img src={settings.logo} alt="" className="h-full w-full object-contain" />
            </div>
          )}
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 border-2 border-primary bg-card px-3 py-2 font-head text-[0.7rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-accent">
            <Icon name="ImagePlus" size={15} strokeWidth={2.5} />
            {settings.logo ? 'Заменить логотип' : 'Загрузить логотип'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogo(e.target.files?.[0])}
            />
          </label>
          {settings.logo && (
            <button
              onClick={() => onChange({ logo: '' })}
              aria-label="Убрать логотип"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center border-2 border-primary bg-card text-primary transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <Icon name="Trash2" size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LabelSettingsPanel;
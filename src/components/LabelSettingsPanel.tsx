import { useState } from 'react';
import Icon from '@/components/ui/icon';
import SoundPicker from '@/components/SoundPicker';
import { LabelSettings, paperFormats } from '@/hooks/useLabelSettings';

const staffFieldClass =
  'w-full border-2 border-primary bg-card px-3 py-2 font-body text-[14px] text-primary outline-none placeholder:text-muted-foreground focus:bg-muted';

interface LabelSettingsPanelProps {
  settings: LabelSettings;
  onChange: (patch: Partial<LabelSettings>) => void;
  onReset: () => void;
  staffOnly?: boolean;
}

const toggles: { key: keyof LabelSettings; label: string }[] = [
  { key: 'showComposition', label: 'Состав' },
  { key: 'showWeight', label: 'Вес / объём' },
  { key: 'showBarcode', label: 'Штрих-код' },
  { key: 'showDate', label: 'Дата изготовления' },
  { key: 'showExpiry', label: 'Годен до' },
  { key: 'showStorage', label: 'Температура' },
  { key: 'showStaff', label: 'Изготовил / проверил' },
];

const LabelSettingsPanel = ({
  settings,
  onChange,
  onReset,
  staffOnly = false,
}: LabelSettingsPanelProps) => {
  const [newStaff, setNewStaff] = useState('');

  const addStaff = () => {
    const name = newStaff.trim();
    if (!name || settings.staffList.includes(name)) return;
    onChange({ staffList: [...settings.staffList, name] });
    setNewStaff('');
  };

  const removeStaff = (name: string) => {
    onChange({
      staffList: settings.staffList.filter((n) => n !== name),
      makerName: settings.makerName === name ? '' : settings.makerName,
      checkerName: settings.checkerName === name ? '' : settings.checkerName,
    });
  };

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
          <Icon name={staffOnly ? 'Users' : 'Settings2'} size={14} strokeWidth={2.5} />
          {staffOnly ? 'Кто изготовил и проверил' : 'Настройки маркировки'}
        </span>
        {!staffOnly && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-muted-foreground underline-offset-4 hover:underline"
          >
            <Icon name="RotateCcw" size={13} strokeWidth={2.5} />
            Сбросить
          </button>
        )}
      </div>

      {!staffOnly && (
        <>
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

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { value: 'browser' as const, label: 'Печать браузером', hint: 'Обычный принтер' },
          { value: 'bartender' as const, label: 'BarTender', hint: 'Файл задания в папку' },
        ].map((mode) => {
          const active = settings.printMode === mode.value;
          return (
            <button
              key={mode.value}
              onClick={() => onChange({ printMode: mode.value })}
              className={`flex items-center gap-2 border-2 border-primary px-3 py-2 text-left transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
              }`}
            >
              <Icon
                name={mode.value === 'bartender' ? 'FileDown' : 'Printer'}
                size={16}
                strokeWidth={2.5}
                className="shrink-0"
              />
              <span>
                <span className="block font-head text-[0.75rem] font-medium uppercase tracking-[0.04em]">
                  {mode.label}
                </span>
                <span
                  className={`block text-[11px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}
                >
                  {mode.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {settings.printMode === 'bartender' && (
        <div className="mt-3 grid gap-2 border-2 border-dashed border-primary p-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Сайт сохраняет файл задания. Укажите папку загрузок как отслеживаемую в BarTender
            Commander — программа сама подхватит файл и напечатает этикетку.
          </p>
          <label className="grid gap-1">
            <span className="font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary">
              Шаблон BarTender (.btw)
            </span>
            <input
              value={settings.bartenderTemplate}
              onChange={(e) => onChange({ bartenderTemplate: e.target.value })}
              placeholder="cennik.btw"
              className={staffFieldClass}
            />
          </label>
          <label className="grid gap-1">
            <span className="font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary">
              Имя принтера в Windows
            </span>
            <input
              value={settings.bartenderPrinter}
              onChange={(e) => onChange({ bartenderPrinter: e.target.value })}
              placeholder="Например, TSC TE200"
              className={staffFieldClass}
            />
          </label>
        </div>
      )}

      {settings.printMode === 'browser' && (
        <div className="mt-3 grid gap-1.5 border-2 border-dashed border-primary p-3">
          <span className="flex items-center gap-2 font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary">
            <Icon name="Zap" size={13} strokeWidth={2.5} />
            Печать без окна подтверждения
          </span>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Окно печати рисует сам браузер, сайт его закрыть не может. Отключается один раз в
            Windows:
          </p>
          <ol className="grid gap-1 pl-4 text-[11px] leading-snug text-muted-foreground">
            <li className="list-decimal">Закройте все окна Chrome или Edge.</li>
            <li className="list-decimal">
              Правой кнопкой по ярлыку браузера на рабочем столе → «Свойства».
            </li>
            <li className="list-decimal">
              В поле «Объект» в самый конец, после кавычек, через пробел добавьте{' '}
              <code className="border border-primary bg-card px-1 text-primary">
                --kiosk-printing
              </code>
            </li>
            <li className="list-decimal">
              Сохраните и запускайте сайт только с этого ярлыка. Печать пойдёт сразу на принтер по
              умолчанию.
            </li>
          </ol>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Заранее сделайте нужный принтер принтером по умолчанию в «Устройства и принтеры».
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { value: false, label: 'Обычная 0°', hint: 'Печать вдоль листа' },
          { value: true, label: 'Поворот 90°', hint: 'Печать поперёк ленты' },
        ].map((mode) => {
          const active = settings.rotate90 === mode.value;
          return (
            <button
              key={mode.label}
              onClick={() => onChange({ rotate90: mode.value })}
              className={`flex items-center gap-2 border-2 border-primary px-3 py-2 text-left transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
              }`}
            >
              <Icon
                name={mode.value ? 'RotateCw' : 'AlignVerticalJustifyCenter'}
                size={16}
                strokeWidth={2.5}
                className="shrink-0"
              />
              <span>
                <span className="block font-head text-[0.75rem] font-medium uppercase tracking-[0.04em]">
                  {mode.label}
                </span>
                <span
                  className={`block text-[11px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}
                >
                  {mode.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-2 border-dashed border-primary p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary">
            <Icon name="Move" size={13} strokeWidth={2.5} />
            Подстройка печати под принтер
          </span>
          <button
            onClick={() => onChange({ offsetXmm: 0, offsetYmm: 0 })}
            className="font-head text-[0.6rem] font-medium uppercase tracking-[0.06em] text-muted-foreground underline-offset-4 hover:underline"
          >
            Обнулить
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Минус — влево и вверх, плюс — вправо и вниз. Шаг 0,5 мм.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { key: 'offsetXmm' as const, label: 'Сдвиг ←→, мм', icon: 'MoveHorizontal' },
            { key: 'offsetYmm' as const, label: 'Сдвиг ↑↓, мм', icon: 'MoveVertical' },
          ].map((f) => {
            const value = Number(settings[f.key]) || 0;
            const setValue = (v: number) =>
              onChange({ [f.key]: Math.round(Math.min(20, Math.max(-20, v)) * 10) / 10 } as Partial<LabelSettings>);
            return (
              <div key={f.key} className="border-2 border-primary bg-card p-2">
                <span className="flex items-center gap-1.5 font-head text-[0.6rem] font-medium uppercase tracking-[0.06em] text-primary">
                  <Icon name={f.icon} size={12} strokeWidth={2.5} />
                  {f.label}
                </span>
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    onClick={() => setValue(value - 0.5)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-primary bg-card text-primary hover:bg-muted"
                    aria-label="Уменьшить"
                  >
                    <Icon name="Minus" size={14} strokeWidth={3} />
                  </button>
                  <input
                    type="number"
                    step={0.5}
                    min={-20}
                    max={20}
                    value={value}
                    onChange={(e) => setValue(Number(e.target.value) || 0)}
                    className="h-8 w-full min-w-0 border-2 border-primary bg-card px-1 text-center font-head text-[15px] text-primary outline-none focus:bg-muted"
                  />
                  <button
                    onClick={() => setValue(value + 0.5)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-primary bg-card text-primary hover:bg-muted"
                    aria-label="Увеличить"
                  >
                    <Icon name="Plus" size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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

      <SoundPicker
        title="Сигнал: меньше часа до конца срока"
        icon="BellRing"
        value={settings.alertTune}
        onChange={(alertTune) => onChange({ alertTune })}
      />

      <SoundPicker
        title="Сигнал: срок годности вышел"
        icon="AlarmClockOff"
        value={settings.expiredTune}
        onChange={(expiredTune) => onChange({ expiredTune })}
      />
        </>
      )}

      {(staffOnly || settings.showStaff) && (
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary">
                Изготовил
              </span>
              <select
                value={settings.makerName}
                onChange={(e) => onChange({ makerName: e.target.value })}
                className={staffFieldClass}
              >
                <option value="">Не выбрано</option>
                {settings.staffList.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] text-primary">
                Проверил
              </span>
              <select
                value={settings.checkerName}
                onChange={(e) => onChange({ checkerName: e.target.value })}
                className={staffFieldClass}
              >
                <option value="">Не выбрано</option>
                {settings.staffList.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <input
              value={newStaff}
              onChange={(e) => setNewStaff(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStaff()}
              placeholder="Добавить фамилию в список"
              className={staffFieldClass}
            />
            <button
              onClick={addStaff}
              aria-label="Добавить сотрудника"
              className="flex w-[42px] shrink-0 items-center justify-center border-2 border-primary bg-accent text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              <Icon name="Plus" size={16} strokeWidth={3} />
            </button>
          </div>

          {settings.staffList.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {settings.staffList.map((n) => (
                <span
                  key={n}
                  className="flex items-center gap-1 border-2 border-dashed border-primary px-2 py-1 text-[11px] text-primary"
                >
                  {n}
                  <button
                    onClick={() => removeStaff(n)}
                    aria-label={`Убрать ${n}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Icon name="X" size={12} strokeWidth={3} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!staffOnly && settings.showStorage && (
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

      {!staffOnly && (
      <div className="mt-3 grid gap-2">
        <input
          value={settings.shopName}
          onChange={(e) => onChange({ shopName: e.target.value })}
          placeholder="Название магазина в шапке маркировки"
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
      )}
    </div>
  );
};

export default LabelSettingsPanel;
import { RefObject } from 'react';
import Icon from '@/components/ui/icon';

interface MenuToolbarProps {
  searchRef: RefObject<HTMLLabelElement>;
  query: string;
  setQuery: (value: string) => void;
  setKeyboardOpen: (value: boolean) => void;
  editMode: boolean;
  isAdmin: boolean;
  onRequestAdmin: () => void;
  setEditMode: (updater: (v: boolean) => boolean) => void;
  onDefrost: () => void;
  onlyExpired: boolean;
  setOnlyExpired: (updater: boolean | ((v: boolean) => boolean)) => void;
  onlySoon: boolean;
  setOnlySoon: (updater: boolean | ((v: boolean) => boolean)) => void;
  expiredCount: number;
  soonCount: number;
  visibleCount: number;
  onPrintBatchClick: () => void;
}

const MenuToolbar = ({
  searchRef,
  query,
  setQuery,
  setKeyboardOpen,
  editMode,
  isAdmin,
  onRequestAdmin,
  setEditMode,
  onDefrost,
  onlyExpired,
  setOnlyExpired,
  onlySoon,
  setOnlySoon,
  expiredCount,
  soonCount,
  visibleCount,
  onPrintBatchClick,
}: MenuToolbarProps) => (
  <>
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div>
        {editMode && (
          <h2 className="mt-3 font-head text-[34px] font-medium uppercase leading-[1.04] text-primary md:text-[52px]">
            Редактирование и добавление позиций
          </h2>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
        <label
          ref={searchRef}
          className="flex w-full items-center gap-3 border-2 border-primary bg-card px-3 py-3 md:w-[340px]"
        >
          <Icon name="Search" size={20} className="text-primary" strokeWidth={2.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setKeyboardOpen(true)}
            onClick={() => setKeyboardOpen(true)}
            placeholder="Поиск по названию"
            className="w-full bg-transparent font-body text-[15px] text-primary outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setKeyboardOpen(false);
              }}
              aria-label="Очистить поиск"
            >
              <Icon name="X" size={18} className="text-muted-foreground" />
            </button>
          )}
        </label>

        <button
          onClick={() => {
            if (!isAdmin) {
              onRequestAdmin();
              return;
            }
            setEditMode((v) => !v);
          }}
          className={`flex shrink-0 items-center justify-center gap-2 border-2 border-primary px-4 py-3 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors ${
            editMode ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
          }`}
        >
          <Icon
            name={editMode ? 'Check' : isAdmin ? 'SlidersHorizontal' : 'Lock'}
            size={16}
            strokeWidth={2.5}
          />
          {editMode ? 'Готово' : 'Редактировать'}
        </button>
      </div>
    </div>

    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <button
        onClick={() => {
          setKeyboardOpen(false);
          onDefrost();
        }}
        className="flex items-center justify-center gap-3 border-2 border-primary bg-card px-6 py-4 font-head text-[0.95rem] font-medium uppercase tracking-[0.06em] text-primary transition-transform hover:-translate-y-0.5 hover:bg-muted"
      >
        <Icon name="Snowflake" size={20} strokeWidth={2.5} />
        Дефрост
      </button>

      <button
        onClick={() => {
          setKeyboardOpen(false);
          setOnlySoon(false);
          setOnlyExpired((v) => !v);
        }}
        disabled={!expiredCount && !onlyExpired}
        className={`flex items-center justify-center gap-3 border-2 px-6 py-4 font-head text-[0.95rem] font-medium uppercase tracking-[0.06em] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${
          onlyExpired
            ? 'border-destructive bg-destructive text-destructive-foreground'
            : 'border-destructive bg-card text-destructive'
        }`}
      >
        <Icon name={onlyExpired ? 'ListRestart' : 'AlarmClock'} size={20} strokeWidth={2.5} />
        {onlyExpired ? 'Показать все' : 'Только просроченные'}
        <span className="border-l-2 border-current pl-3 tabular-nums">{expiredCount}</span>
      </button>

      <button
        onClick={() => {
          setKeyboardOpen(false);
          setOnlyExpired(false);
          setOnlySoon((v) => !v);
        }}
        disabled={!soonCount && !onlySoon}
        className={`flex items-center justify-center gap-3 border-2 border-primary px-6 py-4 font-head text-[0.95rem] font-medium uppercase tracking-[0.06em] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${
          onlySoon ? 'bg-accent text-accent-foreground' : 'bg-card text-primary'
        }`}
      >
        <Icon name={onlySoon ? 'ListRestart' : 'Timer'} size={20} strokeWidth={2.5} />
        {onlySoon ? 'Показать все' : 'Скоро истекает'}
        <span className="border-l-2 border-current pl-3 tabular-nums">{soonCount}</span>
      </button>

      <button
        onClick={onPrintBatchClick}
        disabled={!visibleCount}
        className="flex items-center justify-center gap-3 border-2 border-primary bg-accent px-6 py-4 font-head text-[0.95rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 md:text-[1.05rem]"
      >
        <Icon name="Printer" size={20} strokeWidth={2.5} />
        {onlyExpired
          ? 'Печатать просроченные'
          : onlySoon
            ? 'Печатать истекающие'
            : 'Печатать всю категорию'}
        <span className="border-l-2 border-accent-foreground/40 pl-3">{visibleCount}</span>
      </button>
    </div>
  </>
);

export default MenuToolbar;

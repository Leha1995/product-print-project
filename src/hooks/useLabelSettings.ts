import { useCallback, useEffect, useState } from 'react';

export type PaperId = 'label43x25' | 'roll58' | 'roll80' | 'label58x40' | 'a6';

export interface PaperFormat {
  id: PaperId;
  label: string;
  hint: string;
  widthMm: number;
  heightMm?: number;
}

export const paperFormats: PaperFormat[] = [
  {
    id: 'label43x25',
    label: 'Лента 43×25',
    hint: 'Мелкая этикетка на упаковку',
    widthMm: 43,
    heightMm: 25,
  },
  { id: 'roll58', label: 'Лента 58 мм', hint: 'Компактный чековый принтер', widthMm: 58 },
  { id: 'roll80', label: 'Лента 80 мм', hint: 'Стандарт кассовой ленты', widthMm: 80 },
  {
    id: 'label58x40',
    label: 'Этикетка 58×40',
    hint: 'Термоэтикетка на полку',
    widthMm: 58,
    heightMm: 40,
  },
  { id: 'a6', label: 'A6 (105×148)', hint: 'Крупная маркировка на витрину', widthMm: 105, heightMm: 148 },
];

export interface LabelSettings {
  paper: PaperId;
  rotate90: boolean;
  showComposition: boolean;
  showWeight: boolean;
  showBarcode: boolean;
  showDate: boolean;
  showExpiry: boolean;
  showStorage: boolean;
  storageText: string;
  showStaff: boolean;
  makerName: string;
  checkerName: string;
  staffList: string[];
  shelfLifeHours: number;
  logo: string;
  shopName: string;
  printMode: 'browser' | 'bartender';
  bartenderTemplate: string;
  bartenderPrinter: string;
}

export const defaultLabelSettings: LabelSettings = {
  paper: 'roll80',
  rotate90: false,
  showComposition: true,
  showWeight: true,
  showBarcode: true,
  showDate: true,
  showExpiry: true,
  showStorage: true,
  storageText: 'Хранить при +2…+6 °C',
  showStaff: true,
  makerName: '',
  checkerName: '',
  staffList: ['Иванова А.', 'Петров С.', 'Смирнова О.', 'Кузнецов Д.'],
  shelfLifeHours: 24,
  logo: '',
  shopName: 'Автосуши Автопицца',
  printMode: 'browser',
  bartenderTemplate: 'cennik.btw',
  bartenderPrinter: '',
};

const STORAGE_KEY = 'asap-label-settings-v1';

export const getPaper = (id: PaperId) =>
  paperFormats.find((p) => p.id === id) ?? paperFormats.find((p) => p.id === 'roll80')!;

export const useLabelSettings = () => {
  const [settings, setSettings] = useState<LabelSettings>(defaultLabelSettings);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...defaultLabelSettings, ...JSON.parse(raw) });
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const paper = getPaper(settings.paper);
    const root = document.documentElement;
    root.style.setProperty('--label-width', `${paper.widthMm}mm`);
    root.style.setProperty('--label-height', paper.heightMm ? `${paper.heightMm}mm` : 'auto');
  }, [settings.paper]);

  const update = useCallback((patch: Partial<LabelSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(defaultLabelSettings);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return { settings, update, reset };
};

export default useLabelSettings;
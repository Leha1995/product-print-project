import { useCallback, useEffect, useState } from 'react';

export type PaperId = 'label43x25';

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
    label: 'Этикетка 43×25',
    hint: 'Мелкая этикетка на упаковку',
    widthMm: 43,
    heightMm: 25,
  },
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
  printMode: 'browser' | 'bartender' | 'network' | 'rawbt' | 'share';
  netPrinterId: string;
  netGapMm: number;
  netDensity: number;
  netFlip: boolean;
  bartenderTemplate: string;
  bartenderPrinter: string;
  offsetXmm: number;
  offsetYmm: number;
  alertTune: string;
  expiredTune: string;
}

export const defaultLabelSettings: LabelSettings = {
  paper: 'label43x25',
  rotate90: false,
  showComposition: true,
  showWeight: true,
  showBarcode: true,
  showDate: true,
  showExpiry: true,
  showStorage: true,
  storageText: 'Хранить при +2…+4 °C',
  showStaff: true,
  makerName: '',
  checkerName: '',
  staffList: ['Иванова А.', 'Петров С.', 'Смирнова О.', 'Кузнецов Д.'],
  shelfLifeHours: 24,
  logo: '',
  shopName: 'Автосуши Автопицца',
  printMode: 'browser',
  netPrinterId: '',
  netGapMm: 2,
  netDensity: 8,
  netFlip: false,
  bartenderTemplate: 'cennik.btw',
  bartenderPrinter: '',
  offsetXmm: 0,
  offsetYmm: 0,
  alertTune: 'march',
  expiredTune: 'funeral',
};

const STORAGE_KEY = 'asap-label-settings-v1';

export const getPaper = (_id?: PaperId) => paperFormats[0];

export const useLabelSettings = () => {
  const [settings, setSettings] = useState<LabelSettings>(defaultLabelSettings);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...defaultLabelSettings, ...JSON.parse(raw), paper: 'label43x25' });
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
      const next = { ...prev, ...patch, paper: 'label43x25' as PaperId };
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
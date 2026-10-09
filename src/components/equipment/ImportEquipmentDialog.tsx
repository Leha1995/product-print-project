import { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Equipment, saveEquipmentBatch } from '@/lib/equipmentApi';
import {
  IMPORT_COLUMNS,
  ImportRow,
  SAMPLE_ROWS,
  downloadImportTemplate,
  parseEquipmentFile,
} from '@/lib/equipmentImport';
import { toast } from '@/hooks/use-toast';

interface ImportEquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: Equipment[];
  onDone: (items: Equipment[]) => void;
}

const BATCH = 40;

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;
const day = (iso?: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('ru-RU') : '—';

const btn =
  'flex items-center justify-center gap-2 border-2 border-primary px-3 py-2.5 font-head text-[0.75rem] font-bold uppercase transition-colors';

const ImportEquipmentDialog = ({ open, onOpenChange, existing, onDone }: ImportEquipmentDialogProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setRows(null);
    setFileName('');
    setMissing([]);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const pick = async (file?: File) => {
    if (!file) return;
    try {
      const res = await parseEquipmentFile(file);
      setRows(res.rows);
      setMissing(res.missingColumns);
      setFileName(file.name);
    } catch {
      toast({ title: 'Не удалось прочитать файл', description: 'Нужен файл Excel (.xlsx, .xls) или .csv' });
      reset();
    }
  };

  const existingKeys = new Set(
    existing.filter((e) => e.active && e.serial).map((e) => e.serial.trim().toLowerCase()),
  );
  const good = (rows ?? []).filter((r) => !r.errors.length);
  const bad = (rows ?? []).filter((r) => r.errors.length);
  const dupes = good.filter((r) => r.item.serial && existingKeys.has(r.item.serial.toLowerCase()));
  const total = good.reduce((s, r) => s + (r.item.price || 0), 0);

  const run = async () => {
    if (!good.length) return;
    setBusy(true);
    setProgress(0);
    let saved = 0;
    let last: Equipment[] | null = null;
    try {
      for (let i = 0; i < good.length; i += BATCH) {
        const part = good.slice(i, i + BATCH).map((r) => r.item);
        const res = await saveEquipmentBatch(part);
        saved += res.saved ?? part.length;
        last = res.items;
        setProgress(Math.min(good.length, i + part.length));
      }
      if (last) onDone(last);
      toast({ title: `Загружено оборудования: ${saved}`, description: `На сумму ${money(total)}` });
      reset();
      onOpenChange(false);
    } catch {
      if (last) onDone(last);
      toast({
        title: 'Загрузка прервалась',
        description: `Сохранено ${saved} из ${good.length}. Проверь интернет и загрузи оставшиеся.`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-[860px] overflow-y-auto border-2 border-primary bg-background p-5">
        <h3 className="font-head text-xl font-black uppercase text-primary">Загрузка оборудования из Excel</h3>

        {!rows && (
          <>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Первая строка — заголовки. Обязательна только колонка «Название», остальные можно оставить
              пустыми. Порядок колонок любой.
            </p>

            <div className="mt-3 overflow-x-auto border-2 border-primary">
              <table className="w-full min-w-[640px] text-[12px]">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    {IMPORT_COLUMNS.map((c) => (
                      <th key={c} className="px-2 py-1.5 text-left font-head font-bold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_ROWS.map((r, i) => (
                    <tr key={i} className="border-t border-primary/30 text-foreground">
                      {r.map((v, j) => (
                        <td key={j} className="px-2 py-1.5">
                          {v === '' ? <span className="text-muted-foreground">—</span> : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-2 space-y-0.5 text-[12px] text-muted-foreground">
              <li>• Стоимость и амортизация — числа в рублях, можно с копейками через запятую.</li>
              <li>• Дата — ДД.ММ.ГГГГ. Без даты амортизация не начисляется.</li>
              <li>• QR-код каждой позиции создастся автоматически.</li>
            </ul>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={downloadImportTemplate} className={`${btn} bg-card text-primary hover:bg-muted`}>
                <Icon name="Download" size={16} strokeWidth={2.5} />
                Скачать шаблон
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                className={`${btn} bg-accent text-accent-foreground hover:brightness-95`}
              >
                <Icon name="Upload" size={16} strokeWidth={2.5} />
                Выбрать файл Excel
              </button>
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        {rows && (
          <>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Файл: <span className="font-semibold text-foreground">{fileName}</span>
            </p>

            {missing.length > 0 ? (
              <div className="mt-3 border-2 border-destructive bg-card p-3 text-[13px] text-destructive">
                Не найдена колонка «{missing.join('», «')}». Проверь, что первая строка — заголовки, как в
                шаблоне.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="border-2 border-primary bg-card p-2.5">
                  <div className="text-[11px] uppercase text-muted-foreground">Готово к загрузке</div>
                  <div className="font-head text-xl font-black text-primary">{good.length}</div>
                </div>
                <div className="border-2 border-primary bg-card p-2.5">
                  <div className="text-[11px] uppercase text-muted-foreground">На сумму</div>
                  <div className="font-head text-xl font-black text-primary">{money(total)}</div>
                </div>
                <div className={`border-2 bg-card p-2.5 ${bad.length ? 'border-destructive' : 'border-primary'}`}>
                  <div className="text-[11px] uppercase text-muted-foreground">С ошибками (пропустим)</div>
                  <div className={`font-head text-xl font-black ${bad.length ? 'text-destructive' : 'text-primary'}`}>
                    {bad.length}
                  </div>
                </div>
              </div>
            )}

            {dupes.length > 0 && (
              <p className="mt-2 text-[12px] text-destructive">
                {`Серийные номера уже есть в списке у ${dupes.length} поз. — они добавятся ещё раз как новые.`}
              </p>
            )}

            {rows.length > 0 && (
              <div className="mt-3 max-h-[46vh] overflow-auto border-2 border-primary">
                <table className="w-full min-w-[720px] text-[12px]">
                  <thead className="sticky top-0">
                    <tr className="bg-primary text-primary-foreground">
                      <th className="px-2 py-1.5 text-left">Стр.</th>
                      <th className="px-2 py-1.5 text-left">Название</th>
                      <th className="px-2 py-1.5 text-right">Стоимость</th>
                      <th className="px-2 py-1.5 text-left">Место</th>
                      <th className="px-2 py-1.5 text-left">Серийный №</th>
                      <th className="px-2 py-1.5 text-left">С</th>
                      <th className="px-2 py-1.5 text-right">Аморт./день</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.line}
                        className={`border-t border-primary/30 ${r.errors.length ? 'bg-destructive/10' : ''}`}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
                        <td className="px-2 py-1.5 text-foreground">
                          {r.item.name || '—'}
                          {r.errors.length > 0 && (
                            <div className="text-[11px] text-destructive">{r.errors.join(', ')}</div>
                          )}
                          {!r.errors.length && r.warnings.length > 0 && (
                            <div className="text-[11px] text-muted-foreground">{r.warnings.join(', ')}</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right text-foreground">
                          {r.item.price ? money(r.item.price) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-foreground">{r.item.location || '—'}</td>
                        <td className="px-2 py-1.5 text-foreground">{r.item.serial || '—'}</td>
                        <td className="px-2 py-1.5 text-foreground">{day(r.item.commissionedAt)}</td>
                        <td className="px-2 py-1.5 text-right text-foreground">
                          {r.item.depreciationPerDay ? `${r.item.depreciationPerDay.toLocaleString('ru-RU')} ₽` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length === 0 && !missing.length && (
              <p className="mt-3 text-[13px] text-destructive">В файле нет строк с оборудованием.</p>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={reset} disabled={busy} className={`${btn} bg-card text-primary hover:bg-muted disabled:opacity-50`}>
                <Icon name="RotateCcw" size={16} strokeWidth={2.5} />
                Другой файл
              </button>
              <button
                onClick={run}
                disabled={busy || !good.length || missing.length > 0}
                className={`${btn} bg-accent text-accent-foreground hover:brightness-95 disabled:opacity-50`}
              >
                <Icon name={busy ? 'Loader2' : 'Check'} size={16} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} />
                {busy ? `Загружаю ${progress} из ${good.length}` : `Загрузить ${good.length} шт.`}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportEquipmentDialog;

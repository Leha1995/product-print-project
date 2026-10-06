import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import { TransferRecord, fetchAccountantTransfers } from '@/lib/equipmentApi';
import usePeriod from '@/hooks/usePeriod';
import PeriodPicker from '@/components/PeriodPicker';

const money = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₽`;
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

const STATUS: Record<TransferRecord['status'], { label: string; cls: string }> = {
  pending: { label: 'Ждёт подтверждения', cls: 'border-warning bg-warning text-warning-foreground' },
  accepted: { label: 'Подтверждено', cls: 'border-success bg-success text-success-foreground' },
  declined: { label: 'Отклонено', cls: 'border-destructive bg-destructive text-destructive-foreground' },
  cancelled: { label: 'Отменено', cls: 'border-primary bg-background text-muted-foreground' },
};

const AccountantTransfersPanel = () => {
  const period = usePeriod();
  const { range, invalid } = period;
  const [list, setList] = useState<TransferRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (invalid) return;
    setLoading(true);
    try {
      setList(await fetchAccountantTransfers(range?.from, range?.to));
    } catch {
      toast({ title: 'Не удалось загрузить перемещения', description: 'Проверьте интернет и обновите' });
    } finally {
      setLoading(false);
    }
  }, [range?.from, range?.to, invalid]);

  useEffect(() => {
    load();
  }, [load]);

  const items = list || [];
  const count = (s: TransferRecord['status']) => items.filter((t) => t.status === s).length;

  const download = () => {
    if (!items.length) {
      toast({ title: 'За период перемещений нет' });
      return;
    }
    const rows: (string | number)[][] = [
      [`Перемещения оборудования · ${range ? range.label : 'всё время'}`],
      [],
      ['Дата', 'Оборудование', 'QR-код', 'Стоимость, ₽', 'Откуда', 'Кому', 'Переместил', 'Статус', 'Дата решения', 'Решение принял'],
      ...items.map((t) => [
        when(t.createdAt),
        t.name,
        t.code,
        Math.round(t.price),
        t.fromName,
        t.toName,
        t.createdByName,
        STATUS[t.status]?.label || t.status,
        when(t.decidedAt),
        t.decidedByName,
      ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    for (let c = 0; c < 10; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 2, c })];
      if (cell)
        cell.s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: '1F2937' } },
          alignment: { wrapText: true, vertical: 'center' },
        };
    }
    const title = sheet.A1;
    if (title) title.s = { font: { bold: true, sz: 13 } };
    sheet['!cols'] = [17, 30, 22, 13, 22, 22, 20, 20, 17, 20].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Перемещения');
    XLSX.writeFile(book, `Перемещения_${range ? range.label.replace(/[^\dа-яА-Яa-zA-Z.-]+/g, '_') : 'всё_время'}.xlsx`);
    toast({ title: 'Файл выгружен', description: range ? range.label : 'За всё время' });
  };

  return (
    <section className="print-hide border-b-2 border-primary bg-background px-4 py-4 md:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setExpanded((v) => !v)} className="min-w-0 text-left">
            <p className="flex items-center gap-2 font-head text-[0.85rem] font-black uppercase text-primary">
              <Icon name="ArrowRightLeft" size={18} strokeWidth={2.5} />
              Перемещения оборудования
              {loading && <Icon name="Loader2" size={14} className="animate-spin" />}
              <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={18} strokeWidth={2.5} />
            </p>
            <p className="text-[12px] text-muted-foreground">
              {`${range ? range.label : 'Всё время'}: всего ${items.length} · подтверждено ${count('accepted')} · ждут ${count('pending')} · отклонено ${count('declined')}`}
            </p>
          </button>
          <button
            onClick={download}
            disabled={loading || invalid || !list}
            className="flex min-h-[44px] items-center gap-2 border-2 border-primary bg-success px-4 py-2 font-head text-[0.78rem] font-black uppercase text-success-foreground shadow-[3px_3px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon name="FileSpreadsheet" size={18} strokeWidth={2.5} />
            Excel перемещений
          </button>
        </div>

        {expanded && (
          <>
            <PeriodPicker period={period} />
            {items.length ? (
              <div className="grid gap-1.5">
                {items.map((t) => {
                  const st = STATUS[t.status] || STATUS.cancelled;
                  return (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-2 border-primary bg-card px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-head text-[0.8rem] font-bold uppercase text-primary">
                          {t.name || 'Оборудование'}
                          {t.price > 0 && <span className="ml-2 font-black">{money(t.price)}</span>}
                        </p>
                        <p className="flex flex-wrap items-center gap-1 text-[13px] text-primary">
                          {t.fromName}
                          <Icon name="ArrowRight" size={14} strokeWidth={2.5} />
                          {t.toName}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          {`${when(t.createdAt)}${t.createdByName ? ` · переместил ${t.createdByName}` : ''}`}
                          {t.decidedAt && t.status !== 'pending' && ` · решение ${when(t.decidedAt)}`}
                          {t.code && ` · ${t.code}`}
                        </p>
                      </div>
                      <span className={`shrink-0 border-2 px-2 py-0.5 font-head text-[0.62rem] font-bold uppercase ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {loading ? 'Загрузка…' : 'За выбранный период перемещений нет'}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default AccountantTransfersPanel;

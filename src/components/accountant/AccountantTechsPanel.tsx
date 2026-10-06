import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import { AccountantTech, fetchAccountantTechs } from '@/lib/equipmentApi';
import { exportTechReport, techTotals } from '@/lib/techReportExport';
import usePeriod from '@/hooks/usePeriod';
import PeriodPicker from '@/components/PeriodPicker';
import TaskCard from '@/components/equipment/TaskCard';

const money = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₽`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');

type Tab = 'open' | 'done' | 'repairs';

const AccountantTechsPanel = () => {
  const period = usePeriod();
  const { range, invalid } = period;
  const [techs, setTechs] = useState<AccountantTech[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('open');

  const load = useCallback(async () => {
    if (invalid) return;
    setLoading(true);
    try {
      setTechs(await fetchAccountantTechs(range?.from, range?.to));
    } catch {
      toast({ title: 'Не удалось загрузить техников', description: 'Проверьте интернет и обновите' });
    } finally {
      setLoading(false);
    }
  }, [range?.from, range?.to, invalid]);

  useEffect(() => {
    load();
  }, [load]);

  const download = () => {
    if (!techs?.length) {
      toast({ title: 'Нет закреплённых техников' });
      return;
    }
    exportTechReport(techs, range);
    toast({ title: 'Файл выгружен', description: range ? range.label : 'За всё время' });
  };

  if (techs && !techs.length) return null;

  const totals = (techs || []).map(techTotals).reduce(
    (a, x) => ({ done: a.done + x.doneCount, open: a.open + x.openCount, total: a.total + x.total }),
    { done: 0, open: 0, total: 0 },
  );

  return (
    <section className="print-hide border-b-2 border-primary bg-background px-4 py-4 md:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-head text-[0.85rem] font-black uppercase text-primary">
              <Icon name="Wrench" size={18} strokeWidth={2.5} />
              Мои техники
              {loading && <Icon name="Loader2" size={14} className="animate-spin" />}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {`${range ? range.label : 'Всё время'}: выполнено ${totals.done} · потрачено ${money(totals.total)} · открытых заявок сейчас ${totals.open}`}
            </p>
          </div>
          <button
            onClick={download}
            disabled={loading || invalid || !techs}
            className="flex min-h-[44px] items-center gap-2 border-2 border-primary bg-success px-4 py-2 font-head text-[0.78rem] font-black uppercase text-success-foreground shadow-[3px_3px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Icon name="FileSpreadsheet" size={18} strokeWidth={2.5} />
            Excel по техникам
          </button>
        </div>

        <PeriodPicker period={period} />

        <div className="grid gap-2">
          {(techs || []).map((t) => {
            const x = techTotals(t);
            const expanded = openId === t.id;
            return (
              <div key={t.id} className="border-2 border-primary bg-card">
                <button
                  onClick={() => setOpenId(expanded ? null : t.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                >
                  <span className="font-head text-[0.85rem] font-black uppercase text-primary">{t.name}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="border-2 border-warning bg-warning px-1.5 py-0.5 font-bold text-warning-foreground">
                      {`Открыто: ${x.openCount}`}
                    </span>
                    <span className="border-2 border-success bg-success px-1.5 py-0.5 font-bold text-success-foreground">
                      {`Выполнено: ${x.doneCount}`}
                    </span>
                    <span className="border-2 border-primary bg-background px-1.5 py-0.5 font-bold text-primary">
                      {money(x.total)}
                    </span>
                    <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={18} strokeWidth={2.5} className="text-primary" />
                  </span>
                </button>

                {expanded && (
                  <div className="border-t-2 border-primary p-3">
                    <div className="mb-3 grid grid-cols-3 border-2 border-primary">
                      {(
                        [
                          ['open', `Заявки · ${x.openCount}`],
                          ['done', `Выполнено · ${x.doneCount}`],
                          ['repairs', `Ремонты · ${x.repairsCount}`],
                        ] as const
                      ).map(([key, text]) => (
                        <button
                          key={key}
                          onClick={() => setTab(key)}
                          className={`px-2 py-2 font-head text-[0.68rem] font-bold uppercase transition-colors ${
                            tab === key ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
                          }`}
                        >
                          {text}
                        </button>
                      ))}
                    </div>

                    {tab === 'open' &&
                      (t.open.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {t.open.map((task) => (
                            <TaskCard key={task.id} task={task} showOwner />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[13px] text-muted-foreground">Открытых заявок нет</p>
                      ))}

                    {tab === 'done' &&
                      (t.done.length ? (
                        <>
                          <p className="mb-2 text-[12px] font-bold text-primary">
                            {`По задачам потрачено: ${money(x.tasksCost)}`}
                          </p>
                          <div className="grid gap-2 md:grid-cols-2">
                            {t.done.map((task) => (
                              <TaskCard key={task.id} task={task} showOwner />
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-[13px] text-muted-foreground">За период выполненных задач нет</p>
                      ))}

                    {tab === 'repairs' &&
                      (t.repairs.length ? (
                        <div className="grid gap-1">
                          {t.repairs.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-center justify-between gap-3 border-2 border-primary bg-background px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-head text-[0.75rem] font-bold uppercase text-primary">
                                  {[r.ownerName, r.equipmentName].filter(Boolean).join(' · ')}
                                </p>
                                <p className="truncate text-[12px] text-muted-foreground">
                                  {`${day(r.sentAt)} → ${day(r.returnedAt)}${r.description ? ` · ${r.description}` : ''}`}
                                </p>
                              </div>
                              <span className="shrink-0 font-head text-[0.8rem] font-black text-primary">{money(r.cost)}</span>
                            </div>
                          ))}
                          <p className="mt-1 text-right text-[12px] font-bold text-primary">
                            {`Итого на ремонт оборудования: ${money(x.repairsCost)}`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[13px] text-muted-foreground">За период ремонтов нет</p>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AccountantTechsPanel;

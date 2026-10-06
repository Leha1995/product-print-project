import Icon from '@/components/ui/icon';
import { TechMonthStats } from '@/lib/equipmentApi';

interface TechMonthSummaryProps {
  stats: TechMonthStats | null;
  loading: boolean;
  onShift: (delta: number) => void;
}

const money = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₽`;

const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const text = new Date(y, (m || 1) - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1).replace(' г.', '');
};

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

const TechMonthSummary = ({ stats, loading, onShift }: TechMonthSummaryProps) => {
  if (!stats) return null;

  return (
    <section className="mb-5 border-2 border-primary bg-card shadow-[4px_4px_0_0_hsl(var(--primary))]">
      <div className="flex items-center justify-between gap-2 border-b-2 border-primary bg-primary px-3 py-2 text-primary-foreground">
        <button
          onClick={() => onShift(-1)}
          disabled={loading}
          aria-label="Предыдущий месяц"
          className="flex h-9 w-9 items-center justify-center border-2 border-primary-foreground/40 transition-colors hover:bg-primary-foreground/10 disabled:opacity-50"
        >
          <Icon name="ChevronLeft" size={18} strokeWidth={2.5} />
        </button>
        <div className="min-w-0 text-center">
          <p className="font-head text-[0.68rem] font-bold uppercase tracking-[0.1em] text-primary-foreground/70">
            {stats.isCurrent ? 'Сводка за этот месяц' : 'Сводка за месяц'}
          </p>
          <p className="flex items-center justify-center gap-1.5 font-head text-[0.95rem] font-black uppercase">
            {loading && <Icon name="Loader2" size={14} className="animate-spin" />}
            {monthTitle(stats.month)}
          </p>
        </div>
        <button
          onClick={() => onShift(1)}
          disabled={loading || stats.isCurrent}
          aria-label="Следующий месяц"
          className="flex h-9 w-9 items-center justify-center border-2 border-primary-foreground/40 transition-colors hover:bg-primary-foreground/10 disabled:opacity-30"
        >
          <Icon name="ChevronRight" size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="grid grid-cols-1 divide-y-2 divide-primary sm:grid-cols-3 sm:divide-x-2 sm:divide-y-0">
        <div className="flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-primary bg-success text-success-foreground">
            <Icon name="CircleCheckBig" fallback="CheckCircle" size={22} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="font-head text-[0.68rem] font-bold uppercase text-muted-foreground">Выполнено задач</p>
            <p className="font-head text-2xl font-black text-primary">{stats.tasksDone}</p>
            <p className="text-[12px] text-muted-foreground">
              {stats.urgentDone > 0 ? `из них срочных: ${stats.urgentDone}` : 'срочных не было'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
            <Icon name="Wrench" size={22} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="font-head text-[0.68rem] font-bold uppercase text-muted-foreground">Вернул из ремонта</p>
            <p className="font-head text-2xl font-black text-primary">{stats.repairsReturned}</p>
            <p className="text-[12px] text-muted-foreground">
              {plural(stats.repairsReturned, 'единица', 'единицы', 'единиц')} оборудования
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-warning/15 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-primary bg-warning text-warning-foreground">
            <Icon name="Wallet" size={22} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="font-head text-[0.68rem] font-bold uppercase text-muted-foreground">Потрачено на ремонт</p>
            <p className="font-head text-2xl font-black text-primary">{money(stats.totalCost)}</p>
            <p className="text-[12px] text-muted-foreground">
              {`задачи ${money(stats.tasksCost)} · ремонты ${money(stats.repairsCost)}`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TechMonthSummary;

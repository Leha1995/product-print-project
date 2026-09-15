import Icon from '@/components/ui/icon';

export interface PrintJob {
  id: string;
  name: string;
  price: number;
  copies: number;
  time: string;
}

interface PrintLogProps {
  jobs: PrintJob[];
  onClear: () => void;
}

const PrintLog = ({ jobs, onClear }: PrintLogProps) => {
  return (
    <section className="print-hide border-t-2 border-primary bg-secondary">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 md:px-8 md:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-head text-[28px] font-medium uppercase leading-none text-white md:text-[40px]">
            Очередь печати
          </h2>
          {jobs.length > 0 && (
            <button
              onClick={onClear}
              className="flex items-center gap-2 border-2 border-primary bg-background px-4 py-2 font-head text-[0.7rem] font-medium uppercase tracking-[0.08em] text-primary transition-colors hover:bg-accent"
            >
              <Icon name="Trash2" size={14} strokeWidth={2.5} />
              Очистить
            </button>
          )}
        </div>

        {jobs.length === 0 ? (
          <p className="mt-6 border-2 border-dashed border-primary p-6 font-head text-sm uppercase tracking-[0.06em] text-white">
            Пока пусто. Нажми на любой продукт — маркировка появится здесь.
          </p>
        ) : (
          <ul className="mt-6 divide-y-2 divide-primary border-2 border-primary bg-background">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex animate-fade-in flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="flex items-center gap-3 font-head text-sm font-bold uppercase text-primary">
                  <Icon name="Printer" size={16} strokeWidth={2.5} />
                  {job.name}
                </span>
                <span className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{job.copies} шт.</span>
                  <span className="font-head font-bold text-primary">{job.price} ₽</span>
                  <span className="tabular-nums">{job.time}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default PrintLog;
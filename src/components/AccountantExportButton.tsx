import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { toast } from '@/hooks/use-toast';
import { fetchAllPoints } from '@/lib/equipmentApi';
import { exportAllPoints } from '@/lib/pointsExport';

const AccountantExportButton = () => {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const points = await fetchAllPoints();
      if (!points.length) {
        toast({ title: 'За вами не закреплено ни одной точки', description: 'Обратитесь к супер-админу' });
        return;
      }
      exportAllPoints(points);
      const total = points.reduce((s, p) => s + p.items.length, 0);
      toast({ title: 'Файл выгружен', description: `Точек: ${points.length} · позиций: ${total}` });
    } catch {
      toast({ title: 'Не удалось выгрузить', description: 'Проверьте интернет и повторите' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="print-hide border-b-2 border-primary bg-card px-4 py-3 md:px-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-head text-[0.8rem] font-black uppercase text-primary">Отчёт по всем точкам</p>
          <p className="text-[12px] text-muted-foreground">
            Оборудование, стоимость, остаточная стоимость и ремонты — одним файлом
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="flex min-h-[44px] items-center gap-2 border-2 border-primary bg-success px-4 py-2 font-head text-[0.78rem] font-black uppercase text-success-foreground shadow-[3px_3px_0_0_hsl(var(--primary))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          <Icon
            name={busy ? 'Loader2' : 'FileSpreadsheet'}
            size={18}
            strokeWidth={2.5}
            className={busy ? 'animate-spin' : ''}
          />
          {busy ? 'Собираю файл…' : 'Excel по всем точкам'}
        </button>
      </div>
    </div>
  );
};

export default AccountantExportButton;

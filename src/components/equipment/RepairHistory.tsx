import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { Equipment } from '@/lib/equipmentApi';

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '');

const RepairHistory = ({ item }: { item: Equipment }) => {
  const [open, setOpen] = useState(false);
  const repairs = item.repairs || [];
  const total = item.repairCost || 0;

  return (
    <div
      className={`border-2 ${total > 0 || repairs.length ? 'border-primary bg-background' : 'border-dashed border-muted-foreground'}`}
    >
      <button
        type="button"
        onClick={() => repairs.length && setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left ${
          repairs.length ? 'hover:bg-muted' : 'cursor-default'
        }`}
      >
        <span className="flex items-center gap-1.5 font-head text-[0.65rem] font-bold uppercase text-muted-foreground">
          <Icon name="Wrench" size={13} strokeWidth={2.5} />
          {repairs.length ? `Ремонты · ${repairs.length}` : 'Ремонт'}
          {repairs.length > 0 && (
            <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={13} strokeWidth={2.5} />
          )}
        </span>
        <span className="font-head text-[0.85rem] font-black text-primary">{money(total)}</span>
      </button>

      {open && repairs.length > 0 && (
        <ul className="max-h-60 divide-y-2 divide-muted overflow-y-auto border-t-2 border-primary">
          {repairs.map((r) => (
            <li key={r.id} className="px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] text-muted-foreground">
                  <span>{`Отправлено ${day(r.sentAt)}`}</span>
                  <br />
                  {r.returnedAt ? (
                    <span>{`Вернулось ${day(r.returnedAt)}`}</span>
                  ) : (
                    <span className="font-bold text-primary">В ремонте сейчас</span>
                  )}
                </p>
                <span className="shrink-0 font-head text-[0.8rem] font-black text-primary">
                  {r.returnedAt ? money(r.cost) : '—'}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-[12px] text-primary">
                {r.description || <span className="text-muted-foreground">Описание не указано</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RepairHistory;

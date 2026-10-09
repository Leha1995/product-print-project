import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { StructureRef } from '@/lib/authApi';
import { toast } from '@/hooks/use-toast';

interface StructureSwitcherProps {
  structures: StructureRef[];
  activeId: number | null;
  onSwitch: (id: number) => Promise<unknown>;
  alwaysShow?: boolean;
}

const StructureSwitcher = ({ structures, activeId, onSwitch, alwaysShow = false }: StructureSwitcherProps) => {
  const [busy, setBusy] = useState(false);

  if (!structures.length || (structures.length < 2 && !alwaysShow)) return null;

  const active = structures.find((s) => s.id === activeId);

  const change = async (id: number) => {
    if (id === activeId) return;
    setBusy(true);
    try {
      await onSwitch(id);
      const next = structures.find((s) => s.id === id);
      toast({ title: 'Структура переключена', description: next?.name });
      window.setTimeout(() => window.location.reload(), 300);
    } catch {
      toast({ title: 'Не удалось переключить структуру' });
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b-2 border-primary bg-card px-4 py-2 md:px-8">
      <Icon name="Network" fallback="Building2" size={16} strokeWidth={2.5} className="shrink-0 text-primary" />
      <span className="font-head text-[0.7rem] font-bold uppercase tracking-[0.04em] text-muted-foreground">
        Структура
      </span>
      {structures.length > 1 ? (
        <select
          value={activeId ?? ''}
          disabled={busy}
          onChange={(e) => change(Number(e.target.value))}
          className="min-w-0 max-w-full border-2 border-primary bg-background px-2 py-1 font-head text-[0.8rem] font-bold uppercase text-primary disabled:opacity-60"
        >
          {structures.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="font-head text-[0.8rem] font-bold uppercase text-primary">{active?.name}</span>
      )}
      {busy && <Icon name="Loader2" size={14} className="animate-spin text-primary" />}
    </div>
  );
};

export default StructureSwitcher;

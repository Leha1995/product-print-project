import Icon from '@/components/ui/icon';

export interface StructureTag {
  id: number;
  name: string;
}

export const NO_STRUCTURE = -1;

interface StructureFilterProps {
  options: (StructureTag & { count: number })[];
  noneCount: number;
  value: number | null;
  onChange: (value: number | null) => void;
}

const chip = (active: boolean) =>
  `flex items-center gap-1.5 border-2 border-primary px-3 py-1.5 font-head text-[0.7rem] font-bold uppercase transition-colors ${
    active ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
  }`;

const StructureFilter = ({ options, noneCount, value, onChange }: StructureFilterProps) => {
  if (options.length + (noneCount ? 1 : 0) < 2) return null;
  const total = options.reduce((sum, o) => sum + o.count, 0) + noneCount;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 font-head text-[0.7rem] font-bold uppercase text-muted-foreground">
        <Icon name="Network" fallback="Building2" size={15} strokeWidth={2.5} />
        Структура
      </span>
      <button onClick={() => onChange(null)} className={chip(value === null)}>
        {`Все · ${total}`}
      </button>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={chip(value === o.id)}>
          {`${o.name} · ${o.count}`}
        </button>
      ))}
      {noneCount > 0 && (
        <button onClick={() => onChange(NO_STRUCTURE)} className={chip(value === NO_STRUCTURE)}>
          {`Без структуры · ${noneCount}`}
        </button>
      )}
    </div>
  );
};

export const StructureBadge = ({ structures }: { structures?: StructureTag[] }) => {
  if (!structures?.length) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 border-2 border-primary bg-background px-1.5 py-0.5 font-head text-[0.6rem] font-bold uppercase text-primary">
      <Icon name="Network" fallback="Building2" size={11} strokeWidth={2.5} className="shrink-0" />
      <span className="truncate">{structures.map((s) => s.name).join(', ')}</span>
    </span>
  );
};

export default StructureFilter;

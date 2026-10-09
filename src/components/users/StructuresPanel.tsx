import { useState } from 'react';
import Icon from '@/components/ui/icon';
import {
  ManagedUser,
  StructureRef,
  apiCreateStructure,
  apiDeleteStructure,
  apiRenameStructure,
} from '@/lib/authApi';
import { toast } from '@/hooks/use-toast';

interface StructuresPanelProps {
  structures: StructureRef[];
  activeId: number | null;
  users: ManagedUser[];
  onChanged: (users: ManagedUser[]) => void;
  onStructuresChanged: () => void;
}

const inputClass =
  'w-full border-2 border-primary bg-background px-3 py-2 font-body text-[14px] text-primary outline-none';

const btn =
  'flex items-center justify-center gap-1.5 border-2 border-primary px-3 py-2 font-head text-[0.72rem] font-bold uppercase transition-colors disabled:opacity-60';

const errorText = (e: unknown) => {
  const text = String(e);
  if (text.includes('structure_not_empty')) return 'Сначала уберите из структуры всех пользователей';
  if (text.includes('last_structure')) return 'Нельзя удалить последнюю структуру';
  return 'Не удалось сохранить';
};

const StructuresPanel = ({ structures, activeId, users, onChanged, onStructuresChanged }: StructuresPanelProps) => {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');

  const candidates = users.filter((u) => u.role !== 'superadmin');

  const create = async () => {
    if (!name.trim()) {
      toast({ title: 'Введите название структуры' });
      return;
    }
    setBusy(true);
    try {
      const r = await apiCreateStructure(name.trim(), picked);
      onChanged(r.users);
      onStructuresChanged();
      toast({ title: 'Структура создана', description: name.trim() });
      setName('');
      setPicked([]);
      setCreating(false);
    } catch (e) {
      toast({ title: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: number) => {
    if (!renameText.trim()) return;
    setBusy(true);
    try {
      const r = await apiRenameStructure(id, renameText.trim());
      onChanged(r.users);
      onStructuresChanged();
      setRenameId(null);
    } catch (e) {
      toast({ title: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: StructureRef) => {
    if (!window.confirm(`Удалить структуру «${s.name}»? Её общая база блюд тоже удалится.`)) return;
    setBusy(true);
    try {
      const r = await apiDeleteStructure(s.id);
      onChanged(r.users);
      onStructuresChanged();
      toast({ title: 'Структура удалена' });
    } catch (e) {
      toast({ title: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-2 border-primary bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="Network" fallback="Building2" size={18} strokeWidth={2.5} className="text-primary" />
          <span className="font-head text-[0.85rem] font-bold uppercase text-primary">Структуры</span>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className={`${btn} bg-accent text-accent-foreground hover:brightness-95`}
        >
          <Icon name={creating ? 'X' : 'Plus'} size={14} strokeWidth={2.5} />
          {creating ? 'Отмена' : 'Создать структуру'}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        У каждой структуры свои люди, оборудование, каталог и отчёты — они не видны другим структурам. Один
        человек может состоять в нескольких структурах.
      </p>

      {creating && (
        <div className="mt-3 grid gap-2 border-2 border-dashed border-primary p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название структуры"
            className={inputClass}
          />
          <p className="text-[12px] font-semibold text-primary">Кого добавить сразу (можно позже):</p>
          <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
            {candidates.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-[13px] text-primary">
                <input
                  type="checkbox"
                  checked={picked.includes(u.id)}
                  onChange={(e) =>
                    setPicked((prev) => (e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)))
                  }
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className="truncate">{u.fullName || u.username}</span>
              </label>
            ))}
            {!candidates.length && (
              <span className="text-[12px] text-muted-foreground">В этой структуре нет пользователей</span>
            )}
          </div>
          <button onClick={create} disabled={busy} className={`${btn} bg-accent text-accent-foreground`}>
            <Icon name="Check" size={14} strokeWidth={2.5} />
            Создать
          </button>
        </div>
      )}

      <div className="mt-3 grid gap-1.5">
        {structures.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 border-2 border-primary bg-background px-3 py-2">
            {renameId === s.id ? (
              <>
                <input
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  className={`${inputClass} min-w-0 flex-1 py-1`}
                  autoFocus
                />
                <button onClick={() => rename(s.id)} disabled={busy} className={`${btn} bg-accent text-accent-foreground`}>
                  <Icon name="Check" size={14} strokeWidth={2.5} />
                </button>
                <button onClick={() => setRenameId(null)} className={`${btn} bg-card text-primary`}>
                  <Icon name="X" size={14} strokeWidth={2.5} />
                </button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-head text-[0.82rem] font-bold uppercase text-primary">
                    {s.name}
                    {s.id === activeId && (
                      <span className="ml-2 text-[11px] font-bold text-success">· открыта сейчас</span>
                    )}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{`Пользователей: ${s.members}`}</p>
                </div>
                <button
                  onClick={() => {
                    setRenameId(s.id);
                    setRenameText(s.name);
                  }}
                  aria-label="Переименовать"
                  className={`${btn} bg-card text-primary hover:bg-muted`}
                >
                  <Icon name="Pencil" size={14} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => remove(s)}
                  disabled={busy}
                  aria-label="Удалить структуру"
                  className={`${btn} bg-card text-destructive hover:bg-destructive hover:text-destructive-foreground`}
                >
                  <Icon name="Trash2" size={14} strokeWidth={2.5} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StructuresPanel;

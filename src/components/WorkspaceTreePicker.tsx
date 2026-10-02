import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ManagedTarget } from '@/lib/authApi';

interface TreeRow {
  user: ManagedTarget;
  depth: number;
  ancestors: number[];
  children: number;
}

interface WorkspaceTreePickerProps {
  managed: ManagedTarget[];
  currentId: number;
  value: number | null;
  onChange: (id: number | null) => void;
  roleShort: Record<string, string>;
  placeholder?: string;
  allowEmpty?: boolean;
}

const buildTree = (list: ManagedTarget[]): TreeRow[] => {
  const ids = new Set(list.map((u) => u.id));
  const childrenOf = (id: number) =>
    list.filter((u) => u.managerId === id && u.id !== id && u.role !== 'manager');
  const order = (a: ManagedTarget, b: ManagedTarget) => {
    const rank = (u: ManagedTarget) => (u.role === 'user' ? 1 : 0);
    return rank(a) - rank(b) || (a.fullName || a.username).localeCompare(b.fullName || b.username, 'ru');
  };
  const result: TreeRow[] = [];
  const seen = new Set<number>();
  const push = (u: ManagedTarget, depth: number, ancestors: number[]) => {
    if (seen.has(u.id)) return;
    seen.add(u.id);
    const kids = childrenOf(u.id).sort(order);
    result.push({ user: u, depth, ancestors, children: kids.length });
    kids.forEach((k) => push(k, depth + 1, [...ancestors, u.id]));
  };
  const roots = list
    .filter((u) => !u.managerId || !ids.has(u.managerId) || u.role === 'manager')
    .sort((a, b) => {
      const rank = (u: ManagedTarget) =>
        u.role === 'superadmin' ? 0 : u.role === 'manager' ? 1 : u.role === 'admin' ? 2 : 3;
      return rank(a) - rank(b) || order(a, b);
    });
  roots.forEach((r) => push(r, 0, []));
  list.forEach((u) => push(u, 0, []));
  return result;
};

const WorkspaceTreePicker = ({
  managed,
  currentId,
  value,
  onChange,
  roleShort,
  placeholder,
  allowEmpty = false,
}: WorkspaceTreePickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const rows = useMemo(() => buildTree(managed), [managed]);
  const picked = managed.find((m) => m.id === value);
  const groupIds = rows.filter((r) => r.children > 0).map((r) => r.user.id);

  const q = query.trim().toLowerCase();
  const matches = (u: ManagedTarget) =>
    u.username.toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q);
  const visible = q
    ? rows.filter(
        (r) =>
          matches(r.user) ||
          rows.some((o) => o.ancestors.includes(r.user.id) && matches(o.user)),
      )
    : rows.filter((r) => !r.ancestors.some((id) => collapsed.includes(id)));

  const toggle = (id: number) =>
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const pick = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-w-[240px] max-w-full items-center justify-between gap-2 border-2 border-primary bg-background px-3 py-2 text-left font-body text-[14px] text-primary outline-none"
        >
          <span className="truncate">
            {picked
              ? `${picked.fullName || picked.username}${picked.id === currentId ? ' — мой' : ''} · ${
                  roleShort[picked.role] || picked.role
                }`
              : placeholder || 'Выбери сотрудника'}
          </span>
          <Icon name="ChevronsUpDown" size={16} strokeWidth={2.5} className="shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(92vw,420px)] border-2 border-primary bg-background p-2"
      >
        <div className="flex gap-1.5">
          <div className="flex flex-1 items-center gap-2 border-2 border-primary bg-background px-2">
            <Icon name="Search" size={15} strokeWidth={2.5} className="text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени"
              className="w-full bg-transparent py-1.5 text-[14px] text-primary outline-none"
            />
          </div>
          {groupIds.length > 0 && !q && (
            <button
              type="button"
              onClick={() => setCollapsed((prev) => (prev.length ? [] : groupIds))}
              aria-label={collapsed.length ? 'Развернуть все' : 'Свернуть все'}
              title={collapsed.length ? 'Развернуть все' : 'Свернуть все'}
              className="flex w-9 shrink-0 items-center justify-center border-2 border-primary bg-background text-primary hover:bg-muted"
            >
              <Icon
                name={collapsed.length ? 'ChevronsDownUp' : 'ChevronsUpDown'}
                size={15}
                strokeWidth={2.5}
              />
            </button>
          )}
        </div>

        <div className="mt-2 max-h-[60vh] overflow-y-auto">
          {allowEmpty && !q && (
            <button
              type="button"
              onClick={() => pick(null)}
              className="mb-1 w-full border-2 border-dashed border-primary px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-muted"
            >
              {placeholder || 'Выбери сотрудника'}
            </button>
          )}
          {visible.map(({ user: u, depth, children }) => {
            const isCollapsed = collapsed.includes(u.id) && !q;
            const active = u.id === value;
            return (
              <div
                key={u.id}
                className="flex items-center gap-1"
                style={{ paddingLeft: `${Math.min(depth, 4) * 18}px` }}
              >
                {children > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggle(u.id)}
                    aria-label={isCollapsed ? 'Развернуть ветку' : 'Свернуть ветку'}
                    className="flex h-7 w-7 shrink-0 items-center justify-center text-primary hover:bg-muted"
                  >
                    <Icon
                      name={isCollapsed ? 'ChevronRight' : 'ChevronDown'}
                      size={15}
                      strokeWidth={2.5}
                    />
                  </button>
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">
                    {depth > 0 && <Icon name="CornerDownRight" size={14} strokeWidth={2.5} />}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => pick(u.id)}
                  className={`my-0.5 flex min-w-0 flex-1 items-center gap-2 border-2 px-2 py-1.5 text-left transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : `border-transparent hover:border-primary ${
                          u.role === 'manager' ? 'bg-muted text-primary' : 'text-primary'
                        }`
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-head text-[0.78rem] font-bold uppercase">
                      {(u.fullName || u.username) + (u.id === currentId ? ' — мой' : '')}
                    </span>
                    <span
                      className={`block truncate text-[11px] ${
                        active ? 'text-primary-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {`${roleShort[u.role] || u.role}${children ? ` · в ветке: ${children}` : ''}${
                        isCollapsed ? ' (свёрнуто)' : ''
                      }`}
                    </span>
                  </span>
                  {active && <Icon name="Check" size={15} strokeWidth={3} className="shrink-0" />}
                </button>
              </div>
            );
          })}
          {!visible.length && (
            <p className="px-2 py-3 text-center text-[13px] text-muted-foreground">Никого не нашли</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default WorkspaceTreePicker;

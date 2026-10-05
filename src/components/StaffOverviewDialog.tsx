import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { StaffOverview, fetchOverview } from '@/lib/catalogApi';
import { ManagedTarget } from '@/lib/authApi';
import { formatLeft } from '@/hooks/usePrintHistory';
import { toast } from '@/hooks/use-toast';

interface StaffOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenStaff: (id: number) => void;
  managed?: ManagedTarget[];
}

interface TreeNode {
  id: number;
  name: string;
  role: string;
  person: StaffOverview | null;
  children: TreeNode[];
  expired: number;
  soon: number;
}

const roleShort: Record<string, string> = {
  user: 'Сотрудник',
  admin: 'Админ',
  manager: 'Управляющий',
  superadmin: 'Супер-админ',
};

const roleRank = (role: string) =>
  role === 'superadmin' ? 0 : role === 'manager' ? 1 : role === 'admin' ? 2 : 3;

const order = (a: TreeNode, b: TreeNode) =>
  b.expired - a.expired || roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name, 'ru');

const buildTree = (staff: StaffOverview[], managed: ManagedTarget[]): TreeNode[] => {
  const byId = new Map(managed.map((m) => [m.id, m]));
  const people = new Map(staff.map((s) => [s.id, s]));
  const ids = new Set<number>([...people.keys()]);
  people.forEach((_, id) => {
    let parent = byId.get(id)?.managerId;
    const guard = new Set<number>([id]);
    while (parent && byId.has(parent) && !guard.has(parent)) {
      guard.add(parent);
      ids.add(parent);
      parent = byId.get(parent)?.managerId;
    }
  });

  const parentOf = (id: number) => {
    const p = byId.get(id)?.managerId;
    return p && p !== id && ids.has(p) ? p : null;
  };

  const make = (id: number, seen: Set<number>): TreeNode => {
    seen.add(id);
    const m = byId.get(id);
    const person = people.get(id) || null;
    const children = [...ids]
      .filter((c) => !seen.has(c) && parentOf(c) === id)
      .map((c) => make(c, seen))
      .sort(order);
    return {
      id,
      name: m?.fullName || m?.username || person?.fullName || person?.username || `#${id}`,
      role: m?.role || 'user',
      person,
      children,
      expired: (person?.expired.length || 0) + children.reduce((s, c) => s + c.expired, 0),
      soon: (person?.soon.length || 0) + children.reduce((s, c) => s + c.soon, 0),
    };
  };

  const seen = new Set<number>();
  const roots = [...ids]
    .filter((id) => parentOf(id) === null)
    .sort((a, b) => roleRank(byId.get(a)?.role || 'user') - roleRank(byId.get(b)?.role || 'user'))
    .map((id) => make(id, seen));
  [...ids].filter((id) => !seen.has(id)).forEach((id) => roots.push(make(id, seen)));
  return roots.sort(order);
};

const toneBorder = (n: TreeNode) =>
  n.expired
    ? 'border-destructive bg-destructive/10'
    : n.soon
      ? 'border-warning bg-warning/15'
      : 'border-primary bg-card';

const Badges = ({ expired, soon }: { expired: number; soon: number }) => (
  <>
    {expired > 0 && (
      <span className="shrink-0 border-2 border-destructive bg-destructive px-2 py-0.5 font-head text-[0.66rem] font-bold uppercase text-destructive-foreground">
        Просрочено: {expired}
      </span>
    )}
    {soon > 0 && (
      <span className="shrink-0 border-2 border-warning bg-warning px-2 py-0.5 font-head text-[0.66rem] font-bold uppercase text-warning-foreground">
        Истекает: {soon}
      </span>
    )}
    {!expired && !soon && (
      <span className="shrink-0 border-2 border-primary bg-background px-2 py-0.5 font-head text-[0.66rem] font-bold uppercase text-primary">
        Всё в сроке
      </span>
    )}
  </>
);

const toggle = (set: Set<number>, id: number) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

const StaffOverviewDialog = ({ open, onOpenChange, onOpenStaff, managed = [] }: StaffOverviewDialogProps) => {
  const [staff, setStaff] = useState<StaffOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [itemsOpen, setItemsOpen] = useState<Set<number>>(new Set());
  const [onlyProblems, setOnlyProblems] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchOverview()
      .then((list) => {
        setStaff(list);
        setItemsOpen(new Set());
      })
      .catch(() => toast({ title: 'Не удалось загрузить сводку' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const tree = useMemo(() => buildTree(staff, managed), [staff, managed]);

  const totalExpired = staff.reduce((sum, s) => sum + s.expired.length, 0);
  const totalSoon = staff.reduce((sum, s) => sum + s.soon.length, 0);

  const groupIds = useMemo(() => {
    const out: number[] = [];
    const walk = (n: TreeNode) => {
      if (n.children.length) out.push(n.id);
      n.children.forEach(walk);
    };
    tree.forEach(walk);
    return out;
  }, [tree]);

  const allCollapsed = groupIds.length > 0 && groupIds.every((id) => collapsed.has(id));

  const renderNode = (node: TreeNode, depth: number): JSX.Element | null => {
    if (onlyProblems && !node.expired && !node.soon) return null;
    const isGroup = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const own = node.person;
    const ownCount = own ? own.expired.length + own.soon.length : 0;
    const itemsShown = itemsOpen.has(node.id);

    const chevron = isGroup
      ? isCollapsed
        ? 'ChevronRight'
        : 'ChevronDown'
      : ownCount
        ? itemsShown
          ? 'ChevronDown'
          : 'ChevronRight'
        : 'CircleCheck';

    return (
      <div key={node.id} className={depth ? 'border-l-2 border-dashed border-primary/40 pl-3 sm:pl-4' : ''}>
        <div className={`border-2 ${toneBorder(node)}`}>
          <div className="flex flex-wrap items-center gap-2 p-2.5">
            <button
              onClick={() => {
                if (isGroup) setCollapsed((s) => toggle(s, node.id));
                else if (ownCount) setItemsOpen((s) => toggle(s, node.id));
              }}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <Icon name={chevron} size={18} strokeWidth={2.5} className="shrink-0 text-primary" />
              {isGroup && (
                <Icon
                  name={node.role === 'manager' ? 'Building2' : 'Users'}
                  size={16}
                  strokeWidth={2.5}
                  className="shrink-0 text-primary"
                />
              )}
              <span className="min-w-0">
                <span className="block truncate font-head text-[0.88rem] font-bold uppercase text-primary">
                  {node.name}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {`${roleShort[node.role] || node.role}${isGroup ? ` · в ветке: ${node.children.length}` : ''}`}
                </span>
              </span>
            </button>

            <Badges expired={node.expired} soon={node.soon} />

            {own && (
              <button
                onClick={() => {
                  onOpenStaff(node.id);
                  onOpenChange(false);
                }}
                className="flex shrink-0 items-center gap-1.5 border-2 border-primary bg-accent px-2.5 py-1 font-head text-[0.66rem] font-bold uppercase tracking-[0.04em] text-accent-foreground transition-transform hover:-translate-y-0.5"
              >
                <Icon name="ArrowRight" size={13} strokeWidth={2.5} />
                В каталог
              </button>
            )}
          </div>

          {isGroup && ownCount > 0 && (
            <button
              onClick={() => setItemsOpen((s) => toggle(s, node.id))}
              className="mx-2.5 mb-2 flex items-center gap-1 text-[12px] font-bold text-primary underline-offset-2 hover:underline"
            >
              <Icon name={itemsShown ? 'ChevronDown' : 'ChevronRight'} size={14} />
              {`Свои позиции: ${ownCount}`}
            </button>
          )}

          {own && itemsShown && ownCount > 0 && (
            <div className="space-y-1 border-t-2 border-primary bg-background/60 p-2.5">
              {own.expired.map((item) => (
                <div
                  key={`e-${item.id}`}
                  className="flex items-center justify-between gap-3 border-2 border-destructive bg-background px-2.5 py-1.5"
                >
                  <span className="truncate font-head text-[0.78rem] font-bold uppercase text-destructive">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold uppercase text-destructive">Срок вышел</span>
                </div>
              ))}
              {own.soon.map((item) => (
                <div
                  key={`s-${item.id}`}
                  className="flex items-center justify-between gap-3 border-2 border-warning bg-background px-2.5 py-1.5"
                >
                  <span className="truncate font-head text-[0.78rem] font-bold uppercase text-primary">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold uppercase text-warning-foreground">
                    Осталось {formatLeft(item.leftMs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {isGroup && !isCollapsed && (
          <div className="mt-1.5 space-y-1.5">{node.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[820px] overflow-y-auto border-2 border-primary bg-background p-0">
        <div className="border-b-2 border-primary bg-primary px-5 py-4">
          <div className="flex items-center gap-2 font-head text-lg font-black uppercase tracking-[0.08em] text-primary-foreground">
            <Icon name="Network" fallback="ClipboardList" size={22} strokeWidth={2.5} />
            Сводка по сотрудникам
          </div>
          <p className="mt-1 text-[12px] text-primary-foreground/70">
            Просрочено: {totalExpired} · Скоро истекает: {totalSoon}
          </p>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2 font-head text-[0.72rem] font-bold uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Icon name="RefreshCw" size={15} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
              Обновить
            </button>
            {groupIds.length > 0 && (
              <button
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupIds))}
                className="flex items-center gap-2 border-2 border-primary bg-card px-3 py-2 font-head text-[0.72rem] font-bold uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
              >
                <Icon name={allCollapsed ? 'ChevronsUpDown' : 'ChevronsDownUp'} size={15} strokeWidth={2.5} />
                {allCollapsed ? 'Развернуть всё' : 'Свернуть всё'}
              </button>
            )}
            <button
              onClick={() => setOnlyProblems((v) => !v)}
              aria-pressed={onlyProblems}
              className={`flex items-center gap-2 border-2 px-3 py-2 font-head text-[0.72rem] font-bold uppercase tracking-[0.06em] transition-colors ${
                onlyProblems
                  ? 'border-destructive bg-destructive text-destructive-foreground'
                  : 'border-primary bg-card text-primary hover:bg-muted'
              }`}
            >
              <Icon name="TriangleAlert" fallback="AlertTriangle" size={15} strokeWidth={2.5} />
              Только с проблемами
            </button>
          </div>

          {loading && <p className="py-6 text-center text-muted-foreground">Загружаем…</p>}

          {!loading && !staff.length && (
            <p className="py-6 text-center text-muted-foreground">За вами пока не закреплены сотрудники</p>
          )}

          {!loading && onlyProblems && staff.length > 0 && !totalExpired && !totalSoon && (
            <p className="py-6 text-center text-muted-foreground">У всех всё в сроке</p>
          )}

          {!loading && <div className="space-y-1.5">{tree.map((n) => renderNode(n, 0))}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StaffOverviewDialog;

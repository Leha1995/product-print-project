import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { Product } from '@/data/products';
import useSharedCatalog, { SharedProduct } from '@/hooks/useSharedCatalog';
import { getAdminPin } from '@/hooks/useAdmin';

interface SharedCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localProducts: Product[];
  onImport: (products: Product[]) => void;
}

const stripMeta = (p: SharedProduct): Product => {
  const { author: _a, updatedAt: _u, ...rest } = p;
  return { ...(rest as Product), category: '', categories: [] };
};

const SharedCatalogDialog = ({
  open,
  onOpenChange,
  localProducts,
  onImport,
}: SharedCatalogDialogProps) => {
  const { items, loading, busy, refresh, publish, remove } = useSharedCatalog();
  const [tab, setTab] = useState<'base' | 'publish'>('base');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickedLocal, setPickedLocal] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const pin = getAdminPin();
  const localIds = useMemo(() => new Set(localProducts.map((p) => p.id)), [localProducts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tab === 'base' ? items : localProducts;
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [query, tab, items, localProducts]);

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const currentSet = tab === 'base' ? picked : pickedLocal;
  const applySet = tab === 'base' ? setPicked : setPickedLocal;
  const allPicked = filtered.length > 0 && filtered.every((p) => currentSet.has(p.id));

  const toggleAll = () => {
    if (allPicked) {
      const next = new Set(currentSet);
      filtered.forEach((p) => next.delete(p.id));
      applySet(next);
      return;
    }
    const next = new Set(currentSet);
    filtered.forEach((p) => next.add(p.id));
    applySet(next);
  };

  const handleImport = () => {
    const list = items.filter((p) => picked.has(p.id)).map(stripMeta);
    if (!list.length) return;
    onImport(list);
    setPicked(new Set());
    onOpenChange(false);
  };

  const handlePublish = async () => {
    const list = localProducts.filter((p) => pickedLocal.has(p.id));
    const ok = await publish(list, pin);
    if (ok) {
      setPickedLocal(new Set());
      setTab('base');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[860px] overflow-y-auto border-2 border-primary bg-background p-0">
        <div className="border-b-2 border-primary bg-primary px-5 py-4">
          <div className="flex items-center gap-2 font-head text-lg font-black uppercase tracking-[0.08em] text-primary-foreground">
            <Icon name="Database" size={22} strokeWidth={2.5} />
            Общая база карточек
          </div>
          <p className="mt-1 text-[12px] text-primary-foreground/70">
            Карточки хранятся на сервере и доступны на всех устройствах
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTab('base')}
              className={`flex items-center gap-2 border-2 border-primary px-4 py-2.5 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors ${
                tab === 'base' ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
              }`}
            >
              <Icon name="CloudDownload" size={16} strokeWidth={2.5} />
              Из базы ({items.length})
            </button>
            <button
              onClick={() => setTab('publish')}
              className={`flex items-center gap-2 border-2 border-primary px-4 py-2.5 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors ${
                tab === 'publish' ? 'bg-primary text-primary-foreground' : 'bg-card text-primary hover:bg-muted'
              }`}
            >
              <Icon name="CloudUpload" size={16} strokeWidth={2.5} />
              Отправить в базу
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 border-2 border-primary bg-card px-4 py-2.5 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Icon name="RefreshCw" size={16} strokeWidth={2.5} />
              Обновить
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex flex-1 items-center gap-3 border-2 border-primary bg-card px-3 py-2.5">
              <Icon name="Search" size={18} className="text-primary" strokeWidth={2.5} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию"
                className="w-full bg-transparent text-[15px] text-primary outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              onClick={toggleAll}
              disabled={!filtered.length}
              className={`flex shrink-0 items-center justify-center gap-2 border-2 border-primary px-4 py-2.5 font-head text-[0.8rem] font-medium uppercase tracking-[0.06em] transition-colors disabled:opacity-50 ${
                allPicked ? 'bg-accent text-accent-foreground' : 'bg-card text-primary hover:bg-muted'
              }`}
            >
              <Icon name={allPicked ? 'SquareX' : 'CheckCheck'} size={16} strokeWidth={2.5} />
              {allPicked ? 'Снять все' : 'Выбрать все'}
            </button>
          </div>

          <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
            {loading && tab === 'base' && (
              <p className="py-6 text-center text-muted-foreground">Загружаем…</p>
            )}
            {!loading && !filtered.length && (
              <p className="py-6 text-center text-muted-foreground">
                {tab === 'base' ? 'Общая база пуста' : 'Нет локальных карточек'}
              </p>
            )}
            {filtered.map((p) => {
              const isBase = tab === 'base';
              const set = isBase ? picked : pickedLocal;
              const checked = set.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 border-2 p-2.5 transition-colors ${
                    checked ? 'border-accent bg-accent/15' : 'border-primary bg-card'
                  }`}
                >
                  <button
                    onClick={() => toggle(set, p.id, isBase ? setPicked : setPickedLocal)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 border-primary ${
                      checked ? 'bg-accent text-accent-foreground' : 'bg-background text-transparent'
                    }`}
                    aria-label="Выбрать"
                  >
                    <Icon name="Check" size={16} strokeWidth={3} />
                  </button>

                  {p.image ? (
                    <img src={p.image} alt="" className="h-11 w-11 shrink-0 border-2 border-primary object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-primary text-muted-foreground">
                      <Icon name="ImageOff" size={16} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate font-head text-[0.9rem] font-bold uppercase text-primary">
                      {p.name}
                    </div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {[p.weight, p.storageText, p.shelfLifeHours ? `${p.shelfLifeHours} ч` : '']
                        .filter(Boolean)
                        .join(' · ') || 'Без параметров'}
                    </div>
                  </div>

                  {isBase && localIds.has(p.id) && (
                    <span className="shrink-0 border-2 border-primary px-2 py-1 text-[10px] uppercase text-primary">
                      Уже есть
                    </span>
                  )}

                  {isBase && (
                    <button
                      onClick={() => remove(p.id, pin)}
                      disabled={busy}
                      aria-label="Удалить из общей базы"
                      className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-primary text-primary transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                    >
                      <Icon name="Trash2" size={14} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {tab === 'base' ? (
            <button
              onClick={handleImport}
              disabled={!picked.size}
              className="flex w-full items-center justify-center gap-2 border-2 border-primary bg-accent px-6 py-4 font-head text-lg font-medium uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
            >
              <Icon name="Plus" size={20} strokeWidth={2.5} />
              Добавить в мой список ({picked.size})
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={!pickedLocal.size || busy}
              className="flex w-full items-center justify-center gap-2 border-2 border-primary bg-accent px-6 py-4 font-head text-lg font-medium uppercase text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
            >
              <Icon name="CloudUpload" size={20} strokeWidth={2.5} />
              Отправить в общую базу ({pickedLocal.size})
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SharedCatalogDialog;
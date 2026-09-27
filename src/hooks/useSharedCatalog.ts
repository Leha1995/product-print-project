import { apiUrl } from '@/lib/apiBase';
import { useCallback, useEffect, useState } from 'react';
import { Product } from '@/data/products';
import { toast } from '@/hooks/use-toast';

const API = apiUrl('shared-catalog');

export interface SharedProduct extends Product {
  author?: string;
  updatedAt?: string;
}

export const useSharedCatalog = () => {
  const [items, setItems] = useState<SharedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      toast({ title: 'Не удалось загрузить общую базу' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const publish = useCallback(
    async (list: Product[], pin: string, author = '') => {
      if (!list.length) return false;
      setBusy(true);
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': pin },
          body: JSON.stringify({ items: list, author }),
        });
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        toast({ title: `В общую базу отправлено: ${data.saved ?? list.length}` });
        return true;
      } catch {
        toast({ title: 'Не удалось отправить в общую базу' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const remove = useCallback(async (id: string, pin: string) => {
    setBusy(true);
    try {
      const res = await fetch(API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': pin },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('fail');
      setItems((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch {
      toast({ title: 'Не удалось удалить из общей базы' });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { items, loading, busy, refresh, publish, remove };
};

export default useSharedCatalog;

import { useCallback, useEffect, useState } from 'react';
import { ManagedTarget, apiManaged } from '@/lib/authApi';

export const useManagedUsers = (enabled: boolean) => {
  const [list, setList] = useState<ManagedTarget[]>([]);

  const refresh = useCallback(() => {
    if (!enabled) {
      setList([]);
      return;
    }
    apiManaged()
      .then((r) => setList(r.managed || []))
      .catch(() => setList([]));
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { managed: list, refreshManaged: refresh };
};

export default useManagedUsers;

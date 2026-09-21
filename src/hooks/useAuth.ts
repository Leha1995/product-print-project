import { useCallback, useEffect, useState } from 'react';
import {
  apiLogin,
  apiLogout,
  apiMe,
  AuthUser,
  getToken,
  setToken,
} from '@/lib/authApi';

const ROLE_KEY = 'asap-auth-role';

const rememberRole = (user: AuthUser | null) => {
  try {
    if (user) localStorage.setItem(ROLE_KEY, user.role);
    else localStorage.removeItem(ROLE_KEY);
  } catch {
    /* storage unavailable */
  }
};

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) {
        if (alive) setReady(true);
        return;
      }
      const me = await apiMe().catch(() => null);
      if (!alive) return;
      if (!me) setToken('');
      rememberRole(me);
      setUser(me);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username.trim(), password);
    setToken(res.token);
    rememberRole(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => null);
    setToken('');
    rememberRole(null);
    setUser(null);
  }, []);

  return {
    user,
    ready,
    login,
    logout,
    isAuthed: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
    isSuperAdmin: user?.role === 'superadmin',
  };
};

export default useAuth;
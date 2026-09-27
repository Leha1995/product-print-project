import { useCallback, useEffect, useState } from 'react';
import {
  addKnownLogin,
  apiLogin,
  apiLogout,
  apiMe,
  AuthUser,
  forgetLogin,
  getCachedUser,
  getToken,
  rememberLogin,
  setCachedUser,
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
  const hasToken = !!getToken();
  const [user, setUser] = useState<AuthUser | null>(hasToken ? getCachedUser() : null);
  const [ready, setReady] = useState(!hasToken);
  const [kicked, setKicked] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) {
        if (alive) {
          setCachedUser(null);
          setReady(true);
        }
        return;
      }
      const res = await apiMe();
      if (!alive) return;
      if (res.status === 'ok') {
        rememberRole(res.user);
        setCachedUser(res.user);
        setUser(res.user);
      } else if (res.status === 'invalid') {
        setToken('');
        setCachedUser(null);
        forgetLogin(true);
        rememberRole(null);
        setUser(null);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      if (document.hidden || !getToken()) return;
      const res = await apiMe();
      if (res.status === 'invalid') {
        setToken('');
        setCachedUser(null);
        forgetLogin(true);
        rememberRole(null);
        setUser(null);
        setKicked(true);
      }
    };
    const timer = window.setInterval(check, 300000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username.trim(), password);
    setToken(res.token);
    rememberRole(res.user);
    setCachedUser(res.user);
    rememberLogin(username.trim(), '');
    addKnownLogin(username.trim());
    setKicked(false);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async (forget = false) => {
    await apiLogout().catch(() => null);
    if (forget) forgetLogin();
    setToken('');
    setCachedUser(null);
    rememberRole(null);
    setUser(null);
  }, []);

  return {
    user,
    ready,
    kicked,
    login,
    logout,
    isAuthed: !!user,
    isAdmin:
      user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'manager',
    isSuperAdmin: user?.role === 'superadmin',
    isManager: user?.role === 'manager',
    canInventory: user?.role === 'manager' || user?.role === 'superadmin',
    inventoryOnly: user?.role === 'manager',
  };
};

export default useAuth;
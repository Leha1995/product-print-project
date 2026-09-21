import { useCallback, useEffect, useState } from 'react';
import {
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
        rememberRole(null);
        setUser(null);
      }
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
    setCachedUser(res.user);
    if (res.user.role === 'user') rememberLogin(username.trim(), password);
    else rememberLogin(username.trim(), '');
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
    login,
    logout,
    isAuthed: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
    isSuperAdmin: user?.role === 'superadmin',
  };
};

export default useAuth;
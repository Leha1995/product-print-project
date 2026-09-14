import { useCallback, useEffect, useState } from 'react';

const SESSION_KEY = 'asap-admin-session';
const ADMIN_PIN = '15271527';

export const useAdmin = () => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem('asap-admin-pin');
      setIsAdmin(sessionStorage.getItem(SESSION_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const login = useCallback((value: string) => {
    if (value.trim() !== ADMIN_PIN) return false;
    setIsAdmin(true);
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    return true;
  }, []);

  const logout = useCallback(() => {
    setIsAdmin(false);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return { isAdmin, login, logout };
};

export default useAdmin;

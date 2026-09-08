import { useCallback, useEffect, useState } from 'react';

const PIN_KEY = 'asap-admin-pin';
const SESSION_KEY = 'asap-admin-session';
const DEFAULT_PIN = '1234';

export const useAdmin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [pin, setPin] = useState(DEFAULT_PIN);

  useEffect(() => {
    try {
      setPin(localStorage.getItem(PIN_KEY) || DEFAULT_PIN);
      setIsAdmin(sessionStorage.getItem(SESSION_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const login = useCallback(
    (value: string) => {
      if (value.trim() !== pin) return false;
      setIsAdmin(true);
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        /* storage unavailable */
      }
      return true;
    },
    [pin],
  );

  const logout = useCallback(() => {
    setIsAdmin(false);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const changePin = useCallback((next: string) => {
    const value = next.trim();
    if (value.length < 4) return false;
    setPin(value);
    try {
      localStorage.setItem(PIN_KEY, value);
    } catch {
      /* storage unavailable */
    }
    return true;
  }, []);

  return { isAdmin, login, logout, changePin, isDefaultPin: pin === DEFAULT_PIN };
};

export default useAdmin;

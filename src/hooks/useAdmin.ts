import { useCallback, useEffect, useRef, useState } from 'react';

const SESSION_KEY = 'asap-admin-session';
const TOUCH_KEY = 'asap-admin-touch';
const ADMIN_PIN = '15271527';
const IDLE_MS = 10 * 60 * 1000;

const readTouch = () => {
  try {
    return Number(sessionStorage.getItem(TOUCH_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeTouch = (ts: number) => {
  try {
    sessionStorage.setItem(TOUCH_KEY, String(ts));
  } catch {
    /* storage unavailable */
  }
};

export const useAdmin = (onIdleLogout?: () => void) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const idleCb = useRef(onIdleLogout);
  idleCb.current = onIdleLogout;

  useEffect(() => {
    try {
      localStorage.removeItem('asap-admin-pin');
      const active = sessionStorage.getItem(SESSION_KEY) === '1';
      const fresh = Date.now() - readTouch() < IDLE_MS;
      if (active && fresh) {
        setIsAdmin(true);
      } else if (active) {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(TOUCH_KEY);
      }
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
    writeTouch(Date.now());
    return true;
  }, []);

  const logout = useCallback(() => {
    setIsAdmin(false);
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(TOUCH_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    writeTouch(Date.now());
    const touch = () => writeTouch(Date.now());
    const events: (keyof DocumentEventMap)[] = [
      'pointerdown',
      'keydown',
      'wheel',
      'touchstart',
    ];
    events.forEach((e) => document.addEventListener(e, touch, { passive: true }));

    const timer = window.setInterval(() => {
      if (Date.now() - readTouch() >= IDLE_MS) {
        logout();
        idleCb.current?.();
      }
    }, 15000);

    return () => {
      events.forEach((e) => document.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [isAdmin, logout]);

  return { isAdmin, login, logout, idleMinutes: IDLE_MS / 60000 };
};

export default useAdmin;

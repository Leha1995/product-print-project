import { apiUrl } from '@/lib/apiBase';
const API = apiUrl('auth');

export type Role = 'user' | 'admin' | 'manager' | 'superadmin' | 'technician' | 'accountant';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  accessUntil?: string | null;
}

export interface ManagedUser extends AuthUser {
  active: boolean;
  createdAt: string | null;
  managerId: number | null;
  accessUntil: string | null;
  accessOwn?: boolean;
  scopeIds?: number[];
  techIds?: number[];
}

export interface ManagedTarget {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  managerId?: number | null;
}

const TOKEN_KEY = 'asap-auth-token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

export const setToken = (token: string) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
};

const REMEMBER_KEY = 'asap-remember';

export interface RememberedLogin {
  username: string;
  password: string;
}

export const getRemembered = (): RememberedLogin => {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return { username: '', password: '' };
    const data = JSON.parse(decodeURIComponent(atob(raw))) as RememberedLogin;
    return { username: data.username || '', password: data.password || '' };
  } catch {
    return { username: '', password: '' };
  }
};

export const rememberLogin = (username: string, password: string) => {
  try {
    localStorage.setItem(
      REMEMBER_KEY,
      btoa(encodeURIComponent(JSON.stringify({ username, password }))),
    );
  } catch {
    /* storage unavailable */
  }
};

export const forgetLogin = (keepUsername = false) => {
  try {
    if (keepUsername) {
      const { username } = getRemembered();
      rememberLogin(username, '');
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch {
    /* storage unavailable */
  }
};

const KNOWN_KEY = 'asap-known-logins';

export const getKnownLogins = (): string[] => {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list.filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
};

export const addKnownLogin = (username: string) => {
  const clean = username.trim();
  if (!clean) return;
  try {
    const next = [clean, ...getKnownLogins().filter((u) => u !== clean)].slice(0, 8);
    localStorage.setItem(KNOWN_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
};

export const removeKnownLogin = (username: string) => {
  try {
    const next = getKnownLogins().filter((u) => u !== username);
    localStorage.setItem(KNOWN_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
};

const call = async <T>(body: Record<string, unknown>): Promise<T> => {
  const send = () =>
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
      body: JSON.stringify(body),
    });
  const sendPlain = () => {
    const token = getToken();
    const url = `${API}${API.includes('?') ? '&' : '?'}t=${Date.now()}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
    });
  };
  const bad = (r: Response | null) => !r || [500, 502, 503, 504].includes(r.status);
  let res: Response | null = await send().catch(() => null);
  for (let attempt = 0; attempt < 3 && bad(res); attempt++) {
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    res = await (attempt === 0 ? sendPlain() : send()).catch(() => null);
    if (bad(res)) res = await sendPlain().catch(() => null);
  }
  if (!res) throw new Error('network_error');
  if (res.status === 402) throw new Error('quota_exceeded');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, detail } = data as { error?: string; detail?: string };
    throw new Error([error || String(res.status), detail].filter(Boolean).join(': '));
  }
  return data as T;
};

export const apiLogin = async (username: string, password: string) => {
  const res = await call<{ token: string; user: AuthUser }>({ action: 'login', username, password });
  if (!res || !res.token || !res.user) throw new Error('server_error: bad_response');
  return res;
};

const USER_KEY = 'asap-auth-user';

export const getCachedUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

export const setCachedUser = (user: AuthUser | null) => {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
};

export type MeResult =
  | { status: 'ok'; user: AuthUser }
  | { status: 'invalid' }
  | { status: 'offline' };

export const apiMe = async (): Promise<MeResult> => {
  const token = getToken();
  if (!token) return { status: 'invalid' };
  try {
    const res = await fetch(`${API}?action=me`, { headers: { 'X-Auth-Token': token } });
    if (res.status >= 500 || res.status === 402 || res.status === 429) return { status: 'offline' };
    const data = (await res.json().catch(() => ({ user: null }))) as { user: AuthUser | null };
    if (!res.ok || !data.user) return { status: 'invalid' };
    return { status: 'ok', user: data.user };
  } catch {
    return { status: 'offline' };
  }
};

export const apiLogout = () => call<{ ok: boolean }>({ action: 'logout' });

export const apiUsers = () => call<{ users: ManagedUser[] }>({ action: 'users' });

export const apiManaged = () => call<{ managed: ManagedTarget[] }>({ action: 'managed' });

export const apiCreateUser = (payload: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  managerId?: number | null;
  accessDays?: number | null;
  scopeIds?: number[];
  techIds?: number[];
}) => call<{ users: ManagedUser[] }>({ action: 'create_user', ...payload });

export const apiUpdateUser = (payload: {
  id: number;
  username?: string;
  password?: string;
  fullName?: string;
  role?: Role;
  active?: boolean;
  managerId?: number | null;
  accessDays?: number | null;
  scopeIds?: number[];
  techIds?: number[];
}) => call<{ users: ManagedUser[] }>({ action: 'update_user', ...payload });

export const apiDeleteUser = (id: number) =>
  call<{ users: ManagedUser[] }>({ action: 'delete_user', id });

export const apiExportAll = () => call<{ version: number; tables: Record<string, unknown[]> }>({ action: 'export' });

export const apiChangePassword = (password: string) =>
  call<{ ok: boolean }>({ action: 'change_password', password });
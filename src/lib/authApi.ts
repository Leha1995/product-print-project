const API = 'https://functions.poehali.dev/e2f238d3-01a0-409f-973c-33e38bfdbb57';

export type Role = 'user' | 'admin' | 'superadmin';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

export interface ManagedUser extends AuthUser {
  active: boolean;
  createdAt: string | null;
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

const call = async <T>(body: Record<string, unknown>): Promise<T> => {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || String(res.status));
  return data as T;
};

export const apiLogin = (username: string, password: string) =>
  call<{ token: string; user: AuthUser }>({ action: 'login', username, password });

export const apiMe = async (): Promise<AuthUser | null> => {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API}?action=me`, { headers: { 'X-Auth-Token': token } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({ user: null }));
  return (data as { user: AuthUser | null }).user;
};

export const apiLogout = () => call<{ ok: boolean }>({ action: 'logout' });

export const apiUsers = () => call<{ users: ManagedUser[] }>({ action: 'users' });

export const apiCreateUser = (payload: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
}) => call<{ users: ManagedUser[] }>({ action: 'create_user', ...payload });

export const apiUpdateUser = (payload: {
  id: number;
  password?: string;
  fullName?: string;
  role?: Role;
  active?: boolean;
}) => call<{ users: ManagedUser[] }>({ action: 'update_user', ...payload });

export const apiDeleteUser = (id: number) =>
  call<{ users: ManagedUser[] }>({ action: 'delete_user', id });

export const apiChangePassword = (password: string) =>
  call<{ ok: boolean }>({ action: 'change_password', password });
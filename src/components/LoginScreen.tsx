import { useState } from 'react';
import Icon from '@/components/ui/icon';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<unknown>;
}

const LoginScreen = ({ onLogin }: LoginScreenProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onLogin(username, password);
    } catch {
      setError('Неверный логин или пароль');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-[420px] border-2 border-primary bg-card p-6 md:p-8"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center border-2 border-primary bg-accent text-accent-foreground">
            <Icon name="Lock" size={24} strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="font-head text-xl font-black uppercase leading-tight text-primary">
              Автосуши Автопицца
            </h1>
            <p className="text-[13px] text-muted-foreground">Вход в терминал маркировки</p>
          </div>
        </div>

        <label className="mt-6 block">
          <span className="font-head text-[0.72rem] font-medium uppercase tracking-[0.08em] text-primary">
            Логин
          </span>
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
            autoComplete="username"
            className="mt-1 w-full border-2 border-primary bg-background px-3 py-3 font-body text-[15px] text-primary outline-none"
          />
        </label>

        <label className="mt-4 block">
          <span className="font-head text-[0.72rem] font-medium uppercase tracking-[0.08em] text-primary">
            Пароль
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            autoComplete="current-password"
            className="mt-1 w-full border-2 border-primary bg-background px-3 py-3 font-body text-[15px] text-primary outline-none"
          />
        </label>

        {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 border-2 border-primary bg-accent px-4 py-3 font-head text-[0.85rem] font-medium uppercase tracking-[0.06em] text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          <Icon name={busy ? 'Loader' : 'LogIn'} size={18} strokeWidth={2.5} />
          {busy ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
    </div>
  );
};

export default LoginScreen;

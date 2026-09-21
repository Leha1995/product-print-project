import { useState } from 'react';
import Icon from '@/components/ui/icon';
import VirtualKeyboard from '@/components/VirtualKeyboard';
import { forgetLogin, getRemembered } from '@/lib/authApi';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<unknown>;
  kicked?: boolean;
}

const LoginScreen = ({ onLogin, kicked }: LoginScreenProps) => {
  const saved = getRemembered();
  const [username, setUsername] = useState(saved.username);
  const [password, setPassword] = useState(saved.password);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<'username' | 'password' | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setField(null);
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
    <div
      className={`flex min-h-screen items-center justify-center bg-background px-4 pt-8 ${
        field ? 'items-start pb-[420px]' : 'pb-8'
      }`}
    >
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

        {kicked && (
          <div className="mt-5 flex items-start gap-2 border-2 border-destructive bg-destructive/10 px-3 py-2.5">
            <Icon name="TriangleAlert" size={18} className="mt-0.5 shrink-0 text-destructive" strokeWidth={2.5} />
            <p className="text-[13px] text-destructive">
              Под вашим логином вошли на другом устройстве — здесь сеанс завершён
            </p>
          </div>
        )}

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
            onFocus={() => setField('username')}
            autoComplete="username"
            className={`mt-1 w-full border-2 bg-background px-3 py-3 font-body text-[15px] text-primary outline-none ${
              field === 'username' ? 'border-secondary' : 'border-primary'
            }`}
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
            onFocus={() => setField('password')}
            autoComplete="current-password"
            className={`mt-1 w-full border-2 bg-background px-3 py-3 font-body text-[15px] text-primary outline-none ${
              field === 'password' ? 'border-secondary' : 'border-primary'
            }`}
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

        {(saved.username || saved.password) && (
          <button
            type="button"
            onClick={() => {
              forgetLogin();
              setUsername('');
              setPassword('');
              setError('');
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 border-2 border-primary bg-card px-4 py-2 font-head text-[0.72rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted"
          >
            <Icon name="UserRoundX" size={16} strokeWidth={2.5} />
            Забыть это устройство
          </button>
        )}
      </form>

      <VirtualKeyboard
        open={!!field}
        value={field === 'password' ? password : username}
        mask={field === 'password'}
        placeholder={field === 'password' ? 'Пароль' : 'Логин'}
        onChange={(v) => {
          setError('');
          if (field === 'password') setPassword(v);
          else setUsername(v);
        }}
        onSubmit={() => {
          if (field === 'username') setField('password');
          else submit();
        }}
        submitLabel={field === 'username' ? 'Далее' : 'Войти'}
        onClose={() => setField(null)}
      />
    </div>
  );
};

export default LoginScreen;
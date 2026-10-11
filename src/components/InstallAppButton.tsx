import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { getInstallState, isAndroid, promptInstall, subscribeInstall } from '@/lib/pwa';

interface InstallAppButtonProps {
  variant?: 'header' | 'block';
  className?: string;
}

const InstallAppButton = ({ variant = 'header', className = '' }: InstallAppButtonProps) => {
  const [state, setState] = useState(getInstallState());
  const [help, setHelp] = useState(false);

  useEffect(() => subscribeInstall(() => setState(getInstallState())), []);

  if (state.installed) return null;
  if (!state.canPrompt && !isAndroid()) return null;

  const install = async () => {
    const result = await promptInstall();
    if (result === 'unavailable') setHelp(true);
  };

  return (
    <>
      {variant === 'header' ? (
        <button
          onClick={install}
          aria-label="Установить приложение"
          title="Установить приложение"
          className={`flex h-[34px] items-center gap-1.5 border-2 border-primary bg-accent px-2 text-accent-foreground transition-colors hover:bg-muted ${className}`}
        >
          <Icon name="Download" size={20} strokeWidth={2.5} />
          <span className="hidden font-head text-[0.65rem] font-medium uppercase tracking-[0.06em] lg:inline">
            Установить
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={install}
          className={`flex w-full items-center justify-center gap-2 border-2 border-primary bg-card px-4 py-2.5 font-head text-[0.75rem] font-medium uppercase tracking-[0.06em] text-primary transition-colors hover:bg-muted ${className}`}
        >
          <Icon name="Smartphone" size={18} strokeWidth={2.5} />
          Установить приложение
        </button>
      )}

      {help && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-primary/40 p-6"
          onClick={() => setHelp(false)}
        >
          <div
            className="w-full max-w-[400px] border-2 border-primary bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b-2 border-primary bg-primary px-5 py-3 font-head text-base font-black uppercase text-primary-foreground">
              <Icon name="Smartphone" size={18} strokeWidth={2.5} />
              Установить приложение
            </div>
            <div className="grid gap-3 p-5 text-[14px] text-primary">
              <p>Откройте сайт в Chrome на планшете или телефоне и сделайте так:</p>
              <ol className="grid gap-2 pl-5">
                <li className="list-decimal">
                  Нажмите <Icon name="EllipsisVertical" size={16} className="inline align-text-bottom" /> — три точки
                  справа вверху.
                </li>
                <li className="list-decimal">Выберите «Установить приложение» или «Добавить на главный экран».</li>
                <li className="list-decimal">Подтвердите — на рабочем столе появится иконка «САМ Кафе».</li>
              </ol>
              <p className="text-[12px] text-muted-foreground">
                Если такого пункта нет — обновите Chrome или откройте сайт именно в Chrome, а не во встроенном браузере.
              </p>
              <button
                onClick={() => setHelp(false)}
                className="mt-1 border-2 border-primary bg-accent px-4 py-2 font-head text-[0.75rem] font-bold uppercase text-accent-foreground"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallAppButton;

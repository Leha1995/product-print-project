interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((fn) => fn());

export const isStandalone = () =>
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isAndroid = () => /android/i.test(navigator.userAgent);

export const initPwa = () => {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => undefined);
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
};

export const getInstallState = () => ({
  canPrompt: Boolean(deferred),
  installed: installed || isStandalone(),
});

export const subscribeInstall = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const promptInstall = async () => {
  if (!deferred) return 'unavailable' as const;
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferred = null;
  emit();
  return outcome;
};

import func2url from '../../backend/func2url.json';

type Endpoint = 'auth' | 'catalog' | 'equipment' | 'shared-catalog' | 'print' | 'telegram';

declare global {
  interface Window {
    ASAP_API?: string | null;
  }
}

const ownServerBase = (): string | null => {
  if (typeof window === 'undefined') return null;
  const mode = window.ASAP_API;
  if (!mode) return null;
  if (mode === 'auto') {
    return new URL('api', window.location.href.split('#')[0]).href.replace(/\/$/, '');
  }
  return mode.replace(/\/$/, '');
};

export const isOwnServer = () => ownServerBase() !== null;

export const apiUrl = (name: Endpoint): string => {
  const base = ownServerBase();
  if (base) return `${base}/${name}.php`;
  return (func2url as Record<string, string>)[name];
};

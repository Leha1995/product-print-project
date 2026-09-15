const STORAGE_KEY = 'asap-label-settings-v1';

const applyLinks = (href: string, type: string) => {
  document
    .querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]')
    .forEach((el) => el.remove());

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = type;
  link.href = href;
  document.head.appendChild(link);

  const shortcut = document.createElement('link');
  shortcut.rel = 'shortcut icon';
  shortcut.type = type;
  shortcut.href = href;
  document.head.appendChild(shortcut);

  const touch = document.createElement('link');
  touch.rel = 'apple-touch-icon';
  touch.href = href;
  document.head.appendChild(touch);
};

export const applyFavicon = (logo?: string) => {
  if (!logo) {
    applyLinks(`/favicon.svg?v=${Date.now()}`, 'image/svg+xml');
    return;
  }

  if (logo.startsWith('data:image/svg')) {
    applyLinks(logo, 'image/svg+xml');
    return;
  }

  const img = new Image();
  if (!logo.startsWith('data:')) img.crossOrigin = 'anonymous';

  img.onload = () => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');
    if (!c) {
      applyLinks(logo, 'image/png');
      return;
    }
    c.clearRect(0, 0, size, size);
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    c.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    try {
      applyLinks(canvas.toDataURL('image/png'), 'image/png');
    } catch {
      applyLinks(logo, 'image/png');
    }
  };

  img.onerror = () => applyLinks(logo, 'image/png');
  img.src = logo;
};

export const applyStoredFavicon = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { logo?: string };
    if (parsed.logo) applyFavicon(parsed.logo);
  } catch {
    /* storage unavailable */
  }
};

export default applyFavicon;

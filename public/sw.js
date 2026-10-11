self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const offlinePage = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нет связи</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#e9e3fd;color:#1400f0;font-family:sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:22px;margin:0 0 8px">Нет связи с интернетом</h1><p style="margin:0 0 16px">Проверьте Wi-Fi и попробуйте ещё раз.</p>
<button onclick="location.reload()" style="border:2px solid #1400f0;background:#e1ff5c;color:#1400f0;padding:12px 20px;font-size:16px;font-weight:bold">Повторить</button></div></body></html>`;

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(offlinePage, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});

window.ASAP_API = window.ASAP_API || null;
(function () {
  if (window.ASAP_API) return;
  var host = location.hostname;
  if (/(^|\.)poehali\.dev$/.test(host) || host === 'localhost' || host === '127.0.0.1') return;
  try {
    var self = document.currentScript && document.currentScript.src;
    var url = (self ? new URL('server.php', self) : new URL('api/server.php', location.href.split('#')[0])).href + '?t=' + Date.now();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send();
    if (xhr.status === 200 && xhr.responseText.indexOf("window.ASAP_API = 'auto'") !== -1) {
      window.ASAP_API = 'auto';
    }
  } catch (e) {}
})();
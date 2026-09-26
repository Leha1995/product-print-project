let asked = false;

export const requestCameraAccess = async () => {
  if (asked) return;
  asked = true;

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return;

  try {
    const status = await navigator.permissions?.query?.({
      name: 'camera' as PermissionName,
    });
    if (status?.state === 'denied') return;
  } catch {
    // браузер не умеет проверять статус — просто спросим напрямую
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // пользователь отказал или камеры нет — сканер покажет подсказку позже
  }
};

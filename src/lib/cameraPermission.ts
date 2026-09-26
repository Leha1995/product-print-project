let pending: Promise<MediaStream | null> | null = null;
let granted = false;

export const cameraSupported = () =>
  Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);

export const cameraState = async (): Promise<PermissionState | 'unknown'> => {
  try {
    const status = await navigator.permissions?.query?.({ name: 'camera' as PermissionName });
    return status?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

export const openCamera = (constraints: MediaStreamConstraints): Promise<MediaStream | null> => {
  if (!cameraSupported()) return Promise.resolve(null);
  if (pending) return pending;

  pending = navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      granted = true;
      return stream;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
};

export const requestCameraAccess = async () => {
  if (granted || pending || !cameraSupported()) return;
  const state = await cameraState();
  if (state === 'denied' || state === 'granted') return;

  try {
    const stream = await openCamera({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    stream?.getTracks().forEach((track) => track.stop());
  } catch {
    // пользователь отказал или камеры нет — подсказку покажет сканер
  }
};

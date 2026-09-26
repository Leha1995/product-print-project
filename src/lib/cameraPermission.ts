let pending: Promise<MediaStream> | null = null;
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

const VARIANTS: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  },
  { video: { facingMode: { ideal: 'environment' } }, audio: false },
  { video: true, audio: false },
];

export const openCamera = (): Promise<MediaStream> => {
  if (!cameraSupported()) {
    return Promise.reject(new DOMException('camera unsupported', 'NotSupportedError'));
  }
  if (pending) return pending;

  pending = (async () => {
    let lastError: unknown = null;
    for (const constraints of VARIANTS) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        granted = true;
        return stream;
      } catch (err) {
        lastError = err;
        const name = (err as DOMException)?.name || '';
        if (name === 'NotAllowedError' || name === 'SecurityError') throw err;
      }
    }
    throw lastError;
  })().finally(() => {
    pending = null;
  }) as Promise<MediaStream>;

  return pending;
};

export const cameraGranted = () => granted;
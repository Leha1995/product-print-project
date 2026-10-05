let ctx: AudioContext | null = null;

const getCtx = () => {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  return ctx;
};

export const unlockScanSound = () => {
  getCtx();
};

const tone = (ac: AudioContext, freq: number, start: number, duration: number, type: OscillatorType) => {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
};

export const playScanSound = (ok: boolean) => {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  if (ok) {
    tone(ac, 1320, now, 0.12, 'sine');
    tone(ac, 1760, now + 0.1, 0.16, 'sine');
  } else {
    tone(ac, 220, now, 0.22, 'square');
    tone(ac, 180, now + 0.26, 0.3, 'square');
  }
  if (!ok && 'vibrate' in navigator) navigator.vibrate?.([120, 80, 120]);
};

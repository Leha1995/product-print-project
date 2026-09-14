type Note = [freq: number, beats: number];

const N: Record<string, number> = {
  E5: 659.26,
  C5: 523.25,
  G5: 783.99,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C6: 1046.5,
  E6: 1318.51,
  F5: 698.46,
  D5: 587.33,
  A5: 880.0,
  REST: 0,
};

const MELODY: Note[] = [
  [N.E5, 1],
  [N.E5, 1],
  [N.REST, 1],
  [N.E5, 1],
  [N.REST, 1],
  [N.C5, 1],
  [N.E5, 2],
  [N.G5, 2],
  [N.REST, 2],
  [N.G4, 2],
  [N.REST, 2],
  [N.C5, 2],
  [N.G4, 2],
  [N.REST, 1],
  [N.E5, 2],
  [N.A4, 2],
  [N.B4, 2],
  [N.A5, 1],
  [N.A4, 1],
  [N.B4, 1],
  [N.C6, 2],
  [N.E6, 2],
  [N.D5, 1],
  [N.F5, 2],
  [N.REST, 2],
];

let ctx: AudioContext | null = null;
let stopAt = 0;

const getCtx = () => {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
};

export const unlockAudio = () => {
  const audio = getCtx();
  if (audio && audio.state === 'suspended') void audio.resume();
};

export const playAlertTune = (seconds = 10) => {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const now = audio.currentTime;
  if (now < stopAt) return;

  const beat = 0.14;
  const master = audio.createGain();
  master.gain.value = 0.18;
  master.connect(audio.destination);

  let t = now + 0.05;
  const limit = now + seconds;

  while (t < limit) {
    for (const [freq, beats] of MELODY) {
      const dur = beats * beat;
      if (t >= limit) break;
      if (freq > 0) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(1, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t);
        osc.stop(Math.min(t + dur, limit + 0.2));
      }
      t += dur;
    }
  }

  stopAt = limit;
  master.gain.setValueAtTime(0.18, limit - 0.3);
  master.gain.linearRampToValueAtTime(0, limit);
};

export default playAlertTune;

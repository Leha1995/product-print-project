type Note = [freq: number, beats: number];

const N: Record<string, number> = {
  REST: 0,
  C2: 65.41,
  F2: 87.31,
  G2: 98.0,
  AB2: 103.83,
  BB2: 116.54,
  GB2: 92.5,
  C3: 130.81,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  GB3: 185.0,
  AB3: 207.65,
  BB3: 233.08,
  C4: 261.63,
  DB4: 277.18,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  BB4: 466.16,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.26,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
};

const MELODY: Note[] = [
  [N.E5, 1],
  [N.E5, 1],
  [N.REST, 1],
  [N.E5, 1],
  [N.REST, 1],
  [N.C5, 1],
  [N.E5, 1],
  [N.REST, 1],
  [N.G5, 1],
  [N.REST, 3],
  [N.G4, 1],
  [N.REST, 3],

  [N.C5, 2],
  [N.REST, 1],
  [N.G4, 2],
  [N.REST, 1],
  [N.E4, 2],
  [N.REST, 1],
  [N.A4, 1],
  [N.REST, 1],
  [N.B4, 1],
  [N.REST, 1],
  [N.BB4, 1],
  [N.A4, 2],

  [N.G4, 1],
  [N.E5, 1],
  [N.G5, 1],
  [N.A5, 2],
  [N.F5, 1],
  [N.G5, 1],
  [N.REST, 1],
  [N.E5, 1],
  [N.C5, 1],
  [N.D5, 1],
  [N.B4, 2],
  [N.REST, 3],
];

const MELODY_BASS: Note[] = [
  [N.C2, 2],
  [N.C3, 2],
  [N.C2, 2],
  [N.C3, 2],
  [N.C2, 2],
  [N.C3, 2],
  [N.C2, 2],
  [N.C3, 2],
  [N.C2, 2],
  [N.C3, 2],
  [N.C2, 2],
  [N.C3, 2],
  [N.F2, 2],
  [N.C3, 2],
  [N.F2, 2],
  [N.C3, 2],
  [N.G2, 2],
  [N.E3, 2],
  [N.G2, 2],
  [N.E3, 2],
  [N.C2, 2],
  [N.C3, 2],
  [N.C2, 2],
  [N.G3, 2],
];

const FUNERAL: Note[] = [
  [N.BB3, 4],
  [N.BB3, 3],
  [N.BB3, 1],
  [N.BB3, 4],
  [N.BB3, 4],

  [N.BB3, 3],
  [N.DB4, 1],
  [N.C4, 4],
  [N.C4, 2],
  [N.BB3, 2],
  [N.BB3, 4],

  [N.BB3, 3],
  [N.DB4, 1],
  [N.C4, 4],
  [N.DB4, 2],
  [N.C4, 2],
  [N.BB3, 4],

  [N.BB3, 4],
  [N.AB3, 4],
  [N.GB3, 4],
  [N.F3, 2],
  [N.REST, 2],
];

const FUNERAL_BASS: Note[] = [
  [N.BB2, 8],
  [N.BB2, 8],
  [N.BB2, 8],
  [N.BB2, 8],
  [N.BB2, 8],
  [N.AB2, 8],
  [N.GB2, 8],
  [N.F2, 8],
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

interface TuneConfig {
  notes: Note[];
  bass: Note[];
  beat: number;
  volume: number;
  wave: OscillatorType;
  bassWave: OscillatorType;
  bassLevel: number;
  legato: number;
}

const TUNES: Record<'alert' | 'funeral', TuneConfig> = {
  alert: {
    notes: MELODY,
    bass: MELODY_BASS,
    beat: 0.125,
    volume: 0.16,
    wave: 'square',
    bassWave: 'triangle',
    bassLevel: 0.7,
    legato: 0.86,
  },
  funeral: {
    notes: FUNERAL,
    bass: FUNERAL_BASS,
    beat: 0.17,
    volume: 0.2,
    wave: 'triangle',
    bassWave: 'sine',
    bassLevel: 0.85,
    legato: 0.94,
  },
};

const scheduleTrack = (
  audio: AudioContext,
  notes: Note[],
  beat: number,
  wave: OscillatorType,
  out: AudioNode,
  start: number,
  limit: number,
  legato: number,
) => {
  let t = start;
  while (t < limit) {
    for (const [freq, beats] of notes) {
      const dur = beats * beat;
      if (t >= limit) break;
      if (freq > 0) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const len = Math.min(dur * legato, limit - t);
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(1, t + 0.012);
        gain.gain.setValueAtTime(1, t + len * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
        osc.connect(gain);
        gain.connect(out);
        osc.start(t);
        osc.stop(t + len + 0.02);
      }
      t += dur;
    }
  }
};

const playTune = (kind: 'alert' | 'funeral', seconds: number, force = false) => {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const now = audio.currentTime;
  if (!force && now < stopAt) return;

  const { notes, bass, beat, volume, wave, bassWave, bassLevel, legato } = TUNES[kind];

  const master = audio.createGain();
  master.gain.value = volume;

  const tone = audio.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = kind === 'alert' ? 3800 : 2200;
  tone.Q.value = 0.4;

  master.connect(tone);
  tone.connect(audio.destination);

  const lead = audio.createGain();
  lead.gain.value = 1;
  lead.connect(master);

  const low = audio.createGain();
  low.gain.value = bassLevel;
  low.connect(master);

  const start = now + 0.06;
  const limit = now + seconds;

  scheduleTrack(audio, notes, beat, wave, lead, start, limit, legato);
  scheduleTrack(audio, bass, beat, bassWave, low, start, limit, 0.95);

  stopAt = limit;
  master.gain.setValueAtTime(volume, limit - 0.4);
  master.gain.linearRampToValueAtTime(0, limit);
};

export const playAlertTune = (seconds = 10) => playTune('alert', seconds);

export const playFuneralTune = (seconds = 17) => playTune('funeral', seconds, true);

export default playAlertTune;

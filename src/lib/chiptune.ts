type Note = [freq: number, beats: number];

const N: Record<string, number> = {
  REST: 0,
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  GB2: 92.5,
  AB2: 103.83,
  BB2: 116.54,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  GB3: 185.0,
  AB3: 207.65,
  BB3: 233.08,
  C4: 261.63,
  D4: 293.66,
  DB4: 277.18,
  E4: 329.63,
  F4: 349.23,
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
  B5: 987.77,
  C6: 1046.5,
};

const MARCH: Note[] = [
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

const MARCH_BASS: Note[] = [
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

const CHIME: Note[] = [
  [N.C5, 2],
  [N.E5, 2],
  [N.G5, 2],
  [N.C6, 4],
  [N.REST, 2],
  [N.G5, 2],
  [N.E5, 2],
  [N.C5, 4],
  [N.REST, 4],
];

const CHIME_BASS: Note[] = [
  [N.C3, 4],
  [N.G3, 4],
  [N.C3, 4],
  [N.G3, 4],
  [N.F3, 4],
  [N.C3, 4],
  [N.G3, 4],
  [N.C3, 4],
];

const BEEP: Note[] = [
  [N.A5, 1],
  [N.REST, 1],
  [N.A5, 1],
  [N.REST, 1],
  [N.A5, 1],
  [N.REST, 5],
];

const BEEP_BASS: Note[] = [
  [N.A3, 1],
  [N.REST, 1],
  [N.A3, 1],
  [N.REST, 1],
  [N.A3, 1],
  [N.REST, 5],
];

const SIREN: Note[] = [
  [N.E5, 3],
  [N.C5, 3],
  [N.E5, 3],
  [N.C5, 3],
  [N.F5, 3],
  [N.D5, 3],
  [N.F5, 3],
  [N.D5, 3],
];

const SIREN_BASS: Note[] = [
  [N.A2, 6],
  [N.A2, 6],
  [N.D3, 6],
  [N.D3, 6],
];

const WALTZ: Note[] = [
  [N.G4, 2],
  [N.C5, 2],
  [N.E5, 2],
  [N.G5, 4],
  [N.E5, 2],
  [N.D5, 2],
  [N.C5, 2],
  [N.E5, 2],
  [N.D5, 4],
  [N.REST, 2],
  [N.F4, 2],
  [N.A4, 2],
  [N.D5, 2],
  [N.F5, 4],
  [N.D5, 2],
  [N.C5, 2],
  [N.B4, 2],
  [N.D5, 2],
  [N.C5, 4],
  [N.REST, 2],
];

const WALTZ_BASS: Note[] = [
  [N.C3, 2],
  [N.G3, 2],
  [N.G3, 2],
  [N.C3, 2],
  [N.G3, 2],
  [N.G3, 2],
  [N.G2, 2],
  [N.D3, 2],
  [N.D3, 2],
  [N.G2, 2],
  [N.D3, 2],
  [N.D3, 2],
  [N.D3, 2],
  [N.A3, 2],
  [N.A3, 2],
  [N.D3, 2],
  [N.A3, 2],
  [N.A3, 2],
  [N.G2, 2],
  [N.D3, 2],
  [N.D3, 2],
  [N.C3, 2],
  [N.G3, 2],
  [N.G3, 2],
];

const DARK: Note[] = [
  [N.A3, 4],
  [N.E4, 4],
  [N.F4, 4],
  [N.E4, 4],
  [N.D4, 4],
  [N.A3, 4],
  [N.C4, 4],
  [N.A3, 4],
  [N.A3, 4],
  [N.E4, 4],
  [N.F4, 4],
  [N.G4, 4],
  [N.A4, 6],
  [N.REST, 2],
];

const DARK_BASS: Note[] = [
  [N.A2, 8],
  [N.A2, 8],
  [N.F2, 8],
  [N.F2, 8],
  [N.D2, 8],
  [N.D2, 8],
  [N.E2, 8],
  [N.A2, 8],
];

export interface TuneConfig {
  id: string;
  name: string;
  hint: string;
  notes: Note[];
  bass: Note[];
  beat: number;
  volume: number;
  wave: OscillatorType;
  bassWave: OscillatorType;
  bassLevel: number;
  legato: number;
  cutoff: number;
}

export const TUNES: TuneConfig[] = [
  {
    id: 'march',
    name: 'Бодрый марш',
    hint: 'Весёлая быстрая тема',
    notes: MARCH,
    bass: MARCH_BASS,
    beat: 0.125,
    volume: 0.16,
    wave: 'square',
    bassWave: 'triangle',
    bassLevel: 0.7,
    legato: 0.86,
    cutoff: 3800,
  },
  {
    id: 'chime',
    name: 'Перезвон',
    hint: 'Мягкий деликатный сигнал',
    notes: CHIME,
    bass: CHIME_BASS,
    beat: 0.16,
    volume: 0.18,
    wave: 'sine',
    bassWave: 'triangle',
    bassLevel: 0.5,
    legato: 0.95,
    cutoff: 5000,
  },
  {
    id: 'waltz',
    name: 'Вальс',
    hint: 'Спокойная мелодия на три счёта',
    notes: WALTZ,
    bass: WALTZ_BASS,
    beat: 0.13,
    volume: 0.17,
    wave: 'triangle',
    bassWave: 'sine',
    bassLevel: 0.65,
    legato: 0.9,
    cutoff: 4200,
  },
  {
    id: 'beep',
    name: 'Три гудка',
    hint: 'Короткий строгий сигнал',
    notes: BEEP,
    bass: BEEP_BASS,
    beat: 0.13,
    volume: 0.14,
    wave: 'square',
    bassWave: 'square',
    bassLevel: 0.4,
    legato: 0.8,
    cutoff: 3000,
  },
  {
    id: 'siren',
    name: 'Сирена',
    hint: 'Настойчивый тревожный сигнал',
    notes: SIREN,
    bass: SIREN_BASS,
    beat: 0.14,
    volume: 0.16,
    wave: 'sawtooth',
    bassWave: 'triangle',
    bassLevel: 0.6,
    legato: 0.98,
    cutoff: 2600,
  },
  {
    id: 'funeral',
    name: 'Траурный марш',
    hint: 'Тяжёлая тема для просрочки',
    notes: FUNERAL,
    bass: FUNERAL_BASS,
    beat: 0.17,
    volume: 0.2,
    wave: 'triangle',
    bassWave: 'sine',
    bassLevel: 0.85,
    legato: 0.94,
    cutoff: 2200,
  },
  {
    id: 'dark',
    name: 'Мрачный мотив',
    hint: 'Минорная тема, без пафоса',
    notes: DARK,
    bass: DARK_BASS,
    beat: 0.15,
    volume: 0.18,
    wave: 'triangle',
    bassWave: 'sine',
    bassLevel: 0.8,
    legato: 0.92,
    cutoff: 2400,
  },
];

export type TuneId = string;

export const getTune = (id: TuneId) => TUNES.find((t) => t.id === id) ?? TUNES[0];

let ctx: AudioContext | null = null;
let stopAt = 0;
let current: { master: GainNode; oscillators: OscillatorNode[] } | null = null;

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

export const stopTune = () => {
  if (!current) return;
  const audio = getCtx();
  if (audio) {
    const t = audio.currentTime;
    current.master.gain.cancelScheduledValues(t);
    current.master.gain.setValueAtTime(current.master.gain.value, t);
    current.master.gain.linearRampToValueAtTime(0, t + 0.08);
    current.oscillators.forEach((o) => {
      try {
        o.stop(t + 0.1);
      } catch {
        /* already stopped */
      }
    });
  }
  current = null;
  stopAt = 0;
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
  sink: OscillatorNode[],
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
        sink.push(osc);
      }
      t += dur;
    }
  }
};

export const playTune = (id: TuneId, seconds: number, force = false) => {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const now = audio.currentTime;
  if (!force && now < stopAt) return;
  if (force) stopTune();

  const tune = getTune(id);
  const { notes, bass, beat, volume, wave, bassWave, bassLevel, legato, cutoff } = tune;

  const master = audio.createGain();
  master.gain.value = volume;

  const tone = audio.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = cutoff;
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
  const sink: OscillatorNode[] = [];

  scheduleTrack(audio, notes, beat, wave, lead, start, limit, legato, sink);
  scheduleTrack(audio, bass, beat, bassWave, low, start, limit, 0.95, sink);

  stopAt = limit;
  current = { master, oscillators: sink };
  master.gain.setValueAtTime(volume, limit - 0.4);
  master.gain.linearRampToValueAtTime(0, limit);
};

export const previewTune = (id: TuneId, seconds = 6) => playTune(id, seconds, true);

export const playAlertTune = (id: TuneId = 'march', seconds = 10) => playTune(id, seconds);

export const playFuneralTune = (id: TuneId = 'funeral', seconds = 17) =>
  playTune(id, seconds, true);

export default playAlertTune;

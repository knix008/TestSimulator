// The guide voice: a formant singer. A buzzing source (sawtooth with a slight scoop into the note and a
// delayed vibrato) goes through three band-pass filters tuned to the formants of the syllable's vowel,
// so the melody is heard on "a e i o u" in the words' order — a guide for the singer, not a real voice.
// A consonant at the start of a syllable adds a short burst of noise. The choir sings three detuned voices.
import { midiToFrequency } from '../music/theory.js';
import { startsWithConsonant, vowelOf } from '../music/syllables.js';

/** Formant frequencies (Hz) and levels of the five sung vowels, female and male. */
export const FORMANTS = {
  female: { a: [850, 1220, 2810], e: [560, 2000, 2850], i: [320, 2750, 3300], o: [470, 900, 2830], u: [380, 950, 2700] },
  male: { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [280, 2250, 2900], o: [570, 840, 2410], u: [320, 870, 2240] },
};
const LEVELS = [1, 0.55, 0.28];
const BANDWIDTH = [80, 100, 140];

function voiceLine(ac, dest, { set, when, dur, f, vel, syllable, detune = 0, delay = 0, level = 1, previousF }) {
  const t0 = when + delay;
  const vowel = vowelOf(syllable);
  const [f1, f2, f3] = set[vowel] ?? set.a;
  const end = t0 + Math.max(0.06, dur) + 0.18;
  const src = ac.createOscillator();
  src.type = 'sawtooth';
  // Scoop: from the last note (legato) or a little under the pitch.
  const from = previousF && Math.abs(Math.log2(previousF / f)) < 0.6 ? previousF : f * 2 ** (-35 / 1200);
  src.frequency.setValueAtTime(from, t0);
  src.frequency.exponentialRampToValueAtTime(f, t0 + Math.min(0.08, dur * 0.4));
  if (detune) src.detune.setValueAtTime(detune, t0);
  const vib = ac.createOscillator();
  vib.frequency.value = 5.4;
  const depth = ac.createGain();
  depth.gain.setValueAtTime(0, t0);
  depth.gain.linearRampToValueAtTime(dur > 0.4 ? 28 : 6, t0 + Math.min(0.6, Math.max(0.2, dur * 0.6)));
  vib.connect(depth).connect(src.detune);
  const amp = ac.createGain();
  const peak = (0.32 + vel * 0.5) * level;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.035);
  amp.gain.setTargetAtTime(peak * 0.85, t0 + 0.05, 0.2);
  amp.gain.setTargetAtTime(0.0001, t0 + Math.max(0.05, dur), 0.04);
  // Formant bank in parallel; the vowel drifts towards its next shape a little during long notes.
  for (let k = 0; k < 3; k++) {
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    const freq = [f1, f2, f3][k];
    bp.frequency.setValueAtTime(freq, t0);
    bp.Q.value = freq / BANDWIDTH[k];
    const g = ac.createGain();
    g.gain.value = LEVELS[k] * 4.5;
    src.connect(bp).connect(g).connect(amp);
  }
  // A little of the raw source keeps the voice bright enough to read in a mix.
  const air = ac.createGain();
  air.gain.value = 0.04;
  src.connect(air).connect(amp);
  amp.connect(dest);
  src.start(t0); src.stop(end);
  vib.start(t0); vib.stop(end);
  const sources = [src, vib];
  if (startsWithConsonant(syllable) && dur > 0.08) {
    const noise = ac.createBufferSource();
    const len = Math.floor(ac.sampleRate * 0.05);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noise.buffer = buffer;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2800;
    const g = ac.createGain();
    g.gain.value = 0.12 * level;
    noise.connect(hp).connect(g).connect(dest);
    noise.start(Math.max(0, t0 - 0.01));
    sources.push(noise);
  }
  return sources;
}

/**
 * Sings one syllable. voice: 'female' | 'male' | 'choir'; when, dur in seconds; previous: the last
 * note's MIDI number (legato scoop). Returns the sources.
 */
export function sing(ac, dest, { voice = 'female', when, dur, midi, vel = 0.8, syllable = 'a', previous = null }) {
  const f = midiToFrequency(midi);
  const previousF = previous != null ? midiToFrequency(previous) : null;
  if (voice === 'choir') {
    return [
      ...voiceLine(ac, dest, { set: FORMANTS.female, when, dur, f, vel, syllable, detune: -9, level: 0.5, previousF }),
      ...voiceLine(ac, dest, { set: FORMANTS.female, when, dur, f, vel, syllable, detune: 8, delay: 0.012, level: 0.45, previousF }),
      ...voiceLine(ac, dest, { set: FORMANTS.male, when, dur, f: f / 2, vel, syllable, detune: 3, delay: 0.006, level: 0.4, previousF: previousF ? previousF / 2 : null }),
    ];
  }
  return voiceLine(ac, dest, { set: voice === 'male' ? FORMANTS.male : FORMANTS.female, when, dur, f, vel, syllable, previousF });
}

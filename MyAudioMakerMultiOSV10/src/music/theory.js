// Music theory (CONTRACT: pure, no DOM, no audio): pitch names, keys and scales, chords and
// roman-numeral progressions, voice leading. MIDI note numbers throughout (60 = C4), beats as
// quarter notes. Everything here is deterministic and tested in Node.

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Keys spelled with flats (major tonics; minor keys use their relative major). */
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]);

export const mod12 = (n) => ((n % 12) + 12) % 12;

/** Scale steps in semitones from the tonic. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};
export const MODES = Object.keys(SCALES);
/** Modes whose third is minor (they read and print as "minor" keys). */
export const MINOR_MODES = new Set(['minor', 'harmonicMinor', 'dorian', 'phrygian', 'pentatonicMinor', 'blues']);
export const isMinorMode = (mode) => MINOR_MODES.has(mode);

/** Pitch class (0–11) of a note name ("C", "F#", "Bb", "e"), or null. */
export function pitchClass(name) {
  const m = /^\s*([A-Ga-g])\s*([#♯b♭]*)/.exec(String(name ?? ''));
  if (!m) return null;
  let pc = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  for (const ch of m[2]) pc += ch === '#' || ch === '♯' ? 1 : -1;
  return mod12(pc);
}

/** Whether a key is written with flats. */
export function prefersFlats(tonic, mode = 'major') {
  const major = isMinorMode(mode) ? mod12(tonic + 3) : tonic;
  return FLAT_MAJORS.has(mod12(major));
}

/** "C#", "Db" … for a pitch class. */
export const pcName = (pc, flats = false) => (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];

/** "C4", "F#5" for a MIDI note. */
export function noteName(midi, flats = false) {
  const n = Math.round(midi);
  return `${pcName(n, flats)}${Math.floor(n / 12) - 1}`;
}

/** MIDI number of "C4", "Bb3", "a#2" (null when it is not a note). */
export function parseNote(text) {
  const m = /^\s*([A-Ga-g][#♯b♭]*)\s*(-?\d+)\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  // The letter's own octave: B#3 is C4, Cb4 is B3.
  const letter = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1][0].toLowerCase()];
  let shift = 0;
  for (const ch of m[1].slice(1)) shift += ch === '#' || ch === '♯' ? 1 : -1;
  return (Number(m[2]) + 1) * 12 + letter + shift;
}

export const midiToFrequency = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);
export const frequencyToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);

/** A key: { tonic (pc), mode }. Accepts "C", "Am", "A minor", "F# dorian", "Eb major". */
export function parseKey(text) {
  const s = String(text ?? '').trim();
  const pc = pitchClass(s);
  if (pc == null) return { tonic: 0, mode: 'major' };
  const rest = s.replace(/^\s*[A-Ga-g][#♯b♭]*/, '').trim().toLowerCase();
  let mode = 'major';
  if (/^(m|min|minor|단조)$/.test(rest) || /^m(?!aj)/.test(rest)) mode = 'minor';
  for (const name of MODES) if (rest === name.toLowerCase()) mode = name;
  if (/harmonic/.test(rest)) mode = 'harmonicMinor';
  if (/^(maj|major|장조)$/.test(rest)) mode = 'major';
  return { tonic: pc, mode };
}

/** "C major", "A minor", "F# dorian". */
export function keyName(key, { short = false } = {}) {
  const flats = prefersFlats(key.tonic, key.mode);
  const name = pcName(key.tonic, flats);
  if (short) return `${name}${isMinorMode(key.mode) ? 'm' : ''}`;
  return `${name} ${key.mode === 'harmonicMinor' ? 'harmonic minor' : key.mode}`;
}

/** Pitch classes of a key's scale. */
export const scalePcs = (key) => SCALES[key.mode].map((s) => mod12(key.tonic + s));

/** Whether a MIDI note is in the key's scale. */
export const inScale = (midi, key) => scalePcs(key).includes(mod12(midi));

/** The scale notes from `low` to `high` (MIDI, inclusive). */
export function scaleRange(key, low, high) {
  const pcs = new Set(scalePcs(key));
  const out = [];
  for (let n = Math.ceil(low); n <= high; n++) if (pcs.has(mod12(n))) out.push(n);
  return out;
}

/** The scale note nearest to `midi` (ties go up). */
export function snapToScale(midi, key) {
  const pcs = new Set(scalePcs(key));
  for (let d = 0; d < 12; d++) {
    if (pcs.has(mod12(midi + d))) return midi + d;
    if (pcs.has(mod12(midi - d))) return midi - d;
  }
  return midi;
}

// ───────────────────────── chords

/** Chord qualities: intervals from the root. */
export const QUALITIES = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
};
const SUFFIX = { maj: '', min: 'm', dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4', '7': '7', maj7: 'maj7', m7: 'm7', m7b5: 'm7b5', dim7: 'dim7', add9: 'add9', madd9: 'madd9', '6': '6', m6: 'm6', '9': '9', m9: 'm9', maj9: 'maj9' };

/** A chord's symbol: "Am7", "F#", "Bb/D". */
export function chordSymbol(chord, flats = false) {
  if (!chord) return '';
  const base = `${pcName(chord.root, flats)}${SUFFIX[chord.quality] ?? ''}`;
  return chord.bass != null && mod12(chord.bass) !== mod12(chord.root) ? `${base}/${pcName(chord.bass, flats)}` : base;
}

/** Parses "Am7", "C", "F#m", "Bb/D", "Gsus4", "Edim", "N.C." (null for no chord / not a chord). */
export function parseChordSymbol(text) {
  const s = String(text ?? '').trim();
  const m = /^([A-Ga-g][#♯b♭]?)([^/\s]*)(?:\/([A-Ga-g][#♯b♭]?))?$/.exec(s);
  if (!m) return null;
  const root = pitchClass(m[1]);
  const suffix = m[2].replace('♭', 'b').replace('♯', '#');
  const table = [
    ['maj9', 'maj9'], ['maj7', 'maj7'], ['M7', 'maj7'], ['Δ7', 'maj7'], ['Δ', 'maj7'], ['m7b5', 'm7b5'], ['ø', 'm7b5'], ['dim7', 'dim7'], ['°7', 'dim7'],
    ['madd9', 'madd9'], ['m9', 'm9'], ['m7', 'm7'], ['min7', 'm7'], ['m6', 'm6'], ['add9', 'add9'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['sus', 'sus4'],
    ['dim', 'dim'], ['°', 'dim'], ['aug', 'aug'], ['+', 'aug'], ['min', 'min'], ['m', 'min'], ['maj', 'maj'], ['9', '9'], ['7', '7'], ['6', '6'], ['', 'maj'],
  ];
  const hit = table.find(([k]) => suffix === k);
  if (!hit) return null;
  const chord = { root, quality: hit[1] };
  if (m[3]) chord.bass = pitchClass(m[3]);
  return chord;
}

/** Pitch classes of a chord. */
export const chordPcs = (chord) => (QUALITIES[chord.quality] ?? QUALITIES.maj).map((i) => mod12(chord.root + i));

/** Parses a space/bar separated chord line ("C G Am F", "| Am | F G |") into chords (null for "-" / "N.C."). */
export function parseChordLine(text) {
  return String(text ?? '').split(/[\s|,]+/).filter(Boolean).map((token) => (/^(-|n\.?c\.?|x)$/i.test(token) ? null : parseChordSymbol(token))).filter((c) => c !== undefined);
}

// Roman numerals: degree (1–7) of the major scale it sits on, quality from the case and marks.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * A roman numeral in a key → a chord. "I", "vi", "IV", "V7", "ii7", "viiø", "bVII", "#iv°", "Imaj7", "IVadd9",
 * "V/V" (secondary dominant), "sus4" suffix. Degrees are counted on the major scale of the tonic
 * (so in A minor "i" is A and "bVI" is F, "bVII" is G), which is how pop progressions are written.
 */
export function romanToChord(roman, key) {
  const s = String(roman ?? '').trim();
  const slash = s.split('/');
  if (slash.length === 2 && slash[1]) {
    const target = romanToChord(slash[1], key);
    if (target) return romanToChord(slash[0], { tonic: target.root, mode: 'major' });
  }
  const m = /^([b#♭♯]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(s);
  if (!m) return null;
  const degree = ROMAN.indexOf(m[2].toUpperCase());
  const upper = m[2] === m[2].toUpperCase();
  const accidental = m[1] === 'b' || m[1] === '♭' ? -1 : m[1] ? 1 : 0;
  const root = mod12(key.tonic + SCALES.major[degree] + accidental);
  const mark = m[3];
  let quality = upper ? 'maj' : 'min';
  if (/^(°|dim|o)/.test(mark)) quality = /7/.test(mark) ? 'dim7' : 'dim';
  else if (/^(ø|m7b5)/.test(mark)) quality = 'm7b5';
  else if (/^\+|^aug/.test(mark)) quality = 'aug';
  else if (/maj9/.test(mark)) quality = 'maj9';
  else if (/maj7|M7|Δ/.test(mark)) quality = 'maj7';
  else if (/add9/.test(mark)) quality = upper ? 'add9' : 'madd9';
  else if (/sus2/.test(mark)) quality = 'sus2';
  else if (/sus/.test(mark)) quality = 'sus4';
  else if (/^9/.test(mark)) quality = upper ? '9' : 'm9';
  else if (/^7/.test(mark)) quality = upper ? '7' : 'm7';
  else if (/^6/.test(mark)) quality = upper ? '6' : 'm6';
  return { root, quality };
}

/** The diatonic triad (or seventh) on a scale degree (1-based) of the key. */
export function diatonicChord(key, degree, seventh = false) {
  const steps = SCALES[key.mode].length === 7 ? SCALES[key.mode] : SCALES[isMinorMode(key.mode) ? 'minor' : 'major'];
  const at = (k) => steps[((degree - 1 + k) % 7 + 7) % 7] + 12 * Math.floor((degree - 1 + k) / 7);
  const root = at(0);
  const third = mod12(at(2) - root);
  const fifth = mod12(at(4) - root);
  const sev = mod12(at(6) - root);
  let quality = third === 4 ? (fifth === 8 ? 'aug' : 'maj') : (fifth === 6 ? 'dim' : 'min');
  if (seventh) quality = { maj: sev === 11 ? 'maj7' : '7', min: 'm7', dim: sev === 9 ? 'dim7' : 'm7b5', aug: 'maj7' }[quality];
  return { root: mod12(key.tonic + root), quality };
}

/** Whether a pitch class is a chord tone. */
export const isChordTone = (midi, chord) => Boolean(chord) && chordPcs(chord).includes(mod12(midi));

/** The chord tones from `low` to `high` (MIDI). */
export function chordRange(chord, low, high) {
  const pcs = new Set(chordPcs(chord));
  const out = [];
  for (let n = Math.ceil(low); n <= high; n++) if (pcs.has(mod12(n))) out.push(n);
  return out;
}

/**
 * A close voicing of `chord` near `center` (MIDI), moving as little as possible from `previous` (voice
 * leading): every inversion in the range is tried and the one with the smallest total movement wins.
 */
export function voiceChord(chord, { center = 60, previous = null, voices = 3, low = 48, high = 79 } = {}) {
  const pcs = chordPcs(chord);
  const tones = pcs.slice(0, Math.max(3, Math.min(voices, pcs.length)));
  // Sevenths and ninths in a small voicing: keep the third and seventh (the colour), drop the fifth.
  if (voices === 3 && pcs.length >= 4) tones.splice(0, tones.length, pcs[0], pcs[1], pcs[3]);
  const candidates = [];
  for (let base = low - 12; base <= high; base++) {
    if (mod12(base) !== tones[0] && !tones.includes(mod12(base))) continue;
    // One inversion: start on `base`, stack the other tones above.
    const start = tones.indexOf(mod12(base));
    if (start < 0) continue;
    const order = [...tones.slice(start), ...tones.slice(0, start)];
    const notes = [base];
    for (const pc of order.slice(1)) { let n = notes[notes.length - 1] + 1; while (mod12(n) !== pc) n++; notes.push(n); }
    if (notes[0] < low || notes[notes.length - 1] > high) continue;
    candidates.push(notes);
  }
  if (!candidates.length) return tones.map((pc) => 60 + pc);
  const cost = (notes) => {
    const mid = notes.reduce((a, b) => a + b, 0) / notes.length;
    if (!previous?.length) return Math.abs(mid - center);
    let move = 0;
    for (const n of notes) move += Math.min(...previous.map((p) => Math.abs(p - n)));
    return move + Math.abs(mid - center) * 0.35;
  };
  candidates.sort((a, b) => cost(a) - cost(b));
  return candidates[0];
}

/** Moves `midi` by `steps` scale steps in the key (diatonic transposition). */
export function scaleStep(midi, steps, key) {
  const start = snapToScale(midi, key);
  const pcs = scalePcs(key);
  let n = start;
  const dir = Math.sign(steps);
  for (let k = 0; k < Math.abs(steps); k++) { n += dir; while (!pcs.includes(mod12(n))) n += dir; }
  return n;
}

/** Transposes a chord by semitones. */
export const transposeChord = (chord, semitones) => (chord ? { ...chord, root: mod12(chord.root + semitones), ...(chord.bass != null ? { bass: mod12(chord.bass + semitones) } : {}) } : chord);

/** Beats per bar of a time signature [n, d] (quarter-note beats). */
export const beatsPerBar = (ts = [4, 4]) => (ts[0] * 4) / ts[1];

/** Seconds of `beats` at `bpm`. */
export const beatsToSeconds = (beats, bpm) => (beats * 60) / bpm;
export const secondsToBeats = (seconds, bpm) => (seconds * bpm) / 60;

/** "1:3" (bar:beat, 1-based) for a beat position. */
export function barBeatLabel(beat, ts = [4, 4]) {
  const per = beatsPerBar(ts);
  const bar = Math.floor(beat / per);
  const inBar = beat - bar * per;
  return `${bar + 1}:${Math.floor(inBar) + 1}`;
}

/** "2:05" for seconds. */
export function timeLabel(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

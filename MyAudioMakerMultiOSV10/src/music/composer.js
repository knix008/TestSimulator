// The built-in composer (CONTRACT: pure, deterministic for a seed, no DOM, no audio). From a few
// choices — genre, mood, key, tempo, form, lyrics — it writes a whole arrangement: chord progressions
// per section, a sung melody that gives every lyric syllable a note (strong beats on chord tones, a
// contour per phrase, repeated sections repeat), an instrumental hook, an accompaniment in the genre's
// style with voice leading, a bass line, drum grooves with fills and crashes, pads and arpeggios.
//
// compose(spec) → song (music/song.js). writeSection(song, section, parts, seed) rewrites one part of
// one section (Regenerate), fitMelody(song, section) sets edited lyrics to a new melody.
import { beatsPerBar, chordPcs, chordRange, chordSymbol, isChordTone, mod12, parseChordSymbol, prefersFlats, romanToChord, scalePcs, scaleRange, snapToScale, voiceChord } from './theory.js';
import { genreOf, moodOf, SECTION_DEFAULTS, structureOf } from './genres.js';
import { instrument } from './instruments.js';
import { addNotes, barBeats, clearRange, newId, normalizeSong, sectionSpans, ROLE_COLORS } from './song.js';
import { syllabify } from './syllables.js';
import { writeLyrics } from './lyrics.js';
import { rng } from './random.js';

/** The parts a section has (Regenerate can rewrite any of them). */
export const PARTS = ['chords', 'melody', 'lead', 'accompaniment', 'bass', 'drums', 'pad'];
/** Comfortable sung keys (pitch classes) for a guide voice. */
const VOCAL_KEYS = [0, 2, 3, 5, 7, 8, 9, 10];
const VOICE_RANGE = { voiceFemale: [60, 77, 67], voiceMale: [48, 66, 56], voiceChoir: [55, 74, 63] };
const ROLE_LEVEL = { vocal: 0.9, lead: 0.55, chords: 0.62, bass: 0.78, drums: 0.78, pad: 0.38, arp: 0.36, counter: 0.45 };
const ROLE_PAN = { vocal: 0, lead: 0.22, chords: -0.18, bass: 0, drums: 0, pad: 0.05, arp: 0.32, counter: -0.3 };

const r3 = (v) => Math.round(v * 1000) / 1000;
const note = (t, d, p, v, syl) => ({ t: r3(t), d: r3(Math.max(0.05, d)), p: Math.round(p), v: Math.round(Math.min(1, Math.max(0.05, v)) * 100) / 100, ...(syl ? { syl } : {}) });

// ───────────────────────── the whole song

/**
 * spec: { title?, topic?, genre, mood, key?: { tonic, mode }, bpm?, structure? (id) | sections? ([type] or
 * [{ type, bars }]), language, vocal (instrument id | 'none'), seed, lyrics? ({ title, sections: [lines per
 * section index] } from an AI provider), chords? ([[symbols per bar] per section index]), band? (role →
 * instrument), parts? ({ lead, pad, arp }: false to leave out) }.
 */
export function compose(spec = {}) {
  const seed = Math.round(Number(spec.seed) || 1);
  const random = rng(seed);
  const genre = genreOf(spec.genre);
  const mood = moodOf(spec.mood);
  const ts = genre.timeSignature ?? [4, 4];
  const mode = spec.key?.mode ?? (mood.mode === 'minor' ? 'minor' : 'major');
  const tonic = Number.isInteger(spec.key?.tonic) ? spec.key.tonic : random.pick(VOCAL_KEYS);
  const bpm = Number(spec.bpm) > 0 ? Number(spec.bpm) : Math.round(Math.min(genre.bpm[1] + 6, Math.max(genre.bpm[0] - 6, (genre.bpm[0] + random() * (genre.bpm[1] - genre.bpm[0])) * mood.tempo)));
  const types = Array.isArray(spec.sections) && spec.sections.length ? spec.sections : structureOf(spec.structure).sections;
  const language = spec.language === 'en' ? 'en' : 'ko';
  const vocal = spec.vocal === 'none' ? null : (spec.vocal && instrument(spec.vocal).vocal ? spec.vocal : genre.band.vocal ?? 'voiceFemale');

  const firstOf = {};
  const sections = types.map((entry) => {
    const type = typeof entry === 'string' ? entry : entry.type;
    const bars = Math.max(1, Math.round((typeof entry === 'object' && entry.bars) || SECTION_DEFAULTS[type]?.bars || 8));
    const lines = typeof entry === 'object' && entry.lines != null ? entry.lines : SECTION_DEFAULTS[type]?.lines ?? 0;
    const id = newId('sec');
    // The second chorus (and pre-chorus) sings the first one's words and tune.
    const repeatOf = (type === 'chorus' || type === 'prechorus' || type === 'drop' || type === 'build') && firstOf[type] ? firstOf[type] : null;
    firstOf[type] ??= id;
    return { id, type, label: '', bars, chords: [], lyrics: [], repeatOf, lines };
  });

  const song = normalizeSong({
    title: spec.title ?? '', artist: spec.artist ?? '', genre: genre.id, mood: mood.id, topic: spec.topic ?? '', language, seed,
    key: { tonic, mode }, bpm, timeSignature: ts, swing: genre.swing ?? 0, sections, tracks: [],
    ai: { provider: spec.provider ?? 'builtin', prompt: spec.prompt ?? spec.topic ?? '', model: spec.model ?? '' },
  });
  // normalizeSong drops unknown fields: the sung line counts come back from the plan.
  song.sections.forEach((s, i) => { s.lines = sections[i].lines; });

  // Chords: an AI plan, else the genre's progressions (sections of a type share one).
  const progressionOf = {};
  song.sections.forEach((section, index) => {
    const planned = spec.chords?.[index];
    if (Array.isArray(planned) && planned.length) section.chords = chordsFromBars(song, section, planned);
    else if (section.repeatOf) section.chords = song.sections.find((s) => s.id === section.repeatOf).chords.map((c) => ({ ...c }));
    else {
      progressionOf[section.type] ??= pickProgression(genre, mode, section.type, random);
      section.chords = chordsFromRomans(song, section, progressionOf[section.type], random, song.sections[index + 1]);
    }
  });

  // Lyrics: the AI's, else the built-in writer's.
  const given = spec.lyrics?.sections;
  if (Array.isArray(given)) {
    song.sections.forEach((section, i) => { section.lyrics = (given[i] ?? []).map(String).filter((l) => l.trim()); });
    song.title = song.title || spec.lyrics.title || '';
  } else if (spec.lyrics !== false) {
    const written = writeLyrics({ topic: spec.topic, mood: mood.id, theme: spec.theme, language, seed: seed + 7, sections: song.sections.map((s) => ({ id: s.id, type: s.type, lines: s.lines, repeatOf: s.repeatOf })) });
    for (const section of song.sections) section.lyrics = written.sections[section.id] ?? [];
    song.title = song.title || written.title;
    song.theme = written.theme;
  }
  for (const section of song.sections) {
    if (section.repeatOf) { const src = song.sections.find((s) => s.id === section.repeatOf); if (src && arraysEqual(src.lyrics, section.lyrics)) continue; section.repeatOf = section.lyrics.length ? null : section.repeatOf; }
  }

  // The band.
  const band = { ...genre.band, ...(spec.band ?? {}) };
  const parts = { lead: true, pad: true, arp: Boolean(band.arp), ...(spec.parts ?? {}) };
  const tracks = [];
  const add = (role, inst) => tracks.push({ id: newId('trk'), role, instrument: inst, name: '', volume: ROLE_LEVEL[role], pan: ROLE_PAN[role], reverb: role === 'drums' || role === 'bass' ? 0.08 : role === 'vocal' ? 0.32 : 0.26, mute: false, solo: false, color: ROLE_COLORS[role], notes: [] });
  if (vocal && song.sections.some((s) => s.lyrics.length)) add('vocal', vocal);
  if (parts.lead) add('lead', band.lead);
  add('chords', band.chords);
  add('bass', band.bass);
  add('drums', band.kit);
  if (parts.pad && band.pad) add('pad', band.pad);
  if (parts.arp && band.arp) add('arp', band.arp);
  song.tracks = normalizeSong({ ...song, tracks }).tracks;

  for (const section of song.sections) writeSection(song, section, PARTS, seed);
  delete song.lines;
  for (const s of song.sections) delete s.lines;
  return song;
}

const arraysEqual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** A progression (roman numerals per bar) for a section type, from the genre's pool. */
function pickProgression(genre, mode, type, random) {
  const pool = genre.progressions[mode === 'major' || mode === 'lydian' || mode === 'mixolydian' ? 'major' : 'minor'] ?? genre.progressions.major;
  const fallback = { prechorus: 'bridge', build: 'prechorus', drop: 'chorus', interlude: 'verse', outro: 'intro', bridge: 'verse' }[type];
  const list = pool[type] ?? pool[fallback] ?? pool[{ bridge: 'verse', prechorus: 'verse', build: 'chorus' }[fallback]] ?? pool.verse ?? pool.chorus;
  return random.pick(list);
}

/** Chords of a section from roman numerals, one per bar (two per bar when the section is shorter than the progression). */
function chordsFromRomans(song, section, romans, random, next) {
  const per = barBeats(song);
  const flats = prefersFlats(song.key.tonic, song.key.mode);
  const perBar = section.bars < romans.length ? Math.ceil(romans.length / section.bars) : 1;
  const out = [];
  let k = 0;
  for (let bar = 0; bar < section.bars; bar++) {
    for (let j = 0; j < perBar; j++) {
      let roman = romans[k % romans.length];
      k++;
      // The last bar before a chorus leans on the dominant (V) — the lift into the chorus.
      if (bar === section.bars - 1 && j === perBar - 1 && next && (next.type === 'chorus' || next.type === 'drop') && section.type !== 'chorus' && random.chance(0.5)) roman = /7/.test(roman) ? 'V7' : 'V';
      // The song ends home.
      if (bar === section.bars - 1 && j === perBar - 1 && section.type === 'outro') roman = /^[iv]/.test(romans[0]) ? romans[0].replace(/7|maj7/, '') : 'I';
      const chord = romanToChord(roman, song.key);
      out.push({ at: bar * per + (j * per) / perBar, len: per / perBar, symbol: chord ? chordSymbol(chord, flats) : null });
    }
  }
  return out;
}

/** Chords of a section from symbols per bar (an AI plan); the bars repeat to fill the section. */
function chordsFromBars(song, section, bars) {
  const per = barBeats(song);
  const out = [];
  for (let b = 0; b < section.bars; b++) {
    const cell = bars[b % bars.length];
    const tokens = String(cell ?? '').split(/\s+/).filter((tok) => parseChordSymbol(tok));
    tokens.forEach((tok, i) => out.push({ at: b * per + (i * per) / tokens.length, len: per / tokens.length, symbol: tok }));
  }
  return out;
}

// ───────────────────────── one section

/** Rewrites `parts` (PARTS) of a section; tracks keep their notes elsewhere. */
export function writeSection(song, section, parts = PARTS, seed = song.seed) {
  const span = sectionSpans(song).find((s) => s.section === section);
  if (!span) return song;
  const index = song.sections.indexOf(section);
  const random = rng((Number(seed) || 1) * 31 + index * 977 + 5);
  const genre = genreOf(song.genre);
  const mood = moodOf(song.mood);
  const ctx = { song, section, start: span.start, end: span.end, per: barBeats(song), genre, mood, random, energy: section.energy ?? 0.6, index };
  const want = new Set(parts);
  if (want.has('chords') && parts !== PARTS) {
    const prog = pickProgression(genre, song.key.mode, section.type, random);
    section.chords = chordsFromRomans(song, section, prog, random, song.sections[index + 1]);
  }
  const roles = { melody: 'vocal', lead: 'lead', accompaniment: 'chords', bass: 'bass', drums: 'drums', pad: 'pad' };
  for (const [part, role] of Object.entries(roles)) {
    if (!want.has(part) && !(part === 'pad' && want.has('pad'))) continue;
    for (const track of song.tracks.filter((t) => t.role === role || (part === 'pad' && t.role === 'arp'))) {
      clearRange(track, ctx.start, ctx.end);
      const writer = { vocal: writeMelody, lead: writeLead, chords: writeAccompaniment, bass: writeBass, drums: writeDrums, pad: writePad, arp: writeArp }[track.role];
      addNotes(track, tidy(writer?.(ctx, track) ?? [], ctx, track));
    }
  }
  // Sections that repeat this one (a later chorus) follow its melody.
  if (want.has('melody')) for (const other of song.sections.filter((s) => s.repeatOf === section.id)) copyMelody(song, section, other);
  return song;
}

/**
 * Notes as written, made safe: inside the section (lengths cut at its end), within the instrument's
 * range (moved by octaves), and no two notes of the same pitch starting together.
 */
function tidy(notes, ctx, track) {
  const inst = instrument(track.instrument);
  const seen = new Map();
  for (const n of notes) {
    if (n.t < ctx.start - 1e-6 || n.t >= ctx.end - 1e-6) continue;
    if (n.t + n.d > ctx.end + 1e-6 && track.role !== 'drums') n.d = r3(Math.max(0.05, ctx.end - n.t));
    if (!inst.drums) { while (n.p > inst.range[1]) n.p -= 12; while (n.p < inst.range[0]) n.p += 12; }
    const key = `${n.t}:${n.p}`;
    const other = seen.get(key);
    if (!other || other.v < n.v) seen.set(key, n);
  }
  return [...seen.values()];
}

/** The chord at a beat inside the section (absolute beat). */
function chordAtBeat(ctx, beat) {
  const rel = beat - ctx.start;
  const c = ctx.section.chords.find((x) => rel >= x.at - 1e-9 && rel < x.at + x.len - 1e-9) ?? ctx.section.chords[ctx.section.chords.length - 1];
  return c?.symbol ? parseChordSymbol(c.symbol) : null;
}

// ───────────────────────── melody (the sung line)

/** Rhythm of one sung line: onsets and lengths (beats from the line's start) for `n` syllables in `length` beats. */
export function lineRhythm(n, length, { random, density = 0.55, sync = 0.4, per = 4 }) {
  if (n <= 0) return [];
  const breath = n > 3 ? Math.min(1, length * 0.12) : 0.5;
  const pickup = random.chance(0.3 * sync) ? 0.5 : 0;
  let space = length - breath - pickup;
  let grid = space / n >= 0.75 ? 0.5 : 0.25;
  if (n * grid > space) { space = length - pickup; if (n * grid > space) grid = space / n; }
  const slots = Math.max(n, Math.floor(space / grid + 1e-6));
  // The last syllable holds: two beats when there is room, else what is left.
  const finalSlots = Math.max(1, Math.min(Math.round((density < 0.5 ? 2 : 1.5) / grid), slots - (n - 1)));
  let extra = slots - finalSlots - (n - 1) - 1;
  const lengths = new Array(n).fill(1);
  lengths[n - 1] = finalSlots;
  // Spare slots lengthen notes: those that would start on a beat, and the one before the last.
  let guard = 0;
  while (extra > 0 && guard++ < 400) {
    const weights = lengths.slice(0, n - 1).map((len, i) => {
      const onset = lengths.slice(0, i).reduce((a, b) => a + b, 0) * grid;
      const onBeat = Math.abs(onset - Math.round(onset)) < 1e-6;
      return [i, (onBeat ? 2 : 1) * (i === n - 2 ? 2.5 : 1) * (len >= 4 ? 0.2 : 1) * (1 - sync * 0.5 + random() * sync)];
    });
    if (!weights.length) { lengths[n - 1] += extra; break; }
    lengths[random.weighted(weights)] += 1;
    extra -= 1;
  }
  const out = [];
  let at = pickup;
  for (let i = 0; i < n; i++) {
    const d = lengths[i] * grid;
    out.push({ at: r3(at), d: r3(Math.max(grid * 0.9, d - (i < n - 1 ? 0 : 0.05))) });
    at += d;
  }
  // Syncopation: a few notes land half a grid early (anticipation) — never the first or the last.
  if (sync > 0.45 && grid >= 0.5) for (let i = 1; i < n - 1; i++) if (random.chance((sync - 0.4) * 0.5)) { out[i].at = r3(out[i].at - grid / 2); out[i - 1].d = r3(Math.max(grid / 2, out[i - 1].d - grid / 2)); out[i].d = r3(out[i].d + grid / 2); }
  void per;
  return out;
}

/** The register a section sings in: [low, high, centre]. */
function vocalRegister(ctx, track) {
  const [lo, hi, centre] = VOICE_RANGE[track.instrument] ?? VOICE_RANGE.voiceFemale;
  const lift = { verse: -2, prechorus: 0, chorus: 3, bridge: 2, build: 1, drop: 3, intro: 0, outro: -1, interlude: 0 }[ctx.section.type] ?? 0;
  const c = centre + lift + Math.round(ctx.mood.lift / 2);
  // The key's tonic near the centre keeps the tune in the key's natural range.
  return [lo, hi, c];
}

/**
 * Pitches for onsets: strong beats take a chord tone near the phrase's contour, others step through
 * the scale toward it; the line ends on a chord tone (the tonic on the last line of a chorus).
 */
function linePitches(ctx, rhythm, lineStart, { low, high, centre, contour, previous, last }) {
  const key = ctx.song.key;
  const scale = scaleRange(key, low, high);
  const pitches = [];
  let prev = previous ?? snapToScale(centre, key);
  rhythm.forEach((r, i) => {
    const beat = lineStart + r.at;
    const chord = chordAtBeat(ctx, beat);
    const pos = rhythm.length > 1 ? i / (rhythm.length - 1) : 0;
    const shape = contour === 'arch' ? Math.sin(pos * Math.PI) : contour === 'fall' ? 1 - pos : contour === 'rise' ? pos * 0.8 : Math.sin(pos * Math.PI * 2) * 0.5 + 0.3;
    const target = centre - 2 + shape * 6;
    const strong = Math.abs((beat - ctx.start) % 1) < 1e-6 || r.d >= 1;
    const isLast = i === rhythm.length - 1;
    let p;
    if (isLast) {
      const tones = chord ? chordRange(chord, low, high) : scale;
      const home = last ? tones.filter((n) => mod12(n) === key.tonic) : tones;
      p = nearest(home.length ? home : tones, Math.min(target, prev + 2));
    } else if (strong && chord) {
      const tones = chordRange(chord, low, high);
      p = nearest(tones, (target + prev) / 2);
      if (Math.abs(p - prev) > 7) p = nearest(tones, prev);
    } else {
      const dir = Math.sign(target - prev) || (ctx.random.chance(0.5) ? 1 : -1);
      const leap = ctx.random.chance(0.15) ? 2 : 1;
      const at = scale.indexOf(nearest(scale, prev));
      p = scale[Math.max(0, Math.min(scale.length - 1, at + dir * leap))];
      // A repeated note now and then (speech-like).
      if (ctx.random.chance(0.18)) p = nearest(scale, prev);
    }
    p = Math.max(low, Math.min(high, p));
    pitches.push(p);
    prev = p;
  });
  return pitches;
}

const nearest = (list, target) => list.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), list[0] ?? Math.round(target));

/** The vocal melody of a section, one note per syllable, line by line. */
function writeMelody(ctx, track) {
  const lines = ctx.section.lyrics ?? [];
  if (!lines.length) return [];
  if (ctx.section.repeatOf) {
    const src = ctx.song.sections.find((s) => s.id === ctx.section.repeatOf);
    const srcSpan = src && sectionSpans(ctx.song).find((s) => s.section === src);
    if (srcSpan && arraysEqual(src.lyrics, lines) && src.bars === ctx.section.bars) return track.notes.filter((n) => n.t >= srcSpan.start && n.t < srcSpan.end).map((n) => ({ ...n, t: r3(n.t - srcSpan.start + ctx.start) }));
  }
  const [low, high, centre] = vocalRegister(ctx, track);
  const total = ctx.end - ctx.start;
  const lineLength = total / lines.length;
  const density = ctx.genre.melody?.density ?? 0.55;
  const sync = ctx.genre.melody?.sync ?? 0.4;
  const contours = ctx.random.pick([['arch', 'fall', 'arch', 'fall'], ['rise', 'fall', 'rise', 'fall'], ['arch', 'arch', 'rise', 'fall'], ['wave', 'fall', 'wave', 'fall']]);
  const out = [];
  const rhythms = [];
  let prev = null;
  lines.forEach((line, li) => {
    const syllables = syllabify(line);
    const lineStart = ctx.start + li * lineLength;
    // Line 3 repeats line 1's rhythm when they have the same syllables (verse-like repetition).
    const reuse = li >= 2 && rhythms[li - 2] && rhythms[li - 2].length === syllables.length ? rhythms[li - 2] : null;
    const rhythm = reuse ?? lineRhythm(syllables.length, lineLength, { random: ctx.random, density, sync, per: ctx.per });
    rhythms.push(rhythm);
    const pitches = linePitches(ctx, rhythm, lineStart, { low, high, centre, contour: contours[li % contours.length], previous: prev, last: li === lines.length - 1 && (ctx.section.type === 'chorus' || ctx.section.type === 'outro') });
    rhythm.forEach((r, i) => out.push(note(lineStart + r.at, r.d, pitches[i], 0.78 + (Math.abs((lineStart + r.at - ctx.start) % 1) < 1e-6 ? 0.1 : 0) - (i === rhythm.length - 1 ? 0.05 : 0), syllables[i])));
    prev = pitches[pitches.length - 1];
  });
  return out.filter((n) => n.t < ctx.end - 1e-6).map((n) => (n.t + n.d > ctx.end ? { ...n, d: r3(ctx.end - n.t) } : n));
}

/** Copies a section's melody onto a section that repeats it. */
function copyMelody(song, from, to) {
  const spans = sectionSpans(song);
  const a = spans.find((s) => s.section === from);
  const b = spans.find((s) => s.section === to);
  if (!a || !b) return;
  for (const track of song.tracks.filter((t) => t.role === 'vocal')) {
    clearRange(track, b.start, b.end);
    if (!arraysEqual(from.lyrics, to.lyrics)) {
      const ctx = { song, section: to, start: b.start, end: b.end, per: barBeats(song), genre: genreOf(song.genre), mood: moodOf(song.mood), random: rng(song.seed + song.sections.indexOf(to) * 13), energy: to.energy };
      addNotes(track, writeMelody(ctx, track));
      continue;
    }
    addNotes(track, track.notes.filter((n) => n.t >= a.start && n.t < a.end && n.t - a.start < b.end - b.start).map((n) => ({ ...n, t: r3(n.t - a.start + b.start) })));
  }
}

/** Sets a section's (edited) lyrics to a new melody; sections repeating it follow. */
export function fitMelody(song, section, seed = song.seed) {
  writeSection(song, section, ['melody'], seed);
  return song;
}

// ───────────────────────── lead (hook) and counter lines

/** The hook: in sections without singing it plays a motif built from the chorus tune; under singing it fills the gaps. */
function writeLead(ctx, track) {
  const { section, song, random } = ctx;
  const inst = instrument(track.instrument);
  const [lo, hi] = [Math.max(inst.range[0], 60), Math.min(inst.range[1], 86)];
  const sung = section.lyrics?.length && song.tracks.some((t) => t.role === 'vocal');
  if (!sung) {
    const motif = hookMotif(ctx, lo, hi);
    const out = [];
    const motifLen = ctx.per * 2;
    for (let t = ctx.start; t < ctx.end - 1e-6; t += motifLen) {
      const last = t + motifLen >= ctx.end - 1e-6;
      for (const m of motif) {
        if (t + m.at >= ctx.end) continue;
        const chord = chordAtBeat(ctx, t + m.at);
        let p = m.p;
        if (chord && Math.abs((t + m.at - ctx.start) % 1) < 1e-6 && !isChordTone(p, chord)) p = nearest(chordRange(chord, lo, hi), p);
        out.push(note(t + m.at, last && m === motif[motif.length - 1] ? Math.min(ctx.end - t - m.at, 2) : m.d, p, (section.type === 'outro' ? 0.55 : 0.72) * (0.85 + random() * 0.2)));
      }
      if (section.type === 'outro' && last) break;
    }
    return out;
  }
  // Under the singing: short answers at the end of each line (where the singer breathes).
  const out = [];
  const lines = section.lyrics.length;
  const lineLength = (ctx.end - ctx.start) / lines;
  for (let li = 0; li < lines; li++) {
    if (random() > 0.45 * (ctx.energy + 0.3)) continue;
    const end = ctx.start + (li + 1) * lineLength;
    const chord = chordAtBeat(ctx, end - 1);
    if (!chord) continue;
    const tones = chordRange(chord, lo, hi);
    const startTone = nearest(tones, (lo + hi) / 2 + random.int(-3, 3));
    const steps = random.pick([[0, 0.5, 1], [0, 0.25, 0.5, 0.75], [0, 1]]);
    steps.forEach((s, i) => out.push(note(end - 1 + s, 0.4, scaleRangeStep(song, startTone, i % 2 ? -1 : 1, lo, hi), 0.5)));
  }
  return out;
}

const scaleRangeStep = (song, from, step, lo, hi) => { const sc = scaleRange(song.key, lo, hi); const i = sc.indexOf(nearest(sc, from)); return sc[Math.max(0, Math.min(sc.length - 1, i + step))]; };

/** A two-bar motif: the first chorus line's tune (an octave that suits the lead), else made up. */
function hookMotif(ctx, lo, hi) {
  const { song, random } = ctx;
  const chorus = song.sections.find((s) => s.type === 'chorus' && s.lyrics.length);
  const vocal = song.tracks.find((t) => t.role === 'vocal');
  const span = chorus && sectionSpans(song).find((s) => s.section === chorus);
  if (vocal && span) {
    const notes = vocal.notes.filter((n) => n.t >= span.start && n.t < span.start + ctx.per * 2);
    if (notes.length >= 3) {
      const mid = notes.reduce((a, n) => a + n.p, 0) / notes.length;
      const shift = Math.round(((lo + hi) / 2 - mid) / 12) * 12;
      return notes.map((n) => ({ at: n.t - span.start, d: Math.min(n.d, 1.5), p: Math.max(lo, Math.min(hi, n.p + shift)) }));
    }
  }
  const scale = scaleRange(song.key, lo, hi);
  const out = [];
  let at = 0;
  let idx = scale.indexOf(nearest(scale, (lo + hi) / 2));
  const rhythm = random.pick([[0.5, 0.5, 1, 0.5, 0.5, 1, 2, 2], [1, 0.5, 0.5, 1, 1, 1.5, 0.5, 2], [0.75, 0.75, 0.5, 1, 1, 1, 1, 2]]);
  for (const d of rhythm) {
    if (at >= ctx.per * 2) break;
    out.push({ at, d: d * 0.95, p: scale[Math.max(0, Math.min(scale.length - 1, idx))] });
    idx += random.pick([-2, -1, 1, 1, 2]);
    at += d;
  }
  return out;
}

// ───────────────────────── accompaniment

const STYLE_PATTERNS = {
  // [onset (beats), length, velocity] per bar of 4/4.
  pop: [[0, 1.9, 0.7], [2, 1.9, 0.62]],
  popChorus: [[0, 0.45, 0.72], [0.5, 0.45, 0.5], [1, 0.45, 0.6], [1.5, 0.45, 0.5], [2, 0.45, 0.68], [2.5, 0.45, 0.5], [3, 0.45, 0.6], [3.5, 0.45, 0.5]],
  block: [[0, 3.9, 0.65]],
  stab: [[0, 0.3, 0.75], [0.75, 0.3, 0.6], [1.5, 0.3, 0.7], [2.5, 0.3, 0.65], [3.25, 0.3, 0.6]],
  comp: [[0, 1.4, 0.6], [1.5, 0.4, 0.5], [2.5, 1.2, 0.55]],
  offbeat: [[0.5, 0.35, 0.65], [1.5, 0.35, 0.6], [2.5, 0.35, 0.65], [3.5, 0.35, 0.6]],
  skank: [[1, 0.3, 0.7], [3, 0.3, 0.7]],
  bossa: [[0, 0.9, 0.6], [1.5, 0.4, 0.55], [2.5, 0.9, 0.6], [3.5, 0.4, 0.5]],
  pad: [[0, 3.95, 0.55]],
  power: [[0, 1.9, 0.75], [2, 1.9, 0.7]],
  powerChorus: [[0, 0.45, 0.8], [0.5, 0.45, 0.6], [1, 0.45, 0.7], [1.5, 0.45, 0.6], [2, 0.45, 0.8], [2.5, 0.45, 0.6], [3, 0.45, 0.7], [3.5, 0.45, 0.6]],
  waltz: [[1, 0.9, 0.55], [2, 0.9, 0.5]],
  strum: [[0, 0.95, 0.7], [1, 0.45, 0.55], [1.5, 0.95, 0.6], [2.5, 0.45, 0.5], [3, 0.45, 0.6], [3.5, 0.45, 0.5]],
};

/** Chords in the genre's style, voice-led from bar to bar. */
function writeAccompaniment(ctx, track) {
  const { section, genre, energy, random } = ctx;
  const inst = instrument(track.instrument);
  let style = genre.chords;
  const busy = energy >= 0.85;
  if (section.type === 'intro' || section.type === 'outro') style = style === 'arp' ? 'arp' : 'block';
  if (style === 'pop' && busy) style = 'popChorus';
  if (style === 'power' && busy) style = 'powerChorus';
  const out = [];
  let previous = null;
  const centre = Math.max(inst.range[0] + 12, Math.min(inst.range[1] - 12, 62));
  for (const c of section.chords) {
    if (!c.symbol) continue;
    const chord = parseChordSymbol(c.symbol);
    const at = ctx.start + c.at;
    const voicing = style.startsWith('power') ? powerVoicing(chord, previous) : voiceChord(chord, { center: centre, previous, voices: busy ? 4 : 3, low: Math.max(inst.range[0], 50), high: Math.min(inst.range[1], 79) });
    previous = voicing;
    if (style === 'arp') {
      const step = ctx.song.bpm > 90 ? 0.5 : 0.5;
      const order = [0, 1, 2, 1, 2, 3, 2, 1].map((i) => voicing[i % voicing.length] + (i >= voicing.length ? 12 : 0));
      const bass = voicing[0] - 12;
      for (let k = 0; k * step < c.len - 1e-6; k++) out.push(note(at + k * step, step * (k === 0 ? 2 : 1.6), k === 0 ? bass : order[k % order.length], 0.55 + (k % 2 ? 0 : 0.08)));
      continue;
    }
    const pattern = STYLE_PATTERNS[style] ?? STYLE_PATTERNS.pop;
    for (const [t, len, vel] of pattern) {
      if (t >= c.len - 1e-6) continue;
      const strum = style === 'strum' ? 0.02 : 0;
      voicing.forEach((p, vi) => out.push(note(at + t + vi * strum, Math.min(len, c.len - t), p, vel * (0.9 + random() * 0.15) * (0.75 + energy * 0.3))));
      if (style === 'block' || style === 'pad') break;
    }
  }
  // The very end: the last chord rings.
  if (section.type === 'outro' && out.length) { const lastT = Math.max(...out.map((n) => n.t)); for (const n of out) if (n.t === lastT) n.d = r3(Math.max(n.d, ctx.end - n.t)); }
  return out;
}

const powerVoicing = (chord, previous) => {
  const root = 40 + mod12(chord.root - 4);
  const base = previous ? nearest([root, root + 12].filter((n) => n <= 57), previous[0]) : root;
  return [base, base + 7, base + 12];
};

// ───────────────────────── bass

/** The bass line in the genre's style: roots near the last note, fifths, walks, octaves. */
function writeBass(ctx, track) {
  const { section, genre, energy, random, song } = ctx;
  const inst = instrument(track.instrument);
  const lo = Math.max(inst.range[0], 28);
  const hi = Math.min(inst.range[1], 52);
  let style = genre.bass;
  if (section.type === 'intro' && energy < 0.5) style = 'whole';
  const out = [];
  let prev = 40;
  const rootNear = (pc, near) => { const options = []; for (let n = lo; n <= hi; n++) if (mod12(n) === pc) options.push(n); return nearest(options, near); };
  section.chords.forEach((c, ci) => {
    if (!c.symbol) return;
    const chord = parseChordSymbol(c.symbol);
    const at = ctx.start + c.at;
    const root = rootNear(chord.bass ?? chord.root, prev);
    const fifth = root + 7 <= hi + 5 ? root + 7 : root - 5;
    const next = section.chords[ci + 1]?.symbol ? parseChordSymbol(section.chords[ci + 1].symbol) : null;
    const L = c.len;
    const push = (t, d, p, v = 0.8) => { if (t < L - 1e-6) out.push(note(at + t, Math.min(d, L - t), p, v * (0.92 + random() * 0.1))); };
    switch (style) {
      case 'root8': { const step = energy >= 0.85 ? 0.5 : 1; for (let t = 0; t < L - 1e-6; t += step) push(t, step * 0.9, root, t % 1 ? 0.65 : 0.82); break; }
      case 'rootFifth': if (L <= 2) push(0, L * 0.9, root); else for (let t = 0; t < L - 1e-6; t += 2) push(t, 1.8, t % 4 ? fifth : root); break;
      case 'whole': push(0, L * 0.98, root, 0.75); break;
      case 'walking': {
        const target = next ? rootNear(next.root, root) : root;
        const tones = [root, ...chordRange(chord, root + 1, root + 12).slice(0, 2)];
        for (let k = 0; k < Math.round(L); k++) {
          let p = k === 0 ? root : k === Math.round(L) - 1 ? target + (target > tones[1] ? -1 : 1) : tones[k % tones.length];
          p = Math.max(lo, Math.min(hi + 7, p));
          push(k, 0.9, p, k === 0 ? 0.82 : 0.7);
        }
        break;
      }
      case 'synco': for (const [t, d] of [[0, 0.7], [0.75, 0.5], [1.5, 0.4], [2, 0.7], [2.75, 0.4], [3.5, 0.4]]) push(t * (L / 4), d, t === 2.75 ? root + 12 : root, t === 0 || t === 2 ? 0.85 : 0.68); break;
      case 'sub808': for (const [t, d] of [[0, 1.4], [1.5, 0.9], [2.5, 1.4]]) push(t * (L / 4), d * (L / 4), root, 0.9); break;
      case 'offbeat': for (let t = 0.5; t < L - 1e-6; t += 1) push(t, 0.42, root, 0.8); if (energy < 0.6) push(0, 0.42, root, 0.7); break;
      case 'funk': for (const [t, d, oct] of [[0, 0.4, 0], [0.75, 0.2, 12], [1, 0.25, 0], [1.75, 0.2, 0], [2.5, 0.4, 0], [3, 0.2, 12], [3.5, 0.3, 10]]) push(t * (L / 4), d, root + (oct === 10 ? 10 : oct), oct ? 0.62 : 0.85); break;
      case 'reggae': for (const [t, d] of [[0.5, 0.8], [1.5, 0.4], [2, 0.9], [3, 0.8]]) push(t * (L / 4), d, t === 2 ? fifth : root, 0.82); break;
      case 'bossa': for (const [t, d, f] of [[0, 1.4, false], [1.5, 0.45, true], [2, 1.4, true], [3.5, 0.45, false]]) push(t * (L / 4), d, f ? fifth : root, 0.75); break;
      case 'waltz': push(0, 0.9, root, 0.8); break;
      default: push(0, L * 0.9, root);
    }
    prev = root;
  });
  if (section.type === 'outro' && out.length) { const last = out[out.length - 1]; last.d = r3(Math.max(last.d, ctx.end - last.t)); }
  void song;
  return out;
}

// ───────────────────────── drums

/** The groove for a section type, bar by bar, with a fill into the next section and a crash at the top. */
function writeDrums(ctx) {
  const { section, genre, random, song, index } = ctx;
  const d = genre.drums;
  const type = section.type;
  let pattern = d[type] ?? ({ chorus: d.chorus, drop: d.drop ?? d.chorus, build: d.build ?? d.chorus, prechorus: d.verse, bridge: d.verse, interlude: d.verse, intro: d.intro ?? d.verse, outro: d.intro ?? d.verse })[type] ?? d.verse;
  const steps = Object.values(pattern)[0]?.length ?? 16;
  const stepLen = ctx.per / steps;
  const out = [];
  const next = song.sections[index + 1];
  for (let bar = 0; bar < section.bars; bar++) {
    const barStart = ctx.start + bar * ctx.per;
    const lastBar = bar === section.bars - 1;
    // Intros come in sparse (no snare for the first half), outros thin out.
    const thin = (type === 'intro' && bar < section.bars / 2) || (type === 'outro' && bar >= section.bars - 1);
    for (const [drum, line] of Object.entries(pattern)) {
      const n = Number(drum);
      if (n === 49 || n === 57) { if (bar === 0 && line[0] !== '.') out.push(note(barStart, 1.5, 49, 0.8)); continue; }
      if (thin && (n === 38 || n === 39 || n === 37)) continue;
      // The last bar's second half is the fill (snare and toms) when a section follows.
      if (lastBar && next && (n === 38 || n === 39) && steps >= 12) continue;
      for (let s = 0; s < steps; s++) {
        const ch = line[s];
        if (!ch || ch === '.') continue;
        if (lastBar && next && s >= steps / 2 && n !== 36 && n !== 42 && n !== 44 && n !== 51) continue;
        const v = ch === 'X' ? 1 : ch === 'o' ? 0.38 : 0.78;
        out.push(note(barStart + s * stepLen, n === 46 ? stepLen * 2 : stepLen * 0.9, n, v * (0.92 + random() * 0.12) * (n === 42 ? (s % 2 ? 0.72 : 1) : 1)));
      }
    }
    if (lastBar && next && steps >= 12) {
      // Fill: the snare (and toms on bigger moments) walking down the second half.
      const big = next.type === 'chorus' || next.type === 'drop';
      const fillSteps = big ? [8, 10, 11, 12, 13, 14, 15] : [8, 12, 14, 15];
      const toms = [50, 48, 47, 45, 43];
      fillSteps.forEach((s, i) => { if (s >= steps) return; const drum = big && i >= 3 ? toms[Math.min(toms.length - 1, i - 3)] : 38; out.push(note(barStart + s * stepLen, stepLen * 0.9, drum, 0.6 + (i / fillSteps.length) * 0.35)); });
      // Snare on 2 (and 4 is the fill).
      if (pattern[38]?.[steps / 4] && pattern[38][steps / 4] !== '.') out.push(note(barStart + (steps / 4) * stepLen, stepLen * 0.9, 38, 0.85));
    }
  }
  // The song's last hit.
  if (type === 'outro' && index === song.sections.length - 1) { out.push(note(ctx.end - ctx.per, 2, 49, 0.85)); out.push(note(ctx.end - ctx.per, 1, 36, 0.9)); }
  return out;
}

// ───────────────────────── pad and arpeggio

/** Long chords under bigger sections (soft in intros). */
function writePad(ctx, track) {
  const { section, energy } = ctx;
  if (energy < 0.5 && section.type !== 'intro' && section.type !== 'bridge') return [];
  const inst = instrument(track.instrument);
  const out = [];
  let previous = null;
  for (const c of section.chords) {
    if (!c.symbol) continue;
    const chord = parseChordSymbol(c.symbol);
    const voicing = voiceChord(chord, { center: 67, previous, voices: 3, low: Math.max(inst.range[0], 55), high: Math.min(inst.range[1], 84) });
    previous = voicing;
    for (const p of voicing) out.push(note(ctx.start + c.at, c.len * 0.98, p, 0.45 + energy * 0.15));
  }
  return out;
}

/** A sixteenth-note arpeggio over the chord in the energetic sections. */
function writeArp(ctx, track) {
  const { section, energy } = ctx;
  if (energy < 0.7) return [];
  const inst = instrument(track.instrument);
  const out = [];
  for (const c of section.chords) {
    if (!c.symbol) continue;
    const chord = parseChordSymbol(c.symbol);
    const tones = chordRange(chord, Math.max(inst.range[0], 64), Math.min(inst.range[1], 88)).slice(0, 4);
    if (!tones.length) continue;
    const order = [0, 1, 2, 3, 2, 1].map((i) => tones[i % tones.length]);
    for (let k = 0; k * 0.25 < c.len - 1e-6; k++) out.push(note(ctx.start + c.at + k * 0.25, 0.22, order[k % order.length], k % 4 === 0 ? 0.6 : 0.42));
  }
  return out;
}

// ───────────────────────── helpers for the app

/** A new section's skeleton (chords from the genre) inserted at `index`; returns it. Notes are not written. */
export function makeSection(song, type, index, seed = song.seed) {
  const random = rng(seed * 17 + index);
  const genre = genreOf(song.genre);
  const section = { id: newId('sec'), type, label: '', bars: SECTION_DEFAULTS[type]?.bars ?? 8, chords: [], lyrics: [], repeatOf: null, energy: { intro: 0.4, verse: 0.55, prechorus: 0.7, chorus: 0.9, bridge: 0.6, interlude: 0.5, build: 0.75, drop: 1, outro: 0.35 }[type] ?? 0.6 };
  section.chords = chordsFromRomans(song, section, pickProgression(genre, song.key.mode, type, random), random, song.sections[index]);
  return section;
}

/** The key's scale pitch classes and the chord tones, for the piano roll's highlights. */
export const keyHighlights = (song, chord) => ({ scale: new Set(scalePcs(song.key)), chord: new Set(chord ? chordPcs(chord) : []) });

/** Lyric syllables versus notes in a section's vocal line: [{ line, syllables, notes }]. */
export function lyricFit(song, section) {
  const span = sectionSpans(song).find((s) => s.section === section);
  const vocal = song.tracks.find((t) => t.role === 'vocal');
  if (!span || !section.lyrics.length) return [];
  const lineLength = (span.end - span.start) / section.lyrics.length;
  return section.lyrics.map((line, i) => {
    const a = span.start + i * lineLength;
    const b = a + lineLength;
    return { line, syllables: syllabify(line).length, notes: vocal ? vocal.notes.filter((n) => n.t >= a - 0.5 && n.t < b - 0.5 && n.syl).length : 0 };
  });
}

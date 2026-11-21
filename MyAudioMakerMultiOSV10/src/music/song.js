// The song document (CONTRACT: pure). A song is JSON: its key, tempo and metre, sections (each with
// chords and lyrics), and tracks of notes. Positions are in beats (quarter notes) from the start of
// the song; a section's chords are relative to the section's start.
//
//   { format: 'myaudiomaker', version: 1, title, artist, genre, mood, theme, topic, language, seed,
//     key: { tonic: 0-11, mode }, bpm, timeSignature: [n, d], swing: 0-0.5,
//     sections: [{ id, type, label, bars, chords: [{ at, len, symbol }], lyrics: [line], repeatOf }],
//     tracks: [{ id, name, role, instrument, volume, pan, mute, solo, reverb, color, notes: [{ t, d, p, v, syl? }] }],
//     mix: { master, reverb, compressor }, loop: { on, start, end }, ai: { provider, prompt } }
import { beatsPerBar, beatsToSeconds, chordSymbol, keyName, MODES, parseChordSymbol, prefersFlats } from './theory.js';
import { hasInstrument, instrument, TRACK_ROLES } from './instruments.js';
import { GENRES, MOODS, SECTION_DEFAULTS, SECTION_TYPES } from './genres.js';

export const FORMAT = 'myaudiomaker';
export const VERSION = 1;
export const TRACK_COLORS = ['#f0567a', '#4c8bf5', '#20b8a6', '#f5a524', '#9b6cf0', '#e07b39', '#2fb45a', '#d6336c', '#0ea5e9', '#a3a3a3'];
export const ROLE_COLORS = { vocal: '#f0567a', lead: '#9b6cf0', chords: '#4c8bf5', bass: '#20b8a6', drums: '#f5a524', pad: '#0ea5e9', arp: '#e07b39', counter: '#2fb45a' };

let counter = 0;
/** A short unique id with a prefix. */
export function newId(prefix = 'id') {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** An empty song (no tracks, one verse). */
export function createSong(options = {}) {
  return normalizeSong({
    title: options.title ?? '', artist: options.artist ?? '', genre: options.genre ?? 'pop', mood: options.mood ?? 'happy',
    key: options.key ?? { tonic: 0, mode: 'major' }, bpm: options.bpm ?? 100, timeSignature: options.timeSignature ?? [4, 4],
    language: options.language ?? 'ko', sections: options.sections ?? [{ type: 'verse', bars: 8 }], tracks: options.tracks ?? [],
  });
}

const num = (v, lo, hi, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };

/** Fills gaps and repairs values: every song that opens goes through this. */
export function normalizeSong(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const ts = Array.isArray(s.timeSignature) && [2, 3, 4, 5, 6, 7, 9, 12].includes(Number(s.timeSignature[0])) && [2, 4, 8].includes(Number(s.timeSignature[1])) ? [Number(s.timeSignature[0]), Number(s.timeSignature[1])] : [4, 4];
  const key = { tonic: Math.round(num(s.key?.tonic, 0, 11, 0)), mode: MODES.includes(s.key?.mode) ? s.key.mode : 'major' };
  const song = {
    format: FORMAT, version: VERSION,
    title: typeof s.title === 'string' ? s.title : '',
    artist: typeof s.artist === 'string' ? s.artist : '',
    genre: GENRES.some((g) => g.id === s.genre) ? s.genre : 'pop',
    mood: MOODS.some((m) => m.id === s.mood) ? s.mood : 'happy',
    theme: typeof s.theme === 'string' ? s.theme : '',
    topic: typeof s.topic === 'string' ? s.topic : '',
    language: s.language === 'en' ? 'en' : 'ko',
    seed: Math.round(num(s.seed, 1, 999999999, 1)),
    key, bpm: Math.round(num(s.bpm, 30, 300, 100) * 10) / 10, timeSignature: ts, swing: num(s.swing, 0, 0.5, 0),
    sections: [], tracks: [],
    mix: { master: num(s.mix?.master, 0, 1.5, 0.85), reverb: num(s.mix?.reverb, 0, 1, 0.22), compressor: s.mix?.compressor !== false },
    loop: { on: Boolean(s.loop?.on), start: num(s.loop?.start, 0, 1e6, 0), end: num(s.loop?.end, 0, 1e6, 0) },
    ai: { provider: typeof s.ai?.provider === 'string' ? s.ai.provider : 'builtin', prompt: typeof s.ai?.prompt === 'string' ? s.ai.prompt : '', model: typeof s.ai?.model === 'string' ? s.ai.model : '' },
    created: typeof s.created === 'string' ? s.created : new Date().toISOString(),
    modified: typeof s.modified === 'string' ? s.modified : '',
  };
  const per = beatsPerBar(ts);
  const ids = new Set();
  for (const raw of Array.isArray(s.sections) ? s.sections : []) {
    const type = SECTION_TYPES.includes(raw?.type) ? raw.type : 'verse';
    let id = typeof raw?.id === 'string' && raw.id && !ids.has(raw.id) ? raw.id : newId('sec');
    ids.add(id);
    const bars = Math.round(num(raw?.bars, 1, 64, SECTION_DEFAULTS[type].bars));
    const chords = (Array.isArray(raw?.chords) ? raw.chords : []).map((c) => ({ at: num(c?.at, 0, bars * per, 0), len: num(c?.len, 0.25, bars * per, per), symbol: parseChordSymbol(c?.symbol) ? String(c.symbol) : (c?.symbol === null ? null : 'C') })).filter((c) => c.at < bars * per).sort((a, b) => a.at - b.at);
    song.sections.push({
      id, type, label: typeof raw?.label === 'string' ? raw.label : '', bars, chords,
      lyrics: (Array.isArray(raw?.lyrics) ? raw.lyrics : []).map((l) => String(l ?? '')).slice(0, 32),
      repeatOf: typeof raw?.repeatOf === 'string' ? raw.repeatOf : null,
      energy: num(raw?.energy, 0, 1, { intro: 0.4, verse: 0.55, prechorus: 0.7, chorus: 0.9, bridge: 0.6, interlude: 0.5, build: 0.75, drop: 1, outro: 0.35 }[type]),
    });
  }
  if (!song.sections.length) song.sections.push({ id: newId('sec'), type: 'verse', label: '', bars: 8, chords: [], lyrics: [], repeatOf: null, energy: 0.55 });
  for (const sec of song.sections) if (sec.repeatOf && !song.sections.some((o) => o.id === sec.repeatOf && o !== sec)) sec.repeatOf = null;
  const trackIds = new Set();
  (Array.isArray(s.tracks) ? s.tracks : []).forEach((raw, index) => {
    const role = TRACK_ROLES.includes(raw?.role) ? raw.role : 'lead';
    const inst = hasInstrument(raw?.instrument) ? raw.instrument : role === 'drums' ? 'kitPop' : role === 'vocal' ? 'voiceFemale' : 'piano';
    const id = typeof raw?.id === 'string' && raw.id && !trackIds.has(raw.id) ? raw.id : newId('trk');
    trackIds.add(id);
    song.tracks.push({
      id, role, instrument: inst,
      name: typeof raw?.name === 'string' && raw.name ? raw.name : '',
      volume: num(raw?.volume, 0, 1.5, 0.8), pan: num(raw?.pan, -1, 1, 0), reverb: num(raw?.reverb, 0, 1, role === 'drums' || role === 'bass' ? 0.08 : 0.3),
      mute: Boolean(raw?.mute), solo: Boolean(raw?.solo),
      color: typeof raw?.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : ROLE_COLORS[role] ?? TRACK_COLORS[index % TRACK_COLORS.length],
      notes: normalizeNotes(raw?.notes),
    });
  });
  return song;
}

/** Notes made valid and sorted by time. */
export function normalizeNotes(list) {
  return (Array.isArray(list) ? list : [])
    .map((n) => ({ t: num(n?.t, 0, 1e6, 0), d: num(n?.d, 0.05, 1024, 0.5), p: Math.round(num(n?.p, 0, 127, 60)), v: num(n?.v, 0.05, 1, 0.8), ...(typeof n?.syl === 'string' && n.syl ? { syl: n.syl } : {}) }))
    .sort((a, b) => a.t - b.t || a.p - b.p);
}

// ───────────────────────── reading a song

export const barBeats = (song) => beatsPerBar(song.timeSignature);
export const sectionBeats = (song, section) => section.bars * barBeats(song);

/** [{ section, start, end }] in beats. */
export function sectionSpans(song) {
  let at = 0;
  return song.sections.map((section) => {
    const start = at;
    at += sectionBeats(song, section);
    return { section, start, end: at };
  });
}

/** The song's length in beats (the sections' total). */
export const songBeats = (song) => song.sections.reduce((n, s) => n + sectionBeats(song, s), 0);
export const songSeconds = (song) => beatsToSeconds(songBeats(song), song.bpm);

/** The section at a beat (the last one past the end). */
export function sectionAt(song, beat) {
  const spans = sectionSpans(song);
  return spans.find((s) => beat >= s.start && beat < s.end) ?? spans[spans.length - 1] ?? null;
}

/** All chords with absolute times: [{ start, end, symbol, section }]. */
export function chordTimeline(song) {
  const out = [];
  for (const { section, start, end } of sectionSpans(song)) {
    for (const c of section.chords) out.push({ start: start + c.at, end: Math.min(end, start + c.at + c.len), symbol: c.symbol, chord: c.symbol ? parseChordSymbol(c.symbol) : null, section: section.id });
  }
  return out;
}

/** The chord sounding at a beat, or null. */
export function chordAt(song, beat, timeline = chordTimeline(song)) {
  return timeline.find((c) => beat >= c.start && beat < c.end)?.chord ?? null;
}

/** A section's display name: its label, else its type and number ("Verse 2"). `name(type)` gives the type's word. */
export function sectionLabel(song, section, name) {
  if (section.label) return section.label;
  const same = song.sections.filter((s) => s.type === section.type);
  const n = same.indexOf(section) + 1;
  return same.length > 1 ? `${name(section.type)} ${n}` : name(section.type);
}

/** The first section with the same type and the same lyrics (a repeated chorus): its id, else null. */
export function repeatSource(song, section) {
  if (section.repeatOf) return section.repeatOf;
  return null;
}

/** The track's display name: its own, else its instrument's. */
export const trackName = (track, language = 'ko') => track.name || (language === 'en' ? instrument(track.instrument).en : instrument(track.instrument).ko);

/** Whether a track is heard: not muted, and soloed when any track is. */
export function audible(song, track) {
  if (track.mute) return false;
  const soloed = song.tracks.some((t) => t.solo);
  return !soloed || track.solo;
}

/** Notes of a track inside [start, end) beats. */
export const notesIn = (track, start, end) => track.notes.filter((n) => n.t >= start - 1e-9 && n.t < end - 1e-9);

/** Removes notes in [start, end) from a track (a section being written again). */
export function clearRange(track, start, end) {
  track.notes = track.notes.filter((n) => n.t < start - 1e-9 || n.t >= end - 1e-9);
}

/** Adds notes and keeps them sorted. */
export function addNotes(track, notes) {
  track.notes = normalizeNotes([...track.notes, ...notes]);
}

/** Inserts `beats` of silence at `at` (a new section): later notes move along. */
export function shiftNotes(song, at, beats) {
  for (const track of song.tracks) for (const n of track.notes) if (n.t >= at - 1e-9) n.t += beats;
}

/** Deletes [start, end): notes inside go, later notes move back. */
export function cutRange(song, start, end) {
  const len = end - start;
  for (const track of song.tracks) {
    track.notes = track.notes.filter((n) => n.t < start - 1e-9 || n.t >= end - 1e-9);
    for (const n of track.notes) if (n.t >= end - 1e-9) n.t -= len;
  }
}

/** The lowest and highest note of a track (null when empty). */
export function noteRange(track) {
  if (!track.notes.length) return null;
  let lo = 127; let hi = 0;
  for (const n of track.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
  return [lo, hi];
}

/** Every chord symbol spelled for the song's key (sharps or flats). */
export function respellChords(song) {
  const flats = prefersFlats(song.key.tonic, song.key.mode);
  for (const section of song.sections) for (const c of section.chords) { const chord = parseChordSymbol(c.symbol); if (chord) c.symbol = chordSymbol(chord, flats); }
}

/** A section's chords as a line of text, bar by bar ("C G | Am F"). */
export function chordLineText(song, section) {
  const per = barBeats(song);
  const bars = [];
  for (let b = 0; b < section.bars; b++) {
    const inBar = section.chords.filter((c) => c.at >= b * per - 1e-9 && c.at < (b + 1) * per - 1e-9);
    bars.push(inBar.length ? inBar.map((c) => c.symbol ?? '-').join(' ') : '%');
  }
  return bars.join(' | ');
}

/**
 * A chord line typed by the user back into a section's chords: bars split by "|" (each bar's chords share
 * it evenly; "%" repeats the bar before), or without bars one chord per bar, the line repeating to fill the section.
 */
export function parseChordLineText(text, song, section) {
  const per = barBeats(song);
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  let bars = raw.includes('|') ? raw.split('|').map((b) => b.trim()).filter((b, i, all) => b || i < all.length - 1) : raw.split(/\s+/);
  if (!bars.length) return [];
  const out = [];
  let previous = [];
  for (let b = 0; b < section.bars; b++) {
    const cell = bars[b % bars.length];
    let tokens = cell === '%' || cell === '' ? previous : cell.split(/\s+/).filter(Boolean);
    tokens = tokens.filter((tok) => tok === '-' || parseChordSymbol(tok));
    previous = tokens;
    tokens.forEach((tok, i) => { out.push({ at: b * per + (i * per) / tokens.length, len: per / tokens.length, symbol: tok === '-' ? null : tok }); });
  }
  return out;
}

/** Song facts for the panels: { length, bars, notes, syllables … }. */
export function songStats(song) {
  const beats = songBeats(song);
  return {
    beats, bars: beats / barBeats(song), seconds: beatsToSeconds(beats, song.bpm),
    notes: song.tracks.reduce((n, t) => n + t.notes.length, 0), tracks: song.tracks.length, sections: song.sections.length,
    lines: song.sections.reduce((n, s) => n + s.lyrics.length, 0), key: keyName(song.key),
  };
}

/** A deep copy (undo snapshots, the tutorial's own song). */
export const cloneSong = (song) => JSON.parse(JSON.stringify(song));

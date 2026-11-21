// Problem checks (CONTRACT: pure): what the Problems panel lists while you work — each with a
// severity, a code (i18n `check.<code>` and `check.fix.<code>`), what it is about, and numbers for the text.
//   error   — something that will sound wrong or not at all
//   warning — something that is probably a mistake
//   info    — worth knowing
import { audible, sectionSpans, songBeats } from './song.js';
import { instrument } from './instruments.js';
import { syllabify } from './syllables.js';
import { chordPcs, isChordTone, mod12, noteName, parseChordSymbol } from './theory.js';
import { lyricFit } from './composer.js';

let serial = 0;
const problem = (severity, code, target, params = {}) => ({ id: `p${++serial}`, severity, code, target, params });

export function checkSong(song, { labels = (s) => s.type, trackName = (t) => t.name || t.instrument } = {}) {
  const out = [];
  if (!song.tracks.length) out.push(problem('warning', 'noTracks', null));
  if (song.tracks.length && song.tracks.every((t) => !audible(song, t))) out.push(problem('error', 'allMuted', null));
  if (song.bpm < 50 || song.bpm > 200) out.push(problem('info', 'tempoExtreme', null, { bpm: song.bpm }));
  const length = songBeats(song);
  const spans = sectionSpans(song);
  for (const track of song.tracks) {
    const inst = instrument(track.instrument);
    const name = trackName(track);
    if (!track.notes.length) { out.push(problem('info', 'emptyTrack', { track: track.id }, { name })); continue; }
    const late = track.notes.filter((n) => n.t >= length);
    if (late.length) out.push(problem('warning', 'notesAfterEnd', { track: track.id }, { name, count: late.length }));
    if (!inst.drums) {
      const [lo, hi] = inst.range;
      const outside = track.notes.filter((n) => n.p < lo || n.p > hi);
      if (outside.length) out.push(problem('warning', 'outOfRange', { track: track.id, note: outside[0].t }, { name, count: outside.length, low: noteName(lo), high: noteName(hi) }));
    }
    if (track.volume > 1.2) out.push(problem('info', 'loudTrack', { track: track.id }, { name }));
    // Many notes at once on one track: likely a doubled paste.
    let stacked = 0;
    for (let i = 1; i < track.notes.length; i++) if (track.notes[i].t === track.notes[i - 1].t && track.notes[i].p === track.notes[i - 1].p) stacked++;
    if (stacked) out.push(problem('warning', 'duplicateNotes', { track: track.id }, { name, count: stacked }));
  }
  const vocal = song.tracks.find((t) => t.role === 'vocal');
  if (vocal?.notes.length) {
    let lo = 127; let hi = 0;
    for (const n of vocal.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
    if (hi - lo > 19) out.push(problem('warning', 'wideVocal', { track: vocal.id }, { low: noteName(lo), high: noteName(hi), span: hi - lo }));
  }
  for (const { section, start, end } of spans) {
    const label = labels(section);
    if (!section.chords.length) out.push(problem('info', 'noChords', { section: section.id }, { section: label }));
    for (const c of section.chords) if (c.symbol && !parseChordSymbol(c.symbol)) out.push(problem('error', 'badChord', { section: section.id }, { section: label, chord: c.symbol }));
    if (['verse', 'chorus', 'prechorus', 'bridge'].includes(section.type) && !section.lyrics.length && vocal) out.push(problem('info', 'noLyrics', { section: section.id }, { section: label }));
    // Lines with more syllables than notes (edited lyrics not yet set to the melody).
    if (vocal && section.lyrics.length) {
      const fit = lyricFit(song, section);
      const off = fit.filter((f) => f.notes && Math.abs(f.syllables - f.notes) > 0);
      if (off.length) out.push(problem('warning', 'lyricMismatch', { section: section.id }, { section: label, count: off.length, line: off[0].line }));
      const long = section.lyrics.filter((l) => syllabify(l).length > ((end - start) / section.lyrics.length) * 4);
      if (long.length) out.push(problem('warning', 'lineTooLong', { section: section.id }, { section: label, line: long[0] }));
      if (fit.every((f) => !f.notes)) out.push(problem('warning', 'lyricsNoMelody', { section: section.id }, { section: label }));
    }
    // A sung note on a strong beat a semitone against the chord.
    if (vocal) {
      let clashes = 0;
      for (const n of vocal.notes) {
        if (n.t < start || n.t >= end || Math.abs(n.t % 1) > 1e-6 || n.d < 0.75) continue;
        const rel = n.t - start;
        const c = section.chords.find((x) => rel >= x.at && rel < x.at + x.len);
        const chord = c?.symbol ? parseChordSymbol(c.symbol) : null;
        if (!chord || isChordTone(n.p, chord)) continue;
        if (chordPcs(chord).some((pc) => Math.abs(mod12(n.p - pc)) === 1 || mod12(n.p - pc) === 11)) clashes++;
      }
      if (clashes >= 2) out.push(problem('info', 'clash', { section: section.id }, { section: label, count: clashes }));
    }
  }
  return out;
}

export function countBySeverity(list) {
  const c = { error: 0, warning: 0, info: 0 };
  for (const p of list) c[p.severity] = (c[p.severity] ?? 0) + 1;
  return c;
}

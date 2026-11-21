// Files: the .mam song, MIDI out and back in (with lyrics), WAV, text exports, the lead sheet and the
// printed sheets, settings (the AI key kept apart).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../src/music/composer.js';
import { packSong, unpackSong, lyricsToLrc, lyricsToText, chordChart, isSongName, isMidiName } from '../../src/io/fileformat.js';
import { midiToSong, parseMidi, songToMidi, keySignature } from '../../src/io/midi.js';
import { decodeWav, encodeWav } from '../../src/io/wav.js';
import { leadSheetPages, spell, melodyNotes } from '../../src/music/notation.js';
import { buildSheets } from '../../src/print/sheet.js';
import { normalizePrintSetup, sheetGeometry } from '../../src/print/layout.js';
import { pdfFromJpegPages } from '../../src/print/pdf.js';
import { swingBeat } from '../../src/audio/engine.js';
import { AI_KEY, loadSettings, storeAiKey, storeSettings, STORAGE_KEY } from '../../src/domain/settings.js';
import { t } from '../../src/i18n.js';

const song = compose({ genre: 'pop', mood: 'happy', seed: 21, topic: '첫사랑', language: 'ko', title: '테스트' });
const labels = (s) => s.type;

test('.mam round trip, and plain JSON opens too', () => {
  const back = unpackSong(packSong(song));
  assert.deepEqual({ ...back, modified: '' }, { ...song, modified: '' });
  const json = unpackSong(new TextEncoder().encode(JSON.stringify(song)));
  assert.equal(json.title, '테스트');
  assert.throws(() => unpackSong(new Uint8Array([1, 2, 3])), /not a MyAudioMaker/);
  assert.ok(isSongName('a.mam') && isMidiName('b.MID') && !isSongName('c.wav'));
});

test('MIDI: tempo, metre, key, tracks, notes and lyrics survive the round trip', () => {
  const bytes = songToMidi(song, { labels, swing: false });
  const raw = parseMidi(bytes);
  assert.equal(raw.format, 1);
  assert.equal(raw.tracks.length, song.tracks.length + 1);
  const back = midiToSong(bytes);
  assert.equal(back.bpm, song.bpm);
  assert.deepEqual(back.timeSignature, song.timeSignature);
  const vocal = song.tracks.find((t) => t.role === 'vocal');
  const vback = back.tracks.find((t) => t.role === 'vocal');
  assert.ok(vback, 'the lyric track comes back as the vocal');
  assert.equal(vback.notes.length, vocal.notes.length);
  assert.deepEqual(vback.notes.slice(0, 20).map((n) => [n.t, n.p, n.syl]), vocal.notes.slice(0, 20).map((n) => [n.t, n.p, n.syl]));
  assert.equal(back.tracks.find((t) => t.role === 'drums').notes.length, song.tracks.find((t) => t.role === 'drums').notes.length);
  assert.deepEqual(keySignature({ tonic: 2, mode: 'major' }), { sf: 2, minor: 0 });
  assert.deepEqual(keySignature({ tonic: 2, mode: 'minor' }), { sf: -1, minor: 1 });
});

test('swing moves off-beat eighths and sixteenths', () => {
  assert.equal(swingBeat(1, 0.33), 1);
  assert.equal(swingBeat(1.5, 0.33), 1.665);
  assert.equal(swingBeat(2.25, 0.2), 2.3);
  assert.equal(swingBeat(1.5, 0), 1.5);
});

test('WAV: 16, 24 and 32-bit round trips; normalising', () => {
  const left = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.5);
  const right = Float32Array.from(left, (v) => -v);
  for (const bits of [16, 24, 32]) {
    const back = decodeWav(encodeWav([left, right], 44100, { bits }));
    assert.equal(back.sampleRate, 44100);
    assert.equal(back.channels.length, 2);
    assert.ok(Math.abs(back.channels[0][123] - left[123]) < 1e-3, `${bits}-bit`);
    assert.ok(Math.abs(back.channels[1][321] - right[321]) < 1e-3);
  }
  const loud = decodeWav(encodeWav([left], 48000, { normalize: true, peakDb: -1 }));
  const peak = Math.max(...loud.channels[0].map(Math.abs));
  assert.ok(Math.abs(peak - 10 ** (-1 / 20)) < 0.01);
});

test('text exports: lyrics, LRC timed to the first note, chord chart', () => {
  const text = lyricsToText(song, labels);
  assert.match(text, /^테스트/);
  assert.match(text, /\[verse\]/);
  const lrc = lyricsToLrc(song, labels).split('\n');
  assert.equal(lrc[0], '[ti:테스트]');
  const times = lrc.filter((l) => /^\[\d\d:/.test(l)).map((l) => l.slice(1, 9));
  assert.ok(times.length >= 10);
  assert.deepEqual(times, [...times].sort(), 'lines in time order');
  assert.match(chordChart(song, labels, t), /\| /);
});

test('the lead sheet: notes spelled in the key, pages of staff lines', () => {
  assert.deepEqual(spell(66, { tonic: 7, mode: 'major' }), { letter: 3, octave: 4, alter: 1, accidental: '' }, 'F# in G major needs no sign');
  assert.equal(spell(65, { tonic: 7, mode: 'major' }).accidental, '♮');
  assert.equal(spell(70, { tonic: 5, mode: 'major' }).accidental, '', 'Bb in F major');
  assert.equal(spell(61, { tonic: 0, mode: 'major' }).accidental, '♯');
  const pages = leadSheetPages(song, { ctx: { t, labels } });
  assert.ok(pages.length >= 2);
  const svg = pages.join('');
  assert.equal((svg.match(/<ellipse /g) ?? []).length, melodyNotes(song).length, 'one note head per sung note');
  assert.match(svg, /𝄞/);
});

test('printed sheets: lead sheet, lyrics, chords, arrangement, summary; paper sizes', () => {
  const info = { song, labels: Object.fromEntries(song.sections.map((s) => [s.id, s.type])), language: 'ko', date: '2026-11-21' };
  const all = buildSheets(info, { includeLeadsheet: true, includeLyrics: true, includeChords: true, includeArrangement: true, includeSummary: true }, {}, t);
  const types = new Set(all.map((s) => s.type));
  assert.deepEqual([...types], ['leadsheet', 'lyrics', 'chords', 'arrangement', 'summary']);
  for (const s of all) assert.match(s.svg, /^<svg[^>]+viewBox="0 0 210\.00 297\.00"/);
  const last = all[all.length - 1].svg;
  assert.match(last, new RegExp(`${all.length} / ${all.length}`));
  const landscape = sheetGeometry({ paper: 'A3', orientation: 'landscape' });
  assert.equal(landscape.width, 420);
  assert.equal(normalizePrintSetup({ paper: 'Q9', copies: 500 }).paper, 'A4');
  const pdf = pdfFromJpegPages([{ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 10, height: 10, widthMm: 210, heightMm: 297 }]);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), '%PDF-1.4');
});

test('settings: the AI key is stored apart and survives a settings save', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  storeAiKey(storage, ' sk-ant-test ');
  const s = loadSettings(storage);
  assert.equal(s.aiApiKey, 'sk-ant-test');
  storeSettings(storage, { ...s, aiProvider: 'claude' });
  assert.equal(JSON.parse(store.get(STORAGE_KEY)).aiApiKey, undefined, 'the key is not in the settings');
  assert.equal(store.get(AI_KEY), 'sk-ant-test');
  assert.equal(loadSettings(storage).aiProvider, 'claude');
});

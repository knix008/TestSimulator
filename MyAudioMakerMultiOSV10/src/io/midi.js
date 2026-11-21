// Standard MIDI files (CONTRACT: pure). Export: type 1 — a tempo map (tempo, time and key signature,
// section markers), then one track per song track with its name, General MIDI program and notes; drums
// on channel 10; the sung syllables as lyric events on the vocal track, so karaoke players and DAWs show
// the words. Import: type 0 / 1 files back into tracks (with tempo, metre and lyrics when present).
import { instrument, INSTRUMENTS } from '../music/instruments.js';
import { normalizeSong, newId, sectionSpans, ROLE_COLORS } from '../music/song.js';
import { swingBeat } from '../audio/engine.js';
import { isMinorMode } from '../music/theory.js';

export const PPQ = 480;
const enc = new TextEncoder();

function vlq(value) {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7)) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

const meta = (type, data) => [0xff, type, ...vlq(data.length), ...data];
const textMeta = (type, text) => meta(type, [...enc.encode(String(text ?? ''))]);

function chunk(id, data) {
  const out = [...id].map((c) => c.charCodeAt(0));
  const n = data.length;
  out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, ...data);
  return out;
}

/** Events [{ tick, bytes }] → track data with delta times and an end-of-track. */
function trackData(events) {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out = [];
  let last = 0;
  for (const e of events) { out.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  out.push(0, 0xff, 0x2f, 0);
  return out;
}

/** Key signature: number of sharps (+) or flats (−) of the key, and minor. */
export function keySignature(key) {
  const major = isMinorMode(key.mode) ? (key.tonic + 3) % 12 : key.tonic;
  const table = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 5: -1, 10: -2, 3: -3, 8: -4, 1: -5 };
  return { sf: table[major] ?? 0, minor: isMinorMode(key.mode) ? 1 : 0 };
}

/** A song → MIDI file bytes. `labels(section)` names the markers. Swing is written into the times. */
export function songToMidi(song, { labels = (s) => s.type, swing = true } = {}) {
  const tick = (beats) => Math.round((swing ? swingBeat(beats, song.swing) : beats) * PPQ);
  const tempo = Math.round(60000000 / song.bpm);
  const ks = keySignature(song.key);
  const conductor = [
    { tick: 0, order: 0, bytes: textMeta(0x03, song.title || 'MyAudioMaker') },
    { tick: 0, order: 1, bytes: meta(0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]) },
    { tick: 0, order: 2, bytes: meta(0x58, [song.timeSignature[0], Math.log2(song.timeSignature[1]), 24, 8]) },
    { tick: 0, order: 3, bytes: meta(0x59, [ks.sf & 0xff, ks.minor]) },
  ];
  if (song.artist) conductor.push({ tick: 0, order: 4, bytes: textMeta(0x02, song.artist) });
  for (const { section, start } of sectionSpans(song)) conductor.push({ tick: Math.round(start * PPQ), order: 5, bytes: textMeta(0x06, labels(section)) });
  const tracks = [trackData(conductor)];
  let channel = 0;
  for (const track of song.tracks) {
    const inst = instrument(track.instrument);
    const ch = inst.drums ? 9 : channel++ % 16;
    if (channel === 9 && !inst.drums) channel++;
    const events = [
      { tick: 0, order: 0, bytes: textMeta(0x03, track.name || inst.en) },
      { tick: 0, order: 1, bytes: [0xb0 | ch, 7, Math.round(Math.min(1, track.volume) * 127)] },
      { tick: 0, order: 2, bytes: [0xb0 | ch, 10, Math.round(((track.pan + 1) / 2) * 127)] },
      { tick: 0, order: 3, bytes: [0xb0 | ch, 91, Math.round(track.reverb * 127)] },
    ];
    if (!inst.drums) events.push({ tick: 0, order: 4, bytes: [0xc0 | ch, inst.program & 0x7f] });
    for (const n of track.notes) {
      const on = tick(n.t);
      const off = Math.max(on + 1, tick(n.t + n.d));
      if (n.syl) events.push({ tick: on, order: 5, bytes: textMeta(0x05, n.syl) });
      events.push({ tick: on, order: 7, bytes: [0x90 | ch, n.p & 0x7f, Math.max(1, Math.round(n.v * 127))] });
      events.push({ tick: off, order: 6, bytes: [0x80 | ch, n.p & 0x7f, 64] });
    }
    tracks.push(trackData(events));
  }
  const header = chunk('MThd', [0, 1, (tracks.length >> 8) & 0xff, tracks.length & 0xff, (PPQ >> 8) & 0xff, PPQ & 0xff]);
  return new Uint8Array([...header, ...tracks.flatMap((t) => chunk('MTrk', t))]);
}

// ───────────────────────── import

/** MIDI bytes → { format, ppq, tracks: [{ name, events }] } (raw). */
export function parseMidi(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const str = (at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  const u32 = (at) => (b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3];
  const u16 = (at) => (b[at] << 8) | b[at + 1];
  if (str(0) !== 'MThd') throw new Error('not a MIDI file');
  const format = u16(8);
  const count = u16(10);
  const division = u16(12);
  if (division & 0x8000) throw new Error('SMPTE time MIDI files are not supported');
  let at = 8 + u32(4);
  const tracks = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count && at < b.length; k++) {
    if (str(at) !== 'MTrk') break;
    const len = u32(at + 4);
    let p = at + 8;
    const end = p + len;
    let tick = 0;
    let status = 0;
    const events = [];
    const readVlq = () => { let v = 0; let c; do { c = b[p++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80 && p < end); return v; };
    while (p < end) {
      tick += readVlq();
      let s = b[p];
      if (s & 0x80) p++; else s = status;
      if (s === 0xff) {
        const type = b[p++];
        const n = readVlq();
        const data = b.subarray(p, p + n);
        p += n;
        events.push({ tick, meta: type, data, text: type >= 1 && type <= 9 ? dec.decode(data) : null });
      } else if (s === 0xf0 || s === 0xf7) { const n = readVlq(); p += n; } else {
        status = s;
        const type = s & 0xf0;
        const ch = s & 0x0f;
        const d1 = b[p++];
        const d2 = type === 0xc0 || type === 0xd0 ? 0 : b[p++];
        events.push({ tick, type, ch, d1, d2 });
      }
    }
    tracks.push({ events });
    at = end;
  }
  return { format, ppq: division, tracks };
}

/** Best instrument for a GM program (the first with that program). */
const byProgram = (program, drums) => (drums ? 'kitPop' : INSTRUMENTS.find((i) => !i.drums && !i.vocal && i.program === program)?.id ?? INSTRUMENTS.find((i) => !i.drums && !i.vocal && Math.floor(i.program / 8) === Math.floor(program / 8))?.id ?? 'piano');

/** A MIDI file → a song (its notes, tempo, metre, track names, lyrics). */
export function midiToSong(bytes, { title = '' } = {}) {
  const midi = parseMidi(bytes);
  const ppq = midi.ppq;
  let bpm = 120;
  let ts = [4, 4];
  let songTitle = title;
  const out = [];
  for (const [index, track] of midi.tracks.entries()) {
    let name = '';
    const open = new Map();
    const byChannel = new Map();
    let program = new Map();
    const lyricsAt = [];
    for (const e of track.events) {
      if (e.meta === 0x51 && e.tick === 0) bpm = Math.round(60000000 / ((e.data[0] << 16) | (e.data[1] << 8) | e.data[2]) * 10) / 10;
      else if (e.meta === 0x58 && e.tick === 0) ts = [e.data[0], 2 ** e.data[1]];
      else if (e.meta === 0x03) { name = e.text ?? ''; if (index === 0 && !songTitle) songTitle = name; }
      else if (e.meta === 0x05) lyricsAt.push({ tick: e.tick, text: e.text ?? '' });
      else if (e.type === 0xc0) program.set(e.ch, e.d1);
      else if (e.type === 0x90 && e.d2 > 0) open.set(`${e.ch}:${e.d1}`, e);
      else if (e.type === 0x80 || (e.type === 0x90 && e.d2 === 0)) {
        const on = open.get(`${e.ch}:${e.d1}`);
        if (!on) continue;
        open.delete(`${e.ch}:${e.d1}`);
        if (!byChannel.has(e.ch)) byChannel.set(e.ch, []);
        byChannel.get(e.ch).push({ t: on.tick / ppq, d: Math.max(1 / 32, (e.tick - on.tick) / ppq), p: on.d1, v: on.d2 / 127 });
      }
    }
    for (const [ch, notes] of byChannel) {
      const drums = ch === 9;
      const inst = byProgram(program.get(ch) ?? 0, drums);
      const t = { id: newId('trk'), name: name || instrument(inst).en, role: drums ? 'drums' : 'lead', instrument: inst, notes, color: drums ? ROLE_COLORS.drums : undefined };
      // Lyric events in this track go onto its notes that start with them; it becomes the vocal.
      if (lyricsAt.length && !drums) {
        let hits = 0;
        for (const n of notes) { const l = lyricsAt.find((x) => Math.abs(x.tick / ppq - n.t) < 1 / 64); if (l) { n.syl = l.text.replace(/[\r\n/\\-]/g, '').trim(); hits += 1; } }
        if (hits) { t.role = 'vocal'; t.instrument = 'voiceFemale'; t.color = ROLE_COLORS.vocal; }
      }
      out.push(t);
    }
    program = new Map();
  }
  const per = (ts[0] * 4) / ts[1];
  const lastBeat = Math.max(per, ...out.flatMap((t) => t.notes.map((n) => n.t + n.d)));
  const bars = Math.max(1, Math.ceil(lastBeat / per));
  const sections = [];
  for (let left = bars; left > 0; left -= 8) sections.push({ type: sections.length ? 'verse' : 'verse', bars: Math.min(8, left) });
  return normalizeSong({ title: songTitle, bpm, timeSignature: ts, sections, tracks: out });
}

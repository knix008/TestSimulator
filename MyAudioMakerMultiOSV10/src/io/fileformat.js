// The song file (.mam): a ZIP holding song.json (and a small picture of the arrangement for file
// browsers). Plain JSON (a song saved by hand or an older build) opens too. Also the text exports:
// lyrics (.txt), timed lyrics (.lrc), a chord chart, and the song as JSON.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { normalizeSong, sectionSpans, chordLineText } from '../music/song.js';
import { beatsToSeconds, keyName } from '../music/theory.js';

export const EXTENSION = 'mam';
export const isSongName = (name) => /\.(mam|json)$/i.test(String(name ?? ''));
export const isMidiName = (name) => /\.(mid|midi|kar)$/i.test(String(name ?? ''));
export const isLyricsName = (name) => /\.(txt|lrc)$/i.test(String(name ?? ''));
export const isAudioName = (name) => /\.(wav)$/i.test(String(name ?? ''));

/** A song (+ an optional PNG) → .mam bytes. */
export function packSong(song, thumbnail = null) {
  const files = { 'song.json': [strToU8(JSON.stringify({ ...song, modified: new Date().toISOString() }, null, 1)), { level: 6 }] };
  if (thumbnail) files['thumbnail.png'] = [thumbnail, { level: 0 }];
  return zipSync(files);
}

/** .mam (or plain JSON) bytes → a song. */
export function unpackSong(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x7b || (b[0] === 0xef && b[3] === 0x7b)) return normalizeSong(JSON.parse(new TextDecoder().decode(b).replace(/^﻿/, '')));
  if (b[0] !== 0x50 || b[1] !== 0x4b) throw Object.assign(new Error('not a MyAudioMaker song'), { code: 'notSong' });
  const files = unzipSync(b);
  if (!files['song.json']) throw Object.assign(new Error('song.json is missing'), { code: 'notSong' });
  const raw = JSON.parse(strFromU8(files['song.json']));
  if (raw.format && raw.format !== 'myaudiomaker') throw Object.assign(new Error(`unknown format ${raw.format}`), { code: 'notSong' });
  return normalizeSong(raw);
}

/** Lyrics as text, a header per section ("[Chorus]"). */
export function lyricsToText(song, labels) {
  const out = [];
  if (song.title) out.push(song.title, '');
  for (const section of song.sections) {
    if (!section.lyrics.length) continue;
    out.push(`[${labels(section)}]`, ...section.lyrics, '');
  }
  return out.join('\n').trim() + '\n';
}

const lrcTime = (seconds) => { const m = Math.floor(seconds / 60); const s = seconds - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };

/** Timed lyrics (LRC): each line at its first sung note. */
export function lyricsToLrc(song, labels) {
  const out = [];
  if (song.title) out.push(`[ti:${song.title}]`);
  if (song.artist) out.push(`[ar:${song.artist}]`);
  out.push('[re:MyAudioMaker]');
  const vocal = song.tracks.find((t) => t.role === 'vocal');
  for (const { section, start, end } of sectionSpans(song)) {
    const lines = section.lyrics;
    if (!lines.length) continue;
    const len = (end - start) / lines.length;
    lines.forEach((line, i) => {
      const a = start + i * len;
      const first = vocal?.notes.find((n) => n.syl && n.t >= a - 0.5 && n.t < a + len);
      const beat = first ? first.t : a;
      out.push(`[${lrcTime(beatsToSeconds(beat, song.bpm))}]${line}`);
    });
    void labels;
  }
  return out.join('\n') + '\n';
}

/** A chord chart: key, tempo, and each section's chords bar by bar with its lyrics. */
export function chordChart(song, labels, t) {
  const out = [`${song.title || t('song.untitled')}${song.artist ? ` — ${song.artist}` : ''}`, `${t('song.key')}: ${keyName(song.key)} · ${song.bpm} BPM · ${song.timeSignature.join('/')}`, ''];
  for (const section of song.sections) {
    out.push(`[${labels(section)}] (${section.bars} ${t('song.barsUnit')})`, `  ${chordLineText(song, section)}`);
    for (const line of section.lyrics) out.push(`    ${line}`);
    out.push('');
  }
  return out.join('\n');
}

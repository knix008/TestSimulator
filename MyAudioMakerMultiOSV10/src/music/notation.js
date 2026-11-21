// Staff notation (CONTRACT: pure, SVG strings in millimetres): the sung melody on a treble staff (the lead
// line when there is no vocal) with chord symbols above and lyric syllables under their notes.
//
// Engraving: the melody is quantized to sixteenths, every note and gap is split at beats and bars into
// values that can be written (tied when a note goes on), and the bar is spaced by duration AND by the
// width of each syllable, so words never run into each other. Rests, dots, ties, beams (eighths and
// sixteenths grouped by beat), accidentals that hold through the bar, ledger lines, and whole-bar rests
// are drawn. Lines are filled with as many bars as fit and justified; a section always starts a line.
//
// Users: the Lead sheet view and print (leadSheetPages / leadSheetSvg), and the Lyrics view, which shows
// each section's melody above its lyrics (staffSvg). Every note is a <g class="nt" data-t data-e> so the
// views can light the note being played.
import { sectionSpans, chordTimeline, barBeats } from './song.js';
import { keySignature } from '../io/midi.js';
import { keyName, mod12, prefersFlats } from './theory.js';

const SHARP_SPELL = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const FLAT_SPELL = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
/** Order of sharps and flats in a key signature (letter indices). */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f2 = (v) => Number(v).toFixed(2);
const EPS = 1e-6;
const MUSIC_FONT = "'Segoe UI Symbol','Noto Music','Apple Symbols','DejaVu Sans',serif";
export const TEXT_FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR','Segoe UI',sans-serif";

/** Letters altered by the key signature: { letter index: +1 | -1 }. */
export function keyAlterations(key) {
  const { sf } = keySignature(key);
  const out = {};
  if (sf > 0) for (const l of SHARP_ORDER.slice(0, sf)) out[l] = 1;
  if (sf < 0) for (const l of FLAT_ORDER.slice(0, -sf)) out[l] = -1;
  return out;
}

/** How a MIDI note is written in a key: { letter (0–6), octave, alter (−1, 0, 1), accidental: '♯' | '♭' | '♮' | '' } (against the key signature only). */
export function spell(midi, key) {
  const flats = prefersFlats(key.tonic, key.mode);
  const [letter, alter] = (flats ? FLAT_SPELL : SHARP_SPELL)[mod12(midi)];
  const octave = Math.floor((midi - alter) / 12) - 1;
  const sig = keyAlterations(key)[letter] ?? 0;
  const accidental = alter === sig ? '' : alter === 1 ? '♯' : alter === -1 ? '♭' : '♮';
  return { letter, octave, alter, accidental };
}

/** Staff step of a written note: 0 = E4 (bottom line of the treble staff), each step a line or space. */
export const staffStep = (s) => (s.octave - 4) * 7 + s.letter - 2;

/** Defaults: sizes in mm. gap = distance between staff lines. */
export const SHEET = { gap: 1.9, barsPerLine: 4, maxBarsPerLine: 6, lineHeight: 27, header: 22 };

/** The melody notes the sheet shows: the vocal (else the lead), one at a time (the highest of notes starting together). */
export function melodyNotes(song) {
  const track = song.tracks.find((t) => t.role === 'vocal' && t.notes.length) ?? song.tracks.find((t) => t.role === 'lead' && t.notes.length);
  if (!track) return [];
  const out = [];
  for (const n of [...track.notes].sort((a, b) => a.t - b.t || b.p - a.p)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - n.t) < EPS) continue;
    out.push(n);
  }
  return out;
}

// ───────────────────────── rhythm: notes and gaps → writable pieces

/** Notes on a sixteenth grid, never overlapping: [{ s, e, p, syl, src }] in beats. */
export function quantize(notes, grid = 0.25) {
  const out = [];
  for (const n of notes) {
    const s = Math.round(n.t / grid) * grid;
    let e = Math.round((n.t + n.d) / grid) * grid;
    if (e <= s) e = s + grid;
    const last = out[out.length - 1];
    if (last && s < last.e - EPS) {
      if (s <= last.s + EPS) continue; // starts together after rounding: keep the first
      last.e = s;
    }
    out.push({ s, e, p: n.p, syl: n.syl ?? '', src: n });
  }
  return out;
}

/** Beat grouping of a metre: the length (in quarter beats) that beams and short values stay within. */
export function beatGroup(timeSignature) {
  const [n, d] = timeSignature;
  if (d === 8 && n % 3 === 0) return 1.5; // 6/8, 9/8, 12/8: dotted quarters
  return d === 8 ? 0.5 : 4 / d;
}

const NOTE_VALUES = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];
const REST_VALUES = [4, 2, 1.5, 1, 0.5, 0.25];

/** Whether a value may start at `r` beats into the bar (it must not hide the beat). */
function fits(r, v, barLen, group) {
  const on = (x, unit) => Math.abs(x / unit - Math.round(x / unit)) < EPS;
  if (v < group - EPS) return Math.floor((r + EPS) / group) === Math.floor((r + v - EPS) / group);
  // 4/4: nothing but a whole or a dotted half from the downbeat hides the middle of the bar.
  if (barLen === 4 && group === 1 && r > EPS && r < 2 - EPS && r + v > 2 + EPS) return false;
  if (v === 4) return r < EPS && barLen >= 4 - EPS;
  if (v === 3) return r < EPS || (group === 1.5 && on(r, 1.5));
  if (v === 2) return group === 1.5 ? false : on(r, barLen % 2 === 0 ? 2 : 1);
  if (v === 1.5) return on(r, group === 1.5 ? 1.5 : 1);
  return on(r, group);
}

/** [s, e) cut into writable values: [{ s, v }]. */
export function splitValues(s, e, barStart, barLen, group, values = NOTE_VALUES) {
  const out = [];
  let p = s;
  for (let guard = 0; p < e - EPS && guard < 64; guard++) {
    const r = p - barStart;
    const v = values.find((x) => p + x <= e + EPS && fits(r, x, barLen, group)) ?? 0.25;
    out.push({ s: p, v });
    p += v;
  }
  return out;
}

/**
 * The events of one bar: [{ kind: 'note' | 'rest', s, v, p, syl, tieNext, tieFrom, src, whole }].
 * A note that goes past the bar line is continued (tied) in the next bar by the caller.
 */
export function barEvents(qnotes, barStart, barLen, group) {
  const barEnd = barStart + barLen;
  const inBar = qnotes.filter((n) => n.e > barStart + EPS && n.s < barEnd - EPS);
  if (!inBar.length) return [{ kind: 'rest', s: barStart, v: barLen, whole: true }];
  const out = [];
  let at = barStart;
  for (const n of inBar) {
    const s = Math.max(n.s, barStart);
    const e = Math.min(n.e, barEnd);
    if (s > at + EPS) for (const piece of splitValues(at, s, barStart, barLen, group, REST_VALUES)) out.push({ kind: 'rest', ...piece });
    const pieces = splitValues(s, e, barStart, barLen, group);
    pieces.forEach((piece, i) => out.push({
      kind: 'note', ...piece, p: n.p, src: n.src,
      syl: i === 0 && n.s >= barStart - EPS ? n.syl : '',
      tieFrom: i > 0 || n.s < barStart - EPS,
      tieNext: i < pieces.length - 1 || n.e > barEnd + EPS,
    }));
    at = e;
  }
  if (at < barEnd - EPS) for (const piece of splitValues(at, barEnd, barStart, barLen, group, REST_VALUES)) out.push({ kind: 'rest', ...piece });
  return out;
}

// ───────────────────────── layout

/** Rough text width in mm at a font size (Hangul is wide, Latin narrow). */
export function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text ?? '')) w += /[ᄀ-ᇿ㄰-㆏가-힣぀-ヿ一-鿿]/.test(ch) ? size * 0.98 : /[A-Z]/.test(ch) ? size * 0.68 : size * 0.56;
  return w;
}

/** The width an event needs (mm): its head, accidental, dot and syllable, and room for its duration. */
function eventWidth(ev, gap, lyricSize) {
  if (ev.whole) return gap * 7;
  const space = gap * (1.5 + 2.1 * Math.sqrt(ev.v));
  if (ev.kind === 'rest') return space;
  const lyric = ev.syl ? textWidth(ev.syl, lyricSize) + gap * 0.9 : 0;
  return Math.max(space, lyric) + (ev.accidental ? gap * 1.3 : 0) + (isDotted(ev.v) ? gap * 0.6 : 0);
}

const isDotted = (v) => [3, 1.5, 0.75].some((x) => Math.abs(v - x) < EPS);

/** The writing of every bar: events (with accidentals resolved through the bar) and the width they need. */
export function engraveBars(song, { gap = SHEET.gap, lyricSize = gap * 1.65 } = {}) {
  const per = barBeats(song);
  const group = beatGroup(song.timeSignature);
  const qnotes = quantize(melodyNotes(song));
  const total = song.sections.reduce((n, s) => n + s.bars, 0);
  const alterations = keyAlterations(song.key);
  const bars = [];
  for (let b = 0; b < total; b++) {
    const start = b * per;
    const events = barEvents(qnotes, start, per, group);
    // Accidentals hold for the rest of the bar (per letter and octave); a tied continuation shows none.
    const state = new Map();
    for (const ev of events) {
      if (ev.kind !== 'note') continue;
      const s = spell(ev.p, song.key);
      const keyAlter = alterations[s.letter] ?? 0;
      const id = `${s.letter}:${s.octave}`;
      const current = state.has(id) ? state.get(id) : keyAlter;
      ev.spelled = s;
      ev.accidental = !ev.tieFrom && s.alter !== current ? (s.alter === 1 ? '♯' : s.alter === -1 ? '♭' : '♮') : '';
      state.set(id, s.alter);
    }
    const need = gap * 2.2 + events.reduce((w, ev) => w + eventWidth(ev, gap, lyricSize), 0);
    bars.push({ index: b, start, end: start + per, events, need });
  }
  return { bars, per, group };
}

/** Lines of bars: [{ bars: [barIndex], section }] filling `usable` mm (after the line start). A section starts a new line. */
export function fitLines(song, engraved, usable, { maxBars = SHEET.maxBarsPerLine, startWidth = 0, firstExtra = 0 } = {}) {
  const lines = [];
  let index = 0;
  for (const { section, start } of sectionSpans(song)) {
    const first = Math.round(start / engraved.per);
    let line = null;
    for (let b = first; b < first + section.bars; b++) {
      const need = engraved.bars[b]?.need ?? 0;
      const room = usable - startWidth - (lines.length === 0 ? firstExtra : 0);
      if (!line || line.bars.length >= maxBars || line.need + need > room) {
        line = { bars: [], need: 0, section: line ? null : section, index: index++ };
        lines.push(line);
      }
      line.bars.push(b);
      line.need += need;
    }
  }
  return lines;
}

// ───────────────────────── drawing

/** Clef, key signature and (when asked) time signature at a line's start. Returns { svg, width }. */
function lineStart(song, x, top, gap, withTime, ink) {
  let svg = `<text x="${f2(x + 0.4)}" y="${f2(top + gap * 3.4)}" font-size="${f2(gap * 6.4)}" fill="${ink}" font-family="${MUSIC_FONT}">𝄞</text>`;
  let w = gap * 4.2;
  const alt = keyAlterations(song.key);
  const sharp = Object.values(alt)[0] === 1;
  const order = sharp ? SHARP_ORDER : FLAT_ORDER;
  const sharpSteps = { 3: 8, 0: 5, 4: 9, 1: 6, 5: 3, 2: 7, 6: 4 };
  const flatSteps = { 6: 4, 2: 7, 5: 3, 1: 6, 4: 2, 0: 5, 3: 1 };
  for (const l of order.filter((k) => alt[k])) {
    const step = (sharp ? sharpSteps : flatSteps)[l];
    svg += `<text x="${f2(x + w)}" y="${f2(top + gap * 4 - step * (gap / 2) + gap * 0.55)}" font-size="${f2(gap * 2.4)}" fill="${ink}">${sharp ? '♯' : '♭'}</text>`;
    w += gap * 1.5;
  }
  if (withTime) {
    const [n, d] = song.timeSignature;
    svg += `<text x="${f2(x + w + gap * 1.4)}" y="${f2(top + gap * 1.9)}" font-size="${f2(gap * 2.3)}" font-weight="700" text-anchor="middle" fill="${ink}">${n}</text><text x="${f2(x + w + gap * 1.4)}" y="${f2(top + gap * 3.9)}" font-size="${f2(gap * 2.3)}" font-weight="700" text-anchor="middle" fill="${ink}">${d}</text>`;
    w += gap * 3;
  }
  return { svg, width: w + gap * 0.6 };
}

export const startWidth = (song, gap, withTime) => lineStart(song, 0, 0, gap, withTime, '#000').width;

/** A rest of value v centred at x. */
function restSvg(v, x, top, gap, ink, whole) {
  const mid = top + gap * 2;
  if (whole || v >= 4 - EPS) return `<rect x="${f2(x - gap * 0.6)}" y="${f2(top + gap)}" width="${f2(gap * 1.2)}" height="${f2(gap * 0.5)}" fill="${ink}"/>`;
  if (v >= 2 - EPS) return `<rect x="${f2(x - gap * 0.6)}" y="${f2(mid - gap * 0.5)}" width="${f2(gap * 1.2)}" height="${f2(gap * 0.5)}" fill="${ink}"/>`
    + (v >= 3 - EPS ? `<circle cx="${f2(x + gap * 1.1)}" cy="${f2(mid - gap * 0.75)}" r="${f2(gap * 0.18)}" fill="${ink}"/>` : '');
  if (v >= 1 - EPS) {
    const d = `M${f2(x - gap * 0.2)} ${f2(mid - gap * 1.5)} l${f2(gap * 0.6)} ${f2(gap * 0.75)} l${f2(-gap * 0.55)} ${f2(gap * 0.6)} l${f2(gap * 0.6)} ${f2(gap * 0.75)} q${f2(-gap * 0.9)} ${f2(-gap * 0.3)} ${f2(-gap * 0.3)} ${f2(gap * 0.9)}`;
    return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${f2(gap * 0.22)}" stroke-linejoin="round" stroke-linecap="round"/>`
      + (v >= 1.5 - EPS ? `<circle cx="${f2(x + gap * 0.9)}" cy="${f2(mid - gap * 0.4)}" r="${f2(gap * 0.18)}" fill="${ink}"/>` : '');
  }
  const flags = v <= 0.25 + EPS ? 2 : 1;
  let out = '';
  for (let k = 0; k < flags; k++) {
    const y = mid - gap * 0.5 + k * gap;
    out += `<circle cx="${f2(x - gap * 0.35 - k * gap * 0.2)}" cy="${f2(y)}" r="${f2(gap * 0.28)}" fill="${ink}"/><path d="M${f2(x - gap * 0.35 - k * gap * 0.2)} ${f2(y + gap * 0.1)} Q${f2(x + gap * 0.2 - k * gap * 0.2)} ${f2(y + gap * 0.25)} ${f2(x + gap * 0.45 - k * gap * 0.2)} ${f2(y - gap * 0.3)}" fill="none" stroke="${ink}" stroke-width="${f2(gap * 0.16)}"/>`;
  }
  out += `<line x1="${f2(x + gap * 0.45)}" y1="${f2(mid - gap * 0.3)}" x2="${f2(x - gap * 0.15 - (flags - 1) * gap * 0.25)}" y2="${f2(mid + gap * (flags === 2 ? 1.6 : 1.2))}" stroke="${ink}" stroke-width="${f2(gap * 0.16)}"/>`;
  return out;
}

/** Draws one line (system). Returns the SVG of the line. */
function drawLine(song, engraved, line, { x0, top, usable, gap, ink, accent, lyricSize, withTime, justify, chords, label, final }) {
  const start = lineStart(song, x0, top, gap, withTime, ink);
  const bars = line.bars.map((b) => engraved.bars[b]);
  const room = usable - start.width;
  const need = bars.reduce((w, b) => w + b.need, 0);
  const scale = justify ? room / need : Math.min(room / need, 1.25);
  let g = start.svg;
  const lineEnd = x0 + start.width + need * scale;
  for (let k = 0; k < 5; k++) g += `<line x1="${f2(x0)}" x2="${f2(lineEnd)}" y1="${f2(top + k * gap)}" y2="${f2(top + k * gap)}" stroke="${ink}" stroke-width="0.16"/>`;
  if (label) g += `<text x="${f2(x0)}" y="${f2(top - gap * 3.4)}" font-size="${f2(gap * 1.6)}" font-weight="700" fill="${accent}">${esc(label)}</text>`;
  const lyricY = top + gap * 4 + gap * 3.4;
  let x = x0 + start.width;
  const heads = []; // every drawn note head: { ev, x, y, step, up }
  const timeX = []; // [beat, x] for chords
  bars.forEach((bar, bi) => {
    const width = bar.need * scale;
    const stretch = (width - gap * 2.2) / (bar.need - gap * 2.2);
    let ex = x + gap * 1.4;
    for (const ev of bar.events) {
      const w = eventWidth(ev, gap, lyricSize) * stretch;
      const cx = ev.whole ? x + width / 2 : ex + (ev.accidental ? gap * 1.3 : 0) + gap * 0.7;
      timeX.push([ev.s, cx]);
      if (ev.kind === 'rest') g += restSvg(ev.v, cx, top, gap, ink, ev.whole);
      else {
        const step = staffStep(ev.spelled);
        heads.push({ ev, x: cx, y: top + gap * 4 - step * (gap / 2), step });
      }
      ex += w;
    }
    x += width;
    const last = final && bi === bars.length - 1;
    g += `<line x1="${f2(x)}" x2="${f2(x)}" y1="${f2(top)}" y2="${f2(top + 4 * gap)}" stroke="${ink}" stroke-width="${last ? 0.6 : 0.2}"/>`;
    if (last) g += `<line x1="${f2(x - 0.8)}" x2="${f2(x - 0.8)}" y1="${f2(top)}" y2="${f2(top + 4 * gap)}" stroke="${ink}" stroke-width="0.18"/>`;
  });
  // Beams: eighths and shorter inside one beat group, two or more in a row.
  const groups = [];
  let run = [];
  const flush = () => { if (run.length > 1) groups.push(run); run = []; };
  for (const h of heads) {
    const short = h.ev.v < 1 - EPS;
    const prev = run[run.length - 1];
    const sameGroup = prev && Math.floor((prev.ev.s - Math.floor(prev.ev.s / engraved.per) * engraved.per + EPS) / engraved.group) === Math.floor((h.ev.s - Math.floor(h.ev.s / engraved.per) * engraved.per + EPS) / engraved.group)
      && Math.floor((prev.ev.s + EPS) / engraved.per) === Math.floor((h.ev.s + EPS) / engraved.per)
      && Math.abs(prev.ev.s + prev.ev.v - h.ev.s) < EPS;
    if (!short) { flush(); continue; }
    if (!sameGroup) flush();
    run.push(h);
  }
  flush();
  const beamed = new Map();
  for (const grp of groups) {
    const up = grp.reduce((n, h) => n + h.step, 0) / grp.length < 4;
    const stemY = up ? Math.min(...grp.map((h) => h.y)) - gap * 3.2 : Math.max(...grp.map((h) => h.y)) + gap * 3.2;
    for (const h of grp) beamed.set(h, { up, stemY });
    const sx = (h) => (up ? h.x + gap * 0.58 : h.x - gap * 0.58);
    const thick = gap * 0.42;
    const by = (k) => (up ? stemY + k * gap * 0.75 : stemY - k * gap * 0.75 - thick);
    g += `<rect x="${f2(sx(grp[0]))}" y="${f2(up ? stemY : stemY - thick)}" width="${f2(sx(grp[grp.length - 1]) - sx(grp[0]))}" height="${f2(thick)}" fill="${ink}"/>`;
    // Second beam between sixteenths; a stub for a lone sixteenth.
    grp.forEach((h, i) => {
      if (h.ev.v > 0.25 + EPS) return;
      const next = grp[i + 1];
      const prev = grp[i - 1];
      if (next && next.ev.v <= 0.25 + EPS) g += `<rect x="${f2(sx(h))}" y="${f2(by(1))}" width="${f2(sx(next) - sx(h))}" height="${f2(thick)}" fill="${ink}"/>`;
      else if (!(prev && prev.ev.v <= 0.25 + EPS)) {
        const toward = next ? 1 : -1;
        const x1 = sx(h);
        const x2 = x1 + toward * gap * 1.2;
        g += `<rect x="${f2(Math.min(x1, x2))}" y="${f2(by(1))}" width="${f2(Math.abs(x2 - x1))}" height="${f2(thick)}" fill="${ink}"/>`;
      }
    });
  }
  // Heads, stems, flags, dots, accidentals, ledger lines, syllables, ties.
  heads.forEach((h, i) => {
    const { ev } = h;
    const rx = gap * 0.62;
    const ry = gap * 0.45;
    let n = '';
    for (let k = -2; k >= h.step - 1 && k >= -12; k -= 2) n += `<line x1="${f2(h.x - rx * 1.7)}" x2="${f2(h.x + rx * 1.7)}" y1="${f2(top + gap * 4 - k * (gap / 2))}" y2="${f2(top + gap * 4 - k * (gap / 2))}" stroke="${ink}" stroke-width="0.18"/>`;
    for (let k = 10; k <= h.step + 1 && k <= 24; k += 2) n += `<line x1="${f2(h.x - rx * 1.7)}" x2="${f2(h.x + rx * 1.7)}" y1="${f2(top + gap * 4 - k * (gap / 2))}" y2="${f2(top + gap * 4 - k * (gap / 2))}" stroke="${ink}" stroke-width="0.18"/>`;
    if (ev.accidental) n += `<text x="${f2(h.x - rx - gap * 0.85)}" y="${f2(h.y + gap * 0.55)}" font-size="${f2(gap * 2)}" fill="${ink}" text-anchor="middle">${ev.accidental}</text>`;
    const hollow = ev.v >= 2 - EPS;
    n += `<ellipse class="nh" cx="${f2(h.x)}" cy="${f2(h.y)}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(-20 ${f2(h.x)} ${f2(h.y)})" fill="${hollow ? 'none' : ink}" stroke="${ink}" stroke-width="0.24"/>`;
    if (isDotted(ev.v)) n += `<circle cx="${f2(h.x + gap * 1.1)}" cy="${f2(h.y - (h.step % 2 === 0 ? gap * 0.5 : 0))}" r="${f2(gap * 0.18)}" fill="${ink}"/>`;
    if (ev.v < 4 - EPS) {
      const beam = beamed.get(h);
      const up = beam ? beam.up : h.step < 4;
      const sx = up ? h.x + rx * 0.92 : h.x - rx * 0.92;
      const sy2 = beam ? beam.stemY : (up ? h.y - gap * 3.3 : h.y + gap * 3.3);
      n += `<line x1="${f2(sx)}" x2="${f2(sx)}" y1="${f2(h.y)}" y2="${f2(sy2)}" stroke="${ink}" stroke-width="0.2"/>`;
      if (!beam) {
        const flags = ev.v <= 0.25 + EPS ? 2 : ev.v < 1 - EPS ? 1 : 0;
        for (let k = 0; k < flags; k++) {
          const fy = sy2 + (up ? 1 : -1) * k * gap * 0.8;
          n += `<path d="M${f2(sx)} ${f2(fy)} q ${f2(gap * 0.9)} ${f2((up ? 1 : -1) * gap * 0.8)} ${f2(gap * 0.5)} ${f2((up ? 1 : -1) * gap * 1.9)}" fill="none" stroke="${ink}" stroke-width="0.26"/>`;
        }
      }
    }
    if (ev.syl) n += `<text class="ly" x="${f2(h.x)}" y="${f2(lyricY)}" font-size="${f2(lyricSize)}" text-anchor="middle" fill="${ink}">${esc(ev.syl)}</text>`;
    if (ev.tieNext) {
      const next = heads[i + 1];
      const up = h.step >= 4;
      const x1 = h.x + gap * 0.5;
      const x2 = next && next.ev.p === ev.p ? next.x - gap * 0.5 : Math.min(h.x + gap * 4, lineEnd);
      const y = h.y + (up ? -gap * 0.7 : gap * 0.7);
      n += `<path d="M${f2(x1)} ${f2(y)} Q${f2((x1 + x2) / 2)} ${f2(y + (up ? -gap * 1.1 : gap * 1.1))} ${f2(x2)} ${f2(y)}" fill="none" stroke="${ink}" stroke-width="0.22"/>`;
    }
    const src = ev.src;
    g += `<g class="nt" data-t="${f2(src?.t ?? ev.s)}" data-e="${f2((src?.t ?? ev.s) + (src?.d ?? ev.v))}">${n}</g>`;
  });
  // Chords above, at the x of their beat.
  const xAtBeat = (beat) => {
    let best = timeX[0];
    for (const tx of timeX) if (tx[0] <= beat + EPS) best = tx;
    return best ? best[1] : x0 + start.width;
  };
  const lineStartBeat = engraved.bars[line.bars[0]].start;
  const lineEndBeat = engraved.bars[line.bars[line.bars.length - 1]].end;
  let lastSymbol = null;
  for (const c of chords) {
    if (c.start < lineStartBeat - EPS || c.start >= lineEndBeat - EPS) continue;
    const symbol = c.symbol ?? 'N.C.';
    if (symbol === lastSymbol && Math.abs((c.start - lineStartBeat) % engraved.per) > EPS) continue;
    lastSymbol = symbol;
    g += `<text x="${f2(xAtBeat(c.start) - gap * 0.6)}" y="${f2(top - gap * 1.4)}" font-size="${f2(gap * 1.65)}" font-weight="700" fill="${ink}">${esc(symbol)}</text>`;
  }
  return g;
}

function header(song, x, y, width, ctx) {
  const t = ctx.t;
  const title = song.title || t('song.untitled');
  return `<text x="${f2(x + width / 2)}" y="${f2(y + 8)}" font-size="7" font-weight="700" text-anchor="middle" fill="#111">${esc(title)}</text>`
    + (song.artist ? `<text x="${f2(x + width)}" y="${f2(y + 14)}" font-size="3.2" text-anchor="end" fill="#333">${esc(song.artist)}</text>` : '')
    + `<text x="${f2(x)}" y="${f2(y + 14)}" font-size="3.2" fill="#333">${esc(`${t('song.key')}: ${keyName(song.key)} · ♩ = ${song.bpm} · ${song.timeSignature.join('/')}`)}</text>`
    + `<text x="${f2(x)}" y="${f2(y + 19)}" font-size="2.8" fill="#666">${esc(ctx.subtitle ?? '')}</text>`;
}

/**
 * The sheet's pages: [svg body (mm units)] for a page of `width` × `height` mm with margins `margin`.
 * ctx: { t, labels(section), subtitle }.
 */
export function leadSheetPages(song, { width = 210, height = 297, margin = 14, ctx }) {
  const gap = SHEET.gap;
  const engraved = engraveBars(song, { gap });
  const usable = width - 2 * margin;
  const sw = startWidth(song, gap, false);
  const lines = fitLines(song, engraved, usable, { startWidth: sw, firstExtra: gap * 3 });
  const chords = chordTimeline(song);
  const pages = [];
  let body = header(song, margin, margin, usable, ctx);
  let y = margin + SHEET.header + 6;
  lines.forEach((line, index) => {
    if (y + SHEET.lineHeight > height - margin - 6) { pages.push(body); body = ''; y = margin + 8; }
    const lastOfSection = !lines[index + 1] || lines[index + 1].section;
    const short = line.need < (usable - sw) * 0.6;
    body += `<g class="sheet-line" data-bar="${line.bars[0]}">${drawLine(song, engraved, line, {
      x0: margin, top: y + 7, usable, gap, ink: '#111', accent: '#1d4ed8', lyricSize: gap * 1.65, withTime: index === 0,
      justify: !(lastOfSection && short), chords, label: line.section ? ctx.labels(line.section) : '', final: index === lines.length - 1,
    })}</g>`;
    y += SHEET.lineHeight;
  });
  pages.push(body);
  return pages;
}

/** The whole sheet as one SVG (the Lead sheet view): pages one under another, `scale` px per mm. */
export function leadSheetSvg(song, { scale = 3.2, ctx, width = 210, height = 297 }) {
  const pages = leadSheetPages(song, { width, height, ctx });
  const gapMm = 8;
  const total = pages.length * height + (pages.length - 1) * gapMm;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * scale)}" height="${Math.round(total * scale)}" viewBox="0 0 ${width} ${f2(total)}" font-family="${TEXT_FONT}">`;
  pages.forEach((body, i) => {
    const oy = i * (height + gapMm);
    out += `<g transform="translate(0 ${f2(oy)})"><rect width="${width}" height="${height}" fill="#ffffff" stroke="#c9ced6" stroke-width="0.3"/>${body}<text x="${width / 2}" y="${height - 6}" font-size="2.6" text-anchor="middle" fill="#888">${i + 1} / ${pages.length}</text></g>`;
  });
  return `${out}</svg>`;
}

/**
 * One section's melody as staff lines for the Lyrics view: an <svg> `widthPx` wide drawn in the current
 * text colour (themes), chords above and syllables under the notes, wrapped to as many lines as needed.
 * `engraved` may be passed in (engraveBars(song)) when several sections are drawn at once.
 */
export function staffSvg(song, section, { widthPx = 640, pxPerMm = 3.4, engraved = null, accent = 'currentColor' } = {}) {
  const gap = SHEET.gap;
  const eng = engraved ?? engraveBars(song, { gap });
  const span = sectionSpans(song).find((s) => s.section === section || s.section.id === section?.id);
  if (!span) return '';
  const first = Math.round(span.start / eng.per);
  const widthMm = widthPx / pxPerMm;
  const margin = 1;
  const usable = widthMm - 2 * margin;
  const sw = startWidth(song, gap, false);
  const lines = [];
  let line = null;
  for (let b = first; b < first + section.bars; b++) {
    const need = eng.bars[b]?.need ?? 0;
    if (!line || line.bars.length >= SHEET.maxBarsPerLine || line.need + need > usable - sw) { line = { bars: [], need: 0 }; lines.push(line); }
    line.bars.push(b);
    line.need += need;
  }
  const chords = chordTimeline(song);
  const lineHeight = gap * 12.5;
  let body = '';
  lines.forEach((l, i) => {
    body += drawLine(song, eng, l, { x0: margin, top: i * lineHeight + gap * 3.6, usable, gap, ink: 'currentColor', accent, lyricSize: gap * 1.65, withTime: false, justify: i < lines.length - 1 || l.need > (usable - sw) * 0.6, chords, label: '', final: false });
  });
  const heightMm = lines.length * lineHeight + gap;
  return `<svg class="staff-svg" xmlns="http://www.w3.org/2000/svg" width="${Math.round(widthPx)}" height="${Math.round(heightMm * pxPerMm)}" viewBox="0 0 ${f2(widthMm)} ${f2(heightMm)}" font-family="${TEXT_FONT}" role="img">${body}</svg>`;
}

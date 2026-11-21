// A lead sheet in staff notation (CONTRACT: pure, SVG strings in millimetres): the sung melody on a
// treble staff (the lead line when there is no vocal), chord symbols above, lyric syllables below,
// section names at the start of their lines, a header with title, key, tempo and metre. The Lead sheet
// view shows it; the print window prints it page by page.
import { sectionSpans, chordTimeline, barBeats, songBeats } from './song.js';
import { keySignature } from '../io/midi.js';
import { beatsPerBar, keyName, mod12, prefersFlats } from './theory.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_SPELL = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const FLAT_SPELL = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
/** Order of sharps and flats in a key signature (letter indices). */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f2 = (v) => Number(v).toFixed(2);

/** Letters altered by the key signature: { letter index: +1 | -1 }. */
export function keyAlterations(key) {
  const { sf } = keySignature(key);
  const out = {};
  if (sf > 0) for (const l of SHARP_ORDER.slice(0, sf)) out[l] = 1;
  if (sf < 0) for (const l of FLAT_ORDER.slice(0, -sf)) out[l] = -1;
  return out;
}

/** How a MIDI note is written in a key: { letter (0–6), octave, alter (−1, 0, 1), accidental: '♯' | '♭' | '♮' | '' }. */
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

/** Defaults: sizes in mm. */
export const SHEET = { gap: 1.9, barsPerLine: 4, lineHeight: 26, header: 22 };

/** The melody notes the sheet shows: the vocal (else the lead), without overlaps. */
export function melodyNotes(song) {
  const track = song.tracks.find((t) => t.role === 'vocal' && t.notes.length) ?? song.tracks.find((t) => t.role === 'lead' && t.notes.length);
  if (!track) return [];
  // One note at a time: the highest of notes starting together.
  const out = [];
  for (const n of track.notes) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - n.t) < 1e-6) { if (n.p > last.p) out[out.length - 1] = n; continue; }
    out.push(n);
  }
  return out;
}

/** The lines (systems) of the sheet: [{ startBar, bars, section? }]. A section always starts a new line. */
export function sheetLines(song, barsPerLine = SHEET.barsPerLine) {
  const per = barBeats(song);
  const lines = [];
  for (const { section, start } of sectionSpans(song)) {
    const first = Math.round(start / per);
    for (let b = 0; b < section.bars; b += barsPerLine) lines.push({ startBar: first + b, bars: Math.min(barsPerLine, section.bars - b), section: b === 0 ? section : null });
  }
  return lines;
}

function header(song, x, y, width, ctx) {
  const t = ctx.t;
  const title = song.title || t('song.untitled');
  return `<text x="${f2(x + width / 2)}" y="${f2(y + 8)}" font-size="7" font-weight="700" text-anchor="middle" fill="#111">${esc(title)}</text>`
    + (song.artist ? `<text x="${f2(x + width)}" y="${f2(y + 14)}" font-size="3.2" text-anchor="end" fill="#333">${esc(song.artist)}</text>` : '')
    + `<text x="${f2(x)}" y="${f2(y + 14)}" font-size="3.2" fill="#333">${esc(`${t('song.key')}: ${keyName(song.key)} · ♩ = ${song.bpm} · ${song.timeSignature.join('/')}`)}</text>`
    + `<text x="${f2(x)}" y="${f2(y + 19)}" font-size="2.8" fill="#666">${esc(ctx.subtitle ?? '')}</text>`;
}

/** Clef, key signature and (first line) time signature at a line's start. Returns { svg, width }. */
function lineStart(song, x, top, gap, first) {
  let svg = `<text x="${f2(x + 0.5)}" y="${f2(top + gap * 3.4)}" font-size="${f2(gap * 6.4)}" fill="#111" font-family="'Segoe UI Symbol','Noto Music','DejaVu Sans',serif">𝄞</text>`;
  let w = gap * 4.2;
  const alt = keyAlterations(song.key);
  const sharp = Object.values(alt)[0] === 1;
  const order = sharp ? SHARP_ORDER : FLAT_ORDER;
  // Where each accidental of the signature sits on the treble staff (steps from E4).
  const sharpSteps = { 3: 8, 0: 5, 4: 9, 1: 6, 5: 3, 2: 7, 6: 4 };
  const flatSteps = { 6: 4, 2: 7, 5: 3, 1: 6, 4: 2, 0: 5, 3: 1 };
  for (const l of order.filter((k) => alt[k])) {
    const step = (sharp ? sharpSteps : flatSteps)[l];
    svg += `<text x="${f2(x + w)}" y="${f2(top + gap * 4 - step * (gap / 2) + gap * 0.55)}" font-size="${f2(gap * 2.4)}" fill="#111">${sharp ? '♯' : '♭'}</text>`;
    w += gap * 1.5;
  }
  if (first) {
    const [n, d] = song.timeSignature;
    svg += `<text x="${f2(x + w + gap * 1.4)}" y="${f2(top + gap * 1.9)}" font-size="${f2(gap * 2.3)}" font-weight="700" text-anchor="middle" fill="#111">${n}</text><text x="${f2(x + w + gap * 1.4)}" y="${f2(top + gap * 3.9)}" font-size="${f2(gap * 2.3)}" font-weight="700" text-anchor="middle" fill="#111">${d}</text>`;
    w += gap * 3;
  }
  return { svg, width: w + gap * 0.6 };
}

/** One note (head, accidental, ledger lines, stem and flags) and its syllable. */
function noteSvg(n, x, top, gap, key, lyricY) {
  const s = spell(n.p, key);
  const step = staffStep(s);
  const y = top + gap * 4 - step * (gap / 2);
  const rx = gap * 0.62;
  const ry = gap * 0.45;
  let out = '';
  // Ledger lines below and above the staff.
  for (let k = -2; k >= step - 1 && k >= -12; k -= 2) out += `<line x1="${f2(x - rx * 1.7)}" x2="${f2(x + rx * 1.7)}" y1="${f2(top + gap * 4 - k * (gap / 2))}" y2="${f2(top + gap * 4 - k * (gap / 2))}" stroke="#111" stroke-width="0.18"/>`;
  for (let k = 10; k <= step + 1 && k <= 24; k += 2) out += `<line x1="${f2(x - rx * 1.7)}" x2="${f2(x + rx * 1.7)}" y1="${f2(top + gap * 4 - k * (gap / 2))}" y2="${f2(top + gap * 4 - k * (gap / 2))}" stroke="#111" stroke-width="0.18"/>`;
  if (s.accidental) out += `<text x="${f2(x - rx - gap * 0.9)}" y="${f2(y + gap * 0.5)}" font-size="${f2(gap * 2)}" fill="#111" text-anchor="middle">${s.accidental}</text>`;
  const hollow = n.d >= 1.99;
  out += `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(-20 ${f2(x)} ${f2(y)})" fill="${hollow ? '#fff' : '#111'}" stroke="#111" stroke-width="0.22"/>`;
  if (n.d < 3.99) {
    const up = step < 4;
    const sx = up ? x + rx * 0.92 : x - rx * 0.92;
    const sy2 = up ? y - gap * 3.3 : y + gap * 3.3;
    out += `<line x1="${f2(sx)}" x2="${f2(sx)}" y1="${f2(y)}" y2="${f2(sy2)}" stroke="#111" stroke-width="0.2"/>`;
    const flags = n.d <= 0.26 ? 2 : n.d <= 0.6 ? 1 : 0;
    for (let k = 0; k < flags; k++) {
      const fy = sy2 + (up ? 1 : -1) * k * gap * 0.8;
      out += `<path d="M${f2(sx)} ${f2(fy)} q ${f2(gap * 0.9)} ${f2((up ? 1 : -1) * gap * 0.8)} ${f2(gap * 0.5)} ${f2((up ? 1 : -1) * gap * 1.9)}" fill="none" stroke="#111" stroke-width="0.26"/>`;
    }
  }
  if (n.syl) out += `<text x="${f2(x)}" y="${f2(lyricY)}" font-size="${f2(gap * 1.65)}" text-anchor="middle" fill="#222">${esc(n.syl)}</text>`;
  return out;
}

/**
 * The sheet's pages: [svg body (mm units)] for a page of `width` × `height` mm with margins `margin`.
 * ctx: { t, labels(section), subtitle, pageNumbers: true }.
 */
export function leadSheetPages(song, { width = 210, height = 297, margin = 14, ctx }) {
  const gap = SHEET.gap;
  const lineHeight = SHEET.lineHeight;
  const notes = melodyNotes(song);
  const timeline = chordTimeline(song);
  const per = barBeats(song);
  const per0 = barBeats(song);
  // Busy melodies get fewer bars per line, so syllables do not run into each other.
  const perBar = new Map();
  for (const n of notes) { const b = Math.floor(n.t / per0); perBar.set(b, (perBar.get(b) ?? 0) + 1); }
  const busiest = Math.max(0, ...perBar.values());
  const barsPerLine = busiest > 7 ? 2 : SHEET.barsPerLine;
  const lines = sheetLines(song, barsPerLine);
  const pages = [];
  let body = header(song, margin, margin, width - 2 * margin, ctx);
  let y = margin + SHEET.header + 6;
  const flats = prefersFlats(song.key.tonic, song.key.mode);
  void flats;
  lines.forEach((line, index) => {
    if (y + lineHeight > height - margin - 6) {
      pages.push(body);
      body = '';
      y = margin + 8;
    }
    const top = y + 6;
    const x0 = margin;
    const usable = width - 2 * margin;
    const start = lineStart(song, x0, top, gap, index === 0);
    const barWidth = (usable - start.width) / barsPerLine;
    let g = start.svg;
    // The staff.
    const lineEnd = x0 + start.width + barWidth * line.bars;
    for (let k = 0; k < 5; k++) g += `<line x1="${f2(x0)}" x2="${f2(lineEnd)}" y1="${f2(top + k * gap)}" y2="${f2(top + k * gap)}" stroke="#111" stroke-width="0.16"/>`;
    if (line.section) g += `<text x="${f2(x0)}" y="${f2(top - 6.2)}" font-size="3" font-weight="700" fill="#1d4ed8">${esc(ctx.labels(line.section))}</text>`;
    for (let b = 0; b <= line.bars; b++) {
      const bx = x0 + start.width + b * barWidth;
      const final = index === lines.length - 1 && b === line.bars;
      g += `<line x1="${f2(bx)}" x2="${f2(bx)}" y1="${f2(top)}" y2="${f2(top + 4 * gap)}" stroke="#111" stroke-width="${final ? 0.6 : 0.2}"/>`;
      if (final) g += `<line x1="${f2(bx - 0.8)}" x2="${f2(bx - 0.8)}" y1="${f2(top)}" y2="${f2(top + 4 * gap)}" stroke="#111" stroke-width="0.18"/>`;
    }
    const barStart = line.startBar * per;
    const barEnd = barStart + line.bars * per;
    const xAt = (beat) => x0 + start.width + ((beat - barStart) / per) * barWidth + barWidth * 0.08;
    // Chords above: at their bars, repeated chords shown once.
    let lastSymbol = null;
    for (const c of timeline) {
      if (c.start < barStart - 1e-6 || c.start >= barEnd - 1e-6) continue;
      const symbol = c.symbol ?? 'N.C.';
      if (symbol === lastSymbol && Math.abs((c.start - barStart) % per) > 1e-6) continue;
      lastSymbol = symbol;
      g += `<text x="${f2(xAt(c.start) - barWidth * 0.04)}" y="${f2(top - 2)}" font-size="3.1" font-weight="700" fill="#111">${esc(symbol)}</text>`;
    }
    const lyricY = top + gap * 4 + 6.4;
    for (const n of notes) if (n.t >= barStart - 1e-6 && n.t < barEnd - 1e-6) g += noteSvg(n, xAt(n.t) + barWidth * 0.03, top, gap, song.key, lyricY);
    body += `<g class="sheet-line" data-bar="${line.startBar}">${g}</g>`;
    y += lineHeight;
  });
  pages.push(body);
  void songBeats; void beatsPerBar;
  return pages;
}

/** The whole sheet as one SVG (the Lead sheet view): pages one under another, `scale` px per mm. */
export function leadSheetSvg(song, { scale = 3.2, ctx, width = 210, height = 297 }) {
  const pages = leadSheetPages(song, { width, height, ctx });
  const gapMm = 8;
  const total = pages.length * height + (pages.length - 1) * gapMm;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * scale)}" height="${Math.round(total * scale)}" viewBox="0 0 ${width} ${f2(total)}" font-family="'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR','Segoe UI',sans-serif">`;
  pages.forEach((body, i) => {
    const oy = i * (height + gapMm);
    out += `<g transform="translate(0 ${f2(oy)})"><rect width="${width}" height="${height}" fill="#ffffff" stroke="#c9ced6" stroke-width="0.3"/>${body}<text x="${width / 2}" y="${height - 6}" font-size="2.6" text-anchor="middle" fill="#888">${i + 1} / ${pages.length}</text></g>`;
  });
  return `${out}</svg>`;
}

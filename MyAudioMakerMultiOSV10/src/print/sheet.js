// The printed sheets as SVG strings (pure: the print window previews and prints them, tests read them).
// Every sheet has a border and, when chosen, a title block (song, page, key and tempo, date, n / total).
import { sheetGeometry, normalizePrintSetup, printablePages, pageChosen } from './layout.js';
import { leadSheetPages } from '../music/notation.js';
import { barBeats, chordLineText, sectionSpans, songStats, trackName } from '../music/song.js';
import { keyName, timeLabel } from '../music/theory.js';
import { instrument } from '../music/instruments.js';
import { SECTION_COLORS } from '../music/genres.js';

export const MM_PX = 96 / 25.4;
export const SHEET_FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI', sans-serif";
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n2 = (v) => Number(v).toFixed(2);

/** Approximate width (mm) of text at font size `size` (mm): wide for Hangul and CJK. */
export function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text ?? '')) w += /[ᄀ-ᇿ　-鿿가-힣＀-￯]/.test(ch) ? 0.95 : /[mwMW@]/.test(ch) ? 0.8 : /[il.,:;'|!]/.test(ch) ? 0.28 : 0.55;
  return w * size;
}

export function fitText(text, size, maxMm) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (textWidth(s, size) <= maxMm) return s;
  const chars = [...s];
  let out = '';
  for (const ch of chars) { if (textWidth(`${out}${ch}…`, size) > maxMm) break; out += ch; }
  return `${out}…`;
}

/** Wraps text into lines no wider than `maxMm`. */
function wrap(text, size, maxMm) {
  const words = String(text ?? '').split(/(\s+)/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (textWidth(line + w, size) > maxMm && line.trim()) { lines.push(line.trim()); line = w.trimStart(); } else line += w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.length ? lines : [''];
}

export const pageTitle = (type, t) => t(`print.page.${type}`);

// ───────────────────────── page bodies (each returns a list of page bodies)

function lyricsPages(song, geo, ctx, setup) {
  const { area } = geo;
  const k = setup.fontScale / 100;
  const cols = setup.lyricColumns;
  const gap = 8;
  const colW = (area.w - gap * (cols - 1)) / cols;
  const size = 3.6 * k;
  const head = 3.4 * k;
  const lineH = size * 1.55;
  const blocks = song.sections.filter((s) => s.lyrics.length).map((s) => ({ title: ctx.labels(s), color: SECTION_COLORS[s.type], lines: s.lyrics.flatMap((l) => wrap(l, size, colW - 2)) }));
  const pages = [];
  let body = `<text x="${n2(area.x)}" y="${n2(area.y + 7)}" font-size="${n2(6.5 * k)}" font-weight="700" fill="#111">${esc(song.title || ctx.t('song.untitled'))}</text>`;
  if (song.artist) body += `<text x="${n2(area.x + area.w)}" y="${n2(area.y + 7)}" font-size="${n2(3.4 * k)}" text-anchor="end" fill="#444">${esc(song.artist)}</text>`;
  const top0 = area.y + 15;
  let col = 0;
  let y = top0;
  const newPage = () => { pages.push(body); body = ''; col = 0; y = area.y + 4; };
  for (const b of blocks) {
    const need = head * 1.8 + b.lines.length * lineH + 3;
    if (y + Math.min(need, head * 1.8 + lineH * 2) > area.y + area.h) { col += 1; y = col ? (pages.length ? area.y + 4 : top0) : top0; if (col >= cols) newPage(); }
    const x = area.x + col * (colW + gap);
    body += `<rect x="${n2(x)}" y="${n2(y)}" width="1.2" height="${n2(head * 1.2)}" fill="${b.color}"/><text x="${n2(x + 2.4)}" y="${n2(y + head)}" font-size="${n2(head)}" font-weight="700" fill="${b.color}">${esc(b.title)}</text>`;
    y += head * 1.8;
    for (const line of b.lines) {
      if (y + lineH > area.y + area.h) { col += 1; y = pages.length ? area.y + 4 : top0; if (col >= cols) newPage(); }
      body += `<text x="${n2(area.x + col * (colW + gap) + 2.4)}" y="${n2(y + size)}" font-size="${n2(size)}" fill="#111">${esc(line)}</text>`;
      y += lineH;
    }
    y += 3;
  }
  if (!blocks.length) body += `<text x="${n2(area.x)}" y="${n2(top0 + 6)}" font-size="4" fill="#888">${esc(ctx.t('print.noLyrics'))}</text>`;
  pages.push(body);
  return pages;
}

function chordPages(song, geo, ctx, setup) {
  const { area } = geo;
  const k = setup.fontScale / 100;
  const per = barBeats(song);
  const cellW = (area.w - 30) / 4;
  const cellH = 9 * k;
  const pages = [];
  let body = `<text x="${n2(area.x)}" y="${n2(area.y + 7)}" font-size="${n2(6.5 * k)}" font-weight="700" fill="#111">${esc(song.title || ctx.t('song.untitled'))}</text>
    <text x="${n2(area.x)}" y="${n2(area.y + 13)}" font-size="${n2(3.3 * k)}" fill="#444">${esc(`${ctx.t('song.key')}: ${keyName(song.key)} · ♩ = ${song.bpm} · ${song.timeSignature.join('/')}`)}</text>`;
  let y = area.y + 19;
  for (const section of song.sections) {
    const rows = Math.ceil(section.bars / 4);
    if (y + rows * cellH + 6 > area.y + area.h) { pages.push(body); body = ''; y = area.y + 2; }
    body += `<rect x="${n2(area.x)}" y="${n2(y)}" width="26" height="${n2(cellH * rows)}" rx="1.4" fill="${SECTION_COLORS[section.type]}" fill-opacity="0.16" stroke="${SECTION_COLORS[section.type]}" stroke-width="0.3"/>
      <text x="${n2(area.x + 2)}" y="${n2(y + cellH * 0.62)}" font-size="${n2(3 * k)}" font-weight="700" fill="#111">${esc(fitText(ctx.labels(section), 3 * k, 22))}</text>`;
    for (let b = 0; b < section.bars; b++) {
      const r = Math.floor(b / 4);
      const c = b % 4;
      const x = area.x + 30 + c * cellW;
      const yy = y + r * cellH;
      body += `<rect x="${n2(x)}" y="${n2(yy)}" width="${n2(cellW)}" height="${n2(cellH)}" fill="none" stroke="#333" stroke-width="0.25"/>`;
      const chords = section.chords.filter((ch) => ch.at >= b * per - 1e-6 && ch.at < (b + 1) * per - 1e-6).map((ch) => ch.symbol ?? 'N.C.');
      body += `<text x="${n2(x + 2)}" y="${n2(yy + cellH * 0.66)}" font-size="${n2(4 * k)}" font-weight="700" fill="#111">${esc(fitText(chords.join('  '), 4 * k, cellW - 3) || '%')}</text>`;
    }
    y += rows * cellH + 4;
  }
  pages.push(body);
  return pages;
}

function arrangementPages(song, geo, ctx, setup) {
  const { area } = geo;
  const k = setup.fontScale / 100;
  const t = ctx.t;
  let body = `<text x="${n2(area.x)}" y="${n2(area.y + 7)}" font-size="${n2(6 * k)}" font-weight="700" fill="#111">${esc(t('print.page.arrangement'))}</text>`;
  // A timeline: one row per track, sections as columns of their length.
  const spans = sectionSpans(song);
  const total = spans.length ? spans[spans.length - 1].end : 1;
  const left = area.x + 34;
  const width = area.w - 34;
  let y = area.y + 14;
  for (const { section, start, end } of spans) {
    const x = left + (start / total) * width;
    const w = ((end - start) / total) * width;
    body += `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w - 0.4)}" height="7" rx="1" fill="${SECTION_COLORS[section.type]}"/><text x="${n2(x + 1)}" y="${n2(y + 4.8)}" font-size="2.4" fill="#fff" font-weight="700">${esc(fitText(ctx.labels(section), 2.4, w - 2))}</text>`;
  }
  y += 10;
  for (const track of song.tracks) {
    body += `<text x="${n2(area.x)}" y="${n2(y + 4)}" font-size="2.8" fill="#111">${esc(fitText(trackName(track, ctx.language), 2.8, 32))}</text>`;
    body += `<rect x="${n2(left)}" y="${n2(y)}" width="${n2(width)}" height="6" fill="#f2f4f7"/>`;
    for (const { start, end } of spans) if (track.notes.some((x) => x.t >= start && x.t < end)) body += `<rect x="${n2(left + (start / total) * width)}" y="${n2(y + 0.6)}" width="${n2(((end - start) / total) * width - 0.4)}" height="4.8" rx="0.8" fill="${track.color}" fill-opacity="0.7"/>`;
    y += 7.4;
  }
  // The sections table.
  y += 6;
  const cols = [[t('print.col.section'), 0], [t('print.col.start'), 40], [t('print.col.bars'), 58], [t('print.col.chords'), 72]];
  for (const [label, x] of cols) body += `<text x="${n2(area.x + x)}" y="${n2(y)}" font-size="2.7" fill="#666">${esc(label)}</text>`;
  body += `<line x1="${n2(area.x)}" x2="${n2(area.x + area.w)}" y1="${n2(y + 1.5)}" y2="${n2(y + 1.5)}" stroke="#222" stroke-width="0.25"/>`;
  y += 6;
  spans.forEach(({ section, start }, i) => {
    if (y > area.y + area.h - 4) return;
    if (i % 2 === 0) body += `<rect x="${n2(area.x)}" y="${n2(y - 3.8)}" width="${n2(area.w)}" height="5.4" fill="#f4f6f9"/>`;
    body += `<text x="${n2(area.x + 1)}" y="${n2(y)}" font-size="3" fill="#111">${esc(fitText(ctx.labels(section), 3, 38))}</text><text x="${n2(area.x + 40)}" y="${n2(y)}" font-size="3" fill="#111">${esc(timeLabel((start * 60) / song.bpm))}</text><text x="${n2(area.x + 58)}" y="${n2(y)}" font-size="3" fill="#111">${section.bars}</text><text x="${n2(area.x + 72)}" y="${n2(y)}" font-size="3" fill="#111">${esc(fitText(chordLineText(song, section), 3, area.w - 74))}</text>`;
    y += 5.4;
  });
  return [body];
}

function summaryPages(song, geo, ctx) {
  const { area } = geo;
  const t = ctx.t;
  const st = songStats(song);
  const facts = [
    [t('song.key'), keyName(song.key)], [t('song.bpm'), String(song.bpm)], [t('song.timeSignature'), song.timeSignature.join('/')],
    [t('compose.genre'), t(`genre.${song.genre}`)], [t('compose.mood'), t(`mood.${song.mood}`)], [t('print.length'), timeLabel(st.seconds)],
    [t('print.bars'), String(st.bars)], [t('outline.sections'), String(st.sections)], [t('outline.tracks'), String(st.tracks)],
  ];
  let body = `<text x="${n2(area.x)}" y="${n2(area.y + 8)}" font-size="7" font-weight="700" fill="#111">${esc(song.title || t('song.untitled'))}</text>`;
  facts.forEach(([label, value], i) => {
    const x = area.x + (area.w / 3) * (i % 3);
    const y = area.y + 20 + Math.floor(i / 3) * 11;
    body += `<text x="${n2(x)}" y="${n2(y)}" font-size="2.7" fill="#666">${esc(label)}</text><text x="${n2(x)}" y="${n2(y + 5)}" font-size="4.2" font-weight="600" fill="#111">${esc(value)}</text>`;
  });
  let y = area.y + 58;
  body += `<text x="${n2(area.x)}" y="${n2(y)}" font-size="4" font-weight="700" fill="#111">${esc(t('outline.tracks'))}</text>`;
  y += 6;
  for (const track of song.tracks) {
    const inst = instrument(track.instrument);
    body += `<rect x="${n2(area.x)}" y="${n2(y - 3)}" width="3" height="3" fill="${track.color}"/><text x="${n2(area.x + 5)}" y="${n2(y)}" font-size="3.2" fill="#111">${esc(`${trackName(track, ctx.language)} — ${t(`role.${track.role}`)} · ${ctx.language === 'en' ? inst.en : inst.ko} · ${track.notes.length}`)}</text>`;
    y += 5.6;
  }
  return [body];
}

function titleBlock(block, cells) {
  const total = cells.reduce((s, c) => s + c.weight, 0);
  let x = block.x;
  let out = `<rect x="${n2(block.x)}" y="${n2(block.y)}" width="${n2(block.w)}" height="${n2(block.h)}" fill="#fff" stroke="#222" stroke-width="0.35"/>`;
  cells.forEach((cell, i) => {
    const w = (block.w * cell.weight) / total;
    if (i) out += `<line x1="${n2(x)}" y1="${n2(block.y)}" x2="${n2(x)}" y2="${n2(block.y + block.h)}" stroke="#222" stroke-width="0.25"/>`;
    const size = cell.big ? 4.4 : 3.2;
    out += `<text x="${n2(x + 2)}" y="${n2(block.y + 3.6)}" font-size="2.1" fill="#666">${esc(cell.label)}</text><text x="${n2(x + 2)}" y="${n2(block.y + 10)}" font-size="${size}" font-weight="${cell.big ? 700 : 500}" fill="#111">${esc(fitText(cell.value, size, w - 4))}</text>`;
    x += w;
  });
  return out;
}

/**
 * Every sheet to print: [{ type, svg }] — `info` = { song, labels: { [sectionId]: name }, language, date }.
 */
export function buildSheets(info, setupRaw, picked = {}, t) {
  const setup = normalizePrintSetup(setupRaw);
  const geo = sheetGeometry(setup);
  const song = info.song;
  const ctx = { t, labels: (s) => info.labels?.[s.id] ?? s.type, language: info.language, subtitle: '' };
  const bodies = [];
  for (const page of printablePages()) {
    if (!pageChosen(page, setup, picked)) continue;
    let list = [];
    if (page.type === 'leadsheet') {
      const blockH = geo.block ? geo.block.h + 2 : 0;
      list = leadSheetPages(song, { width: geo.width, height: geo.height - blockH, margin: geo.area.x + 1, ctx });
    } else if (page.type === 'lyrics') list = lyricsPages(song, geo, ctx, setup);
    else if (page.type === 'chords') list = chordPages(song, geo, ctx, setup);
    else if (page.type === 'arrangement') list = arrangementPages(song, geo, ctx, setup);
    else list = summaryPages(song, geo, ctx);
    for (const body of list) bodies.push({ type: page.type, body });
  }
  const total = bodies.length;
  return bodies.map(({ type, body }, index) => {
    const { width, height, frame, block } = geo;
    const border = setup.titleBlock ? `<rect x="${n2(frame.x)}" y="${n2(frame.y)}" width="${n2(frame.w)}" height="${n2(frame.h)}" fill="none" stroke="#222" stroke-width="0.45"/>` : '';
    const tb = block ? titleBlock(block, [
      { label: t('print.tb.song'), value: setup.titleText || song.title || t('song.untitled'), weight: 34, big: true },
      { label: t('print.tb.page'), value: pageTitle(type, t), weight: 22 },
      { label: t('print.tb.key'), value: `${keyName(song.key, { short: true })} · ${song.bpm} BPM`, weight: 16 },
      { label: t('print.tb.author'), value: setup.author || song.artist || '—', weight: 16 },
      { label: t('print.tb.date'), value: info.date ?? '', weight: 12 },
      { label: t('print.tb.sheet'), value: `${index + 1} / ${total}`, weight: 10 },
    ]) : '';
    return { type, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * MM_PX)}" height="${Math.round(height * MM_PX)}" viewBox="0 0 ${n2(width)} ${n2(height)}" font-family="${esc(SHEET_FONT)}"><rect width="${n2(width)}" height="${n2(height)}" fill="#ffffff"/>${body}${border}${tb}</svg>` };
  });
}

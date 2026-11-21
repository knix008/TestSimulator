// The sing-along strip: while the song plays, the lyric line being sung floats over the view — its
// melody as small bars (higher notes higher, longer notes wider) with each syllable under its note,
// syllables already sung in the accent colour, the one being sung larger, and the next line below.
// Lines follow the sections' lyric lines (the same split the Lyrics view counts with).
import { escapeHtml } from './dom.js';
import { sectionSpans } from '../music/song.js';

const EPS = 1e-6;

/** The sung lines of a song: [{ start, end, section, text, notes: [{ t, d, p, syl }] }] in time order. */
export function singLines(song) {
  const vocal = song?.tracks.find((t) => t.role === 'vocal' && t.notes.some((n) => n.syl));
  if (!vocal) return [];
  const sung = vocal.notes.filter((n) => n.syl).sort((a, b) => a.t - b.t);
  const out = [];
  for (const { section, start, end } of sectionSpans(song)) {
    const inSection = sung.filter((n) => n.t >= start - EPS && n.t < end - EPS);
    if (!inSection.length) continue;
    const count = Math.max(1, section.lyrics.length);
    const L = (end - start) / count;
    for (let i = 0; i < count; i++) {
      const a = start + i * L - 0.5;
      const b = a + L;
      const notes = inSection.filter((n) => n.t >= a && n.t < b);
      if (!notes.length) continue;
      const last = notes[notes.length - 1];
      out.push({ start: notes[0].t, end: last.t + last.d, section, text: section.lyrics[i] ?? notes.map((n) => n.syl).join(''), notes });
    }
  }
  return out;
}

/** The line to show at a beat: the one being sung, else the next one (shown a little early). */
export function lineAt(lines, beat) {
  const i = lines.findIndex((l) => beat < l.end + 0.25);
  return i < 0 ? -1 : i;
}

export class Karaoke {
  constructor(host, api) {
    this.api = api;
    this.el = document.createElement('div');
    this.el.className = 'karaoke';
    this.el.hidden = true;
    this.el.setAttribute('aria-live', 'polite');
    host.appendChild(this.el);
    this.lines = [];
    this.song = null;
    this.shown = -2;
  }

  /** A new or changed song: the lines are worked out again. */
  setSong(song) {
    this.song = song;
    this.lines = singLines(song);
    this.shown = -2;
  }

  hide() { this.el.hidden = true; this.shown = -2; }

  /** Called with the play position on every frame while playing. */
  update(beat, playing) {
    const s = this.api.settings();
    if (!playing || s.karaoke === false || !this.lines.length) { if (!this.el.hidden) this.hide(); return; }
    const i = lineAt(this.lines, beat);
    if (i < 0) { this.hide(); return; }
    if (i !== this.shown) this.draw(i);
    this.el.hidden = false;
    const line = this.lines[i];
    this.syllables.forEach((el, k) => {
      const n = line.notes[k];
      el.classList.toggle('sung', beat >= n.t + n.d - EPS);
      el.classList.toggle('now', beat >= n.t - EPS && beat < n.t + n.d - EPS);
    });
    this.bars.forEach((el, k) => {
      const n = line.notes[k];
      el.classList.toggle('sung', beat >= n.t - EPS);
      el.classList.toggle('now', beat >= n.t - EPS && beat < n.t + n.d - EPS);
    });
    const progress = Math.max(0, Math.min(1, (beat - line.start) / Math.max(0.25, line.end - line.start)));
    this.el.style.setProperty('--progress', progress.toFixed(3));
  }

  draw(i) {
    this.shown = i;
    const line = this.lines[i];
    const next = this.lines[i + 1];
    const t = this.api.t;
    let lo = 127; let hi = 0;
    for (const n of line.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
    const range = Math.max(5, hi - lo);
    // Each syllable gets a column as wide as its note (but never narrower than the text needs).
    const cols = line.notes.map((n) => `minmax(max-content, ${Math.max(0.25, n.d).toFixed(2)}fr)`).join(' ');
    const bars = line.notes.map((n) => `<i class="kb" style="--y:${(-((n.p - lo) / range) * 26).toFixed(1)}px"></i>`).join('');
    const syls = line.notes.map((n) => `<span class="ks">${escapeHtml(n.syl)}</span>`).join('');
    this.el.innerHTML = `<div class="karaoke-head"><b>${escapeHtml(this.api.sectionName(line.section))}</b><span class="karaoke-progress"><i></i></span></div>
      <div class="karaoke-grid" style="grid-template-columns:${cols}"><div class="karaoke-bars">${bars}</div>${syls}</div>
      ${next ? `<div class="karaoke-next"><span>${escapeHtml(t('karaoke.next'))}</span>${escapeHtml(next.text)}</div>` : ''}`;
    // The bars sit in the same columns as their syllables.
    const grid = this.el.querySelector('.karaoke-grid');
    const barRow = this.el.querySelector('.karaoke-bars');
    barRow.style.gridColumn = `1 / ${line.notes.length + 1}`;
    barRow.style.gridTemplateColumns = 'subgrid';
    void grid;
    this.syllables = [...this.el.querySelectorAll('.ks')];
    this.bars = [...this.el.querySelectorAll('.kb')];
  }
}

// The piano roll: one track's notes on a grid of pitch × time. A keyboard on the left (click to hear a
// key; drum tracks show their drums by name), a ruler with sections and chords on top, a velocity lane
// below. Tools: Select (click, Shift+click, drag a box; drag notes to move, their right edge to resize,
// Alt+drag to copy), Draw (click to add a note of the last length, drag to set it), Erase (click or
// drag across). Notes snap to the grid; the key's scale and the sounding chord's tones are tinted.
// Vocal notes show their syllables. Other tracks can show faintly behind (ghost notes).
import { alpha, fitCanvas, fitText, mixColor, themeColors, zoomStep } from './canvasview.js';
import { barBeats, chordTimeline, sectionSpans, songBeats } from '../music/song.js';
import { DRUM_LANES, drumName, instrument } from '../music/instruments.js';
import { chordPcs, mod12, noteName, scalePcs } from '../music/theory.js';
import { SECTION_COLORS } from '../music/genres.js';

const KEYS = 64;
const TOP = 40;
const VEL = 64;
const LOW = 21;
const HIGH = 108;
const EDGE = 6;
export const SNAPS = [1, 0.5, 0.25, 0.125, 1 / 3, 1 / 6, 0];

export class PianoRoll {
  constructor(host, api) {
    this.host = host;
    this.api = api;
    this.zoom = 48;
    this.row = 14;
    this.playhead = 0;
    this.selection = new Set();
    this.lastLength = 1;
    this.hover = null;
    host.innerHTML = `<div class="roll">
      <div class="roll-corner"></div>
      <div class="roll-top"><canvas></canvas></div>
      <div class="roll-keys"><canvas></canvas></div>
      <div class="roll-body" tabindex="0"><div class="roll-spacer"></div><canvas class="roll-canvas"></canvas><canvas class="roll-overlay"></canvas></div>
      <div class="roll-vel-label"></div>
      <div class="roll-vel"><canvas></canvas></div>
    </div>`;
    this.corner = host.querySelector('.roll-corner');
    this.topCanvas = host.querySelector('.roll-top canvas');
    this.keysEl = host.querySelector('.roll-keys');
    this.keysCanvas = this.keysEl.querySelector('canvas');
    this.body = host.querySelector('.roll-body');
    this.spacer = host.querySelector('.roll-spacer');
    this.canvas = host.querySelector('.roll-canvas');
    this.overlay = host.querySelector('.roll-overlay');
    this.velEl = host.querySelector('.roll-vel');
    this.velCanvas = this.velEl.querySelector('canvas');
    this.body.addEventListener('scroll', () => this.draw());
    this.body.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX); }
      else if (e.shiftKey) { e.preventDefault(); this.body.scrollLeft += e.deltaY; }
      else if (e.altKey) { e.preventDefault(); this.row = Math.max(8, Math.min(28, this.row + (e.deltaY < 0 ? 2 : -2))); this.draw(); }
    }, { passive: false });
    this.keysEl.addEventListener('wheel', (e) => { this.body.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
    this.bindBody();
    this.bindKeys();
    this.bindTop();
    this.bindVelocity();
    new ResizeObserver(() => this.draw()).observe(this.body);
  }

  get song() { return this.api.song(); }
  get track() { return this.api.track(); }
  get drums() { return Boolean(this.track && instrument(this.track.instrument).drums); }
  get rows() { return this.drums ? DRUM_LANES.length : HIGH - LOW + 1; }
  get snap() { return this.api.settings().rollSnap ?? 0.25; }
  /** Row index (0 = top) of a pitch; −1 when the drum is not one of the lanes. */
  rowOf(p) { return this.drums ? DRUM_LANES.indexOf(p) : HIGH - p; }
  pitchOf(row) { return this.drums ? DRUM_LANES[Math.max(0, Math.min(DRUM_LANES.length - 1, row))] : HIGH - row; }
  x(beat) { return beat * this.zoom; }

  snapBeat(beat, mode = 'round') {
    const s = this.snap;
    if (!s) return Math.max(0, Math.round(beat * 96) / 96);
    const f = mode === 'floor' ? Math.floor : Math.round;
    return Math.max(0, f(beat / s + 1e-9) * s);
  }

  point(e) {
    const r = this.body.getBoundingClientRect();
    const x = e.clientX - r.left + this.body.scrollLeft;
    const y = e.clientY - r.top + this.body.scrollTop;
    return { x, y, beat: x / this.zoom, row: Math.floor(y / this.row) };
  }

  zoomAt(dir, clientX = null) {
    const r = this.body.getBoundingClientRect();
    const anchor = clientX == null ? r.width / 2 : clientX - r.left;
    const beat = (anchor + this.body.scrollLeft) / this.zoom;
    this.zoom = zoomStep(this.zoom, dir);
    this.draw();
    this.body.scrollLeft = beat * this.zoom - anchor;
  }

  fit() {
    const track = this.track;
    if (!track) return;
    const notes = track.notes;
    const total = songBeats(this.song);
    const from = notes.length ? notes[0].t : 0;
    const to = notes.length ? Math.max(...notes.map((n) => n.t + n.d)) : total;
    this.zoom = Math.max(4, Math.min(200, (this.body.clientWidth - 30) / Math.max(4, to - from)));
    this.draw();
    this.body.scrollLeft = this.x(from) - 10;
    this.centerOnNotes();
  }

  /** Scrolls so the track's notes (or middle C) are in view. */
  centerOnNotes() {
    const notes = this.track?.notes ?? [];
    const rows = notes.map((n) => this.rowOf(n.p)).filter((r) => r >= 0);
    const mid = rows.length ? (Math.min(...rows) + Math.max(...rows)) / 2 : this.rowOf(this.drums ? 38 : 64);
    this.body.scrollTop = Math.max(0, mid * this.row - this.body.clientHeight / 2);
  }

  /** Scrolls to a beat (and the notes there). */
  reveal(beat) {
    this.body.scrollLeft = Math.max(0, this.x(beat) - 60);
    const near = this.track?.notes.filter((n) => n.t >= beat && n.t < beat + 16) ?? [];
    if (near.length) {
      const rows = near.map((n) => this.rowOf(n.p)).filter((r) => r >= 0);
      if (rows.length) this.body.scrollTop = Math.max(0, ((Math.min(...rows) + Math.max(...rows)) / 2) * this.row - this.body.clientHeight / 2);
    }
    this.draw();
  }

  render() {
    const t = this.api.t;
    const track = this.track;
    const song = this.song;
    this.corner.innerHTML = track ? `<span class="roll-track" style="--track:${track.color}" title="${t('roll.trackTip')}"><i></i><b>${this.api.escape(this.api.trackLabel(track))}</b></span>` : '';
    this.host.querySelector('.roll-vel-label').textContent = t('roll.velocity');
    this.host.classList.toggle('roll-empty', !track || !song);
    this.draw();
  }

  /** The notes inside the view (indices stay valid while drawing). */
  draw() {
    const song = this.song;
    const track = this.track;
    const colors = themeColors(this.host);
    this.colors = colors;
    if (!song || !track) return;
    // Selected notes that are no longer in the track (undo, regenerate) drop out.
    for (const n of this.selection) if (!track.notes.includes(n)) this.selection.delete(n);
    const total = songBeats(song);
    const width = this.x(total) + 400;
    const height = this.rows * this.row;
    this.spacer.style.width = `${width}px`;
    this.spacer.style.height = `${height}px`;
    const vw = this.body.clientWidth;
    const vh = this.body.clientHeight;
    const sx = this.body.scrollLeft;
    const sy = this.body.scrollTop;
    this.canvas.style.transform = `translate(${sx}px, ${sy}px)`;
    this.overlay.style.transform = `translate(${sx}px, ${sy}px)`;
    const c = fitCanvas(this.canvas, vw, vh);
    const per = barBeats(song);
    const scale = new Set(scalePcs(song.key));
    const timeline = chordTimeline(song);
    // Rows: black keys darker, the key's scale lighter.
    const firstRow = Math.floor(sy / this.row);
    const lastRow = Math.min(this.rows - 1, Math.ceil((sy + vh) / this.row));
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, vw, vh);
    for (let r = firstRow; r <= lastRow; r++) {
      const p = this.pitchOf(r);
      const y = r * this.row - sy;
      const black = !this.drums && [1, 3, 6, 8, 10].includes(mod12(p));
      c.fillStyle = this.drums ? (r % 2 ? alpha(colors.text, 0.03) : 'transparent') : black ? alpha(colors.text, colors.dark ? 0.12 : 0.06) : !scale.has(mod12(p)) ? alpha(colors.text, 0.03) : 'transparent';
      if (c.fillStyle !== 'transparent') c.fillRect(0, y, vw, this.row);
      if (!this.drums && mod12(p) === song.key.tonic) { c.fillStyle = alpha(colors.accent, 0.06); c.fillRect(0, y, vw, this.row); }
      c.fillStyle = alpha(colors.text, mod12(p) === 0 && !this.drums ? 0.14 : 0.05);
      c.fillRect(0, y + this.row - 1, vw, 1);
    }
    // Chord tones of the sounding chord, as soft bands (melodic tracks).
    if (!this.drums && this.api.settings().rollChordTones !== false) {
      for (const ch of timeline) {
        if (!ch.chord) continue;
        const x0 = this.x(ch.start) - sx;
        const x1 = this.x(ch.end) - sx;
        if (x1 < 0 || x0 > vw) continue;
        const pcs = new Set(chordPcs(ch.chord));
        for (let r = firstRow; r <= lastRow; r++) if (pcs.has(mod12(this.pitchOf(r)))) { c.fillStyle = alpha(colors.accent, 0.07); c.fillRect(x0, r * this.row - sy, x1 - x0, this.row); }
      }
    }
    // Grid.
    const step = this.snap || 0.25;
    const minor = this.zoom * step >= 8 ? step : this.zoom >= 16 ? 1 : per;
    const startBeat = Math.floor(sx / this.zoom / minor) * minor;
    for (let b = startBeat; b * this.zoom <= sx + vw; b += minor) {
      const x = Math.round(this.x(b) - sx) + 0.5;
      const bar = Math.abs(b / per - Math.round(b / per)) < 1e-6;
      const beat = Math.abs(b - Math.round(b)) < 1e-6;
      c.fillStyle = alpha(colors.text, bar ? 0.2 : beat ? 0.09 : 0.04);
      c.fillRect(x, 0, 1, vh);
    }
    // Section edges.
    for (const { section, start } of sectionSpans(song)) {
      const x = this.x(start) - sx;
      if (x < -2 || x > vw) continue;
      c.fillStyle = alpha(SECTION_COLORS[section.type] ?? colors.accent, 0.6);
      c.fillRect(x, 0, 2, vh);
    }
    // Ghost notes of the other tracks.
    if (this.api.settings().rollGhosts) {
      for (const other of song.tracks) {
        if (other === track || instrument(other.instrument).drums !== this.drums) continue;
        c.fillStyle = alpha(other.color, 0.18);
        for (const n of other.notes) {
          const r = this.rowOf(n.p);
          const x0 = this.x(n.t) - sx;
          if (r < firstRow - 1 || r > lastRow + 1 || x0 > vw || x0 + this.x(n.d) < 0) continue;
          c.fillRect(x0, r * this.row - sy + 2, Math.max(2, this.x(n.d) - 1), this.row - 4);
        }
      }
    }
    // The track's notes.
    const base = track.color;
    const dark = mixColor(base, '#000000', 0.35);
    c.font = `${Math.max(9, Math.min(12, this.row - 3))}px system-ui, sans-serif`;
    c.textBaseline = 'middle';
    for (const n of track.notes) {
      const r = this.rowOf(n.p);
      if (r < 0 || r < firstRow - 1 || r > lastRow + 1) continue;
      const x0 = this.x(n.t) - sx;
      const w = Math.max(3, this.x(n.d) - 1);
      if (x0 > vw) break;
      if (x0 + w < 0) continue;
      const y = r * this.row - sy + 1;
      const h = this.row - 2;
      const sel = this.selection.has(n);
      c.fillStyle = sel ? mixColor(base, '#ffffff', 0.35) : mixColor(base, colors.bg, 0.15 * (1 - n.v));
      c.fillRect(x0, y, w, h);
      c.strokeStyle = sel ? colors.text : dark;
      c.lineWidth = sel ? 1.6 : 1;
      c.strokeRect(x0 + 0.5, y + 0.5, w - 1, h - 1);
      if (n.syl && w > 10 && this.row >= 10) { c.fillStyle = '#ffffff'; c.fillText(fitText(c, n.syl, w - 4), x0 + 3, y + h / 2 + 0.5); }
    }
    this.drawTop(colors, vw, sx, per, timeline);
    this.drawKeys(colors, vh, sy, firstRow, lastRow);
    this.drawVelocity(colors, vw, sx);
    this.drawOverlay();
  }

  drawTop(colors, vw, sx, per, timeline) {
    const c = fitCanvas(this.topCanvas, vw, TOP);
    c.fillStyle = colors.panel;
    c.fillRect(0, 0, vw, TOP);
    c.font = '11px system-ui, sans-serif';
    c.textBaseline = 'middle';
    const loop = this.song.loop;
    if (loop.end > loop.start) { c.fillStyle = alpha(colors.accent, loop.on ? 0.25 : 0.08); c.fillRect(this.x(loop.start) - sx, 0, this.x(loop.end - loop.start), 16); }
    const barPx = this.x(per);
    const every = barPx < 30 ? 4 : barPx < 60 ? 2 : 1;
    for (let b = Math.floor(sx / barPx); b * barPx <= sx + vw; b++) {
      const x = Math.round(this.x(b * per) - sx) + 0.5;
      c.fillStyle = alpha(colors.text, 0.3);
      c.fillRect(x, 2, 1, 12);
      if (b % every === 0) { c.fillStyle = colors.muted; c.fillText(String(b + 1), x + 4, 9); }
    }
    for (const { section, start, end } of sectionSpans(this.song)) {
      const x0 = this.x(start) - sx;
      if (x0 > vw || this.x(end) - sx < 0) continue;
      c.fillStyle = SECTION_COLORS[section.type] ?? colors.accent;
      c.fillRect(x0, 15, 3, 25);
    }
    c.font = '600 11px system-ui, sans-serif';
    let lastX = -999;
    for (const ch of timeline) {
      if (!ch.symbol) continue;
      const x = this.x(ch.start) - sx + 5;
      if (x > vw || x < lastX + 4 || this.x(ch.end) - sx < 0) continue;
      const label = fitText(c, ch.symbol, Math.max(12, this.x(ch.end - ch.start) - 6));
      c.fillStyle = colors.text;
      c.fillText(label, x, 28);
      lastX = x + c.measureText(label).width;
    }
    c.fillStyle = colors.border;
    c.fillRect(0, TOP - 1, vw, 1);
  }

  drawKeys(colors, vh, sy, firstRow, lastRow) {
    const c = fitCanvas(this.keysCanvas, KEYS, vh);
    c.fillStyle = colors.panel;
    c.fillRect(0, 0, KEYS, vh);
    c.font = `${Math.max(8, Math.min(11, this.row - 3))}px system-ui, sans-serif`;
    c.textBaseline = 'middle';
    for (let r = firstRow; r <= lastRow; r++) {
      const p = this.pitchOf(r);
      const y = r * this.row - sy;
      if (this.drums) {
        c.fillStyle = r % 2 ? colors.surface : colors.panel;
        c.fillRect(0, y, KEYS, this.row);
        c.fillStyle = colors.text;
        c.fillText(fitText(c, drumName(p, this.api.lang()), KEYS - 6), 4, y + this.row / 2);
      } else {
        const black = [1, 3, 6, 8, 10].includes(mod12(p));
        c.fillStyle = black ? (colors.dark ? '#111318' : '#2b2f36') : (colors.dark ? '#d9dce2' : '#ffffff');
        c.fillRect(0, y, black ? KEYS * 0.62 : KEYS, this.row);
        if (black) { c.fillStyle = colors.dark ? '#d9dce2' : '#ffffff'; c.fillRect(KEYS * 0.62, y, KEYS * 0.38, this.row); }
        c.fillStyle = alpha('#000000', 0.15);
        c.fillRect(0, y + this.row - 1, KEYS, 1);
        if (mod12(p) === 0 || this.row >= 16) { c.fillStyle = mod12(p) === 0 ? '#333' : '#777'; c.fillText(noteName(p), KEYS - 30, y + this.row / 2); }
      }
      if (this.pressed === p) { c.fillStyle = alpha(colors.accent, 0.5); c.fillRect(0, y, KEYS, this.row); }
    }
  }

  drawVelocity(colors, vw, sx) {
    const c = fitCanvas(this.velCanvas, vw, VEL);
    c.fillStyle = colors.panel;
    c.fillRect(0, 0, vw, VEL);
    c.fillStyle = colors.hairline;
    c.fillRect(0, 0, vw, 1);
    const track = this.track;
    for (const n of track.notes) {
      const x = this.x(n.t) - sx;
      if (x > vw) break;
      if (x < -4) continue;
      const h = (VEL - 8) * n.v;
      c.fillStyle = this.selection.has(n) ? colors.accent : alpha(track.color, 0.85);
      c.fillRect(x, VEL - 3 - h, Math.max(2, Math.min(6, this.x(n.d) - 1)), h);
      c.fillRect(x - 1, VEL - 4 - h, Math.max(4, Math.min(8, this.x(n.d) + 1)), 2);
    }
  }

  drawOverlay() {
    const vw = this.body.clientWidth;
    const vh = this.body.clientHeight;
    const c = fitCanvas(this.overlay, vw, vh);
    c.clearRect(0, 0, vw, vh);
    const sx = this.body.scrollLeft;
    const sy = this.body.scrollTop;
    const x = Math.round(this.x(this.playhead) - sx) + 0.5;
    if (x >= -2 && x <= vw + 2) { c.fillStyle = this.colors?.danger ?? '#e5484d'; c.fillRect(x - 0.5, 0, 2, vh); }
    if (this.band) {
      const { x0, y0, x1, y1 } = this.band;
      c.fillStyle = alpha(this.colors.accent, 0.12);
      c.strokeStyle = this.colors.accent;
      c.lineWidth = 1;
      c.fillRect(Math.min(x0, x1) - sx, Math.min(y0, y1) - sy, Math.abs(x1 - x0), Math.abs(y1 - y0));
      c.strokeRect(Math.min(x0, x1) - sx + 0.5, Math.min(y0, y1) - sy + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    if (this.hover && !this.drag && this.api.tool() === 'draw') {
      const { beat, row } = this.hover;
      c.fillStyle = alpha(this.track?.color ?? '#888888', 0.35);
      c.fillRect(this.x(beat) - sx, row * this.row - sy + 1, this.x(this.lastLength), this.row - 2);
    }
  }

  setPlayhead(beat, follow = false) {
    this.playhead = beat;
    if (follow) {
      const x = this.x(beat);
      if (x < this.body.scrollLeft || x > this.body.scrollLeft + this.body.clientWidth - 40) { this.body.scrollLeft = Math.max(0, x - this.body.clientWidth * 0.15); return; }
    }
    this.drawOverlay();
  }

  /** The note under a point: { note, edge: 'end' | null }. */
  hit(pt) {
    const track = this.track;
    if (!track) return null;
    for (let i = track.notes.length - 1; i >= 0; i--) {
      const n = track.notes[i];
      if (this.rowOf(n.p) !== pt.row) continue;
      const x0 = this.x(n.t);
      const x1 = this.x(n.t + n.d);
      if (pt.x >= x0 && pt.x <= x1) return { note: n, edge: !this.drums && pt.x >= x1 - EDGE && x1 - x0 > EDGE * 2 ? 'end' : null };
    }
    return null;
  }

  bindBody() {
    const body = this.body;
    body.addEventListener('pointermove', (e) => {
      if (this.drag) return;
      const pt = this.point(e);
      const h = this.hit(pt);
      const tool = this.api.tool();
      body.style.cursor = tool === 'erase' ? 'not-allowed' : h?.edge ? 'ew-resize' : h ? 'move' : tool === 'draw' ? 'crosshair' : 'default';
      this.hover = { beat: this.snapBeat(pt.beat, 'floor'), row: pt.row };
      if (tool === 'draw') this.drawOverlay();
    });
    body.addEventListener('pointerleave', () => { this.hover = null; this.drawOverlay(); });
    body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.track) return;
      body.focus();
      const pt = this.point(e);
      const tool = this.api.tool();
      const h = this.hit(pt);
      if (tool === 'erase') return this.eraseDrag(e, pt);
      if (h) return this.noteDrag(e, pt, h);
      if (tool === 'draw' || e.detail === 2) return this.drawDrag(e, pt);
      return this.bandDrag(e, pt);
    });
    body.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pt = this.point(e);
      const h = this.hit(pt);
      if (h && !this.selection.has(h.note)) { this.selection = new Set([h.note]); this.draw(); }
      this.api.contextMenu(e, 'notes', { beat: pt.beat, pitch: this.pitchOf(pt.row) });
    });
  }

  capture(e, move, end) {
    const target = this.body;
    target.setPointerCapture(e.pointerId);
    const mv = (m) => move(m);
    const up = (u) => { target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); this.drag = null; end(u); };
    target.addEventListener('pointermove', mv);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  /** Moves, resizes or copies (Alt) the selected notes. */
  noteDrag(e, pt, h) {
    const track = this.track;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { if (this.selection.has(h.note)) this.selection.delete(h.note); else this.selection.add(h.note); this.draw(); this.api.selectionChanged(); return; }
    if (!this.selection.has(h.note)) { this.selection = new Set([h.note]); this.api.selectionChanged(); }
    this.preview(h.note.p, h.note.syl);
    const snapshot = this.api.snapshot();
    let notes = [...this.selection];
    if (e.altKey && !h.edge) {
      const copies = notes.map((n) => ({ ...n }));
      track.notes.push(...copies);
      this.selection = new Set(copies);
      const map = new Map(notes.map((n, i) => [n, copies[i]]));
      h = { ...h, note: map.get(h.note) };
      notes = copies;
    }
    const start = notes.map((n) => ({ t: n.t, d: n.d, p: n.p }));
    const anchor = h.note;
    let moved = false;
    this.drag = { kind: h.edge ? 'resize' : 'move' };
    this.capture(e, (m) => {
      const q = this.point(m);
      const dBeat = q.beat - pt.beat;
      if (!moved && Math.abs(q.x - pt.x) < 3 && Math.abs(q.y - pt.y) < 3) return;
      moved = true;
      if (h.edge) {
        const i = notes.indexOf(anchor);
        const end = this.snapBeat(start[i].t + start[i].d + dBeat);
        const k = Math.max(this.snap || 0.0625, end - start[i].t) / start[i].d;
        notes.forEach((n, j) => { n.d = Math.max(this.snap || 0.0625, Math.round(start[j].d * k * 1000) / 1000); });
        this.lastLength = anchor.d;
      } else {
        const i = notes.indexOf(anchor);
        const shift = this.snapBeat(start[i].t + dBeat) - start[i].t;
        const rows = q.row - pt.row;
        notes.forEach((n, j) => {
          n.t = Math.max(0, Math.round((start[j].t + shift) * 1000) / 1000);
          if (this.drums) n.p = this.pitchOf(this.rowOf(start[j].p) + rows);
          else n.p = Math.max(LOW, Math.min(HIGH, start[j].p - rows));
        });
        if (rows && anchor.p !== this.lastPreview) this.preview(anchor.p, anchor.syl);
      }
      this.draw();
    }, () => {
      if (!moved && !e.altKey) { this.api.selectionChanged(); return; }
      track.notes.sort((a, b) => a.t - b.t || a.p - b.p);
      this.api.record(snapshot, h.edge ? 'op.resizeNotes' : e.altKey ? 'op.copyNotes' : 'op.moveNotes');
    });
  }

  /** Draws a new note (drag to set its length). */
  drawDrag(e, pt) {
    const track = this.track;
    const snapshot = this.api.snapshot();
    const t0 = this.snapBeat(pt.beat, 'floor');
    const p = this.pitchOf(pt.row);
    const n = { t: t0, d: this.drums ? Math.max(0.125, this.snap || 0.25) : this.lastLength, p, v: 0.8 };
    if (track.role === 'vocal') n.syl = this.api.nextSyllable?.(t0) ?? 'la';
    track.notes.push(n);
    this.selection = new Set([n]);
    this.preview(p, n.syl);
    this.draw();
    this.drag = { kind: 'draw' };
    this.capture(e, (m) => {
      if (this.drums) return;
      const q = this.point(m);
      const end = this.snapBeat(q.beat);
      n.d = Math.max(this.snap || 0.0625, end - t0);
      this.draw();
    }, () => {
      if (!this.drums) this.lastLength = n.d;
      track.notes.sort((a, b) => a.t - b.t || a.p - b.p);
      this.api.record(snapshot, 'op.addNote');
      this.api.selectionChanged();
    });
  }

  eraseDrag(e, pt) {
    const track = this.track;
    const snapshot = this.api.snapshot();
    let removed = 0;
    const erase = (q) => { const h = this.hit(q); if (h) { track.notes.splice(track.notes.indexOf(h.note), 1); this.selection.delete(h.note); removed++; this.draw(); } };
    erase(pt);
    this.drag = { kind: 'erase' };
    this.capture(e, (m) => erase(this.point(m)), () => { if (removed) this.api.record(snapshot, 'op.deleteNotes'); });
  }

  /** A box around notes selects them (Shift adds). */
  bandDrag(e, pt) {
    const keep = e.shiftKey ? new Set(this.selection) : new Set();
    this.band = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
    this.drag = { kind: 'band' };
    let moved = false;
    this.capture(e, (m) => {
      const q = this.point(m);
      this.band.x1 = q.x; this.band.y1 = q.y;
      moved = true;
      const b0 = Math.min(this.band.x0, this.band.x1) / this.zoom; const b1 = Math.max(this.band.x0, this.band.x1) / this.zoom;
      const r0 = Math.floor(Math.min(this.band.y0, this.band.y1) / this.row); const r1 = Math.floor(Math.max(this.band.y0, this.band.y1) / this.row);
      this.selection = new Set(keep);
      for (const n of this.track.notes) { const r = this.rowOf(n.p); if (r >= r0 && r <= r1 && n.t + n.d > b0 && n.t < b1) this.selection.add(n); }
      this.draw();
    }, () => {
      this.band = null;
      if (!moved) { this.selection = keep; this.api.onSeek?.(this.snapBeat(pt.beat, 'floor'), { quiet: true }); }
      this.draw();
      this.api.selectionChanged();
    });
  }

  preview(p, syllable) {
    this.lastPreview = p;
    if (this.api.settings().previewNotes === false || this.api.playing()) return;
    this.api.preview(this.track.instrument, p, syllable);
  }

  bindKeys() {
    this.keysEl.addEventListener('pointerdown', (e) => {
      const r = this.keysEl.getBoundingClientRect();
      const row = Math.floor((e.clientY - r.top + this.body.scrollTop) / this.row);
      const p = this.pitchOf(row);
      this.pressed = p;
      this.preview(p, 'a');
      this.draw();
      setTimeout(() => { if (this.pressed === p) { this.pressed = null; this.draw(); } }, 250);
    });
  }

  bindTop() {
    const top = this.host.querySelector('.roll-top');
    top.addEventListener('pointerdown', (e) => {
      const r = top.getBoundingClientRect();
      const beat = (e.clientX - r.left + this.body.scrollLeft) / this.zoom;
      this.api.onSeek(this.snapBeat(beat, 'floor'));
    });
  }

  /** Drag in the velocity lane: notes under the pointer (the selection, when it has notes there) take its height. */
  bindVelocity() {
    this.velEl.addEventListener('pointerdown', (e) => {
      if (!this.track) return;
      const snapshot = this.api.snapshot();
      const set = (m) => {
        const r = this.velEl.getBoundingClientRect();
        const beat = (m.clientX - r.left + this.body.scrollLeft) / this.zoom;
        const v = Math.max(0.05, Math.min(1, (VEL - 3 - (m.clientY - r.top)) / (VEL - 8)));
        const pool = this.selection.size ? [...this.selection] : this.track.notes;
        for (const n of pool) if (beat >= n.t - 2 / this.zoom && beat <= n.t + Math.max(n.d, 6 / this.zoom)) n.v = Math.round(v * 100) / 100;
        this.draw();
      };
      set(e);
      this.velEl.setPointerCapture(e.pointerId);
      const up = () => { this.velEl.removeEventListener('pointermove', set); this.velEl.removeEventListener('pointerup', up); this.api.record(snapshot, 'op.velocity'); };
      this.velEl.addEventListener('pointermove', set);
      this.velEl.addEventListener('pointerup', up);
    });
  }

  // ───────────────────────── edits the app calls (menus, keys)

  selectAll() { this.selection = new Set(this.track?.notes ?? []); this.draw(); }
  clearSelection() { this.selection.clear(); this.draw(); }
  selected() { return [...this.selection].filter((n) => this.track?.notes.includes(n)); }
}

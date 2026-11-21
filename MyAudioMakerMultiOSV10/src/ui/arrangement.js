// The arrangement view: the whole song on a timeline. A ruler (bars, the loop region, the sections as
// coloured blocks with their chords) over one lane per track (its notes in miniature). Track headers
// on the left hold the name, instrument, mute / solo and volume. Click the ruler to move the play
// position, drag it to set the loop, click a section to select it, double-click a lane to edit its notes.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { alpha, fitCanvas, fitText, mixColor, roundRect, themeColors, zoomStep } from './canvasview.js';
import { barBeats, sectionSpans, songBeats, trackName, chordTimeline, audible } from '../music/song.js';
import { SECTION_COLORS } from '../music/genres.js';
import { instrument, ROLE_ICONS } from '../music/instruments.js';

const RULER = 62;
const LANE = 58;

export class ArrangementView {
  constructor(host, api) {
    this.host = host;
    this.api = api;
    this.zoom = 14;
    this.playhead = 0;
    host.innerHTML = `<div class="arr">
      <div class="arr-corner"><span class="arr-corner-title">${icon('arrangement')}<span data-t="view.arrangement"></span></span></div>
      <div class="arr-ruler"><canvas></canvas></div>
      <div class="arr-heads"></div>
      <div class="arr-body" tabindex="0"><div class="arr-spacer"></div><canvas class="arr-canvas"></canvas><canvas class="arr-overlay"></canvas></div>
    </div>`;
    this.el = host.querySelector('.arr');
    this.rulerCanvas = host.querySelector('.arr-ruler canvas');
    this.heads = host.querySelector('.arr-heads');
    this.body = host.querySelector('.arr-body');
    this.spacer = host.querySelector('.arr-spacer');
    this.canvas = host.querySelector('.arr-canvas');
    this.overlay = host.querySelector('.arr-overlay');
    this.body.addEventListener('scroll', () => { this.heads.scrollTop = this.body.scrollTop; this.draw(); });
    this.heads.addEventListener('wheel', (e) => { this.body.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
    this.body.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX); }
      else if (e.shiftKey) { e.preventDefault(); this.body.scrollLeft += e.deltaY; }
    }, { passive: false });
    this.bindRuler();
    this.bindBody();
    this.bindHeads();
    new ResizeObserver(() => this.draw()).observe(this.body);
  }

  get song() { return this.api.song(); }
  x(beat) { return beat * this.zoom; }
  beatAt(clientX) { const r = this.body.getBoundingClientRect(); return Math.max(0, (clientX - r.left + this.body.scrollLeft) / this.zoom); }

  zoomAt(dir, clientX = null) {
    const r = this.body.getBoundingClientRect();
    const anchor = clientX == null ? r.width / 2 : clientX - r.left;
    const beat = (anchor + this.body.scrollLeft) / this.zoom;
    this.zoom = zoomStep(this.zoom, dir);
    this.render();
    this.body.scrollLeft = beat * this.zoom - anchor;
    this.api.onZoom?.();
  }

  fit() {
    const song = this.song;
    if (!song) return;
    const width = Math.max(200, this.body.clientWidth - 24);
    this.zoom = Math.max(3, Math.min(200, width / Math.max(4, songBeats(song))));
    this.render();
  }

  /** Track headers and the canvases. */
  render() {
    const song = this.song;
    if (!song) return;
    const t = this.api.t;
    this.host.querySelector('[data-t="view.arrangement"]').textContent = t('view.arrangement');
    const selTrack = this.api.state.track;
    this.heads.innerHTML = song.tracks.map((track) => {
      const inst = instrument(track.instrument);
      return `<div class="arr-head ${selTrack === track.id ? 'selected' : ''} ${audible(song, track) ? '' : 'silent'}" data-track="${escapeHtml(track.id)}" style="--track:${track.color}" title="${escapeHtml(trackName(track, this.api.lang()))}">
        <span class="arr-head-color"></span>
        <span class="arr-head-main">
          <span class="arr-head-name">${icon(ROLE_ICONS[track.role] ?? 'instKeys')}<b>${escapeHtml(trackName(track, this.api.lang()))}</b></span>
          <span class="arr-head-sub">${escapeHtml(t(`role.${track.role}`))} · ${escapeHtml(this.api.lang() === 'en' ? inst.en : inst.ko)}</span>
          <input type="range" class="arr-volume" min="0" max="1.2" step="0.01" value="${track.volume}" data-track-volume="${escapeHtml(track.id)}" title="${escapeHtml(t('track.volume'))}" aria-label="${escapeHtml(t('track.volume'))}" />
        </span>
        <span class="arr-head-buttons">
          <button class="ms-button ${track.mute ? 'on mute' : ''}" data-track-mute="${escapeHtml(track.id)}" title="${escapeHtml(t('track.mute'))}" aria-pressed="${track.mute}">M</button>
          <button class="ms-button ${track.solo ? 'on solo' : ''}" data-track-solo="${escapeHtml(track.id)}" title="${escapeHtml(t('track.solo'))}" aria-pressed="${track.solo}">S</button>
        </span>
      </div>`;
    }).join('') + `<button class="arr-add-track" data-command="addTrack" title="${escapeHtml(this.api.commandTip('addTrack'))}">${icon('trackAdd')}<span>${escapeHtml(t('action.addTrack'))}</span></button>`;
    this.draw();
  }

  draw() {
    const song = this.song;
    if (!song) return;
    const colors = themeColors(this.host);
    this.colors = colors;
    const total = songBeats(song);
    const width = this.x(total) + 200;
    const height = song.tracks.length * LANE + 60;
    this.spacer.style.width = `${width}px`;
    this.spacer.style.height = `${height}px`;
    const vw = this.body.clientWidth;
    const vh = this.body.clientHeight;
    const sx = this.body.scrollLeft;
    const sy = this.body.scrollTop;
    this.canvas.style.transform = `translate(${sx}px, ${sy}px)`;
    this.overlay.style.transform = `translate(${sx}px, ${sy}px)`;
    const c = fitCanvas(this.canvas, vw, vh);
    c.clearRect(0, 0, vw, vh);
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, vw, vh);
    const per = barBeats(song);
    const spans = sectionSpans(song);
    // Section backgrounds, lightly tinted.
    for (const { section, start, end } of spans) {
      const x0 = this.x(start) - sx;
      const x1 = this.x(end) - sx;
      if (x1 < 0 || x0 > vw) continue;
      c.fillStyle = alpha(SECTION_COLORS[section.type] ?? colors.accent, this.api.state.section === section.id ? 0.1 : 0.04);
      c.fillRect(x0, 0, x1 - x0, vh);
    }
    // Lanes and the grid.
    song.tracks.forEach((track, i) => {
      const y = i * LANE - sy;
      if (y > vh || y + LANE < 0) return;
      if (this.api.state.track === track.id) { c.fillStyle = alpha(colors.accent, 0.08); c.fillRect(0, y, vw, LANE); }
      c.fillStyle = colors.hairline;
      c.fillRect(0, y + LANE - 1, vw, 1);
    });
    const firstBar = Math.floor(sx / this.x(per));
    const lastBar = Math.ceil((sx + vw) / this.x(per));
    for (let b = firstBar; b <= lastBar; b++) {
      const x = Math.round(this.x(b * per) - sx) + 0.5;
      c.fillStyle = b % 4 === 0 ? alpha(colors.text, 0.16) : alpha(colors.text, 0.07);
      c.fillRect(x, 0, 1, vh);
      if (this.zoom >= 24) for (let k = 1; k < per; k++) { c.fillStyle = alpha(colors.text, 0.035); c.fillRect(Math.round(this.x(b * per + k) - sx), 0, 1, vh); }
    }
    // The notes, in miniature: each lane maps its own pitch range.
    song.tracks.forEach((track, i) => {
      const y = i * LANE - sy;
      if (y > vh || y + LANE < 0 || !track.notes.length) return;
      let lo = 127; let hi = 0;
      for (const n of track.notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
      const range = Math.max(12, hi - lo + 1);
      const mid = (lo + hi) / 2;
      const top = y + 6;
      const h = LANE - 12;
      const silent = !audible(song, track);
      // Clips: one rounded block per section that has notes.
      for (const { start, end } of spans) {
        const has = track.notes.some((n) => n.t >= start && n.t < end);
        if (!has) continue;
        const x0 = this.x(start) - sx + 1;
        const x1 = this.x(end) - sx - 1;
        if (x1 < 0 || x0 > vw) continue;
        roundRect(c, x0, y + 3, x1 - x0, LANE - 7, 5);
        c.fillStyle = alpha(track.color, silent ? 0.06 : 0.16);
        c.fill();
        c.strokeStyle = alpha(track.color, silent ? 0.2 : 0.5);
        c.lineWidth = 1;
        c.stroke();
      }
      c.fillStyle = silent ? alpha(track.color, 0.35) : mixColor(track.color, colors.dark ? '#ffffff' : '#000000', 0.15);
      for (const n of track.notes) {
        const x0 = this.x(n.t) - sx;
        if (x0 > vw) break;
        const w = Math.max(1.5, this.x(n.d) - 1);
        if (x0 + w < 0) continue;
        const py = top + h / 2 - ((n.p - mid) / range) * h;
        c.fillRect(x0, Math.round(py) - 1, w, 2.5);
      }
    });
    this.drawRuler(colors, vw, sx, per, spans);
    this.drawOverlay();
  }

  drawRuler(colors, vw, sx, per, spans) {
    const song = this.song;
    const c = fitCanvas(this.rulerCanvas, vw, RULER);
    c.fillStyle = colors.panel;
    c.fillRect(0, 0, vw, RULER);
    c.font = '11px system-ui, sans-serif';
    c.textBaseline = 'middle';
    // Loop region.
    const loop = song.loop;
    if (loop.end > loop.start) {
      const x0 = this.x(loop.start) - sx;
      const x1 = this.x(loop.end) - sx;
      c.fillStyle = alpha(colors.accent, loop.on ? 0.28 : 0.1);
      c.fillRect(x0, 0, x1 - x0, 18);
      c.fillStyle = alpha(colors.accent, loop.on ? 0.9 : 0.4);
      c.fillRect(x0, 0, 2, 18); c.fillRect(x1 - 2, 0, 2, 18);
    }
    const barPx = this.x(per);
    const every = barPx < 18 ? 8 : barPx < 34 ? 4 : barPx < 60 ? 2 : 1;
    const firstBar = Math.floor(sx / barPx);
    const lastBar = Math.ceil((sx + vw) / barPx);
    for (let b = firstBar; b <= lastBar; b++) {
      const x = Math.round(this.x(b * per) - sx) + 0.5;
      c.fillStyle = alpha(colors.text, 0.25);
      c.fillRect(x, b % every === 0 ? 4 : 12, 1, b % every === 0 ? 14 : 6);
      if (b % every === 0) { c.fillStyle = colors.muted; c.fillText(String(b + 1), x + 4, 10); }
    }
    // Sections as blocks with their names, and their chords under them.
    const chords = chordTimeline(song);
    for (const { section, start, end } of spans) {
      const x0 = this.x(start) - sx + 1;
      const x1 = this.x(end) - sx - 1;
      if (x1 < 0 || x0 > vw) continue;
      const color = SECTION_COLORS[section.type] ?? colors.accent;
      const selected = this.api.state.section === section.id;
      roundRect(c, x0, 20, x1 - x0, 20, 5);
      c.fillStyle = selected ? color : alpha(color, 0.75);
      c.fill();
      if (selected) { c.strokeStyle = colors.text; c.lineWidth = 1.5; c.stroke(); }
      c.fillStyle = '#ffffff';
      c.font = '600 11.5px system-ui, sans-serif';
      c.fillText(fitText(c, this.api.sectionName(section), x1 - x0 - 10), x0 + 6, 30.5);
      c.font = '10.5px system-ui, sans-serif';
      c.fillStyle = colors.muted;
      let lastX = -999;
      for (const ch of chords) {
        if (ch.section !== section.id || !ch.symbol) continue;
        const cx = this.x(ch.start) - sx + 3;
        if (cx < lastX + 6 || cx > x1) continue;
        const label = fitText(c, ch.symbol, Math.max(10, this.x(ch.end - ch.start) - 4));
        if (!label) continue;
        c.fillText(label, cx, 51);
        lastX = cx + c.measureText(label).width;
      }
    }
    c.fillStyle = colors.border;
    c.fillRect(0, RULER - 1, vw, 1);
  }

  /** The play-head (cheap: its own canvas, redrawn every frame while playing). */
  drawOverlay() {
    const vw = this.body.clientWidth;
    const vh = this.body.clientHeight;
    const c = fitCanvas(this.overlay, vw, vh);
    c.clearRect(0, 0, vw, vh);
    const x = Math.round(this.x(this.playhead) - this.body.scrollLeft) + 0.5;
    if (x < -2 || x > vw + 2) return;
    c.fillStyle = this.colors?.danger ?? '#e5484d';
    c.fillRect(x - 0.5, 0, 2, vh);
  }

  setPlayhead(beat, follow = false) {
    this.playhead = beat;
    if (follow) {
      const x = this.x(beat);
      const left = this.body.scrollLeft;
      const w = this.body.clientWidth;
      if (x < left || x > left + w - 40) { this.body.scrollLeft = Math.max(0, x - w * 0.15); return; }
    }
    this.drawOverlay();
    // The ruler shows the head as a small triangle.
    const c = this.rulerCanvas.getContext('2d');
    void c;
  }

  revealBeat(beat) {
    const x = this.x(beat);
    if (x < this.body.scrollLeft || x > this.body.scrollLeft + this.body.clientWidth - 40) this.body.scrollLeft = Math.max(0, x - 40);
  }

  bindRuler() {
    const ruler = this.host.querySelector('.arr-ruler');
    ruler.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = ruler.getBoundingClientRect();
      const y = e.clientY - r.top;
      const beat = this.beatAt(e.clientX);
      if (y >= 20 && y < 42) {
        const span = sectionSpans(this.song).find((s) => beat >= s.start && beat < s.end);
        if (span) { this.api.onSelectSection(span.section.id, { open: e.detail === 2 }); return; }
      }
      // Drag across the ruler: the loop region (snapped to beats, or bars when zoomed out); a click moves the play position.
      const per = barBeats(this.song);
      const snap = this.zoom < 20 ? per : 1;
      const from = Math.round(beat / snap) * snap;
      let moved = false;
      ruler.setPointerCapture(e.pointerId);
      const move = (m) => {
        const b = Math.round(this.beatAt(m.clientX) / snap) * snap;
        if (Math.abs(b - from) < snap * 0.99 && !moved) return;
        moved = true;
        this.api.onLoopDrag(Math.min(from, b), Math.max(from, b), false);
      };
      const up = (u) => {
        ruler.removeEventListener('pointermove', move);
        ruler.removeEventListener('pointerup', up);
        if (moved) { const b = Math.round(this.beatAt(u.clientX) / snap) * snap; this.api.onLoopDrag(Math.min(from, b), Math.max(from, b), true); }
        else this.api.onSeek(Math.max(0, Math.round(beat * 4) / 4));
      };
      ruler.addEventListener('pointermove', move);
      ruler.addEventListener('pointerup', up);
    });
    ruler.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const beat = this.beatAt(e.clientX);
      const span = sectionSpans(this.song).find((s) => beat >= s.start && beat < s.end);
      if (span) this.api.onSelectSection(span.section.id, {});
      this.api.contextMenu(e, 'section', { id: span?.section.id, beat });
    });
  }

  laneAt(clientY) {
    const r = this.body.getBoundingClientRect();
    const i = Math.floor((clientY - r.top + this.body.scrollTop) / LANE);
    return this.song.tracks[i] ?? null;
  }

  bindBody() {
    this.body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const track = this.laneAt(e.clientY);
      const beat = this.beatAt(e.clientX);
      if (track) this.api.onSelectTrack(track.id, { beat, open: e.detail === 2 });
      else this.api.onSeek(Math.round(beat * 4) / 4);
    });
    this.body.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const track = this.laneAt(e.clientY);
      if (track) { this.api.onSelectTrack(track.id, {}); this.api.contextMenu(e, 'track', { id: track.id, beat: this.beatAt(e.clientX) }); }
      else this.api.contextMenu(e, 'arrangement', { beat: this.beatAt(e.clientX) });
    });
  }

  bindHeads() {
    this.heads.addEventListener('click', (e) => {
      // Handled here only: the redraw below takes the button out of the page before the click bubbles on.
      const mute = e.target.closest('[data-track-mute]');
      if (mute) { e.stopPropagation(); this.api.toggleTrack(mute.dataset.trackMute, 'mute'); return; }
      const solo = e.target.closest('[data-track-solo]');
      if (solo) { e.stopPropagation(); this.api.toggleTrack(solo.dataset.trackSolo, 'solo'); return; }
      const head = e.target.closest('[data-track]');
      if (head && !e.target.closest('input')) this.api.onSelectTrack(head.dataset.track, { open: e.detail === 2 });
    });
    this.heads.addEventListener('input', (e) => {
      const v = e.target.closest('[data-track-volume]');
      if (v) this.api.setTrackVolume(v.dataset.trackVolume, Number(v.value), false);
    });
    this.heads.addEventListener('change', (e) => {
      const v = e.target.closest('[data-track-volume]');
      if (v) this.api.setTrackVolume(v.dataset.trackVolume, Number(v.value), true);
    });
    this.heads.addEventListener('contextmenu', (e) => {
      const head = e.target.closest('[data-track]');
      if (!head) return;
      e.preventDefault();
      e.stopPropagation();
      this.api.onSelectTrack(head.dataset.track, {});
      this.api.contextMenu(e, 'track', { id: head.dataset.track });
    });
  }
}

// The start screen's moving background, about what MyCapture does: app windows
// drift over a pixel grid, a crosshair drags out a selection (marching ants, a
// size label, the outside dimmed), the shutter flashes — or, every other time, a
// recording runs with a blinking REC — and the shot flies into a film strip
// along the bottom. A lens aperture turns in the corner and blinks with the
// shutter. One 2D canvas, 30 frames a second, paused while the window is hidden;
// the colours come from the theme (--bg, --accent, --text, --rec), dark and
// light aware. With reduced motion it draws one still frame.
//
// That is the "studio" scene. The settings (Settings → Start screen) choose a scene
// — studio, region (windows and the selection only), film (three strips of past
// captures) or lens (a large aperture firing) — and whether it moves (animated /
// still / off), how fast, and how strongly it is drawn.
import { START_BG_KINDS, START_BG_MOTIONS, START_BG_SPEED, START_BG_TRANSPARENCY } from './domain/settings.js';
import { drawGeneralScene, GENERAL_SCENES, sceneItems } from './startscenes.js';

const FRAME_MS = 1000 / 30;
export const CYCLE = 7.5; // seconds per capture
export const SHUTTER = { capture: 3.0, record: 5.2 }; // when the shot is taken, in its cycle
const FLY = 1.5; // seconds from the shutter until the shot sits in the strip

function rgbOf(value, fallback) {
  const text = String(value ?? '').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(text);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^#([0-9a-f]{3})$/i.exec(text);
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
  m = /^rgba?\(([^)]+)\)/i.exec(text);
  if (m) return m[1].split(/[,\s/]+/).slice(0, 3).map(Number);
  return fallback;
}

const rgba = (rgb, a) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${Math.max(0, Math.min(1, a))})`;
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const lerp = (a, b, k) => a + (b - a) * k;
const phase = (t, from, to) => (t - from) / (to - from);

export const DEFAULT_OPTIONS = Object.freeze({ kind: 'studio', motion: 'animated', speed: 100, transparency: 0 });

/** The background's options from the app settings (startBgKind, …), with safe fallbacks. */
export function backgroundOptions(settings = {}) {
  const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);
  const number = (value, { min, max }, fallback) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
  return {
    kind: pick(settings.startBgKind ?? settings.kind, START_BG_KINDS, DEFAULT_OPTIONS.kind),
    motion: pick(settings.startBgMotion ?? settings.motion, START_BG_MOTIONS, DEFAULT_OPTIONS.motion),
    speed: number(settings.startBgSpeed ?? settings.speed, START_BG_SPEED, DEFAULT_OPTIONS.speed),
    transparency: number(settings.startBgTransparency ?? settings.transparency, START_BG_TRANSPARENCY, DEFAULT_OPTIONS.transparency),
  };
}

/** Odd cycles record a video, even ones take a still (negative cycles too). */
export const isRecordingCycle = (cycle) => ((cycle % 2) + 2) % 2 === 1;

/** When cycle `n`'s shot reaches the film strip (seconds since the clock's start). */
export const landingTime = (n) => n * CYCLE + (isRecordingCycle(n) ? SHUTTER.record : SHUTTER.capture) + FLY;

/**
 * The film strip's frames at `time`: one per finished capture, newest at `slotX`, moving
 * left. A still lands earlier in its cycle than a recording does; it waits in the slot
 * until the film reaches it, and the pace keeps one frame and a gap between neighbours.
 */
export function stripFrames(time, slotX, frameW, gap) {
  const latest = SHUTTER.record + FLY;
  const pace = (frameW + gap) / (CYCLE - (SHUTTER.record - SHUTTER.capture));
  const frames = [];
  const cycle = Math.floor(time / CYCLE);
  for (let n = 0; n < 60; n += 1) {
    const done = cycle - n;
    if (time < landingTime(done)) continue; // still flying
    const x = slotX - Math.max(0, time - (done * CYCLE + latest)) * pace;
    if (x + frameW < 0) break;
    frames.push({ cycle: done, x, video: isRecordingCycle(done) });
  }
  return frames;
}

function seeded(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function themeColors(root = document.documentElement) {
  const css = getComputedStyle(root);
  const bg = rgbOf(css.getPropertyValue('--bg'), [20, 23, 28]);
  const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
  return {
    bg,
    accent: rgbOf(css.getPropertyValue('--accent'), [76, 141, 255]),
    text: rgbOf(css.getPropertyValue('--text'), [228, 233, 240]),
    rec: rgbOf(css.getPropertyValue('--rec'), [235, 80, 80]),
    dark: lum < 0.5,
  };
}

function roundRect(c, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

export class StartBackground {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ time?: number, reduced?: boolean, settings?: () => object }} options
   *   `time` carries the clock over when the start screen is rebuilt (theme or language
   *   change), so the scene doesn't jump. `settings` is read every frame:
   *   { kind, motion, speed, transparency } (see backgroundOptions).
   */
  constructor(canvas, { time = CYCLE * 8, reduced = false, settings = () => DEFAULT_OPTIONS } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.reduced = reduced;
    this.settings = () => backgroundOptions(settings());
    this.time = reduced ? CYCLE * 0.3 : time;
    this.frames = 0;
    this.running = false;
    this.colors = themeColors();
    const r = seeded(7);
    // Windows drifting in the background: position and size as fractions of the page.
    this.windows = Array.from({ length: 7 }, (_, i) => ({
      x: r(), y: r() * 0.8, w: 0.14 + r() * 0.16, h: 0.12 + r() * 0.14,
      vx: (r() - 0.5) * 0.008, vy: (r() - 0.5) * 0.004, lines: 2 + Math.floor(r() * 4), tone: i % 3,
    }));
    this.loop = this.loop.bind(this);
    this.onVisibility = () => { if (document.hidden) this.running = false; else if (this.wanted) this.start(); };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  /** The theme changed: read its colours again. */
  refresh() {
    this.colors = themeColors();
    if (!this.running) this.draw();
  }

  resize() {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    this.ratio = ratio;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (!this.running) this.draw();
  }

  /** Moves only when the setting says so and the system doesn't ask for reduced motion. */
  get animated() {
    return !this.reduced && this.settings().motion === 'animated';
  }

  start() {
    this.wanted = true;
    if (!this.animated) { this.running = false; this.draw(); return; }
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.wanted = false;
    this.running = false;
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.observer.disconnect();
  }

  /** The settings changed (scene, motion, speed, transparency): follow them. */
  sync() {
    if (this.wanted) this.start();
    else this.draw();
  }

  loop(now) {
    if (!this.running) return;
    if (!this.animated) { this.running = false; this.draw(); return; }
    requestAnimationFrame(this.loop);
    if (now - this.last < FRAME_MS - 4) return;
    this.time += Math.min(0.1, (now - this.last) / 1000) * (this.settings().speed / 100);
    this.last = now;
    this.draw();
  }

  draw() {
    const { context: c, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h || !c) return;
    this.frames += 1;
    const { kind, motion, transparency } = this.settings();
    c.clearRect(0, 0, w, h);
    // Transparency: the whole picture fades toward the gradient behind it.
    const opacity = String(1 - transparency / 100);
    if (canvas.style && canvas.style.opacity !== opacity) canvas.style.opacity = opacity;
    if (motion === 'off') return; // just the gradient behind
    const col = this.colors;
    // Light themes need a little more ink to show the same.
    const k = col.dark ? 1 : 1.35;
    if (GENERAL_SCENES.includes(kind)) {
      // The twenty general scenes (startscenes.js), vivid as on MyUMLMaker's start page.
      if (this.itemsKind !== kind) { this.items = sceneItems(kind); this.itemsKind = kind; }
      const kindBoost = { aurora: 0.75, waves: 0.7, lava: 0.8, gridflow: 0.85 }[kind] ?? 1;
      drawGeneralScene(kind, c, w, h, this.time, col, this.items, { boost: (col.dark ? 2 : 2.5) * kindBoost, size: 1.6 });
      return;
    }
    const S = this.ratio * Math.max(0.75, Math.min(1.4, Math.min(w / this.ratio, h / this.ratio) / 760));

    const cycle = Math.floor(this.time / CYCLE);
    const t = this.time - cycle * CYCLE;
    const recording = isRecordingCycle(cycle);

    this.drawGrid(c, w, h, S, col, k);
    switch (kind) {
      case 'region': {
        // Picking a region: windows and the selection, nothing else.
        this.drawWindows(c, w, h, S, col, k);
        this.drawSelection(c, w, h, S, col, k, cycle, t, recording, { fly: false });
        break;
      }
      case 'film': {
        // Three strips of past captures, each at its own pace.
        const band = 72 * S;
        [[0.16, 1, 0], [0.5, 0.7, 37], [0.84, 1.3, 81]].forEach(([at, pace, offset]) => {
          this.drawFilmStrip(c, w, h, S, col, k * 1.3, null, { top: h * at - band / 2, time: this.time * pace + offset });
        });
        break;
      }
      case 'lens':
        this.drawAperture(c, w, h, S, col, k, t, recording, true);
        break;
      default: {
        this.drawWindows(c, w, h, S, col, k);
        const shot = this.drawSelection(c, w, h, S, col, k, cycle, t, recording);
        this.drawAperture(c, w, h, S, col, k, t, recording);
        this.drawFilmStrip(c, w, h, S, col, k, shot);
      }
    }
  }

  /** A faint grid of pixels, a few of them twinkling. */
  drawGrid(c, w, h, S, col, k) {
    const step = 26 * S;
    const size = Math.max(1, 1.4 * S);
    for (let y = step / 2, row = 0; y < h; y += step, row += 1) {
      for (let x = step / 2, n = 0; x < w; x += step, n += 1) {
        const tw = Math.sin(this.time * 0.9 + row * 1.7 + n * 2.3);
        const a = (0.05 + (tw > 0.93 ? (tw - 0.93) * 3.5 : 0)) * k;
        c.fillStyle = rgba(tw > 0.93 ? col.accent : col.text, a);
        c.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
  }

  /** App windows drifting slowly: title bar, three buttons, a few lines of content. */
  drawWindows(c, w, h, S, col, k) {
    for (const win of this.windows) {
      const ww = win.w * w;
      const wh = win.h * h;
      const span = (v, size, total) => ((v % 1) + 1) % 1 * (total + size) - size;
      const x = span(win.x + win.vx * this.time, ww, w);
      const y = span(win.y + win.vy * this.time, wh, h);
      const tone = win.tone === 0 ? col.accent : col.text;
      roundRect(c, x, y, ww, wh, 8 * S);
      c.fillStyle = rgba(tone, 0.035 * k);
      c.fill();
      c.lineWidth = 1.2 * S;
      c.strokeStyle = rgba(tone, 0.12 * k);
      c.stroke();
      const bar = 16 * S;
      c.save();
      roundRect(c, x, y, ww, wh, 8 * S);
      c.clip();
      c.fillStyle = rgba(tone, 0.07 * k);
      c.fillRect(x, y, ww, bar);
      c.restore();
      for (let i = 0; i < 3; i += 1) {
        c.beginPath();
        c.arc(x + ww - (10 + i * 10) * S, y + bar / 2, 2.6 * S, 0, Math.PI * 2);
        c.fillStyle = rgba(i === 0 ? col.rec : tone, (i === 0 ? 0.18 : 0.12) * k);
        c.fill();
      }
      c.fillStyle = rgba(tone, 0.07 * k);
      for (let i = 0; i < win.lines; i += 1) {
        const lw = (ww - 24 * S) * (0.45 + ((i * 37 + win.lines * 11) % 50) / 100);
        if (y + bar + (14 + i * 13) * S > y + wh - 6 * S) break;
        c.fillRect(x + 12 * S, y + bar + (10 + i * 13) * S, Math.max(0, lw), 5 * S);
      }
    }
  }

  /** This cycle's selection: where it starts and ends (device px). */
  rectFor(cycle, w, h) {
    const r = seeded(cycle + 11);
    const rw = w * (0.2 + r() * 0.16);
    const rh = h * (0.18 + r() * 0.16);
    const x = w * (0.08 + r() * 0.62);
    const y = h * (0.1 + r() * 0.42);
    return { x: Math.min(x, w - rw - 20), y: Math.min(y, h * 0.7 - rh), w: rw, h: rh };
  }

  /**
   * Crosshair → drag → shutter (or recording) → fly to the strip. Returns where the shot
   * is while it flies (for the strip to catch), or null.
   */
  drawSelection(c, w, h, S, col, k, cycle, t, recording, { fly = true } = {}) {
    const rect = this.rectFor(cycle, w, h);
    const prev = this.rectFor(cycle - 1, w, h);
    const tone = recording ? col.rec : col.accent;
    const shutter = recording ? SHUTTER.record : SHUTTER.capture;
    let cx;
    let cy;
    let sel = null;
    let shot = null;

    if (t < 0.9) {
      // Glide from the last selection's end to this one's start.
      const e = ease(phase(t, 0, 0.9));
      cx = lerp(prev.x + prev.w, rect.x, e);
      cy = lerp(prev.y + prev.h, rect.y, e);
    } else if (t < 2.6) {
      const e = ease(phase(t, 0.9, 2.6));
      sel = { x: rect.x, y: rect.y, w: rect.w * e, h: rect.h * e };
      cx = rect.x + sel.w;
      cy = rect.y + sel.h;
    } else if (t < shutter + 1.2) {
      sel = rect;
      cx = rect.x + rect.w;
      cy = rect.y + rect.h;
    } else {
      cx = rect.x + rect.w;
      cy = rect.y + rect.h;
    }

    if (sel && t < shutter + 0.3) {
      // Dim everything outside the selection, as the region picker does.
      c.fillStyle = rgba(col.dark ? [0, 0, 0] : col.text, (col.dark ? 0.16 : 0.06) * ease(phase(t, 0.9, 1.4)));
      c.beginPath();
      c.rect(0, 0, w, h);
      c.rect(sel.x, sel.y, sel.w, sel.h);
      c.fill('evenodd');
      // Marching ants.
      c.save();
      c.lineWidth = 1.6 * S;
      c.setLineDash([6 * S, 5 * S]);
      c.lineDashOffset = -this.time * 22 * S;
      c.strokeStyle = rgba(tone, 0.7 * k);
      c.strokeRect(sel.x, sel.y, sel.w, sel.h);
      c.restore();
      // Corner handles.
      const hs = 6 * S;
      c.fillStyle = rgba(tone, 0.75 * k);
      for (const [hx, hy] of [[sel.x, sel.y], [sel.x + sel.w, sel.y], [sel.x, sel.y + sel.h], [sel.x + sel.w, sel.y + sel.h]]) {
        c.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
      // Size label, in the page's pixels.
      if (sel.w > 40 * S && sel.h > 20 * S) {
        const label = `${Math.round(sel.w / this.ratio)} × ${Math.round(sel.h / this.ratio)}`;
        c.font = `600 ${11 * S}px ui-monospace, Consolas, monospace`;
        const lw = c.measureText(label).width + 12 * S;
        const ly = sel.y > 26 * S ? sel.y - 22 * S : sel.y + 4 * S;
        roundRect(c, sel.x, ly, lw, 18 * S, 4 * S);
        c.fillStyle = rgba(tone, 0.8 * k);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.95)';
        c.textBaseline = 'middle';
        c.fillText(label, sel.x + 6 * S, ly + 9 * S);
      }
      if (recording && t > 2.6) {
        // REC with a running time code while the "recording" lasts.
        const blink = Math.floor(this.time * 2) % 2 === 0;
        const secs = Math.max(0, t - 2.6);
        const code = `REC 00:0${Math.floor(secs)}.${Math.floor((secs % 1) * 10)}`;
        c.font = `700 ${11 * S}px ui-monospace, Consolas, monospace`;
        const tx = sel.x + sel.w - c.measureText(code).width - 12 * S;
        const ty = sel.y + 14 * S;
        c.beginPath();
        c.arc(tx - 9 * S, ty, 4.5 * S, 0, Math.PI * 2);
        c.fillStyle = rgba(col.rec, (blink ? 0.95 : 0.35) * k);
        c.fill();
        c.fillStyle = rgba(col.rec, 0.9 * k);
        c.textBaseline = 'middle';
        c.fillText(code, tx, ty);
      }
    }

    // Shutter flash (or the recording stopping).
    if (t >= shutter && t < shutter + 0.5) {
      const a = 1 - phase(t, shutter, shutter + 0.5);
      c.fillStyle = recording ? rgba(col.rec, 0.18 * a * k) : `rgba(255,255,255,${0.45 * a})`;
      c.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    // The shot flies into the film strip and shrinks on the way.
    if (fly && t >= shutter + 0.3 && t < shutter + FLY) {
      const e = ease(phase(t, shutter + 0.3, shutter + FLY));
      const target = this.stripSlot(w, h, S);
      shot = {
        x: lerp(rect.x, target.x, e), y: lerp(rect.y, target.y, e),
        w: lerp(rect.w, target.w, e), h: lerp(rect.h, target.h, e), progress: e, recording,
      };
      roundRect(c, shot.x, shot.y, shot.w, shot.h, 6 * S);
      c.fillStyle = rgba(tone, 0.1 * k);
      c.fill();
      c.lineWidth = 1.5 * S;
      c.strokeStyle = rgba(tone, 0.55 * (1 - e * 0.4) * k);
      c.stroke();
    }

    this.drawCrosshair(c, cx, cy, S, tone, k, t < 0.9 || t > shutter + 1.2 ? 0.5 : 0.85);
    return shot;
  }

  drawCrosshair(c, x, y, S, tone, k, a) {
    const r = 11 * S;
    c.save();
    c.lineWidth = 1.5 * S;
    c.strokeStyle = rgba(tone, a * k);
    c.beginPath();
    c.moveTo(x - r, y); c.lineTo(x - 3 * S, y);
    c.moveTo(x + 3 * S, y); c.lineTo(x + r, y);
    c.moveTo(x, y - r); c.lineTo(x, y - 3 * S);
    c.moveTo(x, y + 3 * S); c.lineTo(x, y + r);
    c.stroke();
    c.beginPath();
    c.arc(x, y, 6 * S, 0, Math.PI * 2);
    c.globalAlpha = 0.5;
    c.stroke();
    c.restore();
  }

  /**
   * A lens aperture: turns slowly, closes for the shutter. In the top right corner, or
   * (`centre`, the lens scene) large in the middle with a flash when it fires.
   */
  drawAperture(c, w, h, S, col, k, t, recording, centre = false) {
    const R = Math.min(w, h) * (centre ? 0.34 : 0.2);
    const cx = centre ? w / 2 : w - R * 0.55;
    const cy = centre ? h / 2 : R * 0.5;
    const shutter = recording ? SHUTTER.record : SHUTTER.capture;
    if (centre) {
      k *= 1.7;
      // Focus rings around it, breathing slowly.
      c.lineWidth = 1.2 * S;
      for (let i = 1; i <= 4; i += 1) {
        c.beginPath();
        c.arc(cx, cy, R * (1.15 + i * 0.22 + 0.03 * Math.sin(this.time * 0.8 + i)), 0, Math.PI * 2);
        c.strokeStyle = rgba(col.accent, (0.07 - i * 0.012) * k);
        c.stroke();
      }
      if (t >= shutter && t < shutter + 0.5) {
        c.beginPath();
        c.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
        c.fillStyle = recording ? rgba(col.rec, 0.12 * (1 - phase(t, shutter, shutter + 0.5)) * k) : `rgba(255,255,255,${0.3 * (1 - phase(t, shutter, shutter + 0.5))})`;
        c.fill();
      }
    }
    const close = t >= shutter - 0.1 && t < shutter + 0.6 ? Math.sin(Math.PI * phase(t, shutter - 0.1, shutter + 0.6)) : 0;
    const open = 0.55 - 0.4 * close;
    const blades = 7;
    const turn = this.time * 0.06;
    c.save();
    c.translate(cx, cy);
    c.lineWidth = 1.5 * S;
    for (const [rr, a] of [[R, 0.1], [R * 1.12, 0.06], [R * 0.86, 0.05]]) {
      c.beginPath();
      c.arc(0, 0, rr, 0, Math.PI * 2);
      c.strokeStyle = rgba(col.accent, a * k);
      c.stroke();
    }
    // Each blade: from a point on the rim, a straight edge tangent to the opening.
    for (let i = 0; i < blades; i += 1) {
      const a0 = turn + (i / blades) * Math.PI * 2;
      const rim = [Math.cos(a0) * R, Math.sin(a0) * R];
      const inner = [Math.cos(a0 + 1.9) * R * open, Math.sin(a0 + 1.9) * R * open];
      const rimNext = [Math.cos(a0 + (Math.PI * 2) / blades) * R, Math.sin(a0 + (Math.PI * 2) / blades) * R];
      c.beginPath();
      c.moveTo(rim[0], rim[1]);
      c.lineTo(inner[0], inner[1]);
      c.lineTo(rimNext[0], rimNext[1]);
      c.arc(0, 0, R, a0 + (Math.PI * 2) / blades, a0, true);
      c.closePath();
      c.fillStyle = rgba(i % 2 ? col.accent : col.text, (0.035 + 0.03 * close) * k);
      c.fill();
      c.strokeStyle = rgba(col.accent, 0.09 * k);
      c.stroke();
    }
    c.restore();
  }

  /** The bottom strip's top edge (device px). */
  stripTop(h, S) {
    return h - 72 * S - 6 * S;
  }

  /** Where a new frame enters a strip whose band starts at `top` (device px). */
  stripSlot(w, h, S, top = this.stripTop(h, S)) {
    const fh = 46 * S;
    const fw = fh * 1.6;
    return { x: w - fw - 40 * S, y: top + (72 * S - fh) / 2, w: fw, h: fh };
  }

  /**
   * A film strip scrolling left; each frame is one past capture. Along the bottom, or at
   * `top` with its own clock (`time`) for the film scene's several strips.
   */
  drawFilmStrip(c, w, h, S, col, k, shot, { top = this.stripTop(h, S), time = this.time } = {}) {
    const band = 72 * S;
    c.fillStyle = rgba(col.text, 0.045 * k);
    c.fillRect(0, top, w, band);
    // Sprocket holes, moving with the film.
    const hole = 7 * S;
    const pitch = 18 * S;
    const offset = (time * 14 * S) % pitch;
    c.fillStyle = rgba(col.text, 0.08 * k);
    for (let x = -offset; x < w; x += pitch) {
      c.fillRect(x, top + 4 * S, hole, hole * 0.8);
      c.fillRect(x, top + band - 4 * S - hole * 0.8, hole, hole * 0.8);
    }
    // Frames: the one for each finished cycle moves left from the entry slot.
    const slot = this.stripSlot(w, h, S, top);
    for (const { cycle: done, x, video } of stripFrames(time, slot.x, slot.w, 12 * S)) {
      const tone = video ? col.rec : col.accent;
      roundRect(c, x, slot.y, slot.w, slot.h, 4 * S);
      c.fillStyle = rgba(tone, 0.08 * k);
      c.fill();
      c.lineWidth = 1.2 * S;
      c.strokeStyle = rgba(tone, 0.22 * k);
      c.stroke();
      // A little picture: a window outline, or a play triangle for a recording.
      c.fillStyle = rgba(tone, 0.2 * k);
      if (video) {
        const px = x + slot.w / 2;
        const py = slot.y + slot.h / 2;
        c.beginPath();
        c.moveTo(px - 6 * S, py - 8 * S);
        c.lineTo(px + 9 * S, py);
        c.lineTo(px - 6 * S, py + 8 * S);
        c.closePath();
        c.fill();
      } else {
        const r = seeded(done + 3);
        c.fillRect(x + 6 * S, slot.y + 6 * S, slot.w - 12 * S, 5 * S);
        c.fillRect(x + 6 * S, slot.y + 15 * S, (slot.w - 12 * S) * (0.4 + r() * 0.5), 4 * S);
        c.fillRect(x + 6 * S, slot.y + 23 * S, (slot.w - 12 * S) * (0.3 + r() * 0.5), 4 * S);
      }
    }
    if (shot && shot.progress > 0.95) {
      c.strokeStyle = rgba(shot.recording ? col.rec : col.accent, 0.6 * k);
      c.lineWidth = 2 * S;
      roundRect(c, slot.x - 2 * S, slot.y - 2 * S, slot.w + 4 * S, slot.h + 4 * S, 5 * S);
      c.stroke();
    }
  }
}

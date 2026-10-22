// Moving 3D picture behind the start page. Every scene is a WebGL world
// (src/ui/start3d/scenes.js) drawn from three clocks: camera, objects and sky.
// Settings give each clock its own speed; the overall speed scales all three.
// The loop pauses while the page is hidden or nothing would move.
import { Kit } from './start3d/gl.js';
import { rand } from './start3d/meshes.js';
import { releaseScene, sceneOf } from './start3d/scenes.js';
import { START_SPEED_CHANNELS, startIsStill, startRates, startSceneId, startTransparency } from './startscenes.js';

function cssChannels(value) {
  const text = String(value ?? '').trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  }
  const rgb = text.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return rgb ? [1, 2, 3].map((i) => Number(rgb[i]) / 255) : null;
}

const mixColor = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function cssHex(rgb) {
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The active theme for the scenes: `accent`, `bg`, `dark`, and `c(rgb, k)`,
 * which turns a natural colour toward the accent's hue at the same brightness,
 * so a theme change shows in every scene without repainting it.
 */
export function themeTone() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  let dark = root.dataset.theme !== 'light';
  const accent = cssChannels(style.getPropertyValue('--accent')) ?? [0.3, 0.55, 1];
  const bg = cssChannels(style.getPropertyValue('--bg-primary') || style.getPropertyValue('--bg'))
    ?? (dark ? [0.09, 0.1, 0.13] : [0.95, 0.96, 0.97]);
  dark = luma(bg) < 0.55;
  const la = Math.max(0.05, luma(accent));
  const c = (rgb, k = 0.18) => {
    const l = luma(rgb);
    return rgb.map((v, i) => v + (Math.min(1.2, (accent[i] / la) * l) - v) * k);
  };
  return { dark, accent, bg, c };
}

export class StartBackground {
  constructor(host, getScreen) {
    this.host = host;
    this.getScreen = typeof getScreen === 'function' ? getScreen : () => ({});
    this.running = false;
    this.wanted = false;
    this.frame = 0;
    this.states = new Map();
    this.clock = { camera: 0, objects: 0, sky: 0, step: 0 };
    this.roll();
    this.fresh = true;
  }

  /** New random worlds: every scene builds again with a fresh seed, and the clocks start somewhere new. */
  roll() {
    if (this.kit) for (const state of this.states.values()) releaseScene(this.kit, state);
    this.states.clear();
    this.seed = (Math.random() * 2 ** 31) >>> 0;
    const r = rand(this.seed ^ 0x5bd1e995);
    for (const channel of START_SPEED_CHANNELS) this.clock[channel.id] = r() * 200;
    this.clock.step = 0;
  }

  /** The scene and clock speeds from Settings. */
  choice() {
    const saved = this.getScreen() ?? {};
    const rates = startRates(saved);
    const transparency = startTransparency(saved.transparency);
    // A fully transparent picture is not drawn at all.
    return { scene: startSceneId(saved.scene), rates, transparency, still: startIsStill(rates) || transparency >= 100 };
  }

  /** Compile the shaders once, off the click that opens the page. */
  prewarm() {
    this.ensureGl();
    if (!this.kit) return;
    try {
      this.kit.warm();
      this.stateOf(this.choice().scene);
    } catch (error) {
      console.error(error);
    }
  }

  ensureGl() {
    if (this.gl || this.failed) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'start-bg-canvas is-pending';
    this.host.append(canvas);
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
    if (!gl) {
      this.fail(canvas);
      return;
    }
    this.canvas = canvas;
    this.gl = gl;
    try {
      this.kit = new Kit(gl);
      const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      this.kit.maxPoint = Math.max(1, Math.min(256, range?.[1] ?? 64));
    } catch (error) {
      console.error(error);
      this.fail(canvas);
      return;
    }
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.stop();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.gl = null;
      this.kit = null;
      this.states.clear();
      canvas.remove();
      this.ensureGl();
      if (this.wanted) this.show();
    });
    new ResizeObserver(() => this.resize()).observe(this.host);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else if (this.wanted) this.start();
    });
  }

  fail(canvas) {
    this.failed = true;
    this.gl = null;
    this.kit = null;
    canvas.remove();
    this.host.classList.add('start-bg-fallback');
  }

  /** The built world of a scene, made on first use after each roll. */
  stateOf(id) {
    let state = this.states.get(id);
    if (!state) {
      state = sceneOf(id).build(this.kit, rand(this.seed + id.length * 7919 + id.charCodeAt(0)));
      this.states.set(id, state);
    }
    return state;
  }

  show() {
    if (!this.wanted && !this.fresh) this.roll();
    this.fresh = false;
    this.syncTheme(false);
    if (!this.themeWatch) {
      this.themeWatch = new MutationObserver(() => this.syncTheme());
      this.themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-id', 'style'] });
    }
    this.wanted = true;
    this.fade();
    this.ensureGl();
    this.kind = this.choice().scene;
    // Draw one frame now, then keep moving. A hidden window may not run animation frames.
    this.resize();
    this.applySize();
    this.start();
  }

  /** See-through picture: the start page's theme background shows behind it. */
  fade() {
    const { transparency } = this.choice();
    this.host.style.opacity = transparency ? String(1 - transparency / 100) : '';
  }

  syncTheme(redraw = true) {
    this.tone = themeTone();
    const { accent, bg, dark } = this.tone;
    const lift = mixColor(accent, [1, 1, 1], dark ? 0.42 : 0.62);
    this.host.style.setProperty('--start-zenith', cssHex(dark ? mixColor(accent, bg, 0.55) : mixColor(lift, [0.97, 0.98, 1], 0.2)));
    this.host.style.setProperty('--start-horizon', cssHex(dark ? mixColor(accent, lift, 0.35) : mixColor(lift, [1, 0.98, 0.94], 0.28)));
    this.host.style.setProperty('--start-grass', cssHex(dark ? mixColor(accent, [0.1, 0.22, 0.1], 0.28) : mixColor(accent, [0.62, 0.78, 0.48], 0.32)));
    if (redraw && this.wanted && !this.running) this.applySize();
  }

  resize() {
    if (!this.gl) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const ratio = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(width * ratio));
    const h = Math.max(1, Math.floor(height * ratio));
    this.wantW = w;
    this.wantH = h;
    // The animation frame applies the size together with the redraw, so opening
    // the page does not stop to draw the picture on the click itself.
    if (this.running && (this.canvas.width !== w || this.canvas.height !== h)) this.cover();
    else if (this.wanted && !this.running) this.applySize();
  }

  applySize() {
    const gl = this.gl;
    if (!gl || !this.wantW || !this.wantH) return;
    const now = performance.now();
    const realloc = this.canvas.width !== this.wantW || this.canvas.height !== this.wantH;
    if (realloc) {
      if (this.running) this.cover();
      this.canvas.width = this.wantW;
      this.canvas.height = this.wantH;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.kit.aspect = this.canvas.width / this.canvas.height;
    this.kit.height = this.canvas.height;
    this.draw();
    this.canvas.classList.remove('is-pending');
    if (realloc) gl.flush();
    this.releaseSnap(now, realloc);
  }

  // The cover stays for the resized frame, then the new picture shows through.
  releaseSnap(now, fresh) {
    if (fresh) this.snapUntil = now;
    else if (this.snap?.isConnected && this.snapUntil != null && now >= this.snapUntil) {
      this.snap.remove();
      this.snapUntil = null;
    }
  }

  // Paint the current frame over the canvas so the clear from a resize stays hidden.
  cover() {
    const src = this.canvas;
    if (!src?.width || !src.height || this.snap?.isConnected) return;
    let snap = this.snap;
    if (!snap) {
      snap = document.createElement('canvas');
      snap.className = 'start-bg-snap';
      snap.setAttribute('aria-hidden', 'true');
      this.snap = snap;
    }
    if (snap.width !== src.width) snap.width = src.width;
    if (snap.height !== src.height) snap.height = src.height;
    const ctx = snap.getContext('2d', { alpha: false });
    ctx.drawImage(src, 0, 0);
    this.host.append(snap);
  }

  draw() {
    if (!this.kit) return;
    const key = `${document.documentElement.dataset.theme}|${getComputedStyle(document.documentElement).getPropertyValue('--accent')}|${getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')}`;
    if (key !== this.themeKey || !this.tone) { this.themeKey = key; this.syncTheme(false); }
    const id = this.kind ?? 'valley';
    try {
      sceneOf(id).draw(this.kit, this.stateOf(id), this.clock, this.tone);
    } catch (error) {
      // A scene that cannot draw on this GPU leaves the gradient behind the page.
      console.error(error);
      this.stop();
      this.canvas.hidden = true;
      this.host.classList.add('start-bg-fallback');
      this.broken = id;
      return;
    }
    if (this.broken) {
      this.broken = null;
      this.canvas.hidden = false;
      this.host.classList.remove('start-bg-fallback');
    }
  }

  /** Move each clock by its own speed. */
  advance(seconds) {
    const { rates } = this.choice();
    const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.5 : 1;
    for (const channel of START_SPEED_CHANNELS) this.clock[channel.id] += seconds * rates[channel.id] * calm;
    this.clock.step = seconds * rates.camera * calm;
  }

  start() {
    if (this.running || !this.gl || !this.wanted) return;
    if (this.choice().still) {
      this.clock.step = 0;
      this.applySize();
      return;
    }
    this.running = true;
    let last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      if (this.choice().still) {
        this.running = false;
        this.clock.step = 0;
        this.applySize();
        return;
      }
      this.advance(Math.min(0.05, Math.max(0, (now - last) / 1000)));
      last = now;
      this.applySize();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  hide() {
    this.wanted = false;
    this.stop();
    this.snap?.remove();
    this.snapUntil = null;
  }

  /** Scene, transparency or speeds changed while the page is open. */
  refresh() {
    if (!this.wanted) return;
    const { scene, still } = this.choice();
    this.fade();
    if (scene !== this.kind) {
      this.kind = scene;
      this.snap?.remove();
      this.snapUntil = null;
    }
    if (still) {
      this.stop();
      this.applySize();
    } else if (!this.running) this.start();
    else this.applySize();
  }
}

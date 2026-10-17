// Moving 3D picture behind the start page. Every scene is a WebGL world
// (src/lib/start3d/scenes.js). The camera, the objects and the sky share one
// speed. The loop pauses while the page is hidden, while nothing would move,
// or while the picture is fully transparent.
import { Kit } from './start3d/gl.js';
import { rand } from './start3d/meshes.js';
import { releaseScene, sceneOf } from './start3d/scenes.js';
import { startIsStill, startRates, startSceneId, startTransparency } from './startscenes.js';

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

/** Colours from the active theme, so a theme change shows in every scene. */
export function themeTone() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const dark = root.dataset.theme !== 'light';
  const accent = cssChannels(style.getPropertyValue('--accent')) ?? [0.3, 0.55, 1];
  const bg = cssChannels(style.getPropertyValue('--bg')) ?? (dark ? [0.09, 0.1, 0.13] : [0.95, 0.96, 0.97]);
  const la = Math.max(0.05, luma(accent));
  const c = (rgb, k = 0.18) => {
    const l = luma(rgb);
    return rgb.map((v, i) => v + (Math.min(1.2, (accent[i] / la) * l) - v) * k);
  };
  return { dark, accent, bg, c };
}

export class StartBackground {
  constructor(host, read) {
    this.host = host;
    this.read = read;
    this.running = false;
    this.wanted = false;
    this.frame = 0;
    this.states = new Map();
    this.clock = { camera: 0, objects: 0, sky: 0, step: 0 };
    this.roll();
  }

  roll() {
    if (this.kit) for (const state of this.states.values()) releaseScene(this.kit, state);
    this.states.clear();
    this.seed = (Math.random() * 2 ** 31) >>> 0;
    const r = rand(this.seed ^ 0x5bd1e995);
    this.clock.camera = r() * 200;
    this.clock.objects = r() * 200;
    this.clock.sky = r() * 200;
    this.clock.step = 0;
  }

  choice() {
    const saved = this.read?.() ?? {};
    const rates = startRates(saved.motion);
    const transparency = startTransparency(saved.transparency);
    return {
      scene: startSceneId(saved.scene),
      rates,
      transparency,
      still: startIsStill(rates) || transparency >= 100,
    };
  }

  ensureGl() {
    if (this.gl || this.failed) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'start-bg-canvas is-pending';
    this.host.append(canvas);
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    } catch { gl = null; }
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
      this.failed = false;
      this.states.clear();
      canvas.remove();
      this.canvas = null;
      this.ensureGl();
      if (this.wanted) this.show();
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.onHide = () => {
      if (document.hidden) this.stop();
      else if (this.wanted) this.start();
    };
    document.addEventListener('visibilitychange', this.onHide);
  }

  fail(canvas) {
    this.failed = true;
    this.gl = null;
    this.kit = null;
    canvas.remove();
    this.canvas = null;
    this.host.classList.add('start-bg-fallback');
  }

  stateOf(id) {
    let state = this.states.get(id);
    if (!state) {
      state = sceneOf(id).build(this.kit, rand(this.seed + id.length * 7919 + id.charCodeAt(0)));
      this.states.set(id, state);
    }
    return state;
  }

  show() {
    if (!this.host) return;
    this.wanted = true;
    this.tone = themeTone();
    if (!this.themeWatch) {
      this.themeWatch = new MutationObserver(() => { this.tone = themeTone(); });
      this.themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-id', 'style'] });
    }
    this.ensureGl();
    this.kind = this.choice().scene;
    this.resize();
    this.applySize();
    this.start();
  }

  /** Scene or speed changed. Speeds are read every frame; a new scene or a still picture is applied now. */
  sync() {
    if (!this.wanted) return;
    const { scene, still } = this.choice();
    if (scene !== this.kind) {
      this.kind = scene;
      this.snap?.remove();
      this.snapUntil = null;
    }
    if (still) {
      this.stop();
      this.clock.step = 0;
      this.applySize();
    } else if (!this.running) this.start();
  }

  resize() {
    if (!this.gl) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const ratio = Math.min(1, window.devicePixelRatio || 1);
    this.wantW = Math.max(1, Math.floor(width * ratio));
    this.wantH = Math.max(1, Math.floor(height * ratio));
    if (!this.running) this.applySize();
  }

  applySize() {
    const gl = this.gl;
    if (!gl || !this.wantW || !this.wantH) return;
    if (this.canvas.width !== this.wantW || this.canvas.height !== this.wantH) {
      this.canvas.width = this.wantW;
      this.canvas.height = this.wantH;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.kit.aspect = this.canvas.width / this.canvas.height;
    this.kit.height = this.canvas.height;
    this.draw();
    this.canvas.classList.remove('is-pending');
  }

  draw() {
    if (!this.kit) return;
    if (!this.tone) this.tone = themeTone();
    const id = this.kind ?? 'valley';
    try {
      sceneOf(id).draw(this.kit, this.stateOf(id), this.clock, this.tone);
    } catch (error) {
      console.error(error);
      this.stop();
      if (this.canvas) this.canvas.hidden = true;
      this.host.classList.add('start-bg-fallback');
    }
  }

  advance(seconds) {
    const { rates } = this.choice();
    const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.5 : 1;
    this.clock.camera += seconds * rates.camera * calm;
    this.clock.objects += seconds * rates.objects * calm;
    this.clock.sky += seconds * rates.sky * calm;
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

  dispose() {
    this.wanted = false;
    this.stop();
    this.themeWatch?.disconnect();
    this.resizeObserver?.disconnect();
    if (this.onHide) document.removeEventListener('visibilitychange', this.onHide);
    if (this.kit) for (const state of this.states.values()) releaseScene(this.kit, state);
    this.states.clear();
    try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* the context is already gone */ }
    this.canvas?.remove();
    this.snap?.remove();
    this.gl = null;
    this.kit = null;
    this.canvas = null;
  }
}

// Rulers of the 2D plan view: a horizontal ruler (world x) along the top and a
// vertical one (world z, plan "y") down the left of the 3D view, following pan and
// zoom, with the pointer marked on both and its coordinates in the corner box.
// Drawn on two small canvases only when the view changes or the pointer moves.

const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
const SIZE = 22;

export class Rulers {
  /**
   * @param {HTMLElement} host   the view host (position: relative)
   * @param {import('../engine/viewport.js').Viewport} viewport
   * @param {{ units: () => string, format: (metres: number) => string, enabled: () => boolean }} options
   */
  constructor(host, viewport, options) {
    this.viewport = viewport;
    this.options = options;
    this.el = document.createElement('div');
    this.el.className = 'rulers';
    this.el.innerHTML = '<canvas class="ruler ruler-x"></canvas><canvas class="ruler ruler-y"></canvas><div class="ruler-corner"><span class="rc-x"></span><span class="rc-y"></span></div>';
    host.append(this.el);
    this.cx = this.el.querySelector('.ruler-x');
    this.cy = this.el.querySelector('.ruler-y');
    this.corner = this.el.querySelector('.ruler-corner');
    this.pointer = null;
    const previous = viewport.options.beforeRender;
    viewport.options.beforeRender = (v) => { previous?.(v); this.draw(); };
  }

  get visible() { return Boolean(this.viewport.planMode && this.options.enabled()); }

  /** World x / z under a canvas pixel of the plan view (top view: screen right = +x, screen down = +z). */
  mapping() {
    const vp = this.viewport;
    const cam = vp.ortho;
    const w = vp.width; const h = vp.height;
    const perPx = (cam.top - cam.bottom) / h;
    const x0 = cam.position.x + cam.left; // world x at the left edge
    const z0 = cam.position.z - cam.top; // world z at the top edge (screen up = −z)
    return { perPx, x0, z0, w, h };
  }

  setPointer(world) {
    this.pointer = world ? { x: world.x, z: world.z } : null;
    if (this.visible) this.draw();
  }

  draw() {
    const show = this.visible;
    this.el.hidden = !show;
    if (!show) return;
    const m = this.mapping();
    const css = getComputedStyle(this.el);
    const colors = { bg: css.getPropertyValue('--ruler-bg').trim() || '#f4f5f7', fg: css.getPropertyValue('--ruler-fg').trim() || '#4b5563', mark: '#e5484d' };
    this.drawAxis(this.cx, m.w, m.x0, m.perPx, colors, false, this.pointer?.x);
    this.drawAxis(this.cy, m.h, m.z0, m.perPx, colors, true, this.pointer?.z);
    const fmt = this.options.format;
    this.corner.querySelector('.rc-x').textContent = this.pointer ? `X ${fmt(this.pointer.x)}` : 'X —';
    this.corner.querySelector('.rc-y').textContent = this.pointer ? `Y ${fmt(-this.pointer.z)}` : 'Y —';
  }

  drawAxis(canvas, length, start, perPx, colors, vertical, mark) {
    const dpr = window.devicePixelRatio || 1;
    const W = vertical ? SIZE : length; const H = vertical ? length : SIZE;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = colors.bg;
    g.fillRect(0, 0, W, H);
    // Labelled ticks at least ~70 px apart, minor ticks in between.
    const step = STEPS.find((s) => s / perPx >= 70) ?? STEPS.at(-1);
    const minor = step / (String(step).startsWith('2') ? 4 : 5);
    const end = start + length * perPx;
    g.strokeStyle = colors.fg;
    g.fillStyle = colors.fg;
    g.font = '10px system-ui, sans-serif';
    g.lineWidth = 1;
    g.beginPath();
    for (let v = Math.floor(start / minor) * minor; v <= end; v += minor) {
      const px = Math.round((v - start) / perPx) + 0.5;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      const tick = major ? SIZE - 4 : SIZE * 0.3;
      if (vertical) { g.moveTo(SIZE - tick, px); g.lineTo(SIZE, px); } else { g.moveTo(px, SIZE - tick); g.lineTo(px, SIZE); }
      if (major) {
        // The plan's y grows upwards (north), so the vertical ruler shows −z.
        const label = this.options.format(vertical ? -v : v, { short: true });
        if (vertical) { g.save(); g.translate(10, px + 3); g.rotate(-Math.PI / 2); g.fillText(label, 0, 0); g.restore(); } else g.fillText(label, px + 3, 10);
      }
    }
    g.stroke();
    g.strokeStyle = colors.fg;
    g.globalAlpha = 0.35;
    g.beginPath();
    if (vertical) { g.moveTo(SIZE - 0.5, 0); g.lineTo(SIZE - 0.5, H); } else { g.moveTo(0, SIZE - 0.5); g.lineTo(W, SIZE - 0.5); }
    g.stroke();
    g.globalAlpha = 1;
    if (mark != null) {
      const px = Math.round((mark - start) / perPx) + 0.5;
      g.strokeStyle = colors.mark;
      g.lineWidth = 1.5;
      g.beginPath();
      if (vertical) { g.moveTo(0, px); g.lineTo(SIZE, px); } else { g.moveTo(px, 0); g.lineTo(px, SIZE); }
      g.stroke();
    }
  }
}

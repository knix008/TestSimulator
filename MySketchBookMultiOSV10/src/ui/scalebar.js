// Scale bar over the view: a bar of a round length (10 cm, 50 cm, 1 m, 2 m …)
// that is about 120 px long at the current zoom, its length, and in the 2D
// plan the drawing scale (1:50 at 96 dpi). The user drags it anywhere in the
// view; its place is kept as fractions of the view (settings.scaleBarPos).

const NICE = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
const TARGET_PX = 120;
const METRES_PER_SCREEN_PX = 0.0254 / 96; // a CSS pixel on paper

export class ScaleBar {
  /**
   * @param {HTMLElement} host  view host (position: relative)
   * @param {import('../engine/viewport.js').Viewport} viewport
   * @param {{ enabled: () => boolean, format: (m: number) => string, position: () => {x:number,y:number}|null, onMove: (pos) => void, title: string }} options
   */
  constructor(host, viewport, options) {
    this.host = host;
    this.viewport = viewport;
    this.options = options;
    this.el = document.createElement('div');
    this.el.className = 'scale-bar';
    this.el.title = options.title ?? '';
    this.el.innerHTML = '<div class="sb-ticks"><i></i><i></i><i></i></div><div class="sb-label"><b class="sb-length"></b><span class="sb-ratio"></span></div>';
    host.append(this.el);
    this.last = '';
    const previous = viewport.options.beforeRender;
    viewport.options.beforeRender = (v) => { previous?.(v); this.update(); };
    this.bindDrag();
  }

  update() {
    const show = this.options.enabled();
    this.el.hidden = !show;
    if (!show) return;
    const vp = this.viewport;
    // World size of one pixel where the user looks (the target in 3D, everywhere in the parallel plan).
    const perPx = vp.pixelSizeAt(vp.target);
    if (!Number.isFinite(perPx) || perPx <= 0) return;
    const length = NICE.find((n) => n / perPx >= TARGET_PX * 0.6) ?? NICE.at(-1);
    const px = Math.round(length / perPx);
    const ratio = vp.isOrtho ? Math.round(perPx / METRES_PER_SCREEN_PX) : 0;
    const key = `${length}|${px}|${ratio}`;
    if (key !== this.last) {
      this.last = key;
      this.el.querySelector('.sb-ticks').style.width = `${px}px`;
      this.el.querySelector('.sb-length').textContent = this.options.format(length);
      // A rounded ratio reads like a drawing scale: 1:47 → 1:50.
      const nice = ratio ? [1, 2, 2.5, 5, 10].map((f) => f * 10 ** Math.floor(Math.log10(ratio))).reduce((a, b) => (Math.abs(b - ratio) < Math.abs(a - ratio) ? b : a)) : 0;
      this.el.querySelector('.sb-ratio').textContent = ratio ? `1:${Math.round(Math.abs(nice - ratio) / ratio < 0.06 ? nice : ratio).toLocaleString()}` : '';
    }
    this.place();
  }

  /** Puts the bar where the user left it (default: bottom left), kept inside the view. */
  place() {
    const pos = this.options.position() ?? { x: 0.02, y: 0.94 };
    const w = this.host.clientWidth; const h = this.host.clientHeight;
    const bw = this.el.offsetWidth; const bh = this.el.offsetHeight;
    const left = Math.max(4, Math.min(w - bw - 4, pos.x * w));
    const top = Math.max(4, Math.min(h - bh - 4, pos.y * h - bh));
    this.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  bindDrag() {
    this.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try { this.el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      const host = this.host.getBoundingClientRect();
      const box = this.el.getBoundingClientRect();
      const grab = { x: e.clientX - box.left, y: e.clientY - box.top };
      this.el.classList.add('dragging');
      const move = (ev) => {
        const x = (ev.clientX - grab.x - host.left) / host.width;
        const y = (ev.clientY - grab.y - host.top + box.height) / host.height;
        this.dragPos = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
        this.options.onMove(this.dragPos, { live: true });
        this.place();
      };
      const up = () => {
        this.el.removeEventListener('pointermove', move);
        this.el.removeEventListener('pointerup', up);
        this.el.removeEventListener('pointercancel', up);
        this.el.classList.remove('dragging');
        if (this.dragPos) this.options.onMove(this.dragPos, { live: false });
        this.dragPos = null;
      };
      this.el.addEventListener('pointermove', move);
      this.el.addEventListener('pointerup', up);
      this.el.addEventListener('pointercancel', up);
    });
  }
}

// Rulers, grid and pointer position for the views other than the drawing (page overview, shape
// sheet, shape data, reports). They measure the view's own scrolled surface in the drawing's
// units, and follow Show › Rulers and Grid like the drawing does.
const SIZE = 20;
const PX_PER = { mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, px: 1 };
const GRID_MM = 10;

let current = null;

function drawRuler(canvas, horizontal, length, scroll, unit, pointer) {
  const dpr = window.devicePixelRatio || 1;
  const [w, h] = horizontal ? [length, SIZE] : [SIZE, length];
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  const colors = getComputedStyle(document.documentElement);
  const text = colors.getPropertyValue('--muted').trim() || '#666';
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = colors.getPropertyValue('--toolbar').trim() || '#f3f4f6';
  c.fillRect(0, 0, w, h);
  const pxPer = PX_PER[unit] ?? PX_PER.mm;
  const major = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((step) => step * pxPer >= 70) ?? 1000;
  const minor = major / (String(major).startsWith('5') ? 5 : 10);
  c.strokeStyle = text; c.fillStyle = text; c.lineWidth = 1; c.font = '9px "Segoe UI", sans-serif';
  c.beginPath();
  for (let v = Math.floor((scroll / pxPer) / minor) * minor; v * pxPer - scroll <= length; v += minor) {
    const pos = Math.round(v * pxPer - scroll) + 0.5;
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const tick = isMajor ? 10 : 4;
    if (horizontal) { c.moveTo(pos, h); c.lineTo(pos, h - tick); } else { c.moveTo(w, pos); c.lineTo(w - tick, pos); }
    if (isMajor) {
      const label = String(Math.round(v * 1000) / 1000);
      if (horizontal) c.fillText(label, pos + 2, 9);
      else { c.save(); c.translate(9, pos + 2); c.rotate(-Math.PI / 2); c.fillText(label, 0, 0); c.restore(); }
    }
  }
  c.stroke();
  if (pointer != null) {
    c.strokeStyle = '#e5191f';
    c.setLineDash([3, 2]);
    c.beginPath();
    if (horizontal) { c.moveTo(pointer, 0); c.lineTo(pointer, h); } else { c.moveTo(0, pointer); c.lineTo(w, pointer); }
    c.stroke();
    c.setLineDash([]);
  }
}

class ViewRulers {
  constructor(body, host, { unit, onPointer }) {
    this.body = body;
    this.host = host;
    this.unit = unit;
    this.onPointer = onPointer;
    this.scroll = { x: 0, y: 0 };
    this.pointer = null;
    this.layer = document.createElement('div');
    this.layer.className = 'view-rulers';
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.innerHTML = '<div class="view-ruler-corner"></div><canvas class="view-ruler view-ruler-h"></canvas><canvas class="view-ruler view-ruler-v"></canvas><div class="view-grid"></div>';
    body.append(this.layer);
    this.abort = new AbortController();
    const { signal } = this.abort;
    host.addEventListener('scroll', (event) => {
      const target = event.target === document ? null : event.target;
      if (target) { this.scroll = { x: target.scrollLeft, y: target.scrollTop }; this.draw(); }
    }, { capture: true, signal, passive: true });
    host.addEventListener('pointermove', (event) => {
      const box = host.getBoundingClientRect();
      this.pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
      this.onPointer({ x: this.pointer.x + this.scroll.x, y: this.pointer.y + this.scroll.y });
      this.draw();
    }, { signal });
    host.addEventListener('pointerleave', () => { this.pointer = null; this.draw(); }, { signal });
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(body);
  }

  destroy() {
    this.abort.abort();
    this.resize.disconnect();
    this.layer.remove();
    this.body.classList.remove('view-rulers-on');
  }

  apply({ unit, rulers, grid }) {
    this.unit = unit;
    this.rulers = rulers;
    this.grid = grid;
    this.body.classList.toggle('view-rulers-on', rulers);
    this.layer.classList.toggle('no-rulers', !rulers);
    this.layer.classList.toggle('no-grid', !grid);
    this.draw();
  }

  draw() {
    const inset = this.rulers ? SIZE : 0;
    const width = this.body.clientWidth - inset;
    const height = this.body.clientHeight - inset;
    if (width <= 0 || height <= 0) return;
    if (this.rulers) {
      drawRuler(this.layer.querySelector('.view-ruler-h'), true, width, this.scroll.x, this.unit, this.pointer?.x);
      drawRuler(this.layer.querySelector('.view-ruler-v'), false, height, this.scroll.y, this.unit, this.pointer?.y);
    }
    const step = GRID_MM * PX_PER.mm;
    const grid = this.layer.querySelector('.view-grid');
    grid.style.left = `${inset}px`;
    grid.style.top = `${inset}px`;
    grid.style.backgroundSize = `${step}px ${step}px`;
    grid.style.backgroundPosition = `${-this.scroll.x}px ${-this.scroll.y}px`;
  }
}

/** Called after a view is drawn: rulers and grid on the views other than the drawing. */
export function syncViewRulers(body, host, options) {
  if (!options.active || !host) {
    current?.destroy();
    current = null;
    return null;
  }
  if (current && (current.host !== host || current.body !== body)) { current.destroy(); current = null; }
  current ??= new ViewRulers(body, host, options);
  current.apply(options);
  return current;
}

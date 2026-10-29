// A Canvas 2D-like context that records drawing as SVG, so the figure
// renderer (render2d.js / text.js / render3d.js overlays) can export vector
// graphics with the same code it uses on screen. Covers the subset of the
// Canvas API the renderers use: paths (moveTo / lineTo / arc / ellipse / rect /
// curves), fill / stroke / clip, fillRect / strokeRect, fillText,
// measureText, drawImage, transforms, save / restore, dashes and alpha.
//
//   const g = new SvgContext(w, h, { measure: canvas2dContext });
//   drawFigure(g, …);  const svg = g.toString();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };

/** CSS colour → { color, alpha } for SVG attributes. */
export function svgColor(c) {
  if (c == null) return { color: 'none', alpha: 1 };
  const s = String(c).trim();
  if (s === 'none' || s === 'transparent') return { color: 'none', alpha: 0 };
  const m = /^rgba\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[,/]\s*([\d.]+)\s*\)$/i.exec(s);
  if (m) return { color: `rgb(${Math.round(m[1])},${Math.round(m[2])},${Math.round(m[3])})`, alpha: Number(m[4]) };
  return { color: s, alpha: 1 };
}

/** Parses a CSS font shorthand ('italic bold 12px "Segoe UI", sans-serif'). */
export function parseFont(f) {
  const m = /^\s*((?:(?:italic|oblique|normal|bold|bolder|lighter|[1-9]00|small-caps)\s+)*)([\d.]+)px\s+(.+)$/i.exec(String(f || ''));
  if (!m) return { style: 'normal', weight: 'normal', size: 10, family: 'sans-serif' };
  const mods = m[1].toLowerCase();
  return { style: /italic|oblique/.test(mods) ? 'italic' : 'normal', weight: /bold|[6-9]00/.test(mods) ? 'bold' : 'normal', size: Number(m[2]), family: m[3].trim() };
}

const r4 = (v) => String(Number(v.toFixed(4)));
const mul = (A, B) => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];

export class SvgContext {
  constructor(width, height, { measure = null } = {}) {
    this.width = width; this.height = height;
    this.canvas = { width, height };
    this.measureCtx = measure;
    this.body = [];
    this.defs = [];
    this.seq = 0;
    this.stack = [];
    this.st = {
      m: [1, 0, 0, 1, 0, 0], fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, dash: [], font: '10px sans-serif',
      textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter', groups: 0, imageSmoothingEnabled: true,
    };
    this.path = [];
    this.cur = null;
    this.start = null;
  }

  // ---- state
  get fillStyle() { return this.st.fillStyle; } set fillStyle(v) { this.st.fillStyle = v; }
  get strokeStyle() { return this.st.strokeStyle; } set strokeStyle(v) { this.st.strokeStyle = v; }
  get lineWidth() { return this.st.lineWidth; } set lineWidth(v) { if (Number.isFinite(v) && v > 0) this.st.lineWidth = v; }
  get font() { return this.st.font; } set font(v) { this.st.font = v; }
  get textAlign() { return this.st.textAlign; } set textAlign(v) { this.st.textAlign = v; }
  get textBaseline() { return this.st.textBaseline; } set textBaseline(v) { this.st.textBaseline = v; }
  get globalAlpha() { return this.st.globalAlpha; } set globalAlpha(v) { this.st.globalAlpha = v; }
  get lineCap() { return this.st.lineCap; } set lineCap(v) { this.st.lineCap = v; }
  get lineJoin() { return this.st.lineJoin; } set lineJoin(v) { this.st.lineJoin = v; }
  get imageSmoothingEnabled() { return this.st.imageSmoothingEnabled; } set imageSmoothingEnabled(v) { this.st.imageSmoothingEnabled = !!v; }
  setLineDash(d) { this.st.dash = Array.isArray(d) ? d.slice() : []; }
  getLineDash() { return this.st.dash.slice(); }

  save() { this.stack.push(this.st); this.st = { ...this.st, m: this.st.m.slice(), dash: this.st.dash.slice(), groups: 0 }; }
  restore() {
    if (!this.stack.length) return;
    for (let i = 0; i < this.st.groups; i++) this.body.push('</g>');
    this.st = this.stack.pop();
  }

  // ---- transforms
  setTransform(a, b, c, d, e, f) { if (typeof a === 'object' && a) ({ a, b, c, d, e, f } = a); this.st.m = [a, b, c, d, e, f]; }
  resetTransform() { this.st.m = [1, 0, 0, 1, 0, 0]; }
  transform(a, b, c, d, e, f) { this.st.m = mul(this.st.m, [a, b, c, d, e, f]); }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.transform(c, s, -s, c, 0, 0); }
  getTransform() { const [a, b, c, d, e, f] = this.st.m; return { a, b, c, d, e, f }; }
  pt(x, y) { const m = this.st.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  get scaleFactor() { const m = this.st.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }

  // ---- paths (stored in device coordinates)
  beginPath() { this.path = []; this.cur = null; this.start = null; }
  moveTo(x, y) { const [X, Y] = this.pt(x, y); this.path.push(`M${num(X)} ${num(Y)}`); this.cur = [X, Y]; this.start = [X, Y]; }
  lineTo(x, y) { if (!this.cur) { this.moveTo(x, y); return; } const [X, Y] = this.pt(x, y); this.path.push(`L${num(X)} ${num(Y)}`); this.cur = [X, Y]; }
  closePath() { if (this.cur) { this.path.push('Z'); this.cur = this.start ? this.start.slice() : null; } }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this.cur) this.moveTo(cx, cy);
    const [A, B] = this.pt(cx, cy), [X, Y] = this.pt(x, y);
    this.path.push(`Q${num(A)} ${num(B)} ${num(X)} ${num(Y)}`); this.cur = [X, Y];
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (!this.cur) this.moveTo(c1x, c1y);
    const [A, B] = this.pt(c1x, c1y), [C, D] = this.pt(c2x, c2y), [X, Y] = this.pt(x, y);
    this.path.push(`C${num(A)} ${num(B)} ${num(C)} ${num(D)} ${num(X)} ${num(Y)}`); this.cur = [X, Y];
  }
  arc(cx, cy, r, a0, a1, ccw = false) { this.ellipse(cx, cy, r, r, 0, a0, a1, ccw); }
  ellipse(cx, cy, rx, ry, rot, a0, a1, ccw = false) {
    const TAU = Math.PI * 2;
    let sweep = a1 - a0;
    if (!ccw) { if (sweep >= TAU) sweep = TAU; else { sweep %= TAU; if (sweep < 0) sweep += TAU; if (sweep === 0 && a1 !== a0) sweep = TAU; } }
    else { if (-sweep >= TAU) sweep = -TAU; else { sweep %= TAU; if (sweep > 0) sweep -= TAU; if (sweep === 0 && a1 !== a0) sweep = -TAU; } }
    const n = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n;
      const ex = rx * Math.cos(a), ey = ry * Math.sin(a);
      const x = cx + ex * cr - ey * sr, y = cy + ex * sr + ey * cr;
      if (i === 0) { if (this.cur) this.lineTo(x, y); else this.moveTo(x, y); } else this.lineTo(x, y);
    }
  }

  // ---- painting
  paintAttrs(kind) {
    const st = this.st;
    if (kind === 'fill') {
      const { color, alpha } = svgColor(st.fillStyle);
      const a = alpha * st.globalAlpha;
      return `fill="${esc(color)}"${a < 1 ? ` fill-opacity="${num(a)}"` : ''} stroke="none"`;
    }
    const { color, alpha } = svgColor(st.strokeStyle);
    const a = alpha * st.globalAlpha;
    const k = this.scaleFactor;
    const dash = st.dash.length ? ` stroke-dasharray="${st.dash.map((d) => num(d * k)).join(' ')}"` : '';
    return `fill="none" stroke="${esc(color)}"${a < 1 ? ` stroke-opacity="${num(a)}"` : ''} stroke-width="${num(st.lineWidth * k)}"${st.lineCap !== 'butt' ? ` stroke-linecap="${st.lineCap}"` : ''}${st.lineJoin !== 'miter' ? ` stroke-linejoin="${st.lineJoin}"` : ''}${dash}`;
  }
  fill(rule) {
    if (!this.path.length) return;
    const r = typeof rule === 'string' ? rule : 'nonzero';
    this.body.push(`<path d="${this.path.join('')}" ${this.paintAttrs('fill')}${r === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`);
  }
  stroke() {
    if (!this.path.length) return;
    this.body.push(`<path d="${this.path.join('')}" ${this.paintAttrs('stroke')}/>`);
  }
  clip() {
    if (!this.path.length) return;
    this.seq += 1;
    const id = `c${this.seq}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.path.join('')}"/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
    this.st.groups += 1;
  }
  fillRect(x, y, w, h) { const p = this.path, c = this.cur, s = this.start; this.beginPath(); this.rect(x, y, w, h); this.fill(); this.path = p; this.cur = c; this.start = s; }
  strokeRect(x, y, w, h) { const p = this.path, c = this.cur, s = this.start; this.beginPath(); this.rect(x, y, w, h); this.stroke(); this.path = p; this.cur = c; this.start = s; }
  clearRect() { /* the SVG background is transparent */ }

  // ---- text
  measureText(text) {
    if (this.measureCtx) { this.measureCtx.font = this.st.font; return this.measureCtx.measureText(text); }
    const f = parseFont(this.st.font);
    return { width: String(text).length * f.size * 0.55 };
  }
  fillText(text, x, y) {
    const st = this.st;
    const f = parseFont(st.font);
    const { color, alpha } = svgColor(st.fillStyle);
    const anchor = st.textAlign === 'center' ? 'middle' : st.textAlign === 'right' || st.textAlign === 'end' ? 'end' : 'start';
    const base = { top: 'hanging', hanging: 'hanging', middle: 'central', bottom: 'text-after-edge', ideographic: 'text-after-edge' }[st.textBaseline];
    const [a, b, c, d, e, g] = st.m;
    const a2 = alpha * st.globalAlpha;
    this.body.push(`<text transform="matrix(${r4(a)} ${r4(b)} ${r4(c)} ${r4(d)} ${num(e)} ${num(g)})" x="${num(x)}" y="${num(y)}" font-family="${esc(f.family.replace(/"/g, "'"))}" font-size="${num(f.size)}"${f.weight !== 'normal' ? ` font-weight="${f.weight}"` : ''}${f.style !== 'normal' ? ` font-style="${f.style}"` : ''} fill="${esc(color)}"${a2 < 1 ? ` fill-opacity="${num(a2)}"` : ''}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${base ? ` dominant-baseline="${base}"` : ''} xml:space="preserve">${esc(text)}</text>`);
  }
  strokeText() { /* not used by the renderers */ }

  // ---- images
  drawImage(img, ...a) {
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
    if (a.length === 2) { [dx, dy] = a; dw = img.width; dh = img.height; }
    else if (a.length === 4) { [dx, dy, dw, dh] = a; }
    else if (a.length === 8) { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
    else return;
    const url = imageUrl(img, sx, sy, sw, sh);
    if (!url) return;
    const [m0, m1, m2, m3, m4, m5] = this.st.m;
    const op = this.st.globalAlpha < 1 ? ` opacity="${num(this.st.globalAlpha)}"` : '';
    this.body.push(`<image transform="matrix(${r4(m0)} ${r4(m1)} ${r4(m2)} ${r4(m3)} ${num(m4)} ${num(m5)})" x="${num(dx)}" y="${num(dy)}" width="${num(dw)}" height="${num(dh)}" preserveAspectRatio="none"${this.st.imageSmoothingEnabled ? '' : ' style="image-rendering:pixelated"'}${op} href="${url}"/>`);
  }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData() { /* images reach the recorder through drawImage */ }

  toString() {
    const w = num(this.width), h = num(this.height);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<defs>${this.defs.join('')}</defs>\n${this.body.join('\n')}\n${'</g>'.repeat(this.st.groups + this.stack.reduce((s, x) => s + x.groups, 0))}</svg>\n`;
  }
}

/** A PNG data URL of (part of) a canvas / OffscreenCanvas / image. */
function imageUrl(img, sx, sy, sw, sh) {
  if (typeof document === 'undefined') return img && img.dataUrl ? img.dataUrl : null;
  const full = sx === 0 && sy === 0 && sw === img.width && sh === img.height;
  if (full && typeof img.toDataURL === 'function') { try { return img.toDataURL('image/png'); } catch { return null; } }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
  try { c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return c.toDataURL('image/png'); } catch { return null; }
}

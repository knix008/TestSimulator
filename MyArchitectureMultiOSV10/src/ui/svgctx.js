// A small stand-in for CanvasRenderingContext2D that records SVG.
//
// The plan renderer draws through the canvas API; handing it
// this object instead turns the very same drawing code into vector output for
// printing, SVG export and PDF (via the browser's print-to-PDF). Only the
// subset that renderer uses is implemented. Arcs are flattened to polylines
// so any transform (including mirroring) stays exact.

function mul(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n) => (Math.abs(n) < 1e-9 ? "0" : (+n.toFixed(3)).toString());

export class SvgContext {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = { width, height };
    this.parts = [];
    this.m = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.path = [];
    this.cur = null;
    this.fillStyle = "#000";
    this.strokeStyle = "#000";
    this.lineWidth = 1;
    this.lineCap = "butt";
    this.lineJoin = "miter";
    this.font = "10px sans-serif";
    this.textAlign = "start";
    this.textBaseline = "alphabetic";
    this.globalAlpha = 1;
    this.globalCompositeOperation = "source-over";
    this.dash = [];
    this.clipId = 0;
  }

  save() {
    this.stack.push({ m: this.m.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineCap: this.lineCap, lineJoin: this.lineJoin, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, globalAlpha: this.globalAlpha, dash: this.dash.slice() });
  }

  restore() {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
  }

  setTransform(a, b, c, d, e, g) {
    if (typeof a === "object") this.m = [a.a, a.b, a.c, a.d, a.e, a.f];
    else this.m = [a, b, c, d, e, g];
  }

  getTransform() {
    const [a, b, c, d, e, g] = this.m;
    return { a, b, c, d, e, f: g };
  }

  resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; }
  transform(a, b, c, d, e, g) { this.m = mul(this.m, [a, b, c, d, e, g]); }
  translate(x, y) { this.m = mul(this.m, [1, 0, 0, 1, x, y]); }
  scale(x, y) { this.m = mul(this.m, [x, 0, 0, y, 0, 0]); }
  rotate(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.m = mul(this.m, [c, s, -s, c, 0, 0]);
  }

  setLineDash(d) { this.dash = d || []; }
  getLineDash() { return this.dash; }

  pt(x, y) {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  scaleFactor() {
    return Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2]));
  }

  beginPath() { this.path = []; this.cur = null; }
  moveTo(x, y) { const p = this.pt(x, y); this.path.push(`M${f(p[0])} ${f(p[1])}`); this.cur = [x, y]; this.start = [x, y]; }
  lineTo(x, y) {
    if (!this.cur) return this.moveTo(x, y);
    const p = this.pt(x, y);
    this.path.push(`L${f(p[0])} ${f(p[1])}`);
    this.cur = [x, y];
  }
  closePath() { this.path.push("Z"); if (this.start) this.cur = this.start.slice(); }

  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  arc(cx, cy, r, a0, a1, ccw = false) {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep += Math.PI * 2;
    if (ccw && sweep > 0) sweep -= Math.PI * 2;
    if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9) sweep = ccw ? -Math.PI * 2 : Math.PI * 2;
    const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (sweep * i) / steps;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0 && !this.cur) this.moveTo(x, y);
      else this.lineTo(x, y);
    }
  }

  ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) {
    this.save();
    this.translate(cx, cy);
    this.rotate(rot);
    this.scale(rx, ry);
    this.arc(0, 0, 1, a0, a1, ccw);
    this.restore();
  }

  arcTo(x1, y1, x2, y2, r) {
    // Approximate with a quadratic-ish polyline through the corner.
    if (!this.cur) this.moveTo(x1, y1);
    const [x0, y0] = this.cur;
    const v1 = [x0 - x1, y0 - y1];
    const v2 = [x2 - x1, y2 - y1];
    const l1 = Math.hypot(...v1) || 1;
    const l2 = Math.hypot(...v2) || 1;
    const t = Math.min(r, l1, l2);
    const a = [x1 + (v1[0] / l1) * t, y1 + (v1[1] / l1) * t];
    const b = [x1 + (v2[0] / l2) * t, y1 + (v2[1] / l2) * t];
    this.lineTo(a[0], a[1]);
    for (let i = 1; i <= 6; i++) {
      const u = i / 6;
      const x = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * x1 + u * u * b[0];
      const y = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * y1 + u * u * b[1];
      this.lineTo(x, y);
    }
  }

  roundRect(x, y, w, h, r = 0) {
    const rr = Math.min(typeof r === "number" ? r : r[0] || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  }

  style(kind) {
    const op = this.globalAlpha < 1 ? ` opacity="${f(this.globalAlpha)}"` : "";
    if (kind === "fill") return `fill="${esc(this.fillStyle)}" stroke="none"${op}`;
    const w = this.lineWidth * this.scaleFactor();
    const dash = this.dash.length ? ` stroke-dasharray="${this.dash.map((d) => f(d * this.scaleFactor())).join(" ")}"` : "";
    return `fill="none" stroke="${esc(this.strokeStyle)}" stroke-width="${f(w)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${dash}${op}`;
  }

  fill(rule) {
    if (!this.path.length) return;
    if (this.globalCompositeOperation === "destination-out") return;
    this.parts.push(`<path d="${this.path.join("")}" ${this.style("fill")}${rule === "evenodd" ? ' fill-rule="evenodd"' : ""}/>`);
  }

  stroke() {
    if (!this.path.length) return;
    this.parts.push(`<path d="${this.path.join("")}" ${this.style("stroke")}/>`);
  }

  fillRect(x, y, w, h) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
  }

  strokeRect(x, y, w, h) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
  }

  clearRect() {}

  measureText(text) {
    const size = parseFloat((this.font.match(/([\d.]+)px/) || [0, 10])[1]);
    return { width: String(text).length * size * 0.6 };
  }

  fillText(text, x, y) {
    const size = parseFloat((this.font.match(/([\d.]+)px/) || [0, 10])[1]);
    const family = (this.font.match(/px\s+(.*)$/) || [0, "sans-serif"])[1].replace(/"/g, "'");
    const weight = /bold/.test(this.font) ? ' font-weight="bold"' : "";
    const anchor = this.textAlign === "center" ? "middle" : this.textAlign === "right" || this.textAlign === "end" ? "end" : "start";
    const base = this.textBaseline === "middle" ? "central" : this.textBaseline === "top" ? "hanging" : this.textBaseline === "bottom" ? "text-after-edge" : "alphabetic";
    const m = this.m;
    const op = this.globalAlpha < 1 ? ` opacity="${f(this.globalAlpha)}"` : "";
    this.parts.push(`<text transform="matrix(${m.map(f).join(" ")})" x="${f(x)}" y="${f(y)}" font-size="${f(size)}" font-family="${esc(family)}"${weight} text-anchor="${anchor}" dominant-baseline="${base}" fill="${esc(this.fillStyle)}"${op}>${esc(text)}</text>`);
  }

  strokeText() {}
  drawImage() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }

  toString(background) {
    const bg = background ? `<rect width="100%" height="100%" fill="${esc(background)}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(this.width)} ${f(this.height)}" width="${f(this.width)}" height="${f(this.height)}">${bg}${this.parts.join("")}</svg>`;
  }
}

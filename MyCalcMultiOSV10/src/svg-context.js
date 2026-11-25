// A stand-in for a canvas 2D context that writes SVG instead of pixels. The
// graph draws through it exactly as it draws on screen, so the saved file holds
// real lines, shapes and text rather than a picture of them. Only the drawing
// calls the graph uses are covered; text is measured on a real canvas.

function svgEscape(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

// A colour as SVG wants it: rgb() or #hex for the paint, and the alpha apart,
// since not every reader of SVG understands rgba().
function svgPaint(color) {
  const text = String(color || "").trim();
  const rgba = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (rgba) {
    let alpha = rgba[4] === undefined ? 1 : rgba[4].endsWith("%") ? parseFloat(rgba[4]) / 100 : parseFloat(rgba[4]);
    if (!Number.isFinite(alpha)) alpha = 1;
    const channel = (value) => Math.max(0, Math.min(255, Math.round(parseFloat(value))));
    return { paint: `rgb(${channel(rgba[1])},${channel(rgba[2])},${channel(rgba[3])})`, alpha };
  }
  const hex8 = text.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i);
  if (hex8) return { paint: `#${hex8[1]}`, alpha: parseInt(hex8[2], 16) / 255 };
  if (/^transparent$/i.test(text)) return { paint: "none", alpha: 0 };
  return { paint: text || "#000", alpha: 1 };
}

class SvgGradient {
  constructor(owner, x0, y0, x1, y1) {
    this.owner = owner;
    this.id = owner.nextId("g");
    this.from = owner.point(x0, y0);
    this.to = owner.point(x1, y1);
    this.stops = [];
    this.written = false;
  }

  addColorStop(offset, color) {
    this.stops.push([offset, color]);
  }

  ref() {
    if (!this.written) {
      this.written = true;
      const stops = this.stops
        .map(([offset, color]) => {
          const { paint, alpha } = svgPaint(color);
          return `<stop offset="${svgNumber(offset)}" stop-color="${paint}" stop-opacity="${svgNumber(alpha)}"/>`;
        })
        .join("");
      this.owner.defs.push(
        `<linearGradient id="${this.id}" gradientUnits="userSpaceOnUse" x1="${svgNumber(this.from[0])}" y1="${svgNumber(this.from[1])}" x2="${svgNumber(this.to[0])}" y2="${svgNumber(this.to[1])}">${stops}</linearGradient>`,
      );
    }
    return `url(#${this.id})`;
  }
}

class SvgContext {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.body = [];
    this.defs = [];
    this.counter = 0;
    this.path = [];
    this.stack = [];
    this.state = {
      fillStyle: "#000",
      strokeStyle: "#000",
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      globalAlpha: 1,
      font: "10px sans-serif",
      textAlign: "start",
      textBaseline: "alphabetic",
      dash: [],
      matrix: [1, 0, 0, 1, 0, 0],
      clip: null,
    };
    this.measure = document.createElement("canvas").getContext("2d");
    this.canvas = { width, height };
  }

  nextId(prefix) {
    this.counter += 1;
    return `${prefix}${this.counter}`;
  }

  // ----- state -----
  get fillStyle() { return this.state.fillStyle; }
  set fillStyle(value) { this.state.fillStyle = value; }
  get strokeStyle() { return this.state.strokeStyle; }
  set strokeStyle(value) { this.state.strokeStyle = value; }
  get lineWidth() { return this.state.lineWidth; }
  set lineWidth(value) { if (Number.isFinite(value) && value > 0) this.state.lineWidth = value; }
  get lineCap() { return this.state.lineCap; }
  set lineCap(value) { this.state.lineCap = value; }
  get lineJoin() { return this.state.lineJoin; }
  set lineJoin(value) { this.state.lineJoin = value; }
  get globalAlpha() { return this.state.globalAlpha; }
  set globalAlpha(value) { if (Number.isFinite(value)) this.state.globalAlpha = Math.max(0, Math.min(1, value)); }
  get font() { return this.state.font; }
  set font(value) { this.state.font = value; }
  get textAlign() { return this.state.textAlign; }
  set textAlign(value) { this.state.textAlign = value; }
  get textBaseline() { return this.state.textBaseline; }
  set textBaseline(value) { this.state.textBaseline = value; }

  save() {
    this.stack.push({ ...this.state, dash: [...this.state.dash], matrix: [...this.state.matrix] });
  }

  restore() {
    const top = this.stack.pop();
    if (top) this.state = top;
  }

  setLineDash(list) {
    this.state.dash = Array.isArray(list) ? list.filter((value) => Number.isFinite(value) && value >= 0) : [];
  }

  getLineDash() {
    return [...this.state.dash];
  }

  // ----- transforms -----
  transform(a, b, c, d, e, f) {
    const [A, B, C, D, E, F] = this.state.matrix;
    this.state.matrix = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }

  setTransform(a, b, c, d, e, f) {
    if (typeof a === "object" && a) this.state.matrix = [a.a, a.b, a.c, a.d, a.e, a.f];
    else if (arguments.length >= 6) this.state.matrix = [a, b, c, d, e, f];
    else this.state.matrix = [1, 0, 0, 1, 0, 0];
  }

  resetTransform() {
    this.state.matrix = [1, 0, 0, 1, 0, 0];
  }

  translate(x, y) {
    this.transform(1, 0, 0, 1, x, y);
  }

  scale(x, y) {
    this.transform(x, 0, 0, y, 0, 0);
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.transform(cos, sin, -sin, cos, 0, 0);
  }

  point(x, y) {
    const [a, b, c, d, e, f] = this.state.matrix;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  // How much the transform stretches a line width.
  stretch() {
    const [a, b, c, d] = this.state.matrix;
    return Math.sqrt(Math.abs(a * d - b * c)) || 1;
  }

  // ----- paths -----
  beginPath() {
    this.path = [];
    this.pen = null;
    this.start = null;
  }

  moveTo(x, y) {
    const [px, py] = this.point(x, y);
    this.path.push(`M${svgNumber(px)} ${svgNumber(py)}`);
    this.pen = [x, y];
    this.start = [x, y];
  }

  lineTo(x, y) {
    if (!this.pen) {
      this.moveTo(x, y);
      return;
    }
    const [px, py] = this.point(x, y);
    this.path.push(`L${svgNumber(px)} ${svgNumber(py)}`);
    this.pen = [x, y];
  }

  closePath() {
    if (!this.path.length) return;
    this.path.push("Z");
    if (this.start) this.pen = [...this.start];
  }

  quadraticCurveTo(cx, cy, x, y) {
    if (!this.pen) this.moveTo(cx, cy);
    const [qx, qy] = this.point(cx, cy);
    const [px, py] = this.point(x, y);
    this.path.push(`Q${svgNumber(qx)} ${svgNumber(qy)} ${svgNumber(px)} ${svgNumber(py)}`);
    this.pen = [x, y];
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (!this.pen) this.moveTo(c1x, c1y);
    const [ax, ay] = this.point(c1x, c1y);
    const [bx, by] = this.point(c2x, c2y);
    const [px, py] = this.point(x, y);
    this.path.push(`C${svgNumber(ax)} ${svgNumber(ay)} ${svgNumber(bx)} ${svgNumber(by)} ${svgNumber(px)} ${svgNumber(py)}`);
    this.pen = [x, y];
  }

  // Arcs go in as short straight runs, so any transform still bends them right.
  arc(x, y, radius, start, end, counter = false) {
    let sweep = end - start;
    if (counter) {
      if (sweep > 0) sweep -= Math.ceil(sweep / (2 * Math.PI)) * 2 * Math.PI;
      if (sweep < -2 * Math.PI) sweep = -2 * Math.PI;
    } else {
      if (sweep < 0) sweep += Math.ceil(-sweep / (2 * Math.PI)) * 2 * Math.PI;
      if (sweep > 2 * Math.PI) sweep = 2 * Math.PI;
    }
    const steps = Math.max(4, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 48));
    for (let i = 0; i <= steps; i++) {
      const angle = start + (sweep * i) / steps;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0 && !this.pen) this.moveTo(px, py);
      else this.lineTo(px, py);
    }
  }

  ellipse(x, y, rx, ry, rotation, start, end, counter = false) {
    this.save();
    this.translate(x, y);
    this.rotate(rotation || 0);
    this.scale(rx, ry);
    this.arc(0, 0, 1, start, end, counter);
    this.restore();
  }

  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  roundRect(x, y, w, h, radii = 0) {
    const r = Math.max(0, Math.min(Array.isArray(radii) ? Number(radii[0]) || 0 : Number(radii) || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    if (!r) {
      this.rect(x, y, w, h);
      return;
    }
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
  }

  createLinearGradient(x0, y0, x1, y1) {
    return new SvgGradient(this, x0, y0, x1, y1);
  }

  // ----- painting -----
  paintOf(style) {
    if (style instanceof SvgGradient) return { paint: style.ref(), alpha: 1 };
    if (style && typeof style === "object") return { paint: "#000", alpha: 1 };
    return svgPaint(style);
  }

  clipAttr() {
    return this.state.clip ? ` clip-path="url(#${this.state.clip})"` : "";
  }

  fill(rule) {
    if (!this.path.length) return;
    const { paint, alpha } = this.paintOf(this.state.fillStyle);
    const opacity = alpha * this.state.globalAlpha;
    if (paint === "none" || opacity <= 0) return;
    const evenodd = rule === "evenodd" ? ' fill-rule="evenodd"' : "";
    const fade = opacity < 1 ? ` fill-opacity="${svgNumber(opacity)}"` : "";
    this.body.push(`<path d="${this.path.join("")}" fill="${paint}"${fade}${evenodd}${this.clipAttr()}/>`);
  }

  strokeAttrs() {
    const { paint, alpha } = this.paintOf(this.state.strokeStyle);
    const opacity = alpha * this.state.globalAlpha;
    if (paint === "none" || opacity <= 0) return null;
    const width = this.state.lineWidth * this.stretch();
    let attrs = ` fill="none" stroke="${paint}" stroke-width="${svgNumber(width)}"`;
    if (opacity < 1) attrs += ` stroke-opacity="${svgNumber(opacity)}"`;
    if (this.state.lineCap !== "butt") attrs += ` stroke-linecap="${this.state.lineCap}"`;
    if (this.state.lineJoin !== "miter") attrs += ` stroke-linejoin="${this.state.lineJoin}"`;
    if (this.state.dash.length) attrs += ` stroke-dasharray="${this.state.dash.map((value) => svgNumber(value * this.stretch())).join(" ")}"`;
    return attrs;
  }

  stroke() {
    if (!this.path.length) return;
    const attrs = this.strokeAttrs();
    if (!attrs) return;
    this.body.push(`<path d="${this.path.join("")}"${attrs}${this.clipAttr()}/>`);
  }

  clip() {
    if (!this.path.length) return;
    const id = this.nextId("c");
    const inner = this.state.clip ? ` clip-path="url(#${this.state.clip})"` : "";
    this.defs.push(`<clipPath id="${id}"><path d="${this.path.join("")}"${inner}/></clipPath>`);
    this.state.clip = id;
  }

  fillRect(x, y, w, h) {
    const saved = this.path;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.path = saved;
  }

  strokeRect(x, y, w, h) {
    const saved = this.path;
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.path = saved;
  }

  // The file starts empty, and the graph only clears the whole picture.
  clearRect() {}

  // ----- text -----
  fontParts() {
    const match = String(this.state.font).match(/^\s*(.*?)\s*(\d+(?:\.\d+)?)px\s+(.+)$/);
    if (!match) return { size: 10, family: "sans-serif", weight: "", style: "" };
    const words = match[1].split(/\s+/).filter(Boolean);
    const weight = words.find((word) => /^(bold|bolder|lighter|\d{3})$/i.test(word)) || "";
    const style = words.find((word) => /^(italic|oblique)$/i.test(word)) || "";
    return { size: parseFloat(match[2]), family: match[3], weight, style };
  }

  measureText(text) {
    this.measure.font = this.state.font;
    return this.measure.measureText(String(text));
  }

  textElement(text, x, y, paintAttrs) {
    const { size, family, weight, style } = this.fontParts();
    const anchor = { center: "middle", right: "end", end: "end" }[this.state.textAlign] || "start";
    const baseline = {
      top: "text-before-edge",
      hanging: "hanging",
      middle: "central",
      bottom: "text-after-edge",
      ideographic: "ideographic",
    }[this.state.textBaseline];
    const [a, b, c, d, e, f] = this.state.matrix;
    let place;
    if (b === 0 && c === 0 && a === 1 && d === 1) {
      place = ` x="${svgNumber(x + e)}" y="${svgNumber(y + f)}"`;
    } else {
      place = ` x="${svgNumber(x)}" y="${svgNumber(y)}" transform="matrix(${[a, b, c, d, e, f].map((value) => svgNumber(value)).join(" ")})"`;
    }
    let attrs = `${place} font-family="${svgEscape(family)}" font-size="${svgNumber(size)}"`;
    if (weight) attrs += ` font-weight="${weight}"`;
    if (style) attrs += ` font-style="${style}"`;
    if (anchor !== "start") attrs += ` text-anchor="${anchor}"`;
    if (baseline) attrs += ` dominant-baseline="${baseline}"`;
    this.body.push(`<text${attrs}${paintAttrs}${this.clipAttr()}>${svgEscape(text)}</text>`);
  }

  fillText(text, x, y) {
    const { paint, alpha } = this.paintOf(this.state.fillStyle);
    const opacity = alpha * this.state.globalAlpha;
    if (paint === "none" || opacity <= 0) return;
    this.textElement(text, x, y, ` fill="${paint}"${opacity < 1 ? ` fill-opacity="${svgNumber(opacity)}"` : ""}`);
  }

  strokeText(text, x, y) {
    const attrs = this.strokeAttrs();
    if (!attrs) return;
    this.textElement(text, x, y, attrs);
  }

  // The finished file. `scale` is the device pixel ratio the picture was drawn
  // at, so the file opens at the size the plot had on screen.
  toString(scale = 1) {
    const w = this.width;
    const h = this.height;
    const defs = this.defs.length ? `<defs>${this.defs.join("")}</defs>` : "";
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(w / scale)}" height="${svgNumber(h / scale)}" viewBox="0 0 ${w} ${h}">` +
      defs +
      this.body.join("\n") +
      `</svg>\n`
    );
  }
}

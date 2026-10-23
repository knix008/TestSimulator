// Gerber (RS-274X / X2) and Excellon readers for the fab preview viewer.
//
// parseGerber returns geometry in millimetres in Gerber's own frame (y up),
// whatever the file's units. Supported: FS/MO, standard apertures C R O P,
// aperture macros (primitives 1 4 5 7 20 21, $variables and arithmetic),
// LP polarity, G01/G02/G03 with G74/G75, regions G36/G37, D01/D02/D03,
// X2 attributes (TF kept, TA/TO/TD skipped). Step-repeat and LM/LR/LS are
// ignored. Macro primitives with exposure off are kept but not rendered.

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- macro expressions
function evalExpr(src, vars) {
  const s = src.replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  function primary() {
    const c = peek();
    if (c === "(") { i++; const v = sum(); i++; return v; }
    if (c === "-") { i++; return -primary(); }
    if (c === "+") { i++; return primary(); }
    if (c === "$") {
      i++;
      const m = /^\d+/.exec(s.slice(i));
      i += m ? m[0].length : 0;
      return m ? vars[+m[0]] ?? 0 : 0;
    }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) { i = s.length; return 0; }
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function product() {
    let v = primary();
    while (peek() === "x" || peek() === "X" || peek() === "/") {
      const op = s[i++];
      const r = primary();
      v = op === "/" ? v / r : v * r;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  return sum();
}

const rot2 = (x, y, deg) => {
  if (!deg) return [x, y];
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [x * c - y * s, x * s + y * c];
};

function regularPolygon(cx, cy, d, n, rotDeg) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (rotDeg + (360 * k) / n) * DEG;
    pts.push([cx + (d / 2) * Math.cos(a), cy + (d / 2) * Math.sin(a)]);
  }
  return pts;
}

// Macro body + parameters -> shapes [{kind:"circle", x, y, d, exposure} | {kind:"poly", pts, exposure}]
function evalMacro(lines, params, k) {
  const vars = [0, ...params];
  const shapes = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "0" || line.startsWith("0 ")) continue;
    const asg = /^\$(\d+)=(.*)$/.exec(line);
    if (asg) { vars[+asg[1]] = evalExpr(asg[2], vars); continue; }
    const f = line.split(",").map((e) => evalExpr(e, vars));
    const code = Math.round(f[0]);
    if (code === 1) {
      const [x, y] = rot2(f[3] * k, f[4] * k, f[5] || 0);
      shapes.push({ kind: "circle", exposure: f[1], d: f[2] * k, x, y });
    } else if (code === 20 || code === 2) {
      const w = f[2] * k;
      const [sx, sy, ex, ey] = [f[3] * k, f[4] * k, f[5] * k, f[6] * k];
      const len = Math.hypot(ex - sx, ey - sy) || 1;
      const nx = (-(ey - sy) / len) * (w / 2);
      const ny = ((ex - sx) / len) * (w / 2);
      const pts = [[sx + nx, sy + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sx - nx, sy - ny]].map(([x, y]) => rot2(x, y, f[7] || 0));
      shapes.push({ kind: "poly", exposure: f[1], pts });
    } else if (code === 21) {
      const w = f[2] * k;
      const h = f[3] * k;
      const cx = f[4] * k;
      const cy = f[5] * k;
      const pts = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]].map(([x, y]) => rot2(x, y, f[6] || 0));
      shapes.push({ kind: "poly", exposure: f[1], pts });
    } else if (code === 22) {
      // legacy lower-left line
      const w = f[2] * k;
      const h = f[3] * k;
      const x0 = f[4] * k;
      const y0 = f[5] * k;
      const pts = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) => rot2(x, y, f[6] || 0));
      shapes.push({ kind: "poly", exposure: f[1], pts });
    } else if (code === 4) {
      const n = Math.round(f[2]);
      const pts = [];
      for (let j = 0; j <= n; j++) pts.push(rot2(f[3 + j * 2] * k, f[4 + j * 2] * k, f[5 + n * 2] || 0));
      shapes.push({ kind: "poly", exposure: f[1], pts });
    } else if (code === 5) {
      const [cx, cy] = rot2(f[3] * k, f[4] * k, f[6] || 0);
      shapes.push({ kind: "poly", exposure: f[1], pts: regularPolygon(cx, cy, f[5] * k, Math.round(f[2]), f[6] || 0) });
    } else if (code === 7) {
      // Thermal: approximated as the outer disc with the inner disc cleared.
      const [cx, cy] = rot2(f[1] * k, f[2] * k, f[6] || 0);
      shapes.push({ kind: "circle", exposure: 1, d: f[3] * k, x: cx, y: cy });
      shapes.push({ kind: "circle", exposure: 0, d: f[4] * k, x: cx, y: cy });
    } else if (code === 6) {
      const [cx, cy] = rot2(f[1] * k, f[2] * k, f[9] || 0);
      shapes.push({ kind: "circle", exposure: 1, d: f[3] * k, x: cx, y: cy });
    }
  }
  return shapes;
}

function obround(w, h) {
  const pts = [];
  const r = Math.min(w, h) / 2;
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  const corners = w >= h ? [[hx, 0, -90], [-hx, 0, 90]] : [[0, hy, 0], [0, -hy, 180]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= 12; i++) {
    const a = (a0 + (180 * i) / 12) * DEG;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function standardShapes(type, p, k) {
  if (type === "C") return [{ kind: "circle", exposure: 1, d: p[0] * k, x: 0, y: 0 }];
  if (type === "R") {
    const w = p[0] * k;
    const h = (p[1] ?? p[0]) * k;
    return [{ kind: "poly", exposure: 1, pts: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] }];
  }
  if (type === "O") {
    const w = p[0] * k;
    const h = (p[1] ?? p[0]) * k;
    if (Math.abs(w - h) < 1e-9) return [{ kind: "circle", exposure: 1, d: w, x: 0, y: 0 }];
    return [{ kind: "poly", exposure: 1, pts: obround(w, h) }];
  }
  if (type === "P") return [{ kind: "poly", exposure: 1, pts: regularPolygon(0, 0, p[0] * k, Math.round(p[1] || 3), p[2] || 0) }];
  return [];
}

function shapesRadius(shapes) {
  let r = 0;
  for (const s of shapes) {
    if (s.kind === "circle") r = Math.max(r, Math.hypot(s.x, s.y) + s.d / 2);
    else for (const [x, y] of s.pts) r = Math.max(r, Math.hypot(x, y));
  }
  return r;
}

// ---------------------------------------------------------------- tokenizer
function tokenize(text) {
  const src = text.replace(/[\r\n]+/g, "");
  const out = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === "%") {
      const j = src.indexOf("%", i + 1);
      const end = j < 0 ? src.length : j;
      out.push({ ext: true, body: src.slice(i + 1, end) });
      i = end + 1;
    } else {
      const j = src.indexOf("*", i);
      const end = j < 0 ? src.length : j;
      const word = src.slice(i, end).trim();
      if (word) out.push({ ext: false, body: word });
      i = end + 1;
    }
  }
  return out;
}

export function parseGerber(text) {
  const st = {
    units: "mm", k: 1, fmt: { xi: 3, xd: 6, yi: 3, yd: 6, zeros: "L" },
    x: 0, y: 0, interp: 1, quadrant: "multi", ap: null, pol: "dark", region: null,
  };
  const apertures = {};
  const macros = {};
  const primitives = [];
  const attributes = {};
  const bounds = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const grow = (x, y, r = 0) => {
    bounds.x1 = Math.min(bounds.x1, x - r); bounds.y1 = Math.min(bounds.y1, y - r);
    bounds.x2 = Math.max(bounds.x2, x + r); bounds.y2 = Math.max(bounds.y2, y + r);
  };
  let ended = false;

  const coord = (s, axis) => {
    if (s.includes(".")) return parseFloat(s) * st.k;
    const ints = axis === "x" ? st.fmt.xi : st.fmt.yi;
    const decs = axis === "x" ? st.fmt.xd : st.fmt.yd;
    let neg = false;
    let d = s;
    if (d[0] === "+" || d[0] === "-") { neg = d[0] === "-"; d = d.slice(1); }
    if (st.fmt.zeros === "T") d = d.padEnd(ints + decs, "0");
    const v = parseInt(d || "0", 10) / 10 ** decs;
    return (neg ? -v : v) * st.k;
  };

  const arcCenter = (x1, y1, x2, y2, i, j, cw) => {
    if (st.quadrant === "multi") return [x1 + i, y1 + j];
    // Single quadrant: unsigned offsets; pick the centre that fits best.
    let best = null;
    for (const [si, sj] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cx = x1 + si * Math.abs(i);
      const cy = y1 + sj * Math.abs(j);
      const r1 = Math.hypot(x1 - cx, y1 - cy);
      const r2 = Math.hypot(x2 - cx, y2 - cy);
      let sweep = Math.atan2(y2 - cy, x2 - cx) - Math.atan2(y1 - cy, x1 - cx);
      if (cw) sweep = -sweep;
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const err = Math.abs(r1 - r2) + (sweep > Math.PI / 2 + 1e-6 ? 1e6 : 0);
      if (!best || err < best.err) best = { err, cx, cy };
    }
    return [best.cx, best.cy];
  };

  // Points along an arc (for regions and bounds).
  const arcPoints = (x1, y1, x2, y2, cx, cy, cw) => {
    const r = Math.hypot(x1 - cx, y1 - cy);
    const a1 = Math.atan2(y1 - cy, x1 - cx);
    let a2 = Math.atan2(y2 - cy, x2 - cx);
    let sweep = a2 - a1;
    if (cw) { if (sweep >= -1e-9) sweep -= 2 * Math.PI; } else if (sweep <= 1e-9) sweep += 2 * Math.PI;
    if (st.quadrant === "single" && Math.abs(sweep) > Math.PI / 2 + 1e-6) sweep = cw ? sweep + 2 * Math.PI : sweep - 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / (5 * DEG)));
    const pts = [];
    for (let s = 1; s <= n; s++) {
      const a = a1 + (sweep * s) / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    pts[pts.length - 1] = [x2, y2];
    a2 = a1 + sweep;
    return { pts, r, a1, a2 };
  };

  const doExt = (body) => {
    const code = body.slice(0, 2);
    if (code === "FS") {
      const m = /X(\d)(\d)Y(\d)(\d)/.exec(body);
      if (m) st.fmt = { xi: +m[1], xd: +m[2], yi: +m[3], yd: +m[4], zeros: body[2] === "T" ? "T" : "L" };
    } else if (code === "MO") {
      st.units = body.includes("IN") ? "in" : "mm";
      st.k = st.units === "in" ? 25.4 : 1;
    } else if (code === "AM") {
      const parts = body.split("*");
      macros[parts[0].slice(2)] = parts.slice(1).filter((l) => l.trim());
    } else if (code === "AD") {
      for (const cmd of body.split("*")) {
        const m = /^ADD(\d+)([^,]+),?(.*)$/.exec(cmd);
        if (!m) continue;
        const dcode = +m[1];
        const type = m[2];
        const params = m[3] ? m[3].split("X").map(Number) : [];
        const shapes = macros[type] ? evalMacro(macros[type], params, st.k) : standardShapes(type, params, st.k);
        apertures[dcode] = { code: dcode, type, params, shapes, radius: shapesRadius(shapes), diameter: type === "C" ? params[0] * st.k : null };
      }
    } else if (code === "LP") {
      st.pol = body[2] === "C" ? "clear" : "dark";
    } else if (code === "TF") {
      const [name, ...vals] = body.slice(2).replace(/\*$/, "").split(",");
      attributes[name] = vals.join(",");
    } else if (code === "IP" || code === "OF" || code === "IN" || code === "SR" || code === "LM" || code === "LR" || code === "LS" || code === "TA" || code === "TO" || code === "TD") {
      // not needed for preview
    } else {
      // Some writers put word commands (G04, ...) inside % blocks.
      for (const w of body.split("*")) if (w.trim()) doWord(w.trim());
    }
  };

  const doWord = (w) => {
    if (w.startsWith("G04")) return;
    if (w === "M02" || w === "M00" || w === "M30") { ended = true; return; }
    let rest = w;
    // Leading G codes (possibly several, e.g. "G01X..D01" or "G54D10").
    for (;;) {
      const g = /^G0*(\d+)/.exec(rest);
      if (!g) break;
      const n = +g[1];
      rest = rest.slice(g[0].length);
      if (n === 1 || n === 2 || n === 3) st.interp = n;
      else if (n === 74) st.quadrant = "single";
      else if (n === 75) st.quadrant = "multi";
      else if (n === 36) st.region = { contours: [], cur: null };
      else if (n === 37) finishRegion();
      else if (n === 70) { st.units = "in"; st.k = 25.4; }
      else if (n === 71) { st.units = "mm"; st.k = 1; }
      else if (n === 4) return;
    }
    const xm = /X([+-]?[\d.]+)/.exec(rest);
    const ym = /Y([+-]?[\d.]+)/.exec(rest);
    const im = /I([+-]?[\d.]+)/.exec(rest);
    const jm = /J([+-]?[\d.]+)/.exec(rest);
    const dm = /D0*(\d+)$/.exec(rest);
    const nx = xm ? coord(xm[1], "x") : st.x;
    const ny = ym ? coord(ym[1], "y") : st.y;
    const ii = im ? coord(im[1], "x") : 0;
    const jj = jm ? coord(jm[1], "y") : 0;
    let d = dm ? +dm[1] : (xm || ym ? 1 : null); // deprecated modal D01
    if (d === null) return;
    if (d >= 10) { st.ap = d; return; }
    if (d === 2) {
      if (st.region) {
        if (st.region.cur && st.region.cur.length > 1) st.region.contours.push(st.region.cur);
        st.region.cur = [[nx, ny]];
      }
    } else if (d === 1) {
      const arc = st.interp !== 1;
      const cw = st.interp === 2;
      if (st.region) {
        if (!st.region.cur) st.region.cur = [[st.x, st.y]];
        if (arc) {
          const [cx, cy] = arcCenter(st.x, st.y, nx, ny, ii, jj, cw);
          for (const p of arcPoints(st.x, st.y, nx, ny, cx, cy, cw).pts) st.region.cur.push(p);
        } else st.region.cur.push([nx, ny]);
      } else {
        const ap = apertures[st.ap];
        const width = ap ? (ap.diameter ?? ap.radius * 2) : 0;
        const prim = { type: "draw", polarity: st.pol, aperture: st.ap, width, x1: st.x, y1: st.y, x2: nx, y2: ny, arc: null };
        if (arc) {
          const [cx, cy] = arcCenter(st.x, st.y, nx, ny, ii, jj, cw);
          const a = arcPoints(st.x, st.y, nx, ny, cx, cy, cw);
          prim.arc = { cx, cy, r: a.r, a1: a.a1, a2: a.a2, cw };
          for (const [px, py] of a.pts) grow(px, py, width / 2);
        }
        grow(st.x, st.y, width / 2);
        grow(nx, ny, width / 2);
        primitives.push(prim);
      }
    } else if (d === 3) {
      const ap = apertures[st.ap];
      primitives.push({ type: "flash", polarity: st.pol, aperture: st.ap, x: nx, y: ny });
      grow(nx, ny, ap ? ap.radius : 0);
    }
    st.x = nx;
    st.y = ny;
  };

  const finishRegion = () => {
    const r = st.region;
    if (!r) return;
    if (r.cur && r.cur.length > 2) r.contours.push(r.cur);
    if (r.contours.length) {
      primitives.push({ type: "region", polarity: st.pol, contours: r.contours });
      for (const c of r.contours) for (const [x, y] of c) grow(x, y);
    }
    st.region = null;
  };

  for (const tok of tokenize(text)) {
    if (ended) break;
    if (tok.ext) doExt(tok.body);
    else doWord(tok.body);
  }
  if (!Number.isFinite(bounds.x1)) Object.assign(bounds, { x1: 0, y1: 0, x2: 0, y2: 0 });
  return { units: st.units, apertures, primitives, bounds, attributes, ended };
}

// ---------------------------------------------------------------- canvas renderer
// Draws in place on `ctx` (no DOM lookups). Screen = (x*scale + offsetX,
// -y*scale + offsetY): Gerber's y-up frame is flipped back for the screen.
// Clear polarity erases with destination-out, so render each layer into its
// own (offscreen) canvas and composite — or pass clearColor to paint
// knockouts in a solid colour instead.
export function renderGerberToCanvas(ctx, parsed, opts = {}) {
  const { color = "#c83434", scale = 10, offsetX = 0, offsetY = 0, clearColor = null } = opts;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, -scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const setPol = (pol) => {
    if (pol === "clear" && !clearColor) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = ctx.strokeStyle = "#000";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = ctx.strokeStyle = pol === "clear" ? clearColor : color;
    }
  };
  const fillShapes = (shapes, x, y) => {
    for (const s of shapes) {
      if (!s.exposure) continue;
      ctx.beginPath();
      if (s.kind === "circle") ctx.arc(x + s.x, y + s.y, s.d / 2, 0, Math.PI * 2);
      else s.pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
      ctx.closePath();
      ctx.fill();
    }
  };
  for (const p of parsed.primitives) {
    setPol(p.polarity);
    if (p.type === "flash") {
      const ap = parsed.apertures[p.aperture];
      if (ap) fillShapes(ap.shapes, p.x, p.y);
    } else if (p.type === "draw") {
      const ap = parsed.apertures[p.aperture];
      if (ap && ap.type === "R") ctx.lineCap = "square";
      ctx.lineWidth = Math.max(p.width, 1 / scale);
      ctx.beginPath();
      if (p.arc) {
        ctx.moveTo(p.x1, p.y1);
        const full = Math.abs(p.arc.a2 - p.arc.a1) >= Math.PI * 2 - 1e-9;
        if (full) ctx.arc(p.arc.cx, p.arc.cy, p.arc.r, p.arc.a1, p.arc.a1 + (p.arc.cw ? -2 : 2) * Math.PI, p.arc.cw);
        else ctx.arc(p.arc.cx, p.arc.cy, p.arc.r, p.arc.a1, p.arc.a2, p.arc.cw);
      } else {
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
      }
      ctx.stroke();
      ctx.lineCap = "round";
    } else if (p.type === "region") {
      for (const c of p.contours) {
        ctx.beginPath();
        c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- Excellon
// -> {units, tools: {T: diameter_mm}, holes: [{x, y, d, tool}]}  (mm, file frame)
export function parseExcellon(text) {
  let k = 1;
  let units = "mm";
  let zeros = "T"; // TZ: trailing zeros kept, leading suppressed
  let fmt = [3, 3];
  const tools = {};
  const holes = [];
  let tool = null;
  let x = 0;
  let y = 0;
  let header = false;
  const num = (s) => {
    if (s.includes(".")) return parseFloat(s) * k;
    let neg = false;
    let d = s;
    if (d[0] === "+" || d[0] === "-") { neg = d[0] === "-"; d = d.slice(1); }
    let v;
    if (zeros === "L") v = parseInt(d.padEnd(fmt[0] + fmt[1], "0"), 10) / 10 ** fmt[1];
    else v = parseInt(d, 10) / 10 ** fmt[1];
    return (neg ? -v : v) * k;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(";")) {
      const m = /FILE_FORMAT=(\d):(\d)/.exec(line);
      if (m) fmt = [+m[1], +m[2]];
      continue;
    }
    if (line === "M48") { header = true; continue; }
    if (line === "%" || line === "M95") { header = false; continue; }
    if (/^(METRIC|M71)/.test(line)) {
      units = "mm"; k = 1;
      if (/LZ/.test(line)) zeros = "L"; else if (/TZ/.test(line)) zeros = "T";
      const m = /,(0+)\.(0+)/.exec(line);
      if (m) fmt = [m[1].length, m[2].length];
      continue;
    }
    if (/^(INCH|M72)/.test(line)) {
      units = "in"; k = 25.4;
      if (/LZ/.test(line)) zeros = "L"; else if (/TZ/.test(line)) zeros = "T";
      const m = /,(0+)\.(0+)/.exec(line);
      fmt = m ? [m[1].length, m[2].length] : [2, 4];
      continue;
    }
    if (line === "M30" || line === "M00") break;
    const tdef = /^T0*(\d+)(?:F[\d.]+)?(?:S[\d.]+)?C([\d.]+)/.exec(line);
    if (tdef) { tools[+tdef[1]] = parseFloat(tdef[2]) * k; if (!header) tool = +tdef[1]; continue; }
    const tsel = /^T0*(\d+)$/.exec(line);
    if (tsel) { tool = +tsel[1] || null; continue; }
    const c = /^(?:G0?[01])?X([+-]?[\d.]+)?(?:Y([+-]?[\d.]+))?|^Y([+-]?[\d.]+)/.exec(line);
    if (c && /^(G0?[01])?[XY]/.test(line) && tool != null) {
      if (c[1] !== undefined) x = num(c[1]);
      if (c[2] !== undefined) y = num(c[2]);
      if (c[3] !== undefined) y = num(c[3]);
      holes.push({ x, y, d: tools[tool] || 0, tool });
    }
  }
  return { units, tools, holes };
}

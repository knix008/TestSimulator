// CAD import helpers for the entity types that do not map to one simple
// DXF entity: proxy graphics, ACIS solids and regions, multileaders, tables,
// raster images and wipeouts, multilines, and clipping (layout viewports,
// rays and construction lines). Shared by the DXF and DWG importers: each
// helper turns an entity's data into plain DXF-style records ({type, tags})
// in world coordinates (LINE, 3D POLYLINE, CIRCLE, ARC, TEXT, MTEXT, INSERT)
// that the importer in dxf.js then draws like any other entity, so the
// layer, colour and block transform rules stay in one place.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- tags
const num = (v, d = 0) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) ? n : d; };
function tagNum(e, code, d = 0) { for (const t of e.tags) if (t[0] === code) return num(t[1], d); return d; }
function tagStr(e, code, d = "") { for (const t of e.tags) if (t[0] === code) return String(t[1]).trim(); return d; }
// Tags that carry an entity's layer and colour (copied onto generated records).
export function styleTags(e) { return e.tags.filter(([c]) => c === 8 || c === 62 || c === 420 || c === 60); }

// ---------------------------------------------------------------- vectors
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const unit3 = (a) => { const l = len3(a); return l > 1e-12 ? mul3(a, 1 / l) : null; };
const finite3 = (p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);

// Arbitrary axis algorithm: the object coordinate system of a normal.
export function ocsAxes(n) {
  const z = unit3(n) || [0, 0, 1];
  const ax = Math.abs(z[0]) < 1 / 64 && Math.abs(z[1]) < 1 / 64 ? cross3([0, 1, 0], z) : cross3([0, 0, 1], z);
  const x = unit3(ax);
  return { x, y: cross3(z, x), z };
}
const isPlanNormal = (n) => !n || (Math.abs(n[0]) < 1e-12 && Math.abs(n[1]) < 1e-12 && n[2] > 0);

// ---------------------------------------------------------------- record builders
// World-coordinate records for generated geometry; `base` holds the style tags.
export const R = {
  line(base, a, b) { return { type: "LINE", tags: [...base, [10, a[0]], [20, a[1]], [30, a[2] || 0], [11, b[0]], [21, b[1]], [31, b[2] || 0]] }; },
  // A 3D polyline (world coordinates, flattened to the plan by the importer).
  poly(base, pts, closed = false) {
    const p = pts.filter(finite3);
    if (p.length < 2) return null;
    return { type: "POLYLINE", tags: [...base, [66, 1], [70, 8 | (closed ? 1 : 0)]], vertices: p.map((q) => ({ type: "VERTEX", tags: [[10, q[0]], [20, q[1]], [30, q[2] || 0], [70, 32]] })) };
  },
  circle(base, c, r, n) {
    if (isPlanNormal(n)) return { type: "CIRCLE", tags: [...base, [10, c[0]], [20, c[1]], [30, c[2] || 0], [40, r]] };
    const a = ocsAxes(n);
    return { type: "CIRCLE", tags: [...base, [10, dot3(c, a.x)], [20, dot3(c, a.y)], [30, dot3(c, a.z)], [40, r], [210, a.z[0]], [220, a.z[1]], [230, a.z[2]]] };
  },
  // Arc from start vector `sv` (from the centre), sweeping `sweep` radians
  // counter-clockwise about the normal (negative: clockwise).
  arc(base, c, r, n, sv, sweep) {
    const a = ocsAxes(n || [0, 0, 1]);
    let s = Math.atan2(dot3(sv, a.y), dot3(sv, a.x));
    let e = s + sweep;
    if (sweep < 0) [s, e] = [e, s];
    const deg = (x) => (x * 180) / Math.PI;
    const tags = [...base, [10, dot3(c, a.x)], [20, dot3(c, a.y)], [30, dot3(c, a.z)], [40, r], [50, deg(s)], [51, deg(e)]];
    if (!isPlanNormal(a.z)) tags.push([210, a.z[0]], [220, a.z[1]], [230, a.z[2]]);
    return { type: "ARC", tags };
  },
  // Single-line text with its baseline start at p, reading along dir.
  text(base, p, h, dir, str, n) {
    const a = ocsAxes(n || [0, 0, 1]);
    const d = dir || [1, 0, 0];
    const rot = (Math.atan2(dot3(d, a.y), dot3(d, a.x)) * 180) / Math.PI;
    const tags = [...base, [10, dot3(p, a.x)], [20, dot3(p, a.y)], [30, dot3(p, a.z)], [40, h], [1, String(str)], [50, rot]];
    if (!isPlanNormal(a.z)) tags.push([210, a.z[0]], [220, a.z[1]], [230, a.z[2]]);
    return { type: "TEXT", tags };
  },
  mtext(base, p, h, dir, str, attach = 1) {
    return { type: "MTEXT", tags: [...base, [10, p[0]], [20, p[1]], [30, p[2] || 0], [11, dir[0]], [21, dir[1]], [31, dir[2] || 0], [40, h], [71, attach], [1, String(str)]] };
  },
};

// Points of an ellipse (centre c, major axis vector M, minor axis vector m)
// from parameter t0 over `sweep` radians.
function ellipse3(c, M, m, t0, sweep) {
  const n = Math.max(8, Math.ceil((Math.abs(sweep) / TAU) * 96));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (sweep * i) / n;
    out.push(add3(c, add3(mul3(M, Math.cos(t)), mul3(m, Math.sin(t)))));
  }
  return out;
}

// ================================================================ proxy graphics
// "Proxy entity graphics": the drawing primitives AutoCAD stores with custom
// and complex entities (tables, multileaders, third-party objects) for
// programs that cannot interpret them. Little-endian: RL total size, RL
// count, then chunks of RL size, RL type, data.

export function proxyRecords(bytes, base = []) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = [];
  if (b.length < 8) return out;
  const L = (p) => dv.getUint32(p, true);
  const D = (p) => dv.getFloat64(p, true);
  const P = (p) => [D(p), D(p + 8), D(p + 16)];
  let xf = null; // model transform (4×4, row major) applied to points
  const stack = [];
  const T = (p) => (xf ? [xf[0] * p[0] + xf[1] * p[1] + xf[2] * p[2] + xf[3], xf[4] * p[0] + xf[5] * p[1] + xf[6] * p[2] + xf[7], xf[8] * p[0] + xf[9] * p[1] + xf[10] * p[2] + xf[11]] : p);
  const V = (v) => (xf ? [xf[0] * v[0] + xf[1] * v[1] + xf[2] * v[2], xf[4] * v[0] + xf[5] * v[1] + xf[6] * v[2], xf[8] * v[0] + xf[9] * v[1] + xf[10] * v[2]] : v);
  const S = () => (xf ? Math.cbrt(Math.abs(xf[0] * (xf[5] * xf[10] - xf[6] * xf[9]) - xf[1] * (xf[4] * xf[10] - xf[6] * xf[8]) + xf[2] * (xf[4] * xf[9] - xf[5] * xf[8]))) || 1 : 1);
  const ascii = (p, end) => { let s = ""; for (let i = p; i < end && b[i]; i++) s += String.fromCharCode(b[i]); return s; };
  const utf16 = (p, end) => { let s = ""; for (let i = p; i + 1 < end; i += 2) { const c = b[i] | (b[i + 1] << 8); if (!c) break; s += String.fromCharCode(c); } return s; };
  const pad4 = (n) => (n + 3) & ~3;
  let p = 8;
  const total = Math.min(b.length, Math.max(8, L(0)) || b.length);
  for (let guard = 0; p + 8 <= total && guard < 1e6; guard++) {
    const size = L(p), type = L(p + 4);
    if (size < 8 || p + size > b.length) break;
    const d = p + 8, end = p + size;
    try {
      switch (type) {
        case 2: { const c = T(P(d)), r = D(d + 24) * S(), n = V(P(d + 32)); if (r > 0) out.push(R.circle(base, c, r, n)); break; }
        case 3: { const q = circle3(T(P(d)), T(P(d + 24)), T(P(d + 48))); if (q) out.push(R.circle(base, q.c, q.r, q.n)); break; }
        case 4: {
          const c = T(P(d)), r = D(d + 24) * S(), n = V(P(d + 32)), sv = V(P(d + 56)), sw = D(d + 80);
          if (r > 0) out.push(Math.abs(sw) >= TAU - 1e-9 ? R.circle(base, c, r, n) : R.arc(base, c, r, n, sv, sw));
          break;
        }
        case 5: {
          const a = T(P(d)), m = T(P(d + 24)), e = T(P(d + 48));
          const q = circle3(a, m, e);
          if (!q) { out.push(R.line(base, a, e)); break; }
          const sv = sub3(a, q.c), ev = sub3(e, q.c), mv = sub3(m, q.c);
          const ax = ocsAxes(q.n);
          const ang = (v) => Math.atan2(dot3(v, ax.y), dot3(v, ax.x));
          const sA = ang(sv), mA = ((ang(mv) - sA) % TAU + TAU) % TAU, eA = ((ang(ev) - sA) % TAU + TAU) % TAU;
          out.push(R.arc(base, q.c, q.r, q.n, sv, mA <= eA ? eA : eA - TAU));
          break;
        }
        case 6: case 7: case 32: { // polyline, polygon, polyline with normals
          const n = L(d);
          if (n > 1e6 || d + 4 + n * 24 > end) break;
          const pts = [];
          for (let i = 0; i < n; i++) pts.push(T(P(d + 4 + i * 24)));
          const r = R.poly(base, pts, type === 7);
          if (r) out.push(r);
          break;
        }
        case 8: { // mesh: rows × columns of vertices
          const rows = L(d), cols = L(d + 4);
          if (rows * cols > 1e6 || d + 8 + rows * cols * 24 > end) break;
          const at = (i, j) => T(P(d + 8 + (i * cols + j) * 24));
          for (let i = 0; i < rows; i++) { const r = R.poly(base, Array.from({ length: cols }, (_, j) => at(i, j))); if (r) out.push(r); }
          for (let j = 0; j < cols; j++) { const r = R.poly(base, Array.from({ length: rows }, (_, i) => at(i, j))); if (r) out.push(r); }
          break;
        }
        case 9: { // shell: vertices, then a face list of (count, indices…)
          const nv = L(d);
          if (nv > 1e6 || d + 4 + nv * 24 + 4 > end) break;
          const vs = [];
          for (let i = 0; i < nv; i++) vs.push(T(P(d + 4 + i * 24)));
          let q = d + 4 + nv * 24;
          const nf = L(q);
          q += 4;
          for (let k = 0; k < nf && q + 4 <= end;) {
            const cnt = dv.getInt32(q, true);
            q += 4; k++;
            const m = Math.abs(cnt);
            if (q + m * 4 > end) break;
            const idx = [];
            for (let i = 0; i < m; i++, k++) idx.push(L(q + i * 4));
            q += m * 4;
            if (cnt > 0 && idx.every((i) => i < nv)) { const r = R.poly(base, idx.map((i) => vs[i]), true); if (r) out.push(r); }
          }
          break;
        }
        case 10: case 11: case 36: case 38: { // text, text2, unicode text, unicode text2
          const start = T(P(d)), n = V(P(d + 24)), dir = V(P(d + 48));
          let s, h;
          if (type === 10 || type === 36) {
            h = D(d + 72) * S();
            s = type === 10 ? ascii(d + 96, end) : utf16(d + 96, end);
          } else {
            s = type === 11 ? ascii(d + 72, end) : utf16(d + 72, end);
            const len = type === 11 ? pad4(s.length + 1) : pad4((s.length + 1) * 2);
            h = D(d + 72 + len + 8) * S();
          }
          if (s && h > 0) out.push(R.text(base, start, h, dir, s, n));
          break;
        }
        case 12: case 13: break; // xline, ray: unbounded
        case 29: case 30: { // push model transform
          stack.push(xf);
          const m = [];
          for (let i = 0; i < 16; i++) m.push(D(d + i * 8));
          xf = xf ? mul4(xf, m) : m;
          break;
        }
        case 31: xf = stack.length ? stack.pop() : null; break;
        default: break; // colours, layers, clipping, markers, …
      }
    } catch { /* a damaged chunk: skip it */ }
    p = end;
  }
  return out.filter(Boolean);
}

function mul4(a, b) {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return o;
}

// Circle through three points → {c, r, n} or null (collinear).
function circle3(a, b, c) {
  const ab = sub3(b, a), ac = sub3(c, a);
  const n = cross3(ab, ac);
  const nn = dot3(n, n);
  if (!(nn > 1e-18)) return null;
  const t = add3(mul3(cross3(n, ab), dot3(ac, ac)), mul3(cross3(ac, n), dot3(ab, ab)));
  const cc = add3(a, mul3(t, 1 / (2 * nn)));
  return { c: cc, r: len3(sub3(a, cc)), n: unit3(n) };
}

// Proxy graphics of a DXF entity: 92 (or 160) byte count, then 310 hex
// chunks. Only the chunks right after the count belong to the graphics.
export function dxfProxyBytes(e) {
  const t = e.tags;
  for (let i = 0; i < t.length; i++) {
    if ((t[i][0] === 92 || t[i][0] === 160) && t[i + 1] && t[i + 1][0] === 310) {
      const n = parseInt(t[i][1], 10);
      if (!(n > 0)) continue;
      const out = new Uint8Array(n);
      let o = 0;
      for (let k = i + 1; k < t.length && t[k][0] === 310 && o < n; k++) {
        const h = String(t[k][1]).trim();
        for (let j = 0; j + 1 < h.length && o < n; j += 2) out[o++] = parseInt(h.slice(j, j + 2), 16);
      }
      return o ? out.subarray(0, o) : null;
    }
  }
  return null;
}

// ================================================================ ACIS (REGION, 3DSOLID, BODY)
// AutoCAD keeps solids as ACIS models: R13–R2000 store SAT text (lightly
// obfuscated), R2004+ binary SAB. For a plan the edges are enough: every
// "edge" record names its two vertices and its curve (straight, ellipse,
// or a spline that is drawn as its chord).

/** De-obfuscate SAT text as stored in DWG/DXF (characters > 32 → 159 − c). */
export function decodeSatChars(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c <= 32 ? s[i] : String.fromCharCode(159 - c);
  }
  return out;
}

// SAT text → records [{name, tok: [...]}]; tokens: {p: index} pointers,
// numbers, or strings.
function satRecords(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const ver = parseInt(lines[i], 10) || 0;
  // Header: a version line, then (ACIS 2+) product and units lines; the
  // records start at the first line that looks like one ("body $-1 …").
  let k0 = i + 1;
  while (k0 < lines.length && k0 <= i + 3 && !/^(-\d+ )?[a-z][\w-]* [$@-]/.test(lines[k0].trim())) k0++;
  const body = lines.slice(k0).join("\n");
  const recs = [];
  let cur = [];
  const src = body;
  for (let k = 0; k < src.length;) {
    const ch = src[k];
    if (ch === " " || ch === "\n" || ch === "\t") { k++; continue; }
    if (ch === "#") { if (cur.length) recs.push(cur); cur = []; k++; continue; }
    if (ch === "@") { // @n string of n characters
      let j = k + 1;
      while (j < src.length && /\d/.test(src[j])) j++;
      const n = parseInt(src.slice(k + 1, j), 10) || 0;
      cur.push({ s: src.slice(j + 1, j + 1 + n) });
      k = j + 1 + n;
      continue;
    }
    let j = k;
    while (j < src.length && !/[\s#]/.test(src[j])) j++;
    const w = src.slice(k, j);
    k = j;
    if (w[0] === "$") cur.push({ p: parseInt(w.slice(1), 10) });
    else if (/^[-+]?(\d|\.\d)/.test(w) && Number.isFinite(+w)) cur.push(+w);
    else cur.push({ s: w });
  }
  if (cur.length) recs.push(cur);
  const out = [];
  for (const toks of recs) {
    let t = toks;
    if (typeof t[0] === "number" && t[0] <= 0 && t[1] && t[1].s) t = t.slice(1); // "-12 edge …" record index
    if (!t[0] || !t[0].s) { out.push({ name: "", tok: [] }); continue; }
    out.push({ name: t[0].s, tok: t.slice(1) });
  }
  return { ver, recs: out };
}

// SAB bytes → records (same shape as satRecords).
function sabRecords(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 15; // "ACIS BinaryFile" / "ASM BinaryFile4"
  const ver = dv.getInt32(p, true);
  p += 16;
  const recs = [];
  let cur = null, name = "", naming = true;
  const str = (n) => { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(b[p + i]); p += n; return s; };
  let headerDone = false, headerItems = 0;
  while (p < b.length) {
    const tag = b[p++];
    let v;
    switch (tag) {
      case 0x04: v = dv.getInt32(p, true); p += 4; break;
      case 0x06: v = dv.getFloat64(p, true); p += 8; break;
      case 0x07: { const n = b[p++]; v = { s: str(n) }; break; }
      case 0x08: { const n = dv.getUint16(p, true); p += 2; v = { s: str(n) }; break; }
      case 0x09: case 0x12: { const n = dv.getUint32(p, true); p += 4; v = { s: str(n) }; break; }
      case 0x0a: v = { b: true }; break;
      case 0x0b: v = { b: false }; break;
      case 0x0c: v = { p: dv.getInt32(p, true) }; p += 4; break;
      case 0x0d: case 0x0e: {
        const n = b[p++];
        const s = str(n);
        if (!headerDone) { headerDone = true; cur = []; name = ""; naming = true; }
        if (naming) { name += name ? `-${s}` : s; if (tag === 0x0d) naming = false; continue; }
        v = { s };
        break;
      }
      case 0x0f: case 0x10: continue; // sub-type braces
      case 0x11:
        if (cur) recs.push({ name, tok: cur });
        if (name === "End-of-ACIS-data" || name === "End-of-ASM-data") return { ver, recs };
        cur = []; name = ""; naming = true;
        continue;
      case 0x13: case 0x14: v = [dv.getFloat64(p, true), dv.getFloat64(p + 8, true), dv.getFloat64(p + 16, true)]; p += 24; break;
      case 0x15: v = { e: dv.getInt32(p, true) }; p += 4; break;
      case 0x16: v = { s: "" }; p += 8; break;
      case 0x17: v = dv.getFloat64(p, true); p += 8; break;
      default: return { ver, recs };
    }
    if (!headerDone) { if (++headerItems > 8) headerDone = true; continue; } // product, version, date, units…
    if (cur) cur.push(v);
  }
  return { ver, recs };
}

// Plain numbers of a record (positions and vectors spread out), after the
// leading attribute pointer and, in ACIS 7+, its "-1 $-1" history fields.
function satNumbers(rec) {
  let t = rec.tok;
  if (t[0] && t[0].p !== undefined) {
    t = t.slice(1);
    if (typeof t[0] === "number" && t[1] && t[1].p !== undefined) t = t.slice(2);
  }
  const out = [];
  for (const x of t) {
    if (typeof x === "number") out.push(x);
    else if (Array.isArray(x)) out.push(...x);
    else if (x && x.s !== undefined && /^[IF]$/.test(x.s)) break; // interval: stop
  }
  return out;
}

/**
 * Edge curves of an ACIS model (SAT text or SAB bytes) as world records.
 * → {records, chords} (chords: spline edges drawn as straight lines).
 */
export function acisRecords(data, base = []) {
  let parsed;
  if (typeof data === "string") parsed = satRecords(data);
  else {
    const b = data instanceof Uint8Array ? data : new Uint8Array(data);
    const sig = String.fromCharCode(...b.subarray(0, 15));
    if (!/^(ACIS|ASM) BinaryFile/.test(sig)) return { records: [], chords: 0 };
    parsed = sabRecords(b);
  }
  const recs = parsed.recs;
  const at = (i) => (Number.isInteger(i) && i >= 0 && i < recs.length ? recs[i] : null);
  const ptrs = (r) => r.tok.filter((x) => x && x.p !== undefined).map((x) => x.p);
  const pointOf = (vi) => {
    const v = at(vi);
    if (!v || !/vertex$/.test(v.name)) return null;
    for (const q of ptrs(v)) {
      const pr = at(q);
      if (pr && pr.name === "point") {
        const n = satNumbers(pr);
        if (n.length >= 3) return n.slice(n.length - 3);
      }
    }
    return null;
  };
  const out = [];
  let chords = 0;
  for (const r of recs) {
    if (r.name !== "edge") continue;
    const ps = ptrs(r);
    const verts = ps.filter((q) => { const x = at(q); return x && /vertex$/.test(x.name); });
    const curveI = ps.find((q) => { const x = at(q); return x && /curve$/.test(x.name); });
    if (verts.length < 1) continue;
    const a = pointOf(verts[0]), b = pointOf(verts[1] ?? verts[0]);
    if (!a || !b) continue;
    // Sense: "reversed" (SAT), logical true (SAB), or 1 after the curve (ACIS 1.x).
    const reversed = r.tok.some((x) => (x && x.s === "reversed") || (x && x.b === true)) || (parsed.ver < 200 && r.tok[r.tok.length - 1] === 1);
    const cv = at(curveI);
    if (cv && cv.name === "ellipse-curve") {
      const n = satNumbers(cv);
      if (n.length < 10) { out.push(R.line(base, a, b)); continue; }
      const c = n.slice(0, 3), nrm = unit3(n.slice(3, 6)) || [0, 0, 1], M = n.slice(6, 9), ratio = n[9] || 1;
      const m = mul3(cross3(nrm, M), ratio);
      const mm = dot3(m, m), MM = dot3(M, M);
      if (!(MM > 0) || !(mm > 0)) { out.push(R.line(base, a, b)); continue; }
      const param = (q) => { const d = sub3(q, c); return Math.atan2(dot3(d, m) / mm, dot3(d, M) / MM); };
      const same = len3(sub3(a, b)) < 1e-9 * Math.max(1, len3(M));
      let t1 = param(a), t2 = param(b), sweep;
      if (same) sweep = TAU;
      else if (!reversed) sweep = ((t2 - t1) % TAU + TAU) % TAU;
      else sweep = -(((t1 - t2) % TAU + TAU) % TAU);
      if (Math.abs(ratio - 1) < 1e-12 && Math.abs(nrm[2]) > 1 - 1e-12) {
        const rr = Math.sqrt(MM);
        if (same) out.push(R.circle(base, c, rr, nrm));
        else out.push(R.arc(base, c, rr, nrm, sub3(a, c), sweep));
      } else {
        const pr = R.poly(base, ellipse3(c, M, m, t1, sweep), same);
        if (pr) out.push(pr);
      }
    } else {
      if (len3(sub3(a, b)) < 1e-12) continue;
      if (cv && cv.name !== "straight-curve") chords++;
      out.push(R.line(base, a, b));
    }
  }
  return { records: out, chords };
}

/**
 * ACIS models of R2013+ drawings live in the AcDs data storage (DWG section
 * "AcDb:AcDsPrototype_1b"): its data segment lists (handle, offset) records
 * followed by the blobs ([RL size][bytes]) they point at. → Map(handle → SAB).
 */
export function acdsBlobs(sec) {
  const map = new Map();
  if (!sec || sec.length < 64) return map;
  const dv = new DataView(sec.buffer, sec.byteOffset, sec.byteLength);
  const L = (p) => dv.getUint32(p, true);
  const segOff = L(24), nSeg = L(32);
  if (segOff + 48 + nSeg * 12 > sec.length || nSeg > 4096) return map;
  for (let k = 0; k < nSeg; k++) {
    const off = L(segOff + 48 + k * 12);
    if (!off || off + 48 > sec.length) continue;
    if (dv.getUint16(off, true) !== 0xd5ac) continue;
    const name = String.fromCharCode(...sec.subarray(off + 2, off + 8));
    if (name !== "_data_") continue;
    const size = L(off + 16);
    const start = off + 48, end = Math.min(sec.length, off + size);
    // Index records: RL 20, RL 1, RLL handle, RL offset.
    const idx = [];
    let p = start;
    while (p + 20 <= end && L(p) === 20 && L(p + 4) === 1) { idx.push({ h: L(p + 8) + L(p + 12) * 4294967296, o: L(p + 16) }); p += 20; }
    const area = p;
    for (const { h, o } of idx) {
      const q = area + o;
      if (q + 4 > end) continue;
      const n = L(q);
      if (q + 4 + n > end || n < 32) continue;
      const blob = sec.subarray(q + 4, q + 4 + n);
      if (/^(ACIS|ASM) BinaryFile/.test(String.fromCharCode(...blob.subarray(0, 15)))) map.set(h, blob);
    }
  }
  return map;
}

/** DXF R2013+ ACDSDATA section records → Map(handle hex upper → SAB bytes). */
export function dxfAcdsBlobs(recs) {
  const map = new Map();
  for (const r of recs || []) {
    if (r.type !== "ACDSRECORD") continue;
    let h = null, asm = false, size = 0, hex = [];
    for (let i = 0; i < r.tags.length; i++) {
      const [c, v] = r.tags[i];
      if (c === 320) h = String(v).trim().toUpperCase();
      else if (c === 2 && String(v).trim() === "ASM_Data") asm = true;
      else if (c === 94 && asm) size = parseInt(v, 10) || 0;
      else if (c === 310 && asm) hex.push(String(v).trim());
    }
    if (!h || !asm || !hex.length) continue;
    const s = hex.join("");
    const out = new Uint8Array(size || s.length >> 1);
    for (let i = 0; i < out.length && 2 * i + 1 < s.length; i++) out[i] = parseInt(s.substr(2 * i, 2), 16);
    map.set(h, out);
  }
  return map;
}

/** SAT text of a DXF REGION / 3DSOLID / BODY (codes 1 and 3, obfuscated). */
export function dxfSatText(e) {
  const lines = [];
  let started = false;
  for (const [c, v] of e.tags) {
    if (c === 70) started = true;
    if (!started) continue;
    if (c === 1) lines.push(String(v));
    else if (c === 3 && lines.length) lines[lines.length - 1] += String(v);
  }
  if (!lines.length) return null;
  return lines.map(decodeSatChars).join("\n");
}

// ================================================================ MULTILEADER
// DXF tag layout (DWG data is translated into the same tags): the context
// data "300 CONTEXT_DATA{" … "301 }" with per-leader "302 LEADER{" … "303 }"
// and per-line "304 LEADER_LINE{" … "305 }" blocks, then the entity's own
// override fields.
export function parseMleader(e) {
  const t = e.tags;
  const ctx = { leaders: [] };
  const ent = {};
  let i = 0;
  while (i < t.length && !(t[i][0] === 300 && /CONTEXT_DATA/.test(t[i][1]))) i++;
  if (i >= t.length) return null;
  i++;
  let leader = null, line = null, depth = 0;
  const P = (k) => [num(t[k][1]), num(t[k + 1] && t[k + 1][0] === t[k][0] + 10 ? t[k + 1][1] : 0), num(t[k + 2] && t[k + 2][0] === t[k][0] + 20 ? t[k + 2][1] : 0)];
  for (; i < t.length; i++) {
    const [c, v] = t[i];
    const sv = typeof v === "string" ? v.trim() : v;
    if (c === 302 && sv === "LEADER{") { leader = { lines: [], last: null, dogleg: null, doglegLen: 0 }; ctx.leaders.push(leader); depth = 1; continue; }
    if (c === 304 && sv === "LEADER_LINE{" && leader) { line = { pts: [] }; leader.lines.push(line); depth = 2; continue; }
    if (c === 305 && depth === 2) { line = null; depth = 1; continue; }
    if (c === 303 && depth === 1) { leader = null; depth = 0; continue; }
    if (c === 301 && depth === 0) { i++; break; }
    if (depth === 2) { if (c === 10) line.pts.push(P(i)); continue; }
    if (depth === 1) {
      if (c === 10) leader.last = P(i);
      else if (c === 11) leader.dogleg = P(i);
      else if (c === 40) leader.doglegLen = num(v);
      continue;
    }
    switch (c) {
      case 40: ctx.scale = num(v, 1); break;
      case 10: ctx.base = P(i); break;
      case 41: ctx.textHeight = num(v); break;
      case 140: ctx.arrow = num(v); break;
      case 290: ctx.hasText = num(v) === 1; break;
      case 296: ctx.hasBlock = num(v) === 1; break;
      case 304: if (ctx.text === undefined) ctx.text = String(v); break;
      case 12: ctx.textPos = P(i); break;
      case 13: ctx.textDir = P(i); break;
      case 171: ctx.attach = num(v, 1); break;
      case 341: ctx.block = String(v).trim(); break;
      case 15: ctx.blockPos = P(i); break;
      case 16: ctx.blockScale = P(i); break;
      case 46: ctx.blockRot = num(v); break;
      case 11: ctx.normal = P(i); break;
      default: break;
    }
  }
  for (; i < t.length; i++) {
    const [c, v] = t[i];
    if (c === 170 && ent.type === undefined) ent.type = num(v, 1);
    else if (c === 291 && ent.dogleg === undefined) ent.dogleg = num(v, 1) === 1;
    else if (c === 42 && ent.arrow === undefined) ent.arrow = num(v);
    else if (c === 172 && ent.content === undefined) ent.content = num(v, 2);
  }
  return { ctx, ent };
}

/**
 * Records of a MULTILEADER: leader lines (with their arrowheads and
 * doglegs), the text as MTEXT, a block content as INSERT. `blockName`
 * resolves a block record handle.
 */
export function mleaderRecords(e, blockName = () => null) {
  const ml = parseMleader(e);
  if (!ml) return null;
  const { ctx, ent } = ml;
  const base = styleTags(e);
  const out = [];
  const arrow = (ctx.arrow || ent.arrow || 0) * 1;
  if (ent.type !== 0) {
    for (const ld of ctx.leaders) {
      for (const ln of ld.lines) {
        const pts = ln.pts.slice();
        if (ld.last) pts.push(ld.last);
        if (pts.length >= 2) {
          const r = R.poly(base, pts);
          if (r) out.push(r);
          // Arrowhead (closed triangle) at the first point.
          const d = unit3(sub3(pts[0], pts[1]));
          if (d && arrow > 0) {
            const bc = sub3(pts[0], mul3(d, arrow));
            const nrm = ctx.normal && unit3(ctx.normal) ? unit3(ctx.normal) : [0, 0, 1];
            const side = mul3(unit3(cross3(nrm, d)) || [0, 0, 0], arrow / 6);
            const tri = R.poly(base, [pts[0], add3(bc, side), sub3(bc, side)], true);
            if (tri) out.push(tri);
          }
        }
      }
      if (ld.last && ld.dogleg && ld.doglegLen > 0 && ent.dogleg !== false) {
        const dv = unit3(ld.dogleg);
        if (dv) out.push(R.line(base, ld.last, add3(ld.last, mul3(dv, ld.doglegLen))));
      }
    }
  }
  if (ctx.hasText && ctx.text && ctx.textPos) {
    out.push(R.mtext(base, ctx.textPos, ctx.textHeight || 2.5, ctx.textDir && len3(ctx.textDir) > 0 ? ctx.textDir : [1, 0, 0], ctx.text, ctx.attach || 1));
  } else if (ctx.hasBlock && ctx.block && ctx.blockPos) {
    const name = blockName(ctx.block);
    if (name) {
      const s = ctx.blockScale || [1, 1, 1];
      out.push({ type: "INSERT", tags: [...base, [2, name], [10, ctx.blockPos[0]], [20, ctx.blockPos[1]], [30, ctx.blockPos[2]], [41, s[0] || 1], [42, s[1] || 1], [43, s[2] || 1], [50, ((ctx.blockRot || 0) * 180) / Math.PI]] });
    }
  }
  return out;
}

// ================================================================ ACAD_TABLE
/** Grid lines and cell texts of a table without a block (DXF codes). */
export function tableGridRecords(e) {
  const base = styleTags(e);
  const ins = [tagNum(e, 10), tagNum(e, 20), tagNum(e, 30)];
  const dir = unit3([tagNum(e, 11, 1), tagNum(e, 21, 0), tagNum(e, 31, 0)]) || [1, 0, 0];
  const n = [tagNum(e, 210, 0), tagNum(e, 220, 0), tagNum(e, 230, 1)];
  const down = mul3(unit3(cross3(n, dir)) || [0, 1, 0], -1);
  const rows = e.tags.filter(([c]) => c === 141).map(([, v]) => num(v));
  const cols = e.tags.filter(([c]) => c === 142).map(([, v]) => num(v));
  if (!rows.length || !cols.length) return [];
  const W = cols.reduce((s, x) => s + x, 0), H = rows.reduce((s, x) => s + x, 0);
  const at = (u, v) => add3(ins, add3(mul3(dir, u), mul3(down, v)));
  const out = [];
  let y = 0;
  for (let r = 0; r <= rows.length; r++) { out.push(R.line(base, at(0, y), at(W, y))); y += rows[r] || 0; }
  let x = 0;
  for (let c = 0; c <= cols.length; c++) { out.push(R.line(base, at(x, 0), at(x, H))); x += cols[c] || 0; }
  // Cell texts (R2007-: code 1 per cell; R2010+: 302 inside CELL_VALUE) in row order.
  const texts = [];
  let inValue = false;
  for (const [c, v] of e.tags) {
    if (c === 301 && /CELL_VALUE/.test(v)) inValue = true;
    else if (c === 304 && /ACVALUE_END/.test(v)) inValue = false;
    else if (c === 302 && inValue) texts.push(String(v));
  }
  if (!texts.length) for (const [c, v] of e.tags) if (c === 1) texts.push(String(v));
  if (texts.length === rows.length * cols.length) {
    let k = 0, yy = 0;
    for (let r = 0; r < rows.length; r++) {
      let xx = 0;
      for (let c = 0; c < cols.length; c++, k++) {
        const s = texts[k];
        const h = Math.min(rows[r] * 0.5, cols[c] * 0.25) || 1;
        if (s && s.trim()) out.push(R.mtext(base, at(xx + cols[c] / 2, yy + rows[r] / 2), h, dir, s, 5));
        xx += cols[c];
      }
      yy += rows[r];
    }
  }
  return out;
}

/**
 * Translation that moves a block's lines onto the same lines drawn in an
 * entity's graphics (an R2010+ table keeps no usable insertion point), or
 * null when the two do not match by a plain shift.
 */
export function graphicsOffset(graphicRecs, blockEntities) {
  const box = (recs) => {
    let b = null;
    const add = (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; if (!b) b = [x, y, x, y]; else { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } };
    for (const r of recs) {
      if (r.type === "LINE") { add(tagNum(r, 10), tagNum(r, 20)); add(tagNum(r, 11), tagNum(r, 21)); } else if (r.type === "POLYLINE") for (const v of r.vertices || []) add(tagNum(v, 10), tagNum(v, 20));
      else if (r.type === "LWPOLYLINE") { const xs = r.tags.filter(([c]) => c === 10), ys = r.tags.filter(([c]) => c === 20); xs.forEach(([, x], i) => add(num(x), num(ys[i] && ys[i][1]))); }
    }
    return b;
  };
  const g = box(graphicRecs), k = box(blockEntities);
  if (!g || !k) return null;
  const tol = 1e-6 * Math.max(1, g[2] - g[0], g[3] - g[1]);
  if (Math.abs(g[2] - g[0] - (k[2] - k[0])) > tol || Math.abs(g[3] - g[1] - (k[3] - k[1])) > tol) return null;
  return [g[0] - k[0], g[1] - k[1]];
}

// ================================================================ IMAGE, WIPEOUT
/**
 * Outline of a raster image or wipeout in world coordinates, and the image
 * frame (corner, U and V edge vectors of the whole picture).
 */
export function imageGeometry(e) {
  const ins = [tagNum(e, 10), tagNum(e, 20), tagNum(e, 30)];
  const u = [tagNum(e, 11, 1), tagNum(e, 21, 0), tagNum(e, 31, 0)];
  const v = [tagNum(e, 12, 0), tagNum(e, 22, 1), tagNum(e, 32, 0)];
  const W = tagNum(e, 13, 1) || 1, H = tagNum(e, 23, 1) || 1;
  const flags = tagNum(e, 70, 0), clipOn = tagNum(e, 280, 0) === 1;
  const clipType = tagNum(e, 71, 1);
  const cv = [];
  for (let i = 0; i < e.tags.length; i++) if (e.tags[i][0] === 14) cv.push([num(e.tags[i][1]), e.tags[i + 1] && e.tags[i + 1][0] === 24 ? num(e.tags[i + 1][1]) : 0]);
  // Clip vertices are pixel coordinates with the origin at the top left
  // pixel centre (the corner of the picture is at −0.5, −0.5).
  const origin = add3(ins, sub3(mul3(u, 0.5), mul3(v, 0.5)));
  const world = ([x, y]) => add3(origin, add3(mul3(u, x), mul3(v, H - y)));
  let pts;
  if ((clipOn || flags & 4) && cv.length >= 2) {
    if (clipType === 1 || cv.length === 2) {
      const [a, b] = cv;
      pts = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
    } else {
      pts = cv.slice();
      const f = pts[0], l = pts[pts.length - 1];
      if (pts.length > 2 && Math.abs(f[0] - l[0]) < 1e-12 && Math.abs(f[1] - l[1]) < 1e-12) pts.pop();
    }
  } else pts = [[-0.5, -0.5], [W - 0.5, -0.5], [W - 0.5, H - 0.5], [-0.5, H - 0.5]];
  return { outline: pts.map(world), corner: ins, U: mul3(u, W), V: mul3(v, H), pixels: [W, H] };
}

// ================================================================ MLINE
/** Element lines of a multiline (DXF codes; each vertex carries the offsets). */
export function mlineRecords(e) {
  const base = styleTags(e);
  const t = e.tags;
  const nElems = tagNum(e, 73, 0);
  const closed = (tagNum(e, 71, 0) & 2) !== 0;
  const verts = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i][0] !== 11) continue;
    const p = [num(t[i][1]), num(t[i + 1] && t[i + 1][1]), num(t[i + 2] && t[i + 2][1])];
    const vx = { p, dir: [1, 0, 0], miter: [0, 1, 0], elems: [] };
    let k = i + 3;
    const P3 = (c) => { if (t[k] && t[k][0] === c) { const q = [num(t[k][1]), num(t[k + 1] && t[k + 1][1]), num(t[k + 2] && t[k + 2][1])]; k += 3; return q; } return null; };
    vx.dir = P3(12) || vx.dir;
    vx.miter = P3(13) || vx.miter;
    for (let el = 0; el < nElems; el++) {
      const params = [];
      if (t[k] && t[k][0] === 74) {
        const n = num(t[k][1]); k++;
        for (let q = 0; q < n && t[k] && t[k][0] === 41; q++, k++) params.push(num(t[k][1]));
      }
      if (t[k] && t[k][0] === 75) { const n = num(t[k][1]); k++; for (let q = 0; q < n && t[k] && t[k][0] === 42; q++) k++; }
      vx.elems.push(params);
    }
    verts.push(vx);
    i = k - 1;
  }
  const out = [];
  for (let el = 0; el < nElems; el++) {
    const pts = verts.map((vx) => add3(vx.p, mul3(vx.miter, (vx.elems[el] && vx.elems[el][0]) || 0)));
    const r = R.poly(base, pts, closed);
    if (r) out.push(r);
  }
  if (!nElems && verts.length >= 2) { const r = R.poly(base, verts.map((vx) => vx.p), closed); if (r) out.push(r); }
  return out;
}

// ================================================================ clipping (plan coordinates)
// Liang–Barsky: the parts of segment a→b inside rect {x1, y1, x2, y2}.
function clipSegment(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const edges = [[-dx, a[0] - r.x1], [dx, r.x2 - a[0]], [-dy, a[1] - r.y1], [dy, r.y2 - a[1]]];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-15) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy], t0 > 0, t1 < 1];
}

/** A point list clipped to a rectangle → list of point lists (open). */
export function clipPolyline(pts, closed, r) {
  const list = closed && pts.length > 2 ? [...pts, pts[0]] : pts;
  const out = [];
  let cur = null;
  for (let i = 0; i + 1 < list.length; i++) {
    const c = clipSegment(list[i], list[i + 1], r);
    if (!c) { if (cur) { out.push(cur); cur = null; } continue; }
    const [p, q, cutStart, cutEnd] = c;
    if (!cur || cutStart) { if (cur) out.push(cur); cur = [p]; }
    cur.push(q);
    if (cutEnd) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.length >= 2);
}

// Points of a plan arc item (canvas semantics, degrees).
export function planArcPoints(d) {
  const D = Math.PI / 180;
  let a1 = d.a1, a2 = d.a2;
  let sweep = d.ccw ? a1 - a2 : a2 - a1;
  sweep = sweep >= 360 ? 360 : ((sweep % 360) + 360) % 360;
  const n = Math.max(2, Math.ceil(sweep / 5));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (a1 + ((d.ccw ? -sweep : sweep) * i) / n) * D;
    pts.push([d.cx + d.r * Math.cos(a), d.cy + d.r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Clip plan drawing items and texts to a rectangle (texts by their anchor).
 * Items fully inside stay as they are; others become open polylines.
 */
export function clipItems(drawings, texts, r) {
  const inside = (x, y) => x >= r.x1 - 1e-9 && x <= r.x2 + 1e-9 && y >= r.y1 - 1e-9 && y <= r.y2 + 1e-9;
  const outD = [];
  for (const d of drawings) {
    let pts, closed = !!d.closed;
    if (d.kind === "circle") {
      if (inside(d.cx - d.r, d.cy - d.r) && inside(d.cx + d.r, d.cy + d.r)) { outD.push(d); continue; }
      pts = planArcPoints({ ...d, a1: 0, a2: 360, ccw: false }).slice(0, -1);
      closed = true;
    } else if (d.kind === "arc") {
      pts = planArcPoints(d);
      if (pts.every(([x, y]) => inside(x, y))) { outD.push(d); continue; }
      closed = false;
    } else pts = d.pts || [];
    if (pts.every(([x, y]) => inside(x, y))) { outD.push(d.kind === "polyline" ? d : { ...d, kind: "polyline", pts, closed }); continue; }
    const pieces = clipPolyline(pts, closed, r);
    pieces.forEach((pc, i) => {
      const { cx, cy, r: rr, a1, a2, ccw, ...rest } = d;
      outD.push({ ...rest, id: i ? `${d.id}-${i}` : d.id, kind: "polyline", pts: pc, closed: false });
    });
  }
  return { drawings: outD, texts: texts.filter((t) => inside(t.x, t.y)) };
}

/** The part of the line p + t·d (t over `range`) inside rect r, or null. */
export function clipLine(p, d, r, range = [-Infinity, Infinity]) {
  let t0 = range[0], t1 = range[1];
  for (const [pp, q] of [[-d[0], p[0] - r.x1], [d[0], r.x2 - p[0]], [-d[1], p[1] - r.y1], [d[1], r.y2 - p[1]]]) {
    if (Math.abs(pp) < 1e-15) { if (q < 0) return null; continue; }
    const t = q / pp;
    if (pp < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  if (!(t1 > t0) || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return [[p[0] + t0 * d[0], p[1] + t0 * d[1]], [p[0] + t1 * d[0], p[1] + t1 * d[1]]];
}

export { tagNum, tagStr };

// PDF floor plans: the drawing of one page (paths, arcs and texts, read with pdf.js) → the
// lines / arcs / texts plan-recognize.js reads, like a DXF. Pure JS: the pdf.js module is passed
// in (the app loads it lazily with its worker and CMaps as local files, the tests import it in Node).
//
//   • Paths: every stroked or filled path of the page, in page units (points, 1/72 inch) with the
//     page's rotation applied, y up (like DXF). Clipping paths and page borders are left out.
//   • Arcs: Bézier curves that lie on a circle (one curve per quarter, as CAD programs print
//     them) are joined into ARC-like arcs; runs of short straight pieces on a circle too.
//   • Layers: optional content groups (PDF layers, e.g. from AutoCAD's "Export to PDF") name the
//     layers, so the import options can switch dimensions, furniture or hatches off like in a DXF.
//   • Texts: the page's text runs (room names, the scale "1:100", the paper size "A3").
//   • Scale: PDFs have no units. The scale comes from a "1:100" / "1/100" / "S=1:50" text (with a
//     paper size like "A1" when the page was printed smaller), else from the door arcs (≈ 0.9 m),
//     else 1:100; the user can change it and calibrate with two points after the import.
//   • Scanned pages (a picture and few lines) are reported as raster: the caller renders the page
//     to a picture and imports it as an underlay (plan-image.js finds the walls).
import { dxfToPlan } from './plan-dxf.js';

/** Metres per PDF point on paper (1/72 inch). */
export const POINT_METRES = 0.0254 / 72;
/** Usual drawing scales (1:n) a measured scale snaps to. */
export const SCALES = [1, 2, 5, 10, 20, 25, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 1000, 1200, 1250, 2000, 2500, 5000];
/** ISO A and US paper sizes in millimetres (short side, long side). */
export const PAPERS = { A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210], Letter: [216, 279], Legal: [216, 356], Tabloid: [279, 432], 'ARCH D': [610, 914], 'ARCH E': [914, 1219] };

export const isPdfName = (name) => /\.pdf$/i.test(name ?? '');
/** True when the bytes start like a PDF ("%PDF-" within the first kilobyte). */
export function isPdf(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const n = Math.min(b.length - 5, 1024);
  for (let i = 0; i < n; i++) if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46 && b[i + 4] === 0x2d) return true;
  return false;
}

/** The paper a page of `w` × `h` points is (3 % tolerance), or null. */
export function paperName(w, h) {
  const s = Math.min(w, h) * 25.4 / 72; const l = Math.max(w, h) * 25.4 / 72;
  for (const [name, [ps, pl]] of Object.entries(PAPERS)) if (Math.abs(s - ps) <= ps * 0.03 && Math.abs(l - pl) <= pl * 0.03) return name;
  return null;
}

/** Opens a PDF with pdf.js (`options` go to getDocument: worker, CMaps, fonts). The bytes are copied (pdf.js takes them). */
export async function openPdf(pdfjs, bytes, options = {}) {
  if (!isPdf(bytes)) throw Object.assign(new Error('Not a PDF file'), { code: 'pdf-invalid' });
  const data = new Uint8Array(bytes).slice();
  return pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0, ...options }).promise;
}

// ───────────────────────── geometry helpers

const IDENTITY = [1, 0, 0, 1, 0, 0];
/** compose(A, B): apply B, then A (PDF matrices [a b c d e f]). */
const compose = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; const a = u * u * u; const b = 3 * u * u * t; const c = 3 * u * t * t; const d = t * t * t; return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]; };

/** Circle through three points: { c, r } or null (collinear). */
export function circleThrough(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a[0] * a[0] + a[1] * a[1]; const b2 = b[0] * b[0] + b[1] * b[1]; const c2 = c[0] * c[0] + c[1] * c[1];
  const center = [(a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d];
  return { c: center, r: dist(center, a) };
}

/** Counter-clockwise angle (y up) from p0 to p1 around c, the way through `mid`: (0, 2π). */
function ccwSweep(c, p0, mid, p1) {
  const ang = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const norm = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const total = norm(ang(p1) - ang(p0));
  const viaMid = norm(ang(mid) - ang(p0));
  return viaMid <= total ? { ccw: true, sweep: total } : { ccw: false, sweep: 2 * Math.PI - total };
}

/**
 * A cubic Bézier (y up) that lies on a circle → { c, r, start, end, ccw, sweep } (the arc from `start` to `end`),
 * or null. Tolerance: 1.5 % of the radius at t = ¼, ½, ¾.
 */
export function bezierArc(p0, p1, p2, p3) {
  const m = bez(p0, p1, p2, p3, 0.5);
  const circle = circleThrough(p0, m, p3);
  if (!circle || !(circle.r > 1e-6)) return null;
  for (const t of [0.15, 0.25, 0.75, 0.85]) if (Math.abs(dist(bez(p0, p1, p2, p3, t), circle.c) - circle.r) > circle.r * 0.015 + 1e-6) return null;
  const { ccw, sweep } = ccwSweep(circle.c, p0, m, p3);
  if (sweep > Math.PI * 0.75 + 1e-6) return null; // one Bézier spans at most ~90° when it is an arc
  return { c: circle.c, r: circle.r, start: p0, end: p3, ccw, sweep };
}

// ───────────────────────── page reading

/**
 * Reads one page (1-based) → { lines, arcs, texts, inserts: [], layers: [{ name, lines, arcs, texts, off }], size: [w, h]
 * (points), paper, images, imageCover (0..1 of the page under pictures), raster (true: a scan to render),
 * segments }. Coordinates are page points, y up, with the page rotation applied.
 */
export async function readPdfPage(pdfjs, doc, number = 1) {
  const page = await doc.getPage(number);
  const viewport = page.getViewport({ scale: 1 });
  const W = viewport.width; const H = viewport.height;
  // User space → points with the page's rotation and offset (y down), then y up.
  const base = viewport.transform;
  const toPage = (m, x, y) => { const p = apply(base, ...apply(m, x, y)); return [p[0], H - p[1]]; };
  const OPS = pdfjs.OPS;
  const list = await page.getOperatorList();
  let groups = null;
  try { groups = await doc.getOptionalContentConfig(); } catch { groups = null; }
  const groupName = (id) => { try { return groups?.getGroup?.(id)?.name ?? null; } catch { return null; } };
  const hiddenGroup = (id) => { try { return groups && id && groups.isVisible && !groups.isVisible({ type: 'OCG', id }); } catch { return false; } };

  const out = { lines: [], arcs: [], texts: [], inserts: [] };
  const seen = new Set();
  const key = (a, b) => { const k1 = `${a[0].toFixed(2)},${a[1].toFixed(2)}`; const k2 = `${b[0].toFixed(2)},${b[1].toFixed(2)}`; return k1 < k2 ? `${k1};${k2}` : `${k2};${k1}`; };
  const line = (a, b, layer) => {
    const L = dist(a, b);
    if (!(L > 1e-3)) return;
    // Page frames and title-block borders: long axis-parallel lines across most of the page.
    if ((Math.abs(a[1] - b[1]) < 0.5 && L > W * 0.8) || (Math.abs(a[0] - b[0]) < 0.5 && L > H * 0.8)) return;
    const k = key(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    out.lines.push({ a, b, layer });
  };
  const arc = (c, r, from, to, sweep, layer) => {
    const k = `arc:${c[0].toFixed(2)},${c[1].toFixed(2)},${r.toFixed(2)},${key(from, to)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.arcs.push({ c, r, p0: from, p1: to, sweep, layer });
  };

  // One subpath's pieces: straight runs (possibly arcs drawn as many short lines) and curves.
  const flush = (pieces, layer) => {
    // Curves: consecutive Béziers on one circle become one arc; others are flattened.
    let run = null; // { c, r, start, end, mid, sweep, ccw }
    const endRun = () => {
      if (!run) return;
      if (run.sweep >= Math.PI * 2 - 0.05) { // full circle: kept as short lines (CIRCLE in a DXF)
        const n = 24;
        for (let i = 0; i < n; i++) line([run.c[0] + run.r * Math.cos((2 * Math.PI * i) / n), run.c[1] + run.r * Math.sin((2 * Math.PI * i) / n)], [run.c[0] + run.r * Math.cos((2 * Math.PI * (i + 1)) / n), run.c[1] + run.r * Math.sin((2 * Math.PI * (i + 1)) / n)], layer);
      } else {
        const [p0, p1] = run.ccw ? [run.start, run.end] : [run.end, run.start];
        arc(run.c, run.r, p0, p1, run.sweep, layer);
      }
      run = null;
    };
    let straight = [];
    const endStraight = () => { if (straight.length) emitStraight(straight, layer); straight = []; };
    for (const p of pieces) {
      if (p.type === 'L') { endRun(); straight.push(p); continue; }
      endStraight();
      const a = bezierArc(p.p0, p.p1, p.p2, p.p3);
      if (!a) { endRun(); for (let i = 0; i < 8; i++) line(bez(p.p0, p.p1, p.p2, p.p3, i / 8), bez(p.p0, p.p1, p.p2, p.p3, (i + 1) / 8), layer); continue; }
      if (run && a.ccw === run.ccw && dist(a.c, run.c) < run.r * 0.02 + 1e-6 && Math.abs(a.r - run.r) < run.r * 0.02 + 1e-6 && dist(a.start, run.end) < run.r * 0.01 + 1e-6) {
        run.end = a.end; run.sweep += a.sweep;
      } else { endRun(); run = { ...a }; }
    }
    endRun();
    endStraight();
  };
  // Straight pieces of a subpath: runs of many short pieces turning one way on a circle → an arc (door swings
  // printed as polylines), the rest lines.
  const emitStraight = (pieces, layer) => {
    let i = 0;
    while (i < pieces.length) {
      let j = i;
      const turn = (k) => { const u = [pieces[k].b[0] - pieces[k].a[0], pieces[k].b[1] - pieces[k].a[1]]; const v = [pieces[k + 1].b[0] - pieces[k + 1].a[0], pieces[k + 1].b[1] - pieces[k + 1].a[1]]; return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]); };
      if (i + 5 < pieces.length) {
        const sign = Math.sign(turn(i));
        while (j + 1 < pieces.length && Math.sign(turn(j)) === sign && Math.abs(turn(j)) > 0.005 && Math.abs(turn(j)) < 0.45) j++;
      }
      if (j - i >= 5) {
        const pts = [pieces[i].a, ...pieces.slice(i, j + 1).map((p) => p.b)];
        const circle = circleThrough(pts[0], pts[Math.floor(pts.length / 2)], pts.at(-1));
        if (circle && pts.every((p) => Math.abs(dist(p, circle.c) - circle.r) <= circle.r * 0.02)) {
          const { ccw, sweep } = ccwSweep(circle.c, pts[0], pts[Math.floor(pts.length / 2)], pts.at(-1));
          if (sweep > 0.4 && sweep < Math.PI * 2 - 0.05) {
            const [p0, p1] = ccw ? [pts[0], pts.at(-1)] : [pts.at(-1), pts[0]];
            arc(circle.c, circle.r, p0, p1, sweep, layer);
            i = j + 1;
            continue;
          }
        }
      }
      line(pieces[i].a, pieces[i].b, layer);
      i += 1;
    }
  };

  let ctm = IDENTITY;
  const stack = [];
  const marks = []; // marked content: layer names (or null)
  let images = 0; let imageCover = 0;
  const layerNow = () => { for (let k = marks.length - 1; k >= 0; k--) if (marks[k]?.name) return marks[k]; return null; };
  const hiddenNow = () => marks.some((m) => m?.hidden);
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i]; const args = list.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = compose(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = compose(ctm, [...args[0]]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.beginMarkedContentProps) {
      const id = args?.[0] === 'OC' ? (typeof args[1] === 'string' ? args[1] : args[1]?.id ?? null) : null;
      marks.push(id ? { name: groupName(id) ?? id, hidden: hiddenGroup(id) } : null);
    } else if (fn === OPS.beginMarkedContent) marks.push(null);
    else if (fn === OPS.endMarkedContent) marks.pop();
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintImageXObjectRepeat || fn === OPS.paintJpegXObject) {
      images += 1;
      // An image fills the unit square of the current matrix.
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => toPage(ctm, x, y));
      const area = Math.abs(corners.reduce((s, p, k) => { const q = corners[(k + 1) % 4]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
      imageCover = Math.max(imageCover, Math.min(1, area / (W * H)));
    } else if (fn === OPS.constructPath) {
      const [op, data] = args;
      const buffer = data?.[0];
      if (!buffer || op === OPS.endPath || hiddenNow()) continue; // endPath: a clipping path, not drawn
      const layer = layerNow()?.name ?? '0';
      let pieces = []; let cur = null; let start = null;
      for (let k = 0; k < buffer.length;) {
        const code = buffer[k++];
        if (code === 0) { if (pieces.length) flush(pieces, layer); pieces = []; cur = start = toPage(ctm, buffer[k], buffer[k + 1]); k += 2; }
        else if (code === 1) { const p = toPage(ctm, buffer[k], buffer[k + 1]); k += 2; if (cur) pieces.push({ type: 'L', a: cur, b: p }); cur = p; }
        else if (code === 2) { const p1 = toPage(ctm, buffer[k], buffer[k + 1]); const p2 = toPage(ctm, buffer[k + 2], buffer[k + 3]); const p3 = toPage(ctm, buffer[k + 4], buffer[k + 5]); k += 6; if (cur) pieces.push({ type: 'C', p0: cur, p1, p2, p3 }); cur = p3; }
        else if (code === 3) { // quadratic → cubic
          const q = toPage(ctm, buffer[k], buffer[k + 1]); const p3 = toPage(ctm, buffer[k + 2], buffer[k + 3]); k += 4;
          if (cur) pieces.push({ type: 'C', p0: cur, p1: [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], p2: [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])], p3 });
          cur = p3;
        } else if (code === 4) { if (cur && start && dist(cur, start) > 1e-6) pieces.push({ type: 'L', a: cur, b: start }); cur = start; }
        else break;
      }
      if (pieces.length) flush(pieces, layer);
    }
  }

  // Texts: runs of the page (centre of each run), neighbours on one baseline joined.
  const content = await page.getTextContent();
  const runs = [];
  for (const item of content.items ?? []) {
    const s = String(item.str ?? '');
    if (!s.trim()) continue;
    const [a, b, c, d, e, f] = item.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b) || 1;
    const dir = [a / (Math.hypot(a, b) || 1), b / (Math.hypot(a, b) || 1)];
    const w = Number(item.width) || s.length * size * 0.5;
    const p0 = [e, f]; const p1 = [e + dir[0] * w, f + dir[1] * w];
    runs.push({ text: s, p0: toPage(IDENTITY, ...p0), p1: toPage(IDENTITY, ...p1), size });
  }
  const merged = [];
  for (const r of runs) {
    const prev = merged.at(-1);
    if (prev && Math.abs(prev.p1[1] - r.p0[1]) < prev.size * 0.3 && r.p0[0] - prev.p1[0] > -prev.size * 0.3 && r.p0[0] - prev.p1[0] < prev.size * 0.6 && Math.abs(prev.size - r.size) < prev.size * 0.2) {
      prev.text += (r.p0[0] - prev.p1[0] > prev.size * 0.2 ? ' ' : '') + r.text; prev.p1 = r.p1;
    } else merged.push({ ...r });
  }
  for (const r of merged) {
    const text = r.text.replace(/\s+/g, ' ').trim();
    const ux = r.p1[0] - r.p0[0]; const uy = r.p1[1] - r.p0[1]; const L = Math.hypot(ux, uy) || 1;
    // Centre of the run: half way along the baseline, a third of the size above it.
    const p = [(r.p0[0] + r.p1[0]) / 2 - (uy / L) * r.size * 0.35, (r.p0[1] + r.p1[1]) / 2 + (ux / L) * r.size * 0.35];
    out.texts.push({ p, text, height: r.size, layer: '0' });
  }

  const segments = out.lines.length + out.arcs.length;
  const stats = new Map();
  const bump = (layer, k) => { const s = stats.get(layer) ?? { name: layer, lines: 0, arcs: 0, texts: 0, off: false }; s[k] += 1; stats.set(layer, s); };
  for (const l of out.lines) bump(l.layer, 'lines');
  for (const a of out.arcs) bump(a.layer, 'arcs');
  for (const t of out.texts) bump(t.layer, 'texts');
  page.cleanup?.();
  return {
    ...out, size: [W, H], paper: paperName(W, H), images, imageCover, segments,
    layers: [...stats.values()].sort((a, b) => a.name.localeCompare(b.name)),
    // A scan: pictures over much of the page and hardly any drawing.
    raster: images > 0 && imageCover > 0.25 && segments < 60,
  };
}

/** Pages of a PDF: [{ number, width, height (points), paper }] (the first 200). */
export async function pdfPages(doc) {
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, 200); n++) {
    const page = await doc.getPage(n);
    const v = page.getViewport({ scale: 1 });
    pages.push({ number: n, width: v.width, height: v.height, paper: paperName(v.width, v.height) });
  }
  return pages;
}

// ───────────────────────── scale

/** Scale texts: "1:100", "1/50", "S=1:200", "SCALE 1 : 100", "축척 1/100"; with a paper ("A1") when one is next to it. */
export function scaleFromTexts(texts) {
  const found = [];
  for (const t of texts ?? []) {
    const s = String(t.text ?? '');
    const re = /(?:^|[^\d.,])1\s*[:/]\s*(\d{1,4})(?![\d.,:/])/g;
    let m;
    while ((m = re.exec(s))) {
      const n = Number(m[1]);
      if (!SCALES.includes(n)) continue;
      const keyword = /scale|축척|s\s*=|sc\b|척도/i.test(s);
      const paper = /\b(A[0-5])\b/i.exec(s)?.[1]?.toUpperCase() ?? null;
      found.push({ denominator: n, keyword, paper, text: s.trim() });
    }
  }
  if (!found.length) return null;
  // Labelled ones first, then the most frequent.
  const count = new Map();
  for (const f of found) count.set(f.denominator, (count.get(f.denominator) ?? 0) + (f.keyword ? 10 : 1));
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const pick = found.filter((f) => f.denominator === best);
  return { denominator: best, paper: pick.find((f) => f.paper)?.paper ?? null, text: pick.find((f) => f.keyword)?.text ?? pick[0].text };
}

/**
 * The scale of a page: { denominator, paper (stated), pagePaper, factor (stated paper / page, e.g. an A1 drawing
 * printed on A3 → 2), metres (per point), source: 'text' | 'doors' | 'default', text }.
 */
export function pdfScale(page) {
  const pagePaper = page.paper ?? paperName(page.size[0], page.size[1]);
  const fromText = scaleFromTexts(page.texts);
  if (fromText) {
    let factor = 1;
    if (fromText.paper && PAPERS[fromText.paper]) {
      const longSide = Math.max(page.size[0], page.size[1]) * 25.4 / 72;
      const stated = PAPERS[fromText.paper][1];
      if (Math.abs(stated - longSide) > longSide * 0.05) factor = stated / longSide;
    }
    return { denominator: fromText.denominator, paper: fromText.paper, pagePaper, factor, metres: POINT_METRES * fromText.denominator * factor, source: 'text', text: fromText.text };
  }
  // Door swings: quarter arcs of 0.7–1.0 m doors, the usual being ~0.9 m.
  const radii = (page.arcs ?? []).filter((a) => a.sweep > (75 * Math.PI) / 180 && a.sweep < (105 * Math.PI) / 180).map((a) => a.r).sort((a, b) => a - b);
  if (radii.length) {
    const median = radii[Math.floor(radii.length / 2)];
    const measured = 0.9 / (median * POINT_METRES);
    const denominator = SCALES.reduce((best, s) => (Math.abs(Math.log(s / measured)) < Math.abs(Math.log(best / measured)) ? s : best), SCALES[0]);
    return { denominator, paper: null, pagePaper, factor: 1, metres: POINT_METRES * denominator, source: 'doors', text: '' };
  }
  return { denominator: 100, paper: null, pagePaper, factor: 1, metres: POINT_METRES * 100, source: 'default', text: '' };
}

/**
 * A read page → plan metres (plan axes, like dxfToPlan) at `metres` per point. `layers` (names or null) keeps only those.
 */
export function pdfToPlan(page, metres, { layers = null } = {}) {
  const keep = (x) => !layers || layers.includes(x.layer ?? '0');
  return dxfToPlan({ lines: page.lines.filter(keep), arcs: page.arcs.filter(keep), texts: page.texts, inserts: [] }, metres);
}

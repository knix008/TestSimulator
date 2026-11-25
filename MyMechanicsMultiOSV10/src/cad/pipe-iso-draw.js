// Drawing an ISO piping annotation ('drwPipeIso') on a sheet (no DOM, no imports: drawing-annot.js draws it, as
// harness-sheet.js for harnesses). The model comes from pipe-iso.js (isoModel / isoSheet).

const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);

/** Options of an ISO sheet (the annotation's `opts`). */
export const ISO_SHEET_DEFAULTS = { scale: 'auto', maxSpool: 0, stock: 6000, showDims: true, showSpools: true, showBom: true, showWelds: true, rowH: 6, auto: true };
export const isoSheetOptions = (o = {}) => ({ ...ISO_SHEET_DEFAULTS, ...Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v != null)) });
export const ISO_SCALES = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005];

/** The ISO model (v up, model mm) → sheet (mm, y down) for annotation `a`. */
export function isoToSheet(a) {
  const [[u0], [, v1]] = a.iso.bounds;
  const k = Number(a.scale) || 1;
  return (q) => [(Number(a.x) || 0) + (q[0] - u0) * k, (Number(a.y) || 0) + (v1 - q[1]) * k];
}

/** Primitives of a 'drwPipeIso' annotation (sheet mm, y down). Symbols keep their sheet size whatever the scale. */
export function isoPrimitives(a) {
  const iso = a?.iso;
  if (!iso?.lines) return [];
  const S = isoToSheet(a), o = isoSheetOptions(a.opts);
  const out = [];
  for (const l of iso.lines) out.push({ t: 'poly', pts: l.map(S), cls: 'dx-line' });
  for (const w of iso.welds) out.push({ t: 'circle', c: S(w), r: 0.7, fill: true });
  for (const w of iso.field) { const c = S(w); out.push({ t: 'circle', c, r: 1.6 }, { t: 'poly', pts: [[c[0] - 1.1, c[1] - 1.1], [c[0] + 1.1, c[1] + 1.1]], cls: 'dx-line' }, { t: 'poly', pts: [[c[0] - 1.1, c[1] + 1.1], [c[0] + 1.1, c[1] - 1.1]], cls: 'dx-line' }, { t: 'text', x: c[0] + 2.4, y: c[1] - 2, text: 'FW', size: 2.2, anchor: 'start', kind: 'fieldWeld' }); }
  for (const fl of iso.flanges) {
    // Two short bars across the pipe at the flange face.
    const a0 = S(fl.at0), a1 = S(fl.at), dx = a1[0] - a0[0], dy = a1[1] - a0[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L], t = [dx / L, dy / L];
    for (const off of [0, 0.9]) { const c = [a0[0] + t[0] * off, a0[1] + t[1] * off]; out.push({ t: 'poly', pts: [[c[0] - n[0] * 2.2, c[1] - n[1] * 2.2], [c[0] + n[0] * 2.2, c[1] + n[1] * 2.2]], cls: 'dx-line' }); }
    out.push({ t: 'circle', c: a1, r: 0.7, fill: true });
  }
  for (const r of iso.reducers) {
    const a0 = S(r.a), b0 = S(r.b), dx = b0[0] - a0[0], dy = b0[1] - a0[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L];
    out.push({ t: 'poly', pts: [[a0[0] + n[0] * 1.8, a0[1] + n[1] * 1.8], [b0[0] + n[0] * 1, b0[1] + n[1] * 1], [b0[0] - n[0] * 1, b0[1] - n[1] * 1], [a0[0] - n[0] * 1.8, a0[1] - n[1] * 1.8]], closed: true, cls: 'dx-line' });
  }
  if (o.showDims) for (const d of iso.dims) {
    const p = S(d.a), q = S(d.b), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L];
    if (L < 4) continue;
    let rot = (Math.atan2(dy, dx) * 180) / Math.PI; if (rot > 90) rot -= 180; if (rot < -90) rot += 180;
    // A dimension line beside the pipe with ticks at the ends, the length over it.
    const off = 4.5, A = [p[0] + n[0] * off, p[1] + n[1] * off], B = [q[0] + n[0] * off, q[1] + n[1] * off];
    out.push({ t: 'poly', pts: [A, B], cls: 'dx-thin' });
    for (const E of [A, B]) out.push({ t: 'poly', pts: [[E[0] - n[0] * 1.2 - dx / L * 0.8, E[1] - n[1] * 1.2 - dy / L * 0.8], [E[0] + n[0] * 1.2 + dx / L * 0.8, E[1] + n[1] * 1.2 + dy / L * 0.8]], cls: 'dx-thin' });
    out.push({ t: 'text', x: (A[0] + B[0]) / 2 + n[0] * 2, y: (A[1] + B[1]) / 2 + n[1] * 2, text: d.text, size: 2.5, anchor: 'middle', rot, kind: 'length', value: d.value });
  }
  if (o.showSpools) for (const l of iso.labels) { const c = S(l.at); out.push({ t: 'poly', pts: [[c[0] - 5, c[1] - 3.2], [c[0] + 5, c[1] - 3.2], [c[0] + 5, c[1] + 1.8], [c[0] - 5, c[1] + 1.8]], closed: true, cls: 'dx-line' }, { t: 'text', x: c[0], y: c[1] + 0.8, text: l.text, size: 2.8, anchor: 'middle', kind: 'spool' }); }
  for (const e of iso.ends) { const c = S(e.at); out.push({ t: 'text', x: c[0] + 2, y: c[1] + 4, text: e.text, size: 2.2, anchor: 'start', kind: 'elevation' }); }
  // North arrow (plant +y) at the top left of the drawing.
  const nx = (Number(a.x) || 0) - 6, ny = (Number(a.y) || 0) + 4, dir = [-C30, -S30];
  out.push({ t: 'poly', pts: [[nx, ny], [nx + dir[0] * 10, ny + dir[1] * 10]], cls: 'dx-line' }, { t: 'poly', pts: [[nx + dir[0] * 10 + 1.5, ny + dir[1] * 10 + 1.6], [nx + dir[0] * 10, ny + dir[1] * 10], [nx + dir[0] * 10 + 2.1, ny + dir[1] * 10 - 0.4]], cls: 'dx-line' }, { t: 'text', x: nx + dir[0] * 12.5, y: ny + dir[1] * 12.5, text: 'N', size: 3, anchor: 'middle', kind: 'north' });
  return out;
}


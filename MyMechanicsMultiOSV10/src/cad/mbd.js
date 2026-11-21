// Model-based definition: 3D annotations on the part (no kernel, no DOM). Dimensions (with tolerances), GD&T
// feature control frames, datums and notes are attached to faces / edges of the model by their signatures
// (refs.js: they are found again after a rebuild), kept in part.annotations, shown as screen-facing labels in
// the 3D view and copied into drawings ("insert model annotations").
//
// An annotation: { id, kind: 'dimension' | 'gdt' | 'datum' | 'note', name, refs: [{ type: 'face' | 'edge', sig }],
//   at (anchor, world xyz), offset (label offset from the anchor, xyz), value (measured, mm), measure ('distance' |
//   'diameter' | 'radius' | 'length'), tol { type: 'none' | 'symmetric' | 'deviation' | 'limits', plus, minus },
//   prefix ('' or 'n×'), symbol, tolerance, diameterZone, datums [..], letter, text, dangling (ref not found) }.
//
// Geometry of a reference ("info", handed in by the app from the kernel or by tests): faces { type, center,
// normal, radius?, axis? { point, dir }, point? (a point on the face) }, edges { type, mid, dir, length, start, end }.

export const MBD_KINDS = ['dimension', 'gdt', 'datum', 'note'];
export const TOL_TYPES = ['none', 'symmetric', 'deviation', 'limits'];
export const GDT_GLYPHS = {
  flatness: '⏥', straightness: '⏤', circularity: '○', cylindricity: '⌭', parallelism: '∥', perpendicularity: '⟂', angularity: '∠',
  position: '⌖', concentricity: '◎', symmetry: '⌯', profileLine: '⌒', profileSurface: '⌓', runout: '↗', totalRunout: '⌰',
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; };
const round = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;
const isCyl = (type) => type === 'CYLINDRE' || type === 'CYLINDER';
const isPlane = (info) => info?.type === 'PLANE';

let seq = 0;
const newAnnId = () => `mbd${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}`;

export const annotationsOf = (part) => (Array.isArray(part?.annotations) ? part.annotations : []);

/** The anchor point of a reference's geometry. */
export function anchorOf(info) {
  if (!info) return [0, 0, 0];
  if (info.mid) return info.mid.slice();
  if (isCyl(info.type) && info.point) return info.point.slice();
  return (info.center ?? [0, 0, 0]).slice();
}

/** Axis of a cylinder info (point, unit dir) or null. */
const axisOf = (info) => (info?.axis?.dir ? { point: info.axis.point, dir: unit(info.axis.dir) } : null);

/**
 * Measures one or two references: { value, measure, at } or null when they have no size together.
 * one cylinder → diameter; one circular edge → diameter; one straight edge → length;
 * plane + plane (parallel) → distance; plane + cylinder → distance plane–axis; cylinder + cylinder → axis distance.
 */
export function measureRefs(a, b = null) {
  if (!a) return null;
  if (!b) {
    if (isCyl(a.type) && a.radius > 0) return { value: 2 * a.radius, measure: 'diameter', at: anchorOf(a) };
    if (a.mid && a.type === 'CIRCLE' && a.length > 0) {
      const closed = a.start && a.end && len(sub(a.start, a.end)) < 1e-6;
      return closed ? { value: a.length / Math.PI, measure: 'diameter', at: anchorOf(a) } : { value: a.length, measure: 'length', at: anchorOf(a) };
    }
    if (a.mid && a.length > 0) return { value: a.length, measure: 'length', at: anchorOf(a) };
    return null;
  }
  const pa = isPlane(a), pb = isPlane(b), ca = axisOf(a), cb = axisOf(b);
  if (pa && pb) {
    const n = unit(a.normal);
    if (Math.abs(dot(n, unit(b.normal))) < 0.999) return null;
    return { value: Math.abs(dot(sub(b.center, a.center), n)), measure: 'distance', at: scale(add(anchorOf(a), anchorOf(b)), 0.5) };
  }
  if ((pa && cb) || (pb && ca)) {
    const plane = pa ? a : b, ax = pa ? cb : ca;
    const n = unit(plane.normal);
    if (Math.abs(dot(n, ax.dir)) > 1e-3) return null;          // the axis must lie parallel to the plane
    return { value: Math.abs(dot(sub(ax.point, plane.center), n)), measure: 'distance', at: scale(add(anchorOf(plane), ax.point), 0.5) };
  }
  if (ca && cb) {
    if (len(cross(ca.dir, cb.dir)) > 1e-3) return null;
    return { value: len(cross(sub(cb.point, ca.point), ca.dir)), measure: 'distance', at: scale(add(ca.point, cb.point), 0.5) };
  }
  if (a.mid && b.mid) return { value: len(sub(b.mid, a.mid)), measure: 'distance', at: scale(add(a.mid, b.mid), 0.5) };
  return null;
}

const DEFAULT_TOL = { type: 'none', plus: 0.1, minus: 0.1 };

/**
 * A new annotation. refs: [{ type, sig, info }] (info is used now and not stored). opts: kind-specific fields
 * (tol, symbol, tolerance, datums, letter, text, prefix), size (model size for the default label offset).
 */
export function createAnnotation(part, kind, refs = [], opts = {}) {
  const list = annotationsOf(part);
  const count = list.filter((x) => x.kind === kind).length + 1;
  const infos = refs.map((r) => r.info);
  const m = kind === 'dimension' ? measureRefs(infos[0], infos[1]) : null;
  const at = m?.at ?? anchorOf(infos[0]);
  const n = infos[0]?.normal ? unit(infos[0].normal) : [0, 0, 1];
  const size = opts.size ?? 100;
  const a = {
    id: opts.id ?? newAnnId(), kind, name: opts.name ?? `${opts.label ?? kind}${count}`,
    refs: refs.map((r) => ({ type: r.type, sig: r.sig })), at: at.map((v) => round(v)),
    offset: (opts.offset ?? scale(len(n) > 0 ? n : [0, 0, 1], size * 0.12)).map((v) => round(v)),
  };
  if (kind === 'dimension') {
    a.value = m ? round(m.value) : 0; a.measure = m?.measure ?? 'distance';
    a.tol = { ...DEFAULT_TOL, ...(opts.tol ?? {}) };
    if (opts.prefix) a.prefix = opts.prefix;
  } else if (kind === 'gdt') {
    a.symbol = opts.symbol ?? (isCyl(infos[0]?.type) ? 'position' : 'flatness');
    a.tolerance = String(opts.tolerance ?? (a.symbol === 'position' ? '0.1' : '0.05'));
    a.diameterZone = opts.diameterZone ?? a.symbol === 'position';
    a.datums = (opts.datums ?? []).map(String).slice(0, 3);
  } else if (kind === 'datum') {
    const used = new Set(list.filter((x) => x.kind === 'datum').map((x) => x.letter));
    a.letter = opts.letter ?? 'ABCDEFGHJKLMNP'.split('').find((c) => !used.has(c)) ?? 'A';
  } else {
    a.text = String(opts.text ?? '');
  }
  part.annotations = [...list, a];
  return a;
}

/** Updates fields of an annotation (number fields parsed, datums split). Returns it or null. */
export function editAnnotation(part, id, field, value) {
  const a = annotationsOf(part).find((x) => x.id === id);
  if (!a) return null;
  const num = (v) => { const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
  if (field === 'plus' || field === 'minus') { const x = num(value); if (x != null) a.tol = { ...DEFAULT_TOL, ...a.tol, [field]: Math.abs(x) }; }
  else if (field === 'tolType') a.tol = { ...DEFAULT_TOL, ...a.tol, type: TOL_TYPES.includes(value) ? value : 'none' };
  else if (field === 'value') { const x = num(value); if (x != null && x >= 0) a.value = x; }
  else if (field === 'datums') a.datums = String(value).split(/[,\s|]+/).filter(Boolean).map((x) => x.toUpperCase()).slice(0, 3);
  else if (field === 'letter') a.letter = String(value).trim().toUpperCase().slice(0, 2) || a.letter;
  else if (field === 'diameterZone') a.diameterZone = Boolean(value);
  else if (field === 'symbol') { if (GDT_GLYPHS[value]) a.symbol = value; }
  else if (['text', 'tolerance', 'name', 'prefix'].includes(field)) a[field] = String(value);
  return a;
}

export function removeAnnotation(part, id) {
  const before = annotationsOf(part).length;
  part.annotations = annotationsOf(part).filter((x) => x.id !== id);
  return part.annotations.length < before;
}

/**
 * After a rebuild: finds each annotation's references again with `find(ref) → info | null` and refreshes its
 * anchor and measured value; an annotation whose reference is gone is marked dangling. Returns the count found.
 */
export function resolveAnnotations(part, find) {
  let ok = 0;
  for (const a of annotationsOf(part)) {
    const infos = (a.refs ?? []).map((r) => find(r));
    if (!a.refs?.length) { a.dangling = false; ok++; continue; }
    if (infos.some((x) => !x)) { a.dangling = true; continue; }
    a.dangling = false; ok++;
    if (a.kind === 'dimension') {
      const m = measureRefs(infos[0], infos[1]);
      if (m) { a.value = round(m.value); a.at = m.at.map((v) => round(v)); }
    } else a.at = anchorOf(infos[0]).map((v) => round(v));
  }
  return ok;
}

const fmtNum = (v, d = 2) => { const r = Math.round(v * 10 ** d) / 10 ** d; return String(r); };

/** The text of a dimension: prefix, ⌀ / R, value and its tolerance (as one line). */
export function dimensionText(a, decimals = 2) {
  const sym = a.measure === 'diameter' ? '⌀' : a.measure === 'radius' ? 'R' : '';
  const v = fmtNum(a.value ?? 0, decimals);
  const tol = a.tol ?? DEFAULT_TOL;
  const pre = a.prefix ? `${a.prefix} ` : '';
  if (tol.type === 'symmetric') return `${pre}${sym}${v} ±${fmtNum(tol.plus, 3)}`;
  if (tol.type === 'deviation') return `${pre}${sym}${v} +${fmtNum(tol.plus, 3)}/-${fmtNum(tol.minus, 3)}`;
  if (tol.type === 'limits') return `${pre}${sym}${fmtNum((a.value ?? 0) + tol.plus, decimals + 1)}/${fmtNum((a.value ?? 0) - tol.minus, decimals + 1)}`;
  return `${pre}${sym}${v}`;
}

/** One-line text of any annotation (tree rows, notes in drawings). */
export function annotationText(a, decimals = 2) {
  if (a.kind === 'dimension') return dimensionText(a, decimals);
  if (a.kind === 'gdt') return `${GDT_GLYPHS[a.symbol] ?? '?'} ${a.diameterZone ? '⌀' : ''}${a.tolerance}${a.datums?.length ? ` | ${a.datums.join(' | ')}` : ''}`;
  if (a.kind === 'datum') return a.letter;
  return a.text ?? '';
}

/** Lower and upper limits of a dimension (mm). */
export function limitsOf(a) {
  const tol = a.tol ?? DEFAULT_TOL, v = a.value ?? 0;
  if (tol.type === 'none') return { lower: v, upper: v };
  if (tol.type === 'symmetric') return { lower: v - tol.plus, upper: v + tol.plus };
  return { lower: v - tol.minus, upper: v + tol.plus };
}

/** HTML of the screen-facing 3D label (escape = HTML escaping function). */
export function labelHtml(a, escape, decimals = 2) {
  if (a.kind === 'gdt') {
    const cells = [GDT_GLYPHS[a.symbol] ?? '?', `${a.diameterZone ? '⌀' : ''}${a.tolerance}`, ...(a.datums ?? [])];
    return `<span class="mbd-frame">${cells.map((c) => `<i>${escape(c)}</i>`).join('')}</span>`;
  }
  if (a.kind === 'datum') return `<span class="mbd-datum">${escape(a.letter)}</span>`;
  if (a.kind === 'note') return `<span class="mbd-note">${escape(a.text)}</span>`;
  return `<span class="mbd-dim">${escape(dimensionText(a, decimals))}</span>`;
}

/**
 * The auto dimension scheme of a prismatic part. model: { box: [[x0,y0,z0],[x1,y1,z1]], faces: [{ type, sig, info }] }.
 * Adds datums A (bottom, −Z), B (front, −Y) and C (left, −X) where such end faces exist, the overall sizes
 * between opposite end faces, each distinct hole size (n× ⌀d) and the hole positions from the datum faces, a
 * position frame for the holes and a flatness frame on datum A. Returns the annotations added. Z is up.
 */
export function autoDimensionScheme(part, model, { size = null, labels = {}, replace = true } = {}) {
  const [lo, hi] = model.box;
  const ext = [0, 1, 2].map((k) => hi[k] - lo[k]);
  const S = size ?? Math.max(...ext, 1);
  const tolL = 1e-4 * S + 1e-6;
  if (replace) part.annotations = annotationsOf(part).filter((a) => !a.auto);
  const added = [];
  const mk = (kind, refs, opts) => { const a = createAnnotation(part, kind, refs, { size: S, ...opts, label: labels[kind] ?? kind }); a.auto = true; added.push(a); return a; };
  const planes = model.faces.filter((f) => isPlane(f.info));
  /** The largest planar face at the box's end along axis k (side −1 = min, +1 = max). */
  const endFace = (k, side) => {
    let best = null;
    for (const f of planes) {
      const n = unit(f.info.normal);
      if (n[k] * side < 0.999) continue;
      const c = f.info.center[k];
      if (Math.abs(c - (side < 0 ? lo[k] : hi[k])) > tolL) continue;
      if (!best || (f.info.area ?? 0) > (best.info.area ?? 0)) best = f;
    }
    return best;
  };
  const ends = [0, 1, 2].map((k) => [endFace(k, -1), endFace(k, 1)]);
  const datumFace = { A: ends[2][0], B: ends[1][0], C: ends[0][0] };
  const datums = [];
  for (const letter of ['A', 'B', 'C']) {
    const f = datumFace[letter];
    if (!f) continue;
    mk('datum', [f], { letter, offset: scale(unit(f.info.normal), S * 0.1) });
    datums.push(letter);
  }
  if (datumFace.A) mk('gdt', [datumFace.A], { symbol: 'flatness', tolerance: '0.05', offset: add(scale(unit(datumFace.A.info.normal), S * 0.12), [S * 0.15, 0, 0]) });
  // Overall sizes: between the two end faces of each axis (the label beside the part).
  const side = [[0, -S * 0.15, 0], [-S * 0.15, 0, 0], [-S * 0.15, -S * 0.15, 0]];
  for (const k of [0, 1, 2]) {
    const [a, b] = ends[k];
    if (a && b) mk('dimension', [a, b], { offset: side[k], tol: { type: 'symmetric', plus: 0.1, minus: 0.1 } });
  }
  // Holes: cylindrical faces whose normal points at their axis (material outside).
  const holes = [];
  for (const f of model.faces) {
    const info = f.info;
    if (!isCyl(info.type) || !(info.radius > 0) || !info.axis) continue;
    const ax = axisOf(info);
    const p = info.point ?? null;
    if (p && info.normal) {
      const radial = sub(p, add(ax.point, scale(ax.dir, dot(sub(p, ax.point), ax.dir))));
      if (dot(radial, info.normal) > 0) continue;       // a boss (normal away from the axis)
    }
    if (holes.some((h) => Math.abs(h.info.radius - info.radius) < 1e-6 && len(cross(sub(h.axis.point, ax.point), ax.dir)) < 1e-6)) continue;
    holes.push({ ...f, axis: ax });
  }
  const groups = new Map();
  for (const h of holes) { const key = (2 * h.info.radius).toFixed(4); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(h); }
  for (const list of groups.values()) {
    mk('dimension', [list[0]], { prefix: list.length > 1 ? `${list.length}×` : '', offset: [S * 0.1, S * 0.1, S * 0.1], tol: { type: 'deviation', plus: 0.1, minus: 0 } });
    mk('gdt', [list[0]], { symbol: 'position', tolerance: '0.1', diameterZone: true, datums: datums.slice(0, 3), offset: [S * 0.1, S * 0.1, S * 0.2] });
    // Positions of each hole from the datum faces of the two axes across the hole.
    for (const h of list) {
      const across = [0, 1, 2].filter((k) => Math.abs(h.axis.dir[k]) < 0.5);
      for (const k of across) {
        const datum = ends[k][0];
        if (!datum) continue;
        mk('dimension', [datum, h], { offset: scale(unit(datum.info.normal), S * 0.08) });
      }
    }
  }
  return added;
}

/**
 * Model annotations as drawing annotations of one view. `toSheet(p) → [x, y]` maps a model point to sheet mm
 * (y down); `visible(a)` may skip some. Dimensions between two references become linear dimensions (their two
 * anchors projected), one-reference dimensions notes with a leader; GD&T frames, datums and notes keep their
 * kind; a two-reference dimension seen end-on (along the line of sight) is left out. Each gets `fromModel: <annotation id>` so inserting again replaces the earlier copies.
 */
export function toDrawingAnnotations(annotations, { toSheet, newId, view = null, decimals = 2, infoOf = null, sheet = null } = {}) {
  const out = [];
  let i = 0;
  for (const a of annotations) {
    if (a.dangling) continue;
    const t = toSheet(a.at);
    if (!t || !t.every(Number.isFinite)) continue;
    const lab = toSheet(add(a.at, a.offset ?? [0, 0, 0]));
    const dx = lab && Math.hypot(lab[0] - t[0], lab[1] - t[1]) > 4 ? lab[0] - t[0] : 10 + (i % 3) * 4;
    const dy = lab && Math.hypot(lab[0] - t[0], lab[1] - t[1]) > 4 ? lab[1] - t[1] : -10 - (i % 4) * 5;
    const x = round(t[0] + dx, 2), y = round(t[1] + dy, 2);
    const base = { id: newId('ann'), fromModel: a.id, ...(view ? { view } : {}), ...(sheet ? { sheet } : {}) };
    i++;
    if (a.kind === 'dimension') {
      const infos = infoOf ? (a.refs ?? []).map(infoOf) : [];
      if (a.refs?.length === 2 && infos.length === 2 && infos.every(Boolean)) {
        const pa = toSheet(anchorOf(infos[0])), pb = toSheet(anchorOf(infos[1]));
        if (pa && pb && Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > 1) {
          out.push({ ...base, kind: 'dimension', x: round((pa[0] + pb[0]) / 2, 2), y: round((pa[1] + pb[1]) / 2, 2), a: pa.map((v) => round(v, 2)), b: pb.map((v) => round(v, 2)), text: dimensionText(a, decimals), offset: 8 });
          continue;
        }
        // Measured along the line of sight: it belongs to another view.
        if (pa && pb) { i--; continue; }
      }
      out.push({ ...base, kind: 'note', x, y, text: dimensionText(a, decimals), size: 3.5, target: t.map((v) => round(v, 2)) });
    } else if (a.kind === 'gdt') out.push({ ...base, kind: 'gdt', x, y, symbol: a.symbol, tolerance: a.tolerance, diameter: Boolean(a.diameterZone), modifier: '', datums: a.datums ?? [], target: t.map((v) => round(v, 2)) });
    else if (a.kind === 'datum') out.push({ ...base, kind: 'datum', x, y, letter: a.letter, target: t.map((v) => round(v, 2)) });
    else out.push({ ...base, kind: 'note', x, y, text: a.text ?? '', size: 3.5, target: t.map((v) => round(v, 2)) });
  }
  return out;
}

/** Replaces the drawing's earlier copies of model annotations with `list`. Returns the count added. */
export function insertIntoDrawing(drawing, list) {
  const ids = new Set(list.map((x) => x.fromModel));
  drawing.annotations = [...(drawing.annotations ?? []).filter((x) => !x.fromModel || !ids.has(x.fromModel)), ...list];
  return list.length;
}

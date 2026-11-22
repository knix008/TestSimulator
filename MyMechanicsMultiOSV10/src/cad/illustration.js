// Technical illustrations of an assembly (no DOM): saved views — camera, explode amount, hidden components,
// callouts, a display style — played as an animation (views interpolated), drawn as vector line art (the
// kernel's hidden-line projection of the exploded assembly, as the drawings use) with numbered balloons and a parts
// list, and published as one self-contained HTML document that steps through the views.
//
// assembly.illustration = { views: [{ id, name, camera: { dir, up, target, zoom }, explode (0…1), hidden: [compId],
//   callouts: [{ id, comp, text (empty = the balloon's item number), at: [x, y, z] (point on the part, assembly
//   space, unexploded), offset: [dx, dy] (label from the point, mm on the page) }], style: 'lines' | 'hidden' }] }
import { rep } from './kernel.js';
import { explodedPlacement, placeShape } from './assembly.js';
import { projectView } from './drawing.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 1]; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r3 = (v) => Math.round(v * 1000) / 1000;

/** The illustration of an assembly (created on first use). */
export function illustrationOf(assembly, { create = false } = {}) {
  if (!assembly.illustration && create) assembly.illustration = { views: [] };
  return assembly.illustration ?? null;
}

/** A view (defaults filled in): camera looking along `dir` (from the eye toward the target), `up` kept square to it. */
export function normaliseView(v = {}, id = 'v1') {
  const dir = unit(v.camera?.dir ?? [-1, 1, -1]);
  let up = v.camera?.up ?? [0, 0, 1];
  up = sub(up, mul(dir, dot(up, dir)));
  if (Math.hypot(...up) < 1e-6) up = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  return {
    id: v.id ?? id,
    name: v.name ?? id,
    camera: { dir, up: unit(up), target: v.camera?.target ?? [0, 0, 0], zoom: Number.isFinite(v.camera?.zoom) && v.camera.zoom > 0 ? v.camera.zoom : 1 },
    explode: Math.max(0, Math.min(1, Number(v.explode) || 0)),
    hidden: [...(v.hidden ?? [])],
    callouts: (v.callouts ?? []).map((c, i) => ({ id: c.id ?? `c${i + 1}`, comp: c.comp, text: c.text ?? '', at: c.at ?? [0, 0, 0], offset: c.offset ?? [12, -12] })),
    style: v.style === 'hidden' ? 'hidden' : 'lines',
  };
}

/** Spherical interpolation of two unit vectors (the camera turns at an even rate). */
function slerp(a, b, t) {
  const c = Math.max(-1, Math.min(1, dot(a, b)));
  const w = Math.acos(c);
  if (w < 1e-6) return unit(add(mul(a, 1 - t), mul(b, t)));
  if (Math.PI - w < 1e-6) { const axis = unit(Math.abs(a[2]) < 0.9 ? cross(a, [0, 0, 1]) : cross(a, [1, 0, 0])); const m = unit(cross(axis, a)); return t < 0.5 ? slerp(a, m, t * 2) : slerp(m, b, t * 2 - 1); }
  const s = Math.sin(w);
  return unit(add(mul(a, Math.sin((1 - t) * w) / s), mul(b, Math.sin(t * w) / s)));
}

/**
 * The state between two views at t (0…1, eased): camera directions and ups turned on great circles, target and zoom
 * (logarithmically) blended, explode blended, components hidden in either view fading (opacity per component).
 */
export function interpolateViews(a, b, t) {
  const A = normaliseView(a); const B = normaliseView(b);
  const e = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const dir = slerp(A.camera.dir, B.camera.dir, e);
  let up = slerp(A.camera.up, B.camera.up, e);
  up = unit(sub(up, mul(dir, dot(up, dir))));
  const opacity = {};
  // Hidden in the first view only: fades in; in the second only: fades out; in both: stays hidden.
  for (const id of new Set([...A.hidden, ...B.hidden])) {
    const inA = A.hidden.includes(id); const inB = B.hidden.includes(id);
    opacity[id] = inA && inB ? 0 : inA ? e : 1 - e;
  }
  return {
    camera: { dir, up, target: add(mul(A.camera.target, 1 - e), mul(B.camera.target, e)), zoom: Math.exp(Math.log(A.camera.zoom) * (1 - e) + Math.log(B.camera.zoom) * e) },
    explode: A.explode * (1 - e) + B.explode * e,
    opacity,
  };
}

/** The placement of each visible component at a view's explode amount: Map compId → { position, rotation }. */
export function viewPlacements(assembly, view) {
  const v = normaliseView(view);
  const out = new Map();
  for (const c of assembly.components ?? []) {
    if (c.suppressed || v.hidden.includes(c.id)) continue;
    out.set(c.id, v.explode > 0 ? explodedPlacement(assembly, c, v.explode) : { position: [...c.position], rotation: [...c.rotation] });
  }
  return out;
}

/** Item numbers of the parts list: one per distinct part, in the order the components first use them. */
export function itemNumbers(assembly) {
  const byPart = new Map(); const rows = [];
  for (const c of assembly.components ?? []) {
    if (c.suppressed) continue;
    if (!byPart.has(c.part)) { byPart.set(c.part, rows.length + 1); rows.push({ item: rows.length + 1, part: c.part, qty: 0 }); }
    rows[byPart.get(c.part) - 1].qty++;
  }
  return { byPart, rows };
}

/**
 * Where a balloon points on each component: a point on the placed part (its rotation and position applied) — the
 * mesh vertex nearest the centre of its box, so a hollow or L-shaped part gets a point on its material, not in the
 * air. `localShape(c)` gives the component's shape in its own coordinates. Map compId → [x, y, z] (assembly space).
 */
export function anchorPoints(assembly, localShape) {
  const out = new Map();
  for (const c of assembly.components ?? []) {
    if (c.suppressed) continue;
    try {
      const s = localShape(c); if (!s) continue;
      const placed = placeShape(s, c);
      const [lo, hi] = placed.boundingBox.bounds;
      const centre = mul(add(lo, hi), 0.5);
      const m = placed.mesh({ tolerance: Math.max(0.05, Math.hypot(...sub(hi, lo)) / 100), angularTolerance: 0.4 });
      let best = centre; let bd = Infinity;
      for (let i = 0; i < m.vertices.length; i += 3) { const p = [m.vertices[i], m.vertices[i + 1], m.vertices[i + 2]]; const d = Math.hypot(...sub(p, centre)); if (d < bd) { bd = d; best = p; } }
      out.set(c.id, best);
    } catch { /* no body */ }
  }
  return out;
}

/** Automatic callouts: a balloon on every distinct part, on its first visible component (anchorPoints). */
export function autoCallouts(assembly, anchors) {
  const seen = new Set(); const out = [];
  for (const c of assembly.components ?? []) {
    if (c.suppressed || seen.has(c.part) || !anchors.has(c.id)) continue;
    seen.add(c.part);
    out.push({ id: `c${out.length + 1}`, comp: c.id, text: '', at: anchors.get(c.id), offset: [14 + 6 * (out.length % 3), -14 - 6 * (out.length % 2)] });
  }
  return out;
}

/** A point in a view's 2D frame (the projection's: x right, y down in the SVG paths). */
function toView(p, basis) { return [dot(p, basis.x), -dot(p, basis.y)]; }

/**
 * Line art of a view: { svg, box, balloons } — the exploded assembly (hidden components left out) projected along the
 * camera with hidden lines removed (dashed when the style is 'hidden'), numbered balloons with leaders at the callouts
 * (moved with their component), and a parts list (item, name, quantity). `shapeOf(comp)` gives a component's shape
 * in its part's own coordinates; `nameOf(partId)` its name. Page units are millimetres at `scale`.
 */
export function illustrationSvg(assembly, view, { shapeOf, nameOf = (id) => id, title = '', width = 297, height = 210, margin = 12, bom = true } = {}) {
  const R = rep();
  const v = normaliseView(view);
  const places = viewPlacements(assembly, v);
  const shapes = [];
  for (const c of assembly.components ?? []) {
    if (!places.has(c.id)) continue;
    const s = shapeOf(c);
    if (s) shapes.push(placeShape(s, places.get(c.id)));
  }
  if (!shapes.length) throw Object.assign(new Error('nothing to draw'), { code: 'empty' });
  const all = shapes.length === 1 ? shapes[0] : R.makeCompound(shapes);
  // The drawings' view direction points from the part to the viewer; the camera's looks from the viewer.
  const proj = projectView(all, 'custom', { type: 'custom', dir: mul(v.camera.dir, -1), up: v.camera.up });
  const basis = proj.basis;
  const { byPart, rows } = itemNumbers(assembly);
  // Balloons: the callout point moves with its component (its offset from the unexploded placement).
  const balloons = [];
  for (const co of v.callouts) {
    const comp = assembly.components.find((c) => c.id === co.comp);
    if (!comp || !places.has(comp.id)) continue;
    const shift = sub(places.get(comp.id).position, comp.position);
    const p = toView(add(co.at, shift), basis);
    balloons.push({ id: co.id, item: byPart.get(comp.part), text: co.text || String(byPart.get(comp.part)), at: p, label: [p[0] + co.offset[0] / 1, p[1] + co.offset[1] / 1] });
  }
  // Fit the drawing (and its balloons) into the page area left of the parts list.
  const tableW = bom ? 70 : 0;
  const box = { x0: proj.box.x0, x1: proj.box.x1, y0: -proj.box.y1, y1: -proj.box.y0 };
  for (const b of balloons) { box.x0 = Math.min(box.x0, b.label[0] - 6); box.x1 = Math.max(box.x1, b.label[0] + 6); box.y0 = Math.min(box.y0, b.label[1] - 6); box.y1 = Math.max(box.y1, b.label[1] + 6); }
  const availW = width - 2 * margin - tableW - (bom ? 6 : 0); const availH = height - 2 * margin - (title ? 10 : 0);
  const scale = Math.min(availW / Math.max(1e-6, box.x1 - box.x0), availH / Math.max(1e-6, box.y1 - box.y0)) * v.camera.zoom;
  const ox = margin + (availW - (box.x1 - box.x0) * scale) / 2 - box.x0 * scale;
  const oy = margin + (title ? 10 : 0) + (availH - (box.y1 - box.y0) * scale) / 2 - box.y0 * scale;
  const tf = `translate(${r3(ox)} ${r3(oy)}) scale(${r3(scale)})`;
  const stroke = (w) => r3(w / scale);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm" font-family="Roboto, sans-serif">`, `<rect width="${width}" height="${height}" fill="#fff"/>`];
  if (title) out.push(`<text x="${margin}" y="${margin + 6}" font-size="6" font-weight="bold">${esc(title)}</text>`);
  out.push(`<g transform="${tf}" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  if (v.style === 'hidden') for (const d of proj.hidden) out.push(`<path class="hidden" d="${d}" stroke="#666" stroke-width="${stroke(0.25)}" stroke-dasharray="${stroke(1.5)} ${stroke(1)}"/>`);
  for (const d of proj.visible) out.push(`<path class="visible" d="${d}" stroke="#111" stroke-width="${stroke(0.5)}"/>`);
  out.push('</g>');
  for (const b of balloons) {
    const ax = ox + b.at[0] * scale; const ay = oy + b.at[1] * scale; const lx = ox + b.label[0] * scale; const ly = oy + b.label[1] * scale;
    out.push(`<g class="balloon" data-item="${b.item}"><line x1="${r3(ax)}" y1="${r3(ay)}" x2="${r3(lx)}" y2="${r3(ly)}" stroke="#c0392b" stroke-width="0.35"/><circle cx="${r3(ax)}" cy="${r3(ay)}" r="0.7" fill="#c0392b"/><circle cx="${r3(lx)}" cy="${r3(ly)}" r="4" fill="#fff" stroke="#c0392b" stroke-width="0.45"/><text x="${r3(lx)}" y="${r3(ly + 1.4)}" font-size="4" text-anchor="middle" fill="#c0392b">${esc(b.text)}</text></g>`);
  }
  if (bom) {
    const x = width - margin - tableW; let y = margin + (title ? 10 : 0);
    out.push(`<g class="bom" font-size="3.2"><rect x="${x}" y="${y}" width="${tableW}" height="${6 + rows.length * 5}" fill="none" stroke="#111" stroke-width="0.3"/><text x="${x + 2}" y="${y + 4}" font-weight="bold">#</text><text x="${x + 10}" y="${y + 4}" font-weight="bold">Part</text><text x="${x + tableW - 2}" y="${y + 4}" text-anchor="end" font-weight="bold">Qty</text>`);
    for (const row of rows) { y += 5; out.push(`<text x="${x + 2}" y="${y + 4}">${row.item}</text><text x="${x + 10}" y="${y + 4}">${esc(nameOf(row.part))}</text><text x="${x + tableW - 2}" y="${y + 4}" text-anchor="end">${row.qty}</text>`); }
    out.push('</g>');
  }
  out.push('</svg>');
  return { svg: out.join(''), box, scale, balloons, rows };
}

/**
 * One self-contained HTML document of the illustration: every view's line art inline, its name as a step caption,
 * previous / next buttons, arrow keys and a step list — readable anywhere, no scripts or files from elsewhere.
 */
export function illustrationHtml(title, steps) {
  const items = steps.map((s, i) => `<section class="step" data-step="${i}"${i ? ' hidden' : ''}><h2>${i + 1}. ${esc(s.name)}</h2>${s.note ? `<p>${esc(s.note)}</p>` : ''}<div class="art">${s.svg}</div></section>`).join('');
  const list = steps.map((s, i) => `<li><button data-go="${i}">${i + 1}. ${esc(s.name)}</button></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f5f7;color:#111;display:grid;grid-template-columns:220px 1fr;min-height:100vh}nav{background:#fff;border-right:1px solid #ddd;padding:12px}nav ol{list-style:none;margin:0;padding:0}nav button{width:100%;text-align:left;border:0;background:none;padding:6px 8px;border-radius:6px;cursor:pointer}nav button.on{background:#e8f0fe;font-weight:600}main{padding:16px}.art svg{width:100%;height:auto;background:#fff;border:1px solid #ddd;border-radius:8px}.bar{display:flex;gap:8px;margin-top:12px}.bar button{padding:8px 14px;border-radius:8px;border:1px solid #bbb;background:#fff;cursor:pointer}@media (max-width:700px){body{grid-template-columns:1fr}nav{display:none}}</style></head><body><nav><h1 style="font-size:16px">${esc(title)}</h1><ol>${list}</ol></nav><main>${items}<div class="bar"><button id="prev">◀</button><span id="pos"></span><button id="next">▶</button></div></main><script>const s=[...document.querySelectorAll('.step')],b=[...document.querySelectorAll('[data-go]')];let i=0;function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach((e,k)=>e.hidden=k!==i);b.forEach((e,k)=>e.classList.toggle('on',k===i));document.getElementById('pos').textContent=(i+1)+' / '+s.length;}document.getElementById('prev').onclick=()=>go(i-1);document.getElementById('next').onclick=()=>go(i+1);b.forEach((e,k)=>e.onclick=()=>go(k));addEventListener('keydown',(e)=>{if(e.key==='ArrowRight')go(i+1);if(e.key==='ArrowLeft')go(i-1);});go(0);</script></body></html>`;
}


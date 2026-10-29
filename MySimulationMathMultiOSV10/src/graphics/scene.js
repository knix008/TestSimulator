// The GUI copy of the engine's figure tree (core/graphics/PROTOCOL.md) and
// pure helpers over it. DOM-free so Node tests can import it.
//
//   let s = emptyScene();
//   const r = reduceScene(s, msg);   // msg: graphics.scene | graphics.update | graphics.close
//   s = r.state;                     // r.changed: figure ids, r.closed, r.limitsChanged: axes ids

const AXES = new Set(['axes', 'polaraxes', 'uiaxes']);
export const isAxes = (n) => !!n && AXES.has(n.type);
const LEGENDABLE = new Set(['line', 'animatedline', 'scatter', 'surface', 'patch', 'bar', 'histogram', 'area', 'stair', 'stem', 'errorbar', 'quiver', 'contour', 'histogram2']);

export function emptyScene() {
  return { figures: new Map(), order: [], current: null };
}

const sortIds = (ids) => ids.slice().sort((a, b) => a - b);

/** Applies one engine → GUI message. Returns { state, changed, closed, limitsChanged, activate }. */
export function reduceScene(state, msg) {
  const out = { state, changed: [], closed: [], limitsChanged: [], activate: null };
  if (!msg || typeof msg !== 'object') return out;
  if (msg.type === 'graphics.scene' || msg.type === 'graphics.update') {
    const full = msg.type === 'graphics.scene';
    const figures = full ? new Map() : new Map(state.figures);
    for (const f of msg.figures || []) {
      if (!f || f.type !== 'figure') continue;
      const prev = state.figures.get(f.id);
      if (prev) out.limitsChanged.push(...limitChanges(prev, f));
      figures.set(f.id, f);
      out.changed.push(f.id);
    }
    if (full) for (const id of state.figures.keys()) if (!figures.has(id)) out.closed.push(id);
    const current = msg.current != null && figures.has(msg.current) ? msg.current : (figures.has(state.current) ? state.current : null);
    if (msg.current != null && figures.has(msg.current) && (msg.current !== state.current || out.changed.includes(msg.current))) out.activate = msg.current;
    out.state = { figures, order: sortIds([...figures.keys()]), current };
    return out;
  }
  if (msg.type === 'graphics.close') {
    if (!state.figures.has(msg.id)) return out;
    const figures = new Map(state.figures);
    figures.delete(msg.id);
    out.closed.push(msg.id);
    out.state = { figures, order: sortIds([...figures.keys()]), current: state.current === msg.id ? null : state.current };
    return out;
  }
  return out;
}

/** Calls fn(node, parent) for every node of the tree (children only, inline nodes excluded). */
export function walk(node, fn, parent = null) {
  if (!node) return;
  fn(node, parent);
  for (const c of node.children || []) walk(c, fn, node);
}

/** Every axes of a figure (inside tiled layouts and panels too). */
export function axesOf(fig) {
  const out = [];
  walk(fig, (n) => { if (isAxes(n)) out.push(n); });
  return out;
}

/** The node with this id (children and the inline Legend / Colorbar / text nodes). */
export function findNode(root, id) {
  let hit = null;
  const visit = (n) => {
    if (!n || hit) return;
    if (n.id === id) { hit = n; return; }
    const p = n.props || {};
    for (const k of ['Legend', 'Colorbar', 'Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel', 'SgTitle', 'Label']) if (p[k] && typeof p[k] === 'object' && p[k].id != null) visit(p[k]);
    for (const c of n.children || []) visit(c);
  };
  visit(root);
  return hit;
}

/** The figure that holds node id. */
export function figureOfNode(state, id) {
  for (const f of state.figures.values()) if (findNode(f, id)) return f;
  return null;
}

/** light objects of an axes (hggroups included). */
export function lightsOf(ax) {
  const out = [];
  const visit = (n) => { for (const c of n.children || []) { if (c.type === 'light') out.push(c); else if (c.type === 'hggroup') visit(c); } };
  if (ax) visit(ax);
  return out;
}

const key2 = (a) => JSON.stringify(a == null ? null : a);

/** Axes ids whose limits or view the engine changed between two versions of a figure. */
export function limitChanges(prevFig, nextFig) {
  const before = new Map(axesOf(prevFig).map((a) => [a.id, a]));
  const out = [];
  for (const a of axesOf(nextFig)) {
    const b = before.get(a.id);
    if (!b) continue;
    const p = a.props, q = b.props;
    if (key2(p.XLim) !== key2(q.XLim) || key2(p.YLim) !== key2(q.YLim) || key2(p.ZLim) !== key2(q.ZLim) || key2(p.View) !== key2(q.View)) out.push(a.id);
  }
  return out;
}

/** Title of a figure tab: "Figure 1: Name", "Name" (NumberTitle off) or "Figure 1". */
export function figureTitle(fig, figureWord = 'Figure {n}') {
  const p = (fig && fig.props) || {};
  const n = p.Number != null ? p.Number : fig.id;
  const name = p.Name ? String(p.Name) : '';
  const num = figureWord.split('{n}').join(String(n));
  if (p.NumberTitle === false) return name || num;
  return name ? `${num}: ${name}` : num;
}

/** Legendable children of an axes in creation order (the engine keeps children newest first). */
export function plotChildren(ax) {
  const out = [];
  const visit = (n) => {
    for (const c of (n.children || []).slice().reverse()) {
      if (c.type === 'hggroup') { visit(c); continue; }
      if (LEGENDABLE.has(c.type)) out.push(c);
    }
  };
  visit(ax);
  return out;
}

/** A legend node made in the GUI for an axes without one (the toolbar's legend toggle). */
export function syntheticLegend(ax) {
  const entries = plotChildren(ax).map((c, i) => ({ target: c.id, label: c.props.DisplayName || `data${i + 1}` }));
  return {
    id: -Math.abs(ax.id) - 0.5, type: 'legend', synthetic: true, children: [],
    auto: ['TextColor', 'Color', 'EdgeColor'],
    props: { Entries: entries, Location: 'northeast', Orientation: 'vertical', NumColumns: 1, Box: true, FontSize: Math.max(7, (ax.props.FontSize || 10) * 0.9), TextColor: [0, 0, 0], Color: [1, 1, 1], EdgeColor: [0.15, 0.15, 0.15], Visible: true, Title: '', Interpreter: 'tex' },
  };
}

/** A colorbar node made in the GUI for an axes without one. */
export function syntheticColorbar(ax) {
  return {
    id: -Math.abs(ax.id) - 0.25, type: 'colorbar', synthetic: true, children: [], auto: ['Color'],
    props: { Location: 'eastoutside', Limits: (ax.props.CLim || [0, 1]).slice(), Ticks: [], TickLabels: [], TicksMode: 'auto', TickLabelsMode: 'auto', Label: null, Direction: 'normal', FontSize: Math.max(7, (ax.props.FontSize || 10) * 0.9), Color: [0.15, 0.15, 0.15], Visible: true, Colormap: ax.props.Colormap, Axes: ax.id },
  };
}

/**
 * Applies the figure-level legend / colorbar toggles to a figure in place.
 * on = true: every 2D/3D cartesian axes shows one (synthetic when missing);
 * false: all hidden; null: as the engine sent them. Returns the
 * [{handle, props}] changes the engine must hear about (real nodes only).
 */
export function applyToggles(fig, { legend = null, colorbar = null } = {}) {
  const sync = [];
  for (const ax of axesOf(fig)) {
    if (ax.props.Kind === 'polar' && colorbar != null) { /* polar axes have no colorbar */ }
    const p = ax.props;
    if (legend != null) {
      if (p.Legend && !p.Legend.synthetic) {
        if (p.Legend.props.Visible !== legend) { p.Legend.props.Visible = legend; sync.push({ handle: p.Legend.id, props: { Visible: legend } }); }
      } else if (legend && plotChildren(ax).length) p.Legend = syntheticLegend(ax);
      else if (!legend && p.Legend && p.Legend.synthetic) p.Legend = null;
    }
    if (colorbar != null && p.Kind !== 'polar') {
      if (p.Colorbar && !p.Colorbar.synthetic) {
        if (p.Colorbar.props.Visible !== colorbar) { p.Colorbar.props.Visible = colorbar; sync.push({ handle: p.Colorbar.id, props: { Visible: colorbar } }); }
      } else if (colorbar) p.Colorbar = syntheticColorbar(ax);
      else if (p.Colorbar && p.Colorbar.synthetic) p.Colorbar = null;
    }
  }
  return sync;
}

/** True when any axes of the figure shows a legend / colorbar. */
export function anyShown(fig, prop) {
  return axesOf(fig).some((a) => a.props[prop] && a.props[prop].props && a.props[prop].props.Visible !== false);
}

/** Items of a uicontrol popupmenu / listbox String ('a|b', ['a','b'] or 'a\nb'). */
export function uiItems(s) {
  if (Array.isArray(s)) return s.map(String);
  if (s == null) return [];
  const t = String(s);
  if (t.includes('|')) return t.split('|');
  return t.split('\n');
}

/** 1-2-5 step near span/20 for the light position steppers. */
export function niceStep(span) {
  if (!(span > 0) || !Number.isFinite(span)) return 0.1;
  const raw = span / 20;
  const e = 10 ** Math.floor(Math.log10(raw));
  const f = raw / e;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e;
}

/** Zooms limits [a, b] about pixel px by factor (>1 zooms in) through a mapper's forward/inverse pair. */
export function zoomLimits(lim, toPx, fromPx, px, factor) {
  const a = toPx(lim[0]), b = toPx(lim[1]);
  const na = fromPx(px + (a - px) / factor), nb = fromPx(px + (b - px) / factor);
  return na <= nb ? [na, nb] : [nb, na];
}

/** Shifts limits by dpx pixels. */
export function panLimits(lim, toPx, fromPx, dpx) {
  const na = fromPx(toPx(lim[0]) - dpx), nb = fromPx(toPx(lim[1]) - dpx);
  return na <= nb ? [na, nb] : [nb, na];
}

/** Data point nearest to (sx, sy) on screen among 2D children: { node, x, y, z, dist } or null. */
export function nearestPoint(ax, mapper, sx, sy, maxDist = 24) {
  let best = null;
  const consider = (node, xs, ys, zs) => {
    const n = Math.min(xs.length, ys.length);
    for (let i = 0; i < n; i++) {
      const X = mapper.x(xs[i]), Y = mapper.y(ys[i]);
      if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
      const d = Math.hypot(X - sx, Y - sy);
      if (d <= maxDist && (!best || d < best.dist)) best = { node, x: xs[i], y: ys[i], z: zs ? zs[i] : undefined, index: i + 1, dist: d };
    }
  };
  const data = (M) => (M && M.data ? M.data : Array.isArray(M) ? M : []);
  const visit = (n) => {
    for (const c of n.children || []) {
      const p = c.props || {};
      if (p.Visible === false) continue;
      if (c.type === 'hggroup') { visit(c); continue; }
      if (['line', 'animatedline', 'scatter', 'stair', 'stem', 'errorbar'].includes(c.type)) consider(c, data(p.XData), data(p.YData), data(p.ZData).length ? data(p.ZData) : null);
      else if (c.type === 'bar' && Array.isArray(p.Rects)) {
        const xs = [], ys = [];
        for (const r of p.Rects) { if (p.Horizontal) { xs.push(r[2]); ys.push((r[1] + r[3]) / 2); } else { xs.push((r[0] + r[2]) / 2); ys.push(r[3]); } }
        consider(c, xs, ys, null);
      } else if (c.type === 'area' && Array.isArray(p.X)) consider(c, p.X, p.Upper || [], null);
    }
  };
  visit(ax);
  return best;
}

/** Short number text for data tips and the status bar. */
export function fmtNum(x) {
  if (typeof x !== 'number') return String(x);
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf';
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return x.toExponential(3).replace(/\.?0+e/, 'e');
  return String(Number(x.toPrecision(5)));
}

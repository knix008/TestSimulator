// Scene serialisation (see PROTOCOL.md) and flushing to the GUI.
import { G, isAxesType, THEMED } from './model.js';
import { TYPES, COMMON } from './schema.js';
import { axesInfo, contourGeometry, stairPath, histRects } from './compute.js';
import { colormapByName } from './colormaps.js';

const SKIP_KINDS = new Set(['any']);
const SKIP_NAMES = new Set(['UserData', 'ContextMenu', 'UIContextMenu', 'Toolbar', 'Interactions', 'Layout', 'CurrentPoint', 'Theme', 'Labels']);
const INLINE = new Set(['Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel', 'Legend', 'Colorbar', 'Label']);

const matOut = (M) => (M ? { dims: M.dims.slice(), data: Array.from(M.data) } : null);

function specList(type) {
  if (!specList.cache) specList.cache = new Map();
  let l = specList.cache.get(type);
  if (!l) { l = [...COMMON, ...TYPES[type]]; specList.cache.set(type, l); }
  return l;
}

/** Serialises one object (and its subtree). `ctxInfo` carries per-axes derived data. */
export function serialize(ctx, o, derived = null) {
  const st = G(ctx);
  const props = {};
  for (const [name, kind] of specList(o.type)) {
    if (SKIP_KINDS.has(kind) || SKIP_NAMES.has(name)) continue;
    const v = o.props[name];
    if (kind === 'cb') { props[name] = v != null; continue; }
    if (kind === 'mat') { props[name] = matOut(v); continue; }
    if (kind === 'handle') {
      if (INLINE.has(name) && v != null) { const h = st.objs.get(v); props[name] = h ? serialize(ctx, h, derived) : null; }
      else props[name] = v;
      continue;
    }
    if (Array.isArray(v)) props[name] = v.slice();
    else props[name] = v;
  }
  const node = { id: o.id, type: o.type, props, children: [], auto: (THEMED[o.type] || []).filter((p) => !o.userSet.has(p)) };
  let childDerived = derived;
  switch (o.type) {
    case 'figure':
      props.IsUIFigure = !!o.internal.ui;
      props.SgTitle = o.internal.sgtitle != null && st.objs.has(o.internal.sgtitle) ? serialize(ctx, st.objs.get(o.internal.sgtitle)) : null;
      props.Name = o.props.Name;
      break;
    case 'axes': case 'polaraxes': case 'uiaxes': {
      const info = axesInfo(ctx, o);
      for (const k of ['XLim', 'YLim', 'ZLim', 'CLim', 'XTick', 'YTick', 'ZTick', 'XTickLabel', 'YTickLabel', 'ZTickLabel', 'XTickExponent', 'YTickExponent', 'ZTickExponent',
        'DataAspectRatio', 'PlotBoxAspectRatio', 'Is3D', 'ThetaLim', 'RLim', 'RTick', 'ThetaTick', 'RTickLabel', 'ThetaTickLabel']) if (info[k] !== undefined) props[k] = Array.isArray(info[k]) ? info[k].slice() : info[k];
      props.Colormap = matOut(resolvedColormap(st, o));
      props.ColorOrder = matOut(o.props.ColorOrder);
      childDerived = info.derived;
      for (const c of o.children) {
        const co = st.objs.get(c);
        if (!co) continue;
        if (co.internal.constLabel) {
          const v = co.props.Position[co.internal.constLabel.axis === 'x' ? 0 : 1];
          childDerived.set(co.id, { Position: co.internal.constLabel.axis === 'x' ? [v, info.YLim[1], 0] : [info.XLim[1], v, 0], HorizontalAlignment: co.internal.constLabel.axis === 'x' ? 'right' : 'right', VerticalAlignment: co.internal.constLabel.axis === 'x' ? 'top' : 'bottom', Rotation: co.internal.constLabel.axis === 'x' ? 90 : 0 });
        }
      }
      if (props.Legend && o.props.Legend != null) props.Legend.props.Entries = legendEntries(ctx, o);
      break;
    }
    case 'contour': {
      const g = contourGeometry(o);
      props.Lines = g.lines.map((l) => ({ level: l.level, points: Array.from(l.points) }));
      props.Bands = g.bands.map((b) => ({ lo: b.lo, hi: b.hi, polys: b.polys.map((q) => Array.from(q)) }));
      props.LevelList = g.levels.slice();
      props.Is3D = !!o.internal.is3d;
      break;
    }
    case 'bar': {
      const d = childDerived && childDerived.get(o.id);
      props.Rects = d ? d.Rects.map((r) => r.slice()) : [];
      break;
    }
    case 'histogram': props.Rects = histRects(o); props.Values = (o.internal.values || []).slice(); break;
    case 'histogram2': props.Values = matOut(o.internal.values2 || null); break;
    case 'area': {
      const d = childDerived && childDerived.get(o.id);
      props.X = d ? d.X.slice() : []; props.Lower = d ? d.Lower.slice() : []; props.Upper = d ? d.Upper.slice() : [];
      break;
    }
    case 'quiver': {
      const d = (childDerived && childDerived.get(o.id));
      props.Segments = d ? d.Segments.slice() : []; props.Heads = d ? d.Heads.slice() : [];
      break;
    }
    case 'stair': props.Path = stairPath(o); break;
    case 'text': { const d = childDerived && childDerived.get(o.id); if (d) Object.assign(props, d); break; }
    case 'annotation': props.Shape = o.internal.shape; break;
    case 'heatmap': props.Colormap = matOut(o.props.Colormap || resolvedColormap(st, o)); props.ColorLimits = heatmapLimits(o); break;
    case 'uicontrol': case 'uieditfield': case 'uidropdown': case 'uicheckbox': case 'uislider': case 'uibutton':
      props.Value = uiValueJs(o);
      if (o.type === 'uieditfield') props.EditStyle = o.internal.numeric ? 'numeric' : 'text';
      break;
    case 'colorbar': {
      const ax = st.objs.get(o.internal.axes);
      props.Axes = ax ? ax.id : null;
      if (ax) {
        const info = axesInfo(ctx, ax);
        props.Limits = o.props.LimitsMode === 'manual' ? o.props.Limits.slice() : info.CLim.slice();
        props.Colormap = matOut(resolvedColormap(st, ax));
      }
      break;
    }
    case 'legend': props.Axes = o.internal.axes ?? null; break;
    default: break;
  }
  for (const c of o.children) {
    const co = st.objs.get(c);
    if (co) node.children.push(serialize(ctx, co, childDerived));
  }
  return node;
}

function uiValueJs(o) {
  const v = o.props.Value;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  if (v == null) return null;
  if (v.cls === 'char') return String.fromCharCode(...v.re);
  if (v.cls === 'string') return v.data[0] ?? '';
  if (v.re) return v.re.length === 1 ? v.re[0] : Array.from(v.re);
  return null;
}

function heatmapLimits(o) {
  if (o.props.ColorLimitsMode === 'manual') return o.props.ColorLimits.slice();
  let lo = Infinity, hi = -Infinity;
  if (o.props.ColorData) for (const v of o.props.ColorData.data) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return lo <= hi ? (lo === hi ? [lo - 1, hi + 1] : [lo, hi]) : [0, 1];
}

/** The colormap that applies to an axes (its own or its figure's) as a Mat. */
export function resolvedColormap(st, o) {
  if (o.props.Colormap) return o.props.Colormap;
  let f = o;
  while (f && f.type !== 'figure') f = st.objs.get(f.parent);
  if (f && f.props.Colormap) return f.props.Colormap;
  const rows = colormapByName('default', 256);
  const data = new Float64Array(rows.length * 3);
  rows.forEach((r, i) => { data[i] = r[0]; data[i + rows.length] = r[1]; data[i + 2 * rows.length] = r[2]; });
  return { dims: [rows.length, 3], data };
}

const LEGENDABLE = new Set(['line', 'animatedline', 'scatter', 'surface', 'patch', 'bar', 'histogram', 'area', 'stair', 'stem', 'errorbar', 'quiver', 'contour', 'histogram2']);

/** Legend entries [{target, label}] from the legend's PlotChildren / String. */
export function legendEntries(ctx, ax) {
  const st = G(ctx);
  const lg = st.objs.get(ax.props.Legend);
  if (!lg) return [];
  const targets = legendTargets(st, ax, lg);
  return targets.map((o) => ({ target: o.id, label: o.props.DisplayName || '' }));
}
export function legendTargets(st, ax, lg) {
  let list;
  if (lg.internal.targets) list = lg.internal.targets.map((id) => st.objs.get(id)).filter(Boolean);
  else list = plotChildren(st, ax);
  return list.filter((o) => o.props.Visible !== false || lg.internal.targets);
}
/** Legendable children of an axes in creation order (groups flattened). */
export function plotChildren(st, ax) {
  const out = [];
  const walk = (ids) => {
    for (const id of ids.slice().reverse()) {
      const o = st.objs.get(id);
      if (!o) continue;
      if (o.type === 'hggroup') { if (o.internal.legendAs) out.push(o); else walk(o.children); continue; }
      if (LEGENDABLE.has(o.type) && !o.internal.noLegend && o.props.HandleVisibility !== 'off') out.push(o);
    }
  };
  walk(ax.children);
  return out;
}

// ---------------------------------------------------------------- flushing

export function figureList(st) {
  const root = st.objs.get(0);
  return root.children.slice().reverse().map((id) => st.objs.get(id)).filter(Boolean);
}

/** Posts pending changes. full=true sends a complete 'graphics.scene'. Returns the message or null. */
export function flush(ctx, full = false) {
  const st = G(ctx);
  const root = st.objs.get(0);
  const current = root.props.CurrentFigure ?? null;
  const msgs = [];
  for (const id of st.closed) msgs.push({ type: 'graphics.close', id });
  st.closed = [];
  if (full || !st.sentOnce) {
    msgs.push({ type: 'graphics.scene', figures: figureList(st).map((f) => serialize(ctx, f)), current });
    st.sentOnce = true;
  } else if (st.dirty.size || st.lastCurrent !== current) {
    const figs = [...st.dirty].map((id) => st.objs.get(id)).filter(Boolean).map((f) => serialize(ctx, f));
    msgs.push({ type: 'graphics.update', figures: figs, current });
  }
  st.dirty.clear();
  st.lastCurrent = current;
  st.flushes++;
  for (const m of msgs) {
    if (m.type === 'graphics.scene' && !m.figures.length && !st.everHadFigure) continue; // nothing to show yet
    if (m.figures && m.figures.length) st.everHadFigure = true;
    ctx.host.post(m);
  }
  return msgs;
}

export { isAxesType };

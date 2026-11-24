// Assembly visualization: the components of the active assembly ranked by a property — mass, volume, surface
// area, density or quantity (instances of the same part) — in a list with each value and a colour from a
// blue (lowest) … red (highest) scale, and the model coloured with that scale (on until turned off). A
// PropertyManager page chained onto the hooks of `more` in app.js like the other add-ins.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const MODES = new Set(['asmViz']);
export const VIZ_PROPS = ['mass', 'volume', 'area', 'density', 'quantity'];
const UNITS = { mass: 'g', volume: 'mm³', area: 'mm²', density: 'kg/m³', quantity: '' };

/** A colour on the scale (0: blue … 1: red), as #rrggbb. */
export function scaleColour(s) {
  const h = (1 - Math.max(0, Math.min(1, s))) * 240;
  const f = (n) => { const k = (n + h / 30) % 12; const c = 0.5 - 0.42 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Rows [{ id, name, value }] sorted (desc unless asc), each with its colour on the scale of the values. */
export function rankRows(rows, asc = false) {
  const vals = rows.map((r) => r.value).filter(Number.isFinite);
  const lo = Math.min(...vals); const hi = Math.max(...vals);
  const sorted = [...rows].sort((a, b) => (asc ? a.value - b.value : b.value - a.value));
  return sorted.map((r) => ({ ...r, colour: scaleColour(hi > lo ? (r.value - lo) / (hi - lo) : 1) }));
}

export function createAsmVizTools(ctx) {
  const { state, t } = ctx;
  const asm = () => ctx.activeAssembly();
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));

  /** Each component's value of the property. */
  function values(prop) {
    const a = asm();
    if (!a) return [];
    const R = ctx.rep();
    return a.components.filter((c) => !c.suppressed && !c.envelope).map((c) => {
      const shapes = ctx.componentShapes(c);
      let volume = 0; let area = 0; let mass = 0;
      for (const { shape, part } of shapes) {
        try { const v = R.measureShapeVolumeProperties(shape).volume; volume += v; mass += ctx.massOf(v, part.material); } catch { /* no volume */ }
        try { area += R.measureArea(shape); } catch { /* no area */ }
      }
      const same = a.components.filter((x) => (c.sub ? x.sub === c.sub : x.part === c.part)).length;
      const value = { mass: mass * 1000, volume, area, density: volume > 0 ? (mass / volume) * 1e9 : 0, quantity: same }[prop];
      return { id: c.id, name: c.name, value };
    });
  }

  function apply() {
    const v = state.asmViz;
    state.asmVizColours = v?.on ? new Map(rankRows(values(v.prop)).map((r) => [r.id, r.colour])) : null;
    state.asmVizFor = asm()?.id ?? null;
    ctx.syncView();
  }

  function start() {
    if (!asm()) { ctx.notify('info', t('notice.assemblyOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.asmViz = { prop: state.asmViz?.prop ?? 'mass', on: true, asc: Boolean(state.asmViz?.asc) };
    state.editing = { mode: 'asmViz' };
    state.leftTab = 'pm';
    apply();
    ctx.renderAll();
  }

  function pm() {
    const { pmHead, pmGroup, pmSeg } = ctx.pm;
    const v = state.asmViz ?? { prop: 'mass', on: true };
    const rows = rankRows(values(v.prop), v.asc);
    const unit = UNITS[v.prop];
    const list = rows.map((r) => `<div class="cfg-row viz-row" data-viz-row="${escapeHtml(r.id)}"><span class="viz-swatch" style="background:${r.colour}" aria-hidden="true"></span><span>${escapeHtml(r.name)}</span><span class="grow"></span><b data-viz-value>${escapeHtml(ctx.fmt(r.value, v.prop === 'quantity' ? 0 : 2))}${unit ? ` ${escapeHtml(unit)}` : ''}</b></div>`).join('');
    return [
      pmHead('assemblyVisualization', t('cmd.assemblyVisualization'), t('viz.help')),
      pmGroup('statistics', t('viz.property'), `${pmSeg('vizProp', VIZ_PROPS.map((p) => [p, t(`viz.${p}`), { mass: 'massProps', volume: 'part', area: 'featShell', density: 'material', quantity: 'featLinPattern' }[p]]), v.prop)}${pmSeg('vizOrder', [['desc', t('viz.desc'), 'arrowDown'], ['asc', t('viz.asc'), 'valignTop']], v.asc ? 'asc' : 'desc')}`),
      pmGroup('assembly', t('viz.components', { count: rows.length }), `<div class="viz-scale"><span>${escapeHtml(t('viz.low'))}</span><span class="viz-bar"></span><span>${escapeHtml(t('viz.high'))}</span></div>${list}`),
      pmGroup('settings', t('pm.options'), `<label class="pm-check"><input type="checkbox" data-pm-toggle="vizOn" ${v.on ? 'checked' : ''}/>${icon('appearance')}<span>${escapeHtml(t('viz.colourModel'))}</span></label>`),
    ].join('');
  }

  function set(key, value) {
    state.asmViz ??= { prop: 'mass', on: true };
    if (key === 'vizProp' && VIZ_PROPS.includes(value)) state.asmViz.prop = value;
    if (key === 'vizOrder') state.asmViz.asc = value === 'asc';
    apply();
    return ctx.renderLeft();
  }
  function toggle(key, checked) { if (key === 'vizOn') { state.asmViz.on = checked; apply(); } return ctx.renderLeft(); }
  const accept = () => { state.editing = null; return ctx.renderAll(); };
  const subject = () => t('cmd.assemblyVisualization');
  const handles = () => false;
  const commands = {
    assemblyVisualization: { icon: 'assemblyVisualization', label: 'cmd.assemblyVisualization', enabled: () => (asm()?.components.length ?? 0) > 0, checked: () => editing()?.mode === 'asmViz' || Boolean(state.asmViz?.on && state.asmVizColours), run: () => (editing()?.mode === 'asmViz' ? ctx.cancelEditing({ quiet: true }) : start()) },
    assemblyVisualizationOff: { icon: 'close', label: 'cmd.assemblyVisualizationOff', enabled: () => Boolean(state.asmVizColours), run: () => { if (state.asmViz) state.asmViz.on = false; apply(); ctx.renderAll(); } },
  };
  return { owns, pm, pick: () => undefined, field: () => ctx.renderLeft(), set, toggle, select: () => false, accept, subject, handles, command: () => undefined, commands, values };
}

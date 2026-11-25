// Section Properties (Evaluate): the active part cut by a plane — a standard plane, or a picked planar face or
// reference plane — moved along its normal by an offset; the section is shown on the model and its area
// properties listed (cad/section-props.js): area, centroid, Iu, Iv, Iuv about the centroid, principal moments and
// axis angle, polar moment, radii of gyration. A PropertyManager page chained onto `more` in app.js.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { sectionProperties } from './cad/section-props.js';

const MODES = new Set(['secProps']);

export function createSectionPropsTools(ctx) {
  const { state, t } = ctx;
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));

  function frameOf(e) {
    const base = e.plane ? ctx.planeFrame(e.plane) : null;
    if (!base) return null;
    const d = Number(e.offset) || 0;
    return { ...base, origin: base.origin.map((v, i) => v + base.normal[i] * d) };
  }
  function result(e) {
    const part = ctx.activePart();
    const body = part ? ctx.buildPart(part).body : null;
    const fr = frameOf(e);
    if (!body || !fr) return null;
    try { return sectionProperties(body, fr); } catch { return null; }
  }
  function show(e) {
    const r = result(e);
    e.last = r;
    if (r?.shape) {
      const m = r.shape.mesh({ tolerance: 0.01, angularTolerance: 0.1 });
      e.previewSpec = { mesh: { vertices: m.vertices, normals: m.normals, triangles: m.triangles } };
    } else e.previewSpec = null;
    ctx.setPreview(e.previewSpec);
    ctx.syncView?.();
  }

  function start() {
    if (!ctx.activePart()) { ctx.notify('info', t('notice.partOnly')); return; }
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'secProps', plane: { kind: 'std', name: 'front' }, offset: 0, pick: 'plane' };
    state.leftTab = 'pm';
    show(state.editing);
    ctx.renderAll();
  }

  function pm(e) {
    const { pmHead, pmGroup, pmSeg, pmNum } = ctx.pm;
    const r = e.last;
    const L = (v) => ctx.fmtLen(v); const A = (v, p) => `${ctx.fmt(v, 3)} ${ctx.units()}${p}`;
    const rows = r ? [
      ['secp.area', A(r.area, '²')], ['secp.centroid', `(${L(r.cu)}, ${L(r.cv)})`], ['secp.centroidWorld', `(${r.centroid.map((v) => ctx.fmt(v, 3)).join(', ')})`],
      ['secp.Iu', A(r.Iu, '⁴')], ['secp.Iv', A(r.Iv, '⁴')], ['secp.Iuv', A(r.Iuv, '⁴')],
      ['secp.I1', A(r.I1, '⁴')], ['secp.I2', A(r.I2, '⁴')], ['secp.angle', `${ctx.fmt(r.angle, 3)}°`],
      ['secp.J', A(r.J, '⁴')], ['secp.ru', L(r.ru)], ['secp.rv', L(r.rv)], ['secp.faces', String(r.faces)],
    ].map(([k, v]) => `<div class="cfg-row"><span>${escapeHtml(t(k))}</span><span class="grow"></span><b data-secp="${k.slice(5)}">${escapeHtml(v)}</b></div>`).join('') : `<p class="pm-note">${escapeHtml(t('secp.miss'))}</p>`;
    const std = e.plane?.kind === 'std' ? e.plane.name : '';
    return [
      pmHead('sectionProps', t('cmd.sectionProperties'), t('secp.help')),
      pmGroup('refPlane', t('secp.plane'), `${pmSeg('secPlane', [['front', t('plane.front'), 'planeFront'], ['top', t('plane.top'), 'planeTop'], ['right', t('plane.right'), 'planeRight']], std)}<p class="pm-note">${escapeHtml(t(e.plane?.kind === 'std' ? 'secp.orPick' : 'secp.picked'))}</p>${pmNum('secOffset', e.offset ?? 0, t('secp.offset'), 'dimDistance', ctx.units())}`),
      pmGroup('massProps', t('secp.results'), rows),
    ].join('');
  }

  function pick(hit) {
    const e = editing();
    const ref = ctx.planeRefOfHit(hit);
    if (!ref) { ctx.notify('info', t('notice.pickPlanarFace')); return; }
    e.plane = ref; show(e); ctx.renderLeft();
  }
  function field(key, raw, v) {
    const e = editing();
    if (key === 'secOffset' && v != null) { e.offset = v; show(e); }
    return ctx.renderLeft();
  }
  function set(key, value) {
    const e = editing();
    if (key === 'secPlane') { e.plane = { kind: 'std', name: value }; show(e); }
    return ctx.renderLeft();
  }
  const accept = () => { ctx.setPreview(null); state.editing = null; ctx.syncView?.(); return ctx.renderAll(); };
  const commands = {
    sectionProperties: { icon: 'sectionProps', label: 'cmd.sectionProperties', enabled: () => Boolean(ctx.activePart()), checked: () => editing()?.mode === 'secProps', run: () => (editing()?.mode === 'secProps' ? ctx.cancelEditing({ quiet: true }) : start()) },
  };
  return { owns, pm, pick, field, set, toggle: () => ctx.renderLeft(), select: () => false, accept, subject: () => t('cmd.sectionProperties'), handles: () => false, command: () => undefined, commands, result };
}

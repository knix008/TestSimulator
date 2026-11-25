// Particle study of the flow study (its last group, app-sim2.js hooks it in): particle diameter, density, count,
// mass flow and gravity; Track Particles runs cad/cfd/particles.js on the computed flow and shows the trajectories,
// the wall impacts, the fates (escaped / trapped / lost) and the erosion (the worst spot marked).
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { particleStudy } from './cad/cfd/particles.js';

export function createParticleTools(ctx) {
  const { state, t } = ctx;
  const fmt = (v, d = 3) => ctx.fmt(v, d);
  const init = (e) => { e.pt ??= { diameter: 200, density: 2650, count: 25, massFlow: 0.01, gravity: true }; return e.pt; };

  function group(e, { pmGroup, pmNum, pmButton, check }) {
    if (!state.flow?.result?.vel) return '';
    const o = init(e);
    const r = state.flow.particles?.summary;
    const sci = (v) => (v > 0 ? v.toExponential(2) : '0');
    const res = r ? `<ul class="mfg-results pt-results"><li>${icon('flowStudy', 'icon tiny')}<span>${escapeHtml(t('pt.fates', r.fates))}</span></li><li>${icon('measure', 'icon tiny')}<span>${escapeHtml(t('pt.impacts', { n: r.impacts }))}</span></li><li class="${r.maxErosion > 0 ? 'warn' : ''}">${icon('warning', 'icon tiny')}<span>${escapeHtml(t('pt.erosion', { max: sci(r.maxErosion), total: sci(r.totalErosion) }))}</span></li>${r.erosionAt ? `<li>${icon('position', 'icon tiny')}<span>${escapeHtml(t('pt.worst', { p: r.erosionAt.map((v) => fmt(v, 1)).join(', ') }))}</span></li>` : ''}<li>${icon('timer', 'icon tiny')}<span>${escapeHtml(t('pt.stokes', { st: fmt(r.stokes, 4), tau: sci(r.relaxation) }))}</span></li></ul>` : '';
    return pmGroup('flowParticles', t('pt.group'), `${pmNum('pt.diameter', o.diameter, `${t('pt.diameter')} (µm)`, 'dimDiameter')}${pmNum('pt.density', o.density, `${t('pt.density')} (kg/m³)`, 'material')}${pmNum('pt.count', o.count, t('pt.count'), 'statistics')}${pmNum('pt.massFlow', o.massFlow, `${t('pt.massFlow')} (kg/s)`, 'flowStudy')}${check('pt.gravity', o.gravity, 'femGravity', t('pt.gravity'))}<p class="pm-note">${escapeHtml(t('pt.note'))}</p><div class="pm-row">${pmButton('pt.run', 'flowParticles', t('pt.run'))}${state.flow.particles ? pmButton('pt.clear', 'trash', t('pt.clear')) : ''}</div>${res}`);
  }
  function field(e, key, v) {
    const o = init(e);
    const k = { 'pt.diameter': 'diameter', 'pt.density': 'density', 'pt.count': 'count', 'pt.massFlow': 'massFlow' }[key];
    if (!k) return false;
    if (v != null && v > 0) o[k] = k === 'count' ? Math.min(400, Math.round(v)) : v;
    ctx.renderLeft();
    return true;
  }
  function toggle(e, key, checked) { if (key !== 'pt.gravity') return false; init(e).gravity = checked; ctx.renderLeft(); return true; }
  const handles = (name) => name === 'pt.run' || name === 'pt.clear';
  function command(e, name) {
    if (name === 'pt.clear') { if (state.flow) state.flow.particles = null; ctx.syncView(); ctx.renderLeft(); return undefined; }
    const f = state.flow; if (!f?.result) return undefined;
    const o = init(e);
    const r = particleStudy(f.result, { diameter: o.diameter, density: o.density, count: o.count, massFlow: o.massFlow, gravity: o.gravity ? [0, 0, -9.81] : [0, 0, 0] });
    if (!r.ok) { ctx.notify('error', t('pt.failed')); return undefined; }
    const segs = [];
    for (const path of r.paths) for (let i = 1; i < path.length; i++) segs.push(...path[i - 1].slice(0, 3), ...path[i].slice(0, 3));
    f.particles = { segments: segs, impacts: r.impacts.flatMap((x) => x.p), worst: r.erosionAt, summary: { fates: r.fates, impacts: r.impacts.length, maxErosion: r.maxErosion, totalErosion: r.totalErosion, erosionAt: r.erosionAt, stokes: r.stokes, relaxation: r.relaxation } };
    ctx.notify('success', t('pt.done', { ...r.fates, n: r.impacts.length }));
    ctx.syncView(); ctx.renderLeft();
    return f.particles.summary;
  }
  /** Lines and points for the view. */
  function decorate(lines) {
    const p = state.flow?.particles;
    if (!p) return;
    if (p.segments.length) lines.push({ segments: p.segments, color: '#6d4c41', width: 1.4, depthTest: true });
    if (p.impacts.length) lines.push({ points: p.impacts, color: '#ff6f00', size: 4 });
    if (p.worst) lines.push({ points: p.worst, color: '#d50000', size: 13 });
  }
  return { init, group, field, toggle, handles, command, decorate };
}

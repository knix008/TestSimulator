// More flow physics on the flow study page (app-sim2.js hooks it in): compressible gas flow (cad/cfd/euler.js — Mach,
// pressure, temperature), non-Newtonian liquids (power law, Carreau) and a porous body (Darcy–Forchheimer) for the
// lattice Boltzmann solver (cad/cfd/lbm.js), with their extra results.
import { escapeHtml } from './ui/dom.js';

export function createFlowMoreTools(ctx) {
  const { t } = ctx;
  const fmt = (v, d = 3) => ctx.fmt(v, d);
  const init = (e) => {
    e.regime ??= 'incompressible'; e.mach ??= 2; e.pInf ??= 101325; e.tInf ??= 288.15;
    e.rheo ??= 'newtonian'; e.rheoK ??= 0.5; e.rheoN ??= 0.6; e.rheoMu0 ??= 1; e.rheoMuInf ??= 0.001; e.rheoLambda ??= 1;
    e.turbulence ??= 'les'; e.porousOn ??= false; e.permeability ??= 1e-8; e.forchheimer ??= 0.55;
    return e;
  };
  const isCompressible = (e) => init(e).regime === 'compressible';

  function group(e, { pmGroup, pmSeg, pmNum, check }) {
    init(e);
    const comp = e.regime === 'compressible';
    const body = [
      pmSeg('regime', [['incompressible', t('fm.incompressible'), 'sim2Flow'], ['compressible', t('fm.compressible'), 'flowShock']], e.regime),
      comp ? `${pmNum('mach', e.mach, t('fm.mach'), 'flowShock')}${pmNum('pInf', e.pInf, `${t('fm.pressure')} (Pa)`, 'femPressure')}${pmNum('tInf', e.tInf, `${t('fm.temperature')} (K)`, 'sun')}<p class="pm-note">${escapeHtml(t('fm.compressibleNote'))}</p>` : '',
      comp ? '' : `<p class="pm-label">${escapeHtml(t('fm.turbulence'))}</p>${pmSeg('turbulence', [['les', t('fm.les')], ['mixing', t('fm.mixing')], ['none', t('fm.laminar')]], e.turbulence)}<p class="pm-note">${escapeHtml(t(`fm.turb.${e.turbulence}`))}</p>`,
      comp ? '' : `<p class="pm-label">${escapeHtml(t('fm.rheology'))}</p>${pmSeg('rheo', [['newtonian', t('fm.newtonian')], ['powerLaw', t('fm.powerLaw')], ['carreau', t('fm.carreau')]], e.rheo)}`,
      !comp && e.rheo === 'powerLaw' ? `${pmNum('rheoK', e.rheoK, `${t('fm.consistency')} K (Pa·sⁿ)`, 'material')}${pmNum('rheoN', e.rheoN, `${t('fm.index')} n`, 'material')}` : '',
      !comp && e.rheo === 'carreau' ? `${pmNum('rheoMu0', e.rheoMu0, `μ₀ (Pa·s)`, 'material')}${pmNum('rheoMuInf', e.rheoMuInf, `μ∞ (Pa·s)`, 'material')}${pmNum('rheoLambda', e.rheoLambda, `λ (s)`, 'clock')}${pmNum('rheoN', e.rheoN, `${t('fm.index')} n`, 'material')}` : '',
      !comp && e.rheo !== 'newtonian' ? `<p class="pm-note">${escapeHtml(t('fm.rheoNote'))}</p>` : '',
      !comp && e.flowMode === 'external' ? `${check('porousOn', e.porousOn, 'flowPorous', t('fm.porous'))}${e.porousOn ? `${pmNum('permeability', e.permeability, `${t('fm.permeability')} K (m²)`, 'flowPorous')}${pmNum('forchheimer', e.forchheimer, `${t('fm.forchheimer')} C_F`, 'flowPorous')}<p class="pm-note">${escapeHtml(t('fm.porousNote'))}</p>` : ''}` : '',
    ].join('');
    return pmGroup('flowShock', t('fm.group'), body);
  }
  const NUMS = { mach: [0.05, 8], pInf: [1, 1e8], tInf: [20, 3000], rheoK: [1e-9, 1e6], rheoN: [0.05, 2], rheoMu0: [1e-9, 1e6], rheoMuInf: [0, 1e6], rheoLambda: [0, 1e6], permeability: [1e-20, 1], forchheimer: [0, 100] };
  function field(e, key, v) {
    if (!NUMS[key]) return false;
    init(e);
    if (v != null && v >= NUMS[key][0] && v <= NUMS[key][1]) { e[key] = v; e.result = null; }
    else ctx.notify('error', t('notice.invalidValue', { text: String(v) }));
    ctx.renderLeft();
    return true;
  }
  function set(e, key, value) { if (key !== 'regime' && key !== 'rheo' && key !== 'turbulence') return false; init(e); e[key] = value; e.result = null; if (key === 'regime' && value === 'compressible' && e.quantity === 'vorticity') e.quantity = 'velocity'; ctx.renderLeft(); return true; }
  function toggle(e, key, checked) { if (key !== 'porousOn') return false; init(e); e.porousOn = checked; e.result = null; ctx.renderLeft(); return true; }
  /** Options for the lattice Boltzmann study. */
  function lbmOptions(e) {
    init(e);
    const rheology = e.rheo === 'powerLaw' ? { model: 'powerLaw', K: e.rheoK, n: e.rheoN } : e.rheo === 'carreau' ? { model: 'carreau', mu0: e.rheoMu0, muInf: e.rheoMuInf, lambda: e.rheoLambda, n: e.rheoN } : null;
    return { rheology, turbulence: e.turbulence, porous: e.porousOn && e.flowMode === 'external' ? { permeability: e.permeability, forchheimer: e.forchheimer } : null };
  }
  const compressibleOptions = (e) => ({ mach: e.mach, pressure: e.pInf, temperature: e.tInf });
  /** Extra result rows. */
  function rows(r) {
    const out = [];
    if (r.compressible) out.push([t('fm.machMax'), fmt(r.maxMach, 3)], [t('fm.stagnation'), `${fmt(r.stagnationPressure, 1)} Pa`], [t('fm.pitot'), `${fmt(r.pitot, 1)} Pa`], [t('fm.shock'), t(r.shock ? 'fm.yes' : 'fm.no'), r.shock ? 'warn' : '']);
    if (r.porousDrop != null) out.push([t('fm.porousDrop'), `${fmt(r.porousDrop, 4)} Pa`]);
    if (r.rheology) out.push([t('fm.rheology'), r.rheology.model === 'carreau' ? `Carreau n ${fmt(r.rheology.n, 2)}` : `K ${fmt(r.rheology.K, 4)} · n ${fmt(r.rheology.n, 2)}`]);
    return out;
  }
  return { init, group, field, set, toggle, isCompressible, lbmOptions, compressibleOptions, rows };
}

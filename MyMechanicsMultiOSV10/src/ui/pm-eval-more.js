// PropertyManager pages of the added Evaluate tools (deviation, symmetry, geometry check, undercut, compare,
// costing, sustainability) and of the added mold features (shut-off surface, parting surface, and the undercut
// warning on the tooling split). HTML only — app.js / app-drw.js bind the data-pm* attributes.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg } from './propertymanager.js';
import { COST_DEFAULTS, CO2_DEFAULTS } from '../cad/evaluate-more.js';

/** [kind, icon] of the Evaluate tools, in toolbar order. */
export const EVAL_KINDS = [['deviation', 'deviation'], ['symmetry', 'symmetryCheck'], ['geometry', 'geometryCheck'], ['undercut', 'undercut'], ['compare', 'compareDocs'], ['costing', 'costing'], ['sustain', 'sustainability']];
export const PULL_DIRS = [['x', '+X'], ['-x', '−X'], ['y', '+Y'], ['-y', '−Y'], ['z', '+Z'], ['-z', '−Z']];

const n = (v, d = 2) => (Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
const rows = (list) => `<dl class="pm-results">${list.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`;
const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;
const legend = (t, items) => `<div class="eval-legend">${items.map(([c, label]) => `<span><i style="background:${c}"></i>${escapeHtml(t(label))}</span>`).join('')}</div>`;

/** The page of one Evaluate tool. `api`: pm helpers (pmHead, pmGroup, pmList, pmSeg, pmNum, textInput), t, sel, textRow, otherParts. */
export function evalPm(e, api) {
  const { t, pmHead, pmGroup, pmSeg, pmList } = api;
  const kind = e.kind;
  const glyph = EVAL_KINDS.find(([k]) => k === kind)?.[1] ?? 'evaluate';
  const r = e.result;
  const parts = [pmHead(glyph, t(`cmd.eval.${kind}`), t(`pm.help.eval.${kind}`))];
  if (kind === 'deviation') {
    parts.push(pmGroup('lineTool', t('drwEval.edges'), `${pmList('edges', e.edges.map((x, i) => `${t('pm.edge')} ${i + 1}`), t('drwEval.edgesOrAll'), 'lineTool', true)}`));
    if (r) {
      parts.push(pmGroup('deviation', t('pm.results'), rows([[t('drwEval.edgeCount'), String(r.count)], [t('drwEval.maxDeviation'), `${n(r.max)}°`], [t('drwEval.avgDeviation'), `${n(r.avg)}°`], [t('drwEval.tangentEdges'), String(r.tangent)]])
        + `<ul class="pm-list">${r.edges.slice(0, 8).map((x) => `<li>${icon('lineTool', 'icon tiny')}<span>${escapeHtml(`${x.type} · ${n(x.length)} mm · ${t('drwEval.max')} ${n(x.max)}° · ${t('drwEval.avg')} ${n(x.avg)}°`)}</span></li>`).join('')}</ul>`
        + legend(t, [['#59b86b', 'drwEval.legendTangent'], ['#f5a826', 'drwEval.legendNearly']])));
    }
  } else if (kind === 'symmetry') {
    parts.push(pmGroup('refPlane', t('drwEval.plane'), `${pmSeg('plane', [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')]], e.plane)}${api.textRow('offset', e.offset, t('drwEval.offset'), 'smartDim')}`));
    if (r) parts.push(pmGroup('symmetryCheck', t('pm.results'), `${note(t(r.symmetric ? 'drwEval.symmetric' : 'drwEval.notSymmetric', { count: r.asymmetric }), !r.symmetric)}${rows([[t('drwEval.faces'), `${r.total - r.asymmetric} / ${r.total}`], [t('drwEval.volume'), `${n(r.volume)} mm³`], [t('drwEval.commonVolume'), `${n(r.common)} mm³ (${n(r.ratio * 100, 1)}%)`]])}${legend(t, [['#59b86b', 'drwEval.legendSymmetric'], ['#e0383a', 'drwEval.legendAsymmetric']])}`));
  } else if (kind === 'geometry') {
    parts.push(pmGroup('geometryCheck', t('drwEval.limits'), `${api.textRow('minEdge', e.minEdge, t('drwEval.minEdge'), 'lineTool')}${api.textRow('sliverRatio', e.sliverRatio, t('drwEval.sliverRatio'), 'surface')}`));
    if (r) {
      parts.push(pmGroup('geometryCheck', t('pm.results'), `${note(t(r.problems ? 'drwEval.problems' : 'drwEval.noProblems', { count: r.problems }), Boolean(r.problems))}${rows([
        [t('drwEval.kernelValid'), t(r.valid ? 'drwEval.yes' : 'drwEval.no')], [t('drwEval.solids'), String(r.solids)], [t('drwEval.invalidFaces'), String(r.invalidFaces.length)], [t('drwEval.invalidEdges'), String(r.invalidEdges.length)],
        [t('drwEval.shortEdges'), String(r.shortEdges.length)], [t('drwEval.slivers'), String(r.slivers.length)], [t('drwEval.nonManifold'), String(r.nonManifold.length)], [t('drwEval.openEdges'), String(r.openEdges.length)]])}${legend(t, [['#59b86b', 'drwEval.legendOk'], ['#f5a826', 'drwEval.legendWarn'], ['#e0383a', 'drwEval.legendBad']])}`));
    }
  } else if (kind === 'undercut') {
    parts.push(pmGroup('undercut', t('drwEval.pull'), pmSeg('dir', PULL_DIRS, e.dir)));
    if (r) parts.push(pmGroup('undercut', t('pm.results'), `${note(t(r.undercut ? 'drwEval.undercutFound' : 'drwEval.noUndercut', { count: r.undercut }), Boolean(r.undercut))}${rows(['cavity', 'core', 'straight', 'undercut'].map((k) => [t(`drwEval.class.${k}`), String(r.counts[k])]))}${legend(t, [['#408ceb', 'drwEval.class.cavity'], ['#59bf66', 'drwEval.class.core'], ['#f2cc33', 'drwEval.class.straight'], ['#e63333', 'drwEval.class.undercut']])}`));
  } else if (kind === 'compare') {
    const others = api.otherParts;
    parts.push(pmGroup('compareDocs', t('drwEval.compareWith'), others.length ? api.sel('other', others.map((p) => [p.id, p.name]), e.other, t('drwEval.otherPart')) : note(t('drwEval.needOther'))));
    if (r) {
      const f = r.features;
      parts.push(pmGroup('compareDocs', t('pm.results'), `${note(t(r.identical ? 'drwEval.identical' : 'drwEval.different', { count: r.changedFaces }), !r.identical)}${rows([
        [t('drwEval.volumeOf', { name: t('drwEval.thisPart') }), `${n(r.volumeA)} mm³`], [t('drwEval.volumeOf', { name: r.otherName }), `${n(r.volumeB)} mm³`],
        [t('drwEval.areaOf', { name: t('drwEval.thisPart') }), `${n(r.areaA)} mm²`], [t('drwEval.areaOf', { name: r.otherName }), `${n(r.areaB)} mm²`],
        [t('drwEval.onlyThis'), `${n(r.onlyA)} mm³`], [t('drwEval.onlyOther'), `${n(r.onlyB)} mm³`], [t('drwEval.changedFaces'), `${r.changedFaces} / ${r.faces.length}`],
        [t('drwEval.featAdded'), f.added.join(', ') || '—'], [t('drwEval.featRemoved'), f.removed.join(', ') || '—'], [t('drwEval.featChanged'), f.changed.join(', ') || '—']])}${legend(t, [['#b3b8bf', 'drwEval.legendSame'], ['#e0383a', 'drwEval.legendChanged']])}`));
    }
  } else if (kind === 'costing' || kind === 'sustain') {
    const c = r?.cost; const s = r?.co2;
    if (kind === 'costing') {
      const cv = (k, d) => String(api.costing?.[k] ?? d);
      parts.push(pmGroup('costing', t('drwEval.prices'), `${api.textRow('cost:price', cv('price', c ? n(c.price, 3) : ''), `${t('drwEval.pricePerKg')} (${c?.currency ?? COST_DEFAULTS.currency})`, 'costing')}${api.textRow('cost:rate', cv('rate', COST_DEFAULTS.rate), t('drwEval.shopRate'), 'costing')}${api.textRow('cost:setup', cv('setup', COST_DEFAULTS.setup), t('drwEval.setupMin'), 'timer')}${api.textRow('cost:removal', cv('removal', c ? n(c.removalRate, 2) : ''), t('drwEval.removalRate'), 'featCut')}${api.textRow('cost:finishRate', cv('finishRate', COST_DEFAULTS.finishRate), t('drwEval.finishRate'), 'surfaceFinish')}${api.textRow('cost:allowance', cv('allowance', COST_DEFAULTS.allowance), t('drwEval.allowance'), 'smartDim')}`));
      if (c) parts.push(pmGroup('costing', t('pm.results'), rows([
        [t('drwEval.material'), r.material], [t('drwEval.partMass'), `${n(c.partMass, 3)} kg`], [t('drwEval.stockMass'), `${n(c.stockMass, 3)} kg`],
        [t('drwEval.materialCost'), `${c.currency}${n(c.materialCost)}`], [t('drwEval.machiningTime'), `${n(c.timeMin, 1)} min (${t('drwEval.rough')} ${n(c.roughMin, 1)} · ${t('drwEval.finish')} ${n(c.finishMin, 1)} · ${t('drwEval.setup')} ${n(c.setupMin, 0)})`],
        [t('drwEval.machiningCost'), `${c.currency}${n(c.machiningCost)}`], [t('drwEval.totalCost'), `${c.currency}${n(c.total)}`]])));
    } else {
      const sv = (k, d) => String(api.sustain?.[k] ?? d);
      parts.push(pmGroup('sustainability', t('drwEval.factors'), `${api.textRow('co2:factor', sv('factor', s ? n(s.factor, 3) : ''), t('drwEval.co2PerKg'), 'sustainability')}${api.textRow('co2:power', sv('power', CO2_DEFAULTS.power), t('drwEval.machinePower'), 'motor')}${api.textRow('co2:grid', sv('grid', CO2_DEFAULTS.grid), t('drwEval.gridFactor'), 'sun')}${api.textRow('co2:distance', sv('distance', CO2_DEFAULTS.distance), t('drwEval.distance'), 'globe')}${api.textRow('co2:perTonneKm', sv('perTonneKm', CO2_DEFAULTS.perTonneKm), t('drwEval.transportFactor'), 'globe')}`));
      if (s) parts.push(pmGroup('sustainability', t('pm.results'), rows([
        [t('drwEval.material'), r.material], [t('drwEval.partMass'), `${n(c.partMass, 3)} kg`], [t('drwEval.co2Material'), `${n(s.materialCO2, 3)} kg CO₂e`], [t('drwEval.energy'), `${n(s.energy, 2)} kWh`],
        [t('drwEval.co2Machining'), `${n(s.machiningCO2, 3)} kg CO₂e`], [t('drwEval.co2Transport'), `${n(s.transportCO2, 4)} kg CO₂e`], [t('drwEval.co2Total'), `${n(s.total, 3)} kg CO₂e`], [t('drwEval.co2PerPartKg'), `${n(s.perKgPart, 2)} kg CO₂e/kg`]])));
    }
    parts.push(note(t('drwEval.estimateNote')));
  }
  if (e.error) parts.push(`<p class="pm-error">${icon('error')}<span>${escapeHtml(t(e.error))}</span></p>`);
  return parts.join('');
}

const undercutWarning = (api) => {
  const k = api.previewResult?.undercuts;
  return k > 0 ? note(api.t('mold.undercutWarning', { count: k }), true) : '';
};

/** Pages of the mold features (merged after the others; toolingSplit gets the extra group). */
export const MOLD_MORE_PM = {
  shutOff(api, f) {
    const { t } = api;
    const r = api.previewResult?.shutOff;
    return group('shutOff', t('mold.shutOff'), `${seg('dir', [['', t('mold.fromPartingLine')], ...PULL_DIRS], f.dir ?? '')}${seg('at', [['parting', t('mold.atParting')], ['top', t('mold.atTop')]], f.at ?? 'parting')}${r ? note(t('mold.shutOffCount', { count: r.count })) : ''}${note(t('pm.help.shutOff'))}`);
  },
  partingSurface(api, f) {
    const { t } = api;
    const r = api.previewResult?.partingSurface;
    return group('partingSurface', t('mold.partingSurface'), `${seg('dir', [['', t('mold.fromPartingLine')], ...PULL_DIRS], f.dir ?? '')}${field(api, 'distance', f.distance ?? 30, { label: t('mold.distance'), min: 1 })}${r ? note(t(r.planar ? 'mold.planar' : 'mold.ruled', { count: r.edges })) : ''}${undercutWarning(api)}${note(t('pm.help.partingSurface'))}`);
  },
  toolingSplit(api, f) {
    const { t } = api;
    const r = api.previewResult?.tooling;
    return group('partingSurface', t('mold.bySurfaces'), `${check('useSurfaces', f.useSurfaces !== false, t('mold.useSurfaces'), 'partingSurface')}${r?.bySurface ? note(t('mold.splitBySurfaces', { count: r.shutOffs })) : ''}${undercutWarning(api)}`);
  },
};

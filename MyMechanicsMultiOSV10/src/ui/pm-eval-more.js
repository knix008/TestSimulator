// PropertyManager pages of the added Evaluate tools (deviation, symmetry, geometry check, undercut, compare,
// costing, sustainability) and of the added mold features (shut-off surface, parting surface, and the undercut
// warning on the tooling split). HTML only — app.js / app-drw.js bind the data-pm* attributes.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg } from './propertymanager.js';
import { COST_TABLE_DEFAULTS, CO2_TABLE_DEFAULTS, MATERIAL_GROUPS, costSettings, co2Settings } from '../cad/costing.js';

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
    if (r) parts.push(pmGroup('undercut', t('pm.results'), `${note(t(r.undercut ? 'drwEval.undercutFound' : 'drwEval.noUndercut', { count: r.undercut }), Boolean(r.undercut))}${rows(['cavity', 'core', 'straight', 'undercut'].map((k) => [t(`drwEval.class.${k}`), r.areas ? `${r.counts[k]} · ${n(r.areas[k])} mm²` : String(r.counts[k])]))}${r.split ? note(t('drwEval.silhouetteSplit', { count: r.split })) : ''}${legend(t, [['#408ceb', 'drwEval.class.cavity'], ['#59bf66', 'drwEval.class.core'], ['#f2cc33', 'drwEval.class.straight'], ['#e63333', 'drwEval.class.undercut']])}`));
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
    parts.push(...costPages(kind, r, api));
  }
  if (e.error) parts.push(`<p class="pm-error">${icon('error')}<span>${escapeHtml(t(e.error))}</span></p>`);
  return parts.join('');
}

// ───────────────────────── costing and sustainability pages

/** [process, icon] of the costing processes. */
export const COST_PROCESSES = [['auto', 'costAuto'], ['machining', 'costMachining'], ['sheet', 'costSheet'], ['casting', 'costCasting'], ['moulding', 'costMoulding']];

/** The editable rates of each process: [path in p.costing, icon]; '*' = one value per material group (the part's shown). */
export const COST_FIELDS = {
  machining: [['machining.rate', 'costing'], ['machining.setup', 'timer'], ['machining.setups', 'timer'], ['machining.allowance', 'smartDim'], ['machining.removalRate.*', 'featCut'],
    ['machining.pocketFactor', 'featCut'], ['machining.turnRate.*', 'featRevolve'], ['machining.barStep', 'smartDim'], ['machining.drillSpeed.*', 'featHole'], ['machining.feedFactor', 'featHole'],
    ['machining.approach', 'featHole'], ['machining.maxDrill', 'featHole'], ['machining.reamBelow', 'featHole'], ['machining.reamSpeed', 'featHole'], ['machining.tapSpeed', 'featThread'],
    ['machining.threadPasses', 'featThread'], ['machining.millSpeed.*', 'featFillet'], ['machining.edgeTeeth', 'featFillet'], ['machining.edgeFeedFactor', 'featFillet'],
    ['machining.minTool', 'featChamfer'], ['machining.maxRpm', 'motor'], ['machining.ballStep', 'featFillet'], ['machining.finishRate', 'surfaceFinish'], ['machining.power', 'motor']],
  sheet: [['sheet.laserRate', 'costing'], ['sheet.cutSpeed', 'costSheet'], ['sheet.cutFactor.*', 'costSheet'], ['sheet.pierceSec', 'timer'], ['sheet.margin', 'smartDim'],
    ['sheet.brakeRate', 'costing'], ['sheet.bendSec', 'edgeFlange'], ['sheet.bendSetup', 'timer'], ['sheet.laserPower', 'motor'], ['sheet.brakePower', 'motor']],
  casting: [['casting.rate', 'costing'], ['casting.yield', 'costCasting'], ['casting.cavities', 'costCasting'], ['casting.B', 'timer'], ['casting.mouldMin', 'timer'], ['casting.pourRate', 'costCasting'],
    ['casting.shakeoutSec', 'timer'], ['casting.fettlingMin', 'timer'], ['casting.patternCost', 'costing'], ['casting.meltEnergy.*', 'motor'], ['casting.energyPrice', 'costing'], ['casting.power', 'motor']],
  moulding: [['moulding.cavities', 'costMoulding'], ['moulding.runner', 'costMoulding'], ['moulding.wall', 'smartDim'], ['moulding.alpha', 'costMoulding'], ['moulding.melt', 'costMoulding'],
    ['moulding.mould', 'costMoulding'], ['moulding.eject', 'costMoulding'], ['moulding.injectionRate', 'timer'], ['moulding.resetSec', 'timer'], ['moulding.cavityPressure', 'costMoulding'],
    ['moulding.pressBase', 'costing'], ['moulding.pressPerTonne', 'costing'], ['moulding.mouldBase', 'costing'], ['moulding.cavityCost', 'costing'], ['moulding.perFace', 'costing'],
    ['moulding.sideActions', 'costMoulding'], ['moulding.sideActionCost', 'costing'], ['moulding.power', 'motor']],
};

/** The value at a dotted path of an object. */
export const atPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

const shown = (v) => (Array.isArray(v) ? v.map((p) => p.join(':')).join(', ') : v == null || v === '' ? '' : String(v));

function costPages(kind, r, api) {
  const { t } = api;
  const c = r?.cost; const s = r?.co2;
  const group = c?.group ?? 'other';
  const money = (v) => `${c?.currency ?? COST_TABLE_DEFAULTS.currency}${n(v)}`;
  const out = [];
  const exportRow = `<div class="pm-row">${api.pmButton('drw.costCsv', 'costCsv', t('cost.exportCsv'))}${api.pmButton('drw.costHtml', 'costReport', t('cost.exportHtml'))}</div>`;
  const table = (cols, list) => `<table class="cost-table"><thead><tr>${cols.map((x) => `<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${list.map((cells) => `<tr>${cells.map((x, i) => `<td class="${i > 1 ? 'n' : ''}">${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const opName = (op) => t(`cost.op.${op}`);
  if (kind === 'costing') {
    const user = api.costing ?? {};
    const eff = costSettings(user);
    const fieldRow = ([path, glyph]) => {
      const p = path.replace('*', group);
      const name = path.split('.').filter((x) => x !== '*').at(-1);
      const label = `${t(`cost.f.${name}`)}${path.includes('*') ? ` (${t(`cost.group.${group}`)})` : ''}`;
      return api.textRow(`cost:${p}`, shown(atPath(user, p) ?? atPath(eff, p)), label, glyph);
    };
    const process = user.process ?? 'auto';
    out.push(api.pmGroup('costing', t('cost.process'), `${api.sel('costProcess', COST_PROCESSES.map(([k]) => [k, k === 'auto' && c ? `${t('cost.proc.auto')} → ${t(`cost.proc.${c.process}`)}` : t(`cost.proc.${k}`)]), process, t('cost.process'))}${fieldRow(['lot', 'bom'])}${api.textRow('cost:currency', shown(user.currency ?? eff.currency), t('cost.f.currency'), 'costing')}`));
    const price = `${fieldRow(['pricePerKg.*', 'material'])}<details class="cost-rates"><summary>${icon('costRates', 'icon tiny')}<span>${escapeHtml(t('cost.allGroups'))}</span></summary>${MATERIAL_GROUPS.map((g) => api.textRow(`cost:pricePerKg.${g}`, shown(atPath(user, `pricePerKg.${g}`) ?? eff.pricePerKg[g]), `${t('drwEval.pricePerKg')} — ${t(`cost.group.${g}`)}`, 'material')).join('')}</details>`;
    out.push(api.pmGroup('material', t('drwEval.prices'), price));
    const proc = c?.process ?? (process === 'auto' ? 'machining' : process);
    const fields = COST_FIELDS[proc] ?? [];
    const groupTables = fields.filter(([p]) => p.includes('*'));
    const all = groupTables.map(([p, glyph]) => `<h5>${escapeHtml(t(`cost.f.${p.split('.').at(-2)}`))}</h5>${MATERIAL_GROUPS.map((g) => api.textRow(`cost:${p.replace('*', g)}`, shown(atPath(user, p.replace('*', g)) ?? atPath(eff, p.replace('*', g))), t(`cost.group.${g}`), glyph)).join('')}`).join('');
    out.push(api.pmGroup(COST_PROCESSES.find(([k]) => k === proc)?.[1] ?? 'costing', t('cost.rates', { process: t(`cost.proc.${proc}`) }), `${fields.map(fieldRow).join('')}${all ? `<details class="cost-rates"><summary>${icon('costRates', 'icon tiny')}<span>${escapeHtml(t('cost.allGroups'))}</span></summary>${all}</details>` : ''}<p class="pm-note">${escapeHtml(t(`cost.help.${proc}`))}</p>`));
    if (c) {
      const sum = [[t('drwEval.material'), r.material], [t('drwEval.partMass'), `${n(c.partMass, 4)} kg`], [t('cost.boughtMass'), `${n(c.boughtMass, 4)} kg`]];
      if (c.process === 'machining') {
        sum.push([t('cost.stock'), c.stock.kind === 'bar' ? `${t('cost.bar')} Ø${n(c.stock.diameter)} × ${n(c.stock.length)} mm` : `${t('cost.block')} ${c.stock.size.map((x) => n(x)).join(' × ')} mm`]);
        sum.push([t('cost.holes'), String(c.holes.length)], [t('cost.edges'), String(c.edges?.length ?? 0)], [t('cost.setups'), String(c.setups)]);
      } else if (c.process === 'sheet') {
        sum.push([t('cost.blank'), `${n(c.blank.width)} × ${n(c.blank.height)} × ${n(c.blank.thickness)} mm`], [t('cost.cutLength'), `${n(c.blank.cutLength, 1)} mm`], [t('cost.pierces'), String(c.blank.pierces)], [t('cost.bends'), String(c.bends)], [t('cost.utilisation'), `${n(c.utilisation * 100, 1)}%`]);
      } else if (c.process === 'casting') {
        sum.push([t('cost.poured'), `${n(c.poured, 3)} kg`], [t('cost.solidify'), `${n(c.solidSec, 1)} s`], [t('cost.cycle'), `${n(c.cycleSec, 1)} s`]);
      } else {
        if (c.walls) sum.push([t('cost.wallMeasured'), `${n(c.walls.min, 3)} / ${n(c.walls.avg, 3)} / ${n(c.walls.max, 3)} mm`]);
        sum.push([t('cost.projected'), `${n(c.projected, 2)} mm²`]);
        sum.push([t('cost.wall'), `${n(c.wall, 3)} mm`], [t('cost.coolTime'), `${n(c.coolSec, 2)} s`], [t('cost.cycle'), `${n(c.cycleSec, 2)} s`], [t('cost.clamp'), `${n(c.tonnes, 1)} t`], [t('cost.mouldCost'), money(c.mouldCost)]);
      }
      sum.push([t('drwEval.materialCost'), money(c.materialCost)], [t('cost.processCost'), `${money(c.processCost)} (${n(c.timeMin, 2)} min)`], [t('cost.toolingCost'), money(c.toolingCost)], [t('drwEval.totalCost'), money(c.total)]);
      out.push(api.pmGroup('costing', t('pm.results'), rows(sum)));
      out.push(api.pmGroup('costRates', t('cost.breakdown'), `${table([t('cost.col.op'), t('cost.col.feature'), t('cost.col.time'), t('cost.col.cost')], c.rows.map((x) => [opName(x.op), x.feature, n(x.timeMin, 2), money(x.cost)]))}${exportRow}`));
    }
  } else {
    const user = api.sustain ?? {};
    const eff = co2Settings(user);
    const v = (p) => shown(atPath(user, p) ?? atPath(eff, p));
    out.push(api.pmGroup('sustainability', t('drwEval.factors'), `${api.textRow(`co2:perKg.${group}`, user.factor != null ? String(user.factor) : v(`perKg.${group}`), `${t('drwEval.co2PerKg')} (${t(`cost.group.${group}`)})`, 'sustainability')}${api.textRow('co2:grid', v('grid'), t('drwEval.gridFactor'), 'sun')}${api.textRow('co2:distance', v('distance'), t('drwEval.distance'), 'globe')}${api.textRow('co2:perTonneKm', v('perTonneKm'), t('drwEval.transportFactor'), 'globe')}<details class="cost-rates"><summary>${icon('costRates', 'icon tiny')}<span>${escapeHtml(t('cost.allGroups'))}</span></summary>${MATERIAL_GROUPS.map((g) => api.textRow(`co2:perKg.${g}`, v(`perKg.${g}`), t(`cost.group.${g}`), 'sustainability')).join('')}</details><p class="pm-note">${escapeHtml(t('cost.co2Help', { process: t(`cost.proc.${c?.process ?? 'machining'}`) }))}</p>`));
    if (s) {
      out.push(api.pmGroup('sustainability', t('pm.results'), rows([
        [t('drwEval.material'), r.material], [t('cost.process'), t(`cost.proc.${c.process}`)], [t('cost.boughtMass'), `${n(c.boughtMass, 4)} kg`], [t('drwEval.co2Material'), `${n(s.materialCO2, 3)} kg CO₂e`],
        [t('drwEval.energy'), `${n(s.energy, 3)} kWh`], [t('cost.co2Process'), `${n(s.processCO2, 3)} kg CO₂e`], [t('drwEval.co2Transport'), `${n(s.transportCO2, 4)} kg CO₂e`],
        [t('drwEval.co2Total'), `${n(s.total, 3)} kg CO₂e`], [t('drwEval.co2PerPartKg'), `${n(s.perKgPart, 2)} kg CO₂e/kg`]])));
      out.push(api.pmGroup('costRates', t('cost.breakdown'), `${table([t('cost.col.op'), t('cost.col.feature'), t('cost.col.energy'), t('cost.col.co2')], s.rows.map((x) => [opName(x.op), x.feature, n(x.energy, 4), n(x.co2, 4)]))}${exportRow}`));
    }
  }
  out.push(note(t('cost.note')));
  return out;
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
    return group('shutOff', t('mold.shutOff'), `${seg('dir', [['', t('mold.fromPartingLine')], ...PULL_DIRS], f.dir ?? '')}${seg('at', [['parting', t('mold.atParting')], ['top', t('mold.atTop')]], f.at ?? 'parting')}${r ? note(t('mold.shutOffCount', { count: r.count })) : ''}${r?.filled ? note(t('mold.shutOffFilled', { count: r.filled })) : ''}${note(t('pm.help.shutOff'))}`);
  },
  partingSurface(api, f) {
    const { t } = api;
    const r = api.previewResult?.partingSurface;
    return group('partingSurface', t('mold.partingSurface'), `${seg('dir', [['', t('mold.fromPartingLine')], ...PULL_DIRS], f.dir ?? '')}${field(api, 'distance', f.distance ?? 30, { label: t('mold.distance'), min: 1 })}${seg('mode', [['normal', t('mold.mode.normal'), 'partingSurface'], ['tangent', t('mold.mode.tangent'), 'surface'], ['ruled', t('mold.mode.ruled'), 'ruledSurface']], f.mode ?? 'normal')}${r ? note(r.planar ? t('mold.planar', { count: r.edges }) : t('mold.following', { count: r.edges, faces: r.faces ?? r.edges, mode: t(`mold.mode.${r.mode ?? 'normal'}`) })) : ''}${r?.split ? note(t('mold.silhouetteSplit', { count: r.split })) : ''}${undercutWarning(api)}${note(t('pm.help.partingSurface'))}`);
  },
  toolingSplit(api, f) {
    const { t } = api;
    const r = api.previewResult?.tooling;
    return group('partingSurface', t('mold.bySurfaces'), `${check('useSurfaces', f.useSurfaces !== false, t('mold.useSurfaces'), 'partingSurface')}${r?.bySurface ? note(t('mold.splitBySurfaces', { count: r.shutOffs })) : ''}${undercutWarning(api)}`);
  },
};

// The PropertyManager (the left-panel editor): the options of the feature, sketch, mate or
// drawing being edited, in group boxes, with selection boxes (pink while they take picks from the
// graphics area), and OK / Cancel at the top. HTML only — app.js binds the data-pm* attributes.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { relationsFor, standalonePoints, constructionLines, byId, geomKind, DIMENSIONS } from '../cad/sketch.js';
import { featureIcon, MATE_ICONS } from './tree.js';
import { matesFor, MATE_REFS } from '../cad/assembly.js';
import { SHEETS, VIEW_TYPES, scaleLabel, STANDARD_SCALES, GDT_SYMBOLS } from '../cad/drawing.js';
import { ADVANCED_PM } from './pm-advanced.js';
import { PART_MORE_PM } from './pm-part-more.js';
import { SHEET_MORE_PM } from './pm-sheet-more.js';
import { MOLD_MORE_PM } from './pm-eval-more.js';
import { STD_PM } from './pm-std.js';

/** Tapped hole sizes (ISO 261 coarse): [size, d, pitch] — the tap drill is d − P. */
export const TAP_SIZES = [['M3', 3, 0.5], ['M4', 4, 0.7], ['M5', 5, 0.8], ['M6', 6, 1], ['M8', 8, 1.25], ['M10', 10, 1.5], ['M12', 12, 1.75], ['M16', 16, 2], ['M20', 20, 2.5], ['M24', 24, 3]];

/** Hole Wizard sizes (ISO 273 medium clearance, ISO 4762 counterbores, 90° countersinks): [size, d, cbD, cbDepth, csD]. */
export const HOLE_SIZES = [
  ['M3', 3.4, 6.5, 3.3, 6.3], ['M4', 4.5, 8, 4.4, 8.4], ['M5', 5.5, 10, 5.4, 10.4], ['M6', 6.6, 11, 6.4, 12.4], ['M8', 9, 15, 8.6, 16.4],
  ['M10', 11, 18, 10.8, 20.4], ['M12', 13.5, 20, 13, 24.4], ['M16', 17.5, 26, 17.5, 32.4], ['M20', 22, 33, 21.5, 40.4],
];

const RELATION_ICONS = { coincident: 'relCoincident', horizontal: 'relHorizontal', vertical: 'relVertical', parallel: 'relParallel', perpendicular: 'relPerpendicular', tangent: 'relTangent', equal: 'relEqual', concentric: 'relConcentric', midpoint: 'relMidpoint', fix: 'relFix', symmetric: 'relSymmetric', collinear: 'relCollinear', pointOnLine: 'relPointOnLine', pointOnCircle: 'relPointOnCircle', distance: 'dimDistance', hdistance: 'dimDistance', vdistance: 'dimDistance', radius: 'dimRadius', diameter: 'dimDiameter', angle: 'dimAngle' };
export const relationIcon = (type) => RELATION_ICONS[type] ?? 'addRelation';

function header(api, glyph, title, { ok = true, help = '' } = {}) {
  const { t } = api;
  return `<div class="pm-head">
    <div class="pm-title">${icon(glyph)}<b>${escapeHtml(title)}</b></div>
    <div class="pm-buttons">
      ${ok ? `<button class="pm-ok" data-pm="ok" title="${escapeHtml(t('pm.ok'))}" aria-label="${escapeHtml(t('pm.ok'))}">${icon('check')}</button>` : ''}
      <button class="pm-cancel" data-pm="cancel" title="${escapeHtml(t('pm.cancel'))}" aria-label="${escapeHtml(t('pm.cancel'))}">${icon('close')}</button>
    </div>
    ${help ? `<p class="pm-help">${icon('info', 'icon tiny')}<span>${escapeHtml(help)}</span></p>` : ''}
  </div>`;
}

export const group = (glyph, title, body, cls = '') => `<section class="pm-group ${cls}"><h4>${icon(glyph)}<span>${escapeHtml(title)}</span></h4><div class="pm-group-body">${body}</div></section>`;

export function field(api, key, value, { label, glyph = 'smartDim', unit = 'length', min = null, step = null } = {}) {
  // A value driven by an equation shows its expression ("=W/2"); typing "=…" makes one.
  const expr = api.editing?.feature?.exprs?.[key];
  const shown = expr ? `=${expr}` : unit === 'length' ? api.fmtLenBare(value) : unit === 'angle' ? api.fmt(value) : unit === 'count' ? String(Math.round(value)) : api.fmt(value);
  const unitLabel = expr ? '' : unit === 'length' ? api.unitName() : unit === 'angle' ? '°' : '';
  return `<label class="pm-field" title="${escapeHtml(label)}">${icon(glyph)}<span class="pm-label">${escapeHtml(label)}</span>
    <span class="pm-input" data-stepper>
      <button type="button" class="pm-step" data-pm-step="${escapeHtml(key)}" data-delta="-1" aria-label="−">−</button>
      <input type="text" data-pm-field="${escapeHtml(key)}" data-unit="${unit}" ${min != null ? `data-min="${min}"` : ''} ${step != null ? `data-step="${step}"` : ''} value="${escapeHtml(shown)}" spellcheck="false" /><span class="num-unit">${escapeHtml(unitLabel)}</span>
      <button type="button" class="pm-step" data-pm-step="${escapeHtml(key)}" data-delta="1" aria-label="+">+</button>
    </span></label>`;
}

export const check = (key, value, label, glyph = 'check') => `<label class="pm-check" title="${escapeHtml(label)}"><input type="checkbox" data-pm-toggle="${escapeHtml(key)}" ${value ? 'checked' : ''} />${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;

export const seg = (key, options, current) => `<span class="segmented pm-seg" role="radiogroup">${options.map(([v, label, glyph]) => `<button type="button" class="segment ${String(v) === String(current) ? 'active' : ''}" data-pm-set="${escapeHtml(key)}" data-value="${escapeHtml(v)}" title="${escapeHtml(label)}" aria-pressed="${String(v) === String(current)}">${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`).join('')}</span>`;

export const select = (key, options, current, label) => `<label class="pm-field" title="${escapeHtml(label)}"><span class="pm-label">${escapeHtml(label)}</span><select data-pm-select="${escapeHtml(key)}" aria-label="${escapeHtml(label)}">${options.map(([v, text, glyph]) => `<option value="${escapeHtml(v)}" ${glyph ? `data-icon="${glyph}"` : ''} ${String(v) === String(current) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;

/** A selection box: the picked items (removable), pink while it is the active one. */
export function pickBox(api, key, items, label, glyph) {
  const active = api.editing.pick === key;
  return `<div class="pm-pick ${active ? 'active' : ''}" data-pm-pick="${escapeHtml(key)}" title="${escapeHtml(label)}" tabindex="0">
    <div class="pm-pick-head">${icon(glyph)}<span>${escapeHtml(label)}</span><span class="grow"></span><span class="pm-count">${items.length}</span>${items.length ? `<button type="button" class="icon-button" data-pm="clear:${escapeHtml(key)}" title="${escapeHtml(api.t('pm.clear'))}">${icon('trash', 'icon tiny')}</button>` : ''}</div>
    <ul class="pm-pick-list">${items.length ? items.map((it, i) => `<li title="${escapeHtml(it)}">${icon(glyph, 'icon tiny')}<span>${escapeHtml(it)}</span><button type="button" class="icon-button" data-pm-remove="${escapeHtml(key)}:${i}" aria-label="×">${icon('close', 'icon tiny')}</button></li>`).join('') : `<li class="muted">${escapeHtml(api.t(active ? 'pm.pickNow' : 'pm.clickToPick'))}</li>`}</ul>
  </div>`;
}

const axisName = (api, ref) => (!ref ? '—' : ref.kind === 'axis' ? api.t(`axis.${ref.axis}`) : ref.kind === 'edge' ? api.t('pm.edgeRef') : '—');
export const planeName = (api, ref) => {
  if (!ref) return '—';
  if (ref.kind === 'std') return api.t(`plane.${ref.name}`);
  if (ref.kind === 'ref') return api.featureName(ref.id) ?? '—';
  return api.t('pm.faceRef');
};

export function propertyManagerHtml(api) {
  const e = api.editing;
  if (!e) return '';
  if (e.mode === 'sketch') return sketchPm(api);
  if (e.mode === 'mate') return matePm(api);
  if (e.mode === 'insert') return insertPm(api);
  if (e.mode === 'measure') return measurePm(api);
  if (['equations', 'configs', 'simulation', 'motion', 'lights'].includes(e.mode) || api.customMode?.(e.mode)) return api.custom?.(e) ?? '';
  if (e.mode === 'sketchPlane') return `${header(api, 'featSketch', api.t('pm.newSketch'), { ok: false })}${group('refPlane', api.t('pm.sketchPlane'), `<p class="pm-note">${escapeHtml(api.t('pm.pickSketchPlane'))}</p><div class="pm-row">${['front', 'top', 'right'].map((p) => `<button class="small-button" data-pm="sketchOn:${p}" title="${escapeHtml(api.t(`plane.${p}`))}">${icon(`plane${p[0].toUpperCase()}${p.slice(1)}`)}<span>${escapeHtml(api.t(`plane.${p}`))}</span></button>`).join('')}</div>`)}`;
  return featurePm(api);
}

function featurePm(api) {
  const { t } = api;
  const e = api.editing;
  const f = e.feature;
  const title = `${f.name}${e.isNew ? '' : ` — ${t('pm.editing')}`}`;
  const help = t(`pm.help.${f.type}`, null, '');
  const parts = [header(api, featureIcon(f), title, { help })];
  const sketchList = api.sketchOptions(f);
  const sketchSel = (label = t('pm.sketch')) => select('sketch', [['', `— ${t('pm.chooseSketch')} —`], ...sketchList.map((s) => [s.id, s.name, 'featSketch'])], f.sketch ?? '', label);
  if (f.type === 'extrude') {
    parts.push(group('featSketch', t('pm.from'), `${sketchSel()}${seg('op', [['boss', t('op.boss'), 'featExtrude'], ['cut', t('op.cut'), 'featCut'], ['common', t('op.common'), 'featIntersect']], f.op)}`));
    const ends = [['blind', t('end.blind')], ['through', t('end.through')], ['throughBoth', t('end.throughBoth')], ['midplane', t('end.midplane')]];
    parts.push(group('featExtrude', t('pm.direction1'), `${select('end', ends, f.end, t('pm.endCondition'))}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}${f.end === 'blind' || f.end === 'midplane' ? field(api, 'depth', f.depth, { label: t('pm.depth'), min: 0.001 }) : ''}${f.end === 'blind' ? `${check('draft', f.draft, t('pm.draftOnOff'), 'featDraft')}${f.draft ? `${field(api, 'draftAngle', f.draftAngle ?? 3, { label: t('pm.draftAngle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 })}${check('draftOutward', f.draftOutward, t('pm.draftOutward'), 'flipH')}` : ''}` : ''}`));
    if (f.end === 'blind' || f.end === 'through') {
      const on = f.end2 && f.end2 !== 'none';
      parts.push(group('featExtrude', t('pm.direction2'), `${check('dir2', on, t('pm.direction2'), 'flipH')}${on ? `${select('end2', [['blind', t('end.blind')], ['through', t('end.through')]], f.end2, t('pm.endCondition'))}${f.end2 === 'blind' ? field(api, 'depth2', f.depth2, { label: t('pm.depth'), min: 0.001 }) : ''}` : ''}`, on ? '' : 'collapsed'));
    }
  } else if (f.type === 'revolve') {
    const sk = api.sketchById(f.sketch);
    const axes = sk ? sk.entities.filter((x) => x.type === 'line') : [];
    const axisOptions = axes.map((l, i) => [l.id, `${l.construction ? t('pm.centerline') : t('pm.line')} ${i + 1}`, l.construction ? 'centerline' : 'lineTool']);
    parts.push(group('featSketch', t('pm.from'), `${sketchSel()}${seg('op', [['boss', t('op.boss'), 'featRevolve'], ['cut', t('op.cut'), 'featCutRevolve']], f.op)}`));
    parts.push(group('refAxis', t('pm.axis'), `${select('axis', [['', t('pm.firstCenterline')], ...axisOptions], f.axis ?? '', t('pm.axisOfRevolution'))}${!constructionLines(sk ?? { entities: [] }).length && !f.axis ? `<p class="pm-note warn">${icon('warning', 'icon tiny')}${escapeHtml(t('pm.needCenterline'))}</p>` : ''}`));
    parts.push(group('dimAngle', t('pm.direction1'), `${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 })}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`));
  } else if (f.type === 'fillet' || f.type === 'chamfer') {
    const items = (f.edges ?? []).map((sig, i) => `${t('pm.edge')} ${i + 1} (${sig.type === 'CIRCLE' ? t('pm.circular') : sig.type === 'LINE' ? t('pm.straight') : t('pm.curve')})`);
    parts.push(group(f.type === 'fillet' ? 'featFillet' : 'featChamfer', t('pm.items'), `${f.type === 'fillet' ? field(api, 'radius', f.radius, { label: t('pm.radius'), glyph: 'dimRadius', min: 0.001 }) : field(api, 'distance', f.distance, { label: t('pm.distance'), min: 0.001 })}${pickBox(api, 'edges', items, t('pm.edges'), 'featFillet')}<div class="pm-row"><button class="small-button" data-pm="tangentChain" title="${escapeHtml(t('pm.allEdgesOfFaceTip'))}">${icon('selectAll')}<span>${escapeHtml(t('pm.allEdgesOfFace'))}</span></button></div>`));
  } else if (f.type === 'shell') {
    const items = (f.faces ?? []).map((sig, i) => `${t('pm.face')} ${i + 1} (${sig.type === 'PLANE' ? t('pm.planar') : t('pm.curved')})`);
    parts.push(group('featShell', t('pm.parameters'), `${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.001 })}${pickBox(api, 'faces', items, t('pm.facesToRemove'), 'featShell')}`));
  } else if (f.type === 'hole') {
    const pts = e.holeSketch?.points ?? [];
    const tapped = f.kind === 'tapped';
    parts.push(group('featHole', t('pm.holeType'), `${seg('kind', [['simple', t('hole.simple'), 'featHole'], ['counterbore', t('hole.counterbore'), 'featHole'], ['countersink', t('hole.countersink'), 'featHole'], ['tapped', t('hole.tapped'), 'featThread']], f.kind)}
      ${tapped ? `${select('threadSize', TAP_SIZES.map(([s, d, p]) => [s, `${s} × ${p} — ${t('hole.tapDrill')} Ø${Math.round((d - p) * 10) / 10}`]), f.threadSize ?? 'M8', t('hole.threadSize'))}${field(api, 'threadDepth', f.threadDepth, { label: t('hole.threadDepth'), min: 0.1 })}${select('threadMode', [['auto', t('thread.mode.auto')], ['cosmetic', t('thread.mode.cosmetic')], ['modelled', t('thread.mode.modelled')]], f.threadMode ?? 'auto', t('thread.display'))}<p class="pm-note">${escapeHtml(t('hole.tapNote'))}</p>` : select('size', [['', t('hole.custom')], ...HOLE_SIZES.map(([s]) => [s, `${s} — ${t('hole.clearance')}`])], f.size ?? '', t('hole.size'))}
      ${field(api, 'diameter', f.diameter, { label: t('hole.diameter'), glyph: 'dimDiameter', min: 0.1 })}
      ${f.kind === 'counterbore' ? `${field(api, 'cbDiameter', f.cbDiameter, { label: t('hole.cbDiameter'), glyph: 'dimDiameter', min: 0.1 })}${field(api, 'cbDepth', f.cbDepth, { label: t('hole.cbDepth'), min: 0.1 })}` : ''}
      ${f.kind === 'countersink' ? `${field(api, 'csDiameter', f.csDiameter, { label: t('hole.csDiameter'), glyph: 'dimDiameter', min: 0.1 })}${field(api, 'csAngle', f.csAngle, { label: t('hole.csAngle'), unit: 'angle', glyph: 'dimAngle', min: 30 })}` : ''}`));
    parts.push(group('featExtrude', t('pm.endCondition'), `${seg('through', [['true', t('end.through')], ['false', t('end.blind')]], String(Boolean(f.through)))}${f.through ? '' : field(api, 'depth', f.depth, { label: t('pm.depth'), min: 0.1 })}`));
    if (e.isNew || e.holeSketch) parts.push(group('pointTool', t('pm.positions'), `${pickBox(api, 'holePoints', pts.map((p, i) => `${t('pm.point')} ${i + 1} (${api.fmtLen(p[0])}, ${api.fmtLen(p[1])})`), t('pm.holePoints'), 'pointTool')}<p class="pm-note">${escapeHtml(t(e.holeSketch?.plane ? 'pm.holeMore' : 'pm.holeFirst'))}</p>`));
    else parts.push(group('featSketch', t('pm.positions'), sketchSel(t('pm.pointsSketch'))));
  } else if (f.type === 'linearPattern' || f.type === 'circularPattern') {
    const seeds = (f.seeds ?? []).map((id) => api.featureName(id) ?? id);
    if (f.type === 'linearPattern') {
      parts.push(group('featLinPattern', t('pm.direction1'), `${seg('dir1', [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['edge', t('pm.edgeRef')]], f.direction?.kind === 'edge' ? 'edge' : f.direction?.axis ?? 'x')}${f.direction?.kind === 'edge' ? pickBox(api, 'direction', [axisName(api, f.direction)], t('pm.directionEdge'), 'lineTool') : ''}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}${field(api, 'spacing', f.spacing, { label: t('pm.spacing') })}${field(api, 'count', f.count, { label: t('pm.instances'), unit: 'count', glyph: 'featLinPattern', min: 1, step: 1 })}`));
      const on = Boolean(f.direction2);
      parts.push(group('featLinPattern', t('pm.direction2'), `${check('dir2', on, t('pm.direction2'), 'flipH')}${on ? `${seg('dir2axis', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], f.direction2?.axis ?? 'z')}${check('reverse2', f.reverse2, t('pm.reverse'), 'flipV')}${field(api, 'spacing2', f.spacing2, { label: t('pm.spacing') })}${field(api, 'count2', f.count2, { label: t('pm.instances'), unit: 'count', glyph: 'featLinPattern', min: 1, step: 1 })}` : ''}`, on ? '' : 'collapsed'));
    } else {
      parts.push(group('featCirPattern', t('pm.parameters'), `${seg('axisKind', [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['edge', t('pm.edgeRef')], ...(api.featuresBefore?.(f) ?? []).filter((x) => x.type === 'refAxis').map((x) => [`ref:${x.id}`, x.name, 'refAxis'])], f.axis?.kind === 'ref' ? `ref:${f.axis.id}` : f.axis?.kind === 'edge' ? 'edge' : f.axis?.axis ?? 'z')}${f.axis?.kind === 'edge' ? pickBox(api, 'axis', [axisName(api, f.axis)], t('pm.axisEdge'), 'refAxis') : ''}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}${field(api, 'angle', f.angle, { label: t('pm.totalAngle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 })}${field(api, 'count', f.count, { label: t('pm.instances'), unit: 'count', glyph: 'featCirPattern', min: 1, step: 1 })}${check('equal', f.equal, t('pm.equalSpacing'), 'relEqual')}`));
    }
    parts.push(group('part', t('pm.featuresToPattern'), `${check('body', f.body, t('pm.patternBody'), 'part')}${f.body ? '' : pickBox(api, 'seeds', seeds, t('pm.seedFeatures'), 'featExtrude')}`));
  } else if (f.type === 'mirror') {
    const seeds = (f.seeds ?? []).map((id) => api.featureName(id) ?? id);
    parts.push(group('featMirror', t('pm.mirrorPlane'), `${seg('stdPlane', [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')]], f.plane?.kind === 'std' ? f.plane.name : '')}${pickBox(api, 'plane', [planeName(api, f.plane)], t('pm.planeOrFace'), 'refPlane')}`));
    parts.push(group('part', t('pm.featuresToMirror'), `${check('body', f.body, t('pm.mirrorBody'), 'part')}${f.body ? '' : pickBox(api, 'seeds', seeds, t('pm.seedFeatures'), 'featExtrude')}`));
  } else if (f.type === 'plane') {
    parts.push(group('refPlane', t('pm.firstReference'), `${seg('stdPlane', [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')]], f.base?.kind === 'std' ? f.base.name : '')}${pickBox(api, 'base', [planeName(api, f.base)], t('pm.planeOrFace'), 'refPlane')}${field(api, 'offset', f.offset, { label: t('pm.offset') })}${check('flip', f.flip, t('pm.flip'), 'flipV')}`));
  }
  if (ADVANCED_PM[f.type]) parts.push(ADVANCED_PM[f.type](api, f, e));
  else if (PART_MORE_PM[f.type]) parts.push(PART_MORE_PM[f.type](api, f, e));
  else if (SHEET_MORE_PM[f.type]) parts.push(SHEET_MORE_PM[f.type](api, f, e));
  if (MOLD_MORE_PM[f.type]) parts.push(MOLD_MORE_PM[f.type](api, f, e));
  else if (STD_PM[f.type]) parts.push(STD_PM[f.type](api, f, e));
  const r = api.previewResult;
  if (r && r.ok === false) parts.push(`<p class="pm-error">${icon('error')}<span>${escapeHtml(t(`rebuild.${r.error}`, null, r.error))}</span></p>`);
  return parts.join('');
}

function sketchPm(api) {
  const { t } = api;
  const ed = api.editing.editor;
  const sel = ed.selectionInfo();
  const ids = sel.filter((x) => x.type && !x.value && !DIMENSIONS.includes(x.type) && !x.a).map((x) => x.id);
  const rels = relationsFor(ed.sketch, ids);
  const status = ed.over ? 'over' : ed.dof === 0 ? 'defined' : 'under';
  const parts = [header(api, 'featSketch', `${api.editing.feature.name} — ${t('pm.editing')}`, { help: t('pm.help.sketch') })];
  parts.push(group('dofFree', t('pm.status'), `<div class="sketch-status ${status}">${icon(status === 'defined' ? 'check' : status === 'over' ? 'error' : 'dofFree')}<span>${escapeHtml(t(`sketch.status.${status}`, { dof: ed.dof }))}</span></div>`));
  // The selection: its relations, and what can be added.
  if (sel.length) {
    const rows = sel.map((x) => `<li>${icon(x.type === 'point' ? 'pointTool' : x.type === 'line' ? (x.construction ? 'centerline' : 'lineTool') : x.type === 'circle' ? 'circleTool' : x.type === 'arc' ? 'arcTool' : x.type === 'spline' ? 'splineTool' : x.type === 'ellipse' ? 'ellipseTool' : x.type === 'text' ? 'textTool' : relationIcon(x.type), 'icon tiny')}<span>${escapeHtml(entityLabel(api, x))}</span></li>`).join('');
    parts.push(group('select', t('pm.selected'), `<ul class="pm-list">${rows}</ul>${entityProps(api, sel)}`));
    const existing = ed.sketch.constraints.filter((c) => ids.some((id) => [c.a, c.b, c.c].includes(id)));
    if (existing.length) parts.push(group('addRelation', t('pm.existingRelations'), `<ul class="pm-list">${existing.map((c) => `<li class="${c.driven ? 'muted' : ''}">${icon(relationIcon(c.type), 'icon tiny')}<span>${escapeHtml(t(`rel.${c.type}`))}${DIMENSIONS.includes(c.type) ? ` = ${escapeHtml(c.type === 'angle' ? `${api.fmt(c.value)}°` : api.fmtLen(c.value))}` : ''}</span><button class="icon-button" data-pm="delRelation:${escapeHtml(c.id)}" title="${escapeHtml(t('pm.deleteRelation'))}">${icon('trash', 'icon tiny')}</button></li>`).join('')}</ul>`));
    if (rels.length) parts.push(group('addRelation', t('pm.addRelations'), `<div class="pm-relations">${rels.map((r) => `<button class="small-button" data-pm="relation:${r}" title="${escapeHtml(t(`rel.${r}`))}">${icon(relationIcon(r))}<span>${escapeHtml(t(`rel.${r}`))}</span></button>`).join('')}</div>`));
    if (ids.some((id) => byId(ed.sketch, id)?.type !== 'point')) parts.push(`<div class="pm-row"><button class="small-button" data-pm="construction" title="${escapeHtml(t('sketch.construction'))}">${icon('constructionToggle')}<span>${escapeHtml(t('sketch.construction'))}</span></button><button class="small-button danger" data-pm="deleteSel" title="${escapeHtml(t('action.delete'))}">${icon('trash')}<span>${escapeHtml(t('action.delete'))}</span></button></div>`);
    parts.push(`<div class="pm-relations">${[['sk:offset', 'offsetTool'], ['sk:mirror', 'mirrorEntities'], ['sk:linPattern', 'sketchLinPattern'], ['sk:cirPattern', 'sketchCirPattern']].map(([id, g]) => `<button class="small-button" data-command="${id}" title="${escapeHtml(t(`sketch.tool.${id.slice(3)}`))}">${icon(g)}<span>${escapeHtml(t(`sketch.tool.${id.slice(3)}`))}</span></button>`).join('')}</div>`);
  } else {
    parts.push(group('info', t('pm.howTo'), `<p class="pm-note">${escapeHtml(t(`sketch.hint.${ed.tool}`, null, t('sketch.hint.select')))}</p>`));
  }
  if (ed.tool === 'polygon') parts.push(group('polygonTool', t('pm.polygon'), field(api, 'polygonSides', ed.polygonSides, { label: t('pm.sides'), unit: 'count', glyph: 'polygonTool', min: 3, step: 1 })));
  if (ed.tool === 'sketchFillet') parts.push(group('sketchFillet', t('sketch.tool.sketchFillet'), field(api, 'filletRadius', ed.filletRadius, { label: t('pm.radius'), glyph: 'dimRadius', min: 0.001 })));
  if (ed.tool === 'sketchChamfer') parts.push(group('sketchChamfer', t('sketch.tool.sketchChamfer'), field(api, 'chamferDistance', ed.chamferDistance, { label: t('pm.distance'), min: 0.001 })));
  if (ed.tool === 'spline' && ed.pending.length > 1) parts.push(`<div class="pm-row"><button class="small-button" data-pm="finishSpline">${icon('check')}<span>${escapeHtml(t('sketch.finishSpline'))}</span></button></div>`);
  const counts = { lines: ed.sketch.entities.filter((x) => x.type === 'line').length, arcs: ed.sketch.entities.filter((x) => x.type === 'arc' || x.type === 'circle').length, relations: ed.sketch.constraints.length };
  parts.push(`<p class="pm-foot muted">${escapeHtml(t('sketch.counts', counts))}</p>`);
  return parts.join('');
}

function entityLabel(api, x) {
  const { t } = api;
  if (DIMENSIONS.includes(x.type) || (x.a && x.type)) return `${t(`rel.${x.type}`)}${x.value != null ? ` = ${api.fmt(x.value)}` : ''}`;
  return `${t(`entity.${x.type}`)}${x.construction ? ` (${t('sketch.constructionShort')})` : ''}`;
}

function entityProps(api, sel) {
  if (sel.length !== 1) return '';
  const x = sel[0];
  const ed = api.editing.editor;
  if (x.type === 'point' && !x.origin) return `<div class="pm-coords">${field(api, 'pt.x', x.x, { label: 'X', glyph: 'pointTool' })}${field(api, 'pt.y', x.y, { label: 'Y', glyph: 'pointTool' })}</div>`;
  if (x.type === 'line') { const a = byId(ed.sketch, x.p1); const b = byId(ed.sketch, x.p2); return `<p class="pm-note">${escapeHtml(api.t('pm.length'))}: ${escapeHtml(api.fmtLen(Math.hypot(b.x - a.x, b.y - a.y)))}</p>`; }
  if (x.type === 'circle') return field(api, 'circle.d', x.r * 2, { label: api.t('pm.diameter'), glyph: 'dimDiameter', min: 0.001 });
  if (x.type === 'text') return `<label class="pm-field">${icon('textTool')}<span class="pm-label">${escapeHtml(api.t('ann.text'))}</span><input type="text" class="pm-text" data-pm-field="text.value" value="${escapeHtml(x.text ?? '')}" spellcheck="false"/></label>${field(api, 'text.size', x.size ?? 10, { label: api.t('pm.textHeight'), min: 0.1 })}`;
  void geomKind; void standalonePoints;
  return '';
}

function matePm(api) {
  const { t } = api;
  const e = api.editing;
  const m = e.mate;
  const groupName = e.mateGroup ?? 'standard';
  const types = matesFor(m.a, m.b, groupName);
  const name = (ref) => (ref ? `${api.componentName(ref.comp)} · ${t(ref.kind === 'axis' ? 'pm.axisFace' : 'pm.planarFace')}` : '');
  const parts = [header(api, MATE_ICONS[m.type] ?? 'mate', `${t('pm.mate')}${e.isNew ? '' : ` — ${m.name}`}`, { help: t('pm.help.mate') })];
  const need = MATE_REFS[m.type] ?? {};
  parts.push(group('select', t('pm.mateSelections'), `${pickBox(api, 'a', m.a ? [name(m.a)] : [], t('pm.entity1'), 'part')}${pickBox(api, 'b', m.b ? [name(m.b)] : [], t('pm.entity2'), 'part')}${need.c ? pickBox(api, 'c', m.c ? [name(m.c)] : [], t(need.d ? 'pm.entity3' : 'pm.symmetryPlane'), 'part') : ''}${need.d ? pickBox(api, 'd', m.d ? [name(m.d)] : [], t('pm.entity4'), 'part') : ''}`));
  parts.push(`<div class="pm-row">${seg('mateGroup', [['standard', t('pm.standardMates'), 'mate'], ['advanced', t('pm.advancedMates'), 'mateWidth'], ['mechanical', t('pm.mechanicalMates'), 'mateGear']], groupName)}</div>`);
  if (types.length) {
    parts.push(group('mate', t(`pm.${groupName}Mates`), `<div class="pm-relations">${types.map((ty) => `<button class="small-button ${m.type === ty ? 'active' : ''}" data-pm-set="type" data-value="${ty}" title="${escapeHtml(t(`mate.${ty}`))}">${icon(MATE_ICONS[ty] ?? 'mate')}<span>${escapeHtml(t(`mate.${ty}`))}</span></button>`).join('')}</div>
      ${m.type === 'limitDistance' ? `${field(api, 'min', m.min ?? 0, { label: t('pm.minimum') })}${field(api, 'max', m.max ?? 50, { label: t('pm.maximum') })}` : ''}${m.type === 'limitAngle' ? `${field(api, 'min', m.min ?? 0, { label: t('pm.minimum'), unit: 'angle', glyph: 'dimAngle' })}${field(api, 'max', m.max ?? 90, { label: t('pm.maximum'), unit: 'angle', glyph: 'dimAngle' })}` : ''}
      ${m.type === 'gear' ? field(api, 'ratio', m.ratio ?? 1, { label: t('pm.ratio'), unit: 'number', glyph: 'mateGear' }) : ''}${m.type === 'rackPinion' ? field(api, 'radius', m.radius ?? 10, { label: t('pm.pitchRadius'), glyph: 'dimRadius' }) : ''}${m.type === 'screw' ? field(api, 'pitch', m.pitch ?? 1, { label: t('pm.pitchPerTurn') }) : ''}
      ${['gear', 'rackPinion', 'screw'].includes(m.type) ? check('reverse', m.reverse, t('pm.reverse'), 'flipV') : ''}
      ${m.type === 'distance' ? field(api, 'value', m.value ?? 0, { label: t('pm.distance') }) : ''}${m.type === 'angle' ? field(api, 'value', m.value ?? 90, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' }) : ''}
      ${['coincident', 'distance'].includes(m.type) && m.a?.kind === 'plane' && m.b?.kind === 'plane' ? `<div class="pm-row">${seg('aligned', [['anti', t('mate.antiAligned'), 'flipH'], ['aligned', t('mate.aligned'), 'flipV']], m.aligned ?? 'anti')}</div>` : ''}
      ${m.type === 'distance' ? check('flip', m.flip, t('pm.flipDimension'), 'flipV') : ''}`));
  } else if (m.a && m.b) parts.push(`<p class="pm-error">${icon('warning')}<span>${escapeHtml(t('pm.noMateForPair'))}</span></p>`);
  if (api.mateError) parts.push(`<p class="pm-error">${icon('error')}<span>${escapeHtml(t('pm.mateFails'))}</span></p>`);
  return parts.join('');
}

function insertPm(api) {
  const { t } = api;
  const parts = [header(api, 'insertComponent', t('pm.insertComponent'), { ok: false, help: t('pm.help.insert') })];
  const list = api.project.parts.map((p) => `<button class="pm-part" data-pm="insert:${escapeHtml(p.id)}" title="${escapeHtml(p.name)}">${icon('part')}<span>${escapeHtml(p.name)}</span><small>${escapeHtml(p.partNo || '')}</small></button>`).join('');
  parts.push(group('part', t('pm.partsInProject'), list || `<p class="pm-note">${escapeHtml(t('pm.noParts'))}</p>`));
  parts.push(group('samples', t('pm.fromSamples'), `<div class="pm-relations">${api.sampleParts.map((s) => `<button class="small-button" data-pm="insertSample:${escapeHtml(s.id)}" title="${escapeHtml(s.name)}">${icon(s.icon)}<span>${escapeHtml(s.name)}</span></button>`).join('')}</div>`));
  const subs = api.assemblies?.() ?? [];
  if (subs.length) parts.push(group('assembly', t('pm.subassemblies'), subs.map((a) => `<button class="pm-part" data-pm="insertSub:${escapeHtml(a.id)}" title="${escapeHtml(a.name)}">${icon('assembly')}<span>${escapeHtml(a.name)}</span><small>${escapeHtml(t('pm.componentsCount', { n: a.components.length }))}</small></button>`).join('')));
  parts.push(`<div class="pm-row"><button class="small-button" data-pm="insertStep" title="${escapeHtml(t('action.importStep'))}">${icon('stepFile')}<span>${escapeHtml(t('action.importStep'))}</span></button></div>`);
  return parts.join('');
}

function measurePm(api) {
  const { t } = api;
  const e = api.editing;
  const parts = [header(api, 'measureTool', t('pm.measure'), { ok: false, help: t('pm.help.measure') })];
  parts.push(group('select', t('pm.selections'), `<ul class="pm-list">${e.picks.map((p) => `<li>${icon(p.kind === 'edge' ? 'lineTool' : p.kind === 'face' ? 'part' : 'refPlane', 'icon tiny')}<span>${escapeHtml(p.label)}</span></li>`).join('') || `<li class="muted">${escapeHtml(t('pm.pickNow'))}</li>`}</ul><div class="pm-row"><button class="small-button" data-pm="clear:measure">${icon('trash')}<span>${escapeHtml(t('pm.clear'))}</span></button></div>`));
  if (e.result?.length) parts.push(group('measureTool', t('pm.results'), `<dl class="pm-results">${e.result.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`));
  return parts.join('');
}

/** The drawing's own settings (shown in the right panel while a drawing is open). */
export function drawingPropsHtml(api, d) {
  const { t } = api;
  const sheet = select('sheet', Object.keys(SHEETS).map((k) => [k, `${k} (${SHEETS[k][0]} × ${SHEETS[k][1]})`]), d.sheet, t('drawing.sheet'));
  const scaleSel = select('scale', [['auto', t('drawing.autoScale')], ...STANDARD_SCALES.map((s) => [String(s), scaleLabel(s)])], d.autoScale !== false ? 'auto' : String(d.scale), t('drawing.scale'));
  const proj = select('projection', [['third', t('drawing.third')], ['first', t('drawing.first')]], d.projection, t('drawing.projection'));
  const viewName = (v) => (v.kind === 'section' ? `${t('drawing.section')} ${v.label}-${v.label}` : v.kind === 'detail' ? `${t('drawing.detail')} ${v.label}` : v.type === 'custom' ? `${t('view.custom')}${v.label ? ` ${v.label}` : ''}` : t(`view.${v.type}`));
  const views = `<ul class="pm-list">${d.views.map((v) => `<li>${icon(v.kind === 'section' ? 'sectionDrawing' : v.kind === 'detail' ? 'detailView' : v.type === 'custom' ? 'auxView' : v.type === 'iso' ? 'isoView' : 'drawingView', 'icon tiny')}<span>${escapeHtml(viewName(v))}</span><button class="icon-button" data-drw="removeView:${escapeHtml(v.id)}" title="${escapeHtml(t('drawing.removeView'))}">${icon('trash', 'icon tiny')}</button></li>`).join('')}</ul>
    <div class="pm-relations">${VIEW_TYPES.filter((v) => !d.views.some((x) => x.type === v)).map((v) => `<button class="small-button" data-drw="addView:${v}" title="${escapeHtml(t('drawing.addView'))}">${icon(v === 'iso' || v === 'dimetric' ? 'isoView' : 'drawingView')}<span>${escapeHtml(t(`view.${v}`))}</span></button>`).join('')}</div>`;
  const tf = (k) => `<label class="pm-field"><span class="pm-label">${escapeHtml(t(`title.${k}`))}</span><input type="text" data-drw-title="${k}" value="${escapeHtml(d.title?.[k] ?? '')}" spellcheck="false"/></label>`;
  return `<div class="drw-props">
    ${group('sheet', t('drawing.sheetProps'), `${sheet}${scaleSel}${proj}<label class="pm-check"><input type="checkbox" data-drw-toggle="showHidden" ${d.showHidden !== false ? 'checked' : ''}/>${icon('hiddenLines')}<span>${escapeHtml(t('drawing.hiddenLines'))}</span></label><label class="pm-check"><input type="checkbox" data-drw-toggle="showDims" ${d.showDims !== false ? 'checked' : ''}/>${icon('autoDims')}<span>${escapeHtml(t('drawing.dims'))}</span></label>`)}
    ${group('drawingView', t('drawing.views'), `${views}<div class="pm-relations">${[['section:v', 'sectionDrawing', 'cmd.sectionView'], ['section:h', 'sectionDrawing', 'cmd.sectionViewH'], ['detail', 'detailView', 'cmd.detailView'], ['aux', 'auxView', 'cmd.auxView']].map(([a, g, k]) => `<button class="small-button" data-drw="${a}" title="${escapeHtml(t(k))}">${icon(g)}<span>${escapeHtml(t(k))}</span></button>`).join('')}</div>`)}
    ${group('note', t('drawing.annotations'), annotationsHtml(api, d))}
    ${d.source?.kind === 'assembly' ? group('bom', t('cmd.bom'), `<label class="pm-check"><input type="checkbox" data-drw-bom ${d.bom?.show ? 'checked' : ''}/>${icon('bom')}<span>${escapeHtml(t('drawing.showBom'))}</span></label>`) : ''}
    ${group('titleBlock', t('drawing.titleBlock'), ['partNo', 'drawnBy', 'checkedBy', 'date', 'revision', 'company'].map(tf).join(''))}
  </div>`;
}

/** The sheet's annotations, each with its own fields (notes, balloons, GD&T frames, datums, finishes). */
function annotationsHtml(api, d) {
  const { t } = api;
  const list = d.annotations ?? [];
  const input = (a, k, v, w = '') => `<input type="text" class="pm-text ${w}" data-ann="${escapeHtml(a.id)}:${k}" value="${escapeHtml(v ?? '')}" spellcheck="false"/>`;
  const rows = list.map((a) => {
    let body = '';
    if (a.kind === 'note') body = input(a, 'text', a.text);
    if (a.kind === 'balloon') body = input(a, 'item', a.item, 'short');
    if (a.kind === 'datum') body = input(a, 'letter', a.letter, 'short');
    if (a.kind === 'surface') body = `${input(a, 'ra', a.ra, 'short')}<select data-ann="${escapeHtml(a.id)}:process">${['any', 'removal', 'noRemoval'].map((k) => `<option value="${k}" ${a.process === k ? 'selected' : ''}>${escapeHtml(t(`ann.process.${k}`))}</option>`).join('')}</select>`;
    if (a.kind === 'gdt') body = `<select data-ann="${escapeHtml(a.id)}:symbol">${GDT_SYMBOLS.map((k) => `<option value="${k}" ${a.symbol === k ? 'selected' : ''}>${escapeHtml(t(`gdt.${k}`))}</option>`).join('')}</select>${input(a, 'tolerance', a.tolerance, 'short')}${input(a, 'datums', (a.datums ?? []).join(' '), 'short')}<label class="pm-check"><input type="checkbox" data-ann="${escapeHtml(a.id)}:diameter" ${a.diameter ? 'checked' : ''}/><span>⌀</span></label>`;
    return `<li class="${api.selected === a.id ? 'selected' : ''}">${icon({ note: 'note', balloon: 'balloon', gdt: 'gdt', datum: 'datum', surface: 'surfaceFinish', centermark: 'centerMark', dimension: 'smartDim' }[a.kind] ?? 'note', 'icon tiny')}<span class="ann-kind">${escapeHtml(t(`ann.${a.kind}`))}</span>${body}<button class="icon-button" data-drw="removeAnn:${escapeHtml(a.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></li>`;
  }).join('');
  return `${rows ? `<ul class="pm-list ann-list">${rows}</ul>` : `<p class="pm-note">${escapeHtml(t('drawing.noAnnotations'))}</p>`}<div class="pm-relations">${[['note', 'note'], ['balloon', 'balloon'], ['gdt', 'gdt'], ['datum', 'datum'], ['surface', 'surfaceFinish'], ['centermark', 'centerMark']].map(([k, g]) => `<button class="small-button" data-drw="place:${k}" title="${escapeHtml(t(`ann.${k}`))}">${icon(g)}<span>${escapeHtml(t(`ann.${k}`))}</span></button>`).join('')}</div>`;
}

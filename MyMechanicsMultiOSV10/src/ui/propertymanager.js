// The PropertyManager (SolidWorks' left-panel editor): the options of the feature, sketch, mate or
// drawing being edited, in group boxes, with selection boxes (pink while they take picks from the
// graphics area), and OK / Cancel at the top. HTML only — app.js binds the data-pm* attributes.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { relationsFor, standalonePoints, constructionLines, byId, geomKind, DIMENSIONS } from '../cad/sketch.js';
import { featureIcon, MATE_ICONS } from './tree.js';
import { matesFor } from '../cad/assembly.js';
import { SHEETS, VIEW_TYPES, scaleLabel, STANDARD_SCALES } from '../cad/drawing.js';

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

const group = (glyph, title, body, cls = '') => `<section class="pm-group ${cls}"><h4>${icon(glyph)}<span>${escapeHtml(title)}</span></h4><div class="pm-group-body">${body}</div></section>`;

function field(api, key, value, { label, glyph = 'smartDim', unit = 'length', min = null, step = null } = {}) {
  const shown = unit === 'length' ? api.fmtLen(value) : unit === 'angle' ? `${api.fmt(value)}°` : unit === 'count' ? String(Math.round(value)) : api.fmt(value);
  return `<label class="pm-field" title="${escapeHtml(label)}">${icon(glyph)}<span class="pm-label">${escapeHtml(label)}</span>
    <span class="pm-input" data-stepper>
      <button type="button" class="pm-step" data-pm-step="${escapeHtml(key)}" data-delta="-1" aria-label="−">−</button>
      <input type="text" data-pm-field="${escapeHtml(key)}" data-unit="${unit}" ${min != null ? `data-min="${min}"` : ''} ${step != null ? `data-step="${step}"` : ''} value="${escapeHtml(shown)}" spellcheck="false" />
      <button type="button" class="pm-step" data-pm-step="${escapeHtml(key)}" data-delta="1" aria-label="+">+</button>
    </span></label>`;
}

const check = (key, value, label, glyph = 'check') => `<label class="pm-check" title="${escapeHtml(label)}"><input type="checkbox" data-pm-toggle="${escapeHtml(key)}" ${value ? 'checked' : ''} />${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;

const seg = (key, options, current) => `<span class="segmented pm-seg" role="radiogroup">${options.map(([v, label, glyph]) => `<button type="button" class="segment ${String(v) === String(current) ? 'active' : ''}" data-pm-set="${escapeHtml(key)}" data-value="${escapeHtml(v)}" title="${escapeHtml(label)}" aria-pressed="${String(v) === String(current)}">${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`).join('')}</span>`;

const select = (key, options, current, label) => `<label class="pm-field" title="${escapeHtml(label)}"><span class="pm-label">${escapeHtml(label)}</span><select data-pm-select="${escapeHtml(key)}" aria-label="${escapeHtml(label)}">${options.map(([v, text, glyph]) => `<option value="${escapeHtml(v)}" ${glyph ? `data-icon="${glyph}"` : ''} ${String(v) === String(current) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;

/** A selection box: the picked items (removable), pink while it is the active one. */
function pickBox(api, key, items, label, glyph) {
  const active = api.editing.pick === key;
  return `<div class="pm-pick ${active ? 'active' : ''}" data-pm-pick="${escapeHtml(key)}" title="${escapeHtml(label)}" tabindex="0">
    <div class="pm-pick-head">${icon(glyph)}<span>${escapeHtml(label)}</span><span class="grow"></span><span class="pm-count">${items.length}</span>${items.length ? `<button type="button" class="icon-button" data-pm="clear:${escapeHtml(key)}" title="${escapeHtml(api.t('pm.clear'))}">${icon('trash', 'icon tiny')}</button>` : ''}</div>
    <ul class="pm-pick-list">${items.length ? items.map((it, i) => `<li title="${escapeHtml(it)}">${icon(glyph, 'icon tiny')}<span>${escapeHtml(it)}</span><button type="button" class="icon-button" data-pm-remove="${escapeHtml(key)}:${i}" aria-label="×">${icon('close', 'icon tiny')}</button></li>`).join('') : `<li class="muted">${escapeHtml(api.t(active ? 'pm.pickNow' : 'pm.clickToPick'))}</li>`}</ul>
  </div>`;
}

const axisName = (api, ref) => (!ref ? '—' : ref.kind === 'axis' ? api.t(`axis.${ref.axis}`) : ref.kind === 'edge' ? api.t('pm.edgeRef') : '—');
const planeName = (api, ref) => {
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
    parts.push(group('featSketch', t('pm.from'), `${sketchSel()}${seg('op', [['boss', t('op.boss'), 'featExtrude'], ['cut', t('op.cut'), 'featCut']], f.op)}`));
    const ends = [['blind', t('end.blind')], ['through', t('end.through')], ['throughBoth', t('end.throughBoth')], ['midplane', t('end.midplane')]];
    parts.push(group('featExtrude', t('pm.direction1'), `${select('end', ends, f.end, t('pm.endCondition'))}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}${f.end === 'blind' || f.end === 'midplane' ? field(api, 'depth', f.depth, { label: t('pm.depth'), min: 0.001 }) : ''}`));
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
    parts.push(group('featHole', t('pm.holeType'), `${seg('kind', [['simple', t('hole.simple'), 'featHole'], ['counterbore', t('hole.counterbore'), 'featHole'], ['countersink', t('hole.countersink'), 'featHole']], f.kind)}
      ${select('size', [['', t('hole.custom')], ...HOLE_SIZES.map(([s]) => [s, `${s} — ${t('hole.clearance')}`])], f.size ?? '', t('hole.size'))}
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
      parts.push(group('featCirPattern', t('pm.parameters'), `${seg('axisKind', [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['edge', t('pm.edgeRef')]], f.axis?.kind === 'edge' ? 'edge' : f.axis?.axis ?? 'y')}${f.axis?.kind === 'edge' ? pickBox(api, 'axis', [axisName(api, f.axis)], t('pm.axisEdge'), 'refAxis') : ''}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}${field(api, 'angle', f.angle, { label: t('pm.totalAngle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 })}${field(api, 'count', f.count, { label: t('pm.instances'), unit: 'count', glyph: 'featCirPattern', min: 1, step: 1 })}${check('equal', f.equal, t('pm.equalSpacing'), 'relEqual')}`));
    }
    parts.push(group('part', t('pm.featuresToPattern'), `${check('body', f.body, t('pm.patternBody'), 'part')}${f.body ? '' : pickBox(api, 'seeds', seeds, t('pm.seedFeatures'), 'featExtrude')}`));
  } else if (f.type === 'mirror') {
    const seeds = (f.seeds ?? []).map((id) => api.featureName(id) ?? id);
    parts.push(group('featMirror', t('pm.mirrorPlane'), `${seg('stdPlane', [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')]], f.plane?.kind === 'std' ? f.plane.name : '')}${pickBox(api, 'plane', [planeName(api, f.plane)], t('pm.planeOrFace'), 'refPlane')}`));
    parts.push(group('part', t('pm.featuresToMirror'), `${check('body', f.body, t('pm.mirrorBody'), 'part')}${f.body ? '' : pickBox(api, 'seeds', seeds, t('pm.seedFeatures'), 'featExtrude')}`));
  } else if (f.type === 'plane') {
    parts.push(group('refPlane', t('pm.firstReference'), `${seg('stdPlane', [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')]], f.base?.kind === 'std' ? f.base.name : '')}${pickBox(api, 'base', [planeName(api, f.base)], t('pm.planeOrFace'), 'refPlane')}${field(api, 'offset', f.offset, { label: t('pm.offset') })}${check('flip', f.flip, t('pm.flip'), 'flipV')}`));
  }
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
    const rows = sel.map((x) => `<li>${icon(x.type === 'point' ? 'pointTool' : x.type === 'line' ? (x.construction ? 'centerline' : 'lineTool') : x.type === 'circle' ? 'circleTool' : x.type === 'arc' ? 'arcTool' : relationIcon(x.type), 'icon tiny')}<span>${escapeHtml(entityLabel(api, x))}</span></li>`).join('');
    parts.push(group('select', t('pm.selected'), `<ul class="pm-list">${rows}</ul>${entityProps(api, sel)}`));
    const existing = ed.sketch.constraints.filter((c) => ids.some((id) => [c.a, c.b, c.c].includes(id)));
    if (existing.length) parts.push(group('addRelation', t('pm.existingRelations'), `<ul class="pm-list">${existing.map((c) => `<li class="${c.driven ? 'muted' : ''}">${icon(relationIcon(c.type), 'icon tiny')}<span>${escapeHtml(t(`rel.${c.type}`))}${DIMENSIONS.includes(c.type) ? ` = ${escapeHtml(c.type === 'angle' ? `${api.fmt(c.value)}°` : api.fmtLen(c.value))}` : ''}</span><button class="icon-button" data-pm="delRelation:${escapeHtml(c.id)}" title="${escapeHtml(t('pm.deleteRelation'))}">${icon('trash', 'icon tiny')}</button></li>`).join('')}</ul>`));
    if (rels.length) parts.push(group('addRelation', t('pm.addRelations'), `<div class="pm-relations">${rels.map((r) => `<button class="small-button" data-pm="relation:${r}" title="${escapeHtml(t(`rel.${r}`))}">${icon(relationIcon(r))}<span>${escapeHtml(t(`rel.${r}`))}</span></button>`).join('')}</div>`));
    if (ids.some((id) => byId(ed.sketch, id)?.type !== 'point')) parts.push(`<div class="pm-row"><button class="small-button" data-pm="construction" title="${escapeHtml(t('sketch.construction'))}">${icon('constructionToggle')}<span>${escapeHtml(t('sketch.construction'))}</span></button><button class="small-button danger" data-pm="deleteSel" title="${escapeHtml(t('action.delete'))}">${icon('trash')}<span>${escapeHtml(t('action.delete'))}</span></button></div>`);
  } else {
    parts.push(group('info', t('pm.howTo'), `<p class="pm-note">${escapeHtml(t(`sketch.hint.${ed.tool}`, null, t('sketch.hint.select')))}</p>`));
  }
  if (ed.tool === 'polygon') parts.push(group('polygonTool', t('pm.polygon'), field(api, 'polygonSides', ed.polygonSides, { label: t('pm.sides'), unit: 'count', glyph: 'polygonTool', min: 3, step: 1 })));
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
  void geomKind; void standalonePoints;
  return '';
}

function matePm(api) {
  const { t } = api;
  const e = api.editing;
  const m = e.mate;
  const types = matesFor(m.a, m.b);
  const name = (ref) => (ref ? `${api.componentName(ref.comp)} · ${t(ref.kind === 'axis' ? 'pm.axisFace' : 'pm.planarFace')}` : '');
  const parts = [header(api, MATE_ICONS[m.type] ?? 'mate', `${t('pm.mate')}${e.isNew ? '' : ` — ${m.name}`}`, { help: t('pm.help.mate') })];
  parts.push(group('select', t('pm.mateSelections'), `${pickBox(api, 'a', m.a ? [name(m.a)] : [], t('pm.entity1'), 'part')}${pickBox(api, 'b', m.b ? [name(m.b)] : [], t('pm.entity2'), 'part')}`));
  if (types.length) {
    parts.push(group('mate', t('pm.standardMates'), `<div class="pm-relations">${types.map((ty) => `<button class="small-button ${m.type === ty ? 'active' : ''}" data-pm-set="type" data-value="${ty}" title="${escapeHtml(t(`mate.${ty}`))}">${icon(MATE_ICONS[ty])}<span>${escapeHtml(t(`mate.${ty}`))}</span></button>`).join('')}</div>
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
  const views = `<ul class="pm-list">${d.views.map((v) => `<li>${icon(v.type === 'iso' ? 'isoView' : 'drawingView', 'icon tiny')}<span>${escapeHtml(t(`view.${v.type}`))}</span><button class="icon-button" data-drw="removeView:${escapeHtml(v.id)}" title="${escapeHtml(t('drawing.removeView'))}">${icon('trash', 'icon tiny')}</button></li>`).join('')}</ul>
    <div class="pm-relations">${VIEW_TYPES.filter((v) => !d.views.some((x) => x.type === v)).map((v) => `<button class="small-button" data-drw="addView:${v}" title="${escapeHtml(t('drawing.addView'))}">${icon(v === 'iso' || v === 'dimetric' ? 'isoView' : 'drawingView')}<span>${escapeHtml(t(`view.${v}`))}</span></button>`).join('')}</div>`;
  const tf = (k) => `<label class="pm-field"><span class="pm-label">${escapeHtml(t(`title.${k}`))}</span><input type="text" data-drw-title="${k}" value="${escapeHtml(d.title?.[k] ?? '')}" spellcheck="false"/></label>`;
  return `<div class="drw-props">
    ${group('sheet', t('drawing.sheetProps'), `${sheet}${scaleSel}${proj}<label class="pm-check"><input type="checkbox" data-drw-toggle="showHidden" ${d.showHidden !== false ? 'checked' : ''}/>${icon('hiddenLines')}<span>${escapeHtml(t('drawing.hiddenLines'))}</span></label><label class="pm-check"><input type="checkbox" data-drw-toggle="showDims" ${d.showDims !== false ? 'checked' : ''}/>${icon('autoDims')}<span>${escapeHtml(t('drawing.dims'))}</span></label>`)}
    ${group('drawingView', t('drawing.views'), views)}
    ${group('titleBlock', t('drawing.titleBlock'), ['partNo', 'drawnBy', 'checkedBy', 'date', 'revision', 'company'].map(tf).join(''))}
  </div>`;
}

// The extrude PropertyManager: From (start condition), Direction 1 and 2 (every end condition with its
// reference), Thin Feature and Selected Contours — the options of extrude-more.js.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { profiles } from '../cad/sketch.js';
import { group, seg, select, check, field, pickBox, planeName } from './propertymanager.js';

const note = (text) => `<p class="pm-note">${escapeHtml(text)}</p>`;
const ENDS1 = ['blind', 'through', 'throughBoth', 'midplane', 'upToNext', 'upToVertex', 'upToSurface', 'offsetFromSurface', 'upToBody'];
const ENDS2 = ['blind', 'through', 'upToNext', 'upToVertex', 'upToSurface', 'offsetFromSurface', 'upToBody'];

/** The pick-box item of a face-or-plane reference. */
export function targetItems(api, ref) {
  if (!ref) return [];
  if (ref.kind === 'std' || ref.kind === 'ref') return [api.t('pm.planeRef', { name: planeName(api, ref) })];
  const sig = ref.sig ?? ref;
  return [api.t('pm.faceRefItem', { kind: sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved') })];
}

/** The pick-box item of a stored vertex point. */
export function vertexItems(api, p) {
  return Array.isArray(p) ? [api.t('pm.vertexAt', { x: api.fmtLenBare(p[0]), y: api.fmtLenBare(p[1]), z: api.fmtLenBare(p[2]) })] : [];
}

/** The reference rows of one direction's end condition (suffix '' or '2'). */
export function endRefs(api, f, suffix) {
  const { t } = api;
  const end = suffix ? f.end2 : f.end;
  const k = (name) => `${name}${suffix}`;
  if (end === 'upToVertex') return pickBox(api, k('endVertex'), vertexItems(api, f[k('endVertex')]), t('pm.endVertex'), 'refPoint');
  if (end === 'upToSurface' || end === 'offsetFromSurface') {
    let html = pickBox(api, k('endFace'), targetItems(api, f[k('endFace')]), t('pm.endFace'), 'surface');
    if (end === 'offsetFromSurface') html += `${field(api, k('endOffset'), f[k('endOffset')] ?? 5, { label: t('pm.endOffset'), min: 0 })}${check(k('reverseOffset'), f[k('reverseOffset')], t('pm.reverseOffset'), 'flipV')}${check(k('translateSurface'), f[k('translateSurface')], t('pm.translateSurface'), 'moveBody')}`;
    return html;
  }
  if (end === 'upToBody') {
    const n = Math.max(1, api.bodyCount?.(f) ?? 1);
    return select(k('endBody'), Array.from({ length: n }, (_, i) => [String(i), t('pm.bodyN', { n: i + 1 })]), String(f[k('endBody')] ?? 0), t('pm.endBody'));
  }
  return '';
}

/** The extrude page after its sketch / operation group. */
export function extrudePm(api, f) {
  const { t } = api;
  const parts = [];
  const start = f.start ?? 'sketchPlane';
  // From: where the extrusion starts.
  let from = select('start', [['sketchPlane', t('start.sketchPlane')], ['offset', t('start.offset')], ['surface', t('start.surface')], ['vertex', t('start.vertex')]], start, t('pm.startCondition'));
  if (start === 'offset') from += `${field(api, 'startOffset', f.startOffset ?? 5, { label: t('pm.startOffset'), min: 0 })}${check('startReverse', f.startReverse, t('pm.reverse'), 'flipV')}`;
  if (start === 'surface') from += pickBox(api, 'startFace', targetItems(api, f.startFace), t('pm.startFace'), 'surface');
  if (start === 'vertex') from += pickBox(api, 'startVertex', vertexItems(api, f.startVertex), t('pm.startVertex'), 'refPoint');
  parts.push(group('refPlane', t('pm.startCondition'), from, start === 'sketchPlane' ? 'collapsed' : ''));

  // Direction 1.
  const end = f.end ?? 'blind';
  const depthOn = end === 'blind' || end === 'midplane';
  let d1 = `${select('end', ENDS1.map((v) => [v, t(`end.${v}`)]), end, t('pm.endCondition'))}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`;
  d1 += depthOn ? field(api, 'depth', f.depth, { label: t('pm.depth'), min: 0.001 }) : endRefs(api, f, '');
  if (end === 'blind' && !f.thin && start === 'sketchPlane' && !Array.isArray(f.contours)) {
    d1 += `${check('draft', f.draft, t('pm.draftOnOff'), 'featDraft')}${f.draft ? `${field(api, 'draftAngle', f.draftAngle ?? 3, { label: t('pm.draftAngle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 })}${check('draftOutward', f.draftOutward, t('pm.draftOutward'), 'flipH')}` : ''}`;
  }
  // Direction of extrusion (an edge; empty: the sketch normal) and, for a cut, the side that is removed.
  d1 += pickBox(api, 'dirVector', f.dirVector ? [t('pm.dirVectorEdge')] : [], t('pm.dirVector'), 'lineTool');
  if (f.op === 'cut') d1 += check('flipSide', f.flipSide, t('pm.flipSide'), 'flipH');
  // Sheet metal: a normal cut (square to the sheet, radial in bends) once the part has a sheet.
  if (f.op === 'cut' && (api.featuresBefore?.(f) ?? []).some((x) => ['baseFlange', 'convertSheet', 'insertBends', 'loftedBend'].includes(x.type) && !x.suppressed)) d1 += check('normalCut', f.normalCut, t('pm.normalCut'), 'sheetMetal');
  parts.push(group('featExtrude', t('pm.direction1'), d1));

  // Direction 2 (not with mid-plane / through-both, which already go both ways).
  if (end !== 'midplane' && end !== 'throughBoth') {
    const on = f.end2 && f.end2 !== 'none';
    let d2 = check('dir2', on, t('pm.direction2'), 'flipH');
    if (on) d2 += `${select('end2', ENDS2.map((v) => [v, t(`end.${v}`)]), f.end2, t('pm.endCondition'))}${f.end2 === 'blind' ? field(api, 'depth2', f.depth2, { label: t('pm.depth'), min: 0.001 }) : endRefs(api, f, '2')}`;
    parts.push(group('featExtrude', t('pm.direction2'), d2, on ? '' : 'collapsed'));
  }

  parts.push(thinGroup(api, f));
  const contours = contoursGroup(api, f);
  if (contours) parts.push(contours);
  return parts.join('');
}

/** The Thin Feature group (extrude, revolve, sweep; `caps` false: no end caps offered). */
export function thinGroup(api, f, { caps = true } = {}) {
  const { t } = api;
  let thin = check('thin', f.thin, t('pm.thinFeature'), 'featShell');
  if (f.thin) {
    const kind = f.thinKind ?? 'oneDir';
    thin += seg('thinKind', [['oneDir', t('thin.oneDir')], ['mid', t('thin.mid')], ['twoDir', t('thin.twoDir')]], kind);
    thin += field(api, 'thinT1', f.thinT1 ?? 1, { label: t('pm.thinT1'), min: 0.001 });
    if (kind === 'twoDir') thin += field(api, 'thinT2', f.thinT2 ?? f.thinT1 ?? 1, { label: t('pm.thinT2'), min: 0.001 });
    if (kind !== 'mid') thin += check('thinReverse', f.thinReverse, t('pm.reverse'), 'flipH');
    const sk = api.sketchById(f.sketch);
    if (caps && sk && profiles(sk).length) {
      thin += check('capEnds', f.capEnds, t('pm.capEnds'), 'endCap');
      if (f.capEnds) thin += field(api, 'capThickness', f.capThickness ?? f.thinT1 ?? 1, { label: t('pm.capThickness'), min: 0.001 });
    }
    thin += note(t('pm.help.thin'));
  }
  return group('featShell', t('pm.thinFeature'), thin, f.thin ? '' : 'collapsed');
}

/** The Selected Contours group (when the sketch has more than one region). */
function contoursGroup(api, f) {
  const { t } = api;
  const sk = api.sketchById(f.sketch);
  const regions = sk ? profiles(sk) : [];
  if (regions.length > 1 || Array.isArray(f.contours)) {
    const on = Array.isArray(f.contours);
    let html = check('selContours', on, t('pm.selectedContours'), 'featSketch');
    if (on) html += `<div class="pm-list">${regions.map((_, i) => check(`list:contours:${i}`, f.contours.includes(i), t('pm.contourN', { n: i + 1 }), 'featSketch')).join('')}</div>${note(t('pm.help.contours'))}`;
    return group('featSketch', t('pm.selectedContours'), html, on ? '' : 'collapsed');
  }
  void icon;
  return '';
}

const REV_ENDS1 = ['blind', 'midplane', 'upToVertex', 'upToSurface', 'offsetFromSurface'];
const REV_ENDS2 = ['blind', 'upToVertex', 'upToSurface', 'offsetFromSurface'];

/** The revolve page after its sketch / axis groups: Direction 1 and 2, Thin Feature, Selected Contours. */
export function revolvePm(api, f) {
  const { t } = api;
  const parts = [];
  const end = f.end ?? 'blind';
  const ends = (list) => list.map((v) => [v, t(`end.${v}`)]);
  let d1 = select('end', ends(REV_ENDS1), end, t('pm.endCondition')) + check('reverse', f.reverse, t('pm.reverse'), 'flipV');
  d1 += end === 'blind' || end === 'midplane' ? field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 }) : endRefs(api, f, '');
  parts.push(group('dimAngle', t('pm.direction1'), d1));
  if (end !== 'midplane') {
    const on = f.end2 && f.end2 !== 'none';
    let d2 = check('dir2', on, t('pm.direction2'), 'flipH');
    if (on) d2 += select('end2', ends(REV_ENDS2), f.end2, t('pm.endCondition')) + (f.end2 === 'blind' ? field(api, 'angle2', f.angle2 ?? 90, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 }) : endRefs(api, f, '2'));
    parts.push(group('dimAngle', t('pm.direction2'), d2, on ? '' : 'collapsed'));
  }
  parts.push(thinGroup(api, f));
  const contours = contoursGroup(api, f);
  if (contours) parts.push(contours);
  return parts.join('');
}

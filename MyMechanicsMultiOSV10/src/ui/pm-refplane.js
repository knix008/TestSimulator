// The reference plane PropertyManager: the way it is made (offset, angle, three points, parallel at a point,
// normal to a curve, mid plane, tangent, line and point) and the references each way needs.
import { group, seg, select, check, field, pickBox, planeName } from './propertymanager.js';
import { vertexItems, endRefs } from './pm-extrude.js';
import { ANSI_SIZES, METRIC_STANDARDS, ANSI_TAPS, NPT_SIZES } from '../cad/hole-more.js';

const MODES = ['offset', 'angle', 'threePoints', 'parallelAtPoint', 'normalToCurve', 'mid', 'tangent', 'linePoint'];

export function refPlanePm(api, f) {
  const { t } = api;
  const mode = f.mode ?? 'offset';
  const stdSeg = (key, ref) => seg(key, [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')]], ref?.kind === 'std' ? ref.name : '');
  const base = () => `${stdSeg('stdPlane', f.base)}${pickBox(api, 'base', [planeName(api, f.base)], t('pm.planeOrFace'), 'refPlane')}`;
  const line = () => `${seg('axisKind2', [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['edge', t('pm.edgeRef')]], f.axisRef?.kind === 'edge' ? 'edge' : f.axisRef?.axis ?? 'z')}${f.axisRef?.kind === 'edge' ? pickBox(api, 'axisRef', [t('pm.dirVectorEdge')], t('pm.lineRef'), 'lineTool') : ''}`;
  const pointBox = (label) => pickBox(api, 'point', vertexItems(api, f.point), label, 'refPoint');
  let body = select('mode', MODES.map((m) => [m, t(`plane.mode.${m}`)]), mode, t('pm.planeMode'));
  if (mode === 'offset') body += `${base()}${field(api, 'offset', f.offset, { label: t('pm.offset') })}`;
  else if (mode === 'angle') body += `${base()}${line()}${field(api, 'angle', f.angle ?? 45, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' })}`;
  else if (mode === 'threePoints') body += pickBox(api, 'points', (f.points ?? []).map((p) => vertexItems(api, p)[0]), t('pm.threePoints'), 'refPoint');
  else if (mode === 'parallelAtPoint') body += `${base()}${pointBox(t('pm.throughPoint'))}`;
  else if (mode === 'normalToCurve') body += `${pickBox(api, 'edge', f.edge ? [t('pm.curve')] : [], t('pm.curve'), 'lineTool')}${field(api, 'at', f.at ?? 0, { label: t('pm.alongCurve'), unit: 'number', min: 0 })}`;
  else if (mode === 'mid') body += `${base()}${stdSeg('stdPlane2', f.base2)}${pickBox(api, 'base2', [planeName(api, f.base2)], t('pm.secondPlane'), 'refPlane')}`;
  else if (mode === 'tangent') body += `${pickBox(api, 'face', f.face ? [t('pm.curved')] : [], t('pm.cylinderFace'), 'surface')}${pointBox(t('pm.touchPoint'))}`;
  else if (mode === 'linePoint') body += `${line()}${pointBox(t('pm.throughPoint'))}`;
  body += check('flip', f.flip, t('pm.flip'), 'flipV');
  return group('refPlane', t('pm.firstReference'), body);
}

/** The Hole Wizard's standard (ISO / ANSI inch) with its sizes and fit, the slot, and the end condition. */
export function holeMorePm(api, f) {
  const { t } = api;
  const parts = [];
  const std = f.standard ?? 'iso';
  let sp = seg('standard', [['iso', t('hole.std.iso')], ['ansiInch', t('hole.std.ansiInch')], ['din', 'DIN'], ['jis', 'JIS'], ['gb', 'GB']], std);
  if (['din', 'jis', 'gb'].includes(std) && f.kind !== 'tapped' && f.kind !== 'taperedTap') {
    sp += select('mSize', [['', t('hole.custom')], ...Object.keys(METRIC_STANDARDS[std]).map((n) => [n, n])], f.mSize ?? '', t('hole.size'));
    sp += seg('fit', [['close', t(std === 'jis' ? 'hole.fit.class1' : 'hole.fit.fine')], ['normal', t(std === 'jis' ? 'hole.fit.class2' : 'hole.fit.medium')], ['loose', t(std === 'jis' ? 'hole.fit.class3' : 'hole.fit.coarse')]], f.fit ?? 'normal');
  }
  if (std === 'ansiInch') {
    if (f.kind === 'tapped') sp += select('ansiTap', [['', t('hole.custom')], ...ANSI_TAPS.map(([n, , , d]) => [n, n + ' — ' + t('hole.tapDrill') + ' Ø' + d.toFixed(4) + '"'])], f.ansiTap ?? '', t('hole.threadSize'));
    else if (f.kind !== 'taperedTap') {
      sp += select('ansiSize', [['', t('hole.custom')], ...ANSI_SIZES.map(([n]) => [n, n])], f.ansiSize ?? '', t('hole.size'));
      sp += seg('fit', [['close', t('hole.fit.close')], ['normal', t('hole.fit.normal')], ['loose', t('hole.fit.loose')]], f.fit ?? 'normal');
    }
  }
  if (f.kind === 'taperedTap') sp += select('nptSize', [['', t('hole.custom')], ...NPT_SIZES.map(([n, , , d]) => [n, n + ' — ' + t('hole.tapDrill') + ' Ø' + d.toFixed(4) + '"'])], f.nptSize ?? '', t('hole.pipeSize'));
  parts.push(group('featHole', t('hole.standard'), sp));
  // Slot.
  let sl = check('slot', f.slot, t('hole.slot'), 'slotTool');
  if (f.slot) sl += field(api, 'slotLength', f.slotLength ?? 10, { label: t('hole.slotLength'), min: 0.001 }) + field(api, 'slotAngle', f.slotAngle ?? 0, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' });
  parts.push(group('featHole', t('hole.slot'), sl, f.slot ? '' : 'collapsed'));
  // End condition.
  const end = f.end && f.end !== 'blind' && f.end !== 'through' ? f.end : f.through ? 'through' : 'blind';
  let ec = select('holeEnd', ['blind', 'through', 'upToNext', 'upToVertex', 'upToSurface', 'offsetFromSurface'].map((v) => [v, t(`end.${v}`)]), end, t('pm.endCondition'));
  if (end === 'blind') ec += field(api, 'depth', f.depth, { label: t('pm.depth'), min: 0.1 });
  else ec += endRefs(api, { ...f, end }, '');
  parts.push(group('featExtrude', t('pm.endCondition'), ec));
  return parts.join('');
}

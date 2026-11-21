// PropertyManager pages of the features beyond extrude / revolve (sweep, loft, draft, rib, dome, helix,
// thread, wrap, surfaces, thicken, body operations, insert part, sheet metal, weldments). HTML only —
// app.js binds the data-pm* attributes like the other pages.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg, select, pickBox, planeName } from './propertymanager.js';
import { STRUCTURAL_PROFILES } from '../cad/advanced.js';

/** Metric coarse threads: [size, major diameter, pitch]. */
export const THREAD_SIZES = [['M3', 3, 0.5], ['M4', 4, 0.7], ['M5', 5, 0.8], ['M6', 6, 1], ['M8', 8, 1.25], ['M10', 10, 1.5], ['M12', 12, 1.75], ['M16', 16, 2], ['M20', 20, 2.5], ['M24', 24, 3]];

const opSeg = (t, f, glyphs = ['featExtrude', 'featCut']) => seg('op', [['boss', t('op.boss'), glyphs[0]], ['cut', t('op.cut'), glyphs[1]]], f.op);
const sketchSelect = (api, f, key = 'sketch', label = api.t('pm.sketch'), use = 'any') => select(key, [['', `— ${api.t('pm.chooseSketch')} —`], ...api.sketchList(f, use).map((s) => [s.id, s.name, 'featSketch'])], f[key] ?? '', label);
const stdPlanes = (api, key, ref) => seg(key, [['front', api.t('plane.front')], ['top', api.t('plane.top')], ['right', api.t('plane.right')]], ref?.kind === 'std' ? ref.name : '');
const faceItems = (api, list) => (list ?? []).map((sig, i) => `${api.t('pm.face')} ${i + 1} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`);
const listToggles = (api, prefix, items, chosen) => `<div class="pm-checklist">${items.length ? items.map((x) => {
  const at = chosen.indexOf(x.id);
  return `<label class="pm-check" title="${escapeHtml(x.name)}"><input type="checkbox" data-pm-toggle="${prefix}:${escapeHtml(x.id)}" ${at >= 0 ? 'checked' : ''}/>${icon(x.icon ?? 'featSketch')}<span>${escapeHtml(x.name)}${at >= 0 ? ` <b class="pm-order">${at + 1}</b>` : ''}</span></label>`;
}).join('') : `<p class="pm-note">${escapeHtml(api.t('pm.nothingToChoose'))}</p>`}</div>`;
const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;

export const ADVANCED_PM = {
  sweep(api, f) {
    const { t } = api;
    const paths = [...api.sketchList(f, 'path').map((s) => [s.id, s.name, 'featSketch']), ...api.curveList(f).map((c) => [c.id, c.name, 'helix'])];
    return [
      group('featSketch', t('pm.profileAndPath'), `${sketchSelect(api, f, 'sketch', t('pm.profile'), 'profile')}${select('path', [['', `— ${t('pm.choosePath')} —`], ...paths], f.path ?? '', t('pm.path'))}${opSeg(t, f, ['featSweep', 'featCutSweep'])}`),
      group('featSweep', t('pm.options'), `${select('transition', [['right', t('sweep.right')], ['round', t('sweep.round')], ['transformed', t('sweep.transformed')]], f.transition ?? 'right', t('pm.corners'))}${check('frenet', f.frenet, t('pm.frenet'), 'helix')}${note(t('pm.help.sweepProfile'))}`),
    ].join('');
  },
  loft(api, f) {
    const { t } = api;
    return [
      group('featLoft', t('pm.profiles'), `${listToggles(api, 'loft', api.sketchList(f, 'profile'), f.sketches ?? [])}${(f.sketches ?? []).length < 2 ? note(t('pm.loftNeedsTwo'), true) : ''}${opSeg(t, f, ['featLoft', 'featCutLoft'])}`),
      group('featLoft', t('pm.options'), check('ruled', f.ruled, t('pm.ruled'), 'lineTool')),
    ].join('');
  },
  draft(api, f, e) {
    const { t } = api;
    return [
      group('featDraft', t('pm.draftItems'), `${field(api, 'angle', f.angle, { label: t('pm.draftAngle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 })}${stdPlanes(api, 'neutralStd', f.neutral)}${pickBox(api, 'neutral', [planeName(api, f.neutral)], t('pm.neutralPlane'), 'refPlane')}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`),
      group('part', t('pm.facesToDraft'), pickBox(api, 'faces', faceItems(api, f.faces), t('pm.facesToDraft'), 'featDraft')),
    ].join('') + (e.pick === 'faces' ? '' : '');
  },
  rib(api, f) {
    const { t } = api;
    return group('featRib', t('pm.parameters'), `${sketchSelect(api, f, 'sketch', t('pm.sketch'), 'curves')}${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.01 })}${check('flip', f.flip, t('pm.flipMaterial'), 'flipV')}${note(t('pm.help.ribSketch'))}`);
  },
  dome(api, f) {
    const { t } = api;
    return group('featDome', t('pm.parameters'), `${pickBox(api, 'faces', faceItems(api, f.faces), t('pm.faceToDome'), 'featDome')}${field(api, 'height', f.height, { label: t('pm.height'), min: 0.01 })}${check('reverse', f.reverse, t('pm.reverseDome'), 'flipV')}`);
  },
  helix(api, f) {
    const { t } = api;
    return group('helix', t('pm.helixDefinition'), `${stdPlanes(api, 'stdPlane', f.plane)}${pickBox(api, 'plane', [planeName(api, f.plane)], t('pm.planeOrFace'), 'refPlane')}
      ${field(api, 'radius', f.radius, { label: t('pm.radius'), glyph: 'dimRadius', min: 0.01 })}${field(api, 'pitch', f.pitch, { label: t('pm.pitch'), min: 0.01 })}${field(api, 'turns', f.turns, { label: t('pm.turns'), unit: 'number', glyph: 'helix', min: 0.05 })}${check('lefthand', f.lefthand, t('pm.lefthand'), 'flipH')}`);
  },
  thread(api, f) {
    const { t } = api;
    const edge = f.edge ? [`${t('pm.edge')} (${t('pm.circular')})`] : [];
    return [
      group('featThread', t('pm.threadLocation'), `${pickBox(api, 'edge', edge, t('pm.circularEdge'), 'featThread')}${seg('internal', [['auto', t('thread.auto')], ['external', t('thread.external')], ['internal', t('thread.internal')]], f.internal ?? 'auto')}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`),
      group('featThread', t('pm.specification'), `${select('threadSize', [['', t('hole.custom')], ...THREAD_SIZES.map(([s, , p]) => [s, `${s} × ${p}`])], f.size ?? '', t('hole.size'))}${field(api, 'pitch', f.pitch, { label: t('pm.pitch'), min: 0.1 })}${field(api, 'length', f.length, { label: t('pm.length'), min: 0.1 })}${check('lefthand', f.lefthand, t('pm.lefthand'), 'flipH')}${check('cosmetic', f.cosmetic, t('pm.cosmeticThread'), 'hiddenLines')}`),
      group('featThread', t('thread.form'), `${select('form', [['iso', t('thread.form.iso')], ['v', t('thread.form.v')]], f.form ?? 'v', t('thread.form'))}${f.form === 'iso' && !f.cosmetic ? select('mode', [['auto', t('thread.mode.auto')], ['cosmetic', t('thread.mode.cosmetic')], ['modelled', t('thread.mode.modelled')]], f.mode ?? 'auto', t('thread.display')) : ''}${f.form === 'iso' ? `<p class="pm-note">${escapeHtml(t('thread.isoNote'))}</p>` : ''}`),
    ].join('');
  },
  wrap(api, f) {
    const { t } = api;
    return group('featWrap', t('pm.parameters'), `${seg('op', [['emboss', t('wrap.emboss'), 'featExtrude'], ['deboss', t('wrap.deboss'), 'featCut']], f.op)}${sketchSelect(api, f, 'sketch', t('pm.sketch'), 'profile')}${pickBox(api, 'face', f.face ? [`${t('pm.face')} (${f.face.type === 'PLANE' ? t('pm.planar') : t('pm.curved')})`] : [], t('pm.faceToWrap'), 'part')}${field(api, 'depth', f.depth, { label: t('pm.depth'), min: 0.01 })}${note(t('pm.help.wrapProjection'))}`);
  },
  thicken(api, f) {
    const { t } = api;
    return group('featThicken', t('pm.parameters'), `${select('surface', [['', `— ${t('pm.chooseSurface')} —`], ...api.surfaceList(f).map((s) => [s.id, s.name, 'surface'])], f.surface ?? '', t('pm.surface'))}${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.01 })}${seg('side', [['out', t('thicken.out')], ['in', t('thicken.in')], ['both', t('thicken.both')]], f.side)}${seg('op', [['boss', t('op.boss'), 'featExtrude'], ['cut', t('op.cut'), 'featCut']], f.op ?? 'boss')}`);
  },
  surfaceExtrude(api, f) {
    const { t } = api;
    return group('surface', t('pm.parameters'), `${sketchSelect(api, f, 'sketch', t('pm.sketch'), 'curves')}${field(api, 'depth', f.depth, { label: t('pm.depth'), min: 0.01 })}${check('midplane', f.midplane, t('end.midplane'), 'flipH')}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`);
  },
  surfaceRevolve(api, f) {
    const { t } = api;
    const sk = api.sketchById(f.sketch);
    const axes = sk ? sk.entities.filter((x) => x.type === 'line' && x.construction) : [];
    return group('surface', t('pm.parameters'), `${sketchSelect(api, f, 'sketch', t('pm.sketch'), 'curves')}${select('axis', [['', t('pm.firstCenterline')], ...axes.map((l, i) => [l.id, `${t('pm.centerline')} ${i + 1}`, 'centerline'])], f.axis ?? '', t('pm.axisOfRevolution'))}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 })}`);
  },
  surfacePlanar(api, f) {
    return group('surface', api.t('pm.parameters'), sketchSelect(api, f, 'sketch', api.t('pm.boundary'), 'profile'));
  },
  surfaceLoft(api, f) {
    const { t } = api;
    return group('surface', t('pm.profiles'), `${listToggles(api, 'loft', api.sketchList(f, 'profile'), f.sketches ?? [])}${check('ruled', f.ruled, t('pm.ruled'), 'lineTool')}`);
  },
  surfaceOffset(api, f) {
    const { t } = api;
    return group('surface', t('pm.parameters'), `${pickBox(api, 'faces', faceItems(api, f.faces), t('pm.facesToOffset'), 'surface')}${field(api, 'distance', f.distance, { label: t('pm.distance') })}`);
  },
  knit(api, f) {
    const { t } = api;
    return group('surface', t('pm.surfacesToKnit'), `${listToggles(api, 'surf', api.surfaceList(f).map((s) => ({ ...s, icon: 'surface' })), f.surfaces ?? [])}${check('solid', f.solid, t('pm.tryFormSolid'), 'part')}`);
  },
  moveBody(api, f) {
    const { t } = api;
    return [
      group('position', t('pm.translate'), `${field(api, 'dx', f.dx, { label: 'ΔX', glyph: 'position' })}${field(api, 'dy', f.dy, { label: 'ΔY', glyph: 'position' })}${field(api, 'dz', f.dz, { label: 'ΔZ', glyph: 'position' })}`),
      group('rotateRight', t('pm.rotate'), `${seg('axis', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], f.axis ?? 'z')}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' })}`),
      group('part', t('pm.options'), check('copy', f.copy, t('pm.copyBody'), 'featLinPattern')),
    ].join('');
  },
  scaleBody(api, f) {
    const { t } = api;
    return group('scaleBody', t('pm.parameters'), `${field(api, 'factor', f.factor, { label: t('pm.scaleFactor'), unit: 'number', glyph: 'scaleBody', min: 0.0001 })}${seg('about', [['origin', t('scale.origin')], ['centroid', t('scale.centroid')]], f.about)}${note(t('pm.help.shrinkage'))}`);
  },
  split(api, f) {
    const { t } = api;
    return group('split', t('pm.trimTools'), `${stdPlanes(api, 'stdPlane', f.plane)}${pickBox(api, 'plane', [planeName(api, f.plane)], t('pm.planeOrFace'), 'refPlane')}${seg('keep', [['above', t('split.above')], ['below', t('split.below')], ['both', t('split.both')]], f.keep)}`);
  },
  insertPart(api, f) {
    const { t } = api;
    return [
      group('part', t('pm.partToInsert'), `${select('part', [['', `— ${t('pm.choosePart')} —`], ...api.otherParts().map((p) => [p.id, p.name, 'part'])], f.part ?? '', t('pm.part'))}${seg('op', [['boss', t('op.boss'), 'featExtrude'], ['cut', t('op.cavity'), 'featCut'], ['common', t('op.common'), 'featIntersect']], f.op)}`),
      group('position', t('pm.locate'), `${field(api, 'dx', f.dx, { label: 'ΔX', glyph: 'position' })}${field(api, 'dy', f.dy, { label: 'ΔY', glyph: 'position' })}${field(api, 'dz', f.dz, { label: 'ΔZ', glyph: 'position' })}${seg('axis', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], f.axis ?? 'z')}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' })}${field(api, 'scale', f.scale, { label: t('pm.scaleFactor'), unit: 'number', glyph: 'scaleBody', min: 0.0001 })}`),
    ].join('');
  },
  baseFlange(api, f) {
    const { t } = api;
    return [
      group('sheetMetal', t('pm.sheetMetal'), `${sketchSelect(api, f, 'sketch', t('pm.sketch'), 'profile')}${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.05 })}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`),
      group('edgeFlange', t('pm.bendAllowance'), `${field(api, 'radius', f.radius, { label: t('pm.bendRadius'), glyph: 'dimRadius', min: 0 })}${field(api, 'kFactor', f.kFactor, { label: t('pm.kFactor'), unit: 'number', glyph: 'smartDim', min: 0 })}`),
    ].join('');
  },
  edgeFlange(api, f) {
    const { t } = api;
    const edge = f.edge ? [`${t('pm.edge')} (${t('pm.straight')})`] : [];
    return group('edgeFlange', t('pm.flangeParameters'), `${pickBox(api, 'edge', edge, t('pm.edge'), 'edgeFlange')}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 1 })}${field(api, 'length', f.length, { label: t('pm.flangeLength'), min: 0 })}${field(api, 'radius', f.radius ?? 0, { label: t('pm.bendRadiusOverride'), glyph: 'dimRadius', min: 0 })}${check('flip', f.flip, t('pm.flipBend'), 'flipV')}`);
  },
  structural(api, f) {
    const { t } = api;
    return group('structural', t('pm.selections'), `${select('profile', Object.keys(STRUCTURAL_PROFILES).map((k) => [k, t(`profile.${k}`)]), f.profile, t('pm.profileType'))}${field(api, 'w', f.w, { label: t('pm.width'), min: 0.5 })}${['rectTube', 'angle', 'channel', 'ibeam', 'tee'].includes(f.profile) ? field(api, 'h', f.h, { label: t('pm.height'), min: 0.5 }) : ''}${['roundBar', 'squareBar'].includes(f.profile) ? '' : field(api, 't', f.t, { label: t('pm.wallThickness'), min: 0.1 })}${field(api, 'rotate', f.rotate, { label: t('pm.rotateProfile'), unit: 'angle', glyph: 'dimAngle' })}${sketchSelect(api, f, 'sketch', t('pm.pathSegments'), 'curves')}`);
  },
  fillSurface(api, f) {
    const { t } = api;
    const items = (f.edges ?? []).map((sig, i) => `${t('pm.edge')} ${i + 1}`);
    const curves = [...api.sketchList(f, 'path').map((x) => [x.id, x.name, 'featSketch']), ...api.curveList(f).map((x) => [x.id, x.name, 'sketch3d'])];
    return group('surfaceFill', t('pm.patchBoundary'), `${pickBox(api, 'edges', items, t('pm.boundaryEdges'), 'lineTool')}${select('curve', [['', `— ${t('pm.orCurve')} —`], ...curves], f.curve ?? '', t('pm.boundaryCurve'))}${note(t('pm.help.fillSurface'))}`);
  },
  boundary(api, f) {
    const { t } = api;
    const list = [...api.sketchList(f, 'path'), ...api.curveList(f).map((x) => ({ ...x, icon: 'sketch3d' }))];
    return group('boundarySurface', t('pm.curves'), `${listToggles(api, 'curv', list, f.curves ?? [])}${(f.curves ?? []).length < 2 ? note(t('pm.loftNeedsTwo'), true) : ''}${note(t('pm.help.boundary'))}`);
  },
  trimSurface(api, f) {
    const { t } = api;
    const surfaces = api.surfaceList(f).map((x) => [x.id, x.name, 'surface']);
    return [
      group('surfaceTrim', t('pm.surfaceToTrim'), select('surface', [['', `— ${t('pm.chooseSurface')} —`], ...surfaces], f.surface ?? '', t('pm.surface'))),
      group('surfaceTrim', t('pm.trimTools'), `${select('tool', [['', t('pm.useAPlane')], ...surfaces.filter(([id]) => id !== f.surface)], f.tool ?? '', t('pm.trimTool'))}${f.tool ? '' : `${stdPlanes(api, 'stdPlane', f.plane)}${pickBox(api, 'plane', [planeName(api, f.plane)], t('pm.planeOrFace'), 'refPlane')}`}${seg('keep', [['above', t('split.above')], ['below', t('split.below')]], f.keep)}`),
    ].join('');
  },
  hem(api, f) {
    const { t } = api;
    const edge = f.edge ? [`${t('pm.edge')} (${t('pm.straight')})`] : [];
    return group('hem', t('pm.hemParameters'), `${pickBox(api, 'edge', edge, t('pm.edge'), 'hem')}${seg('kind', [['closed', t('hem.closed')], ['open', t('hem.open')]], f.kind)}${f.kind === 'open' ? field(api, 'gap', f.gap, { label: t('pm.gap'), min: 0.02 }) : ''}${field(api, 'length', f.length, { label: t('pm.length'), min: 0.1 })}${check('flip', f.flip, t('pm.flipBend'), 'flipV')}`);
  },
  sketchedBend(api, f) {
    const { t } = api;
    return group('sketchedBend', t('pm.bendParameters'), `${sketchSelect(api, f, 'sketch', t('pm.bendLine'), 'path')}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 1 })}${field(api, 'radius', f.radius ?? 0, { label: t('pm.bendRadiusOverride'), glyph: 'dimRadius', min: 0 })}${check('flip', f.flip, t('pm.otherSideMoves'), 'flipH')}${check('down', f.down, t('pm.bendDown'), 'flipV')}`);
  },
  jog(api, f) {
    const { t } = api;
    return group('jog', t('pm.jogParameters'), `${sketchSelect(api, f, 'sketch', t('pm.jogLine'), 'path')}${field(api, 'height', f.height, { label: t('pm.jogOffset'), min: 0.1 })}${check('flip', f.flip, t('pm.otherSideMoves'), 'flipH')}${check('down', f.down, t('pm.bendDown'), 'flipV')}`);
  },
  partingLine(api, f) {
    const { t } = api;
    return group('partingLine', t('pm.moldParameters'), `${seg('dir', [['x', '+X'], ['-x', '−X'], ['y', '+Y'], ['-y', '−Y'], ['z', '+Z'], ['-z', '−Z']], f.dir ?? 'z')}${note(t('pm.help.partingLine'))}`);
  },
  toolingSplit(api, f) {
    const { t } = api;
    return [
      group('toolingSplit', t('pm.toolingBlock'), `${seg('dir', [['x', '+X'], ['-x', '−X'], ['y', '+Y'], ['-y', '−Y'], ['z', '+Z'], ['-z', '−Z']], f.dir ?? 'z')}${field(api, 'margin', f.margin, { label: t('pm.blockMargin'), min: 1 })}${field(api, 'gap', f.gap, { label: t('pm.separation'), min: 0 })}`),
      group('toolingSplit', t('pm.partingPlane'), `${check('auto', f.auto !== false, t('pm.fromPartingLine'), 'partingLine')}${f.auto === false ? field(api, 'height', f.height ?? 0, { label: t('pm.planeHeight') }) : ''}${seg('show', [['both', t('mold.both')], ['core', t('mold.core')], ['cavity', t('mold.cavity')]], f.show ?? 'both')}${check('keepPart', f.keepPart, t('pm.showPart'), 'part')}`),
    ].join('');
  },
  sketch3d(api, f, e) {
    const { t } = api;
    const rows = (f.points ?? []).map((p, i) => `<div class="pt3-row"><b>${i + 1}</b>${['x', 'y', 'z'].map((axis, j) => `<input type="text" class="pm-text" data-pm-field="pt3:${i}:${j}" data-num value="${escapeHtml(api.fmtLenBare(p[j]))}" title="${axis.toUpperCase()}" spellcheck="false"/>`).join('')}<button class="icon-button" data-pm="delPt3:${i}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
    return [
      group('sketch3d', t('pm.points3d'), `<div class="pt3-table"><div class="pt3-row head"><b>#</b><span>X</span><span>Y</span><span>Z</span><span></span></div>${rows}</div><div class="pm-row"><button class="small-button" data-pm="addPt3">${icon('plus')}<span>${escapeHtml(t('pm.addPoint'))}</span></button></div>`),
      group('refPlane', t('pm.clickPlane'), `${seg('drawPlane', [['front', `${t('plane.front')} (XZ)`], ['top', `${t('plane.top')} (XY)`], ['right', `${t('plane.right')} (YZ)`]], e.drawPlane ?? 'top')}${pickBox(api, 'points3d', [], t('pm.clickToAddPoints'), 'pointTool')}${note(t('pm.help.sketch3d'))}`),
      group('splineTool', t('pm.options'), `${check('spline', f.spline, t('pm.smoothSpline'), 'splineTool')}${check('closed', f.closed, t('pm.closedLoop'), 'refresh')}`),
    ].join('');
  },
};

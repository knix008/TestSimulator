// PropertyManager pages of the features beyond extrude / revolve (sweep, loft, draft, rib, dome, helix,
// thread, wrap, surfaces, thicken, body operations, insert part, sheet metal, weldments). HTML only —
// app.js binds the data-pm* attributes like the other pages.
import { thinGroup } from './pm-extrude.js';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg, select, pickBox, planeName } from './propertymanager.js';
import { STRUCTURAL_PROFILES } from '../cad/advanced.js';
import { profiles } from '../cad/sketch.js';
import { rowTable } from './pm-sheet-gauge.js';
import { gaugeGroups, thicknessField } from './pm-sheet-gauge.js';

/** Metric coarse threads: [size, major diameter, pitch]. */
/** A 3D sketch's relations and dimensions: pick segments / points, add, edit values, delete; freedoms left. */
function relations3dGroup(api, f, e) {
  const { t } = api;
  const n = f.points?.length ?? 0; const segs = f.closed && n > 2 ? n : Math.max(0, n - 1);
  const sel = e.s3sel ?? { segs: [], pts: [] };
  // Picking what a relation applies to (a selection of the page, not a setting of the feature): buttons.
  const chip = (kind, i, on) => `<button type="button" class="pm-chip ${on ? 'on' : ''}" data-pm="s3sel:${kind === 's3seg' ? 'seg' : 'pt'}.${i}" aria-pressed="${on ? 'true' : 'false'}">${icon(kind === 's3seg' ? 'lineTool' : 'pointTool', 'icon tiny')}<span>${kind === 's3seg' ? `${i + 1}–${(i + 1) % n + 1}` : i + 1}</span></button>`;
  const chips = `<div class="pm-chips"><span class="pm-label">${escapeHtml(t('s3.segments'))}</span>${Array.from({ length: segs }, (_, i) => chip('s3seg', i, sel.segs.includes(i))).join('')}</div><div class="pm-chips"><span class="pm-label">${escapeHtml(t('s3.points'))}</span>${Array.from({ length: n }, (_, i) => chip('s3pt', i, sel.pts.includes(i))).join('')}</div>`;
  const types = [['alongX', 'axisX'], ['alongY', 'axisY'], ['alongZ', 'axisZ'], ['parallelXY', 'planeTop'], ['parallelYZ', 'planeRight'], ['parallelZX', 'planeFront'], ['parallel', 'relParallel'], ['perpendicular', 'relPerpendicular'], ['equal', 'relEqual'], ['fix', 'relFix'], ['coincident', 'relCoincident'], ['length', 'dimDistance'], ['distance', 'dimDistance'], ['angle', 'dimAngle'], ['pointX', 'dimDistance'], ['pointY', 'dimDistance'], ['pointZ', 'dimDistance']];
  const fits = (ty) => { const want = { alongX: ['seg', 1], alongY: ['seg', 1], alongZ: ['seg', 1], parallelXY: ['seg', 1], parallelYZ: ['seg', 1], parallelZX: ['seg', 1], parallel: ['seg', 2], perpendicular: ['seg', 2], equal: ['seg', 2], fix: ['pt', 1], coincident: ['pt', 2], length: ['seg', 1], distance: ['pt', 2], angle: ['seg', 2], pointX: ['pt', 1], pointY: ['pt', 1], pointZ: ['pt', 1] }[ty]; return (want[0] === 'seg' ? sel.segs.length === want[1] && !sel.pts.length : sel.pts.length === want[1] && !sel.segs.length); };
  const avail = types.filter(([ty]) => fits(ty));
  const btns = avail.length ? `<div class="pm-relations">${avail.map(([ty, g]) => `<button class="small-button" data-pm="rel3:${ty}" title="${escapeHtml(t(`s3.rel.${ty}`))}">${icon(g)}<span>${escapeHtml(t(`s3.rel.${ty}`))}</span></button>`).join('')}</div>` : `<p class="pm-note">${escapeHtml(t('s3.help'))}</p>`;
  const rels = (f.relations3d ?? []).map((r) => {
    const what = ['fix', 'coincident', 'distance', 'pointX', 'pointY', 'pointZ'].includes(r.type) ? [r.a, r.b].filter((x) => x !== undefined).map((x) => x + 1).join(', ') : [r.a, r.b].filter((x) => x !== undefined).map((x) => `${x + 1}–${(x + 1) % n + 1}`).join(', ');
    const dim = r.value !== undefined;
    const val = dim ? `<input type="text" class="pm-text short num" data-pm-field="r3:${escapeHtml(r.id)}" data-num value="${escapeHtml(r.type === 'angle' ? api.fmt(r.value) : api.fmtLenBare(r.value))}" ${r.driven ? 'readonly' : ''} spellcheck="false"/><button class="icon-button ${r.driven ? 'active' : ''}" data-pm="drivenRel3:${escapeHtml(r.id)}" title="${escapeHtml(t('skd.makeDriven'))}">${icon('dimDriven', 'icon tiny')}</button>` : '';
    return `<li class="${r.driven ? 'muted' : ''}"><span>${escapeHtml(t(`s3.rel.${r.type}`))} (${escapeHtml(what)})</span><span class="grow"></span>${val}<button class="icon-button" data-pm="delRel3:${escapeHtml(r.id)}" title="${escapeHtml(t('pm.deleteRelation'))}">${icon('trash', 'icon tiny')}</button></li>`;
  }).join('');
  const dof = f.dof3 ?? null;
  return group('addRelation', t('s3.title'), `${chips}${btns}${rels ? `<ul class="pm-list">${rels}</ul>` : ''}${dof != null && f.relations3d?.length ? `<p class="pm-note">${escapeHtml(t(dof === 0 ? 's3.defined' : 's3.dof', { dof }))}</p>` : ''}`);
}

export const THREAD_SIZES = [['M3', 3, 0.5], ['M4', 4, 0.7], ['M5', 5, 0.8], ['M6', 6, 1], ['M8', 8, 1.25], ['M10', 10, 1.5], ['M12', 12, 1.75], ['M16', 16, 2], ['M20', 20, 2.5], ['M24', 24, 3]];

const opSeg = (t, f, glyphs = ['featExtrude', 'featCut']) => seg('op', [['boss', t('op.boss'), glyphs[0]], ['cut', t('op.cut'), glyphs[1]]], f.op);
const sketchSelect = (api, f, key = 'sketch', label = api.t('pm.sketch'), use = 'any') => select(key, [['', `— ${api.t('pm.chooseSketch')} —`], ...api.sketchList(f, use).map((s) => [s.id, s.name, 'featSketch'])], f[key] ?? '', label);
const stdPlanes = (api, key, ref) => seg(key, [['front', api.t('plane.front')], ['top', api.t('plane.top')], ['right', api.t('plane.right')]], ref?.kind === 'std' ? ref.name : '');
const faceItems = (api, list) => (list ?? []).map((sig, i) => `${api.t('pm.face')} ${i + 1} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`);
const listToggles = (api, prefix, items, chosen) => `<div class="pm-checklist">${items.length ? items.map((x) => {
  const at = chosen.indexOf(x.id);
  return `<label class="pm-check" title="${escapeHtml(x.name)}"><input type="checkbox" data-pm-toggle="${prefix}:${escapeHtml(x.id)}" ${at >= 0 ? 'checked' : ''}/>${icon(x.icon ?? 'featSketch')}<span>${escapeHtml(x.name)}${at >= 0 ? ` <b class="pm-order">${at + 1}</b>` : ''}</span></label>`;
}).join('') : `<p class="pm-note">${escapeHtml(api.t('pm.nothingToChoose'))}</p>`}</div>`;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;

/** Loft connectors: each profile's start vertex (V1 …) and direction; automatic pairs them by the nearest turn. */
function loftConnectors(api, f) {
  const { t } = api;
  const all = api.featuresBefore?.(f) ?? [];
  const rows = (f.sketches ?? []).map((id) => {
    const sk = all.find((x) => x.id === id);
    let n = 0; try { n = profiles(sk)[0]?.outer?.segs?.length ?? 0; } catch { n = 0; }
    if (!sk || n < 2) return '';
    const c = f.connect?.[id] ?? {};
    const opts = [['', t('loft.auto')], ...Array.from({ length: n }, (_, i) => [String(i), `V${i + 1}`])];
    return `${select(`lc:${id}`, opts, Number.isInteger(c.start) ? String(c.start) : '', sk.name)}${check(`lf:${id}`, Boolean(c.flip), `${sk.name} — ${t('loft.flip')}`, 'flipH')}`;
  }).join('');
  return rows ? group('featLoft', t('loft.connectors'), `${rows}${note(t('loft.help.connectors'))}`, f.connect && Object.keys(f.connect).length ? '' : 'collapsed') : '';
}

/** Loft guide curves (check boxes), centre line, start / end constraints. */
function loftCurves(api, f) {
  const { t } = api;
  const curves = [...api.sketchList(f, 'path').map((x) => [x.id, x.name]), ...api.curveList(f).map((x) => [x.id, x.name])].filter(([id]) => !(f.sketches ?? []).includes(id));
  const guides = new Set(f.guides ?? []);
  let html = curves.length ? '<div class="pm-list">' + curves.map(([id, name]) => check('list:guides:' + id, guides.has(id), name, 'featLoft')).join('') + '</div>' : note(t('pm.noCurves'));
  html += select('centerline', [['', '— ' + t('pm.none') + ' —'], ...curves], f.centerline ?? '', t('pm.centerline'));
  const conds = [['none', t('loft.none')], ['normal', t('loft.normal')], ['tangentFace', t('loft.tangentFace')], ['curvatureFace', t('loft.curvatureFace')]];
  const withLength = (c) => c && c !== 'none';
  html += select('startCond', conds, f.startCond ?? 'none', t('pm.startConstraint'));
  if (withLength(f.startCond)) html += field(api, 'startLength', f.startLength ?? 1, { label: t('pm.tangentLength'), unit: 'number', min: 0.05 });
  html += select('endCond', conds, f.endCond ?? 'none', t('pm.endConstraint'));
  if (withLength(f.endCond)) html += field(api, 'endLength', f.endLength ?? 1, { label: t('pm.tangentLength'), unit: 'number', min: 0.05 });
  return group('featLoft', t('pm.guideCurves'), html, guides.size || f.centerline || (f.startCond ?? 'none') !== 'none' || (f.endCond ?? 'none') !== 'none' ? '' : 'collapsed');
}

/** The sweep options a surface sweep shares with the solid one: circular profile, twist, start tangency, guide curves. */
export function sweepMoreGroups(api, f, paths) {
  const { t } = api;
  return [
    group('featSweep', t('pm.profileAndPath'), `${check('circular', f.circular, t('pm.circularProfile'), 'circleTool')}${f.circular ? field(api, 'diameter', f.diameter ?? 5, { label: t('hole.diameter'), glyph: 'dimDiameter', min: 0.001 }) : ''}`, f.circular ? '' : 'collapsed'),
    group('helix', t('pm.twistAlongPath'), `${field(api, 'twist', f.twist ?? 0, { label: t('pm.twist'), unit: f.twistUnit === 'turns' ? 'number' : 'angle', glyph: 'dimAngle' })}${seg('twistUnit', [['deg', t('pm.degrees')], ['turns', t('pm.turns')]], f.twistUnit ?? 'deg')}`, f.twist ? '' : 'collapsed'),
    group('featSweep', t('sweep.tangency'), seg('startTangent', [['none', t('sweep.tan.none'), 'close'], ['path', t('sweep.tan.path'), 'relTangent']], f.startTangent ?? 'none')),
    group('featSweep', t('pm.guideCurves'), `${select('guide', [['', `— ${t('pm.none')} —`], ...paths.filter(([id]) => id !== f.path)], f.guide ?? '', t('pm.guideCurve'))}${f.guide ? `<div class="pm-checks">${paths.filter(([id]) => id !== f.path && id !== f.guide).map(([id, name, g]) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="sg:${escapeHtml(id)}" ${(f.guides ?? []).includes(id) ? 'checked' : ''}/>${icon(g)}<span>${escapeHtml(name)}</span></label>`).join('')}</div><p class="pm-note">${escapeHtml(t((f.guides ?? []).length ? 'sweep.help.guides' : 'sweep.help.guide'))}</p>` : ''}`, f.guide ? '' : 'collapsed'),
  ].join('');
}

export const ADVANCED_PM = {
  sweep(api, f) {
    const { t } = api;
    const paths = [...api.sketchList(f, 'path').map((s) => [s.id, s.name, 'featSketch']), ...api.curveList(f).map((c) => [c.id, c.name, 'helix'])];
    return [
      group('featSketch', t('pm.profileAndPath'), `${sketchSelect(api, f, 'sketch', t('pm.profile'), 'profile')}${select('path', [['', `— ${t('pm.choosePath')} —`], ...paths], f.path ?? '', t('pm.path'))}${opSeg(t, f, ['featSweep', 'featCutSweep'])}`),
      group('featSweep', t('pm.options'), `${select('transition', [['right', t('sweep.right')], ['round', t('sweep.round')], ['transformed', t('sweep.transformed')]], f.transition ?? 'right', t('pm.corners'))}${check('frenet', f.frenet, t('pm.frenet'), 'helix')}${note(t('pm.help.sweepProfile'))}`),
      sweepMoreGroups(api, f, paths),
      // Solid sweep: a revolved tool body (a cutter) moved along the path with its axis held.
      group('featCutSweep', t('sweep.solid'), `${select('solidTool', [['', `— ${t('pm.none')} —`], ...(api.featuresBefore?.(f) ?? []).filter((x) => ['revolve', 'extrude'].includes(x.type) && !x.suppressed).map((x) => [x.id, x.name, x.type === 'revolve' ? 'featRevolve' : 'featExtrude'])], f.solidTool ?? '', t('sweep.toolBody'))}<p class="pm-note">${escapeHtml(t('sweep.help.solid'))}</p>`, f.solidTool ? '' : 'collapsed'),
      thinGroup(api, f, { caps: false }),
    ].join('');
  },
  loft(api, f) {
    const { t } = api;
    return [
      group('featLoft', t('pm.profiles'), `${listToggles(api, 'loft', api.sketchList(f, 'profile'), f.sketches ?? [])}${(f.sketches ?? []).length < 2 ? note(t('pm.loftNeedsTwo'), true) : ''}${opSeg(t, f, ['featLoft', 'featCutLoft'])}`),
      group('featLoft', t('pm.options'), check('ruled', f.ruled, t('pm.ruled'), 'lineTool') + check('closed', f.closed, t('pm.closedLoft'), 'featLoft')),
      loftCurves(api, f),
      loftConnectors(api, f),
      thinGroup(api, f, { caps: false }),
    ].join('');
  },
  draft(api, f, e) {
    const { t } = api;
    const kind = f.kind ?? 'neutral';
    const parts = [];
    let head = select('kind', [['neutral', t('draft.neutral')], ['partingLine', t('draft.partingLine')], ['step', t('draft.step')]], kind, t('pm.draftType'));
    head += field(api, 'angle', f.angle, { label: t('pm.draftAngle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 });
    if (kind === 'neutral') head += stdPlanes(api, 'neutralStd', f.neutral) + pickBox(api, 'neutral', [planeName(api, f.neutral)], t('pm.neutralPlane'), 'refPlane');
    else {
      head += seg('pullAxis', [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['edge', t('pm.edgeRef')]], f.pull?.kind === 'edge' ? 'edge' : f.pull?.axis ?? 'z');
      if (f.pull?.kind === 'edge') head += pickBox(api, 'pullEdge', [t('pm.dirVectorEdge')], t('pm.pullDirection'), 'lineTool');
    }
    head += check('reverse', f.reverse, t('pm.reverse'), 'flipV');
    parts.push(group('featDraft', t('pm.draftItems'), head));
    if (kind === 'neutral') parts.push(group('part', t('pm.facesToDraft'), pickBox(api, 'faces', faceItems(api, f.faces), t('pm.facesToDraft'), 'featDraft')));
    else {
      const edges = (f.partingEdges ?? []).map((sig, i) => t('pm.edge') + ' ' + (i + 1));
      parts.push(group('featDraft', t('pm.partingLines'), pickBox(api, 'partingEdges', edges, t('pm.partingLines'), 'partingLine') + check('otherFace', f.otherFace, t('pm.otherFace'), 'flipH')));
    }
    // Face angles: a different angle on some of the faces.
    const faces = kind === 'neutral' ? (f.faces ?? []) : [];
    if (faces.length) {
      let fa = check('faceAngles', Array.isArray(f.angles), t('pm.faceAngles'), 'dimAngle');
      if (Array.isArray(f.angles)) fa += faces.map((sig, i) => { const own = f.angles.find((x) => Math.hypot(...x.sig.center.map((v, k) => v - sig.center[k])) < 1e-6); return field(api, 'fa:' + i, own ? own.angle : f.angle, { label: t('pm.face') + ' ' + (i + 1), unit: 'angle', glyph: 'dimAngle', min: 0.1 }); }).join('');
      parts.push(group('dimAngle', t('pm.faceAngles'), fa, Array.isArray(f.angles) ? '' : 'collapsed'));
    }
    return parts.join('') + (e.pick === 'faces' ? '' : '');
  },
  rib(api, f) {
    const { t } = api;
    let p = sketchSelect(api, f, 'sketch', t('pm.sketch'), 'curves');
    p += seg('side', [['first', t('rib.first')], ['both', t('rib.both')], ['second', t('rib.second')]], f.side ?? 'both');
    p += field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.01 });
    p += seg('direction', [['parallel', t('rib.parallel')], ['normal', t('rib.normal')]], f.direction ?? 'parallel');
    p += check('flip', f.flip, t('pm.flipMaterial'), 'flipV');
    p += seg('extension', [['none', t('rib.extNone')], ['linear', t('rib.extLinear')]], f.extension ?? 'none');
    if (f.direction === 'normal') p += field(api, 'draft', f.draft ?? 0, { label: t('pm.draftAngle'), unit: 'angle', glyph: 'dimAngle', min: 0 });
    p += note(t('pm.help.ribSketch'));
    return group('featRib', t('pm.parameters'), p);
  },
  dome(api, f) {
    const { t } = api;
    return group('featDome', t('pm.parameters'), `${pickBox(api, 'faces', faceItems(api, f.faces), t('pm.faceToDome'), 'featDome')}${seg('shape', [['spherical', t('dome.spherical')], ['elliptical', t('dome.elliptical')], ['continuous', t('dome.continuous')]], f.shape ?? 'spherical')}${field(api, 'height', f.height, { label: t('pm.height'), min: 0.01 })}${check('reverse', f.reverse, t('pm.reverseDome'), 'flipV')}`) + group('featDome', t('dome.direction'), `${seg('dir1', [['normal', t('dome.normal'), 'refAxis'], ['x', 'X', 'axisX'], ['y', 'Y', 'axisY'], ['z', 'Z', 'axisZ'], ['edge', t('pm.edge'), 'lineTool']], !f.direction ? 'normal' : f.direction.kind === 'edge' ? 'edge' : f.direction.axis ?? 'normal')}${f.direction?.kind === 'edge' ? pickBox(api, 'direction', f.direction.sig ? [t('pm.edge')] : [], t('pm.directionEdge'), 'lineTool') : ''}<p class="pm-note">${escapeHtml(t('dome.dirHelp'))}</p>`);
  },
  helix(api, f) {
    const { t } = api;
    const kind = f.kind ?? 'helix';
    const rows = f.variable ?? [];
    let def = `${stdPlanes(api, 'stdPlane', f.plane)}${pickBox(api, 'plane', [planeName(api, f.plane)], t('pm.planeOrFace'), 'refPlane')}${seg('kind', [['helix', t('helix.helix'), 'helix'], ['spiral', t('helix.spiral'), 'helix']], kind)}`;
    if (!rows.length) def += field(api, 'radius', f.radius, { label: t('pm.radius'), glyph: 'dimRadius', min: 0.01 });
    if (!rows.length) def += field(api, 'pitch', f.pitch, { label: kind === 'spiral' ? t('pm.spiralPitch') : t('pm.pitch'), min: 0.01 });
    def += field(api, 'turns', f.turns, { label: t('pm.turns'), unit: 'number', glyph: 'helix', min: 0.05 });
    def += check('lefthand', f.lefthand, t('pm.lefthand'), 'flipH');
    const parts = [group('helix', t('pm.helixDefinition'), def)];
    if (kind === 'helix') {
      let tp = field(api, 'taper', f.taper ?? 0, { label: t('pm.taperAngle'), unit: 'angle', glyph: 'dimAngle', min: 0 });
      if (num(f.taper)) tp += check('taperOutward', f.taperOutward, t('pm.taperOutward'), 'flipH');
      parts.push(group('dimAngle', t('pm.taperHelix'), tp, num(f.taper) ? '' : 'collapsed'));
      // Variable pitch: rows of turn / pitch / diameter.
      let vp = check('variablePitch', rows.length > 0, t('pm.variablePitch'), 'helix');
      if (rows.length) {
        vp += '<div class="hx-table">' + rows.map((r, k) => '<div class="pm-row">' + field(api, 'var:' + k + ':rev', r.rev, { label: t('pm.revolution'), unit: 'number', min: 0 }) + field(api, 'var:' + k + ':pitch', r.pitch, { label: t('pm.pitch'), min: 0.01 }) + field(api, 'var:' + k + ':d', r.d, { label: t('hole.diameter'), glyph: 'dimDiameter', min: 0.01 }) + '<button type="button" class="icon-button" data-pm="delVar:' + k + '" title="' + t('pm.removeRow') + '">×</button></div>').join('') + '</div><div class="pm-row"><button type="button" class="small-button" data-pm="addVar">' + t('pm.addRow') + '</button></div>';
      }
      parts.push(group('helix', t('pm.variablePitch'), vp, rows.length ? '' : 'collapsed'));
    }
    return parts.join('');
  },
  thread(api, f) {
    const { t } = api;
    const edge = f.edge ? [`${t('pm.edge')} (${t('pm.circular')})`] : [];
    return [
      group('featThread', t('pm.threadLocation'), `${pickBox(api, 'edge', edge, t('pm.circularEdge'), 'featThread')}${seg('internal', [['auto', t('thread.auto')], ['external', t('thread.external')], ['internal', t('thread.internal')]], f.internal ?? 'auto')}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`),
      group('featThread', t('pm.specification'), `${select('threadSize', [['', t('hole.custom')], ...THREAD_SIZES.map(([s, , p]) => [s, `${s} × ${p}`])], f.size ?? '', t('hole.size'))}${field(api, 'pitch', f.pitch, { label: t('pm.pitch'), min: 0.1 })}${field(api, 'length', f.length, { label: t('pm.length'), min: 0.1 })}${check('lefthand', f.lefthand, t('pm.lefthand'), 'flipH')}${check('cosmetic', f.cosmetic, t('pm.cosmeticThread'), 'hiddenLines')}`),
      group('featThread', t('thread.startEnd'), `${field(api, 'offset', f.offset ?? 0, { label: t('thread.offset'), glyph: 'dimDistance' })}${check('trimEnd', f.trimEnd !== false, t('thread.trimEnd'), 'trimTool')}`),
      group('featThread', t('thread.form'), `${select('form', [['iso', t('thread.form.iso')], ['v', t('thread.form.v')], ['trapezoidal', t('thread.form.trapezoidal')], ['buttress', t('thread.form.buttress')], ['pipe55', t('thread.form.pipe55')]], f.form ?? 'v', t('thread.form'))}${f.form !== 'iso' ? field(api, 'starts', f.starts ?? 1, { label: t('pm.threadStarts'), unit: 'count', min: 1 }) : ''}${''}${f.form === 'iso' && !f.cosmetic ? select('mode', [['auto', t('thread.mode.auto')], ['cosmetic', t('thread.mode.cosmetic')], ['modelled', t('thread.mode.modelled')]], f.mode ?? 'auto', t('thread.display')) : ''}${f.form === 'iso' ? `<p class="pm-note">${escapeHtml(t('thread.isoNote'))}</p>` : ''}`),
    ].join('');
  },
  wrap(api, f) {
    const { t } = api;
    return group('featWrap', t('pm.parameters'), `${seg('op', [['emboss', t('wrap.emboss'), 'featExtrude'], ['deboss', t('wrap.deboss'), 'featCut'], ['scribe', t('wrap.scribe'), 'splitLine']], f.op)}${sketchSelect(api, f, 'sketch', t('pm.sketch'), 'profile')}${pickBox(api, 'face', f.face ? [`${t('pm.face')} (${f.face.type === 'PLANE' ? t('pm.planar') : t('pm.curved')})`] : [], t('pm.faceToWrap'), 'part')}${field(api, 'depth', f.depth, { label: t('pm.depth'), min: 0.01 })}${note(t('pm.help.wrapProjection'))}`);
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
    return [group('surface', t('pm.profiles'), `${listToggles(api, 'loft', api.sketchList(f, 'profile'), f.sketches ?? [])}${check('ruled', f.ruled, t('pm.ruled'), 'lineTool')}`), loftCurves(api, f), loftConnectors(api, f)].join('');
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
      group('rotateRight', t('pm.rotate'), `${field(api, 'cx', f.cx ?? 0, { label: t('pm.rotCentre', { a: 'X' }), glyph: 'pointTool' })}${field(api, 'cy', f.cy ?? 0, { label: t('pm.rotCentre', { a: 'Y' }), glyph: 'pointTool' })}${field(api, 'cz', f.cz ?? 0, { label: t('pm.rotCentre', { a: 'Z' }), glyph: 'pointTool' })}${field(api, 'rx', f.rx ?? 0, { label: t('pm.rotAbout', { a: 'X' }), unit: 'angle', glyph: 'dimAngle' })}${field(api, 'ry', f.ry ?? 0, { label: t('pm.rotAbout', { a: 'Y' }), unit: 'angle', glyph: 'dimAngle' })}${field(api, 'rz', f.rz ?? 0, { label: t('pm.rotAbout', { a: 'Z' }), unit: 'angle', glyph: 'dimAngle' })}${Math.abs(Number(f.angle) || 0) > 1e-9 ? `${seg('axis', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], f.axis ?? 'z')}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' })}` : ''}`),
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
    // A multi-body part: all of it, or one body (Save Bodies makes such parts).
    const n = f.part ? (api.partBodyCount?.(f.part) ?? 0) : 0;
    const bodies = n > 1 || (f.body != null && f.body !== '') ? select('body', [['', t('pm.allBodies')], ...Array.from({ length: Math.max(n, Number(f.body ?? -1) + 1) }, (_, i) => [String(i), `${t('pm.body')} ${i + 1}`, 'part'])], f.body == null ? '' : String(f.body), t('pm.body')) : '';
    return [
      group('part', t('pm.partToInsert'), `${select('part', [['', `— ${t('pm.choosePart')} —`], ...api.otherParts().map((p) => [p.id, p.name, 'part'])], f.part ?? '', t('pm.part'))}${bodies}${seg('op', [['boss', t('op.boss'), 'featExtrude'], ['cut', t('op.cavity'), 'featCut'], ['common', t('op.common'), 'featIntersect']], f.op)}`),
      group('mirrorEntities', t('mirp.mirror'), seg('mirror', [['none', t('mirp.none'), 'close'], ['front', t('plane.front'), 'planeFront'], ['top', t('plane.top'), 'planeTop'], ['right', t('plane.right'), 'planeRight']], f.mirror ?? 'none')),
      group('position', t('pm.locate'), `${field(api, 'dx', f.dx, { label: 'ΔX', glyph: 'position' })}${field(api, 'dy', f.dy, { label: 'ΔY', glyph: 'position' })}${field(api, 'dz', f.dz, { label: 'ΔZ', glyph: 'position' })}${seg('axis', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], f.axis ?? 'z')}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' })}${field(api, 'scale', f.scale, { label: t('pm.scaleFactor'), unit: 'number', glyph: 'scaleBody', min: 0.0001 })}`),
    ].join('');
  },
  baseFlange(api, f) {
    const { t } = api;
    return [
      group('sheetMetal', t('pm.sheetMetal'), `${sketchSelect(api, f, 'sketch', t('pm.sketch'), 'profile')}${thicknessField(api, f)}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`),
      gaugeGroups(api, f),
    ].join('');
  },
  edgeFlange(api, f) {
    const { t } = api;
    const edge = f.edge ? [`${t('pm.edge')} (${t('pm.straight')})`] : [];
    const params = group('edgeFlange', t('pm.flangeParameters'), `${pickBox(api, 'edge', edge, t('pm.edge'), 'edgeFlange')}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 1 })}${field(api, 'length', f.length, { label: t('pm.flangeLength'), min: 0 })}${field(api, 'radius', f.radius ?? 0, { label: t('pm.bendRadiusOverride'), glyph: 'dimRadius', min: 0 })}${check('flip', f.flip, t('pm.flipBend'), 'flipV')}`);
    // Flange position, length reference and width (offsets from the edge's ends).
    const pos = group('edgeFlange', t('flange.position'), `${seg('position', [['bendOutside', t('flange.bendOutside'), 'edgeFlange'], ['materialOutside', t('flange.materialOutside'), 'featExtrude'], ['materialInside', t('flange.materialInside'), 'featShell'], ['virtualSharp', t('flange.virtualSharp'), 'dimAngle']], f.position ?? 'bendOutside')}${seg('lengthRef', [['tangent', t('flange.tangent'), 'relTangent'], ['outerSharp', t('flange.outerSharp'), 'dimHorizontal'], ['innerSharp', t('flange.innerSharp'), 'dimVertical']], f.lengthRef ?? 'tangent')}${field(api, 'offsetStart', f.offsetStart ?? 0, { label: t('flange.offsetStart'), glyph: 'dimHorizontal', min: 0 })}${field(api, 'offsetEnd', f.offsetEnd ?? 0, { label: t('flange.offsetEnd'), glyph: 'dimHorizontal', min: 0 })}`);
    // The flange's outline: a rectangle, or a polygon edited point by point (u along the edge, v along the flange).
    const pts = f.profilePts ?? [];
    const prof = group('edgeFlange', t('flange.profile'), pts.length ? `${rowTable(api, 'fp', [['u', 'U', 'len'], ['v', 'V', 'len']], pts, { seedLabel: t('flange.reset') })}<button type="button" class="small-button" data-pm="smRowsClear:fp">${icon('close')}<span>${escapeHtml(t('flange.rectangle'))}</span></button>` : `<button type="button" class="small-button" data-pm="smRowsSeed:fp">${icon('edgeFlange')}<span>${escapeHtml(t('flange.editProfile'))}</span></button><p class="pm-note">${escapeHtml(t('flange.help.profile'))}</p>`, pts.length ? '' : 'collapsed');
    return params + pos + prof;
  },
  structural(api, f) {
    const { t } = api;
    const base = group('structural', t('pm.selections'), `${select('profile', [...Object.keys(STRUCTURAL_PROFILES).map((k) => [k, t(`profile.${k}`)]), ['custom', t('profile.custom')]], f.profile, t('pm.profileType'))}${field(api, 'w', f.w, { label: t('pm.width'), min: 0.5 })}${['rectTube', 'angle', 'channel', 'ibeam', 'tee'].includes(f.profile) ? field(api, 'h', f.h, { label: t('pm.height'), min: 0.5 }) : ''}${['roundBar', 'squareBar'].includes(f.profile) ? '' : field(api, 't', f.t, { label: t('pm.wallThickness'), min: 0.1 })}${field(api, 'rotate', f.rotate, { label: t('pm.rotateProfile'), unit: 'angle', glyph: 'dimAngle' })}${sketchSelect(api, f, 'sketch', t('pm.pathSegments'), 'curves')}`);
    // A custom profile from a sketch (drawn round its origin, the path point); the corner treatment at joints.
    const custom = f.profile === 'custom' ? select('profileSketch', [['', `— ${t('pm.chooseSketch')} —`], ...api.sketchList(f, 'profile').map((x) => [x.id, x.name, 'featSketch'])], f.profileSketch ?? '', t('wd.profileSketch')) : '';
    const corners = seg('corner', [['none', t('wd.corner.none'), 'close'], ['miter', t('wd.corner.miter'), 'dimAngle'], ['butt1', t('wd.corner.butt1'), 'featExtrude'], ['butt2', t('wd.corner.butt2'), 'featCut']], f.corner ?? 'none');
    return base + group('structural', t('wd.options'), `${custom}<p class="pm-label">${escapeHtml(t('wd.cornerTreatment'))}</p>${corners}<p class="pm-note">${escapeHtml(t('wd.help.corner'))}</p>`);
  },
  fillSurface(api, f) {
    const { t } = api;
    const items = (f.edges ?? []).map((sig, i) => `${t('pm.edge')} ${i + 1}`);
    const curves = [...api.sketchList(f, 'path').map((x) => [x.id, x.name, 'featSketch']), ...api.curveList(f).map((x) => [x.id, x.name, 'sketch3d'])];
    // Continuity at the boundary and curves the patch passes through.
    const more = group('surfaceFill', t('fill.options'), `${seg('continuity', [['contact', t('fill.contact'), 'close'], ['tangent', t('bnd.tan.face'), 'relTangent'], ['curvature', t('bnd.tan.curvature'), 'curvatureComb']], f.continuity ?? 'contact')}<p class="pm-label">${escapeHtml(t('fill.constraints'))}</p>${listToggles(api, 'fcon', curves.filter(([id]) => id !== f.curve).map(([id, name, icon]) => ({ id, name, icon })), f.constraints ?? [])}`);
    return group('surfaceFill', t('pm.patchBoundary'), `${pickBox(api, 'edges', items, t('pm.boundaryEdges'), 'lineTool')}${select('curve', [['', `— ${t('pm.orCurve')} —`], ...curves], f.curve ?? '', t('pm.boundaryCurve'))}${note(t('pm.help.fillSurface'))}`) + more;
  },
  boundary(api, f) {
    const { t } = api;
    const list = [...api.sketchList(f, 'path'), ...api.curveList(f).map((x) => ({ ...x, icon: 'sketch3d' }))];
    const base = group('boundarySurface', t('pm.curves'), `${seg('op', [['surface', t('op.surface'), 'boundarySurface'], ['boss', t('op.boss'), 'featLoft'], ['cut', t('op.cut'), 'featCut']], f.op ?? 'surface')}${listToggles(api, 'curv', list, f.curves ?? [])}${(f.curves ?? []).length < 2 ? note(t('pm.loftNeedsTwo'), true) : ''}${note(t('pm.help.boundary'))}`);
    // Direction 2: curves crossing the profiles (the skin follows them); conditions at the ends with their influence.
    const second = listToggles(api, 'crv2', list.filter((x) => !(f.curves ?? []).includes(x.id)), f.curves2 ?? []);
    const conds = [['none', t('loft.none')], ['normal', t('loft.normal')], ['tangentFace', t('loft.tangentFace')], ['curvatureFace', t('loft.curvatureFace')]];
    let ends = `${select('startCond', conds, f.startCond ?? 'none', t('pm.startConstraint'))}${(f.startCond ?? 'none') !== 'none' ? field(api, 'startLength', f.startLength ?? 1, { label: t('bnd.influence'), unit: 'number', min: 0.05 }) : ''}`;
    ends += `${select('endCond', conds, f.endCond ?? 'none', t('pm.endConstraint'))}${(f.endCond ?? 'none') !== 'none' ? field(api, 'endLength', f.endLength ?? 1, { label: t('bnd.influence'), unit: 'number', min: 0.05 }) : ''}`;
    const patch = seg('tangent', [['none', t('bnd.tan.none'), 'close'], ['face', t('bnd.tan.face'), 'relTangent'], ['curvature', t('bnd.tan.curvature'), 'curvatureComb']], f.tangent ?? 'none');
    return [base, group('boundarySurface', t('pm.direction2'), second), group('boundarySurface', t('bnd.conditions'), `${ends}<p class="pm-label">${escapeHtml(t('bnd.patch'))}</p>${patch}`, (f.startCond ?? 'none') !== 'none' || (f.endCond ?? 'none') !== 'none' || (f.tangent ?? 'none') !== 'none' ? '' : 'collapsed')].join('');
  },
  trimSurface(api, f) {
    const { t } = api;
    const surfaces = api.surfaceList(f).map((x) => [x.id, x.name, 'surface']);
    return [
      group('surfaceTrim', t('pm.surfaceToTrim'), select('surface', [['', `— ${t('pm.chooseSurface')} —`], ...surfaces], f.surface ?? '', t('pm.surface'))),
      group('surfaceTrim', t('pm.trimTools'), `${select('tool', [['', t('pm.useAPlane')], ...surfaces.filter(([id]) => id !== f.surface)], f.tool ?? '', t('pm.trimTool'))}${f.tool ? '' : sketchSelect(api, f, 'sketch', t('pm.trimSketch'), 'profile')}${f.tool || f.sketch ? '' : `${stdPlanes(api, 'stdPlane', f.plane)}${pickBox(api, 'plane', [planeName(api, f.plane)], t('pm.planeOrFace'), 'refPlane')}`}${f.sketch && !f.tool ? seg('keep', [['outside', t('trim.outside')], ['inside', t('trim.inside')]], f.keep === 'inside' ? 'inside' : 'outside') : seg('keep', [['above', t('split.above')], ['below', t('split.below')]], f.keep)}`),
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
      relations3dGroup(api, f, e),
    ].join('');
  },
};

// PropertyManager pages of Advanced Hole (near / far element tables), Intersect (tools and the regions to keep)
// and Mate Reference (three faces with their mate types), and the values a new one starts with. HTML only —
// app.js binds the data-pm* attributes (hel:… fields and selects, addHel / delHel buttons) like the other pages.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg, select, pickBox } from './propertymanager.js';
import { HOLE_ELEMENTS, MATE_REF_TYPES, MATE_REF_ALIGN } from '../cad/part-extra.js';
import { standalonePoints } from '../cad/sketch.js';
import { PIPE_SIZES } from '../cad/stdparts.js';

const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;
const before = (api, f) => api.featuresBefore?.(f) ?? [];
const oneFace = (api, sig) => (sig ? [`${api.t('pm.face')} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`] : []);
const ELEMENT_GLYPHS = { counterbore: 'featHole', countersink: 'featChamfer', straight: 'featHole', tapped: 'featThread', taper: 'featDraft' };

/** One side's element table: kind, diameter, depth (or angle) per row, with add / remove buttons. */
function elementTable(api, f, side) {
  const { t } = api;
  const rows = (f[side] ?? []).map((el, i) => {
    const kinds = HOLE_ELEMENTS.map((k) => `<option value="${k}" ${el.kind === k ? 'selected' : ''}>${escapeHtml(t(`hx.el.${k}`))}</option>`).join('');
    const num = (prop, value, title) => `<input type="text" class="pm-text" data-pm-field="hel:${side}:${i}:${prop}" data-num value="${escapeHtml(api.fmtLenBare ? api.fmtLenBare(value ?? 0) : String(value ?? 0))}" title="${escapeHtml(title)}" spellcheck="false"/>`;
    const angled = el.kind === 'countersink' || el.kind === 'taper';
    return `<div class="hx-row">${icon(ELEMENT_GLYPHS[el.kind] ?? 'featHole', 'icon tiny')}<select data-pm-select="hel:${side}:${i}" aria-label="${escapeHtml(t('hx.element'))}">${kinds}</select>${num('d', el.d, t('hx.diameter'))}${el.kind === 'countersink' ? num('angle', el.angle ?? 90, t('hx.angle')) : num('depth', el.depth, t('hx.depth'))}${angled && el.kind === 'taper' ? num('angle', el.angle ?? 1, t('hx.taperAngle')) : ''}<button class="icon-button" data-pm="delHel:${side}.${i}" title="${escapeHtml(t('action.delete'))}">${icon('close')}</button></div>`;
  }).join('');
  return `<div class="hx-table"><div class="hx-row head"><span></span><span>${escapeHtml(t('hx.element'))}</span><span>Ø</span><span>${escapeHtml(t('hx.depthOrAngle'))}</span><span></span></div>${rows || note(t('hx.none'))}</div><div class="pm-row"><button class="small-button" data-pm="addHel:${side}">${icon('plus')}<span>${escapeHtml(t('hx.add'))}</span></button></div>`;
}

export const PART_EXTRA_PM = {
  moveFace(api, f) {
    const { t } = api;
    const faces = (f.faces ?? []).map((sig, k) => `${t('pm.face')} ${k + 1} (${sig.type === 'PLANE' ? t('pm.planar') : t('pm.curved')})`);
    const mode = f.mode ?? 'offset';
    const axisSeg = (key, ref) => seg(key, [['x', 'X', 'axisX'], ['y', 'Y', 'axisY'], ['z', 'Z', 'axisZ'], ['edge', t('pm.edge'), 'lineTool']], ref?.kind === 'edge' ? 'edge' : ref?.axis ?? 'x');
    let body = `${pickBox(api, 'faces', faces, t('pm.facesToMove'), 'moveFace')}${seg('mode', [['offset', t('mvf.offset'), 'offsetTool'], ['translate', t('mvf.translate'), 'moveBody'], ['rotate', t('mvf.rotate'), 'rotateTool']], mode)}`;
    if (mode === 'offset') body += field(api, 'distance', f.distance ?? 2, { label: t('pm.offsetDistance') });
    if (mode === 'translate') body += `${axisSeg('dir1', f.direction)}${f.direction?.kind === 'edge' ? pickBox(api, 'direction', f.direction.sig ? [t('pm.edge')] : [], t('pm.directionEdge'), 'lineTool') : ''}${field(api, 'distance', f.distance ?? 2, { label: t('pm.distance') })}`;
    if (mode === 'rotate') body += `${axisSeg('axisKind', f.axis)}${f.axis?.kind === 'edge' ? pickBox(api, 'axis', f.axis.sig ? [t('pm.edge')] : [], t('pm.axisEdge'), 'lineTool') : ''}${field(api, 'angle', f.angle ?? 10, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' })}`;
    return group('moveFace', t('pm.parameters'), `${body}${note(t(mode === 'offset' ? 'pm.help.moveFace' : 'mvf.help'))}`);
  },
  advancedHole(api, f) {
    const { t } = api;
    const sketches = before(api, f).filter((x) => x.type === 'sketch' && !x.suppressed && standalonePoints(x).length);
    const res = api.previewResult?.holes;
    const info = res?.length ? note(t('hx.made', { count: res.length, through: res.filter((h) => h.through).length })) : '';
    return [
      group('advancedHole', t('pm.position'), `${select('sketch', [['', `— ${t('pm.chooseSketch')} —`], ...sketches.map((s) => [s.id, s.name, 'featSketch'])], f.sketch ?? '', t('hx.points'))}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}`),
      group('featHole', t('hx.nearSide'), elementTable(api, f, 'near')),
      group('featHole', t('hx.farSide'), `${elementTable(api, f, 'far')}${note(t('hx.help'))}${info}`),
    ].join('');
  },
  intersect(api, f) {
    const { t } = api;
    const surfaces = api.surfaceList?.(f) ?? [];
    const chosen = new Set(f.surfaces ?? []);
    const planes = [['front', t('plane.front')], ['top', t('plane.top')], ['right', t('plane.right')], ...before(api, f).filter((x) => x.type === 'plane' && !x.suppressed).map((p) => [p.id, p.name])];
    const usedPlanes = new Set((f.planes ?? []).map(String));
    const res = api.previewResult?.intersect;
    const excluded = new Set((f.exclude ?? []).map(String));
    const regions = res?.regions?.length
      ? `<div class="pm-checklist">${res.regions.map((r) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="list:exclude:${r.index}" ${excluded.has(String(r.index)) ? 'checked' : ''}/>${icon('part')}<span>${escapeHtml(t('ix.region', { n: r.index + 1, volume: r.volume.toFixed(1) }))}</span></label>`).join('')}</div>${note(t('ix.excludeHelp'))}`
      : note(t('ix.noRegions'));
    return [
      group('intersectRegions', t('ix.tools'), `${check('bodies', f.bodies !== false, t('ix.useBodies'), 'part')}<div class="pm-checklist">${surfaces.map((s) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="surf:${escapeHtml(s.id)}" ${chosen.has(s.id) ? 'checked' : ''}/>${icon('surface')}<span>${escapeHtml(s.name)}</span></label>`).join('')}${planes.map(([id, name]) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="list:planes:${escapeHtml(id)}" ${usedPlanes.has(id) ? 'checked' : ''}/>${icon('refPlane')}<span>${escapeHtml(name)}</span></label>`).join('')}</div>`),
      group('intersectRegions', t('ix.regionsToExclude'), `${regions}${res?.allExcluded ? note(t('rebuild.intersect-all-excluded'), true) : ''}${res?.none ? note(t('rebuild.intersect-none'), true) : ''}`),
      group('intersectRegions', t('pm.options'), `${check('merge', f.merge !== false, t('ix.merge'), 'combineBodies')}${check('consume', f.consume !== false, t('ix.consume'), 'deleteBody')}`),
    ].join('');
  },
  connectionPoint(api, f) {
    const { t } = api;
    return [
      group('connectionPoint', t('cp.name'), `<label class="pm-field"><span class="pm-label">${escapeHtml(t('cp.name'))}</span><input type="text" class="pm-text" data-pm-field="cpName" value="${escapeHtml(f.cpName ?? 'Connector')}" spellcheck="false"/></label>${note(t('cp.help'))}`),
      group('connectionPoint', t('pm.parameters'), `${pickBox(api, 'face', oneFace(api, f.face), t('cp.face'), 'face')}${field(api, 'offset', f.offset ?? 0, { label: t('pm.offsetDistance') })}${check('flip', f.flip, t('pm.flipDirection'), 'flipV')}`),
      // Routing component: what the point connects (a pipe size / an outside diameter), CPoint or RPoint.
      group('pipeRoute', t('cp.routing'), `${seg('routeType', [['none', t('cp.rt.none')], ['pipe', t('route.pipe'), 'pipeRoute'], ['tube', t('route.tube'), 'tubeRoute'], ['cable', t('route.cable'), 'cableRoute']], f.routeType ?? 'none')}${f.routeType === 'pipe' ? select('size', PIPE_SIZES.map((s) => [s, s]), f.size ?? 'DN25', t('route.pipeSize')) : f.routeType && f.routeType !== 'none' ? field(api, 'od', f.od ?? 12, { label: t('route.od'), glyph: 'dimDiameter', min: 0.1 }) : ''}${f.routeType && f.routeType !== 'none' ? `${seg('role', [['connection', t('cp.role.connection'), 'connectionPoint'], ['route', t('cp.role.route'), 'pointTool']], f.role ?? 'connection')}${note(t('cp.routingHelp'))}` : ''}`),
    ].join('');
  },
  mateReference(api, f) {
    const { t } = api;
    const row = (k) => `${pickBox(api, k, oneFace(api, f[k]), t(`mr.${k}`), 'face')}${f[k] ? `${seg(`${k}Type`, MATE_REF_TYPES.map((x) => [x, t(`mr.type.${x}`)]), f[`${k}Type`] ?? 'default')}${seg(`${k}Align`, MATE_REF_ALIGN.map((x) => [x, t(`mr.align.${x}`)]), f[`${k}Align`] ?? 'any')}` : ''}`;
    return [
      group('mateReference', t('mr.name'), `<label class="pm-field"><span class="pm-label">${escapeHtml(t('mr.name'))}</span><input type="text" class="pm-text" data-pm-field="refName" value="${escapeHtml(f.refName ?? 'Default')}" spellcheck="false"/></label>${note(t('mr.help'))}`),
      group('mate', t('mr.primary'), row('primary')),
      group('mate', t('mr.secondary'), row('secondary')),
      group('mate', t('mr.tertiary'), row('tertiary')),
    ].join('');
  },
};

export function partExtraStart(type, part, sel, featuresBefore) {
  if (type === 'moveFace') return { params: { faces: sel.faces ?? [] }, pick: 'faces' };
  if (type === 'connectionPoint') return { params: sel.faces?.[0] ? { face: sel.faces[0] } : {}, pick: 'face' };
  const params = {}; let pick = null;
  const last = (pred) => [...featuresBefore].reverse().find(pred);
  switch (type) {
    case 'advancedHole': {
      const s = (sel.features ?? []).find((x) => x.type === 'sketch' && standalonePoints(x).length) ?? last((x) => x.type === 'sketch' && standalonePoints(x).length > 0);
      if (!s) return { notice: 'notice.needPointSketch' };
      params.sketch = s.id;
      break;
    }
    case 'intersect': break;
    case 'mateReference': {
      const [a, b, c] = sel.faces;
      if (a) params.primary = a; if (b) params.secondary = b; if (c) params.tertiary = c;
      pick = a ? (b ? 'tertiary' : 'secondary') : 'primary';
      break;
    }
    default: break;
  }
  return { params, pick };
}

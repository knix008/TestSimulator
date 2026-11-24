// PropertyManager pages of the added surface, sheet metal and weldment features (ruled surface, delete /
// replace / extend face, miter flange, lofted bend, tab, closed corner, corner relief, forming tools, end
// cap, gusset, weld bead, trim / extend), the values a new one starts with from the selection, and their
// rows in the weldment cut list. HTML only — app.js binds the data-pm* attributes like the other pages.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, check, seg, select, pickBox, planeName } from './propertymanager.js';
import { FORM_TOOLS } from '../cad/sheet-more-types.js';
import { profiles } from '../cad/sketch.js';

const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;
const before = (api, f) => api.featuresBefore?.(f) ?? [];
const faceItems = (api, list) => (list ?? []).map((sig, i) => `${api.t('pm.face')} ${i + 1} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`);
const edgeItems = (api, list) => (list ?? []).map((sig, i) => `${api.t('pm.edge')} ${i + 1}`);
const oneFace = (api, sig) => (sig ? [`${api.t('pm.face')} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`] : []);
const surfaceSelect = (api, f, key = 'surface', label = api.t('pm.surface')) => select(key, [['', `— ${api.t('pm.chooseSurface')} —`], ...api.surfaceList(f).map((s) => [s.id, s.name, 'surface'])], f[key] ?? '', label);
const ofType = (api, f, types) => before(api, f).filter((x) => types.includes(x.type) && !x.suppressed);
const stdPlanes = (api, key, ref) => seg(key, [['front', api.t('plane.front')], ['top', api.t('plane.top')], ['right', api.t('plane.right')]], ref?.kind === 'std' ? ref.name : '');
const loftToggles = (api, f) => {
  const chosen = f.sketches ?? [];
  const items = before(api, f).filter((x) => x.type === 'sketch' && !x.suppressed && x.entities.some((k) => k.type !== 'point' && !k.construction));
  return `<div class="pm-checklist">${items.length ? items.map((x) => {
    const at = chosen.indexOf(x.id);
    return `<label class="pm-check" title="${escapeHtml(x.name)}"><input type="checkbox" data-pm-toggle="loft:${escapeHtml(x.id)}" ${at >= 0 ? 'checked' : ''}/>${icon('featSketch')}<span>${escapeHtml(x.name)}${at >= 0 ? ` <b class="pm-order">${at + 1}</b>` : ''}</span></label>`;
  }).join('') : note(api.t('pm.nothingToChoose'))}</div>`;
};
/** Two flange choosers (an empty choice = every corner where two edge flanges meet). */
const flangePair = (api, f) => {
  const options = [['', api.t('sm.allCorners')], ...ofType(api, f, ['edgeFlange']).map((x) => [x.id, x.name, 'edgeFlange'])];
  return `${select('flangeA', options, f.flangeA ?? '', `${api.t('sm.flange')} 1`)}${select('flangeB', options, f.flangeB ?? '', `${api.t('sm.flange')} 2`)}`;
};

export const SHEET_MORE_PM = {
  ruledSurface(api, f) {
    const { t } = api;
    return [
      group('ruledSurface', t('sm.ruledType'), `${seg('mode', [['tangent', t('sm.ruled.tangent')], ['normal', t('sm.ruled.normal')], ['vector', t('sm.ruled.vector')]], f.mode ?? 'tangent')}${f.mode === 'vector' ? seg('axis', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], f.axis ?? 'z') : ''}${field(api, 'distance', f.distance, { label: t('pm.distance'), min: 0.01 })}${check('reverse', f.reverse, t('pm.reverse'), 'flipV')}${f.mode === 'vector' ? '' : check('alternate', f.alternate, t('sm.alternateFace'), 'flipH')}`),
      group('lineTool', t('sm.edgeSelection'), `${pickBox(api, 'edges', edgeItems(api, f.edges), t('pm.edges'), 'lineTool')}${note(t('sm.help.ruled'))}`),
    ].join('');
  },
  deleteFace(api, f) {
    const { t } = api;
    return [
      group('deleteFace', t('sm.facesToDelete'), pickBox(api, 'faces', faceItems(api, f.faces), t('sm.facesToDelete'), 'deleteFace')),
      group('deleteFace', t('pm.options'), `${seg('mode', [['delete', t('sm.delete.delete')], ['patch', t('sm.delete.patch')], ['fill', t('sm.delete.fill')]], f.mode ?? 'patch')}${note(t(`sm.help.delete.${f.mode === 'delete' || f.mode === 'fill' ? f.mode : 'patch'}`))}`),
    ].join('');
  },
  replaceFace(api, f) {
    const { t } = api;
    return group('replaceFace', t('sm.replaceParameters'), `${pickBox(api, 'faces', faceItems(api, f.faces), t('sm.targetFaces'), 'replaceFace')}${surfaceSelect(api, f, 'surface', t('sm.replacementSurface'))}${note(t('sm.help.replace'))}`);
  },
  extendSurface(api, f) {
    const { t } = api;
    return [
      group('extendSurface', t('sm.extendSurface'), `${surfaceSelect(api, f)}${field(api, 'distance', f.distance, { label: t('pm.distance'), min: 0.01 })}`),
      group('extendSurface', t('sm.extensionType'), `${seg('kind', [['same', t('sm.extend.same')], ['linear', t('sm.extend.linear')]], f.kind ?? 'same')}${note(t('sm.help.extend'))}`),
    ].join('');
  },
  miterFlange(api, f) {
    const { t } = api;
    return [
      group('miterFlange', t('sm.flangeEdges'), `${pickBox(api, 'edges', edgeItems(api, f.edges), t('sm.flangeEdges'), 'miterFlange')}${note(t('sm.help.miter'))}`),
      group('edgeFlange', t('pm.flangeParameters'), `${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 1 })}${field(api, 'length', f.length, { label: t('pm.flangeLength'), min: 0 })}${field(api, 'radius', f.radius ?? 0, { label: t('pm.bendRadiusOverride'), glyph: 'dimRadius', min: 0 })}${field(api, 'gap', f.gap, { label: t('sm.miterGap'), min: 0 })}${check('flip', f.flip, t('pm.flipBend'), 'flipV')}`),
    ].join('');
  },
  loftedBend(api, f) {
    const { t } = api;
    return [
      group('loftedBend', t('pm.profiles'), `${loftToggles(api, f)}${(f.sketches ?? []).length < 2 ? note(t('pm.loftNeedsTwo'), true) : ''}`),
      group('sheetMetal', t('pm.sheetMetal'), `${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.05 })}${field(api, 'radius', f.radius, { label: t('pm.bendRadius'), glyph: 'dimRadius', min: 0 })}${field(api, 'kFactor', f.kFactor, { label: t('pm.kFactor'), unit: 'number', glyph: 'smartDim', min: 0 })}${field(api, 'segments', f.segments, { label: t('sm.facets'), unit: 'count', glyph: 'loftedBend', min: 8, step: 1 })}${note(t('sm.help.lofted'))}`),
    ].join('');
  },
  tab(api, f) {
    const { t } = api;
    const sketches = before(api, f).filter((x) => x.type === 'sketch' && !x.suppressed && profiles(x).length > 0);
    return group('sheetTab', t('pm.parameters'), `${select('sketch', [['', `— ${t('pm.chooseSketch')} —`], ...sketches.map((s) => [s.id, s.name, 'featSketch'])], f.sketch ?? '', t('pm.sketch'))}${note(t('sm.help.tab'))}`);
  },
  closedCorner(api, f) {
    const { t } = api;
    return group('closedCorner', t('sm.cornersToClose'), `${flangePair(api, f)}${field(api, 'gap', f.gap, { label: t('sm.miterGap'), min: 0 })}${note(t('sm.help.closedCorner'))}`);
  },
  cornerRelief(api, f) {
    const { t } = api;
    return group('cornerRelief', t('sm.reliefParameters'), `${flangePair(api, f)}${seg('kind', [['rect', t('sm.relief.rect')], ['round', t('sm.relief.round')]], f.kind ?? 'rect')}${field(api, 'size', f.size, { label: t('sm.reliefSize'), min: 0 })}${note(t('sm.help.relief'))}`);
  },
  formTool(api, f) {
    const { t } = api;
    const tool = FORM_TOOLS.includes(f.tool) ? f.tool : 'dimple';
    const long = tool === 'louver' || tool === 'lance';
    return [
      group('formTool', t('sm.formLibrary'), seg('tool', FORM_TOOLS.map((k) => [k, t(`sm.form.${k}`), `form${k[0].toUpperCase()}${k.slice(1)}`]), tool)),
      group('formTool', t('sm.placement'), `${pickBox(api, 'face', oneFace(api, f.face), t('sm.sheetFace'), 'part')}${field(api, 'dx', f.dx, { label: 'ΔX', glyph: 'position' })}${field(api, 'dy', f.dy, { label: 'ΔY', glyph: 'position' })}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle' })}${check('down', f.down, t('sm.formDown'), 'flipV')}`),
      group('formTool', t('pm.parameters'), `${field(api, 'size', f.size, { label: long ? t('pm.length') : t('sm.diameter'), min: 1 })}${long ? field(api, 'width', f.width, { label: t('pm.width'), min: 0.5 }) : ''}${field(api, 'height', f.height, { label: t('pm.height'), min: 0.1 })}${note(t(`sm.help.form.${tool}`))}`),
    ].join('');
  },
  endCap(api, f) {
    const { t } = api;
    return group('endCap', t('pm.parameters'), `${pickBox(api, 'face', oneFace(api, f.face), t('sm.endFace'), 'endCap')}${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.1 })}${field(api, 'inset', f.inset, { label: t('sm.inset'), min: 0 })}${note(t('sm.help.endCap'))}`);
  },
  gusset(api, f) {
    const { t } = api;
    return [
      group('gusset', t('sm.supportingFaces'), `${pickBox(api, 'faces', faceItems(api, f.faces), t('sm.supportingFaces'), 'gusset')}${(f.faces ?? []).length < 2 ? note(t('sm.help.gussetFaces'), true) : ''}`),
      group('gusset', t('sm.profile'), `${field(api, 'd1', f.d1, { label: `${t('sm.leg')} 1`, min: 0.5 })}${field(api, 'd2', f.d2, { label: `${t('sm.leg')} 2`, min: 0.5 })}${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.1 })}${field(api, 'chamfer', f.chamfer, { label: t('sm.cornerChamfer'), min: 0 })}${field(api, 'offset', f.offset, { label: t('sm.locationOffset') })}`),
    ].join('');
  },
  weldBead(api, f) {
    const { t } = api;
    return group('weldBead', t('sm.weldPath'), `${pickBox(api, 'edges', edgeItems(api, f.edges), t('sm.weldEdges'), 'weldBead')}${field(api, 'size', f.size, { label: t('sm.beadSize'), min: 0.1 })}${check('cosmetic', f.cosmetic, t('sm.cosmeticWeld'), 'hiddenLines')}${note(t('sm.help.weld'))}`);
  },
  trimExtend(api, f) {
    const { t } = api;
    const members = ofType(api, f, ['structural']);
    return [
      group('trimExtend', t('sm.membersToTrim'), select('member', [['', `— ${t('sm.chooseMember')} —`], ...members.map((m) => [m.id, m.name, 'structural'])], f.member ?? '', t('sm.member'))),
      group('refPlane', t('sm.trimBoundary'), `${stdPlanes(api, 'stdPlane', f.plane)}${pickBox(api, 'plane', [planeName(api, f.plane)], t('pm.planeOrFace'), 'refPlane')}${note(t('sm.help.trim'))}`),
    ].join('');
  },
};

const SHEET_NEEDS_FLANGE = ['miterFlange', 'tab', 'closedCorner', 'cornerRelief', 'formTool'];

/**
 * The first values of a new feature from the selection: { params, pick } or { notice }.
 * picked = { faces: [sig], edges: [sig], features: [feature] }; list = the features before it.
 */
export function sheetMoreStart(type, part, picked, list) {
  const params = {};
  let pick = null;
  const hasSheet = list.some((f) => f.type === 'baseFlange' || f.type === 'loftedBend');
  if (SHEET_NEEDS_FLANGE.includes(type) && !hasSheet) return { notice: 'notice.needBaseFlange' };
  const usedSketches = new Set(part.features.flatMap((f) => [f.sketch, ...(f.sketches ?? [])]).filter(Boolean));
  const sketches = list.filter((f) => f.type === 'sketch' && !f.suppressed);
  switch (type) {
    case 'ruledSurface': case 'miterFlange': case 'weldBead':
      params.edges = picked.edges; pick = 'edges'; break;
    case 'deleteFace': case 'replaceFace':
      params.faces = picked.faces; pick = 'faces';
      if (type === 'replaceFace') { const s = list.filter((f) => SURFACE_LIKE.includes(f.type)).at(-1); if (!s) return { notice: 'notice.needSurface' }; params.surface = s.id; }
      break;
    case 'gusset':
      params.faces = picked.faces.filter((x) => x.type === 'PLANE').slice(0, 2); pick = 'faces'; break;
    case 'extendSurface': {
      const s = list.filter((f) => SURFACE_LIKE.includes(f.type)).at(-1);
      if (!s) return { notice: 'notice.needSurface' };
      params.surface = s.id; break;
    }
    case 'formTool': case 'endCap':
      params.face = picked.faces.find((x) => x.type === 'PLANE') ?? null; pick = 'face'; break;
    case 'tab': {
      const sk = picked.features.find((f) => f.type === 'sketch' && profiles(f).length) ?? sketches.filter((f) => !usedSketches.has(f.id) && profiles(f).length).at(-1);
      if (!sk) return { notice: 'notice.needSketch' };
      params.sketch = sk.id; break;
    }
    case 'loftedBend': {
      const chosen = picked.features.filter((f) => f.type === 'sketch');
      const free = sketches.filter((f) => !usedSketches.has(f.id) && f.entities.some((k) => k.type !== 'point' && !k.construction));
      params.sketches = (chosen.length >= 2 ? chosen : free.slice(-2)).map((f) => f.id);
      break;
    }
    case 'closedCorner': case 'cornerRelief':
      if (!list.some((f) => f.type === 'edgeFlange')) return { notice: 'notice.needEdgeFlanges' };
      break;
    case 'trimExtend': {
      const m = picked.features.find((f) => f.type === 'structural') ?? list.filter((f) => f.type === 'structural').at(-1);
      if (!m) return { notice: 'notice.needMember' };
      params.member = m.id; pick = 'plane';
      break;
    }
    default: break;
  }
  return { params, pick };
}

/** Feature types whose result is a surface body (for the surface choosers). */
export const SURFACE_LIKE = ['surfaceExtrude', 'surfaceRevolve', 'surfacePlanar', 'surfaceLoft', 'surfaceOffset', 'knit', 'fillSurface', 'boundary', 'trimSurface', 'ruledSurface', 'extendSurface', 'deleteFace', 'surfaceSweep', 'deleteHole', 'untrimSurface', 'midSurface', 'radiateSurface', 'flattenSurface'];

/**
 * The cut list's rows of the weldment features: members with their trimmed / extended lengths, end caps,
 * gussets and weld beads. → { rows: [[glyph, text, value]], memberTotal }.
 */
export function weldmentCutRows(part, results, { t, fmtLen }) {
  const rows = [];
  let memberTotal = 0;
  const live = part.features.filter((f) => !f.suppressed && results.get(f.id)?.ok);
  for (const f of live.filter((x) => x.type === 'structural')) {
    // The last trim / extend of this member decides its lengths.
    const trim = live.filter((x) => x.type === 'trimExtend' && x.member === f.id).at(-1);
    const members = (trim ? results.get(trim.id)?.members : null) ?? results.get(f.id)?.members ?? [];
    for (const [i, m] of members.entries()) {
      rows.push(['structural', `${f.name} #${i + 1} · ${t(`profile.${f.profile}`)} ${fmtLen(f.w, false)}${['rectTube', 'angle', 'channel', 'ibeam', 'tee'].includes(f.profile) ? `×${fmtLen(f.h, false)}` : ''}`, fmtLen(m.length)]);
      memberTotal += m.length;
    }
  }
  for (const f of live.filter((x) => x.type === 'endCap')) {
    const c = results.get(f.id).endCap;
    rows.push(['endCap', `${f.name} · ${t('sm.cut.plate')} ${fmtLen(c.w, false)}×${fmtLen(c.h, false)}`, `t ${fmtLen(c.thickness)}`]);
  }
  for (const f of live.filter((x) => x.type === 'gusset')) {
    const g = results.get(f.id).gusset;
    rows.push(['gusset', `${f.name} · ${t('sm.cut.gusset')} ${fmtLen(g.d1, false)}×${fmtLen(g.d2, false)}`, `t ${fmtLen(g.thickness)}`]);
  }
  for (const f of live.filter((x) => x.type === 'weldBead')) {
    const w = results.get(f.id).weld;
    rows.push(['weldBead', `${f.name} · ${t(w.cosmetic ? 'sm.cut.cosmeticWeld' : 'sm.cut.weld')} a${fmtLen(w.size, false)}`, fmtLen(w.length)]);
  }
  return { rows, memberTotal };
}

/** Whether the part has anything for the cut list. */
export const hasWeldments = (part) => Boolean(part?.features.some((f) => ['structural', 'endCap', 'gusset', 'weldBead'].includes(f.type)));

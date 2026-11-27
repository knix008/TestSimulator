// PropertyManager pages of the added sheet metal features (convert to sheet metal, insert bends, rip, unfold,
// fold, cross break, welded corner, tab and slot) and the values a new one starts with from the selection.
// HTML only — app.js binds the data-pm* attributes like the other pages.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, field, seg, select, pickBox } from './propertymanager.js';
import { gaugeGroups, thicknessField } from './pm-sheet-gauge.js';

const note = (text, warn = false) => `<p class="pm-note ${warn ? 'warn' : ''}">${warn ? icon('warning', 'icon tiny') : ''}${escapeHtml(text)}</p>`;
const before = (api, f) => api.featuresBefore?.(f) ?? [];
const edgeItems = (api, list) => (list ?? []).map((sig, i) => `${api.t('pm.edge')} ${i + 1}`);
const oneFace = (api, sig) => (sig ? [`${api.t('pm.face')} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`] : []);
const oneEdge = (api, sig) => (sig ? [`${api.t('pm.edge')} (${sig.type === 'LINE' ? api.t('pm.straight') : api.t('pm.curve')})`] : []);
const results = (rows) => `<dl class="pm-results">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`;
const corners = (api, f) => `${seg('corner', [['overlap', api.t('sx.corner.overlap'), 'closedCorner'], ['open', api.t('sx.corner.open'), 'cornerRelief']], f.corner ?? 'overlap')}${field(api, 'gap', f.gap, { label: api.t('sx.ripGap'), min: 0 })}`;
const bendGroup = (api, f) => `${field(api, 'radius', f.radius, { label: api.t('pm.bendRadius'), glyph: 'dimRadius', min: 0 })}${field(api, 'kFactor', f.kFactor, { label: api.t('pm.kFactor'), unit: 'number', glyph: 'smartDim', min: 0 })}`;
/** Built bends / thickness, once the preview has run. */
const convertInfo = (api) => {
  const res = api.previewResult?.convert;
  return res ? results([[api.t('sx.bendCount'), String(res.bends)], [api.t('pm.thickness'), api.fmtLen ? api.fmtLen(res.thickness) : String(res.thickness)]]) : '';
};

export const SHEET_EXTRA_PM = {
  convertSheet(api, f) {
    const { t } = api;
    return [
      group('convertSheet', t('pm.selections'), `${pickBox(api, 'face', oneFace(api, f.face), t('sx.fixedFace'), 'face')}${pickBox(api, 'edges', edgeItems(api, f.edges), t('sx.bendEdges'), 'lineTool')}${note(t('sx.help.convert'))}`),
      group('sheetMetal', t('pm.sheetMetal'), `${thicknessField(api, f)}${seg('side', [['inside', t('sx.side.inside'), 'featShell'], ['outside', t('sx.side.outside'), 'featExtrude']], f.side ?? 'inside')}`),
      gaugeGroups(api, f),
      group('closedCorner', t('sx.cornerDefaults'), `${corners(api, f)}${convertInfo(api)}`),
    ].join('');
  },
  insertBends(api, f) {
    const { t } = api;
    return [
      group('insertBends', t('pm.selections'), `${pickBox(api, 'face', oneFace(api, f.face), t('sx.fixedFace'), 'face')}${note(t('sx.help.insertBends'))}`),
      group('edgeFlange', t('pm.bendAllowance'), bendGroup(api, f)),
      group('closedCorner', t('sx.cornerDefaults'), `${corners(api, f)}${convertInfo(api)}`),
    ].join('');
  },
  rip(api, f) {
    const { t } = api;
    return [
      group('rip', t('pm.selections'), `${pickBox(api, 'edges', edgeItems(api, f.edges), t('sx.ripEdges'), 'lineTool')}`),
      group('rip', t('pm.parameters'), `${seg('direction', [['both', t('sx.rip.both'), 'rip'], ['a', t('sx.rip.a'), 'flipH'], ['b', t('sx.rip.b'), 'flipV']], f.direction ?? 'both')}${field(api, 'gap', f.gap, { label: t('sx.ripGap'), min: 0.01 })}${note(t('sx.help.rip'))}`),
    ].join('');
  },
  unfold(api) {
    const { t } = api;
    const res = api.previewResult?.unfold;
    return group('unfold', t('pm.parameters'), `${note(t('sx.help.unfold'))}${res?.bends != null ? results([[t('sx.bendCount'), String(res.bends)]]) : ''}`);
  },
  fold(api, f) {
    const { t } = api;
    const open = before(api, f).filter((x) => !x.suppressed && (x.type === 'unfold' || x.type === 'fold')).at(-1);
    return group('fold', t('pm.parameters'), `${note(t('sx.help.fold'))}${open?.type === 'unfold' ? '' : note(t('rebuild.no-unfold'), true)}`);
  },
  crossBreak(api, f) {
    const { t } = api;
    return group('crossBreak', t('pm.parameters'), `${pickBox(api, 'face', oneFace(api, f.face), t('sx.panelFace'), 'face')}${field(api, 'radius', f.radius, { label: t('sx.breakRadius'), glyph: 'dimRadius', min: 0 })}${field(api, 'angle', f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 0 })}${seg('direction', [['up', t('sx.break.up'), 'flipV'], ['down', t('sx.break.down'), 'flipV']], f.direction ?? 'up')}${note(t('sx.help.crossBreak'))}`);
  },
  weldedCorner(api, f) {
    const { t } = api;
    const options = [['', t('sm.allCorners')], ...before(api, f).filter((x) => x.type === 'edgeFlange' && !x.suppressed).map((x) => [x.id, x.name, 'edgeFlange'])];
    const res = api.previewResult?.weld;
    const info = res ? results([[t('sx.weldCorners'), String(res.corners)], [t('sx.weldVolume'), `${res.volume.toFixed(2)} mm³`], [t('sx.weldLength'), api.fmtLen ? api.fmtLen(res.length) : res.length.toFixed(2)]]) : '';
    return group('weldedCorner', t('sm.cornersToClose'), `${select('flangeA', options, f.flangeA ?? '', `${t('sm.flange')} 1`)}${select('flangeB', options, f.flangeB ?? '', `${t('sm.flange')} 2`)}${note(t('sx.help.weldedCorner'))}${info}`);
  },
  tabSlot(api, f) {
    const { t } = api;
    return [
      group('tabSlot', t('pm.selections'), `${pickBox(api, 'edge', oneEdge(api, f.edge), t('sx.tabEdge'), 'lineTool')}${pickBox(api, 'face', oneFace(api, f.face), t('sx.slotFace'), 'face')}`),
      group('tabSlot', t('pm.parameters'), `${field(api, 'count', f.count, { label: t('sx.tabCount'), unit: 'count', glyph: 'featLinPattern', min: 1, step: 1 })}${field(api, 'length', f.length, { label: t('sx.tabLength'), min: 0.1 })}${field(api, 'height', f.height, { label: t('sx.tabHeight'), min: 0 })}${field(api, 'clearance', f.clearance, { label: t('pm.clearance'), min: 0 })}${field(api, 'offset', f.offset, { label: t('pm.offset'), glyph: 'position' })}${note(t('sx.help.tabSlot'))}`),
    ].join('');
  },
};

/**
 * A new sheet feature's parameters from the selection: `sel` = { faces: [sig], edges: [sig], features }.
 * Returns { params, pick } or { notice }.
 */
export function sheetExtraStart(type, part, sel, featuresBefore) {
  const params = {}; let pick = null;
  const face = sel.faces.find((x) => x.type === 'PLANE');
  switch (type) {
    case 'convertSheet': if (face) params.face = face; params.edges = sel.edges; pick = face ? 'edges' : 'face'; break;
    case 'insertBends': case 'crossBreak': if (face) params.face = face; pick = 'face'; break;
    case 'rip': params.edges = sel.edges; pick = 'edges'; break;
    case 'unfold': case 'fold':
      if (!featuresBefore.some((f) => ['baseFlange', 'convertSheet', 'insertBends', 'loftedBend'].includes(f.type) && !f.suppressed)) return { notice: 'notice.needSheet' };
      if (type === 'fold' && featuresBefore.filter((f) => !f.suppressed && (f.type === 'unfold' || f.type === 'fold')).at(-1)?.type !== 'unfold') return { notice: 'notice.needUnfold' };
      break;
    case 'weldedCorner': {
      const fl = (sel.features ?? []).filter((f) => f.type === 'edgeFlange');
      if (featuresBefore.filter((f) => f.type === 'edgeFlange').length < 2) return { notice: 'notice.needEdgeFlanges' };
      if (fl[0]) params.flangeA = fl[0].id; if (fl[1]) params.flangeB = fl[1].id;
      break;
    }
    case 'tabSlot': if (sel.edges[0]) params.edge = sel.edges[0]; if (face) params.face = face; pick = sel.edges[0] ? 'face' : 'edge'; break;
    default: break;
  }
  return { params, pick };
}

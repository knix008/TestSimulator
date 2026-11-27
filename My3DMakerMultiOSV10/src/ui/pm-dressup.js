// The fillet, chamfer and shell PropertyManagers with their full options (dressup-more.js): fillet items (edges,
// faces, features), tangent propagation, profile (circular / conic rho / curvature continuous), radius or chord
// width, multiple radii; chamfer types (distance, distance-distance, angle-distance, offset face, vertex) with
// Flip direction; shell inward / outward and multi-thickness faces.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { group, seg, select, check, field, pickBox } from './propertymanager.js';
import { vertexItems } from './pm-extrude.js';

const note = (text) => `<p class="pm-note">${escapeHtml(text)}</p>`;
const edgeLabel = (api, sig, i) => `${api.t('pm.edge')} ${i + 1} (${sig.type === 'CIRCLE' ? api.t('pm.circular') : sig.type === 'LINE' ? api.t('pm.straight') : api.t('pm.curve')})`;
const faceLabel = (api, sig, i) => `${api.t('pm.face')} ${i + 1} (${sig.type === 'PLANE' ? api.t('pm.planar') : api.t('pm.curved')})`;
const allEdgesButton = (api) => `<div class="pm-row"><button class="small-button" data-pm="tangentChain" title="${escapeHtml(api.t('pm.allEdgesOfFaceTip'))}">${icon('selectAll')}<span>${escapeHtml(api.t('pm.allEdgesOfFace'))}</span></button></div>`;

/** The items both a fillet and a chamfer take: edges, faces, features, tangent propagation. */
function items(api, f, glyph) {
  const { t } = api;
  const edges = (f.edges ?? []).map((sig, i) => edgeLabel(api, sig, i));
  const faces = (f.faceItems ?? []).map((sig, i) => faceLabel(api, sig, i));
  const feats = (f.featureItems ?? []).map((id) => api.featureName(id) ?? id);
  return `${pickBox(api, 'edges', edges, t('pm.edges'), glyph)}${allEdgesButton(api)}${pickBox(api, 'faceItems', faces, t('pm.faceItems'), 'surface')}${pickBox(api, 'featureItems', feats, t('pm.featureItems'), 'featExtrude')}${check('propagate', f.propagate !== false, t('pm.tangentPropagation'), 'relTangent')}`;
}

export function filletPm(api, f) {
  const { t } = api;
  const parts = [];
  parts.push(group('featFillet', t('pm.items'), items(api, f, 'featFillet')));
  const profile = f.profile ?? 'circular';
  let size = seg('mode', [['radius', t('pm.radius'), 'dimRadius'], ['chord', t('pm.chordWidth'), 'smartDim']], f.mode ?? 'radius');
  size += field(api, 'radius', f.radius, { label: f.mode === 'chord' ? t('pm.chordWidth') : t('pm.radius'), glyph: 'dimRadius', min: 0.001 });
  size += select('profile', [['circular', t('fillet.circular')], ['conic', t('fillet.conic')], ['curvature', t('fillet.curvature')]], profile, t('pm.profile'));
  if (profile === 'conic') size += field(api, 'rho', f.rho ?? 0.5, { label: t('pm.rho'), unit: 'number', min: 0.01 });
  if (profile !== 'circular') size += note(t('pm.help.filletProfile'));
  // Multiple radii: a radius for each picked edge.
  size += check('multiRadius', Array.isArray(f.radii), t('pm.multipleRadius'), 'dimRadius');
  if (Array.isArray(f.radii)) {
    size += (f.edges ?? []).map((sig, i) => {
      const own = f.radii.find((x) => x.sig && Math.hypot(...x.sig.mid.map((v, k) => v - sig.mid[k])) < 1e-6);
      return field(api, `rad:${i}`, own ? own.r : f.radius, { label: edgeLabel(api, sig, i), glyph: 'dimRadius', min: 0.001 });
    }).join('');
  }
  parts.push(group('dimRadius', t('pm.filletParameters'), size));
  // Overflow: the round rolls on over a neighbouring face (default / keep surface) or stops at its edge (keep edge).
  parts.push(group('featFillet', t('overflow.title'), seg('overflow', [['default', t('overflow.default'), 'featFillet'], ['keepEdge', t('overflow.keepEdge'), 'lineTool'], ['keepSurface', t('overflow.keepSurface'), 'surface']], f.overflow ?? 'default'), (f.overflow ?? 'default') === 'default' ? 'collapsed' : ''));
  // Setbacks: corners blended from a distance along each of their edges.
  const sb = (f.setbacks ?? []).map((x, i) => `<div class="pm-row-title">${icon('refPoint', 'icon tiny')}<span>${escapeHtml(`${t('setback.corner')} ${i + 1} (${x.vertex.map((c) => api.fmt(c)).join(', ')})`)}</span><button type="button" class="icon-button" data-pm="sbDel:${i}" title="${escapeHtml(t('setback.remove'))}">${icon('trash')}</button></div>${[0, 1, 2].map((k) => field(api, `sb:${i}:${k}`, x.d?.[k] ?? x.d?.[0] ?? 1, { label: `${t('setback.distance')} ${k + 1}`, glyph: 'dimHorizontal', min: 0.001 })).join('')}`).join('');
  parts.push(group('refPoint', t('setback.title'), `${pickBox(api, 'sbVertex', [], t('setback.pick'), 'refPoint')}${sb}<p class="pm-note">${escapeHtml(t('setback.help'))}</p>`, (f.setbacks ?? []).length ? '' : 'collapsed'));
  parts.push(keepGroup(api, f));
  return parts.join('');
}

/** Keep features: earlier bosses / cuts the round must not eat (built again after it). */
const KEEPABLE = ['extrude', 'revolve', 'hole', 'sweep', 'loft', 'boundary', 'advancedHole', 'insertPart', 'rib', 'mountingBoss', 'ventFeature', 'lip', 'snapHook'];
function keepGroup(api, f) {
  const { t } = api;
  const list = (api.featuresBefore?.(f) ?? []).filter((x) => KEEPABLE.includes(x.type) && !x.suppressed).slice(1);
  if (!list.length) return '';
  const keep = new Set(f.keep ?? []);
  return group('featFillet', t('keep.title'), `<div class="pm-list">${list.map((x) => check(`list:keep:${x.id}`, keep.has(x.id), x.name, 'featExtrude')).join('')}</div><p class="pm-note">${escapeHtml(t('keep.help'))}</p>`, keep.size ? '' : 'collapsed');
}

export function chamferPm(api, f) {
  const { t } = api;
  const parts = [];
  const kind = f.kind ?? 'distance';
  if (kind === 'vertex') parts.push(group('featChamfer', t('pm.items'), pickBox(api, 'vertex', vertexItems(api, f.vertex), t('pm.vertex'), 'refPoint')));
  else if (kind === 'faceFace') parts.push(group('featChamfer', t('pm.items'), `${pickBox(api, 'faceA', f.faceA ? [faceLabel(api, f.faceA, 0)] : [], t('chamfer.faceA'), 'surface')}${pickBox(api, 'faceB', f.faceB ? [faceLabel(api, f.faceB, 0)] : [], t('chamfer.faceB'), 'surface')}`));
  else parts.push(group('featChamfer', t('pm.items'), items(api, f, 'featChamfer')));
  let p = select('kind', [['distance', t('chamfer.distance')], ['distDist', t('chamfer.distDist')], ['angleDist', t('chamfer.angleDist')], ['offsetFace', t('chamfer.offsetFace')], ['vertex', t('chamfer.vertex')], ['faceFace', t('chamfer.faceFace')]], kind, t('pm.chamferType'));
  p += field(api, 'distance', f.distance, { label: kind === 'offsetFace' ? t('pm.offset1') : t('pm.distance1'), min: 0.001 });
  if (kind === 'distDist' || kind === 'offsetFace' || kind === 'vertex' || kind === 'faceFace') p += field(api, 'distance2', f.distance2 ?? f.distance, { label: kind === 'offsetFace' ? t('pm.offset2') : t('pm.distance2'), min: 0.001 });
  if (kind === 'vertex') p += field(api, 'distance3', f.distance3 ?? f.distance, { label: t('pm.distance3'), min: 0.001 });
  if (kind === 'angleDist') p += field(api, 'angle', f.angle ?? 45, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 });
  if (kind === 'distDist' || kind === 'angleDist' || kind === 'offsetFace' || kind === 'faceFace') p += check('flip', f.flip, t('pm.flipDirection'), 'flipH');
  parts.push(group('dimAngle', t('pm.chamferParameters'), p));
  if (!['vertex', 'faceFace'].includes(kind)) parts.push(keepGroup(api, f));
  return parts.join('');
}

export function shellPm(api, f) {
  const { t } = api;
  const faces = (f.faces ?? []).map((sig, i) => faceLabel(api, sig, i));
  let p = `${field(api, 'thickness', f.thickness, { label: t('pm.thickness'), min: 0.001 })}${pickBox(api, 'faces', faces, t('pm.facesToRemove'), 'featShell')}${check('outward', f.outward, t('pm.shellOutward'), 'flipV')}`;
  if (!(f.faces ?? []).length) p += note(t('pm.help.shellHollow'));
  const parts = [group('featShell', t('pm.parameters'), p)];
  // Multi-thickness: planar faces with their own wall thickness.
  const multi = (f.multi ?? []).map((m, i) => faceLabel(api, m.sig, i));
  let mt = pickBox(api, 'multiFaces', multi, t('pm.multiFaces'), 'surface');
  mt += (f.multi ?? []).map((m, i) => field(api, `mt:${i}`, m.t, { label: `${t('pm.thickness')} — ${multi[i]}`, min: 0.001 })).join('');
  parts.push(group('featShell', t('pm.multiThickness'), mt, (f.multi ?? []).length ? '' : 'collapsed'));
  return parts.join('');
}

/** Linear / circular pattern extras: up to a reference, the seed only in direction 2, a circular second
 * direction, and the instances to skip (a check box per instance, checked = skipped). */
export function patternMorePm(api, f) {
  const { t } = api;
  const parts = [];
  if (f.type === 'linearPattern') {
    let up = check('upTo', f.upTo, t('pm.upToReference'), 'refPoint');
    if (f.upTo) up += `${pickBox(api, 'upToPoint', vertexItems(api, f.upToPoint), t('pm.referenceVertex'), 'refPoint')}${field(api, 'upToOffset', f.upToOffset ?? 0, { label: t('pm.offset') })}`;
    if (f.direction2) up += check('seedOnly2', f.seedOnly2, t('pm.seedOnly2'), 'featLinPattern');
    parts.push(group('featLinPattern', t('pm.patternOptions'), up, f.upTo || f.seedOnly2 ? '' : 'collapsed'));
  } else {
    let d2 = check('dir2', f.dir2, t('pm.direction2'), 'flipH');
    if (f.dir2) d2 += `${field(api, 'count2', f.count2 ?? f.count, { label: t('pm.instances'), unit: 'count', min: 1 })}${field(api, 'angle2', f.angle2 ?? f.angle, { label: t('pm.angle'), unit: 'angle', glyph: 'dimAngle', min: 0.1 })}`;
    parts.push(group('featCirPattern', t('pm.direction2'), d2, f.dir2 ? '' : 'collapsed'));
  }
  // Instances to skip.
  const keys = [];
  if (f.type === 'linearPattern') {
    const n1 = Math.max(1, Math.round(f.count)); const n2 = f.direction2 ? Math.max(1, Math.round(f.count2)) : 1;
    for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) if (i || j) if (!(f.seedOnly2 && i && j)) keys.push([`${i},${j}`, n2 > 1 ? `(${i + 1}, ${j + 1})` : `${i + 1}`]);
  } else {
    for (let i = 1; i < Math.max(1, Math.round(f.count)); i++) keys.push([String(i), `${i + 1}`]);
    if (f.dir2) for (let i = 1; i < Math.max(1, Math.round(f.count2 ?? f.count)); i++) keys.push([`-${i}`, `−${i + 1}`]);
  }
  if (keys.length && keys.length <= 400) {
    const skip = new Set((f.skip ?? []).map(String));
    parts.push(group('featLinPattern', t('pm.instancesToSkip'), `<div class="pm-list">${keys.map(([k, label]) => check(`list:skip:${k}`, skip.has(k), label, 'close')).join('')}</div>`, skip.size ? '' : 'collapsed'));
  }
  return parts.join('');
}

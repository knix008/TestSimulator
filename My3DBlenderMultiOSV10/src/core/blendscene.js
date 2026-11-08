// A .blend file as a scene: objects and parents, meshes with weights and shape keys, materials, modifiers, constraints, armatures, lights,
// cameras and animation. Fields are found by name through the file's own struct table (blendfile.js), so it follows the version that saved it.
// Nothing in the file is run: scripts and drivers stay behind. Checked against a real Blender: npm run verify:blender.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { evalFCurve, insertKey } from './anim.js';
import { createBone, createBoneConstraint, restBoneMatrix, rollFromAxes } from './armature.js';
import { blendObjectMatrix, follow, listOf, openBlend, readBlendMesh, record } from './blendfile.js';
import { addObject, createConstraint, defaultCamera, defaultLight, defaultMaterial, setFrame } from './doc.js';
import { addLink, createNode, defaultShaderGraph } from './nodes.js';

const DEG = 180 / Math.PI;
const nameOf = (rec, fallback) => (rec.sub('id')?.get('name') ?? `XX${fallback}`).slice(2);
const OB = { EMPTY: 0, MESH: 1, CURVE: 2, LIGHT: 10, CAMERA: 11, ARMATURE: 25 };
const QUATERNION = 0;
const AXIS_ANGLE = -1;

const base64 = (bytes) => {
  if (typeof btoa === 'function') { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(s); }
  return Buffer.from(bytes).toString('base64');
};

// ─────────────── modifiers

/** Struct name in the file to this program's modifier. A null result means it cannot be carried over; the caller reports it. */
const MODIFIER_READERS = {
  SubsurfModifierData: (m) => ({ type: 'SUBSURF', levels: m.get('levels') ?? 1 }),
  MirrorModifierData: (m) => { const flag = m.get('flag') ?? 0; return { type: 'MIRROR', x: !!(flag & 8), y: !!(flag & 16), z: !!(flag & 32), merge: !(flag & 128), mergeDistance: m.get('tolerance') ?? 0.001 }; },
  ArrayModifierData: (m, c) => {
    const type = m.get('offset_type') ?? 2;
    const [constant, relative] = [m.get('offset') ?? [0, 0, 0], m.get('scale') ?? [0, 0, 0]];
    const size = c.size();
    const axis = (k) => ((type & 1) ? constant[k] : 0) + ((type & 2) ? relative[k] * size[k] : 0);
    return { type: 'ARRAY', count: m.get('count') ?? 2, offsetX: axis(0), offsetY: axis(1), offsetZ: axis(2) };
  },
  SolidifyModifierData: (m) => ({ type: 'SOLIDIFY', thickness: m.get('offset') ?? 0.01 }),
  BevelModifierData: (m) => ({ type: 'BEVEL', width: m.get('value') ?? 0.1, segments: m.get('res') ?? 1, profile: m.get('profile') ?? 0.5, affect: (m.get('affect_type') ?? 1) === 0 ? 'VERTICES' : 'EDGES', angle: (m.get('bevel_angle') ?? 0.5236) * DEG }),
  DecimateModifierData: (m) => { const mode = m.get('mode') ?? 0; return mode === 1 ? null : { type: 'DECIMATE', mode: mode === 2 ? 'PLANAR' : 'COLLAPSE', ratio: m.get('percent') ?? 1, angle: (m.get('angle') ?? 0.087) * DEG }; },
  BooleanModifierData: (m, c) => ({ type: 'BOOLEAN', operation: ['INTERSECT', 'UNION', 'DIFFERENCE'][m.get('operation') ?? 2] ?? 'DIFFERENCE', object: c.link(m.get('object')) }),
  ScrewModifierData: (m) => ({ type: 'SCREW', angle: (m.get('angle') ?? 6.283) * DEG, steps: m.get('steps') ?? 16, height: m.get('screw_ofs') ?? 0, axis: 'XYZ'[m.get('axis') ?? 2] ?? 'Z' }),
  WeldModifierData: (m) => ({ type: 'WELD', distance: m.get('merge_dist') ?? 0.001 }),
  WireframeModifierData: (m) => ({ type: 'WIREFRAME', thickness: m.get('offset') ?? 0.02 }),
  TriangulateModifierData: () => ({ type: 'TRIANGULATE' }),
  EdgeSplitModifierData: (m) => ({ type: 'EDGE_SPLIT', angle: (m.get('split_angle') ?? 0.5236) * DEG }),
  BuildModifierData: (m) => ({ type: 'BUILD', start: m.get('start') ?? 1, length: m.get('length') ?? 100 }),
  MaskModifierData: (m) => ({ type: 'MASK', group: m.get('vgroup') ?? '', invert: !!((m.get('flag') ?? 0) & 1) }),
  RemeshModifierData: (m, c) => {
    const mode = ['BLOCKS', 'SMOOTH', 'SHARP', 'VOXEL'][m.get('mode') ?? 3] ?? 'VOXEL';
    if (mode === 'VOXEL') return { type: 'REMESH', mode, voxelSize: m.get('voxel_size') ?? 0.1, smooth: true };
    // Octree cells: the longest side, widened by its scale setting, halved depth times.
    return { type: 'REMESH', mode, voxelSize: Math.max(...c.size()) / Math.max(1e-6, m.get('scale') ?? 0.9) / 2 ** (m.get('depth') ?? 4), smooth: false };
  },
  MultiresModifierData: (m) => ({ type: 'MULTIRES', levels: m.get('lvl') ?? 1, total: m.get('totlvl') ?? 1 }),
  SkinModifierData: () => ({ type: 'SKIN', method: 'QUADS' }),
  DisplaceModifierData: (m) => ({ type: 'DISPLACE', strength: m.get('strength') ?? 1, midlevel: m.get('midlevel') ?? 0.5 }),
  WaveModifierData: (m) => ({ type: 'WAVE', height: m.get('height') ?? 0.5, width: m.get('width') ?? 1.5, speed: m.get('speed') ?? 0.25 }),
  SmoothModifierData: (m) => ({ type: 'SMOOTH', factor: m.get('fac') ?? 0.5, iterations: m.get('repeat') ?? 1 }),
  SimpleDeformModifierData: (m) => {
    const mode = ['', 'TWIST', 'BEND', 'TAPER', 'STRETCH'][m.get('mode') ?? 1] ?? 'TWIST';
    return { type: 'SIMPLE_DEFORM', mode, angle: (m.get('factor') ?? 0.785) * DEG, factor: m.get('factor') ?? 0.785, axis: 'XYZ'[m.get('deform_axis') ?? 0] ?? 'X' };
  },
  CastModifierData: (m) => ({ type: 'CAST', factor: m.get('fac') ?? 0.5, radius: m.get('radius') ?? 0 }),
  ShrinkwrapModifierData: (m, c) => ({ type: 'SHRINKWRAP', object: c.link(m.get('target')), offset: m.get('keepDist') ?? 0 }),
  LatticeModifierData: (m, c) => ({ type: 'LATTICE', object: c.link(m.get('object')) }),
  ArmatureModifierData: (m, c) => ({ type: 'ARMATURE', object: c.link(m.get('object')) }),
};

/** Struct name to constraint. Only the data block says which kind a constraint is across versions. */
const CONSTRAINT_READERS = {
  bLocateLikeConstraint: 'COPY_LOCATION',
  bRotateLikeConstraint: 'COPY_ROTATION',
  bSizeLikeConstraint: 'COPY_SCALE',
  bTransLikeConstraint: 'COPY_TRANSFORMS',
  bTrackToConstraint: 'TRACK_TO',
  bDampTrackConstraint: 'DAMPED_TRACK',
  bChildOfConstraint: 'CHILD_OF',
  bDistLimitConstraint: 'LIMIT_DISTANCE',
  bMinMaxConstraint: 'FLOOR',
  bRotLimitConstraint: 'LIMIT_ROTATION',
  bSizeLimitConstraint: 'LIMIT_SCALE',
  bLockTrackConstraint: 'LOCKED_TRACK',
  bStretchToConstraint: 'STRETCH_TO',
  bSameVolumeConstraint: 'MAINTAIN_VOLUME',
  bPivotConstraint: 'PIVOT',
  bFollowPathConstraint: 'FOLLOW_PATH',
  bClampToConstraint: 'CLAMP_TO',
  bLocLimitConstraint: 'LIMIT_LOCATION',
  bTransformConstraint: 'TRANSFORMATION',
  bSplineIKConstraint: 'SPLINE_IK',
  bArmatureConstraint: 'ARMATURE',
  bActionConstraint: 'ACTION',
  bShrinkwrapConstraint: 'SHRINKWRAP',
};
/** bActionConstraint's numbers, as Blender 4.5 writes them. */
const ACTION_CHANNEL = { 0: 'ROTATION_X', 1: 'ROTATION_Y', 2: 'ROTATION_Z', 10: 'SCALE_X', 11: 'SCALE_Y', 12: 'SCALE_Z', 20: 'LOCATION_X', 21: 'LOCATION_Y', 22: 'LOCATION_Z' };
const ACTION_MIX = { 0: 'AFTER_FULL', 1: 'AFTER', 2: 'BEFORE', 3: 'BEFORE_FULL', 4: 'AFTER_SPLIT', 5: 'BEFORE_SPLIT', 6: 'REPLACE' };

const DEGREES = 180 / Math.PI;
const AXIS_NAMES = ['X', 'Y', 'Z', '-X', '-Y', '-Z'];

/** A bone constraint from the file, or null when this program has no such kind. */
function readBoneConstraint(con, d, kind, link, file) {
  const known = ['COPY_LOCATION', 'COPY_ROTATION', 'COPY_SCALE', 'COPY_TRANSFORMS', 'LIMIT_ROTATION', 'LIMIT_LOCATION', 'LIMIT_SCALE', 'DAMPED_TRACK', 'LOCKED_TRACK', 'STRETCH_TO', 'TRANSFORMATION', 'SPLINE_IK', 'ARMATURE', 'ACTION'];
  if (!known.includes(kind)) return null;
  const c = createBoneConstraint(kind);
  c.name = con.get('name') ?? c.name;
  c.influence = con.get('enforce') ?? 1;
  if (con.get('flag') != null && (con.get('flag') & 512)) c.enabled = false;
  if ('target' in c) { c.target = link(d.get('tar')); c.subtarget = d.get('subtarget') ?? ''; }
  // World and pose space read the same here; the bone's own space is the third.
  if ('space' in c) c.space = con.get('ownspace') === 1 ? 'LOCAL' : 'POSE';
  const flag = d.get('flag') ?? 0;
  switch (kind) {
    case 'COPY_LOCATION': c.useX = !!(flag & 1); c.useY = !!(flag & 2); c.useZ = !!(flag & 4); break;
    case 'LIMIT_ROTATION':
      c.useX = !!(flag & 1); c.useY = !!(flag & 2); c.useZ = !!(flag & 4);
      for (const [to, from] of [['minX', 'xmin'], ['maxX', 'xmax'], ['minY', 'ymin'], ['maxY', 'ymax'], ['minZ', 'zmin'], ['maxZ', 'zmax']]) c[to] = (d.get(from) ?? 0) * DEGREES;
      break;
    case 'LIMIT_LOCATION':
      // One flag per end; an axis with one end free is open on that side.
      c.useX = !!(flag & 3); c.useY = !!(flag & 12); c.useZ = !!(flag & 48);
      c.minX = flag & 1 ? d.get('xmin') : -Infinity; c.maxX = flag & 2 ? d.get('xmax') : Infinity;
      c.minY = flag & 4 ? d.get('ymin') : -Infinity; c.maxY = flag & 8 ? d.get('ymax') : Infinity;
      c.minZ = flag & 16 ? d.get('zmin') : -Infinity; c.maxZ = flag & 32 ? d.get('zmax') : Infinity;
      break;
    case 'LIMIT_SCALE': c.min = d.get('xmin') ?? c.min; c.max = d.get('xmax') ?? c.max; break;
    case 'DAMPED_TRACK': c.axis = AXIS_NAMES[d.get('trackflag') ?? 1] ?? 'Y'; break;
    case 'LOCKED_TRACK': c.axis = AXIS_NAMES[d.get('trackflag') ?? 1] ?? 'Y'; c.lock = AXIS_NAMES[d.get('lockflag') ?? 2] ?? 'Z'; break;
    case 'STRETCH_TO': c.rest = d.get('orglength') ?? 0; c.volume = (d.get('volmode') ?? 0) !== 3; break;
    case 'SPLINE_IK': c.chain = d.get('chainlen') ?? 2; break;
    case 'ACTION': {
      // The action itself is read by the caller, which knows the rig.
      c.channel = ACTION_CHANNEL[d.get('type') ?? 20] ?? 'LOCATION_X';
      // Blender keeps a rotation range in degrees here, unlike its other angles.
      c.min = d.get('min') ?? 0;
      c.max = d.get('max') ?? 0;
      c.frameStart = d.get('start') ?? 1;
      c.frameEnd = d.get('end') ?? 1;
      c.mix = ACTION_MIX[d.get('mix_mode') ?? 5] ?? 'BEFORE_SPLIT';
      c.targetSpace = con.get('tarspace') === 1 ? 'LOCAL' : 'WORLD';
      c.useEvalTime = !!(flag & 2);
      c.evalTime = d.get('eval_time') ?? 0;
      break;
    }
    case 'ARMATURE': {
      const targets = listOf(file, d.sub('targets'));
      if (targets[0]) { c.target = link(targets[0].get('tar')); c.subtarget = targets[0].get('subtarget') ?? ''; c.weight = targets[0].get('weight') ?? 1; }
      if (targets[1]) { c.target2 = link(targets[1].get('tar')); c.subtarget2 = targets[1].get('subtarget') ?? ''; c.weight2 = targets[1].get('weight') ?? 1; }
      break;
    }
    case 'TRANSFORMATION': {
      const kinds = ['LOCATION', 'ROTATION', 'SCALE'];
      c.fromType = kinds[d.get('from') ?? 0];
      c.toType = kinds[d.get('to') ?? 0];
      const read = (name, type) => {
        const suffix = type === 'ROTATION' ? '_rot' : type === 'SCALE' ? '_scale' : '';
        const values = d.get(`${name}${suffix}`) ?? d.get(name) ?? [0, 0, 0];
        return type === 'ROTATION' ? values.map((x) => x * DEGREES) : values;
      };
      const [a, b, e, f] = [read('from_min', c.fromType), read('from_max', c.fromType), read('to_min', c.toType), read('to_max', c.toType)];
      ['X', 'Y', 'Z'].forEach((axis, n) => { c[`fromMin${axis}`] = a[n]; c[`fromMax${axis}`] = b[n]; c[`toMin${axis}`] = e[n]; c[`toMax${axis}`] = f[n]; });
      break;
    }
    default:
  }
  return c;
}

// ─────────────── animation

/** The curves an AnimData drives: from the old list, or from the layers and slots actions have had since 4.4. */
function curvesOf(file, owner) {
  const pointer = owner.get('adt');
  const block = follow(file, pointer);
  if (!block) return [];
  const adt = record(file, file.structs[block.index], block.data);
  const actionBlock = follow(file, adt.get('action'));
  if (!actionBlock) return [];
  return actionCurves(file, record(file, file.structs[actionBlock.index], actionBlock.data), adt.get('slot_handle'));
}

/** An action's curves: from the old list, or the channel bag of one slot (null: any) of a layered action. */
function actionCurves(file, action, slot) {
  const out = [];
  const read = (curve) => {
    const path = follow(file, curve.get('rna_path'));
    const bezt = follow(file, curve.get('bezt'));
    const count = curve.get('totvert') ?? 0;
    if (!path || !bezt || !count) return;
    const struct = file.structs[bezt.index];
    const keys = [];
    for (let i = 0; i < count; i++) {
      const b = record(file, struct, bezt.data + i * struct.size);
      const vec = b.get('vec');
      const ipo = b.get('ipo') ?? 2;
      keys.push({ f: vec[3], v: vec[4], hl: [vec[0], vec[1]], hr: [vec[6], vec[7]], interp: ipo === 0 ? 'CONSTANT' : ipo === 1 ? 'LINEAR' : 'BEZIER' });
    }
    out.push({ path: file.text(path), index: curve.get('array_index') ?? 0, keys });
  };
  for (const curve of listOf(file, action.sub('curves'))) read(curve);
  // Layered actions: arrays of pointers, and only the channels of this owner's slot.
  const pointers = (rec, name, countName) => {
    const b = follow(file, rec.get(name));
    const n = rec.get(countName) ?? 0;
    if (!b) return [];
    return Array.from({ length: n }, (_, i) => follow(file, file.ptr(b.data + i * file.pointer))).filter(Boolean).map((x) => record(file, file.structs[x.index], x.data));
  };
  for (const data of pointers(action, 'strip_keyframe_data_array', 'strip_keyframe_data_array_num')) {
    for (const bag of pointers(data, 'channelbag_array', 'channelbag_array_num')) {
      if (slot != null && bag.get('slot_handle') !== slot) continue;
      for (const curve of pointers(bag, 'fcurve_array', 'fcurve_array_num')) read(curve);
    }
  }
  return out;
}

/** A curve's value at a frame, through the same evaluation everything here animates with. */
const valueAt = (keys, frame) => evalFCurve({ fcurves: { x: keys } }, 'x', frame);

/** A pose channel's or an object's transform at a frame. `paths` turns a property into the curve path. */
function channelTransform(rec, curves, frame, paths) {
  const pick = (field, property, fallback) => {
    const base = rec.get(field) ?? fallback;
    return base.map((v, k) => {
      const curve = curves.find((c) => c.path === paths(property) && c.index === k);
      return curve ? valueAt(curve.keys, frame) : v;
    });
  };
  const size = pick('size', 'scale', [1, 1, 1]);
  const location = pick('loc', 'location', [0, 0, 0]);
  const mode = rec.get('rotmode') ?? 1;
  let q;
  if (mode === QUATERNION) { const v = pick('quat', 'rotation_quaternion', [1, 0, 0, 0]); q = new Quaternion(v[1], v[2], v[3], v[0]).normalize(); }
  else if (mode === AXIS_ANGLE) {
    const axis = rec.get('rotAxis') ?? [0, 1, 0];
    const angle = rec.get('rotAngle') ?? 0;
    const v = [angle, ...axis].map((x, k) => { const curve = curves.find((c) => c.path === paths('rotation_axis_angle') && c.index === k); return curve ? valueAt(curve.keys, frame) : x; });
    q = new Quaternion().setFromAxisAngle(new Vector3(v[1], v[2], v[3]).normalize(), v[0]);
  } else {
    const r = pick(rec.has('eul') ? 'eul' : 'rot', 'rotation_euler', [0, 0, 0]);
    const order = { 1: 'ZYX', 2: 'YZX', 3: 'ZXY', 4: 'XZY', 5: 'YXZ', 6: 'XYZ' }[mode] ?? 'ZYX';
    q = new Quaternion().setFromEuler(new Euler(r[0], r[1], r[2], order));
  }
  return new Matrix4().compose(new Vector3(...location), q, new Vector3(...size));
}

const unwrap = (angle, previous) => (previous == null ? angle : angle + Math.round((previous - angle) / 360) * 360);

// ─────────────── materials

function readMaterial(file, doc, block, memo) {
  if (memo.has(block.old)) return memo.get(block.old);
  const ma = record(file, file.structs[block.index], block.data);
  const mat = { ...defaultMaterial(nameOf(ma, 'Material')), baseColor: [ma.get('r') ?? 0.8, ma.get('g') ?? 0.8, ma.get('b') ?? 0.8], metallic: ma.get('metallic') ?? 0, roughness: ma.get('roughness') ?? 0.5 };
  doc.materials.push(mat);
  memo.set(block.old, mat);
  const treeBlock = follow(file, ma.get('nodetree'));
  if (!treeBlock) return mat;
  const tree = record(file, file.structs[treeBlock.index], treeBlock.data);
  const nodes = listOf(file, tree.sub('nodes'));
  const principled = nodes.find((n) => n.get('idname') === 'ShaderNodeBsdfPrincipled');
  if (!principled) return mat;
  const socket = (name) => {
    const s = listOf(file, principled.sub('inputs')).find((x) => x.get('name') === name);
    const value = s && follow(file, s.get('default_value'));
    return value ? record(file, file.structs[value.index], value.data).get('value') : null;
  };
  const color = socket('Base Color');
  if (color) mat.baseColor = color.slice(0, 3);
  mat.metallic = socket('Metallic') ?? mat.metallic;
  mat.roughness = socket('Roughness') ?? mat.roughness;
  // A packed picture on Base Color. One kept as an outside file cannot be read from here.
  const inputs = listOf(file, principled.sub('inputs'));
  const base = inputs.find((x) => x.get('name') === 'Base Color');
  const link = listOf(file, tree.sub('links')).find((l) => base && l.old('tosock') === base.address);
  const source = link && nodes.find((n) => n.address === link.get('fromnode') && n.get('idname') === 'ShaderNodeTexImage');
  const imageBlock = source && follow(file, source.get('id'));
  if (imageBlock) {
    const image = record(file, file.structs[imageBlock.index], imageBlock.data);
    const packed = listOf(file, image.sub('packedfiles'))[0];
    const holder = packed && follow(file, packed.get('packedfile'));
    const pf = holder && record(file, file.structs[holder.index], holder.data);
    const bytes = pf && follow(file, pf.get('data'));
    if (bytes) {
      const raw = file.bytes.subarray(bytes.data, bytes.data + (pf.get('size') ?? bytes.size));
      const mime = raw[0] === 0xff ? 'image/jpeg' : 'image/png';
      const entry = { id: `img_blend_${imageBlock.old}`, name: nameOf(image, 'Image'), dataUrl: `data:${mime};base64,${base64(raw)}` };
      if (!(doc.images ??= []).some((x) => x.id === entry.id)) doc.images.push(entry);
      mat.useNodes = true;
      mat.nodes = defaultShaderGraph(mat);
      const bsdf = mat.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
      const tex = createNode('TEX_IMAGE', bsdf.x - 280, bsdf.y, { image: entry.id });
      mat.nodes.nodes.push(tex);
      addLink(mat.nodes, tex.id, 'Color', bsdf.id, 'Base Color');
    }
  }
  return mat;
}

// ─────────────── curves

/** A spline's line as Blender draws it. Handles and knots are this program's points then: its own splines have neither. */
function readSpline(file, nurb, resolution) {
  const kind = nurb.get('type') ?? 0;
  const count = nurb.get('pntsu') ?? 0;
  const cyclic = !!((nurb.get('flagu') ?? 0) & 1);
  const steps = Math.max(1, nurb.get('resolu') || resolution || 12);
  if (kind === 1) {
    const block = follow(file, nurb.get('bezt'));
    if (!block) return null;
    const struct = file.structs[block.index];
    const keys = Array.from({ length: count }, (_, i) => record(file, struct, block.data + i * struct.size).get('vec'));
    const points = [];
    const segments = cyclic ? count : count - 1;
    for (let i = 0; i < segments; i++) {
      const [a, b] = [keys[i], keys[(i + 1) % count]];
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const m = 1 - t;
        points.push([0, 1, 2].map((k) => m * m * m * a[3 + k] + 3 * m * m * t * a[6 + k] + 3 * m * t * t * b[k] + t * t * t * b[3 + k]));
      }
    }
    if (!cyclic) points.push(keys[count - 1].slice(3, 6));
    return { kind: 'POLY', cyclic, points };
  }
  const block = follow(file, nurb.get('bp'));
  if (!block) return null;
  const struct = file.structs[block.index];
  const control = Array.from({ length: count }, (_, i) => record(file, struct, block.data + i * struct.size).get('vec'));
  if (kind === 0) return { kind: 'POLY', cyclic, points: control.map((v) => v.slice(0, 3)) };
  // NURBS, by de Boor: weights in the fourth place, clamped at the ends when asked.
  const order = Math.min(count, Math.max(2, nurb.get('orderu') ?? 4));
  const endpoint = !!((nurb.get('flagu') ?? 0) & 2);
  const knots = Array.from({ length: count + order }, (_, i) => (endpoint ? Math.max(0, Math.min(count - order + 1, i - order + 1)) : i));
  const [lo, hi] = endpoint ? [0, count - order + 1] : [order - 1, count];
  const total = Math.max(2, steps * (count - order + 1));
  const points = [];
  for (let n = 0; n <= total; n++) {
    const x = lo + ((hi - lo) * n) / total;
    let span = order - 1;
    while (span < count - 1 && x >= knots[span + 1]) span++;
    const d = Array.from({ length: order }, (_, j) => { const v = control[span - order + 1 + j]; const w = v[3] || 1; return [v[0] * w, v[1] * w, v[2] * w, w]; });
    for (let r = 1; r < order; r++) for (let j = order - 1; j >= r; j--) {
      const i = span - order + 1 + j;
      const denominator = knots[i + order - r] - knots[i];
      const a = denominator ? (x - knots[i]) / denominator : 0;
      d[j] = d[j].map((c, k) => (1 - a) * d[j - 1][k] + a * c);
    }
    points.push([d[order - 1][0] / d[order - 1][3], d[order - 1][1] / d[order - 1][3], d[order - 1][2] / d[order - 1][3]]);
  }
  return { kind: 'POLY', cyclic: false, points };
}

function readCurve(file, data) {
  const resolution = data.get('resolu') ?? 12;
  const splines = listOf(file, data.sub('nurb')).map((n) => readSpline(file, n, resolution)).filter(Boolean);
  return { splines, bevelDepth: data.get('bevel_radius') ?? data.get('ext2') ?? 0, resolution: 1 };
}

// ─────────────── the scene

/**
 * Adds what the file holds to the document and returns the new objects, with `left` listing in words what could not come along
 * (modifier kinds this program lacks, object types it cannot read from the file).
 */
export function importBlendScene(doc, input) {
  const file = openBlend(input);
  const blocks = new Map();
  for (const b of file.blocks) if (b.code === 'OB') blocks.set(b.old, record(file, file.structs[b.index], b.data));
  const created = [];
  const left = new Set();
  const made = new Map();
  const materials = new Map();
  const rigs = new Map();
  /** Actions read for Action constraints, by their place in the file. */
  const actions = new Map();

  // First the objects themselves, so that anything can point at anything.
  for (const [old, ob] of blocks) {
    const type = ob.get('type');
    const name = nameOf(ob, 'Object');
    const dataBlock = follow(file, ob.get('data'));
    const data = dataBlock ? record(file, file.structs[dataBlock.index], dataBlock.data) : null;
    let props = null;
    if (type === OB.MESH && dataBlock?.code === 'ME') {
      const { mesh } = readBlendMesh(file, dataBlock, ob);
      const slots = follow(file, data.get('mat'));
      const total = data.get('totcol') ?? 0;
      const ids = [];
      for (let i = 0; slots && i < total; i++) {
        const m = follow(file, file.ptr(slots.data + i * file.pointer));
        if (m) ids.push(readMaterial(file, doc, m, materials).id);
      }
      props = { type: 'MESH', data: mesh, materials: ids };
    } else if (type === OB.ARMATURE && data) {
      const bones = [];
      const binds = [];
      const walk = (list, parent) => {
        for (const b of list) {
          const index = bones.length;
          const made = createBone(b.get('name') ?? 'Bone', b.get('arm_head'), b.get('arm_tail'), parent);
          const frame = b.get('arm_mat');
          // The file states each bone's frame: with it, poses here mean what they mean there.
          made.useRoll = true;
          made.roll = rollFromAxes(made.head, made.tail, [frame[0], frame[1], frame[2]]);
          bones.push(made);
          binds.push(new Matrix4().fromArray(frame));
          walk(listOf(file, b.sub('childbase')), index);
        }
      };
      walk(listOf(file, data.sub('bonebase')), null);
      props = { type: 'ARMATURE', data: { bones } };
      rigs.set(old, { binds, ids: bones.map((b) => b.name) });
    } else if (type === OB.LIGHT && data) {
      const kind = { 0: 'POINT', 1: 'SUN', 2: 'SPOT', 4: 'AREA' }[data.get('type')] ?? 'POINT';
      const light = defaultLight(kind);
      light.color = [data.get('r') ?? 1, data.get('g') ?? 1, data.get('b') ?? 1];
      light.energy = data.get('energy') ?? data.get('energy_new') ?? light.energy;
      light.radius = data.get('radius') ?? data.get('area') ?? light.radius;
      light.spotSize = (data.get('spotsize') ?? 0.785) * DEG;
      light.spotBlend = data.get('spotblend') ?? light.spotBlend;
      light.size = data.get('area_size') ?? data.get('area') ?? light.size;
      props = { type: 'LIGHT', data: light };
    } else if (type === OB.CAMERA && data) {
      const camera = defaultCamera();
      camera.kind = data.get('type') === 1 ? 'ORTHO' : 'PERSP';
      camera.lens = data.get('lens') ?? camera.lens;
      camera.sensor = data.get('sensor_x') ?? camera.sensor;
      camera.clipStart = data.get('clip_start') ?? data.get('clipsta') ?? camera.clipStart;
      camera.clipEnd = data.get('clip_end') ?? data.get('clipend') ?? camera.clipEnd;
      camera.orthoScale = data.get('ortho_scale') ?? camera.orthoScale;
      const dof = data.sub('dof');
      if (dof) { camera.dofFocus = dof.get('focus_distance') ?? camera.dofFocus; camera.fstop = dof.get('aperture_fstop') ?? camera.fstop; camera.dofEnabled = !!((dof.get('flag') ?? 0) & 1); }
      props = { type: 'CAMERA', data: camera };
    } else if (type === OB.CURVE && data) {
      props = { type: 'CURVE', data: readCurve(file, data) };
    } else {
      if (type !== OB.EMPTY) left.add(`${name}: object type ${type} (kept as an empty at its place)`);
      props = { type: 'EMPTY' };
    }
    const obj = addObject(doc, { ...props, name });
    made.set(old, obj);
    created.push(obj);
  }

  const fps = doc.fps || 24;
  void fps;
  let lastFrame = 0;
  const setKeys = (target, path, keys, scale = 1) => {
    target.anim ??= { fcurves: {}, nla: [] };
    target.anim.fcurves[path] = keys.map((k) => ({ f: k.f, v: k.v * scale, interp: k.interp, hl: [k.hl[0], k.hl[1] * scale], hr: [k.hr[0], k.hr[1] * scale], handleType: 'FREE' }));
    lastFrame = Math.max(lastFrame, ...keys.map((k) => k.f));
  };

  for (const [old, ob] of blocks) {
    const obj = made.get(old);
    const mode = ob.get('rotmode') ?? 1;
    const parts = () => {
      const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
      blendObjectMatrix(ob).decompose(p, q, s);
      const e = new Euler().setFromQuaternion(q, 'ZYX');
      return { location: p.toArray(), rotation: [e.x * DEG, e.y * DEG, e.z * DEG], scale: s.toArray() };
    };
    Object.assign(obj, parts());
    obj.rotationMode = 'XYZ';
    if (mode === 1) obj.rotation = (ob.get('rot') ?? [0, 0, 0]).map((a) => a * DEG);
    const hidden = (ob.get('visibility_flag') ?? 0) & 1;
    if (hidden) obj.hide = true;

    // The parent, a bone being the point at its tail as it stands in the file.
    const parent = ob.get('parent');
    if (parent && made.has(parent)) {
      obj.parent = made.get(parent).id;
      const inverse = new Matrix4().fromArray(ob.get('parentinv') ?? new Matrix4().elements);
      if (ob.get('partype') === 7) {
        const rig = rigs.get(parent);
        const index = rig?.ids.indexOf(ob.get('parsubstr'));
        if (index >= 0) {
          const bone = made.get(parent).data.bones[index];
          const length = new Vector3(...bone.head).distanceTo(new Vector3(...bone.tail));
          inverse.premultiply(new Matrix4().copy(rig.binds[index]).multiply(new Matrix4().makeTranslation(0, length, 0)));
          left.add(`${obj.name}: rides a bone, kept where it stands at rest`);
        }
      }
      obj.parentInverse = [...inverse.elements];
    }

    // Modifiers, in order.
    const c = {
      link: (pointer) => (pointer && made.has(pointer) ? made.get(pointer).id : null),
      size: () => {
        const verts = obj.data?.verts ?? [];
        if (!verts.length) return [0, 0, 0];
        return [0, 1, 2].map((k) => Math.max(...verts.map((v) => v[k])) - Math.min(...verts.map((v) => v[k])));
      },
    };
    for (const m of listOf(file, ob.sub('modifiers'))) {
      const reader = MODIFIER_READERS[m.structName];
      const read = reader && obj.type === 'MESH' ? reader(m, c) : null;
      const shown = m.sub('modifier')?.get('name') ?? m.structName;
      if (!read) { left.add(`${obj.name}: modifier ${shown}`); continue; }
      const mode2 = m.sub('modifier')?.get('mode') ?? 3;
      obj.modifiers.push({ show: !!(mode2 & 1), showRender: !!(mode2 & 2), name: shown, ...read });
    }

    // Constraints
    for (const con of listOf(file, ob.sub('constraints'))) {
      const dataBlock = follow(file, con.get('data'));
      const kind = dataBlock && CONSTRAINT_READERS[file.structs[dataBlock.index].name];
      if (!kind) { left.add(`${obj.name}: constraint ${con.get('name')}`); continue; }
      const made2 = createConstraint(kind);
      const d = record(file, file.structs[dataBlock.index], dataBlock.data);
      made2.name = con.get('name') ?? made2.name;
      if ('target' in made2) made2.target = c.link(d.get('tar'));
      if ('influence' in made2) made2.influence = con.get('enforce') ?? 1;
      if (kind === 'LIMIT_DISTANCE') made2.distance = d.get('dist') ?? made2.distance;
      if (kind === 'FLOOR') made2.offset = d.get('offset') ?? made2.offset;
      if (kind === 'LIMIT_ROTATION') {
        const flag = d.get('flag') ?? 0;
        made2.useX = !!(flag & 1); made2.useY = !!(flag & 2); made2.useZ = !!(flag & 4);
        for (const [to, from] of [['minX', 'xmin'], ['maxX', 'xmax'], ['minY', 'ymin'], ['maxY', 'ymax'], ['minZ', 'zmin'], ['maxZ', 'zmax']]) made2[to] = (d.get(from) ?? 0) * DEGREES;
      }
      if (kind === 'LIMIT_LOCATION') {
        const flag = d.get('flag') ?? 0;
        made2.minX = flag & 1 ? d.get('xmin') : -1e9; made2.maxX = flag & 2 ? d.get('xmax') : 1e9;
        made2.minY = flag & 4 ? d.get('ymin') : -1e9; made2.maxY = flag & 8 ? d.get('ymax') : 1e9;
        made2.minZ = flag & 16 ? d.get('zmin') : -1e9; made2.maxZ = flag & 32 ? d.get('zmax') : 1e9;
      }
      if (kind === 'LIMIT_SCALE') { made2.min = d.get('xmin') ?? made2.min; made2.max = d.get('xmax') ?? made2.max; }
      if (kind === 'STRETCH_TO') { made2.rest = d.get('orglength') || made2.rest; made2.volume = (d.get('volmode') ?? 0) !== 3; }
      if (kind === 'TRANSFORMATION' || kind === 'ARMATURE') {
        // Read as a bone's would be; what an object's has no room for is dropped.
        const read = readBoneConstraint(con, d, kind, (pointer) => c.link(pointer), file);
        for (const key of Object.keys(made2)) if (key in read && key !== 'type') made2[key] = read[key];
      }
      if (kind === 'SHRINKWRAP') {
        made2.target = c.link(d.get('target'));
        made2.mode = ['NEAREST_SURFACE', 'PROJECT', 'NEAREST_VERTEX', 'PROJECT'][d.get('shrinkType') ?? 0] ?? 'NEAREST_SURFACE';
        made2.distance = d.get('dist') ?? 0;
        made2.axis = AXIS_NAMES[d.get('projAxis') ?? 0] ?? 'X';
      }
      obj.constraints.push(made2);
    }

    // Shape key animation is not carried; a key's value is.
    const curves = curvesOf(file, ob);
    const plain = curves.filter((x) => !x.path.startsWith('pose.bones'));
    const direct = { location: ['location', 1], scale: ['scale', 1], rotation_euler: ['rotation', DEG] };
    if (mode === 1 || !plain.some((x) => x.path.startsWith('rotation_'))) {
      for (const curve of plain) {
        const to = direct[curve.path];
        if (to) setKeys(obj, `${to[0]}.${curve.index}`, curve.keys, to[1]);
      }
    } else {
      // A rotation in another mode: turned into XYZ frame by frame.
      const frames = plain.flatMap((x) => x.keys.map((k) => k.f));
      const [from, to] = [Math.floor(Math.min(...frames)), Math.ceil(Math.max(...frames))];
      let before = [null, null, null];
      for (let f = from; f <= to; f++) {
        const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
        channelTransform(ob, plain, f, (x) => x).decompose(p, q, s);
        const e = new Euler().setFromQuaternion(q, 'ZYX');
        const rotation = [e.x * DEG, e.y * DEG, e.z * DEG].map((a, k) => unwrap(a, before[k]));
        before = rotation;
        for (const [name, values] of [['location', p.toArray()], ['rotation', rotation], ['scale', s.toArray()]]) values.forEach((v, k) => insertKey(obj, `${name}.${k}`, f, v, 'LINEAR'));
        lastFrame = Math.max(lastFrame, f);
      }
    }

    // A rig's pose, and how it moves: what each bone does in this program's terms, since its rest axes differ from Blender's by the roll.
    const rig = rigs.get(old);
    if (rig) {
      const bones = obj.data.bones;
      const rest = bones.map((b) => restBoneMatrix(b));
      const poseBlock = follow(file, ob.get('pose'));
      const pose = poseBlock ? record(file, file.structs[poseBlock.index], poseBlock.data) : null;
      const channels = new Map((pose ? listOf(file, pose.sub('chanbase')) : []).map((ch) => [ch.get('name'), ch]));
      const pathOf = (bone) => (property) => `pose.bones["${bone}"].${property}`;
      /**
       * An action read through a constraint, into the library: each bone it moves, frame by frame in tenths so that a frame between keys reads true,
       * turned from Blender's bone axes into this program's (they differ by the roll unless the rest frames agree). Channels it lacks stay at rest.
       */
      const libraryAction = (actionBlock, slot) => {
        if (!actionBlock) return null;
        if (actions.has(actionBlock.old)) return actions.get(actionBlock.old);
        const act = record(file, file.structs[actionBlock.index], actionBlock.data);
        const list = actionCurves(file, act, slot || null);
        const holder = { anim: { fcurves: {} } };
        const frames = list.flatMap((x) => x.keys.map((k) => k.f));
        if (frames.length) {
          const [from, to] = [Math.min(...frames), Math.max(...frames)];
          const step = to - from > 400 ? 1 : 0.1;
          bones.forEach((b, i) => {
            if (!list.some((x) => x.path.startsWith(`pose.bones["${b.name}"]`))) return;
            const ch = channels.get(b.name);
            const bare = { get: (k) => (k === 'rotmode' ? ch?.get('rotmode') ?? 1 : undefined), has: () => true };
            const C = new Matrix4().copy(rig.binds[i]).invert().multiply(rest[i]);
            C.setPosition(0, 0, 0);
            const Ci = C.clone().invert();
            let before = [null, null, null];
            for (let n = 0; from + n * step <= to + 1e-9; n++) {
              const f = Math.round((from + n * step) * 1000) / 1000;
              const local = Ci.clone().multiply(channelTransform(bare, list, f, pathOf(b.name))).multiply(C);
              const [p, q, sc] = [new Vector3(), new Quaternion(), new Vector3()];
              local.decompose(p, q, sc);
              const e = new Euler().setFromQuaternion(q);
              const rotation = [e.x * DEG, e.y * DEG, e.z * DEG].map((a, k) => unwrap(a, before[k]));
              before = rotation;
              for (const [name, values] of [['location', p.toArray()], ['rotation', rotation], ['scale', sc.toArray()]]) values.forEach((v, k) => insertKey(holder, `bones.${i}.pose.${name}.${k}`, f, v, 'LINEAR'));
            }
          });
        }
        doc.actions ??= [];
        const made = { id: `act${doc.actions.length}_${Date.now().toString(36)}`, name: nameOf(act, 'Action'), fcurves: holder.anim.fcurves, bones: bones.map((b) => b.name) };
        doc.actions.push(made);
        actions.set(actionBlock.old, made);
        return made;
      };
      const at = (frame) => {
        const posed = [];
        bones.forEach((b, i) => {
          const channel = channels.get(b.name);
          const local = channel ? channelTransform(channel, curves, frame, pathOf(b.name)) : new Matrix4();
          const relative = b.parent != null ? new Matrix4().copy(rig.binds[b.parent]).invert().multiply(rig.binds[i]) : rig.binds[i].clone();
          posed.push((b.parent != null ? posed[b.parent].clone() : new Matrix4()).multiply(relative).multiply(local));
        });
        const ours = posed.map((m, i) => m.clone().multiply(new Matrix4().copy(rig.binds[i]).invert()).multiply(rest[i]));
        return bones.map((b, i) => {
          const local = b.parent != null
            ? new Matrix4().copy(rest[i]).invert().multiply(rest[b.parent]).multiply(new Matrix4().copy(ours[b.parent]).invert()).multiply(ours[i])
            : new Matrix4().copy(rest[i]).invert().multiply(ours[i]);
          const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
          local.decompose(p, q, s);
          const e = new Euler().setFromQuaternion(q);
          return { location: p.toArray(), rotation: [e.x * DEG, e.y * DEG, e.z * DEG], scale: s.toArray() };
        });
      };
      at(doc.frame ?? 1).forEach((p, i) => { bones[i].pose = p; });
      const boneCurves = curves.filter((x) => x.path.startsWith('pose.bones'));
      if (boneCurves.length) {
        const frames = boneCurves.flatMap((x) => x.keys.map((k) => k.f));
        const [from, to] = [Math.floor(Math.min(...frames)), Math.ceil(Math.max(...frames))];
        const before = bones.map(() => [null, null, null]);
        for (let f = from; f <= to; f++) {
          at(f).forEach((p, i) => {
            p.rotation = p.rotation.map((a, k) => unwrap(a, before[i][k]));
            before[i] = p.rotation;
            for (const name of ['location', 'rotation', 'scale']) p[name].forEach((v, k) => insertKey(obj.data, `bones.${i}.pose.${name}.${k}`, f, v, 'LINEAR'));
          });
          lastFrame = Math.max(lastFrame, f);
        }
      }
      // Inverse kinematics: a target object and a chain length. Solving is ours.
      for (const channel of channels.values()) {
        const bone = bones.find((b) => b.name === channel.get('name'));
        for (const con of listOf(file, channel.sub('constraints'))) {
          const block = follow(file, con.get('data'));
          if (block && file.structs[block.index].name === 'bKinematicConstraint') {
            const d = record(file, file.structs[block.index], block.data);
            const target = c.link(d.get('tar'));
            const pole = c.link(d.get('poletar'));
            const chain = d.get('rootbone') || 0;
            bone.ik = { subtarget: d.get('subtarget') ?? '', target, pole, chain: chain > 0 ? chain : bones.length, poleAngle: (d.get('poleangle') ?? 0) * DEG, influence: con.get('enforce') ?? 1, iterations: d.get('iterations') ?? 24 };
          } else {
            const kind = block ? CONSTRAINT_READERS[file.structs[block.index].name] : null;
            const data = block ? record(file, file.structs[block.index], block.data) : null;
            const made3 = kind ? readBoneConstraint(con, data, kind, (pointer) => c.link(pointer), file) : null;
            if (made3?.type === 'ACTION') made3.action = libraryAction(follow(file, data.get('act')), data.get('action_slot_handle'))?.id ?? '';
            if (made3) (bone.constraints ??= []).push(made3);
            else left.add(`${obj.name}/${bone.name}: bone constraint ${con.get('name')}`);
          }
        }
      }
    }
  }
  if (lastFrame > doc.frameEnd) doc.frameEnd = Math.ceil(lastFrame);
  setFrame(doc, doc.frame);
  created.left = [...left];
  return created;
}

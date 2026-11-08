// Armatures: bones in rest pose, pose transforms, FK/IK and linear blend skinning.
// Armature data: { bones: [{ name, parent (index|null), head, tail, roll, pose: { location, rotation (deg), scale }, ik }] }.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { v3 } from './mesh.js';
import { actionBonePose } from './anim.js';

const DEG = Math.PI / 180;

export function createArmature() {
  return { bones: [createBone('Bone', [0, 0, 0], [0, 0, 1], null)] };
}

export function createBone(name, head, tail, parent = null) {
  return { name, head, tail, parent, roll: 0, pose: { location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, ik: null };
}

/** Blender's bone frame: the shortest turn from +Y onto the bone, then its roll about itself. */
function rolledFrame(y, rollDegrees) {
  const [ax, ay, az] = [y.x, y.y, y.z];
  let theta = 1 + ay;
  const alt = ax * ax + az * az;
  let x;
  if (theta > 6.1e-3 || alt > 2.5e-4) {
    if (theta <= 6.1e-3) theta = alt * 0.5 + alt * alt * 0.125;
    x = new Vector3(1 - (ax * ax) / theta, -ax, (-ax * az) / theta);
  } else x = new Vector3(-1, 0, 0);
  x.applyAxisAngle(y, rollDegrees * DEG).normalize();
  return { x, z: new Vector3().crossVectors(x, y) };
}

/** The roll, in degrees, that makes a bone's frame have this X axis. Reading a rig from a file that states its frames. */
export function rollFromAxes(head, tail, xAxis) {
  const y = new Vector3(...v3.norm(v3.sub(tail, head)));
  const base = rolledFrame(y, 0).x;
  const x = new Vector3(...xAxis);
  return Math.atan2(new Vector3().crossVectors(base, x).dot(y), base.dot(x)) / DEG;
}

/** Rest orientation of a bone: its Y axis along head→tail (the usual bone convention). With useRoll, the frame turns about Y as Blender's does. */
export function restBoneMatrix(bone) {
  const y = new Vector3(...v3.norm(v3.sub(bone.tail, bone.head)));
  if (bone.useRoll) {
    const { x: rolledX, z: rolledZ } = rolledFrame(y, bone.roll ?? 0);
    const rolled = new Matrix4().makeBasis(rolledX, y, rolledZ);
    rolled.setPosition(...bone.head);
    return rolled;
  }
  const ref = Math.abs(y.z) < 0.99 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const x = new Vector3().crossVectors(y, ref).normalize();
  const z = new Vector3().crossVectors(x, y);
  const m = new Matrix4().makeBasis(x, y, z);
  m.setPosition(...bone.head);
  return m;
}

/** Armature-space pose matrix of each bone (from its rest pose and its pose transform, following parents). */
export function bonePoseMatrices(arm) {
  const out = new Array(arm.bones.length);
  const compute = (i) => {
    if (out[i]) return out[i];
    const bone = arm.bones[i];
    // Spline IK states where a bone is outright: a stretched parent's shear cannot be said in a pose.
    if (bone.poseMatrix) { out[i] = new Matrix4().fromArray(bone.poseMatrix); return out[i]; }
    const rest = restBoneMatrix(bone);
    const p = bone.pose;
    const local = new Matrix4().compose(new Vector3(...p.location), new Quaternion().setFromEuler(new Euler(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG)), new Vector3(...p.scale));
    let m = rest.clone().multiply(local);
    if (bone.parent != null) {
      const parentRest = restBoneMatrix(arm.bones[bone.parent]);
      m = compute(bone.parent).clone().multiply(parentRest.invert()).multiply(m);
    }
    out[i] = m;
    return m;
  };
  arm.bones.forEach((_, i) => compute(i));
  return out;
}

/** For skinning: per bone, the matrix taking a rest-pose point to its posed position. */
export function armaturePoseMatrices(arm) {
  const pose = bonePoseMatrices(arm);
  return pose.map((m, i) => m.clone().multiply(restBoneMatrix(arm.bones[i]).invert()));
}

/** Posed head and tail of a bone in armature space. */
export function posedBone(arm, index, poses = bonePoseMatrices(arm)) {
  const bone = arm.bones[index];
  const m = poses[index];
  const length = v3.dist(bone.head, bone.tail);
  const head = new Vector3(0, 0, 0).applyMatrix4(m);
  const tail = new Vector3(0, length, 0).applyMatrix4(m);
  return { head: [head.x, head.y, head.z], tail: [tail.x, tail.y, tail.z] };
}

/** Distance from a point to a line segment. */
const segmentDistance = (p, a, b) => {
  const ab = v3.sub(b, a);
  const t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, a), ab) / (v3.dot(ab, ab) || 1)));
  return v3.dist(p, v3.add(a, v3.mul(ab, t)));
};

/** Automatic weights: each vertex is shared by its nearest bones, weighted by inverse squared distance. */
export function autoWeights(mesh, arm, meshToArmature = null) {
  const p = new Vector3();
  const groups = arm.bones.map((bone) => ({ name: bone.name, w: {} }));
  mesh.verts.forEach((v, i) => {
    let q = v;
    if (meshToArmature) { p.set(v[0], v[1], v[2]).applyMatrix4(meshToArmature); q = [p.x, p.y, p.z]; }
    const raw = arm.bones.map((bone) => 1 / (segmentDistance(q, bone.head, bone.tail) ** 2 + 1e-4));
    // The four nearest bones; shares under 1 % are dropped first, so what remains still sums to one.
    const top = raw.map((value, b) => [value, b]).sort((a, b) => b[0] - a[0]).slice(0, 4);
    const total = top.reduce((s, [value]) => s + value, 0);
    const kept = top.filter(([value]) => value / total > 0.01);
    const sum = kept.reduce((s, [value]) => s + value, 0);
    for (const [value, b] of kept) groups[b].w[i] = value / sum;
  });
  mesh.vgroups = groups.concat((mesh.vgroups ?? []).filter((g) => !arm.bones.some((b) => b.name === g.name)));
  return mesh;
}

/**
 * Linear blend skinning. `boneDeform`: matrices from armaturePoseMatrices; `meshWorld` / `armWorld` bring the mesh
 * into armature space and back. Vertex groups named after a bone are its weights.
 */
export function deformByArmature(mesh, boneDeform, meshWorld, armWorld) {
  const toArm = new Matrix4().copy(armWorld).invert().multiply(meshWorld);
  const fromArm = new Matrix4().copy(toArm).invert();
  const groups = mesh.vgroups ?? [];
  const p = new Vector3();
  const q = new Vector3();
  mesh.verts = mesh.verts.map((v, i) => {
    let total = 0;
    const sum = [0, 0, 0];
    p.set(v[0], v[1], v[2]).applyMatrix4(toArm);
    groups.forEach((group, g) => {
      const w = group.w[i];
      const m = boneDeform[g];
      if (!w || !m) return;
      q.copy(p).applyMatrix4(m);
      sum[0] += q.x * w; sum[1] += q.y * w; sum[2] += q.z * w;
      total += w;
    });
    if (total <= 0) return v;
    p.set(sum[0] / total, sum[1] / total, sum[2] / total).applyMatrix4(fromArm);
    return [p.x, p.y, p.z];
  });
  return mesh;
}

/**
 * Inverse kinematics by cyclic coordinate descent: rotates `chain` bones (counted up from `boneIndex`) so the tail of
 * boneIndex reaches `target` (armature space). Writes the bones' pose rotation. Returns the remaining distance.
 */
export function solveIK(arm, boneIndex, target, chain = 2, iterations = 16, pole = null, poleAngle = 0) {
  const list = [];
  for (let i = boneIndex; i != null && list.length < chain; i = arm.bones[i].parent) list.push(i);
  const goal = new Vector3(...target);
  for (let it = 0; it < iterations; it++) {
    for (const index of list) {
      const poses = bonePoseMatrices(arm);
      const tip = new Vector3(...posedBone(arm, boneIndex, poses).tail);
      const pivot = new Vector3().setFromMatrixPosition(poses[index]);
      const toTip = tip.clone().sub(pivot).normalize();
      const toGoal = goal.clone().sub(pivot).normalize();
      if (toTip.lengthSq() < 1e-12 || toGoal.lengthSq() < 1e-12) continue;
      const worldTurn = new Quaternion().setFromUnitVectors(toTip, toGoal);
      const boneRot = new Quaternion().setFromRotationMatrix(poses[index]);
      // The turn in the bone's own frame, added on the right of its current pose rotation.
      const localTurn = boneRot.clone().invert().multiply(worldTurn).multiply(boneRot);
      const pose = arm.bones[index].pose;
      const current = new Quaternion().setFromEuler(new Euler(pose.rotation[0] * DEG, pose.rotation[1] * DEG, pose.rotation[2] * DEG));
      const e = new Euler().setFromQuaternion(current.multiply(localTurn));
      pose.rotation = [e.x / DEG, e.y / DEG, e.z / DEG];
    }
  }
  if (pole && list.length >= 2) applyPole(arm, list, goal, new Vector3(...pole), poleAngle);
  const tip = posedBone(arm, boneIndex).tail;
  return v3.dist(tip, target);
}

/** Swings the whole chain about the line from its root to the goal, so that its bend points at the pole. The tip stays where it is. */
function applyPole(arm, list, goal, pole, angleDeg) {
  const rootIndex = list.at(-1);
  const poses = bonePoseMatrices(arm);
  const root = new Vector3().setFromMatrixPosition(poses[rootIndex]);
  const axis = goal.clone().sub(root);
  if (axis.lengthSq() < 1e-10) return;
  axis.normalize();
  const flat = (p) => { const d = p.clone().sub(root); return d.sub(axis.clone().multiplyScalar(d.dot(axis))); };
  const elbow = flat(new Vector3().setFromMatrixPosition(poses[list.at(-2)]));
  const wanted = flat(pole);
  if (elbow.lengthSq() < 1e-10 || wanted.lengthSq() < 1e-10) return;
  elbow.normalize();
  wanted.normalize();
  const angle = Math.atan2(new Vector3().crossVectors(elbow, wanted).dot(axis), elbow.dot(wanted)) + angleDeg * DEG;
  const worldTurn = new Quaternion().setFromAxisAngle(axis, angle);
  const boneRot = new Quaternion().setFromRotationMatrix(poses[rootIndex]);
  const localTurn = boneRot.clone().invert().multiply(worldTurn).multiply(boneRot);
  const pose = arm.bones[rootIndex].pose;
  const current = new Quaternion().setFromEuler(new Euler(pose.rotation[0] * DEG, pose.rotation[1] * DEG, pose.rotation[2] * DEG));
  const e = new Euler().setFromQuaternion(current.multiply(localTurn));
  pose.rotation = [e.x / DEG, e.y / DEG, e.z / DEG];
}

/**
 * The armature with its live IK solved, leaving the stored pose alone. Each bone's `ik`: { target, pole, chain, poleAngle, influence, iterations }.
 * `pointOf(id)` gives an object's position in armature space, or null.
 */
export function solvedArmature(arm, pointOf, matrixOf = null, curveOf = null, armWorld = null, more = {}) {
  if (!arm.bones.some((b) => b.ik?.target || b.constraints?.length)) return arm;
  const out = { ...arm, bones: arm.bones.map((b) => ({ ...b, pose: { location: [...b.pose.location], rotation: [...b.pose.rotation], scale: [...b.pose.scale] } })) };
  arm.bones.forEach((bone, index) => {
    const ik = bone.ik;
    if (!ik?.target) return;
    let goal = pointOf(ik.target);
    if (ik.subtarget) {
      // Its head, as it stands: on this armature from the pose so far, on another from the document.
      const named = out.bones.findIndex((b) => b.name === ik.subtarget);
      const m = matrixOf?.(ik.target, ik.subtarget) ?? (named >= 0 && named !== index ? bonePoseMatrices(out)[named] : null);
      if (m) goal = [m.elements[12], m.elements[13], m.elements[14]];
    }
    if (!goal) return;
    const influence = ik.influence ?? 1;
    if (influence <= 0) return;
    const before = out.bones.map((b) => [...b.pose.rotation]);
    solveIK(out, index, goal, ik.chain ?? 2, ik.iterations ?? 24, ik.pole ? pointOf(ik.pole) : null, ik.poleAngle ?? 0);
    if (influence < 1) {
      out.bones.forEach((b, i) => {
        const [p, q] = [before[i], b.pose.rotation].map((r) => new Quaternion().setFromEuler(new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG)));
        const e = new Euler().setFromQuaternion(p.slerp(q, influence));
        b.pose.rotation = [e.x / DEG, e.y / DEG, e.z / DEG];
      });
    }
  });
  applyBoneConstraints(out, matrixOf, curveOf, armWorld, more);
  return out;
}

// ─────────────── bone constraints

const LIMITS = { useX: { def: true }, minX: { def: -45, step: 5 }, maxX: { def: 45, step: 5 }, useY: { def: true }, minY: { def: -45, step: 5 }, maxY: { def: 45, step: 5 }, useZ: { def: true }, minZ: { def: -45, step: 5 }, maxZ: { def: 45, step: 5 } };
const TARGET = { target: { def: null, object: true }, subtarget: { def: '' }, influence: { def: 1, min: 0, max: 1, step: 0.05 } };
const AXES = ['X', 'Y', 'Z', '-X', '-Y', '-Z'];
/** Lowest and highest on each axis, for a mapping from one range to another. */
function range(name, lo, hi) {
  const out = {};
  for (const axis of ['X', 'Y', 'Z']) { out[`${name}Min${axis}`] = { def: lo, step: 0.1 }; out[`${name}Max${axis}`] = { def: hi, step: 0.1 }; }
  return out;
}

export const ACTION_CHANNELS = ['LOCATION_X', 'LOCATION_Y', 'LOCATION_Z', 'ROTATION_X', 'ROTATION_Y', 'ROTATION_Z', 'SCALE_X', 'SCALE_Y', 'SCALE_Z'];
/** Blender's ways of putting an action's pose together with the bone's own. */
export const ACTION_MIXES = ['BEFORE_FULL', 'BEFORE', 'BEFORE_SPLIT', 'AFTER_FULL', 'AFTER', 'AFTER_SPLIT', 'REPLACE'];

const poseMatrix = (p) => new Matrix4().compose(new Vector3(...p.location), new Quaternion().setFromEuler(new Euler(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG)), new Vector3(...p.scale));

/** A bone's pose matrix relative to its rest, from where it stands in the armature. */
export function boneLocalMatrix(arm, i, poses = bonePoseMatrices(arm)) {
  const bone = arm.bones[i];
  const rest = restBoneMatrix(bone).invert();
  return bone.parent != null ? rest.multiply(restBoneMatrix(arm.bones[bone.parent])).multiply(poses[bone.parent].clone().invert()).multiply(poses[i]) : rest.multiply(poses[i]);
}

/** Two transforms put together the way Blender's Action constraint does: in full, with scale kept to its axes (aligned), or channel by channel (split). */
export function mixMatrices(a, b, how) {
  if (how === 'FULL') return a.clone().multiply(b);
  const [pa, qa, sa, pb, qb, sb] = [new Vector3(), new Quaternion(), new Vector3(), new Vector3(), new Quaternion(), new Vector3()];
  a.decompose(pa, qa, sa);
  b.decompose(pb, qb, sb);
  const location = how === 'SPLIT' ? pa.clone().add(pb) : pb.clone().applyMatrix4(a);
  return new Matrix4().compose(location, qa.clone().multiply(qb), sa.clone().multiply(sb));
}

/** One value read off a matrix: a location, an XYZ Euler angle in degrees, or a scale. */
export function channelValue(m, channel) {
  const [p, q, sc] = [new Vector3(), new Quaternion(), new Vector3()];
  m.decompose(p, q, sc);
  const axis = 'XYZ'.indexOf(channel.at(-1));
  if (channel.startsWith('LOCATION')) return p.getComponent(axis);
  if (channel.startsWith('SCALE')) return sc.getComponent(axis);
  const e = new Euler().setFromQuaternion(q, 'ZYX');
  return [e.x, e.y, e.z][axis] / DEG;
}

/** What a bone can be constrained by. Rotation limits are in degrees, and `space` is the bone's own (LOCAL) or the armature's (POSE). */
export const BONE_CONSTRAINTS = {
  COPY_LOCATION: { en: 'Copy Location', ko: '위치 복사', props: { ...TARGET, useX: { def: true }, useY: { def: true }, useZ: { def: true } } },
  COPY_ROTATION: { en: 'Copy Rotation', ko: '회전 복사', props: { ...TARGET } },
  COPY_SCALE: { en: 'Copy Scale', ko: '크기 복사', props: { ...TARGET } },
  COPY_TRANSFORMS: { en: 'Copy Transforms', ko: '트랜스폼 복사', props: { ...TARGET } },
  LIMIT_ROTATION: { en: 'Limit Rotation', ko: '회전 제한', props: { ...LIMITS, space: { def: 'LOCAL', options: ['LOCAL', 'POSE'] }, influence: TARGET.influence } },
  LIMIT_LOCATION: { en: 'Limit Location', ko: '위치 제한', props: { useX: { def: true }, minX: { def: -1, step: 0.1 }, maxX: { def: 1, step: 0.1 }, useY: { def: true }, minY: { def: -1, step: 0.1 }, maxY: { def: 1, step: 0.1 }, useZ: { def: true }, minZ: { def: -1, step: 0.1 }, maxZ: { def: 1, step: 0.1 }, space: { def: 'LOCAL', options: ['LOCAL', 'POSE'] }, influence: TARGET.influence } },
  LIMIT_SCALE: { en: 'Limit Scale', ko: '크기 제한', props: { min: { def: 0.5, min: 0, step: 0.1 }, max: { def: 2, min: 0, step: 0.1 }, influence: TARGET.influence } },
  DAMPED_TRACK: { en: 'Damped Track', ko: '감쇠 따라보기', props: { ...TARGET, axis: { def: 'Y', options: AXES } } },
  LOCKED_TRACK: { en: 'Locked Track', ko: '고정 따라보기', props: { ...TARGET, axis: { def: 'Y', options: ['X', 'Y', 'Z'] }, lock: { def: 'Z', options: ['X', 'Y', 'Z'] } } },
  STRETCH_TO: { en: 'Stretch To', ko: '늘이기', props: { ...TARGET, rest: { def: 0, min: 0, step: 0.1 }, volume: { def: true } } },
  TRANSFORMATION: { en: 'Transformation', ko: '트랜스폼 변환', props: { ...TARGET, fromType: { def: 'LOCATION', options: ['LOCATION', 'ROTATION', 'SCALE'] }, ...range('from', 0, 1), toType: { def: 'LOCATION', options: ['LOCATION', 'ROTATION', 'SCALE'] }, ...range('to', 0, 1), space: { def: 'LOCAL', options: ['LOCAL', 'POSE'] } } },
  SPLINE_IK: { en: 'Spline IK', ko: '스플라인 IK', props: { target: { def: null, object: true }, chain: { def: 2, min: 1, step: 1, int: true } } },
  ACTION: { en: 'Action', ko: '액션', props: { ...TARGET, action: { def: '', action: true }, channel: { def: 'LOCATION_X', options: ACTION_CHANNELS }, targetSpace: { def: 'WORLD', options: ['WORLD', 'LOCAL'] }, min: { def: 0, step: 0.1 }, max: { def: 1, step: 0.1 }, frameStart: { def: 1, step: 1, int: true }, frameEnd: { def: 10, step: 1, int: true }, mix: { def: 'BEFORE_SPLIT', options: ACTION_MIXES }, useEvalTime: { def: false }, evalTime: { def: 0, min: 0, max: 1, step: 0.05 } } },
  ARMATURE: { en: 'Armature', ko: '아마추어', props: { target: { def: null, object: true }, subtarget: { def: '' }, weight: { def: 1, min: 0, max: 1, step: 0.05 }, target2: { def: null, object: true }, subtarget2: { def: '' }, weight2: { def: 0, min: 0, max: 1, step: 0.05 }, influence: TARGET.influence } },
};

export function createBoneConstraint(type) {
  const spec = BONE_CONSTRAINTS[type];
  if (!spec) throw new Error(`Unknown bone constraint: ${type}`);
  const c = { type, name: spec.en, enabled: true };
  for (const [key, p] of Object.entries(spec.props)) c[key] = p.def;
  return c;
}

const axisVector = (name) => {
  const v = new Vector3(name.endsWith('X') ? 1 : 0, name.endsWith('Y') ? 1 : 0, name.endsWith('Z') ? 1 : 0);
  return name.startsWith('-') ? v.negate() : v;
};

/**
 * Constraints, parents before children, so that a child answers to where its parent ended up. Each works on the bone's armature-space matrix and the
 * result goes back into its pose. `matrixOf(id, boneName)` gives another object or bone in armature space; null means this armature's own bone.
 */
function applyBoneConstraints(arm, matrixOf, curveOf, armWorld, { actionOf = null, localOf = null } = {}) {
  /** Puts a bone at an armature-space matrix, by way of its pose. */
  const place = (i, m) => {
    const bone = arm.bones[i];
    const poses = bonePoseMatrices(arm);
    const rest = restBoneMatrix(bone);
    const local = bone.parent != null
      ? rest.clone().invert().multiply(restBoneMatrix(arm.bones[bone.parent])).multiply(poses[bone.parent].clone().invert()).multiply(m)
      : rest.clone().invert().multiply(m);
    const [lp, lq, ls] = [new Vector3(), new Quaternion(), new Vector3()];
    local.decompose(lp, lq, ls);
    const e = new Euler().setFromQuaternion(lq);
    bone.pose = { location: lp.toArray(), rotation: [e.x / DEG, e.y / DEG, e.z / DEG], scale: ls.toArray() };
  };
  const order = [];
  const seen = new Set();
  const visit = (i) => { if (seen.has(i)) return; seen.add(i); const p = arm.bones[i].parent; if (p != null) visit(p); order.push(i); };
  arm.bones.forEach((_, i) => visit(i));
  for (const i of order) {
    const bone = arm.bones[i];
    if (!bone.constraints?.length) continue;
    const rest = restBoneMatrix(bone);
    const restInverse = rest.clone().invert();
    for (const c of bone.constraints) {
      if (c.enabled === false) continue;
      const k = c.influence ?? 1;
      if (k <= 0) continue;
      if (c.type === 'SPLINE_IK') {
        // The chain laid along the curve, from its root to the bone holding the constraint, each joint at its share of the bones' lengths.
        const line = c.target ? curveOf?.(c.target) : null;
        if (!line || line.length < 2) continue;
        const chain = [];
        for (let at = i; at != null && chain.length < (c.chain ?? 2); at = arm.bones[at].parent) chain.unshift(at);
        const lengths = chain.map((b) => v3.dist(arm.bones[b].head, arm.bones[b].tail));
        const total = lengths.reduce((x, y) => x + y, 0) || 1;
        const along = [0];
        for (let j = 0; j + 1 < line.length; j++) along.push(along[j] + v3.dist(line[j], line[j + 1]));
        const whole = along.at(-1) || 1;
        const pointAt = (f) => {
          const wanted = f * whole;
          let j = 0;
          while (j + 2 < along.length && along[j + 1] < wanted) j++;
          return v3.lerp(line[j], line[j + 1], (wanted - along[j]) / (along[j + 1] - along[j] || 1));
        };
        let sum = 0;
        const before = bonePoseMatrices(arm);
        chain.forEach((b, n) => {
          const [head, tail] = [pointAt(sum / total), pointAt((sum + lengths[n]) / total)];
          sum += lengths[n];
          const [p, q, sc] = [new Vector3(), new Quaternion(), new Vector3()];
          before[b].decompose(p, q, sc);
          const to = new Vector3(...v3.sub(tail, head));
          const distance = to.length();
          if (distance < 1e-9) return;
          const now = new Vector3(0, 1, 0).applyQuaternion(q).normalize();
          q.premultiply(new Quaternion().setFromUnitVectors(now, to.normalize()));
          arm.bones[b].poseMatrix = [...new Matrix4().compose(new Vector3(...head), q, new Vector3(sc.x, distance / Math.max(1e-6, lengths[n]), sc.z)).elements];
        });
        continue;
      }
      if (c.type === 'ARMATURE') {
        // Follows bones the way a skinned vertex does: their change from rest, weighted, carrying this bone along.
        const self = bonePoseMatrices(arm);
        const sum = new Array(16).fill(0);
        let total = 0;
        for (const [id, name, weight] of [[c.target, c.subtarget, c.weight ?? 1], [c.target2, c.subtarget2, c.weight2 ?? 0]]) {
          if (!id || !name || weight <= 0) continue;
          const named = arm.bones.findIndex((b) => b.name === name);
          const pose = matrixOf?.(id, name) ?? (named >= 0 ? self[named] : null);
          const rest0 = matrixOf?.(id, name, true) ?? (named >= 0 ? restBoneMatrix(arm.bones[named]) : null);
          if (!pose || !rest0) continue;
          const change = pose.clone().multiply(rest0.clone().invert());
          change.elements.forEach((x, n) => { sum[n] += x * weight; });
          total += weight;
        }
        if (!total) continue;
        const blended = new Matrix4().fromArray(sum.map((x) => x / total)).multiply(self[i]);
        if (k >= 1) place(i, blended);
        else {
          const [p1, q1, s1, p2, q2, s2] = [new Vector3(), new Quaternion(), new Vector3(), new Vector3(), new Quaternion(), new Vector3()];
          self[i].decompose(p1, q1, s1);
          blended.decompose(p2, q2, s2);
          place(i, new Matrix4().compose(p1.lerp(p2, k), q1.slerp(q2, k), s1.lerp(s2, k)));
        }
        continue;
      }
      const poses = bonePoseMatrices(arm);
      const parentPose = bone.parent != null ? poses[bone.parent] : null;
      const parentRest = bone.parent != null ? restBoneMatrix(arm.bones[bone.parent]) : null;
      const toLocal = (m) => (parentPose ? restInverse.clone().multiply(parentRest).multiply(parentPose.clone().invert()).multiply(m) : restInverse.clone().multiply(m));
      const fromLocal = (l) => (parentPose ? parentPose.clone().multiply(parentRest.clone().invert()).multiply(rest).multiply(l) : rest.clone().multiply(l));
      const M = poses[i].clone();
      const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
      M.decompose(p, q, s);
      const [was, wasQ, wasS] = [p.clone(), q.clone(), s.clone()];
      let T = null;
      if ('target' in c && !(c.type === 'ACTION' && c.useEvalTime)) {
        if (!c.target) continue;
        const named = c.subtarget ? arm.bones.findIndex((b) => b.name === c.subtarget) : -1;
        const found = matrixOf?.(c.target, c.subtarget) ?? null;
        T = found ?? (named >= 0 && named !== i ? poses[named] : null);
        if (!T) continue;
      }
      const [tp, tq, ts] = [new Vector3(), new Quaternion(), new Vector3()];
      T?.decompose(tp, tq, ts);
      switch (c.type) {
        case 'COPY_LOCATION':
          if (c.useX !== false) p.x = tp.x;
          if (c.useY !== false) p.y = tp.y;
          if (c.useZ !== false) p.z = tp.z;
          break;
        case 'COPY_ROTATION': q.copy(tq); break;
        case 'COPY_SCALE': s.copy(ts); break;
        case 'COPY_TRANSFORMS': p.copy(tp); q.copy(tq); s.copy(ts); break;
        case 'LIMIT_ROTATION': {
          const local = c.space !== 'POSE';
          const source = local ? new Quaternion().setFromRotationMatrix(cleanAxes(toLocal(M))) : q.clone();
          const e = new Euler().setFromQuaternion(source, 'ZYX');
          const hold = (value, use, lo, hi) => (use ? Math.min(hi * DEG, Math.max(lo * DEG, value)) : value);
          const limited = new Quaternion().setFromEuler(new Euler(hold(e.x, c.useX, c.minX, c.maxX), hold(e.y, c.useY, c.minY, c.maxY), hold(e.z, c.useZ, c.minZ, c.maxZ), 'ZYX'));
          if (local) {
            const [lp, , ls] = [new Vector3(), null, new Vector3()];
            toLocal(M).decompose(lp, new Quaternion(), ls);
            fromLocal(new Matrix4().compose(lp, limited, ls)).decompose(p, q, s);
          } else q.copy(limited);
          break;
        }
        case 'LIMIT_LOCATION': {
          const local = c.space !== 'POSE';
          const [lp, lq, ls] = [new Vector3(), new Quaternion(), new Vector3()];
          (local ? toLocal(M) : M).decompose(lp, lq, ls);
          const hold = (value, use, lo, hi) => (use ? Math.min(hi, Math.max(lo, value)) : value);
          lp.set(hold(lp.x, c.useX, c.minX, c.maxX), hold(lp.y, c.useY, c.minY, c.maxY), hold(lp.z, c.useZ, c.minZ, c.maxZ));
          if (local) fromLocal(new Matrix4().compose(lp, lq, ls)).decompose(p, q, s);
          else p.copy(lp);
          break;
        }
        case 'LIMIT_SCALE': s.set(Math.min(c.max, Math.max(c.min, s.x)), Math.min(c.max, Math.max(c.min, s.y)), Math.min(c.max, Math.max(c.min, s.z))); break;
        case 'DAMPED_TRACK': {
          const to = tp.clone().sub(p);
          if (to.lengthSq() < 1e-12) break;
          const now = axisVector(c.axis ?? 'Y').applyQuaternion(q).normalize();
          q.premultiply(new Quaternion().setFromUnitVectors(now, to.normalize()));
          break;
        }
        case 'LOCKED_TRACK': {
          const lock = axisVector(c.lock ?? 'Z').applyQuaternion(q).normalize();
          const along = axisVector(c.axis ?? 'Y').applyQuaternion(q).normalize();
          const to = tp.clone().sub(p);
          to.sub(lock.clone().multiplyScalar(to.dot(lock)));
          if (to.lengthSq() < 1e-12) break;
          to.normalize();
          const angle = Math.atan2(new Vector3().crossVectors(along, to).dot(lock), along.dot(to));
          q.premultiply(new Quaternion().setFromAxisAngle(lock, angle));
          break;
        }
        case 'TRANSFORMATION': {
          // Where the target stands in its range, the same share of the owner's range, added to what the owner has.
          // The range is read in the world, wherever the armature stands.
          const [wp, wq, ws] = [new Vector3(), new Quaternion(), new Vector3()];
          (armWorld ? armWorld.clone().multiply(T) : T).decompose(wp, wq, ws);
          const source = c.fromType === 'ROTATION' ? (() => { const e = new Euler().setFromQuaternion(wq, 'ZYX'); return [e.x / DEG, e.y / DEG, e.z / DEG]; })() : c.fromType === 'SCALE' ? ws.toArray() : wp.toArray();
          const mapped = ['X', 'Y', 'Z'].map((axis, n) => {
            const [lo, hi] = [c[`fromMin${axis}`], c[`fromMax${axis}`]];
            const share = hi === lo ? 0 : Math.max(0, Math.min(1, (source[n] - lo) / (hi - lo)));
            return c[`toMin${axis}`] + (c[`toMax${axis}`] - c[`toMin${axis}`]) * share;
          });
          const local = c.space !== 'POSE';
          const [lp, lq, ls] = [new Vector3(), new Quaternion(), new Vector3()];
          (local ? toLocal(M) : M).decompose(lp, lq, ls);
          if (c.toType === 'ROTATION') lq.premultiply(new Quaternion().setFromEuler(new Euler(mapped[0] * DEG, mapped[1] * DEG, mapped[2] * DEG, 'ZYX')));
          else if (c.toType === 'SCALE') ls.set(mapped[0], mapped[1], mapped[2]);
          else lp.add(new Vector3(...mapped));
          (local ? fromLocal(new Matrix4().compose(lp, lq, ls)) : new Matrix4().compose(lp, lq, ls)).decompose(p, q, s);
          break;
        }
        case 'ACTION': {
          // Where the target stands in its range picks a frame of the action; the bone's pose there is put together with its own.
          const action = actionOf?.(c.action);
          if (!action) break;
          let share = c.evalTime ?? 0;
          if (!c.useEvalTime) {
            let source;
            if (c.targetSpace === 'LOCAL') {
              const named = c.subtarget ? arm.bones.findIndex((b) => b.name === c.subtarget) : -1;
              source = localOf?.(c.target, c.subtarget) ?? (named >= 0 ? boneLocalMatrix(arm, named, poses) : null);
            } else source = armWorld ? armWorld.clone().multiply(T) : T;
            if (!source) break;
            const value = channelValue(source, c.channel ?? 'LOCATION_X');
            share = c.max === c.min ? 0 : (value - c.min) / (c.max - c.min);
          }
          const frame = c.frameStart + Math.max(0, Math.min(1, share)) * (c.frameEnd - c.frameStart);
          const pose = actionBonePose(action, bone.name, i, frame);
          if (!pose) break;
          const A = poseMatrix(pose);
          const L = toLocal(M);
          const mix = c.mix ?? 'BEFORE_SPLIT';
          const how = mix.endsWith('FULL') ? 'FULL' : mix.endsWith('SPLIT') ? 'SPLIT' : 'ALIGNED';
          const mixed = mix === 'REPLACE' ? A : mix.startsWith('BEFORE') ? mixMatrices(A, L, how) : mixMatrices(L, A, how);
          fromLocal(mixed).decompose(p, q, s);
          break;
        }
        case 'STRETCH_TO': {
          const to = tp.clone().sub(p);
          const distance = to.length();
          if (distance < 1e-9) break;
          const now = new Vector3(0, 1, 0).applyQuaternion(q).normalize();
          q.premultiply(new Quaternion().setFromUnitVectors(now, to.clone().normalize()));
          const rest0 = c.rest > 0 ? c.rest : v3.dist(bone.head, bone.tail);
          const stretch = distance / Math.max(1e-6, rest0);
          const thin = c.volume === false ? 1 : 1 / Math.sqrt(Math.max(1e-6, stretch));
          s.set(s.x * thin, s.y * stretch, s.z * thin);
          break;
        }
        default:
      }
      if (k < 1) { p.lerpVectors(was, p, k); q.slerpQuaternions(wasQ, q.clone(), k); s.lerpVectors(wasS, s, k); }
      const [lp, lq, ls] = [new Vector3(), new Quaternion(), new Vector3()];
      toLocal(new Matrix4().compose(p, q, s)).decompose(lp, lq, ls);
      const e = new Euler().setFromQuaternion(lq);
      bone.pose = { location: lp.toArray(), rotation: [e.x / DEG, e.y / DEG, e.z / DEG], scale: ls.toArray() };
    }
  }
}

/** A matrix with its axes made unit length, for reading a rotation out of it. */
const cleanAxes = (m) => {
  const out = m.clone();
  const e = out.elements;
  for (const at of [0, 4, 8]) { const l = Math.hypot(e[at], e[at + 1], e[at + 2]) || 1; e[at] /= l; e[at + 1] /= l; e[at + 2] /= l; }
  return out;
};

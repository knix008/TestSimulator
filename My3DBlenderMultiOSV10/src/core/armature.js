// Armatures: bones in rest pose, pose transforms, FK/IK and linear blend skinning.
// Armature data: { bones: [{ name, parent (index|null), head, tail, roll, pose: { location, rotation (deg), scale }, ik }] }.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { v3 } from './mesh.js';

const DEG = Math.PI / 180;

export function createArmature() {
  return { bones: [createBone('Bone', [0, 0, 0], [0, 0, 1], null)] };
}

export function createBone(name, head, tail, parent = null) {
  return { name, head, tail, parent, roll: 0, pose: { location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, ik: null };
}

/** Rest orientation of a bone: its Y axis along head→tail (the usual bone convention). */
function restMatrix(bone) {
  const y = new Vector3(...v3.norm(v3.sub(bone.tail, bone.head)));
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
    const rest = restMatrix(bone);
    const p = bone.pose;
    const local = new Matrix4().compose(new Vector3(...p.location), new Quaternion().setFromEuler(new Euler(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG)), new Vector3(...p.scale));
    let m = rest.clone().multiply(local);
    if (bone.parent != null) {
      const parentRest = restMatrix(arm.bones[bone.parent]);
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
  return pose.map((m, i) => m.clone().multiply(restMatrix(arm.bones[i]).invert()));
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
export function solvedArmature(arm, pointOf) {
  if (!arm.bones.some((b) => b.ik?.target)) return arm;
  const out = { ...arm, bones: arm.bones.map((b) => ({ ...b, pose: { location: [...b.pose.location], rotation: [...b.pose.rotation], scale: [...b.pose.scale] } })) };
  arm.bones.forEach((bone, index) => {
    const ik = bone.ik;
    if (!ik?.target) return;
    const goal = pointOf(ik.target);
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
  return out;
}

// CATIA DMU Kinematics / FreeCAD Assembly joints: mechanisms, DOF, simulation, clash.
import type { Solid, Vec3 } from './model'
import { boundingBoxOf } from './primitives'

export type JointKind = 'revolute' | 'prismatic' | 'cylindrical' | 'spherical' | 'planar' | 'rigid' | 'gear' | 'screw'

export interface Joint {
  id: string
  kind: JointKind
  a: string
  b: string
  axis: 'x' | 'y' | 'z'
  origin: Vec3
  /** deg for revolute, mm for prismatic */
  min: number
  max: number
  /** gear ratio or screw pitch */
  ratio: number
}

export interface Mechanism {
  name: string
  fixed: string[]
  joints: Joint[]
  commands: string[]
}

/** Degrees of freedom removed by each joint type. */
export const JOINT_DOF: Record<JointKind, number> = {
  revolute: 1,
  prismatic: 1,
  cylindrical: 2,
  spherical: 3,
  planar: 3,
  rigid: 0,
  gear: 1,
  screw: 1
}

export function createMechanism(name = 'Mechanism'): Mechanism {
  return { name, fixed: [], joints: [], commands: [] }
}

export function addJoint(mechanism: Mechanism, joint: Joint): Mechanism {
  return {
    ...mechanism,
    joints: [...mechanism.joints, joint],
    commands: joint.kind === 'rigid' ? mechanism.commands : [...mechanism.commands, joint.id]
  }
}

/**
 * Remaining degrees of freedom: 6 per free body minus the constraints each
 * joint removes (6 - the joint's own free dof).
 */
export function degreesOfFreedom(mechanism: Mechanism, bodyIds: string[]): number {
  const free = bodyIds.filter((id) => !mechanism.fixed.includes(id)).length
  let removed = 0
  for (const joint of mechanism.joints) removed += 6 - JOINT_DOF[joint.kind]
  return free * 6 - removed
}

export function isFullyConstrained(mechanism: Mechanism, bodyIds: string[]): boolean {
  return degreesOfFreedom(mechanism, bodyIds) <= 0
}

export interface Pose {
  bodyId: string
  position: Vec3
  rotation: Vec3
}

/**
 * Drive every command joint by a normalised time 0..1 and return the poses.
 * `base` gives the rest placement of each body.
 */
export function simulate(mechanism: Mechanism, base: Record<string, Pose>, t: number): Pose[] {
  const time = Math.max(0, Math.min(1, t))
  const poses: Record<string, Pose> = {}
  for (const [id, pose] of Object.entries(base)) {
    poses[id] = { bodyId: id, position: { ...pose.position }, rotation: { ...pose.rotation } }
  }
  for (const joint of mechanism.joints) {
    const pose = poses[joint.b]
    if (!pose) continue
    const value = joint.min + (joint.max - joint.min) * time
    if (joint.kind === 'revolute' || joint.kind === 'cylindrical' || joint.kind === 'gear') {
      const amount = joint.kind === 'gear' ? value * (joint.ratio || 1) : value
      pose.rotation = { ...pose.rotation, [joint.axis]: pose.rotation[joint.axis] + amount } as Vec3
      const radius = Math.hypot(pose.position.x - joint.origin.x, pose.position.z - joint.origin.z)
      if (joint.axis === 'y' && radius > 1e-6) {
        const current = Math.atan2(pose.position.z - joint.origin.z, pose.position.x - joint.origin.x)
        const next = current + (amount * Math.PI) / 180
        pose.position = {
          x: joint.origin.x + Math.cos(next) * radius,
          y: pose.position.y,
          z: joint.origin.z + Math.sin(next) * radius
        }
      }
    }
    if (joint.kind === 'prismatic' || joint.kind === 'cylindrical') {
      pose.position = { ...pose.position, [joint.axis]: pose.position[joint.axis] + value } as Vec3
    }
    if (joint.kind === 'screw') {
      pose.rotation = { ...pose.rotation, [joint.axis]: pose.rotation[joint.axis] + value } as Vec3
      const pitch = joint.ratio || 1
      pose.position = { ...pose.position, [joint.axis]: pose.position[joint.axis] + (value / 360) * pitch } as Vec3
    }
    if (joint.kind === 'spherical') {
      pose.rotation = { x: pose.rotation.x + value, y: pose.rotation.y + value, z: pose.rotation.z + value }
    }
  }
  return Object.values(poses)
}

export interface ClashResult {
  a: string
  b: string
  kind: 'clash' | 'contact' | 'clear'
  /** negative = penetration depth, positive = clearance */
  distance: number
}

/** DMU > Clash detection between axis-aligned bounding boxes. */
export function clashCheck(solids: Solid[], contactTolerance = 0.01): ClashResult[] {
  const boxes = solids.map((solid) => ({ solid, box: boundingBoxOf([solid]) }))
  const results: ClashResult[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const gapX = Math.max(a.box.min.x - b.box.max.x, b.box.min.x - a.box.max.x)
      const gapY = Math.max(a.box.min.y - b.box.max.y, b.box.min.y - a.box.max.y)
      const gapZ = Math.max(a.box.min.z - b.box.max.z, b.box.min.z - a.box.max.z)
      const gap = Math.max(gapX, gapY, gapZ)
      const kind: ClashResult['kind'] = gap < -contactTolerance ? 'clash' : gap <= contactTolerance ? 'contact' : 'clear'
      results.push({ a: a.solid.name, b: b.solid.name, kind, distance: gap })
    }
  }
  return results
}

/** DMU > Swept envelope of a moving body: bounding box union across the motion. */
export function sweptEnvelope(mechanism: Mechanism, base: Record<string, Pose>, bodyId: string, steps = 12): { min: Vec3; max: Vec3 } {
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (let i = 0; i <= steps; i++) {
    const poses = simulate(mechanism, base, i / steps)
    const pose = poses.find((item) => item.bodyId === bodyId)
    if (!pose) continue
    min.x = Math.min(min.x, pose.position.x); max.x = Math.max(max.x, pose.position.x)
    min.y = Math.min(min.y, pose.position.y); max.y = Math.max(max.y, pose.position.y)
    min.z = Math.min(min.z, pose.position.z); max.z = Math.max(max.z, pose.position.z)
  }
  if (!Number.isFinite(min.x)) throw new Error('엔벌로프: 대상 바디가 없습니다.')
  return { min, max }
}

/** DMU > Speed and acceleration of a driven joint at time t (finite differences). */
export function jointKinematics(mechanism: Mechanism, base: Record<string, Pose>, bodyId: string, t: number, dt = 0.01): { speed: number; acceleration: number } {
  const at = (time: number): Vec3 => {
    const pose = simulate(mechanism, base, time).find((item) => item.bodyId === bodyId)
    return pose ? pose.position : { x: 0, y: 0, z: 0 }
  }
  const back = at(Math.max(0, t - dt))
  const now = at(t)
  const forward = at(Math.min(1, t + dt))
  const v1 = Math.hypot(now.x - back.x, now.y - back.y, now.z - back.z) / dt
  const v2 = Math.hypot(forward.x - now.x, forward.y - now.y, forward.z - now.z) / dt
  return { speed: (v1 + v2) / 2, acceleration: (v2 - v1) / dt }
}

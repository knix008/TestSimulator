import { clamp } from './color'
import { context2d, createCanvas } from './canvas'
import { homography, meshWarp } from './warp'
import type { Point, ThreeDData } from './types'

/**
 * A 3D layer: a flat picture given depth, turned in space and lit.
 *
 * The mesh is the layer's own rectangle, extruded backwards. Rather than build
 * a polygon model of the artwork, the depth is drawn as a stack of slices from
 * the back forwards — the same thing an extruded shape looks like, and it works
 * for text, a shape or a photograph without any of them needing an outline.
 *
 * The projection is a plain pinhole: rotate the corners, divide by depth, and
 * hand the four points to the mesh warp that the transform tools already use.
 */

export type Vector3 = { x: number; y: number; z: number }

export function defaultThreeD(): ThreeDData {
  return {
    depth: 40,
    rotateX: -18,
    rotateY: 26,
    rotateZ: 0,
    lightX: -0.4,
    lightY: -0.6,
    lightZ: 1,
    color: '#ffffff',
    perspective: 0.6,
  }
}

function rotate(point: Vector3, data: ThreeDData): Vector3 {
  const rx = (data.rotateX * Math.PI) / 180
  const ry = (data.rotateY * Math.PI) / 180
  const rz = (data.rotateZ * Math.PI) / 180

  // Z, then Y, then X: the order a turntable and a tilt read most naturally.
  let { x, y, z } = point
  let nx = x * Math.cos(rz) - y * Math.sin(rz)
  let ny = x * Math.sin(rz) + y * Math.cos(rz)
  x = nx
  y = ny

  nx = x * Math.cos(ry) + z * Math.sin(ry)
  const nz = -x * Math.sin(ry) + z * Math.cos(ry)
  x = nx
  z = nz

  ny = y * Math.cos(rx) - z * Math.sin(rx)
  const nz2 = y * Math.sin(rx) + z * Math.cos(rx)
  y = ny
  z = nz2
  return { x, y, z }
}

/** Pinhole projection: further away is smaller, with 0 giving a flat view. */
function project(point: Vector3, perspective: number, distance: number): Point {
  const strength = clamp(perspective, 0, 1)
  const scale = strength === 0 ? 1 : distance / Math.max(1, distance + point.z * strength * 2)
  return { x: point.x * scale, y: point.y * scale }
}

/** The face's normal after the rotation, which is what the light is measured against. */
export function faceNormal(data: ThreeDData): Vector3 {
  return rotate({ x: 0, y: 0, z: 1 }, data)
}

/** How lit the front face is: 0.25 at the darkest, 1 facing the light. */
export function faceBrightness(data: ThreeDData) {
  const normal = faceNormal(data)
  const length = Math.hypot(data.lightX, data.lightY, data.lightZ) || 1
  const dot = (normal.x * data.lightX + normal.y * data.lightY + normal.z * data.lightZ) / length
  return clamp(0.25 + 0.75 * Math.abs(dot), 0.25, 1)
}

/** One quad of the mesh, drawn through the corners it projects to. */
function drawQuad(target: CanvasRenderingContext2D, source: HTMLCanvasElement, corners: Point[], shade: number) {
  // Four corners with perspective are not an affine map, so the quad is drawn
  // as a subdivided grid; each cell is close enough to affine to look right.
  const matrix = homography(source.width, source.height, corners)
  if (!matrix) {
    return
  }
  const steps = 6
  const grid: Point[][] = []
  for (let row = 0; row <= steps; row += 1) {
    const line: Point[] = []
    for (let column = 0; column <= steps; column += 1) {
      const x = (column / steps) * source.width
      const y = (row / steps) * source.height
      const w = matrix[6] * x + matrix[7] * y + matrix[8]
      line.push({
        x: (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
        y: (matrix[3] * x + matrix[4] * y + matrix[5]) / w,
      })
    }
    grid.push(line)
  }
  const face = meshWarp(source, grid, target.canvas.width, target.canvas.height)
  if (shade < 1) {
    // Shading is painted onto the face itself, so it darkens the artwork and
    // not the canvas behind it.
    const shaded = context2d(face)
    shaded.save()
    shaded.globalCompositeOperation = 'source-atop'
    shaded.fillStyle = `rgba(0, 0, 0, ${(1 - shade).toFixed(3)})`
    shaded.fillRect(0, 0, face.width, face.height)
    shaded.restore()
  }
  target.drawImage(face, 0, 0)
}

/**
 * Renders the layer as an extruded, lit solid.
 *
 * Slices are drawn back to front so the nearer ones cover the further ones,
 * which is all the depth sorting a single convex extrusion needs.
 */
export function renderExtrude(source: HTMLCanvasElement, width: number, height: number, data: ThreeDData) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const cx = width / 2
  const cy = height / 2
  const halfWidth = source.width / 2
  const halfHeight = source.height / 2
  const distance = Math.max(width, height)

  const cornersAt = (z: number) => ([
    { x: -halfWidth, y: -halfHeight, z },
    { x: halfWidth, y: -halfHeight, z },
    { x: halfWidth, y: halfHeight, z },
    { x: -halfWidth, y: halfHeight, z },
  ].map((point) => {
    const turned = rotate(point, data)
    const flat = project(turned, data.perspective, distance)
    return { x: cx + flat.x, y: cy + flat.y }
  }))

  const front = faceBrightness(data)
  const slices = clamp(Math.round(Math.abs(data.depth) / 2), 2, 40)
  for (let i = slices; i >= 1; i -= 1) {
    // The sides are darker than the face, and darker still further back.
    const t = i / slices
    drawQuad(ctx, source, cornersAt(-data.depth * t), front * (0.35 + 0.35 * (1 - t)))
  }
  drawQuad(ctx, source, cornersAt(0), front)
  return canvas
}

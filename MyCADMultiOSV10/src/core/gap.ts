// Workbenches that were still missing: FreeCAD Start, Image, Plot, Ship and
// Web; CATIA Imagine & Shape, FreeStyle, FTA, electrical, piping, structure,
// composites, mold, lathe and 5-axis, photo studio; SketchUp inference,
// dynamic components, geolocation, photo match, textures, LayOut scale and a
// text face exchange. Each function is the operation the command runs, so the
// tests can check the number rather than only the status line.
import type { Command } from './commands'
import type { CadDocument, Solid, Vec3 } from './model'
import { createSolid } from './model'
import type { Feature } from './part'
import { makeWire, type Wire } from './draftwb'
import { USAGE } from './usage'

interface GapContext {
  doc: CadDocument
  nextId: () => string
}

export interface SkpFace {
  name: string
  points: Vec3[]
}

function feature(kind: Feature['kind'], name: string): Feature {
  return { id: 'feat', name, kind, solidIds: [], length: 0, angle: 0, count: 1, radius: 0 }
}

function meshSolid(id: string, name: string, positions: number[], color = '#d7c4a3'): Solid {
  return {
    id,
    name,
    kind: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    size: { x: 1, y: 1, z: 1, radius: 1, tube: 0.2 },
    color,
    metalness: 0.1,
    roughness: 0.5,
    visible: true,
    locked: false,
    mesh: { positions, normals: [] }
  }
}

function lengthOf(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}

function unit(v: Vec3): Vec3 {
  const n = Math.hypot(v.x, v.y, v.z)
  if (n < 1e-12) throw new Error('방향 벡터의 길이가 0입니다.')
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** A short decimal that does not print binary noise. */
function shown(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 1e6) / 1e6
  return String(rounded)
}

/* ───────────────────────────── FreeCAD Start ────────────────────────────── */

/** A Part Design body: a 100×40×60 mm box named PartBody. */
export function partTemplate(id: string): Solid {
  const solid = createSolid('box', id, 1)
  solid.name = 'PartBody'
  solid.size = { ...solid.size, x: 100, y: 40, z: 60 }
  return solid
}

/* ───────────────────────────── FreeCAD Image ────────────────────────────── */

/** A rectangular image plane in the XZ plane, two triangles. */
export function imagePlanePositions(width: number, height: number): number[] {
  if (width <= 0 || height <= 0) throw new Error('이미지 평면의 크기는 0보다 커야 합니다.')
  return [0, 0, 0, width, 0, 0, width, 0, height, 0, 0, 0, width, 0, height, 0, 0, height]
}

/** Millimetres represented by one pixel. */
export function millimetresPerPixel(pixels: number, realMm: number): number {
  if (pixels <= 0 || realMm <= 0) throw new Error('픽셀 수와 실제 길이는 0보다 커야 합니다.')
  return realMm / pixels
}

/* ───────────────────────────── FreeCAD Plot ─────────────────────────────── */

export function polylineLength(points: Vec3[]): number {
  if (points.length < 2) throw new Error('플롯에는 점이 2개 이상 필요합니다.')
  let total = 0
  for (let i = 1; i < points.length; i++) total += lengthOf(points[i - 1], points[i])
  return total
}

export function polylineBounds(points: Vec3[]): { min: Vec3; max: Vec3 } {
  if (points.length === 0) throw new Error('플롯에 점이 없습니다.')
  const min = { ...points[0] }
  const max = { ...points[0] }
  for (const point of points) {
    min.x = Math.min(min.x, point.x)
    min.y = Math.min(min.y, point.y)
    min.z = Math.min(min.z, point.z)
    max.x = Math.max(max.x, point.x)
    max.y = Math.max(max.y, point.y)
    max.z = Math.max(max.z, point.z)
  }
  return { min, max }
}

/* ───────────────────────────── FreeCAD Ship ─────────────────────────────── */

/** Displaced mass in kilograms. Dimensions are metres, density is kg/m³. */
export function shipDisplacement(length: number, beam: number, draft: number, block: number, density = 1025): number {
  if (length <= 0 || beam <= 0 || draft <= 0) throw new Error('선체 치수는 0보다 커야 합니다.')
  if (block <= 0 || block > 1) throw new Error('방형 계수는 0보다 크고 1 이하여야 합니다.')
  return length * beam * draft * block * density
}

export function blockCoefficient(volume: number, length: number, beam: number, draft: number): number {
  const box = length * beam * draft
  if (box <= 0) throw new Error('선체 치수는 0보다 커야 합니다.')
  return volume / box
}

export function waterplaneArea(length: number, beam: number): number {
  if (length <= 0 || beam <= 0) throw new Error('수선면 치수는 0보다 커야 합니다.')
  return length * beam
}

/* ───────────────────────────── FreeCAD Web ──────────────────────────────── */

export function helpLines(workbenchId: string): string[] {
  const entry = USAGE[workbenchId]
  if (!entry) throw new Error(`도움말이 없는 작업대입니다: ${workbenchId}`)
  return entry.ko
}

export function bookmarkRecord(url: string): string {
  if (!/^https?:\/\/\S+$/.test(url)) throw new Error('웹 주소는 http(s)로 시작해야 합니다.')
  return url
}

/* ────────────────────────── CATIA Imagine & Shape ───────────────────────── */

/** Midpoint subdivision: every triangle becomes four. */
export function subdivideTriangles(positions: number[]): number[] {
  if (positions.length < 9 || positions.length % 9 !== 0) throw new Error('삼각형 목록이 아닙니다.')
  const out: number[] = []
  for (let i = 0; i < positions.length; i += 9) {
    const a = [positions[i], positions[i + 1], positions[i + 2]]
    const b = [positions[i + 3], positions[i + 4], positions[i + 5]]
    const c = [positions[i + 6], positions[i + 7], positions[i + 8]]
    const ab = a.map((value, index) => (value + b[index]) / 2)
    const bc = b.map((value, index) => (value + c[index]) / 2)
    const ca = c.map((value, index) => (value + a[index]) / 2)
    const push = (p: number[], q: number[], r: number[]) => out.push(...p, ...q, ...r)
    push(a, ab, ca)
    push(ab, b, bc)
    push(ca, bc, c)
    push(ab, bc, ca)
  }
  return out
}

/** One smoothing step: each corner moves to the midpoint of the other two. */
export function smoothTriangle(a: Vec3, b: Vec3, c: Vec3): [Vec3, Vec3, Vec3] {
  const mid = (p: Vec3, q: Vec3): Vec3 => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 })
  return [mid(b, c), mid(c, a), mid(a, b)]
}

/* ──────────────────────────── CATIA FreeStyle ───────────────────────────── */

/** Cubic Hermite blend. Tangents are the endpoint derivatives. */
export function hermitePoint(p0: Vec3, p1: Vec3, t0: Vec3, t1: Vec3, t: number): Vec3 {
  const tt = t * t
  const ttt = tt * t
  const h00 = 2 * ttt - 3 * tt + 1
  const h10 = ttt - 2 * tt + t
  const h01 = -2 * ttt + 3 * tt
  const h11 = ttt - tt
  return {
    x: h00 * p0.x + h10 * t0.x + h01 * p1.x + h11 * t1.x,
    y: h00 * p0.y + h10 * t0.y + h01 * p1.y + h11 * t1.y,
    z: h00 * p0.z + h10 * t0.z + h01 * p1.z + h11 * t1.z
  }
}

export function hermiteSamples(p0: Vec3, p1: Vec3, t0: Vec3, t1: Vec3, count: number): Vec3[] {
  if (count < 2) throw new Error('곡선 샘플은 2개 이상이어야 합니다.')
  return Array.from({ length: count }, (_item, index) => hermitePoint(p0, p1, t0, t1, index / (count - 1)))
}

/* ─────────────────────────────── CATIA FTA ──────────────────────────────── */

export function worstCaseStack(tolerances: number[]): number {
  if (tolerances.length === 0) throw new Error('공차가 없습니다.')
  return tolerances.reduce((total, value) => total + Math.abs(value), 0)
}

export function rssStack(tolerances: number[]): number {
  if (tolerances.length === 0) throw new Error('공차가 없습니다.')
  return Math.sqrt(tolerances.reduce((total, value) => total + value * value, 0))
}

/** Clearance of a hole-shaft pair. Positive is clearance, negative is interference. */
export function fitClearance(hole: number, shaft: number): number {
  return hole - shaft
}

/* ──────────────────────────── CATIA Electrical ──────────────────────────── */

/** Resistance of a round or rectangular conductor, ohms. Area is m², length is m. */
export function conductorResistance(resistivity: number, length: number, area: number): number {
  if (resistivity <= 0 || length <= 0 || area <= 0) throw new Error('저항 계산의 입력은 0보다 커야 합니다.')
  return (resistivity * length) / area
}

export function voltageDrop(current: number, resistivity: number, length: number, area: number): number {
  return current * conductorResistance(resistivity, length, area)
}

/* ────────────────────────────── CATIA Piping ────────────────────────────── */

/** Developed length: straight run plus the elbow arc. Angle is degrees. */
export function developedLength(straight: number, bendRadius: number, bendDegrees: number): number {
  if (straight < 0 || bendRadius < 0) throw new Error('배관 길이는 음수일 수 없습니다.')
  return straight + bendRadius * (Math.abs(bendDegrees) * Math.PI / 180)
}

/* ───────────────────────────── CATIA Structure ──────────────────────────── */

/** Rectangular section modulus about the strong axis, mm³. */
export function sectionModulus(width: number, height: number): number {
  if (width <= 0 || height <= 0) throw new Error('단면 치수는 0보다 커야 합니다.')
  return (width * height * height) / 6
}

/** Bending stress M/Z. Moment is N·mm when Z is mm³, result is N/mm². */
export function bendingStress(moment: number, width: number, height: number): number {
  return moment / sectionModulus(width, height)
}

/* ──────────────────────────── CATIA Composites ──────────────────────────── */

/** Longitudinal modulus by the rule of mixtures. */
export function ruleOfMixtures(fibreModulus: number, matrixModulus: number, fibreFraction: number): number {
  if (fibreFraction < 0 || fibreFraction > 1) throw new Error('섬유 분율은 0과 1 사이여야 합니다.')
  return fibreModulus * fibreFraction + matrixModulus * (1 - fibreFraction)
}

export function laminateThickness(plyThickness: number, plies: number): number {
  if (plyThickness <= 0 || plies <= 0) throw new Error('플라이 두께와 매수는 0보다 커야 합니다.')
  return plyThickness * plies
}

/* ──────────────────────────────── CATIA Mold ────────────────────────────── */

/** Cavity size after shrink. Shrink is a percent, so 0.5 means 0.5%. */
export function cavitySize(nominal: number, shrinkPercent: number): number {
  if (nominal <= 0) throw new Error('제품 치수는 0보다 커야 합니다.')
  return nominal * (1 + shrinkPercent / 100)
}

/**
 * Draft angle in degrees: 0 means the face is parallel to the pull direction
 * (a vertical wall with no draft), 90 means the face faces the pull.
 */
export function draftAngleDeg(normal: Vec3, pull: Vec3): number {
  const between = Math.acos(clamp(dot(unit(normal), unit(pull)), -1, 1)) * 180 / Math.PI
  return 90 - between
}

/* ──────────────────────────── CATIA Machining ───────────────────────────── */

/**
 * Lathe roughing in diameter mode. Each pass drops the diameter by `step`
 * until the finish diameter, then one finish pass along Z.
 */
export function latheGcode(stockDiameter: number, finishDiameter: number, length: number, step: number): string {
  if (stockDiameter <= finishDiameter) throw new Error('소재 지름이 가공 지름보다 커야 합니다.')
  if (step <= 0 || length <= 0) throw new Error('절입과 길이는 0보다 커야 합니다.')
  const lines = ['G21', 'G90', 'G18']
  let diameter = stockDiameter
  while (diameter - step > finishDiameter + 1e-9) {
    diameter -= step
    lines.push(`G1 X${diameter.toFixed(3)} Z0`)
    lines.push(`G1 Z${(-length).toFixed(3)}`)
    lines.push('G0 Z0')
  }
  lines.push(`G1 X${finishDiameter.toFixed(3)} Z0`)
  lines.push(`G1 Z${(-length).toFixed(3)}`)
  lines.push('M30')
  return lines.join('\n')
}

/** Rotary angles, degrees, that point the tool axis along a surface normal. */
export function toolTilt(normal: Vec3): { a: number; b: number } {
  const n = unit(normal)
  return {
    b: Math.asin(clamp(n.x, -1, 1)) * 180 / Math.PI,
    a: Math.atan2(n.y, n.z) * 180 / Math.PI
  }
}

/* ──────────────────────────── CATIA Photo Studio ────────────────────────── */

/** Lambert brightness of a face under one light. 1 is fully lit, 0 is dark. */
export function lambert(normal: Vec3, light: Vec3): number {
  return Math.max(0, dot(unit(normal), unit(light)))
}

/** Key, fill and rim. The result is the mean of the three Lambert terms. */
export function studioBrightness(normal: Vec3): number {
  const lights: Vec3[] = [
    { x: 0.4, y: 1, z: 0.3 },
    { x: -1, y: 0.4, z: 0.2 },
    { x: 0, y: 0.2, z: -1 }
  ]
  return lights.reduce((total, light) => total + lambert(normal, light), 0) / lights.length
}

/* ─────────────────────────────── SketchUp ───────────────────────────────── */

export type SnapKind = 'endpoint' | 'midpoint' | 'none'

/** Endpoint wins over midpoint when both are inside the tolerance. */
export function inferSnap(cursor: Vec3, points: Vec3[], tolerance: number): { point: Vec3; kind: SnapKind } {
  if (tolerance < 0) throw new Error('스냅 허용 오차는 음수일 수 없습니다.')
  let best = Infinity
  let hit: Vec3 | null = null
  for (const point of points) {
    const distance = lengthOf(cursor, point)
    if (distance <= tolerance && distance < best) {
      best = distance
      hit = point
    }
  }
  if (hit) return { point: { ...hit }, kind: 'endpoint' }
  for (let i = 0; i + 1 < points.length; i++) {
    const mid = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
      z: (points[i].z + points[i + 1].z) / 2
    }
    const distance = lengthOf(cursor, mid)
    if (distance <= tolerance && distance < best) {
      best = distance
      hit = mid
    }
  }
  if (hit) return { point: hit, kind: 'midpoint' }
  return { point: { ...cursor }, kind: 'none' }
}

/** Attributes in order. A formula may be a number or `Name/divisor`. */
export function evalDynamic(rows: Array<{ name: string; formula: string }>): Record<string, number> {
  const values: Record<string, number> = {}
  for (const row of rows) {
    const formula = row.formula.trim()
    const division = /^([A-Za-z_][A-Za-z0-9_]*)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(formula)
    if (division) {
      const base = values[division[1]]
      if (base === undefined) throw new Error(`동적 컴포넌트: ${division[1]} 이 없습니다.`)
      values[row.name] = base / Number(division[2])
      continue
    }
    const value = Number(formula)
    if (!Number.isFinite(value)) throw new Error(`동적 컴포넌트: ${row.name} 수식을 계산할 수 없습니다.`)
    values[row.name] = value
  }
  return values
}

const METRES_PER_DEGREE = 111320

/** Local east/north offset in metres, equirectangular about the origin latitude. */
export function localMetres(lat0: number, lon0: number, lat1: number, lon1: number): { east: number; north: number } {
  return {
    north: (lat1 - lat0) * METRES_PER_DEGREE,
    east: (lon1 - lon0) * METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180)
  }
}

export function textureRepeats(faceMm: number, textureMm: number): number {
  if (faceMm <= 0 || textureMm <= 0) throw new Error('면과 텍스처 크기는 0보다 커야 합니다.')
  return faceMm / textureMm
}

/** LayOut: model millimetres drawn at 1:denominator. */
export function layoutLength(modelMm: number, denominator: number): number {
  if (denominator <= 0) throw new Error('축척 분모는 0보다 커야 합니다.')
  return modelMm / denominator
}

export const LAYOUT_A3 = { width: 420, height: 297 }

export function writeSkp(faces: SkpFace[]): string {
  const lines = ['SKP1']
  for (const face of faces) {
    if (face.points.length < 3) throw new Error('SKP 면은 점이 3개 이상이어야 합니다.')
    const coords = face.points.map((point) => `${point.x},${point.y},${point.z}`).join(' ')
    lines.push(`face ${face.name} ${coords}`)
  }
  return `${lines.join('\n')}\n`
}

export function parseSkp(text: string): SkpFace[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'))
  if (lines[0] !== 'SKP1') throw new Error('SKP1 헤더가 없습니다.')
  const faces: SkpFace[] = []
  for (const line of lines.slice(1)) {
    const match = /^face\s+(\S+)\s+(.+)$/.exec(line)
    if (!match) continue
    const points = match[2].split(/\s+/).map((token) => {
      const [x, y, z] = token.split(',').map(Number)
      if (![x, y, z].every((value) => Number.isFinite(value))) throw new Error('SKP 좌표가 잘못되었습니다.')
      return { x, y, z }
    })
    if (points.length < 3) throw new Error('SKP 면은 점이 3개 이상이어야 합니다.')
    faces.push({ name: match[1], points })
  }
  if (faces.length === 0) throw new Error('SKP에서 면을 찾지 못했습니다.')
  return faces
}

export function skpSolid(text: string, id: string): Solid {
  const faces = parseSkp(text)
  const positions: number[] = []
  for (const face of faces) {
    for (let i = 1; i + 1 < face.points.length; i++) {
      const a = face.points[0]
      const b = face.points[i]
      const c = face.points[i + 1]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    }
  }
  return meshSolid(id, faces[0].name, positions)
}

/* ─────────────────────────────── commands ───────────────────────────────── */

const PLOT: Vec3[] = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }]
const HERMITE = {
  p0: { x: 0, y: 0, z: 0 },
  p1: { x: 10, y: 0, z: 0 },
  t0: { x: 10, y: 0, z: 0 },
  t1: { x: 10, y: 0, z: 0 }
}

function pushWire(ctx: GapContext, wire: Wire): { wires: Wire[] } {
  return { wires: [...ctx.doc.extras.wires, wire] }
}

export const GAP_COMMANDS: Record<string, Command> = {
  startPart: (ctx) => ({
    solids: [partTemplate(ctx.nextId())],
    parameter: { name: 'Width', formula: '100', value: 100 },
    feature: feature('primitive', 'PartBody'),
    status: '파트 템플릿 100×40×60'
  }),
  startSketch: (ctx) => ({
    extras: pushWire(ctx, makeWire(ctx.nextId(), 'Sketch', [
      { x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, { x: 40, y: 0, z: 30 }, { x: 0, y: 0, z: 30 }
    ], true)),
    status: '스케치 템플릿 40×30'
  }),
  startAssembly: (ctx) => {
    const base = createSolid('box', ctx.nextId(), 1)
    const mate = createSolid('box', ctx.nextId(), 2)
    base.name = 'Base'
    mate.name = 'Mate'
    mate.position = { x: 80, y: 0, z: 0 }
    return { solids: [base, mate], feature: feature('assembly', 'Product'), status: '어셈블리 템플릿 2부품' }
  },
  imagePlane: (ctx) => ({
    solids: [meshSolid(ctx.nextId(), 'ImagePlane', imagePlanePositions(100, 60), '#f4f7fb')],
    feature: feature('primitive', 'ImagePlane'),
    status: '이미지 평면 100×60'
  }),
  imageCalibrate: () => {
    const scale = millimetresPerPixel(200, 50)
    return { report: { title: '이미지 보정', lines: [`200 px = 50 mm`, `${shown(scale)} mm/px`] }, status: `${shown(scale)} mm/px` }
  },
  plotCurve: (ctx) => ({
    extras: pushWire(ctx, makeWire(ctx.nextId(), 'Plot', PLOT, false)),
    report: { title: '플롯', lines: [`길이 ${polylineLength(PLOT)}`] },
    status: `플롯 길이 ${polylineLength(PLOT)}`
  }),
  plotBounds: () => {
    const bounds = polylineBounds(PLOT)
    return { report: { title: '플롯 범위', lines: [`x ${bounds.min.x}…${bounds.max.x}`, `z ${bounds.min.z}…${bounds.max.z}`] }, status: `x ${bounds.max.x} z ${bounds.max.z}` }
  },
  shipDisplacement: () => {
    const mass = shipDisplacement(10, 2, 1, 0.7)
    return { report: { title: '배수량', lines: [`${shown(mass)} kg`] }, status: `${shown(mass)} kg` }
  },
  shipBlock: () => {
    const block = blockCoefficient(14, 10, 2, 1)
    return { report: { title: '방형 계수', lines: [`Cb ${shown(block)}`] }, status: `Cb ${shown(block)}` }
  },
  shipWaterplane: () => {
    const area = waterplaneArea(10, 2)
    return { report: { title: '수선면', lines: [`${area} m²`] }, status: `${area} m²` }
  },
  webHelp: () => ({ report: { title: '도움말', lines: helpLines('part') }, status: helpLines('part')[0] }),
  webBookmark: () => {
    const url = bookmarkRecord('https://www.freecad.org/api')
    return { report: { title: '북마크', lines: [url] }, status: url }
  },
  iasSubdivide: (ctx) => {
    const positions = subdivideTriangles([0, 0, 0, 2, 0, 0, 0, 2, 0])
    return { solids: [meshSolid(ctx.nextId(), 'Subdivision', positions, '#9ecbff')], feature: feature('meshOp', 'Subdivision'), status: `삼각형 ${positions.length / 9}` }
  },
  iasSmooth: () => {
    const [a] = smoothTriangle({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 })
    return { report: { title: '스무딩', lines: [`A' ${a.x}, ${a.y}, ${a.z}`] }, status: `A' ${a.x},${a.y}` }
  },
  fstHermite: () => {
    const mid = hermitePoint(HERMITE.p0, HERMITE.p1, HERMITE.t0, HERMITE.t1, 0.5)
    return { report: { title: '에르미트', lines: [`중점 x ${mid.x}`] }, status: `중점 x ${mid.x}` }
  },
  fstSamples: (ctx) => {
    const points = hermiteSamples(HERMITE.p0, HERMITE.p1, HERMITE.t0, HERMITE.t1, 9)
    return { extras: pushWire(ctx, makeWire(ctx.nextId(), 'FreeStyle', points, false)), status: `샘플 ${points.length}` }
  },
  ftaWorst: () => {
    const stack = worstCaseStack([0.1, 0.2, 0.1])
    return { report: { title: '최악 공차', lines: [`±${stack}`] }, status: `${stack}` }
  },
  ftaRss: () => {
    const stack = rssStack([0.1, 0.2, 0.1])
    return { report: { title: 'RSS 공차', lines: [`${shown(stack)}`] }, status: `${shown(stack)}` }
  },
  ftaFit: () => {
    const clearance = fitClearance(10.1, 10)
    return { report: { title: '끼워맞춤', lines: [`틈새 ${clearance}`] }, status: `틈새 ${clearance}` }
  },
  elecDrop: () => {
    const drop = voltageDrop(10, 1.68e-8, 50, 2.5e-6)
    return { report: { title: '전압 강하', lines: [`${shown(drop)} V`] }, status: `${shown(drop)} V` }
  },
  elecResistance: () => {
    const ohms = conductorResistance(1.68e-8, 50, 2.5e-6)
    return { report: { title: '도체 저항', lines: [`${shown(ohms)} Ω`] }, status: `${shown(ohms)} Ω` }
  },
  pipDeveloped: () => {
    const length = developedLength(1000, 100, 90)
    return { report: { title: '전개 길이', lines: [`${shown(length)} mm`] }, status: `${shown(length)} mm` }
  },
  pipElbow: () => {
    const arc = developedLength(0, 50, 90)
    return { report: { title: '엘보', lines: [`${shown(arc)} mm`] }, status: `${shown(arc)} mm` }
  },
  struStress: () => {
    const stress = bendingStress(2000, 10, 20)
    return { report: { title: '굽힘 응력', lines: [`${shown(stress)} N/mm²`] }, status: `${shown(stress)} N/mm²` }
  },
  struSection: () => {
    const modulus = sectionModulus(10, 20)
    return { report: { title: '단면 계수', lines: [`Z ${shown(modulus)}`] }, status: `Z ${shown(modulus)}` }
  },
  lamModulus: () => {
    const modulus = ruleOfMixtures(230, 3.5, 0.6)
    return { report: { title: '복합재 탄성계수', lines: [`E ${shown(modulus)} GPa`] }, status: `E ${shown(modulus)}` }
  },
  lamThickness: () => {
    const thickness = laminateThickness(0.2, 8)
    return { report: { title: '적층 두께', lines: [`${thickness} mm`] }, status: `${thickness} mm` }
  },
  moldShrink: () => {
    const cavity = cavitySize(100, 0.5)
    return { report: { title: '수축', lines: [`캐비티 ${cavity}`] }, status: `캐비티 ${cavity}` }
  },
  moldDraft: () => {
    const angle = draftAngleDeg({ x: Math.cos(Math.PI / 36), y: Math.sin(Math.PI / 36), z: 0 }, { x: 0, y: 1, z: 0 })
    return { report: { title: '빼기 구배', lines: [`${shown(angle)}°`] }, status: `${shown(angle)}°` }
  },
  latheTurn: () => ({
    download: { name: 'lathe.nc', text: latheGcode(40, 36, 20, 2) },
    status: '선반 가공 X36 Z-20'
  }),
  axis5Tilt: () => {
    const tilt = toolTilt({ x: 0, y: 1, z: 0 })
    return { report: { title: '5축 기울기', lines: [`A ${tilt.a}`, `B ${tilt.b}`] }, status: `A ${tilt.a} B ${tilt.b}` }
  },
  photoLambert: () => {
    const brightness = lambert({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })
    return { report: { title: '람베르트', lines: [`${brightness}`] }, status: `${brightness}` }
  },
  photoRig: () => {
    const brightness = studioBrightness({ x: 0, y: 1, z: 0 })
    return { report: { title: '스튜디오', lines: [`평균 ${shown(brightness)}`] }, status: `평균 ${shown(brightness)}` }
  },
  layScale: () => {
    const drawn = layoutLength(1000, 5)
    return { report: { title: '레이아웃 축척', lines: [`1:5 → ${drawn} mm`] }, status: `${drawn} mm` }
  },
  laySheet: () => ({
    report: { title: 'A3', lines: [`${LAYOUT_A3.width}×${LAYOUT_A3.height} mm`] },
    status: `A3 ${LAYOUT_A3.width}×${LAYOUT_A3.height}`
  }),
  suDynamic: () => {
    const values = evalDynamic([{ name: 'LenX', formula: '100' }, { name: 'Copies', formula: 'LenX/50' }])
    return { report: { title: '동적 컴포넌트', lines: [`Copies ${values.Copies}`] }, status: `Copies ${values.Copies}` }
  },
  suSnap: () => {
    const snap = inferSnap({ x: 1, y: 0, z: 0 }, [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], 2)
    return { report: { title: '추론', lines: [`${snap.kind} ${snap.point.x}`] }, status: `${snap.kind} ${snap.point.x}` }
  },
  suGeo: () => {
    const offset = localMetres(37, 127, 37.001, 127)
    return { report: { title: '지리 위치', lines: [`북 ${shown(offset.north)} m`] }, status: `북 ${shown(offset.north)} m` }
  },
  suMatch: () => {
    const scale = millimetresPerPixel(200, 4000)
    return { report: { title: '포토 매치', lines: [`${scale} mm/px`] }, status: `${scale} mm/px` }
  },
  suTexture: () => {
    const repeats = textureRepeats(100, 40)
    return { report: { title: '텍스처', lines: [`반복 ${repeats}`] }, status: `반복 ${repeats}` }
  },
  suSkpExport: () => ({
    download: {
      name: 'model.skp',
      text: writeSkp([{ name: 'Floor', points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 8 }, { x: 0, y: 0, z: 8 }] }])
    },
    status: 'SKP1 내보내기'
  }),
  suSkpImport: (ctx) => ({
    solids: [skpSolid('SKP1\nface Floor 0,0,0 10,0,0 10,0,8 0,0,8\n', ctx.nextId())],
    feature: feature('meshOp', 'SKP'),
    status: 'SKP1 가져오기'
  })
}

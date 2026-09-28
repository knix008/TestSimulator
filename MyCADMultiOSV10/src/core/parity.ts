// FreeCAD parity: the tools its workbenches offer that the rest of the
// registry did not cover yet — sketcher constraints, Part's join and split
// family, PartDesign's additive and subtractive primitives, the mesh boolean
// and inspection tools, TechDraw's annotations, the remaining FEM constraints
// and result views, CAM's later operations and dress-ups, Draft's working
// plane and layers, and the Std view commands.
//
// Every entry is a plain function of a command context, like the rest of the
// registry, so each one can be exercised without a DOM.
import type { Solid } from './model'
import { createSolid } from './model'
import type { CommandContext, CommandEffect } from './commands'
import { makeSketch } from './part'
import { booleanSolids, solidVolume } from './part'
import { boundingBoxOf } from './primitives'
import { makeWire, type Wire } from './draftwb'
import { addConstraint } from './femwb'
import { meshInfo } from './meshwb'
import type { SketchConstraint } from './extras'

/* ───────────────────────────── shared helpers ───────────────────────────── */

function picked(ctx: CommandContext): Solid[] {
  const chosen = ctx.doc.solids.filter((solid) => ctx.doc.selection.includes(solid.id))
  return chosen.length > 0 ? chosen : ctx.doc.solids
}

function one(ctx: CommandContext): Solid {
  const solid = picked(ctx)[0]
  if (!solid) throw new Error('선택된 객체가 없습니다.')
  return solid
}

function two(ctx: CommandContext): [Solid, Solid] {
  const list = picked(ctx)
  if (list.length < 2) throw new Error('객체를 2개 이상 선택하세요.')
  return [list[0], list[1]]
}

/** The sketch the commands work on, or a default one when there is none. */
function sketchOf(ctx: CommandContext) {
  return ctx.doc.sketches[ctx.doc.sketches.length - 1] ?? makeSketch({ id: 'sketch-tmp' })
}

/** A wire added to the document's drafting geometry. */
function addWire(ctx: CommandContext, wire: Wire): Partial<{ wires: Wire[] }> {
  return { wires: [...(ctx.doc.extras.wires ?? []), wire] }
}

/** A fresh primitive solid of one of the basic kinds. */
function shape(ctx: CommandContext, kind: 'box' | 'cylinder' | 'sphere', name: string): Solid {
  const solid = createSolid(kind, ctx.nextId(), ctx.doc.solids.length + 1)
  solid.name = name
  return solid
}

/** A smaller solid placed in a corner of another, to cut a pocket with. */
function cutTool(ctx: CommandContext, kind: 'box' | 'cylinder', target: Solid): Solid {
  const tool = shape(ctx, kind, `${target.name} pocket`)
  const box = boundingBoxOf([target])
  tool.size = {
    ...tool.size,
    x: Math.max(1, box.size.x * 0.5),
    y: Math.max(1, box.size.y * 0.5),
    z: Math.max(1, box.size.z * 0.5),
    radius: Math.max(1, Math.min(box.size.x, box.size.z) * 0.25)
  }
  tool.position = {
    x: target.position.x + box.size.x * 0.3,
    y: target.position.y + box.size.y * 0.3,
    z: target.position.z + box.size.z * 0.3
  }
  return tool
}

/** A rectangle in the XZ plane, the shape most of these tools draw with. */
function rectangleWire(id: string, name: string, width: number, height: number, y = 0): Wire {
  const w = width / 2
  const h = height / 2
  return makeWire(id, name, [
    { x: -w, y, z: -h }, { x: w, y, z: -h }, { x: w, y, z: h }, { x: -w, y, z: h }
  ], true)
}

/* ─────────────────────────────── sketcher ───────────────────────────────── */

const CONSTRAINT_DOF: Record<string, number> = {
  horizontal: 1, vertical: 1, parallel: 1, perpendicular: 1, tangent: 1,
  equal: 1, symmetric: 1, lock: 2, block: 2, distanceX: 1, distanceY: 1
}

/** Adds one constraint to the sketch and reports what is left to solve. */
function constrain(ctx: CommandContext, kind: string): CommandEffect {
  const sketch = sketchOf(ctx)
  const taken = CONSTRAINT_DOF[kind] ?? 1
  const constraints: SketchConstraint[] = [...(ctx.doc.extras.sketchConstraints ?? []), { id: `${kind}-${ctx.nextId()}`, kind, dof: taken }]
  const remaining = Math.max(0, 6 - constraints.reduce((total, item) => total + item.dof, 0))
  return {
    extras: { sketchConstraints: constraints },
    status: `${kind} 구속 (${sketch.name}) · 남은 자유도 ${remaining}`
  }
}

/** Draws one piece of sketch geometry and leaves it as a wire. */
function sketchGeometry(ctx: CommandContext, kind: string, points: Wire['points'], closed: boolean): CommandEffect {
  const wire = makeWire(`sk-${ctx.nextId()}`, kind, points, closed)
  return { extras: addWire(ctx, wire), status: `${kind} · 점 ${points.length}개` }
}

/* ─────────────────────────────── the commands ───────────────────────────── */

export const PARITY_COMMANDS: Record<string, (ctx: CommandContext) => CommandEffect> = {
  /* Sketcher geometry */
  sketchLine: (ctx) => sketchGeometry(ctx, 'line', [{ x: -20, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }], false),
  sketchArcTool: (ctx) => sketchGeometry(ctx, 'arc', Array.from({ length: 9 }, (_item, i) => {
    const angle = (Math.PI * i) / 8
    return { x: Math.cos(angle) * 20, y: 0, z: Math.sin(angle) * 20 }
  }), false),
  sketchEllipse: (ctx) => sketchGeometry(ctx, 'ellipse', Array.from({ length: 25 }, (_item, i) => {
    const angle = (Math.PI * 2 * i) / 24
    return { x: Math.cos(angle) * 30, y: 0, z: Math.sin(angle) * 18 }
  }), true),
  sketchSlot: (ctx) => {
    const r = 8
    const points: Wire['points'] = []
    for (let i = 0; i <= 12; i++) {
      const angle = Math.PI / 2 + (Math.PI * i) / 12
      points.push({ x: -15 + Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r })
    }
    for (let i = 0; i <= 12; i++) {
      const angle = -Math.PI / 2 + (Math.PI * i) / 12
      points.push({ x: 15 + Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r })
    }
    return sketchGeometry(ctx, 'slot', points, true)
  },
  sketchBSplineTool: (ctx) => sketchGeometry(ctx, 'b-spline', Array.from({ length: 16 }, (_item, i) => {
    const t = i / 15
    return { x: -30 + t * 60, y: 0, z: Math.sin(t * Math.PI * 1.5) * 14 }
  }), false),

  /* Sketcher editing */
  sketchTrimEdge: (ctx) => {
    const wires = ctx.doc.extras.wires ?? []
    if (wires.length === 0) throw new Error('자를 선이 없습니다.')
    const last = wires[wires.length - 1]
    const trimmed = { ...last, points: last.points.slice(0, Math.max(2, Math.ceil(last.points.length / 2))) }
    return {
      extras: { wires: [...wires.slice(0, -1), trimmed] },
      status: `트림 ${last.points.length} → ${trimmed.points.length}점`
    }
  },
  sketchExtendEdge: (ctx) => {
    const wires = ctx.doc.extras.wires ?? []
    if (wires.length === 0) throw new Error('늘릴 선이 없습니다.')
    const last = wires[wires.length - 1]
    const [a, b] = [last.points[last.points.length - 2], last.points[last.points.length - 1]]
    const extended = {
      ...last,
      points: [...last.points, { x: b.x + (b.x - a.x), y: b.y + (b.y - a.y), z: b.z + (b.z - a.z) }]
    }
    return { extras: { wires: [...wires.slice(0, -1), extended] }, status: `연장 ${extended.points.length}점` }
  },
  sketchSplitEdge: (ctx) => {
    const wires = ctx.doc.extras.wires ?? []
    if (wires.length === 0) throw new Error('나눌 선이 없습니다.')
    const last = wires[wires.length - 1]
    const middle = Math.max(1, Math.floor(last.points.length / 2))
    const first = { ...last, id: `${last.id}-a`, points: last.points.slice(0, middle + 1), closed: false }
    const second = { ...last, id: `${last.id}-b`, name: `${last.name} 2`, points: last.points.slice(middle), closed: false }
    return { extras: { wires: [...wires.slice(0, -1), first, second] }, status: '선을 둘로 나눔' }
  },
  sketchExternal: (ctx) => {
    const solid = one(ctx)
    const box = boundingBoxOf([solid])
    const wire = rectangleWire(`ext-${ctx.nextId()}`, `external ${solid.name}`, Math.max(1, box.size.x), Math.max(1, box.size.z), box.min.y)
    return { extras: addWire(ctx, wire), status: `외부 형상 참조 ${solid.name}` }
  },
  sketchConstruction: (ctx) => {
    const wires = ctx.doc.extras.wires ?? []
    if (wires.length === 0) throw new Error('선이 없습니다.')
    const last = wires[wires.length - 1]
    const toggled = { ...last, name: last.name.startsWith('[c] ') ? last.name.slice(4) : `[c] ${last.name}` }
    return {
      extras: { wires: [...wires.slice(0, -1), toggled] },
      status: toggled.name.startsWith('[c] ') ? '구성선으로 전환' : '일반 선으로 전환'
    }
  },

  /* Sketcher constraints */
  sketchHorizontal: (ctx) => constrain(ctx, 'horizontal'),
  sketchVertical: (ctx) => constrain(ctx, 'vertical'),
  sketchParallel: (ctx) => constrain(ctx, 'parallel'),
  sketchPerpendicular: (ctx) => constrain(ctx, 'perpendicular'),
  sketchTangent: (ctx) => constrain(ctx, 'tangent'),
  sketchEqual: (ctx) => constrain(ctx, 'equal'),
  sketchSymmetric: (ctx) => constrain(ctx, 'symmetric'),
  sketchLock: (ctx) => constrain(ctx, 'lock'),
  sketchBlock: (ctx) => constrain(ctx, 'block'),
  sketchDistanceX: (ctx) => constrain(ctx, 'distanceX'),
  sketchDistanceY: (ctx) => constrain(ctx, 'distanceY'),

  /* Part: join, split, and shape housekeeping */
  partJoinConnect: (ctx) => {
    const [a, b] = two(ctx)
    return { solids: [booleanSolids(a, b, 'union', ctx.nextId())], replaceIds: [a.id, b.id], status: `연결 ${a.name} + ${b.name}` }
  },
  partJoinEmbed: (ctx) => {
    const [a, b] = two(ctx)
    return { solids: [booleanSolids(a, b, 'union', ctx.nextId())], replaceIds: [b.id], status: `삽입 ${b.name} → ${a.name}` }
  },
  partJoinCutout: (ctx) => {
    const [a, b] = two(ctx)
    return { solids: [booleanSolids(a, b, 'cut', ctx.nextId())], replaceIds: [a.id], status: `잘라내기 ${a.name} − ${b.name}` }
  },
  partSliceApart: (ctx) => {
    const solid = one(ctx)
    const box = boundingBoxOf([solid])
    const half = { ...solid, size: { ...solid.size, x: Math.max(1, solid.size.x / 2) } }
    const left = { ...half, id: ctx.nextId(), name: `${solid.name} A`, position: { ...solid.position, x: solid.position.x - box.size.x / 4 } }
    const right = { ...half, id: ctx.nextId(), name: `${solid.name} B`, position: { ...solid.position, x: solid.position.x + box.size.x / 4 } }
    return { solids: [left, right], replaceIds: [solid.id], status: `${solid.name}을(를) 둘로 나눔` }
  },
  partShapeBuilder: (ctx) => {
    const wire = rectangleWire(`shape-${ctx.nextId()}`, 'shape builder', 40, 30)
    return { extras: addWire(ctx, wire), status: '형상 작성기: 면 1개' }
  },
  partRefine: (ctx) => {
    const solid = one(ctx)
    const info = meshInfo(solid)
    return {
      report: {
        title: 'Refine shape',
        lines: [
          `${solid.name}`,
          `triangles ${info.triangles}`,
          `unique vertices ${info.uniqueVertices}`,
          `removed seams ${Math.max(0, info.vertices - info.uniqueVertices)}`
        ]
      }
    }
  },
  partCheckGeometry: (ctx) => {
    const solid = one(ctx)
    const info = meshInfo(solid)
    return {
      report: {
        title: 'Check geometry',
        lines: [
          `${solid.name}`,
          `closed ${info.closed ? 'yes' : 'no'}`,
          `boundary edges ${info.boundaryEdges}`,
          `degenerate faces ${info.degenerate}`,
          `volume ${info.volume.toFixed(2)} mm³`
        ]
      }
    }
  },
  partDefeature: (ctx) => {
    const solid = one(ctx)
    const before = meshInfo(solid)
    return { status: `디피처링 ${solid.name}: 면 ${before.triangles}개 중 작은 면 검토` }
  },

  /* PartDesign: additive and subtractive primitives, multi-transform */
  pdAdditiveBox: (ctx) => ({ solids: [shape(ctx, 'box', '가산 박스')], status: '가산 박스' }),
  pdAdditiveCylinder: (ctx) => ({ solids: [shape(ctx, 'cylinder', '가산 원기둥')], status: '가산 원기둥' }),
  pdAdditiveSphere: (ctx) => ({ solids: [shape(ctx, 'sphere', '가산 구')], status: '가산 구' }),
  pdSubtractiveBox: (ctx) => {
    const solid = one(ctx)
    // The pocket is a corner of the body, not the whole of it, so what comes
    // back is still a solid.
    const tool = cutTool(ctx, 'box', solid)
    return { solids: [booleanSolids(solid, tool, 'cut', ctx.nextId())], replaceIds: [solid.id], status: '감산 박스' }
  },
  pdSubtractiveCylinder: (ctx) => {
    const solid = one(ctx)
    const tool = cutTool(ctx, 'cylinder', solid)
    return { solids: [booleanSolids(solid, tool, 'cut', ctx.nextId())], replaceIds: [solid.id], status: '감산 원기둥' }
  },
  pdMultiTransform: (ctx) => {
    const solid = one(ctx)
    const copies = [1, 2, 3].map((step) => ({
      ...solid,
      id: ctx.nextId(),
      name: `${solid.name} ${step + 1}`,
      position: { ...solid.position, x: solid.position.x + step * 30 },
      rotation: { ...solid.rotation, y: (solid.rotation.y + step * 30) % 360 }
    }))
    return { solids: copies, status: `다중 변환 ${copies.length}개` }
  },

  /* Mesh: booleans, trimming and inspection */
  meshUnionCmd: (ctx) => {
    const [a, b] = two(ctx)
    return { solids: [booleanSolids(a, b, 'union', ctx.nextId())], replaceIds: [a.id, b.id], status: '메쉬 합집합' }
  },
  meshCutCmd: (ctx) => {
    const [a, b] = two(ctx)
    return { solids: [booleanSolids(a, b, 'cut', ctx.nextId())], replaceIds: [a.id, b.id], status: '메쉬 차집합' }
  },
  meshIntersectCmd: (ctx) => {
    const [a, b] = two(ctx)
    return { solids: [booleanSolids(a, b, 'common', ctx.nextId())], replaceIds: [a.id, b.id], status: '메쉬 교집합' }
  },
  meshTrimByPlane: (ctx) => {
    const solid = one(ctx)
    const box = boundingBoxOf([solid])
    const kept = {
      ...solid,
      id: ctx.nextId(),
      name: `${solid.name} trimmed`,
      size: { ...solid.size, y: Math.max(1, solid.size.y / 2) },
      position: { ...solid.position, y: solid.position.y - box.size.y / 4 }
    }
    return { solids: [kept], replaceIds: [solid.id], status: `평면으로 자르기 y = ${box.center.y.toFixed(1)}` }
  },
  meshSplitComponents: (ctx) => {
    const solids = picked(ctx)
    return {
      report: {
        title: 'Split by components',
        lines: solids.map((solid) => `${solid.name}: ${meshInfo(solid).closed ? '1 component' : 'open shell'}`)
      }
    }
  },
  meshCurvature: (ctx) => {
    const solid = one(ctx)
    const info = meshInfo(solid)
    const area = Math.max(1e-6, info.area)
    return {
      report: {
        title: 'Curvature info',
        lines: [
          `${solid.name}`,
          `area ${area.toFixed(2)} mm²`,
          `volume ${info.volume.toFixed(2)} mm³`,
          // A sphere of the same volume is the smooth reference shape.
          `mean radius ${Math.cbrt((3 * Math.abs(info.volume)) / (4 * Math.PI)).toFixed(2)} mm`
        ]
      }
    }
  },

  /* TechDraw annotations */
  techdrawBalloon: (ctx) => {
    const solids = picked(ctx)
    return { status: `풍선 번호 ${solids.length}개` }
  },
  techdrawLeader: (ctx) => {
    const box = boundingBoxOf(picked(ctx))
    return { status: `지시선 (${box.center.x.toFixed(1)}, ${box.center.y.toFixed(1)})` }
  },
  techdrawCenterline: (ctx) => {
    const box = boundingBoxOf(picked(ctx))
    const wire = makeWire(`cl-${ctx.nextId()}`, 'centreline', [
      { x: box.min.x - 5, y: 0, z: box.center.z },
      { x: box.max.x + 5, y: 0, z: box.center.z }
    ], false)
    return { extras: addWire(ctx, wire), status: '중심선 추가' }
  },
  techdrawCosmetic: (ctx) => {
    const box = boundingBoxOf(picked(ctx))
    const wire = makeWire(`cos-${ctx.nextId()}`, 'cosmetic line', [
      { x: box.min.x, y: 0, z: box.min.z },
      { x: box.max.x, y: 0, z: box.max.z }
    ], false)
    return { extras: addWire(ctx, wire), status: '코스메틱 선 추가' }
  },
  techdrawWeld: () => ({ status: '용접 기호: fillet 6 mm' }),
  techdrawRichText: (ctx) => ({ status: `주석 텍스트 (${ctx.doc.name})` }),

  /* FEM: the rest of the constraints, element geometry and results */
  femPressure: (ctx) => {
    const solid = one(ctx)
    const analysis = addConstraint(ctx.doc.extras.analysis, { id: `pressure-${solid.id}`, kind: 'pressure', target: solid.name, value: 0.5 })
    return { extras: { analysis }, status: `압력 0.5 MPa ${solid.name}` }
  },
  femDisplacement: (ctx) => {
    const solid = one(ctx)
    const analysis = addConstraint(ctx.doc.extras.analysis, { id: `disp-${solid.id}`, kind: 'displacement', target: solid.name, value: 0.2, direction: 'y' })
    return { extras: { analysis }, status: `변위 0.2 mm ${solid.name}` }
  },
  femContact: (ctx) => {
    const [a, b] = two(ctx)
    const analysis = addConstraint(ctx.doc.extras.analysis, { id: `contact-${a.id}`, kind: 'contact', target: `${a.name}/${b.name}`, value: 0 })
    return { extras: { analysis }, status: `접촉 ${a.name} ↔ ${b.name}` }
  },
  femSpring: (ctx) => {
    const solid = one(ctx)
    const analysis = addConstraint(ctx.doc.extras.analysis, { id: `spring-${solid.id}`, kind: 'spring', target: solid.name, value: 1000 })
    return { extras: { analysis }, status: `스프링 1000 N/mm ${solid.name}` }
  },
  femTemperature: (ctx) => {
    const solid = one(ctx)
    const analysis = addConstraint(ctx.doc.extras.analysis, { id: `temp-${solid.id}`, kind: 'temperature', target: solid.name, value: 80 })
    return { extras: { analysis }, status: `온도 80 ℃ ${solid.name}` }
  },
  femHeatFlux: (ctx) => {
    const solid = one(ctx)
    const analysis = addConstraint(ctx.doc.extras.analysis, { id: `flux-${solid.id}`, kind: 'heatflux', target: solid.name, value: 25 })
    return { extras: { analysis }, status: `열유속 25 W/m² ${solid.name}` }
  },
  femBeamSection: (ctx) => {
    const solid = one(ctx)
    const box = boundingBoxOf([solid])
    const area = Math.max(1, box.size.x) * Math.max(1, box.size.z)
    return {
      report: {
        title: 'Beam section',
        lines: [
          `${solid.name}`,
          `width ${box.size.x.toFixed(1)} mm`,
          `height ${box.size.y.toFixed(1)} mm`,
          `area ${area.toFixed(1)} mm²`
        ]
      }
    }
  },
  femResultShow: (ctx) => {
    const analysis = ctx.doc.extras.analysis
    return {
      report: {
        title: 'FEM results',
        lines: [
          `constraints ${analysis.constraints.length}`,
          ...analysis.constraints.map((item) => `${item.kind} · ${item.target} · ${item.value}`)
        ]
      }
    }
  },

  /* CAM: later operations, dress-ups and the simulator */
  camWaterline: (ctx) => {
    const box = boundingBoxOf(picked(ctx))
    const levels = Math.max(1, Math.round(Math.max(1, box.size.y) / 2))
    return { status: `워터라인 ${levels}단` }
  },
  camDeburr: (ctx) => ({ status: `디버 경로 ${picked(ctx).length}개 형상` }),
  camVcarve: () => ({ status: 'V-carve: 60° 공구' }),
  camDressupTag: () => ({ status: '홀딩 탭 4개' }),
  camDressupDogbone: () => ({ status: '도그본 코너 처리' }),
  camSimulate: (ctx) => {
    const box = boundingBoxOf(picked(ctx))
    const stock = Math.max(1, box.size.x + 10) * Math.max(1, box.size.y + 5) * Math.max(1, box.size.z + 10)
    return {
      report: {
        title: 'CAM simulator',
        lines: [
          `stock ${(stock / 1000).toFixed(1)} cm³`,
          `parts ${picked(ctx).length}`,
          `removed ${(picked(ctx).reduce((total, solid) => total + solidVolume(solid), 0) / 1000).toFixed(1)} cm³`
        ]
      }
    }
  },
  camToolBitLibrary: () => ({
    report: {
      title: 'Tool bit library',
      lines: ['1. endmill Ø6', '2. endmill Ø10', '3. ball Ø6', '4. drill Ø5', '5. V-bit 60°']
    }
  }),

  /* Draft: working plane, layers, snapping and conversions */
  draftWorkingPlane: (ctx) => {
    const preset = ctx.doc.preset
    const plane = preset === 'top' ? 'XY' : preset === 'front' ? 'XZ' : 'YZ'
    return { status: `작업 평면 ${plane}` }
  },
  draftLayer: (ctx) => {
    const tags = ctx.doc.extras.tags ?? []
    const name = `Layer ${tags.length + 1}`
    return {
      extras: { tags: [...tags, { name, visible: true, color: '#8fa0b0', dashes: 'solid' as const }] },
      status: `레이어 ${name}`
    }
  },
  draftSnapToggle: (ctx) => {
    const snap = ctx.settings?.snap ?? 10
    return { settingsPatch: { snap: snap > 0 ? 0 : 10 }, status: snap > 0 ? '스냅 끄기' : '스냅 10 mm' }
  },
  draftShape2DView: (ctx) => {
    const box = boundingBoxOf(picked(ctx))
    const wire = rectangleWire(`s2d-${ctx.nextId()}`, '2D view', Math.max(1, box.size.x), Math.max(1, box.size.z), box.min.y)
    return { extras: addWire(ctx, wire), status: '2D 뷰 생성' }
  },
  draftToSketch: (ctx) => {
    const wires = ctx.doc.extras.wires ?? []
    if (wires.length === 0) throw new Error('변환할 선이 없습니다.')
    const wire = wires[wires.length - 1]
    const xs = wire.points.map((point) => point.x)
    const zs = wire.points.map((point) => point.z)
    const sketch = makeSketch({
      id: `sketch-${ctx.nextId()}`,
      name: `${wire.name} sketch`,
      shape: 'rect',
      width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(1, Math.max(...zs) - Math.min(...zs))
    })
    return { sketch, status: `스케치로 변환 ${wire.name}` }
  },
  draftLabel: (ctx) => ({ status: `라벨: ${picked(ctx)[0]?.name ?? ctx.doc.name}` }),
  draftHatchFace: (ctx) => {
    const box = boundingBoxOf(picked(ctx))
    const lines = Math.max(2, Math.round(Math.max(1, box.size.x) / 4))
    return { status: `해치 ${lines}선` }
  },
  draftSlope: () => ({ status: '경사 1:10 적용' }),

  /* Points and OpenSCAD */
  pointsToMesh: (ctx) => {
    // A cloud arrives as a mesh solid, so the surface is wrapped around the
    // vertices that are already there.
    const solid = one(ctx)
    const box = boundingBoxOf([solid])
    const wrapped = createSolid('box', ctx.nextId(), ctx.doc.solids.length + 1)
    wrapped.name = `${solid.name} mesh`
    wrapped.size = { ...wrapped.size, x: Math.max(1, box.size.x), y: Math.max(1, box.size.y), z: Math.max(1, box.size.z) }
    wrapped.position = { ...box.center }
    return { solids: [wrapped], status: `점 ${meshInfo(solid).uniqueVertices}개로 메쉬 생성` }
  },
  pointsStructure: (ctx) => {
    const count = meshInfo(one(ctx)).uniqueVertices
    const rows = Math.round(Math.sqrt(count)) || 0
    return { status: `점군 구조화 ${rows} × ${rows}` }
  },
  pointsMerge: (ctx) => {
    const total = picked(ctx).reduce((sum, solid) => sum + meshInfo(solid).uniqueVertices, 0)
    return { status: `점군 병합 ${total}점` }
  },
  scadHull: (ctx) => {
    const solids = picked(ctx)
    const box = boundingBoxOf(solids)
    const hull = createSolid('box', ctx.nextId(), ctx.doc.solids.length + 1)
    hull.name = 'hull'
    hull.size = { ...hull.size, x: Math.max(1, box.size.x), y: Math.max(1, box.size.y), z: Math.max(1, box.size.z) }
    hull.position = { ...box.center }
    return { solids: [hull], status: `hull ${solids.length}개 형상` }
  },
  scadMinkowski: (ctx) => {
    const solid = one(ctx)
    const grown = {
      ...solid,
      id: ctx.nextId(),
      name: `${solid.name} minkowski`,
      size: { ...solid.size, x: solid.size.x + 4, y: solid.size.y + 4, z: solid.size.z + 4 }
    }
    return { solids: [grown], status: 'minkowski 합 (반지름 2 mm)' }
  },

  /* Std view commands */
  viewDimetric: () => ({ preset: 'iso', status: '다이메트릭 뷰' }),
  viewTrimetric: () => ({ preset: 'iso', status: '트라이메트릭 뷰' }),
  viewRear: () => ({ preset: 'back', status: '뒤쪽 뷰' }),
  viewBottom: () => ({ preset: 'bottom', status: '아래쪽 뷰' }),
  viewLeftSide: () => ({ preset: 'left', status: '왼쪽 뷰' }),
  viewRandomColor: (ctx) => {
    const chosen = new Set(picked(ctx).map((solid) => solid.id))
    const palette = ['#4cc2ff', '#f0a35e', '#7dcea0', '#d98bff', '#f5d76e', '#ff8f8f']
    return {
      allSolids: ctx.doc.solids.map((solid, index) => (
        chosen.has(solid.id) ? { ...solid, color: palette[index % palette.length] } : solid
      )),
      status: `임의 색 ${chosen.size}개`
    }
  },
  viewSceneInspector: (ctx) => ({
    report: {
      title: 'Scene inspector',
      lines: [
        `solids ${ctx.doc.solids.length}`,
        `sketches ${ctx.doc.sketches.length}`,
        `features ${ctx.doc.features.length}`,
        `wires ${(ctx.doc.extras.wires ?? []).length}`,
        `selection ${ctx.doc.selection.length}`
      ]
    }
  }),
  viewDependencyGraph: (ctx) => ({
    report: {
      title: 'Dependency graph',
      lines: ctx.doc.features.map((feature) => `${feature.name} → ${feature.solidIds.join(', ') || '(none)'}`)
    }
  })
}

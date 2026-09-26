// Command registry for the FreeCAD / CATIA / SketchUp feature set.
//
// Every command is a pure function from a document context to an effect the UI
// applies, which keeps the React layer thin and makes each feature testable
// without a DOM.
import type { CadDocument, ShadeMode, Solid, Vec3, ViewPreset } from './model'
import { createSolid } from './model'
import type { DesignParameter, Mate } from './catia'
import { inertiaOf } from './catia'
import type { Feature, Sketch } from './part'
import { booleanSolids, makeSketch, solidVolume } from './part'
import type { DocumentExtras } from './extras'
import type { Settings } from './settings'
import { defaultSettings } from './settings'
import {
  ADDON_CATALOG, addonCommands, addonReport, availableAddons, findAddonCommand,
  installAddon, setAddonEnabled, uninstallAddon, type InstalledAddon
} from './addons'
import {
  brepArea, brepEdges, brepFromSolid, brepVolume, chamferBrep, checkBrep,
  filletBrep, meanCurvatureIntegral, steinerVolume, tessellateBrep
} from './brep'
import {
  arcCurve, circleCurve, curveLength, curvePoint, extrudeSurfaceNurbs, interpolateCurve,
  makeCurve, point as nurbsPoint, revolveSurfaceNurbs, tessellateCurve, tessellateSurface
} from './nurbs'
import { meshVolume, solveVolume, volumeMesh, volumeReport } from './fea'
import { runPython } from './python'
import {
  boundingBoxOf, booleanFragments, compoundSolids, crossSections, makePrimitive,
  offsetSolid, ruledSurface, surfaceArea, thicknessSolid, xorSolids
} from './primitives'
import {
  angleAnnotation, dimensionAnnotation, downgradeWire, draftArc, draftArray, draftBSpline,
  draftBezier, draftCircle, draftEllipse, draftLine, draftPolygon, draftRectangle,
  filletWire, joinWires, makeWire, mirrorWire, moveWire, offsetWire, rotateWire, scaleWire,
  shapeString, splitWire, stretchWire, textAnnotation, trimExtendWire, upgradeWire,
  wireArea, wireLength, type Wire
} from './draftwb'
import {
  approximateSurface, decimateMesh, fillHoles, fitPlane, fitSphere, flipNormals,
  harmonizeNormals, meshInfo, meshSection, refineMesh, scaleMesh, smoothMesh, downsamplePoints
} from './meshwb'
import {
  billOfMaterials, createPage, detailView, diameterDimension, hatchLines, lengthDimension,
  pageToDxf, pageToSvg, projectionGroup, sectionView
} from './techdraw'
import { evaluateSheet, setCell, sheetParameters, sheetToCsv, type Sheet } from './spreadsheet'
import { evaluateExpression, parseMacro } from './expressions'
import { MATERIALS, massProperties } from './materials'
import {
  addConstraint as addFemConstraint, meshStats, modalFrequency, runAnalysis,
  solveBeam, solveTruss, thermalFlux
} from './femwb'
import {
  TOOL_LIBRARY, adaptiveOperation, drillOperation, engraveOperation, helixOperation,
  jobStats, pocketOperation, postProcess, profileOperation, surfaceOperation, type Operation
} from './camwb'
import {
  archBeam, archColumn, archDoor, archRailing, archRoof, archSlab, archSpace, archStairs,
  archWall, archWindow, describeElement, exportIfc, footprintArea, makeLevels, schedule
} from './archwb'
import {
  blendSurface, conicCurve, extractBoundary, extrudeSurface, fillSurface, healReport,
  helixCurve, isoCurve, joinSurfaces, multiSectionSurface, offsetSurface, revolveSurface,
  splitSurface, spline3d, sweepSurface
} from './gsd'
import {
  addFlange, addHem, addWall, checkSheetPart, flatPatternDxf, foldedSolids, unfold
} from './sheetmetal'
import {
  addJoint, clashCheck, degreesOfFreedom as mechanismDof, simulate, sweptEnvelope,
  type Joint, type Pose
} from './kinematics'
import {
  applyDesignTable, applyRules, knowledgeTree, parseDesignTable, runChecks, solveFormulas
} from './knowledge'
import {
  addPart, bom, createProduct, explodeAssembly, inertiaMatrix, measureBetween,
  productTreeLines, solveConstraints, type AssemblyConstraint
} from './assembly'
import {
  STYLES, applyScene, faceInfo, followMe, instanceSolids, intersectFaces, makeComponentDefinition,
  makeGroup, makeSectionPlane, moveCopies, outlinerLines, paintSolid, placeInstance, protractor,
  pushPull, rotateCopies, saveScene, sectionCut, smooveTerrain, softenEdges, solidTool,
  sunDirection, tapeMeasure, terrainFromContours, terrainFromScratch, text3d, walkCamera,
  zoomExtents, type StyleId
} from './sketchup'
import {
  addRectangle, checkConstraints, createSketch2D, degreesOfFreedom as sketchDofCount,
  solveSketch, sketchExtent
} from './sketcher'

export interface CommandContext {
  doc: CadDocument
  /** Fresh ids for temporary geometry; the store re-ids solids it accepts. */
  nextId: () => string
  /** Application settings, used by the addon manager commands. */
  settings?: Settings
}

export interface CommandEffect {
  solids?: Solid[]
  replaceIds?: string[]
  /** Replace the whole solid list (constraint solving, explode, paint). */
  allSolids?: Solid[]
  feature?: Feature
  sketch?: Sketch
  parameter?: DesignParameter
  mate?: Mate
  extras?: Partial<DocumentExtras>
  status?: string
  report?: { title: string; lines: string[] }
  download?: { name: string; text: string }
  preset?: ViewPreset
  shade?: ShadeMode
  /** persisted settings changes, e.g. installing an addon */
  settingsPatch?: Partial<Settings>
}

export type Command = (ctx: CommandContext) => CommandEffect

function feature(kind: Feature['kind'], name: string, extra: Partial<Feature> = {}): Feature {
  return { id: 'feat', name, kind, solidIds: [], length: 0, angle: 0, count: 1, radius: 0, ...extra }
}

function extras(ctx: CommandContext): DocumentExtras {
  return ctx.doc.extras
}

function selected(ctx: CommandContext): Solid[] {
  const ids = new Set(ctx.doc.selection)
  const picked = ctx.doc.solids.filter((solid) => ids.has(solid.id))
  return picked.length > 0 ? picked : ctx.doc.solids.slice(0, 1)
}

function requireOne(ctx: CommandContext): Solid {
  const solid = selected(ctx)[0]
  if (!solid) throw new Error('선택된 객체가 없습니다.')
  return solid
}

function requireTwo(ctx: CommandContext): [Solid, Solid] {
  const picked = selected(ctx)
  if (picked.length >= 2) return [picked[0], picked[1]]
  if (ctx.doc.solids.length >= 2) return [ctx.doc.solids[0], ctx.doc.solids[1]]
  throw new Error('두 개의 객체를 선택하세요.')
}

function lastSketch(ctx: CommandContext): Sketch {
  return (ctx.doc.sketches ?? []).at(-1) ?? makeSketch({ id: 'sketch', shape: 'rect', width: 40, height: 30 })
}

function lastWire(ctx: CommandContext): Wire {
  const wire = extras(ctx).wires.at(-1)
  if (wire && wire.points.length >= 2) return wire
  const sketch = lastSketch(ctx)
  return draftRectangle('wire-default', sketch.width || 40, sketch.height || 30)
}

function pushWire(ctx: CommandContext, wire: Wire): Partial<DocumentExtras> {
  return { wires: [...extras(ctx).wires, wire] }
}

function docName(ctx: CommandContext): string {
  return ctx.doc.name || 'MyCAD'
}

function summary(lines: string[]): string {
  return lines.join(' · ')
}

/* ────────────────────────── FreeCAD Part ─────────────────────────────────── */

const partCommands: Record<string, Command> = {
  wedge: (ctx) => ({ solids: [makePrimitive('wedge', ctx.nextId())], feature: feature('primitive', 'Wedge') }),
  prism: (ctx) => ({ solids: [makePrimitive('prism', ctx.nextId())], feature: feature('primitive', 'Prism') }),
  ellipsoid: (ctx) => ({ solids: [makePrimitive('ellipsoid', ctx.nextId())], feature: feature('primitive', 'Ellipsoid') }),
  tubePrim: (ctx) => ({ solids: [makePrimitive('tube', ctx.nextId())], feature: feature('primitive', 'Tube') }),
  spiralPrim: (ctx) => ({ solids: [makePrimitive('spiral', ctx.nextId())], feature: feature('primitive', 'Spiral') }),
  ringPrim: (ctx) => ({ solids: [makePrimitive('ring', ctx.nextId())], feature: feature('primitive', 'Ring') }),
  pyramid: (ctx) => ({ solids: [makePrimitive('pyramid', ctx.nextId())], feature: feature('primitive', 'Pyramid') }),
  xor: (ctx) => {
    const [a, b] = requireTwo(ctx)
    return { solids: [xorSolids(a, b, ctx.nextId())], replaceIds: [a.id, b.id], feature: feature('cut', 'XOR') }
  },
  booleanFragments: (ctx) => {
    const [a, b] = requireTwo(ctx)
    const pieces = booleanFragments(a, b, ctx.nextId)
    return { solids: pieces, replaceIds: [a.id, b.id], feature: feature('cut', 'Fragments', { count: pieces.length }) }
  },
  thickness: (ctx) => {
    const solid = requireOne(ctx)
    return { solids: [thicknessSolid(solid, 2, ctx.nextId())], replaceIds: [solid.id], feature: feature('shell', 'Thickness', { length: 2 }) }
  },
  offset3d: (ctx) => {
    const solid = requireOne(ctx)
    return { solids: [offsetSolid(solid, 2, ctx.nextId())], replaceIds: [solid.id], feature: feature('primitive', 'Offset3D', { length: 2 }) }
  },
  ruled: (ctx) => {
    const sketch = lastSketch(ctx)
    const bottom = draftRectangle('a', sketch.width, sketch.height).points
    const top = draftRectangle('b', sketch.width * 0.6, sketch.height * 0.6).points.map((point) => ({ ...point, z: point.z + 30 }))
    return { solids: [ruledSurface(bottom, top, ctx.nextId())], feature: feature('surface', 'RuledSurface') }
  },
  crossSections: (ctx) => {
    const solid = requireOne(ctx)
    const sections = crossSections(solid, 'y', 5)
    const wires = sections.map((section, index) =>
      makeWire(`section-${index}`, `Section${index + 1}`, section.segments.flatMap(([a, b]) => [a, b]), false))
    return {
      extras: { wires: [...extras(ctx).wires, ...wires] },
      status: summary([`단면 ${sections.length}개`, `세그먼트 ${sections.reduce((acc, item) => acc + item.segments.length, 0)}`])
    }
  },
  compound: (ctx) => {
    const picked = selected(ctx)
    if (picked.length < 2) throw new Error('두 개 이상의 객체를 선택하세요.')
    return { solids: [compoundSolids(picked, ctx.nextId())], replaceIds: picked.map((solid) => solid.id), feature: feature('primitive', 'Compound') }
  },
  partArea: (ctx) => {
    const solid = requireOne(ctx)
    return { status: `${solid.name}: A ${surfaceArea(solid).toFixed(2)} mm² · V ${solidVolume(solid).toFixed(2)} mm³` }
  }
}

/* ────────────────────────── FreeCAD Draft ────────────────────────────────── */

const draftCommands: Record<string, Command> = {
  draftLine: (ctx) => ({ extras: pushWire(ctx, draftLine(ctx.nextId(), { x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 })), status: 'Line 60 mm' }),
  draftWire: (ctx) => ({
    extras: pushWire(ctx, makeWire(ctx.nextId(), 'Polyline', [
      { x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, { x: 40, y: 30, z: 0 }, { x: 0, y: 30, z: 0 }
    ], true)),
    status: 'Polyline 4 points'
  }),
  draftRect: (ctx) => {
    const sketch = lastSketch(ctx)
    return { extras: pushWire(ctx, draftRectangle(ctx.nextId(), sketch.width, sketch.height)), status: `Rectangle ${sketch.width}×${sketch.height}` }
  },
  draftPolygonWire: (ctx) => ({ extras: pushWire(ctx, draftPolygon(ctx.nextId(), 6, 25)), status: 'Polygon 6' }),
  draftCircleWire: (ctx) => ({ extras: pushWire(ctx, draftCircle(ctx.nextId(), 25)), status: 'Circle r25' }),
  draftEllipseWire: (ctx) => ({ extras: pushWire(ctx, draftEllipse(ctx.nextId(), 30, 18)), status: 'Ellipse 30×18' }),
  draftArcWire: (ctx) => ({ extras: pushWire(ctx, draftArc(ctx.nextId(), 25, 0, 180)), status: 'Arc 180°' }),
  draftBSplineWire: (ctx) => ({
    extras: pushWire(ctx, draftBSpline(ctx.nextId(), [
      { x: -40, y: 0, z: 0 }, { x: -10, y: 25, z: 0 }, { x: 20, y: -15, z: 0 }, { x: 45, y: 10, z: 0 }
    ])),
    status: 'B-spline'
  }),
  draftBezierWire: (ctx) => ({
    extras: pushWire(ctx, draftBezier(ctx.nextId(), [
      { x: -40, y: 0, z: 0 }, { x: 0, y: 40, z: 0 }, { x: 40, y: 0, z: 0 }
    ])),
    status: 'Bezier'
  }),
  draftFillet: (ctx) => {
    const wire = filletWire(lastWire(ctx), 5)
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId(), name: `Fillet-${wire.name}` }), status: `Fillet r5 · ${wire.points.length} pts` }
  },
  draftOffset: (ctx) => {
    const wire = offsetWire(lastWire(ctx), 5)
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId() }), status: `Offset 5 mm · L ${wireLength(wire).toFixed(1)}` }
  },
  draftTrimex: (ctx) => {
    const wire = trimExtendWire(lastWire(ctx), 10)
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId(), name: `Trimex-${wire.name}` }), status: 'Trim/extend 10 mm' }
  },
  draftJoin: (ctx) => {
    const wires = extras(ctx).wires
    if (wires.length < 2) throw new Error('결합할 와이어가 2개 이상 필요합니다.')
    const joined = joinWires(wires.slice(-2))
    return { extras: { wires: [...wires, { ...joined, id: ctx.nextId() }] }, status: `Join · ${joined.points.length} pts` }
  },
  draftSplit: (ctx) => {
    const wire = lastWire(ctx)
    const [a, b] = splitWire(wire, Math.floor(wire.points.length / 2))
    return { extras: { wires: [...extras(ctx).wires, { ...a, id: `${ctx.nextId()}a` }, { ...b, id: `${ctx.nextId()}b` }] }, status: 'Split wire' }
  },
  draftUpgrade: (ctx) => {
    const wire = upgradeWire(lastWire(ctx))
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId(), name: `Upgrade-${wire.name}` }), status: `Upgrade · closed=${wire.closed}` }
  },
  draftDowngrade: (ctx) => {
    const segments = downgradeWire(lastWire(ctx))
    return { extras: { wires: [...extras(ctx).wires, ...segments] }, status: `Downgrade · ${segments.length} segments` }
  },
  draftMove: (ctx) => {
    const wire = moveWire(lastWire(ctx), { x: 20, y: 0, z: 0 })
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId() }), status: 'Move wire +20X' }
  },
  draftRotate: (ctx) => {
    const wire = rotateWire(lastWire(ctx), 45)
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId() }), status: 'Rotate wire 45°' }
  },
  draftScale: (ctx) => {
    const wire = scaleWire(lastWire(ctx), 1.5)
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId() }), status: 'Scale wire 1.5x' }
  },
  draftMirror: (ctx) => {
    const wire = mirrorWire(lastWire(ctx), 'yz')
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId() }), status: 'Mirror wire YZ' }
  },
  draftStretch: (ctx) => {
    const wire = stretchWire(lastWire(ctx), 'x', 0, 10)
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId(), name: `Stretch-${wire.name}` }), status: 'Stretch +10X' }
  },
  orthoArray: (ctx) => arrayCommand(ctx, 'ortho'),
  polarArray: (ctx) => arrayCommand(ctx, 'polar'),
  circularArray: (ctx) => arrayCommand(ctx, 'circular'),
  pathArray: (ctx) => arrayCommand(ctx, 'path'),
  pointArray: (ctx) => arrayCommand(ctx, 'point'),
  shapeStringCmd: (ctx) => {
    const wires = shapeString('MyCAD', 20, ctx.nextId())
    return { extras: { wires: [...extras(ctx).wires, ...wires] }, status: `ShapeString · ${wires.length} glyphs` }
  },
  draftDimension: (ctx) => {
    const box = boundingBoxOf(selected(ctx))
    const annotation = dimensionAnnotation(ctx.nextId(), box.min, { x: box.max.x, y: box.min.y, z: box.min.z })
    return { extras: { annotations: [...extras(ctx).annotations, annotation] }, status: `Dimension ${annotation.text}` }
  },
  draftText: (ctx) => {
    const annotation = textAnnotation(ctx.nextId(), { x: 0, y: 40, z: 0 }, docName(ctx))
    return { extras: { annotations: [...extras(ctx).annotations, annotation] }, status: `Text "${annotation.text}"` }
  },
  wireToFace: (ctx) => {
    const wire = lastWire(ctx)
    return {
      solids: [pushPull(wire, 0.4, ctx.nextId())],
      feature: feature('surface', `Face-${wire.name}`),
      status: `Face A ${(wireArea(wire) / 100).toFixed(2)} cm²`
    }
  }
}

function arrayCommand(ctx: CommandContext, kind: 'ortho' | 'polar' | 'circular' | 'path' | 'point'): CommandEffect {
  const solid = requireOne(ctx)
  const path = [{ x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 30 }, { x: 120, y: 0, z: 0 }]
  const placements = draftArray(kind, {
    countX: 3, countY: 2, countZ: 1,
    count: kind === 'path' ? 5 : 6,
    radius: 50,
    rings: 2,
    path,
    points: path
  })
  const copies = placements.slice(1).map((placement, index) => {
    const copy: Solid = {
      ...solid,
      id: ctx.nextId(),
      name: `${solid.name}-a${index + 2}`,
      position: {
        x: solid.position.x + placement.position.x,
        y: solid.position.y + placement.position.y,
        z: solid.position.z + placement.position.z
      },
      rotation: { ...solid.rotation, y: solid.rotation.y + placement.rotation.y },
      scale: { ...solid.scale },
      size: { ...solid.size },
      mesh: solid.mesh ? { positions: solid.mesh.positions.slice(), normals: solid.mesh.normals.slice() } : undefined
    }
    return copy
  })
  if (copies.length === 0) throw new Error('배열: 생성할 복사본이 없습니다.')
  return { solids: copies, feature: feature('pattern', `${kind}Array`, { count: copies.length + 1 }), status: `${kind} array · ${copies.length + 1}` }
}

/* ────────────────────────── FreeCAD Sketcher ─────────────────────────────── */

const sketcherCommands: Record<string, Command> = {
  sketchSolve2d: () => {
    const sketch = createSketch2D('Solved')
    addRectangle(sketch, 'rect', 40, 25)
    const result = solveSketch(sketch)
    const extent = sketchExtent(result.sketch)
    return {
      status: summary([
        `iterations ${result.iterations}`,
        `error ${result.error.toExponential(2)}`,
        `DoF ${result.dof}`,
        `${extent.width.toFixed(1)}×${extent.height.toFixed(1)}`
      ])
    }
  },
  sketchRectConstrained: (ctx) => {
    const sketch2d = createSketch2D('Rect')
    addRectangle(sketch2d, 'rect', 50, 30)
    const solved = solveSketch(sketch2d)
    const extent = sketchExtent(solved.sketch)
    const sketch = makeSketch({ id: ctx.nextId(), name: 'constrained', shape: 'rect', width: extent.width, height: extent.height })
    return {
      solids: [pushPull(draftRectangle('r', extent.width, extent.height), 0.4, ctx.nextId())],
      sketch,
      feature: feature('sketch', 'ConstrainedRect'),
      status: `구속 사각형 ${extent.width.toFixed(1)}×${extent.height.toFixed(1)} · DoF ${solved.dof}`
    }
  },
  sketchConstraintCheck: () => {
    const sketch = createSketch2D('Check')
    addRectangle(sketch, 'rect', 40, 40)
    sketch.constraints.push({ id: 'd1', type: 'distance', points: [0, 1], value: 40 })
    sketch.constraints.push({ id: 'd2', type: 'distance', points: [0, 1], value: 60 })
    const report = checkConstraints(sketch)
    return {
      report: {
        title: 'Sketcher',
        lines: [
          `conflicting: ${report.conflicting.join(', ') || '없음'}`,
          `redundant: ${report.redundant.join(', ') || '없음'}`
        ]
      }
    }
  },
  sketchDof: () => {
    const sketch = createSketch2D('DoF')
    addRectangle(sketch, 'rect', 30, 20)
    return { status: `자유도 ${sketchDofCount(sketch)}` }
  }
}

/* ────────────────────────── FreeCAD Mesh / Points ────────────────────────── */

const meshCommands: Record<string, Command> = {
  meshEvaluate: (ctx) => {
    const solid = requireOne(ctx)
    const info = meshInfo(solid)
    return {
      report: {
        title: 'Mesh',
        lines: [
          `${solid.name}`,
          `triangles ${info.triangles} · unique vertices ${info.uniqueVertices}`,
          `boundary edges ${info.boundaryEdges} · closed ${info.closed ? 'yes' : 'no'}`,
          `degenerate ${info.degenerate}`,
          `area ${info.area.toFixed(2)} mm² · volume ${info.volume.toFixed(2)} mm³`
        ]
      }
    }
  },
  meshDecimate: (ctx) => {
    const solid = requireOne(ctx)
    const result = decimateMesh(solid, 0.5, ctx.nextId())
    return { solids: [result], replaceIds: [solid.id], feature: feature('meshOp', 'Decimate'), status: `triangles ${meshInfo(result).triangles}` }
  },
  meshRefine: (ctx) => {
    const solid = requireOne(ctx)
    const result = refineMesh(solid, ctx.nextId())
    return { solids: [result], replaceIds: [solid.id], feature: feature('meshOp', 'Refine'), status: `triangles ${meshInfo(result).triangles}` }
  },
  meshHarmonize: (ctx) => {
    const solid = requireOne(ctx)
    return { solids: [harmonizeNormals(solid, ctx.nextId())], replaceIds: [solid.id], feature: feature('meshOp', 'Harmonize') }
  },
  meshFlip: (ctx) => {
    const solid = requireOne(ctx)
    return { solids: [flipNormals(solid, ctx.nextId())], replaceIds: [solid.id], feature: feature('meshOp', 'FlipNormals') }
  },
  meshScale: (ctx) => {
    const solid = requireOne(ctx)
    return { solids: [scaleMesh(solid, 1.25, ctx.nextId())], replaceIds: [solid.id], feature: feature('meshOp', 'ScaleMesh', { length: 1.25 }) }
  },
  meshSmooth: (ctx) => {
    const solid = requireOne(ctx)
    return { solids: [smoothMesh(solid, 0.35, ctx.nextId())], replaceIds: [solid.id], feature: feature('meshOp', 'SmoothMesh') }
  },
  meshFillHoles: (ctx) => {
    const solid = requireOne(ctx)
    const filled = fillHoles(solid, ctx.nextId())
    return { solids: [filled], replaceIds: [solid.id], feature: feature('meshOp', 'FillHoles'), status: `boundary edges ${meshInfo(filled).boundaryEdges}` }
  },
  meshSectionCmd: (ctx) => {
    const solid = requireOne(ctx)
    const box = boundingBoxOf([solid])
    const segments = meshSection(solid, box.center.y)
    const wire = makeWire(ctx.nextId(), 'MeshSection', segments.flatMap(([a, b]) => [a, b]), false)
    return { extras: pushWire(ctx, wire), status: `단면 세그먼트 ${segments.length}` }
  },
  pointsDownsample: (ctx) => {
    const solid = requireOne(ctx)
    const positions = solid.mesh?.positions ?? []
    const points: Vec3[] = []
    for (let i = 0; i + 2 < positions.length; i += 3) points.push({ x: positions[i], y: positions[i + 1], z: positions[i + 2] })
    const kept = downsamplePoints(points, 3)
    return { status: `점 ${points.length} → ${kept.length}` }
  },
  fitPlaneCmd: (ctx) => {
    const points = samplePoints(ctx)
    const fit = fitPlane(points)
    return {
      status: summary([
        `평면 n(${fit.normal.x.toFixed(2)}, ${fit.normal.y.toFixed(2)}, ${fit.normal.z.toFixed(2)})`,
        `rms ${fit.rms.toFixed(4)}`
      ])
    }
  },
  fitSphereCmd: (ctx) => {
    const fit = fitSphere(samplePoints(ctx))
    return { status: `구 r ${fit.radius.toFixed(2)} · rms ${fit.rms.toFixed(4)}` }
  },
  approxSurface: (ctx) => ({
    solids: [approximateSurface(samplePoints(ctx), 8, ctx.nextId())],
    feature: feature('surface', 'ApproxSurface')
  })
}

function samplePoints(ctx: CommandContext): Vec3[] {
  const solid = selected(ctx)[0]
  if (solid) {
    const positions = solid.mesh?.positions
    if (positions && positions.length >= 12) {
      const points: Vec3[] = []
      for (let i = 0; i + 2 < positions.length; i += 9) points.push({ x: positions[i], y: positions[i + 1], z: positions[i + 2] })
      if (points.length >= 4) return points
    }
    const box = boundingBoxOf([solid])
    return [
      box.min,
      { x: box.max.x, y: box.min.y, z: box.min.z },
      { x: box.max.x, y: box.min.y, z: box.max.z },
      { x: box.min.x, y: box.min.y, z: box.max.z },
      box.center
    ]
  }
  return [
    { x: 0, y: 0, z: 0 }, { x: 20, y: 1, z: 0 }, { x: 20, y: 0, z: 20 }, { x: 0, y: 1, z: 20 }, { x: 10, y: 0.5, z: 10 }
  ]
}

/* ────────────────────────── TechDraw / Drafting ──────────────────────────── */

function buildPage(ctx: CommandContext) {
  const solids = ctx.doc.solids.length > 0 ? ctx.doc.solids : [createSolid('box', 'tmp', 1)]
  const views = projectionGroup(solids, 1)
  const page = createPage(`${docName(ctx)} Sheet`, 'A4-landscape', views, { author: 'MyCAD', material: 'Steel' })
  return { page, solids }
}

const techdrawCommands: Record<string, Command> = {
  techdrawPage: (ctx) => {
    const { page } = buildPage(ctx)
    return {
      report: {
        title: 'TechDraw',
        lines: [
          `${page.name} · ${page.template} (${page.widthMm}×${page.heightMm} mm)`,
          ...page.views.map((view) => `${view.label}: ${view.segments.length} edges`)
        ]
      }
    }
  },
  techdrawSection: (ctx) => {
    const solids = ctx.doc.solids.length > 0 ? ctx.doc.solids : [createSolid('box', 'tmp', 1)]
    const box = boundingBoxOf(solids)
    const view = sectionView('view-section', solids, 'y', box.center.y, 'front', 1)
    return { status: `${view.label} · ${view.segments.length} edges` }
  },
  techdrawDetail: (ctx) => {
    const { page } = buildPage(ctx)
    const detail = detailView('view-detail', page.views[0], 0, 0, 25, 2)
    return { status: `Detail x2 · ${detail.segments.length} edges` }
  },
  techdrawDim: (ctx) => {
    const box = boundingBoxOf(selected(ctx))
    const dim = lengthDimension('dim-1', box.min.x, box.min.y, box.max.x, box.min.y)
    const diameter = diameterDimension('dim-2', box.center.x, box.center.y, Math.max(1, box.size.x / 2))
    return { report: { title: 'TechDraw', lines: [`length ${dim.text}`, `diameter ${diameter.text}`] } }
  },
  techdrawHatch: (ctx) => {
    const box = boundingBoxOf(selected(ctx))
    const lines = hatchLines(box.min.x, box.min.y, Math.max(1, box.size.x), Math.max(1, box.size.y), 4, 45)
    return { status: `해치 선 ${lines.length}개` }
  },
  techdrawBom: (ctx) => {
    const rows = billOfMaterials(ctx.doc.solids)
    return {
      report: {
        title: 'BOM',
        lines: rows.length > 0 ? rows.map((row) => `${row.item}. ${row.name} × ${row.quantity} (${row.material})`) : ['항목이 없습니다.']
      }
    }
  },
  exportPageSvg: (ctx) => {
    const { page } = buildPage(ctx)
    page.dimensions.push(lengthDimension('dim-1', -40, -30, 40, -30))
    page.annotations.push({ x: -40, y: 60, text: docName(ctx) })
    page.balloons.push({ x: 40, y: 40, label: '1' })
    return { download: { name: `${docName(ctx)}-sheet.svg`, text: pageToSvg(page) }, status: 'SVG 도면 내보내기' }
  },
  exportPageDxf: (ctx) => {
    const { page } = buildPage(ctx)
    return { download: { name: `${docName(ctx)}-sheet.dxf`, text: pageToDxf(page) }, status: 'DXF 도면 내보내기' }
  }
}

/* ────────────────────────── Spreadsheet ──────────────────────────────────── */

function sampleSheet(base: Sheet): Sheet {
  let sheet = base
  sheet = setCell(sheet, 'A1', 'Width', undefined)
  sheet = setCell(sheet, 'B1', '40', 'Width')
  sheet = setCell(sheet, 'A2', 'Height', undefined)
  sheet = setCell(sheet, 'B2', '25', 'Height')
  sheet = setCell(sheet, 'A3', 'Area', undefined)
  sheet = setCell(sheet, 'B3', '=Width * Height', 'Area')
  sheet = setCell(sheet, 'A4', 'Sum', undefined)
  sheet = setCell(sheet, 'B4', '=sum(B1:B3)', 'Total')
  return sheet
}

const spreadsheetCommands: Record<string, Command> = {
  sheetFill: (ctx) => {
    const sheet = sampleSheet(extras(ctx).sheet)
    const values = evaluateSheet(sheet)
    return { extras: { sheet }, status: `Area ${values.aliases.Area ?? 0} · Total ${values.aliases.Total ?? 0}` }
  },
  sheetRecompute: (ctx) => {
    const sheet = extras(ctx).sheet.cells.length > 0 ? extras(ctx).sheet : sampleSheet(extras(ctx).sheet)
    const values = evaluateSheet(sheet, { Zoom: 1 })
    const errors = Object.entries(values.errors)
    return {
      extras: { sheet },
      report: {
        title: 'Spreadsheet',
        lines: [
          ...Object.entries(values.aliases).map(([name, value]) => `${name} = ${value}`),
          ...errors.map(([ref, message]) => `${ref}: ${message}`)
        ]
      }
    }
  },
  sheetExportCsv: (ctx) => {
    const sheet = extras(ctx).sheet.cells.length > 0 ? extras(ctx).sheet : sampleSheet(extras(ctx).sheet)
    return { extras: { sheet }, download: { name: `${docName(ctx)}-sheet.csv`, text: sheetToCsv(sheet) } }
  },
  sheetBindParams: (ctx) => {
    const sheet = extras(ctx).sheet.cells.length > 0 ? extras(ctx).sheet : sampleSheet(extras(ctx).sheet)
    const bound = sheetParameters(sheet)
    if (bound.length === 0) throw new Error('별칭이 지정된 셀이 없습니다.')
    return {
      extras: { sheet },
      parameter: bound[0],
      status: `파라미터 연결 ${bound.map((item) => `${item.name}=${item.value}`).join(', ')}`
    }
  }
}

/* ────────────────────────── FEM ──────────────────────────────────────────── */

const femCommands: Record<string, Command> = {
  femMesh: (ctx) => {
    const solid = requireOne(ctx)
    const stats = meshStats(solid, extras(ctx).analysis.meshSize)
    return { status: `${stats.elementType} · elements ${stats.elements} · nodes ${stats.nodes}` }
  },
  femMaterial: (ctx) => {
    const current = extras(ctx).analysis
    const index = MATERIALS.findIndex((card) => card.id === current.materialId)
    const next = MATERIALS[(index + 1) % MATERIALS.length]
    return { extras: { analysis: { ...current, materialId: next.id } }, status: `FEM 재질 → ${next.name}` }
  },
  femConstraintFixed: (ctx) => {
    const solid = requireOne(ctx)
    const analysis = addFemConstraint(extras(ctx).analysis, { id: `fix-${solid.id}`, kind: 'fixed', target: solid.name, value: 0 })
    return { extras: { analysis }, status: `고정 구속 ${solid.name} (총 ${analysis.constraints.length})` }
  },
  femConstraintForce: (ctx) => {
    const solid = requireOne(ctx)
    const analysis = addFemConstraint(extras(ctx).analysis, { id: `force-${solid.id}`, kind: 'force', target: solid.name, value: 1000, direction: 'y' })
    return { extras: { analysis }, status: `하중 1000 N ${solid.name} (총 ${analysis.constraints.length})` }
  },
  femSolve: (ctx) => {
    const solid = requireOne(ctx)
    const report = runAnalysis(extras(ctx).analysis, solid)
    return { report: { title: 'FEM', lines: report.lines } }
  },
  femBeamCmd: (ctx) => {
    const solid = requireOne(ctx)
    const box = boundingBoxOf([solid])
    const result = solveBeam({
      length: Math.max(1, box.size.x),
      width: Math.max(1, box.size.z),
      height: Math.max(1, box.size.y),
      load: 1000,
      support: 'cantilever',
      materialId: extras(ctx).analysis.materialId
    })
    return {
      status: summary([
        `δmax ${result.maxDeflection.toFixed(4)} mm`,
        `σmax ${result.maxStress.toFixed(2)} MPa`,
        `SF ${Number.isFinite(result.safetyFactor) ? result.safetyFactor.toFixed(2) : '∞'}`
      ])
    }
  },
  femTruss: (ctx) => {
    const result = solveTruss(
      [[0, 0], [1000, 0], [500, 500]],
      [{ from: 0, to: 2, area: 200 }, { from: 1, to: 2, area: 200 }, { from: 0, to: 1, area: 200 }],
      [0, 1, 2, 3],
      { 5: -5000 },
      extras(ctx).analysis.materialId
    )
    return {
      report: {
        title: 'FEM Truss',
        lines: [
          `member forces: ${result.memberForces.map((value) => value.toFixed(1)).join(', ')} N`,
          `max |F| ${result.maxForce.toFixed(1)} N`,
          `node 3 dy ${result.displacements[5].toFixed(4)} mm`
        ]
      }
    }
  },
  femFrequency: (ctx) => {
    const solid = requireOne(ctx)
    const box = boundingBoxOf([solid])
    const hz = modalFrequency(Math.max(1, box.size.x), Math.max(1, box.size.z), Math.max(1, box.size.y), extras(ctx).analysis.materialId)
    return { status: `1차 고유진동수 ${hz.toFixed(1)} Hz` }
  },
  femThermal: (ctx) => {
    const solid = requireOne(ctx)
    const box = boundingBoxOf([solid])
    const result = thermalFlux(Math.max(1, box.size.y), Math.max(1, box.size.x * box.size.z), 80, 20, extras(ctx).analysis.materialId)
    return { status: `열유속 ${result.flux.toFixed(1)} W/m² · 전열량 ${result.power.toFixed(2)} W` }
  }
}

/* ────────────────────────── CAM ──────────────────────────────────────────── */

function camOperation(ctx: CommandContext, kind: string): Operation {
  const sketch = lastSketch(ctx)
  const box = boundingBoxOf(ctx.doc.solids.length > 0 ? ctx.doc.solids : [createSolid('box', 'tmp', 1)])
  const endmill = TOOL_LIBRARY[0]
  const drill = TOOL_LIBRARY[3]
  switch (kind) {
    case 'camProfile':
      return profileOperation(sketch.width, sketch.height, 5, endmill, 1)
    case 'camPocketOp':
      return pocketOperation(sketch.width, sketch.height, 4, endmill, 1, 0.45)
    case 'camDrill':
      return drillOperation([{ x: -15, y: 0, z: -10 }, { x: 15, y: 0, z: 10 }], 8, drill, 2)
    case 'camSurface':
      return surfaceOperation(ctx.doc.solids.length > 0 ? ctx.doc.solids : [createSolid('box', 'tmp', 1)], TOOL_LIBRARY[2], 0.4)
    case 'camHelix':
      return helixOperation(Math.max(6, box.size.x / 3), 6, endmill, 0.5)
    case 'camEngrave':
      return engraveOperation(lastWire(ctx).points, 0.6, TOOL_LIBRARY[4])
    default:
      return adaptiveOperation(sketch.width, sketch.height, 6, endmill, 2)
  }
}

const camCommands: Record<string, Command> = {
  camProfile: (ctx) => camEffect(ctx, 'camProfile'),
  camPocketOp: (ctx) => camEffect(ctx, 'camPocketOp'),
  camDrill: (ctx) => camEffect(ctx, 'camDrill'),
  camSurface: (ctx) => camEffect(ctx, 'camSurface'),
  camHelix: (ctx) => camEffect(ctx, 'camHelix'),
  camEngrave: (ctx) => camEffect(ctx, 'camEngrave'),
  camAdaptive: (ctx) => camEffect(ctx, 'camAdaptive'),
  camPost: (ctx) => {
    const operations = ['camProfile', 'camPocketOp', 'camDrill'].map((kind) => camOperation(ctx, kind))
    return {
      download: { name: `${docName(ctx)}.nc`, text: postProcess(operations, 'grbl', docName(ctx).toUpperCase()) },
      status: `포스트 처리 ${operations.length} operations`
    }
  },
  camStats: (ctx) => {
    const operations = ['camProfile', 'camPocketOp', 'camDrill', 'camAdaptive'].map((kind) => camOperation(ctx, kind))
    const stats = jobStats(operations)
    return {
      report: {
        title: 'CAM',
        lines: [
          `operations ${operations.length} · moves ${stats.moves}`,
          `cut ${stats.cutLength.toFixed(1)} mm · rapid ${stats.rapidLength.toFixed(1)} mm`,
          `estimated ${stats.minutes.toFixed(2)} min`
        ]
      }
    }
  }
}

function camEffect(ctx: CommandContext, kind: string): CommandEffect {
  const operation = camOperation(ctx, kind)
  const stats = jobStats([operation])
  return {
    download: { name: `${docName(ctx)}-${operation.kind}.nc`, text: postProcess([operation], 'linuxcnc', operation.name.toUpperCase()) },
    status: `${operation.name} · ${operation.moves.length} moves · ${stats.minutes.toFixed(2)} min`
  }
}

/* ────────────────────────── BIM / Arch ───────────────────────────────────── */

function bimAdd(ctx: CommandContext, solid: Solid, kind: Parameters<typeof describeElement>[1]): CommandEffect {
  const level = extras(ctx).levels[0]?.name ?? 'Level 1'
  const element = describeElement(solid, kind, level)
  return {
    solids: [solid],
    feature: feature('bim', solid.name),
    extras: { bimElements: [...extras(ctx).bimElements, element] },
    status: `${kind} ${solid.size.x}×${solid.size.y}×${solid.size.z} mm`
  }
}

const bimCommands: Record<string, Command> = {
  bimWall: (ctx) => bimAdd(ctx, archWall(ctx.nextId(), 4000, 2700, 200), 'wall'),
  bimColumn: (ctx) => bimAdd(ctx, archColumn(ctx.nextId(), 300, 300, 2700), 'column'),
  bimBeam: (ctx) => bimAdd(ctx, archBeam(ctx.nextId(), 4000, 200, 400, { x: 0, y: 2700, z: 0 }), 'beam'),
  bimSlab: (ctx) => bimAdd(ctx, archSlab(ctx.nextId(), 4000, 4000, 200), 'slab'),
  bimRoof: (ctx) => bimAdd(ctx, archRoof(ctx.nextId(), 4200, 4200, 150, 25, { x: 0, y: 3000, z: 0 }), 'roof'),
  bimWindow: (ctx) => {
    const host = ctx.doc.solids.find((solid) => solid.name === 'Wall') ?? requireOne(ctx)
    const result = archWindow(host, ctx.nextId(), 1200, 1400, 900, 0)
    const element = describeElement(result.element, 'window', extras(ctx).levels[0]?.name ?? 'Level 1', 'Aluminium')
    return {
      solids: [result.wall, result.element],
      replaceIds: [host.id],
      feature: feature('bim', 'Window'),
      extras: { bimElements: [...extras(ctx).bimElements, element] },
      status: '창 1200×1400 mm'
    }
  },
  bimDoor: (ctx) => {
    const host = ctx.doc.solids.find((solid) => solid.name === 'Wall') ?? requireOne(ctx)
    const result = archDoor(host, ctx.nextId(), 900, 2100, 1200)
    const element = describeElement(result.element, 'door', extras(ctx).levels[0]?.name ?? 'Level 1', 'Wood')
    return {
      solids: [result.wall, result.element],
      replaceIds: [host.id],
      feature: feature('bim', 'Door'),
      extras: { bimElements: [...extras(ctx).bimElements, element] },
      status: '문 900×2100 mm'
    }
  },
  bimStairs: (ctx) => {
    const steps = archStairs(ctx.nextId(), 1000, 2700, 4000, 15)
    const elements = steps.map((solid) => describeElement(solid, 'stairs'))
    return {
      solids: steps,
      feature: feature('bim', 'Stairs', { count: steps.length }),
      extras: { bimElements: [...extras(ctx).bimElements, ...elements] },
      status: `계단 ${steps.length}단`
    }
  },
  bimSpace: (ctx) => bimAdd(ctx, archSpace(ctx.nextId(), 4000, 4000, 2700), 'space'),
  bimRailing: (ctx) => bimAdd(ctx, archRailing(ctx.nextId(), 4000, 1100, { x: 0, y: 2700, z: 0 }), 'railing'),
  bimLevels: () => {
    const levels = makeLevels(3, 3000)
    return { extras: { levels }, status: `층 ${levels.map((level) => `${level.name}@${level.elevation}`).join(', ')}` }
  },
  bimSchedule: (ctx) => {
    const rows = schedule(extras(ctx).bimElements)
    return {
      report: {
        title: 'BIM Schedule',
        lines: rows.length > 0
          ? rows.map((row) => `${row.kind}: ${row.count} 개 · ${row.quantity.toFixed(2)} ${row.unit}`)
          : ['BIM 요소가 없습니다. 벽/슬래브를 먼저 추가하세요.']
      }
    }
  },
  bimExportIfc: (ctx) => {
    const elements = extras(ctx).bimElements
    const levels = extras(ctx).levels.length > 0 ? extras(ctx).levels : makeLevels(1)
    if (elements.length === 0) throw new Error('IFC: BIM 요소를 먼저 추가하세요.')
    return { download: { name: `${docName(ctx)}.ifc`, text: exportIfc(elements, levels, docName(ctx)) }, status: `IFC4 ${elements.length} products` }
  },
  bimFootprint: (ctx) => ({ status: `건축 면적 ${footprintArea(ctx.doc.solids).toFixed(2)} m²` })
}

/* ────────────────────────── Material / Measure / Macro ───────────────────── */

const miscCommands: Record<string, Command> = {
  materialAssign: (ctx) => {
    const solid = requireOne(ctx)
    const current = extras(ctx).materialOf[solid.id] ?? 'steel'
    const index = MATERIALS.findIndex((card) => card.id === current)
    const next = MATERIALS[(index + 1) % MATERIALS.length]
    return {
      extras: { materialOf: { ...extras(ctx).materialOf, [solid.id]: next.id } },
      status: `${solid.name} 재질 → ${next.name}`
    }
  },
  massProps: (ctx) => {
    const solid = requireOne(ctx)
    const material = extras(ctx).materialOf[solid.id] ?? 'steel'
    const properties = massProperties(solid, material)
    const inertia = inertiaOf(solid)
    return {
      report: {
        title: 'Mass properties',
        lines: [
          `${solid.name} (${properties.material})`,
          `volume ${properties.volume.toFixed(2)} mm³`,
          `area ${properties.area.toFixed(2)} mm²`,
          `mass ${properties.mass.toFixed(2)} g (${properties.massKg.toFixed(4)} kg)`,
          `cog (${inertia.cog.x.toFixed(1)}, ${inertia.cog.y.toFixed(1)}, ${inertia.cog.z.toFixed(1)})`
        ]
      }
    }
  },
  materialLibrary: (): CommandEffect => ({
    report: {
      title: 'Materials',
      lines: MATERIALS.map((card) => `${card.name}: ρ ${card.density} g/cm³ · E ${card.youngsModulus} MPa · Rp ${card.yieldStrength} MPa`)
    }
  }),
  measureDistanceCmd: (ctx) => {
    const [a, b] = requireTwo(ctx)
    const result = measureBetween(a, b)
    return { status: `거리 ${result.centerDistance.toFixed(2)} mm · 간격 ${result.clearance.toFixed(2)} mm` }
  },
  measureAngleCmd: (ctx) => {
    const box = boundingBoxOf(selected(ctx))
    const annotation = angleAnnotation('angle', box.center, { x: box.max.x, y: box.center.y, z: box.center.z }, { x: box.center.x, y: box.max.y, z: box.center.z })
    return { status: `각도 ${annotation.text}` }
  },
  measureAreaCmd: (ctx) => {
    const solid = requireOne(ctx)
    return { status: `표면적 ${surfaceArea(solid).toFixed(2)} mm² (${(surfaceArea(solid) / 1e6).toFixed(4)} m²)` }
  },
  measureVolumeCmd: (ctx) => {
    const solid = requireOne(ctx)
    return { status: `부피 ${solidVolume(solid).toFixed(2)} mm³ (${(solidVolume(solid) / 1000).toFixed(2)} cm³)` }
  },
  measureBoxCmd: (ctx) => {
    const box = boundingBoxOf(selected(ctx))
    return { status: `바운딩 박스 ${box.size.x.toFixed(1)} × ${box.size.y.toFixed(1)} × ${box.size.z.toFixed(1)} mm` }
  },
  expressionEval: (ctx) => {
    const scope: Record<string, number> = {}
    for (const parameter of ctx.doc.parameters ?? []) scope[parameter.name] = parameter.value
    const samples = ['10 mm + 2 cm', 'sqrt(16) * 3', 'max(3, 7, 5) ^ 2', 'sin(30) * 100']
    return {
      report: {
        title: 'Expressions',
        lines: samples.map((source) => `${source} = ${evaluateExpression(source, scope).toFixed(4)}`)
      }
    }
  },
  runMacro: (ctx) => {
    const source = ['# MyCAD macro', 'box(40, 20, 10)', 'move(20, 0, 0)', 'pad(sketch, 12)', 'fillet(2)'].join('\n')
    const commands = parseMacro(source)
    const box = createSolid('box', ctx.nextId(), ctx.doc.solids.length + 1)
    const first = commands[0]
    if (first && first.name === 'box' && first.args.length === 3) {
      box.size = { ...box.size, x: Number(first.args[0]), y: Number(first.args[1]), z: Number(first.args[2]) }
      box.position = { ...box.position, y: Number(first.args[1]) / 2 }
    }
    return {
      solids: [box],
      feature: feature('primitive', 'Macro'),
      status: `매크로 ${commands.length}행 실행: ${commands.map((command) => command.name).join(', ')}`
    }
  }
}

/* ────────────────────────── CATIA GSD ────────────────────────────────────── */

const gsdCommands: Record<string, Command> = {
  gsdExtrude: (ctx) => ({
    solids: [extrudeSurface(lastWire(ctx), { x: 0, y: 1, z: 0 }, 30, ctx.nextId())],
    feature: feature('surface', 'ExtrudeSurface', { length: 30 })
  }),
  gsdRevolve: (ctx) => ({
    solids: [revolveSurface(moveWire(lastWire(ctx), { x: 30, y: 0, z: 0 }), 'y', 270, 36, ctx.nextId())],
    feature: feature('surface', 'RevolveSurface', { angle: 270 })
  }),
  gsdSweep: (ctx) => ({
    solids: [sweepSurface(draftCircle('profile', 8, 16), spline3d([
      { x: -40, y: 0, z: 0 }, { x: 0, y: 25, z: 20 }, { x: 40, y: 0, z: 0 }
    ], 8, 'spine'), ctx.nextId())],
    feature: feature('surface', 'Sweep')
  }),
  gsdMultiSection: (ctx) => {
    const sections = [
      draftRectangle('s1', 40, 30),
      { ...draftRectangle('s2', 30, 20), points: draftRectangle('s2', 30, 20).points.map((point) => ({ ...point, y: point.y + 0, z: 25 })) },
      { ...draftRectangle('s3', 18, 12), points: draftRectangle('s3', 18, 12).points.map((point) => ({ ...point, z: 50 })) }
    ]
    return { solids: [multiSectionSurface(sections, ctx.nextId())], feature: feature('loft', 'MultiSection') }
  },
  gsdFill: (ctx) => ({ solids: [fillSurface(draftCircle('boundary', 25, 32), ctx.nextId())], feature: feature('surface', 'Fill') }),
  gsdBlend: (ctx) => ({
    solids: [blendSurface(draftArc('a', 30, 0, 180, 24), { ...draftArc('b', 20, 0, 180, 24), points: draftArc('b', 20, 0, 180, 24).points.map((point) => ({ ...point, z: 30 })) }, ctx.nextId())],
    feature: feature('surface', 'Blend')
  }),
  gsdOffsetSurf: (ctx) => {
    const solid = requireOne(ctx)
    return { solids: [offsetSurface(solid, 3, ctx.nextId())], feature: feature('surface', 'OffsetSurface', { length: 3 }) }
  },
  gsdJoin: (ctx) => {
    const picked = selected(ctx)
    if (picked.length < 2) throw new Error('조인: 두 개 이상의 서피스를 선택하세요.')
    return { solids: [joinSurfaces(picked, ctx.nextId())], replaceIds: picked.map((solid) => solid.id), feature: feature('surface', 'JoinSurfaces') }
  },
  gsdSplit: (ctx) => {
    const solid = requireOne(ctx)
    const box = boundingBoxOf([solid])
    return { solids: [splitSurface(solid, 'y', box.center.y, 'below', ctx.nextId())], replaceIds: [solid.id], feature: feature('surface', 'SplitSurface') }
  },
  gsdBoundary: (ctx) => {
    const solid = requireOne(ctx)
    const wire = extractBoundary(solid, ctx.nextId())
    return { extras: pushWire(ctx, wire), status: `경계 점 ${wire.points.length}개` }
  },
  gsdHeal: (ctx) => {
    const solid = requireOne(ctx)
    const report = healReport(solid)
    return { status: `자유 엣지 ${report.freeEdges} · 갭 ${report.gaps} · ${report.healed ? '닫힘' : '열림'}` }
  },
  gsdIso: (ctx) => {
    const solid = requireOne(ctx)
    const box = boundingBoxOf([solid])
    const wire = isoCurve(solid, 'x', box.center.x, ctx.nextId())
    return { extras: pushWire(ctx, wire), status: `등매개 곡선 점 ${wire.points.length}개` }
  },
  gsdHelixCurve: (ctx) => ({ extras: pushWire(ctx, helixCurve(20, 10, 4, ctx.nextId())), status: 'Helix r20 pitch10 x4' }),
  gsdSpline: (ctx) => ({
    extras: pushWire(ctx, spline3d([
      { x: -40, y: 0, z: 0 }, { x: -10, y: 30, z: 20 }, { x: 25, y: -10, z: -15 }, { x: 45, y: 15, z: 5 }
    ], 10, ctx.nextId())),
    status: '3D 스플라인'
  }),
  gsdConic: (ctx) => ({ extras: pushWire(ctx, conicCurve(60, 30, 0.6, 24, ctx.nextId())), status: 'Conic ratio 0.6' })
}

/* ────────────────────────── CATIA Sheet Metal ────────────────────────────── */

const sheetMetalCommands: Record<string, Command> = {
  smWall: (ctx) => {
    const part = addWall(extras(ctx).sheetMetal, ctx.nextId(), 100, 60)
    return { extras: { sheetMetal: part }, status: `월 100×60 · ${part.walls.length}개` }
  },
  smFlange: (ctx) => {
    const base = extras(ctx).sheetMetal.walls.length > 0 ? extras(ctx).sheetMetal : addWall(extras(ctx).sheetMetal, 'wall-1', 100, 60)
    const part = addFlange(base, ctx.nextId(), 30, 90)
    return { extras: { sheetMetal: part }, status: `플랜지 30 mm @90° · ${part.walls.length}개` }
  },
  smHem: (ctx) => {
    const base = extras(ctx).sheetMetal.walls.length > 0 ? extras(ctx).sheetMetal : addWall(extras(ctx).sheetMetal, 'wall-1', 100, 60)
    const part = addHem(base, ctx.nextId(), 8, true)
    return { extras: { sheetMetal: part }, status: `헴 추가 · ${part.walls.length}개` }
  },
  smUnfold: (ctx) => {
    const part = ensureSheetPart(ctx)
    const result = unfold(part)
    return {
      extras: { sheetMetal: part, wires: [...extras(ctx).wires, { ...result.outline, id: ctx.nextId() }] },
      report: {
        title: 'Sheet metal',
        lines: [
          `전개 길이 ${result.flatLength.toFixed(2)} mm · 폭 ${result.width} mm`,
          ...result.bends.map((bend) => `bend ${bend.angle}° @ ${bend.position.toFixed(1)} mm · BA ${bend.allowance.toFixed(2)} · BD ${bend.deduction.toFixed(2)}`)
        ]
      }
    }
  },
  smCheck: (ctx) => {
    const part = ensureSheetPart(ctx)
    const result = checkSheetPart(part)
    return { extras: { sheetMetal: part }, report: { title: 'Sheet metal check', lines: result.ok ? ['이상 없음'] : result.messages } }
  },
  smExportDxf: (ctx) => {
    const part = ensureSheetPart(ctx)
    return { extras: { sheetMetal: part }, download: { name: `${docName(ctx)}-flat.dxf`, text: flatPatternDxf(part) }, status: '전개도 DXF 내보내기' }
  },
  smFolded: (ctx) => {
    const part = ensureSheetPart(ctx)
    const solids = foldedSolids(part, ctx.nextId)
    return { solids, feature: feature('sheetMetal', 'SheetMetal', { count: solids.length }), extras: { sheetMetal: part }, status: `접힌 형상 ${solids.length}개` }
  }
}

function ensureSheetPart(ctx: CommandContext) {
  const part = extras(ctx).sheetMetal
  if (part.walls.length >= 2) return part
  let next = part.walls.length > 0 ? part : addWall(part, 'wall-1', 100, 60)
  next = addFlange(next, 'flange-1', 30, 90)
  next = addFlange(next, 'flange-2', 20, 90)
  return next
}

/* ────────────────────────── CATIA DMU Kinematics ─────────────────────────── */

function basePoses(ctx: CommandContext): Record<string, Pose> {
  const poses: Record<string, Pose> = {}
  for (const solid of ctx.doc.solids) {
    poses[solid.id] = { bodyId: solid.id, position: { ...solid.position }, rotation: { ...solid.rotation } }
  }
  return poses
}

const kinematicsCommands: Record<string, Command> = {
  dmuRevolute: (ctx) => {
    const [a, b] = requireTwo(ctx)
    const joint: Joint = { id: `rev-${b.id}`, kind: 'revolute', a: a.id, b: b.id, axis: 'y', origin: { ...a.position }, min: 0, max: 360, ratio: 1 }
    const mechanism = addJoint(extras(ctx).mechanism, joint)
    return { extras: { mechanism: { ...mechanism, fixed: Array.from(new Set([...mechanism.fixed, a.id])) } }, status: `회전 조인트 ${a.name}→${b.name}` }
  },
  dmuPrismatic: (ctx) => {
    const [a, b] = requireTwo(ctx)
    const joint: Joint = { id: `pris-${b.id}`, kind: 'prismatic', a: a.id, b: b.id, axis: 'x', origin: { ...a.position }, min: 0, max: 80, ratio: 1 }
    const mechanism = addJoint(extras(ctx).mechanism, joint)
    return { extras: { mechanism: { ...mechanism, fixed: Array.from(new Set([...mechanism.fixed, a.id])) } }, status: `직선 조인트 ${a.name}→${b.name} 0..80 mm` }
  },
  dmuSimulate: (ctx) => {
    const mechanism = extras(ctx).mechanism
    if (mechanism.joints.length === 0) throw new Error('시뮬레이션: 조인트를 먼저 추가하세요.')
    const poses = simulate(mechanism, basePoses(ctx), 0.5)
    const byId = new Map(poses.map((pose) => [pose.bodyId, pose]))
    return {
      allSolids: ctx.doc.solids.map((solid) => {
        const pose = byId.get(solid.id)
        return pose ? { ...solid, position: { ...pose.position }, rotation: { ...pose.rotation } } : solid
      }),
      status: `t=0.5 시뮬레이션 · 조인트 ${mechanism.joints.length}`
    }
  },
  dmuDof: (ctx) => {
    const mechanism = extras(ctx).mechanism
    const dof = mechanismDof(mechanism, ctx.doc.solids.map((solid) => solid.id))
    return { status: `자유도 ${dof} · 조인트 ${mechanism.joints.length} · 고정 ${mechanism.fixed.length}` }
  },
  dmuClash: (ctx) => {
    const results = clashCheck(ctx.doc.solids)
    const clashes = results.filter((result) => result.kind !== 'clear')
    return {
      report: {
        title: 'Clash',
        lines: results.length === 0
          ? ['검사할 부품이 없습니다.']
          : [
            `pairs ${results.length} · clash ${results.filter((r) => r.kind === 'clash').length} · contact ${results.filter((r) => r.kind === 'contact').length}`,
            ...clashes.slice(0, 12).map((result) => `${result.a} ↔ ${result.b}: ${result.kind} ${result.distance.toFixed(2)} mm`)
          ]
      }
    }
  },
  dmuEnvelope: (ctx) => {
    const mechanism = extras(ctx).mechanism
    if (mechanism.joints.length === 0) throw new Error('엔벌로프: 조인트를 먼저 추가하세요.')
    const bodyId = mechanism.joints[mechanism.joints.length - 1].b
    const envelope = sweptEnvelope(mechanism, basePoses(ctx), bodyId, 16)
    return {
      status: `동작 영역 X ${envelope.min.x.toFixed(1)}..${envelope.max.x.toFixed(1)} · Z ${envelope.min.z.toFixed(1)}..${envelope.max.z.toFixed(1)}`
    }
  }
}

/* ────────────────────────── CATIA Knowledgeware ──────────────────────────── */

const knowledgeCommands: Record<string, Command> = {
  kwFormula: (ctx) => {
    const parameters = ctx.doc.parameters ?? []
    const width = parameters.find((parameter) => parameter.name === 'Width')
    if (!width) return { parameter: { name: 'Width', value: 40, formula: '' }, status: 'Width = 40 추가' }
    const solved = solveFormulas([...parameters, { name: 'Height', value: 0, formula: 'Width / 2' }])
    const height = solved.find((parameter) => parameter.name === 'Height')
    return { parameter: { name: 'Height', value: height?.value ?? 20, formula: 'Width / 2' }, status: `Height = Width/2 = ${height?.value ?? 20}` }
  },
  kwRule: (ctx) => {
    const rule = {
      id: `rule-${extras(ctx).rules.length + 1}`,
      name: 'ThickWall',
      when: 'Width > 60',
      then: ['Thickness = Width / 20'],
      otherwise: ['Thickness = 2']
    }
    const parameters = ctx.doc.parameters ?? [{ name: 'Width', value: 80, formula: '' }]
    const applied = applyRules(parameters, [rule])
    const thickness = applied.parameters.find((parameter) => parameter.name === 'Thickness')
    return {
      extras: { rules: [...extras(ctx).rules, rule] },
      parameter: thickness ? { ...thickness } : undefined,
      status: `규칙 ${rule.name}: ${applied.results[0].fired ? 'fired' : 'else'} → Thickness ${thickness?.value ?? '-'}`
    }
  },
  kwCheck: (ctx) => {
    const check = {
      id: `check-${extras(ctx).checks.length + 1}`,
      name: 'MinWidth',
      condition: 'Width >= 20',
      severity: 'warning' as const,
      message: 'Width가 20mm보다 작습니다'
    }
    const parameters = ctx.doc.parameters ?? [{ name: 'Width', value: 40, formula: '' }]
    const results = runChecks(parameters, [...extras(ctx).checks, check])
    return {
      extras: { checks: [...extras(ctx).checks, check] },
      report: { title: 'Knowledgeware', lines: results.map((result) => `${result.passed ? '✔' : '✘'} ${result.name}: ${result.message}`) }
    }
  },
  kwDesignTable: () => {
    const table = parseDesignTable(['Width,Height,Thickness', '40,25,2', '80,50,4', '120,75,6'].join('\n'), 'Sizes')
    return { extras: { designTable: table }, status: `디자인 테이블 ${table.columns.join('/')} · ${table.rows.length} 구성` }
  },
  kwApplyTable: (ctx) => {
    const table = extras(ctx).designTable ?? parseDesignTable(['Width,Height,Thickness', '40,25,2', '80,50,4'].join('\n'), 'Sizes')
    const row = (table.activeRow + 1) % table.rows.length
    const parameters = applyDesignTable(ctx.doc.parameters ?? [], table, row)
    const applied = table.columns.map((column, index) => `${column}=${table.rows[row][index]}`).join(', ')
    return {
      extras: { designTable: { ...table, activeRow: row } },
      parameter: parameters.find((parameter) => parameter.name === table.columns[0]),
      status: `구성 ${row + 1}/${table.rows.length} 적용: ${applied}`
    }
  },
  kwTree: (ctx) => ({
    report: { title: 'Relations', lines: knowledgeTree(ctx.doc.parameters ?? [], extras(ctx).rules, extras(ctx).checks) }
  })
}

/* ────────────────────────── CATIA Assembly ───────────────────────────────── */

function assemblyConstraint(ctx: CommandContext, kind: AssemblyConstraint['kind'], value: number): CommandEffect {
  const [a, b] = requireTwo(ctx)
  const constraint: AssemblyConstraint = { id: `${kind}-${b.id}`, kind, a: a.id, b: b.id, axis: 'x', value }
  const result = solveConstraints(ctx.doc.solids, [{ id: 'fix', kind: 'fix', a: a.id, b: a.id, axis: 'x', value: 0 }, constraint])
  return {
    allSolids: result.solids,
    mate: { id: constraint.id, kind: kind === 'coincident' ? 'coincidence' : kind === 'angle' ? 'angle' : 'offset', a: a.name, b: b.name, value },
    status: `${kind} ${a.name}↔${b.name} · iterations ${result.iterations} · residual ${result.residual.toExponential(1)}`
  }
}

const assemblyCommands: Record<string, Command> = {
  asmProduct: (ctx) => {
    let product = createProduct('product-1', docName(ctx))
    for (const solid of ctx.doc.solids) product = addPart(product, solid)
    return { report: { title: 'Product', lines: [...productTreeLines(product), `총 부품 ${ctx.doc.solids.length}`] } }
  },
  asmCoincident: (ctx) => assemblyConstraint(ctx, 'coincident', 0),
  asmOffset: (ctx) => assemblyConstraint(ctx, 'offset', 40),
  asmAngle: (ctx) => assemblyConstraint(ctx, 'angle', 45),
  asmContact: (ctx) => assemblyConstraint(ctx, 'contact', 0),
  asmSolve: (ctx) => {
    const solids = ctx.doc.solids
    if (solids.length < 2) throw new Error('구속 해석: 두 개 이상의 부품이 필요합니다.')
    const constraints: AssemblyConstraint[] = [
      { id: 'fix', kind: 'fix', a: solids[0].id, b: solids[0].id, axis: 'x', value: 0 },
      ...solids.slice(1).map((solid, index) => ({
        id: `offset-${solid.id}`,
        kind: 'offset' as const,
        a: solids[0].id,
        b: solid.id,
        axis: 'x' as const,
        value: 60 * (index + 1)
      }))
    ]
    const result = solveConstraints(solids, constraints)
    return { allSolids: result.solids, status: `구속 ${constraints.length}개 · ${result.converged ? '수렴' : '미수렴'} (${result.iterations} it)` }
  },
  asmExplode: (ctx) => {
    if (ctx.doc.solids.length < 2) throw new Error('분해도: 두 개 이상의 부품이 필요합니다.')
    return { allSolids: explodeAssembly(ctx.doc.solids, 1.8), status: '분해도 1.8x' }
  },
  asmBom: (ctx) => {
    const materialOf = (solid: Solid) => extras(ctx).materialOf[solid.id] ?? 'steel'
    const result = bom(ctx.doc.solids, materialOf)
    return {
      report: {
        title: 'BOM',
        lines: result.rows.length > 0
          ? [...result.rows.map((row) => `${row.item}. ${row.name} × ${row.quantity} · ${row.material} · ${row.massKg.toFixed(3)} kg`), `총 질량 ${result.totalKg.toFixed(3)} kg`]
          : ['부품이 없습니다.']
      }
    }
  },
  asmInertia: (ctx) => {
    const materialOf = (solid: Solid) => extras(ctx).materialOf[solid.id] ?? 'steel'
    const matrix = inertiaMatrix(ctx.doc.solids, materialOf)
    return {
      report: {
        title: 'Inertia',
        lines: [
          `mass ${matrix.massKg.toFixed(4)} kg`,
          `cog (${matrix.centerOfGravity.x.toFixed(2)}, ${matrix.centerOfGravity.y.toFixed(2)}, ${matrix.centerOfGravity.z.toFixed(2)})`,
          `Ixx ${matrix.ixx.toExponential(3)} · Iyy ${matrix.iyy.toExponential(3)} · Izz ${matrix.izz.toExponential(3)}`,
          `Ixy ${matrix.ixy.toExponential(3)} · Iyz ${matrix.iyz.toExponential(3)} · Izx ${matrix.izx.toExponential(3)}`
        ]
      }
    }
  },
  asmMeasure: (ctx) => {
    const [a, b] = requireTwo(ctx)
    const result = measureBetween(a, b)
    return { status: `${a.name}↔${b.name} 중심거리 ${result.centerDistance.toFixed(2)} mm · 최소 간격 ${result.clearance.toFixed(2)} mm` }
  },
  asmTree: (ctx) => ({
    report: {
      title: 'Assembly',
      lines: [
        `${docName(ctx)} · 부품 ${ctx.doc.solids.length}`,
        ...ctx.doc.solids.map((solid) => `  · ${solid.name} @ (${solid.position.x.toFixed(0)}, ${solid.position.y.toFixed(0)}, ${solid.position.z.toFixed(0)})`),
        ...(ctx.doc.mates ?? []).map((mate) => `  ⊕ ${mate.kind} ${mate.a}↔${mate.b} = ${mate.value}`)
      ]
    }
  })
}

/* ────────────────────────── SketchUp ─────────────────────────────────────── */

const sketchupCommands: Record<string, Command> = {
  suRectangleTool: (ctx) => ({ extras: pushWire(ctx, draftRectangle(ctx.nextId(), 60, 40)), status: '사각형 60×40' }),
  suCircleTool: (ctx) => ({ extras: pushWire(ctx, draftCircle(ctx.nextId(), 30, 48)), status: '원 r30' }),
  suPolygonTool: (ctx) => ({ extras: pushWire(ctx, draftPolygon(ctx.nextId(), 8, 30)), status: '팔각형 r30' }),
  suArcTool: (ctx) => ({ extras: pushWire(ctx, draftArc(ctx.nextId(), 30, 20, 160, 24)), status: '호 20°→160°' }),
  suFreehand: (ctx) => ({
    extras: pushWire(ctx, draftBSpline(ctx.nextId(), [
      { x: -40, y: 0, z: 0 }, { x: -15, y: 0, z: 20 }, { x: 10, y: 0, z: -10 }, { x: 40, y: 0, z: 15 }
    ], 6)),
    status: '자유 곡선'
  }),
  suPushPull: (ctx) => {
    const wire = lastWire(ctx)
    const solid = pushPull(wire, 30, ctx.nextId())
    return { solids: [solid], feature: feature('pad', `PushPull-${wire.name}`, { length: 30 }), status: `푸시풀 30 mm · V ${solidVolume(solid).toFixed(0)} mm³` }
  },
  suFollowMe: (ctx) => {
    const profile = draftCircle('profile', 6, 12)
    const path = [{ x: -40, y: 0, z: 0 }, { x: 0, y: 30, z: 0 }, { x: 40, y: 0, z: 0 }]
    return { solids: [followMe(profile, path, ctx.nextId())], feature: feature('pipe', 'FollowMe') }
  },
  suOffsetFace: (ctx) => {
    const wire = offsetWire(lastWire(ctx), -4)
    return { extras: pushWire(ctx, { ...wire, id: ctx.nextId() }), status: `오프셋 -4 mm · A ${(wireArea(wire) / 100).toFixed(2)} cm²` }
  },
  suIntersect: (ctx) => {
    const [a, b] = requireTwo(ctx)
    const wire = intersectFaces(a, b, ctx.nextId())
    return { extras: pushWire(ctx, wire), status: `교차 면 점 ${wire.points.length}개` }
  },
  suSoften: (ctx) => {
    const solid = requireOne(ctx)
    return { solids: [softenEdges(solid, 20, ctx.nextId())], replaceIds: [solid.id], feature: feature('meshOp', 'Soften', { angle: 20 }) }
  },
  suMakeGroup: (ctx) => {
    const picked = selected(ctx)
    if (picked.length === 0) throw new Error('그룹: 객체를 선택하세요.')
    const group = makeGroup(ctx.nextId(), `Group${extras(ctx).groups.length + 1}`, picked, extras(ctx).tags[0]?.name ?? 'Untagged')
    return { extras: { groups: [...extras(ctx).groups, group] }, status: `그룹 ${group.name} · ${group.solidIds.length}개` }
  },
  suExplode: (ctx) => {
    const groups = extras(ctx).groups
    if (groups.length === 0) throw new Error('해제할 그룹이 없습니다.')
    const last = groups[groups.length - 1]
    return { extras: { groups: groups.slice(0, -1) }, status: `${last.name} 해제 · ${last.solidIds.length}개 복귀` }
  },
  suMakeComponent: (ctx) => {
    const picked = selected(ctx)
    if (picked.length === 0) throw new Error('컴포넌트: 객체를 선택하세요.')
    const definition = makeComponentDefinition(ctx.nextId(), `Component${extras(ctx).components.length + 1}`, picked)
    return { extras: { components: [...extras(ctx).components, definition] }, status: `컴포넌트 ${definition.name} 정의 · ${definition.solids.length}개` }
  },
  suPlaceInstance: (ctx) => {
    const definitions = extras(ctx).components
    if (definitions.length === 0) throw new Error('먼저 컴포넌트를 만드세요.')
    const definition = definitions[definitions.length - 1]
    const count = extras(ctx).instances.length + 1
    const instance = placeInstance(definition, ctx.nextId(), { x: 80 * count, y: 0, z: 0 }, 30 * count, 1)
    const solids = instanceSolids(definition, instance, ctx.nextId)
    return {
      solids,
      feature: feature('assembly', instance.name, { count: solids.length }),
      extras: { instances: [...extras(ctx).instances, instance] },
      status: `인스턴스 ${instance.name} 배치`
    }
  },
  suTagAssign: (ctx) => {
    const groups = extras(ctx).groups
    if (groups.length === 0) throw new Error('태그: 먼저 그룹을 만드세요.')
    const tags = extras(ctx).tags
    const last = groups[groups.length - 1]
    const index = tags.findIndex((tag) => tag.name === last.tag)
    const next = tags[(index + 1) % tags.length]
    return {
      extras: { groups: [...groups.slice(0, -1), { ...last, tag: next.name }] },
      status: `${last.name} 태그 → ${next.name}`
    }
  },
  suTagToggle: (ctx) => {
    const tags = extras(ctx).tags
    const target = tags.findIndex((tag) => tag.name !== 'Untagged' && tag.visible)
    const index = target >= 0 ? target : 1
    const updated = tags.map((tag, position) => (position === index ? { ...tag, visible: !tag.visible } : tag))
    return { extras: { tags: updated }, status: `태그 ${updated[index].name} ${updated[index].visible ? '표시' : '숨김'}` }
  },
  suScene: (ctx) => {
    const current = extras(ctx)
    const camera = zoomExtents(current.camera, ctx.doc.solids.length > 0 ? ctx.doc.solids : [createSolid('box', 'tmp', 1)])
    const scene = saveScene(`Scene ${current.scenes.length + 1}`, camera, current.styleId, current.shadows, current.tags, current.sectionPlanes[0]?.id)
    return { extras: { scenes: [...current.scenes, scene], camera }, status: `장면 저장 ${scene.name}` }
  },
  suApplyScene: (ctx) => {
    const current = extras(ctx)
    if (current.scenes.length === 0) throw new Error('저장된 장면이 없습니다.')
    const scene = current.scenes[current.scenes.length - 1]
    const applied = applyScene(scene, current.tags)
    return {
      extras: { camera: applied.camera, styleId: applied.style, shadows: applied.shadows, tags: applied.tags },
      status: `장면 적용 ${scene.name}`
    }
  },
  suStyle: (ctx) => {
    const current = extras(ctx)
    const index = STYLES.findIndex((style) => style.id === current.styleId)
    const next = STYLES[(index + 1) % STYLES.length]
    return {
      extras: { styleId: next.id as StyleId },
      shade: next.id === 'wireframe' ? 'wireframe' : 'shaded',
      status: `스타일 → ${next.name}`
    }
  },
  suShadows: (ctx) => {
    const current = extras(ctx).shadows
    const shadows = { ...current, enabled: true, timeOfDay: ((current.timeOfDay + 2) % 24) }
    const sun = sunDirection(shadows)
    return {
      extras: { shadows },
      status: `그림자 ${shadows.timeOfDay}시 · sun (${sun.x.toFixed(2)}, ${sun.y.toFixed(2)}, ${sun.z.toFixed(2)})`
    }
  },
  suSection: (ctx) => {
    const box = boundingBoxOf(ctx.doc.solids.length > 0 ? ctx.doc.solids : [createSolid('box', 'tmp', 1)])
    const plane = makeSectionPlane(ctx.nextId(), box.center, { x: 0, y: 1, z: 0 }, `Section ${extras(ctx).sectionPlanes.length + 1}`)
    return { extras: { sectionPlanes: [...extras(ctx).sectionPlanes, plane] }, status: `단면 평면 ${plane.name} @Y ${box.center.y.toFixed(1)}` }
  },
  suSectionCut: (ctx) => {
    const planes = extras(ctx).sectionPlanes
    const box = boundingBoxOf(ctx.doc.solids.length > 0 ? ctx.doc.solids : [createSolid('box', 'tmp', 1)])
    const plane = planes[planes.length - 1] ?? makeSectionPlane('plane-1', box.center, { x: 0, y: 1, z: 0 })
    const wire = sectionCut(ctx.doc.solids, plane, ctx.nextId())
    return {
      extras: { sectionPlanes: planes.length > 0 ? planes : [plane], wires: [...extras(ctx).wires, wire] },
      status: `단면 외곽선 점 ${wire.points.length}개`
    }
  },
  suPaint: (ctx) => {
    const solid = requireOne(ctx)
    const materials = extras(ctx).materials
    const index = materials.findIndex((material) => material.color.toLowerCase() === solid.color.toLowerCase())
    const material = materials[(index + 1) % materials.length]
    return {
      allSolids: ctx.doc.solids.map((item) => (item.id === solid.id ? paintSolid(item, material) : item)),
      status: `${solid.name} 재질 → ${material.name}`
    }
  },
  suTape: (ctx) => {
    const box = boundingBoxOf(selected(ctx))
    const measurement = tapeMeasure(box.min, box.max)
    return { status: `줄자 ${measurement.text}` }
  },
  suProtractor: (ctx) => {
    const box = boundingBoxOf(selected(ctx))
    const measurement = protractor(box.center, { x: box.max.x, y: box.center.y, z: box.center.z }, { x: box.center.x, y: box.max.y, z: box.center.z })
    return { status: `각도기 ${measurement.text}` }
  },
  suFaceInfo: (ctx) => {
    const wire = lastWire(ctx)
    const info = faceInfo(wire)
    return { report: { title: 'Entity info', lines: [wire.name, ...info.map((item) => `${item.kind}: ${item.text}`)] } }
  },
  suText3d: (ctx) => {
    const solids = text3d('CAD', 20, 4, ctx.nextId)
    return { solids, feature: feature('text', 'Text3D', { count: solids.length }), status: `3D 텍스트 ${solids.length}자` }
  },
  suMoveCopies: (ctx) => {
    const solid = requireOne(ctx)
    const copies = moveCopies(solid, { x: 60, y: 0, z: 0 }, 3, ctx.nextId)
    return { solids: copies, feature: feature('pattern', 'MoveCopies', { count: copies.length + 1 }), status: `이동 복사 ${copies.length}개` }
  },
  suRotateCopies: (ctx) => {
    const solid = requireOne(ctx)
    const copies = rotateCopies(solid, { x: 0, y: solid.position.y, z: 0 }, 45, 5, ctx.nextId)
    return { solids: copies, feature: feature('pattern', 'RotateCopies', { count: copies.length + 1 }), status: `회전 복사 ${copies.length}개 @45°` }
  },
  suSolidUnion: (ctx) => solidToolEffect(ctx, 'union'),
  suSolidSubtract: (ctx) => solidToolEffect(ctx, 'subtract'),
  suSolidTrim: (ctx) => solidToolEffect(ctx, 'trim'),
  suSolidSplit: (ctx) => solidToolEffect(ctx, 'split'),
  suSolidIntersect: (ctx) => solidToolEffect(ctx, 'intersect'),
  suOuterShell: (ctx) => solidToolEffect(ctx, 'outerShell'),
  suTerrain: (ctx) => ({ solids: [terrainFromScratch(400, 400, 12, ctx.nextId())], feature: feature('terrain', 'Terrain') }),
  suContours: (ctx) => {
    const rows = [0, 1, 2, 3].map((row) =>
      [0, 1, 2, 3, 4].map((column) => ({ x: -200 + column * 100, y: row * 20 + column * 5, z: -150 + row * 100 })))
    return { solids: [terrainFromContours(rows, ctx.nextId())], feature: feature('terrain', 'TerrainContours') }
  },
  suSmoove: (ctx) => {
    const solid = requireOne(ctx)
    const box = boundingBoxOf([solid])
    return {
      solids: [smooveTerrain(solid, box.center, Math.max(20, box.size.x / 3), 40, ctx.nextId())],
      replaceIds: [solid.id],
      feature: feature('terrain', 'Smoove')
    }
  },
  suZoomExtents: (ctx) => {
    const camera = zoomExtents(extras(ctx).camera, ctx.doc.solids.length > 0 ? ctx.doc.solids : [createSolid('box', 'tmp', 1)])
    return {
      extras: { camera },
      preset: 'iso',
      status: `전체 보기 · eye (${camera.eye.x.toFixed(0)}, ${camera.eye.y.toFixed(0)}, ${camera.eye.z.toFixed(0)})`
    }
  },
  suWalk: (ctx) => {
    const camera = walkCamera(extras(ctx).camera, 40, 10)
    return { extras: { camera }, status: `걷기 · eye (${camera.eye.x.toFixed(0)}, ${camera.eye.y.toFixed(0)}, ${camera.eye.z.toFixed(0)})` }
  },
  suOutliner: (ctx) => ({
    report: { title: 'Outliner', lines: outlinerLines(extras(ctx).groups, extras(ctx).instances, ctx.doc.solids) }
  })
}

function solidToolEffect(ctx: CommandContext, kind: Parameters<typeof solidTool>[0]): CommandEffect {
  const [a, b] = requireTwo(ctx)
  const results = solidTool(kind, a, b, ctx.nextId).filter((solid) => solidVolume(solid) > 1e-6)
  if (results.length === 0) throw new Error('솔리드 도구: 결과가 비어 있습니다.')
  return {
    solids: results,
    replaceIds: [a.id, b.id],
    feature: feature(kind === 'intersect' ? 'common' : kind === 'union' || kind === 'outerShell' ? 'union' : 'cut', `Solid-${kind}`, { count: results.length }),
    status: `${kind} · ${results.length}개 결과`
  }
}

/* ───────────────── Kernel: B-rep, NURBS, volume FEM, Python, addons ─────── */

function meshSolidFromPositions(ctx: CommandContext, positions: number[], name: string, color = '#7ec8ff'): Solid {
  if (positions.length < 9) throw new Error('커널: 생성된 면이 없습니다.')
  const normals: number[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax = positions[i + 3] - positions[i]
    const ay = positions[i + 4] - positions[i + 1]
    const az = positions[i + 5] - positions[i + 2]
    const bx = positions[i + 6] - positions[i]
    const by = positions[i + 7] - positions[i + 1]
    const bz = positions[i + 8] - positions[i + 2]
    const nx = ay * bz - az * by
    const ny = az * bx - ax * bz
    const nz = ax * by - ay * bx
    const size = Math.hypot(nx, ny, nz) || 1
    for (let v = 0; v < 3; v++) normals.push(nx / size, ny / size, nz / size)
  }
  const solid = createSolid('mesh', ctx.nextId(), ctx.doc.solids.length + 1)
  solid.kind = 'mesh'
  solid.name = name
  solid.color = color
  solid.position = { x: 0, y: 0, z: 0 }
  solid.mesh = { positions, normals }
  return solid
}

function settingsOf(ctx: CommandContext): Settings {
  return ctx.settings ?? defaultSettings()
}

const kernelCommands: Record<string, Command> = {
  brepInfo: (ctx) => {
    const solid = requireOne(ctx)
    const brep = brepFromSolid(solid)
    const check = checkBrep(brep)
    return {
      report: {
        title: 'B-rep',
        lines: [
          `${solid.name}: ${check.faces} faces, ${check.edges} edges, ${check.vertices} vertices`,
          `Euler characteristic ${check.eulerCharacteristic} (2 = closed shell)`,
          `manifold ${check.manifold ? 'yes' : 'no'} · convex ${check.convex ? 'yes' : 'no'}`,
          `volume ${brepVolume(brep).toFixed(2)} mm³ · area ${brepArea(brep).toFixed(2)} mm²`,
          `mean curvature integral ${meanCurvatureIntegral(brep).toFixed(2)}`
        ]
      }
    }
  },
  brepChamfer: (ctx) => {
    const solid = requireOne(ctx)
    const brep = brepFromSolid(solid)
    if (!checkBrep(brep).convex) throw new Error('B-rep 챔퍼: 볼록 솔리드가 필요합니다.')
    const box = boundingBoxOf([solid])
    const distance = Math.max(0.5, Math.min(box.size.x, box.size.y, box.size.z) * 0.12)
    const chamfered = chamferBrep(brep, distance)
    const result = meshSolidFromPositions(ctx, tessellateBrep(chamfered), `Chamfer-${solid.name}`, solid.color)
    return {
      solids: [result],
      replaceIds: [solid.id],
      feature: feature('chamfer', 'BrepChamfer', { radius: distance }),
      status: `B-rep 챔퍼 ${distance.toFixed(2)} mm · V ${brepVolume(chamfered).toFixed(1)} mm³ · 면 ${chamfered.faces.length}`
    }
  },
  brepFillet: (ctx) => {
    const solid = requireOne(ctx)
    const brep = brepFromSolid(solid)
    if (!checkBrep(brep).convex) throw new Error('B-rep 필렛: 볼록 솔리드가 필요합니다.')
    const box = boundingBoxOf([solid])
    const radius = Math.max(0.5, Math.min(box.size.x, box.size.y, box.size.z) * 0.15)
    const fillet = filletBrep(brep, radius, 12)
    const result = meshSolidFromPositions(ctx, fillet.positions, `Fillet-${solid.name}`, solid.color)
    return {
      solids: [result],
      replaceIds: [solid.id],
      feature: feature('fillet', 'BrepFillet', { radius }),
      status: `B-rep 필렛 r${radius.toFixed(2)} · 예상 체적 ${steinerVolume(fillet.core, radius).toFixed(1)} mm³`
    }
  },
  brepEdgesCmd: (ctx) => {
    const solid = requireOne(ctx)
    const edges = brepEdges(brepFromSolid(solid))
    const sharp = edges.filter((edge) => edge.angle > Math.PI / 6)
    const average = edges.reduce((acc, edge) => acc + edge.angle, 0) / Math.max(1, edges.length)
    return {
      status: `엣지 ${edges.length}개 · 날카로운 엣지 ${sharp.length}개 · 평균 ${(average * 180 / Math.PI).toFixed(1)}°`
    }
  },
  nurbsCurveCmd: (ctx) => {
    const curve = makeCurve([
      nurbsPoint(-40, 0, 0), nurbsPoint(-10, 30, 10), nurbsPoint(20, -20, -10), nurbsPoint(45, 10, 0)
    ], 3)
    const wire = makeWire(ctx.nextId(), 'NurbsCurve', tessellateCurve(curve, 64), false)
    return {
      extras: pushWire(ctx, wire),
      status: `NURBS 곡선 차수 ${curve.degree} · 길이 ${curveLength(curve).toFixed(2)} mm`
    }
  },
  nurbsCircleCmd: (ctx) => {
    const circle = circleCurve({ x: 0, y: 0, z: 0 }, 25, 'y')
    const wire = makeWire(ctx.nextId(), 'NurbsCircle', tessellateCurve(circle, 96), true)
    return {
      extras: pushWire(ctx, wire),
      status: `유리 NURBS 원 · 둘레 ${curveLength(circle).toFixed(3)} mm (정확값 ${(2 * Math.PI * 25).toFixed(3)})`
    }
  },
  nurbsArcCmd: (ctx) => {
    const arc = arcCurve({ x: 0, y: 0, z: 0 }, 30, 0, 120, 'y')
    const wire = makeWire(ctx.nextId(), 'NurbsArc', tessellateCurve(arc, 48), false)
    const start = curvePoint(arc, 0)
    return { extras: pushWire(ctx, wire), status: `호 120° · 시작 (${start.x.toFixed(1)}, ${start.z.toFixed(1)})` }
  },
  nurbsSurfaceCmd: (ctx) => {
    const profile = interpolateCurve([
      { x: 10, y: -20, z: 0 }, { x: 22, y: -5, z: 0 }, { x: 16, y: 12, z: 0 }, { x: 24, y: 26, z: 0 }
    ], 3)
    const surface = revolveSurfaceNurbs(profile, 13, 360)
    const solid = meshSolidFromPositions(ctx, tessellateSurface(surface, 24, 16), 'NurbsRevolve', '#c9a0ff')
    return { solids: [solid], feature: feature('surface', 'NurbsRevolve') }
  },
  nurbsExtrudeCmd: (ctx) => {
    const wire = lastWire(ctx)
    const curve = makeCurve(
      wire.points.map((item) => nurbsPoint(item.x, item.y, item.z)),
      Math.min(3, Math.max(1, wire.points.length - 1))
    )
    const surface = extrudeSurfaceNurbs(curve, { x: 0, y: 1, z: 0 }, 25)
    const solid = meshSolidFromPositions(ctx, tessellateSurface(surface, 8, 32), 'NurbsExtrude', '#9fd8ff')
    return { solids: [solid], feature: feature('surface', 'NurbsExtrude', { length: 25 }) }
  },
  feaMeshCmd: (ctx) => {
    const solid = requireOne(ctx)
    const mesh = volumeMesh(solid, 6)
    return {
      status: `볼륨 메쉬 ${mesh.elementCount} tet / ${mesh.nodeCount} node · 체적 ${meshVolume(mesh).toFixed(1)} mm³ (셀 ${mesh.cellSize.toFixed(2)} mm)`
    }
  },
  feaSolveCmd: (ctx) => {
    const solid = requireOne(ctx)
    const analysis = extras(ctx).analysis
    const force = analysis.constraints
      .filter((item) => item.kind === 'force')
      .reduce((acc, item) => acc + item.value, 0) || 1000
    const result = solveVolume(solid, {
      divisions: 6,
      materialId: analysis.materialId,
      support: { kind: 'fixed', axis: 'y', side: 'min' },
      load: { kind: 'force', axis: 'y', side: 'max', force: { x: 0, y: -force, z: 0 } }
    })
    return { report: { title: 'FEM (volume)', lines: volumeReport(result, analysis.materialId) } }
  },
  pythonRunCmd: (ctx) => {
    const source = [
      '# MyCAD Python macro',
      'import Part',
      'import math',
      'doc = App.newDocument("Macro")',
      'base = Part.makeBox(60, 40, 20)',
      'hole = Part.makeCylinder(8, 60)',
      'part = base - hole',
      'obj = doc.addObject("Part::Feature", "MacroPart")',
      'obj.Shape = part',
      'doc.recompute()',
      'print("volume", round(part.Volume, 1), "mm3")',
      'print("area", round(part.Area, 1), "mm2")'
    ].join('\n')
    const result = runPython(source)
    if (result.solids.length === 0) throw new Error('매크로가 형상을 만들지 않았습니다.')
    void ctx
    return {
      solids: result.solids,
      feature: feature('primitive', 'PythonMacro', { count: result.solids.length }),
      report: { title: 'Python', lines: [...result.output, `steps ${result.steps}`] }
    }
  },
  addonListCmd: (ctx) => {
    const installed = settingsOf(ctx).addons
    const available = availableAddons(installed)
    return {
      report: {
        title: 'Addon manager',
        lines: [
          ...addonReport(installed),
          '',
          `설치 가능: ${available.length} / 카탈로그 ${ADDON_CATALOG.length}`,
          ...available.map((manifest) => `· ${manifest.name.ko} ${manifest.version} (${manifest.kind})`)
        ]
      }
    }
  },
  addonInstallCmd: (ctx) => {
    const settings = settingsOf(ctx)
    const next = availableAddons(settings.addons)[0]
    if (!next) throw new Error('설치할 애드온이 없습니다. 카탈로그를 모두 설치했습니다.')
    const addons = installAddon(settings.addons, next, 'catalog', '1.0.0', Date.now())
    return {
      settingsPatch: { addons },
      status: `애드온 설치: ${next.name.ko} ${next.version} · 명령 ${(next.commands ?? []).length}개`
    }
  },
  addonToggleCmd: (ctx) => {
    const settings = settingsOf(ctx)
    const target = settings.addons[settings.addons.length - 1]
    if (!target) throw new Error('설치된 애드온이 없습니다.')
    return {
      settingsPatch: { addons: setAddonEnabled(settings.addons, target.manifest.id, !target.enabled) },
      status: `${target.manifest.name.ko} ${target.enabled ? '사용 안 함' : '사용'}`
    }
  },
  addonUninstallCmd: (ctx) => {
    const settings = settingsOf(ctx)
    const target = settings.addons[settings.addons.length - 1]
    if (!target) throw new Error('설치된 애드온이 없습니다.')
    return {
      settingsPatch: { addons: uninstallAddon(settings.addons, target.manifest.id) },
      status: `애드온 제거: ${target.manifest.name.ko}`
    }
  },
  addonRunCmd: (ctx) => {
    const command = addonCommands(settingsOf(ctx).addons)[0]
    if (!command) throw new Error('실행할 애드온 명령이 없습니다. 먼저 애드온을 설치하세요.')
    const result = runPython(command.macro)
    return {
      solids: result.solids,
      feature: feature('primitive', command.label.ko, { count: result.solids.length }),
      report: { title: command.label.ko, lines: [...result.output, `by ${command.addonId}`] }
    }
  }
}

/** Run one of the macros an installed addon contributes. */
export function runAddonCommand(commandId: string, installed: InstalledAddon[]): CommandEffect {
  const command = findAddonCommand(installed, commandId)
  if (!command) throw new Error(`애드온 명령을 찾을 수 없습니다: ${commandId}`)
  const result = runPython(command.macro)
  return {
    solids: result.solids,
    feature: feature('primitive', command.label.ko, { count: result.solids.length }),
    report: { title: command.label.ko, lines: [...result.output, `by ${command.addonId}`] }
  }
}

/* ────────────────────────── Registry ─────────────────────────────────────── */

export const COMMANDS: Record<string, Command> = {
  ...partCommands,
  ...draftCommands,
  ...sketcherCommands,
  ...meshCommands,
  ...techdrawCommands,
  ...spreadsheetCommands,
  ...femCommands,
  ...camCommands,
  ...bimCommands,
  ...miscCommands,
  ...gsdCommands,
  ...sheetMetalCommands,
  ...kinematicsCommands,
  ...knowledgeCommands,
  ...assemblyCommands,
  ...sketchupCommands,
  ...kernelCommands
}

export const COMMAND_IDS = Object.keys(COMMANDS)

export function hasCommand(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMANDS, id)
}

/** Run a registry command, or return null when the id belongs elsewhere. */
export function runCommandById(id: string, ctx: CommandContext): CommandEffect | null {
  const command = COMMANDS[id]
  if (!command) return null
  return command(ctx)
}

/** Re-exported so the UI can reuse the same boolean helper for legacy ids. */
export { booleanSolids }

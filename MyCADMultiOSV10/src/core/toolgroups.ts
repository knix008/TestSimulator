// Categories for the tool panel: a workbench lists its commands in one flat
// array, and the panel shows them grouped the way a CAD user thinks about them
// (sketch, primitives, features, dress-up, booleans, …).
import type { Lang } from './settings'

export interface ToolCategory {
  id: string
  ko: string
  en: string
  icon: string
}

/** Display order of the groups; a workbench only shows the ones it fills. */
export const TOOL_CATEGORIES: ToolCategory[] = [
  { id: 'sketch', ko: '스케치', en: 'Sketch', icon: '✎' },
  { id: 'draw2d', ko: '2D 작도', en: '2D drafting', icon: '╱' },
  { id: 'primitive', ko: '기본 도형', en: 'Primitives', icon: '▣' },
  { id: 'feature', ko: '피처', en: 'Features', icon: '⬆' },
  { id: 'dress', ko: '마감', en: 'Dress-up', icon: '⌒' },
  { id: 'boolean', ko: '불리언', en: 'Booleans', icon: '∪' },
  { id: 'modify', ko: '수정', en: 'Modify', icon: '⌗' },
  { id: 'transform', ko: '변환', en: 'Transform', icon: '⟳' },
  { id: 'pattern', ko: '패턴', en: 'Patterns', icon: '⋯' },
  { id: 'surface', ko: '서피스', en: 'Surfaces', icon: '◠' },
  { id: 'mesh', ko: '메쉬', en: 'Mesh', icon: '△' },
  { id: 'points', ko: '포인트', en: 'Points', icon: '∴' },
  { id: 'organize', ko: '구성', en: 'Organize', icon: '⌥' },
  { id: 'assembly', ko: '어셈블리', en: 'Assembly', icon: '⊕' },
  { id: 'kinematics', ko: '키네매틱스', en: 'Kinematics', icon: '⟲' },
  { id: 'analysis', ko: '해석', en: 'Analysis', icon: '⚖' },
  { id: 'cam', ko: '가공', en: 'Machining', icon: '⌁' },
  { id: 'sheetmetal', ko: '판금', en: 'Sheet metal', icon: '⊐' },
  { id: 'bim', ko: '건축', en: 'Architecture', icon: '⌂' },
  { id: 'drawing', ko: '도면', en: 'Drawings', icon: '📄' },
  { id: 'annotation', ko: '주석', en: 'Annotation', icon: 'T' },
  { id: 'spreadsheet', ko: '스프레드시트', en: 'Spreadsheet', icon: '▨' },
  { id: 'knowledge', ko: '지식공학', en: 'Knowledge', icon: 'ƒ' },
  { id: 'kernel', ko: '커널', en: 'Kernel', icon: '◱' },
  { id: 'measure', ko: '측정', en: 'Measure', icon: '📏' },
  { id: 'view', ko: '보기', en: 'View', icon: '👁' },
  { id: 'file', ko: '파일', en: 'File', icon: '📁' },
  { id: 'script', ko: '스크립트', en: 'Scripting', icon: '⌨' },
  { id: 'other', ko: '기타', en: 'Other', icon: '•' }
]

/** Commands whose category does not follow from their id. */
const EXPLICIT: Record<string, string> = {
  // Draft: drawing, modifying, transforming and annotating in 2D.
  draftLine: 'draw2d', draftWire: 'draw2d', draftRect: 'draw2d', draftPolygonWire: 'draw2d',
  draftCircleWire: 'draw2d', draftEllipseWire: 'draw2d', draftArcWire: 'draw2d',
  draftBSplineWire: 'draw2d', draftBezierWire: 'draw2d',
  draftFillet: 'modify', draftOffset: 'modify', draftTrimex: 'modify', draftJoin: 'modify',
  draftSplit: 'modify', draftUpgrade: 'modify', draftDowngrade: 'modify',
  draftMove: 'transform', draftRotate: 'transform', draftScale: 'transform',
  draftMirror: 'transform', draftStretch: 'transform',
  draftDimension: 'annotation', draftText: 'annotation',

  // SketchUp: the same ideas under their SketchUp names.
  suRectangleTool: 'draw2d', suCircleTool: 'draw2d', suPolygonTool: 'draw2d',
  suArcTool: 'draw2d', suFreehand: 'draw2d',
  suPushPull: 'feature', suFollowMe: 'feature', suOffsetFace: 'feature',
  suSoften: 'dress', suSmoove: 'dress',
  suSolidUnion: 'boolean', suSolidSubtract: 'boolean', suSolidIntersect: 'boolean',
  suSolidTrim: 'boolean', suSolidSplit: 'boolean', suOuterShell: 'boolean', suIntersect: 'boolean',
  suMoveCopies: 'pattern', suRotateCopies: 'pattern',
  suMakeGroup: 'organize', suMakeComponent: 'organize', suPlaceInstance: 'organize',
  suOutliner: 'organize', suTagAssign: 'organize', suTagToggle: 'organize', suExplode: 'organize',
  suScene: 'view', suApplyScene: 'view', suStyle: 'view', suShadows: 'view',
  suSection: 'view', suSectionCut: 'view', suWalk: 'view', suZoomExtents: 'view', suPaint: 'view',
  suTape: 'measure', suProtractor: 'measure', suFaceInfo: 'measure',
  suText3d: 'annotation',
  suDynamic: 'knowledge', suSnap: 'draw2d', suGeo: 'measure', suMatch: 'view',
  suTexture: 'view', suSkpExport: 'file', suSkpImport: 'file',
  suTerrain: 'surface', suContours: 'surface',

  // Annotation and drawing helpers that do not follow their prefix.
  shapeStringCmd: 'annotation', techdrawDim: 'annotation', techdrawHatch: 'annotation',

  sketchLine: 'sketch',
  sketchArcTool: 'sketch',
  sketchEllipse: 'sketch',
  sketchSlot: 'sketch',
  sketchBSplineTool: 'sketch',
  sketchTrimEdge: 'sketch',
  sketchExtendEdge: 'sketch',
  sketchSplitEdge: 'sketch',
  sketchExternal: 'sketch',
  sketchConstruction: 'sketch',
  sketchHorizontal: 'sketch',
  sketchVertical: 'sketch',
  sketchParallel: 'sketch',
  sketchPerpendicular: 'sketch',
  sketchTangent: 'sketch',
  sketchEqual: 'sketch',
  sketchSymmetric: 'sketch',
  sketchLock: 'sketch',
  sketchBlock: 'sketch',
  sketchDistanceX: 'sketch',
  sketchDistanceY: 'sketch',
  partJoinConnect: 'boolean',
  partJoinEmbed: 'boolean',
  partJoinCutout: 'boolean',
  partSliceApart: 'boolean',
  partShapeBuilder: 'modify',
  partRefine: 'modify',
  partCheckGeometry: 'analysis',
  partDefeature: 'modify',
  pdAdditiveBox: 'primitive',
  pdAdditiveCylinder: 'primitive',
  pdAdditiveSphere: 'primitive',
  pdSubtractiveBox: 'feature',
  pdSubtractiveCylinder: 'feature',
  pdMultiTransform: 'pattern',
  meshUnionCmd: 'mesh',
  meshCutCmd: 'mesh',
  meshIntersectCmd: 'mesh',
  meshTrimByPlane: 'mesh',
  meshSplitComponents: 'mesh',
  meshCurvature: 'analysis',
  techdrawBalloon: 'drawing',
  techdrawLeader: 'drawing',
  techdrawCenterline: 'drawing',
  techdrawCosmetic: 'drawing',
  techdrawWeld: 'drawing',
  techdrawRichText: 'drawing',
  femPressure: 'analysis',
  femDisplacement: 'analysis',
  femContact: 'analysis',
  femSpring: 'analysis',
  femTemperature: 'analysis',
  femHeatFlux: 'analysis',
  femBeamSection: 'analysis',
  femResultShow: 'analysis',
  camWaterline: 'cam',
  camDeburr: 'cam',
  camVcarve: 'cam',
  camDressupTag: 'cam',
  camDressupDogbone: 'cam',
  camSimulate: 'cam',
  camToolBitLibrary: 'cam',
  draftWorkingPlane: 'draw2d',
  draftLayer: 'organize',
  draftSnapToggle: 'draw2d',
  draftShape2DView: 'draw2d',
  draftToSketch: 'draw2d',
  draftLabel: 'drawing',
  draftHatchFace: 'drawing',
  draftSlope: 'draw2d',
  pointsToMesh: 'points',
  pointsStructure: 'points',
  pointsMerge: 'points',
  scadHull: 'boolean',
  scadMinkowski: 'boolean',
  viewDimetric: 'view',
  viewTrimetric: 'view',
  viewRear: 'view',
  viewBottom: 'view',
  viewLeftSide: 'view',
  viewRandomColor: 'view',
  viewSceneInspector: 'analysis',
  viewDependencyGraph: 'analysis',
  sketchRect: 'sketch', sketchCircle: 'sketch', sketchPolygon: 'sketch',
  sketchRectConstrained: 'sketch', sketchSolve2d: 'sketch', sketchConstraintCheck: 'sketch',
  sketchDof: 'sketch', solveConstraints: 'sketch', coincidence: 'sketch', offsetMate: 'sketch',

  box: 'primitive', cylinder: 'primitive', sphere: 'primitive', cone: 'primitive',
  torus: 'primitive', plane: 'primitive', wedge: 'primitive', prism: 'primitive',
  ellipsoid: 'primitive', tubePrim: 'primitive', spiralPrim: 'primitive',
  ringPrim: 'primitive', pyramid: 'primitive',

  pad: 'feature', pocket: 'feature', revolve: 'feature', groove: 'feature', loft: 'feature',
  pipe: 'feature', helix: 'feature', hole: 'feature', counterbore: 'feature',
  countersink: 'feature', section: 'feature', crossSections: 'feature', ruled: 'feature',
  wireToFace: 'feature',

  fillet: 'dress', chamfer: 'dress', draft: 'dress', shell: 'dress', thickness: 'dress',
  offset3d: 'dress',

  union: 'boolean', cut: 'boolean', common: 'boolean', xor: 'boolean',
  booleanFragments: 'boolean', compound: 'boolean',

  mirror: 'transform', updatePart: 'transform', translate: 'transform',
  rotateBody: 'transform', scaleBody: 'transform', align: 'transform',

  linearPattern: 'pattern', polarPattern: 'pattern', rectPattern: 'pattern',
  orthoArray: 'pattern', polarArray: 'pattern', circularArray: 'pattern',
  pathArray: 'pattern', pointArray: 'pattern',

  approxSurface: 'surface', surfaceFill: 'surface',
  importPoints: 'points', pointsDownsample: 'points', fitPlaneCmd: 'points', fitSphereCmd: 'points',

  measure: 'measure', inspect: 'measure', partArea: 'measure', inertia: 'measure', massProps: 'measure',
  materialAssign: 'analysis', materialLibrary: 'analysis',
  expressionEval: 'knowledge', parameter: 'knowledge',
  exportGcode: 'cam', pocketPath: 'cam', robotPose: 'kinematics',
  print: 'drawing',
  front: 'view', top: 'view', iso: 'view',
  pythonRunCmd: 'script', runMacro: 'script',
  importOpenScad: 'file', importStl: 'file'
}

/** Workbench prefixes, longest first where they would overlap. */
const PREFIXES: Array<[string, string]> = [
  ['techdraw', 'drawing'], ['image', 'primitive'], ['start', 'file'], ['plot', 'analysis'],
  ['ship', 'analysis'], ['elec', 'analysis'], ['stru', 'analysis'], ['axis5', 'cam'],
  ['lathe', 'cam'], ['photo', 'view'], ['web', 'file'], ['ias', 'mesh'], ['fst', 'surface'],
  ['fta', 'annotation'], ['pip', 'feature'], ['lam', 'analysis'], ['mold', 'dress'],
  ['lay', 'drawing'],
  ['points', 'points'], ['measure', 'measure'], ['import', 'file'],
  ['export', 'file'], ['addon', 'script'], ['draft', 'draw2d'], ['sheet', 'spreadsheet'],
  ['brep', 'kernel'], ['mesh', 'mesh'], ['nurbs', 'surface'], ['gsd', 'surface'],
  ['asm', 'assembly'], ['dmu', 'kinematics'], ['fem', 'analysis'], ['fea', 'analysis'],
  ['cam', 'cam'], ['bim', 'bim'], ['kw', 'knowledge'], ['sm', 'sheetmetal'],
  ['su', 'organize']
]

export function toolCategory(id: string): string {
  const explicit = EXPLICIT[id]
  if (explicit) return explicit
  for (const [prefix, category] of PREFIXES) {
    if (id.startsWith(prefix)) return category
  }
  return 'other'
}

export function categoryById(id: string): ToolCategory {
  return TOOL_CATEGORIES.find((category) => category.id === id) ?? TOOL_CATEGORIES[TOOL_CATEGORIES.length - 1]
}

export function categoryName(lang: Lang, id: string): string {
  const category = categoryById(id)
  return lang === 'ko' ? category.ko : category.en
}

/**
 * Split a workbench's tools into its groups. Groups follow `TOOL_CATEGORIES`,
 * the tools inside one keep the workbench's own order, and empty groups are
 * left out.
 */
export function groupTools(tools: readonly string[]): Array<{ category: ToolCategory; tools: string[] }> {
  const buckets = new Map<string, string[]>()
  for (const tool of tools) {
    const id = toolCategory(tool)
    buckets.set(id, [...(buckets.get(id) ?? []), tool])
  }
  return TOOL_CATEGORIES.filter((category) => buckets.has(category.id)).map((category) => ({
    category,
    tools: buckets.get(category.id) as string[]
  }))
}

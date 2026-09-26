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
  { id: 'draft2d', ko: '2D 작도', en: '2D drafting', icon: '╱' },
  { id: 'primitive', ko: '기본 도형', en: 'Primitives', icon: '▣' },
  { id: 'feature', ko: '피처', en: 'Features', icon: '⬆' },
  { id: 'dress', ko: '마감', en: 'Dress-up', icon: '⌒' },
  { id: 'boolean', ko: '불리언', en: 'Booleans', icon: '∪' },
  { id: 'transform', ko: '변환', en: 'Transform', icon: '⟳' },
  { id: 'pattern', ko: '패턴', en: 'Patterns', icon: '⋯' },
  { id: 'surface', ko: '서피스', en: 'Surfaces', icon: '◠' },
  { id: 'mesh', ko: '메쉬', en: 'Mesh', icon: '△' },
  { id: 'points', ko: '포인트', en: 'Points', icon: '∴' },
  { id: 'assembly', ko: '어셈블리', en: 'Assembly', icon: '⊕' },
  { id: 'analysis', ko: '해석', en: 'Analysis', icon: '⚖' },
  { id: 'manufacture', ko: '제조', en: 'Manufacturing', icon: '⌁' },
  { id: 'bim', ko: '건축', en: 'Architecture', icon: '⌂' },
  { id: 'drawing', ko: '도면', en: 'Drawings', icon: '📄' },
  { id: 'sketchup', ko: '스케치업', en: 'SketchUp', icon: '✦' },
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
  wireToFace: 'feature', shapeStringCmd: 'feature',

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
  exportGcode: 'manufacture', pocketPath: 'manufacture', robotPose: 'manufacture',
  print: 'drawing',
  front: 'view', top: 'view', iso: 'view',
  pythonRunCmd: 'script', runMacro: 'script',
  importOpenScad: 'file', importStl: 'file'
}

/** Workbench prefixes, longest first where they would overlap. */
const PREFIXES: Array<[string, string]> = [
  ['techdraw', 'drawing'], ['points', 'points'], ['measure', 'measure'], ['import', 'file'],
  ['export', 'file'], ['addon', 'script'], ['draft', 'draft2d'], ['sheet', 'knowledge'],
  ['brep', 'kernel'], ['mesh', 'mesh'], ['nurbs', 'surface'], ['gsd', 'surface'],
  ['asm', 'assembly'], ['dmu', 'assembly'], ['fem', 'analysis'], ['fea', 'analysis'],
  ['cam', 'manufacture'], ['bim', 'bim'], ['kw', 'knowledge'], ['sm', 'manufacture'],
  ['su', 'sketchup']
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

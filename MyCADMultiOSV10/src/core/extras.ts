// Extra document state introduced by the FreeCAD / CATIA / SketchUp features.
import type { Annotation, Wire } from './draftwb'
import type { BimElement, BimLevel } from './archwb'
import type { FemAnalysis } from './femwb'
import type { Mechanism } from './kinematics'
import type { KnowledgeCheck, KnowledgeRule, DesignTable } from './knowledge'
import type { Sheet } from './spreadsheet'
import type { SheetPart } from './sheetmetal'
import type {
  Camera, ComponentDefinition, ComponentInstance, Scene, SectionPlane,
  StyleId, SuGroup, SuMaterial, ShadowSettings, Tag
} from './sketchup'
import { defaultCamera, defaultMaterials, defaultShadows, defaultTags } from './sketchup'
import { createSheet } from './spreadsheet'
import { createAnalysis } from './femwb'
import { createMechanism } from './kinematics'
import { createSheetPart } from './sheetmetal'

export interface DocumentExtras {
  /** Draft / GSD wireframe geometry. */
  wires: Wire[]
  annotations: Annotation[]
  /** SketchUp organisation. */
  groups: SuGroup[]
  components: ComponentDefinition[]
  instances: ComponentInstance[]
  tags: Tag[]
  scenes: Scene[]
  materials: SuMaterial[]
  styleId: StyleId
  shadows: ShadowSettings
  sectionPlanes: SectionPlane[]
  camera: Camera
  /** Spreadsheet workbench. */
  sheet: Sheet
  /** FEM workbench. */
  analysis: FemAnalysis
  /** DMU kinematics. */
  mechanism: Mechanism
  /** Sheet metal design. */
  sheetMetal: SheetPart
  /** Knowledgeware. */
  rules: KnowledgeRule[]
  checks: KnowledgeCheck[]
  designTable: DesignTable | null
  /** BIM / Arch. */
  bimElements: BimElement[]
  levels: BimLevel[]
  /** Material assignment per solid id. */
  materialOf: Record<string, string>
  /** Sketcher constraints, as FreeCAD's solver lists them. */
  sketchConstraints: SketchConstraint[]
}

/** One sketcher constraint: what it holds and the freedom it removes. */
export interface SketchConstraint {
  id: string
  kind: string
  dof: number
}

export function createExtras(): DocumentExtras {
  return {
    wires: [],
    annotations: [],
    groups: [],
    components: [],
    instances: [],
    tags: defaultTags(),
    scenes: [],
    materials: defaultMaterials(),
    styleId: 'shaded',
    shadows: defaultShadows(),
    sectionPlanes: [],
    camera: defaultCamera(),
    sheet: createSheet(),
    analysis: createAnalysis('analysis-1'),
    mechanism: createMechanism(),
    sheetMetal: createSheetPart('SheetMetal'),
    rules: [],
    checks: [],
    designTable: null,
    bimElements: [],
    levels: [],
    materialOf: {},
    sketchConstraints: []
  }
}

export function cloneExtras(extras: DocumentExtras | undefined): DocumentExtras {
  const base = createExtras()
  if (!extras) return base
  return {
    ...base,
    ...extras,
    wires: (extras.wires ?? []).map((wire) => ({ ...wire, points: wire.points.map((point) => ({ ...point })) })),
    annotations: (extras.annotations ?? []).map((item) => ({ ...item, a: { ...item.a }, b: { ...item.b } })),
    groups: (extras.groups ?? []).map((group) => ({ ...group, solidIds: group.solidIds.slice() })),
    components: (extras.components ?? []).map((definition) => ({ ...definition, solids: definition.solids.slice(), origin: { ...definition.origin } })),
    instances: (extras.instances ?? []).map((instance) => ({ ...instance, position: { ...instance.position }, rotation: { ...instance.rotation }, scale: { ...instance.scale } })),
    tags: (extras.tags ?? base.tags).map((tag) => ({ ...tag })),
    sketchConstraints: (extras.sketchConstraints ?? []).map((item) => ({ ...item })),
    scenes: (extras.scenes ?? []).map((scene) => ({ ...scene, hiddenTags: scene.hiddenTags.slice() })),
    materials: (extras.materials ?? base.materials).map((material) => ({ ...material })),
    shadows: { ...(extras.shadows ?? base.shadows) },
    sectionPlanes: (extras.sectionPlanes ?? []).map((plane) => ({ ...plane, origin: { ...plane.origin }, normal: { ...plane.normal } })),
    camera: { ...(extras.camera ?? base.camera) },
    sheet: { ...(extras.sheet ?? base.sheet), cells: (extras.sheet?.cells ?? []).map((cell) => ({ ...cell })) },
    analysis: { ...(extras.analysis ?? base.analysis), constraints: (extras.analysis?.constraints ?? []).map((item) => ({ ...item })) },
    mechanism: {
      ...(extras.mechanism ?? base.mechanism),
      joints: (extras.mechanism?.joints ?? []).map((joint) => ({ ...joint, origin: { ...joint.origin } })),
      fixed: (extras.mechanism?.fixed ?? []).slice(),
      commands: (extras.mechanism?.commands ?? []).slice()
    },
    sheetMetal: { ...(extras.sheetMetal ?? base.sheetMetal), walls: (extras.sheetMetal?.walls ?? []).map((wall) => ({ ...wall })) },
    rules: (extras.rules ?? []).map((rule) => ({ ...rule, then: rule.then.slice(), otherwise: rule.otherwise?.slice() })),
    checks: (extras.checks ?? []).map((check) => ({ ...check })),
    designTable: extras.designTable ? { ...extras.designTable, columns: extras.designTable.columns.slice(), rows: extras.designTable.rows.map((row) => row.slice()) } : null,
    bimElements: (extras.bimElements ?? []).map((element) => ({ ...element })),
    levels: (extras.levels ?? []).map((level) => ({ ...level })),
    materialOf: { ...(extras.materialOf ?? {}) }
  }
}

import { menuIcon } from './i18n'

export interface MenuEntry {
  id: string
  /** i18n message key, or a command id resolved through labels.ts. */
  labelKey: string
  icon: string
}

export interface MenuDef {
  id: string
  labelKey: string
  items: MenuEntry[]
}

function entry(id: string): MenuEntry {
  return { id, labelKey: id, icon: menuIcon(id) }
}

export const MENUS: MenuDef[] = [
  { id: 'file', labelKey: 'file', items: [
    { id: 'new', labelKey: 'new', icon: menuIcon('new') },
    { id: 'open', labelKey: 'open', icon: menuIcon('open') },
    { id: 'save', labelKey: 'save', icon: menuIcon('save') },
    { id: 'saveAs', labelKey: 'saveAs', icon: menuIcon('saveAs') },
    entry('export'),
    { id: 'importStl', labelKey: 'importStl', icon: menuIcon('importStl') },
    { id: 'exportStl', labelKey: 'exportStl', icon: menuIcon('exportStl') },
    { id: 'exportObj', labelKey: 'exportObj', icon: menuIcon('exportObj') },
    { id: 'exportSvg', labelKey: 'exportSvg', icon: menuIcon('exportSvg') },
    { id: 'exportDxf', labelKey: 'exportDxf', icon: menuIcon('exportDxf') },
    { id: 'openUrl', labelKey: 'openUrl', icon: menuIcon('openUrl') },
    { id: 'download', labelKey: 'download', icon: menuIcon('download') }
  ]},
  { id: 'edit', labelKey: 'edit', items: [
    { id: 'undo', labelKey: 'undo', icon: menuIcon('undo') },
    { id: 'redo', labelKey: 'redo', icon: menuIcon('redo') },
    { id: 'copy', labelKey: 'copy', icon: menuIcon('copy') },
    { id: 'paste', labelKey: 'paste', icon: menuIcon('paste') },
    { id: 'duplicate', labelKey: 'duplicate', icon: menuIcon('duplicate') },
    { id: 'delete', labelKey: 'delete', icon: menuIcon('delete') },
    { id: 'selectAll', labelKey: 'selectAll', icon: menuIcon('selectAll') }
  ]},
  { id: 'view', labelKey: 'view', items: [
    { id: 'front', labelKey: 'front', icon: menuIcon('front') },
    { id: 'back', labelKey: 'back', icon: menuIcon('back') },
    { id: 'left', labelKey: 'left', icon: menuIcon('left') },
    { id: 'right', labelKey: 'right', icon: menuIcon('right') },
    { id: 'top', labelKey: 'top', icon: menuIcon('top') },
    { id: 'bottom', labelKey: 'bottom', icon: menuIcon('bottom') },
    { id: 'iso', labelKey: 'iso', icon: menuIcon('iso') },
    { id: 'grid', labelKey: 'grid', icon: menuIcon('grid') },
    { id: 'ruler', labelKey: 'ruler', icon: menuIcon('ruler') },
    { id: 'shaded', labelKey: 'shaded', icon: menuIcon('shaded') },
    { id: 'wireframe', labelKey: 'wireframe', icon: menuIcon('wireframe') },
    { id: 'zoomIn', labelKey: 'zoomIn', icon: menuIcon('zoomIn') },
    { id: 'zoomOut', labelKey: 'zoomOut', icon: menuIcon('zoomOut') },
    { id: 'fit', labelKey: 'fit', icon: menuIcon('fit') },
    entry('resetView'),
    entry('asIs'),
    entry('flatLines'),
    entry('points'),
    entry('hiddenLine'),
    entry('noShading'),
    entry('projection'),
    entry('toolPanel'),
    entry('propertyPanel')
  ]},
  { id: 'insert', labelKey: 'insert', items: [
    { id: 'box', labelKey: 'box', icon: menuIcon('box') },
    { id: 'sphere', labelKey: 'sphere', icon: menuIcon('sphere') },
    { id: 'cylinder', labelKey: 'cylinder', icon: menuIcon('cylinder') },
    { id: 'cone', labelKey: 'cone', icon: menuIcon('cone') },
    { id: 'torus', labelKey: 'torus', icon: menuIcon('torus') },
    { id: 'plane', labelKey: 'plane', icon: menuIcon('plane') },
    entry('wedge'), entry('prism'), entry('ellipsoid'), entry('tubePrim'),
    entry('spiralPrim'), entry('ringPrim'), entry('pyramid')
  ]},
  { id: 'part', labelKey: 'part', items: [
    { id: 'sketchRect', labelKey: 'sketchRect', icon: menuIcon('sketchRect') },
    { id: 'sketchCircle', labelKey: 'sketchCircle', icon: menuIcon('sketchCircle') },
    { id: 'sketchPolygon', labelKey: 'sketchPolygon', icon: menuIcon('sketchPolygon') },
    { id: 'pad', labelKey: 'pad', icon: menuIcon('pad') },
    { id: 'pocket', labelKey: 'pocket', icon: menuIcon('pocket') },
    { id: 'revolve', labelKey: 'revolve', icon: menuIcon('revolve') },
    { id: 'loft', labelKey: 'loft', icon: menuIcon('loft') },
    { id: 'pipe', labelKey: 'pipe', icon: menuIcon('pipe') },
    { id: 'helix', labelKey: 'helix', icon: menuIcon('helix') },
    { id: 'fillet', labelKey: 'fillet', icon: menuIcon('fillet') },
    { id: 'chamfer', labelKey: 'chamfer', icon: menuIcon('chamfer') },
    { id: 'union', labelKey: 'union', icon: menuIcon('union') },
    { id: 'cut', labelKey: 'cut', icon: menuIcon('cut') },
    { id: 'common', labelKey: 'common', icon: menuIcon('common') },
    { id: 'mirror', labelKey: 'mirror', icon: menuIcon('mirror') },
    { id: 'linearPattern', labelKey: 'linearPattern', icon: menuIcon('linearPattern') },
    { id: 'polarPattern', labelKey: 'polarPattern', icon: menuIcon('polarPattern') },
    { id: 'hole', labelKey: 'hole', icon: menuIcon('hole') },
    { id: 'align', labelKey: 'align', icon: menuIcon('align') },
    { id: 'section', labelKey: 'section', icon: menuIcon('section') },
    { id: 'shaft', labelKey: 'shaft', icon: menuIcon('shaft') },
    { id: 'groove', labelKey: 'groove', icon: menuIcon('groove') },
    { id: 'draft', labelKey: 'draft', icon: menuIcon('draft') },
    { id: 'shell', labelKey: 'shell', icon: menuIcon('shell') },
    { id: 'rectPattern', labelKey: 'rectPattern', icon: menuIcon('rectPattern') },
    { id: 'translate', labelKey: 'translate', icon: menuIcon('translate') },
    { id: 'rotateBody', labelKey: 'rotateBody', icon: menuIcon('rotateBody') },
    { id: 'scaleBody', labelKey: 'scaleBody', icon: menuIcon('scaleBody') },
    { id: 'counterbore', labelKey: 'counterbore', icon: menuIcon('counterbore') },
    { id: 'countersink', labelKey: 'countersink', icon: menuIcon('countersink') },
    { id: 'refPlane', labelKey: 'refPlane', icon: menuIcon('refPlane') },
    { id: 'parameter', labelKey: 'parameter', icon: menuIcon('parameter') },
    { id: 'coincidence', labelKey: 'coincidence', icon: menuIcon('coincidence') },
    { id: 'offsetMate', labelKey: 'offsetMate', icon: menuIcon('offsetMate') },
    { id: 'inertia', labelKey: 'inertia', icon: menuIcon('inertia') },
    { id: 'updatePart', labelKey: 'updatePart', icon: menuIcon('updatePart') },
    entry('xor'), entry('booleanFragments'), entry('compound'), entry('thickness'),
    entry('offset3d'), entry('crossSections'), entry('partArea'),
    entry('meshEvaluate'), entry('meshDecimate'), entry('meshRefine'), entry('meshHarmonize'),
    entry('meshFlip'), entry('meshScale'), entry('meshSmooth'), entry('meshFillHoles'),
    entry('meshSectionCmd')
  ]},
  { id: 'sketchMenu', labelKey: 'sketchMenu', items: [
    entry('sketchRect'), entry('sketchCircle'), entry('sketchPolygon'), entry('sketchRectConstrained'),
    entry('sketchSolve2d'), entry('sketchConstraintCheck'), entry('sketchDof'),
    entry('draftLine'), entry('draftWire'), entry('draftRect'), entry('draftPolygonWire'),
    entry('draftCircleWire'), entry('draftEllipseWire'), entry('draftArcWire'),
    entry('draftBSplineWire'), entry('draftBezierWire'), entry('draftFillet'), entry('draftOffset'),
    entry('draftTrimex'), entry('draftJoin'), entry('draftSplit'), entry('draftUpgrade'),
    entry('draftDowngrade'), entry('draftMove'), entry('draftRotate'), entry('draftScale'),
    entry('draftMirror'), entry('draftStretch'), entry('orthoArray'), entry('polarArray'),
    entry('circularArray'), entry('pathArray'), entry('pointArray'), entry('shapeStringCmd'),
    entry('draftDimension'), entry('draftText'), entry('wireToFace')
  ]},
  { id: 'surfaceMenu', labelKey: 'surfaceMenu', items: [
    entry('gsdExtrude'), entry('gsdRevolve'), entry('gsdSweep'), entry('gsdMultiSection'),
    entry('gsdFill'), entry('gsdBlend'), entry('gsdOffsetSurf'), entry('gsdJoin'), entry('gsdSplit'),
    entry('gsdBoundary'), entry('gsdHeal'), entry('gsdIso'), entry('gsdHelixCurve'),
    entry('gsdSpline'), entry('gsdConic'), entry('ruled'), entry('surfaceFill')
  ]},
  { id: 'assemblyMenu', labelKey: 'assemblyMenu', items: [
    entry('asmProduct'), entry('asmCoincident'), entry('asmOffset'), entry('asmAngle'),
    entry('asmContact'), entry('asmSolve'), entry('asmExplode'), entry('asmBom'),
    entry('asmInertia'), entry('asmMeasure'), entry('asmTree'),
    entry('dmuRevolute'), entry('dmuPrismatic'), entry('dmuSimulate'), entry('dmuDof'),
    entry('dmuClash'), entry('dmuEnvelope')
  ]},
  { id: 'annotateMenu', labelKey: 'annotateMenu', items: [
    entry('techdrawPage'), entry('techdrawSection'), entry('techdrawDetail'), entry('techdrawDim'),
    entry('techdrawHatch'), entry('techdrawBom'), entry('exportPageSvg'), entry('exportPageDxf')
  ]},
  { id: 'analyzeMenu', labelKey: 'analyzeMenu', items: [
    entry('femMesh'), entry('femMaterial'), entry('femConstraintFixed'), entry('femConstraintForce'),
    entry('femSolve'), entry('femBeamCmd'), entry('femTruss'), entry('femFrequency'), entry('femThermal'),
    entry('materialAssign'), entry('massProps'), entry('materialLibrary'),
    entry('measureDistanceCmd'), entry('measureAngleCmd'), entry('measureAreaCmd'),
    entry('measureVolumeCmd'), entry('measureBoxCmd'), entry('expressionEval'), entry('runMacro'),
    entry('kwFormula'), entry('kwRule'), entry('kwCheck'), entry('kwDesignTable'),
    entry('kwApplyTable'), entry('kwTree')
  ]},
  { id: 'manufactureMenu', labelKey: 'manufactureMenu', items: [
    entry('camProfile'), entry('camPocketOp'), entry('camDrill'), entry('camSurface'),
    entry('camHelix'), entry('camEngrave'), entry('camAdaptive'), entry('camPost'), entry('camStats'),
    entry('smWall'), entry('smFlange'), entry('smHem'), entry('smFolded'), entry('smUnfold'),
    entry('smCheck'), entry('smExportDxf')
  ]},
  { id: 'bimMenu', labelKey: 'bimMenu', items: [
    entry('bimWall'), entry('bimColumn'), entry('bimBeam'), entry('bimSlab'), entry('bimRoof'),
    entry('bimWindow'), entry('bimDoor'), entry('bimStairs'), entry('bimSpace'), entry('bimRailing'),
    entry('bimLevels'), entry('bimSchedule'), entry('bimExportIfc'), entry('bimFootprint')
  ]},
  { id: 'sketchupMenu', labelKey: 'sketchupMenu', items: [
    entry('suRectangleTool'), entry('suCircleTool'), entry('suPolygonTool'), entry('suArcTool'),
    entry('suFreehand'), entry('suPushPull'), entry('suFollowMe'), entry('suOffsetFace'),
    entry('suIntersect'), entry('suSoften'), entry('suMakeGroup'), entry('suExplode'),
    entry('suMakeComponent'), entry('suPlaceInstance'), entry('suTagAssign'), entry('suTagToggle'),
    entry('suPaint'), entry('suStyle'), entry('suShadows'), entry('suScene'), entry('suApplyScene'),
    entry('suSection'), entry('suSectionCut'), entry('suTape'), entry('suProtractor'),
    entry('suFaceInfo'), entry('suText3d'), entry('suMoveCopies'), entry('suRotateCopies'),
    entry('suSolidUnion'), entry('suSolidSubtract'), entry('suSolidTrim'), entry('suSolidSplit'),
    entry('suSolidIntersect'), entry('suOuterShell'), entry('suTerrain'), entry('suContours'),
    entry('suSmoove'), entry('suZoomExtents'), entry('suWalk'), entry('suOutliner')
  ]},
  { id: 'kernelMenu', labelKey: 'kernelMenu', items: [
    entry('brepInfo'), entry('brepChamfer'), entry('brepFillet'), entry('brepEdgesCmd'),
    entry('nurbsCurveCmd'), entry('nurbsCircleCmd'), entry('nurbsArcCmd'),
    entry('nurbsSurfaceCmd'), entry('nurbsExtrudeCmd'),
    entry('feaMeshCmd'), entry('feaSolveCmd'), entry('pythonRunCmd'),
    entry('addonListCmd'), entry('addonInstallCmd'), entry('addonToggleCmd'),
    entry('addonRunCmd'), entry('addonUninstallCmd')
  ]},
  { id: 'tools', labelKey: 'tools', items: [
    { id: 'select', labelKey: 'select', icon: menuIcon('select') },
    { id: 'measure', labelKey: 'measure', icon: menuIcon('measure') },
    { id: 'settings', labelKey: 'settings', icon: menuIcon('settings') }
  ]},
  { id: 'help', labelKey: 'help', items: [
    { id: 'usage', labelKey: 'usage', icon: menuIcon('usage') },
    entry('shortcuts'),
    entry('license'),
    entry('homepage'),
    { id: 'about', labelKey: 'about', icon: menuIcon('about') }
  ]}
]

export const TOOLBAR_GROUPS: string[][] = [
  ['new', 'open', 'save', 'export', 'print'],
  ['undo', 'redo'],
  ['select', 'box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'],
  ['delete', 'copy', 'paste'],
  ['front', 'top', 'iso', 'fit', 'resetView', 'grid', 'ruler']
]

/** Pinned to the right edge of the toolbar. */
export const TOOLBAR_RIGHT: string[] = ['toolPanel', 'propertyPanel', 'font-dec', 'font-value', 'font-inc', 'zoom-out', 'zoom-value', 'zoom-in', 'light', 'language', 'theme', 'settings', 'about']

export const TOOLBAR: readonly string[] = [...TOOLBAR_GROUPS.flat(), ...TOOLBAR_RIGHT]

export const CONTEXT_ITEMS: MenuEntry[] = [
  { id: 'copy', labelKey: 'copy', icon: menuIcon('copy') },
  { id: 'paste', labelKey: 'paste', icon: menuIcon('paste') },
  { id: 'duplicate', labelKey: 'duplicate', icon: menuIcon('duplicate') },
  { id: 'delete', labelKey: 'delete', icon: menuIcon('delete') },
  { id: 'hide', labelKey: 'hide', icon: menuIcon('hide') },
  { id: 'fit', labelKey: 'fit', icon: menuIcon('fit') }
]

export function menuIsSingleColumn(items: MenuEntry[]): boolean {
  return items.every((item) => item.icon.length > 0 && item.labelKey.length > 0)
}

// Workbench list: the FreeCAD set, the CATIA workbenches and SketchUp.
// `labelKey` is resolved through i18n first and labels.ts second.

export interface WorkbenchDef {
  id: string
  labelKey: string
  /** Command ids shown in the left tool panel. */
  tools: string[]
}

export const WORKBENCHES: WorkbenchDef[] = [
  { id: 'partDesign', labelKey: 'partDesign', tools: ['sketchRect', 'sketchCircle', 'sketchPolygon', 'pad', 'pocket', 'revolve', 'groove', 'loft', 'pipe', 'helix', 'fillet', 'chamfer', 'draft', 'shell', 'thickness', 'mirror', 'linearPattern', 'polarPattern', 'rectPattern', 'hole', 'counterbore', 'countersink', 'union', 'cut', 'common', 'xor', 'updatePart'] },
  { id: 'part', labelKey: 'part', tools: ['box', 'cylinder', 'sphere', 'cone', 'torus', 'plane', 'wedge', 'prism', 'ellipsoid', 'tubePrim', 'spiralPrim', 'ringPrim', 'pyramid', 'pad', 'revolve', 'loft', 'union', 'cut', 'common', 'xor', 'booleanFragments', 'compound', 'thickness', 'offset3d', 'ruled', 'crossSections', 'section', 'fillet', 'chamfer', 'partArea'] },
  { id: 'sketcher', labelKey: 'sketcher', tools: ['sketchRect', 'sketchCircle', 'sketchPolygon', 'sketchRectConstrained', 'sketchSolve2d', 'sketchConstraintCheck', 'sketchDof', 'solveConstraints', 'coincidence', 'offsetMate', 'parameter', 'measure'] },
  { id: 'draft', labelKey: 'draftWb', tools: ['draftLine', 'draftWire', 'draftRect', 'draftPolygonWire', 'draftCircleWire', 'draftEllipseWire', 'draftArcWire', 'draftBSplineWire', 'draftBezierWire', 'draftFillet', 'draftOffset', 'draftTrimex', 'draftJoin', 'draftSplit', 'draftUpgrade', 'draftDowngrade', 'draftMove', 'draftRotate', 'draftScale', 'draftMirror', 'draftStretch', 'orthoArray', 'polarArray', 'circularArray', 'pathArray', 'pointArray', 'shapeStringCmd', 'draftDimension', 'draftText', 'wireToFace'] },
  { id: 'techdraw', labelKey: 'techdraw', tools: ['techdrawPage', 'techdrawSection', 'techdrawDetail', 'techdrawDim', 'techdrawHatch', 'techdrawBom', 'exportPageSvg', 'exportPageDxf', 'front', 'top', 'iso', 'print'] },
  { id: 'mesh', labelKey: 'meshWb', tools: ['importStl', 'exportStl', 'exportObj', 'meshEvaluate', 'meshDecimate', 'meshRefine', 'meshHarmonize', 'meshFlip', 'meshScale', 'meshSmooth', 'meshFillHoles', 'meshSectionCmd', 'measure'] },
  { id: 'points', labelKey: 'pointsWb', tools: ['importPoints', 'pointsDownsample', 'measureBoxCmd', 'measure'] },
  { id: 'reverse', labelKey: 'reverseWb', tools: ['importPoints', 'fitPlaneCmd', 'fitSphereCmd', 'approxSurface', 'inspect'] },
  { id: 'surface', labelKey: 'surfaceWb', tools: ['surfaceFill', 'gsdFill', 'gsdBlend', 'gsdExtrude', 'gsdOffsetSurf', 'gsdJoin', 'gsdSplit', 'gsdBoundary', 'gsdHeal', 'loft', 'ruled'] },
  { id: 'spreadsheet', labelKey: 'spreadsheet', tools: ['sheetFill', 'sheetRecompute', 'sheetBindParams', 'sheetExportCsv', 'parameter', 'updatePart', 'expressionEval'] },
  { id: 'assembly', labelKey: 'assembly', tools: ['asmProduct', 'asmCoincident', 'asmOffset', 'asmAngle', 'asmContact', 'asmSolve', 'asmExplode', 'asmBom', 'asmInertia', 'asmMeasure', 'asmTree', 'coincidence', 'offsetMate', 'inertia'] },
  { id: 'fem', labelKey: 'fem', tools: ['femMesh', 'femMaterial', 'femConstraintFixed', 'femConstraintForce', 'femSolve', 'femBeamCmd', 'femTruss', 'femFrequency', 'femThermal', 'femCheck', 'femBar', 'feaMeshCmd', 'feaSolveCmd'] },
  { id: 'cam', labelKey: 'cam', tools: ['camProfile', 'camPocketOp', 'camDrill', 'camSurface', 'camHelix', 'camEngrave', 'camAdaptive', 'camPost', 'camStats', 'exportGcode', 'pocketPath'] },
  { id: 'bim', labelKey: 'bim', tools: ['bimWall', 'bimColumn', 'bimBeam', 'bimSlab', 'bimRoof', 'bimWindow', 'bimDoor', 'bimStairs', 'bimSpace', 'bimRailing', 'bimLevels', 'bimSchedule', 'bimExportIfc', 'bimFootprint', 'exportIfc'] },
  { id: 'material', labelKey: 'materialWb', tools: ['materialAssign', 'massProps', 'materialLibrary', 'inertia'] },
  { id: 'measureWb', labelKey: 'measureWb', tools: ['measureDistanceCmd', 'measureAngleCmd', 'measureAreaCmd', 'measureVolumeCmd', 'measureBoxCmd', 'measure'] },
  { id: 'inspection', labelKey: 'inspectionWb', tools: ['inspect', 'meshEvaluate', 'dmuClash', 'measureDistanceCmd'] },
  { id: 'robot', labelKey: 'robotWb', tools: ['robotPose', 'dmuRevolute', 'dmuPrismatic', 'dmuSimulate'] },
  { id: 'openscad', labelKey: 'openscadWb', tools: ['importOpenScad', 'union', 'cut', 'common', 'runMacro'] },
  { id: 'macro', labelKey: 'macroWb', tools: ['runMacro', 'pythonRunCmd', 'expressionEval', 'sheetRecompute', 'kwTree'] },
  { id: 'kernel', labelKey: 'kernelWb', tools: ['brepInfo', 'brepChamfer', 'brepFillet', 'brepEdgesCmd', 'nurbsCurveCmd', 'nurbsCircleCmd', 'nurbsArcCmd', 'nurbsSurfaceCmd', 'nurbsExtrudeCmd'] },
  { id: 'addons', labelKey: 'addonsWb', tools: ['addonListCmd', 'addonInstallCmd', 'addonToggleCmd', 'addonRunCmd', 'addonUninstallCmd'] },

  // ── CATIA ────────────────────────────────────────────────────────────────
  { id: 'gsd', labelKey: 'gsdWb', tools: ['gsdExtrude', 'gsdRevolve', 'gsdSweep', 'gsdMultiSection', 'gsdFill', 'gsdBlend', 'gsdOffsetSurf', 'gsdJoin', 'gsdSplit', 'gsdBoundary', 'gsdHeal', 'gsdIso', 'gsdHelixCurve', 'gsdSpline', 'gsdConic'] },
  { id: 'sheetMetal', labelKey: 'sheetMetalWb', tools: ['smWall', 'smFlange', 'smHem', 'smFolded', 'smUnfold', 'smCheck', 'smExportDxf'] },
  { id: 'kinematics', labelKey: 'kinematicsWb', tools: ['dmuRevolute', 'dmuPrismatic', 'dmuSimulate', 'dmuDof', 'dmuClash', 'dmuEnvelope'] },
  { id: 'knowledge', labelKey: 'knowledgeWb', tools: ['kwFormula', 'kwRule', 'kwCheck', 'kwDesignTable', 'kwApplyTable', 'kwTree', 'parameter', 'updatePart'] },
  { id: 'drafting', labelKey: 'draftingWb', tools: ['techdrawPage', 'techdrawSection', 'techdrawDetail', 'techdrawDim', 'techdrawHatch', 'techdrawBom', 'exportPageSvg', 'exportPageDxf', 'exportSvg', 'exportDxf'] },

  // ── SketchUp ─────────────────────────────────────────────────────────────
  { id: 'sketchup', labelKey: 'sketchupWb', tools: ['suRectangleTool', 'suCircleTool', 'suPolygonTool', 'suArcTool', 'suFreehand', 'suPushPull', 'suFollowMe', 'suOffsetFace', 'suIntersect', 'suSoften', 'suMakeGroup', 'suExplode', 'suMakeComponent', 'suPlaceInstance', 'suTagAssign', 'suTagToggle', 'suPaint', 'suStyle', 'suShadows', 'suScene', 'suApplyScene', 'suSection', 'suSectionCut', 'suTape', 'suProtractor', 'suFaceInfo', 'suText3d', 'suMoveCopies', 'suRotateCopies', 'suZoomExtents', 'suWalk', 'suOutliner'] },
  { id: 'solidTools', labelKey: 'sketchupWb', tools: ['suSolidUnion', 'suSolidSubtract', 'suSolidTrim', 'suSolidSplit', 'suSolidIntersect', 'suOuterShell'] },
  { id: 'sandbox', labelKey: 'sandboxWb', tools: ['suTerrain', 'suContours', 'suSmoove', 'meshSmooth', 'meshRefine'] }
]

export type WorkbenchId = string

export function workbenchTools(id: string): readonly string[] {
  return WORKBENCHES.find((item) => item.id === id)?.tools ?? WORKBENCHES[0].tools
}

export function workbenchIds(): string[] {
  return WORKBENCHES.map((workbench) => workbench.id)
}

export function sketchToGcode(width: number, height: number): string {
  const x = Math.abs(width) / 2
  const y = Math.abs(height) / 2
  return ['G21', 'G90', `G0 X${-x} Y${-y}`, `G1 X${x} Y${-y} F300`, `G1 X${x} Y${y}`, `G1 X${-x} Y${y}`, `G1 X${-x} Y${-y}`, 'M30'].join('\n')
}

export function femStress(area: number, force = 1000): number {
  if (area <= 0) return 0
  return force / area
}

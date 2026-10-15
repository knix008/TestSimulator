// Every FreeCAD command (freecad-commands.js) → the MyCAD command that does the
// same. A value is a MyCAD command id or a list of them (all must exist in the
// app), GROUP for a FreeCAD toolbar drop-down that only gathers other commands
// (covered when its members are), or { na: reason } for FreeCAD's developer
// self-tests of its own GUI. A command missing here is still to be done.
import { freecadCommandList } from './freecad-commands.js';
import { STD_FREECAD } from '../commands/std.js';
import { STD2_FREECAD } from '../commands/std2.js';
import { TEST_FREECAD } from '../commands/test.js';
import { PART_FREECAD } from '../commands/part.js';
import { PARTDESIGN_FREECAD } from '../commands/partdesign.js';
import { SKETCHER_FREECAD } from '../commands/sketcher.js';
import { DRAFT_FREECAD } from '../commands/draft.js';
import { MESH_FREECAD } from '../commands/mesh.js';
import { SHEET_FREECAD } from '../commands/sheet.js';
import { ASSEMBLY_FREECAD } from '../commands/assembly.js';
import { OPENSCAD_FREECAD } from '../commands/openscad.js';
import { CAMJOB_FREECAD } from '../commands/camjob.js';
import { FEMX_FREECAD } from '../commands/femx.js';
import { TECHDRAW_FREECAD } from '../commands/techdraw.js';
import { BIM_FREECAD } from '../commands/bim.js';

export const GROUP = 'group';

export const FREECAD_MAP = {
  // ── Std (every workbench)
  Std_About: 'about', Std_ActivateNextWindow: 'nextTab', Std_ActivatePrevWindow: 'prevTab', Std_AddonMgr: 'addons',
  Std_BoxSelection: 'tool:select', Std_CloseActiveWindow: 'closeTab', Std_CommandLine: 'console', Std_Copy: 'copy', Std_Cut: 'cut',
  Std_Delete: 'delete', Std_DlgMacroExecute: 'console', Std_DlgMacroExecuteDirect: 'console', Std_DlgMacroRecord: 'console',
  Std_DlgPreferences: 'settings', Std_DockViewMenu: ['leftPanel', 'rightPanel', 'problems'], Std_DrawStyle: 'view3dStyleMenu',
  Std_DuplicateSelection: 'duplicate', Std_Export: 'exportMenu', Std_Import: ['import3d', 'importDxf'], Std_Measure: 'tool:measure',
  Std_New: 'new', Std_OnlineHelp: 'tutorialDoc', Std_Open: 'open', Std_Paste: 'paste', Std_Placement: 'properties', Std_Print: 'print',
  Std_PrintPreview: 'print', Std_ProjectInfo: 'properties', Std_Properties: 'properties', Std_Quit: 'exit', Std_RecentFiles: 'recent',
  Std_Redo: 'redo', Std_Save: 'save', Std_SaveAll: 'saveAll', Std_SaveAs: 'saveAs', Std_SelectAll: 'selectAll', Std_Undo: 'undo',
  Std_ViewFitAll: 'zoomFit', Std_ViewLoadImage: 'background', Std_ViewScreenShot: 'exportPng', Std_ViewStatusBar: 'statusBar',
  Std_ViewZoomIn: 'zoomIn', Std_ViewZoomOut: 'zoomOut', Std_ViewGroup: GROUP, Std_LinkActions: GROUP, Std_LinkSelectActions: GROUP,
  Std_TreeViewActions: GROUP, Start_Start: 'startPage',
  Std_Test1: { na: 'FreeCAD GUI self-test' }, Std_Test2: { na: 'FreeCAD GUI self-test' }, Std_Test3: { na: 'FreeCAD GUI self-test' },
  Std_Test4: { na: 'FreeCAD GUI self-test' }, Std_Test5: { na: 'FreeCAD GUI self-test' }, Std_Test6: { na: 'FreeCAD GUI self-test' },
  Std_TestCmdFuncs: { na: 'FreeCAD GUI self-test' }, Std_TestConsoleOutput: { na: 'FreeCAD GUI self-test' },
  Std_TestProgress1: { na: 'FreeCAD GUI self-test' }, Std_TestProgress2: { na: 'FreeCAD GUI self-test' }, Std_TestProgress3: { na: 'FreeCAD GUI self-test' },
  Std_TestProgress4: { na: 'FreeCAD GUI self-test' }, Std_TestProgress5: { na: 'FreeCAD GUI self-test' }, Std_TestQM: { na: 'FreeCAD translation-file self-test' },
  Std_TestReloadQM: { na: 'FreeCAD translation-file self-test' }, Std_MDITest1: { na: 'FreeCAD GUI self-test' }, Std_MDITest2: { na: 'FreeCAD GUI self-test' },
  Std_MDITest3: { na: 'FreeCAD GUI self-test' }, Std_ViewExample1: { na: 'Open Inventor demo scene' }, Std_ViewExample2: { na: 'Open Inventor demo scene' },
  Std_ViewExample3: { na: 'Open Inventor demo scene' },
  Std_FreeCADDonation: { na: "FreeCAD's donation page (MyCAD has none)" },
  Std_MacroAttachDebugger: { na: 'a remote Python debugger (debugpy) needs native Python sockets; MyCAD runs Python in the browser (Pyodide)' },
  Std_MacroStartDebug: 'macroStartDebug', Std_MacroStepInto: 'macroStepInto', Std_MacroStepOver: 'macroStepOver', Std_MacroStopDebug: 'macroStopDebug', Std_ToggleBreakpoint: 'toggleBreakpoint',

  // ── Part
  Part_Box: 'solid:box', Part_Cylinder: 'solid:cylinder', Part_SimpleCylinder: 'solid:cylinder', Part_Sphere: 'solid:sphere', Part_Cone: 'solid:cone',
  Part_Torus: 'solid:torus', Part_Tube: 'solid:tube', Part_Primitives: ['solid:wedge', 'solid:prism', 'solid:ellipsoid', 'solid:helix'],
  Part_Boolean: ['bool:union', 'bool:cut', 'bool:common'], Part_Common: 'bool:common', Part_Cut: 'bool:cut', Part_Fuse: 'bool:union',
  Part_Chamfer: 'dress:chamfer', Part_Fillet: 'dress:fillet', Part_Thickness: 'dress:thickness', Part_Offset: 'dress:offset3d', Part_Offset2D: 'tool:offset',
  Part_CheckGeometry: 'checkGeometry', Part_Extrude: 'solid:pad', Part_Revolve: 'solid:revolution', Part_Loft: 'solid:loft', Part_Sweep: 'solid:sweep',
  Part_RuledSurface: 'solid:surfRuled', Part_Section: 'solidSection', Part_ExplodeCompound: 'explode', Part_Export: 'export3dMenu', Part_Import: 'import3d',
  Part_CompCompoundTools: GROUP, Part_CompJoinFeatures: GROUP, Part_CompOffset: GROUP, Part_CompSplitFeatures: GROUP, Part_Datums: GROUP,

  // ── PartDesign
  PartDesign_Pad: 'solid:pad', PartDesign_Pocket: 'solid:pocket', PartDesign_Revolution: 'solid:revolution', PartDesign_Groove: 'solid:groove',
  PartDesign_Hole: 'solid:hole', PartDesign_AdditiveLoft: 'solid:loft', PartDesign_AdditivePipe: 'solid:sweep', PartDesign_AdditiveHelix: 'solid:helix',
  PartDesign_Fillet: 'dress:fillet', PartDesign_Chamfer: 'dress:chamfer', PartDesign_Draft: 'dress:draft', PartDesign_Thickness: 'dress:thickness',
  PartDesign_Boolean: ['bool:union', 'bool:cut', 'bool:common'], PartDesign_InvoluteGear: 'part:gear', PartDesign_Sprocket: 'part:sprocket',
  PartDesign_WizardShaft: 'part:shaft', PartDesign_DuplicateSelection: 'duplicate', PartDesign_Clone: 'clone',
  PartDesign_CompDatums: GROUP, PartDesign_CompPrimitiveAdditive: GROUP, PartDesign_CompPrimitiveSubtractive: GROUP, PartDesign_CompSketches: GROUP,

  // ── Sketcher
  Sketcher_CreateLine: 'tool:line', Sketcher_CreatePolyline: 'tool:polyline', Sketcher_CreateRectangle: 'tool:rect', Sketcher_CreateCircle: 'tool:circle',
  Sketcher_Create3PointArc: 'tool:arc', Sketcher_CreateEllipseByCenter: 'tool:ellipse', Sketcher_CreateArcOfEllipse: 'tool:ellipseArc',
  Sketcher_CreateRegularPolygon: 'tool:polygon', Sketcher_CreateBSpline: 'tool:spline', Sketcher_CreatePoint: 'tool:point', Sketcher_CreateSlot: 'part:slot',
  Sketcher_CreateFillet: 'tool:fillet', Sketcher_CreateChamfer: 'tool:chamfer', Sketcher_Trimming: 'tool:trim', Sketcher_Extend: 'tool:extend',
  Sketcher_Offset: 'tool:offset', Sketcher_Move: 'tool:move', Sketcher_Copy: 'tool:copy', Sketcher_Rotate: 'tool:rotate', Sketcher_Scale: 'tool:scale',
  Sketcher_Symmetry: 'tool:mirror', Sketcher_RectangularArray: 'array', Sketcher_Clone: 'clone', Sketcher_ToggleConstruction: 'construction',
  Sketcher_CopyClipboard: 'copy', Sketcher_Cut: 'cut', Sketcher_Paste: 'paste', Sketcher_Grid: 'grid', Sketcher_Snap: 'snap',
  Sketcher_ConstrainCoincident: 'constrain:coincident', Sketcher_ConstrainCoincidentUnified: 'constrain:coincident',
  Sketcher_ConstrainHorizontal: 'constrain:horizontal', Sketcher_ConstrainVertical: 'constrain:vertical', Sketcher_ConstrainHorVer: ['constrain:horizontal', 'constrain:vertical'],
  Sketcher_ConstrainParallel: 'constrain:parallel', Sketcher_ConstrainPerpendicular: 'constrain:perpendicular', Sketcher_ConstrainEqual: 'constrain:equal',
  Sketcher_ConstrainTangent: 'constrain:tangent', Sketcher_ConstrainPointOnObject: 'constrain:pointOnObject', Sketcher_ConstrainSymmetric: 'constrain:symmetric',
  Sketcher_ConstrainLock: 'constrain:fixed', Sketcher_ConstrainDistance: 'constrain:distance', Sketcher_ConstrainDistanceX: 'constrain:distanceX',
  Sketcher_ConstrainDistanceY: 'constrain:distanceY', Sketcher_ConstrainRadius: 'constrain:radius', Sketcher_ConstrainDiameter: 'constrain:diameter',
  Sketcher_ConstrainRadiam: ['constrain:radius', 'constrain:diameter'], Sketcher_ConstrainAngle: 'constrain:angle',
  Sketcher_CompConstrainRadDia: GROUP, Sketcher_CompConstrainTools: GROUP, Sketcher_CompCopy: GROUP, Sketcher_CompCreateArc: GROUP, Sketcher_CompCreateBSpline: GROUP,
  Sketcher_CompCreateConic: GROUP, Sketcher_CompCreateFillets: GROUP, Sketcher_CompCreateRectangles: GROUP, Sketcher_CompCreateRegularPolygon: GROUP,
  Sketcher_CompCurveEdition: GROUP, Sketcher_CompDimensionTools: GROUP, Sketcher_CompExternal: GROUP, Sketcher_CompHorVer: GROUP, Sketcher_CompLine: GROUP,
  Sketcher_CompModifyKnotMultiplicity: GROUP, Sketcher_CompSlot: GROUP, Sketcher_CompToggleConstraints: GROUP, Sketcher_CompBSplineShowHideGeometryInformation: GROUP,

  // ── Draft
  Draft_Line: 'tool:line', Draft_Wire: 'tool:polyline', Draft_Rectangle: 'tool:rect', Draft_Circle: 'tool:circle', Draft_Arc_3Points: 'tool:arc',
  Draft_Ellipse: 'tool:ellipse', Draft_Polygon: 'tool:polygon', Draft_BSpline: 'tool:spline', Draft_Point: 'tool:point', Draft_Text: 'tool:text',
  Draft_Label: 'tool:leader', Draft_Hatch: 'tool:hatch', Draft_Dimension: ['tool:dimLinear', 'tool:dimAligned', 'tool:dimRadius', 'tool:dimDiameter', 'tool:dimAngle'],
  Draft_Move: 'tool:move', Draft_Rotate: 'tool:rotate', Draft_Scale: 'tool:scale', Draft_Mirror: 'tool:mirror', Draft_Offset: 'tool:offset',
  Draft_Trimex: ['tool:trim', 'tool:extend'], Draft_Fillet: 'tool:fillet', Draft_Clone: 'clone', Draft_OrthoArray: 'array', Draft_PolarArray: 'array',
  Draft_CircularArray: 'array', Draft_SelectPlane: 'tool:workPlane', Draft_ToggleGrid: 'grid', Draft_ToggleConstructionMode: 'construction',
  Draft_Layer: 'addLayer', Draft_Snap_Grid: 'snapGrid', Draft_Snap_Ortho: 'ortho', Draft_Snap_Lock: 'snap', Draft_Shape2DView: 'solidProject',
  Draft_ArcTools: GROUP, Draft_ArrayTools: GROUP, Draft_BezierTools: GROUP,

  // ── TechDraw
  TechDraw_LengthDimension: 'tool:dimAligned', TechDraw_HorizontalDimension: 'tool:dimLinear', TechDraw_VerticalDimension: 'tool:dimLinear',
  TechDraw_RadiusDimension: 'tool:dimRadius', TechDraw_DiameterDimension: 'tool:dimDiameter', TechDraw_AngleDimension: 'tool:dimAngle',
  TechDraw_Dimension: ['tool:dimLinear', 'tool:dimAligned', 'tool:dimRadius', 'tool:dimDiameter', 'tool:dimAngle'], TechDraw_Balloon: 'tool:balloon',
  TechDraw_LeaderLine: 'tool:leader', TechDraw_Annotation: 'tool:text', TechDraw_ProjectionGroup: 'solidProject', TechDraw_View: 'solidProject',
  TechDraw_SectionView: 'solidSection', TechDraw_ExportPageDXF: 'exportDxf', TechDraw_ExportPageSVG: 'exportSvg', TechDraw_PrintAll: 'print',
  TechDraw_PageDefault: 'new', TechDraw_Image: 'background', TechDraw_2PointCenterLine: 'tool:centerline',
  TechDraw_CenterLineGroup: GROUP, TechDraw_CompDimensionTools: GROUP, TechDraw_CosmeticVertexGroup: GROUP, TechDraw_ExtentGroup: GROUP,
  TechDraw_StackGroup: GROUP, TechDraw_ExtensionCascadeDimensionGroup: GROUP, TechDraw_ExtensionChamferDimensionGroup: GROUP,
  TechDraw_ExtensionCircleCenterLinesGroup: GROUP, TechDraw_ExtensionCreateChainDimensionGroup: GROUP, TechDraw_ExtensionCreateCoordDimensionGroup: GROUP,
  TechDraw_ExtensionDrawCirclesGroup: GROUP, TechDraw_ExtensionExtendShortenLineGroup: GROUP, TechDraw_ExtensionIncreaseDecreaseGroup: GROUP,
  TechDraw_ExtensionInsertPrefixGroup: GROUP, TechDraw_ExtensionLinePPGroup: GROUP, TechDraw_ExtensionPosChainDimensionGroup: GROUP,
  TechDraw_ExtensionThreadsGroup: GROUP, TechDraw_SectionGroup: GROUP, TechDraw_CommandVertexCreationGroup: GROUP,

  // ── BIM (Arch, BIM, IFC)
  Arch_Wall: 'arch:wall', Arch_CurtainWall: 'arch:curtainwall', Arch_Window: 'arch:window', BIM_Door: 'arch:door', Arch_Structure: ['arch:column', 'arch:beam'],
  BIM_Column: 'arch:column', BIM_Beam: 'arch:beam', BIM_Slab: 'arch:slab', Arch_Roof: 'arch:roof', Arch_Stairs: 'arch:stairs', Arch_Space: 'arch:space',
  Arch_Equipment: 'arch:equipment', Arch_Axis: 'arch:axis', Arch_Rebar: 'arch:rebar', Arch_Truss: 'arch:truss', Arch_Pipe: 'arch:pipe', Arch_Panel: 'arch:panel',
  Arch_Fence: 'arch:railing', Arch_Schedule: 'archSchedule', Arch_Nest: 'panelNest', Arch_Panel_Sheet: 'panelNest', Arch_Building: 'bimManager',
  Arch_Level: 'bimManager', Arch_Site: 'bimManager', Arch_Material: 'bimManager', Arch_MultiMaterial: 'bimManager', Arch_SectionPlane: 'solidSection',
  BIM_Box: 'solid:box', BIM_Clone: 'clone', BIM_Copy: 'tool:copy', BIM_Common: 'bool:common', BIM_Cut: 'bool:cut', BIM_Fuse: 'bool:union',
  BIM_Extrude: 'solid:pad', BIM_Offset2D: 'tool:offset', BIM_Leader: 'tool:leader', BIM_Text: 'tool:text', BIM_DimensionAligned: 'tool:dimAligned',
  BIM_DimensionHorizontal: 'tool:dimLinear', BIM_DimensionVertical: 'tool:dimLinear', BIM_Unclone: 'unlinkClone', BIM_Layers: 'addLayer',
  BIM_Background: 'background', BIM_Shape2DView: 'solidProject', BIM_Shape2DCut: 'solidSection', BIM_Create2DViews: 'solidProject',
  BIM_Windows: 'arch:window', BIM_Tutorial: 'tutorial', BIM_Help: 'tutorialDoc', BIM_Welcome: 'startPage', IFC_Save: 'export3d:ifc', IFC_SaveAs: 'export3d:ifc',
  Arch_AxisTools: GROUP, Arch_MaterialTools: GROUP, Arch_PanelTools: GROUP, Arch_PipeTools: GROUP, Arch_StructureTools: GROUP, BIM_GenericTools: GROUP,

  // ── Assembly
  Assembly_CreateJointFixed: 'joint:fixed', Assembly_CreateJointRevolute: 'joint:revolute', Assembly_CreateJointSlider: 'joint:slider',
  Assembly_CreateJointCylindrical: 'joint:cylindrical', Assembly_CreateSimulation: 'assembly:animate',

  // ── Mesh / Points / Reverse engineering / Surface
  Mesh_Decimating: 'meshDecimate', Mesh_Evaluation: 'meshRepair', Mesh_EvaluateSolid: 'checkGeometry', Mesh_Export: 'export3dMenu', Mesh_Import: 'import3d',
  Mesh_FillupHoles: 'meshRepair', Mesh_HarmonizeNormals: 'meshRepair', Mesh_RemoveComponents: 'meshRepair', Mesh_Union: 'bool:union', Mesh_Difference: 'bool:cut',
  Mesh_Intersection: 'bool:common', Mesh_SectionByPlane: 'solidSection', MeshPart_SectionByPlane: 'solidSection',
  Points_Import: 'import3d', Points_Export: 'export3d:xyz', Reen_ApproxPlane: 're:plane', Reen_ApproxSphere: 're:sphere', Reen_ApproxCylinder: 're:cylinder',
  Reen_ViewTriangulation: 're:mesh', Surface_Filling: 'solid:surfFill', Surface_Sections: 'solid:surfRuled', Surface_GeomFillSurface: 'solid:surfFill',

  // ── Robot / CAM / FEM / Spreadsheet / OpenSCAD
  Robot_Create: 'robot:add', Robot_CreateTrajectory: 'robot:path', Robot_ExportKukaFull: 'robot:path', Robot_ExportKukaCompact: 'robot:path',
  Robot_Simulate: 'robot:path', Robot_InsertWaypoint: 'robot:moveTo', Robot_InsertWaypointPreselect: 'robot:moveTo',
  CAM_Job: 'cam', CAM_Profile: 'cam', CAM_Pocket_Shape: 'cam', CAM_Drilling: 'cam', CAM_Engrave: 'cam', CAM_Pocket3D: 'cam', CAM_Post: 'cam',
  CAM_SimulatorGL: 'cam', CAM_Simulator: 'cam', CAM_EngraveTools: GROUP, CAM_DressupTools: GROUP, CAM_SimTools: GROUP,
  FEM_Analysis: ['fem', 'femPlate', 'fem3d'], FEM_ConstraintFixed: ['fem', 'femPlate', 'fem3d'], FEM_ConstraintForce: ['fem', 'femPlate', 'fem3d'],
  FEM_ConstraintSelfWeight: 'fem3d', FEM_MaterialSolid: ['fem', 'femPlate', 'fem3d'], FEM_SolverCalculiX: 'fem3d', FEM_SolverCalculiXCcxTools: 'fem3d',
  FEM_SolverRun: ['fem', 'femPlate', 'fem3d'], FEM_ResultShow: ['fem', 'femPlate', 'fem3d'], FEM_ElementGeometry1D: 'fem', FEM_ElementGeometry2D: 'femPlate',
  FEM_EquationElasticity: 'fem3d', FEM_CompMechEquations: GROUP, FEM_CompEmConstraints: GROUP, FEM_CompEmEquations: GROUP,
  Spreadsheet_CreateSheet: 'spreadsheet', Spreadsheet_SetAlias: 'spreadsheet', OpenSCAD_AddOpenSCADElement: 'export3d:scad',
};

// The workbench modules name their own FreeCAD commands.
Object.assign(FREECAD_MAP, STD_FREECAD, STD2_FREECAD, TEST_FREECAD, PART_FREECAD, PARTDESIGN_FREECAD, SKETCHER_FREECAD, DRAFT_FREECAD, MESH_FREECAD, SHEET_FREECAD, ASSEMBLY_FREECAD, OPENSCAD_FREECAD, CAMJOB_FREECAD, FEMX_FREECAD, TECHDRAW_FREECAD, BIM_FREECAD);

/** The coverage of every FreeCAD command: { name, menu, workbench, status: done|group|na|todo, commands }. */
export function freecadCoverage(map = FREECAD_MAP) {
  return freecadCommandList().map((command) => {
    const value = map[command.name];
    if (value === GROUP) return { ...command, status: 'group', commands: [] };
    if (value && typeof value === 'object' && !Array.isArray(value)) return { ...command, status: 'na', reason: value.na, commands: [] };
    if (!value) return { ...command, status: 'todo', commands: [] };
    return { ...command, status: 'done', commands: Array.isArray(value) ? value : [value] };
  });
}

/** Totals: done (incl. groups and n/a) and to do, overall and per workbench. */
export function freecadTotals(list = freecadCoverage()) {
  const sum = (items) => ({ total: items.length, done: items.filter((c) => c.status !== 'todo').length, todo: items.filter((c) => c.status === 'todo').length });
  const byWorkbench = {};
  for (const item of list) (byWorkbench[item.workbench] ??= []).push(item);
  return { ...sum(list), workbenches: Object.fromEntries(Object.entries(byWorkbench).map(([wb, items]) => [wb, sum(items)])) };
}

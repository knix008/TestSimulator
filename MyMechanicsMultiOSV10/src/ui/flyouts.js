// CommandManager flyouts: commands that do the same job (all the fillets, all the patterns, every rectangle tool …)
// share one button — the one used last, the first at the start — with a ▾ that lists the family. Applied to the
// finished tab lists (after every module has added its commands): the first member of a family present in a tab
// becomes `fly:<key>` and the others leave that tab; a family with only one member in a tab stays a plain button.
// Commands the toolbar always shows, and those another tab already has, leave the tabs (DUPLICATES).

/** Families, in the order their members are listed (the first is the button at the start). */
export const FLYOUTS = {
  sketchKind: ['sketch', 'sketch3d'],
  boss: ['extrude', 'revolve', 'sweep', 'loft'],
  cut: ['cutExtrude', 'cutRevolve', 'cutSweep', 'cutLoft'],
  fillet: ['fillet', 'variableFillet', 'faceFillet', 'fullRoundFillet', 'chamfer'],
  hole: ['hole', 'advancedHole', 'thread'],
  shapeFeat: ['draft', 'rib', 'dome', 'wrap'],
  pattern: ['linearPattern', 'circularPattern', 'curvePattern', 'sketchPattern', 'tablePattern', 'fillPattern', 'variablePattern'],
  refGeom: ['refPlane', 'refAxis', 'refPoint', 'coordSys', 'boundingBox', 'mateReference', 'connectionPoint'],
  curves: ['helix', 'projectedCurve', 'splitLine', 'compositeCurve', 'curveXYZ'],
  bodyOps: ['moveBody', 'split', 'combine', 'intersect', 'deleteBody', 'saveBodies', 'insertPart'],
  deformOps: ['indent', 'flex', 'deform', 'freeform'],
  fastening: ['mountingBoss', 'snapHook', 'snapHookGroove', 'vent', 'lipGroove'],
  extRefs: ['exitInContext', 'updateExternalRefs', 'externalRefs'],
  library: ['libSave', 'libInsert'],
  // Sketch
  skLine: ['sk:line', 'sk:centerline'],
  skRect: ['sk:rect', 'sk:centerRect', 'sk:rect3', 'sk:rect3c', 'sk:parallelogram'],
  skCircle: ['sk:circle', 'sk:circle3'],
  skArc: ['sk:centerArc', 'sk:arc3', 'sk:tangentArc'],
  skSlot: ['sk:slot', 'sk:slotCenter', 'sk:slotArc3', 'sk:slotArcCenter'],
  skSpline: ['sk:spline', 'sk:styleSpline', 'sk:equation'],
  skConic: ['sk:ellipse', 'sk:partialEllipse', 'sk:parabola', 'sk:conic'],
  skPointText: ['sk:point', 'sk:text', 'sk:picture'],
  skCorner: ['sk:fillet', 'sk:chamfer'],
  skMirror: ['sk:mirror', 'sk:dynamicMirror'],
  skPattern: ['sk:linPattern', 'sk:cirPattern'],
  skTrim: ['sk:trim', 'sk:extend', 'sk:split'],
  skConvert: ['sk:convert', 'sk:intersect', 'sk:silhouette', 'sk:silhouetteInternal'],
  skMove: ['sk:move', 'sk:copy', 'sk:rotate', 'sk:scale', 'sk:stretch'],
  skDim: ['sk:dimension', 'sk:baselineDim', 'sk:fullyDefine'],
  skRepair: ['sk:repair', 'sk:autotrace'],
  skBlock: ['sk:makeBlock', 'sk:insertBlock', 'sk:explodeBlock'],
  // Surfaces
  surfCreate: ['surfaceExtrude', 'surfaceRevolve', 'surfaceSweep', 'surfaceLoft', 'surfacePlanar', 'boundary', 'fillSurface', 'surfaceOffset', 'ruledSurface', 'radiateSurface', 'midSurface'],
  surfEdit: ['trimSurface', 'untrimSurface', 'extendSurface', 'knit', 'surfaceFillet', 'deleteHole', 'cutWithSurface', 'flattenSurface'],
  faceEdit: ['moveFace', 'deleteFace', 'replaceFace'],
  scan: ['scanToSolid', 'recognizeFeatures'],
  // Sheet metal
  smConvert: ['convertSheet', 'insertBends'],
  smFlange: ['edgeFlange', 'miterFlange', 'hem', 'tab', 'loftedBend', 'sketchedBend', 'jog'],
  smCorner: ['closedCorner', 'weldedCorner', 'cornerRelief'],
  smCut: ['rip', 'crossBreak', 'tabSlot', 'formTool'],
  smFold: ['flatten', 'unfold', 'fold'],
  // Weldments
  wdMember: ['trimExtend', 'endCap', 'gusset'],
  // Mould tools
  moldAnalysis: ['draftAnalysis', 'eval_undercut'],
  moldSplit: ['partingLine', 'partingSurface', 'shutOff', 'toolingSplit', 'sideCore'],
  // Evaluate
  measureFly: ['measure', 'sectionProperties'],
  displayAnalysis: ['curvature', 'zebraStripes', 'thicknessAnalysis'],
  modelChecks: ['designCheck', 'eval_geometry', 'eval_deviation', 'eval_symmetry', 'eval_compare'],
  costSustain: ['eval_costing', 'eval_sustain'],
  studies: ['simulation', 'nonlinearStudy', 'dynamicStudy', 'dropTest', 'loadCombination', 'topologyStudy', 'flowStudy', 'electronicsCooling', 'freeSurface', 'assemblySimulation', 'designStudy'],
  params: ['equations', 'configurations', 'designTable', 'importTable'],
  mbd: ['mbdAnnotations', 'mbdAutoDimension', 'insertModelAnnotations'],
  presentation: ['renderView', 'walkthrough', 'recordVideo'],
  // Assembly
  inContext: ['newPartInContext', 'editInContext', 'openPart'],
  layout: ['newLayout', 'makePartFromBlock', 'updateLayout'],
  mates: ['mate', 'smartMate', 'magneticSnap'],
  fixFloat: ['fixComponent', 'floatComponent', 'flexibleComponent'],
  moveComp: ['moveComponent', 'rotateComponent', 'rotateComponentX', 'rotateComponentY'],
  compPattern: ['linearComponentPattern', 'circularComponentPattern', 'featureDrivenComponentPattern', 'sketchDrivenComponentPattern', 'curveDrivenComponentPattern', 'chainComponentPattern', 'mirrorComponents'],
  explodeFly: ['explode', 'explodeEditor', 'explodeAnimate', 'resetExplode'],
  illus: ['illustration', 'ilAddView', 'ilPlay', 'ilExportHtml'],
  asmVis: ['assemblyVisualization', 'assemblyVisualizationOff'],
  simplify: ['largeAssemblyMode', 'simplifyOuter', 'simplifyBox', 'simplifyFull'],
  asmFeat: ['asmCut', 'asmHole', 'asmWeldBead', 'beltChain'],
  compTools: ['replaceComponent', 'copyWithMates'],
  asmChecks: ['interference', 'clearanceCheck', 'holeAlignment'],
  envelope: ['envelopeComponent', 'envelopeSelectInside', 'envelopeSelectCrossing'],
  // Drawing
  drwViews: ['std3View', 'addView', 'relativeView', 'view3dDrawing', 'flatPatternView', 'alternatePositionView'],
  drwDerived: ['sectionView', 'alignedSection', 'removedSection', 'detailView', 'auxView', 'brokenOutSection', 'breakView', 'cropView'],
  drwDims: ['drwSmartDim', 'autoDims', 'drwModelItems', 'drwHoleCallout'],
  drwNotes: ['ann:note', 'ann:balloon', 'drwAutoBalloon', 'ann:centermark', 'drwCenterMarks', 'ann:cloud', 'ann:hatch', 'drwWeld'],
  drwGdt: ['ann:gdt', 'ann:datum', 'ann:datumTarget', 'ann:surface'],
  drwTables: ['bom', 'holeTable', 'revisionTable', 'weldTable', 'cutListTable', 'bendTable', 'drwTable'],
  drwSheets: ['addSheet', 'renameSheet', 'deleteSheet', 'drwSheetFormat', 'drwTitleBlock', 'drwLayers'],
  drwExport: ['exportDxf', 'exportDwg', 'exportSvg'],
  // Standard parts and routing
  stdParts: ['stdLibrary', 'smartFastener'],
  routes: ['pipeRoute', 'tubeRoute', 'cableRoute', 'harnessRoute'],
  routeDocs: ['harnessDrawing', 'pipeIso'],
  // CAM
  camSetup: ['camManager', 'camStock', 'camTools'],
  camAuto: ['camRecognize', 'camPlan'],
  cam25: ['camFacing', 'camPocket', 'camAdaptive', 'camContour', 'camSlot', 'camHelix'],
  camHoles: ['camSpot', 'camDrill', 'camPeck', 'camTap'],
  cam3d: ['camZLevel', 'camParallel', 'camScallop', 'camWaterline'],
  camMulti: ['camRotary4', 'camMulti5', 'camMillTurnAxial', 'camMillTurnRadial'],
  camTurn: ['camTurnFace', 'camTurnRough', 'camTurnFinish', 'camTurnBore', 'camTurnGroove', 'camTurnThread'],
  camOut: ['camPost', 'camSetupSheet'],
  // Plastics
  plSetup: ['plasticsStudy', 'plGate', 'plSuggest'],
  plResults: ['plFillTime', 'plPressure', 'plTemperature', 'plWeld', 'plAirTraps', 'plSink'],
  plMore: ['plFiber', 'plCooling', 'plWarp'],
  // Inspection
  inspEdit: ['inspBalloon', 'inspRenumber', 'inspClear'],
  inspOut: ['inspCsv', 'inspExcel', 'inspReport'],
};

/**
 * Commands that leave the tabs: the toolbar always has them (rebuild, mass properties, section view, lights, normal
 * to, print, the views), or they belong to the File menu (version history), or another tab is their home.
 */
export const DUPLICATES = {
  '*': ['rebuild', 'massProps', 'section', 'lights', 'normalTo', 'print', 'versionHistory', 'newDrawing'],
  sheetMetal: ['hole', 'cutExtrude'],
  weldments: ['sketch', 'sketch3d'],
  surfaces: ['sketch3d', 'moveFace'],
  mold: ['draft', 'split'],
  evaluate: ['draftAnalysis', 'interference'],
  features: ['mbdAnnotations'],
};

/** Family key of every command. */
export const FLY_OF = new Map(Object.entries(FLYOUTS).flatMap(([key, ids]) => ids.map((id) => [id, key])));

/**
 * Tab lists with the duplicates gone and the families folded into flyouts (`fly:<key>`): a family lives in the first
 * tab (in `order`) that has any of its members — its flyout lists the members of every tab — and leaves the others.
 * → { tabs: { tab: ids }, members: { key: ids } }. `has(id)` says whether a command exists.
 */
export function groupTabs(tabs, has = () => true, order = Object.keys(tabs)) {
  const dropOf = (tab) => new Set([...(DUPLICATES['*'] ?? []), ...(DUPLICATES[tab] ?? [])]);
  const members = {}; const home = {};
  for (const tab of order) {
    const drop = dropOf(tab);
    for (const id of tabs[tab] ?? []) {
      const k = FLY_OF.get(id);
      if (!k || id === '|' || drop.has(id) || !has(id)) continue;
      home[k] ??= tab;
      members[k] ??= [];
      if (!members[k].includes(id)) members[k].push(id);
    }
  }
  for (const k of Object.keys(members)) members[k] = FLYOUTS[k].filter((id) => members[k].includes(id));
  const out = {};
  for (const tab of Object.keys(tabs)) {
    const drop = dropOf(tab); const seen = new Set(); const placed = new Set(); const list = [];
    for (const id of tabs[tab]) {
      if (id === '|') { if (list.length && list.at(-1) !== '|') list.push('|'); continue; }
      if (drop.has(id) || seen.has(id) || !has(id)) continue;
      seen.add(id);
      const k = FLY_OF.get(id);
      if (k && members[k]) {
        if (home[k] !== tab) continue; // its family lives in another tab
        if (members[k].length > 1) { if (!placed.has(k)) { placed.add(k); list.push(`fly:${k}`); } continue; }
      }
      list.push(id);
    }
    while (list.at(-1) === '|') list.pop();
    out[tab] = list;
  }
  return { tabs: out, members };
}

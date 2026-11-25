// The new part features' type names, defaults, base names and icons (no imports: features.js and the UI
// read them while the modules load).
/** Fastening features (fastening.js): mounting boss, snap hook and its groove, vent, lip / groove. */
export const FASTENING_TYPES = ['mountingBoss', 'snapHook', 'snapHookGroove', 'vent', 'lipGroove'];

export const FASTENING_DEFAULTS = {
  mountingBoss: () => ({ face: null, pointRef: null, x: 0, y: 0, z: 0, atCenter: true, reverse: false, height: 12, od: 8, draft: 1, kind: 'hole', id: 3.5, holeDepth: 10, holeDraft: 0, through: false, pinDiameter: 3, pinHeight: 4, fins: 4, finLength: 5, finThickness: 1.5, finHeight: 8, finAngle: 45, finShape: 'triangle' }),
  snapHook: () => ({ face: null, pointRef: null, x: 0, y: 0, z: 0, atCenter: true, reverse: false, angle: 0, height: 15, width: 6, thickness: 1.5, lipDepth: 1.2, lipHeight: 3, insertAngle: 30 }),
  snapHookGroove: () => ({ hook: null, body: 1, clearance: 0.2 }),
  vent: () => ({ sketch: null, ribWidth: 1.5, sparWidth: 1.5 }),
  lipGroove: () => ({ face: null, kind: 'lip', side: 'inner', width: 1, height: 1.5, clearance: 0 }),
};

export const FASTENING_NAMES = { mountingBoss: 'Mounting Boss', snapHook: 'Snap Hook', snapHookGroove: 'Snap Hook Groove', vent: 'Vent', lipGroove: 'Lip/Groove' };
export const FASTENING_ICONS = { mountingBoss: 'mountingBoss', snapHook: 'snapHook', snapHookGroove: 'snapHookGroove', vent: 'vent', lipGroove: 'lipGroove' };

/** More surface features (surface-more.js). */
export const SURFACE_MORE_TYPES = ['surfaceSweep', 'cutWithSurface', 'deleteHole', 'untrimSurface', 'midSurface', 'radiateSurface', 'flattenSurface'];
export const SURFACE_MORE_DEFAULTS = {
  surfaceSweep: () => ({ sketch: null, path: null, frenet: false, transition: 'right' }),
  cutWithSurface: () => ({ surface: null, flip: false }),
  deleteHole: () => ({ surface: null, edges: [] }),
  untrimSurface: () => ({ surface: null, mode: 'natural' }),
  midSurface: () => ({ faces: [], maxThickness: 10 }),
  radiateSurface: () => ({ edges: [], plane: 'std:top', distance: 5, flip: false }),
  flattenSurface: () => ({ surface: null, face: null }),
};
export const SURFACE_MORE_NAMES = { surfaceSweep: 'Surface-Sweep', cutWithSurface: 'SurfaceCut', deleteHole: 'Delete Hole', untrimSurface: 'Surface-Untrim', midSurface: 'Surface-Mid', radiateSurface: 'Radiate Surface', flattenSurface: 'Surface-Flatten' };
export const SURFACE_MORE_ICONS = { surfaceSweep: 'surfaceSweep', cutWithSurface: 'cutWithSurface', deleteHole: 'deleteHole', untrimSurface: 'untrimSurface', midSurface: 'midSurface', radiateSurface: 'radiateSurface', flattenSurface: 'flattenSurface' };

/** More sheet metal (sheet-extra.js): convert / insert bends, rip, unfold / fold, cross break, welded corner, tab and slot. */
export const SHEET_EXTRA_TYPES = ['convertSheet', 'insertBends', 'rip', 'unfold', 'fold', 'crossBreak', 'weldedCorner', 'tabSlot'];
export const SHEET_EXTRA_DEFAULTS = {
  convertSheet: () => ({ face: null, edges: [], thickness: 2, radius: 2, kFactor: 0.44, side: 'inside', corner: 'overlap', gap: 0.2 }),
  insertBends: () => ({ face: null, radius: 2, kFactor: 0.44, corner: 'overlap', gap: 0.1 }),
  rip: () => ({ edges: [], gap: 0.1, direction: 'both' }),
  unfold: () => ({}),
  fold: () => ({}),
  crossBreak: () => ({ face: null, radius: 100, angle: 2, direction: 'up' }),
  weldedCorner: () => ({ flanges: [], flangeA: null, flangeB: null }),
  tabSlot: () => ({ edge: null, face: null, count: 2, length: 10, height: 0, clearance: 0.1, offset: 0 }),
};
export const SHEET_EXTRA_NAMES = { convertSheet: 'Convert-Sheet', insertBends: 'Insert-Bends', rip: 'Rip', unfold: 'Unfold', fold: 'Fold', crossBreak: 'Cross-Break', weldedCorner: 'Welded Corner', tabSlot: 'Tab and Slot' };
export const SHEET_EXTRA_ICONS = { convertSheet: 'convertSheet', insertBends: 'insertBends', rip: 'rip', unfold: 'unfold', fold: 'fold', crossBreak: 'crossBreak', weldedCorner: 'weldedCorner', tabSlot: 'tabSlot' };

/** More part features (part-extra.js): advanced hole, intersect, mate reference. */
export const PART_EXTRA_TYPES = ['advancedHole', 'intersect', 'mateReference', 'moveFace', 'connectionPoint'];
export const PART_EXTRA_DEFAULTS = {
  advancedHole: () => ({ sketch: null, reverse: false, near: [{ kind: 'counterbore', d: 11, depth: 6.5 }, { kind: 'straight', d: 6.6, depth: 0 }], far: [] }),
  intersect: () => ({ bodies: true, surfaces: [], planes: [], exclude: [], merge: true, consume: true }),
  moveFace: () => ({ faces: [], mode: 'offset', distance: 2, direction: { kind: 'axis', axis: 'z' }, axis: { kind: 'axis', axis: 'x' }, angle: 10 }),
  connectionPoint: () => ({ face: null, cpName: 'Connector', offset: 0, flip: false }),
  mateReference: () => ({ refName: 'Default', primary: null, primaryType: 'default', primaryAlign: 'any', secondary: null, secondaryType: 'default', secondaryAlign: 'any', tertiary: null, tertiaryType: 'default', tertiaryAlign: 'any' }),
};
export const PART_EXTRA_NAMES = { advancedHole: 'Advanced Hole', intersect: 'Intersect', mateReference: 'MateReference', moveFace: 'Move Face', connectionPoint: 'Connection Point' };
export const PART_EXTRA_ICONS = { advancedHole: 'advancedHole', intersect: 'intersectRegions', mateReference: 'mateReference', moveFace: 'moveFace', connectionPoint: 'connectionPoint' };

export const PART_MORE_TYPES = [
  'combine', 'deleteBody', 'indent', 'flex', 'deform',
  'refAxis', 'refPoint', 'coordSys', 'boundingBox',
  'variableFillet', 'faceFillet', 'fullRoundFillet',
  'curvePattern', 'sketchPattern', 'tablePattern', 'fillPattern', 'variablePattern',
  'projectedCurve', 'splitLine', 'compositeCurve', 'curveXYZ', 'surfaceSpline',
  'openscad',
  ...FASTENING_TYPES,
  ...SURFACE_MORE_TYPES,
  ...SHEET_EXTRA_TYPES,
  ...PART_EXTRA_TYPES,
];

/** The program a new OpenSCAD feature starts with (a parametric plate with a hole, Customizer ranges). */
export const SCAD_DEFAULT_SOURCE = `// OpenSCAD — edit, then press OK
width = 40;  // [10:100]
height = 10; // [2:50]
hole = 12;   // [0:30]

difference() {
  cube([width, width, height], center = true);
  cylinder(h = height + 2, d = hole, center = true, $fn = 64);
}
`;

export const PART_MORE_DEFAULTS = {
  combine: () => ({ op: 'add', main: 0, bodies: [] }),
  deleteBody: () => ({ mode: 'delete', bodies: [] }),
  indent: () => ({ target: 0, toolBody: 1, thickness: 1, clearance: 0, keepTool: true }),
  flex: () => ({ mode: 'bend', axis: 'x', toward: 'z', angle: 90, factor: 0.5, stretch: 20 }),
  deform: () => ({ x: 0, y: 0, z: 0, pointRef: null, dir: 'z', amount: 5, radius: 30 }),
  refAxis: () => ({ kind: 'std', axis: 'z', x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 10, edge: null, face: null, planeA: 'std:front', planeB: 'std:right' }),
  refPoint: () => ({ kind: 'coords', x: 0, y: 0, z: 0, face: null, edge: null, at: 0.5 }),
  coordSys: () => ({ x: 0, y: 0, z: 0, pointRef: null, rx: 0, ry: 0, rz: 0 }),
  boundingBox: () => ({ mode: 'bestFit', plane: 'std:top' }),
  variableFillet: () => ({ edges: [], r1: 2, r2: 5 }),
  faceFillet: () => ({ faces: [], radius: 2 }),
  fullRoundFillet: () => ({ faces: [] }),
  curvePattern: () => ({ seeds: [], curve: null, count: 4, equal: true, spacing: 15, align: false }),
  sketchPattern: () => ({ seeds: [], sketch: null }),
  tablePattern: () => ({ seeds: [], points: [[30, 0, 0], [0, -30, 0]], cs: null }),
  fillPattern: () => ({ seeds: [], face: null, spacing: 15, margin: 3, layout: 'square', diameter: 5, angle: 0 }),
  variablePattern: () => ({ seeds: [], param: 'depth', delta: 5, count: 3, axis: 'x', spacing: 20 }),
  projectedCurve: () => ({ sketch: null, faces: [] }),
  splitLine: () => ({ sketch: null, faces: [] }),
  compositeCurve: () => ({ curves: [], edges: [] }),
  curveXYZ: () => ({ points: [[0, 0, 0], [20, 0, 10], [40, -10, 0], [60, -20, 15]], closed: false }),
  // A spline lying on a face, through points picked on it (surface-spline.js).
  surfaceSpline: () => ({ face: null, points: [], closed: false }),
  // An OpenSCAD program (openscad-feature.js); the default source is set there when the feature is made.
  openscad: () => ({ source: SCAD_DEFAULT_SOURCE, fileName: 'model.scad', overrides: {}, files: {} }),
  ...FASTENING_DEFAULTS,
  ...SURFACE_MORE_DEFAULTS,
  ...SHEET_EXTRA_DEFAULTS,
  ...PART_EXTRA_DEFAULTS,
};

export const PART_MORE_NAMES = {
  combine: 'Combine', deleteBody: 'Body-Delete/Keep', indent: 'Indent', flex: 'Flex', deform: 'Deform',
  refAxis: 'Axis', refPoint: 'Point', coordSys: 'Coordinate System', boundingBox: 'Bounding Box',
  variableFillet: 'VarFillet', faceFillet: 'FaceFillet', fullRoundFillet: 'FullRoundFillet',
  curvePattern: 'CrvPattern', sketchPattern: 'SketchPattern', tablePattern: 'TPattern', fillPattern: 'FillPattern', variablePattern: 'VarPattern',
  projectedCurve: 'Curve-Projected', splitLine: 'Split Line', compositeCurve: 'CompCurve', curveXYZ: 'Curve-XYZ', surfaceSpline: 'Spline on Surface',
  openscad: 'OpenSCAD',
  ...FASTENING_NAMES,
  ...SURFACE_MORE_NAMES,
  ...SHEET_EXTRA_NAMES,
  ...PART_EXTRA_NAMES,
};

/** Tree / command icons of the new features. */
export const PART_MORE_ICONS = {
  combine: 'combineBodies', deleteBody: 'deleteBody', indent: 'indent', flex: 'flex', deform: 'deform',
  refAxis: 'refAxis', refPoint: 'refPoint', coordSys: 'coordSys', boundingBox: 'boundingBox',
  variableFillet: 'variableFillet', faceFillet: 'faceFillet', fullRoundFillet: 'fullRoundFillet',
  curvePattern: 'curvePattern', sketchPattern: 'sketchDrivenPattern', tablePattern: 'tablePattern', fillPattern: 'fillPattern', variablePattern: 'variablePattern',
  projectedCurve: 'projectedCurve', splitLine: 'splitLine', compositeCurve: 'compositeCurve', curveXYZ: 'curveXYZ', surfaceSpline: 'surfaceSpline',
  openscad: 'scadFile',
  ...FASTENING_ICONS,
  ...SURFACE_MORE_ICONS,
  ...SHEET_EXTRA_ICONS,
  ...PART_EXTRA_ICONS,
};


/** Features whose result is a curve (paths for sweeps, curve-driven patterns, composite curves). */
export const CURVE_TYPES = ['helix', 'sketch3d', 'projectedCurve', 'compositeCurve', 'curveXYZ', 'surfaceSpline'];

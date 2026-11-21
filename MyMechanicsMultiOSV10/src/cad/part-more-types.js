// The new part features' type names, defaults, base names and icons (no imports: features.js and the UI
// read them while the modules load).
export const PART_MORE_TYPES = [
  'combine', 'deleteBody', 'indent', 'flex', 'deform',
  'refAxis', 'refPoint', 'coordSys',
  'variableFillet', 'faceFillet', 'fullRoundFillet',
  'curvePattern', 'sketchPattern', 'tablePattern', 'fillPattern', 'variablePattern',
  'projectedCurve', 'splitLine', 'compositeCurve', 'curveXYZ',
];

export const PART_MORE_DEFAULTS = {
  combine: () => ({ op: 'add', main: 0, bodies: [] }),
  deleteBody: () => ({ mode: 'delete', bodies: [] }),
  indent: () => ({ target: 0, toolBody: 1, thickness: 1, clearance: 0, keepTool: true }),
  flex: () => ({ mode: 'bend', axis: 'x', toward: 'y', angle: 90, factor: 0.5, stretch: 20 }),
  deform: () => ({ x: 0, y: 0, z: 0, pointRef: null, dir: 'y', amount: 5, radius: 30 }),
  refAxis: () => ({ kind: 'std', axis: 'y', x1: 0, y1: 0, z1: 0, x2: 0, y2: 10, z2: 0, edge: null, face: null, planeA: 'std:front', planeB: 'std:right' }),
  refPoint: () => ({ kind: 'coords', x: 0, y: 0, z: 0, face: null, edge: null, at: 0.5 }),
  coordSys: () => ({ x: 0, y: 0, z: 0, pointRef: null, rx: 0, ry: 0, rz: 0 }),
  variableFillet: () => ({ edges: [], r1: 2, r2: 5 }),
  faceFillet: () => ({ faces: [], radius: 2 }),
  fullRoundFillet: () => ({ faces: [] }),
  curvePattern: () => ({ seeds: [], curve: null, count: 4, equal: true, spacing: 15, align: false }),
  sketchPattern: () => ({ seeds: [], sketch: null }),
  tablePattern: () => ({ seeds: [], points: [[30, 0, 0], [0, 0, 30]], cs: null }),
  fillPattern: () => ({ seeds: [], face: null, spacing: 15, margin: 3, layout: 'square', diameter: 5, angle: 0 }),
  variablePattern: () => ({ seeds: [], param: 'depth', delta: 5, count: 3, axis: 'x', spacing: 20 }),
  projectedCurve: () => ({ sketch: null, faces: [] }),
  splitLine: () => ({ sketch: null, faces: [] }),
  compositeCurve: () => ({ curves: [], edges: [] }),
  curveXYZ: () => ({ points: [[0, 0, 0], [20, 10, 0], [40, 0, 10], [60, 15, 20]], closed: false }),
};

export const PART_MORE_NAMES = {
  combine: 'Combine', deleteBody: 'Body-Delete/Keep', indent: 'Indent', flex: 'Flex', deform: 'Deform',
  refAxis: 'Axis', refPoint: 'Point', coordSys: 'Coordinate System',
  variableFillet: 'VarFillet', faceFillet: 'FaceFillet', fullRoundFillet: 'FullRoundFillet',
  curvePattern: 'CrvPattern', sketchPattern: 'SketchPattern', tablePattern: 'TPattern', fillPattern: 'FillPattern', variablePattern: 'VarPattern',
  projectedCurve: 'Curve-Projected', splitLine: 'Split Line', compositeCurve: 'CompCurve', curveXYZ: 'Curve-XYZ',
};

/** Tree / command icons of the new features. */
export const PART_MORE_ICONS = {
  combine: 'combineBodies', deleteBody: 'deleteBody', indent: 'indent', flex: 'flex', deform: 'deform',
  refAxis: 'refAxis', refPoint: 'refPoint', coordSys: 'coordSys',
  variableFillet: 'variableFillet', faceFillet: 'faceFillet', fullRoundFillet: 'fullRoundFillet',
  curvePattern: 'curvePattern', sketchPattern: 'sketchDrivenPattern', tablePattern: 'tablePattern', fillPattern: 'fillPattern', variablePattern: 'variablePattern',
  projectedCurve: 'projectedCurve', splitLine: 'splitLine', compositeCurve: 'compositeCurve', curveXYZ: 'curveXYZ',
};


/** Features whose result is a curve (paths for sweeps, curve-driven patterns, composite curves). */
export const CURVE_TYPES = ['helix', 'sketch3d', 'projectedCurve', 'compositeCurve', 'curveXYZ'];

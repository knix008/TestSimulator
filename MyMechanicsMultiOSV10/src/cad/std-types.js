// Type names, defaults, base names and icons of the standard-part and routing features (no imports:
// features.js, the tree and the UI read them while the modules load).
//   stdPart — a parametric part of the standard parts library (bolts, nuts, washers, bearings, pins, rings,
//             keys, gears, pipe fittings), placed in the part as a body of its own
//   route   — a pipe, tube, cable or electrical harness along a network of 3D points (main run or a 3D sketch,
//             plus branches: tees, reducers, saddles, splices), with bends or elbows; harnesses add connectors,
//             clips and wires (`branches`, `connectors`, `clips`, `wires`: see routing.js / harness.js)
export const STD_TYPES = ['stdPart', 'route'];

export const STD_DEFAULTS = {
  stdPart: () => ({ kind: 'hexBolt', size: 'M8', length: 30, module: 2, teeth: 24, width: 20, bore: 10, keyway: false, helixAngle: 15, hand: 'right', mateTeeth: 40, height: 20, threads: 'auto', dn: 'DN25', x: 0, y: 0, z: 0, axis: 'z', angle: 0, merge: false }),
  route: () => ({ kind: 'pipe', points: [[0, 0, 0], [0, 0, 120], [120, 0, 120], [120, 100, 120]], path: null, dn: 'DN25', od: 12, wall: 1, bendRadius: 50, fittings: 'bends', flanges: 'none', diameter: 6, color: '#d23c3c' }),
};

export const STD_NAMES = { stdPart: 'Standard Part', route: 'Route' };

export const STD_ICONS = { stdPart: 'stdLibrary', route: 'pipeRoute' };

/** Route kinds and their command / icon names. */
export const ROUTE_KINDS = ['pipe', 'tube', 'cable', 'harness'];
export const ROUTE_ICONS = { pipe: 'pipeRoute', tube: 'tubeRoute', cable: 'cableRoute', harness: 'harnessRoute' };

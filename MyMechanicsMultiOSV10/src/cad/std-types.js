// Type names, defaults, base names and icons of the standard-part and routing features (no imports:
// features.js, the tree and the UI read them while the modules load).
//   stdPart — a parametric part of the standard parts library (bolts, nuts, washers, bearings, pins, rings,
//             keys, gears, pipe fittings), placed in the part as a body of its own
//   route   — a pipe, tube or cable along a chain of 3D points (or a 3D sketch), with bends or elbows
export const STD_TYPES = ['stdPart', 'route'];

export const STD_DEFAULTS = {
  stdPart: () => ({ kind: 'hexBolt', size: 'M8', length: 30, module: 2, teeth: 24, width: 20, bore: 10, dn: 'DN25', x: 0, y: 0, z: 0, axis: 'z', angle: 0, merge: false }),
  route: () => ({ kind: 'pipe', points: [[0, 0, 0], [0, 0, 120], [120, 0, 120], [120, 100, 120]], path: null, dn: 'DN25', od: 12, wall: 1, bendRadius: 50, fittings: 'bends', flanges: 'none', diameter: 6, color: '#d23c3c' }),
};

export const STD_NAMES = { stdPart: 'Standard Part', route: 'Route' };

export const STD_ICONS = { stdPart: 'stdLibrary', route: 'pipeRoute' };

/** Route kinds and their command / icon names. */
export const ROUTE_KINDS = ['pipe', 'tube', 'cable'];
export const ROUTE_ICONS = { pipe: 'pipeRoute', tube: 'tubeRoute', cable: 'cableRoute' };

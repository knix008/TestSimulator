// MySketchBook modelling kernel (see README.md). Solid tools load manifold-3d lazily.
export { GeoMesh, splitLoops } from './mesh.js';
export * as primitives from './primitives.js';
export { infer, projectRayToAxis, projectRayToPlane, closestPointsRaySegment, candidatesFromMesh, PRIORITY } from './inference.js';
export { union, subtract, intersect, trim, split, outerShell, loadManifold } from './solids.js';

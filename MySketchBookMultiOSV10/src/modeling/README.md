# MySketchBook modelling kernel (`src/modeling/`)

SketchUp-style "sticky geometry" in pure JS: edges and faces that stick together, push/pull,
follow me, offset, intersect, solid tools and the inference engine. No DOM; `three` is used for
math only (`ShapeUtils` earcut, and callers may pass `THREE.Matrix4`). Everything runs in Node
(`node --test test/unit/modeling*.test.js`).

Units are **metres, Y up** (see `ARCHITECTURE.md §12`).

| File | What |
| --- | --- |
| `mesh.js` | `GeoMesh`: data model, drawing, face finding, push/pull, move/copy, offset, follow me, intersect, queries, render buffers, JSON |
| `inference.js` | `infer()` + ray helpers: endpoint / midpoint / intersection / on edge / axis / parallel / on face / ground |
| `solids.js` | Union, Subtract, Intersect, Trim, Split via `manifold-3d` (WASM loaded lazily) |
| `primitives.js` | `box`, `cylinder`, `tube`, `cone`, `sphere`, `prism`, `rectangle` |
| `index.js` | re-exports everything |
| `math.js`, `grid.js`, `polygon.js` | vector helpers, spatial hash grids, 2D polygon helpers |

```js
import { GeoMesh, infer, primitives, subtract } from './modeling/index.js';
const m = new GeoMesh();
const { faces } = m.addRectangle([0, 0, 0], [4, 0, 3]);   // floor 4 × 3 m → 1 face (+Y)
const { face: top } = m.pushPull(faces[0], 2.6);          // closed box, outward normals
m.addRectangle([1, 2.6, 1], [2, 2.6, 2]);                 // splits the top: inner face + hole
const buffers = m.triangulate();                          // for THREE.BufferGeometry
```

## Data model

All ids are integers from **one counter** shared by vertices, edges, faces and curves, so an id
names exactly one entity (selection sets can mix kinds). Ids are never reused.

```js
mesh.vertices  // Map id → { x, y, z }
mesh.edges     // Map id → { a, b, soft, smooth, hidden, curve? }   a/b = vertex ids
mesh.faces     // Map id → { outer: [vid…], holes: [[vid…]…], normal: {x,y,z},
               //            material: presetId|null, backMaterial: presetId|null, uvTransform? }
mesh.curves    // Map id → { edges: [eid…], kind: 'circle'|'arc'|'polygon', center, normal, radius }
mesh.revision  // bumped by every change
```

- `outer` runs **counter-clockwise seen from the front** (right-hand rule gives `normal`);
  holes run the other way. Every consecutive vertex pair of a loop is an edge.
- Faces are planar. `normal` is the unit Newell normal of `outer`.
- `uvTransform` (optional): `{ offset: [u, v], rotation (rad), scale: [su, sv] }` applied to the
  planar metre UVs (`u' = rot(u,v)/scale + offset`).
- `soft` edges are drawn as soft (or not at all), `smooth` edges average normals across them,
  `hidden` edges are not drawn.
- Tolerances: `new GeoMesh({ tolerance = 1e-5 m (vertex merge), planeTolerance = 1e-6
  (coplanarity, relative to max(1 m, |coordinate|)), gridSize = 0.5 m (spatial grid cell) })`.

Change tracking for the renderer: `takeChanges()` → `{ vertices, edges, faces, revision }`, the
ids created/modified/removed since the last call (check `mesh.faces.has(id)` to tell removed from
changed). `mesh.changed` is the live set of face + edge ids.

## Drawing (sticky geometry)

| Call | Returns |
| --- | --- |
| `addEdge(p, q, { planeNormal? })` | `{ edges, created, faces }` — `edges`: all edges now along p–q (existing pieces are reused), `created`: the new ones, `faces`: faces created |
| `addPolyline(points, { closed, planeNormal })` | `{ edges, faces }` |
| `addRectangle(p0, p1, p2)` | p0–p1 is one side, p2 sets the other side (made square to it) |
| `addRectangle(p0, p1, { normal })` | p0/p1 opposite corners in the plane with that normal, sides along the plane's world-aligned axes (default normal +Y: an X/Z rectangle on the floor) |
| `addCircle(center, normal, radius, segments = 24)` | `{ edges, faces, curve }` |
| `addArc(center, normal, radius, startAngle, endAngle, { segments, xAxis })` | `{ edges, faces, curve }` (angles CCW about normal from `xAxis`/plane u) |
| `addArc3(start, onArc, end, { segments })` | arc through three points |
| `addPolygon(center, normal, radius, sides)` | `{ edges, faces, curve }` (kind `'polygon'`: push/pull keeps hard sides) |
| `addFaceFromPoints(outer, holes, props)` | low-level: one face from points (vertices merge, no face finding) |

Points may be `{x,y,z}`, `THREE.Vector3` or `[x, y, z]`.

What `addEdge` does (SketchUp behaviour):

1. Endpoints merge with any vertex within `tolerance`.
2. The segment splits where it crosses an existing edge in 3D, at T-junctions (an endpoint on an
   edge, either way round) and where it overlaps collinear edges (the overlap reuses the old edge).
   Split edges keep their flags and curve; faces using them get the new vertices in their loops.
3. **Face finding**, only around the new edges:
   - a new edge lying inside a face re-splits that face's region: a line across a face gives two
     faces, a closed loop inside gives an inner face plus a hole, a dangling line leaves the face
     as it is. The pieces keep the face's material, orientation and (for the piece that keeps the
     old outline) its id;
   - in free space, every plane through the edge and a neighbouring edge (plus `planeNormal`) is
     walked (planar face traversal): each new closed loop becomes a face. Coplanar faces lying
     inside it become its holes.
   - Orientation of a new free face: floor faces (y = 0) face **up**; otherwise consistent with a
     coplanar neighbour, else with any neighbour (shared edges run opposite ways), else up for
     horizontal faces, else toward `planeNormal`. When the face closes a small shell (≤ 2000
     faces, e.g. a box drawn edge by edge) the whole shell is oriented outward.

## Editing

| Call | Notes |
| --- | --- |
| `eraseEdges(ids)` → `{ faces, removedFaces }` | Removes edges and the faces they bound. Coplanar faces the edges separated **heal** into one; a face that loses a hole edge fills the hole; vertices left between two collinear edges dissolve (the split sides merge back). Use `curveEdges(e)` to erase a whole curve. |
| `eraseFaces(ids)` | faces only, edges stay |
| `erase(ids)` | any mix (vertices/curves erase their edges) |
| `pushPull(faceId, distance, { createNew })` → `{ face, created: { faces, edges }, pushedThrough?, collapsed? }` | see below |
| `moveEntities({ vertices, edges, faces } \| ids, vector, { autoFold })` → `{ faces, folded }` | moves the referenced vertices; connected geometry stretches. `autoFold`: faces that become non-planar are replaced by planar triangles |
| `transformEntities(ids, matrix4, { autoFold })` | rotate / scale / mirror (mirrored faces moved as a whole keep pointing outward) |
| `copyEntities(ids, matrix4?)` → `{ vertices, edges, faces }` | Move + Ctrl copy; vertices of the copy merge with coincident ones (copies placed against each other stick). Array copies: call repeatedly |
| `merge(otherMesh, matrix4?)` | adds another GeoMesh (same rules as copy) |
| `offsetFace(faceId, distance)` → `{ edges, faces, curve?, error? }` | distance > 0 inward, < 0 outward; mitred corners on convex and concave outlines; circles stay circles (`curve`). `error: 'offset-too-large'` when an offset edge would flip |
| `followMe(faceId, pathEdgeIds)` → `{ faces, edges, error? }` | sweeps the profile along a chain of edges (lines and arcs) with mitred joints. Open paths start at the end nearest the profile and keep the profile as the start cap; closed paths close the sweep and consume the profile face. Joints along one curve and sides along a curved profile are soft + smooth. The result is oriented outward. `error: 'bad-path'` for branching/disconnected edges |
| `intersectFaces(faceIdsA, faceIdsB = null)` → `{ edges, faces }` | Intersect Faces: adds edges where faces of A cross faces of B (null: the rest of the model); faces split along them |
| `flipFaces(ids)` / `reverseFaces(ids)` | reverse orientation, swapping front/back materials (SketchUp Reverse Faces) |
| `orientFaces(faceId)` | orient everything connected like this face |
| `softenEdges(ids = all, angleDeg = 20, { coplanar })` → changed ids | edges whose faces meet at < angle become soft + smooth, others hard (coplanar edges are skipped unless `coplanar`) |
| `setEdgeFlags(ids, { soft, smooth, hidden })` | |
| `setMaterial(faceIds, presetId, { back })`, `setUVTransform(faceIds, t)` | |

### Push/pull rules

- **Stretch**: when every face bordering the face's edges is perpendicular to it (edges with no
  other face just follow) the face's vertices move: pushing a box's top or side keeps 6 faces.
- **Extrude**: otherwise new side faces are created (cap gets the face's material).
  - A free-standing face stays as the back of the new solid (flipped when pulled toward its
    front), so pulling a floor rectangle up gives a closed box with outward normals.
  - A face bordered by a coplanar face (a rectangle drawn on a wall/top) leaves an opening: pulled
    out it is a bump, pushed in a recess.
  - `createNew` (Ctrl) always extrudes and keeps the original face.
  - Side edges between two segments of the same circle/arc are soft + smooth (cylinders shade
    round) and the cap gets a matching curve.
- **Push-through**: pushing inward until the face reaches a parallel face that contains it cuts a
  hole through that face (both the one-step "recess to the back" and "stretch the recess to the
  back" cases). The result is `face: null, pushedThrough: <faceId>`. Pushing a box face exactly
  onto the opposite face removes the collapsed volume (`collapsed: [...]`).

## Queries

`facesOfEdge(e)`, `edgesOfVertex(v)`, `facesOfVertex(v)`, `edgeBetween(a, b)`, `findVertex(p, tol)`,
`connected(id)` → `{ vertices, edges, faces }` (triple click), `boundaryEdges(faceId)` (double click),
`curveOf(e)`, `curveEdges(e)`, `boundingBox()` → `{ min, max, empty }`, `isSolid()` (closed,
consistently oriented 2-manifold, no stray edges), `volume()` (signed, > 0 for outward solids),
`area(faceId)`, `plane(faceId)` → `{ normal, constant }` (THREE.Plane layout),
`classifyPoint(faceId, p)` → `'in' | 'on' | 'out'`, `validate()` → list of index problems (tests).

## Render buffers

```js
const t = mesh.triangulate({ materialGroups: true });
// t.positions, t.normals: Float32Array (3 per vertex; vertices are per face so normals/UVs are per face)
// t.uvs: Float32Array (2 per vertex) — planar in metres on each face (u along world X on floors,
//        v up on walls), so tiled textures keep their real size; uvTransform applied
// t.indices: Uint16Array/Uint32Array, wound with each face's normal
// t.groups: [{ start, count, material, backMaterial }] (index ranges, for BufferGeometry.addGroup)
// t.faceOfTriangle: Int32Array — face id per triangle (picking)
// t.faceIds: face order used
// t.edgePositions: Float32Array line pairs of hard visible edges; t.softEdgePositions: soft ones
```

Normals are flat per face, averaged across `smooth` edges around a vertex. Faces with holes are
triangulated with earcut on the face plane. Per-face triangles, positions and UVs are cached and
only rebuilt for faces that changed; a call re-assembles the arrays (≈20 ms for 40 000 faces).

## Serialisation

`toJSON()` → `{ format: 'geomesh', version: 1, tolerance, planeTolerance, gridSize, nextId,
vertices: [[id, x, y, z]…], edges: [[id, a, b, flags(1 soft | 2 smooth | 4 hidden), curve?]…],
faces: [{ id, outer, holes?, material?, backMaterial?, uvTransform? }…], curves: [{ id, kind, edges, center, normal, radius }…] }`.
`GeoMesh.fromJSON(json | string)` rebuilds every index (normals are recomputed). `clone()` = round
trip (use it for undo snapshots).

## Inference (`inference.js`)

```js
const r = infer({
  ray: { origin, direction },             // picking ray
  toScreen: (p) => ({ x, y }),            // or pixelSize: number | (p) => world size of 1 px at p
  cursor: { x, y },                       // optional with toScreen (default: toScreen(point on ray))
  candidates: {
    points: [{ p, kind: 'endpoint'|'midpoint'|'center'|'guidePoint', ref }],
    edges:  [{ a, b, ref }],              // endpoints + midpoints are derived automatically
    faces:  [{ plane: { normal, constant } | { normal, point }, contains(p) → bool, ref }],
    guides: [{ origin, direction, ref } | { a, b, ref }],   // infinite guide lines
    refEdges: [{ a, b, ref }],            // edges hovered recently → parallel/perpendicular
  },
  from: lastPoint | null,
  axes: { x, y, z },                      // red / green(=Y up here) / blue directions, may be rotated
  lock: null | 'x' | 'y' | 'z' | { direction } | { plane: { normal, constant | point } },
  tolerancePx: 10, groundY: 0, ground: true, drawPlane: { normal }?, occlude: false, defaultDepth: 10,
});
// → { point, kind, ref, px, lineFrom?, tooltipKey: 'inference.<kind>', locked?, snap?, onFace? }
```

Kinds and priority (SketchUp): `endpoint` > `midpoint` > `center` > `guidePoint` >
`intersection` (edges/guides near the cursor) > `onEdge` > `onGuide` > `axisX|axisY|axisZ` (from
`from`, dotted line `lineFrom`) > `parallel` > `perpendicular` > `onFace` > `ground` (y = groundY) >
`free`. Within a kind the closest to the cursor wins. With `lock`, the point is constrained to the
axis/direction line through `from` (or the plane); a point snapped under the cursor is projected
onto it (`snap` tells which). `occlude: true` drops snaps hidden behind the face under the cursor.
Note the kind names follow the API: `axisY` is the vertical (blue in SketchUp) axis because Y is up.

Helpers: `closestPointsRaySegment(ray, a, b)` → `{ pointOnRay, pointOnSegment, rayT, segT, distance }`,
`projectRayToAxis(ray, origin, direction)` → `{ point, t, rayT, distance }`,
`projectRayToPlane(ray, plane, allowBehind)` → point | null,
`candidatesFromMesh(mesh, { edges, faces })` (simple scenes/tests; big scenes should pass BVH-picked ids).

## Solid tools (`solids.js`)

```js
const r = await subtract(a, b, { matrixA, matrixB, softenAngle });  // a − b
// union(a, b), intersect(a, b)             → { mesh }
// trim(a, b)                               → { a: copy of a, b: b − a }
// split(a, b)                              → { aOnly, both, bOnly }
// any of them                              → { error: 'not-solid', which: 'a' | 'b' } if an operand is not isSolid()
await loadManifold({ locateFile });         // optional preload; otherwise the first call loads the WASM
```

Operands are converted to manifold meshes (shared vertices, triangles tagged with their source
face); results come back as polygon faces (coplanar triangles of one source face merged, holes
kept) with that face's materials. Coplanar neighbours with equal materials are healed into one
face and collinear boundary vertices dissolved. If an operand had soft edges, result edges under
30° are softened again. Coordinates pass through float32 (≈ 1 µm at room scale).

## Primitives (`primitives.js`)

`box(w, h, d, { at, anchor: 'bottom'|'corner'|'center', material })`, `cylinder(r, h, { segments, at })`,
`tube(rOuter, rInner, h)`, `cone(r, h)`, `sphere(r, { segments, rings, at })`, `prism(footprint [[x, z]…], h)`,
`rectangle(w, d)`. `'bottom'` (default) = footprint centred on `at`, base at `at.y` (library convention).

## Performance

Vertex merge, edge intersection and face lookup use spatial hash grids; face finding only walks the
planes around new edges. Measured on this PC (`test/unit/modeling-perf.test.js`): a 200 × 200 grid
of lines (80 400 edges, 40 000 faces) builds in ≈ 1 s, push/pull of one cell ≈ 0.7 ms, stretching
it ≈ 0.1 ms, a line across the whole grid (200 splits) ≈ 40 ms, full render buffers ≈ 35 ms first /
≈ 20 ms after a change.

## Known limitations

- Push/pull with mixed neighbours (some edges bordered by perpendicular faces, others by angled or
  coplanar ones) extrudes with new sides everywhere, where SketchUp would stretch some sides.
- Push-through is detected when the pushed face ends up inside one parallel face; partial overlaps
  with several faces are not cut. Pulling a face into other geometry does not intersect it (use
  `intersectFaces` or the solid tools).
- Moving/rotating geometry does not split it against other geometry it passes through (SketchUp
  doesn't either), but coincident vertices from moves are not merged afterwards.
- Face finding in free space needs a neighbouring non-collinear edge at one end of the new edge
  (or `planeNormal`): closing a loop with an edge that is collinear with both of its neighbours
  does not create the face.
- Holes of a new free face are the coplanar *faces* inside it; loose edge loops inside without a
  face are ignored.
- `offsetFace` offsets the outer loop only; very large offsets of concave outlines that would
  self-intersect are rejected (`offset-too-large`) rather than cleaned up.
- `followMe` translates sections along the path (no twist control); profiles far from the path or
  paths with 180° turns give degenerate sweeps.
- Shell auto-orientation only runs for closed shells up to 2000 faces.
- Solid tools work on whole GeoMeshes (one solid each); separate them first with `connected()`.

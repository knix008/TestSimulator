# MySketchBook module contracts

Shared rules every module follows, so the areas can be built separately and plugged together.

## Units and axes

- World units are **metres**. **Y is up**, the floor is the XZ plane (y = 0 is the floor of level 0).
- The 2D plan view looks straight down (−Y); plan "x" = world x, plan "y" = world z (z grows downwards on screen).
- An object's **front faces +Z**. Rotation about Y is in radians, counter-clockwise seen from above.
- Colours are `'#rrggbb'` strings.

## Library objects (`src/library/`)

A catalog entry:

```js
{
  id: 'sofa-modern',            // unique, kebab-case
  category: 'living',           // one of CATEGORIES ids (src/library/categories.js)
  ko: '모던 소파', en: 'Modern sofa',
  kind: 'parametric' | 'asset',
  placement: 'floor' | 'wall' | 'ceiling' | 'surface' | 'opening',  // 'opening' = door/window inside a wall
  size: [w, h, d],              // default bounding size in metres (x, y, z)
  params: [                     // editable in the Properties panel (parametric only; may be [])
    { key: 'width', ko: '폭', en: 'Width', type: 'length', default: 2.2, min: 1.2, max: 4, step: 0.01 },
    { key: 'seats', ko: '좌석 수', en: 'Seats', type: 'int', default: 3, min: 1, max: 5 },
    { key: 'fabric', ko: '천', en: 'Fabric', type: 'material', default: 'fabric-linen-grey', filter: 'fabric' },
    { key: 'legs', ko: '다리', en: 'Legs', type: 'enum', default: 'metal', options: [['metal','금속','Metal'], ['wood','나무','Wood']] },
    { key: 'cushions', ko: '쿠션', en: 'Cushions', type: 'bool', default: true },
    { key: 'color', ko: '색', en: 'Colour', type: 'color', default: '#8a8f99' },
  ],
  tags: ['sofa', '소파', ...],  // search words (ko + en)
  build: (params, ctx) => THREE.Object3D,   // parametric only
  asset: 'ArmChair_01',          // asset only: the id in public/library/models/manifest.json
}
```

`build(params, ctx)`:
- `params` = every param's value (defaults filled in).
- `ctx.material(id, overrides?)` → a shared `THREE.Material` for a preset id of `src/engine/materials.js` (`overrides` = `{ color }` etc.; the same arguments give the same cached material). Never create textures yourself; ask for presets.
- `ctx.wallThickness` (openings only), `ctx.quality` = `'high' | 'low'` (low: fewer segments, used for thumbnails of hundreds of items and for huge scenes).
- Returns a `THREE.Group` whose **origin is the bottom centre of the footprint** (floor at y = 0, centred in x and z), front +Z. Openings: origin at the bottom centre of the opening, centred in the wall thickness (z = 0 is the wall's middle plane).
- Every mesh: `castShadow = true; receiveShadow = true`. Geometry must have normals and UVs (UVs in metres, 1 unit = 1 m, so tiled textures keep their real scale). Rounded/bevelled edges for quality (no razor-sharp boxes on soft items).
- Mark glass/emissive parts with `mesh.userData.part = 'glass' | 'light'`. Ceiling lamps/lamps may add `userData.light = { color, intensity, distance }` on a child `Object3D` at the bulb position (the scene builder creates the real light when the user turns lights on).
- Pure: no DOM, no global state, works in Node (tests import it).

## Materials (`src/engine/materials.js`)

```js
export const MATERIAL_PRESETS   // [{ id, category, ko, en, color, roughness, metalness, ... }]
export const MATERIAL_CATEGORIES // [{ id, ko, en }]: wood, fabric, leather, stone, tile, metal, glass, paint, plastic, ceramic, wall, floor, carpet, plant, other
export function getMaterial(id, overrides = {})  // cached THREE.MeshPhysicalMaterial / MeshStandardMaterial
export function presetOf(id)
```

Preset ids (stable; more may be added): see `MATERIAL_PRESETS` in the file.

## Documents (`src/engine/document.js`)

A project (saved as `.msk`, a ZIP holding `project.json` + `assets/*`):

```js
{
  format: 'mysketchbook', version: 1, name,
  units: 'mm' | 'cm' | 'm' | 'in' | 'ft',
  levels: [{ id, name, elevation, height }],
  walls:  [{ id, level, a: [x, z], b: [x, z], thickness, height, material: { left, right, top } }],
  openings: [{ id, wall, item, offset, width, height, sill, flip, params }],   // offset = distance of the centre from wall.a
  rooms:  [{ id, level, name, points: [[x, z], ...], floor, ceiling, showCeiling }],
  objects: [{ id, level, item, params, position: [x, y, z], rotation: [rx, ry, rz], scale: [sx, sy, sz], materials: { meshName: presetId }, tag, name, locked, hidden }],
  models:  [{ id, level, name, mesh /* GeoMesh JSON, src/modeling */, position, rotation, scale, tag, component }],
  tags:    [{ id, name, visible, color }],
  scenes:  [{ id, name, camera: { position, target, fov, ortho }, style, shadows, tags }],
  sun: { date, time, latitude, longitude, north },
  style: { mode: 'textured' | 'shaded' | 'white' | 'wireframe' | 'xray' | 'hiddenline', edges, profiles, background },
  guides: [], dimensions: [], texts: [], sections: [],
  assets: { id: { name, mime, size } },  // the bytes are kept outside the JSON (ZIP entries)
}
```

## Modelling kernel (`src/modeling/`)

SketchUp-style geometry: edges and faces that stick together. Pure JS (Node-testable), `three` only for math.
See `src/modeling/README.md` (written with the kernel).

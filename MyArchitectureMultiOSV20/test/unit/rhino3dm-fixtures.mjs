// A small Rhino .3dm model written with rhino3dm itself (the same vendored
// wasm the importer uses), for the unit tests and the GUI smoke run:
//
//   units  centimetres
//   layer "Walls" (red)          a 400 × 300 × 250 cm box (Brep without render
//                                mesh, so the importer tessellates it)
//   layer "Furniture::Table"     a 100 × 60 cm quad mesh 75 cm up, object
//   (blue, child layer)          colour green
//   layer "Plan" (purple)        a circle r = 50 cm at (200, 150) and an
//                                L-shaped polyline, a point and a text dot
//   layer "Hidden" (hidden)      a box that only the plan import keeps
//   block "Stool"                a 40 × 40 × 45 cm box, inserted twice
//                                (at x = 50 and x = 350, y = 50)
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
let rhP = null;
export function rhino() {
  if (!rhP) {
    rhP = (async () => {
      const mod = await import(`file://${path.join(root, "src/vendor/rhino3dm/rhino3dm.module.js").replace(/\\/g, "/")}`);
      return mod.default({ wasmBinary: fs.readFileSync(path.join(root, "src/vendor/rhino3dm/rhino3dm.wasm")) });
    })();
  }
  return rhP;
}

export async function sample3dm() {
  const rh = await rhino();
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Centimeters;
  const addLayer = (name, color, parentId) => {
    const l = new rh.Layer();
    l.name = name;
    l.color = color;
    if (parentId) l.parentLayerId = parentId;
    return doc.layers().add(l);
  };
  const walls = addLayer("Walls", { r: 200, g: 40, b: 40, a: 255 });
  const furn = addLayer("Furniture", { r: 0, g: 0, b: 0, a: 255 });
  const table = addLayer("Table", { r: 30, g: 60, b: 220, a: 255 }, doc.layers().get(furn).id);
  const planL = addLayer("Plan", { r: 125, g: 38, b: 205, a: 255 });
  const hidden = addLayer("Hidden", { r: 90, g: 90, b: 90, a: 255 });
  { const l = doc.layers().get(hidden); l.visible = false; }
  const attrs = (layerIndex, color) => {
    const a = new rh.ObjectAttributes();
    a.layerIndex = layerIndex;
    if (color) { a.colorSource = rh.ObjectColorSource.ColorFromObject; a.objectColor = color; }
    return a;
  };
  const box = (x0, y0, z0, x1, y1, z1) => rh.Brep.createFromBox(new rh.Box(new rh.BoundingBox([x0, y0, z0], [x1, y1, z1])));

  doc.objects().addBrep(box(0, 0, 0, 400, 300, 250), attrs(walls));

  const mesh = new rh.Mesh();
  for (const p of [[150, 120, 75], [250, 120, 75], [250, 180, 75], [150, 180, 75]]) mesh.vertices().add(p[0], p[1], p[2]);
  mesh.faces().addQuadFace(0, 1, 2, 3);
  mesh.normals().computeNormals();
  doc.objects().addMesh(mesh, attrs(table, { r: 20, g: 160, b: 60, a: 255 }));

  doc.objects().addCircle(new rh.Circle([200, 150, 0], 50), attrs(planL));
  doc.objects().addPolyline([[0, 0, 0], [0, -100, 0], [150, -100, 0]], attrs(planL));
  doc.objects().addPoint([500, 500, 0], attrs(planL));
  doc.objects().addTextDot("Room 1", [100, 100, 0], attrs(planL));

  doc.objects().addBrep(box(600, 0, 0, 700, 100, 100), attrs(hidden));

  const stoolAttrs = attrs(furn, { r: 140, g: 90, b: 40, a: 255 });
  const idef = doc.instanceDefinitions().add("Stool", "", "", "", [0, 0, 0], [box(-20, -20, 0, 20, 20, 45)], [stoolAttrs]);
  const def = doc.instanceDefinitions().get(idef);
  for (const x of [50, 350]) {
    const ref = new rh.InstanceReference(def.id, rh.Transform.translationXYZ(x, 50, 0));
    doc.objects().addInstanceObject(ref, attrs(furn));
  }
  const bytes = doc.toByteArray();
  doc.delete();
  return new Uint8Array(bytes);
}

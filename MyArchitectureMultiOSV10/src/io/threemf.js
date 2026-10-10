// 3MF (3D Manufacturing Format) writer for the 3D model: a zip package with
// [Content_Types].xml, _rels/.rels and 3D/3dmodel.model.
//
// 3MF is Z up in its unit (millimetres by default); the model is Y-up metres,
// so (x, y, z)₃ₘf = (X, −Z, Y) × unit. That is a +90° rotation about X — a
// proper rotation — so triangle winding, counter-clockwise seen from outside,
// carries over unchanged. Coincident vertices are merged per object, triangles
// that collapse are dropped, and every material becomes a <base> of a single
// basematerials group with its sRGB colour and opacity as displaycolor.

import { makeZip } from "./zip.js";
import { collectMeshes, materialColor, materialOpacity, uniqueMaterialNames } from "./models3d.js";
import { escapeXml } from "./collada.js";

const UNIT_PER_METRE = { micron: 1e6, millimeter: 1000, centimeter: 100, meter: 1, inch: 1 / 0.0254, foot: 1 / 0.3048 };

const hex2 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0").toUpperCase();

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

export function export3MF(root, { unit = "millimeter", title = "" } = {}) {
  const k = UNIT_PER_METRE[unit];
  if (!k) throw new Error(`3MF export: unknown unit "${unit}".`);
  const digits = unit === "meter" || unit === "foot" || unit === "inch" ? 6 : unit === "centimeter" ? 5 : 4;
  const meshes = collectMeshes(root);
  const materials = [];
  for (const m of meshes) for (const g of m.groups) materials.push(g.material);
  const names = uniqueMaterialNames(materials);
  const matIndex = new Map([...names.keys()].map((mat, i) => [mat, i]));

  const objects = [];
  let nextId = 2; // 1 is the basematerials group
  meshes.forEach((m, mi) => {
    const p = m.positions;
    const remap = new Int32Array(p.length / 3);
    const lookup = new Map();
    const verts = [];
    for (let i = 0; i < remap.length; i++) {
      const x = +(p[i * 3] * k).toFixed(digits);
      const y = +(-p[i * 3 + 2] * k).toFixed(digits) || 0;
      const z = +(p[i * 3 + 1] * k).toFixed(digits);
      const key = `${x} ${y} ${z}`;
      let v = lookup.get(key);
      if (v === undefined) {
        v = verts.length;
        lookup.set(key, v);
        verts.push(`<vertex x="${x}" y="${y}" z="${z}"/>`);
      }
      remap[i] = v;
    }
    const baseMat = matIndex.get(m.groups[0].material);
    const tris = [];
    for (const g of m.groups) {
      const pi = matIndex.get(g.material);
      const attr = pi === baseMat ? "" : ` pid="1" p1="${pi}"`;
      for (let t = g.start; t < g.start + g.count; t += 3) {
        const a = remap[m.index[t]], b = remap[m.index[t + 1]], c = remap[m.index[t + 2]];
        if (a === b || b === c || a === c) continue;
        tris.push(`<triangle v1="${a}" v2="${b}" v3="${c}"${attr}/>`);
      }
    }
    if (!tris.length) return;
    const id = nextId++;
    objects.push({
      id,
      xml: [
        `    <object id="${id}" type="model" name="${escapeXml(m.name || `mesh ${mi + 1}`)}" pid="1" pindex="${baseMat}">`,
        "      <mesh>",
        "        <vertices>",
        ...verts.map((v) => `          ${v}`),
        "        </vertices>",
        "        <triangles>",
        ...tris.map((t) => `          ${t}`),
        "        </triangles>",
        "      </mesh>",
        "    </object>",
      ].join("\n"),
    });
  });
  if (!objects.length) throw new Error("3MF export: the model has no surfaces.");

  const bases = [...names].map(([mat, name]) => {
    const [r, g, b] = materialColor(mat);
    return `      <base name="${escapeXml(name)}" displaycolor="#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(materialOpacity(mat))}"/>`;
  });
  const docTitle = title || (root && root.name) || "";
  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">`,
    ...(docTitle ? [`  <metadata name="Title">${escapeXml(docTitle)}</metadata>`] : []),
    "  <metadata name=\"Application\">MyArchitecture</metadata>",
    `  <metadata name="CreationDate">${new Date().toISOString().slice(0, 10)}</metadata>`,
    "  <resources>",
    '    <basematerials id="1">',
    ...bases,
    "    </basematerials>",
    ...objects.map((o) => o.xml),
    "  </resources>",
    "  <build>",
    ...objects.map((o) => `    <item objectid="${o.id}"/>`),
    "  </build>",
    "</model>",
    "",
  ].join("\n");

  return makeZip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES },
    { name: "_rels/.rels", data: RELS },
    { name: "3D/3dmodel.model", data: model },
  ]);
}

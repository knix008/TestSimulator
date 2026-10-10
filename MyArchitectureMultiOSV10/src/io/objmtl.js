// Wavefront OBJ + MTL writer for the 3D model (viewer.exportRoot()).
//
// Every visible mesh becomes one "o"/"g" block with its vertices baked to
// world space: v, vt (when the mesh has UVs), vn (when it has normals) and
// triangles as v/vt/vn indices, with "usemtl" per material group. OBJ has no
// units: coordinates are metres × scale, Y up (scale = 1000 → millimetres).
// The MTL carries colour (Kd, Ka), specular (Ks, Ns from roughness) and
// opacity (d and its complement Tr); colours are written in sRGB.

import { collectMeshes, materialColor, materialOpacity, uniqueMaterialNames } from "./models3d.js";

const num = (v) => String(+v.toFixed(6));
const rgb = (c) => c.map((v) => v.toFixed(6)).join(" ");

function objName(s, used, fallback) {
  const base = String(s || "").trim().replace(/\s+/g, "_").replace(/[^\w.:-]/g, "") || fallback;
  let name = base;
  for (let k = 2; used.has(name); k++) name = `${base}_${k}`;
  used.add(name);
  return name;
}

export function exportObjMtl(root, { name = "model", scale = 1 } = {}) {
  const meshes = collectMeshes(root, { scale });
  const materials = [];
  for (const m of meshes) for (const g of m.groups) materials.push(g.material);
  const matNames = uniqueMaterialNames(materials);
  const lib = String(name || "model").replace(/[\\/:*?"<>|]+/g, "_");

  const out = [
    "# MyArchitecture OBJ export",
    `# Y up, units: metres x ${num(scale)}`,
    `# ${meshes.length} objects`,
    `mtllib ${lib}.mtl`,
  ];
  const used = new Set();
  let vBase = 1, tBase = 1, nBase = 1;
  meshes.forEach((m, mi) => {
    const label = objName(m.name, used, `mesh_${mi + 1}`);
    const n = m.positions.length / 3;
    out.push("", `o ${label}`, `g ${label}`);
    const p = m.positions;
    for (let i = 0; i < n; i++) out.push(`v ${num(p[i * 3])} ${num(p[i * 3 + 1])} ${num(p[i * 3 + 2])}`);
    if (m.uvs) for (let i = 0; i < n; i++) out.push(`vt ${num(m.uvs[i * 2])} ${num(m.uvs[i * 2 + 1])}`);
    if (m.normals) for (let i = 0; i < n; i++) out.push(`vn ${num(m.normals[i * 3])} ${num(m.normals[i * 3 + 1])} ${num(m.normals[i * 3 + 2])}`);
    const vert = m.uvs && m.normals
      ? (i) => `${vBase + i}/${tBase + i}/${nBase + i}`
      : m.normals
        ? (i) => `${vBase + i}//${nBase + i}`
        : m.uvs
          ? (i) => `${vBase + i}/${tBase + i}`
          : (i) => `${vBase + i}`;
    let current = null;
    for (const g of m.groups) {
      const mat = matNames.get(g.material);
      if (mat !== current) { out.push(`usemtl ${mat}`); current = mat; }
      for (let t = g.start; t < g.start + g.count; t += 3) {
        out.push(`f ${vert(m.index[t])} ${vert(m.index[t + 1])} ${vert(m.index[t + 2])}`);
      }
    }
    vBase += n;
    if (m.uvs) tBase += n;
    if (m.normals) nBase += n;
  });

  const mtl = ["# MyArchitecture MTL export", `# ${matNames.size} materials`];
  for (const [mat, mname] of matNames) {
    const kd = materialColor(mat);
    const opacity = materialOpacity(mat);
    const rough = mat && Number.isFinite(mat.roughness) ? Math.max(0, Math.min(1, mat.roughness)) : 0.8;
    const metal = mat && Number.isFinite(mat.metalness) ? Math.max(0, Math.min(1, mat.metalness)) : 0;
    const spec = 0.04 + (1 - rough) * 0.3 + metal * 0.4;
    mtl.push(
      "",
      `newmtl ${mname}`,
      `Ka ${rgb(kd)}`,
      `Kd ${rgb(kd)}`,
      `Ks ${rgb([spec, spec, spec])}`,
      `Ns ${num(Math.max(1, (1 - rough) * (1 - rough) * 1000))}`,
      `d ${num(opacity)}`,
      `Tr ${num(1 - opacity)}`,
      "illum 2",
    );
  }
  return { obj: out.join("\n") + "\n", mtl: mtl.join("\n") + "\n" };
}

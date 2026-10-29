// COLLADA 1.4.1 (.dae) writer for the 3D model (viewer.exportRoot()).
//
// One <geometry> per visible mesh with positions, normals and UVs baked to
// world space, so every <node> keeps the identity transform; one phong (or
// lambert, for fully rough surfaces) effect + material per distinct material,
// bound through instance_geometry/bind_material. Y up; the <unit> follows the
// scale (1 → metre, 1000 → millimetre) so readers recover real sizes.
// Read by SketchUp, Blender and three.js' ColladaLoader.

import { collectMeshes, materialColor, materialOpacity, uniqueMaterialNames } from "./models3d.js";
import { DoubleSide } from "../vendor/three/three.module.js";

const num = (v) => String(+v.toFixed(6));

export function escapeXml(s) {
  return String(s ?? "")
    // Characters XML 1.0 cannot carry at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unitFor(scale) {
  const metre = 1 / scale;
  const known = [[1, "meter"], [0.001, "millimeter"], [0.01, "centimeter"], [0.0254, "inch"], [0.3048, "foot"]];
  for (const [m, name] of known) if (Math.abs(m - metre) <= m * 1e-6) return { meter: m, name };
  return { meter: +metre.toPrecision(9), name: "unit" };
}

const isoDate = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function floats(arr, digits = 6) {
  const parts = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) parts[i] = String(+arr[i].toFixed(digits));
  return parts.join(" ");
}

function source(id, arr, stride, params) {
  const count = arr.length / stride;
  return [
    `        <source id="${id}">`,
    `          <float_array id="${id}-array" count="${arr.length}">${floats(arr)}</float_array>`,
    "          <technique_common>",
    `            <accessor source="#${id}-array" count="${count}" stride="${stride}">`,
    ...params.map((p) => `              <param name="${p}" type="float"/>`),
    "            </accessor>",
    "          </technique_common>",
    "        </source>",
  ].join("\n");
}

function effectXml(id, mat) {
  const [r, g, b] = materialColor(mat);
  const opacity = materialOpacity(mat);
  const rough = mat && Number.isFinite(mat.roughness) ? Math.max(0, Math.min(1, mat.roughness)) : 0.8;
  const metal = mat && Number.isFinite(mat.metalness) ? Math.max(0, Math.min(1, mat.metalness)) : 0;
  const lambert = rough >= 0.95 && metal < 0.05;
  const shader = lambert ? "lambert" : "phong";
  const spec = 0.04 + (1 - rough) * 0.3 + metal * 0.4;
  const em = mat && mat.emissive ? materialColor({ color: mat.emissive }) : [0, 0, 0];
  const lines = [
    `    <effect id="${id}">`,
    "      <profile_COMMON>",
    '        <technique sid="common">',
    `          <${shader}>`,
    `            <emission><color sid="emission">${em.map(num).join(" ")} 1</color></emission>`,
    '            <ambient><color sid="ambient">0 0 0 1</color></ambient>',
    `            <diffuse><color sid="diffuse">${num(r)} ${num(g)} ${num(b)} 1</color></diffuse>`,
  ];
  if (!lambert) {
    lines.push(
      `            <specular><color sid="specular">${num(spec)} ${num(spec)} ${num(spec)} 1</color></specular>`,
      `            <shininess><float sid="shininess">${num(Math.max(1, (1 - rough) * (1 - rough) * 128))}</float></shininess>`,
    );
  }
  if (opacity < 1) {
    lines.push(
      '            <transparent opaque="A_ONE"><color>1 1 1 1</color></transparent>',
      `            <transparency><float sid="transparency">${num(opacity)}</float></transparency>`,
    );
  }
  lines.push(`          </${shader}>`, "        </technique>");
  if (mat && mat.side === DoubleSide) {
    lines.push('        <extra><technique profile="GOOGLEEARTH"><double_sided>1</double_sided></technique></extra>');
  }
  lines.push("      </profile_COMMON>", "    </effect>");
  return lines.join("\n");
}

export function exportCollada(root, { title = "", author = "", scale = 1 } = {}) {
  const meshes = collectMeshes(root, { scale });
  if (!meshes.length) throw new Error("COLLADA export: the model has no surfaces.");
  const materials = [];
  for (const m of meshes) for (const g of m.groups) materials.push(g.material);
  const names = uniqueMaterialNames(materials);
  const matId = new Map();
  [...names.keys()].forEach((mat, i) => matId.set(mat, `material-${i}`));

  const now = isoDate();
  const unit = unitFor(scale);
  const sceneName = title || (root && root.name) || "model";
  const out = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
    "  <asset>",
    "    <contributor>",
    ...(author ? [`      <author>${escapeXml(author)}</author>`] : []),
    "      <authoring_tool>MyArchitecture</authoring_tool>",
    "    </contributor>",
    `    <created>${now}</created>`,
    `    <modified>${now}</modified>`,
    ...(title ? [`    <title>${escapeXml(title)}</title>`] : []),
    `    <unit name="${unit.name}" meter="${unit.meter}"/>`,
    "    <up_axis>Y_UP</up_axis>",
    "  </asset>",
  ];

  out.push("  <library_effects>");
  for (const [mat] of names) out.push(effectXml(`${matId.get(mat)}-effect`, mat));
  out.push("  </library_effects>", "  <library_materials>");
  for (const [mat, name] of names) {
    out.push(`    <material id="${matId.get(mat)}" name="${escapeXml(name)}"><instance_effect url="#${matId.get(mat)}-effect"/></material>`);
  }
  out.push("  </library_materials>", "  <library_geometries>");

  const nodes = [];
  meshes.forEach((m, i) => {
    const id = `geometry-${i}`;
    const label = escapeXml(m.name || `mesh ${i + 1}`);
    out.push(`    <geometry id="${id}" name="${label}">`, "      <mesh>");
    out.push(source(`${id}-positions`, m.positions, 3, ["X", "Y", "Z"]));
    if (m.normals) out.push(source(`${id}-normals`, m.normals, 3, ["X", "Y", "Z"]));
    if (m.uvs) out.push(source(`${id}-uvs`, m.uvs, 2, ["S", "T"]));
    out.push(`        <vertices id="${id}-vertices"><input semantic="POSITION" source="#${id}-positions"/></vertices>`);
    const inputs = [`<input semantic="VERTEX" source="#${id}-vertices" offset="0"/>`];
    if (m.normals) inputs.push(`<input semantic="NORMAL" source="#${id}-normals" offset="${inputs.length}"/>`);
    if (m.uvs) inputs.push(`<input semantic="TEXCOORD" source="#${id}-uvs" offset="${inputs.length}" set="0"/>`);
    const stride = inputs.length;
    const used = new Set();
    for (const g of m.groups) {
      const p = new Array(g.count * stride);
      for (let k = 0; k < g.count; k++) {
        const vi = String(m.index[g.start + k]);
        for (let s = 0; s < stride; s++) p[k * stride + s] = vi;
      }
      const symbol = matId.get(g.material);
      used.add(g.material);
      out.push(
        `        <triangles material="${symbol}" count="${g.count / 3}">`,
        ...inputs.map((x) => `          ${x}`),
        `          <p>${p.join(" ")}</p>`,
        "        </triangles>",
      );
    }
    out.push("      </mesh>", "    </geometry>");
    nodes.push([
      `        <node id="node-${i}" name="${label}" type="NODE">`,
      `          <instance_geometry url="#${id}" name="${label}">`,
      "            <bind_material>",
      "              <technique_common>",
      ...[...used].map((mat) => `                <instance_material symbol="${matId.get(mat)}" target="#${matId.get(mat)}"/>`),
      "              </technique_common>",
      "            </bind_material>",
      "          </instance_geometry>",
      "        </node>",
    ].join("\n"));
  });
  out.push("  </library_geometries>");

  out.push(
    "  <library_visual_scenes>",
    `    <visual_scene id="scene" name="${escapeXml(sceneName)}">`,
    `      <node id="node-root" name="${escapeXml(sceneName)}" type="NODE">`,
    ...nodes,
    "      </node>",
    "    </visual_scene>",
    "  </library_visual_scenes>",
    "  <scene>",
    '    <instance_visual_scene url="#scene"/>',
    "  </scene>",
    "</COLLADA>",
  );
  return out.join("\n") + "\n";
}

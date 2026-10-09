// Pure parts of the 3D viewer, no WebGL: models, board slab, face painting.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { buildModel, MODEL_KINDS } from "../../src/view3d/models.js";
import { boardShapeData, buildBoardGeometry, buildBarrelGeometry } from "../../src/view3d/boardmesh.js";
import { textureLayout, paintBoardSide, maskPalette, finishColor, silkPalette, boardUV } from "../../src/view3d/texture.js";
import { newProject } from "../../src/core/project.js";
import { allFootprints, getFootprint } from "../../src/lib/footprints.js";
import { strokeText } from "../../src/fab/strokefont.js";

function sizeOf(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return { box, size: box.getSize(new THREE.Vector3()) };
}

function meshes(group) {
  const out = [];
  group.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

function finiteGeometry(mesh) {
  const a = mesh.geometry.attributes.position.array;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return a.length > 0;
}

// One representative model3d per kind (taken from the library where possible).
function sampleModels() {
  const byKind = new Map();
  for (const fp of allFootprints()) if (fp.model3d && !byKind.has(fp.model3d.kind)) byKind.set(fp.model3d.kind, fp);
  return MODEL_KINDS.map((kind) => {
    const fp = byKind.get(kind);
    if (fp) return { kind, model: fp.model3d, fp };
    return { kind, model: { kind }, fp: null };
  });
}

test("buildModel returns sensible geometry for every kind", () => {
  for (const { kind, model, fp } of sampleModels()) {
    const pads = fp ? fp.pads.filter((p) => p.drill && !p.npth).map((p) => [p.x, p.y]) : [];
    const g = buildModel(model, THREE, { boardThickness: 1.6, courtyard: fp && fp.courtyard, pads });
    assert.ok(g.isGroup, `${kind}: group`);
    const ms = meshes(g);
    assert.ok(ms.length > 0, `${kind}: has meshes`);
    for (const m of ms) assert.ok(finiteGeometry(m), `${kind}/${m.name}: finite positions`);
    const { box, size } = sizeOf(g);
    for (const v of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) assert.ok(Number.isFinite(v), `${kind}: finite bbox`);
    assert.ok(size.x > 0.3 && size.x < 40, `${kind}: x size ${size.x}`);
    assert.ok(size.z > 0.3 && size.z < 40, `${kind}: z size ${size.z}`);
    assert.ok(box.max.y > 0.02 && box.max.y < 25, `${kind}: height ${box.max.y}`);
    assert.equal(g.userData.kind, kind);
  }
});

test("DIP-8 body is about 9.5 x 6.4 mm and its pins reach through the board", () => {
  const g = buildModel(getFootprint("DIP-8_W7.62mm").model3d, THREE, { boardThickness: 1.6 });
  const body = meshes(g).find((m) => m.name === "plastic");
  const { size } = sizeOf(body);
  assert.ok(size.z > 9 && size.z < 10, `length ${size.z}`);
  assert.ok(size.x > 6 && size.x < 6.6, `width ${size.x}`);
  assert.ok(size.y > 3 && size.y < 3.6, `height ${size.y}`);
  const pins = meshes(g).find((m) => m.name === "tin");
  const pb = new THREE.Box3().setFromObject(pins);
  assert.ok(pb.min.y <= -2.5, "pins go below the board");
  assert.ok(Math.abs(pb.min.x - -0.125) < 0.05 && Math.abs(pb.max.x - 7.745) < 0.05, `pin rows at 0 and 7.62: ${pb.min.x}..${pb.max.x}`);
});

test("chip, SOIC and header models match their footprints", () => {
  const chip = sizeOf(buildModel(getFootprint("R_0805").model3d, THREE)).size;
  assert.ok(Math.abs(chip.x - 2.0) < 0.05 && Math.abs(chip.z - 1.25) < 0.05, `0805 ${chip.x}x${chip.z}`);
  const soic = sizeOf(buildModel(getFootprint("SOIC-8_3.9x4.9mm").model3d, THREE)).size;
  assert.ok(Math.abs(soic.x - 6.0) < 0.2, `SOIC span ${soic.x}`);
  const hdr = sizeOf(buildModel(getFootprint("PinHeader_2x04_P2.54mm").model3d, THREE)).size;
  assert.ok(Math.abs(hdr.x - 5.08) < 0.1 && Math.abs(hdr.z - 10.16) < 0.1, `header ${hdr.x}x${hdr.z}`);
});

test("unknown or missing model kinds fall back to a courtyard box", () => {
  const g = buildModel({ kind: "flux-capacitor" }, THREE, { courtyard: { x1: -2, y1: -1, x2: 2, y2: 1 } });
  const { size } = sizeOf(g);
  assert.ok(Math.abs(size.x - 3.5) < 0.01 && Math.abs(size.z - 1.5) < 0.01);
  assert.equal(g.userData.kind, "unknown");
  assert.ok(meshes(buildModel(null, THREE)).length > 0);
});

function demoProject() {
  const p = newProject("t");
  p.pcb.footprints.push({ id: "f1", ref: "U1", value: "NE555", footprint: "DIP-8_W7.62mm", x: 20, y: 10, rot: 0, side: "F", padNets: { 1: "GND", 8: "VCC" } });
  p.pcb.footprints.push({ id: "f2", ref: "R1", value: "10k", footprint: "R_0805", x: 40, y: 20, rot: 90, side: "B", padNets: { 1: "GND" } });
  p.pcb.vias.push({ id: "v1", x: 50, y: 30, d: 0.8, drill: 0.4, net: "GND" });
  p.pcb.tracks.push({ id: "t1", layer: "F.Cu", net: "VCC", w: 0.4, x1: 20, y1: 10, x2: 40, y2: 10 });
  p.pcb.zones.push({ id: "z1", layer: "B.Cu", net: "GND", pts: [[1, 1], [59, 1], [59, 39], [1, 39]], clearance: 0.3, thermal: true, priority: 0 });
  p.pcb.texts.push({ id: "x1", layer: "F.SilkS", text: "HELLO", x: 30, y: 35, size: 1.5, rot: 0 });
  return p;
}

test("boardShapeData lists every drill: DIP-8 + via = 9 holes", () => {
  const data = boardShapeData(demoProject());
  assert.equal(data.outline.length, 4);
  assert.equal(data.holes.length, 9);
  assert.equal(data.holes.filter((h) => h.kind === "via").length, 1);
  const pin1 = data.holes.find((h) => h.kind === "pad");
  assert.deepEqual([pin1.x, pin1.y, pin1.r], [20, 10, 0.4]);
  assert.ok(data.holes.every((h) => h.plated));
});

test("boardShapeData skips holes off the board and stacked duplicates", () => {
  const p = demoProject();
  p.pcb.vias.push({ id: "v2", x: 50, y: 30, d: 0.8, drill: 0.4 }, { id: "v3", x: 100, y: 100, d: 0.8, drill: 0.4 });
  p.pcb.footprints.push({ id: "f3", ref: "H1", footprint: "MountingHole_3.2mm", x: 5, y: 5, rot: 0, side: "F", padNets: {} });
  const data = boardShapeData(p);
  assert.equal(data.holes.length, 10);
  assert.equal(data.holes.find((h) => h.ref === "H1").plated, false);
});

test("buildBoardGeometry: slab of the right thickness, three material groups, UVs in range", () => {
  const p = demoProject();
  const layout = textureLayout(p.pcb);
  const data = boardShapeData(p);
  const g = buildBoardGeometry(THREE, data, 1.6, layout);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  assert.ok(Math.abs(bb.min.y) < 1e-6 && Math.abs(bb.max.y - 1.6) < 1e-6, "Y spans the thickness");
  assert.ok(Math.abs(bb.min.x) < 1e-6 && Math.abs(bb.max.x - 60) < 1e-6, "X = board x");
  assert.ok(Math.abs(bb.min.z) < 1e-6 && Math.abs(bb.max.z - 40) < 1e-6, "Z = board y");
  assert.deepEqual(g.groups.map((x) => x.materialIndex).sort(), [0, 1, 2]);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const top = g.groups.find((x) => x.materialIndex === 0);
  for (let i = top.start; i < top.start + top.count; i++) {
    assert.ok(Math.abs(pos.getY(i) - 1.6) < 1e-6, "top group is on the top face");
    const [u, v] = boardUV(layout, pos.getX(i), pos.getZ(i));
    assert.ok(Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - v) < 1e-6);
    assert.ok(u >= -1e-6 && u <= 1 + 1e-6 && v >= -1e-6 && v <= 1 + 1e-6);
  }
  const bottom = g.groups.find((x) => x.materialIndex === 1);
  for (let i = bottom.start; i < bottom.start + bottom.count; i++) assert.ok(Math.abs(pos.getY(i)) < 1e-6);
  // Board point (20,10) (U1 pin 1) is a hole: no top-face triangle covers it.
  const P = (i) => [pos.getX(i), pos.getZ(i)];
  const inside = (pt, a, b, c) => {
    const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    const d1 = s(pt, a, b), d2 = s(pt, b, c), d3 = s(pt, c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  let covered = 0;
  let coveredSolid = 0;
  for (let i = top.start; i < top.start + top.count; i += 3) {
    if (inside([20, 10], P(i), P(i + 1), P(i + 2))) covered++;
    if (inside([30, 30], P(i), P(i + 1), P(i + 2))) coveredSolid++;
  }
  assert.equal(covered, 0, "drill is open");
  assert.ok(coveredSolid >= 1, "solid area is covered");
  const barrels = buildBarrelGeometry(THREE, data.holes, 1.6);
  assert.ok(barrels.attributes.position.count > 0);
});

test("buildBoardGeometry handles a counter-clockwise outline too", () => {
  const p = demoProject();
  p.pcb.outline = [[0, 0], [0, 40], [60, 40], [60, 0]];
  const g = buildBoardGeometry(THREE, boardShapeData(p), 1.6, textureLayout(p.pcb));
  assert.deepEqual(g.groups.map((x) => x.materialIndex).sort(), [0, 1, 2]);
});

test("textureLayout is adaptive and capped", () => {
  const p = newProject();
  const l = textureLayout(p.pcb);
  assert.equal(l.scale, 20);
  assert.equal(l.width, 1200);
  assert.equal(l.height, 800);
  p.pcb.outline = [[0, 0], [400, 0], [400, 100], [0, 100]];
  const big = textureLayout(p.pcb);
  assert.ok(big.width <= 4096 && big.scale < 20);
  assert.ok(Math.abs(big.w * big.scale - big.width) < 1e-6);
});

test("palettes", () => {
  assert.equal(maskPalette("green").base, "#0f4d22");
  assert.equal(maskPalette("Purple").base, "#4b1f6f");
  assert.match(maskPalette("#336699").copper, /^#[0-9a-f]{6}$/);
  assert.equal(finishColor("ENIG"), "#dcb352");
  assert.notEqual(finishColor("HASL"), finishColor("ENIG"));
  assert.equal(silkPalette("black"), "#151515");
});

// Minimal recording 2D context (enough for paintBoardSide and paintZone).
function stubCanvas(w, h) {
  const canvas = { width: w, height: h };
  const calls = [];
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const ctx = {
    canvas, calls,
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", lineJoin: "", font: "", textAlign: "", textBaseline: "", globalCompositeOperation: "source-over",
    save() { stack.push(m.slice()); }, restore() { m = stack.pop() || [1, 0, 0, 1, 0, 0]; },
    setTransform(a, b, c, d, e, f) { m = typeof a === "object" ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; },
    getTransform() { return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }; },
    translate() {}, rotate() {}, scale() {},
  };
  for (const name of ["fillRect", "beginPath", "moveTo", "lineTo", "arc", "arcTo", "rect", "closePath", "fill", "stroke", "fillText", "drawImage"]) {
    ctx[name] = (...args) => calls.push({ name, style: name === "stroke" ? ctx.strokeStyle : ctx.fillStyle, args });
  }
  canvas.getContext = () => ctx;
  return canvas;
}

test("paintBoardSide paints mask, copper, pads and silk for each side", () => {
  const p = demoProject();
  const layout = textureLayout(p.pcb);
  const makeCanvas = (w, h) => stubCanvas(w, h);
  const top = stubCanvas(layout.width, layout.height).getContext();
  const st = paintBoardSide(top, p, "top", layout, {}, { makeCanvas, strokeText });
  assert.equal(st.tracks, 1);
  assert.equal(st.pads, 8); // DIP-8 THT pads; R1 is on the back
  assert.equal(st.zones, 0);
  assert.equal(st.vias, 1);
  assert.equal(st.texts, 2); // U1 + HELLO
  assert.equal(top.calls[0].name, "fillRect");
  assert.equal(top.calls[0].style, maskPalette("green").base);
  assert.ok(top.calls.some((c) => c.name === "fill" && c.style === finishColor("HASL")));
  assert.ok(top.calls.some((c) => c.name === "stroke" && c.style === silkPalette("white")));
  assert.ok(!top.calls.some((c) => c.name === "fillText"), "stroke font used when given");

  const bot = stubCanvas(layout.width, layout.height).getContext();
  const sb = paintBoardSide(bot, p, "bottom", layout, { maskColor: "red" }, { makeCanvas });
  assert.equal(sb.zones, 1);
  assert.equal(sb.tracks, 0);
  assert.equal(sb.pads, 10); // 8 THT + 2 SMD of R1
  assert.equal(sb.texts, 1); // R1 (mirrored), via fillText fallback
  assert.ok(bot.calls.some((c) => c.name === "fillText"));
  assert.ok(bot.calls.some((c) => c.name === "drawImage"), "zone layer composited");
  assert.equal(bot.calls[0].style, maskPalette("red").base);

  const bare = stubCanvas(layout.width, layout.height).getContext();
  const sn = paintBoardSide(bare, p, "top", layout, { copper: false, silkscreen: false, soldermask: false }, { makeCanvas });
  assert.equal(sn.pads + sn.tracks + sn.texts + sn.silk, 0);
  assert.notEqual(bare.calls[0].style, maskPalette("green").base);

  const pbr = stubCanvas(layout.width, layout.height).getContext();
  paintBoardSide(pbr, p, "top", layout, { mode: "pbr" }, { makeCanvas });
  assert.ok(pbr.calls.some((c) => c.name === "fill" && c.style === "rgb(0,75,255)"), "pads metallic in pbr map");
});

test("axial resistors get the colour code of their value", async () => {
  const { resistorBandNames } = await import("../../src/view3d/viewer.js");
  assert.deepEqual(resistorBandNames("4k7"), ["yellow", "violet", "red", "gold"]);
  assert.deepEqual(resistorBandNames("330"), ["orange", "orange", "brown", "gold"]);
  assert.deepEqual(resistorBandNames("4.7"), ["yellow", "violet", "gold", "gold"]);
  assert.equal(resistorBandNames("abc"), null);
});

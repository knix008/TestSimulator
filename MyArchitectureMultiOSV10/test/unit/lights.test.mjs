// Unit tests for light fixtures: the Lighting catalogue (src/lib/furniture.js),
// light settings on load and save (src/core/project.js), lamp anchors in the
// 3D building (src/view3d/build.js), the capped pool of real lights
// (src/view3d/lamps.js) and switching lamps as undoable edits (src/ui/lights.js).
// Run: node --test test/unit/lights.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { buildBuilding, makeMaterials, GLOW } from "../../src/view3d/build.js";
import { collectLamps, pickLamps, createLampRig, lampCandela, LAMP_CAP } from "../../src/view3d/lamps.js";
import { allFurniture, furnitureDef, makeFurniture, isLight, lightOf, normalizeLight, mountElevation, drawLightSymbol, FURNITURE_CATEGORIES } from "../../src/lib/furniture.js";
import { newProject, normalizeProject, parseProject, serializeProject } from "../../src/core/project.js";
import { runCheck } from "../../src/core/check.js";
import { hitTest } from "../../src/plan/ops.js";
import { Store } from "../../src/ui/store.js";
import { switchLamps, lamps, anyLampOn } from "../../src/ui/lights.js";

const mats = () => makeMaterials(THREE, { textures: false });
const LAMP_KINDS = ["ceilingLight", "pendantLamp", "downlight", "spotlight", "trackLight", "wallSconce", "tableLamp"];

function project(furniture) {
  const p = newProject("lights");
  const lv = p.levels[0].id;
  p.furniture = furniture.map((f, i) => ({ id: f.id || `L${i}`, level: lv, ...f }));
  return normalizeProject(p);
}
const lampsIn = (root) => { const out = []; root.traverse((o) => { if (o.userData && o.userData.lamp) out.push(o); }); return out; };

describe("Lighting catalogue", () => {
  test("a Lighting category with ceiling, pendant, recessed, spot, track, wall and table lights", () => {
    assert.ok(FURNITURE_CATEGORIES.includes("Lighting"));
    for (const k of LAMP_KINDS) {
      const d = furnitureDef(k);
      assert.ok(d, k);
      assert.equal(d.cat, "Lighting", k);
      assert.ok(d.light && ["point", "spot"].includes(d.light.type), k);
      assert.ok(d.light.lumens > 0, k);
    }
    assert.ok(isLight(makeFurniture("floorLamp", 0, 0)), "the floor lamp is a light too");
    assert.ok(!isLight(makeFurniture("sofa3", 0, 0)));
    assert.ok(allFurniture().filter((d) => d.light).length >= LAMP_KINDS.length + 1);
  });

  test("every lamp has a glowing part and its bulb inside its box", () => {
    for (const def of allFurniture().filter((d) => d.light)) {
      const it = makeFurniture(def.kind, 0, 0);
      const l = lightOf(it);
      assert.ok(def.parts(it.w, it.d, it.h).some((p) => p.g > 0), `${def.kind} glows`);
      const [x, y, z] = l.at;
      assert.ok(Math.abs(x) <= it.w / 2 && Math.abs(y) <= it.d / 2 && z >= 0 && z <= it.h, `${def.kind} bulb at ${l.at}`);
      if (l.type === "spot") assert.ok(l.beam >= 5 && l.beam <= 170 && l.dir.length === 3, def.kind);
    }
  });

  test("makeFurniture: lamps come on, ceiling lamps hang under the ceiling, wall lights at their height", () => {
    const c = makeFurniture("ceilingLight", 100, 200);
    assert.deepEqual(c.light, { on: true, lumens: 2000, color: "#ffdfba" });
    assert.equal(c.elevation, 2800 - c.h);
    assert.equal(mountElevation(furnitureDef("pendantLamp"), 3200), 3200 - 900);
    assert.equal(makeFurniture("wallSconce", 0, 0).elevation, 1800);
    assert.equal(makeFurniture("tableLamp", 0, 0).elevation, 0);
    assert.equal(makeFurniture("downlight", 0, 0).light.beam, 70, "spots have a beam angle");
    assert.equal(makeFurniture("sofa3", 0, 0).light, undefined);
  });
});

describe("light settings in the project", () => {
  test("normalizeProject fills in lamps, clamps values and drops stray light data", () => {
    const p = project([
      { kind: "ceilingLight", x: 0, y: 0 },
      { kind: "downlight", x: 1000, y: 0, light: { on: false, lumens: -50, color: "red", beam: 400 } },
      { kind: "sofa3", x: 0, y: 2000, light: { on: true } },
    ]);
    assert.deepEqual(p.furniture[0].light, { on: true, lumens: 2000, color: "#ffdfba" });
    assert.deepEqual(p.furniture[1].light, { on: false, lumens: 0, color: "#ffdfba", beam: 170 });
    assert.equal(p.furniture[2].light, undefined);
  });

  test("on/off, brightness, colour and beam survive save and load", () => {
    const p = project([{ kind: "spotlight", x: 0, y: 0, light: { on: false, lumens: 950, color: "#eef3ff", beam: 24 } }, { kind: "pendantLamp", x: 500, y: 0 }]);
    const back = parseProject(serializeProject(p));
    assert.deepEqual(back.furniture[0].light, { on: false, lumens: 950, color: "#eef3ff", beam: 24 });
    assert.equal(back.furniture[1].light.on, true);
  });

  test("a kind change into or out of a lamp fixes the light data", () => {
    const f = { kind: "sofa3", w: 1000, d: 1000, h: 800 };
    f.kind = "tableLamp";
    normalizeLight(f);
    assert.equal(f.light.on, true);
    f.kind = "chair";
    normalizeLight(f);
    assert.equal(f.light, undefined);
  });

  test("ceiling lamps and wall lights do not raise model-check warnings", () => {
    const p = newProject("room");
    const lv = p.levels[0].id;
    const W = (x1, y1, x2, y2) => ({ id: `w${x1}${y1}${x2}${y2}`, level: lv, x1, y1, x2, y2, thickness: 200 });
    p.walls = [W(0, 0, 4000, 0), W(4000, 0, 4000, 4000), W(4000, 4000, 0, 4000), W(0, 4000, 0, 0)];
    p.furniture = [
      { id: "c", level: lv, ...makeFurniture("ceilingLight", 2000, 2000) },
      { id: "t", level: lv, ...makeFurniture("diningTable4", 2000, 2000) },
      { id: "s", level: lv, ...makeFurniture("wallSconce", 2000, 100 + 80, { rot: 0 }) },
    ];
    const issues = runCheck(normalizeProject(p)).filter((i) => i.ids.some((id) => ["c", "t", "s"].includes(id)));
    assert.deepEqual(issues.map((i) => i.code), []);
  });

  test("the plan hit test prefers a lamp over the table under it", () => {
    const p = project([{ id: "table", kind: "diningTable4", x: 0, y: 0 }, { id: "lamp", kind: "pendantLamp", x: 0, y: 0 }]);
    p.furniture.reverse(); // the table drawn last would win without the lamp preference
    assert.equal(hitTest(p, p.levels[0].id, 10, 10, 50).obj.id, "lamp");
  });

  test("the plan symbol: a circle with a cross, with rays when on", () => {
    const calls = (on) => {
      const n = { arc: 0, moveTo: 0 };
      const ctx = new Proxy({}, { get: (_, k) => (k in n ? () => { n[k]++; } : () => {}), set: () => true });
      drawLightSymbol(ctx, { ...makeFurniture("ceilingLight", 0, 0), light: { on, lumens: 2000, color: "#ffffff" } }, { furniture: "#888" }, 10);
      return n;
    };
    const on = calls(true), off = calls(false);
    assert.equal(on.arc, 1);
    assert.equal(off.arc, 1);
    assert.equal(off.moveTo, 2, "off: just the cross");
    assert.equal(on.moveTo, 2 + 8, "on: the cross and eight rays");
  });
});

describe("lamps in the 3D building", () => {
  test("every lamp gets one anchor at its bulb; lit lamps glow, switched-off lamps do not", () => {
    const p = project([
      { id: "on", kind: "ceilingLight", x: 1000, y: 2000 },
      { id: "off", kind: "pendantLamp", x: 3000, y: 0, light: { on: false } },
      { id: "sofa", kind: "sofa3", x: 0, y: 4000 },
    ]);
    const root = buildBuilding(THREE, p, mats());
    const anchors = lampsIn(root);
    assert.equal(anchors.length, 2);
    const a = anchors.find((o) => o.userData.lamp.id === "on");
    assert.equal(a.userData.lamp.on, true);
    root.updateMatrixWorld(true);
    const pos = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld);
    const f = p.furniture.find((x) => x.id === "on");
    assert.ok(Math.abs(pos.x - 1.0) < 1e-6 && Math.abs(pos.z - 2.0) < 1e-6, `anchor ${pos.toArray()}`);
    assert.ok(Math.abs(pos.y - (f.elevation + lightOf(f).at[2]) / 1000) < 1e-6, "anchor at the bulb height");
    const glowOf = (id) => { const out = []; root.traverse((o) => { if (o.isMesh && o.userData.id === id && o.userData.glow) out.push(o.material.emissive && o.material.emissive.getHex() ? o.material.emissiveIntensity : 0); }); return out; };
    assert.ok(glowOf("on").length && glowOf("on").every((v) => v > 0), "lit lamp glows");
    assert.ok(glowOf("on").includes(GLOW), "bulb at full glow");
    assert.ok(glowOf("off").length && glowOf("off").every((v) => v === 0), "switched-off lamp is dark");
    assert.equal(lampsIn(buildBuilding(THREE, p, mats(), { furniture: false })).length, 0, "no furniture, no lamps");
  });

  test("a spot points down (and the spotlight tilts forward with the item's rotation)", () => {
    const p = project([{ id: "d", kind: "downlight", x: 0, y: 0 }, { id: "s", kind: "spotlight", x: 2000, y: 0, rot: 90 }]);
    const lamps = collectLamps(THREE, buildBuilding(THREE, p, mats()));
    const d = lamps.find((l) => l.id === "d"), s = lamps.find((l) => l.id === "s");
    assert.ok(d.dirW.y < -0.999, `downlight ${d.dirW.toArray()}`);
    assert.ok(s.dirW.y < -0.5, "spot points mostly down");
    // Item front (+y) turned 90° points to plan −x → world −X.
    assert.ok(s.dirW.x < -0.2 && Math.abs(s.dirW.z) < 1e-6, `spot ${s.dirW.toArray()}`);
  });

  test("pickLamps: only lit lamps, nearest first, capped per type", () => {
    const list = [];
    for (let i = 0; i < 30; i++) list.push({ kind: "ceilingLight", x: i * 2000, y: 0, light: { on: i % 3 !== 0 } });
    for (let i = 0; i < 20; i++) list.push({ kind: "downlight", x: i * 2000, y: 3000 });
    const p = project(list);
    const lamps = collectLamps(THREE, buildBuilding(THREE, p, mats()));
    assert.equal(lamps.length, 50);
    const eye = new THREE.Vector3(0, 1.5, 0);
    const pick = pickLamps(lamps, eye);
    assert.equal(pick.point.length, LAMP_CAP.point);
    assert.equal(pick.spot.length, LAMP_CAP.spot);
    assert.ok(pick.point.every((l) => l.on), "switched-off lamps never get a light");
    const far = pick.point.map((l) => l.pos.distanceTo(eye));
    assert.ok(far.every((d, i) => i === 0 || d >= far[i - 1] - 1e-9), "nearest first");
    assert.deepEqual(pickLamps(lamps.map((l) => ({ ...l, on: false })), eye), { point: [], spot: [] });
  });

  test("a section cut keeps the lamps of the levels below it (a ceiling lamp above the cut still lights its room)", () => {
    const p = newProject("two levels");
    p.levels.push({ id: "up", name: "2F", elevation: 3000, height: 2800, slab: 200 });
    p.furniture = [{ id: "low", level: p.levels[0].id, ...makeFurniture("ceilingLight", 0, 0) }, { id: "high", level: "up", ...makeFurniture("ceilingLight", 0, 0) }];
    const lamps = collectLamps(THREE, buildBuilding(THREE, normalizeProject(p), mats()));
    const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.2); // the section 1.2 m above the ground floor
    const ids = pickLamps(lamps, new THREE.Vector3(0, 10, 0), { clip: cut }).point.map((l) => l.id);
    assert.deepEqual(ids, ["low"]);
    assert.equal(pickLamps(lamps, new THREE.Vector3(0, 10, 0)).point.length, 2, "no cut: both");
  });

  test("the lamp rig: a fixed pool, switches change intensities only", () => {
    const scene = new THREE.Scene();
    const rig = createLampRig(THREE, scene);
    const p = project(Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, kind: "ceilingLight", x: i * 1500, y: 0 })).concat([{ id: "d", kind: "downlight", x: 0, y: 2000, light: { on: false } }]));
    rig.setLamps(collectLamps(THREE, buildBuilding(THREE, p, mats())));
    const lightCount = () => { let n = 0; scene.traverse((o) => { if (o.isLight) n++; }); return n; };
    assert.equal(lightCount(), 6, "one light per lamp up to the cap");
    rig.update(new THREE.Vector3(0, 1.5, 0));
    assert.deepEqual([rig.info().point, rig.info().spot], [5, 0]);
    rig.setState("c0", { on: false });
    rig.setState("d", { on: true });
    rig.update(new THREE.Vector3(0, 1.5, 0));
    assert.deepEqual([rig.info().point, rig.info().spot], [4, 1]);
    assert.equal(lightCount(), 6, "switching keeps the pool (no shader recompiles)");
    for (const l of ["c1", "c2", "c3", "c4", "d"]) rig.setState(l, { on: false });
    rig.update(new THREE.Vector3(0, 1.5, 0));
    assert.equal(rig.info().active, 0);
    let shadows = 0;
    scene.traverse((o) => { if (o.isLight && o.castShadow) shadows++; });
    assert.equal(shadows, 0, "lamps cast no shadow maps");
    rig.dispose();
  });

  test("brightness: more lumens, more light; a narrow spot is brighter on axis", () => {
    assert.ok(lampCandela({ type: "point", lumens: 2000 }) > lampCandela({ type: "point", lumens: 800 }));
    assert.ok(lampCandela({ type: "spot", lumens: 600, beam: 30 }) > lampCandela({ type: "spot", lumens: 600, beam: 90 }));
    assert.equal(lampCandela({ type: "point", lumens: 0 }), 0);
  });
});

describe("switching lamps", () => {
  const store = (p) => { const s = new Store(); s.load(p); return s; };

  test("switchLamps flips the chosen lamps in one undo step; undo brings them back", () => {
    const p = project([{ id: "a", kind: "ceilingLight", x: 0, y: 0 }, { id: "b", kind: "tableLamp", x: 1000, y: 0 }, { id: "s", kind: "sofa3", x: 0, y: 3000 }]);
    const app = { store: store(p), v3d: {}, plan: { sel: new Set() }, tab: "plan" };
    assert.equal(lamps(app.store.project).length, 2);
    assert.equal(switchLamps(app, ["a", "b", "s"], false), 2);
    assert.ok(!anyLampOn(app.store.project));
    assert.equal(switchLamps(app, ["a", "b"], false), 0, "already off: no edit");
    assert.equal(switchLamps(app, ["a"]), 1, "flip");
    assert.equal(app.store.project.furniture.find((f) => f.id === "a").light.on, true);
    app.store.undo();
    assert.equal(app.store.project.furniture.find((f) => f.id === "a").light.on, false);
    app.store.undo();
    assert.ok(app.store.project.furniture.filter(isLight).every((f) => f.light.on), "one undo per switch");
  });

  test("a switch reaches an open 3D view straight away", () => {
    const p = project([{ id: "a", kind: "ceilingLight", x: 0, y: 0 }]);
    let synced = 0;
    const app = { store: store(p), v3d: { viewer: {}, syncModel: () => { synced++; } }, plan: { sel: new Set() }, tab: "3d" };
    switchLamps(app, ["a"], false);
    assert.equal(synced, 1);
  });
});

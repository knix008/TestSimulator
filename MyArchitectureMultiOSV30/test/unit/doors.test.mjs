// Unit tests for doors opened and closed one by one (src/core/doors.js, the
// door leaf in src/view3d/build.js): a door's own angle wins over the view's
// "Open doors" switch, toggling remembers the last angle, the walk-through
// opens every door, the project keeps the setting, and the 3D leaf turns.
// Run: node --test test/unit/doors.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { doorAngle, isOpen, toggledOpen, setDoors, followSwitch, OPEN_ANGLE, DOOR_TYPES, DOOR_STYLES } from "../../src/core/doors.js";
import { newProject, parseProject } from "../../src/core/project.js";
import { buildBuilding, makeMaterials } from "../../src/view3d/build.js";
import { loadSb } from "../../src/view3d/sbitems.js";
import { libraryItems, allFurniture, openingTypeOf } from "../../src/lib/furniture.js";

const D = (extra = {}) => ({ id: "d", kind: "door", type: "single", ...extra });

function house(doorExtra = {}) {
  const p = newProject("Doors");
  const lv = p.levels[0].id;
  p.walls = [{ id: "a", level: lv, x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 200, height: null }];
  p.openings = [{ id: "d", wall: "a", kind: "door", type: "single", at: 2000, width: 900, height: 2100, sill: 0, side: 1, hinge: "start", ...doorExtra }];
  return parseProject(JSON.stringify(p));
}

/** How far the door's leaf reaches out of the wall (m): about 0 when closed, near its width when open. */
function leafReach(p, opts = {}) {
  const g = buildBuilding(THREE, p, makeMaterials(THREE, { textures: false }), { furniture: false, roofs: false, ...opts });
  g.updateMatrixWorld(true);
  let door = null;
  g.traverse((o) => { if (!door && o.userData.kind === "openings" && o.userData.id === "d" && o.children.length) door = o; });
  assert.ok(door, "the door in 3D");
  const box = new THREE.Box3().setFromObject(door);
  return box.max.z - 0.1; // the wall's face is at z = 0.1 m (thickness 200 mm), the leaf opens to +z (side 1)
}

describe("doors open and closed one by one", () => {
  test("a door's own angle wins; unset follows the view's switch; windows never open", () => {
    assert.equal(doorAngle(D(), false), 0);
    assert.equal(doorAngle(D(), true), OPEN_ANGLE);
    assert.equal(doorAngle(D({ open: 0 }), true), 0, "closed on its own stays closed");
    assert.equal(doorAngle(D({ open: 40 }), false), 40, "open on its own");
    assert.equal(doorAngle(D({ open: 500 }), false), 110, "at most 110°");
    assert.equal(doorAngle(D({ open: 0 }), false, { force: true }), OPEN_ANGLE, "the walk-through opens it");
    assert.equal(doorAngle({ kind: "window", open: 90 }, true), 0);
    assert.ok(isOpen(D({ open: 10 })));
  });

  test("toggle: closed → open (the last angle, else 90°), open → closed; back to following the switch", () => {
    assert.equal(toggledOpen(D(), false), 90);
    assert.equal(toggledOpen(D({ lastOpen: 45 }), false), 45);
    assert.equal(toggledOpen(D(), true), 0, "open by the switch: toggling closes it");
    const p = house();
    assert.equal(setDoors(p, ["d"], { open: true, angle: 60 }), 1);
    assert.deepEqual([p.openings[0].open, p.openings[0].lastOpen], [60, 60]);
    setDoors(p, ["d"]);
    assert.equal(p.openings[0].open, 0);
    setDoors(p, ["d"]);
    assert.equal(p.openings[0].open, 60, "opens again to where it was");
    assert.equal(followSwitch(p, ["d"]), 1);
    assert.equal(p.openings[0].open, undefined);
  });

  test("the project keeps it (a valid angle on doors only)", () => {
    assert.equal(house({ open: 35 }).openings[0].open, 35);
    assert.equal(house({ open: "x" }).openings[0].open, undefined);
    assert.equal(house({ open: -20 }).openings[0].open, 0);
    const w = parseProject(JSON.stringify({ ...house(), openings: [{ id: "w", wall: "a", kind: "window", at: 2000, width: 1200, open: 90 }] }));
    assert.equal(w.openings[0].open, undefined);
  });

  test("3D: the leaf stands in the wall when closed and swings out when open", () => {
    const closed = leafReach(house());
    const switchOpen = leafReach(house(), { openDoors: true });
    const ownOpen = leafReach(house({ open: 90 }));
    const ownClosed = leafReach(house({ open: 0 }), { openDoors: true });
    const forced = leafReach(house({ open: 0 }), { openDoors: true, forceOpenDoors: true });
    assert.ok(closed < 0.08, `closed ${closed}`);
    assert.ok(switchOpen > 0.6, `open by the switch ${switchOpen}`);
    assert.ok(ownOpen > 0.75, `open on its own ${ownOpen}`);
    assert.ok(ownClosed < 0.08, `closed on its own though the switch is on ${ownClosed}`);
    assert.ok(forced > 0.6, `walk-through ${forced}`);
  });
});

describe("every kind of door in 3D", () => {
  const doorGroup = (p, opts = {}) => {
    const g = buildBuilding(THREE, p, makeMaterials(THREE, { textures: false }), { furniture: false, roofs: false, ...opts });
    g.updateMatrixWorld(true);
    let door = null;
    g.traverse((o) => { if (!door && o.userData.kind === "openings" && o.userData.id === "d" && o.children.length) door = o; });
    return door;
  };
  const meshes = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh && c.visible) n++; }); return n; };
  // Where the moving parts are (a Box3 of everything tagged for the walk-through).
  const moving = (door) => {
    const box = new THREE.Box3();
    door.traverse((c) => { if (c.userData.leaf || c.userData.slide) box.expandByObject(c); });
    return box;
  };

  test("each type with each style builds, with a leaf the walk-through can move (garage: panels)", () => {
    for (const [type] of DOOR_TYPES) for (const [style] of DOOR_STYLES) {
      const door = doorGroup(house({ type, style, width: type === "double" || type === "garage" ? 1600 : 900 }));
      assert.ok(door, `${type}/${style}`);
      assert.ok(meshes(door) >= 4, `${type}/${style}: drawn`);
      let tagged = 0;
      door.traverse((c) => { if (c.userData.leaf || c.userData.slide) tagged++; });
      if (type !== "garage") assert.ok(tagged >= 1, `${type}/${style}: a moving leaf`);
    }
  });

  test("a closed door of any type and style stays within the wall and its trim (nothing sticks out)", () => {
    for (const [type] of DOOR_TYPES) for (const [style] of DOOR_STYLES) {
      const door = doorGroup(house({ type, style, width: type === "double" || type === "garage" ? 1600 : 900 }));
      const box = new THREE.Box3().setFromObject(door);
      // The wall is 200 mm thick (z ±0.1 m); handles, trim and a barn door's rail reach a little further.
      assert.ok(box.max.z < 0.32 && box.min.z > -0.2, `${type}/${style}: z ${box.min.z.toFixed(2)}…${box.max.z.toFixed(2)}`);
      assert.ok(box.max.y < 2.6, `${type}/${style}: top ${box.max.y.toFixed(2)}`);
    }
  });

  test("the styles look different (their parts differ)", () => {
    const counts = new Set(DOOR_STYLES.map(([style]) => meshes(doorGroup(house({ style })))));
    assert.ok(counts.size >= 7, `${counts.size} different looks`);
  });

  test("swing and folding leaves turn out of the wall; sliding, pocket and barn leaves slide along it", () => {
    for (const type of ["single", "double", "folding"]) {
      const shut = moving(doorGroup(house({ type, width: 1200 }))), open = moving(doorGroup(house({ type, width: 1200, open: 90 })));
      assert.ok(open.max.z - shut.max.z > 0.25, `${type} turns out (${(open.max.z - shut.max.z).toFixed(2)} m)`);
    }
    for (const type of ["sliding", "pocket", "barn"]) {
      const shut = moving(doorGroup(house({ type }))), open = moving(doorGroup(house({ type, open: 90 })));
      const dx = Math.abs(open.getCenter(new THREE.Vector3()).x - shut.getCenter(new THREE.Vector3()).x);
      assert.ok(dx > 0.3, `${type} slides (${dx.toFixed(2)} m)`);
      assert.ok(Math.abs(open.max.z - shut.max.z) < 0.01, `${type} stays in its plane`);
    }
  });

  test("a pocket door slides into the wall; a barn door hangs on its face", () => {
    const pocket = moving(doorGroup(house({ type: "pocket" })));
    assert.ok(pocket.max.z <= 0.1 && pocket.min.z >= -0.1, "inside the wall's thickness");
    const barn = moving(doorGroup(house({ type: "barn" })));
    assert.ok(barn.min.z > 0.1, "in front of the wall's face");
    // Wider than the opening, so it covers it.
    assert.ok(barn.max.x - barn.min.x > 0.9, "covers the opening");
  });
});

describe("doors and windows from the library", () => {
  const doors = libraryItems().filter((d) => d.opening === "door"), windows = libraryItems().filter((d) => d.opening === "window");

  test("the library has doors and windows (100 or more each); they are not furniture", () => {
    assert.ok(doors.length >= 100, `${doors.length} doors`);
    assert.ok(windows.length >= 100, `${windows.length} windows`);
    assert.ok(doors.every((d) => d.cat === "Doors" && d.ow > 300 && d.oh > 1000), "each with its hole's size");
    assert.ok(!allFurniture().some((d) => d.opening), "not offered as furniture");
    assert.ok(new Set(doors.map(openingTypeOf)).size >= 5, "their types are told apart (single, double, sliding, folding …)");
  });

  test("a library door opens in the walk-through: its model is built again at the angle reached", async () => {
    await loadSb();
    const hinged = doors.filter((d) => openingTypeOf(d) === "single").slice(0, 3);
    for (const d of hinged) {
      const p = house();
      p.openings = [{ id: "d", wall: "a", kind: "door", type: "single", item: d.kind, at: 2000, width: d.ow, height: d.oh, sill: 0, side: 1, hinge: "start" }];
      const g = buildBuilding(THREE, parseProject(JSON.stringify(p)), makeMaterials(THREE, { textures: false }), { furniture: false, roofs: false });
      g.updateMatrixWorld(true);
      let part = null;
      g.traverse((o) => { if (!part && o.userData.morph) part = o; });
      assert.ok(part, `${d.kind}: a part the walk-through can open`);
      const reach = (obj) => { const holder = new THREE.Group(); holder.add(obj); return new THREE.Box3().setFromObject(holder).max.z; };
      const shut = reach(part.userData.morph.make(0)), open = reach(part.userData.morph.make(90));
      assert.ok(open - shut > 0.4, `${d.kind}: the leaf turns out of the wall when open (${shut.toFixed(2)} → ${open.toFixed(2)} m)`);
    }
  });

  test("a library door and window are built in their hole", async () => {
    await loadSb();
    for (const d of [doors[0], doors.find((x) => openingTypeOf(x) === "sliding"), windows[0]]) {
      const kind = d.opening;
      const p = house();
      p.openings = [{ id: "d", wall: "a", kind, type: openingTypeOf(d), item: d.kind, at: 2000, width: d.ow, height: d.oh, sill: kind === "window" ? 900 : 0, side: 1, hinge: "start" }];
      const g = buildBuilding(THREE, parseProject(JSON.stringify(p)), makeMaterials(THREE, { textures: false }), { furniture: false, roofs: false });
      g.updateMatrixWorld(true);
      let door = null;
      g.traverse((o) => { if (!door && o.userData.kind === "openings" && o.userData.id === "d") door = o; });
      const box = new THREE.Box3().setFromObject(door);
      const c = box.getCenter(new THREE.Vector3());
      assert.ok(Math.abs(c.x - 2) < 0.1, `${d.kind}: centred on the opening (${c.x.toFixed(2)})`);
      assert.ok(box.max.x - box.min.x > d.ow / 1000 - 0.05 && box.max.x - box.min.x < d.ow / 1000 + 0.5, `${d.kind}: as wide as the hole (${(box.max.x - box.min.x).toFixed(2)} m)`);
      assert.ok(box.max.z < 0.6 && box.min.z > -0.6, `${d.kind}: in the wall (${box.min.z.toFixed(2)}…${box.max.z.toFixed(2)})`);
      if (kind === "window") assert.ok(box.min.y > 0.7, `${d.kind}: on its sill (${box.min.y.toFixed(2)})`);
    }
  });
});

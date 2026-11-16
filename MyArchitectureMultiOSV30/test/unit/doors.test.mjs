// Unit tests for doors opened and closed one by one (src/core/doors.js, the
// door leaf in src/view3d/build.js): a door's own angle wins over the view's
// "Open doors" switch, toggling remembers the last angle, the walk-through
// opens every door, the project keeps the setting, and the 3D leaf turns.
// Run: node --test test/unit/doors.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { doorAngle, isOpen, toggledOpen, setDoors, followSwitch, OPEN_ANGLE } from "../../src/core/doors.js";
import { newProject, parseProject } from "../../src/core/project.js";
import { buildBuilding, makeMaterials } from "../../src/view3d/build.js";

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

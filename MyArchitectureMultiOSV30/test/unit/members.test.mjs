// Unit tests for structural members: the section and frame maths
// (src/core/members.js), the 3D (src/view3d/members.js, shared geometries
// that batch.js instances) and the plan edits (src/plan/elements.js, ops.js).
// Run: node --test test/unit/members.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { normalizeMember, memberSection, memberArea, memberLength, memberWeight, segmentFrame, sectionTriangles, MEMBER_PROFILES } from "../../src/core/members.js";
import { buildBuilding, makeMaterials, modelExtent, levelKeys } from "../../src/view3d/build.js";
import { createBatcher } from "../../src/view3d/batch.js";
import { wirePoint, WIRE_MAX } from "../../src/view3d/members.js";
import { pullForward, GROUND_OFFSET, rankedMaterial, rankOf, nearPlane, DEPTH_CLASS } from "../../src/view3d/depth.js";
import { newProject, normalizeProject } from "../../src/core/project.js";
import { hitElements, transformElements, boxSelectElements } from "../../src/plan/elements.js";
import { pasteItems, copyItems } from "../../src/plan/ops.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
const mats = () => makeMaterials(THREE, { textures: false });
const mem = (extra = {}) => normalizeMember({ id: "m", level: "L", pts: [[0, 0, 3000], [6000, 0, 3000]], profile: "H", w: 300, h: 300, t: 15, ...extra });
function project(members) {
  const p = newProject("Members");
  p.levels[0].id = "L";
  p.levels[0].elevation = 1000;
  p.view.level = "L";
  p.members = members;
  return normalizeProject(p);
}
const worldBox = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

describe("core/members.js", () => {
  test("normalize fills sizes, profile, role and material", () => {
    const m = normalizeMember({ pts: [[0, 0], [1000, 0, "x"]], profile: "nope" });
    assert.deepEqual(m.pts, [[0, 0, 0], [1000, 0, 0]]);
    assert.equal(m.profile, "rect");
    assert.equal(m.role, "beam");
    assert.equal(m.material, "steel");
    assert.equal(normalizeMember({ pts: [], profile: "cable" }).material, "cable");
  });

  test("every profile has a closed section with a positive area", () => {
    for (const profile of MEMBER_PROFILES) {
      const m = mem({ profile, w: 300, h: 400, t: 20 });
      const area = memberArea(m);
      assert.ok(area > 0 && area <= 300 * 400 + 1, `${profile} ${area}`);
      const tris = sectionTriangles(memberSection(m));
      const sum = tris.reduce((s, [a, b, c]) => s + ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2, 0);
      near(sum, area, area * 1e-6, `${profile} triangles cover the section`);
    }
  });

  test("areas: box = outer − inner, tube = annulus", () => {
    near(memberArea(mem({ profile: "box", w: 200, h: 100, t: 10 })), 200 * 100 - 180 * 80, 1e-6);
    const tube = memberArea(mem({ profile: "tube", w: 200, t: 10 }));
    near(tube, Math.PI * (100 ** 2 - 90 ** 2), Math.PI * 100 ** 2 * 0.02, "tube (20-gon)");
  });

  test("length and weight", () => {
    const m = mem({ pts: [[0, 0, 0], [3000, 4000, 0], [3000, 4000, 2000]] });
    near(memberLength(m), 7000);
    near(memberWeight(m, 7850), (memberArea(m) / 1e6) * 7 * 7850, 1e-6);
  });

  test("frames: level u across, v up, t along; a vertical member has u on plan x", () => {
    const f = segmentFrame([0, 0, 0], [1000, 0, 0]);
    assert.deepEqual(f.t, [1, 0, 0]);
    near(f.v[2], 1);
    near(Math.abs(f.u[1]), 1);
    const v = segmentFrame([0, 0, 0], [0, 0, 3000]);
    assert.deepEqual(v.u, [1, 0, 0]);
    near(v.length, 3000);
    const r = segmentFrame([0, 0, 0], [1000, 0, 0], 90);
    near(Math.abs(r.u[2]), 1, 1e-9, "rolled 90°: u points up");
  });
});

describe("3D", () => {
  test("a horizontal member spans its axis at its height, its section around it", () => {
    const p = project([{ id: "a", level: "L", pts: [[0, 0, 3000], [6000, 0, 3000]], profile: "rect", w: 200, h: 400 }]);
    const g = buildBuilding(THREE, p, mats()).getObjectByName("member a");
    const b = worldBox(g);
    near(b.min.x, 0, 1e-6); near(b.max.x, 6, 1e-6);
    near(b.min.y, 1 + 3 - 0.2, 1e-6, "bottom (elevation 1 m + 3 m − 0.2)"); near(b.max.y, 1 + 3 + 0.2, 1e-6);
    near(b.max.z - b.min.z, 0.2, 1e-6, "200 wide across");
  });

  test("a post stands from the floor to its top; a brace climbs", () => {
    const p = project([
      { id: "post", level: "L", pts: [[1000, 2000, 0], [1000, 2000, 3000]], profile: "box", w: 200, h: 200, t: 10 },
      { id: "brace", level: "L", pts: [[0, 0, 0], [3000, 0, 3000]], profile: "tube", w: 100, t: 5 },
    ]);
    const root = buildBuilding(THREE, p, mats());
    const b = worldBox(root.getObjectByName("member post"));
    near(b.min.y, 1, 1e-6); near(b.max.y, 4, 1e-6);
    near((b.min.x + b.max.x) / 2, 1, 1e-6); near((b.min.z + b.max.z) / 2, 2, 1e-6);
    const c = worldBox(root.getObjectByName("member brace"));
    assert.ok(c.max.y - c.min.y > 2.9 && c.max.x - c.min.x > 2.9);
  });

  test("a polyline member is one mesh per segment, tagged", () => {
    const p = project([{ id: "arch", level: "L", pts: [[0, 0, 0], [2000, 0, 2000], [4000, 0, 2500], [6000, 0, 2000], [8000, 0, 0]], profile: "box", w: 300, h: 300 }]);
    const g = buildBuilding(THREE, p, mats()).getObjectByName("member arch");
    assert.equal(g.children.length, 4);
    for (const c of g.children) { assert.equal(c.userData.id, "arch"); assert.equal(c.userData.kind, "members"); }
  });

  test("slender round members (cables, rods) get a centre-line wire; angles and heavy members do not", () => {
    const p = project([
      { id: "c", level: "L", pts: [[0, 0, 0], [9000, 0, 6000]], profile: "cable", w: 80 },
      { id: "r", level: "L", pts: [[0, 1000, 0], [0, 1000, 3000]], profile: "round", w: 30 },
      { id: "big", level: "L", pts: [[0, 2000, 0], [0, 2000, 3000]], profile: "tube", w: WIRE_MAX + 100, t: 10 },
      { id: "ang", level: "L", pts: [[0, 3000, 0], [3000, 3000, 3000]], profile: "L", w: 75, h: 75, t: 8 },
    ]);
    const b = buildBuilding(THREE, p, mats());
    const wire = (id) => b.getObjectByName(`member ${id}`).children[0].userData.wire;
    assert.deepEqual(wire("c"), [0, 0]);
    assert.deepEqual(wire("r"), [0, 0]);
    assert.equal(wire("big"), undefined);
    assert.equal(wire("ang"), undefined);
  });
  test("a wire runs inside the material: in an angle's heel and a channel's web, not the empty middle", () => {
    const inside = (m) => {
      const [u, v] = wirePoint(m);
      const ring = memberSection(m).outer;
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (const profile of MEMBER_PROFILES) {
      if (profile === "tube" || profile === "box") continue; // hollow: the wire runs down the middle
      const m = normalizeMember({ id: "m", level: "L", pts: [[0, 0, 0], [1000, 0, 0]], profile, w: 100, h: 120, t: 8 });
      assert.ok(inside(m), `${profile}: wire at ${wirePoint(m)}`);
    }
  });
  test("depth fixes: edge and wire lines move towards the camera; the ground disc gives way", () => {
    const m = pullForward(new THREE.LineBasicMaterial());
    const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader }; // LineBasicMaterial's shader
    m.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /#include <project_vertex>\s*gl_Position\.z -= [\d.e-]+ \* gl_Position\.w;/);
    assert.ok(GROUND_OFFSET.polygonOffset && GROUND_OFFSET.polygonOffsetFactor > 0 && GROUND_OFFSET.polygonOffsetUnits > 0);
  });
  test("depth ranks: roofs over walls over slabs over masses over the ground; copies are shared", () => {
    assert.ok(rankOf("roofs") < rankOf("walls") && rankOf("walls") < rankOf("slabs") && rankOf("slabs") < rankOf("solids"));
    assert.equal(rankOf("rooms"), rankOf("slabs"));
    assert.equal(rankOf("something new"), 0, "unknown kinds stand with the walls");
    const offset = (m) => (m.polygonOffset ? m.polygonOffsetFactor + m.polygonOffsetUnits : 0);
    const base = new THREE.MeshStandardMaterial({ color: 0x808080 });
    assert.equal(rankedMaterial(base, 0), base, "rank 0 keeps the material");
    const ranks = [...new Set(Object.values(DEPTH_CLASS))].sort((a, b) => a - b);
    const mats = ranks.map((r) => rankedMaterial(base, r));
    for (let i = 1; i < mats.length; i++) assert.ok(offset(mats[i]) > offset(mats[i - 1]), `rank ${ranks[i]} behind ${ranks[i - 1]}`);
    assert.ok(GROUND_OFFSET.polygonOffsetFactor + GROUND_OFFSET.polygonOffsetUnits > offset(mats[mats.length - 1]), "the ground behind everything");
    assert.equal(rankedMaterial(base, 1), rankedMaterial(base, 1), "one copy per material and rank (batching groups them)");
    assert.equal(rankedMaterial(base, 1).color.getHex(), 0x808080);
    // An offset already on the material (the line drawing's paper) is kept and added to.
    const paper = new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    assert.ok(offset(rankedMaterial(paper, 1)) > offset(paper));
  });
  test("near plane: half the free space in front of the camera, within its limits", () => {
    assert.equal(nearPlane({ boxDistance: 40, groundHeight: 30 }), 15);
    assert.equal(nearPlane({ boxDistance: 10, groundHeight: 30 }), 5);
    assert.equal(nearPlane({ boxDistance: 0, groundHeight: 1.6 }), 0.03, "inside the model: walking through rooms");
    assert.equal(nearPlane({ boxDistance: 40, groundHeight: -2 }), 20, "under the ground the ground does not count");
    assert.equal(nearPlane({ boxDistance: 1e6, groundHeight: 1e6, max: 3 }), 3);
  });
  test("identical members share one geometry and batch into one draw call", () => {
    const list = [];
    for (let i = 0; i < 200; i++) list.push({ id: `b${i}`, level: "L", pts: [[i * 500, 0, 0], [i * 500 + 250, 0, 3000]], profile: "L", w: 100, h: 100, t: 8, material: "galvanised" });
    const root = buildBuilding(THREE, project(list), mats());
    const geos = new Set();
    root.traverse((o) => { if (o.isMesh && o.userData.kind === "members") geos.add(o.geometry); });
    assert.equal(geos.size, 1);
    const b = createBatcher(THREE);
    b.build(root);
    assert.equal(b.info().batches, 1);
    assert.equal(b.info().instances, 200);
  });

  test("members count in the model extent and the level keys", () => {
    const p = project([{ id: "mast", level: "L", pts: [[0, 0, 0], [0, 0, 50000]], profile: "tube", w: 800, t: 20 }]);
    assert.ok(modelExtent(p).top >= 51000);
    const k1 = levelKeys(p).get("L")[1];
    p.members[0].pts[1][2] = 60000;
    assert.notEqual(levelKeys(p).get("L")[1], k1);
  });
});

describe("plan edits", () => {
  test("hit test and box select find a member", () => {
    const p = project([{ id: "a", level: "L", pts: [[0, 0, 3000], [6000, 0, 3000]], profile: "rect", w: 200, h: 400 }]);
    assert.equal(hitElements(p, "L", 3000, 50, 10).obj.id, "a");
    assert.equal(hitElements(p, "L", 3000, 500, 10), null);
    assert.deepEqual(boxSelectElements(p, "L", (pts) => pts.every(([x, y]) => x >= -1 && x <= 6001 && Math.abs(y) < 10)), ["a"]);
  });

  test("moving, turning and pasting keep the heights", () => {
    const p = project([{ id: "a", level: "L", pts: [[0, 0, 500], [6000, 0, 2500]], profile: "rect" }]);
    transformElements(p, new Set(["a"]), (x, y) => [y, x]);
    assert.deepEqual(p.members[0].pts, [[0, 0, 500], [0, 6000, 2500]]);
    const clip = copyItems(p, ["a"]);
    const added = pasteItems(p, clip, "L", clip.centre[0] + 1000, clip.centre[1]);
    const copy = p.members.find((m) => added.includes(m.id));
    assert.deepEqual(copy.pts, [[1000, 0, 500], [1000, 6000, 2500]]);
  });
});

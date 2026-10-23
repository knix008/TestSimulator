import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject } from "../../src/core/project.js";
import { runDRC, polygonsOverlap, outlineProblem } from "../../src/pcb/drc.js";

let n = 0;
const fp = (footprint, ref, x, y, padNets = {}, extra = {}) =>
  ({ id: `f${++n}`, partId: `p${n}`, ref, value: "", footprint, x, y, rot: 0, side: "F", padNets, locked: false, ...extra });
const track = (layer, net, x1, y1, x2, y2, w = 0.25) => ({ id: `t${++n}`, layer, net, w, x1, y1, x2, y2 });
const via = (x, y, net, d = 0.8, drill = 0.4) => ({ id: `v${++n}`, x, y, d, drill, net });

// R1.2 (10.95, 10) and R2.1 (19.05, 10) share net A; joined by one track.
function cleanBoard() {
  const p = newProject("drc");
  p.pcb.footprints.push(
    fp("R_0805", "R1", 10, 10, { 1: "IN", 2: "A" }),
    fp("R_0805", "R2", 20, 10, { 1: "A", 2: "OUT" }),
  );
  p.pcb.tracks.push(track("F.Cu", "A", 10.95, 10, 19.05, 10));
  return p;
}

const codes = (issues) => issues.map((i) => i.code);
const has = (issues, code) => issues.some((i) => i.code === code);
const only = (issues, code) => issues.filter((i) => i.code === code);

test("clean board has no issues at all", () => {
  const issues = runDRC(cleanBoard());
  assert.deepEqual(issues, []);
});

test("clean board with every library footprint used in the suite stays silent", () => {
  const p = newProject("parts");
  p.pcb.footprints.push(
    fp("R_0805", "R1", 8, 8),
    fp("PinHeader_1x04_P2.54mm", "J1", 20, 8),
    fp("DIP-8_W7.62mm", "U1", 30, 8),
    fp("SOIC-8_3.9x4.9mm", "U2", 48, 12),
    fp("MountingHole_3.2mm", "H1", 8, 32),
  );
  const issues = runDRC(p);
  assert.deepEqual(codes(issues), []);
});

test("clearance: track passing too close to another net's pad", () => {
  const p = cleanBoard();
  // Pad edges sit at y = 10 +- 0.725; track edge 0.1 mm below R1 pads.
  p.pcb.tracks.push(track("F.Cu", "X", 8, 10.95, 13, 10.95));
  const issues = runDRC(p, { skip: ["dangling"] });
  const c = only(issues, "clearance");
  assert.ok(c.length >= 1, JSON.stringify(issues));
  assert.equal(c[0].severity, "error");
  assert.equal(c[0].layer, "F.Cu");
  assert.ok(c[0].ids.length === 2);
  assert.ok(Math.abs(c[0].y - 10.8) < 0.2, `marker near the gap, got ${c[0].y}`);
  assert.ok(!has(issues, "short"));
});

test("clearance respects net classes (Power = 0.25 mm)", () => {
  const p = newProject("nc");
  // Two tracks 0.22 mm apart edge to edge: fine for signals, not for GND.
  p.pcb.tracks.push(track("F.Cu", "S1", 10, 10, 20, 10), track("F.Cu", "S2", 10, 10.47, 20, 10.47));
  assert.ok(!has(runDRC(p, { skip: ["dangling"] }), "clearance"));
  p.pcb.tracks[1].net = "GND";
  assert.ok(has(runDRC(p, { skip: ["dangling"] }), "clearance"));
});

test("short: crossing tracks of different nets, and a track landing on a foreign pad", () => {
  const p = cleanBoard();
  p.pcb.tracks.push(track("F.Cu", "B", 15, 5, 15, 15));
  let issues = runDRC(p, { skip: ["dangling"] });
  assert.ok(has(issues, "short"));
  // Different layer: no short.
  p.pcb.tracks[1].layer = "B.Cu";
  issues = runDRC(p, { skip: ["dangling"] });
  assert.ok(!has(issues, "short"));
  // Track of net B ending on R2.2 (net OUT).
  p.pcb.tracks.push(track("F.Cu", "B", 20.95, 10, 20.95, 14));
  issues = runDRC(p, { skip: ["dangling"] });
  const s = only(issues, "short");
  assert.equal(s.length, 1);
  assert.ok(s[0].message.includes("OUT"));
});

test("no_net: unnetted track or via touching netted copper is a warning", () => {
  const p = cleanBoard();
  p.pcb.tracks.push(track("F.Cu", "", 19.05, 10, 19.05, 14));
  p.pcb.vias.push(via(15, 10, ""));
  const issues = runDRC(p, { skip: ["dangling"] });
  const w = only(issues, "no_net");
  // stub vs pad R2.1, stub vs the A track end, via vs the A track
  assert.equal(w.length, 3);
  assert.ok(w.some((i) => i.ids.includes(p.pcb.vias[0].id)));
  assert.ok(w.every((i) => i.severity === "warning"));
  assert.ok(!has(issues, "short"));
});

test("track width, via drill, annular ring", () => {
  const p = cleanBoard();
  p.pcb.tracks[0].w = 0.1;
  p.pcb.vias.push(via(30, 30, "A", 0.6, 0.2)); // drill too small
  p.pcb.vias.push(via(40, 30, "A", 0.6, 0.4)); // ring 0.1
  const issues = runDRC(p, { skip: ["dangling"] });
  assert.equal(only(issues, "track_width").length, 1);
  assert.equal(only(issues, "via_drill").length, 1);
  const ar = only(issues, "annular_ring");
  assert.equal(ar.length, 1);
  assert.deepEqual(ar[0].ids, [p.pcb.vias[1].id]);
});

test("pad drill below minimum is a warning", () => {
  const p = newProject("pd");
  p.pcb.footprints.push(fp("DIP-8_W7.62mm", "U1", 20, 10));
  p.pcb.rules.minDrill = 0.9; // DIP pads are 0.8 mm
  const issues = runDRC(p);
  const w = only(issues, "pad_drill");
  assert.equal(w.length, 8);
  assert.ok(w.every((i) => i.severity === "warning"));
});

test("hole to hole spacing (vias and NPTH)", () => {
  const p = newProject("hh");
  p.pcb.vias.push(via(30, 30, "A"), via(30.6, 30, "A")); // hole gap 0.2 < 0.25
  p.pcb.footprints.push(fp("MountingHole_3.2mm", "H1", 10, 20));
  p.pcb.vias.push(via(11.95, 20, "B")); // 0.35 mm from the NPTH edge -> gap 0.15
  const issues = runDRC(p, { skip: ["silk_over_pad"] });
  assert.equal(only(issues, "hole_to_hole").length, 2);
  p.pcb.vias[1].x = 30.7; // gap 0.3: fine
  assert.equal(only(runDRC(p, { skip: ["silk_over_pad"] }), "hole_to_hole").length, 1);
});

test("edge clearance: copper near the edge and copper outside", () => {
  const p = newProject("edge");
  p.pcb.vias.push(via(0.5, 20, "A")); // 0.1 mm from the left edge
  p.pcb.tracks.push(track("F.Cu", "A", -5, 30, -2, 30)); // outside
  p.pcb.tracks.push(track("F.Cu", "A", 10, 39.6, 20, 39.6)); // 0.275 mm
  const issues = only(runDRC(p, { skip: ["dangling"] }), "edge_clearance");
  assert.equal(issues.length, 3);
  assert.ok(issues.some((i) => i.message.includes("outside")));
});

test("footprint outside the outline and overlapping courtyards", () => {
  const p = newProject("fp");
  p.pcb.footprints.push(fp("R_0805", "R1", 59.5, 20));
  p.pcb.footprints.push(fp("R_0805", "R2", 20, 20), fp("R_0805", "R3", 21, 20.5));
  p.pcb.footprints.push(fp("R_0805", "R4", 30, 20), fp("R_0805", "R5", 30, 20, {}, { side: "B" })); // other side: fine
  const issues = runDRC(p, { skip: ["clearance", "short", "edge_clearance"] });
  const out = only(issues, "footprint_outside");
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].ids, [p.pcb.footprints[0].id]);
  const cy = only(issues, "courtyard_overlap");
  assert.equal(cy.length, 1);
  assert.equal(cy[0].severity, "warning");
  assert.deepEqual(cy[0].ids.sort(), [p.pcb.footprints[1].id, p.pcb.footprints[2].id].sort());
});

test("unconnected: every ratsnest line is an error with both endpoints", () => {
  const p = cleanBoard();
  p.pcb.tracks = [];
  const issues = only(runDRC(p), "unconnected");
  assert.equal(issues.length, 1);
  const u = issues[0];
  assert.equal(u.net, "A");
  assert.deepEqual([u.x1, u.y1, u.x2, u.y2].map((v) => +v.toFixed(2)).sort(), [10, 10, 10.95, 19.05].sort());
  assert.equal(u.ids.length, 2);
});

test("dangling track ends are warnings; T-junctions and vias are not", () => {
  const p = cleanBoard();
  p.pcb.tracks.push(track("F.Cu", "A", 15, 10, 15, 14)); // T off the main track, free end at (15,14)
  let d = only(runDRC(p), "dangling");
  assert.equal(d.length, 1);
  assert.equal(d[0].x, 15);
  assert.equal(d[0].y, 14);
  assert.equal(d[0].severity, "warning");
  p.pcb.vias.push(via(15, 14, "A"));
  p.pcb.tracks.push(track("B.Cu", "A", 15, 14, 19.05, 14), track("B.Cu", "A", 19.05, 14, 19.05, 10));
  d = only(runDRC(p), "dangling");
  // B.Cu track to an SMD pad on F.Cu does not connect.
  assert.equal(d.length, 1);
  assert.equal(d[0].layer, "B.Cu");
});

test("silkscreen over an exposed pad", () => {
  const p = cleanBoard();
  p.pcb.graphics.push({ id: "g1", layer: "F.SilkS", kind: "line", x1: 18, y1: 10.2, x2: 22, y2: 10.2, w: 0.12 });
  p.pcb.graphics.push({ id: "g2", layer: "B.SilkS", kind: "line", x1: 8, y1: 10, x2: 12, y2: 10, w: 0.12 }); // other side: fine
  const s = only(runDRC(p), "silk_over_pad");
  assert.equal(s.length, 2); // both R2 pads
  assert.ok(s.every((i) => i.ids.includes("g1")));
});

test("missing footprint definition", () => {
  const p = cleanBoard();
  p.pcb.footprints.push(fp("No_Such_Footprint", "X1", 30, 30));
  const m = only(runDRC(p), "missing_footprint");
  assert.equal(m.length, 1);
  assert.equal(m[0].severity, "error");
});

test("board outline validity", () => {
  assert.equal(outlineProblem([[0, 0], [60, 0], [60, 40], [0, 40]]), null);
  assert.ok(outlineProblem([[0, 0], [1, 1]]));
  assert.ok(outlineProblem([[0, 0], [10, 0], [20, 0]]));
  assert.ok(outlineProblem([[0, 0], [10, 10], [10, 0], [0, 10]])); // bow-tie
  const p = cleanBoard();
  p.pcb.outline = [[0, 0], [10, 10], [10, 0], [0, 10]];
  const issues = runDRC(p);
  assert.equal(only(issues, "outline").length, 1);
  assert.ok(!has(issues, "edge_clearance"));
});

test("zone outlines of different nets overlapping with equal priority", () => {
  const p = cleanBoard();
  p.pcb.zones.push({ id: "z1", layer: "B.Cu", net: "GND", pts: [[1, 1], [30, 1], [30, 39], [1, 39]], clearance: 0.3, thermal: true, priority: 0 });
  p.pcb.zones.push({ id: "z2", layer: "B.Cu", net: "VCC", pts: [[25, 1], [59, 1], [59, 39], [25, 39]], clearance: 0.3, thermal: true, priority: 0 });
  assert.equal(only(runDRC(p), "zone_overlap").length, 1);
  p.pcb.zones[1].priority = 1;
  assert.equal(only(runDRC(p), "zone_overlap").length, 0);
  p.pcb.zones[1].priority = 0;
  p.pcb.zones[1].layer = "F.Cu";
  assert.equal(only(runDRC(p), "zone_overlap").length, 0);
});

test("opts.skip and errors-first ordering", () => {
  const p = cleanBoard();
  p.pcb.tracks.push(track("F.Cu", "A", 15, 10, 15, 14)); // dangling warning
  p.pcb.tracks[0].w = 0.1; // track width error, added after the dangling one
  const issues = runDRC(p);
  assert.deepEqual(codes(issues), ["track_width", "dangling"]);
  assert.deepEqual(codes(runDRC(p, { skip: ["track_width"] })), ["dangling"]);
});

test("polygonsOverlap helper", () => {
  const a = [[0, 0], [2, 0], [2, 2], [0, 2]];
  assert.ok(polygonsOverlap(a, [[1, 1], [3, 1], [3, 3], [1, 3]]));
  assert.ok(polygonsOverlap(a, [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]])); // contained
  assert.equal(polygonsOverlap(a, [[3, 3], [4, 3], [4, 4], [3, 4]]), null);
});

test("large board (~2000 copper items) checks quickly", () => {
  const p = newProject("big");
  p.pcb.outline = [[0, 0], [200, 0], [200, 150], [0, 150]];
  // 40 x 12 SOIC-8 / resistor field plus a sea of short tracks.
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 10; j++) {
      p.pcb.footprints.push(fp("SOIC-8_3.9x4.9mm", `U${i}_${j}`, 6 + i * 9.5, 6 + j * 14, { 1: `N${i}_${j}a`, 2: `N${i}_${j}b`, 8: "VCC", 4: "GND" }));
    }
  }
  for (let k = 0; k < 400; k++) {
    const x = 3 + (k % 40) * 4.8, y = 10.5 + Math.floor(k / 40) * 14;
    p.pcb.tracks.push(track(k % 2 ? "B.Cu" : "F.Cu", `W${k}`, x, y, x + 3.5, y));
  }
  const t0 = Date.now();
  const issues = runDRC(p);
  const ms = Date.now() - t0;
  const items = p.pcb.footprints.length * 8 + p.pcb.tracks.length;
  assert.ok(items >= 2000, `items ${items}`);
  assert.ok(ms < 3000, `DRC took ${ms} ms`);
  assert.ok(!has(issues, "clearance") && !has(issues, "short"), JSON.stringify(issues.slice(0, 3)));
  console.log(`  DRC on ${items} copper items: ${ms} ms`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject } from "../../src/core/project.js";
import { routingStats, footprintPads } from "../../src/pcb/board.js";
import { autoroute, routeSingle } from "../../src/pcb/autoroute.js";
import { runDRC } from "../../src/pcb/drc.js";
import { cleanupTracks, lengthReport } from "../../src/pcb/cleanup.js";

let n = 0;
const fp = (footprint, ref, x, y, padNets = {}, extra = {}) =>
  ({ id: `f${++n}`, partId: `p${n}`, ref, value: "", footprint, x, y, rot: 0, side: "F", padNets, locked: false, ...extra });
const track = (layer, net, x1, y1, x2, y2, w = 0.25) => ({ id: `t${++n}`, layer, net, w, x1, y1, x2, y2 });
const via = (x, y, net, d = 0.8, drill = 0.4) => ({ id: `v${++n}`, x, y, d, drill, net });

function tinyBoard() {
  const p = newProject("tiny");
  p.pcb.footprints.push(
    fp("R_0805", "R1", 10, 10, { 1: "IN", 2: "A" }),
    fp("R_0805", "R2", 20, 14, { 1: "A", 2: "OUT" }),
  );
  return p;
}

// 60 x 40 mm, two layers, 17 parts, ~40 connections incl. power classes.
function demoBoard() {
  const p = newProject("demo");
  const F = p.pcb.footprints;
  F.push(fp("DIP-8_W7.62mm", "U1", 8, 6, { 1: "N1", 2: "N2", 3: "N3", 4: "GND", 5: "N5", 6: "N6", 7: "N7", 8: "VCC" }));
  F.push(fp("DIP-8_W7.62mm", "U2", 38, 6, { 1: "M1", 2: "M2", 3: "M3", 4: "GND", 5: "M5", 6: "M6", 7: "M7", 8: "VCC" }));
  F.push(fp("SOIC-8_3.9x4.9mm", "U3", 26, 30, { 1: "N7", 2: "S2", 3: "M3", 4: "GND", 5: "S5", 6: "M7", 7: "N3", 8: "VCC" }));
  F.push(fp("SOIC-8_3.9x4.9mm", "U4", 46, 30, { 1: "M6", 2: "S2", 3: "S5", 4: "GND", 5: "T5", 6: "N6", 7: "T7", 8: "VCC" }));
  F.push(fp("R_0805", "R1", 24, 6, { 1: "N1", 2: "N2" }));
  F.push(fp("R_0805", "R2", 24, 10, { 1: "N2", 2: "M1" }));
  F.push(fp("R_0805", "R3", 24, 14, { 1: "N5", 2: "M5" }));
  F.push(fp("R_0805", "R4", 24, 18, { 1: "M2", 2: "GND" }));
  F.push(fp("R_0805", "R5", 52, 10, { 1: "M6", 2: "T5" }));
  F.push(fp("R_0805", "R6", 52, 16, { 1: "T7", 2: "VCC" }));
  F.push(fp("R_0805", "R7", 14, 30, { 1: "N7", 2: "S2" }));
  F.push(fp("R_0805", "R8", 14, 34, { 1: "S5", 2: "GND" }));
  F.push(fp("R_0805", "R9", 34, 22, { 1: "N6", 2: "M2" }));
  F.push(fp("R_0805", "R10", 34, 36, { 1: "N5", 2: "T5" }));
  F.push(fp("PinHeader_1x04_P2.54mm", "J1", 4, 24, { 1: "VCC", 2: "N1", 3: "T7", 4: "GND" }));
  F.push(fp("MountingHole_3.2mm", "H1", 56, 36));
  F.push(fp("MountingHole_3.2mm", "H2", 56, 4));
  return p;
}

const apply = (p, r) => { p.pcb.tracks.push(...r.tracks); p.pcb.vias.push(...r.vias); return p; };
const errorsOf = (p, codes) => runDRC(p).filter((i) => i.severity === "error" && codes.includes(i.code));
const COPPER_RULES = ["clearance", "short", "edge_clearance", "hole_to_hole", "track_width", "via_drill", "annular_ring"];

test("routes a two-resistor board", () => {
  const p = tinyBoard();
  const r = autoroute(p);
  assert.equal(r.failed.length, 0);
  assert.equal(r.routed, 1);
  assert.ok(r.tracks.length >= 1);
  apply(p, r);
  assert.equal(routingStats(p.pcb).unrouted, 0);
  assert.deepEqual(errorsOf(p, COPPER_RULES), []);
  // Ends snap to the exact pad centres.
  const ends = r.tracks.flatMap((t) => [[t.x1, t.y1], [t.x2, t.y2]]);
  assert.ok(ends.some(([x, y]) => x === 10.95 && y === 10));
  assert.ok(ends.some(([x, y]) => x === 19.05 && y === 14));
});

test("demo board routes completely, cleanly and fast, without mutating the project", () => {
  const p = demoBoard();
  const before = JSON.stringify(p);
  const st0 = routingStats(p.pcb);
  assert.ok(st0.unrouted >= 30, `connections ${st0.unrouted}`);
  let calls = 0;
  const t0 = Date.now();
  const r = autoroute(p, { onProgress: () => calls++ });
  const ms = Date.now() - t0;
  assert.equal(JSON.stringify(p), before, "project must not be mutated");
  assert.ok(ms < 5000, `took ${ms} ms`);
  assert.ok(calls > 0);
  assert.deepEqual(r.failed, []);
  assert.equal(r.stats.connections, st0.unrouted);
  apply(p, r);
  assert.equal(routingStats(p.pcb).unrouted, 0);
  assert.deepEqual(errorsOf(p, COPPER_RULES), []);
  assert.equal(runDRC(p).filter((i) => i.code === "dangling").length, 0);
  // Power nets get their class width; signals the default.
  assert.ok(r.tracks.filter((t) => t.net === "GND").every((t) => t.w === 0.5));
  assert.ok(r.tracks.filter((t) => t.net === "N1").every((t) => t.w === 0.25));
  // Tidy: grid-built segments run at multiples of 45 degrees (pad snaps excepted).
  const padCentres = new Set(p.pcb.footprints.flatMap((f) => footprintPads(f, p.pcb)).map((q) => `${q.x},${q.y}`));
  const odd = r.tracks.filter((t) => {
    if (padCentres.has(`${t.x1},${t.y1}`) || padCentres.has(`${t.x2},${t.y2}`)) return false;
    const a = (Math.atan2(t.y2 - t.y1, t.x2 - t.x1) * 180) / Math.PI;
    return Math.abs(a / 45 - Math.round(a / 45)) > 1e-6;
  });
  assert.deepEqual(odd, []);
  console.log(`  demo board: ${r.stats.connections} connections, ${r.tracks.length} tracks, ${r.vias.length} vias, ${r.stats.ms} ms, ${r.stats.passes} pass(es)`);
});

test("routes around another net's copper (via or detour) without violations", () => {
  const p = tinyBoard();
  // A wall of net W on F.Cu between the resistors, across most of the board.
  p.pcb.tracks.push(track("F.Cu", "W", 15, 1, 15, 39, 0.5));
  const r = autoroute(p);
  assert.equal(r.failed.length, 0);
  apply(p, r);
  assert.equal(routingStats(p.pcb).unrouted, 0);
  assert.deepEqual(errorsOf(p, COPPER_RULES), []);
  assert.ok(r.vias.length >= 2 || r.tracks.some((t) => Math.min(t.y1, t.y2) < 1), "needs vias (or an impossible detour)");
});

test("reports connections it cannot route", () => {
  const p = tinyBoard();
  // Walls on both layers split the board in two.
  p.pcb.tracks.push(track("F.Cu", "W", 15, 0, 15, 40, 0.5), track("B.Cu", "W", 15, 0, 15, 40, 0.5));
  const r = autoroute(p, { maxMs: 3000 });
  assert.equal(r.routed, 0);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].net, "A");
  assert.deepEqual(r.tracks, []);
});

test("nets option limits what is routed", () => {
  const p = demoBoard();
  const r = autoroute(p, { nets: ["S2", "S5"] });
  assert.ok(r.tracks.length > 0);
  assert.ok(r.tracks.every((t) => t.net === "S2" || t.net === "S5"));
  assert.equal(r.failed.length, 0);
  apply(p, r);
  const left = routingStats(p.pcb).rats;
  assert.ok(left.every((l) => l.net !== "S2" && l.net !== "S5"));
});

test("routeSingle connects two pads", () => {
  const p = tinyBoard();
  const res = routeSingle(p, "A", { x: 10.95, y: 10, layer: "F.Cu" }, { x: 19.05, y: 14, layer: "F.Cu" });
  assert.ok(res);
  assert.ok(res.tracks.length >= 1);
  assert.ok(res.tracks.every((t) => t.net === "A" && t.w === 0.25));
  apply(p, res);
  assert.equal(routingStats(p.pcb).unrouted, 0);
  assert.deepEqual(errorsOf(p, COPPER_RULES), []);
});

test("routeSingle returns null when blocked", () => {
  const p = tinyBoard();
  p.pcb.tracks.push(track("F.Cu", "W", 15, 0, 15, 40, 0.5), track("B.Cu", "W", 15, 0, 15, 40, 0.5));
  assert.equal(routeSingle(p, "A", { x: 10.95, y: 10, layer: "F.Cu" }, { x: 19.05, y: 14, layer: "F.Cu" }, { maxMs: 2000 }), null);
});

test("respects NPTH holes and the board edge", () => {
  const p = newProject("holes");
  p.pcb.footprints.push(
    fp("R_0805", "R1", 5, 20, { 1: "X", 2: "A" }),
    fp("R_0805", "R2", 55, 20, { 1: "A", 2: "Y" }),
    fp("MountingHole_3.2mm", "H1", 30, 20),
  );
  const r = autoroute(p);
  assert.equal(r.failed.length, 0);
  apply(p, r);
  assert.deepEqual(errorsOf(p, COPPER_RULES), []);
  // The straight line would cross the hole; make sure nothing does.
  for (const t of r.tracks) {
    const d = segPoint(t, 30, 20);
    assert.ok(d >= 1.6 + 0.125, `track ${JSON.stringify(t)} at ${d} mm from the hole centre`);
  }
});

function segPoint(t, px, py) {
  const dx = t.x2 - t.x1, dy = t.y2 - t.y1;
  const l2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((px - t.x1) * dx + (py - t.y1) * dy) / l2));
  return Math.hypot(px - (t.x1 + u * dx), py - (t.y1 + u * dy));
}

// ---------------------------------------------------------------- cleanup
test("cleanupTracks merges, dedupes and drops useless vias", () => {
  const p = tinyBoard();
  p.pcb.tracks.push(
    track("F.Cu", "A", 10.95, 10, 14, 10),
    track("F.Cu", "A", 14, 10, 17, 10), // collinear continuation -> merged
    track("F.Cu", "A", 17, 10, 17, 10), // zero length
    track("F.Cu", "A", 17, 10, 14, 10), // duplicate (reversed)
  );
  p.pcb.vias.push(via(17, 10, "A")); // only F.Cu copper -> useless
  const res = cleanupTracks(p);
  // The duplicate shared (14,10) so the merge only happens after it is gone.
  assert.equal(res.removed, 3);
  assert.equal(res.merged, 1);
  assert.equal(p.pcb.tracks.length, 1);
  assert.deepEqual([p.pcb.tracks[0].x1, p.pcb.tracks[0].x2].sort((a, b) => a - b), [10.95, 17]);
  assert.equal(p.pcb.vias.length, 0);
});

test("cleanupTracks keeps junctions and real vias", () => {
  const p = tinyBoard();
  p.pcb.tracks.push(
    track("F.Cu", "A", 10.95, 10, 14, 10),
    track("F.Cu", "A", 14, 10, 17, 10),
    track("F.Cu", "A", 14, 10, 14, 12), // T at (14,10)
    track("B.Cu", "A", 17, 10, 19.05, 14),
  );
  p.pcb.vias.push(via(17, 10, "A"));
  const res = cleanupTracks(p);
  assert.deepEqual(res, { removed: 0, merged: 0 });
  assert.equal(p.pcb.vias.length, 1);
});

test("lengthReport sums per net", () => {
  const p = tinyBoard();
  p.pcb.tracks.push(track("F.Cu", "A", 0, 0, 3, 4), track("F.Cu", "A", 3, 4, 3, 5), track("F.Cu", "B2", 0, 0, 1, 0), track("F.Cu", "B10", 0, 0, 2, 0));
  p.pcb.vias.push(via(3, 4, "A"));
  assert.deepEqual(lengthReport(p), [
    { net: "A", length: 6, segments: 2, vias: 1 },
    { net: "B2", length: 1, segments: 1, vias: 0 },
    { net: "B10", length: 2, segments: 1, vias: 0 },
  ]);
});

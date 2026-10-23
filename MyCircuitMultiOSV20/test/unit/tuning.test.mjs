import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject } from "../../src/core/project.js";
import { routingStats } from "../../src/pcb/board.js";
import { autoroute, routeSingle } from "../../src/pcb/autoroute.js";
import { runDRC } from "../../src/pcb/drc.js";
import { segSegDist, closestOnSeg } from "../../src/core/geom.js";
import { netLength, tuneTrack, matchLengths, skewReport } from "../../src/pcb/tuning.js";
import { findPairs, routeDiffPair, pairSkew } from "../../src/pcb/diffpair.js";
import { shoveForSegment, shoveResult } from "../../src/pcb/shove.js";

let n = 0;
const fp = (footprint, ref, x, y, padNets = {}, extra = {}) =>
  ({ id: `f${++n}`, partId: `p${n}`, ref, value: "", footprint, x, y, rot: 0, side: "F", padNets, locked: false, ...extra });
const track = (net, x1, y1, x2, y2, w = 0.25, layer = "F.Cu") => ({ id: `t${++n}`, layer, net, w, x1, y1, x2, y2 });

const COPPER_RULES = ["clearance", "short", "edge_clearance", "hole_to_hole", "track_width"];
const copperErrors = (p) => runDRC(p).filter((i) => i.severity === "error" && COPPER_RULES.includes(i.code));
const clone = (p) => JSON.parse(JSON.stringify(p));
const len = (t) => Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
const longest = (p, net) => p.pcb.tracks.filter((t) => t.net === net).reduce((a, b) => (len(b) > len(a) ? b : a));

// Apply a {remove, add, update} result to a copy of the project.
function applied(p, r) {
  const q = clone(p);
  const gone = new Set(r.remove || []);
  q.pcb.tracks = q.pcb.tracks.filter((t) => !gone.has(t.id));
  q.pcb.vias = q.pcb.vias.filter((v) => !gone.has(v.id));
  for (const u of r.update || []) Object.assign(q.pcb.tracks.find((t) => t.id === u.id), u.patch);
  q.pcb.tracks.push(...r.add.tracks);
  q.pcb.vias.push(...r.add.vias);
  return q;
}

function sigBoard() {
  const p = newProject("tune");
  p.pcb.footprints.push(fp("R_0805", "R1", 10, 20, { 1: "X", 2: "SIG" }), fp("R_0805", "R2", 40, 20, { 1: "SIG", 2: "Y" }));
  const r = routeSingle(p, "SIG", { x: 10.95, y: 20 }, { x: 39.05, y: 20 });
  assert.ok(r && r.tracks.length);
  p.pcb.tracks.push(...r.tracks);
  return p;
}

// ---------------------------------------------------------------- tuning
test("netLength sums routed copper, optionally pad-to-pad and with via length", () => {
  const p = newProject("len");
  p.pcb.footprints.push(fp("R_0805", "R1", 10, 20, { 2: "S" }), fp("R_0805", "R2", 20, 20, { 1: "S" }));
  p.pcb.tracks.push(track("S", 10.95, 20, 19.05, 20));
  p.pcb.vias.push({ id: "v1", x: 15, y: 20, d: 0.8, drill: 0.4, net: "S" });
  const a = netLength(p, "S");
  assert.equal(a.length, 8.1);
  assert.equal(a.tracks, 1);
  assert.equal(a.vias, 1);
  const b = netLength(p, "S", { padToPad: true, viaLength: true });
  assert.ok(Math.abs(b.padInside - 1.0) < 1e-3, `pad inside ${b.padInside}`); // half a 1.0 mm wide pad at each end
  assert.ok(Math.abs(b.length - (8.1 - 1.0 + 1.6)) < 1e-3);
});

test("tuneTrack meanders one segment to the target length in every style, DRC-clean", () => {
  const p = sigBoard();
  const before = JSON.stringify(p);
  const L0 = netLength(p, "SIG").length;
  for (const style of ["rounded", "mitered"]) {
    for (const side of ["left", "right", "both"]) {
      const target = L0 + 8;
      const t = longest(p, "SIG");
      const r = tuneTrack(p, t.id, target, { style, side });
      assert.ok(!r.error, r.error);
      assert.deepEqual(r.remove, [t.id]);
      assert.ok(r.add.tracks.length > 10);
      assert.ok(r.info.reached);
      assert.ok(Math.abs(r.info.achieved - target) <= 0.05, `${style}/${side}: ${r.info.achieved} vs ${target}`);
      const q = applied(p, r);
      assert.ok(Math.abs(netLength(q, "SIG").length - target) <= 0.05);
      assert.deepEqual(copperErrors(q), [], `${style}/${side}`);
      assert.equal(routingStats(q.pcb).unrouted, 0, "still connected");
      assert.equal(runDRC(q).filter((i) => i.code === "dangling").length, 0);
      // Meander ends land exactly on the old segment ends.
      const ends = r.add.tracks.flatMap((k) => [[k.x1, k.y1], [k.x2, k.y2]]);
      assert.ok(ends.some(([x, y]) => x === t.x1 && y === t.y1));
      assert.ok(ends.some(([x, y]) => x === t.x2 && y === t.y2));
    }
  }
  assert.equal(JSON.stringify(p), before, "project must not be mutated");
});

test("tuneTrack works on a diagonal segment and refuses shorter targets", () => {
  const p = newProject("diag");
  p.pcb.footprints.push(fp("R_0805", "R1", 10, 10, { 2: "D" }), fp("R_0805", "R2", 40, 34, { 1: "D" }));
  p.pcb.tracks.push(track("D", 10.95, 10, 14, 10), track("D", 14, 10, 36, 32), track("D", 36, 32, 39.05, 34));
  const L0 = netLength(p, "D").length;
  const diag = p.pcb.tracks[1];
  const r = tuneTrack(p, diag.id, L0 + 6, { style: "mitered", side: "both" });
  assert.ok(!r.error, r.error);
  assert.ok(Math.abs(r.info.achieved - (L0 + 6)) <= 0.05);
  const q = applied(p, r);
  assert.deepEqual(copperErrors(q), []);
  assert.equal(routingStats(q.pcb).unrouted, 0);
  const bad = tuneTrack(p, diag.id, L0 - 1);
  assert.ok(bad.error && /shorter/.test(bad.error));
});

test("meander amplitude shrinks next to an obstacle and stays clear of it", () => {
  const p = newProject("obs");
  p.pcb.footprints.push(fp("R_0805", "R1", 10, 20, { 2: "SIG" }), fp("R_0805", "R2", 40, 20, { 1: "SIG" }));
  p.pcb.footprints.push(fp("R_0805", "R3", 12, 17, { 1: "OBS", 2: "OBS" }));
  p.pcb.tracks.push(track("SIG", 10.95, 20, 39.05, 20));
  // Another net 1 mm above (the "left" side for a left-to-right segment).
  p.pcb.tracks.push(track("OBS", 12.95, 17, 15, 19), track("OBS", 15, 19, 35, 19));
  const t = p.pcb.tracks[0];
  const L0 = netLength(p, "SIG").length;
  const free = tuneTrack({ ...p, pcb: { ...p.pcb, tracks: [t] } }, t.id, L0 + 5, { side: "left" });
  assert.ok(Math.max(...free.info.amplitudes) <= 0.75 + 1e-6);
  const r = tuneTrack(p, t.id, L0 + 5, { side: "left" });
  assert.ok(!r.error, r.error);
  assert.ok(r.info.reached, JSON.stringify(r.info));
  const limit = 1 - 0.25 - 0.2; // centre distance - width - clearance
  assert.ok(r.info.amplitudes.some((a) => a <= limit + 1e-3), `amplitudes ${r.info.amplitudes}`);
  assert.ok(r.info.bumps > free.info.bumps, "smaller bumps -> more of them");
  const q = applied(p, r);
  assert.deepEqual(copperErrors(q), []);
  // Every meander track keeps clearance to the obstacle.
  for (const k of r.add.tracks) {
    for (const o of q.pcb.tracks.filter((x) => x.net === "OBS")) {
      assert.ok(segSegDist(k.x1, k.y1, k.x2, k.y2, o.x1, o.y1, o.x2, o.y2) - 0.25 >= 0.2 - 1e-6);
    }
  }
});

function busBoard() {
  const p = newProject("bus");
  const nets = ["B0", "B1", "B2", "B3"];
  nets.forEach((net, i) => {
    p.pcb.footprints.push(fp("R_0805", `RL${i}`, 6, 6 + i * 8, { 1: `L${i}`, 2: net }));
    p.pcb.footprints.push(fp("R_0805", `RR${i}`, 30 + i * 6, 6 + i * 8 + (i % 2), { 1: net, 2: `R${i}` }));
  });
  const r = autoroute(p, { nets });
  assert.deepEqual(r.failed, []);
  p.pcb.tracks.push(...r.tracks);
  p.pcb.vias.push(...r.vias);
  return { p, nets };
}

test("matchLengths equalises a 4-net bus within tolerance", () => {
  const { p, nets } = busBoard();
  const skew0 = skewReport(p, nets);
  assert.ok(Math.min(...skew0.map((s) => s.delta)) < -10, JSON.stringify(skew0));
  const r = matchLengths(p, nets);
  assert.equal(r.info.nets.length, 4);
  for (const ni of r.info.nets) assert.ok(ni.reached, JSON.stringify(ni));
  const q = applied(p, r);
  const skew = skewReport(q, nets);
  for (const s of skew) assert.ok(Math.abs(s.length - r.info.target) <= 0.05, JSON.stringify(skew));
  assert.deepEqual(copperErrors(q), []);
  assert.equal(routingStats(q.pcb).unrouted, 0);
});

// ---------------------------------------------------------------- differential pairs
test("findPairs recognises the common naming styles", () => {
  const p = newProject("names");
  const nets = ["USB_D+", "USB_D-", "LVDS_P", "LVDS_N", "CLKP", "CLKN", "USB2_DP", "USB2_DM", "eth_p", "eth_n", "VCC", "GND", "SOLO+", "INPUT"];
  nets.forEach((net, i) => p.pcb.footprints.push(fp("PinHeader_1x02_P2.54mm", `J${i}`, 5 + i * 3, 5, { 1: net, 2: net })));
  const pairs = findPairs(p);
  const key = (x) => `${x.p}|${x.n}`;
  const got = new Set(pairs.map(key));
  for (const k of ["USB_D+|USB_D-", "LVDS_P|LVDS_N", "CLKP|CLKN", "USB2_DP|USB2_DM", "eth_p|eth_n"]) assert.ok(got.has(k), `${k} in ${[...got]}`);
  assert.equal(pairs.length, 5);
});

function usbBoard() {
  const p = newProject("usb");
  p.pcb.footprints.push(
    fp("USB_Micro-B", "J1", 15, 36, { 1: "VBUS", 2: "USB_D-", 3: "USB_D+", 4: "ID", 5: "GND", 6: "GND" }),
    fp("SOIC-8_3.9x4.9mm", "U1", 35, 10, { 1: "A1", 2: "USB_D-", 3: "USB_D+", 4: "GND", 5: "A5", 6: "A6", 7: "A7", 8: "A8" }),
    fp("R_0805", "R1", 24, 22, { 1: "Z1", 2: "Z2" }),
    fp("PinHeader_1x02_P2.54mm", "J2", 30, 26, { 1: "VBUS", 2: "GND" }),
  );
  return p;
}

test("routeDiffPair connects both nets with parallel tracks at the requested gap", () => {
  const p = usbBoard();
  const before = JSON.stringify(p);
  const r = routeDiffPair(p, "USB_D+", "USB_D-");
  assert.ok(!r.error, r.error);
  assert.equal(JSON.stringify(p), before);
  assert.equal(r.info.gap, 0.3);
  assert.equal(r.info.width, 0.25);
  const q = applied(p, r);
  const rats = routingStats(q.pcb).rats.filter((x) => x.net.startsWith("USB_D"));
  assert.deepEqual(rats, [], "both nets connected");
  assert.deepEqual(copperErrors(q), []);
  // Spacing of the coupled section, measured at the middle of the centre line.
  const C = r.info.centre;
  const k = Math.floor((C.length - 1) / 2);
  const M = [(C[k][0] + C[k + 1][0]) / 2, (C[k][1] + C[k + 1][1]) / 2];
  const nearestSeg = (pts) => {
    let best = null;
    for (let i = 1; i < pts.length; i++) {
      const c = closestOnSeg(M[0], M[1], pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      const d = Math.hypot(c.x - M[0], c.y - M[1]);
      if (!best || d < best.d) best = { d, a: pts[i - 1], b: pts[i] };
    }
    return best;
  };
  const sp = nearestSeg(r.info.lineP), sn = nearestSeg(r.info.lineN);
  const edgeGap = segSegDist(sp.a[0], sp.a[1], sp.b[0], sp.b[1], sn.a[0], sn.a[1], sn.b[0], sn.b[1]) - r.info.width;
  assert.ok(Math.abs(edgeGap - 0.3) < 1e-3, `gap ${edgeGap}`);
  // Both middle segments are parallel.
  const cross = (sp.b[0] - sp.a[0]) * (sn.b[1] - sn.a[1]) - (sp.b[1] - sp.a[1]) * (sn.b[0] - sn.a[0]);
  assert.ok(Math.abs(cross) < 1e-6);
  const sk = pairSkew(q, "USB_D+", "USB_D-");
  assert.ok(sk.lengthP > 20 && sk.lengthN > 20);
  assert.ok(Math.abs(sk.skew - Math.abs(sk.lengthP - sk.lengthN)) < 1e-9);
  assert.ok(sk.skew < 3);
});

test("routeDiffPair honours a custom gap and replaces existing copper", () => {
  const p = usbBoard();
  p.pcb.tracks.push(track("USB_D+", 15, 33.3, 15, 30));
  const r = routeDiffPair(p, "USB_D+", "USB_D-", { gap: 0.4, width: 0.2 });
  assert.ok(!r.error, r.error);
  assert.ok(r.remove.includes(p.pcb.tracks[0].id));
  const q = applied(p, r);
  assert.deepEqual(copperErrors(q), []);
  assert.deepEqual(routingStats(q.pcb).rats.filter((x) => x.net.startsWith("USB_D")), []);
  assert.ok(r.add.tracks.every((t) => t.w === 0.2));
});

// ---------------------------------------------------------------- shove
function shoveBoard() {
  const p = newProject("shove");
  p.pcb.footprints.push(
    fp("R_0805", "R1", 10, 20, { 1: "BX", 2: "B" }), fp("R_0805", "R2", 30, 20, { 1: "B", 2: "BY" }),
    fp("PinHeader_1x02_P2.54mm", "J1", 5, 26, { 1: "A", 2: "A" }),
  );
  // B: pad -> down -> across -> up -> pad.
  p.pcb.tracks.push(track("B", 10.95, 20, 10.95, 24), track("B", 10.95, 24, 29.05, 24), track("B", 29.05, 24, 29.05, 20));
  return p;
}

test("shove pushes a nearby track to clearance and keeps it connected", () => {
  const p = shoveBoard();
  const before = JSON.stringify(p);
  const statsB = routingStats(p.pcb).rats.filter((x) => x.net === "B").length;
  const seg = { x1: 14, y1: 24.3, x2: 26, y2: 24.3, w: 0.25, layer: "F.Cu" };
  const s = shoveForSegment(p, seg, "A");
  assert.ok(s.ok, JSON.stringify(s));
  assert.equal(JSON.stringify(p), before);
  const mid = s.moved.find((m) => m.id === p.pcb.tracks[1].id);
  assert.ok(mid, "middle segment moved");
  assert.ok(mid.y1 < 24 && mid.y1 === mid.y2, "moved in parallel, away from the new segment");
  assert.ok(24.3 - mid.y1 - 0.25 >= 0.2 - 1e-6, "clearance reached");
  assert.ok(24.3 - mid.y1 - 0.25 < 0.25, "but not much further");
  const r = shoveResult(p, seg, "A");
  assert.ok(r.ok);
  assert.equal(r.update.length, 3, "middle plus both legs");
  const q = applied(p, r);
  assert.equal(routingStats(q.pcb).rats.filter((x) => x.net === "B").length, statsB);
  assert.deepEqual(copperErrors(q), []);
  assert.equal(runDRC(q).filter((i) => i.code === "dangling" && i.ids.some((id) => q.pcb.tracks.find((t) => t.id === id && t.net === "B"))).length, 0);
});

test("shove inserts jogs when the pushed track is attached to pads", () => {
  const p = newProject("jog");
  p.pcb.footprints.push(fp("R_0805", "R1", 10, 24, { 2: "B" }), fp("R_0805", "R2", 30, 24, { 1: "B" }), fp("PinHeader_1x02_P2.54mm", "J1", 5, 30, { 1: "A", 2: "A" }));
  p.pcb.tracks.push(track("B", 10.95, 24, 29.05, 24));
  const seg = { x1: 15, y1: 24.35, x2: 25, y2: 24.35, w: 0.25, layer: "F.Cu" };
  const r = shoveResult(p, seg, "A");
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.add.tracks.filter((t) => t.net === "B").length, 2, "one jog per pad end");
  const q = applied(p, r);
  assert.equal(routingStats(q.pcb).rats.filter((x) => x.net === "B").length, 0);
  assert.deepEqual(copperErrors(q), []);
  // Pad ends did not move.
  const bt = q.pcb.tracks.filter((t) => t.net === "B").flatMap((t) => [[t.x1, t.y1], [t.x2, t.y2]]);
  assert.ok(bt.some(([x, y]) => x === 10.95 && y === 24));
  assert.ok(bt.some(([x, y]) => x === 29.05 && y === 24));
});

test("shove reports a blocked push instead of hitting a pad", () => {
  const p = shoveBoard();
  p.pcb.footprints.push(fp("R_0805", "R3", 20, 22.9, { 1: "C", 2: "C" }));
  const seg = { x1: 14, y1: 24.3, x2: 26, y2: 24.3, w: 0.25, layer: "F.Cu" };
  const s = shoveForSegment(p, seg, "A");
  assert.equal(s.ok, false);
  assert.equal(s.blockedBy.kind, "pad");
  assert.equal(s.blockedBy.ref, "R3");
  const r = shoveResult(p, seg, "A");
  assert.equal(r.ok, false);
  assert.deepEqual(r.update, []);
  // A segment straight over a pad cannot be shoved at all.
  const s2 = shoveForSegment(p, { x1: 18, y1: 22.9, x2: 22, y2: 22.9, w: 0.25, layer: "F.Cu" }, "A");
  assert.equal(s2.ok, false);
  assert.equal(s2.blockedBy.kind, "pad");
});

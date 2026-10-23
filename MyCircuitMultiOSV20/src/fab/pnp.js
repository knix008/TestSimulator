// Pick-and-place (centroid) file.
//
// Origin: bottom-left of the board outline bounds (min x, max y in board
// space), X right, Y up — what assembly houses expect. Rot is the footprint
// rotation in degrees counter-clockwise as seen from the top, 0..360; bottom
// parts keep the top-view angle (as KiCad writes them by default).

import { getFootprint } from "../lib/footprints.js";
import { polygonBounds } from "../core/geom.js";
import { csvLine, naturalCompare } from "./bom.js";

export function placeable(fp) {
  const def = getFootprint(fp.footprint);
  if (!def || !def.pads || !def.pads.length) return false;
  if (/^MountingHole/i.test(fp.footprint)) return false;
  if (def.pads.every((p) => p.npth)) return false;
  return !(fp.ref || "").startsWith("#");
}

// [{ref, val, pkg, x, y, rot, side: "top"|"bottom"}] in mm, Y up.
export function pickPlaceRows(project, opts = {}) {
  const side = opts.side || "both";
  const pcb = project.pcb;
  const b = polygonBounds(pcb.outline && pcb.outline.length ? pcb.outline : [[0, 0]]);
  const rows = [];
  for (const fp of pcb.footprints || []) {
    if (!placeable(fp)) continue;
    const s = fp.side === "B" ? "B" : "F";
    if (side !== "both" && side !== s) continue;
    const rot = ((((fp.rot || 0) % 360) + 360) % 360);
    rows.push({ ref: fp.ref, val: fp.value || "", pkg: fp.footprint, x: fp.x - b.x1, y: b.y2 - fp.y, rot: rot === 360 ? 0 : rot, side: s === "B" ? "bottom" : "top" });
  }
  return rows.sort((a, b2) => naturalCompare(a.ref, b2.ref));
}

const f4 = (v) => {
  const s = v.toFixed(4);
  return s === "-0.0000" ? "0.0000" : s;
};

export function pickPlaceCsv(project, opts = {}) {
  const lines = ["Ref,Val,Package,PosX,PosY,Rot,Side"];
  for (const r of pickPlaceRows(project, opts)) {
    lines.push([csvLine([r.ref, r.val, r.pkg]), f4(r.x), f4(r.y), f4(r.rot), r.side].join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

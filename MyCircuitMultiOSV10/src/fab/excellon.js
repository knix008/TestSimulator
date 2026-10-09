// Excellon drill files (KiCad-compatible flavour): metric, absolute, decimal
// point coordinates. Same coordinate convention as the Gerbers: (x, -y).

import { drillHoles } from "./layers.js";
import { copperLayers } from "../core/project.js";

function isoDate(d) {
  return (d ? new Date(d) : new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Always carry a decimal point: "X4" would be read as implicit-decimal 0.004.
const fx = (v) => {
  let s = (+v.toFixed(4)).toString();
  if (s === "-0") s = "0";
  return s.includes(".") ? s : `${s}.0`;
};

// opts.plated: true = PTH (plated pads + vias), false = NPTH, undefined = both.
// opts.units: "mm" (only metric is written; inch kept for API symmetry).
export function excellon(project, opts = {}) {
  const { plated, units = "mm" } = opts;
  const inch = units === "in" || units === "inch";
  const k = inch ? 1 / 25.4 : 1;
  const pcb = project.pcb;
  const holes = drillHoles(pcb).filter((h) => plated === undefined || h.plated === plated);
  // Tools sorted by diameter, numbered from 1.
  const diams = [...new Set(holes.map((h) => +h.d.toFixed(3)))].sort((a, b) => a - b);
  const tool = new Map(diams.map((d, i) => [d, i + 1]));
  const layers = copperLayers(pcb).length;
  const kind = plated === true ? "Plated,1," + layers + ",PTH" : plated === false ? "NonPlated,1," + layers + ",NPTH" : "MixedPlating,1," + layers;
  const out = [
    "M48",
    `; DRILL file {MyCircuit 10.0} date ${isoDate(opts.date)}`,
    "; FORMAT={-:-/ absolute / " + (inch ? "inch" : "metric") + " / decimal}",
    inch ? ";FILE_FORMAT=2:4" : ";FILE_FORMAT=3:3",
    "; Coordinates: Y = -Y(board), same origin as the Gerber files",
    "; #@! TF.GenerationSoftware,MyCircuit,10.0",
    `; #@! TF.CreationDate,${isoDate(opts.date)}`,
    `; #@! TF.FileFunction,${kind}`,
    "FMAT,2",
    inch ? "INCH" : "METRIC",
  ];
  for (const d of diams) {
    const attr = holes.find((h) => +h.d.toFixed(3) === d);
    out.push(`; #@! TA.AperFunction,${attr.plated ? (attr.kind === "via" ? "Plated,PTH,ViaDrill" : "Plated,PTH,ComponentDrill") : "NonPlated,NPTH,ComponentDrill"}`);
    out.push(`T${tool.get(d)}C${(d * k).toFixed(inch ? 4 : 3)}`);
  }
  out.push("%", "G90", "G05");
  for (const d of diams) {
    out.push(`T${tool.get(d)}`);
    for (const h of holes) if (+h.d.toFixed(3) === d) out.push(`X${fx(h.x * k)}Y${fx(-h.y * k)}`);
  }
  out.push("M30", "");
  return out.join("\n");
}

export function drillFileName(baseName, plated) {
  return plated === false ? `${baseName}-NPTH.drl` : plated === true ? `${baseName}-PTH.drl` : `${baseName}.drl`;
}

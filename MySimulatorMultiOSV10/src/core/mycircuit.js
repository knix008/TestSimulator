// MyCircuit projects (.mycircuit) as SPICE netlists, with MyCircuit's own netlist builder
// and exporter (copied into src/vendor/mycircuit by scripts/vendor-mycircuit.mjs).
import { toSpiceNetlist } from '../vendor/mycircuit/sim/engine.js';
import { registerUserSymbols } from '../vendor/mycircuit/lib/symbols.js';

/** { netlist, probes, title } from the text of a .mycircuit file. */
export function myCircuitToSpice(text) {
  const project = JSON.parse(text);
  if (!project?.schematic?.parts) throw new Error('not a MyCircuit project (no schematic)');
  registerUserSymbols(project.library?.symbols ?? []);
  const netlist = toSpiceNetlist(project);
  // MyCircuit's probes are net names; the exporter writes them with unusual characters as _.
  const sanitize = (n) => String(n).replace(/[^A-Za-z0-9_+\-.]/g, '_').replace(/^[+\-.]/, '_');
  const probes = (project.sim?.probes ?? []).map(sanitize).join(', ');
  return { netlist, probes, title: project.meta?.title ?? '' };
}

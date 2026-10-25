// Exports MyCircuit's sample projects as SPICE netlists with MyCircuit's own exporter and
// records MyCircuit's own operating-point voltages, so the engine can be checked against them.
//   node make_mycircuit_fixtures.mjs [path to MyCircuitMultiOSV20]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? path.join(here, '..', '..', '..', '..', '..', 'MyCircuitMultiOSV20'));
const { simulate, toSpiceNetlist } = await import(pathToFileURL(path.join(root, 'src', 'sim', 'engine.js')).href);

const samples = ['01-led-resistor', '02-voltage-divider-rc', '04-power-supply-7805', '05-npn-switch', '06-opamp-amplifier', '07-half-wave-rectifier', '14-two-stage-opamp', '15-regulated-555'];
const expected = {};
for (const name of samples) {
  const project = JSON.parse(fs.readFileSync(path.join(root, 'sample', `${name}.mycircuit`), 'utf8'));
  const netlist = toSpiceNetlist(project);
  fs.writeFileSync(path.join(here, `mycircuit-${name}.cir`), netlist);
  const op = simulate({ ...project, sim: { ...(project.sim ?? {}), mode: 'op' } });
  expected[name] = op.ok ? op.voltages : { error: op.errors };
  console.log(name, op.ok ? Object.keys(op.voltages).length + ' nodes' : op.errors);
}
fs.writeFileSync(path.join(here, 'mycircuit-op.json'), `${JSON.stringify(expected, null, 1)}\n`);

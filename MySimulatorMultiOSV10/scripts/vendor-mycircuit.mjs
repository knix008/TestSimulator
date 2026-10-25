// Copies MyCircuit's schematic netlist builder and SPICE exporter into src/vendor/mycircuit,
// so a .mycircuit project opens here as a circuit node (in the browser too).
//   node scripts/vendor-mycircuit.mjs [path to MyCircuitMultiOSV20]
// The copies are not edited by hand: run this again after MyCircuit changes them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.resolve(process.argv[2] ?? path.join(root, '..', 'MyCircuitMultiOSV20'));
const target = path.join(root, 'src', 'vendor', 'mycircuit');
const FILES = ['core/geom.js', 'core/netlist.js', 'lib/symbols.js', 'sim/lu.js', 'sim/devices.js', 'sim/engine.js'];
const header = (file) => `// Copied from MyCircuit (MyCircuitMultiOSV20/src/${file}) by scripts/vendor-mycircuit.mjs. Do not edit.\n`;

for (const file of FILES) {
  const text = fs.readFileSync(path.join(source, 'src', file), 'utf8');
  fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
  fs.writeFileSync(path.join(target, file), header(file) + text);
}
// engine.js needs parseValue from core/project.js (which pulls in the footprint library):
// only that function and its SI table are copied.
const project = fs.readFileSync(path.join(source, 'src', 'core', 'project.js'), 'utf8');
const pick = (start) => {
  const at = project.indexOf(start);
  if (at < 0) throw new Error(`MyCircuit core/project.js has no "${start}"`);
  const end = project.indexOf('\n}', at);
  const close = project.slice(end + 2, end + 4) === ';\n' ? end + 3 : end + 2;
  return project.slice(at, close);
};
fs.writeFileSync(path.join(target, 'core', 'project.js'), `${header('core/project.js (parseValue only)')}\n${project.slice(project.indexOf('const SI'), project.indexOf(';', project.indexOf('const SI')) + 1)}\n\n${pick('export function parseValue')}\n`);
console.log(`vendored ${FILES.length + 1} files from ${source}`);

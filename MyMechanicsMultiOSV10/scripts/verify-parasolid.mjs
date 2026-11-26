// npm run verify:xt — our Parasolid x_t / x_b files read by an independent reader: parasolid-kit (MIT / Apache-2.0,
// a schema-aware Python parser whose schema profiles come from files of several commercial CAD programs). It is installed once into
// its own virtual environment in %TEMP%/mymechanics-xt-witness (nothing system-wide, never into the project), then
// samples of every kind of geometry are written as text and as neutral binary, and each file must read
// `complete` with valid topology (closed loops and edge rings), one solid body, no diagnostics, the same bounding
// box of vertices as the model (the witness boxes vertices, not surfaces), and the x_t and x_b of a part must compare
// `equivalent`.
//   node scripts/verify-parasolid.mjs [--keep] [--only id,id]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadKernel, rep } from '../src/cad/kernel.js';
import { buildSample } from '../src/cad/samples.js';
import { regenerate } from '../src/cad/features.js';
import { brepToXt } from '../src/cad/parasolid-brep.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const home = path.join(os.tmpdir(), 'mymechanics-xt-witness');
const venv = path.join(home, 'venv');
const bin = (name) => path.join(venv, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? `${name}.exe` : name);
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

// ——— the witness, in its own virtual environment ———
fs.mkdirSync(home, { recursive: true });
if (!fs.existsSync(bin('parasolid-kit'))) {
  const python = ['python', 'python3', 'py'].find((p) => run(p, ['--version']).status === 0);
  if (!python) { console.error('Python 3.10+ is needed for the witness (parasolid-kit).'); process.exit(1); }
  console.log(`installing parasolid-kit into ${venv} …`);
  if (run(python, ['-m', 'venv', venv]).status !== 0) { console.error('could not make the virtual environment'); process.exit(1); }
  const pip = run(bin('python'), ['-I', '-m', 'pip', 'install', '-q', 'parasolid-kit']);
  if (pip.status !== 0) { console.error(pip.stderr || pip.stdout); process.exit(1); }
}
const version = run(bin('python'), ['-I', '-m', 'pip', 'show', 'parasolid-kit']).stdout.match(/Version: (\S+)/)?.[1] ?? '?';

// ——— our files: samples covering planes, cylinders, cones, tori, splines, swept and lofted surfaces, threads ———
const SAMPLES = (opt('--only', '') || 'basMountBracket,basPipeTee,mchSpurGear,mchCompressionSpring,hsgBottle,advCarBody,advTurbineBlade,basCapScrew,mchBevelGear,hsgVolute,advWineGlass,mchImpeller').split(',');
await loadKernel();
const out = path.join(home, 'files');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let failures = 0;
for (const id of SAMPLES) {
  const p = buildSample(id, 'en', { stage: false });
  const body = regenerate(p.parts[0], { project: p }).body;
  // The witness boxes the B-rep's vertices (not the surfaces' full extent): compare with the model's vertices.
  const oc = rep().getOC(); const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  // Only vertices of real edges: a pole (the end of a degenerate edge on a revolve's axis) and the ends of a seam (an
  // edge a face uses twice, as a turned disc's radius) have no vertex in XT.
  const TA = oc.TopAbs_ShapeEnum; const real = [];
  for (const fx = new oc.TopExp_Explorer(body.wrapped, TA.TopAbs_FACE, TA.TopAbs_SHAPE); fx.More(); fx.Next()) {
    const es = [];
    for (const ex = new oc.TopExp_Explorer(fx.Current(), TA.TopAbs_EDGE, TA.TopAbs_SHAPE); ex.More(); ex.Next()) es.push(oc.TopoDS.Edge(ex.Current()));
    for (const e of es) if (!oc.BRep_Tool.Degenerated(e) && es.filter((o) => o.IsSame(e)).length === 1) real.push(e);
  }
  for (const e of real) {
    for (const vx = new oc.TopExp_Explorer(e, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); vx.More(); vx.Next()) {
      const q = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex(vx.Current())); const v = [q.X(), q.Y(), q.Z()];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
    }
  }
  const want = [0, 1, 2].map((k) => hi[k] - lo[k]); // mm
  const files = [];
  for (const binary of [false, true]) {
    const name = `${id}.${binary ? 'x_b' : 'x_t'}`;
    fs.writeFileSync(path.join(out, name), await brepToXt(body.serialize(), { binary, file: name }));
    files.push(name);
  }
  const problems = [];
  for (const name of files) {
    const r = run(bin('parasolid-kit'), ['check', name, '--json'], { cwd: out });
    let d; try { d = JSON.parse(r.stdout); } catch { problems.push(`${name}: ${(r.stdout || r.stderr).slice(0, 200)}`); continue; }
    const s = d.summary ?? {};
    if (d.status !== 'complete' || !s.complete) problems.push(`${name}: ${d.status} ${d.message ?? ''}`);
    if (!s.topology?.valid) problems.push(`${name}: topology not valid`);
    if (s.counts?.bodies !== 1 || s.body_kind_counts?.solid !== 1) problems.push(`${name}: not one solid body`);
    if (s.diagnostic_count) problems.push(`${name}: ${s.diagnostic_count} diagnostics ${JSON.stringify(s.diagnostics).slice(0, 200)}`);
    const ext = (s.metrics?.bounding_box?.extents ?? []).map((v) => v * 1000); // the file is in metres
    if (ext.length !== 3 || ext.some((v, k) => Math.abs(v - want[k]) > 1e-3)) problems.push(`${name}: box ${ext.map((v) => v.toFixed(2))} vs ${want.map((v) => v.toFixed(2))} mm`);
  }
  const c = run(bin('parasolid-kit'), ['compare', files[0], files[1]], { cwd: out });
  if (!/"status":\s*"equivalent"/.test(c.stdout)) problems.push(`x_t and x_b differ: ${c.stdout.slice(0, 200)}`);
  failures += problems.length;
  console.log(`${problems.length ? '✘' : '✔'} ${id}: x_t and x_b read complete, valid topology, one solid, no diagnostics, vertex box ${want.map((v) => v.toFixed(1)).join(' × ')} mm${problems.length ? ` — ${problems.join('; ')}` : ''}`);
}
console.log(failures ? `${failures} problems` : `every file reads as written (parasolid-kit ${version})`);
if (!args.includes('--keep')) fs.rmSync(out, { recursive: true, force: true });
process.exit(failures ? 1 : 0);

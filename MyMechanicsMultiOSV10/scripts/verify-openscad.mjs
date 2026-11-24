// Checks the OpenSCAD interpreter against OpenSCAD 2021.01's own regression tests: every echotest program is run
// and its ECHO lines (and assertion errors) are compared with the expected output OpenSCAD produced. The test
// files (GPL) are downloaded to a cache in the temp folder — never into the project.
//   node scripts/verify-openscad.mjs [--only name] [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runScadWithFiles, decodeScad } from '../src/cad/openscad/index.js';

const TAG = 'openscad-2021.01';
const RAW = `https://raw.githubusercontent.com/openscad/openscad/${TAG}/`;
const CACHE = path.join(os.tmpdir(), 'mymechanics-scad-witness');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const verbose = args.includes('--verbose');
fs.mkdirSync(CACHE, { recursive: true });

async function cached(rel, { binary = false } = {}) {
  const file = path.join(CACHE, rel.replace(/[\\/]/g, '__'));
  if (fs.existsSync(file)) { const b = fs.readFileSync(file); return b.length === 0 ? null : binary ? new Uint8Array(b) : b.toString('utf8'); }
  const r = await fetch(RAW + rel);
  if (!r.ok) { fs.writeFileSync(file, ''); return null; }
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, b);
  return binary ? new Uint8Array(b) : b.toString('utf8');
}

async function cachedFrom(base, rel, { binary = false } = {}) {
  const file = path.join(CACHE, `lib__${rel.replace(/[\\/]/g, '__')}`);
  if (fs.existsSync(file)) { const b = fs.readFileSync(file); return b.length === 0 ? null : binary ? new Uint8Array(b) : b.toString('utf8'); }
  const r = await fetch(base + rel);
  if (!r.ok) { fs.writeFileSync(file, ''); return null; }
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, b);
  return binary ? new Uint8Array(b) : b.toString('utf8');
}

async function treeList() {
  const file = path.join(CACHE, 'tree.json');
  if (!fs.existsSync(file)) {
    const r = await fetch(`https://api.github.com/repos/openscad/openscad/git/trees/${TAG}?recursive=1`, { headers: { 'User-Agent': 'scad-witness' } });
    if (!r.ok) throw new Error(`tree listing failed: ${r.status}`);
    fs.writeFileSync(file, await r.text());
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')).tree.map((t) => t.path);
}

// What a line of output becomes for comparing: ECHO lines as they are; an assertion error as its message.
function interesting(raw, join = false) {
  const out = [];
  const lines = [];
  for (const l of raw) {
    if (join && lines.length && !/^(ECHO|WARNING|ERROR|DEPRECATED|TRACE|EXPORT-WARNING|FONT-WARNING|UI-WARNING|Assertion)\b|^ *$/.test(l) && lines[lines.length - 1].startsWith('ECHO:')) lines[lines.length - 1] += `\n${l}`;
    else lines.push(l);
  }
  for (const l of lines) {
    if (l.startsWith('ECHO:')) out.push(l.trim());
    else { const m = /Assertion '(.*)' failed/.exec(l); if (m) out.push(`ASSERT ${m[1].replace(/\s+/g, '')}`); }
  }
  return out;
}

const paths = await treeList();
const expected = paths.filter((p) => /^tests\/regression\/echotest\/.*-expected\.echo$/.test(p));
const sources = paths.filter((p) => /^testdata\/scad\/.*\.scad$/.test(p));
let pass = 0; let fail = 0; let skip = 0; const failures = [];
const t0 = Date.now();
for (const exp of expected) {
  const name = path.basename(exp).replace(/-expected\.echo$/, '');
  if (only && name !== only) continue;
  const src = sources.find((s) => path.basename(s, '.scad') === name);
  if (!src) { skip++; if (verbose) console.log(`  ○ ${name}: no source`); continue; }
  const raw = await cached(src, { binary: true }); const want = await cached(exp);
  const text = raw == null ? null : decodeScad(raw);
  if (text == null || want == null) { skip++; continue; }
  const dir = path.posix.dirname(src);
  let got = [];
  try {
    // The regression tests ran in preview, where $preview is true.
    const { result } = await runScadWithFiles(text, {
      fileName: src, specials: { $preview: true },
      loadFile: async (p) => {
        const rel = path.posix.normalize(p.replace(/\\/g, '/'));
        const binary = /\.(png|stl|3mf)$/i.test(p);
        return (await cached(rel, { binary })) ?? (await cached(path.posix.join('libraries', p), { binary }));
      },
    });
    got = [...result.echoes, ...result.warnings, ...(result.error ? [result.error.message] : [])];
  } catch (error) {
    got = [String(error?.message ?? error)];
  }
  const a = interesting(want.split(/\r?\n/), true); const b = interesting(got);
  const ok = a.length === b.length && a.every((x, i) => x === b[i]);
  if (ok) pass++; else { fail++; failures.push({ name, a, b }); }
  if (verbose || !ok) console.log(`  ${ok ? '✔' : '✘'} ${name}`);
}
for (const f of failures.slice(0, verbose ? 1000 : 25)) {
  console.log(`\n── ${f.name}`);
  const n = Math.max(f.a.length, f.b.length);
  let shown = 0;
  for (let i = 0; i < n && shown < 6; i++) if (f.a[i] !== f.b[i]) { console.log(`   want: ${f.a[i] ?? '(nothing)'}\n   got:  ${f.b[i] ?? '(nothing)'}`); shown++; }
}
console.log(`\nOpenSCAD ${TAG} echo tests: ${pass} pass, ${fail} fail, ${skip} skipped (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// ── OpenSCAD's own example programs: each must give a closed solid (or a 2D shape) without an error.
let ePass = 0; let eFail = 0;
if (!only || only === 'examples') {
  const examples = paths.filter((p) => /^examples\/.*\.scad$/.test(p));
  const t1 = Date.now();
  for (const ex of examples) {
    const raw = await cached(ex, { binary: true });
    if (raw == null) continue;
    const t2 = Date.now();
    let line;
    try {
      const { result } = await runScadWithFiles(decodeScad(raw), {
        fileName: ex,
        loadFile: async (p) => {
          const rel = path.posix.normalize(p.replace(/\\/g, '/'));
          const binary = /\.(png|stl|3mf|dxf|svg|dat)$/i.test(p);
          const own = await cached(rel, { binary });
          if (own != null) return own;
          // Libraries OpenSCAD ships with (MCAD, LGPL): fetched into the cache like the tests, never the project.
          const lib = /(?:^|\/)(MCAD\/.+)$/.exec(rel)?.[1];
          return lib ? cachedFrom('https://raw.githubusercontent.com/openscad/MCAD/master/', lib.slice(5), { binary }) : null;
        },
      });
      // A program with no geometry at all (only echo) is fine when it reports no problem.
      const ok = !result.error && (result.dim === 3 ? result.volume > 0 && result.tris.length > 0 : result.dim === 2 ? result.area > 0 : !result.warnings.length);
      line = `${ok ? '✔' : '✘'} ${ex.padEnd(46)} ${result.dim === 3 ? `${result.tris.length} triangles, volume ${result.volume.toFixed(1)}` : result.dim === 2 ? `2D, area ${result.area.toFixed(1)}` : `empty${result.error ? `: ${result.error.message}` : ''}`}  [${Date.now() - t2} ms]`;
      if (ok) ePass++; else { eFail++; if (result.warnings.length) line += `\n     ${result.warnings.slice(0, 3).join('\n     ')}`; }
    } catch (error) { eFail++; line = `✘ ${ex}: ${error?.message ?? error}`; }
    if (verbose || line.startsWith('✘')) console.log(`  ${line}`);
  }
  console.log(`OpenSCAD ${TAG} examples: ${ePass} give a model, ${eFail} fail (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
}
process.exit(fail || eFail ? 1 : 0);

// npm run verify:blender -- <path to blender> : checks the file formats against a real Blender, in both directions.
//   1. Our exports are opened by Blender, and what it finds is compared with what was written.
//   2. Blender writes a known scene, and our importers read it, compared with what Blender reports about it.
// Blender runs in background mode with its user folders pointed at a temporary one. It is not part of `npm test`, which needs no Blender.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importBlend } from '../src/core/blendfile.js';
import { exportDAE, exportFBX, exportUSDA, importDAE, importFBX, importUSDA } from '../src/core/formats.js';
import { exportGLB, exportOBJ, exportPLY, exportSTLBinary, importGLB, importOBJ } from '../src/core/io.js';
import { cubeMesh, signedVolume, torusMesh, uvSphereMesh } from '../src/core/mesh.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const blender = process.argv[2];
if (!blender || !fs.existsSync(blender)) { console.error('Usage: npm run verify:blender -- <path to blender>'); process.exit(2); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'my3d-blender-'));
const ours = path.join(work, 'ours');
const theirs = path.join(work, 'theirs');
fs.mkdirSync(ours);
fs.mkdirSync(theirs);
const profile = path.join(work, 'profile');
fs.mkdirSync(profile);
const env = { ...process.env, BLENDER_USER_RESOURCES: profile, BLENDER_USER_CONFIG: profile, BLENDER_USER_SCRIPTS: profile, BLENDER_USER_DATAFILES: profile };
const runBlender = (mode, folder) => execFileSync(blender, ['-b', '--factory-startup', '--python-exit-code', '3', '--python', path.join(here, 'verify-blender.py'), '--', mode, folder], { env, stdio: 'pipe', maxBuffer: 1 << 28 });

let failed = 0;
const line = (ok, name, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const box = (mesh) => { const low = [Infinity, Infinity, Infinity]; const high = [-Infinity, -Infinity, -Infinity]; for (const v of mesh.verts) for (let i = 0; i < 3; i++) { low[i] = Math.min(low[i], v[i]); high[i] = Math.max(high[i], v[i]); } return { low, high }; };

// ── 1. Ours into Blender
const moved = (mesh, [x, y, z]) => ({ ...mesh, verts: mesh.verts.map((v) => [v[0] + x, v[1] + y, v[2] + z]) });
const OBJECTS = [
  { name: 'Box', mesh: moved(cubeMesh(2), [1, 2, 3]), material: { baseColor: [0.8, 0.2, 0.1] } },
  { name: 'Ring', mesh: moved(torusMesh(24, 8, 2, 0.5), [-4, 0, 1]), material: { baseColor: [0.1, 0.5, 0.8] } },
  { name: 'Ball', mesh: moved(uvSphereMesh(16, 8, 1.5), [0, -5, 0]), material: { baseColor: [0.2, 0.7, 0.3] } },
];
const write = (name, data) => fs.writeFileSync(path.join(ours, name), data);
write('ours.obj', exportOBJ(OBJECTS));
write('ours.stl', exportSTLBinary(OBJECTS));
write('ours.ply', exportPLY(OBJECTS));
write('ours.glb', exportGLB(OBJECTS));
write('ours.fbx', exportFBX(OBJECTS));
write('ours.dae', exportDAE(OBJECTS));
write('ours.usda', exportUSDA(OBJECTS));
let exportABC = null;
try { ({ exportABC } = await import('../src/core/alembic.js')); write('ours.abc', exportABC(OBJECTS)); } catch { console.log('  (Alembic is not there yet)'); }

console.log('Our files, read by Blender:');
runBlender('read', ours);
const report = JSON.parse(fs.readFileSync(path.join(ours, 'report.json'), 'utf8'));
for (const [file, r] of Object.entries(report)) {
  if (r.error) { line(false, file, r.error.split('\n')[0].slice(0, 160)); continue; }
  // STL and PLY are one mesh, and their vertices are welded differently: only the whole shape is compared for them.
  const whole = /\.(stl|ply)$/.test(file);
  const problems = [];
  if (whole) {
    const low = [0, 1, 2].map((i) => Math.min(...r.objects.map((o) => o.low[i])));
    const high = [0, 1, 2].map((i) => Math.max(...r.objects.map((o) => o.high[i])));
    const all = OBJECTS.map((o) => box(o.mesh));
    const wantLow = [0, 1, 2].map((i) => Math.min(...all.map((b) => b.low[i])));
    const wantHigh = [0, 1, 2].map((i) => Math.max(...all.map((b) => b.high[i])));
    if (!near(low, wantLow) || !near(high, wantHigh)) problems.push(`extent ${low} to ${high}`);
  } else {
    if (r.objects.length !== OBJECTS.length) problems.push(`${r.objects.length} objects`);
    for (const want of OBJECTS) {
      const got = r.objects.find((o) => o.name.startsWith(want.name));
      if (!got) { problems.push(`${want.name} is missing`); continue; }
      const b = box(want.mesh);
      // glTF holds only triangles, and its vertices are per corner.
      const tris = want.mesh.faces.reduce((n, f) => n + f.length - 2, 0);
      if (file.endsWith('.glb')) { if (got.faces !== tris) problems.push(`${want.name}: ${got.faces} triangles, wrote ${tris}`); } else {
        if (got.faces !== want.mesh.faces.length) problems.push(`${want.name}: ${got.faces} faces, wrote ${want.mesh.faces.length}`);
        if (got.verts !== want.mesh.verts.length) problems.push(`${want.name}: ${got.verts} vertices, wrote ${want.mesh.verts.length}`);
      }
      if (!near(got.low, b.low) || !near(got.high, b.high)) problems.push(`${want.name}: extent ${got.low.map((x) => x.toFixed(3))} to ${got.high.map((x) => x.toFixed(3))}, wrote ${b.low} to ${b.high}`);
      const volume = signedVolume(want.mesh);
      if (Math.abs(got.volume - volume) > 0.01 * Math.abs(volume) + 1e-3) problems.push(`${want.name}: volume ${got.volume.toFixed(3)}, wrote ${volume.toFixed(3)}`);
    }
  }
  line(!problems.length, file, problems.join('; ') || `${r.objects.length} objects, ${r.objects.reduce((s, o) => s + o.faces, 0)} faces`);
}

// ── 2. Blender into ours
console.log('Blender\'s files, read by us:');
runBlender('write', theirs);
const expected = JSON.parse(fs.readFileSync(path.join(theirs, 'expected.json'), 'utf8'));
const bytes = (name) => new Uint8Array(fs.readFileSync(path.join(theirs, name)));
const text = (name) => fs.readFileSync(path.join(theirs, name), 'utf8');
let importABC = null;
try { ({ importABC } = await import('../src/core/alembic.js')); } catch { /* not yet */ }
const READ = {
  'blender.fbx': () => importFBX(bytes('blender.fbx')),
  'blender.glb': () => importGLB(bytes('blender.glb')),
  'blender.dae': () => importDAE(text('blender.dae')),
  'blender.usda': () => importUSDA(bytes('blender.usda')),
  'blender.obj': () => importOBJ(text('blender.obj')),
  'blender.blend': () => importBlend(bytes('blender.blend')),
  'blender-zstd.blend': () => importBlend(bytes('blender-zstd.blend')),
};
if (importABC) { READ['blender.abc'] = () => importABC(bytes('blender.abc')); READ['blender-anim.abc'] = () => importABC(bytes('blender-anim.abc'), { sample: 4 }); }
for (const [file, read] of Object.entries(READ)) {
  try {
    const list = read();
    const problems = [];
    if (list.length !== expected.length) problems.push(`${list.length} objects`);
    for (const want of expected) {
      const got = list.find((o) => o.name.includes(want.name));
      if (!got) { problems.push(`${want.name} is missing`); continue; }
      // Blender writes glTF and Collada as triangles.
      const count = /\.(glb|dae)$/.test(file) ? want.tris : want.faces;
      if (got.mesh.faces.length !== count) problems.push(`${want.name}: ${got.mesh.faces.length} faces, Blender says ${count}`);
      const b = box(got.mesh);
      const low = file === 'blender-anim.abc' && want.name === 'BoxA' ? [want.low[0], want.low[1], want.low[2] + 4] : want.low;
      const high = file === 'blender-anim.abc' && want.name === 'BoxA' ? [want.high[0], want.high[1], want.high[2] + 4] : want.high;
      if (!near(b.low, low) || !near(b.high, high)) problems.push(`${want.name}: extent ${b.low.map((x) => x.toFixed(3))} to ${b.high.map((x) => x.toFixed(3))}, Blender says ${low.map((x) => x.toFixed(3))} to ${high.map((x) => x.toFixed(3))}`);
      const volume = signedVolume(got.mesh);
      if (Math.abs(volume - want.volume) > 0.01 * Math.abs(want.volume) + 1e-3) problems.push(`${want.name}: volume ${volume.toFixed(3)}, Blender says ${want.volume.toFixed(3)}`);
    }
    line(!problems.length, file, problems.join('; ') || `${list.length} objects`);
  } catch (error) {
    line(false, file, String(error.message).slice(0, 180));
  }
}
console.log(failed ? `\n${failed} failed (files kept in ${work})` : '\nAll agree.');
if (!failed) fs.rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

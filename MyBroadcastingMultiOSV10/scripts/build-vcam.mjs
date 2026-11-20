// npm run build:vcam — the virtual camera (Windows): native/vcam (softcam, MIT; DirectShow BaseClasses, MIT)
// built into src-tauri/resources/vcam/mybroadcasting-vcam.dll with the Visual Studio C++ compiler.
// The app registers it (as administrator, after asking) and sends frames to it (src-tauri/src/vcam.rs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'native', 'vcam');
const outDir = path.join(root, 'src-tauri', 'resources', 'vcam');
const out = path.join(outDir, 'mybroadcasting-vcam.dll');

if (process.platform !== 'win32') { console.log('[build-vcam] Windows only — nothing to build here'); process.exit(0); }

/** vcvars64.bat of an installed Visual Studio with the C++ tools (newest first). */
export function findVcvars() {
  const found = [];
  const vswhere = path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (fs.existsSync(vswhere)) {
    const r = spawnSync(vswhere, ['-all', '-products', '*', '-property', 'installationPath'], { encoding: 'utf8' });
    for (const line of (r.stdout ?? '').split(/\r?\n/).filter(Boolean)) found.push(path.join(line.trim(), 'VC', 'Auxiliary', 'Build', 'vcvars64.bat'));
  }
  for (const base of ['C:\\Program Files\\Microsoft Visual Studio', 'C:\\Program Files (x86)\\Microsoft Visual Studio']) {
    if (!fs.existsSync(base)) continue;
    for (const version of fs.readdirSync(base).sort().reverse()) {
      const dir = path.join(base, version);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const edition of fs.readdirSync(dir)) found.push(path.join(dir, edition, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat'));
    }
  }
  return found.find((f) => fs.existsSync(f)) ?? null;
}

const sources = ['baseclasses', 'softcamcore'].flatMap((d) => fs.readdirSync(path.join(src, d)).filter((f) => f.endsWith('.cpp')).map((f) => path.join(src, d, f)));
sources.push(path.join(src, 'softcam', 'softcam.cpp'));
const newest = Math.max(...[...sources, path.join(src, 'softcam', 'softcam.def')].map((f) => fs.statSync(f).mtimeMs));
if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= newest && !process.argv.includes('--force')) { console.log(`[build-vcam] up to date: ${path.relative(root, out)}`); process.exit(0); }

const vcvars = findVcvars();
if (!vcvars) { console.error('[build-vcam] Visual Studio with the C++ tools was not found (Desktop development with C++).'); process.exit(1); }
const obj = fs.mkdtempSync(path.join(process.env.TEMP ?? root, 'mybc-vcam-'));
fs.mkdirSync(outDir, { recursive: true });
const q = (p) => `"${p}"`;
const cl = ['cl', '/nologo', '/O2', '/MD', '/EHsc', '/std:c++17', '/W1', '/DWIN32', '/DNDEBUG', '/D_CRT_SECURE_NO_WARNINGS', '/DUNICODE', '/D_UNICODE',
  // Objects go to the working folder (obj): a "/Fo<dir>\" with a closing quote would escape the quote.
  `/I${q(src)}`, `/I${q(path.join(src, 'baseclasses'))}`, '/LD', ...sources.map(q), `/Fe${q(out)}`,
  '/link', `/DEF:${q(path.join(src, 'softcam', 'softcam.def'))}`, 'strmiids.lib', 'winmm.lib', 'ole32.lib', 'oleaut32.lib', 'uuid.lib', 'advapi32.lib', 'user32.lib', 'gdi32.lib'].join(' ');
const bat = path.join(obj, 'build.bat');
fs.writeFileSync(bat, `@echo off\r\ncall ${q(vcvars)} >nul\r\n${cl}\r\n`);
const r = spawnSync('cmd.exe', ['/d', '/c', bat], { encoding: 'utf8', cwd: obj });
fs.rmSync(obj, { recursive: true, force: true });
if (r.status !== 0 || !fs.existsSync(out)) { console.error(r.stdout?.split(/\r?\n/).filter((l) => /error|warning C4/.test(l)).slice(0, 30).join('\n') || r.stdout || r.stderr); process.exit(1); }
for (const extra of ['.exp', '.lib']) fs.rmSync(out.replace(/\.dll$/, extra), { force: true });
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(outDir, 'LICENSE-softcam.txt'));
console.log(`[build-vcam] built ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KB) with ${vcvars}`);

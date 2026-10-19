// Finds a Python with PyTorch for the tests (like the app's detection, but only the usual places):
// MYTRAINER_PYTHON, MyTrainer's own environment, PATH, the py launcher, conda environments.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const probeScript = path.join(root, 'python', 'env_probe.py');

function candidates() {
  const home = os.homedir();
  const win = process.platform === 'win32';
  const list = [];
  if (process.env.MYTRAINER_PYTHON) list.push(process.env.MYTRAINER_PYTHON);
  const appData = win ? path.join(process.env.APPDATA ?? '', 'com.shkwon.mytrainer') : process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'com.shkwon.mytrainer') : path.join(home, '.local', 'share', 'com.shkwon.mytrainer');
  list.push(win ? path.join(appData, 'pyenv', 'Scripts', 'python.exe') : path.join(appData, 'pyenv', 'bin', 'python3'));
  for (const name of win ? ['python.exe'] : ['python3', 'python']) {
    try {
      const found = execFileSync(win ? 'where' : 'which', [name], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/).filter(Boolean);
      list.push(...found.filter((p) => !p.toLowerCase().includes('windowsapps')));
    } catch { /* not on PATH */ }
  }
  if (win) {
    try {
      const out = execFileSync('py', ['-0p'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      for (const line of out.split(/\r?\n/)) { const i = line.indexOf(':\\'); if (i > 0) list.push(line.slice(i - 1).trim()); }
    } catch { /* no launcher */ }
  }
  for (const base of ['.conda', 'anaconda3', 'miniconda3', 'miniforge3']) {
    const envs = path.join(home, base, 'envs');
    if (fs.existsSync(envs)) for (const env of fs.readdirSync(envs)) list.push(win ? path.join(envs, env, 'python.exe') : path.join(envs, env, 'bin', 'python3'));
  }
  return [...new Set(list)].filter((p) => fs.existsSync(p));
}

let cached;
/** The path of a Python with torch and numpy, or null. */
export function torchPython() {
  if (cached !== undefined) return cached;
  cached = null;
  for (const python of candidates()) {
    const result = spawnSync(python, ['-I', probeScript], { encoding: 'utf8', timeout: 90000 });
    try {
      const info = JSON.parse(result.stdout.trim().split(/\r?\n/).pop());
      if (info.torch && info.numpy && !info.error) { cached = python; break; }
    } catch { /* not a working Python */ }
  }
  return cached;
}

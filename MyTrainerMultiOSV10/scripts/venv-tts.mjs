// .venv-tts — the developer tools' Python environment (never committed; .gitignore), made when it is needed:
//   Supertonic TTS for scripts/make-kws-ko.py, ONNX Runtime for the model export tests.
// ensureVenvTts(['onnxruntime', 'numpy']) creates the environment if it is missing, installs the packages it lacks
// and returns its Python. The base Python is one of this computer's (3.10–3.13), MyTrainer's portable Python, or —
// when there is none — a portable Python downloaded into node_modules/.cache.
//   node scripts/venv-tts.mjs [package…]                  make / complete the environment
//   node scripts/venv-tts.mjs --run script.py [args…]      … then run a script with it (npm run data:kws)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
export const venvDir = path.join(root, '.venv-tts');
export const venvPython = path.join(venvDir, win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');

/** pip package → the module to import to check it. */
const MODULES = { onnxruntime: 'onnxruntime', numpy: 'numpy', supertonic: 'supertonic' };
const PORTABLE = { release: '20241016', version: '3.12.7' };

const run = (command, args, options = {}) => spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const say = (log, text) => log?.(`[.venv-tts] ${text}`);

/** [command, args] of a Python 3.10–3.13 that has venv, or null. */
function basePython() {
  const appData = win ? path.join(process.env.APPDATA ?? '', 'com.shkwon.mytrainer') : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'com.shkwon.mytrainer') : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'com.shkwon.mytrainer');
  const portable = (dir) => path.join(dir, win ? 'python.exe' : path.join('bin', 'python3'));
  const candidates = [
    ...(win ? [['py', ['-3.12']], ['py', ['-3.11']], ['py', ['-3.13']], ['py', ['-3.10']], ['python', []]] : [['python3.12', []], ['python3.11', []], ['python3', []], ['python', []]]),
    [portable(path.join(appData, 'python')), []],
    [portable(path.join(root, 'node_modules', '.cache', 'mytrainer-python', 'python')), []],
  ];
  for (const [command, args] of candidates) {
    const probe = run(command, [...args, '-c', 'import sys, venv, ensurepip; print("%d.%d" % sys.version_info[:2])']);
    const [major, minor] = (probe.stdout ?? '').trim().split('.').map(Number);
    if (probe.status === 0 && major === 3 && minor >= 10 && minor <= 13) return [command, args];
  }
  return null;
}

/** Downloads python-build-standalone (the same build the app installs) into node_modules/.cache. */
function downloadPython(log) {
  const target = { 'win32-x64': 'x86_64-pc-windows-msvc', 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'linux-x64': 'x86_64-unknown-linux-gnu', 'linux-arm64': 'aarch64-unknown-linux-gnu' }[`${process.platform}-${process.arch}`];
  if (!target) throw new Error(`no portable Python for ${process.platform}-${process.arch}; install Python 3.12`);
  const dir = path.join(root, 'node_modules', '.cache', 'mytrainer-python');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, 'python.tar.gz');
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PORTABLE.release}/cpython-${PORTABLE.version}+${PORTABLE.release}-${target}-install_only.tar.gz`;
  say(log, `no Python 3.10–3.13 found: downloading Python ${PORTABLE.version} (about 30 MB)…`);
  const tool = (name) => (win && process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', `${name}.exe`) : name);
  for (const [command, args] of [[tool('curl'), ['-L', '--fail', '--silent', '--show-error', '--retry', '3', '-o', archive, url]], [tool('tar'), ['-xzf', archive, '-C', dir]]]) {
    const result = run(command, args);
    if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.error?.message}`);
  }
  fs.rmSync(archive, { force: true });
  return [path.join(dir, 'python', win ? 'python.exe' : path.join('bin', 'python3')), []];
}

const hasModule = (python, module) => run(python, ['-c', `import ${module}`]).status === 0;

/** The environment's Python with `packages` installed (created / completed when needed). Throws when that fails. */
export function ensureVenvTts(packages = [], { log = console.log } = {}) {
  if (!fs.existsSync(venvPython) || run(venvPython, ['-c', 'import sys']).status !== 0) {
    fs.rmSync(venvDir, { recursive: true, force: true });
    const [command, args] = basePython() ?? downloadPython(log);
    say(log, `creating ${path.relative(root, venvDir)} with ${[command, ...args].join(' ')}…`);
    const made = run(command, [...args, '-m', 'venv', venvDir]);
    if (made.status !== 0) throw new Error(`python -m venv failed: ${made.stderr}`);
  }
  const missing = packages.filter((name) => !hasModule(venvPython, MODULES[name] ?? name));
  if (missing.length) {
    say(log, `installing ${missing.join(', ')}…`);
    const pip = run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '--quiet', ...missing], { stdio: ['ignore', 'inherit', 'pipe'] });
    if (pip.status !== 0) throw new Error(`pip install ${missing.join(' ')} failed: ${pip.stderr}`);
  }
  return venvPython;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const runIndex = args.indexOf('--run');
  const script = runIndex >= 0 ? args.slice(runIndex + 1) : [];
  const packages = runIndex >= 0 ? args.slice(0, runIndex) : args;
  // A script names what it needs: make-kws-ko.py uses Supertonic and NumPy.
  if (script[0]?.endsWith('make-kws-ko.py') && !packages.length) packages.push('supertonic', 'numpy');
  try {
    const python = ensureVenvTts(packages);
    if (!script.length) { console.log(python); process.exit(0); }
    process.exit(spawnSync(python, script, { cwd: root, stdio: 'inherit' }).status ?? 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

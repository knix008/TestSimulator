// Finding and installing Python / Node.js so pip and npm checkers can be
// installed from settings. PATH is not enough: the Windows Store `python.exe`
// stub is a miss, and a copy we just installed is not on this process's PATH.
// Official installers (or winget / Homebrew) put a copy under tools/runtime
// or a well-known user folder; findPython / findNode look there too.
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const PYTHON_WIN = { version: '3.12.10', major: '3.12' };
const NODE_FALLBACK = 'v22.20.0';

function onPath(name) { return require('./lint').onPath(name); }

function isAppAlias(p) {
  if (!p) return true;
  const n = String(p).replace(/\//g, '\\').toLowerCase();
  const base = n.split('\\').pop();
  if (!/^(python(?:\d+)?|py)(\.exe)?$/.test(base)) return false;
  if (n.includes('\\windowsapps\\')) return true;
  try { return fs.statSync(p).size < 2048; } catch { return true; }
}

function probe(cmd, args) {
  if (!cmd || !fs.existsSync(cmd)) return false;
  try {
    const r = spawnSync(cmd, args, { timeout: 8000, windowsHide: true, encoding: 'utf8' });
    return r.status === 0;
  } catch { return false; }
}

function firstExisting(cands, probeArgs) {
  for (const p of cands) {
    if (!p || isAppAlias(p) || !fs.existsSync(p)) continue;
    if (probeArgs && !probe(p, probeArgs)) continue;
    return p;
  }
  return null;
}

function runtimeRoot(toolsDir, id) {
  return toolsDir ? path.join(toolsDir, 'runtime', id) : null;
}

function walkExe(dir, name, depth = 2) {
  if (!dir || depth < 0) return null;
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const direct = path.join(dir, exe);
  if (fs.existsSync(direct)) return direct;
  const nested = path.join(dir, 'bin', exe);
  if (fs.existsSync(nested)) return nested;
  if (depth === 0) return null;
  let names;
  try { names = fs.readdirSync(dir); } catch { return null; }
  for (const n of names) {
    const p = path.join(dir, n);
    try { if (!fs.statSync(p).isDirectory()) continue; } catch { continue; }
    const hit = walkExe(p, name, depth - 1);
    if (hit) return hit;
  }
  return null;
}

function pythonCands(toolsDir) {
  const out = [];
  const root = runtimeRoot(toolsDir, 'python');
  if (root) {
    out.push(walkExe(root, 'python'), walkExe(root, 'python3'));
  }
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  if (process.platform === 'win32') {
    for (const base of [path.join(local, 'Programs', 'Python'), path.join(roaming, 'Python'), 'C:\\Python312', 'C:\\Python311']) {
      try { for (const n of fs.readdirSync(base)) out.push(path.join(base, n, 'python.exe')); } catch { /* not there */ }
    }
  } else {
    out.push('/usr/bin/python3', '/usr/local/bin/python3', path.join(home, '.local', 'bin', 'python3'));
  }
  const fromPath = onPath('python3') || onPath('python') || onPath('py');
  if (fromPath && !isAppAlias(fromPath)) {
    if (/^py(\.exe)?$/i.test(path.basename(fromPath))) {
      try {
        const r = spawnSync(fromPath, ['-3', '-c', 'import sys; print(sys.executable)'], { timeout: 8000, windowsHide: true, encoding: 'utf8' });
        const exe = (r.stdout || '').trim();
        if (r.status === 0 && exe && fs.existsSync(exe) && !isAppAlias(exe)) out.unshift(exe);
      } catch { /* ignore */ }
    } else out.push(fromPath);
  }
  return out.filter(Boolean);
}

function nodeCands(toolsDir) {
  const out = [];
  const root = runtimeRoot(toolsDir, 'node');
  if (root) out.push(walkExe(root, 'node'));
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  if (process.platform === 'win32') {
    out.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'));
    out.push(path.join(local, 'Programs', 'nodejs', 'node.exe'));
  } else {
    out.push('/usr/local/bin/node', '/usr/bin/node');
  }
  const fromPath = onPath('node');
  if (fromPath && !isAppAlias(fromPath)) out.push(fromPath);
  return out.filter(Boolean);
}

function findPython(toolsDir) { return firstExisting(pythonCands(toolsDir), ['-c', 'print(1)']); }
function findNode(toolsDir) { return firstExisting(nodeCands(toolsDir), ['-e', 'process.stdout.write("1")']); }

function findWinget() {
  if (process.platform !== 'win32') return null;
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return firstExisting([
    path.join(local, 'Microsoft', 'WindowsApps', 'winget.exe'),
    onPath('winget'),
  ], ['--version']);
}

function findNpmCli(toolsDir) {
  const node = findNode(toolsDir);
  const npm = onPath('npm');
  const dirs = [];
  if (node) dirs.push(path.dirname(node));
  if (npm) dirs.push(path.dirname(npm));
  for (const d of dirs) {
    const cli = path.join(d, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const exe = node || path.join(d, process.platform === 'win32' ? 'node.exe' : 'node');
    if (fs.existsSync(cli) && fs.existsSync(exe) && !isAppAlias(exe)) return { node: exe, cli };
  }
  return null;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'MyEditor' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        httpsGet(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} ${url}`)); return; }
      resolve(res);
    });
    req.on('error', reject);
  });
}

function readText(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

function downloadFile(url, dest, onChunk) {
  return httpsGet(url).then((res) => new Promise((resolve, reject) => {
    const total = Number(res.headers['content-length']) || 0;
    let got = 0;
    const out = fs.createWriteStream(dest);
    res.on('data', (c) => { got += c.length; if (onChunk) onChunk(got, total); });
    res.pipe(out);
    out.on('finish', () => resolve(dest));
    out.on('error', reject);
    res.on('error', reject);
  }));
}

function nodeArch() {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'ia32') return process.platform === 'win32' ? 'x86' : 'x86';
  return process.platform === 'win32' ? 'x64' : (process.arch === 'x64' ? 'x64' : process.arch);
}

async function nodeTarballUrl() {
  const plat = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = nodeArch();
  const ext = plat === 'win' ? 'zip' : 'tar.gz';
  let ver = NODE_FALLBACK;
  try {
    const res = await httpsGet('https://nodejs.org/dist/index.json');
    const list = JSON.parse(await readText(res));
    const lts = list.find((x) => x.lts);
    if (lts && lts.version) ver = lts.version;
  } catch { /* pinned fallback */ }
  return { url: `https://nodejs.org/dist/${ver}/node-${ver}-${plat}-${arch}.${ext}`, ver };
}

function pythonWinUrl() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const v = PYTHON_WIN.version;
  return `https://www.python.org/ftp/python/${v}/python-${v}-${arch}.exe`;
}

function extractArchive(file, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (/\.zip$/i.test(file) && process.platform === 'win32') {
    const ps = onPath('powershell') || onPath('pwsh') || 'powershell';
    const r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${JSON.stringify(file)} -DestinationPath ${JSON.stringify(dest)} -Force`],
    { timeout: 180000, windowsHide: true, encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || `extract exit ${r.status}`).trim().split('\n')[0]);
    return;
  }
  const r = spawnSync('tar', [/\.zip$/i.test(file) ? '-xf' : '-xzf', file, '-C', dest], { timeout: 180000, windowsHide: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `tar exit ${r.status}`).trim().split('\n')[0]);
}

function spawnWait(cmd, args, log, env) {
  return new Promise((resolve, reject) => {
    log(`$ ${path.basename(cmd)} ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}\n`);
    const proc = spawn(cmd, args, { stdio: 'pipe', windowsHide: true, env });
    proc.stdout.on('data', (d) => log(d.toString('utf8')));
    proc.stderr.on('data', (d) => log(d.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit code ${code}`))));
  });
}

function childEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  return env;
}

function wingetIds(id) {
  if (id === 'python') return 'Python.Python.3.12';
  if (id === 'node') return 'OpenJS.NodeJS.LTS';
  return null;
}

// Install Python or Node.js. Prefers winget / Homebrew; otherwise downloads
// the official Windows Python installer or the Node.js binary archive into
// <toolsDir>/runtime/<id>. `log` is (text) => void.
async function installRuntime(id, toolsDir, log) {
  if (id !== 'python' && id !== 'node') throw new Error(`unknown runtime ${id}`);
  if (id === 'python' && findPython(toolsDir)) { log('[already installed]\n'); return findPython(toolsDir); }
  if (id === 'node' && findNode(toolsDir)) { log('[already installed]\n'); return findNode(toolsDir); }

  const winget = findWinget();
  if (winget) {
    const pkg = wingetIds(id);
    await spawnWait(winget, ['install', '-e', '--id', pkg, '--scope', 'user', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], log, childEnv());
    require('./lint').forgetBins();
    const hit = id === 'python' ? findPython(toolsDir) : findNode(toolsDir);
    if (hit) return hit;
    log('[winget finished but the executable was not on PATH yet; trying the official download]\n');
  }

  const brew = onPath('brew');
  if (brew && process.platform === 'darwin') {
    await spawnWait(brew, ['install', id === 'python' ? 'python@3' : 'node'], log, childEnv());
    require('./lint').forgetBins();
    const hit = id === 'python' ? findPython(toolsDir) : findNode(toolsDir);
    if (hit) return hit;
  }

  const dest = runtimeRoot(toolsDir, id);
  if (!dest) throw new Error('no tools directory');
  fs.mkdirSync(dest, { recursive: true });

  if (id === 'python') {
    if (process.platform !== 'win32') throw new Error('Python must be installed with Homebrew or the system package manager');
    const url = pythonWinUrl();
    const setup = path.join(os.tmpdir(), `med-python-${PYTHON_WIN.version}.exe`);
    log(`GET ${url}\n`);
    await downloadFile(url, setup, (got, total) => { if (total && got === total) log(`downloaded ${(got / 1048576).toFixed(1)} MB\n`); });
    await spawnWait(setup, ['/quiet', 'InstallAllUsers=0', 'PrependPath=0', 'Include_pip=1', 'Include_test=0', 'Include_launcher=1', 'Shortcuts=0', `TargetDir=${dest}`], log, childEnv());
    try { fs.unlinkSync(setup); } catch { /* leftover */ }
  } else {
    const { url } = await nodeTarballUrl();
    const ext = /\.zip$/i.test(url) ? '.zip' : '.tar.gz';
    const archive = path.join(os.tmpdir(), `med-node${ext}`);
    log(`GET ${url}\n`);
    await downloadFile(url, archive, (got, total) => { if (total && got === total) log(`downloaded ${(got / 1048576).toFixed(1)} MB\n`); });
    log('extracting\n');
    extractArchive(archive, dest);
    try { fs.unlinkSync(archive); } catch { /* leftover */ }
  }

  require('./lint').forgetBins();
  const hit = id === 'python' ? findPython(toolsDir) : findNode(toolsDir);
  if (!hit) throw new Error(`${id} was installed but the executable was not found`);
  log(`[installed ${hit}]\n`);
  return hit;
}

function runtimeMissing(kind) {
  if (kind === 'npm') return { missing: 'Node.js', runtime: 'node' };
  if (kind === 'pip') return { missing: 'Python', runtime: 'python' };
  return null;
}

module.exports = {
  findPython, findNode, findNpmCli, findWinget, isAppAlias, installRuntime, runtimeMissing, PYTHON_WIN,
};

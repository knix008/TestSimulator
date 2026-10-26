'use strict';

// External software the app can use, detection, and installation through the
// platform package manager after the user agrees (winget / scoop on Windows,
// Homebrew on macOS, apt / dnf / pacman / zypper through pkexec on Linux).
// Nothing is installed without an explicit tools.install call.

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const T = (ko, en) => ({ ko, en });

const TOOLS = [
  {
    id: 'git',
    name: 'Git',
    required: false,
    recommended: true,
    why: T('새 코드(SCM 기준)·작성자 자동 할당·풀 리퀘스트 분석·데스크톱 분석(cov run-desktop)에 씁니다.', 'Used for SCM new code, automatic author assignment, pull request analysis and desktop analysis (cov run-desktop).'),
    without: T('없으면 새 코드는 이전 분석과 비교해 정하고, 작성자 할당과 PR 분석은 꺼집니다.', 'Without it, new code is decided against the previous analysis, and author assignment and PR analysis are off.'),
    check: ['git', ['--version']],
    version: /git version (\S+)/,
    install: {
      win32: { winget: 'Git.Git', scoop: 'git' },
      darwin: { brew: 'git' },
      linux: { apt: 'git', dnf: 'git', pacman: 'git', zypper: 'git' },
    },
    paths: { win32: ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files (x86)\\Git\\cmd', '%LOCALAPPDATA%\\Programs\\Git\\cmd', '%USERPROFILE%\\scoop\\shims'], darwin: ['/opt/homebrew/bin', '/usr/local/bin'], linux: ['/usr/bin'] },
    url: 'https://git-scm.com/downloads',
  },
  {
    id: 'clang',
    name: 'C/C++ compiler (LLVM / Clang)',
    required: false,
    recommended: false,
    why: T('C/C++ 빌드를 캡처해 분석할 때(cov build) 컴파일러가 없으면 씁니다.', 'Used as the compiler for C/C++ build capture (cov build) when the project has none.'),
    without: T('없어도 C/C++ 분석은 빌드 없이(buildless) 할 수 있습니다.', 'C/C++ can still be analyzed without a build (buildless capture).'),
    check: ['clang', ['--version']],
    alternatives: ['gcc', 'cc', 'cl'],
    version: /(?:clang version |Version )?(\d+\.\d+(?:\.\d+)?)/,
    install: {
      win32: { winget: 'LLVM.LLVM', scoop: 'llvm' },
      darwin: { brew: 'llvm' },
      linux: { apt: 'clang', dnf: 'clang', pacman: 'clang', zypper: 'clang' },
    },
    paths: { win32: ['C:\\Program Files\\LLVM\\bin', '%USERPROFILE%\\scoop\\shims'], darwin: ['/opt/homebrew/opt/llvm/bin', '/usr/local/opt/llvm/bin'], linux: ['/usr/bin'] },
    url: 'https://releases.llvm.org/',
  },
];

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

function expand(p) {
  return p.replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');
}

function exe(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

/** Find a program on PATH or in the tool's usual install folders. */
function locate(tool, platform = process.platform) {
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  for (const name of [tool.check[0], ...(tool.alternatives || [])]) {
    for (const d of [...dirs, ...((tool.paths && tool.paths[platform]) || []).map(expand)]) {
      for (const cand of [path.join(d, exe(name)), path.join(d, name)]) {
        try { if (fs.statSync(cand).isFile()) return cand; } catch { /* not here */ }
      }
    }
  }
  return null;
}

function run(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeoutMs || 15000, windowsHide: true });
    return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` };
  } catch {
    return { ok: false, out: '' };
  }
}

/** Installed package managers, best first. */
function managers(platform = process.platform, probe = run) {
  const has = (cmd, args = ['--version']) => probe(cmd, args).ok;
  if (platform === 'win32') return ['winget', 'scoop'].filter((m) => has(m, m === 'scoop' ? ['--version'] : ['--version']));
  if (platform === 'darwin') return has('brew') ? ['brew'] : [];
  const out = [];
  if (has('apt-get')) out.push('apt');
  if (has('dnf')) out.push('dnf');
  if (has('pacman')) out.push('pacman');
  if (has('zypper')) out.push('zypper');
  return out;
}

/** The command line that installs `tool` with `manager` (argv array). */
function installCommand(tool, manager, platform = process.platform, probe = run) {
  const pkg = tool.install[platform] && tool.install[platform][manager];
  if (!pkg) return null;
  const elevate = (argv) => (probe('pkexec', ['--version']).ok ? ['pkexec', ...argv] : ['sudo', '-n', ...argv]);
  switch (manager) {
    case 'winget': return ['winget', 'install', '--id', pkg, '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements', '--silent'];
    case 'scoop': return ['scoop', 'install', pkg];
    case 'brew': return ['brew', 'install', pkg];
    case 'apt': return elevate(['apt-get', 'install', '-y', pkg]);
    case 'dnf': return elevate(['dnf', 'install', '-y', pkg]);
    case 'pacman': return elevate(['pacman', '-S', '--noconfirm', pkg]);
    case 'zypper': return elevate(['zypper', '--non-interactive', 'install', pkg]);
    default: return null;
  }
}

function quote(argv) {
  return argv.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
}

/** Status of every tool: installed, version, and how it would be installed. */
function status(settings = {}, opts = {}) {
  const platform = opts.platform || process.platform;
  const probe = opts.probe || run;
  const mgrs = opts.managers || managers(platform, probe);
  const declined = new Set((settings.tools && settings.tools.declined) || []);
  const out = [];
  for (const tool of TOOLS) {
    const where = opts.locate ? opts.locate(tool) : locate(tool, platform);
    let version = null;
    if (where) {
      const r = probe(where, tool.check[1]);
      const m = tool.version.exec(r.out);
      version = m ? m[1] : null;
    }
    const manager = mgrs.find((m) => tool.install[platform] && tool.install[platform][m]) || null;
    const argv = manager ? installCommand(tool, manager, platform, probe) : null;
    out.push({
      id: tool.id, name: tool.name, required: tool.required, recommended: tool.recommended,
      why: tool.why, without: tool.without, url: tool.url,
      installed: !!where, path: where, version,
      canInstall: !where && !!argv, manager, command: argv ? quote(argv) : null,
      declined: declined.has(tool.id),
    });
  }
  return { platform, managers: mgrs, node: process.versions.node, tools: out, askOnStart: !(settings.tools && settings.tools.askOnStart === false) };
}

/** Tools worth offering at start: missing, recommended, installable and not declined. */
function offers(settings = {}, opts = {}) {
  const s = status(settings, opts);
  if (!s.askOnStart) return [];
  return s.tools.filter((t) => !t.installed && t.recommended && t.canInstall && !t.declined);
}

// ---------------------------------------------------------------------------
// Install jobs (one at a time). Output is kept for the progress view.

const jobs = new Map();
let seq = 0;

function startInstall(id, opts = {}) {
  const tool = BY_ID.get(id);
  if (!tool) throw Object.assign(new Error(`Unknown tool: ${id}`), { code: 'NOT_FOUND' });
  if ([...jobs.values()].some((j) => j.status === 'running')) throw Object.assign(new Error('Another installation is running'), { code: 'BUSY' });
  const platform = opts.platform || process.platform;
  const mgrs = opts.managers || managers(platform);
  const manager = opts.manager && mgrs.includes(opts.manager) ? opts.manager : mgrs.find((m) => tool.install[platform] && tool.install[platform][m]);
  const argv = manager ? installCommand(tool, manager, platform) : null;
  if (!argv) throw Object.assign(new Error(`No package manager can install ${tool.name} here. Download it from ${tool.url}`), { code: 'NO_MANAGER' });
  const job = { id: `job-${++seq}`, tool: id, manager, command: quote(argv), status: 'running', log: [], exitCode: null, startedAt: new Date().toISOString(), finishedAt: null };
  jobs.set(job.id, job);
  const spawnFn = opts.spawn || spawn;
  let child;
  try {
    child = spawnFn(argv[0], argv.slice(1), { windowsHide: true, env: process.env });
  } catch (err) {
    job.status = 'failed';
    job.log.push(String(err.message || err));
    job.finishedAt = new Date().toISOString();
    return job;
  }
  const add = (buf) => {
    for (const line of String(buf).split(/\r?\n|\r/)) if (line.trim()) job.log.push(line.slice(0, 500));
    if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
  };
  if (child.stdout) child.stdout.on('data', add);
  if (child.stderr) child.stderr.on('data', add);
  child.on('error', (err) => { add(err.message); finish(job, tool, 1, platform); });
  child.on('close', (code) => finish(job, tool, code, platform));
  return job;
}

function finish(job, tool, code, platform) {
  if (job.status !== 'running') return;
  job.exitCode = code;
  // The running process does not see PATH changes made by the installer;
  // add the tool's usual folders so it works without a restart.
  const dirs = ((tool.paths && tool.paths[platform]) || []).map(expand).filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  const key = process.env.Path !== undefined && process.env.PATH === undefined ? 'Path' : 'PATH';
  const current = (process.env[key] || '').split(path.delimiter);
  for (const d of dirs) if (!current.includes(d)) current.push(d);
  process.env[key] = current.filter(Boolean).join(path.delimiter);
  const found = locate(tool, platform);
  job.status = code === 0 && found ? 'done' : 'failed';
  if (code === 0 && !found) job.log.push('The installer finished, but the program was not found. Restart the app or install it manually.');
  job.finishedAt = new Date().toISOString();
}

function job(id) {
  const j = jobs.get(id);
  if (!j) throw Object.assign(new Error(`Unknown job: ${id}`), { code: 'NOT_FOUND' });
  return { ...j, log: [...j.log] };
}

module.exports = { TOOLS, status, offers, startInstall, job, installCommand, managers, locate };

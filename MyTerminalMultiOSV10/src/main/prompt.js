const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const core = require('../shared/prompt-core');

// Everything that needs the file system / git / os lives here; the prompt
// engine (segments, templates, presets, ANSI rendering) is in
// ../shared/prompt-core.js.

/** @type {Map<string, { at: number, status: object }>} */
const gitCache = new Map();
const GIT_CACHE_MS = 1500;

function runGit(args, cwd, timeout = 1500) {
  return execFileSync('git', ['--no-optional-locks', ...args], {
    cwd,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 8 << 20,
  });
}

/** @type {Map<string, Promise<object>>} in-flight refreshes per directory */
const gitInflight = new Map();
/** @type {Set<(dir: string, status: object) => void>} */
const gitListeners = new Set();

const GIT_ARGS = ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '--show-stash', '--ignore-submodules=dirty'];

/**
 * Refresh the git status of a directory in the background (one process per
 * directory at a time). Resolves with the status and notifies listeners.
 */
function refreshGitStatus(dir) {
  const running = gitInflight.get(dir);
  if (running) return running;
  const promise = new Promise((resolve) => {
    if (!fs.existsSync(dir)) return resolve({ repo: false });
    execFile('git', GIT_ARGS, { cwd: dir, encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 8 << 20 }, (err, out) => {
      if (err) return resolve({ repo: false });
      const st = parseGitStatus(out);
      if (st.branch !== '(detached)') return resolve(st);
      execFile('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir, encoding: 'utf8', timeout: 1500, windowsHide: true }, (e2, sha) => {
        if (!e2) st.branch = `@${String(sha).trim()}`;
        resolve(st);
      });
    });
  })
    .then((st) => {
      gitCache.set(dir, { at: Date.now(), status: st });
      for (const fn of gitListeners) {
        try {
          fn(dir, st);
        } catch (_) {
          /* ignore */
        }
      }
      return st;
    })
    .finally(() => {
      if (gitInflight.get(dir) === promise) gitInflight.delete(dir);
    });
  gitInflight.set(dir, promise);
  return promise;
}

/** Subscribe to background git status results (`fn(dir, status)`); returns an unsubscribe function. */
function onGitStatus(fn) {
  gitListeners.add(fn);
  return () => gitListeners.delete(fn);
}

/**
 * Git status of a directory, for the prompt — never blocks: the cached value
 * is returned (stale ones are refreshed in the background, a miss starts a
 * refresh and answers `{ repo:false, pending:true }`; the shell redraws its
 * prompt when the result arrives).
 *   { repo:false } or { repo:true, branch, upstream, ahead, behind, staged, changed, untracked, conflicts, stashes }
 */
function gitStatus(cwd) {
  const dir = path.resolve(cwd || process.cwd());
  const cached = gitCache.get(dir);
  if (cached) {
    if (Date.now() - cached.at >= GIT_CACHE_MS) refreshGitStatus(dir);
    return cached.status;
  }
  refreshGitStatus(dir);
  return { repo: false, pending: true };
}

/** Blocking variant (tests / one-off tools). */
function gitStatusSync(cwd) {
  const dir = path.resolve(cwd || process.cwd());
  let st = { repo: false };
  try {
    if (!fs.existsSync(dir)) throw new Error('missing');
    st = parseGitStatus(runGit(GIT_ARGS.slice(1), dir));
    if (st.branch === '(detached)') {
      try {
        st.branch = `@${runGit(['rev-parse', '--short', 'HEAD'], dir, 700).trim()}`;
      } catch (_) {
        /* keep (detached) */
      }
    }
  } catch (_) {
    st = { repo: false };
  }
  gitCache.set(dir, { at: Date.now(), status: st });
  return st;
}

/** Parse `git status --porcelain=v2 --branch --show-stash` output. */
function parseGitStatus(out) {
  const st = { repo: true, branch: '', upstream: '', ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, stashes: 0 };
  for (const line of String(out || '').split('\n')) {
    if (!line) continue;
    if (line.startsWith('# branch.head ')) st.branch = line.slice(14).trim();
    else if (line.startsWith('# branch.upstream ')) st.upstream = line.slice(18).trim();
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) {
        st.ahead = Number(m[1]);
        st.behind = Number(m[2]);
      }
    } else if (line.startsWith('# stash ')) st.stashes = Number(line.slice(8)) || 0;
    else if (line[0] === '1' || line[0] === '2') {
      const xy = line.slice(2, 4);
      if (xy[0] !== '.') st.staged++;
      if (xy[1] !== '.') st.changed++;
    } else if (line[0] === 'u') st.conflicts++;
    else if (line[0] === '?') st.untracked++;
  }
  return st;
}

function readGitBranch(cwd) {
  const st = gitStatusSync(cwd);
  return st.repo ? st.branch : '';
}

function isRoot() {
  try {
    return process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0;
  } catch (_) {
    return false;
  }
}

/**
 * The state a prompt is rendered against (see prompt-core renderPrompt).
 * ctx: { cwd, user, host, shell, rc, ms, ssh, gitMode }
 */
function promptState(ctx = {}) {
  const cwd = ctx.cwd || process.cwd();
  const state = {
    cwd,
    home: os.homedir(),
    git: gitStatus(cwd),
    user: ctx.user || os.userInfo().username || 'user',
    host: ctx.host || os.hostname(),
    shell: ctx.shell || 'MyShell',
    platform: process.platform,
    rc: Number(ctx.rc) || 0,
    ms: Number(ctx.ms) || 0,
    now: new Date(),
    root: isRoot(),
    ssh: !!ctx.ssh,
  };
  return core.applyGitMode(state, ctx.gitMode);
}

/**
 * Render a prompt config to ANSI text for the terminal.
 * ctx: { cwd, user, host, shell, rc, ms, gitMode, theme: { accent, fg, bg } }
 */
function renderPrompt(config, ctx = {}) {
  return core.renderPromptAnsi(config, promptState(ctx), ctx.theme);
}

module.exports = {
  ...core,
  gitStatus,
  gitStatusSync,
  refreshGitStatus,
  onGitStatus,
  parseGitStatus,
  readGitBranch,
  promptState,
  renderPrompt,
};

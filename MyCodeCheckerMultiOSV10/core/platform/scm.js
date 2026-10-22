'use strict';

// Git integration through `git` on PATH (child_process.execFile, no shell).
// Every function resolves; none rejects. When git is missing, the folder is
// not a repository or a ref does not exist, the result is an empty value
// ({ ok:false } / [] / null / {}), never an exception.
//
// Option common to all calls: { git: 'git', timeoutMs: 15000 }.

const { execFile } = require('child_process');
const path = require('path');
const { normPath } = require('./util');

const NULL_SHA = '0000000000000000000000000000000000000000';

/**
 * Run git and capture stdout. Resolves { ok, stdout, stderr, code }.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{git?:string, timeoutMs?:number, maxBuffer?:number}} [opts]
 */
function runGit(cwd, args, opts = {}) {
  return new Promise((resolve) => {
    try {
      execFile(opts.git || 'git', ['-c', 'core.quotepath=off', ...args], {
        cwd, timeout: opts.timeoutMs || 15000, maxBuffer: opts.maxBuffer || 64 * 1024 * 1024, windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      }, (err, stdout, stderr) => {
        if (err) resolve({ ok: false, stdout: String(stdout || ''), stderr: String(stderr || err.message || ''), code: typeof err.code === 'number' ? err.code : -1 });
        else resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || ''), code: 0 });
      });
    } catch (err) {
      resolve({ ok: false, stdout: '', stderr: err.message, code: -1 });
    }
  });
}

/** Is git callable at all? Resolves { available, version }. */
async function gitAvailable(opts = {}) {
  const r = await runGit(process.cwd(), ['--version'], opts);
  const m = r.stdout.match(/git version (\S+)/);
  return { available: r.ok, version: m ? m[1] : null };
}

/**
 * Detect the repository containing `dir`.
 * @returns {Promise<{ok:boolean, root:string|null, branch:string|null, head:string|null, detached:boolean, dirty:boolean, remote:string|null}>}
 */
async function detectRepo(dir, opts = {}) {
  const empty = { ok: false, root: null, branch: null, head: null, detached: false, dirty: false, remote: null };
  const top = await runGit(dir, ['rev-parse', '--show-toplevel'], opts);
  if (!top.ok) return empty;
  const root = path.resolve(top.stdout.trim());
  const [branch, head, status, remote] = await Promise.all([
    currentBranch(dir, opts),
    runGit(dir, ['rev-parse', 'HEAD'], opts),
    runGit(dir, ['status', '--porcelain'], opts),
    runGit(dir, ['config', '--get', 'remote.origin.url'], opts),
  ]);
  return {
    ok: true, root, branch, head: head.ok ? head.stdout.trim() : null, detached: !branch,
    dirty: status.ok && status.stdout.trim().length > 0, remote: remote.ok ? remote.stdout.trim() || null : null,
  };
}

/** Current branch name, or null when detached / no repo / no commits with an unborn name read from HEAD. */
async function currentBranch(dir, opts = {}) {
  const r = await runGit(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'], opts);
  return r.ok ? r.stdout.trim() || null : null;
}

/**
 * Local (and with {remote:true} remote) branches.
 * @returns {Promise<{name:string, head:string, current:boolean, remote:boolean, date:string|null}[]>}
 */
async function listBranches(dir, opts = {}) {
  const refs = opts.remote ? ['refs/heads', 'refs/remotes'] : ['refs/heads'];
  const r = await runGit(dir, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(HEAD)%09%(committerdate:iso-strict)', ...refs], opts);
  if (!r.ok) return [];
  return r.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [ref, head, cur, date] = line.split('\t');
    const remote = ref.startsWith('refs/remotes/');
    return { name: ref.replace(/^refs\/(heads|remotes)\//, ''), head, current: cur === '*', remote, date: date || null };
  }).filter((b) => !b.name.endsWith('/HEAD'));
}

/** Merge base of HEAD (or `ref`) with `target`. Resolves the SHA or null. */
async function mergeBase(dir, target, ref = 'HEAD', opts = {}) {
  if (!target) return null;
  const r = await runGit(dir, ['merge-base', target, ref], opts);
  return r.ok ? r.stdout.trim() || null : null;
}

/** Parse `git diff --unified=0` output into { file: [[start,end], ...] } of new-side line ranges. */
function parseUnifiedZero(diffText) {
  const out = {};
  let file = null;
  for (const line of String(diffText || '').split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      file = p === '/dev/null' ? null : normPath(p.replace(/^b\//, '').replace(/^"(.*)"$/, '$1'));
      if (file && !out[file]) out[file] = [];
    } else if (file && line.startsWith('@@')) {
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (!m) continue;
      const start = Number(m[1]);
      const count = m[2] == null ? 1 : Number(m[2]);
      if (count > 0) out[file].push([start, start + count - 1]);
    }
  }
  return out;
}

/** Parse `git diff --name-status -M` output. */
function parseNameStatus(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const code = parts[0][0];
    if (code === 'R' || code === 'C') out.push({ status: code, from: normPath(parts[1]), file: normPath(parts[2]) });
    else out.push({ status: code, file: normPath(parts[1]) });
  }
  return out;
}

/**
 * Files and line ranges changed relative to `ref` (default: the merge base
 * with opts.target, else HEAD). With { workingTree:true } (default) the diff
 * includes uncommitted edits; untracked files count as new whole files.
 * @param {string} dir
 * @param {string|null} ref
 * @param {{target?:string, workingTree?:boolean, includeUntracked?:boolean, git?:string}} [opts]
 * @returns {Promise<{ok:boolean, base:string|null, files:Record<string,{status:string, isNew:boolean, ranges:number[][], from?:string}>}>}
 */
async function changedLines(dir, ref, opts = {}) {
  let base = ref || null;
  if (!base && opts.target) base = await mergeBase(dir, opts.target, 'HEAD', opts);
  if (!base) base = 'HEAD';
  const verify = await runGit(dir, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], opts);
  if (!verify.ok) return { ok: false, base: null, files: {} };
  const sha = verify.stdout.trim();
  const range = opts.workingTree === false ? [sha, 'HEAD'] : [sha];
  const [names, diff] = await Promise.all([
    runGit(dir, ['diff', '--no-color', '--name-status', '-M', ...range, '--'], opts),
    runGit(dir, ['diff', '--no-color', '--no-ext-diff', '--unified=0', '-M', ...range, '--'], opts),
  ]);
  if (!names.ok || !diff.ok) return { ok: false, base: sha, files: {} };
  const ranges = parseUnifiedZero(diff.stdout);
  const files = {};
  for (const entry of parseNameStatus(names.stdout)) {
    if (entry.status === 'D') { files[entry.file] = { status: 'D', isNew: false, ranges: [] }; continue; }
    files[entry.file] = { status: entry.status, isNew: entry.status === 'A', ranges: ranges[entry.file] || [], ...(entry.from ? { from: entry.from } : {}) };
  }
  if (opts.includeUntracked !== false && opts.workingTree !== false) {
    const un = await runGit(dir, ['ls-files', '--others', '--exclude-standard'], opts);
    if (un.ok) for (const f of un.stdout.split(/\r?\n/).filter(Boolean)) files[normPath(f)] = { status: 'A', isNew: true, ranges: [], untracked: true };
  }
  return { ok: true, base: sha, files };
}

/** Is `line` of `file` inside a changed-lines map from changedLines()? New files count as fully changed. */
function isChangedLine(changed, file, line) {
  const files = changed && changed.files ? changed.files : changed || {};
  const entry = files[normPath(file)];
  if (!entry || entry.status === 'D') return false;
  if (entry.isNew) return true;
  if (!line) return false;
  return entry.ranges.some(([a, b]) => line >= a && line <= b);
}

/** Parse `git blame --line-porcelain` output. */
function parseBlame(textOut) {
  const lines = [];
  const commits = {};
  let cur = null;
  for (const raw of String(textOut || '').split('\n')) {
    const line = raw.replace(/\r$/, '');
    const head = line.match(/^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/);
    if (head) { cur = { commit: head[1], line: Number(head[3]) }; continue; }
    if (!cur) continue;
    if (line.startsWith('\t')) {
      const c = commits[cur.commit] || {};
      const rec = {
        line: cur.line, commit: cur.commit, author: cur.author || c.author || '', email: cur.email || c.email || '',
        date: cur.time ? new Date(cur.time * 1000).toISOString() : (c.date || null), summary: cur.summary || c.summary || '',
        committed: cur.commit !== NULL_SHA,
      };
      commits[cur.commit] = { author: rec.author, email: rec.email, date: rec.date, summary: rec.summary };
      lines.push(rec);
      cur = null;
      continue;
    }
    const sp = line.indexOf(' ');
    const k = sp < 0 ? line : line.slice(0, sp);
    const v = sp < 0 ? '' : line.slice(sp + 1);
    if (k === 'author') cur.author = v;
    else if (k === 'author-mail') cur.email = v.replace(/^<|>$/g, '');
    else if (k === 'author-time') cur.time = Number(v);
    else if (k === 'summary') cur.summary = v;
  }
  return lines;
}

/**
 * git blame for one file (root-relative path). Resolves [{line, commit, author, email, date, summary, committed}] or [].
 * @param {string} dir repository (or any folder in it)
 * @param {string} file path relative to dir
 * @param {{rev?:string, git?:string}} [opts]
 */
async function blame(dir, file, opts = {}) {
  const args = ['blame', '--line-porcelain'];
  if (opts.rev) args.push(opts.rev);
  args.push('--', file);
  const r = await runGit(dir, args, opts);
  return r.ok ? parseBlame(r.stdout) : [];
}

/** Blame many files. Resolves { file: lines[] } (files that fail are left out). */
async function blameFiles(dir, files, opts = {}) {
  const out = {};
  const list = [...new Set(files.map(normPath))];
  const width = opts.concurrency || 4;
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const f = list[next++];
      const lines = await blame(dir, f, opts);
      if (lines.length) out[f] = lines;
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, list.length) }, worker));
  return out;
}

/**
 * Pure: suggest an author for every issue from blame data (Sonar's
 * auto-assignment). `emailToLogin` maps commit emails to user logins.
 * Returns a new array; issues that already have an assignee keep it unless opts.overwrite.
 * @param {object[]} issues
 * @param {Record<string,object[]>} blameByFile output of blameFiles()
 * @param {{emailToLogin?:Record<string,string>, overwrite?:boolean, defaultAssignee?:string}} [opts]
 */
function assignAuthors(issues, blameByFile, opts = {}) {
  const map = opts.emailToLogin || {};
  return (issues || []).map((issue) => {
    const lines = blameByFile[normPath(issue.file)] || [];
    const hit = lines.find((l) => l.line === issue.line);
    if (!hit) return { ...issue };
    const login = map[hit.email] || map[String(hit.email).toLowerCase()] || null;
    const next = { ...issue, author: hit.email || hit.author, authorName: hit.author, commit: hit.commit, lineDate: hit.date };
    if ((!issue.assignee || opts.overwrite) && hit.committed) next.assignee = login || opts.defaultAssignee || issue.assignee || '';
    return next;
  });
}

/**
 * Pure: lines changed after a date, from blame data -> changed-lines map
 * (same shape as changedLines().files) for "new code since date".
 * @param {Record<string,object[]>} blameByFile
 * @param {string|number|Date} since
 */
function linesSinceDate(blameByFile, since) {
  const cutoff = new Date(since).getTime();
  const files = {};
  for (const [file, lines] of Object.entries(blameByFile || {})) {
    const fresh = lines.filter((l) => !l.committed || (l.date && new Date(l.date).getTime() >= cutoff)).map((l) => l.line).sort((a, b) => a - b);
    if (!fresh.length) continue;
    const ranges = [];
    for (const n of fresh) {
      const last = ranges[ranges.length - 1];
      if (last && n === last[1] + 1) last[1] = n; else ranges.push([n, n]);
    }
    files[file] = { status: 'M', isNew: fresh.length === lines.length, ranges };
  }
  return { ok: true, base: null, since: new Date(cutoff).toISOString(), files };
}

/**
 * Tags as versions, newest first: [{name, commit, date}].
 */
async function listTags(dir, opts = {}) {
  const r = await runGit(dir, ['for-each-ref', '--sort=-creatordate', '--format=%(refname:short)%09%(objectname)%09%(*objectname)%09%(creatordate:iso-strict)', 'refs/tags'], opts);
  if (!r.ok) return [];
  return r.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, obj, peeled, date] = line.split('\t');
    return { name, commit: peeled || obj, date: date || null };
  });
}

/** Changed lines since a version tag ("new code = since version"). */
async function changedSinceVersion(dir, tag, opts = {}) {
  return changedLines(dir, tag, opts);
}

/** Commit log entries since a ref or date: [{commit, author, email, date, subject}]. */
async function log(dir, opts = {}) {
  const args = ['log', `--max-count=${opts.max || 200}`, '--format=%H%x09%an%x09%ae%x09%aI%x09%s'];
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.from) args.push(`${opts.from}..${opts.to || 'HEAD'}`);
  const r = await runGit(dir, args, opts);
  if (!r.ok) return [];
  return r.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [commit, author, email, date, subject] = line.split('\t');
    return { commit, author, email, date, subject };
  });
}

module.exports = {
  NULL_SHA, runGit, gitAvailable, detectRepo, currentBranch, listBranches, mergeBase, parseUnifiedZero, parseNameStatus,
  changedLines, isChangedLine, parseBlame, blame, blameFiles, assignAuthors, linesSinceDate, listTags, changedSinceVersion, log,
};

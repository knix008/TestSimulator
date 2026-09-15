// The one API surface both hosts expose to the UI.
//
//   electron/ipc.js     → ipcMain.handle('api', (e, name, args) => api.call(name, args))
//   server/server.js    → POST /api/<name> with a JSON body
//
// Every method takes a single plain-object argument and returns JSON-able
// data, so the renderer's backend layer (src/lib/backend.js) is a thin
// transport switch. Long operations return a job snapshot right away; the
// UI then follows the job (IPC push or HTTP polling) until it finishes.
'use strict';

const os = require('os');
const path = require('path');
const fsops = require('./fsops');
const archive = require('./archive');
const { JobRegistry } = require('./jobs');
const { Session } = require('./session');
const { createTerminals } = require('./terminal');

function createApi(host = {}) {
  const jobs = host.jobs || new JobRegistry();
  const session = host.session || new Session(host.configDir);
  session.load();
  const terminals = createTerminals();

  const methods = {
    // ── app ──
    'app.info': async () => ({
      platform: process.platform,
      home: os.homedir(),
      sep: path.sep,
      host: host.name || 'node',
      version: host.version || '',
      buildInfo: host.buildInfo || null,
      capabilities: {
        open: !!host.openPath,
        trash: !!host.trashPath || process.platform === 'linux' || process.platform === 'darwin',
        clipboard: !!host.clipboard,
        watch: true,
      },
    }),

    // ── file system ──
    'fs.home': async () => ({ path: fsops.homeDir() }),
    'fs.list': async ({ path: p, showHidden }) => fsops.listDirectory(p, { showHidden: !!showHidden }),
    'fs.subdirs': async ({ path: p }) => fsops.listSubdirectories(p),
    'fs.roots': async () => fsops.listRoots(),
    'fs.drives': async () => fsops.listDrives(),
    'fs.stat': async ({ path: p }) => fsops.statPath(p),
    'fs.mtime': async ({ path: p }) => ({ mtime: await fsops.directoryMtime(p) }),
    'fs.exists': async ({ path: p }) => ({ exists: await fsops.exists(p), isDir: await fsops.isDirectory(p) }),
    'fs.mkdir': async ({ dir, name }) => ({ path: await fsops.makeDirectory(dir, name) }),
    'fs.createFile': async ({ dir, name }) => ({ path: await fsops.createFile(dir, name) }),
    'fs.rename': async ({ path: p, newName }) => ({ path: await fsops.renamePath(p, newName) }),
    'fs.open': async ({ path: p }) => {
      if (!host.openPath) throw new Error('OPEN_UNSUPPORTED');
      const result = await host.openPath(p);
      if (result) throw new Error(result);
      return { ok: true };
    },

    // ── long operations (return job snapshots) ──
    'ops.transfer': async ({ sources, dest, move }) =>
      jobs.run(move ? 'move' : 'copy', { dest, count: sources.length }, (job) =>
        fsops.transfer(sources, dest, { move: !!move, job })).snapshot(),
    'ops.delete': async ({ paths }) =>
      jobs.run('delete', { count: paths.length }, (job) => fsops.deletePaths(paths, job)).snapshot(),
    'ops.trash': async ({ paths }) =>
      jobs.run('trash', { count: paths.length }, (job) => fsops.trashPaths(paths, job, host.trashPath)).snapshot(),
    'archive.create': async (opts) =>
      jobs.run('compress', { count: opts.sources.length, split: !!opts.split }, (job) => archive.create(opts, job)).snapshot(),
    'archive.extract': async (opts) =>
      jobs.run('extract', { archivePath: opts.archivePath, destDir: opts.destDir }, (job) => archive.extract(opts, job)).snapshot(),
    'archive.describe': async ({ path: p }) => archive.describe(p),
    'archive.formats': async () => ({ formats: archive.FORMATS }),
    'search.start': async ({ root, pattern, content, matchContent }) =>
      jobs.run('search', { root }, (job) => fsops.search(root, { pattern, content, matchContent }, job)).snapshot(),

    // ── jobs ──
    'jobs.get': async ({ id }) => jobs.snapshot(id),
    'jobs.cancel': async ({ id }) => ({ ok: jobs.cancel(id) }),
    'jobs.resolveConflict': async ({ id, answer, applyAll }) => ({ ok: jobs.resolveConflict(id, answer, !!applyAll) }),
    'jobs.running': async () => Array.from(jobs.jobs.values()).filter((j) => j.status === 'running').map((j) => j.snapshot()),

    // ── terminal dock (core/terminal.js) ──
    'term.shells': async () => terminals.shells(),
    'term.create': async ({ cwd, shell }) => terminals.create({ cwd, shell }),
    'term.run': async ({ id, line }) => ({ ok: terminals.run({ id, line: String(line == null ? '' : line) }) }),
    'term.write': async ({ id, data }) => ({ ok: terminals.write({ id, data: String(data || '') }) }),
    'term.read': async ({ id, since }) => terminals.read({ id, since: Number(since) || 0 }),
    'term.kill': async ({ id }) => ({ ok: terminals.kill({ id }) }),
    'term.list': async () => terminals.list(),
    'term.complete': async ({ id, line, cursor }) => terminals.complete({ id, line: String(line || ''), cursor }),
    'git.status': async ({ cwd }) => terminals.git({ cwd }),

    // ── session ──
    'session.load': async () => session.get(),
    'session.save': async ({ patch }) => session.save(patch),

    // ── clipboard (host-provided; the browser uses navigator.clipboard) ──
    'clipboard.read': async () => ({ text: host.clipboard ? host.clipboard.readText() : '' }),
    'clipboard.write': async ({ text }) => { if (host.clipboard) host.clipboard.writeText(text || ''); return { ok: true }; },
  };

  async function call(name, args) {
    const fn = methods[name];
    if (!fn) throw new Error(`Unknown API method: ${name}`);
    return fn(args || {});
  }

  // Kills every shell the dock opened (called when the host quits).
  function shutdown() { terminals.shutdown(); }

  return { call, jobs, session, terminals, shutdown, methods: Object.keys(methods) };
}

// Turns an Error into the { code, message } shape the UI shows.
function serializeError(err) {
  if (!err) return { code: 'UNKNOWN', message: 'Unknown error' };
  return {
    code: err.code || 'ERROR',
    message: err.message || String(err),
    path: err.path || undefined,
    syscall: err.syscall || undefined,
    stack: err.stack || undefined,
  };
}

module.exports = { createApi, serializeError };

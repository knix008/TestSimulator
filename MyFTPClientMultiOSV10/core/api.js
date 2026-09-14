// The one API surface both hosts expose to the UI.
//
//   electron/ipc.js     → ipcMain.handle('api', (e, name, args) => api.call(name, args))
//   server/server.js    → POST /api/<name> with a JSON body
//
// Every method takes a single plain-object argument and returns JSON-able
// data, so the renderer's backend layer (src/lib/backend.js) is a thin
// transport switch. Long operations (connect, transfers, remote delete)
// return a job snapshot right away; the UI then follows the job (IPC push or
// HTTP polling) until it finishes.
'use strict';

const os = require('os');
const path = require('path');
const local = require('./local');
const transfer = require('./transfer');
const { Connections } = require('./connections');
const { JobRegistry } = require('./jobs');
const { Session } = require('./session');
const { Profiles, PROTOCOLS } = require('./profiles');
const { History } = require('./history');
const { posixJoin, posixParent } = require('./remote');

function createApi(host = {}) {
  const jobs = host.jobs || new JobRegistry();
  const session = host.session || new Session(host.configDir);
  session.load();
  const profiles = new Profiles(session.configDir);
  profiles.load();
  const history = new History(session.configDir);
  history.load();
  const connections = new Connections();

  function checkRemoteName(name) {
    if (!name || name.includes('/') || name === '.' || name === '..') {
      const e = new Error(`Invalid name: ${name}`); e.code = 'EINVAL'; throw e;
    }
  }

  const methods = {
    // ── app ──
    'app.info': async () => ({
      platform: process.platform,
      home: os.homedir(),
      sep: path.sep,
      host: host.name || 'node',
      version: host.version || '',
      buildInfo: host.buildInfo || null,
      protocols: PROTOCOLS,
      capabilities: {
        reveal: !!host.revealPath,     // "탐색기에서 열기"
        open: !!host.openPath,
        clipboard: !!host.clipboard,
      },
    }),

    // ── local file system ──
    'local.roots': async () => ({ roots: await local.listRoots() }),
    'local.list': async ({ path: p }) => local.listDirectory(p),
    'local.exists': async ({ path: p }) => local.exists(p),
    'local.stat': async ({ path: p }) => local.statPath(p),
    'local.mkdir': async ({ dir, name }) => ({ path: await local.makeDirectory(dir, name) }),
    'local.rename': async ({ path: p, newName }) => ({ path: await local.renamePath(p, newName) }),
    'local.delete': async ({ paths }) => local.deletePaths(paths || []),
    'local.reveal': async ({ path: p }) => {
      if (!host.revealPath) throw Object.assign(new Error('Not available in the web version'), { code: 'UNSUPPORTED' });
      await host.revealPath(p);
      return { ok: true };
    },
    'local.open': async ({ path: p }) => {
      if (!host.openPath) throw Object.assign(new Error('Not available in the web version'), { code: 'UNSUPPORTED' });
      const result = await host.openPath(p);
      if (result) throw new Error(result);
      return { ok: true };
    },

    // ── remote (server) ──
    'remote.connect': async ({ protocol, host: h, port, user, password }) => {
      if (!h) throw Object.assign(new Error('Host is required'), { code: 'EINVAL' });
      return jobs.run('connect', { protocol, host: h, port }, async (job) => {
        const info = await connections.connect({ protocol, host: h, port, user, password }, job);
        history.add(info);   // remembered even without a profile
        return info;
      }).snapshot();
    },
    'remote.disconnect': async ({ id }) => ({ ok: await connections.disconnect(id) }),
    'remote.info': async ({ id }) => connections.info(id),
    'remote.list': async ({ id, path: p }) => {
      const dir = p || '/';
      const entries = await connections.get(id).list(dir);
      entries.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })));
      return { path: dir, parent: dir === '/' ? null : posixParent(dir), entries };
    },
    'remote.mkdir': async ({ id, dir, name }) => {
      checkRemoteName(name);
      const p = posixJoin(dir, name);
      await connections.get(id).mkdir(p);
      return { path: p };
    },
    'remote.rename': async ({ id, path: p, newName }) => {
      checkRemoteName(newName);
      const dest = posixJoin(posixParent(p), newName);
      await connections.get(id).rename(p, dest);
      return { path: dest };
    },
    'remote.delete': async ({ id, items }) =>
      jobs.run('remoteDelete', { count: (items || []).length }, (job) => transfer.removeRemote(connections.get(id), items || [], job)).snapshot(),

    // ── transfers (return job snapshots) ──
    'transfer.download': async ({ id, items, localDir }) => {
      const client = connections.get(id);
      if (!(await local.isDirectory(localDir))) throw Object.assign(new Error(`Local folder not found: ${localDir}`), { code: 'ENOENT', path: localDir });
      return jobs.run('download', { count: (items || []).length, localDir }, (job) => transfer.download(client, items || [], localDir, job)).snapshot();
    },
    'transfer.upload': async ({ id, items, remoteDir }) => {
      const client = connections.get(id);
      return jobs.run('upload', { count: (items || []).length, remoteDir }, (job) => transfer.upload(client, items || [], remoteDir || '/', job)).snapshot();
    },

    // ── profiles ──
    'profiles.list': async () => ({ profiles: profiles.list() }),
    'profiles.save': async ({ profile }) => profiles.save(profile || {}),
    'profiles.delete': async ({ names }) => profiles.remove(names || []),

    // ── connection history (successful connections, newest first) ──
    'history.list': async () => ({ history: history.list() }),
    'history.delete': async ({ entry }) => ({ history: history.remove(entry || {}) }),
    'history.clear': async () => ({ history: history.clear() }),

    // ── jobs ──
    'jobs.get': async ({ id }) => jobs.snapshot(id),
    'jobs.cancel': async ({ id }) => ({ ok: jobs.cancel(id) }),
    'jobs.resolveConflict': async ({ id, answer, applyAll }) => ({ ok: jobs.resolveConflict(id, answer, !!applyAll) }),
    'jobs.running': async () => jobs.running().map((j) => j.snapshot()),

    // ── session ──
    'session.load': async () => session.get(),
    'session.save': async ({ patch }) => session.save(patch),

    // ── clipboard (host-provided; the browser uses navigator.clipboard) ──
    'clipboard.write': async ({ text }) => { if (host.clipboard) host.clipboard.writeText(text || ''); return { ok: true }; },
  };

  async function call(name, args) {
    const fn = methods[name];
    if (!fn) throw new Error(`Unknown API method: ${name}`);
    return fn(args || {});
  }

  async function shutdown() {
    jobs.cancelAll();
    await connections.closeAll();
  }

  return { call, jobs, session, profiles, history, connections, shutdown, methods: Object.keys(methods) };
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

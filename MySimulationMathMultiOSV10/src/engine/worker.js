// The engine Web Worker (module type). The GUI (src/engine/client.js) sends
// { type: 'init', api: { base, token, system }, cwd, channel } first; then the
// messages of CONTRACT §8 (routed by router.js).
//
// The session module is looked up with import.meta.glob so a build without
// core/session.js still starts: the Command Window then says why nothing runs.
import { createHttpFs } from './fs-http.js';
import { readReply } from './protocol.js';
import { createEngineCore, ENGINE_MISSING } from './router.js';

const sessionModules = import.meta.glob('../../core/session.js');

let core = null;
let channel = null;
let seq = 0;
const early = [];

const post = (msg) => self.postMessage(msg);

const host = {
  post(msg) { post(msg); },
  request(msg) {
    if (!channel) return null;
    seq += 1;
    const id = seq;
    post({ type: 'request', id, msg });
    try {
      return readReply(channel, id, (rid) => post({ type: 'request.more', id: rid }));
    } catch {
      return null;
    }
  },
};

async function init(msg) {
  const api = msg.api || {};
  channel = msg.channel || null;
  const fs = createHttpFs({ base: api.base || '/api/', token: api.token || '', cwd: msg.cwd || '/', systemAllowed: api.system !== false });
  let createSession = null;
  let loadError = '';
  const load = sessionModules['../../core/session.js'];
  if (!load) loadError = ENGINE_MISSING;
  else {
    try {
      const mod = await load();
      createSession = mod.createSession || (mod.default && mod.default.createSession) || null;
      if (!createSession) loadError = 'core/session.js does not export createSession.';
    } catch (e) {
      loadError = `The M language engine failed to load: ${(e && e.message) || e}`;
    }
  }
  const interruptFlag = channel && channel.interrupt ? new Int32Array(channel.interrupt) : null;
  core = createEngineCore({ post, createSession: createSession || (() => { throw new Error(loadError); }), fs, host, interruptFlag });
  post({ type: 'ready', ok: core.ready, error: core.ready ? '' : (core.error || loadError), cwd: fs.cwd(), shared: !!channel });
  for (const m of early.splice(0)) core.handle(m);
}

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'init') { init(msg); return; }
  if (!core) { early.push(msg); return; }
  core.handle(msg);
};

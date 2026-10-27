// The engine side of CONTRACT §8, free of worker globals so tests can drive
// it: createEngineCore({ post, createSession, fs, host }) returns
// { handle(msg) } that routes GUI → engine messages to the session and
// answers through post().
//
// GUI → engine:
//   { type: 'eval', id, code, opts }          → { type: 'done', id, result }
//   { type: 'runFile', id, path }             → { type: 'done', id, result }
//   { type: 'complete', id, text, cursor }    → { type: 'reply', id, data }
//   { type: 'variables', id }                 → { type: 'reply', id, data }
//   { type: 'variable.get', id, name }        → { type: 'reply', id, data }
//   { type: 'variable.set', id, name, value } → { type: 'reply', id, data }
//   { type: 'clear', id, names }              → { type: 'reply', id, data }
//   { type: 'help', id, name }                → { type: 'reply', id, data }
//   { type: 'breakpoints', file, lines }      (no answer)
//   anything else (graphics.*, sim.* …)      → session.handleMessage(msg)
// engine → GUI: out, done, reply, event, request (from host), graphics.* / sim.* (host.post).
import { createOutputBuffer } from './protocol.js';

export const ENGINE_MISSING = 'The M language engine is not installed in this build yet (core/session.js is missing). The Command Window will work once it is added.';

/** Calls the graphics flush builtin when the session has one (figures redraw after each command). */
export function graphicsFlush(session) {
  const names = ['__graphics_flush__'];
  for (const name of names) {
    try {
      const ctx = session.ctx || (typeof session.context === 'function' ? session.context() : session.context);
      const reg = (ctx && ctx.registry) || session.registry;
      const has = reg && reg.builtins ? !!reg.builtins[name] : (typeof session.hasFunction === 'function' ? session.hasFunction(name) : false);
      if (!has) continue;
      if (ctx && typeof ctx.call === 'function') ctx.call(name, [], 0);
      else if (typeof session.evaluate === 'function') session.evaluate(`${name};`, { echo: false, history: false });
    } catch { /* figures are best effort */ }
  }
}

function errorOf(e) {
  return { identifier: (e && (e.identifier || e.code)) || '', message: (e && e.message) || String(e), stack: (e && Array.isArray(e.mstack) ? e.mstack : []) };
}

export function createEngineCore({ post, createSession, fs, host, interruptFlag = null }) {
  const out = createOutputBuffer(post);
  let session = null;
  let startError = '';
  const emitEvent = (event) => { out.flush(); post({ type: 'event', event }); };
  try {
    if (typeof createSession !== 'function') throw new Error(ENGINE_MISSING);
    session = createSession({
      fs,
      host: {
        post: (msg) => { out.flush(); host.post(msg); },
        request: (msg) => { out.flush(); return host.request(msg); },
      },
      print: (text, stream) => out.print(text, stream === 'err' || stream === 'stderr' ? 'err' : stream === 'warn' ? 'warn' : 'out'),
      onEvent: emitEvent,
    });
    if (interruptFlag && typeof session.setInterruptFlag === 'function') session.setInterruptFlag(interruptFlag);
  } catch (e) {
    session = null;
    startError = (e && e.message) || String(e);
  }

  const reply = (id, fn) => {
    let data = null;
    let error = null;
    try { data = fn(); } catch (e) { error = errorOf(e); }
    out.flush();
    post({ type: 'reply', id, data: data === undefined ? null : data, error });
  };
  const variables = () => (session && typeof session.listVariables === 'function' ? session.listVariables() : []);

  const run = (id, fn) => {
    if (!session) {
      post({ type: 'done', id, result: { ok: false, error: { identifier: 'app:noEngine', message: startError || ENGINE_MISSING, stack: [] } } });
      return;
    }
    if (interruptFlag) Atomics.store(interruptFlag, 0, 0);
    post({ type: 'event', event: { type: 'busy', busy: true } });
    let result;
    try { result = fn(); } catch (e) { result = { ok: false, error: errorOf(e) }; }
    if (!result || typeof result !== 'object') result = { ok: true };
    graphicsFlush(session);
    out.flush();
    let vars = null;
    try { vars = variables(); } catch { vars = null; }
    let cwd = null;
    try { cwd = fs && fs.cwd ? fs.cwd() : null; } catch { cwd = null; }
    post({ type: 'event', event: { type: 'busy', busy: false } });
    post({ type: 'done', id, result, variables: vars, cwd });
  };

  function handle(msg) {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'eval':
        run(msg.id, () => session.evaluate(String(msg.code || ''), { echo: true, ...(msg.opts || {}) }));
        return;
      case 'runFile':
        run(msg.id, () => session.runFile(String(msg.path || '')));
        return;
      case 'complete':
        reply(msg.id, () => (session && typeof session.complete === 'function' ? session.complete(String(msg.text || ''), msg.cursor == null ? String(msg.text || '').length : msg.cursor) : []));
        return;
      case 'variables':
        reply(msg.id, variables);
        return;
      case 'variable.get':
        reply(msg.id, () => (session ? session.getVariable(msg.name) : null));
        return;
      case 'variable.set':
        reply(msg.id, () => { if (!session) throw new Error(startError || ENGINE_MISSING); session.setVariable(msg.name, msg.value); emitEvent({ type: 'workspace' }); return variables(); });
        return;
      case 'clear':
        reply(msg.id, () => { if (!session) return []; session.clear(msg.names && msg.names.length ? msg.names : undefined); emitEvent({ type: 'workspace' }); return variables(); });
        return;
      case 'help':
        reply(msg.id, () => (session && typeof session.help === 'function' ? session.help(String(msg.name || '')) : null));
        return;
      case 'breakpoints':
        if (session && typeof session.setBreakpoints === 'function') { try { session.setBreakpoints(msg.file, msg.lines || []); } catch { /* reported when hit */ } }
        return;
      case 'cwd':
        reply(msg.id, () => { if (msg.path) fs.chdir(msg.path); const p = fs.cwd(); emitEvent({ type: 'cwd', path: p }); return p; });
        return;
      case 'ping':
        post({ type: 'reply', id: msg.id, data: { ready: !!session, error: startError }, error: null });
        return;
      default:
        if (session && typeof session.handleMessage === 'function') {
          try { session.handleMessage(msg); } catch (e) { out.print(`${(e && e.message) || e}\n`, 'err'); }
          graphicsFlush(session);
          out.flush();
        }
    }
  }

  return { handle, get ready() { return !!session; }, get error() { return startError; }, session: () => session, flush: out.flush };
}

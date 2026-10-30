// The GUI side of the engine (CONTRACT §8). One worker per page:
//
//   import { engine } from './engine/client';
//   await engine.eval('x = 1:5');                       // → { ok, error? }
//   const off = engine.on('out', ({ text, stream }) => …);
//   engine.onRequest('input', async (msg) => answer);   // worker waits for it
//   engine.interrupt();                                  // Ctrl+C
//
// Events: 'out', 'event' (session events), 'done', 'ready', 'state', and every
// other message type the worker posts (graphics.*, sim.*, audio.play …);
// '*' gets them all.
import { apiEndpoint, hostInfo } from '../lib/backend';
import { createChannel, createReplyWriter } from './protocol';

class EngineClient {
  constructor() {
    this.worker = null;
    this.listeners = new Map();
    this.handlers = new Map();
    this.pending = new Map();
    this.seq = 0;
    this.channel = null;
    this.writer = null;
    this.state = 'off'; // off | starting | ready | busy | error
    this.error = '';
    this.cwd = '';
    this.busy = false;
    this.started = null;
    this.requestOpen = null; // id of the request the worker waits on
    this.quiet = new Set();
    this.early = []; // post() before the session is up (tabs restored at launch open their models)
  }

  _emit(type, data) {
    for (const key of [type, '*']) {
      const set = this.listeners.get(key);
      if (set) for (const fn of [...set]) { try { fn(data, type); } catch (e) { console.error(e); } }
    }
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this._emit('state', { state, error: this.error });
  }

  /** Starts the worker (once). Resolves after the worker reported 'ready'. */
  start({ cwd } = {}) {
    if (this.started) return this.started;
    this.started = (async () => {
      this._setState('starting');
      let api = { base: '/api/', token: '', system: false };
      let start = cwd || '/';
      try {
        const ep = await apiEndpoint();
        const info = await hostInfo().catch(() => ({}));
        api = { base: ep.base, token: ep.token, system: !!info.system };
        if (!cwd && info.start) start = info.start;
      } catch { /* the worker reports file errors itself */ }
      this.channel = createChannel();
      this.writer = this.channel ? createReplyWriter(this.channel) : null;
      const ready = new Promise((resolve) => { this._ready = resolve; });
      this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this._message(e.data);
      this.worker.onerror = (e) => {
        this.error = (e && e.message) || 'The engine worker failed to start.';
        this._setState('error');
        this._emit('out', { text: `${this.error}\n`, stream: 'err' });
        if (this._ready) this._ready();
      };
      this.worker.postMessage({ type: 'init', api, cwd: start, channel: this.channel });
      await ready;
    })();
    return this.started;
  }

  _message(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'ready':
        this.error = msg.error || '';
        this.cwd = msg.cwd || this.cwd;
        this._setState(msg.ok ? 'ready' : 'error');
        if (msg.ok && this.worker) for (const m of this.early) this.worker.postMessage(m);
        this.early = [];
        this._emit('ready', msg);
        if (this._ready) { this._ready(); this._ready = null; }
        return;
      case 'out':
        this._emit('out', msg);
        return;
      case 'event': {
        const ev = msg.event || {};
        if (ev.type === 'busy') {
          this.busy = !!ev.busy;
          if (this.state === 'ready' || this.state === 'busy') this._setState(ev.busy ? 'busy' : 'ready');
        }
        if (ev.type === 'cwd' && ev.path) this.cwd = ev.path;
        this._emit('event', ev);
        this._emit(`event:${ev.type}`, ev);
        return;
      }
      case 'done': {
        if (msg.cwd && msg.cwd !== this.cwd) { this.cwd = msg.cwd; this._emit('event', { type: 'cwd', path: msg.cwd }); }
        if (msg.variables) this._emit('variables', msg.variables);
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        this._emit('done', msg);
        if (p) p.resolve(msg.result || { ok: true });
        return;
      }
      case 'reply': {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (!p) return;
        if (msg.error) p.reject(Object.assign(new Error(msg.error.message), msg.error));
        else p.resolve(msg.data);
        return;
      }
      case 'request':
        this._request(msg);
        return;
      case 'request.more':
        if (this.writer) this.writer.more(msg.id);
        return;
      default:
        this._emit(msg.type, msg);
    }
  }

  async _request({ id, msg }) {
    this.requestOpen = id;
    const type = (msg && msg.type) || '';
    this._emit('request', { id, msg });
    let value = null;
    const fn = this.handlers.get(type);
    if (fn) {
      try { value = await fn(msg); } catch (e) { value = { error: (e && e.message) || String(e) }; }
    }
    if (this.requestOpen !== id) return; // answered by interrupt()
    this.requestOpen = null;
    if (this.writer) this.writer.reply(id, value);
    this._emit('request.done', { id, msg });
  }

  _call(type, extra = {}) {
    if (!this.worker) return Promise.reject(new Error('The engine is not running.'));
    this.seq += 1;
    const id = this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, ...extra });
    });
  }

  /** Runs code in the base workspace. opts: { echo, file, history }. */
  eval(code, opts = {}) {
    // history: false — the session's history event for this command is ignored (wasQuiet).
    if (opts.history === false) this.quiet.add(String(code));
    return this._call('eval', { code: String(code), opts });
  }

  /** True (once) when a history event belongs to a command run with history: false. */
  wasQuiet(command) { return this.quiet.delete(String(command)); }
  runFile(path) { return this._call('runFile', { path }); }
  complete(text, cursor) { return this._call('complete', { text, cursor }).catch(() => []); }
  variables() { return this._call('variables').catch(() => []); }
  getVariable(name) { return this._call('variable.get', { name }); }
  setVariable(name, value) { return this._call('variable.set', { name, value }); }
  clear(names) { return this._call('clear', { names: names || [] }); }
  help(name) { return this._call('help', { name }).catch(() => null); }
  catalog() { return this._call('catalog').catch(() => []); }
  check(src, file) { return this._call('check', { src, file }).catch(() => []); }
  helpSearch(query, limit = 80) { return this._call('help.search', { query, limit }).catch(() => []); }
  chdir(path) { return this._call('cwd', { path }); }
  setBreakpoints(file, lines) { this.post({ type: 'breakpoints', file, lines }); }

  /** Fire-and-forget message to the engine (graphics.*, sim.* …). */
  // Until the engine is ready the worker would drop it (no session yet): kept and sent on 'ready'.
  post(msg) {
    if (this.worker && (this.state === 'ready' || this.state === 'busy')) this.worker.postMessage(msg);
    else if (this.state !== 'error') this.early.push(msg);
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => { const s = this.listeners.get(type); if (s) s.delete(fn); };
  }

  /** Answers the worker's synchronous requests of one type (the last registration wins). */
  onRequest(type, fn) {
    this.handlers.set(type, fn);
    return () => { if (this.handlers.get(type) === fn) this.handlers.delete(type); };
  }

  /** Ctrl+C: sets the shared flag; a request the worker waits on is answered with null. */
  interrupt() {
    if (this.channel) Atomics.store(new Int32Array(this.channel.interrupt), 0, 1);
    if (this.requestOpen != null && this.writer) {
      const id = this.requestOpen;
      this.requestOpen = null;
      this.writer.reply(id, null);
      this._emit('request.done', { id, interrupted: true });
    }
    this._emit('interrupt', {});
  }

  /** Throws the session away and starts a fresh one (clears everything). */
  async restart() {
    if (this.worker) this.worker.terminate();
    for (const p of this.pending.values()) p.resolve({ ok: false, error: { identifier: 'app:restarted', message: 'The engine was restarted.' } });
    this.pending.clear();
    this.worker = null;
    this.started = null;
    this.busy = false;
    this.requestOpen = null;
    this._emit('event', { type: 'busy', busy: false });
    await this.start({ cwd: this.cwd || undefined });
    this._emit('event', { type: 'workspace' });
  }

  get sharedMemory() { return !!this.channel; }
}

export const engine = new EngineClient();
if (typeof window !== 'undefined') window.__msmEngine = engine;

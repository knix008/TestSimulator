// Editor ↔ engine messages (PROTOCOL.md): open / new / edit / save / compile /
// run / pause / continue / step / stop / tune / close. GUI runs are chunked
// with setTimeout so the worker keeps answering messages while it simulates.
import { normalizeModel, clone, newModel, newModelName, modelNameOfPath } from './model.js';
import { compileModel } from './compile.js';
import { Run } from './runtime.js';
import { simState, post, addModel, loadModel, markChanged, absPath } from './state.js';
import { readModelFile, writeModelFile, findModelFile } from './files.js';

const CHUNK_MS = 25;
const errMsg = (e) => (e && e.message) || String(e);

function diagnostic(ctx, name, level, message, block) {
  const m = { type: 'sim.diagnostic', name, level, message };
  if (block) m.block = block;
  post(ctx, m);
}

/** Compiles and initialises a run of a loaded model (throws on errors). */
export function prepareRun(ctx, name, model, opts = {}) {
  const prog = compileModel(clone(model), ctx, opts);
  const run = new Run(prog, ctx, { name, onDiagnostic: opts.onDiagnostic || ((d) => diagnostic(ctx, name, d.level, d.message, d.block)) });
  run.init();
  return run;
}

function schedule(ctx, ctl, delay = 0) {
  if (ctl.timer) return;
  ctl.timer = setTimeout(() => { ctl.timer = null; chunk(ctx, ctl); }, delay);
}
function flush(ctx, ctl, force) {
  const run = ctl.run;
  for (const m of run.scopeMessages()) post(ctx, m);
  const now = Date.now();
  if (force || now - (ctl.lastStatus || 0) >= 100) {
    ctl.lastStatus = now;
    post(ctx, run.valuesMessage());
    post(ctx, run.status(ctl.state === 'paused' ? 'paused' : 'running'));
  }
}
function chunk(ctx, ctl) {
  if (ctl.state !== 'running') return;
  let more;
  const pacing = ctl.run.flag('pacing') ? ctl.run.setting('pacingRate', 1) : 0;
  try { more = ctl.run.runFor(CHUNK_MS, pacing); } catch (e) { fail(ctx, ctl, e); return; }
  flush(ctx, ctl, false);
  if (!more) { finish(ctx, ctl); return; }
  schedule(ctx, ctl, pacing > 0 ? 10 : 0);
}
function finish(ctx, ctl) {
  const st = simState(ctx);
  if (ctl.timer) { clearTimeout(ctl.timer); ctl.timer = null; }
  ctl.state = 'stopped';
  const run = ctl.run;
  try { run.writeWorkspace(ctx); } catch (e) { diagnostic(ctx, ctl.name, 'error', errMsg(e)); }
  for (const m of run.scopeMessages()) post(ctx, m);
  post(ctx, run.valuesMessage());
  st.runs.delete(ctl.name);
  const msg = run.stopReq && run.stopReq.message ? run.stopReq.message : '';
  post(ctx, run.status('stopped', msg || undefined));
}
function fail(ctx, ctl, e) {
  const st = simState(ctx);
  if (ctl.timer) { clearTimeout(ctl.timer); ctl.timer = null; }
  ctl.state = 'error';
  st.runs.delete(ctl.name);
  diagnostic(ctx, ctl.name, 'error', errMsg(e), e && e.block);
  post(ctx, { ...ctl.run.status('error', errMsg(e)) });
}

function startRun(ctx, name, model, paused) {
  const st = simState(ctx);
  const cur = st.runs.get(name);
  if (cur) {
    if (cur.state === 'paused' && !paused) { cur.state = 'running'; post(ctx, cur.run.status('running')); schedule(ctx, cur); }
    return cur;
  }
  let entry = st.models.get(name);
  if (model) { if (entry) entry.model = normalizeModel(model, name); else entry = addModel(ctx, normalizeModel(model, name), ''); }
  if (!entry) { diagnostic(ctx, name, 'error', `The model '${name}' is not loaded.`); return null; }
  post(ctx, { type: 'sim.status', name, state: 'compiling', time: 0, start: 0, stop: 0, progress: 0, elapsed: 0 });
  let run;
  try { run = prepareRun(ctx, name, entry.model); } catch (e) {
    diagnostic(ctx, name, 'error', errMsg(e), e && e.block);
    post(ctx, { type: 'sim.status', name, state: 'error', time: 0, start: 0, stop: 0, progress: 0, elapsed: 0, message: errMsg(e) });
    return null;
  }
  post(ctx, { type: 'sim.compiled', name, ok: true, ...run.compiledInfo() });
  const ctl = { name, run, state: paused ? 'paused' : 'running', timer: null, lastStatus: 0 };
  st.runs.set(name, ctl);
  post(ctx, run.status(ctl.state));
  if (!paused) schedule(ctx, ctl);
  return ctl;
}

function findBlock(model, id) {
  let found = null;
  const rec = (s) => { for (const b of s.blocks) { if (b.id === id) { found = b; return; } if (b.system) rec(b.system); if (found) return; } };
  rec(model.root);
  return found;
}

/** Handles one GUI → engine message. */
export function handleMessage(ctx, msg) {
  const st = simState(ctx);
  const name = msg.name;
  switch (msg.type) {
    case 'sim.open': {
      let entry = null;
      if (name && st.models.has(name) && !msg.path) entry = st.models.get(name);
      else if (msg.path) {
        const p = absPath(ctx.fs, msg.path);
        const nm = modelNameOfPath(p);
        if (st.models.has(nm) && (!st.models.get(nm).path || st.models.get(nm).path === p)) entry = st.models.get(nm);
        else {
          let file = null;
          try { file = ctx.fs && ctx.fs.exists(p) ? p : findModelFile(ctx.fs, msg.path); } catch { file = null; }
          if (file) {
            try { const m = readModelFile(ctx.fs, file); m.name = nm; entry = addModel(ctx, m, file); } catch (e) {
              diagnostic(ctx, nm, 'error', errMsg(e));
              entry = addModel(ctx, newModel(nm), '');
            }
          } else entry = addModel(ctx, newModel(nm), /[\\/]/.test(String(msg.path)) ? p : '');
        }
      } else if (name && st.models.has(name)) entry = st.models.get(name);
      else entry = addModel(ctx, newModel(name || newModelName([...st.models.keys()])), '');
      st.cur.system = entry.model.name;
      post(ctx, { type: 'sim.model', reqId: msg.reqId, name: entry.model.name, path: entry.path, model: clone(entry.model), reason: 'open' });
      return undefined;
    }
    case 'sim.new': {
      const nm = name && !st.models.has(name) ? name : newModelName([...st.models.keys()]);
      const entry = addModel(ctx, newModel(nm), '');
      st.cur.system = nm;
      post(ctx, { type: 'sim.model', reqId: msg.reqId, name: nm, path: '', model: clone(entry.model), reason: 'open' });
      return undefined;
    }
    case 'sim.edit': {
      if (!msg.model) return undefined;
      const entry = st.models.get(name);
      if (entry) entry.model = normalizeModel(msg.model, name); else addModel(ctx, normalizeModel(msg.model, name), '');
      st.cur.system = name;
      return undefined;
    }
    case 'sim.save': {
      const oldName = name;
      try {
        let entry = st.models.get(name);
        if (msg.model) { if (entry) entry.model = normalizeModel(msg.model, name); else entry = addModel(ctx, normalizeModel(msg.model, name), ''); }
        if (!entry) throw new Error(`The model '${name}' is not loaded.`);
        const p = absPath(ctx.fs, msg.path);
        const nm = modelNameOfPath(p);
        if (nm !== oldName) { st.models.delete(oldName); entry.model.name = nm; st.models.set(nm, entry); if (st.cur.system === oldName) st.cur.system = nm; }
        entry.path = p;
        writeModelFile(ctx.fs, p, entry.model);
        post(ctx, { type: 'sim.saved', reqId: msg.reqId, name: nm, oldName, path: p, ok: true });
      } catch (e) {
        post(ctx, { type: 'sim.saved', reqId: msg.reqId, name, oldName, path: msg.path, ok: false, error: errMsg(e) });
      }
      return undefined;
    }
    case 'sim.compile': {
      let entry = st.models.get(name);
      if (msg.model) { if (entry) entry.model = normalizeModel(msg.model, name); else entry = addModel(ctx, normalizeModel(msg.model, name), ''); }
      if (!entry) { post(ctx, { type: 'sim.compiled', reqId: msg.reqId, name, ok: false, error: `The model '${name}' is not loaded.`, ports: {}, blocks: {} }); return undefined; }
      try {
        const run = prepareRun(ctx, name, entry.model);
        post(ctx, { type: 'sim.compiled', reqId: msg.reqId, name, ok: true, ...run.compiledInfo() });
      } catch (e) {
        const m = { type: 'sim.compiled', reqId: msg.reqId, name, ok: false, error: errMsg(e), ports: {}, blocks: {} };
        if (e && e.block) m.block = e.block;
        post(ctx, m);
        diagnostic(ctx, name, 'error', errMsg(e), e && e.block);
      }
      return undefined;
    }
    case 'sim.run': startRun(ctx, name, msg.model, !!msg.paused); return undefined;
    case 'sim.pause': {
      const ctl = st.runs.get(name);
      if (ctl && ctl.state === 'running') { ctl.state = 'paused'; if (ctl.timer) { clearTimeout(ctl.timer); ctl.timer = null; } flush(ctx, ctl, true); }
      return undefined;
    }
    case 'sim.continue': {
      const ctl = st.runs.get(name);
      if (ctl && ctl.state === 'paused') { ctl.state = 'running'; post(ctx, ctl.run.status('running')); schedule(ctx, ctl); }
      return undefined;
    }
    case 'sim.step': {
      let ctl = st.runs.get(name);
      if (!ctl) { ctl = startRun(ctx, name, msg.model, true); if (!ctl) return undefined; }
      if (ctl.state === 'running') { ctl.state = 'paused'; if (ctl.timer) { clearTimeout(ctl.timer); ctl.timer = null; } }
      let more;
      try { more = ctl.run.step(); } catch (e) { fail(ctx, ctl, e); return undefined; }
      if (!more) { finish(ctx, ctl); return undefined; }
      flush(ctx, ctl, true);
      return undefined;
    }
    case 'sim.stop': {
      const ctl = st.runs.get(name);
      if (ctl) finish(ctx, ctl);
      return undefined;
    }
    case 'sim.tune': {
      const entry = st.models.get(name);
      const params = msg.params || {};
      if (entry) { const b = findBlock(entry.model, msg.block); if (b) for (const [k, v] of Object.entries(params)) b.params[k] = String(v); }
      const ctl = st.runs.get(name);
      if (ctl) {
        try { ctl.run.tune(msg.block, params); if (ctl.state === 'paused') flush(ctx, ctl, true); } catch (e) { diagnostic(ctx, name, 'error', errMsg(e), msg.block); }
      }
      return undefined;
    }
    case 'sim.close': {
      const ctl = st.runs.get(name);
      if (ctl) { if (ctl.timer) clearTimeout(ctl.timer); st.runs.delete(name); }
      st.models.delete(name);
      if (st.cur.system && st.cur.system.split('/')[0] === name) st.cur = { system: '', block: '' };
      return undefined;
    }
    default: return undefined;
  }
}

export { startRun, finish, markChanged, loadModel };

// Macros: recording what the user does, playing it back, and the automation API macros are written against.
// A macro is JavaScript (.mmjs) run as an async function of `mm` (the API) — recorded macros are plain lists of
// `await mm.…(…)` calls, and hand-written ones can use loops, variables and the model data.
// The recorder notes the app's entry points (commands, picks in the view, PropertyManager input, selection,
// documents, sketch contents) — only the outermost call of a user action: what it calls in turn is not recorded.
// The macro editor is its own window (popup 'macro'): the script, a console (log, errors with their line, an
// immediate prompt), record / run / stop, load and save.

/** The recorder the app's entry points report to (created first, so app.js can use it everywhere). */
export function createRecorder() {
  const r = {
    on: false, playing: false, depth: 0, steps: [], listeners: new Set(),
    /** Calls `fn`, noting `call(args)` when it is a top-level user action while recording. */
    around(call, args, fn) {
      if (r.on && !r.playing && r.depth === 0 && !String(args?.[0] ?? '').startsWith('macro')) r.push({ call, args: plain(args) });
      r.depth++;
      try { return fn(); } finally { r.depth--; }
    },
    /** A step noted directly (keyboard Enter / Esc, the sketch contents before a sketch closes). */
    note(call, args = [], { before = false } = {}) {
      if (!r.on || r.playing) return;
      const step = { call, args: plain(args) };
      // Inside a recorded call (a sketch closed by a command): before that call, so the replay sets the sketch first.
      if (before && r.depth > 0 && r.steps.length) r.steps.splice(r.steps.length - 1, 0, step); else r.push(step);
    },
    push(step) { r.steps.push(step); for (const fn of r.listeners) fn(step); },
  };
  return r;
}

/** Arguments as plain data (picks, selections and sketches are JSON; events and DOM nodes are dropped). */
function plain(args) {
  const skip = (v) => typeof v === 'function' || (typeof Element !== 'undefined' && v instanceof Element) || (typeof Event !== 'undefined' && v instanceof Event);
  return JSON.parse(JSON.stringify(args ?? [], (k, v) => (skip(v) ? undefined : v)) ?? '[]');
}

const API_NAMES = { run: 'run', pick: 'pick', select: 'select', pmCommand: 'pm', pmSet: 'set', pmField: 'field', pmToggle: 'toggle', pmSelect: 'choose', pmStep: 'step', pickMode: 'pickMode', accept: 'accept', cancel: 'cancel', exitSketch: 'exitSketch', setSketch: 'setSketch', document: 'document', material: 'material' };

/** A recorded step as one line of the macro. */
export function stepLine(step) {
  const name = API_NAMES[step.call] ?? step.call;
  const args = (step.args ?? []).map((a) => JSON.stringify(a));
  while (args.length && (args.at(-1) === 'null' || args.at(-1) === undefined)) args.pop();
  return `await mm.${name}(${args.join(', ')});`;
}

/** The text of a recorded macro. */
export function macroScript(steps, { title = 'Recorded macro', date = new Date() } = {}) {
  const p = (n) => String(n).padStart(2, '0');
  const when = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
  return [`// MyMechanics macro — ${title}`, `// ${when}`, '', ...steps.map(stepLine), ''].join('\n');
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** The line of the macro an error happened on (from the stack of the compiled function), or null. */
export function errorLine(error) {
  const m = /<anonymous>:(\d+):(\d+)/.exec(String(error?.stack ?? '')) ?? /eval.*?:(\d+):(\d+)/.exec(String(error?.stack ?? ''));
  // The compiled function adds two lines before the body ("async function anonymous(mm,console\n) {").
  return m ? Math.max(1, Number(m[1]) - 2) : null;
}

/** Compiles a macro (syntax errors thrown here, with their line). */
export function compileMacro(text) {
  return new AsyncFunction('mm', 'console', String(text ?? ''));
}

export function createMacroTools(ctx) {
  const { state, t, recorder } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const M = (state.macro ??= { text: '', log: [], running: false, stop: false, name: 'macro.mmjs' });

  // ───────────────────────── the editor window

  const view = () => ({ text: M.text, log: M.log.slice(-300), recording: recorder.on, running: M.running, name: M.name, steps: recorder.on ? recorder.steps.length : 0 });
  let stamp = 0;
  let editorOpen = false;
  function post(extra = {}) { if (editorOpen) ctx.popups.post('macro', { type: 'macro-state', ...view(), ...extra }); }
  function openEditor() {
    if (editorOpen) { ctx.popups.post('macro', { type: 'macro-state', ...view(), text: M.text, replaceText: true }); return; }
    editorOpen = true;
    stamp = Date.now();
    Promise.resolve(ctx.popups.open('macro', { ...view(), stamp })).finally(() => { editorOpen = false; });
  }
  function log(level, text, line = null) {
    M.log.push({ at: new Date().toISOString(), level, text: String(text), line });
    if (M.log.length > 1000) M.log.splice(0, M.log.length - 1000);
    post();
  }

  // ───────────────────────── recording

  function startRecording() {
    if (M.running) return;
    recorder.steps = []; recorder.on = true;
    notify('info', t('macro.recording'));
    ctx.renderAll(); post();
  }
  function stopRecording() {
    if (!recorder.on) return null;
    recorder.on = false;
    const steps = recorder.steps.slice();
    M.text = macroScript(steps, { title: ctx.projectName() || t('macro.recorded') });
    M.name = 'macro.mmjs';
    notify('success', t('macro.recorded', { count: steps.length }));
    ctx.renderAll();
    if (editorOpen) post({ replaceText: true }); else openEditor();
    return M.text;
  }
  recorder.listeners.add(() => { post(); ctx.renderStatus?.(); });

  // ───────────────────────── the API

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = () => { if (M.stop) throw Object.assign(new Error(t('macro.stopped')), { stopped: true }); };
  const settle = async () => { check(); await sleep(0); await ctx.idle?.(); check(); };
  const call = async (fn) => { check(); const r = await fn(); await settle(); return r; };
  const ref = (kind, nameOrId) => {
    const p = ctx.project(); if (!p) return null;
    const list = kind === 'part' ? p.parts : kind === 'assembly' ? p.assemblies : p.drawings;
    const d = list.find((x) => x.id === nameOrId) ?? list.find((x) => x.name === nameOrId);
    return d ? { kind, id: d.id } : null;
  };

  /** The automation API (`mm` in a macro). Every call waits until the app has caught up. */
  const mm = {
    // what a recorded macro uses
    run: (id) => call(() => ctx.run(id)),
    pick: (hit, mods = {}) => call(() => ctx.pick(hit, { ctrlKey: false, shiftKey: false, metaKey: false, ...mods })),
    select: (items, opts = {}) => call(() => ctx.select(items, opts)),
    pm: (name) => call(() => ctx.pmCommand(name)),
    set: (key, value) => call(() => ctx.pmSet(key, value)),
    field: (key, raw, unit) => call(() => ctx.pmField(key, raw, unit)),
    toggle: (key, checked) => call(() => ctx.pmToggle(key, checked)),
    choose: (key, value) => call(() => ctx.pmSelect(key, value)),
    step: (key, delta) => call(() => ctx.pmStep(key, delta)),
    pickMode: (mode) => call(() => { if (state.editing) { state.editing.pick = mode; ctx.renderLeft(); } }),
    accept: () => call(() => ctx.accept()),
    cancel: () => call(() => ctx.cancel()),
    exitSketch: () => call(() => ctx.exitSketch()),
    setSketch: (geometry) => call(() => ctx.setSketch(geometry)),
    document: (r) => call(() => ctx.switchDocument(typeof r === 'string' ? (ref('part', r) ?? ref('assembly', r) ?? ref('drawing', r)) : r)),
    material: (id) => call(() => ctx.setMaterial(id)),
    // reading the model
    get project() { const p = ctx.project(); return p ? structuredClone(p) : null; },
    active: () => structuredClone(ctx.active() ?? null),
    parts: () => (ctx.project()?.parts ?? []).map((p) => ({ id: p.id, name: p.name, material: p.material, features: p.features.map((f) => ({ id: f.id, name: f.name, type: f.type })) })),
    feature: (name) => { const p = ctx.activePart(); const f = p?.features.find((x) => x.name === name || x.id === name); return f ? structuredClone(f) : null; },
    massProperties: () => ctx.massProperties(),
    selection: () => structuredClone(state.selection),
    // changing the model directly (one undo step each)
    setParam: (featureName, key, value) => call(() => ctx.change('op.macro', () => { const f = ctx.activePart()?.features.find((x) => x.name === featureName || x.id === featureName); if (!f) throw new Error(t('macro.noFeature', { name: featureName })); f[key] = value; })),
    setVariable: (name, value) => call(() => ctx.change('op.macro', () => { const p = ctx.activePart(); if (!p) throw new Error(t('macro.noPart')); p.variables ??= []; const v = p.variables.find((x) => x.name === name); if (v) v.value = value; else p.variables.push({ name, value }); })),
    setProperty: (key, value) => call(() => ctx.change('op.macro', () => { const d = ctx.active(); if (!d) throw new Error(t('macro.noPart')); d[key] = value; })),
    rebuild: () => call(() => ctx.run('rebuild')),
    open: (sample) => call(() => ctx.openSample(sample)),
    newDocument: (kind = 'part') => call(() => ctx.newDocument(kind)),
    export: (format) => call(() => ctx.run(format === 'step' ? 'exportStep' : format === 'stl' ? 'exportStl' : format === 'iges' ? 'exportIges' : `exportMesh:${format}`)),
    // the macro itself
    wait: async (ms) => { const end = Date.now() + Math.max(0, Number(ms) || 0); while (Date.now() < end) { check(); await sleep(Math.min(50, end - Date.now())); } },
    log: (...a) => log('info', a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
    notify: (text) => notify('info', String(text)),
    version: () => ctx.version(),
  };
  const consoleShim = { log: mm.log, info: mm.log, warn: (...a) => log('warn', a.join(' ')), error: (...a) => log('error', a.join(' ')) };

  /** Runs a macro: its result (or the error, logged with its line). */
  async function runMacro(text = M.text, { name = M.name } = {}) {
    if (M.running) return { ok: false, error: 'busy' };
    if (recorder.on) stopRecording();
    let fn;
    try { fn = compileMacro(text); } catch (error) { log('error', `${t('macro.syntax')}: ${error.message}`, errorLine(error)); return { ok: false, error: error.message }; }
    M.running = true; M.stop = false; recorder.playing = true;
    log('info', t('macro.started', { name }));
    ctx.renderAll(); post();
    const t0 = performance.now();
    try {
      const value = await fn(mm, consoleShim);
      log('ok', t('macro.finished', { ms: Math.round(performance.now() - t0) }));
      return { ok: true, value };
    } catch (error) {
      const line = errorLine(error);
      log(error?.stopped ? 'warn' : 'error', error?.stopped ? t('macro.stopped') : `${error?.message ?? error}${line ? ` (${t('macro.line', { line })})` : ''}`, line);
      return { ok: false, error: error?.message ?? String(error), line };
    } finally {
      M.running = false; M.stop = false; recorder.playing = false;
      ctx.renderAll(); post();
    }
  }
  function stopMacro() { if (M.running) M.stop = true; }

  /** The console's prompt: an expression's value, or statements run. */
  async function evaluate(line) {
    const src = String(line ?? '').trim(); if (!src) return undefined;
    log('input', src);
    let fn;
    try { fn = compileMacro(`return (${src});`); } catch { try { fn = compileMacro(src); } catch (error) { log('error', error.message); return undefined; } }
    recorder.playing = true;
    try { const v = await fn(mm, consoleShim); if (v !== undefined) log('result', typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, null, 0)?.slice(0, 2000) ?? String(v)); return v; }
    catch (error) { log('error', error?.message ?? String(error)); return undefined; }
    finally { recorder.playing = false; }
  }

  async function loadMacro() {
    const text = await ctx.readText({ name: t('macro.file'), extensions: ['mmjs', 'js'] });
    if (text == null) return false;
    M.text = text; M.name = 'macro.mmjs';
    if (editorOpen) post({ replaceText: true }); else openEditor();
    return true;
  }
  async function runFile() { const ok = await loadMacro(); if (ok) return runMacro(); return null; }
  const saveMacro = () => ctx.saveExport(M.name || 'macro.mmjs', 'mmjs', M.text, 'text/javascript');

  // Messages from the editor window.
  ctx.popups.on('macro', async (data) => {
    if (typeof data.text === 'string') M.text = data.text;
    switch (data.op) {
      case 'record': return recorder.on ? stopRecording() : startRecording();
      case 'run': return runMacro(M.text);
      case 'stop': return stopMacro();
      case 'clear-log': M.log = []; return post();
      case 'new': M.text = ''; M.name = 'macro.mmjs'; return post({ replaceText: true });
      case 'load': return loadMacro();
      case 'save': return saveMacro();
      case 'eval': return evaluate(data.line);
      case 'text': return undefined;
      default: return undefined;
    }
  });

  const commands = {
    macroRecord: { icon: 'macroRecord', label: 'cmd.macroRecord', checked: () => recorder.on, enabled: () => !M.running, run: () => (recorder.on ? stopRecording() : startRecording()) },
    macroRun: { icon: 'macroRun', label: 'cmd.macroRun', enabled: () => !M.running, run: () => runFile() },
    macroStop: { icon: 'macroStop', label: 'cmd.macroStop', enabled: () => M.running || recorder.on, run: () => (recorder.on ? stopRecording() : stopMacro()) },
    macroEditor: { icon: 'macroEditor', label: 'cmd.macroEditor', run: () => openEditor() },
  };
  const api = { mm, runMacro, stopMacro, startRecording, stopRecording, evaluate, openEditor, loadMacro, saveMacro, state: () => ({ ...view(), steps: recorder.steps.slice() }), setText: (text) => { M.text = text; post({ replaceText: true }); } };
  return { commands, api, recording: () => recorder.on, running: () => M.running };
}

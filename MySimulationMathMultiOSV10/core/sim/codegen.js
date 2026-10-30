// A model as M code (the model editor's 코드 보기): add_block / add_line /
// set_param lines that rebuild the diagram. Running the code on the model's
// own name empties it first, so the code is the whole model: edit it, run it,
// and the diagram follows (the editor receives the engine's sim.model update).
//
// modelToCode(model, name?) → text. Kept: blocks (library source, name,
// changed parameters, position, orientation, hidden names, colours), subsystem contents
// (nested), every connection (auto-routed), and changed model settings.
// Not kept (a comment says so when present): masks, signal names, line
// colours, notes and hand-drawn line routes.
import { connections, escapeName, makeBlock, newModel, defaultSettings } from './model.js';
import { LIBRARY, defaultParams } from './blocks/index.js';

// set_param names of the model settings (core/sim/builtins.js SET, reversed).
const SETTING_NAMES = {
  startTime: 'StartTime', stopTime: 'StopTime', solver: 'Solver', solverType: 'SolverType', fixedStep: 'FixedStep', maxStep: 'MaxStep', minStep: 'MinStep',
  initialStep: 'InitialStep', relTol: 'RelTol', absTol: 'AbsTol', zeroCross: 'ZeroCrossControl', maxConsecutiveZc: 'MaxConsecutiveZCs', saveTime: 'SaveTime',
  timeName: 'TimeSaveName', saveOutput: 'SaveOutput', outputName: 'OutputSaveName', saveState: 'SaveState', stateName: 'StateSaveName', signalLogging: 'SignalLogging',
  logName: 'SignalLoggingName', singleOutput: 'ReturnWorkspaceOutputs', singleOutputName: 'ReturnWorkspaceOutputsName', limitPoints: 'LimitDataPoints',
  maxPoints: 'MaxDataPoints', decimation: 'Decimation', algebraicLoop: 'AlgebraicLoopMsg', pacing: 'EnablePacing', pacingRate: 'PacingRate', stopOnAssert: 'StopOnAssertion',
};
const SPECIAL_PORT = { enable: 'Enable', trigger: 'Trigger', action: 'Ifaction' };

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const pathExpr = (parts) => (parts.length ? `[mdl ${q(`/${parts.map(escapeName).join('/')}`)}]` : 'mdl');

/** The library source of a block: its own id when the library has it, else the first item of its type. */
function sourceOf(b) {
  const own = LIBRARY.find((i) => i.id === b.type);
  if (own) return own.id;
  const any = LIBRARY.find((i) => i.type === b.type);
  return any ? any.id : b.type;
}

function orientation(b) {
  const rot = ((Number(b.rot) || 0) % 360 + 360) % 360;
  if (rot === 0 && b.flip) return 'left';
  if (rot === 90 && !b.flip) return 'down';
  if (rot === 270 && !b.flip) return 'up';
  return null;
}

const text = (v) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null);

function emitSystem(sys, parts, lines, notes) {
  const scratch = newModel('scratch');
  for (const b of sys.blocks) {
    const src = sourceOf(b);
    const def = { ...defaultParams(b.type) };
    let tpl = null;
    try { tpl = makeBlock(scratch, b.type, {}); Object.assign(def, tpl.params); } catch { tpl = null; }
    const args = [];
    for (const [k, v] of Object.entries(b.params || {})) {
      const s = text(v);
      if (s == null) { notes.add(`parameter ${k} of ${b.name}`); continue; }
      if (text(def[k]) !== s) args.push(`${q(k)}, ${q(s)}`);
    }
    const o = orientation(b);
    if (o) args.push(`'Orientation', ${q(o)}`);
    else if ((Number(b.rot) || 0) % 360 !== 0 || (b.flip && Number(b.rot))) notes.add(`the rotation of ${b.name}`);
    if (b.showName === false && !(tpl && tpl.showName === false)) args.push("'ShowName', 'off'");
    if (b.fg) args.push(`'ForegroundColor', ${q(b.fg)}`);
    if (b.bg) args.push(`'BackgroundColor', ${q(b.bg)}`);
    const x = Math.round(b.x), y = Math.round(b.y);
    args.push(`'Position', [${x} ${y} ${x + Math.round(b.w)} ${y + Math.round(b.h)}]`);
    const here = [...parts, b.name];
    lines.push(`add_block(${q(src)}, ${pathExpr(here)}, ${args.join(', ')});`);
    if (b.mask) notes.add(`the mask of ${b.name}`);
    if (b.system) {
      // a new subsystem comes with its template contents: remove them, then build the saved ones
      const fresh = tpl && tpl.system ? tpl.system.blocks.map((x2) => pathExpr([...here, x2.name])) : [];
      if (fresh.length) lines.push(`delete_block({${fresh.join(', ')}});`);
      emitSystem(b.system, here, lines, notes);
    }
  }
  const byId = new Map(sys.blocks.map((b) => [b.id, b]));
  const port = (p) => (typeof p === 'number' ? String(p) : SPECIAL_PORT[p] || String(p));
  for (const c of connections(sys)) {
    const a = byId.get(c.src.block), d = byId.get(c.dst.block);
    if (!a || !d) continue;
    lines.push(`add_line(${pathExpr(parts)}, ${q(`${escapeName(a.name)}/${port(c.src.port)}`)}, ${q(`${escapeName(d.name)}/${port(c.dst.port)}`)});`);
    if (c.name) notes.add(`signal names (${c.name})`);
    if (c.line.color) notes.add('line colours');
    if (c.line.style) notes.add('line shapes');
  }
  if ((sys.notes || []).length) notes.add('notes');
}

export function modelToCode(model, name = model.name) {
  const lines = [];
  const notes = new Set();
  emitSystem(model.root, [], lines, notes);
  const defs = defaultSettings();
  const settings = [];
  for (const [k, v] of Object.entries(model.settings || {})) {
    const s = text(v);
    if (s != null && SETTING_NAMES[k] && text(defs[k]) !== s) settings.push(`set_param(mdl, ${q(SETTING_NAMES[k])}, ${q(s)});`);
  }
  const head = [
    `% Model "${name}" as M code: run it (or press Apply) and the diagram is rebuilt from this text.`,
    `mdl = ${q(name)};`,
    "delete_block(find_system(mdl, 'SearchDepth', 1, 'Type', 'block'));   % start from an empty diagram",
  ];
  if (notes.size) head.push(`% Not in the code: ${[...notes].join(', ')}.`);
  return `${[...head, '', ...lines, ...(settings.length ? ['', ...settings] : [])].join('\n')}\n`;
}

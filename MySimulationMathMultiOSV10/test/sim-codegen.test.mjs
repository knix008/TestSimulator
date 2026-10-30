// A model as M code (core/sim/codegen.js): the code rebuilds the same diagram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../core/session.js';
import { simState } from '../core/sim/state.js';
import { modelToCode } from '../core/sim/codegen.js';
import { connections } from '../core/sim/model.js';
import { MODEL_SAMPLES } from '../src/lib/modelSamples.js';

/** A comparable picture of a model: blocks by name, connections by names, settings. */
function shape(model) {
  const sys = (s) => {
    const byId = new Map(s.blocks.map((b) => [b.id, b.name]));
    return {
      blocks: s.blocks.map((b) => ({ name: b.name, type: b.type, params: b.params, box: [b.x, b.y, b.w, b.h], rot: b.rot || 0, flip: !!b.flip, fg: b.fg || null, bg: b.bg || null, inner: b.system ? sys(b.system) : null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      wires: connections(s).map((c) => `${byId.get(c.src.block)}/${c.src.port}>${byId.get(c.dst.block)}/${c.dst.port}`).sort(),
    };
  };
  return { ...sys(model.root), settings: model.settings };
}

const modelOf = (s, name) => simState(s.ctx).models.get(name).model;

test('model code: every example model comes back the same from its code', () => {
  const s = createSession();
  for (const m of MODEL_SAMPLES) {
    assert.equal(s.evaluate(m.code).ok, true, m.id);
    const before = shape(modelOf(s, m.model));
    const code = modelToCode(modelOf(s, m.model));
    const r = s.evaluate(code);
    assert.equal(r.ok, true, `${m.id}: ${r.error && r.error.message}\n${code}`);
    assert.deepEqual(shape(modelOf(s, m.model)), before, m.id);
  }
});

test('model code: subsystems, orientation, hidden names, settings; edits in the code change the model', () => {
  const s = createSession();
  const r = s.evaluate([
    "new_system('cg');",
    "add_block('Step', 'cg/In', 'Time', '2', 'Position', [20 20 60 60]);",
    "add_block('Subsystem', 'cg/Sub', 'Position', [120 20 180 80]);",
    "add_block('Gain', 'cg/Sub/K', 'Gain', '3', 'Position', [100 40 140 80]);",
    "add_line('cg/Sub', 'In1/1', 'K/1'); delete_line('cg/Sub', 'In1/1', 'Out1/1'); add_line('cg/Sub', 'K/1', 'Out1/1');",
    "add_block('Gain', 'cg/Back', 'Gain', '0.5', 'Orientation', 'left', 'ShowName', 'off', 'Position', [120 120 160 160]);",
    "add_block('Sum', 'cg/Sum', 'Inputs', '|+-', 'Position', [240 20 280 60]);",
    "add_block('Scope', 'cg/Scope', 'Position', [340 20 380 60]);",
    "add_line('cg', 'In/1', 'Sub/1'); add_line('cg', 'Sub/1', 'Sum/1'); add_line('cg', 'Sum/1', 'Scope/1'); add_line('cg', 'Sum/1', 'Back/1'); add_line('cg', 'Back/1', 'Sum/2');",
    "set_param('cg', 'StopTime', '7', 'Solver', 'ode23');",
    "set_param('cg/Back', 'ForegroundColor', '#e03131', 'BackgroundColor', '#e0313138');",
  ].join('\n'));
  assert.equal(r.ok, true, r.error && r.error.message);
  const before = shape(modelOf(s, 'cg'));
  const code = modelToCode(modelOf(s, 'cg'));
  assert.match(code, /delete_block\(find_system\(mdl, 'SearchDepth', 1, 'Type', 'block'\)\)/);
  assert.match(code, /add_block\('Gain', \[mdl '\/Sub\/K'\], 'Gain', '3'/);
  assert.match(code, /'Orientation', 'left'/);
  assert.match(code, /'ShowName', 'off'/);
  assert.match(code, /'ForegroundColor', '#e03131', 'BackgroundColor', '#e0313138'/);
  assert.match(code, /set_param\(mdl, 'StopTime', '7'\)/);
  assert.equal(s.evaluate(code).ok, true);
  assert.deepEqual(shape(modelOf(s, 'cg')), before);
  // the code is the model: changing a value in it changes the diagram
  assert.equal(s.evaluate(code.replace("'Gain', '0.5'", "'Gain', '2'")).ok, true);
  assert.equal(modelOf(s, 'cg').root.blocks.find((b) => b.name === 'Back').params.Gain, '2');
  const sim = s.evaluate("out = sim('cg');");
  assert.equal(sim.ok, true, sim.error && sim.error.message);
});

// Simulation builtins in a full session: building models from M code,
// set_param / get_param, find_system, replace_block, sim (name/value options,
// legacy outputs, SimulationInput, parsim), simset / simget, saving and
// loading .smdl files, .mdl / .slx import, and the help texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { buildRegistry } from '../core/registry.js';
import * as simArea from '../core/sim/index.js';
import { importMdl, importSlx } from '../core/compat/slx.js';
import { zipWrite } from '../core/lib/io/archive.js';

function session() {
  const out = [];
  const posts = [];
  const fs = createMemoryFs();
  const s = createSession({ fs, print: (t, st) => out.push([st, t]), host: { post: (m) => posts.push(m), request: () => null } });
  return {
    s, out, posts, fs,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw new Error(r.error.message); return r; },
    err(code) { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; },
    v(name) { const v = s.getVariable(name); if (v == null) return v; if (v.cls === 'char') return String.fromCharCode(...v.re); if (v.re) return v.re.length === 1 ? v.re[0] : Array.from(v.re); return v; },
  };
}
const BUILD = `new_system('m');
add_block('Sources/Step', 'm/Step', 'Time', '0');
add_block('Continuous/Transfer Fcn', 'm/G', 'Denominator', '[1 1]');
add_block('Out1', 'm/Out1');
add_line('m', 'Step/1', 'G/1');
add_line('m', 'G/1', 'Out1/1');
set_param('m', 'StopTime', '3', 'RelTol', '1e-6');`;

test('the registry has no duplicate names and every sim builtin has bilingual help', () => {
  const reg = buildRegistry();
  for (const name of Object.keys(simArea.builtins)) {
    assert.equal(reg.owner[name], 'sim', name);
    const h = simArea.help[name];
    assert.ok(h && h.en && h.ko && h.syntax.length, `help for ${name}`);
  }
  for (const n of ['new_system', 'open_system', 'load_system', 'close_system', 'save_system', 'bdroot', 'gcs', 'gcb', 'gcbh', 'find_system', 'add_block', 'delete_block', 'add_line', 'delete_line', 'replace_block', 'set_param', 'get_param', 'sim', 'simset', 'simget', 'parsim', 'SimulationInput']) assert.ok(reg.builtins[n], n);
});

test('new_system / add_block / add_line / sim returns out with tout and yout', () => {
  const h = session();
  h.run(BUILD);
  h.run("out = sim('m'); t = out.tout; y = out.yout; e = max(abs(y - (1 - exp(-t))));");
  assert.ok(h.v('e') < 1e-4, `error ${h.v('e')}`);
  assert.equal(h.v('t').at(-1), 3);
  assert.equal(h.v('out').cls, 'SimulationOutput');
  h.run("n = out.who; y2 = out.get('yout'); s = out.SimulationMetadata.Solver;");
  assert.equal(h.v('s'), 'ode45');
  assert.ok(h.posts.some((p) => p.type === 'sim.model' && p.reason === 'engine' || p.type === 'sim.status'));
});

test('get_param / set_param on blocks and models, gcs / gcb / bdroot', () => {
  const h = session();
  h.run(BUILD);
  h.run("k = get_param('m/G', 'Denominator'); st = get_param('m', 'StopTime'); ty = get_param('m/G', 'BlockType'); pos = get_param('m/G', 'Position'); ot = get_param('m', 'SolverType');");
  assert.equal(h.v('k'), '[1 1]'); assert.equal(h.v('st'), '3'); assert.equal(h.v('ty'), 'TransferFcn'); assert.equal(h.v('pos').length, 4); assert.equal(h.v('ot'), 'Variable-step');
  h.run("set_param('m/G', 'Numerator', [2 0]); n = get_param('m/G', 'Numerator'); set_param('m/G', 'Name', 'Plant'); b = gcb; r = bdroot('m/Plant'); s = gcs;");
  assert.equal(h.v('n'), '[2 0]'); assert.equal(h.v('b'), 'm/Plant'); assert.equal(h.v('r'), 'm'); assert.equal(h.v('s'), 'm');
  h.run("p = get_param('m/Plant', 'ObjectParameters'); c = get_param({'m/Step', 'm/Plant'}, 'BlockType');");
  assert.equal(h.v('p').cls, 'struct');
  assert.equal(h.v('c').cls, 'cell');
  assert.match(h.err("set_param('m/Plant', 'NoSuchParam', '1')").message, /no parameter named 'NoSuchParam'/);
  assert.match(h.err("get_param('m/Nope', 'Gain')").message, /no block named/);
  assert.match(h.err("add_block('NoSuchLibraryBlock', 'm/x')").message, /no library block/);
  assert.match(h.err("add_line('m', 'Step/1', 'Plant/1')").message, /already connected/);
});

test('find_system, replace_block, delete_line, delete_block and handles', () => {
  const h = session();
  h.run(BUILD);
  h.run("add_block('Gain', 'm/K1'); add_block('Gain', 'm/K2', 'Gain', '3'); f = find_system('m', 'BlockType', 'Gain'); g = find_system('m', 'BlockType', 'Gain', 'Gain', '3'); hh = find_system('m', 'FindAll', 'on', 'BlockType', 'Gain');");
  assert.equal(h.v('f').data.length, 2);
  assert.equal(h.v('g').data.length, 1);
  assert.equal(h.v('hh').length, 2);
  h.run("nm = get_param(hh(1), 'Name'); r = replace_block('m', 'Gain', 'Slider Gain', 'noprompt'); t2 = get_param('m/K2', 'BlockType'); k2 = get_param('m/K2', 'Gain');");
  assert.equal(h.v('nm'), 'K1');
  assert.equal(h.v('r').data.length, 2);
  assert.equal(h.v('t2'), 'SliderGain'); assert.equal(h.v('k2'), '3');
  h.run("delete_line('m', 'G/1', 'Out1/1'); delete_block('m/K1'); left = find_system('m', 'SearchDepth', 1);");
  assert.equal(h.v('left').data.length, 5, 'the model and four blocks');
  h.run("out = sim('m');");
  assert.match(h.out.filter((o) => o[0] === 'warn').map((o) => o[1]).join(''), /not connected/);
});

test('sim options: name/value pairs, simset struct, legacy [t, x, y], fixed step', () => {
  const h = session();
  h.run(BUILD);
  h.run("out = sim('m', 'StopTime', '1', 'SolverType', 'Fixed-step', 'Solver', 'ode4', 'FixedStep', '0.1'); n = numel(out.tout);");
  assert.equal(h.v('n'), 11);
  h.run("o = simset('Solver', 'ode23', 'StopTime', 2); s = simget(o, 'Solver'); out2 = sim('m', o); n2 = out2.tout(end); sv = out2.SimulationMetadata.Solver;");
  assert.equal(h.v('s'), 'ode23'); assert.equal(h.v('n2'), 2); assert.equal(h.v('sv'), 'ode23');
  h.run("[t, x, y] = sim('m', 2); d = max(abs(x - y));");
  assert.equal(h.v('t').at(-1), 2);
  assert.ok(h.v('d') < 1e-12, 'x equals y for 1/(s+1)');
  h.run("g = simget('m'); rt = simget('m', 'RelTol');");
  assert.equal(h.v('rt'), '1e-6');
});

test('sim without outputs writes out (or tout / yout) to the base workspace', () => {
  const h = session();
  h.run(BUILD);
  h.run("sim('m'); ok1 = exist('out', 'var');");
  assert.equal(h.v('ok1'), 1);
  h.run("set_param('m', 'ReturnWorkspaceOutputs', 'off'); clear out; sim('m'); ok2 = exist('tout', 'var') + exist('yout', 'var'); ok3 = exist('out', 'var');");
  assert.equal(h.v('ok2'), 2); assert.equal(h.v('ok3'), 0);
});

test('SimulationInput with setVariable / setBlockParameter / setModelParameter, and parsim', () => {
  const h = session();
  h.run("new_system('p'); add_block('Constant', 'p/C', 'Value', 'K'); add_block('Gain', 'p/G', 'Gain', '1'); add_block('Out1', 'p/O'); add_line('p', 'C/1', 'G/1'); add_line('p', 'G/1', 'O/1'); K = 1;");
  h.run("in = SimulationInput('p'); in = in.setVariable('K', 5); in = setBlockParameter(in, 'p/G', 'Gain', '2'); in = in.setModelParameter('StopTime', '2'); out = sim(in); y = out.yout(end); te = out.tout(end);");
  assert.equal(h.v('y'), 10); assert.equal(h.v('te'), 2);
  h.run("y0 = sim('p').yout(end);");
  assert.equal(h.v('y0'), 1, 'the model itself is unchanged');
  h.run("a = SimulationInput('p'); a = a.setVariable('K', 2); b = SimulationInput('p'); b = b.setVariable('K', 3); outs = parsim({a, b}); r = [outs{1}.yout(end), outs{2}.yout(end)];");
  assert.deepEqual(h.v('r'), [2, 3]);
});

test('save_system / close_system / load_system round trip through a .smdl file', () => {
  const h = session();
  h.run(BUILD);
  h.run("p = save_system('m'); close_system('m'); load_system('m'); out = sim('m'); n = numel(get_param('m', 'Blocks'));");
  assert.match(h.v('p'), /m\.smdl$/);
  assert.equal(h.v('n'), 3);
  assert.ok(h.fs.exists(h.v('p')));
  h.run("save_system('m', 'copy2.smdl'); nm = bdroot;");
  assert.equal(h.v('nm'), 'copy2');
  h.run("open_system('copy2');");
  assert.ok(h.posts.some((p) => p.type === 'sim.openEditor' && p.name === 'copy2'));
  assert.match(h.err("load_system('nothing_here')").message, /no model or model file/);
});

test('.mdl and .slx import map common blocks, lines and settings', () => {
  const mdl = `Model {
  Name "imp"
  StopTime "4"
  Solver "ode23"
  System {
    Name "imp"
    Block { BlockType Constant Name "C" Position [30, 30, 60, 60] Value "3" }
    Block { BlockType Gain Name "K" Position [100, 30, 130, 60] Gain "2" }
    Block { BlockType Outport Name "Out1" Position [200, 40, 230, 54] Port "1" }
    Block { BlockType Strange Name "X" Ports [1, 1] }
    Line { SrcBlock "C" SrcPort 1 DstBlock "K" DstPort 1 }
    Line { SrcBlock "K" SrcPort 1 Branch { DstBlock "Out1" DstPort 1 } Branch { DstBlock "X" DstPort 1 } }
  }
}`;
  const m = importMdl(mdl, 'imp');
  assert.equal(m.root.blocks.length, 4);
  assert.equal(m.settings.stopTime, '4'); assert.equal(m.settings.solver, 'ode23');
  assert.equal(m.root.blocks[1].params.Gain, '2');
  assert.equal(m.root.blocks[3].type, 'Subsystem');
  assert.match(m.meta.description, /Strange/);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ModelInformation><Model Name="sx"><System>
<Block BlockType="Step" Name="S" SID="1"><P Name="Position">[20, 20, 50, 50]</P><P Name="Time">0.5</P></Block>
<Block BlockType="Integrator" Name="I" SID="2"><P Name="Position">[100, 20, 130, 50]</P></Block>
<Block BlockType="Outport" Name="Out1" SID="3"><P Name="Port">1</P></Block>
<Line><P Name="Src">1#out:1</P><P Name="Dst">2#in:1</P></Line>
<Line><P Name="Src">2#out:1</P><P Name="Dst">3#in:1</P></Line>
</System></Model></ModelInformation>`;
  const bytes = zipWrite([{ name: ['simu', 'link/blockdiagram.xml'].join(''), data: new TextEncoder().encode(xml) }]);
  const s = importSlx(bytes, 'sx');
  assert.equal(s.root.blocks.length, 3);
  assert.equal(s.root.lines.length, 2);
  assert.equal(s.root.blocks[0].params.Time, '0.5');
  const h = session();
  h.fs.writeText('/home/imp.mdl', mdl);
  h.run("load_system('imp.mdl'); out = sim('imp'); y = out.yout(end, 1);");
  assert.equal(h.v('y'), 6);
});

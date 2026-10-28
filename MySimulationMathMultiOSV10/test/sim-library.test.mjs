// Block library integrity (every library entry builds, has ports, defaults,
// an icon and a runtime or a virtual role; bilingual labels) and the model
// edit helpers of core/sim/model.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, LIBRARY, BLOCKS, blockDef, defaultParams, portsOf, iconOf, searchLibrary } from '../core/sim/blocks/index.js';
import {
  newModel, makeBlock, connect, connections, detachBlock, inputUsed, uniqueName, serializeModel, parseModel, resolvePath, portGeometry, reassignIds, clone, modelNameOfPath, systemBounds,
} from '../core/sim/model.js';

const VIRTUAL = new Set(['subsystem', 'goto', 'from', 'gotovis', 'enableport', 'triggerport', 'actionport', 'dsm']);

test('library: groups, unique ids, bilingual labels and descriptions', () => {
  const ids = new Set();
  for (const it of LIBRARY) { assert.ok(!ids.has(it.id), `duplicate id ${it.id}`); ids.add(it.id); }
  const groups = new Set(GROUPS.map((g) => g.id));
  for (const it of LIBRARY) {
    assert.ok(groups.has(it.group), `${it.id}: unknown group ${it.group}`);
    assert.ok(it.label.en && it.label.ko, `${it.id}: label`);
  }
  for (const g of GROUPS) assert.ok(LIBRARY.some((i) => i.group === g.id), `group ${g.id} is empty`);
  for (const d of Object.values(BLOCKS)) {
    assert.ok(d.desc.en && d.desc.ko, `${d.type}: description`);
    for (const p of d.params) { assert.ok(p.label.en && p.label.ko, `${d.type}.${p.name}: label`); assert.equal(typeof p.def, 'string'); }
  }
  assert.ok(Object.keys(BLOCKS).length >= 130);
});

test('library: every entry builds, has ports, defaults, an icon and a runtime or virtual role', () => {
  const m = newModel('lib');
  for (const it of LIBRARY) {
    const b = makeBlock(m, it.type, { variant: it.variant, params: it.params });
    const d = blockDef(it.type);
    assert.ok(d, it.id);
    for (const [k, v] of Object.entries(defaultParams(it.type))) assert.equal(typeof b.params[k], 'string', `${it.id}.${k}`), void v;
    const pc = portsOf(b);
    assert.ok(pc.in >= 0 && pc.out >= 0 && Array.isArray(pc.special), `${it.id}: ports`);
    const icon = iconOf(b);
    assert.ok(icon && typeof icon === 'object', `${it.id}: icon`);
    assert.ok(typeof d.make === 'function' || VIRTUAL.has(d.role), `${it.id}: no runtime`);
    assert.ok(b.w > 0 && b.h > 0);
  }
});

test('library search finds blocks by English, Korean and type names', () => {
  assert.ok(searchLibrary('integr').some((i) => i.type === 'Integrator'));
  assert.ok(searchLibrary('적분').some((i) => i.type === 'Integrator'));
  assert.ok(searchLibrary('TransferFcn').some((i) => i.type === 'TransferFcn'));
  assert.equal(searchLibrary('').length, LIBRARY.length);
});

test('subsystem templates and variants create control blocks inside', () => {
  const m = newModel('t');
  const en = makeBlock(m, 'Subsystem', { variant: 'enabled' });
  assert.deepEqual(portsOf(en).special, ['enable']);
  assert.equal(portsOf(en).in, 1);
  const tr = makeBlock(m, 'Subsystem', { variant: 'enabledTriggered' });
  assert.deepEqual(portsOf(tr).special, ['enable', 'trigger']);
  const wh = makeBlock(m, 'Subsystem', { variant: 'whileIterator' });
  assert.ok(wh.system.blocks.some((b) => b.type === 'WhileIterator'));
  assert.equal(wh.system.lines.length, 2);
});

test('model edits: connect with branches, detach, unique names, input use', () => {
  const m = newModel('e');
  const s = m.root;
  const a = makeBlock(m, 'Constant', {}, s); s.blocks.push(a);
  const g1 = makeBlock(m, 'Gain', {}, s); s.blocks.push(g1);
  const g2 = makeBlock(m, 'Gain', {}, s); s.blocks.push(g2);
  assert.equal(g2.name, 'Gain1');
  assert.equal(uniqueName(s, 'Gain'), 'Gain2');
  connect(m, s, { block: a.id, port: 1 }, { block: g1.id, port: 1 });
  connect(m, s, { block: a.id, port: 1 }, { block: g2.id, port: 1 });
  assert.equal(s.lines.length, 1);
  assert.equal(s.lines[0].branches.length, 2);
  assert.equal(connections(s).length, 2);
  assert.ok(inputUsed(s, g2.id, 1));
  detachBlock(s, g1.id);
  assert.equal(connections(s).length, 1);
  assert.equal(s.lines[0].dst.block, g2.id, 'a single remaining branch collapses into the line');
  detachBlock(s, a.id);
  assert.equal(s.lines.length, 0);
});

test('model files: serialize / parse round trip, normalisation, paths and geometry', () => {
  const m = newModel('round');
  const sub = makeBlock(m, 'Subsystem', {}, m.root); m.root.blocks.push(sub);
  const text = serializeModel(m);
  const back = parseModel(text);
  assert.equal(back.name, 'round');
  assert.equal(back.root.blocks[0].system.blocks.length, 2);
  assert.ok(back.nextId > 3);
  assert.equal(resolvePath(back, 'round/Subsystem/In1').block.type, 'Inport');
  assert.equal(resolvePath(back, 'round/Nope'), null);
  assert.throws(() => parseModel('{"x":1}'), /missing root/);
  assert.equal(modelNameOfPath('C:/x/my plant.smdl'), 'my_plant');
  const k = makeBlock(m, 'Gain', { x: 100, y: 50 });
  const g = portGeometry(k);
  assert.equal(g.in[0].dir, 'left'); assert.equal(g.out[0].dir, 'right');
  k.rot = 90;
  assert.equal(portGeometry(k).in[0].dir, 'top');
  const copy = clone(back.root);
  const map = reassignIds(back, copy);
  assert.ok(Object.keys(map).length >= 3);
  assert.ok(systemBounds(back.root));
});

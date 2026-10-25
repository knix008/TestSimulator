// Unit tests of the pure frontend modules (node --test test/unit/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emptyModel, normalizeModel, parseModel, serializeModel, engineModel, createNode, connect, reaches, upstream, executionOrder,
  checkModel, externalNodes, autoLayout, newId,
} from '../../src/core/model.js';
import { NODES, CATEGORIES, NODE_MAP, defaultParams, nodeSpec, nodesIn } from '../../src/core/catalog.js';
import { SAMPLE_IDS, SAMPLE_TAGS, sampleModel } from '../../src/core/samples.js';
import { MESSAGES } from '../../src/core/i18n.js';
import { COMMAND_IDS, MENUS, WORKBENCHES, TOOLBAR_GROUPS, CONTEXT_MENUS, SHORTCUTS, commandName, commandIcon, commandTip } from '../../src/core/commands.js';
import { THEMES, resolveTheme, sanitizeTheme, themeVars } from '../../src/core/themes.js';
import { decodeResult, findColumn, tableCsv, gridCsv, outputSummary, columnNames, MAGIC } from '../../src/core/result.js';
import { niceTicks, formatValue } from '../../src/core/colormap.js';
import { sanitizeSettings, addRecent, DEFAULT_SETTINGS, ANIMATIONS } from '../../src/core/settings.js';
import { STEP_TEXT, CHAPTERS } from '../../src/core/tutorial-text.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the catalogue lists exactly the engine\'s node types', () => {
  const rust = fs.readFileSync(path.join(root, 'engine', 'sim-core', 'src', 'nodes', 'mod.rs'), 'utf8');
  const engineKinds = [...rust.matchAll(/Spec \{ kind: "([^"]+)"/g)].map((m) => m[1]).sort();
  const ui = NODES.map((n) => n.type).sort();
  assert.deepEqual(ui, engineKinds);
  assert.equal(ui.length, 52);
  // The engine's input ports match the catalogue's.
  for (const m of rust.matchAll(/Spec \{ kind: "([^"]+)", inputs: ([A-Z]+|&\[[^\]]*\])/g)) {
    const ports = m[2] === 'IN' ? ['in'] : m[2] === 'NONE' ? [] : m[2] === 'AB' ? ['a', 'b'] : [...m[2].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
    assert.deepEqual(nodeSpec(m[1]).inputs.map((p) => p.port), ports, m[1]);
  }
});

test('every node has a category, both names, help and parameters with defaults', () => {
  for (const n of NODES) {
    assert.ok(CATEGORIES[n.cat], `${n.type} category`);
    assert.ok(n.ko && n.en && n.icon, `${n.type} names`);
    assert.equal(n.help.length, 2, `${n.type} help`);
    const keys = new Set();
    for (const p of n.params) {
      assert.ok(!keys.has(p.key), `${n.type}.${p.key} twice`);
      keys.add(p.key);
      assert.ok(p.ko && p.en, `${n.type}.${p.key} label`);
      if (p.type === 'select') assert.ok(p.options.some(([v]) => String(v) === String(p.def)), `${n.type}.${p.key} default not an option`);
    }
    for (const preset of n.presets ?? []) for (const key of Object.keys(preset.params)) assert.ok(keys.has(key), `${n.type} preset ${preset.id} sets unknown ${key}`);
  }
  assert.equal(Object.keys(NODE_MAP).length, NODES.length);
  assert.ok(nodesIn('signal').length >= 6);
});

test('a new node gets its defaults and a unique name', () => {
  let m = emptyModel('en');
  const a = createNode(m, 'source.signal', 10, 20, 'en');
  m = { ...m, nodes: [a] };
  const b = createNode(m, 'source.signal', 10, 20, 'en');
  assert.equal(a.params.waveform, 'sine');
  assert.notEqual(a.name, b.name);
  assert.notEqual(a.id, b.id);
  assert.deepEqual(defaultParams('signal.fft').window, 'hann');
});

test('links: connect replaces an input, refuses loops; order and upstream', () => {
  let m = normalizeModel({ nodes: [{ id: 'a', type: 'source.signal' }, { id: 'b', type: 'signal.filter' }, { id: 'c', type: 'signal.fft' }] });
  m = connect(m, 'a', 'b');
  m = connect(m, 'b', 'c');
  assert.equal(m.links.length, 2);
  assert.equal(connect(m, 'c', 'a'), null, 'loop refused');
  assert.equal(connect(m, 'a', 'a'), null);
  assert.ok(reaches(m, 'a', 'c'));
  assert.deepEqual([...upstream(m, 'c')].sort(), ['a', 'b']);
  assert.deepEqual(executionOrder(m), ['a', 'b', 'c']);
  const again = connect(m, 'a', 'c');
  assert.equal(again.links.filter((l) => l.to === 'c').length, 1, 'one link per input');
  const laid = autoLayout(m);
  assert.ok(laid.nodes.find((n) => n.id === 'c').x > laid.nodes.find((n) => n.id === 'a').x);
  assert.equal(newId('n', ['n1', 'n2']), 'n3');
});

test('normalize, parse, serialize and the engine view round-trip', () => {
  const m = sampleModel('pidControl', 'en');
  const back = parseModel(serializeModel(m));
  assert.deepEqual(back.nodes.map((n) => n.id), m.nodes.map((n) => n.id));
  assert.deepEqual(back.links, m.links);
  const e = engineModel(m);
  assert.ok(!('x' in e.nodes[0]) && !('view' in e));
  assert.throws(() => parseModel('{"a":1}'), /nodes/);
  assert.throws(() => parseModel('nope'), /JSON/);
  const pruned = normalizeModel({ nodes: [{ id: 'a', type: 'source.signal' }], links: [{ from: 'a', to: 'gone' }] });
  assert.equal(pruned.links.length, 0);
});

test('checks find empty pipelines, unlinked inputs and missing outputs', () => {
  assert.equal(checkModel(emptyModel())[0].key, 'issueEmpty');
  const m = normalizeModel({ nodes: [{ id: 'a', type: 'signal.fft' }, { id: 'b', type: 'dyn.ode' }] });
  const keys = checkModel(m).map((i) => i.key);
  assert.ok(keys.includes('issueInput'), 'fft needs an input');
  assert.equal(keys.filter((k) => k === 'issueInput').length, 1, 'the ODE input u is optional');
  assert.ok(keys.includes('issueNoOutput'));
  assert.equal(externalNodes(normalizeModel({ nodes: [{ id: 'p', type: 'io.python' }] })).length, 1);
});

test('every sample is a valid pipeline in both languages', () => {
  assert.ok(SAMPLE_IDS.length >= 15);
  for (const id of SAMPLE_IDS) {
    for (const lang of ['ko', 'en']) {
      const m = sampleModel(id, lang);
      assert.ok(m.name && m.description, `${id} ${lang} name`);
      assert.ok(executionOrder(m), `${id} has a loop`);
      assert.equal(checkModel(m).filter((i) => i.level === 'error').length, 0, `${id} ${lang}: ${JSON.stringify(checkModel(m))}`);
      for (const n of m.nodes) assert.ok(nodeSpec(n.type), `${id}: ${n.type}`);
    }
    assert.ok(SAMPLE_TAGS[id], `${id} tags`);
  }
  assert.notEqual(sampleModel('regression', 'ko').name, sampleModel('regression', 'en').name);
});

test('both languages have every message', () => {
  const ko = Object.keys(MESSAGES.ko);
  const en = Object.keys(MESSAGES.en);
  assert.deepEqual(ko.filter((k) => !en.includes(k)), []);
  assert.deepEqual(en.filter((k) => !ko.includes(k)), []);
  for (const kind of ANIMATIONS) assert.ok(MESSAGES.ko[`anim_${kind}`] && MESSAGES.en[`anim_${kind}`], kind);
  for (const tag of new Set(Object.values(SAMPLE_TAGS).flat())) assert.ok(MESSAGES.en[`tag_${tag}`], tag);
  for (const step of Object.values(STEP_TEXT)) assert.ok(CHAPTERS[step.chapter], step.id);
});

test('commands: every menu, toolbar, workbench and context item exists', () => {
  const ids = new Set(COMMAND_IDS);
  const items = [...MENUS.flatMap((m) => m.items), ...TOOLBAR_GROUPS.flat(), ...WORKBENCHES.flatMap((w) => w.groups.flatMap((g) => g.tools)), ...Object.values(CONTEXT_MENUS).flatMap((c) => c.items), ...Object.keys(SHORTCUTS)];
  for (const id of items) if (id !== '|') assert.ok(ids.has(id), `unknown command ${id}`);
  assert.equal(commandName('add:signal.fft', 'en'), 'Spectrum (FFT)');
  assert.equal(commandIcon('add:signal.fft'), nodeSpec('signal.fft').icon);
  assert.match(commandTip('run', 'ko'), /실행/);
  // Every node can be added from a menu.
  const menuAdds = new Set(MENUS.flatMap((m) => m.items).filter((id) => id.startsWith('add:')));
  for (const n of NODES) assert.ok(menuAdds.has(`add:${n.type}`), `${n.type} is in no menu`);
  const shortcutKeys = Object.values(SHORTCUTS);
  assert.equal(new Set(shortcutKeys).size, shortcutKeys.length, 'a shortcut is used twice');
});

test('themes and settings', () => {
  assert.equal(THEMES.length, 40);
  assert.ok(themeVars(resolveTheme('dark'))['--accent']);
  assert.equal(sanitizeTheme({ colors: { bg: 'red' } }).colors.bg.startsWith('#'), true);
  const s = sanitizeSettings({ language: 'xx', fontSize: 99, animation: 'nope', snap: 'yes', recentFiles: [{ path: 'a.mysim' }, null] });
  assert.equal(s.language, 'ko');
  assert.equal(s.fontSize, 20);
  assert.equal(s.animation, DEFAULT_SETTINGS.animation);
  assert.equal(s.snap, false, 'wrong types fall back');
  assert.equal(s.recentFiles.length, 1);
  assert.equal(addRecent(s, 'C:/x/b.mysim').recentFiles[0].name, 'b.mysim');
  assert.equal(ANIMATIONS.length, 20);
});

/** Bytes in the engine's layout, built by hand. */
function encode(header, data) {
  const head = new TextEncoder().encode(JSON.stringify(header));
  const start = Math.ceil((8 + head.length) / 8) * 8;
  const buf = new Uint8Array(start + data.length * 8).fill(32);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, head.length, true);
  buf.set(head, 8);
  data.forEach((v, i) => dv.setFloat64(start + i * 8, v, true));
  return buf;
}

test('result bytes decode into tables, grids and values', () => {
  const header = {
    ok: true, name: 'x', elapsedMs: 3,
    nodes: [{
      id: 'n1', ok: true, warnings: ['w'], elapsedMs: 1, text: 'hi',
      tables: [{ name: 'signal', x: 0, rows: 3, columns: [{ name: 't', unit: 's', offset: 0, length: 3 }, { name: 'y', unit: '', offset: 3, length: 3 }, { name: 'tag', unit: '', labels: ['a', 'b', 'c'], length: 3 }] }],
      grids: [{ name: 'g', xLabel: 'x', yLabel: 'y', zLabel: 'z', nx: 2, ny: 1, x: { offset: 6, length: 2 }, y: { offset: 8, length: 1 }, z: { offset: 9, length: 2 } }],
      scalars: [{ name: 'peak', value: 2.5, unit: 'V' }, { name: 'nan', value: null, unit: '' }],
    }, { id: 'n2', ok: false, error: 'bad', skipped: false }],
  };
  const r = decodeResult(encode(header, [0, 1, 2, 10, 20, 30, 0, 1, 5, 7, 8]));
  const out = r.nodes.get('n1');
  assert.deepEqual(Array.from(findColumn(out.tables[0], 'y').values), [10, 20, 30]);
  assert.equal(out.tables[0].columns[2].labels[1], 'b');
  assert.deepEqual(Array.from(out.grids[0].z), [7, 8]);
  assert.equal(out.scalars[0].value, 2.5);
  assert.ok(Number.isNaN(out.scalars[1].value));
  assert.equal(r.nodes.get('n2').error, 'bad');
  assert.match(tableCsv(out.tables[0]), /^t \(s\),y,tag\n0,10,a\n/);
  assert.match(gridCsv(out.grids[0]), /y \\ x,0,1\n5,7,8/);
  assert.deepEqual(columnNames(out), ['t', 'y', 'tag']);
  assert.match(outputSummary(out), /3/);
  assert.throws(() => decodeResult(new Uint8Array(16)), /not a MySimulator result/);
});

test('number formatting and ticks', () => {
  assert.deepEqual(niceTicks(0, 10, 5), [0, 2.5, 5, 7.5, 10]);
  assert.equal(formatValue(1234.5678), '1235');
  assert.equal(formatValue(0.000012345), '1.23e-5');
});

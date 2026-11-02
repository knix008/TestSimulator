// Copy & paste through the system clipboard: one text clipboard module (lib/clipboard.js) for the
// whole app, the desktop host's clipboard plugin, and blocks of the graphical script and the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readText, writeText, tagged, parseTagged } from '../src/lib/clipboard.js';
import { emptyFlow, makeNode, connect, copyItems, pasteItems, generateCode } from '../src/flow/flow.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('tagged clipboard text reads back only with its own format', () => {
  const s = tagged('msm-flow-blocks', { nodes: [1], links: [] });
  assert.deepEqual(parseTagged(s, 'msm-flow-blocks').nodes, [1]);
  assert.equal(parseTagged(s, 'msm-model-blocks'), null);
  assert.equal(parseTagged('x = 1;', 'msm-flow-blocks'), null);
  assert.equal(parseTagged('{broken', 'msm-flow-blocks'), null);
  assert.equal(parseTagged(null, 'msm-flow-blocks'), null);
});

test('without a system clipboard the last copy in this window still pastes', async () => {
  await writeText('hello');
  assert.equal(await readText(), 'hello');
});

test('graphical script blocks copy with their links and paste under free names', () => {
  let f = emptyFlow();
  const a = makeNode(f, 'const', 0, 0); f = { ...f, nodes: [a] };
  const b = makeNode(f, 'op', 300, 0); f = { ...f, nodes: [a, b] };
  const d = makeNode(f, 'disp', 600, 0); f = { ...f, nodes: [a, b, d] };
  f = connect(f, { node: a.id, port: 0 }, { node: b.id, port: 0 });
  f = connect(f, { node: b.id, port: 0 }, { node: d.id, port: 0 });
  const clip = copyItems(f, [a.id, b.id]);
  assert.equal(clip.nodes.length, 2);
  assert.equal(clip.links.length, 1, 'only the link between copied blocks');
  assert.equal(copyItems(f, []), null);
  const r = pasteItems(f, JSON.parse(tagged('x', clip)), 30);
  assert.equal(r.ids.length, 2);
  const pasted = r.flow.nodes.filter((n) => r.ids.includes(n.id));
  assert.deepEqual(pasted.map((n) => n.name), ['c2', 'r2'], 'used names get free ones');
  assert.deepEqual(pasted.map((n) => n.x), [30, 330]);
  assert.equal(r.flow.links.length, 3);
  assert.ok(r.flow.links.some((l) => l.from.node === pasted[0].id && l.to.node === pasted[1].id), 'the copied link joins the copies');
  assert.match(generateCode(r.flow).code, /c2 = 1;/);
  assert.equal(pasteItems(f, null).ids.length, 0);
  // into an empty script the names stay
  const into = pasteItems(emptyFlow(), clip, 0);
  assert.deepEqual(into.flow.nodes.map((n) => n.name), ['c1', 'r1']);
});

test('every copy and paste in the app goes through lib/clipboard.js', () => {
  const files = ['App.jsx', 'lib/contextMenus.js', 'views/common.jsx', 'sim/ModelCodePane.jsx', 'sim/ModelEditor.jsx', 'flow/FlowEditor.jsx', 'flow/FlowCodePane.jsx'];
  for (const f of files) assert.doesNotMatch(read(`../src/${f}`), /navigator\.clipboard\.(readText|writeText)/, f);
  const lib = read('../src/lib/clipboard.js');
  assert.match(lib, /plugin:clipboard-manager\|read_text/);
  assert.match(lib, /plugin:clipboard-manager\|write_text/);
  assert.match(read('../src-tauri/Cargo.toml'), /tauri-plugin-clipboard-manager = "2"/);
  assert.match(read('../src-tauri/src/lib.rs'), /\.plugin\(tauri_plugin_clipboard_manager::init\(\)\)/);
  const caps = JSON.parse(read('../src-tauri/capabilities/default.json'));
  for (const p of ['clipboard-manager:allow-read-text', 'clipboard-manager:allow-write-text']) assert.ok(caps.permissions.includes(p), p);
});

test('the graphical editor and the model editor copy blocks through the system clipboard', () => {
  const fe = read('../src/flow/FlowEditor.jsx');
  for (const k of ["e.key.toLowerCase() === 'c'", "e.key.toLowerCase() === 'x'", "e.key.toLowerCase() === 'v'", "pick === 'copy'", "pick === 'cut'", "pick === 'paste'"]) assert.ok(fe.includes(k), k);
  assert.match(fe, /writeText\(tagged\(FLOW_CLIP, clip\)\)/);
  const me = read('../src/sim/ModelEditor.jsx');
  assert.match(me, /if \(toSystem\) writeText\(tagged\(BLOCK_CLIP, \{ blocks, lines \}\)\)/);
  assert.match(me, /v: \(\) => pasteClip\(\)/);
  assert.match(me, /copySel\(false\)\) paste\(20\)/, 'duplicate keeps the system clipboard');
  const cw = read('../src/panes/CommandWindow.jsx');
  assert.match(cw, /if \(outSel\) \{ e\.preventDefault\(\); copyText\(outSel\); return; \}/);
});

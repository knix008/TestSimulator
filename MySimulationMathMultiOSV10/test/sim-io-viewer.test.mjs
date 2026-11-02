// 입력·출력 그래프 (src/sim/viewers.js): a Floating Scope beside a block showing the sources of its
// input lines and its outputs, simulated for real; and which scope windows Run opens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { equationModel } from '../core/sim/eqmodel.js';
import { compileModel } from '../core/sim/compile.js';
import { Run } from '../core/sim/runtime.js';
import { ioSignals, findIoViewer, ioViewerBlock, scopesToOpen, MAX_SCOPES } from '../src/sim/viewers.js';
import { tr } from '../src/sim/i18n.js';
import { mockCtx } from './helpers/mockctx.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const osc = () => equationModel("x'' = -x\nx(0) = 1", { name: 'osc', stopTime: '2' }).model;

test('ioSignals: the sources of the input lines in port order, then the outputs', () => {
  const m = osc();
  const s = m.root;
  const integ = s.blocks.find((b) => b.name === 'x');   // x' → [x] → x
  const sig = ioSignals(s, integ);
  const into = s.lines.find((l) => (function has(seg) { return (seg.dst && seg.dst.block === integ.id) || (seg.branches || []).some(has); })(l));
  assert.deepEqual(sig, [`${into.src.block}:${into.src.port}`, `${integ.id}:1`]);
  const scope = s.blocks.find((b) => b.type === 'Scope');
  assert.ok(ioSignals(s, scope).length >= 1, 'a sink shows its inputs');
  assert.deepEqual(ioSignals(s, { id: 'none', type: 'Scope', params: { NumInputPorts: '1' } }), [], 'nothing connected');
});

test('ioViewerBlock: a Floating Scope beside the block; found again instead of doubled', () => {
  const m = osc();
  const s = m.root;
  const integ = s.blocks.find((b) => b.name === 'x');
  const v = ioViewerBlock(m, s, integ, { lang: 'ko' });
  assert.equal(v.type, 'FloatingScope');
  assert.equal(v.params.Signals, ioSignals(s, integ).join(','));
  assert.equal(v.params.Title, 'x: 입력·출력');
  assert.ok(v.x > integ.x + integ.w && v.y > integ.y, 'beside the block');
  assert.ok(!s.blocks.some((b) => b.name === v.name), 'a free name');
  assert.equal(findIoViewer(s, ioSignals(s, integ)), null);
  s.blocks.push(v);
  assert.equal(findIoViewer(s, ioSignals(s, integ)), v);
  assert.equal(ioViewerBlock(m, s, { id: 'none', name: 'n', type: 'Scope', x: 0, y: 0, w: 40, h: 40, params: { NumInputPorts: '1' } }), null);
});

test('the viewer receives the block input and output while simulating (x\' = -sin t, x = cos t)', () => {
  const m = osc();
  const s = m.root;
  const integ = s.blocks.find((b) => b.name === 'x');
  const v = ioViewerBlock(m, s, integ);
  s.blocks.push(v);
  Object.assign(m.settings, { solverType: 'fixed', solver: 'ode4', fixedStep: '0.001' });
  const ctx = mockCtx();
  const run = new Run(compileModel(m, ctx), ctx).init();
  run.runSync();
  const msg = run.scopeMessages(true).find((x) => x.block === v.id);
  assert.ok(msg, 'the viewer streams like a scope');
  assert.equal(msg.series.length, 2, 'input and output');
  const t = Array.from(msg.t);
  const k = t.findIndex((x) => x >= 1 - 1e-9);
  const at = (j) => (Array.isArray(msg.series[j]) || ArrayBuffer.isView(msg.series[j]) ? msg.series[j] : msg.series[j].y || msg.series[j].data)[k];
  assert.ok(Math.abs(at(0) + Math.sin(t[k])) < 1e-3, `input x' = -sin t, got ${at(0)}`);
  assert.ok(Math.abs(at(1) - Math.cos(t[k])) < 1e-3, `output x = cos t, got ${at(1)}`);
});

test('scopesToOpen: every scope (closed windows open again on Run); windows of deleted scopes go', () => {
  assert.deepEqual(scopesToOpen([], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(scopesToOpen(['a'], ['a', 'b']), ['a', 'b'], 'a new scope opens even with one window open');
  assert.deepEqual(scopesToOpen(['gone', 'a'], ['a', 'b']), ['a', 'b'], 'a deleted scope drops out');
  assert.deepEqual(scopesToOpen(['a'], ['a', 'b']), ['a', 'b'], 'a window closed before opens again');
  const many = Array.from({ length: 12 }, (_, i) => `s${i}`);
  assert.equal(scopesToOpen([], many).length, MAX_SCOPES);
});

test('editor wiring: block menu item, reuse, Run opens the window; strings', () => {
  const ed = read('../src/sim/ModelEditor.jsx');
  assert.match(ed, /\{ icon: 'scope', label: L\('ioGraph'\), disabled: !ioSignals\(sys\(\), b\)\.length, run: \(\) => showIO\(b\) \}/);
  assert.match(ed, /const found = findIoViewer\(s, ioSignals\(s, blk\)\);/);
  assert.match(ed, /if \(!running\) requestAnimationFrame\(\(\) => cmdRef\.current\.run\(\)\);/);
  assert.match(ed, /setOpenScopes\(\(o\) => scopesToOpen\(o, ids\)\);/);
  assert.doesNotMatch(ed, /closedScopes/, 'a closed window does not stay closed on Run');
  assert.match(ed, /rec\(modelRef\.current\.root\);/, 'scopes inside subsystems too');
  assert.match(ed, /keys: it\.keys, disabled: !!it\.disabled \}/);
  for (const lang of ['ko', 'en']) assert.notEqual(tr(lang, 'ioGraph'), 'ioGraph');
  assert.ok(!/matl[a]b|simul[i]nk/i.test(read('../src/sim/viewers.js')), 'name rule');
});

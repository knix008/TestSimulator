// Editor pieces that need no browser: canvas geometry, node summaries, auto layout, the JSON view, the
// run timeline builders, the start page arrangement and the editor settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeBox, portPoint, edgePath, nodeSummary, gridStep } from '../../src/editor/canvas.js';
import { jsonView } from '../../src/editor/jsonview.js';
import { stepsHtml, runHeaderHtml, waitingHtml, historyHtml, fmtMs } from '../../src/editor/runpanel.js';
import { autoLayout, backEdges, nodeHeight, NODE_W, SCREEN_ASPECT } from '../../core/layout.js';
import { autoArrange, COLS } from '../../src/ui/startlayout.js';
import { START_SPANS } from '../../src/ui/startboard.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { NODE_TYPES, defaultConfig } from '../../core/nodes/defs.js';
import { TEMPLATES, buildTemplate } from '../../core/templates.js';
import { t, setLanguage } from '../../src/i18n.js';

const node = (type, config = {}, x = 0, y = 0) => ({ id: type, type, name: type, x, y, config: { ...defaultConfig(type), ...config } });

test('ports sit on the card edges; more output ports make the card taller', () => {
  const llm = node('ai.llm', {}, 100, 50);
  const b = nodeBox(llm);
  assert.deepEqual(portPoint(llm, 'in'), { x: 100, y: 50 + b.h / 2 });
  assert.deepEqual(portPoint(llm, 'out', 'out'), { x: 100 + b.w, y: 50 + b.h / 2 });
  const sw = node('ai.classify', { categories: ['a', 'b', 'c', 'd'] });
  assert.ok(nodeBox(sw).h > b.h);
  const ys = ['a', 'b', 'c', 'd', 'other'].map((p) => portPoint(sw, 'out', p).y);
  assert.deepEqual([...ys].sort((p, q) => p - q), ys, 'ports in order, top to bottom');
  const agent = node('ai.agent', {}, 0, 0);
  assert.deepEqual(portPoint(agent, 'tools'), { x: nodeBox(agent).w / 2, y: nodeBox(agent).h });
  assert.match(edgePath({ x: 0, y: 0 }, { x: 200, y: 40 }), /^M0,0 C/);
});

test('every node type has a one-line summary in both languages', () => {
  for (const d of NODE_TYPES) for (const lang of ['ko', 'en']) assert.equal(typeof nodeSummary(node(d.type), lang, { agentName: () => 'x' }), 'string', d.type);
  assert.equal(nodeSummary(node('tool.http', { method: 'POST', url: 'https://a.b/c' }), 'en'), 'POST https://a.b/c');
});

test('auto layout: columns follow the flow, nothing overlaps, tools go under their agent', () => {
  for (const t0 of TEMPLATES) {
    const doc = buildTemplate(t0.id, 'en');
    const laid = autoLayout(doc.nodes, doc.edges);
    for (let i = 0; i < laid.length; i += 1) for (let j = i + 1; j < laid.length; j += 1) {
      const a = laid[i]; const b = laid[j];
      const overlap = a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + nodeHeight(b) && b.y < a.y + nodeHeight(a);
      assert.ok(!overlap, `${t0.id}: ${a.name} / ${b.name}`);
    }
    const back = backEdges(doc.nodes, doc.edges);
    for (const e of doc.edges.filter((x) => x.fromPort !== 'tools' && !back.has(x.id))) {
      const from = laid.find((n) => n.id === e.from);
      const to = laid.find((n) => n.id === e.to);
      assert.ok(to.x > from.x || to.y >= from.y + nodeHeight(from), `${t0.id}: ${from.name} → ${to.name} goes right (or on to the next row)`);
    }
    for (const e of doc.edges.filter((x) => x.fromPort === 'tools')) assert.ok(laid.find((n) => n.id === e.to).y > laid.find((n) => n.id === e.from).y, 'tool below agent');
  }
});

test('the JSON view escapes text and folds deep values', () => {
  const html = jsonView({ a: '<b>x</b>', n: 1, list: [1, 2, { deep: true }] }, { max: 1 });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!html.includes('<b>x</b>'));
  assert.match(html, /<details class="j-node" open>/);
  assert.equal(jsonView(undefined), '<div class="json-view empty">—</div>');
});

test('the run timeline: a row per step, bars in time, waiting card, history rows', () => {
  setLanguage('en');
  const run = { id: 'r', status: 'waiting', startedAt: 1000, endedAt: null, trigger: { kind: 'manual' }, usage: { calls: 1, input: 5, output: 2 },
    steps: [{ id: 's1', nodeId: 'a', name: 'Start', type: 'trigger.manual', status: 'succeeded', startedAt: 1000, endedAt: 1100, ms: 100, port: 'out' }, { id: 's2', nodeId: 'b', name: 'Approve', type: 'human.approval', status: 'waiting', startedAt: 1100, endedAt: null, loop: { index: 1 } }],
    waiting: { kind: 'approval', nodeName: 'Approve', message: 'Send it?' } };
  const steps = stepsHtml(run, t, 'en', 's2');
  assert.equal((steps.match(/class="step-row/g) ?? []).length, 2);
  assert.match(steps, /step-row st-waiting selected/);
  assert.match(steps, /#2/);
  assert.match(runHeaderHtml(run, t, { live: true }), /data-run-action="stop"/);
  assert.match(waitingHtml(run, t), /data-run-action="approve"/);
  assert.match(waitingHtml({ ...run, waiting: { ...run.waiting, kind: 'input', fields: ['city'] } }, t), /data-wait-field="city"/);
  assert.match(historyHtml([{ id: 'r', status: 'succeeded', startedAt: 1, ms: 1200, steps: 3, trigger: { kind: 'chat' } }], t, 'r'), /history-row selected/);
  assert.equal(fmtMs(1500), '1.5 s');
});

test('the start page is vertical by default: one card per row, top to bottom', () => {
  const ids = Object.keys(START_SPANS.vertical);
  const cells = autoArrange(ids, START_SPANS.vertical, Object.fromEntries(ids.map((id) => [id, 6])));
  const rows = ids.map((id) => cells[id]);
  for (const c of rows) { assert.equal(c.col, 0); assert.equal(c.w, COLS); }
  assert.deepEqual(rows.map((c) => c.row), [...rows.map((c) => c.row)].sort((a, b) => a - b));
  assert.equal(new Set(rows.map((c) => c.row)).size, ids.length, 'no two cards side by side');
  assert.equal(normalizeSettings({}).startArrange, 'vertical');
  assert.equal(normalizeSettings({ startArrange: 'grid' }).startArrange, 'grid');
});

test('editor settings have defaults and are repaired', () => {
  const s = normalizeSettings({ snapToGrid: 'yes', rightTab: 'nope' });
  assert.equal(s.snapToGrid, true);
  assert.equal(s.showMinimap, true);
  assert.equal(s.animateRuns, true);
  assert.equal(s.rightTab, 'node');
});

test('auto layout: a loop back ("another round") is found and drawn going back left', () => {
  const doc = buildTemplate('autodev-loop', 'en');
  const back = backEdges(doc.nodes, doc.edges);
  assert.ok(back.size >= 1, 'the fix goes back to "Write code"');
  const laid = autoLayout(doc.nodes, doc.edges);
  for (const id of back) { const e = doc.edges.find((x) => x.id === id); assert.ok(laid.find((n) => n.id === e.to).x <= laid.find((n) => n.id === e.from).x, 'goes back'); }
  const straight = { nodes: [{ id: 'a', type: 'trigger.manual' }, { id: 'b', type: 'logic.template' }], edges: [{ id: 'e', from: 'a', fromPort: 'out', to: 'b' }] };
  assert.equal(backEdges(straight.nodes, straight.edges).size, 0, 'no loop, no back edge');
});

test('auto layout: a long flow wraps into rows shaped like the screen or the paper', () => {
  const doc = buildTemplate('autodev-loop', 'en');
  const box = (laid) => { const xs = laid.map((n) => n.x); const ys = laid.map((n) => n.y); return { w: Math.max(...xs) + NODE_W - Math.min(...xs), h: Math.max(...ys) + 80 - Math.min(...ys), rows: new Set(laid.filter((n) => !n.type.startsWith('note')).map((n) => n.y)).size }; };
  const line = box(autoLayout(doc.nodes, doc.edges));
  const wide = box(autoLayout(doc.nodes, doc.edges, { aspect: SCREEN_ASPECT }));
  const tall = box(autoLayout(doc.nodes, doc.edges, { aspect: 0.7 }));
  assert.ok(line.w / line.h > 6, 'without an aspect: one long row');
  assert.ok(wide.w / wide.h < 3.5 && wide.w / wide.h > 0.8, 'screen-shaped: ' + (wide.w / wide.h).toFixed(2));
  assert.ok(tall.w / tall.h < wide.w / wide.h, 'portrait paper: taller still');
  const short = buildTemplate('translator', 'en');
  assert.deepEqual(autoLayout(short.nodes, short.edges, { aspect: SCREEN_ASPECT }).map((n) => n.y), autoLayout(short.nodes, short.edges).map((n) => n.y), 'a short flow stays one row');
});

test('canvas grid: the step follows the zoom in powers of five and stays readable', () => {
  assert.equal(gridStep(1), 20);
  assert.equal(gridStep(2), 40);
  assert.equal(gridStep(3), 12, '60 px is too sparse: one fifth');
  assert.equal(gridStep(0.4), 40, '8 px is too dense: five times');
  for (let z = 0.2; z <= 3; z += 0.05) { const g = gridStep(z); assert.ok(g >= 9 && g <= 45, `zoom ${z.toFixed(2)} → ${g}`); assert.ok(Math.abs(Math.log(g / (20 * z)) / Math.log(5) % 1) < 1e-9, 'a power of five of the world step'); }
});

// Elbow lines (꺾은 선 / 둥근 꺾은 선): all the lines from one parent to its subtopics turn on one
// shared trunk — a vertical one beside the parent (map, right, left) or a bus under / over it
// (org chart) — also when a subtopic sits a little off (a boundary around it, a summary, moved by
// hand) or a new one is added. The trunk sits at the parent's bend position (topic.bend, a share of
// the gap; 0.5 halfway), which the ◆ handle and Format › Bend position change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMap } from '../src/lib/layout.js';
import { resolveMapStyle } from '../src/lib/mapstyles.js';
import { newMap, addChild, makeTopic, setField, normalizeMap } from '../src/lib/model.js';

const measure = (text, font) => { const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]); return [...String(text)].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x2e80 ? size * 0.98 : size * 0.55), 0); };
const lay = (m) => layoutMap(m, { ms: resolveMapStyle(m, {}), measure });

// Root → Plan (four subtopics: one in a boundary with two of its own, one moved by hand), Build (a summary)
function sample(layout, lineStyle, { bend } = {}) {
  let map = { ...newMap({ title: 'Root', layout }), lineStyle };
  const main = [];
  for (const name of ['Plan', 'Build things', 'Ship']) { const a = addChild(map, map.root.id, makeTopic(name)); map = a.map; main.push(a.id); }
  const kids = [];
  for (const name of ['short', 'a much longer subtopic name', 'mid one', 'x']) { const b = addChild(map, main[0], makeTopic(name)); map = b.map; kids.push(b.id); }
  map = setField(map, [kids[1]], 'boundary', { shape: 'rounded' });
  for (const name of ['one', 'two']) map = addChild(map, kids[2], makeTopic(name)).map;
  for (const name of ['p', 'q', 'r']) map = addChild(map, main[1], makeTopic(name)).map;
  map = setField(map, [main[1]], 'summary', { text: 'sum' });
  map = setField(map, [kids[3]], 'offset', { x: 40, y: 30 });
  if (bend != null) map = setField(map, [main[0]], 'bend', bend);
  return { map, plan: main[0], kids };
}

// where an elbow path turns: the x of its vertical run (map / right / left) or the y of its bus (org)
const turn = (d, axis) => {
  const m = axis === 'x' ? /H(-?[\d.]+)[ ]*(?:Q-?[\d.]+ -?[\d.]+ (-?[\d.]+) -?[\d.]+ )?V/.exec(d) : /V(-?[\d.]+)[ ]*(?:Q-?[\d.]+ -?[\d.]+ -?[\d.]+ (-?[\d.]+) )?H/.exec(d);
  if (!m) return null;
  return m[2] != null ? Number(m[2]) : Number(m[1]);
};

test('every subtopic line of a parent turns on one shared trunk, in every layout and both elbow styles', () => {
  const problems = [];
  let checked = 0;
  for (const [layout, axis] of [['map', 'x'], ['right', 'x'], ['left', 'x'], ['orgDown', 'y'], ['orgUp', 'y']]) {
    for (const style of ['elbow', 'rounded']) {
      const { map } = sample(layout, style);
      const L = lay(map);
      for (const n of L.nodes.values()) {
        if (n.kids.length < 2 || !['map', 'right', 'left', 'down', 'up'].includes(n.dir)) continue;
        // the subtopics on each side of the parent, and where each one's line turns
        const centre = axis === 'x' ? n.x + n.w / 2 : n.y + n.h / 2;
        const sides = {};
        for (const k of n.kids) {
          const line = L.lines.find((l) => l.id === k.id);
          const v = line && turn(line.d, axis);
          if (v == null) continue;
          (sides[v > centre ? 'after' : 'before'] = sides[v > centre ? 'after' : 'before'] || []).push(v);
        }
        for (const [side, vs] of Object.entries(sides)) {
          if (vs.length < 2) continue;
          checked++;
          if (Math.max(...vs) - Math.min(...vs) > 0.6) problems.push(`${layout}/${style} "${n.topic.text}" ${side}: turns at ${vs.join(', ')}`);
        }
      }
    }
  }
  assert.ok(checked >= 20, `groups of sibling lines checked: ${checked}`);
  assert.deepEqual(problems, []);
});

test('the trunk sits at the parent\'s bend: halfway by default, 5 – 95 % of the gap when set', () => {
  for (const [layout, side] of [['right', 'right'], ['orgDown', 'down']]) {
    const plain = lay(sample(layout, 'elbow').map);
    const p0 = [...plain.nodes.values()].find((n) => n.topic.text === 'Plan');
    const t0 = p0.trunks[side];
    assert.ok(Math.abs(t0.at - (t0.edge + t0.sign * t0.gap * 0.5)) < 0.01, `${layout}: halfway`);
    for (const bend of [0.2, 0.8]) {
      const L = lay(sample(layout, 'elbow', { bend }).map);
      const p = [...L.nodes.values()].find((n) => n.topic.text === 'Plan');
      const t = p.trunks[side];
      assert.ok(Math.abs(t.at - (t.edge + t.sign * t.gap * bend)) < 0.01, `${layout} bend ${bend}: trunk at ${t.at}`);
      for (const k of p.kids) assert.ok(Math.abs(turn(L.lines.find((l) => l.id === k.id).d, t.axis) - t.at) < 0.6, `${layout} bend ${bend}: "${k.topic.text}" turns on it`);
    }
  }
});

test('curved and straight lines have no trunk; a bend outside 0 – 1 is dropped when a map is read', () => {
  for (const style of ['curve', 'straight']) {
    const L = lay(sample('right', style, { bend: 0.3 }).map);
    assert.ok([...L.nodes.values()].every((n) => !n.trunks), `${style}: no trunk`);
  }
  for (const bad of [0, 1, 7, -0.2, 'x']) {
    const m = normalizeMap({ root: { text: 'R', bend: bad, children: [] } });
    assert.equal('bend' in m.root, false, `bend ${bad}`);
  }
  assert.equal(normalizeMap({ root: { text: 'R', bend: 0.3, children: [] } }).root.bend, 0.3);
});

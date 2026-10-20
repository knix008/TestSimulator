// Format › Subtopic layout: in every map layout, each of the six subtopic layouts set on a main
// topic or a subtopic lays that branch out the way its button says, without topics overlapping; on
// the central topic the same buttons choose the map's layout. A fishbone cause with a layout of its
// own keeps a bone that reaches the spine without crossing its subtopics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMap } from '../src/lib/layout.js';
import { resolveMapStyle } from '../src/lib/mapstyles.js';
import { mapFromSample } from '../src/lib/samples.js';
import { SUB_LAYOUTS } from '../src/lib/model.js';
import { pathPoints } from '../src/lib/pathpoints.js';

const measure = (text, font) => { const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]); return [...String(text)].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x2e80 ? size * 0.98 : size * 0.55), 0); };
const LAYOUTS = ['map', 'right', 'left', 'orgDown', 'orgUp', 'treeRight', 'treeLeft', 'timeline', 'fishbone'];
const MAP_OF_SUB = { right: 'right', left: 'left', down: 'orgDown', up: 'orgUp', treeRight: 'treeRight', treeLeft: 'treeLeft' };
const box = (n) => ({ x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h });
const hit = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
const lay = (m) => layoutMap(m, { ms: resolveMapStyle(m, {}), measure });

// where a topic's children sit: R / L / B / A (right of, left of, below, above it), col (one
// column: left, centre or right edges lined up) and row (one row)
function shape(L, id) {
  const p = L.nodes.get(id);
  const kids = p.kids;
  const cx = (n) => n.x + n.w / 2, cy = (n) => n.y + n.h / 2;
  const right = kids.every((k) => k.x >= p.x + p.w - 2), left = kids.every((k) => k.x + k.w <= p.x + 2);
  const below = kids.every((k) => k.y >= p.y + p.h - 2), above = kids.every((k) => k.y + k.h <= p.y + 2);
  const col = kids.every((k) => Math.abs(cx(k) - cx(kids[0])) < 14 || Math.abs(k.x - kids[0].x) < 14 || Math.abs(k.x + k.w - kids[0].x - kids[0].w) < 14);
  const row = kids.every((k) => Math.abs(cy(k) - cy(kids[0])) < 34 || Math.abs(k.y - kids[0].y) < 34);
  return [right && 'R', left && 'L', below && 'B', above && 'A', col && 'col', row && 'row'].filter(Boolean).join('');
}
const WANT = { right: /R.*col/, left: /L.*col/, down: /B.*row/, up: /A.*row/, treeRight: /B.*col/, treeLeft: /B.*col/ };

test('every subtopic layout works on the central topic, a main topic and a subtopic, in every map layout', () => {
  const problems = [];
  for (const layout of LAYOUTS) {
    const base = mapFromSample('software-arch', 'ko');
    base.layout = layout;
    const branch = base.root.children[0];
    const subTopic = base.root.children.flatMap((c) => c.children).find((g) => g.children && g.children.length);
    for (const [what, id] of [['central topic', base.root.id], ['main topic', branch.id], ['subtopic', subTopic && subTopic.id]]) {
      if (!id) continue;
      for (const sl of SUB_LAYOUTS) {
        const m = structuredClone(base);
        if (what === 'central topic') m.layout = MAP_OF_SUB[sl];
        else { const walk = (t) => { if (t.id === id) t.layout = sl; (t.children || []).forEach(walk); }; walk(m.root); }
        const L = lay(m);
        const s = shape(L, id);
        if (!WANT[sl].test(s)) problems.push(`${layout} / ${what} / ${sl}: children ${s}`);
        const nodes = [...L.nodes.values()];
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
          if (hit(box(nodes[i]), box(nodes[j]))) problems.push(`${layout} / ${what} / ${sl}: "${nodes[i].topic.text}" overlaps "${nodes[j].topic.text}"`);
        }
      }
    }
  }
  assert.deepEqual(problems.slice(0, 10), []);
});

test('a fishbone cause with its own subtopic layout: its bone reaches the spine and crosses none of its subtopics', () => {
  for (const sl of SUB_LAYOUTS) {
    for (const i of [0, 1]) {   // a cause above the spine, one below it
      const m = mapFromSample('software-arch', 'ko');
      m.layout = 'fishbone';
      m.root.children[i].layout = sl;
      const L = lay(m);
      const n = L.nodes.get(m.root.children[i].id);
      const root = L.nodes.get(m.root.id);
      const spineY = root.y + root.h / 2;
      const line = L.lines.find((x) => x.id === n.id);
      const pts = pathPoints(line.d).map(([x, y]) => ({ x, y }));
      const last = pts[pts.length - 1];
      assert.ok(Math.abs(last.y - spineY) < 1, `${sl} #${i}: the bone ends at y ${last.y}, the spine is at ${spineY}`);
      // the bone starts on the cause
      assert.ok(pts[0].x >= n.x - 1 && pts[0].x <= n.x + n.w + 1 && pts[0].y >= n.y - 1 && pts[0].y <= n.y + n.h + 1, `${sl} #${i}: the bone starts off the cause`);
      // sample the bone: it passes through none of the cause's subtopics
      const kids = [];
      const walk = (k) => { kids.push(k); k.kids.forEach(walk); };
      n.kids.forEach(walk);
      for (let s = 1; s < pts.length; s++) {
        for (let t = 0; t <= 20; t++) {
          const x = pts[s - 1].x + (pts[s].x - pts[s - 1].x) * t / 20, y = pts[s - 1].y + (pts[s].y - pts[s - 1].y) * t / 20;
          for (const k of kids) assert.ok(!(x > k.x + 1 && x < k.x + k.w - 1 && y > k.y + 1 && y < k.y + k.h - 1), `${sl} #${i}: the bone crosses "${k.topic.text}"`);
        }
      }
    }
  }
});

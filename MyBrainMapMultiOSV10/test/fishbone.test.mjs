// Fishbone lines are always straight: the bones, the sub-cause lines and the lines of the topics
// under them — on the sample map (causes, sub-causes and a third level of "whys"), in every line
// style, and with any topic moved anywhere by hand. A moved cause keeps the slant of the other
// bones and runs straight on to the spine; its sub-causes still meet that bone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMap } from '../src/lib/layout.js';
import { resolveMapStyle, LINE_STYLES } from '../src/lib/mapstyles.js';
import { mapFromSample } from '../src/lib/samples.js';
import { pathPoints } from '../src/lib/pathpoints.js';

const measure = (text, font) => { const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]); return [...String(text)].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x2e80 ? size * 0.98 : size * 0.55), 0); };
const lay = (m) => layoutMap(m, { ms: resolveMapStyle(m, {}), measure });
const MOVES = [[90, 70], [-110, -80], [0, 160], [180, 0], [-200, 40], [60, -300], [-40, 25]];

// distance from point q to the segment a–b
function toSegment(q, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len)) : 0;
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}
const near = (q, n, pad) => q.x >= n.x - pad && q.x <= n.x + n.w + pad && q.y >= n.y - pad && q.y <= n.y + n.h + pad;

function problemsOf(L, rootId, tag) {
  const out = [];
  const root = L.nodes.get(rootId);
  const spineY = root.y + root.h / 2;
  const spine = pathPoints(L.extras.find((e) => e.id === `spine-${rootId}`).d).map(([x, y]) => ({ x, y }));
  const spineX0 = Math.min(...spine.map((q) => q.x));
  for (const line of L.lines) {
    const n = L.nodes.get(line.id);
    if (!n || n.kind !== 'child') continue;
    const name = `${tag} "${n.topic.text}"`;
    if (/[CQHVAZ]/i.test(line.d.replace(/^M/, ''))) { out.push(`${name}: not straight: ${line.d}`); continue; }
    const pts = pathPoints(line.d).map(([x, y]) => ({ x, y }));
    if (pts.length !== 2) { out.push(`${name}: ${pts.length - 1} segments: ${line.d}`); continue; }
    const [a, b] = pts;
    const p = n.parent;
    if (p.dir === 'fishbone') {
      if (!near(a, n, 1)) out.push(`${name}: the bone starts off the cause`);
      if (Math.abs(b.y - spineY) > 0.6) out.push(`${name}: the bone ends at y ${b.y}, the spine is at ${spineY}`);
      if (b.x < spineX0 - 0.6) out.push(`${name}: the bone meets the spine past its tail`);
      // still on its own side of the spine: the slant of the other bones
      if (n.fishTop ? n.y + n.h <= spineY : n.y >= spineY) {
        const slant = Math.abs((b.x - a.x) / (b.y - a.y));
        if (Math.abs(slant - 0.62) > 0.02) out.push(`${name}: slant ${slant.toFixed(2)}`);
      }
    } else if (p.dir === 'fishTop' || p.dir === 'fishBottom') {
      if (!near(a, n, 1)) out.push(`${name}: the line starts off the sub-cause`);
      if (toSegment(b, p.bone.a, p.bone.e) > 0.6) out.push(`${name}: the line ends off its cause's bone`);
    } else {
      if (!near(a, p, 1) && !near(b, p, 1)) out.push(`${name}: off its parent`);
      if (!near(a, n, 1) && !near(b, n, 1)) out.push(`${name}: off the topic`);
    }
  }
  return out;
}

const ids = (t, out = []) => { for (const c of t.children || []) { out.push(c.id); ids(c, out); } return out; };
const find = (t, id) => (t.id === id ? t : (t.children || []).map((c) => find(c, id)).find(Boolean));

test('the fishbone sample has causes, sub-causes and a third level, and nothing overlaps', () => {
  for (const lang of ['ko', 'en']) {
    const m = mapFromSample('churn-fishbone', lang);
    assert.equal(m.layout, 'fishbone');
    assert.ok(m.root.children.length >= 8, 'at least eight causes');
    assert.ok(m.root.children.every((c) => c.children.length >= 2), 'each cause has sub-causes');
    assert.ok(m.root.children.flatMap((c) => c.children).filter((s) => s.children.length).length >= 8, 'many sub-causes have whys of their own');
    const L = lay(m);
    const nodes = [...L.nodes.values()];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      assert.ok(!(a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1), `${lang}: "${a.topic.text}" overlaps "${b.topic.text}"`);
    }
  }
});

test('every fishbone line is one straight segment, in every line style, unmoved', () => {
  const problems = [];
  for (const lang of ['ko', 'en']) {
    for (const lineStyle of LINE_STYLES) {
      const m = { ...mapFromSample('churn-fishbone', lang), lineStyle };
      problems.push(...problemsOf(lay(m), m.root.id, `${lang}/${lineStyle}`));
    }
  }
  assert.deepEqual(problems.slice(0, 10), []);
});

test('with any topic moved anywhere, every fishbone line stays one straight segment and joined', () => {
  const problems = [];
  for (const lineStyle of LINE_STYLES) {
    const base = { ...mapFromSample('churn-fishbone', 'ko'), lineStyle };
    for (const id of ids(base.root)) {
      for (const [dx, dy] of MOVES) {
        const m = structuredClone(base);
        find(m.root, id).offset = { x: dx, y: dy };
        problems.push(...problemsOf(lay(m), m.root.id, `${lineStyle} ${dx},${dy}`));
      }
    }
  }
  assert.deepEqual(problems.slice(0, 10), []);
});

test('a moved cause keeps the slant of the other bones; its sub-causes meet the moved bone', () => {
  const m = mapFromSample('churn-fishbone', 'en');
  const cause = m.root.children[2];
  cause.offset = { x: -150, y: -60 };
  const L = lay(m);
  const n = L.nodes.get(cause.id);
  const [a, b] = pathPoints(L.lines.find((l) => l.id === cause.id).d).map(([x, y]) => ({ x, y }));
  assert.ok(Math.abs(Math.abs((b.x - a.x) / (b.y - a.y)) - 0.62) < 0.01, 'same slant');
  for (const k of n.kids) {
    const [, e] = pathPoints(L.lines.find((l) => l.id === k.id).d).map(([x, y]) => ({ x, y }));
    assert.ok(toSegment(e, a, b) < 0.6, `"${k.topic.text}" meets the bone`);
    assert.ok(Math.abs(e.y - (k.y + k.h / 2)) < 2, `"${k.topic.text}": its line is level`);
  }
  // the spine reaches the moved bone
  const root = L.nodes.get(m.root.id);
  const spine = pathPoints(L.extras.find((e) => e.id === `spine-${root.id}`).d);
  assert.ok(Math.min(...spine.map((q) => q[0])) <= b.x + 0.6);
});

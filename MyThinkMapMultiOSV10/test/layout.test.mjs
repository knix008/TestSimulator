// Layout: every layout places every visible topic without overlaps, the
// central topic is centred on (0, 0), collapsed and filtered branches are
// left out, and the SVG renderer draws what was laid out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMap, makeTopic, addChild, addCallout, addFloating, setCollapsed, LAYOUTS, addRelationship } from '../src/lib/model.js';
import { layoutMap, wrapText } from '../src/lib/layout.js';
import { resolveMapStyle, MAP_STYLES } from '../src/lib/mapstyles.js';
import { renderMapSvg } from '../src/lib/render.js';
import { TEMPLATES, mapFromTemplate } from '../src/lib/templates.js';
import { SAMPLES, mapFromSample } from '../src/lib/samples.js';

const measure = (text, font) => { const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]); return [...String(text)].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.56), 0); };

function bigMap(layout) {
  let map = newMap({ title: 'Central topic', layout });
  for (let i = 0; i < 5; i++) {
    const m = addChild(map, map.root.id, makeTopic(`Main topic ${i}`)); map = m.map;
    for (let j = 0; j < 3; j++) {
      const s = addChild(map, m.id, makeTopic(`Sub ${i}.${j} with some longer text`)); map = s.map;
      if (j === 1) map = addChild(map, s.id, makeTopic('leaf')).map;
    }
  }
  return map;
}

const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

for (const layout of LAYOUTS) {
  test(`layout ${layout}: all topics placed, none overlapping`, () => {
    const map = bigMap(layout);
    const ms = resolveMapStyle(map, {});
    const L = layoutMap(map, { ms, measure });
    assert.equal(L.nodes.size, 1 + 5 * 4 + 5);
    const root = L.nodes.get(map.root.id);
    assert.ok(Math.abs(root.x + root.w / 2) < 1 && Math.abs(root.y + root.h / 2) < 1, 'the central topic is centred');
    const list = [...L.nodes.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        assert.ok(!overlap(list[i], list[j]), `${list[i].topic.text} overlaps ${list[j].topic.text}`);
      }
    }
    for (const n of list) {
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && n.w > 0 && n.h > 0);
    }
    const lines = L.lines.filter((l) => l.kind !== 'callout');
    if (layout !== 'timeline') assert.equal(lines.length, list.length - 1, 'a line to every topic but the central one');
  });
}

test('every layout copes with childless and collapsed main topics', () => {
  for (const layout of LAYOUTS) {
    let map = bigMap(layout);
    map = addChild(map, map.root.id, makeTopic('lonely')).map;
    map = setCollapsed(map, [map.root.children[0].id], true);
    const L = layoutMap(map, { ms: resolveMapStyle(map, {}), measure });
    for (const n of L.nodes.values()) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${layout}: ${n.topic.text}`);
    assert.ok(!L.lines.some((l) => /NaN|undefined/.test(l.d)), layout);
  }
});

test('collapsed and filtered branches are not laid out', () => {
  let map = bigMap('map');
  const first = map.root.children[0];
  map = setCollapsed(map, [first.id], true);
  const ms = resolveMapStyle(map, {});
  let L = layoutMap(map, { ms, measure });
  assert.equal(L.nodes.size, 1 + 5 * 4 + 5 - 4);
  assert.equal(L.nodes.get(first.id).fold.collapsed, true);
  const hidden = new Set([map.root.children[1].id]);
  L = layoutMap(map, { ms, measure, hidden });
  assert.ok(!L.nodes.has(map.root.children[1].id));
});

test('callouts sit above their topic, floating topics where they were put', () => {
  let map = bigMap('right');
  const t = map.root.children[0];
  const c = addCallout(map, t.id, makeTopic('callout')); map = c.map;
  const f = addFloating(map, makeTopic('floating'), 600, -300); map = f.map;
  const L = layoutMap(map, { ms: resolveMapStyle(map, {}), measure });
  const tn = L.nodes.get(t.id), cn = L.nodes.get(c.id), fn = L.nodes.get(f.id);
  assert.ok(cn.y + cn.h <= tn.y, 'callout above');
  assert.ok(Math.abs(fn.x + fn.w / 2 - 600) < 1 && Math.abs(fn.y + fn.h / 2 + 300) < 1);
});

test('words wrap at the width, long words break', () => {
  const lines = wrapText('alpha beta gamma delta', 60, '400 10px x', measure);
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.ok(l.w <= 60.01, l.text);
  const long = wrapText('x'.repeat(50), 56, '400 10px x', measure);
  assert.ok(long.length >= 5);
});

test('every sample map lays out without overlaps and renders, in both languages', () => {
  for (const s of SAMPLES) {
    for (const lang of ['ko', 'en']) {
      const map = mapFromSample(s.id, lang);
      assert.ok(map.root.children.length >= 3, `${s.id}: main topics`);
      const ms = resolveMapStyle(map, {});
      const L = layoutMap(map, { ms, measure, lang });
      const list = [...L.nodes.values()];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          assert.ok(!overlap(list[i], list[j]), `${s.id}/${lang}: ${list[i].topic.text} overlaps ${list[j].topic.text}`);
        }
      }
      const { svg } = renderMapSvg(map, L, ms, { measure });
      assert.ok(!/NaN|undefined/.test(svg), `${s.id}/${lang}`);
    }
  }
  assert.ok(SAMPLES.length >= 15);
  assert.equal(new Set(SAMPLES.map((s) => s.id)).size, SAMPLES.length);
});

test('every map style and template renders to SVG', () => {
  for (const tpl of TEMPLATES) {
    for (const lang of ['ko', 'en']) {
      for (const st of MAP_STYLES) {
        let map = mapFromTemplate(tpl.id, lang);
        map = { ...map, style: st.id };
        if (map.root.children.length > 1) map = addRelationship(map, map.root.children[0].id, map.root.children[1].id, { label: 'rel' }).map;
        const ms = resolveMapStyle(map, {});
        const L = layoutMap(map, { ms, measure, lang });
        const { svg, width, height } = renderMapSvg(map, L, ms, { measure });
        assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
        assert.ok(width > 50 && height > 30);
        assert.ok(!/NaN|undefined/.test(svg), `${tpl.id}/${st.id}: ${(/.{40}(NaN|undefined).{40}/.exec(svg) || [''])[0]}`);
      }
    }
  }
});

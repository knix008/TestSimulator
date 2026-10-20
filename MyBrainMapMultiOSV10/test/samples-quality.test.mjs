// Every sample map and template, in both languages, opens tidy: no two topics
// overlap, no relationship runs across a topic it does not connect, no
// relationship label covers a topic, and the relationship curves stay inside
// the map's bounds (so "fit", "center" and the exports show all of them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMap, relationshipGeometry } from '../src/lib/layout.js';
import { resolveMapStyle } from '../src/lib/mapstyles.js';
import { SAMPLES, mapFromSample } from '../src/lib/samples.js';
import { TEMPLATES, mapFromTemplate } from '../src/lib/templates.js';

// close to the browser's text widths (Malgun Gothic / Segoe UI)
const measure = (text, font) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
  const bold = /\b(600|700|bold)\b/.test(font);
  return [...String(text)].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x2e80 ? size * 0.98 : /[A-Z]/.test(ch) ? size * 0.66 : /[ il.,:;'|]/.test(ch) ? size * 0.3 : size * 0.55) * (bold ? 1.05 : 1), 0);
};
const overlap = (a, b, pad = 0) => a.x0 < b.x1 - pad && b.x0 < a.x1 - pad && a.y0 < b.y1 - pad && b.y0 < a.y1 - pad;
const box = (n) => ({ x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h });

const maps = [];
for (const lang of ['ko', 'en']) {
  for (const s of SAMPLES) maps.push([`sample ${s.id} (${lang})`, () => mapFromSample(s.id, lang)]);
  for (const t of TEMPLATES) maps.push([`template ${t.id} (${lang})`, () => mapFromTemplate(t.id, lang)]);
}

test('samples and templates open tidy: no overlaps, relationships clear of other topics', () => {
  const problems = [];
  for (const [name, make] of maps) {
    const map = make();
    const L = layoutMap(map, { ms: resolveMapStyle(map, {}), measure });
    const nodes = [...L.nodes.values()];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (overlap(box(nodes[i]), box(nodes[j]), 1)) problems.push(`${name}: "${nodes[i].topic.text}" overlaps "${nodes[j].topic.text}"`);
    }
    for (const rel of map.relationships || []) {
      const a = L.nodes.get(rel.from), b = L.nodes.get(rel.to);
      if (!a || !b) continue;
      const g = relationshipGeometry(rel, a, b, L.relBends);
      for (let i = 1; i < 20; i++) {
        const pt = g.at(i / 20);
        for (const n of nodes) if (n !== a && n !== b && pt.x > n.x + 2 && pt.x < n.x + n.w - 2 && pt.y > n.y + 2 && pt.y < n.y + n.h - 2) problems.push(`${name}: a relationship crosses "${n.topic.text}"`);
        const B = L.bounds;
        if (pt.x < B.x0 || pt.x > B.x1 || pt.y < B.y0 || pt.y > B.y1) problems.push(`${name}: a relationship leaves the map bounds`);
      }
      if (rel.label) {
        const tw = measure(rel.label, '600 12px x') + 12;
        const lb = { x0: g.mid.x - tw / 2, y0: g.mid.y - 10, x1: g.mid.x + tw / 2, y1: g.mid.y + 10 };
        for (const n of nodes) if (overlap(lb, box(n), 1)) problems.push(`${name}: the label "${rel.label}" covers "${n.topic.text}"`);
      }
    }
  }
  assert.deepEqual([...new Set(problems)].slice(0, 12), []);
  assert.ok(maps.length >= 60, `${maps.length} maps`);
});

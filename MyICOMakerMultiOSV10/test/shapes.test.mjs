import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SHAPE_IDS, SHAPES, SHAPE_CATEGORIES, SOLIDS, regular, scalePath, shapePath, shapesIn, star } from '../src/lib/shapes.js';
import { GLYPHS, glyph, shapeGlyph } from '../src/icons/glyphs.js';

/** Every coordinate (not arc radii or flags) of an absolute path. */
function points(d) {
  const tokens = d.match(/[MLHVCSQTAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  const xs = []; const ys = [];
  let cmd = ''; let i = 0;
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[A-Z]$/i.test(tokens[i])) { cmd = tokens[i++].toUpperCase(); if (cmd === 'Z') continue; }
    if (cmd === 'H') xs.push(n());
    else if (cmd === 'V') ys.push(n());
    else if (cmd === 'A') { n(); n(); n(); n(); n(); xs.push(n()); ys.push(n()); }
    else { xs.push(n()); ys.push(n()); }
  }
  return { xs, ys };
}

test('there are more than 90 shapes in six categories', () => {
  assert.ok(ALL_SHAPE_IDS.length >= 90, `only ${ALL_SHAPE_IDS.length}`);
  assert.equal(new Set(ALL_SHAPE_IDS).size, ALL_SHAPE_IDS.length, 'ids are unique');
  assert.deepEqual(SHAPE_CATEGORIES.map((c) => c.id), ['basic', 'stars', 'arrows', 'symbols', 'callouts', 'solids']);
  for (const c of SHAPE_CATEGORIES) assert.ok(shapesIn(c.id).length >= 8, `${c.id} has ${shapesIn(c.id).length}`);
  assert.equal(shapesIn('solids'), SOLIDS);
});

test('every flat shape stays inside its unit box', () => {
  for (const shape of SHAPES) {
    const { xs, ys } = points(shape.d);
    assert.ok(xs.length && ys.length, `${shape.id} has points`);
    for (const v of [...xs, ...ys]) {
      assert.ok(Number.isFinite(v), `${shape.id}: ${v}`);
      assert.ok(v >= -0.5 && v <= 100.5, `${shape.id}: coordinate ${v} outside the box`);
    }
    assert.ok(['nonzero', 'evenodd'].includes(shape.rule));
  }
});

test('scalePath maps the unit box onto the object box', () => {
  assert.equal(scalePath('M0 0 L100 100 H50 V25 Z', 10, 20, 200, 100), 'M 10 20 L 210 120 H 110 V 45 Z');
  // Arc radii scale with the axes, flags stay.
  assert.equal(scalePath('M0 50 A50 50 0 1 1 100 50', 0, 0, 200, 100), 'M 0 50 A 100 50 0 1 1 200 50');
  // A mirrored box flips the arc direction.
  assert.equal(scalePath('M0 50 A50 50 0 0 1 100 50', 100, 0, -100, 100), 'M 100 50 A 50 50 0 0 0 0 50');
  assert.equal(shapePath('nope', 0, 0, 10, 10), '');
  assert.match(shapePath('heart', 0, 0, 512, 512), /^M 256 512 C/);
});

test('regular polygons and stars have the right number of corners', () => {
  assert.equal((regular(6).match(/L/g) ?? []).length, 5);
  assert.equal((star(5, 0.4).match(/L/g) ?? []).length, 9);
});

test('every shape and solid has a coloured button icon', () => {
  for (const id of ALL_SHAPE_IDS) {
    const svg = shapeGlyph(id);
    assert.ok(svg.length > 20, id);
    assert.match(svg, /fill="(#|url)/, `${id} is coloured`);
  }
});

test('every named icon is coloured, and unknown names get a fallback', () => {
  for (const [name, svg] of Object.entries(GLYPHS)) {
    assert.match(svg, /#[0-9a-f]{3,6}|url\(#/i, `${name} has colours`);
  }
  assert.equal(glyph('no-such-icon'), GLYPHS.question);
  assert.equal(glyph('shape:star'), shapeGlyph('star'));
});

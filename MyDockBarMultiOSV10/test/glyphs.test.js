'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { loadRenderer } = require('./helpers/renderer');

const { DockGlyphs } = loadRenderer(['src/renderer/js/glyphs.js']);

/** The SVG source behind a glyph's data URL. */
function svgOf(key) {
  const url = DockGlyphs.get(key);
  const comma = url.indexOf(',');
  return decodeURIComponent(url.slice(comma + 1));
}

/** Every colour the drawing paints with, ignoring the background plate. */
function drawingColours(key) {
  const svg = svgOf(key);
  // The plate is the two full-size rounded rects at the top; everything after
  // them is the picture itself.
  const picture = svg.slice(svg.lastIndexOf('fill="url(#gloss)"/>'));
  return new Set((picture.match(/#[0-9a-f]{6}/gi) || []).map((c) => c.toLowerCase()));
}

/** The stops of one named gradient. */
function gradientStops(svg, id) {
  const start = svg.indexOf(`<linearGradient id="${id}"`);
  assert.ok(start >= 0, `no gradient called ${id}`);
  const body = svg.slice(start, svg.indexOf('</linearGradient>', start));
  return (body.match(/stop-color="#[0-9a-f]{6}"/gi) || []).map((s) => s.toLowerCase());
}

/** The stops of the gradient filling the background plate. */
function plateStops(key) {
  const svg = svgOf(key);
  const match = /<rect x="10" y="10"[^>]*fill="url\(#([^)]+)\)"/.exec(svg);
  assert.ok(match, `${key} has no background plate`);
  return gradientStops(svg, match[1]);
}

describe('the built-in glyphs', () => {
  it('are all data URLs holding an SVG', () => {
    for (const [name, url] of Object.entries(DockGlyphs.all)) {
      assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'), `${name} is not an SVG data URL`);
      const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
      assert.ok(svg.startsWith('<svg '), `${name} does not start with <svg>`);
      assert.ok(svg.trimEnd().endsWith('</svg>'), `${name} does not end with </svg>`);
    }
  });

  it('give every gradient its own id, so one glyph cannot borrow another\'s', () => {
    const seen = new Map();
    for (const [name, url] of Object.entries(DockGlyphs.all)) {
      const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
      for (const match of svg.matchAll(/<linearGradient id="([^"]+)"/g)) {
        const id = match[1];
        if (id === 'gloss') continue;   // the shared highlight, one per document
        assert.ok(!seen.has(id) || seen.get(id) === name,
          `gradient "${id}" is used by both ${seen.get(id)} and ${name}`);
        seen.set(id, name);
      }
    }
  });

  it('refers only to gradients the same document defines', () => {
    for (const [name, url] of Object.entries(DockGlyphs.all)) {
      const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
      const defined = new Set([...svg.matchAll(/<(?:linearGradient|filter) id="([^"]+)"/g)].map((m) => m[1]));
      for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) {
        assert.ok(defined.has(match[1]), `${name} refers to #${match[1]}, which it never defines`);
      }
    }
  });
});

describe('the Trash, empty and full', () => {
  it('has a different picture for each state', () => {
    assert.notStrictEqual(DockGlyphs.get('system:trash'), DockGlyphs.get('system:trash-full'));
  });

  it('leaves the background alone - the state is in the drawing', () => {
    // Asked for explicitly: a themed or tinted plate must not be what tells
    // the two apart, so both faces sit on exactly the same background.
    assert.deepStrictEqual(plateStops('system:trash'), plateStops('system:trash-full'));
  });

  it('draws the two bins in different colours', () => {
    const empty = drawingColours('system:trash');
    const full = drawingColours('system:trash-full');

    assert.ok(empty.size > 0 && full.size > 0, 'a bin was drawn with no colour at all');
    for (const colour of empty) {
      assert.ok(!full.has(colour), `both bins are drawn with ${colour}`);
    }
  });

  it('gives the full bin a warm cast and the empty one a cool cast', () => {
    // Hue carries the state at icon sizes where the shape no longer reads.
    const warmth = (colours) => {
      let total = 0;
      for (const colour of colours) {
        const r = parseInt(colour.slice(1, 3), 16);
        const b = parseInt(colour.slice(5, 7), 16);
        total += r - b;
      }
      return total / colours.size;
    };

    assert.ok(warmth(drawingColours('system:trash')) < 0, 'the empty bin is not cool');
    assert.ok(warmth(drawingColours('system:trash-full')) > 40, 'the full bin is not warm');
  });

  it('draws the full bin solid and the empty one see-through', () => {
    assert.ok(/fill-opacity="\.1\d"/.test(svgOf('system:trash')), 'the empty bin is not see-through');
    assert.ok(!/fill-opacity="\.1\d"/.test(svgOf('system:trash-full')), 'the full bin is see-through');
  });

  it('tips the full bin\'s lid off and leaves the empty one\'s shut', () => {
    assert.ok(/rotate\(-\d+ /.test(svgOf('system:trash-full')), 'the full bin\'s lid is not askew');
    assert.ok(!/rotate\(/.test(svgOf('system:trash')), 'the empty bin\'s lid is askew');
  });
});

describe('picking an image for an item', () => {
  it('prefers an icon that was resolved for the item', () => {
    const url = 'file:///tmp/chosen.png';
    assert.strictEqual(DockGlyphs.forItem({ path: 'system:trash', iconUrl: url }), url);
  });

  it('falls back to the glyph named by the item\'s path', () => {
    assert.strictEqual(DockGlyphs.forItem({ path: 'dock:settings' }), DockGlyphs.all['dock:settings']);
  });

  it('falls back by type when the path is unknown', () => {
    assert.strictEqual(DockGlyphs.forItem({ path: 'C:/x', type: 'folder' }), DockGlyphs.all.folder);
    assert.strictEqual(DockGlyphs.forItem({ path: 'https://x', type: 'url' }), DockGlyphs.all.url);
    assert.strictEqual(DockGlyphs.forItem({ path: 'C:/x', type: 'app' }), DockGlyphs.all.unknown);
  });

  it('never returns nothing, whatever it is asked for', () => {
    assert.strictEqual(DockGlyphs.get('no-such-glyph'), DockGlyphs.all.unknown);
  });
});

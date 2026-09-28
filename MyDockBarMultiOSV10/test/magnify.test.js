'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { loadRenderer } = require('./helpers/renderer');

const { DockMagnify } = loadRenderer(['src/renderer/js/magnify.js']);
const { kernel, mapDistance, layout, peakSpread, bulge, approach } = DockMagnify;

const base = {
  unit: 48,
  gap: 10,
  origin: 100,
  maxZoom: 2,
  zoomRange: 2.5,
  animation: 'parabolic',
};

const sizesOf = (n) => new Array(n).fill(48);

describe('magnification curve', () => {
  it('peaks at the pointer and reaches zero at the edge of the range', () => {
    assert.strictEqual(kernel(0, 'parabolic'), 1);
    assert.strictEqual(kernel(1, 'parabolic'), 0);
    assert.strictEqual(kernel(1.5, 'parabolic'), 0);
    assert.strictEqual(kernel(-1, 'parabolic'), 0);
  });

  it('falls off monotonically between the two', () => {
    let previous = kernel(0, 'parabolic');
    for (let t = 0.1; t <= 1; t += 0.1) {
      const value = kernel(t, 'parabolic');
      assert.ok(value <= previous, `kernel rose at t=${t.toFixed(1)}`);
      previous = value;
    }
  });

  it('is symmetric about the pointer', () => {
    for (const t of [0.2, 0.5, 0.9]) {
      assert.strictEqual(kernel(t, 'parabolic'), kernel(-t, 'parabolic'));
    }
  });

  it('supports every curve the settings offer', () => {
    for (const mode of ['parabolic', 'cosine', 'linear']) {
      assert.strictEqual(kernel(0, mode), 1, `${mode} should peak at 1`);
      assert.ok(kernel(1, mode) < 1e-9, `${mode} should vanish at the edge`);
    }
    assert.strictEqual(kernel(0, 'none'), 0, '"none" disables magnification entirely');
  });
});

describe('dock layout', () => {
  it('leaves every icon at rest when the pointer is away', () => {
    const result = layout({ ...base, sizes: sizesOf(5), cursor: null });
    assert.deepStrictEqual(result.scales, [1, 1, 1, 1, 1]);
    assert.strictEqual(result.starts[0], base.origin);
  });

  it('computes the resting length from sizes and gaps', () => {
    const result = layout({ ...base, sizes: sizesOf(4), cursor: null });
    assert.strictEqual(result.restLength, 4 * 48 + 3 * 10);
  });

  it('magnifies the icon under the pointer the most', () => {
    const sizes = sizesOf(7);
    const centreOfThird = base.origin + 2 * (48 + 10) + 24;
    const { scales } = layout({ ...base, sizes, cursor: centreOfThird });

    const peak = scales.indexOf(Math.max(...scales));
    assert.strictEqual(peak, 2);
    assert.ok(Math.abs(scales[2] - base.maxZoom) < 1e-9, 'the hovered icon reaches maxZoom');
  });

  it('never scales an icon beyond maxZoom or below 1', () => {
    const sizes = sizesOf(9);
    for (let cursor = 60; cursor < 700; cursor += 7) {
      const { scales } = layout({ ...base, sizes, cursor });
      for (const scale of scales) {
        assert.ok(scale >= 1 - 1e-9 && scale <= base.maxZoom + 1e-9, `scale ${scale} out of range`);
      }
    }
  });

  it('keeps the hovered icon under the pointer as its neighbours grow', () => {
    const sizes = sizesOf(9);
    for (const cursor of [180, 240, 305, 410]) {
      const { starts, widths } = layout({ ...base, sizes, cursor });
      const index = starts.findIndex((start, i) => cursor >= start && cursor <= start + widths[i]);
      assert.ok(index >= 0, `pointer at ${cursor} fell between icons`);
    }
  });

  it('grows the row symmetrically about a centred pointer', () => {
    const sizes = sizesOf(9);
    const centre = base.origin + 4 * (48 + 10) + 24;
    const { scales } = layout({ ...base, sizes, cursor: centre });
    for (let i = 1; i <= 4; i += 1) {
      assert.ok(Math.abs(scales[4 - i] - scales[4 + i]) < 1e-9, `asymmetric at offset ${i}`);
    }
  });

  it('handles an empty dock without dividing by zero', () => {
    const result = layout({ ...base, sizes: [], cursor: 200 });
    assert.deepStrictEqual(result.scales, []);
    assert.strictEqual(result.restLength, 0);
  });
});

describe('distance mapping', () => {
  it('is the identity when nothing is magnified', () => {
    const sizes = sizesOf(4);
    assert.strictEqual(mapDistance(0, sizes, sizes, 10), 0);
    assert.strictEqual(mapDistance(58, sizes, sizes, 10), 58);
  });

  it('never moves backwards as the input grows', () => {
    const sizes = sizesOf(6);
    const widths = sizes.map((s, i) => s * (1 + i * 0.1));
    let previous = -Infinity;
    for (let d = 0; d <= 400; d += 11) {
      const mapped = mapDistance(d, sizes, widths, 10);
      assert.ok(mapped >= previous, `mapDistance went backwards at ${d}`);
      previous = mapped;
    }
  });
});

describe('window sizing', () => {
  it('reserves room for the widest possible bulge', () => {
    assert.ok(bulge(48, 2, 2.5) > 0);
    assert.ok(bulge(48, 2.5, 2.5) > bulge(48, 2, 2.5), 'more zoom needs more room');
    assert.ok(bulge(64, 2, 2.5) > bulge(48, 2, 2.5), 'bigger icons need more room');
  });

  it('reserves nothing when magnification is off', () => {
    assert.strictEqual(bulge(48, 1, 2.5), 0);
  });
});

describe('easing', () => {
  it('moves toward the target without overshooting', () => {
    let value = 1;
    for (let i = 0; i < 200; i += 1) value = approach(value, 2, 1 / 60, 24);
    assert.ok(value > 1.99 && value <= 2, `settled at ${value}`);
  });

  it('is frame-rate independent', () => {
    let slow = 1;
    let fast = 1;
    for (let i = 0; i < 30; i += 1) slow = approach(slow, 2, 1 / 30, 24);
    for (let i = 0; i < 60; i += 1) fast = approach(fast, 2, 1 / 60, 24);
    assert.ok(Math.abs(slow - fast) < 0.01, `diverged: ${slow} vs ${fast}`);
  });
});

describe('steady layout', () => {
  const sizes = sizesOf(12);
  const restLength = 12 * 48 + 11 * 10;
  const spread = peakSpread({ ...base, sizes });

  const at = (cursor) => layout({ ...base, sizes, cursor, spread });

  it('measures a spread that depends on how many icons there are', () => {
    const few = peakSpread({ ...base, sizes: sizesOf(1) });
    const many = peakSpread({ ...base, sizes: sizesOf(12) });
    assert.ok(few < many, `one icon (${few}px) should spread less than twelve (${many}px)`);
    assert.ok(many > 0);
  });

  it('keeps the row exactly one length wherever the pointer is', () => {
    const lengths = new Set();
    for (let i = 0; i <= 40; i += 1) {
      const result = at(base.origin + (restLength * i) / 40);
      const last = result.starts.length - 1;
      lengths.add(Math.round((result.starts[last] + result.widths[last]) - result.starts[0]));
    }
    assert.strictEqual(lengths.size, 1, `row length varied: ${[...lengths].join(', ')}`);
  });

  it('never moves the first or last icon', () => {
    const firsts = new Set();
    const lasts = new Set();
    for (let i = 0; i <= 40; i += 1) {
      const result = at(base.origin + (restLength * i) / 40);
      const last = result.starts.length - 1;
      firsts.add(Math.round(result.starts[0]));
      lasts.add(Math.round(result.starts[last] + result.widths[last]));
    }
    assert.strictEqual(firsts.size, 1, 'the first icon drifted');
    assert.strictEqual(lasts.size, 1, 'the last icon drifted');
  });

  it('moves only the icons the pointer is actually over', () => {
    // One small pointer step, the size of a single mouse movement.
    const hot = 5;
    const cursor = base.origin + hot * (48 + 10) + 24;
    const before = at(cursor);
    const after = at(cursor + 4);

    // Not exactly zero: the slack that holds the row at one length is shared
    // evenly across the gaps, so a distant icon takes a sliver of it. That is
    // the deliberate trade for not piling it beside the hovered icon, where it
    // used to double the width of the neighbouring gap. A hundredth of a pixel
    // is far below anything a display can show.
    for (let i = 0; i < sizes.length; i += 1) {
      const moved = Math.abs(after.starts[i] - before.starts[i]);
      if (Math.abs(i - hot) > 3) {
        assert.ok(moved < 0.25, `icon ${i} is ${Math.abs(i - hot)} away but moved ${moved.toFixed(2)}px`);
      }
    }
  });

  it('keeps the gaps even wherever the pointer is', () => {
    // On an end icon half the magnification curve hangs off the row, so far
    // less of the expansion is used and the remainder has to go somewhere. It
    // used to go into the one or two gaps beside that icon, which grew to more
    // than twice their width.
    let widest = 0;
    let narrowest = Infinity;

    for (let k = 0; k < sizes.length; k += 1) {
      const result = at(base.origin + k * (48 + 10) + 24);
      for (let i = 0; i < sizes.length - 1; i += 1) {
        const span = result.starts[i + 1] - (result.starts[i] + result.widths[i]);
        widest = Math.max(widest, span);
        narrowest = Math.min(narrowest, span);
      }
    }

    assert.ok(widest <= base.gap * 1.5,
      `a gap reached ${widest.toFixed(1)}px against a resting ${base.gap}px`);
    assert.ok(narrowest >= base.gap * 0.3,
      `a gap shrank to ${narrowest.toFixed(1)}px against a resting ${base.gap}px`);
  });

  it('still magnifies the icon under the pointer to the full amount', () => {
    const hot = 5;
    const cursor = base.origin + hot * (48 + 10) + 24;
    const { scales } = at(cursor);
    assert.strictEqual(scales.indexOf(Math.max(...scales)), hot);
    assert.ok(Math.abs(scales[hot] - base.maxZoom) < 1e-9, `peaked at ${scales[hot]}`);
  });

  it('collapses back to the resting layout when the spread is zero', () => {
    const resting = layout({ ...base, sizes, cursor: null, spread: 0 });
    assert.deepStrictEqual(resting.scales, new Array(12).fill(1));
    assert.strictEqual(resting.starts[0], base.origin);
  });
});

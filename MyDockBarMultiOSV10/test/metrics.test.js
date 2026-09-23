'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { loadRenderer } = require('./helpers/renderer');
const { defaults } = require('../src/main/config');

const { DockMetrics } = loadRenderer(['src/renderer/js/metrics.js']);
const { crossMetrics, MIN_INSET } = DockMetrics;

/** The settings as they come out of the box, for a dock on the given edge. */
const outOfTheBox = (vertical, over = {}) => {
  const dock = defaults().dock;
  return crossMetrics({
    iconSize: dock.iconSize,
    padding: dock.padding,
    plateThickness: dock.plateThickness,
    showReflection: dock.showReflection,
    vertical,
    ...over,
  });
};

/** Air above and below an icon (horizontal) or either side of it (vertical). */
const gaps = (m, iconSize) => ({ near: m.anchor, far: m.plate - iconSize - m.anchor });

describe('space around an icon', () => {
  it('leaves air on both sides of a horizontal dock by default', () => {
    const m = outOfTheBox(false);
    const { near, far } = gaps(m, 48);
    assert.ok(near > 0, 'an icon must not be jammed against the top of the background');
    assert.ok(far > 0);
  });

  it('leaves air on both sides of a vertical dock by default', () => {
    // Left and right docks used to get nothing here: with no reflection to pad
    // them out and padding at zero, the icons touched the background edges.
    const m = outOfTheBox(true);
    const { near, far } = gaps(m, 48);
    assert.ok(near >= MIN_INSET, `only ${near}px beside the icon`);
    assert.ok(far >= MIN_INSET, `only ${far}px beside the icon`);
  });

  it('keeps the two gaps equal on every edge', () => {
    for (const vertical of [false, true]) {
      const m = outOfTheBox(vertical);
      const { near, far } = gaps(m, 48);
      assert.strictEqual(near, far, `${vertical ? 'vertical' : 'horizontal'} dock is lopsided`);
    }
  });

  it('keeps them equal once the user adds padding too', () => {
    for (const padding of [0, 4, 12, 30]) {
      for (const vertical of [false, true]) {
        const m = outOfTheBox(vertical, { padding });
        const { near, far } = gaps(m, 48);
        assert.strictEqual(near, far, `padding ${padding} made the dock lopsided`);
      }
    }
  });

  it('keeps them equal when the background height is set by hand', () => {
    const m = outOfTheBox(false, { plateThickness: 90 });
    const { near, far } = gaps(m, 48);
    assert.strictEqual(m.plate, 90);
    assert.strictEqual(near, far);
  });
});

describe('padding on top of the built-in inset', () => {
  it('adds to the inset rather than replacing it', () => {
    const none = outOfTheBox(true, { padding: 0 });
    const some = outOfTheBox(true, { padding: 10 });
    assert.strictEqual(some.plate - none.plate, 20, 'padding applies to both sides');
    assert.strictEqual(some.inset, none.inset, 'the built-in inset is not consumed by padding');
  });

  it('scales the inset with the icons, so big icons are not hemmed in', () => {
    assert.ok(outOfTheBox(true, { iconSize: 128 }).inset
      > outOfTheBox(true, { iconSize: 48 }).inset);
  });

  it('never drops below a visible minimum, however small the icons', () => {
    assert.strictEqual(outOfTheBox(true, { iconSize: 16 }).inset, MIN_INSET);
  });
});

describe('reflections', () => {
  it('are given room on a horizontal dock', () => {
    assert.ok(outOfTheBox(false, { showReflection: true }).reflection > 0);
  });

  it('are given none on a vertical dock, which does not draw them', () => {
    // Reserving it anyway would push the icons off the centre line.
    assert.strictEqual(outOfTheBox(true, { showReflection: true }).reflection, 0);
  });

  it('are given none when switched off', () => {
    assert.strictEqual(outOfTheBox(false, { showReflection: false }).reflection, 0);
  });

  it('do not unbalance the two gaps', () => {
    const m = outOfTheBox(false, { showReflection: true });
    const { near, far } = gaps(m, 48);
    assert.strictEqual(near, far);
  });
});

describe('an explicitly sized background', () => {
  it('is honoured as given', () => {
    assert.strictEqual(outOfTheBox(false, { plateThickness: 120 }).plate, 120);
  });

  it('is never allowed to be smaller than the icons it holds', () => {
    const m = outOfTheBox(false, { iconSize: 64, plateThickness: 10 });
    assert.ok(m.plate >= 64, `${m.plate} would clip a 64px icon`);
    assert.ok(m.anchor >= 0);
  });
});

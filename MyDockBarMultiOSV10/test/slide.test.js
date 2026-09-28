'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const slide = require('../src/main/slide');

const AREA = { x: 0, y: 0, width: 1920, height: 1040 };
const SIZE = { width: 600, height: 120 };

describe('slide easing', () => {
  it('starts at rest and ends at rest', () => {
    assert.strictEqual(slide.ease(0), 0);
    assert.strictEqual(slide.ease(1), 1);
  });

  it('passes through the halfway point halfway along', () => {
    assert.ok(Math.abs(slide.ease(0.5) - 0.5) < 1e-9);
  });

  it('never goes backwards', () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const value = slide.ease(t);
      assert.ok(value >= previous, `ease dipped at t=${t.toFixed(2)}`);
      previous = value;
    }
  });

  it('creeps away rather than jumping, which is the whole point', () => {
    // A linear slide would already be 5% of the way after 5% of the time; an
    // eased one has barely moved, so there is no visible jerk at the start.
    assert.ok(slide.ease(0.05) < 0.01);
    assert.ok(slide.ease(0.95) > 0.99);
  });

  it('clamps input that has run past either end', () => {
    assert.strictEqual(slide.ease(-3), 0);
    assert.strictEqual(slide.ease(7), 1);
  });
});

describe('where the dock hides to', () => {
  const stops = (position, shown) => slide.awayOrigin(shown, {
    position, area: AREA, width: SIZE.width, height: SIZE.height, peek: 3,
  });

  it('drops a bottom dock below the screen, leaving the sliver', () => {
    const away = stops('bottom', { x: 660, y: 920 });
    assert.strictEqual(away.y, AREA.height - 3);
    assert.strictEqual(away.x, 660, 'sliding down must not drift sideways');
  });

  it('lifts a top dock above the screen', () => {
    const away = stops('top', { x: 660, y: 0 });
    assert.strictEqual(away.y, 3 - SIZE.height);
  });

  it('slides a left dock off the left edge', () => {
    const away = stops('left', { x: 0, y: 460 });
    assert.strictEqual(away.x, 3 - SIZE.width);
    assert.strictEqual(away.y, 460);
  });

  it('slides a right dock off the right edge', () => {
    const away = stops('right', { x: 1320, y: 460 });
    assert.strictEqual(away.x, AREA.width - 3);
  });

  it('always leaves something behind, even asked for none', () => {
    // A dock hidden without a sliver could never be reached again.
    const none = slide.awayOrigin({ x: 0, y: 920 }, {
      position: 'bottom', area: AREA, width: SIZE.width, height: SIZE.height, peek: 0,
    });
    assert.strictEqual(none.y, AREA.height - 1);
  });
});

describe('position along the slide', () => {
  const shown = { x: 100, y: 920 };
  const away = { x: 100, y: 1037 };

  it('sits at the resting place when it has not started', () => {
    assert.deepStrictEqual(slide.originAt(shown, away, 0), shown);
  });

  it('reaches the hidden place when it finishes', () => {
    assert.deepStrictEqual(slide.originAt(shown, away, 1), away);
  });

  it('lands on whole pixels, so a moving window does not shimmer', () => {
    for (let p = 0; p <= 1; p += 0.07) {
      const at = slide.originAt(shown, away, p);
      assert.strictEqual(at.y, Math.round(at.y));
    }
  });

  it('moves steadily in one direction', () => {
    let previous = shown.y - 1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const { y } = slide.originAt(shown, away, p);
      assert.ok(y >= previous);
      previous = y;
    }
  });
});

describe('slide timing', () => {
  it('charges the full time for a full trip', () => {
    assert.strictEqual(slide.duration(260, 0, 1), 260);
  });

  it('charges only for the distance left when reversed part-way', () => {
    // Caught a quarter of the way out, the dock has a quarter to come back.
    assert.strictEqual(slide.duration(260, 0.25, 0), 65);
  });

  it('costs nothing when there is nowhere to go', () => {
    assert.strictEqual(slide.duration(260, 1, 1), 0);
  });

  it('is instant when the animation is switched off', () => {
    assert.strictEqual(slide.duration(0, 0, 1), 0);
  });
});

describe('the strip that wakes a hidden dock', () => {
  it('hugs the edge the dock hides against', () => {
    assert.deepStrictEqual(slide.edgeBand('bottom', AREA, 3),
      { x: 0, y: 1037, width: 1920, height: 3 });
    assert.deepStrictEqual(slide.edgeBand('top', AREA, 3),
      { x: 0, y: 0, width: 1920, height: 3 });
    assert.deepStrictEqual(slide.edgeBand('left', AREA, 3),
      { x: 0, y: 0, width: 3, height: 1040 });
    assert.deepStrictEqual(slide.edgeBand('right', AREA, 3),
      { x: 1917, y: 0, width: 3, height: 1040 });
  });

  it('is the whole of a fully hidden window that is still on screen', () => {
    const bounds = { x: 660, y: 1037, width: 600, height: 120 };
    const hot = slide.localOverlap(bounds, slide.edgeBand('bottom', AREA, 3));
    assert.deepStrictEqual(hot, { x: 0, y: 0, width: 600, height: 3 });
  });

  it('is only the sliver of a window that is still mostly on screen', () => {
    // Half way out: the window covers 60px of the desktop, but waking the dock
    // must still take reaching the very edge - otherwise it springs back as it
    // sweeps under a pointer that is simply sitting there.
    const bounds = { x: 660, y: 980, width: 600, height: 120 };
    const hot = slide.localOverlap(bounds, slide.edgeBand('bottom', AREA, 3));
    assert.deepStrictEqual(hot, { x: 0, y: 57, width: 600, height: 3 });
  });

  it('is nothing at all when the window has left the edge behind', () => {
    const bounds = { x: 660, y: 100, width: 600, height: 120 };
    assert.strictEqual(slide.localOverlap(bounds, slide.edgeBand('bottom', AREA, 3)), null);
  });
});

describe('what the pointer means for a hiding dock', () => {
  // A bottom dock: the window is 132px deep but the dock itself is the bottom
  // 78px of it, the rest being room for magnification and item names.
  const PLATE = { x: 45, y: 54, width: 680, height: 78 };
  const SLIVER = { x: 0, y: 0, width: 770, height: 3 };
  const MARGIN = 48;

  const ask = (point, over = {}) => slide.decide({
    point, hidden: false, sliding: false, plate: PLATE, sliver: null, margin: MARGIN, ...over,
  });

  it('wakes the dock when the pointer finds the sliver', () => {
    const call = ask({ x: 400, y: 1 }, { hidden: true, sliver: SLIVER });
    assert.strictEqual(call.show, true);
    assert.strictEqual(call.interactive, true);
  });

  it('ignores the rest of a hidden dock, which is off screen anyway', () => {
    const call = ask({ x: 400, y: 90 }, { hidden: true, sliver: SLIVER });
    assert.strictEqual(call.show, false);
  });

  it('lets the pointer catch the dock on its way out', () => {
    // Mid-slide the dock is still largely on screen. Landing on it should
    // bring it back rather than leave the user chasing it to the edge.
    const call = ask({ x: 400, y: 90 }, { hidden: true, sliding: true, sliver: SLIVER });
    assert.strictEqual(call.show, true);
    assert.strictEqual(call.hide, false);
  });

  it('does not treat the whole window as dock while it slides', () => {
    // Above the plate is empty air, even mid-slide.
    const call = ask({ x: 400, y: 10 }, { hidden: true, sliding: true, sliver: null });
    assert.strictEqual(call.show, false);
  });

  it('keeps the dock awake while the pointer is on it', () => {
    const call = ask({ x: 400, y: 100 });
    assert.deepStrictEqual(call, { interactive: true, show: true, hide: false });
  });

  it('gives a grace band, so grazing the edge does not start it hiding', () => {
    const call = ask({ x: 400, y: 30 }); // 24px above the plate
    assert.strictEqual(call.interactive, false, 'and it stops swallowing clicks at once');
    assert.strictEqual(call.hide, false);
  });

  it('starts hiding once the pointer is properly away', () => {
    const call = ask({ x: 400, y: 0 }); // 54px above the plate
    assert.strictEqual(call.hide, true);
  });

  it('does not stay awake merely because the pointer is inside the window', () => {
    // The window is far wider than the dock - most of a vertical dock's window
    // is room reserved for item names - and that empty air is not the dock.
    const tall = { x: 0, y: 60, width: 60, height: 680 };
    const call = slide.decide({
      point: { x: 250, y: 400 }, hidden: false, sliding: false,
      plate: tall, sliver: null, margin: MARGIN,
    });
    assert.strictEqual(call.hide, true);
  });

  it('never both shows and hides', () => {
    for (const y of [0, 20, 30, 54, 90, 131]) {
      const call = ask({ x: 400, y });
      assert.ok(!(call.show && call.hide), `contradictory at y=${y}`);
    }
  });

  it('says nothing useful, but does not throw, before the dock has reported itself', () => {
    const call = slide.decide({
      point: { x: 5, y: 5 }, hidden: false, sliding: false,
      plate: null, sliver: null, margin: MARGIN,
    });
    assert.deepStrictEqual(call, { interactive: false, show: false, hide: true });
  });
});

describe('pointer against a rectangle', () => {
  const rect = { x: 10, y: 20, width: 100, height: 40 };

  it('accepts a point inside and rejects one outside', () => {
    assert.ok(slide.within({ x: 50, y: 30 }, rect));
    assert.ok(!slide.within({ x: 5, y: 30 }, rect));
    assert.ok(!slide.within({ x: 50, y: 70 }, rect));
  });

  it('treats the far edges as outside, so neighbours do not overlap', () => {
    assert.ok(slide.within({ x: 10, y: 20 }, rect));
    assert.ok(!slide.within({ x: 110, y: 30 }, rect));
  });

  it('grants a grace margin when asked', () => {
    assert.ok(!slide.within({ x: 50, y: 75 }, rect));
    assert.ok(slide.within({ x: 50, y: 75 }, rect, 20));
  });

  it('says no rather than throwing when there is no rectangle', () => {
    assert.ok(!slide.within({ x: 0, y: 0 }, null, 100));
  });
});

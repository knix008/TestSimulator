'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { loadRenderer } = require('./helpers/renderer');

const { DockTooltip } = loadRenderer(['src/renderer/js/tooltip.js']);
const { crossRoom, axisRoom, place, GAP, MAX_LABEL, EDGE } = DockTooltip;

// A long-ish program name in the tooltip's font.
const LABEL = { width: 214, height: 27 };

describe('room reserved for item names', () => {
  it('reserves a line of height on a horizontal dock', () => {
    const room = crossRoom({ showLabels: true, vertical: false, ...LABEL, labelWidth: LABEL.width, labelHeight: LABEL.height });
    assert.ok(room >= LABEL.height + GAP, `${room} must clear the name and its gap`);
    assert.ok(room < LABEL.width, 'a horizontal dock must not reserve the name width across its thickness');
  });

  it('reserves the whole name width on a vertical dock', () => {
    // The name reads across the dock's thin dimension, so the window has to be
    // far wider than the icons or the name is clipped by the window edge.
    const room = crossRoom({ showLabels: true, vertical: true, labelWidth: LABEL.width, labelHeight: LABEL.height });
    assert.ok(room >= LABEL.width + GAP, `${room} is not enough for a ${LABEL.width}px name`);
  });

  it('reserves next to nothing when names are switched off', () => {
    const room = crossRoom({ showLabels: false, vertical: true, labelWidth: 400, labelHeight: 27 });
    assert.ok(room <= 6);
  });

  it('refuses to balloon for one absurd name', () => {
    const room = crossRoom({ showLabels: true, vertical: true, labelWidth: 4000, labelHeight: 27 });
    assert.ok(room < MAX_LABEL + 40, `${room} is past the cap`);
  });
});

describe('room along the dock', () => {
  it('widens a short horizontal dock to fit a name', () => {
    // Two icons are narrower than either of their names; centring the name on
    // an icon would push most of it outside the window.
    assert.ok(axisRoom({ showLabels: true, vertical: false, labelWidth: LABEL.width }) > LABEL.width);
  });

  it('asks for nothing on a vertical dock, which is already long', () => {
    assert.strictEqual(axisRoom({ showLabels: true, vertical: true, labelWidth: LABEL.width }), 0);
  });

  it('asks for nothing when names are switched off', () => {
    assert.strictEqual(axisRoom({ showLabels: false, vertical: false, labelWidth: LABEL.width }), 0);
  });
});

describe('placing the name', () => {
  const tip = { width: 214, height: 27 };
  const inside = (at, view) => at.left >= 0 && at.top >= 0
    && at.left + tip.width <= view.width && at.top + tip.height <= view.height;

  it('sits above an icon on a bottom dock', () => {
    const view = { width: 600, height: 120 };
    const box = { left: 270, right: 318, top: 60, bottom: 108, width: 48, height: 48 };
    const at = place({ position: 'bottom', box, tip, view });
    assert.strictEqual(at.top, box.top - tip.height - GAP);
    assert.ok(inside(at, view));
  });

  it('sits below an icon on a top dock', () => {
    const view = { width: 600, height: 120 };
    const box = { left: 270, right: 318, top: 12, bottom: 60, width: 48, height: 48 };
    const at = place({ position: 'top', box, tip, view });
    assert.strictEqual(at.top, box.bottom + GAP);
  });

  it('sits to the right of a left-hand dock, inside the window', () => {
    // The window is wide because crossRoom asked for the name to fit.
    const view = { width: 320, height: 800 };
    const box = { left: 6, right: 54, top: 380, bottom: 428, width: 48, height: 48 };
    const at = place({ position: 'left', box, tip, view });
    assert.strictEqual(at.left, box.right + GAP);
    assert.ok(inside(at, view), 'the name must not run off the right of the window');
  });

  it('sits to the left of a right-hand dock, inside the window', () => {
    const view = { width: 320, height: 800 };
    const box = { left: 266, right: 314, top: 380, bottom: 428, width: 48, height: 48 };
    const at = place({ position: 'right', box, tip, view });
    assert.strictEqual(at.left, box.left - tip.width - GAP);
    assert.ok(at.left >= EDGE);
  });

  it('pulls a name back inside rather than letting the window cut it off', () => {
    // The first icon of a short horizontal dock: centring the name on it would
    // put its left half off the window.
    const view = { width: 240, height: 120 };
    const box = { left: 12, right: 60, top: 60, bottom: 108, width: 48, height: 48 };
    const at = place({ position: 'bottom', box, tip, view });
    assert.ok(at.left >= EDGE, `${at.left} is off the left of the window`);
    assert.ok(at.left + tip.width <= view.width, 'and it still ends inside the right edge');
  });

  it('pins a name that cannot fit at all, instead of splitting the loss', () => {
    const view = { width: 100, height: 120 };
    const box = { left: 26, right: 74, top: 60, bottom: 108, width: 48, height: 48 };
    const at = place({ position: 'bottom', box, tip, view });
    assert.strictEqual(at.left, EDGE);
  });

  it('centres on the icon when there is room either side', () => {
    const view = { width: 900, height: 120 };
    const box = { left: 426, right: 474, top: 60, bottom: 108, width: 48, height: 48 };
    const at = place({ position: 'bottom', box, tip, view });
    assert.strictEqual(at.left, Math.round(450 - tip.width / 2));
  });

  it('always returns whole pixels', () => {
    const view = { width: 901, height: 121 };
    const box = { left: 425.5, right: 473.5, top: 59.5, bottom: 107.5, width: 48, height: 48 };
    const at = place({ position: 'bottom', box, tip: { width: 213.4, height: 26.6 }, view });
    assert.strictEqual(at.left, Math.round(at.left));
    assert.strictEqual(at.top, Math.round(at.top));
  });
});

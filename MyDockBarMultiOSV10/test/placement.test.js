'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const placement = require('../src/shared/placement');

describe('dock placement', () => {
  it('offers the four edges and the four corners', () => {
    assert.deepStrictEqual(placement.POSITIONS, [
      'bottom', 'top', 'left', 'right',
      'bottom-left', 'bottom-right', 'top-left', 'top-right',
    ]);
  });

  it('keeps an edge centred unless alignment says otherwise', () => {
    assert.deepStrictEqual(placement.resolve('bottom', 'center'), {
      edge: 'bottom', align: 'center', vertical: false, corner: false,
    });
    assert.strictEqual(placement.resolve('left', 'end').align, 'end');
    assert.strictEqual(placement.resolve('left', 'end').vertical, true);
  });

  it('pins a corner to that end of its edge', () => {
    assert.deepStrictEqual(placement.resolve('bottom-left', 'center'), {
      edge: 'bottom', align: 'start', vertical: false, corner: true,
    });
    assert.deepStrictEqual(placement.resolve('top-right', 'start'), {
      edge: 'top', align: 'end', vertical: false, corner: true,
    });
  });

  it('treats an unknown position as the bottom edge', () => {
    assert.strictEqual(placement.resolve('middle').edge, 'bottom');
  });
});

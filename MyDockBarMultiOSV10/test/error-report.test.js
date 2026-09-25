'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { describeError } = require('../src/main/error-report');

describe('the text a serious error shows', () => {
  it('uses the stack, which is what someone needs in order to copy it', () => {
    const err = new Error('dock failed');
    assert.match(describeError(err), /dock failed/);
    assert.match(describeError(err), /error-report\.test\.js/);
  });

  it('keeps a plain message', () => {
    assert.strictEqual(describeError('renderer gone'), 'renderer gone');
  });

  it('says nothing for an empty failure', () => {
    assert.strictEqual(describeError(null), '');
    assert.strictEqual(describeError('   '), '');
  });

  it('does not hand the popup an unbounded string', () => {
    const text = describeError('x'.repeat(20000));
    assert.ok(text.length < 20000);
    assert.match(text, /…$/);
  });
});

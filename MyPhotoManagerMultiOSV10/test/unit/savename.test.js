// EDIT-SAVEAS: saving an edit suggests a new name. The prefix is the changes,
// each one once, and characters a file name cannot contain are left out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveNamePrefix } from '../../src/edit/savename.js';

test('EDIT-SAVEAS prefix lists each change once, in the order they were made', () => {
  assert.equal(saveNamePrefix(['노출', '노출', '자르기']), '노출_자르기');
  assert.equal(saveNamePrefix(['Exposure', 'Crop', 'Exposure']), 'Exposure_Crop');
  assert.equal(saveNamePrefix(['배경 제거']), '배경_제거');
  assert.equal(saveNamePrefix(['Remove background']), 'Remove_background');
});

test('EDIT-SAVEAS prefix drops characters a file name cannot contain', () => {
  assert.equal(saveNamePrefix(['Reset: Light']), 'Reset_Light');
  assert.equal(saveNamePrefix(['a/b\\c*d?e"f<g>h|i']), 'abcdefghi');
  assert.equal(saveNamePrefix(['  노출  ']), '노출');
});

test('EDIT-SAVEAS prefix falls back when there is no usable change, and stays short', () => {
  assert.equal(saveNamePrefix([], '편집'), '편집');
  assert.equal(saveNamePrefix(['', '   ', null]), 'edit');
  assert.equal(saveNamePrefix(['가'.repeat(70), '노출'], '편집'), '편집');
  const first = '가'.repeat(58);
  assert.equal(saveNamePrefix([first, '노출']), first);
  assert.equal(saveNamePrefix(['가'.repeat(20), '노출']), `${'가'.repeat(20)}_노출`);
});

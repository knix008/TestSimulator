// Every text key the UI uses exists in Korean and in English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingKeys, usedKeys } from '../../scripts/i18n-keys.mjs';

test('the app uses hundreds of text keys', async () => {
  assert.ok((await usedKeys()).size > 500);
});

test('no Korean or English text is missing', async () => {
  const m = await missingKeys();
  assert.deepEqual(m.ko, [], `Korean: ${m.ko.join(', ')}`);
  assert.deepEqual(m.enOnlyKo, [], `English: ${m.enOnlyKo.join(', ')}`);
});

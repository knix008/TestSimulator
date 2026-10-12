import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_FONTS, listFonts } from '../src/lib/fonts.js';

test('the fallback list is unique and used when the system list is unavailable', async () => {
  assert.ok(FALLBACK_FONTS.length > 10);
  assert.equal(new Set(FALLBACK_FONTS).size, FALLBACK_FONTS.length);
  const listed = await listFonts();
  assert.equal(listed.source, 'fallback');
  assert.deepEqual(listed.families, [...FALLBACK_FONTS].sort((a, b) => a.localeCompare(b)));
  assert.equal(await listFonts(), listed);
});

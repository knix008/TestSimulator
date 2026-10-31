// User guide window: the text it shows is the current UsersGuide.md / UsersGuide.en.md,
// and the two languages have the same chapters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { guideContent } from '../../scripts/build-guide.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// features: APP-GUIDE
test('public/doc/guide-content.js matches the guides (node scripts/build-guide.mjs)', () => {
  assert.equal(fs.readFileSync(path.join(root, 'public', 'doc', 'guide-content.js'), 'utf8'), guideContent());
});

test('Korean and English guides have the same chapters', () => {
  const chapters = (name) => fs.readFileSync(path.join(root, name), 'utf8').split(/\r?\n/).filter((l) => /^## \d+\./.test(l)).map((l) => l.match(/^## (\d+)\./)[1]);
  assert.deepEqual(chapters('UsersGuide.en.md'), chapters('UsersGuide.md'));
});

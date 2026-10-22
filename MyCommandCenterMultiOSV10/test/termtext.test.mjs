// Terminal output rules that need no browser: the CR handling of the
// transcript (src/lib/termtext.js) and which commands let the prompt reuse the
// last git status instead of running `git status` again (core/terminal.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mergeOutput } from '../src/lib/termtext.js';

const require = createRequire(import.meta.url);
const { isReadOnly } = require('../core/terminal.js');

test('mergeOutput: a lone CR overwrites the line, breaks it, or is dropped', () => {
  // overwrite (what a terminal does with a progress bar redrawing its line)
  assert.equal(mergeOutput('', '10%\r20%\r30%\n', 'overwrite'), '30%\n');
  assert.equal(mergeOutput('done\n', '10%\r99%\n', 'overwrite'), 'done\n99%\n');
  assert.equal(mergeOutput('', 'newline\r\nkept\n', 'overwrite'), 'newline\nkept\n');   // CRLF is a plain line break
  // the other two rules
  assert.equal(mergeOutput('', '10%\r20%\n', 'newline'), '10%\n20%\n');
  assert.equal(mergeOutput('', '10%\r20%\n', 'strip'), '10%20%\n');
});

test('mergeOutput: a CR at the end of a chunk waits for the next one', () => {
  const first = mergeOutput('', 'a\rb\r', 'overwrite');
  assert.equal(first, 'b\r', 'the trailing CR is kept until its LF (or the next text) arrives');
  assert.equal(mergeOutput(first, '\ndone\n', 'overwrite'), 'b\ndone\n');   // it was a CRLF after all
  assert.equal(mergeOutput(first, 'c\n', 'overwrite'), 'c\n');             // it was a lone CR: c overwrites b
});

test('isReadOnly: the prompt reuses the git status after a command that cannot change the repository', () => {
  for (const line of ['cd ..', 'ls -al', 'dir', 'git status', 'git log --oneline', 'cat README.md', 'cd src && ls', 'Get-ChildItem'])
    assert.equal(isReadOnly(line), true, line);
  for (const line of ['git commit -m x', 'npm install', 'rm a.txt', 'cd src && npm run build', 'git add .', ''])
    assert.equal(isReadOnly(line), false, line);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installProgress } from '../src/lib/install-progress.js';

function statuses(state, log) {
  return installProgress(state, log).map((s) => s.status);
}

test('install progress starts at the package-manager step', () => {
  assert.deepEqual(statuses('running', ''), ['run', 'wait', 'wait', 'wait']);
});

test('install progress advances through download and install logs', () => {
  assert.deepEqual(statuses('running', 'Collecting ruff\nDownloading ruff-0.6.0\n'), ['done', 'run', 'wait', 'wait']);
  assert.deepEqual(statuses('running', 'Collecting ruff\nInstalling collected packages: ruff\n'), ['done', 'done', 'run', 'wait']);
  assert.deepEqual(statuses('running', 'Successfully installed ruff-0.6.0\n'), ['done', 'done', 'done', 'run']);
});

test('install progress marks every step done when the job finishes', () => {
  assert.deepEqual(statuses('done', 'Successfully installed ruff-0.6.0\n'), ['done', 'done', 'done', 'done']);
});

test('install progress marks the current step failed or cancelled', () => {
  assert.deepEqual(statuses('failed', ''), ['failed', 'wait', 'wait', 'wait']);
  assert.deepEqual(statuses('failed', 'Downloading ruff\nERROR: Could not install\n'), ['done', 'failed', 'wait', 'wait']);
  assert.deepEqual(statuses('cancelled', 'Installing collected packages: ruff\n'), ['done', 'done', 'cancelled', 'wait']);
});

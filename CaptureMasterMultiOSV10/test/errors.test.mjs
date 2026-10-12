import test from 'node:test';
import assert from 'node:assert/strict';
import { describeError, errorToText } from '../src/lib/errors.js';

test('IPC prefixes and non-errors become a headline', () => {
  const ipc = describeError(new Error("Error invoking remote method 'save': Error: disk full"), 'save');
  assert.equal(ipc.message, 'disk full');
  assert.equal(ipc.context, 'save');
  assert.equal(ipc.name, 'Error');
  assert.match(ipc.time, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(describeError('plain').message, 'plain');
  assert.equal(describeError({ code: 7 }).message, '{"code":7}');
});

test('the copyable report keeps context, stack and platform', () => {
  const info = describeError(new Error('boom'), 'export');
  const text = errorToText(info, { version: '1.0.0', platform: 'win32', arch: 'x64', electron: '30', chrome: '120' });
  assert.match(text, /^CaptureMaster v1\.0\.0/);
  assert.match(text, /Context: export/);
  assert.match(text, /Error: Error: boom/);
  assert.match(text, /Platform: win32 x64 · Electron 30 · Chromium 120/);
  const bare = errorToText({ time: 't', name: 'Error', message: 'm', stack: '', context: '' }, null);
  assert.match(bare, /^CaptureMaster\nTime: t/);
  assert.equal(bare.includes('Context:'), false);
  assert.equal(bare.includes('Platform:'), false);
});

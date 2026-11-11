// Settings › Board server: the server languages (Node.js, Go, Rust, Python) — the version shown, and when the
// language is installed on its own ("Install automatically", off by default because it is system software).
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoInstallTarget, shortVersion, TOOLCHAINS } from '../../src/domain/toolchains.js';
import { defaultSettings, normalizeSettings } from '../../src/domain/settings.js';

test('toolchains: the version shown is short (the raw output of each language did not fit its cell)', () => {
  assert.equal(shortVersion('v22.18.0'), 'v22.18.0');
  assert.equal(shortVersion('go version go1.23.2 windows/amd64'), '1.23.2');
  assert.equal(shortVersion('rustc 1.96.0 (ac68faa20 2026-05-25)'), '1.96.0');
  assert.equal(shortVersion('Python 3.12.6'), '3.12.6');
  assert.equal(shortVersion('something odd'), 'something odd');
  assert.equal(shortVersion(null), '');
});

test('toolchains: install automatically only the chosen language, only when it is missing, once, and only when turned on', () => {
  const tools = TOOLCHAINS.map((tool) => ({ id: tool.id, found: tool.id !== 'go', version: '' }));
  assert.equal(defaultSettings().autoInstallServerTool, false);
  assert.equal(normalizeSettings({ autoInstallServerTool: true }).autoInstallServerTool, true);
  assert.equal(normalizeSettings({ autoInstallServerTool: 'yes' }).autoInstallServerTool, false);
  const on = (boardBackend) => ({ autoInstallServerTool: true, boardBackend });
  assert.equal(autoInstallTarget(on('go'), tools), 'go');
  assert.equal(autoInstallTarget(on('node'), tools), null, 'installed already');
  assert.equal(autoInstallTarget({ autoInstallServerTool: false, boardBackend: 'go' }, tools), null, 'turned off');
  assert.equal(autoInstallTarget(on('go'), tools, new Set(['go'])), null, 'started already in this session');
  assert.equal(autoInstallTarget(on('go'), []), null, 'no check yet (web, or the check failed)');
  assert.equal(autoInstallTarget(on('go'), null), null);
  assert.equal(autoInstallTarget({ autoInstallServerTool: true }, TOOLCHAINS.map((tool) => ({ id: tool.id, found: false }))), 'node', 'the default language');
});

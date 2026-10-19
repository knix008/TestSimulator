// Settings defaults, reset keys, and independent bottom-panel flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  SETTINGS_DEFAULTS, SETTING_KEYS, RESET_KEYS, resetPatch, pickSettings,
  visibleBottomTabs, activeBottomTab, toggleBottomPanel, hideBottomPanel,
  BOTTOM_PANEL_FLAGS, FONT_SUGGESTIONS,
} from '../src/lib/settings.js';

const require = createRequire(import.meta.url);
const { DEFAULTS } = require('../core/session');

for (const key of SETTING_KEYS) {
  test(`settings default fills ${key}`, () => {
    assert.ok(Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key), key);
    const picked = pickSettings({});
    assert.deepEqual(picked[key], SETTINGS_DEFAULTS[key]);
  });
}

for (const key of RESET_KEYS) {
  test(`reset key ${key} is a known setting`, () => {
    assert.ok(SETTING_KEYS.includes(key), key);
    const patch = resetPatch();
    assert.ok(Object.prototype.hasOwnProperty.call(patch, key));
  });
}

test('pickSettings turns a lone termVisible session into the matching tab flag', () => {
  const term = pickSettings({ termVisible: true, bottomTab: 'terminal' });
  assert.equal(term.showTerminal, true);
  assert.equal(term.showLog, false);
  assert.equal(term.showLint, false);
  const log = pickSettings({ termVisible: true, bottomTab: 'log' });
  assert.equal(log.showLog, true);
  const lint = pickSettings({ termVisible: true, bottomTab: 'lint' });
  assert.equal(lint.showLint, true);
});

test('pickSettings keeps independent flags and derives termVisible', () => {
  const on = pickSettings({ showTerminal: true, showLog: true, showLint: false });
  assert.equal(on.termVisible, true);
  const off = pickSettings({ showTerminal: false, showLog: false, showLint: false });
  assert.equal(off.termVisible, false);
});

const FLAG_COMBOS = [
  [false, false, false, []],
  [true, false, false, ['terminal']],
  [false, true, false, ['log']],
  [false, false, true, ['lint']],
  [true, true, false, ['terminal', 'log']],
  [true, false, true, ['terminal', 'lint']],
  [false, true, true, ['log', 'lint']],
  [true, true, true, ['terminal', 'log', 'lint']],
];

for (const [showTerminal, showLog, showLint, tabs] of FLAG_COMBOS) {
  test(`visible bottom tabs for T=${showTerminal} L=${showLog} P=${showLint}`, () => {
    assert.deepEqual(visibleBottomTabs({ showTerminal, showLog, showLint }), tabs);
    const active = activeBottomTab({ showTerminal, showLog, showLint, bottomTab: 'terminal' });
    if (!tabs.length) assert.equal(active, 'terminal');
    else assert.ok(tabs.includes(active));
  });
}

for (const [tab, flag] of Object.entries(BOTTOM_PANEL_FLAGS)) {
  test(`toggle ${tab} turns the panel on then off`, () => {
    const on = toggleBottomPanel({ showTerminal: false, showLog: false, showLint: false }, tab);
    assert.equal(on[flag], true);
    assert.equal(on.termVisible, true);
    assert.equal(on.bottomTab, tab);
    const off = toggleBottomPanel({ ...on, showTerminal: tab === 'terminal', showLog: tab === 'log', showLint: tab === 'lint' }, tab);
    assert.equal(off[flag], false);
  });
}

test('hideBottomPanel clears every tab flag', () => {
  assert.deepEqual(hideBottomPanel(), {
    showTerminal: false, showLog: false, showLint: false, termVisible: false,
  });
});

test('session defaults keep the three bottom-panel flags off', () => {
  assert.equal(DEFAULTS.showTerminal, false);
  assert.equal(DEFAULTS.showLog, false);
  assert.equal(DEFAULTS.showLint, false);
  assert.equal(DEFAULTS.sessionVersion, 6);
});

test('font suggestions include a Korean coding font and Consolas', () => {
  assert.ok(FONT_SUGGESTIONS.includes('D2Coding'));
  assert.ok(FONT_SUGGESTIONS.includes('Consolas'));
  assert.ok(FONT_SUGGESTIONS.length >= 10);
});

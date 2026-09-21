import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { sortLintItems } from '../src/lib/lint.js';
import { pickSettings, toggleBottomPanel, hideBottomPanel, visibleBottomTabs, activeBottomTab } from '../src/lib/settings.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sortLintItems puts errors first, then line order', () => {
  const sorted = sortLintItems([
    { line: 10, col: 1, severity: 'info', message: 'i' },
    { line: 2, col: 8, severity: 'error', message: 'e2' },
    { line: 2, col: 1, severity: 'error', message: 'e1' },
    { line: 3, col: 1, severity: 'warning', message: 'w' },
  ]);
  assert.deepEqual(sorted.map((d) => d.message), ['e1', 'e2', 'w', 'i']);
});

test('toolbar Terminal / Log / Problems buttons are independent', () => {
  let st = pickSettings({});
  assert.deepEqual(visibleBottomTabs(st), []);
  assert.equal(st.termVisible, false);

  st = { ...st, ...toggleBottomPanel(st, 'log') };
  assert.deepEqual(visibleBottomTabs(st), ['log']);
  assert.equal(st.showLog, true);
  assert.equal(st.showTerminal, false);
  assert.equal(st.showLint, false);
  assert.equal(st.termVisible, true);
  assert.equal(activeBottomTab(st), 'log');

  st = { ...st, ...toggleBottomPanel(st, 'terminal') };
  assert.deepEqual(visibleBottomTabs(st), ['terminal', 'log']);
  assert.equal(st.showTerminal, true);
  assert.equal(st.showLog, true);
  assert.equal(st.bottomTab, 'terminal');

  st = { ...st, ...toggleBottomPanel(st, 'lint') };
  assert.deepEqual(visibleBottomTabs(st), ['terminal', 'log', 'lint']);
  assert.equal(st.showLint, true);

  st = { ...st, ...toggleBottomPanel(st, 'log') };
  assert.deepEqual(visibleBottomTabs(st), ['terminal', 'lint']);
  assert.equal(st.showLog, false);
  assert.equal(st.showTerminal, true);
  assert.equal(st.showLint, true);
  assert.equal(st.termVisible, true);

  st = { ...st, ...hideBottomPanel() };
  assert.deepEqual(visibleBottomTabs(st), []);
  assert.equal(st.termVisible, false);
  assert.equal(st.showTerminal, false);
  assert.equal(st.showLog, false);
  assert.equal(st.showLint, false);

  const old = pickSettings({ termVisible: true, bottomTab: 'lint' });
  assert.equal(old.showLint, true);
  assert.equal(old.showTerminal, false);
  assert.equal(old.showLog, false);

  let last = { ...pickSettings({}), ...toggleBottomPanel({}, 'log') };
  last = { ...last, ...toggleBottomPanel(last, 'log') };
  assert.equal(last.showLog, false);
  assert.equal(last.termVisible, false);
  assert.deepEqual(visibleBottomTabs(last), []);
});

test('the bottom panel has Terminal, Log and Lint tabs', () => {
  const panel = fs.readFileSync(path.join(root, 'src', 'components', 'TerminalPanel.jsx'), 'utf8');
  assert.match(panel, /tab === 'terminal'/);
  assert.match(panel, /tab === 'log'/);
  assert.match(panel, /tab === 'lint'/);
  assert.match(panel, /lint_tab/);
  assert.match(panel, /log_tab/);
  assert.match(panel, /open\.terminal &&/);
  assert.match(panel, /open\.log &&/);
  assert.match(panel, /open\.lint &&/);
  assert.match(panel, /onPanel && onPanel\('terminal'\)/);
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /toggleBottomPanel\(st, tab\)/);
  assert.match(app, /hideBottomPanel\(\)/);
  assert.match(app, /panels=\{\{ terminal: !!settings\.showTerminal, log: !!settings\.showLog, lint: !!settings\.showLint \}\}/);
  assert.match(app, /items: \(r && r\.diagnostics\) \|\| \[\]/);
  assert.match(app, /\[activeId, settings\.lint\]/);
  const toolbar = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  assert.match(toolbar, /id: 'toggleTerminal'/);
  assert.match(toolbar, /id: 'toggleLog'/);
  assert.match(toolbar, /id: 'lintPanel'/);
  assert.match(toolbar, /on: \(st\) => !!st\.showTerminal/);
  assert.match(toolbar, /on: \(st\) => !!st\.showLog/);
  assert.match(toolbar, /on: \(st\) => !!st\.showLint/);
  const status = fs.readFileSync(path.join(root, 'src', 'components', 'StatusBar.jsx'), 'utf8');
  assert.match(status, /onAction\('lintPanel'\)/);
  const i18n = fs.readFileSync(path.join(root, 'src', 'lib', 'i18n.js'), 'utf8');
  assert.match(i18n, /lint_tab: '문제점'/);
  assert.match(i18n, /lint_tab: 'Problems'/);
  assert.match(i18n, /log_tab: '로그'/);
  assert.match(i18n, /tip_log: '로그 보기'/);
});

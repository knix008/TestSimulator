import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { sortLintItems } from '../src/lib/lint.js';

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

test('the bottom panel has Terminal, Log and Lint tabs', () => {
  const panel = fs.readFileSync(path.join(root, 'src', 'components', 'TerminalPanel.jsx'), 'utf8');
  assert.match(panel, /tab === 'terminal'/);
  assert.match(panel, /tab === 'log'/);
  assert.match(panel, /tab === 'lint'/);
  assert.match(panel, /lint_tab/);
  assert.match(panel, /log_tab/);
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /bottomTab: tab/);
  assert.match(app, /items: r\.diagnostics/);
  assert.match(app, /\[activeId, settings\.lint\]/);
  const toolbar = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  assert.match(toolbar, /id: 'lintPanel'/);
  const status = fs.readFileSync(path.join(root, 'src', 'components', 'StatusBar.jsx'), 'utf8');
  assert.match(status, /onAction\('lintPanel'\)/);
  const i18n = fs.readFileSync(path.join(root, 'src', 'lib', 'i18n.js'), 'utf8');
  assert.match(i18n, /lint_tab: 'Problems'/);
  assert.match(i18n, /log_tab: '로그'/);
});

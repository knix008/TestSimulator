// The window may shrink to the toolbar / menu bar — not a fixed 1200 px floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the window minimum width follows the toolbar, with a small fallback', () => {
  const main = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  assert.match(main, /min_inner_size\(640\.0, 600\.0\)/);
  assert.match(main, /\.max\(640\.0\)/);
  assert.equal(/min_inner_size\(1200/.test(main), false, 'no hardcoded 1200 px floor');
  const host = fs.readFileSync(path.join(root, 'src', 'lib', 'tauri-host.js'), 'utf8');
  assert.match(host, /let minW = 640/);
  assert.match(host, /setMinSize\(new LogicalSize\(need, 600\)\)/);
  const backend = fs.readFileSync(path.join(root, 'src', 'lib', 'backend.js'), 'utf8');
  assert.match(backend, /querySelectorAll\('\.toolbar\.menubar, \.icon-toolbar'\)/);
  const toolbar = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  assert.match(toolbar, /syncWindowMinWidth/);
});

test('the about popup is short enough that the OK button stays on screen', () => {
  const host = fs.readFileSync(path.join(root, 'src', 'lib', 'tauri-host.js'), 'utf8');
  const m = host.match(/about:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)/);
  assert.ok(m, 'about popup size');
  assert.ok(Number(m[2]) <= 340, `about height ${m[2]} should be at most 340`);
  const dlg = fs.readFileSync(path.join(root, 'src', 'dialogs', 'Dialogs.jsx'), 'utf8');
  assert.match(dlg, /export function AboutDialog/);
  assert.match(dlg, /t\('ok'\)/);
});

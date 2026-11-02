// A run is seen to happen: the Command Window starts empty (a setting), the run ends with a
// done / failed line and its time, and the Workspace marks what the run, section run or step changed
// (a paused step shows that frame's variables).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diffVariables } from '../src/lib/wsDiff.js';
import { runDoneInfo } from '../src/lib/runStatus.js';
import { t, setLanguage } from '../src/lib/i18n.js';
import { DEFAULTS as DEFAULT_SETTINGS } from '../src/lib/settings.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const v = (name, summary, extra = {}) => ({ name, cls: 'double', dims: [1, 1], bytes: 8, summary, ...extra });

test('the workspace diff marks new and changed variables only', () => {
  const a = [v('x', '1'), v('y', '2'), v('z', '3')];
  const b = [v('x', '1'), v('y', '5'), v('w', '0')];
  const d = diffVariables(a, b);
  assert.deepEqual([...d.added], ['w']);
  assert.deepEqual([...d.changed], ['y']);
  assert.equal(diffVariables(null, b).added.size, 0, 'the first list marks nothing');
  assert.equal(diffVariables(b, b).changed.size, 0, 'the same values: nothing');
  assert.deepEqual([...diffVariables([v('m', '3x3 double', { dims: [3, 3], bytes: 72 })], [v('m', '3x4 double', { dims: [3, 4], bytes: 96 })]).changed], ['m'], 'a new size');
  assert.deepEqual([...diffVariables([v('s', 'ab', { cls: 'char' })], [v('s', 'ab')]).changed], ['s'], 'another class');
});

test('the run line: done or failed, the time it took and the clock', () => {
  const at = new Date(2026, 10, 2, 9, 5, 7);
  assert.deepEqual(runDoneInfo({ ok: true }, 420, at), { ok: true, time: '420 ms', clock: '09:05:07' });
  assert.equal(runDoneInfo({ ok: true }, 3.4, at).time, '3 ms');
  assert.deepEqual(runDoneInfo({ ok: false }, 3140, at), { ok: false, time: '3.1 s', clock: '09:05:07' });
  assert.equal(runDoneInfo(undefined, 125000, at).time, '2 min 5 s');
  for (const lang of ['ko', 'en']) {
    setLanguage(lang);
    for (const k of ['cw_run_done', 'cw_run_failed', 'st_clear_on_run', 'st_clear_on_run_on', 'st_clear_on_run_hint', 'ws_paused_at', 'ws_mark_added', 'ws_mark_changed']) assert.notEqual(t(k), k, `${lang}.${k}`);
  }
  setLanguage('ko');
  assert.equal(t('cw_run_done', { time: '420 ms', clock: '09:05:07' }), '실행 완료 (420 ms, 09:05:07)');
});

test('a script / graphical script run clears the Command Window first (a setting, on by default) and reports its end', () => {
  assert.equal(DEFAULT_SETTINGS.cmd.clearOnRun, true);
  const app = read('../src/App.jsx');
  assert.match(app, /const clearForRun = \(\) => \{ markRun\(\); if \(getSettings\(\)\.cmd\.clearOnRun !== false && cmdRef\.current\) cmdRef\.current\.clear\(\); \};/);
  assert.match(app, /if \(!doc \|\| doc\.kind !== 'file'\) return;\r?\n\s+clearForRun\(\);/, 'runDoc');
  assert.match(app, /clearForRun\(\);\r?\n.*\r?\n\s+engine\.eval\(text, \{ echo: false, history: false, file: path \|\| `\/untitled\/\$\{id\}\$\{M_EXT\}`, stepFirst: true \}\)/, 'step run');
  assert.match(app, /clearForRun\(\); runAndReport\(code, \{ echo: false, history: false \}\);/, 'graphical script');
  assert.match(app, /runAndReport\(here && /);
  assert.match(app, /cmdRef\.current\.print\(`\$\{info\.ok \? '✓' : '✗'\} /);
  assert.match(read('../src/views/Settings/tabs.jsx'), /checked=\{c\.clearOnRun !== false\} onChange=\{\(v\) => setC\(\{ clearOnRun: v \}\)\}/);
  assert.match(read('../src/app.css'), /\.cw-done \{ color: var\(--ok\);/);
});

test('a paused step shows that frame\'s variables, and the Workspace marks changes', () => {
  const app = read('../src/App.jsx');
  assert.match(app, /if \(Array\.isArray\(m\.vars\)\) setVariables\(m\.vars\);/);
  assert.match(app, /pausedAt: debug && debug\.file \? `\$\{baseName\(debug\.file\)\}:\$\{debug\.line\}` : null/);
  const ws = read('../src/panes/Workspace.jsx');
  // marked against the variables as the run / section / step started, so a repeated list keeps the marks
  assert.match(ws, /if \(base\.current\.seq !== runSeq\) base\.current = \{ seq: runSeq, list: variables \|\| \[\] \};/);
  assert.match(ws, /diffVariables\(base\.current\.list, variables\)/);
  assert.match(read('../src/panes/PanelHost.jsx'), /runSeq=\{c\.runSeq\}/);
  for (const re of [/const clearForRun = \(\) => \{ markRun\(\);/, /\{ markRun\(\); runAndReport\(sec\.text,/, /if \(action !== 'stop'\) markRun\(\);/]) assert.match(app, re);
  assert.match(ws, /data-mark=\{added\.has\(v\.name\) \? 'added' : changed\.has\(v\.name\) \? 'changed' : undefined\}/);
  assert.match(ws, /\{pausedAt && <div className="ws-paused small" data-paused="">/);
  assert.match(read('../src/panes/PanelHost.jsx'), /pausedAt=\{c\.pausedAt\}/);
  // the engine sends the frame's variables with the pause
  assert.match(read('../core/lang/interp.js'), /type: 'debug\.paused', file: f\.file \|\| '', line, reason, stack: this\.stackInfo\(\), vars: this\.listVariables\(f\.ws\)/);
});

test('a step run reports its end too', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /stepFirst: true \}\)\.then\(\(res\) => reportRun\(res, t0\), \(\) => \{\}\);/);
});

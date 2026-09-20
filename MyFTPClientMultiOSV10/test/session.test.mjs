// Session / settings persistence: theme, terminal folder, prompt, max lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { Session, DEFAULTS, clampLines } = require('../core/session');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-session-'));
const keep = path.join(tmp, 'keep');
fs.mkdirSync(keep);

test('session: new file uses defaults', () => {
  const s = new Session(tmp);
  const d = s.load();
  assert.equal(d.language, 'ko');
  assert.equal(d.theme, 'midnight');
  assert.equal(d.fontSize, 13);
  assert.equal(d.terminalFont, '');
  assert.equal(d.terminalFontSize, 13);
  assert.equal(d.terminalStartDir, '');
  assert.equal(d.powershellPrompt, 'PS {path}> ');
  assert.equal(d.shellPrompts.cmd, '{path}>');
  assert.notEqual(d.shellPrompts.cmd, d.shellPrompts.powershell);
  assert.notEqual(d.shellPrompts['git-bash'], d.shellPrompts.msys2);
  assert.equal(d.terminalMaxLines, 10000);
  assert.equal(d.transferConcurrency, 3);
  assert.equal(d.skipUnchanged, true);
  assert.equal(d.lastLocalPath, os.homedir());
  assert.equal(DEFAULTS.confirmDelete, true);
});

test('session: save theme, prompt, max lines, terminal folder', () => {
  const s = new Session(tmp);
  s.load();
  const d = s.save({
    theme: 'nord',
    language: 'en',
    fontSize: 16,
    terminalFont: 'Consolas',
    terminalFontSize: 18,
    terminalStartDir: keep,
    powershellPrompt: 'X {name}> ',
    terminalMaxLines: 2500,
    transferConcurrency: 4,
    lastLocalPath: keep,
    lastTerminalShell: 'cmd',
  });
  assert.equal(d.theme, 'nord');
  assert.equal(d.language, 'en');
  assert.equal(d.fontSize, 16);
  assert.equal(d.terminalFont, 'Consolas');
  assert.equal(d.terminalFontSize, 18);
  assert.equal(d.terminalStartDir, keep);
  assert.equal(d.powershellPrompt, 'X {name}> ');
  assert.equal(d.terminalMaxLines, 2500);
  assert.equal(d.transferConcurrency, 4);
  assert.equal(d.lastLocalPath, keep);
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'session.json'), 'utf8'));
  assert.equal(onDisk.theme, 'nord');
  assert.equal(onDisk.powershellPrompt, 'X {name}> ');
});

test('session: missing terminal folder is cleared; prompt and lines are clamped', () => {
  const s = new Session(tmp);
  s.load();
  s.save({
    terminalStartDir: path.join(tmp, 'gone'),
    powershellPrompt: 'bad\r\nprompt',
    terminalMaxLines: 12,
    terminalFont: 'Bad"; font',
    terminalFontSize: 99,
    transferConcurrency: 99,
  });
  const d = s.get();
  assert.equal(d.terminalStartDir, '');
  assert.equal(d.powershellPrompt, 'bad prompt');
  assert.equal(d.terminalMaxLines, 500);
  assert.equal(d.terminalFont, 'Bad font');
  assert.equal(d.terminalFontSize, 32);
  assert.equal(d.transferConcurrency, 4);
  s.save({ powershellPrompt: '   ', terminalMaxLines: 999999 });
  assert.equal(s.get().powershellPrompt, 'PS {path}> ');
  assert.equal(s.get().terminalMaxLines, 100000);
});

test('session: clampLines bounds', () => {
  assert.equal(clampLines(10000), 10000);
  assert.equal(clampLines(0), 500);
  assert.equal(clampLines('8000'), 8000);
  assert.equal(clampLines('nope'), 10000);
  assert.equal(clampLines(1e9), 100000);
});

test('session: reload from disk after a new Session instance', () => {
  const a = new Session(tmp);
  a.load();
  a.save({ theme: 'dracula', sounds: false, skipUnchanged: false });
  const b = new Session(tmp);
  const d = b.load();
  assert.equal(d.theme, 'dracula');
  assert.equal(d.sounds, false);
  assert.equal(d.skipUnchanged, false);
});

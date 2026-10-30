import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  stripAnsi,
  colorEnv,
  wrapCommandForColor,
  colorizePrompt,
  colorizeBanner,
  colorizeName,
  colorizeCommandOutput,
  listingRequest,
  renderListing,
} = require('../core/term-color');

function sh(id, kind, extra = {}) {
  return { id, kind, file: extra.file || id, ...extra };
}

test('term-color: colorEnv forces a 256-color terminal', () => {
  const env = colorEnv();
  assert.match(env.TERM, /xterm|256/);
  assert.ok(Number(env.FORCE_COLOR) >= 1);
  assert.equal(env.CLICOLOR_FORCE, '1');
  assert.match(env.LS_COLORS, /di=/);
});

test('term-color: prompts paint per shell without dropping the plain text', () => {
  const cmd = colorizePrompt(sh('cmd', 'cmd'), 'D:\\Home\\Temp>');
  const ps = colorizePrompt(sh('powershell', 'powershell'), 'PS D:\\Home\\Temp> ');
  const bash = colorizePrompt(sh('git-bash', 'posix'), 'MINGW64 /d/Home/Temp$ ');
  const wsl = colorizePrompt(sh('wsl:Ubuntu', 'wsl'), 'Ubuntu:/mnt/d/Home/Temp$ ');
  assert.match(cmd, /\x1b\[32m/);
  assert.match(ps, /\x1b\[96m/);
  assert.match(bash, /\x1b\[95m/);
  assert.match(wsl, /\x1b\[96m/);
  assert.equal(stripAnsi(cmd), 'D:\\Home\\Temp>');
  assert.equal(stripAnsi(ps), 'PS D:\\Home\\Temp> ');
  assert.equal(stripAnsi(bash), 'MINGW64 /d/Home/Temp$ ');
  assert.equal(stripAnsi(wsl), 'Ubuntu:/mnt/d/Home/Temp$ ');
  assert.equal(stripAnsi(colorizeBanner('Git Bash')), 'Git Bash');
});

test('term-color: wrap ls / git / pwsh so piped output stays coloured', () => {
  const bash = sh('git-bash', 'posix', { file: 'bash.exe' });
  assert.equal(wrapCommandForColor(bash, 'ls -la'), 'ls --color=always -la');
  assert.match(wrapCommandForColor(bash, 'git status'), /color\.ui=always/);
  assert.equal(wrapCommandForColor(bash, 'grep foo'), 'grep --color=always foo');
  assert.equal(wrapCommandForColor(bash, 'ls --color=never'), 'ls --color=never');

  const wsl = sh('wsl:Ubuntu', 'wsl', { file: 'wsl.exe' });
  const w = wrapCommandForColor(wsl, 'ls');
  assert.match(w, /export TERM=xterm-256color/);
  assert.match(w, /ls --color=always/);

  const pwsh = sh('pwsh', 'powershell', { file: 'pwsh.exe' });
  assert.match(wrapCommandForColor(pwsh, 'Get-ChildItem'), /PSStyle\.OutputRendering/);
  const winps = sh('powershell', 'powershell', { file: 'powershell.exe' });
  assert.match(wrapCommandForColor(winps, 'Get-Date'), /PSStyle\.OutputRendering/);

  const cmd = sh('cmd', 'cmd', { file: 'cmd.exe' });
  assert.match(wrapCommandForColor(cmd, 'git log'), /color\.ui=always/);
  assert.equal(wrapCommandForColor(cmd, 'echo hi'), 'echo hi');
});

test('term-color: listings follow each shell palette', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-ls-'));
  try {
    fs.mkdirSync(path.join(dir, 'subfolder'));
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'hi');
    fs.writeFileSync(path.join(dir, 'tool.exe'), '');
    const cmd = sh('cmd', 'cmd');
    assert.ok(listingRequest(cmd, 'dir', ''));
    assert.equal(listingRequest(cmd, 'dir', '/s'), null);
    assert.equal(listingRequest(cmd, 'dir', '| more'), null);
    const cmdText = renderListing({ cwd: dir, shell: cmd, cmd: 'dir', rest: '', cols: 80 });
    assert.match(cmdText, /\x1b\[1;36msubfolder\x1b\[0m/);
    assert.match(cmdText, /<DIR>/);
    assert.match(cmdText, /\x1b\[1;32mtool\.exe\x1b\[0m/);
    assert.equal(stripAnsi(cmdText).includes('subfolder'), true);

    const ps = sh('powershell', 'powershell');
    assert.ok(listingRequest(ps, 'ls', ''));
    const psText = renderListing({ cwd: dir, shell: ps, cmd: 'Get-ChildItem', rest: '', cols: 80 });
    assert.match(psText, /Directory:/);
    assert.match(psText, /LastWriteTime/);
    assert.match(psText, /\x1b\[94msubfolder\x1b\[0m/);
    assert.equal(psText.includes('\x1b[1;36msubfolder'), false);

    const pwsh = sh('pwsh', 'powershell', { file: 'pwsh.exe' });
    assert.ok(listingRequest(pwsh, 'dir', ''));

    const bash = sh('git-bash', 'posix');
    const bashText = renderListing({ cwd: dir, shell: bash, cmd: 'ls', rest: '', cols: 80 });
    assert.match(bashText, /\x1b\[1;34msubfolder\x1b\[0m/);
    assert.equal(stripAnsi(bashText).includes('Directory of'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('term-color: command output is painted per shell', () => {
  const cmd = sh('cmd', 'cmd');
  const ps = sh('powershell', 'powershell');
  const bash = sh('git-bash', 'posix');
  assert.match(colorizeCommandOutput(cmd, 'Windows_NT\r\n', 'stdout'), /\x1b\[96mWindows_NT/);
  assert.match(colorizeCommandOutput(cmd, "'foo' is not recognized as an internal or external command\r\n", 'stdout'), /\x1b\[91m/);
  assert.match(colorizeCommandOutput(ps, 'True\n', 'stdout'), /\x1b\[92mTrue/);
  assert.match(colorizeCommandOutput(ps, '    Name : foo\n', 'stdout'), /\x1b\[96mName/);
  assert.match(colorizeCommandOutput(bash, 'ls: cannot access: No such file or directory\n', 'stdout'), /\x1b\[31m/);
  const err = colorizeCommandOutput(ps, 'boom', 'stderr');
  assert.match(err, /\x1b\[91mboom/);
  assert.equal(colorizeCommandOutput(bash, '\x1b[1;34mdir\x1b[0m\n', 'stdout'), '\x1b[1;34mdir\x1b[0m\n');
});

test('term-color: colorizeName marks directories and executables', () => {
  assert.match(colorizeName('src', true), /\x1b\[1;34m/);
  assert.match(colorizeName('app.exe', false), /\x1b\[1;32m/);
  assert.equal(colorizeName('notes.txt', false), 'notes.txt');
});

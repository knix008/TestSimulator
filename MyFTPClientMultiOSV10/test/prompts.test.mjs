// Default prompt templates must match each real shell (MyTerminal spawn
// model): cmd `D:\path>`, PowerShell `PS D:\path> `, Git Bash `MINGW64 /d/path$`,
// MSYS2 `MSYS /d/path$`, Cygwin `/cygdrive/d/path$`, WSL `Ubuntu:/mnt/d/path$`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_SHELL_PROMPTS,
  defaultPromptFor,
  formatShellPrompt,
  toPosixPromptPath,
  promptPathStyle,
} = require('../core/prompts');

const cwd = 'D:\\Home\\Temp';

function sh(id, kind, extra = {}) {
  return { id, kind, file: extra.file || id, label: extra.label || id, ...extra };
}

test('prompts: well-known shells have distinct default templates', () => {
  const ids = ['cmd', 'powershell', 'pwsh', 'git-bash', 'msys2', 'cygwin'];
  const tmpls = ids.map((id) => DEFAULT_SHELL_PROMPTS[id]);
  assert.equal(new Set(tmpls).size, ids.length, `duplicate templates: ${tmpls.join(' | ')}`);
});

test('prompts: formatted defaults match native shell styles', () => {
  const shells = [
    sh('cmd', 'cmd', { file: 'cmd.exe' }),
    sh('powershell', 'powershell', { file: 'powershell.exe' }),
    sh('pwsh', 'powershell', { file: 'pwsh.exe' }),
    sh('git-bash', 'posix', { file: 'bash.exe' }),
    sh('msys2', 'posix', { file: 'bash.exe' }),
    sh('cygwin', 'posix', { file: 'bash.exe' }),
    sh('wsl:Ubuntu', 'wsl', { file: 'wsl.exe' }),
    sh('wsl:docker-desktop', 'wsl', { file: 'wsl.exe' }),
  ];
  const rendered = shells.map((s) => formatShellPrompt(s, cwd));
  assert.equal(rendered[0], 'D:\\Home\\Temp>');
  assert.equal(rendered[1], 'PS D:\\Home\\Temp> ');
  assert.equal(rendered[2], 'pwsh D:\\Home\\Temp> ');
  assert.equal(rendered[3], 'MINGW64 /d/Home/Temp$ ');
  assert.equal(rendered[4], 'MSYS /d/Home/Temp$ ');
  assert.equal(rendered[5], '/cygdrive/d/Home/Temp$ ');
  assert.equal(rendered[6], 'Ubuntu:/mnt/d/Home/Temp$ ');
  assert.equal(rendered[7], 'docker-desktop:/mnt/d/Home/Temp$ ');
  assert.equal(new Set(rendered).size, rendered.length);
});

test('prompts: custom template per shell id does not leak to others', () => {
  const templates = { cmd: 'CMD {folder}> ', powershell: 'X {name}> ' };
  const cmd = formatShellPrompt(sh('cmd', 'cmd'), cwd, templates);
  const ps = formatShellPrompt(sh('powershell', 'powershell'), cwd, templates);
  const bash = formatShellPrompt(sh('git-bash', 'posix'), cwd, templates);
  assert.equal(cmd, 'CMD Temp> ');
  assert.equal(ps, 'X Temp> ');
  assert.equal(bash, 'MINGW64 /d/Home/Temp$ ');
});

test('prompts: path styles — windows / msys / cygdrive / wsl', () => {
  assert.equal(promptPathStyle(sh('cmd', 'cmd')), 'windows');
  assert.equal(promptPathStyle(sh('powershell', 'powershell')), 'windows');
  assert.equal(promptPathStyle(sh('git-bash', 'posix')), 'msys');
  assert.equal(promptPathStyle(sh('cygwin', 'posix')), 'cygdrive');
  assert.equal(promptPathStyle(sh('wsl:Ubuntu', 'wsl')), 'wsl');
  assert.equal(toPosixPromptPath(cwd, 'msys'), '/d/Home/Temp');
  assert.equal(toPosixPromptPath(cwd, 'cygdrive'), '/cygdrive/d/Home/Temp');
  assert.equal(toPosixPromptPath(cwd, 'wsl'), '/mnt/d/Home/Temp');
  assert.equal(defaultPromptFor(sh('cmd', 'cmd')), '{path}>');
  assert.equal(defaultPromptFor(sh('git-bash', 'posix')), 'MINGW64 {path}$ ');
  assert.equal(defaultPromptFor(sh('wsl:Ubuntu', 'wsl')), '{shell}:{path}$ ');
});

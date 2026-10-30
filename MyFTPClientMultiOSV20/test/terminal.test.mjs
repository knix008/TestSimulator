// Local terminal sessions: open / write / read / close / cap.
// Windows: cmd and PowerShell prompt, key echo, CR Enter, hangul, no CLIXML.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api');
const { MAX_SESSIONS, parseExitLine } = require('../core/terminal');
const { stripAnsi } = require('../core/term-color');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-term-'));
const cwd = os.tmpdir();

let api;

before(() => {
  api = createApi({ name: 'test', version: '0.0.0', configDir: path.join(tmp, 'config') });
});

after(async () => {
  await api.shutdown();
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); } catch { /* Windows may still hold a handle */ }
});

async function readAll(id) {
  const r = await api.call('terminal.read', { id, after: 0 });
  return (r.chunks || []).map((c) => c.data).join('');
}

function haystack(text, needle) {
  return /\x1b\[/.test(needle) ? text : stripAnsi(text);
}

function plain(text) {
  return stripAnsi(text).replace(/\r/g, '');
}

function countNeedle(text, needle) {
  const src = haystack(text, needle);
  let n = 0;
  let from = 0;
  while (true) {
    const i = src.indexOf(needle, from);
    if (i < 0) return n;
    n += 1;
    from = i + needle.length;
  }
}

async function waitFor(id, needle, ms = 4000) {
  const start = Date.now();
  let text = '';
  while (Date.now() - start < ms) {
    text = await readAll(id);
    if (haystack(text, needle).includes(needle)) return text;
    await new Promise((res) => setTimeout(res, 40));
  }
  throw new Error(`terminal output did not include ${JSON.stringify(needle)}\n---\n${text}\n---`);
}

async function waitForCount(id, needle, n, ms = 8000) {
  const start = Date.now();
  let text = '';
  while (Date.now() - start < ms) {
    text = await readAll(id);
    if (countNeedle(text, needle) >= n) return text;
    await new Promise((res) => setTimeout(res, 40));
  }
  throw new Error(`expected at least ${n}× ${JSON.stringify(needle)}\n---\n${text}\n---`);
}

async function typeKeys(id, s) {
  for (const ch of s) await api.call('terminal.write', { id, data: ch });
}

async function findShell(id) {
  const r = await api.call('terminal.shells');
  return (r.shells || []).find((s) => s.id === id) || null;
}

function probeFor(sh) {
  const id = sh.id || '';
  const kind = sh.kind || '';
  if (id === 'cmd') return { line: 'echo %OS%', expect: 'Windows_NT', prompt: /[A-Za-z]:\\[^>]*>/, banner: /명령 프롬프트|Command Prompt/, ms: 5000 };
  if (id === 'powershell') return { line: '$PSVersionTable.PSEdition', expect: /Desktop|Core/, prompt: /^[\s\S]*PS [A-Za-z]:\\/m, banner: /PowerShell/, ms: 8000 };
  if (id === 'pwsh') return { line: '$PSVersionTable.PSEdition', expect: /Desktop|Core/, prompt: /^[\s\S]*pwsh [A-Za-z]:\\/m, banner: /PowerShell/, ms: 8000 };
  if (id === 'git-bash') return { line: 'uname', expect: /MINGW|MSYS/, prompt: /MINGW64 \//, banner: /Git Bash/, ms: 8000 };
  if (id === 'msys2') return { line: 'uname', expect: /MSYS|MINGW/, prompt: /MSYS \//, banner: /MSYS2/, ms: 8000 };
  if (id === 'cygwin') return { line: 'uname', expect: /CYGWIN/, prompt: /\/cygdrive\//, banner: /Cygwin/, ms: 8000 };
  if (id === 'nu') return { line: 'echo NU-LIVE', expect: 'NU-LIVE', prompt: /nu /, banner: /Nushell/, ms: 8000 };
  if (id === 'fish') return { line: 'echo FISH-LIVE', expect: 'FISH-LIVE', prompt: />/, banner: /Fish/, ms: 8000 };
  if (kind === 'wsl' || id.startsWith('wsl:')) {
    const distro = id.startsWith('wsl:') ? id.slice(4) : 'WSL';
    return { line: 'uname', expect: 'Linux', prompt: new RegExp(`${distro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:/`), banner: /WSL/, ms: 15000 };
  }
  return { line: 'echo SHELL-LIVE', expect: 'SHELL-LIVE', prompt: /[$>]/, banner: /.+/, ms: 8000 };
}

async function waitForMatch(id, needle, ms) {
  if (typeof needle === 'string') return waitFor(id, needle, ms);
  const start = Date.now();
  let text = '';
  while (Date.now() - start < ms) {
    text = await readAll(id);
    const plainText = stripAnsi(text).replace(/\r/g, '');
    if (needle.test(text.replace(/\r/g, '')) || needle.test(plainText)) return text;
    await new Promise((res) => setTimeout(res, 40));
  }
  throw new Error(`terminal output did not match ${needle}\n---\n${text}\n---`);
}

async function waitUntilDead(id, ms = 3000) {
  const start = Date.now();
  let snap = null;
  while (Date.now() - start < ms) {
    snap = await api.call('terminal.read', { id, after: 0 });
    if (snap && snap.alive === false) return snap;
    await new Promise((res) => setTimeout(res, 40));
  }
  throw new Error(`terminal session ${id} stayed alive`);
}

test('terminal: local open, echo, read, close', async () => {
  const s = await api.call('terminal.open', { kind: 'local', cwd });
  assert.equal(s.kind, 'local');
  assert.equal(s.alive, true);
  assert.ok(s.id);
  const line = process.platform === 'win32' ? 'echo hello-term\r\n' : 'echo hello-term\n';
  await api.call('terminal.write', { id: s.id, data: line });
  await waitFor(s.id, 'hello-term');
  const listed = await api.call('terminal.list');
  assert.equal(listed.sessions.some((x) => x.id === s.id), true);
  assert.equal(listed.max, MAX_SESSIONS);
  const closed = await api.call('terminal.close', { id: s.id });
  assert.equal(closed.ok, true);
  await assert.rejects(() => api.call('terminal.read', { id: s.id }), /not found/i);
});

test('terminal: strips PowerShell CLIXML from output', () => {
  const { ClixmlFilter } = require('../core/encoding');
  assert.equal(new ClixmlFilter().push('#< CLIXML\nX Temp>'), 'X Temp>');
  const xml = '#< CLIXML\n<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" RefId="0"></Obj></Objs>\nPS C:\\> ';
  assert.equal(new ClixmlFilter().push(xml), 'PS C:\\> ');
  const err = '#< CLIXML\n<Objs Version="1.1.0.1"><S S="Error">boom_x000A_</S></Objs>\n';
  assert.equal(new ClixmlFilter().push(err), 'boom\n');
  const split = new ClixmlFilter();
  assert.equal(split.push('#< CLIXML\n'), '');
  assert.equal(split.push('hello'), 'hello');
});

test('terminal: Korean UTF-8 and CP949 decode, hangul echo', async () => {
  const { ConsoleDecoder } = require('../core/encoding');
  const utf = new ConsoleDecoder();
  assert.equal(utf.push(Buffer.from('안녕', 'utf8')), '안녕');
  const split = new ConsoleDecoder();
  const hangul = Buffer.from('한글', 'utf8');
  assert.equal(split.push(hangul.subarray(0, 2)), '');
  assert.equal(split.push(hangul.subarray(2)), '한글');
  const oem = new ConsoleDecoder();
  assert.equal(oem.push(Buffer.from([0xBE, 0xC8, 0xB3, 0xE7])), '안녕');

  const s = await api.call('terminal.open', { kind: 'local', cwd });
  try {
    await waitFor(s.id, '>', 3000);
    const line = process.platform === 'win32' ? 'echo 한글\r\n' : 'printf "%s\\n" 한글\n';
    await api.call('terminal.write', { id: s.id, data: line });
    await waitFor(s.id, '한글');
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});

test('terminal: every installed shell opens, shows its own prompt, and runs a command', async (t) => {
  const { formatShellPrompt } = require('../core/prompts');
  const r = await api.call('terminal.shells');
  assert.ok((r.shells || []).length >= 1);
  const rendered = r.shells.map((sh) => formatShellPrompt({ id: sh.id, kind: sh.kind, file: sh.path, path: sh.path }, cwd));
  assert.equal(new Set(rendered).size, rendered.length, `default prompts must be unique\n${rendered.join('\n')}`);
  for (const sh of r.shells) {
    await t.test(sh.id, async () => {
      const probe = probeFor(sh);
      const expected = formatShellPrompt({ id: sh.id, kind: sh.kind, file: sh.path, path: sh.path }, cwd);
      const s = await api.call('terminal.open', { kind: 'local', cwd, shellId: sh.id });
      try {
        assert.equal(s.shellId, sh.id);
        const opened = await waitFor(s.id, expected, probe.ms);
        assert.match(plain(opened), probe.banner);
        assert.match(plain(opened), probe.prompt);
        await api.call('terminal.write', { id: s.id, data: `${probe.line}\r` });
        await waitForMatch(s.id, probe.expect, probe.ms);
        await waitForCount(s.id, expected, 2, probe.ms);
      } finally {
        await api.call('terminal.close', { id: s.id });
      }
    });
  }
});

test('terminal: lists installed shells and opens a chosen one', async () => {
  const r = await api.call('terminal.shells');
  assert.ok(Array.isArray(r.shells) && r.shells.length >= 1);
  for (const s of r.shells) {
    assert.ok(s.id && s.label && s.path);
  }
  if (process.platform === 'win32') {
    assert.ok(r.shells.some((s) => s.id === 'cmd'), 'cmd should be listed');
    assert.ok(r.shells.some((s) => s.id === 'powershell'), 'powershell should be listed');
  }
  const sh = r.shells.find((s) => s.preferred) || r.shells[0];
  const opened = await api.call('terminal.open', { kind: 'local', cwd, shellId: sh.id });
  assert.equal(opened.shellId, sh.id);
  await api.call('terminal.close', { id: opened.id });
  await assert.rejects(() => api.call('terminal.open', { kind: 'local', cwd, shellId: '__missing_shell__' }), /not installed|not found/i);
});

test('terminal: cmd and powershell look and run differently', async (t) => {
  if (process.platform !== 'win32') { t.skip(); return; }
  if (!await findShell('cmd') || !await findShell('powershell')) { t.skip(); return; }
  const cmd = await api.call('terminal.open', { kind: 'local', cwd, shellId: 'cmd' });
  const ps = await api.call('terminal.open', { kind: 'local', cwd, shellId: 'powershell' });
  try {
    const cmdText = await waitFor(cmd.id, '>', 3000);
    const psText = await waitFor(ps.id, 'PS ', 3000);
    assert.match(cmdText, /명령 프롬프트|Command Prompt/);
    assert.equal(/PS [A-Za-z]:\\/.test(plain(cmdText)), false);
    assert.match(psText, /Windows PowerShell/);
    assert.match(plain(psText), /PS [A-Za-z]:\\/);

    await api.call('terminal.write', { id: cmd.id, data: 'echo %OS%\r' });
    await waitFor(cmd.id, 'Windows_NT', 5000);
    await api.call('terminal.write', { id: ps.id, data: 'echo %OS%\r' });
    const psEcho = await waitForCount(ps.id, '%OS%', 2, 5000);
    assert.equal(psEcho.includes('Windows_NT'), false);
  } finally {
    await api.call('terminal.close', { id: cmd.id });
    await api.call('terminal.close', { id: ps.id });
  }
});

test('terminal: git-bash uses a posix prompt', async (t) => {
  if (process.platform !== 'win32') { t.skip(); return; }
  if (!await findShell('git-bash')) { t.skip(); return; }
  const s = await api.call('terminal.open', { kind: 'local', cwd, shellId: 'git-bash' });
  try {
    const text = await waitFor(s.id, '$ ', 5000);
    assert.match(text, /Git Bash/);
    assert.match(plain(text), /MINGW64 \/[a-z]\//);
    await api.call('terminal.write', { id: s.id, data: 'uname\r' });
    await waitFor(s.id, 'MINGW', 8000);
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});

test('terminal: cmd prompt, key echo, CR Enter, hangul', async (t) => {
  if (process.platform !== 'win32') { t.skip(); return; }
  if (!await findShell('cmd')) { t.skip(); return; }
  const s = await api.call('terminal.open', { kind: 'local', cwd, shellId: 'cmd' });
  try {
    const prompt = await waitFor(s.id, '>', 5000);
    assert.match(plain(prompt), /[A-Za-z]:\\.*>/);
    assert.equal(prompt.includes('#< CLIXML'), false);

    await typeKeys(s.id, 'ver');
    const typed = await waitFor(s.id, 'ver', 2000);
    assert.equal(/Microsoft Windows/i.test(typed), false, 'ver must not run before Enter');

    await api.call('terminal.write', { id: s.id, data: '\r' });
    const verOut = await waitFor(s.id, 'Windows', 5000);
    assert.match(verOut, /Microsoft Windows/i);

    await typeKeys(s.id, 'verx');
    await api.call('terminal.write', { id: s.id, data: '\x7f' });
    await api.call('terminal.write', { id: s.id, data: '\r' });
    await waitForCount(s.id, 'Microsoft Windows', 2, 5000);

    await typeKeys(s.id, 'echo 한글-cmd');
    await api.call('terminal.write', { id: s.id, data: '\r' });
    const hangul = await waitForCount(s.id, '한글-cmd', 2, 5000);
    assert.match(plain(hangul), /[A-Za-z]:\\.*>\s*$/);
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});

test('terminal: powershell prompt, cmdlet, hangul, no CLIXML', async (t) => {
  if (process.platform !== 'win32') { t.skip(); return; }
  if (!await findShell('powershell')) { t.skip(); return; }
  const s = await api.call('terminal.open', { kind: 'local', cwd, shellId: 'powershell' });
  try {
    const prompt = await waitFor(s.id, 'PS ', 8000);
    assert.equal(prompt.includes('#< CLIXML'), false);
    assert.match(plain(prompt), /PS [A-Za-z]:\\/);
    assert.equal(prompt.includes('Microsoft.PowerShell.Core\\FileSystem::'), false);

    await typeKeys(s.id, '$PSVersionTable.PSEdition');
    const typed = await waitFor(s.id, 'PSEdition', 2000);
    assert.equal(/\bDesktop\b|\bCore\b/.test(typed), false, 'cmdlet must not run before Enter');

    await api.call('terminal.write', { id: s.id, data: '\r' });
    let out = '';
    try { out = await waitFor(s.id, 'Desktop', 8000); }
    catch { out = await waitFor(s.id, 'Core', 4000); }
    assert.equal(out.includes('#< CLIXML'), false);
    assert.match(out, /\bDesktop\b|\bCore\b/);
    await waitForCount(s.id, 'Temp>', 2, 8000);

    await typeKeys(s.id, 'Write-Output 한글-ps');
    await api.call('terminal.write', { id: s.id, data: '\r' });
    const hangul = await waitForCount(s.id, '한글-ps', 2, 8000);
    assert.equal(hangul.includes('#< CLIXML'), false);
    const after = await waitForCount(s.id, 'Temp>', 3, 8000);
    assert.match(plain(after), /PS [A-Za-z]:\\.*>\s*$/);
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});

test('terminal: custom cmd prompt is not the powershell prompt', async (t) => {
  if (process.platform !== 'win32') { t.skip(); return; }
  if (!await findShell('cmd') || !await findShell('powershell')) { t.skip(); return; }
  await api.call('session.save', { patch: { shellPrompts: { cmd: 'CMD {folder}> ', powershell: 'PSX {folder}> ' } } });
  const cmd = await api.call('terminal.open', { kind: 'local', cwd, shellId: 'cmd' });
  const ps = await api.call('terminal.open', { kind: 'local', cwd, shellId: 'powershell' });
  try {
    const cmdText = await waitFor(cmd.id, 'CMD ', 5000);
    const psText = await waitFor(ps.id, 'PSX ', 8000);
    assert.match(plain(cmdText), /CMD \S+> /);
    assert.match(plain(psText), /PSX \S+> /);
    assert.equal(cmdText.includes('PSX '), false);
    assert.equal(psText.includes('CMD '), false);
  } finally {
    await api.call('terminal.close', { id: cmd.id });
    await api.call('terminal.close', { id: ps.id });
    await api.call('session.save', { patch: { shellPrompts: { cmd: '{path}>', powershell: 'PS {path}> ' } } });
  }
});

test('terminal: custom powershell prompt template', async (t) => {
  if (process.platform !== 'win32') { t.skip(); return; }
  const sh = (await findShell('powershell')) || (await findShell('pwsh'));
  if (!sh) { t.skip(); return; }
  await api.call('session.save', { patch: { powershellPrompt: 'X {name}> ' } });
  const s = await api.call('terminal.open', { kind: 'local', cwd, shellId: sh.id });
  try {
    const text = await waitFor(s.id, 'X ', 8000);
    assert.equal(text.includes('#< CLIXML'), false);
    assert.match(plain(text), /X \S+>/);
  } finally {
    await api.call('terminal.close', { id: s.id });
    await api.call('session.save', { patch: { powershellPrompt: 'PS {path}> ' } });
  }
});

test('terminal: buildShellSpawn matches MyTerminal one-shot shape', () => {
  const { buildShellSpawn } = require('../core/shells');
  const cmd = buildShellSpawn({ file: 'cmd.exe', kind: 'cmd' }, 'ver');
  assert.deepEqual(cmd.args, ['/d', '/s', '/c', '"ver"']);
  assert.equal(cmd.options.windowsVerbatimArguments, true);
  const ps = buildShellSpawn({ file: 'powershell.exe', kind: 'powershell' }, 'Get-Location');
  assert.deepEqual(ps.args, ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Get-Location']);
  const bash = buildShellSpawn({ file: 'bash', kind: 'posix' }, 'echo hi');
  assert.deepEqual(bash.args, ['-c', 'echo hi']);
});

test('terminal: cmd cd persists for the next command', async (t) => {
  if (process.platform !== 'win32') { t.skip(); return; }
  if (!await findShell('cmd')) { t.skip(); return; }
  const s = await api.call('terminal.open', { kind: 'local', cwd, shellId: 'cmd' });
  try {
    await waitFor(s.id, '>', 3000);
    await api.call('terminal.write', { id: s.id, data: 'cd ..\r' });
    const parent = path.dirname(cwd);
    const text = await waitFor(s.id, `${parent}>`, 5000);
    assert.match(plain(text), new RegExp(`${parent.replace(/\\/g, '\\\\')}>\\s*$`));
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});
test('terminal: dir and ls print coloured names', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myftp-color-'));
  fs.mkdirSync(path.join(dir, 'subfolder'));
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'hi');
  const shells = [];
  if (process.platform === 'win32') {
    if (await findShell('cmd')) shells.push({ id: 'cmd', line: 'dir\r' });
    if (await findShell('powershell')) shells.push({ id: 'powershell', line: 'dir\r' });
    if (await findShell('git-bash')) shells.push({ id: 'git-bash', line: 'ls --color=always\r' });
  } else {
    shells.push({ id: undefined, line: 'ls --color=always\n' });
  }
  if (!shells.length) { t.skip(); return; }
  try {
    for (const sh of shells) {
      const s = await api.call('terminal.open', { kind: 'local', cwd: dir, shellId: sh.id });
      try {
        await waitForMatch(s.id, /[$>]/, 8000);
        await api.call('terminal.write', { id: s.id, data: sh.line });
        const text = await waitFor(s.id, 'subfolder', 8000);
        assert.match(
          text,
          /\x1b\[(?:1;34|01;34|1;36|94|34)m/,
          `${sh.id || 'default'} listing should colour directories`
        );
        assert.equal(plain(text).includes('subfolder'), true);
      } finally {
        await api.call('terminal.close', { id: s.id });
      }
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('terminal: tab completes a command and a unique path', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfc-tab-'));
  fs.writeFileSync(path.join(dir, 'unique-complete.txt'), 'ok');
  fs.mkdirSync(path.join(dir, 'onlydir'));
  const s = await api.call('terminal.open', { kind: 'local', cwd: dir, shellId: process.platform === 'win32' ? 'cmd' : undefined });
  try {
    await waitForMatch(s.id, /[$>]/, 4000);
    await typeKeys(s.id, 'ech');
    await api.call('terminal.write', { id: s.id, data: '\t' });
    await waitFor(s.id, 'echo ', 2000);
    await api.call('terminal.write', { id: s.id, data: '\u0003' });
    await typeKeys(s.id, 'cd only');
    await api.call('terminal.write', { id: s.id, data: '\t' });
    await waitFor(s.id, 'onlydir', 2000);
    await api.call('terminal.write', { id: s.id, data: '\u0003' });
    await typeKeys(s.id, 'type unique-com');
    await api.call('terminal.write', { id: s.id, data: '\t' });
    await waitFor(s.id, 'unique-complete.txt', 2000);
  } finally {
    await api.call('terminal.close', { id: s.id });
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('terminal: parseExitLine accepts exit / quit / logout / bye', () => {
  assert.deepEqual(parseExitLine('exit'), { command: 'exit', code: 0 });
  assert.deepEqual(parseExitLine('  EXIT  '), { command: 'exit', code: 0 });
  assert.deepEqual(parseExitLine('QUIT'), { command: 'quit', code: 0 });
  assert.deepEqual(parseExitLine('logout'), { command: 'logout', code: 0 });
  assert.deepEqual(parseExitLine('bye'), { command: 'bye', code: 0 });
  assert.deepEqual(parseExitLine('exit 7'), { command: 'exit', code: 7 });
  assert.deepEqual(parseExitLine('exit -1'), { command: 'exit', code: -1 });
  assert.deepEqual(parseExitLine('exit /b 2'), { command: 'exit', code: 2 });
  assert.deepEqual(parseExitLine('exit /B 4;'), { command: 'exit', code: 4 });
  assert.deepEqual(parseExitLine('exit;'), { command: 'exit', code: 0 });
  assert.equal(parseExitLine(''), null);
  assert.equal(parseExitLine('echo exit'), null);
  assert.equal(parseExitLine('exiting'), null);
  assert.equal(parseExitLine('exit foo'), null);
  assert.equal(parseExitLine('cd'), null);
});

test('terminal: exit, quit, logout, bye and Ctrl+D end the session', async () => {
  async function leave(line) {
    const s = await api.call('terminal.open', { kind: 'local', cwd });
    try {
      await waitForMatch(s.id, /[$>]/, 4000);
      await api.call('terminal.write', { id: s.id, data: line });
      const snap = await waitUntilDead(s.id);
      assert.equal(snap.alive, false);
      assert.match(plain(await readAll(s.id)), /Bye|exit/);
      return snap;
    } finally {
      try { await api.call('terminal.close', { id: s.id }); } catch { /* already gone */ }
    }
  }
  assert.equal((await leave('exit 3\r')).exitCode, 3);
  assert.equal((await leave('quit\r')).exitCode, 0);
  assert.equal((await leave('logout\r')).exitCode, 0);
  assert.equal((await leave('bye\r')).exitCode, 0);
  assert.equal((await leave('\u0004')).exitCode, 0);
});

test('terminal: a non-exit command leaves the session running', async () => {
  const s = await api.call('terminal.open', { kind: 'local', cwd });
  try {
    await waitForMatch(s.id, /[$>]/, 4000);
    await api.call('terminal.write', { id: s.id, data: 'echo stay-open\r' });
    await waitFor(s.id, 'stay-open', 4000);
    await api.call('terminal.write', { id: s.id, data: 'echo exit\r' });
    await new Promise((res) => setTimeout(res, 300));
    const snap = await api.call('terminal.read', { id: s.id, after: 0 });
    assert.equal(snap.alive, true);
    assert.equal(snap.exitCode, null);
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});

test('terminal: writes are ignored after exit and the registry emits exit', async () => {
  const s = await api.call('terminal.open', { kind: 'local', cwd });
  const seen = [];
  const onExit = (id, code) => { if (id === s.id) seen.push(code); };
  api.terminals.on('exit', onExit);
  try {
    await waitForMatch(s.id, /[$>]/, 4000);
    await api.call('terminal.write', { id: s.id, data: 'exit 9\r' });
    const snap = await waitUntilDead(s.id);
    assert.equal(snap.exitCode, 9);
    assert.deepEqual(seen, [9]);
    const before = await readAll(s.id);
    await api.call('terminal.write', { id: s.id, data: 'echo SHOULD-NOT-RUN\r' });
    await new Promise((res) => setTimeout(res, 150));
    assert.equal(await readAll(s.id), before);
    assert.equal((await api.call('terminal.read', { id: s.id, after: 0 })).alive, false);
    assert.equal(plain(before).includes('SHOULD-NOT-RUN'), false);
  } finally {
    api.terminals.off('exit', onExit);
    try { await api.call('terminal.close', { id: s.id }); } catch { /* already gone */ }
  }
});

test('terminal: cmd and powershell both honor exit', async () => {
  const ids = ['cmd', 'powershell'];
  for (const shellId of ids) {
    if (!(await findShell(shellId))) continue;
    const s = await api.call('terminal.open', { kind: 'local', cwd, shellId });
    try {
      await waitForMatch(s.id, /[$>]/, 8000);
      await api.call('terminal.write', { id: s.id, data: 'exit\r' });
      const snap = await waitUntilDead(s.id, 5000);
      assert.equal(snap.alive, false, shellId);
      assert.equal(snap.exitCode, 0, shellId);
    } finally {
      try { await api.call('terminal.close', { id: s.id }); } catch { /* already gone */ }
    }
  }
});

test('terminal: CR-only Enter runs a command', async () => {
  const s = await api.call('terminal.open', { kind: 'local', cwd });
  try {
    await waitFor(s.id, '>', 3000);
    const cmd = process.platform === 'win32' ? 'ver\r' : 'uname\r';
    const needle = process.platform === 'win32' ? 'Windows' : (process.platform === 'darwin' ? 'Darwin' : 'Linux');
    await api.call('terminal.write', { id: s.id, data: cmd });
    await waitFor(s.id, needle, 5000);
  } finally {
    await api.call('terminal.close', { id: s.id });
  }
});

test('terminal: missing session and remote without connection', async () => {
  await assert.rejects(() => api.call('terminal.write', { id: 9999, data: 'x' }), /not found/i);
  await assert.rejects(() => api.call('terminal.open', { kind: 'remote', connId: 1 }), /not connected/i);
});

test('terminal: session cap', async () => {
  const ids = [];
  try {
    for (let i = 0; i < MAX_SESSIONS; i++) {
      const s = await api.call('terminal.open', { kind: 'local', cwd });
      ids.push(s.id);
    }
    await assert.rejects(() => api.call('terminal.open', { kind: 'local', cwd }), /at most/i);
  } finally {
    for (const id of ids) await api.call('terminal.close', { id });
  }
});

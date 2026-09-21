import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { RECIPES } = require('../core/install');
const { lintTools, createLinter } = require('../core/lint');

test('linters that can be installed have a recipe', () => {
  for (const id of ['eslint', 'ruff', 'pyflakes', 'yamllint', 'markdownlint', 'stylelint', 'shellcheck', 'pssa', 'rubocop', 'kubeconform']) {
    assert.ok(RECIPES[id], `${id} has an install recipe`);
    assert.notEqual(RECIPES[id].kind, 'manual', `${id} installs automatically`);
  }
});

test('lint.tools marks installable checkers and built-ins stay local', () => {
  const tools = lintTools();
  const js = tools.JavaScript.find((x) => x.id === 'eslint');
  assert.equal(js.installable, true);
  const json = tools.JSON.find((x) => x.id === 'json');
  assert.equal(json.available, true);
  assert.equal(json.installable, false);
  const py = tools.Python.find((x) => x.id === 'ruff');
  assert.equal(py.installable, true);
  const linter = createLinter({ toolsDir: path.join(root, 'no-such-tools') });
  const listed = linter.tools({ dir: root });
  assert.ok(listed.JavaScript.some((x) => x.id === 'eslint' && x.installable));
});

test('settings starts the install progress when a missing checker is chosen', () => {
  const dlg = fs.readFileSync(path.join(root, 'src', 'dialogs', 'SettingsDialog.jsx'), 'utf8');
  assert.match(dlg, /startLintInstall/);
  assert.match(dlg, /setAskLintInstall\(\{ lang, tool \}\)/);
  assert.match(dlg, /if \(r === 'yes'\) startLintInstall\(a\.tool, a\.lang\)/);
  assert.match(dlg, /inst_ask_lint_msg/);
  assert.match(dlg, /install\.start/);
  assert.match(dlg, /setJob\(\{ tool: tool\.id, lang, id: st\.id, kind: 'lint', installRuntime \}\)/);
  assert.match(dlg, /setAskRuntime/);
  assert.match(dlg, /installRuntime: true/);
  assert.match(dlg, /inst_ask_runtime_msg/);
  assert.match(dlg, /<InstallDialog/);
  const api = fs.readFileSync(path.join(root, 'core', 'api.js'), 'utf8');
  assert.match(api, /createLinter\(\{ toolsDir \}\)/);
  assert.match(api, /'lint\.tools': async \(\{ dir, refresh \}\)/);
  assert.match(api, /installRuntime: !!installRuntime/);
  const i18n = fs.readFileSync(path.join(root, 'src', 'lib', 'i18n.js'), 'utf8');
  assert.match(i18n, /inst_ask_lint_msg: '\{lang\} 검사 도구 \{tool\}/);
  assert.match(i18n, /inst_ask_lint_msg: 'The \{lang\} checker \{tool\}/);
  assert.match(i18n, /lint_not_installed_auto: '설치 안 됨 · 선택하면 설치 여부 확인'/);
  assert.match(i18n, /lint_not_installed_auto: 'not installed · asked when selected'/);
});

test('install dialog shows numbered steps and hides the raw log', () => {
  const dlg = fs.readFileSync(path.join(root, 'src', 'dialogs', 'InstallDialog.jsx'), 'utf8');
  assert.match(dlg, /inst-steps/);
  assert.match(dlg, /inst_log_show/);
  assert.match(dlg, /installProgress/);
  assert.match(dlg, /inst_retry/);
  assert.match(dlg, /install\.start/);
  assert.match(dlg, /canRetry/);
  const steps = fs.readFileSync(path.join(root, 'src', 'lib', 'install-progress.js'), 'utf8');
  assert.match(steps, /inst_step_ready/);
  assert.match(steps, /inst_step_fetch/);
  assert.match(steps, /inst_step_apply/);
  assert.match(steps, /inst_step_finish/);
  const i18n = fs.readFileSync(path.join(root, 'src', 'lib', 'i18n.js'), 'utf8');
  assert.match(i18n, /1\. 패키지 관리자 확인/);
  assert.match(i18n, /1\. Check the package manager/);
  assert.match(i18n, /inst_step_fetch: '패키지 내려받기'/);
  assert.match(i18n, /inst_log_show: '설치 로그 보기'/);
  assert.match(i18n, /inst_retry: '다시 시도'/);
  assert.match(i18n, /inst_retry: 'Try again'/);
});

test('eslint installed under My Editor tools reports findings, including untitled files', async () => {
  const { unwrapNpmShim, createLinter } = require('../core/lint');
  const toolsDir = path.join(process.env.APPDATA || '', 'My Editor', 'tools');
  const cmd = path.join(toolsDir, 'node', 'node_modules', '.bin', 'eslint.cmd');
  if (!fs.existsSync(cmd)) return;
  const shim = unwrapNpmShim(cmd);
  assert.ok(shim, 'eslint.cmd must unwrap to node + eslint.js');
  assert.match(shim.cmd, /node(\.exe)?$/i);
  assert.match(shim.pre[0], /eslint\.js$/);
  const linter = createLinter({ toolsDir });
  const bad = 'export function f() {\n  return noSuchVar;\n}\n';
  const named = await linter.run({ id: 1, path: path.join(root, 'a.js'), name: 'a.js', language: 'JavaScript', text: bad, tool: 'eslint' });
  assert.equal(named.error, null, named.error);
  assert.ok((named.diagnostics || []).some((d) => /noSuchVar|undef/i.test(d.message)), JSON.stringify(named.diagnostics));
  const untitled = await linter.run({ id: 2, path: '', name: '제목 없음 1', language: 'JavaScript', text: bad, tool: 'eslint' });
  assert.equal(untitled.error, null, untitled.error);
  assert.ok((untitled.diagnostics || []).some((d) => /noSuchVar|undef/i.test(d.message)), JSON.stringify(untitled.diagnostics));
});

test('npm install runs node npm-cli.js so a prefix with a space does not crash', () => {
  const { commandFor, findNpmCli, isNtCrash, RECIPES: R } = require('../core/install');
  assert.equal(isNtCrash(3221226505), true);
  assert.equal(isNtCrash(-1073740791), true);
  assert.equal(isNtCrash(1), false);
  const via = findNpmCli();
  assert.ok(via, 'node + npm-cli.js must be on this machine');
  const dir = path.join(os.tmpdir(), 'My Editor-tools');
  const c = commandFor(R.eslint, dir);
  assert.equal(c.cmd, via.node);
  assert.equal(c.args[0], via.cli);
  assert.equal(path.basename(c.args[0]), 'npm-cli.js');
  assert.equal(c.shell, undefined);
  const prefix = c.args[c.args.indexOf('--prefix') + 1];
  assert.match(prefix, /My Editor-tools/);
  assert.ok(c.args.includes('eslint'));
});

test('untitled markdown is checked and lint.run forgets cached bins after install', () => {
  const dlg = fs.readFileSync(path.join(root, 'src', 'dialogs', 'SettingsDialog.jsx'), 'utf8');
  assert.match(dlg, /next\[done\.lang\] = done\.tool/);
  assert.match(dlg, /lint\.tools.*refresh: true/);
  assert.match(dlg, /onApplied/);
  assert.match(dlg, /lintToolsAt/);
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /detectLanguageFromText/);
  assert.match(app, /languageByName\(doc\.langName\)/);
  assert.match(app, /if \(!booted \|\| !settings\.lint\) return/);
  assert.match(app, /setBooted\(true\);\s*if \(settingsRef\.current\.lint\) lintAll\(\)/);
  assert.match(app, /scheduleLint\(doc\.id, 0\)/);
  assert.match(app, /\.catch\(\(\) => \{ scheduleLint\(doc\.id, 0\); \}\)/);
  assert.doesNotMatch(app, /Markdown && !doc\.path/);
  assert.match(app, /patch\.lintToolsAt/);
  const inst = fs.readFileSync(path.join(root, 'src', 'dialogs', 'InstallDialog.jsx'), 'utf8');
  assert.match(inst, /onApplied/);
  assert.match(inst, /st\.state === 'done'/);
  const lint = fs.readFileSync(path.join(root, 'core', 'lint.js'), 'utf8');
  assert.match(lint, /forgetBins\(\);\r?\n\s*const prev = running/);
  assert.match(lint, /pre: \['-m', rec\.module\]/);
  assert.match(lint, /stylelint-fallback/);
  assert.match(lint, /pythonUserDirs/);
  assert.ok(fs.existsSync(path.join(root, 'core', 'stylelint-fallback.config.cjs')));
});

test('exec runs python -m style used after a pip install', async () => {
  const { exec, onPath } = require('../core/lint');
  const py = onPath('python') || onPath('python3') || onPath('py');
  if (!py) return;
  const r = await exec({ cmd: py, pre: ['-c'] }, ['print(41+1)']);
  assert.equal((r.stdout || '').trim(), '42', r.stderr || r.error);
});

const INSTALL_CASES = [
  { language: 'JavaScript', tool: 'eslint', name: 'a.js', bad: 'export function f() {\n  return noSuchVar;\n}\n', want: /noSuchVar|undef/i },
  { language: 'Python', tool: 'ruff', name: 'a.py', bad: 'def f():\n    return undefined_name\n', want: /undefined|F821/i },
  { language: 'Python', tool: 'pyflakes', name: 'a.py', bad: 'def f():\n    return undefined_name\n', want: /undefined/i },
  { language: 'YAML', tool: 'yamllint', name: 'a.yaml', bad: 'a: 1    \n', want: /trailing|space|document-start|syntax|line/i },
  { language: 'Shell', tool: 'shellcheck', name: 'a.sh', bad: 'echo $unquoted\n', want: /quote|SC2086|SC2154|unquoted|assigned/i },
  { language: 'Markdown', tool: 'markdownlint', name: 'a.md', bad: '# Title\n# Another\n', want: /heading|MD|space|blank/i },
  { language: 'CSS', tool: 'stylelint', name: 'a.css', bad: 'a { color: #xyz; }\n', want: /hex|color|invalid|empty/i },
  { language: 'PowerShell', tool: 'pssa', name: 'a.ps1', bad: 'Write-Host $undefinedVar\n', want: /PSAvoid|undefined|Host|alias|not used/i },
  { language: 'Ruby', tool: 'rubocop', name: 'a.rb', bad: 'def f\n  x = 1\nend\n', want: /unused|Lint|Style|Convention|error/i },
  { language: 'YAML', tool: 'kubeconform', name: 'svc.yaml', bad: 'apiVersion: v1\nkind: Service\nmetadata:\n  name: demo\nspec:\n  ports:\n    - port: foo\n', want: /invalid|error|integer|schema|port/i },
];

test('installed checkers still report findings after a rescan, including untitled buffers', { timeout: 120000 }, async () => {
  const { createLinter, forgetBins, resolveLintExe, LINTERS } = require('../core/lint');
  forgetBins();
  const toolsDir = path.join(process.env.APPDATA || '', 'My Editor', 'tools');
  const linter = createLinter({ toolsDir: fs.existsSync(toolsDir) ? toolsDir : path.join(os.tmpdir(), 'med-no-tools') });
  const listed = linter.tools({ dir: root, refresh: true });
  for (const c of INSTALL_CASES) {
    const row = (listed[c.language] || []).find((x) => x.id === c.tool);
    if (!row || !row.available) continue;
    const t = (LINTERS[c.language] || []).find((x) => x.id === c.tool);
    assert.ok(resolveLintExe(t, { dir: root, toolsDir: fs.existsSync(toolsDir) ? toolsDir : undefined }), `${c.tool} must resolve after install`);
    const untitled = await linter.run({ id: `${c.language}:${c.tool}:untitled`, path: '', name: '제목 없음 1', language: c.language, text: c.bad, tool: c.tool });
    assert.equal(untitled.error, null, `${c.language}/${c.tool} untitled: ${untitled.error}`);
    const finding = (untitled.diagnostics || []).map((d) => d.message).join(' | ');
    assert.ok((untitled.diagnostics || []).some((d) => c.want.test(d.message)), `${c.language}/${c.tool} untitled findings: ${finding}`);
    const named = await linter.run({ id: `${c.language}:${c.tool}:file`, path: path.join(root, c.name), name: c.name, language: c.language, text: c.bad, tool: c.tool });
    assert.equal(named.error, null, `${c.language}/${c.tool} file: ${named.error}`);
    assert.ok((named.diagnostics || []).some((d) => c.want.test(d.message)), `${c.language}/${c.tool} file findings: ${(named.diagnostics || []).map((d) => d.message).join(' | ')}`);
  }
});

test('node --check can use Electron when node is not on PATH', () => {
  const { nodeExe, electronAsNode, isElectronBin } = require('../core/lint');
  assert.equal(electronAsNode(), null);
  assert.equal(isElectronBin('C:\\\\Program Files\\\\My Editor\\\\My Editor.exe'), true);
  assert.equal(isElectronBin('C:\\\\Users\\\\x\\\\AppData\\\\Local\\\\Programs\\\\MyEditor\\\\MyEditor.exe'), true);
  assert.equal(isElectronBin('C:\\\\app\\\\electron.exe'), true);
  assert.equal(isElectronBin('C:\\\\nodejs\\\\node.exe'), false);
  const n = nodeExe();
  assert.ok(n, 'a node binary is available in this test environment');
});

test('applyToolPath prepends the app tools bin so a GUI launch finds checkers', () => {
  const { extraBinDirs, applyToolPath } = require('../core/pathenv');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'med-path-'));
  const bin = path.join(tmp, 'node', 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  assert.ok(extraBinDirs(tmp).some((d) => d.toLowerCase() === bin.toLowerCase()));
  const before = process.env.PATH;
  try {
    const added = applyToolPath(tmp);
    const parts = (process.env.PATH || '').split(path.delimiter).map((d) => d.toLowerCase());
    assert.ok(added.some((d) => d.toLowerCase() === bin.toLowerCase()) || parts.includes(bin.toLowerCase()));
    assert.ok(parts.includes(bin.toLowerCase()));
  } finally {
    process.env.PATH = before;
  }
});

test('eslint fallback config is copied out of app.asar for the child process', () => {
  const { configForChild } = require('../core/lint');
  const real = path.join(root, 'core', 'eslint-fallback.config.cjs');
  assert.equal(configForChild(real), real);
  const asarDir = path.join(os.tmpdir(), 'med-asar', 'app.asar', 'core');
  fs.mkdirSync(asarDir, { recursive: true });
  const asarFile = path.join(asarDir, 'eslint-fallback.config.cjs');
  fs.copyFileSync(real, asarFile);
  const out = configForChild(asarFile);
  assert.ok(!out.includes(`${path.sep}app.asar${path.sep}`), out);
  assert.ok(fs.existsSync(out));
  assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(real, 'utf8'));
  const api = fs.readFileSync(path.join(root, 'core', 'api.js'), 'utf8');
  assert.match(api, /applyToolPath\(toolsDir\)/);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok((pkg.build.asarUnpack || []).some((p) => /eslint-fallback/.test(p)));
});

test('Windows Store python stubs are not treated as an installed Python', () => {
  const { isAppAlias, runtimeMissing } = require('../core/runtime');
  assert.equal(isAppAlias('C:\\\\Users\\\\x\\\\AppData\\\\Local\\\\Microsoft\\\\WindowsApps\\\\python.exe'), true);
  assert.equal(isAppAlias('C:\\\\Users\\\\x\\\\AppData\\\\Local\\\\Microsoft\\\\WindowsApps\\\\python3.exe'), true);
  assert.equal(isAppAlias('C:\\\\Users\\\\x\\\\AppData\\\\Local\\\\Microsoft\\\\WindowsApps\\\\winget.exe'), false);
  assert.equal(runtimeMissing('npm').runtime, 'node');
  assert.equal(runtimeMissing('pip').runtime, 'python');
  assert.equal(runtimeMissing('npm').missing, 'Node.js');
  const i18n = fs.readFileSync(path.join(root, 'src', 'lib', 'i18n.js'), 'utf8');
  assert.match(i18n, /inst_ask_runtime_title: '\{pm\} 설치'/);
  assert.match(i18n, /inst_ask_runtime_title: 'Install \{pm\}'/);
  assert.match(i18n, /inst_ask_runtime_msg: '\{tool\} 을\(를\) 쓰려면 \{pm\}/);
  assert.match(i18n, /inst_ask_runtime_msg: '\{pm\} is required to use \{tool\}/);
  const { commandFor, RECIPES: R } = require('../core/install');
  const pip = commandFor(R.ruff, path.join(os.tmpdir(), 'med-no-tools'));
  if (pip.missing) {
    assert.equal(pip.runtime, 'python');
    assert.equal(pip.missing, 'Python');
  } else {
    assert.ok(pip.cmd);
    assert.ok(pip.args.includes('ruff'));
  }
});



import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  assert.match(dlg, /if \(r === 'yes'\) startLintInstall\(a\.tool\)/);
  assert.match(dlg, /inst_ask_lint_msg/);
  assert.match(dlg, /install\.start/);
  assert.match(dlg, /setJob\(\{ tool: tool\.id, id: st\.id \}\)/);
  assert.match(dlg, /lint_not_installed_auto/);
  assert.match(dlg, /<InstallDialog/);
  const api = fs.readFileSync(path.join(root, 'core', 'api.js'), 'utf8');
  assert.match(api, /createLinter\(\{ toolsDir \}\)/);
  assert.match(api, /'lint\.tools': async \(\{ dir, refresh \}\)/);
  const i18n = fs.readFileSync(path.join(root, 'src', 'lib', 'i18n.js'), 'utf8');
  assert.match(i18n, /inst_ask_lint_msg: '\{lang\} 검사 도구 \{tool\}/);
  assert.match(i18n, /inst_ask_lint_msg: 'The \{lang\} checker \{tool\}/);
  assert.match(i18n, /lint_not_installed_auto: '설치 안 됨 · 선택하면 설치 여부 확인'/);
  assert.match(i18n, /lint_not_installed_auto: 'not installed · asked when selected'/);
});

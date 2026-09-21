// One case per registered checker (language + tool id): a broken buffer
// must produce a matching finding, a clean buffer must not produce errors.
// Missing tools are skipped so the table stays complete on every machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createLinter, LINTERS } = require('../core/lint');

const work = path.join(root, 'test', 'fixtures', 'lint');
const toolsDir = path.join(process.env.APPDATA || '', 'My Editor', 'tools');
const linter = createLinter({ toolsDir: fs.existsSync(toolsDir) ? toolsDir : path.join(os.tmpdir(), 'med-no-tools') });
const listed = linter.tools({ dir: work, refresh: true });

const C_BAD = 'int main(void) { retrn 0; }\n';
const C_GOOD = 'int main(void) { return 0; }\n';
const CXX_BAD = 'int main() { retrn 0; }\n';
const CXX_GOOD = 'int main() { return 0; }\n';
const C_WANT = /retrn|undeclared|not declared/i;
const STYLE_BAD = 'a { color: #xyz; }\n';
const STYLE_GOOD = 'a { color: #fff; }\n';
const STYLE_WANT = /hex|color|invalid|empty/i;
const JS_BAD = 'export function f() {\n  return noSuchVar;\n}\n';
const JS_GOOD = 'export function f(x) {\n  return x;\n}\n';
const JS_WANT = /noSuchVar|undef/i;

const CASES = [
  { language: 'JavaScript', tool: 'eslint', file: 'a.js', bad: JS_BAD, good: JS_GOOD, want: JS_WANT },
  { language: 'JavaScript', tool: 'node', file: 'a.js', bad: 'const x = {\n', good: 'const x = 1;\n', want: /Unexpected|missing|token|end of input/i },
  { language: 'JSX', tool: 'eslint', file: 'a.jsx', bad: 'export function A() { return <div>{noSuchVar}</div>; }\n', good: 'export function A(name) { return <div>{name}</div>; }\n', want: /noSuchVar|undef|Parsing/i },
  { language: 'JSX', tool: 'node', file: 'a.js', bad: 'const x = {\n', good: 'const x = 1;\n', want: /Unexpected|missing|token|end of input/i },
  { language: 'TypeScript', tool: 'eslint', file: 'a.ts', bad: 'export const n: number = ;\n', good: 'export const n: number = 1;\n', want: /Parsing|Unexpected|error|typedef/i, needsParser: true },
  { language: 'TSX', tool: 'eslint', file: 'a.tsx', bad: 'export const n: number = ;\n', good: 'export const n: number = 1;\n', want: /Parsing|Unexpected|error|typedef/i, needsParser: true },
  { language: 'Python', tool: 'ruff', file: 'a.py', bad: 'def f():\n    return undefined_name\n', good: 'def f(x):\n    return x\n', want: /undefined|F821/i },
  { language: 'Python', tool: 'pyflakes', file: 'a.py', bad: 'def f():\n    return undefined_name\n', good: 'def f(x):\n    return x\n', want: /undefined/i },
  { language: 'Python', tool: 'python', file: 'a.py', bad: 'def f(\n', good: 'def f(x):\n    return x\n', want: /syntax|never closed|unexpected/i },
  { language: 'JSON', tool: 'json', file: 'a.json', bad: '{ "a": 1, }\n', good: '{ "a": 1 }\n', want: /JSON|Unexpected|end|property/i },
  { language: 'YAML', tool: 'yaml', file: 'a.yaml', bad: 'a: [1, 2\n', good: 'a: [1, 2]\n', want: /YAML|miss|unexpected|flow/i },
  { language: 'YAML', tool: 'kube', file: 'pod.yaml',
    bad: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: demo\nspec:\n  containers: []\n',
    good: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: demo\nspec:\n  containers:\n    - name: c\n      image: nginx:1.25\n      resources:\n        requests:\n          cpu: "10m"\n',
    want: /container|image|spec/i },
  { language: 'YAML', tool: 'kubeconform', file: 'svc.yaml',
    bad: 'apiVersion: v1\nkind: Service\nmetadata:\n  name: demo\nspec:\n  ports:\n    - port: foo\n',
    good: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: demo\ndata:\n  k: v\n',
    want: /invalid|error|integer|schema|port/i },
  { language: 'YAML', tool: 'kubectl', file: 'pod.yaml',
    bad: 'apiVersion: v1\nkind: Service\nmetadata:\n  name: demo\nspec:\n  ports:\n    - port: foo\n',
    good: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: demo\ndata:\n  k: v\n',
    want: /invalid|error|field|port|decode/i, envOk: /no usable cluster|OpenAPI|discovery/i },
  { language: 'YAML', tool: 'yamllint', file: 'a.yaml', bad: 'a: 1    \n', good: '---\na: 1\n', want: /trailing|space|document-start|syntax|line/i },
  { language: 'Shell', tool: 'shellcheck', file: 'a.sh', bad: 'echo $unquoted\n', good: 'echo "$1"\n', want: /quote|SC2086|SC2154|unquoted|assigned/i },
  { language: 'PowerShell', tool: 'pssa', file: 'a.ps1', bad: 'Write-Host $undefinedVar\n', good: 'function Get-N { param($Name) $Name }\n', want: /PSAvoid|undefined|Host|alias|not used/i },
  { language: 'C', tool: 'gcc', file: 'a.c', bad: C_BAD, good: C_GOOD, want: C_WANT },
  { language: 'C', tool: 'clang', file: 'a.c', bad: C_BAD, good: C_GOOD, want: C_WANT },
  { language: 'C', tool: 'cc', file: 'a.c', bad: C_BAD, good: C_GOOD, want: C_WANT },
  { language: 'C++', tool: 'g++', file: 'a.cpp', bad: CXX_BAD, good: CXX_GOOD, want: C_WANT },
  { language: 'C++', tool: 'clang++', file: 'a.cpp', bad: CXX_BAD, good: CXX_GOOD, want: C_WANT },
  { language: 'C++', tool: 'gcc', file: 'a.cpp', bad: CXX_BAD, good: CXX_GOOD, want: C_WANT },
  { language: 'C++', tool: 'clang', file: 'a.cpp', bad: CXX_BAD, good: CXX_GOOD, want: C_WANT },
  { language: 'Go', tool: 'gofmt', file: 'a.go', bad: 'package main\nfunc main( {\n}\n', good: 'package main\nfunc main() {\n}\n', want: /expected|syntax|error/i },
  { language: 'Go', tool: 'govet', file: 'main.go', bad: 'package main\nimport "fmt"\nfunc main() { fmt.Printf("%d") }\n', good: 'package main\nfunc main() {}\n', want: /printf|format|missing|wrong|arg/i },
  { language: 'PHP', tool: 'php', file: 'a.php', bad: '<?php echo "hi"\n', good: '<?php echo "hi";\n', want: /Parse|syntax|unexpected/i },
  { language: 'Ruby', tool: 'rubocop', file: 'a.rb', bad: 'def f\n  x = 1\nend\n', good: "# frozen_string_literal: true\n\ndef greet(name)\n  name\nend\n", want: /unused|Lint|Style|Convention|error/i },
  { language: 'Ruby', tool: 'ruby', file: 'a.rb', bad: 'def f\n  end end\n', good: "def f\nend\n", want: /syntax|unexpected|error/i },
  { language: 'Dockerfile', tool: 'hadolint', file: 'Dockerfile', bad: 'FROM ubuntu:latest\nRUN apt-get update && apt-get install curl\n', good: 'FROM ubuntu:22.04\nUSER nobody\n', want: /DL|pin|latest|apt/i },
  { language: 'Markdown', tool: 'markdownlint', file: 'a.md', bad: '# Title\n# Another\n', good: '# Title\n\nA paragraph.\n', want: /heading|MD|space|blank/i },
  { language: 'CSS', tool: 'stylelint', file: 'a.css', bad: STYLE_BAD, good: STYLE_GOOD, want: STYLE_WANT },
  { language: 'SCSS', tool: 'stylelint', file: 'a.scss', bad: STYLE_BAD, good: STYLE_GOOD, want: STYLE_WANT },
  { language: 'LESS', tool: 'stylelint', file: 'a.less', bad: STYLE_BAD, good: STYLE_GOOD, want: STYLE_WANT },
  { language: 'Java', tool: 'javac', file: 'Main.java', bad: 'class Main { public static void main(String[] a) { retrn; } }\n', good: 'class Main { public static void main(String[] a) { } }\n', want: /retrn|not a statement|cannot find|expected/i },
];

function available(language, id) {
  return !!(listed[language] || []).find((t) => t.id === id && t.available);
}

async function run(c, which) {
  return linter.run({
    id: `${c.language}:${c.tool}:${which}`,
    path: path.join(work, c.file),
    name: c.file,
    language: c.language,
    text: which === 'bad' ? c.bad : c.good,
    tool: c.tool,
  });
}

test('every registered checker has a case', () => {
  const keys = new Set(CASES.map((c) => `${c.language}:${c.tool}`));
  for (const [lang, tools] of Object.entries(LINTERS)) {
    for (const t of tools) {
      assert.ok(keys.has(`${lang}:${t.id}`), `missing case for ${lang} / ${t.id}`);
    }
  }
  assert.equal(CASES.length, keys.size);
});

function note(t, c, detail) {
  t.diagnostic(`lint-row\t${c.language}\t${c.tool}\t\t${String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 160)}`);
}

for (const c of CASES) {
  test(`${c.language} / ${c.tool}`, { timeout: 60000 }, async (t) => {
    if (!available(c.language, c.tool)) { note(t, c, '설치되어 있지 않음'); t.skip('설치되어 있지 않음'); return; }
    const bad = await run(c, 'bad');
    if (bad.error && c.envOk && c.envOk.test(bad.error)) { note(t, c, bad.error); t.skip(bad.error); return; }
    assert.equal(bad.error, null, `bad-run error: ${bad.error}`);
    if (c.needsParser && !(bad.diagnostics || []).length) { note(t, c, '프로젝트에 typescript-eslint 필요'); t.skip('프로젝트에 typescript-eslint 필요'); return; }
    assert.ok((bad.diagnostics || []).length, `expected a finding on:\n${c.bad}`);
    const finding = (bad.diagnostics || []).map((d) => d.message).join(' | ');
    assert.ok((bad.diagnostics || []).some((d) => c.want.test(d.message)), `unexpected finding: ${finding}`);
    const good = await run(c, 'good');
    if (good.error && c.envOk && c.envOk.test(good.error)) { note(t, c, good.error); t.skip(good.error); return; }
    assert.equal(good.error, null, `good-run error: ${good.error}`);
    const errors = (good.diagnostics || []).filter((d) => d.severity === 'error');
    assert.equal(errors.length, 0, `false error on valid input: ${errors.map((d) => d.message).join(' | ')}`);
    note(t, c, finding.split(' | ')[0]);
  });
}

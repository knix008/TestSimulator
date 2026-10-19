// Exercises every checker through createLinter().run (the same path as the app).
// Prints a table: ok / fail / skip (not installed). Exit 1 if any installed
// checker misses a known problem or errors on valid input.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { formatLintReport } from '../test/lint-report.mjs';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createLinter } = require('../core/lint');

const userDataCandidates = [
  path.join(process.env.APPDATA || '', 'My Editor'),
  path.join(process.env.APPDATA || '', 'myeditor'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'My Editor'),
];
const toolsDir = userDataCandidates.map((d) => path.join(d, 'tools')).find((d) => fs.existsSync(d))
  || path.join(os.tmpdir(), 'med-lint-verify-tools');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'med-lint-verify-'));
fs.writeFileSync(path.join(work, 'eslint.config.js'), `export default [{ languageOptions: { ecmaVersion: 2022 }, rules: { 'no-undef': 'error', 'no-unused-vars': 'warn' } }];\n`);
fs.writeFileSync(path.join(work, '.stylelintrc.json'), JSON.stringify({ rules: { 'color-no-invalid-hex': true, 'block-no-empty': true } }));
fs.writeFileSync(path.join(work, 'package.json'), '{"type":"module"}\n');

const CASES = [
  { language: 'JavaScript', tool: 'eslint', file: 'bad.js',
    bad: 'function f() {\n  return x\n}\n',
    good: 'export function f(x) {\n  return x;\n}\n',
    want: /x|undef/i },
  { language: 'JavaScript', tool: 'node', file: 'bad.js',
    bad: 'const x = {\n',
    good: 'const x = 1;\n',
    want: /Unexpected|missing|token|expected/i },
  { language: 'JSX', tool: 'eslint', file: 'bad.jsx',
    bad: 'export function A() { return <div>{noSuch}</div>; }\n',
    good: 'export function A(name) { return <div>{name}</div>; }\n',
    want: /noSuch|undef|Parsing/i },
  { language: 'TypeScript', tool: 'eslint', file: 'bad.ts',
    bad: 'export const n: number = ;\n',
    good: 'export const n: number = 1;\n',
    want: /Parsing|Unexpected|error|typedef|type/i, optional: true },
  { language: 'Python', tool: 'ruff', file: 'bad.py',
    bad: 'def f():\n    return undefined_name\n',
    good: 'def f(x):\n    return x\n',
    want: /undefined|F821/i },
  { language: 'Python', tool: 'pyflakes', file: 'bad.py',
    bad: 'def f():\n    return undefined_name\n',
    good: 'def f(x):\n    return x\n',
    want: /undefined/i },
  { language: 'Python', tool: 'python', file: 'bad.py',
    bad: 'def f(\n',
    good: 'def f(x):\n    return x\n',
    want: /invalid syntax|unexpected|was never closed/i },
  { language: 'JSON', tool: 'json', file: 'bad.json',
    bad: '{ "a": 1, }\n',
    good: '{ "a": 1 }\n',
    want: /JSON|Unexpected|end/i },
  { language: 'YAML', tool: 'yaml', file: 'bad.yaml',
    bad: 'a: [1, 2\n',
    good: 'a: [1, 2]\n',
    want: /YAML|miss|unexpected|flow/i },
  { language: 'YAML', tool: 'kube', file: 'pod.yaml',
    bad: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: demo\nspec:\n  containers: []\n',
    good: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: demo\nspec:\n  containers:\n    - name: c\n      image: nginx:1.25\n      resources:\n        requests:\n          cpu: "10m"\n',
    want: /container|image|spec/i },
  { language: 'YAML', tool: 'kubeconform', file: 'svc.yaml',
    bad: 'apiVersion: v1\nkind: Service\nmetadata:\n  name: demo\nspec:\n  ports:\n    - port: foo\n',
    good: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: demo\ndata:\n  k: v\n',
    want: /invalid|error|required|integer|schema|port/i },
  { language: 'YAML', tool: 'kubectl', file: 'pod.yaml',
    bad: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: demo\nspec:\n  containers:\n    - name: c\n',
    good: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: demo\ndata:\n  k: v\n',
    want: /invalid|error|required|image|field/i, optional: true },
  { language: 'YAML', tool: 'yamllint', file: 'bad.yaml',
    bad: 'a: 1    \n',
    good: '---\na: 1\n',
    want: /trailing|space|line too long|syntax|error|warning/i },
  { language: 'Shell', tool: 'shellcheck', file: 'bad.sh',
    bad: 'echo $unquoted\n',
    good: 'echo "$1"\n',
    want: /quote|SC2086|unquoted/i },
  { language: 'PowerShell', tool: 'pssa', file: 'bad.ps1',
    bad: 'Write-Host $undefinedVar\n',
    good: 'function Get-N { param($Name) $Name }\n',
    want: /PSAvoid|undefined|not used|alias|Host/i },
  { language: 'C', tool: 'gcc', file: 'bad.c',
    bad: 'int main(void) { retrn 0; }\n',
    good: 'int main(void) { return 0; }\n',
    want: /retrn|undeclared|error/i },
  { language: 'C', tool: 'clang', file: 'bad.c',
    bad: 'int main(void) { retrn 0; }\n',
    good: 'int main(void) { return 0; }\n',
    want: /retrn|undeclared|error/i },
  { language: 'C', tool: 'cc', file: 'bad.c',
    bad: 'int main(void) { retrn 0; }\n',
    good: 'int main(void) { return 0; }\n',
    want: /retrn|undeclared|error/i },
  { language: 'C++', tool: 'g++', file: 'bad.cpp',
    bad: 'int main() { retrn 0; }\n',
    good: 'int main() { return 0; }\n',
    want: /retrn|undeclared|error/i },
  { language: 'C++', tool: 'clang++', file: 'bad.cpp',
    bad: 'int main() { retrn 0; }\n',
    good: 'int main() { return 0; }\n',
    want: /retrn|undeclared|error/i },
  { language: 'Go', tool: 'gofmt', file: 'bad.go',
    bad: 'package main\nfunc main( {\n}\n',
    good: 'package main\nfunc main() {\n}\n',
    want: /expected|syntax|error/i },
  { language: 'Go', tool: 'govet', file: 'main.go',
    bad: 'package main\nimport "fmt"\nfunc main() { fmt.Printf("%d") }\n',
    good: 'package main\nfunc main() {}\n',
    want: /printf|format|vet|missing|wrong/i },
  { language: 'PHP', tool: 'php', file: 'bad.php',
    bad: '<?php echo "hi"\n',
    good: '<?php echo "hi";\n',
    want: /Parse|syntax|unexpected/i },
  { language: 'Ruby', tool: 'rubocop', file: 'bad.rb',
    bad: 'def f\n  x = 1\nend\n',
    good: "# frozen_string_literal: true\n\ndef greet(name)\n  name\nend\n",
    want: /unused|Lint|Style|Convention|error/i },
  { language: 'Ruby', tool: 'ruby', file: 'bad.rb',
    bad: 'def f\n  end end\n',
    good: "def f\nend\n",
    want: /syntax|unexpected|error/i },
  { language: 'Dockerfile', tool: 'hadolint', file: 'Dockerfile',
    bad: 'FROM ubuntu:latest\nRUN apt-get update && apt-get install curl\n',
    good: 'FROM ubuntu:22.04\nUSER nobody\n',
    want: /DL|pin|latest|apt/i },
  { language: 'Markdown', tool: 'markdownlint', file: 'bad.md',
    bad: '# Title\n# Another\n',
    good: '# Title\n\nA paragraph.\n',
    want: /heading|MD|space|blank/i },
  { language: 'CSS', tool: 'stylelint', file: 'bad.css',
    bad: 'a { color: #xyz; }\n',
    good: 'a { color: #fff; }\n',
    want: /hex|color|invalid/i },
  { language: 'Java', tool: 'javac', file: 'Main.java',
    bad: 'class Main { public static void main(String[] a) { retrn; } }\n',
    good: 'class Main { public static void main(String[] a) { } }\n',
    want: /retrn|error|cannot find|expected|not a statement/i },
];

const linter = createLinter({ toolsDir });
const tools = linter.tools({ dir: work, refresh: true });
const rows = [];

async function runOne(c, which) {
  const file = path.join(work, c.file);
  return linter.run({
    id: `${c.language}:${c.tool}:${which}`,
    path: file,
    name: c.file,
    language: c.language,
    text: which === 'bad' ? c.bad : c.good,
    tool: c.tool,
  });
}

for (const c of CASES) {
  const listed = ((tools[c.language] || []).find((t) => t.id === c.tool));
  const available = listed ? listed.available : false;
  if (!available) {
    rows.push({ ...c, status: 'skip', detail: '설치되어 있지 않음' });
    continue;
  }
  const bad = await runOne(c, 'bad');
  const good = await runOne(c, 'good');
  if (bad.error) {
    rows.push({ ...c, status: c.optional ? 'skip' : 'fail', detail: `${c.optional ? 'environment: ' : 'bad-run error: '}${bad.error}` });
    continue;
  }
  const msgs = (bad.diagnostics || []).map((d) => d.message).join(' | ');
  if (!(bad.diagnostics || []).length) {
    rows.push({ ...c, status: c.optional ? 'skip' : 'fail', detail: c.optional ? 'no finding (optional)' : 'expected a finding on bad input' });
    continue;
  }
  if (c.want && !c.want.test(msgs)) {
    rows.push({ ...c, status: 'fail', detail: `unexpected finding: ${msgs.slice(0, 160)}` });
    continue;
  }
  if (good.error) {
    rows.push({ ...c, status: 'fail', detail: `good-run error: ${good.error}` });
    continue;
  }
  const goodErrs = (good.diagnostics || []).filter((d) => d.severity === 'error');
  if (goodErrs.length) {
    rows.push({ ...c, status: 'fail', detail: `false error on valid input: ${goodErrs.map((d) => d.message).join(' | ').slice(0, 160)}` });
    continue;
  }
  rows.push({ ...c, status: 'ok', detail: msgs.split(' | ')[0].slice(0, 80) });
}

const fail = rows.filter((r) => r.status === 'fail').length;
process.stdout.write(formatLintReport(rows, { title: `검사기 테스트 결과` }));
try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* leftover is fine */ }
process.exitCode = fail ? 1 : 0;

// Runs every shipped sample against the engine and compares stdout.
//   node scripts/check-samples.mjs            (every language that is installed)
//   node scripts/check-samples.mjs python     (one language)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ALGORITHMS } from '../src/algorithms/index.js';
import { expectedOutput } from '../src/algorithms/expected.js';
import { CODE_LANGUAGES, sample } from '../src/samples/index.js';

const only = process.argv[2];
const compilers = {
  c: ['gcc', ['-O2', '-o', 'prog', 'main.c'], ['prog']],
  cpp: ['g++', ['-std=c++17', '-O2', '-o', 'prog', 'main.cpp'], ['prog']],
  java: ['javac', ['Main.java'], ['java', '-cp', '.', 'Main']],
  python: ['python', null, ['python', 'main.py']],
  go: ['go', null, ['go', 'run', 'main.go']],
  rust: ['rustc', ['-O', '-o', 'prog', 'main.rs'], ['prog']],
  javascript: ['node', null, ['node', 'main.js']],
};
const fileName = { c: 'main.c', cpp: 'main.cpp', java: 'Main.java', python: 'main.py', go: 'main.go', rust: 'main.rs', javascript: 'main.js' };

function installed(command) {
  return ['--version', '-version', 'version'].some((flag) => spawnSync(command, [flag], { encoding: 'utf8' }).status === 0);
}

let failed = 0;
let ran = 0;
for (const language of CODE_LANGUAGES) {
  if (only && language.id !== only) continue;
  const [compiler, build, run] = compilers[language.id];
  if (!installed(compiler)) { console.log(`— ${language.name}: 설치되어 있지 않아 건너뜁니다`); continue; }
  for (const algo of ALGORITHMS) {
    const source = sample(algo.id, language.id);
    if (!source) continue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myalgosim-'));
    const input = algo.input.default;
    const expected = expectedOutput(algo, algo.input.parse(input), algo.run(algo.input.parse(input))).trim();
    fs.writeFileSync(path.join(dir, fileName[language.id]), source);
    const out = process.platform === 'win32' ? 'prog.exe' : 'prog';
    if (build) {
      const compiled = spawnSync(compiler, build.map((arg) => (arg === 'prog' ? out : arg)), { cwd: dir, encoding: 'utf8' });
      if (compiled.status !== 0) { failed += 1; console.log(`✗ ${language.id} ${algo.id}: 컴파일 실패\n${compiled.stderr}`); continue; }
    }
    const program = run[0] === 'prog' ? path.join(dir, out) : run[0];
    const result = spawnSync(program, run.slice(1), { cwd: dir, input, encoding: 'utf8', timeout: 20000 });
    ran += 1;
    const got = (result.stdout ?? '').replace(/\r\n/g, '\n').trim();
    if (result.status !== 0 || got !== expected) {
      failed += 1;
      console.log(`✗ ${language.id} ${algo.id}\n  기대: ${expected}\n  결과: ${got}\n  ${result.stderr ?? ''}`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\n${ran}개 실행, 실패 ${failed}개`);
process.exit(failed ? 1 : 0);

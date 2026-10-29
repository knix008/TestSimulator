// Line rules see the file and the lines around a match in a real analysis:
// skip(rawLine, line, file, { index, lines }) from core/analyze.js reaches the
// rules' test-path, manifest, language and enclosing-block exemptions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { analyzeSources } = require('../core/analyze.js');

function analyze(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-skipctx-'));
  const sources = Object.entries(files).map(([rel, text]) => ({ path: path.join(root, rel), text }));
  return analyzeSources(sources, { root }).issues;
}
const at = (issues, rule, file) => issues.filter((i) => i.rule === rule && i.file === file).map((i) => i.line);

test('Rust: unwrap is reported in product code, not in tests/, #[cfg(test)] modules or build.rs', () => {
  const issues = analyze({
    'src/lib.rs': 'pub fn f(v: Option<u8>) -> u8 {\n    v.unwrap()\n}\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn t() {\n        Some(1).unwrap();\n    }\n}\n',
    'tests/it.rs': '#[test]\nfn it() {\n    Some(1).unwrap();\n}\n',
    'build.rs': 'fn main() {\n    println!("cargo:rerun-if-changed=build.rs");\n    std::env::var("X").unwrap();\n}\n',
  });
  assert.deepEqual(at(issues, 'rs:unwrap', 'src/lib.rs'), [2]);
  assert.deepEqual(at(issues, 'rs:unwrap', 'tests/it.rs'), []);
  assert.deepEqual(at(issues, 'rs:unwrap', 'build.rs'), []);
  assert.deepEqual(at(issues, 'rs:print-debug', 'build.rs'), []);
});

test('JSON: a "*" version counts in package.json only', () => {
  const issues = analyze({
    'package.json': '{\n  "dependencies": {\n    "left-pad": "*"\n  }\n}\n',
    'config/values.json': '{\n  "dependencies": {\n    "left-pad": "*"\n  }\n}\n',
  });
  assert.deepEqual(at(issues, 'json:star-version', 'package.json'), [3]);
  assert.deepEqual(at(issues, 'json:star-version', 'config/values.json'), []);
});

test('Kotlin: == on strings is equals() there, so the Java rule does not apply', () => {
  const issues = analyze({
    'src/A.java': 'class A {\n  boolean f(String s) {\n    return s == "x";\n  }\n}\n',
    'src/B.kt': 'class B {\n  fun f(s: String) = s == "x"\n}\n',
  });
  assert.deepEqual(at(issues, 'java:string-eq', 'src/A.java'), [3]);
  assert.deepEqual(at(issues, 'java:string-eq', 'src/B.kt'), []);
});

test('Secrets: a password literal in product code is reported, the same in a test fixture is not', () => {
  const line = 'const password = "Tr0ub4dor&3xK9";\n';
  const issues = analyze({ 'src/db.js': line, 'test/fixtures/db.js': line });
  assert.ok(at(issues, 'secrets:hardcoded-password', 'src/db.js').length + at(issues, 'js:hardcoded-password', 'src/db.js').length > 0, 'reported in src');
  assert.deepEqual(at(issues, 'secrets:hardcoded-password', 'test/fixtures/db.js'), []);
});

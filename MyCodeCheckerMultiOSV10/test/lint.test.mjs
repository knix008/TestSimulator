// Baseline lint: every language has at least one lint: rule, the real
// analyzer flags and spares the samples, inherited languages run the parent
// rules, and the lint group can be turned off without turning off the others.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const extra = require('../core/rules-extra/index.js');
const base = require('../core/rules.js');
const { LANGS, ruleLangsFor, commentKind } = require('../core/languages.js');
const { groupOf } = require('../core/checks.js');
const { analyzePath } = require('../core/analyze.js');
const gitplan = require('../core/gitplan.js');

function applies(rule, lang) {
  if (rule.langs.includes('*')) return true;
  const langs = new Set(ruleLangsFor(lang));
  return rule.langs.some((l) => langs.has(l));
}

const LINT = [...base.RULES, ...extra.RULES].filter((r) => r.key.startsWith('lint:'));
const QUIET = {
  skipEngines: [...gitplan.ISSUE_ENGINES, ...gitplan.DEFECT_ENGINES, 'sca', 'arch'],
  skipDuplication: true,
  skipCoverage: true,
  skipDefects: true,
};

// Rules that ignore the inside of quotes. A quoted copy of the bad sample
// must not be flagged.
const STRING_BLIND = new Set([
  'lint:js-extra-semi', 'lint:js-new-wrapper', 'lint:js-throw-literal',
  'lint:kt-bang', 'lint:java-stderr', 'lint:cs-console', 'lint:go-print',
  'lint:rs-unwrap', 'lint:php-dump', 'lint:swift-print', 'lint:objc-nslog',
  'lint:scala-println', 'lint:dart-print', 'lint:apex-debug', 'lint:flex-trace',
]);

const C_SAMPLES = {
  'lint:c-long-line': {
    bad: [`const char *label = "${'x'.repeat(130)}";`],
    good: ['const char *label = "ok";'],
  },
  'lint:c-mixed-indent': {
    bad: [' \tchar *p = buf;'],
    good: ['  char *p = buf;', '\tchar *p = buf;'],
  },
};

function samplesOf(rule) {
  if (C_SAMPLES[rule.key]) return { ...C_SAMPLES[rule.key], lang: 'c' };
  return extra.examples(rule.key);
}

// The catalog sample for a long line is a JavaScript string. VB treats the
// apostrophe as a comment, so the line the analyzer sees is short. A run of
// letters stays a long line in every language.
function badText(rule, ex) {
  if (rule.key === 'lint:long-line' || rule.key === 'lint:c-long-line') return `const label = ${'x'.repeat(130)};`;
  return ex.bad.join('\n');
}

function sourceName(lang, id) {
  if (lang === 'docker') return `Dockerfile-${id}`;
  const ext = LANGS[lang] && LANGS[lang].exts[0];
  assert.ok(ext, `no extension for ${lang}`);
  return `${id}${ext}`;
}

function writeTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-lint-'));
  for (const file of files) {
    const full = path.join(dir, file.name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.text.endsWith('\n') ? file.text : `${file.text}\n`);
  }
  return dir;
}

function scan(dir) {
  try {
    return analyzePath(dir, QUIET);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function hits(report, file, rule) {
  return report.issues.filter((i) => i.file === file && i.rule === rule);
}

function commentLine(lang, line) {
  const one = String(line).split('\n')[0];
  const kind = commentKind(lang);
  if (kind === 'slash') return `// ${one}`;
  if (kind === 'hash') return `# ${one}`;
  if (kind === 'dash') return `-- ${one}`;
  if (kind === 'xml') return `<!-- ${one} -->`;
  if (kind === 'quote') return `' ${one}`;
  if (kind === 'cobol') return `*> ${one}`;
  if (kind === 'abap') return `* ${one}`;
  if (kind === 'jcl') return `//* ${one}`;
  return null;
}

function quoted(line) {
  const one = String(line).split('\n')[0].replace(/\\/g, '').replace(/"/g, "'");
  return `const label = "${one}";`;
}

test('every language has a baseline lint rule', () => {
  assert.ok(LINT.length >= Object.keys(LANGS).length);
  for (const lang of Object.keys(LANGS)) {
    assert.ok(LINT.some((r) => applies(r, lang)), lang);
  }
});

test('lint findings are their own check group', () => {
  assert.equal(groupOf({ rule: 'lint:long-line' }), 'lint');
  assert.equal(groupOf({ rule: 'lint:c-long-line' }), 'lint');
  assert.equal(groupOf({ rule: 'js:eval' }), 'quality');
});

test('a long line is lint, and turning the lint group off keeps the other rules', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-lint-'));
  const line = `const label = "${'x'.repeat(130)}";`;
  fs.writeFileSync(path.join(dir, 'a.js'), `eval(input);\n${line}\n`);
  fs.writeFileSync(path.join(dir, 'b.py'), 'if value == None:\n    pass\n');
  fs.writeFileSync(path.join(dir, 'c.c'), `const char *label = "${'x'.repeat(130)}";\n`);
  try {
    const on = analyzePath(dir, QUIET);
    for (const rule of ['lint:long-line', 'lint:py-none-cmp', 'lint:c-long-line', 'js:eval']) {
      assert.ok(on.issues.some((i) => i.rule === rule), rule);
    }
    const lintIssue = on.issues.find((i) => i.rule === 'lint:long-line');
    assert.equal(groupOf(lintIssue), 'lint');
    assert.equal(lintIssue.type, 'CODE_SMELL');
    assert.equal(lintIssue.language, 'js');
    assert.match(lintIssue.message.ko, /[가-힣]/);
    assert.ok(lintIssue.message.en);
    const off = analyzePath(dir, { ...QUIET, disabledChecks: ['lint'] });
    assert.ok(!off.issues.some((i) => String(i.rule).startsWith('lint:')));
    assert.ok(off.issues.some((i) => i.rule === 'js:eval'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the analyzer flags each lint sample in a file of that language and spares the compliant one', () => {
  const bad = [];
  const good = [];
  for (const rule of LINT) {
    const ex = samplesOf(rule);
    assert.ok(ex && ex.bad.length && ex.good.length, rule.key);
    for (const lang of rule.langs) {
      const name = sourceName(lang, rule.key.replace(/:/g, '-'));
      bad.push({ name, text: badText(rule, ex), rule: rule.key, lang });
      good.push({ name, text: ex.good.join('\n'), rule: rule.key, lang });
    }
  }
  const flagged = scan(writeTree(bad));
  for (const file of bad) {
    const row = flagged.files.find((f) => f.path === file.name);
    assert.ok(row, `${file.name} was not analyzed`);
    assert.equal(row.language, file.lang, file.name);
    const found = hits(flagged, file.name, file.rule);
    assert.ok(found.length > 0, `${file.rule} did not flag ${file.name}`);
    assert.equal(found[0].language, file.lang);
    assert.match(found[0].message.ko, /[가-힣]/, file.rule);
  }
  const clean = scan(writeTree(good));
  for (const file of good) {
    assert.deepEqual(hits(clean, file.name, file.rule).map((i) => i.line), [], `${file.rule} flagged compliant ${file.name}`);
  }
});

test('a lint rule does not flag its sample in a language it does not cover', () => {
  const files = [];
  for (const rule of LINT) {
    const lang = Object.keys(LANGS).find((id) => !applies(rule, id));
    assert.ok(lang, `${rule.key} applies to every language`);
    const ex = samplesOf(rule);
    files.push({ name: sourceName(lang, `foreign-${rule.key.replace(/:/g, '-')}`), text: ex.bad.join('\n'), rule: rule.key, lang });
  }
  const report = scan(writeTree(files));
  for (const file of files) {
    const row = report.files.find((f) => f.path === file.name);
    assert.ok(row, `${file.name} was not analyzed`);
    assert.equal(row.language, file.lang, file.name);
    assert.deepEqual(hits(report, file.name, file.rule), [], `${file.rule} flagged ${file.lang}`);
  }
});

test('comments and quoted text do not raise baseline lint', () => {
  const comments = [];
  const strings = [];
  for (const rule of LINT) {
    const ex = samplesOf(rule);
    const lang = ex.lang;
    const commented = commentLine(lang, ex.bad[0]);
    if (commented) {
      comments.push({
        name: sourceName(lang, `comment-${rule.key.replace(/:/g, '-')}`),
        text: commented,
        rule: rule.key,
        lang,
      });
    }
    if (STRING_BLIND.has(rule.key)) {
      strings.push({
        name: sourceName(lang, `string-${rule.key.replace(/:/g, '-')}`),
        text: quoted(ex.bad[0]),
        rule: rule.key,
        lang,
      });
    }
  }
  assert.ok(comments.length >= LINT.length - 2, 'json has no comments; every other lint rule should be covered');
  const commented = scan(writeTree(comments));
  for (const file of comments) {
    assert.deepEqual(hits(commented, file.name, file.rule), [], `${file.rule} flagged a comment in ${file.name}`);
  }
  const quotedReport = scan(writeTree(strings));
  for (const file of strings) {
    assert.deepEqual(hits(quotedReport, file.name, file.rule), [], `${file.rule} flagged a string in ${file.name}`);
  }
});

test('an empty for-loop is not an extra semicolon', () => {
  const dir = writeTree([
    { name: 'loop.js', text: 'for (;;) { work(); }\nconst label = 1;;\n' },
  ]);
  const report = scan(dir);
  const found = hits(report, 'loop.js', 'lint:js-extra-semi');
  assert.deepEqual(found.map((i) => i.line), [2]);
});

test('TypeScript, C++, Kotlin and Groovy run the lint rules of the language they inherit', () => {
  const long = `const label = ${'x'.repeat(130)};`;
  const dir = writeTree([
    { name: 'page.tsx', text: 'const label = 1;;\n' },
    { name: 'util.cpp', text: `${long}\n \tchar *p = buf;\n` },
    { name: 'app.kt', text: 'val label = user!!.name\nSystem.err.println(detail);\n' },
    { name: 'Jenkinsfile', text: 'System.err.println(detail);\n' },
  ]);
  const report = scan(dir);
  const expect = [
    ['page.tsx', 'ts', 'lint:js-extra-semi'],
    ['util.cpp', 'cpp', 'lint:c-long-line'],
    ['util.cpp', 'cpp', 'lint:c-mixed-indent'],
    ['app.kt', 'kt', 'lint:kt-bang'],
    ['app.kt', 'kt', 'lint:java-stderr'],
    ['Jenkinsfile', 'groovy', 'lint:java-stderr'],
  ];
  for (const [file, lang, rule] of expect) {
    const row = report.files.find((f) => f.path === file);
    assert.ok(row, `${file} was not analyzed`);
    assert.equal(row.language, lang, file);
    const found = hits(report, file, rule);
    assert.ok(found.length > 0, `${rule} did not flag ${file}`);
    assert.equal(found[0].language, lang);
  }
  assert.deepEqual(hits(report, 'util.cpp', 'lint:long-line'), []);
  assert.deepEqual(hits(report, 'util.cpp', 'lint:mixed-indent'), []);
  assert.deepEqual(hits(report, 'page.tsx', 'lint:c-long-line'), []);
  assert.deepEqual(hits(report, 'Jenkinsfile', 'lint:kt-bang'), []);
});

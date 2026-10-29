import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const extra = require('../core/rules-extra/index.js');
const base = require('../core/rules.js');
const { structuralIssues, structuralMeta } = require('../core/metrics.js');
const { commentKind, ruleLangsFor, LANGS } = require('../core/languages.js');

const TYPES = new Set(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT']);
const SEVERITIES = new Set(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']);

function applies(rule, lang) {
  if (rule.langs.includes('*')) return true;
  const langs = new Set(ruleLangsFor(lang));
  return rule.langs.some((l) => langs.has(l));
}

// Mirrors the line loop of core/analyze.js analyzeSources for one rule.
function run(rule, text, lang) {
  const structural = structuralIssues(text, commentKind(lang));
  const hits = [];
  if (!applies(rule, lang)) return hits;
  const sourceLines = rule.scope === 'any' ? structural.lines : structural.code;
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    if (!line || !line.trim()) continue;
    if (rule.scope !== 'any' && structural.commentOnly[i] && line.trim() === '') continue;
    rule.re.lastIndex = 0;
    if (!rule.re.test(line)) continue;
    if (rule.skip && rule.skip(structural.lines[i], line, { lang, path: `sample.${lang}`, text }, { index: i, lines: structural.lines })) continue;
    hits.push(i + 1);
  }
  return hits;
}

test('extra rule keys are unique and do not collide with core/rules.js or metrics', () => {
  const baseKeys = new Set([...base.RULES.map((r) => r.key), ...structuralMeta().map((r) => r.key)]);
  const seen = new Set();
  for (const rule of extra.RULES) {
    assert.ok(!baseKeys.has(rule.key), `collides with core/rules.js: ${rule.key}`);
    assert.ok(!seen.has(rule.key), `duplicate key: ${rule.key}`);
    seen.add(rule.key);
  }
});

test('every extra rule is well formed with en and ko texts', () => {
  const langIds = new Set(Object.keys(LANGS));
  for (const rule of extra.RULES) {
    assert.match(rule.key, /^[a-z0-9]+:[a-z0-9]+(?:-[a-z0-9]+)*$/, rule.key);
    assert.ok(TYPES.has(rule.type), `${rule.key} type`);
    assert.ok(SEVERITIES.has(rule.severity), `${rule.key} severity`);
    assert.ok(Number.isFinite(rule.debtMin) && rule.debtMin > 0, `${rule.key} debtMin`);
    assert.ok(rule.re instanceof RegExp, `${rule.key} re`);
    assert.ok(!rule.re.global && !rule.re.sticky, `${rule.key} must not use g or y flags`);
    assert.ok(rule.scope === 'code' || rule.scope === 'any', `${rule.key} scope`);
    for (const l of rule.langs) assert.ok(l === '*' || langIds.has(l), `${rule.key} lang ${l}`);
    for (const t of rule.tags) assert.equal(t, t.toLowerCase(), `${rule.key} tag ${t}`);
    for (const field of ['name', 'why', 'fix']) {
      assert.ok(rule[field] && rule[field].en && rule[field].en.trim(), `${rule.key} ${field}.en`);
      assert.ok(rule[field] && rule[field].ko && rule[field].ko.trim(), `${rule.key} ${field}.ko`);
      assert.match(rule[field].ko, /[가-힣]/, `${rule.key} ${field}.ko is Korean`);
    }
    if (rule.tags.some((t) => /^cwe-\d+$/.test(t))) assert.match(rule.cwe, /^CWE-\d+$/, `${rule.key} cwe`);
    if (rule.type === 'VULNERABILITY' || rule.type === 'SECURITY_HOTSPOT') {
      assert.ok(rule.tags.length > 0, `${rule.key} security rule has tags`);
    }
  }
});

test('catalog() strips matchers and keeps metadata', () => {
  const cat = extra.catalog();
  assert.equal(cat.length, extra.RULES.length);
  for (const meta of cat) {
    assert.equal(meta.re, undefined);
    assert.equal(meta.skip, undefined);
    assert.ok(meta.name.en && meta.name.ko);
  }
});

test('C and C++ are not covered by the extra rules', () => {
  for (const rule of extra.RULES) {
    assert.ok(!rule.langs.includes('c') && !rule.langs.includes('cpp'), rule.key);
  }
});

const MAJOR = { js: 40, py: 40, java: 40, cs: 40, go: 40, php: 40 };
// Niche languages with a smaller target pack.
const SMALL = new Set(['vb6', 'rpg', 'pli', 'jcl', 'flex', 'bicep']);
test('major languages have at least 40 extra rules', () => {
  for (const [file, min] of Object.entries(MAJOR)) {
    assert.ok(extra.BY_FILE[file].length >= min, `${file}: ${extra.BY_FILE[file].length}`);
  }
  for (const [file, rules] of Object.entries(extra.BY_FILE)) {
    if (MAJOR[file] || file === 'common') continue;
    const min = SMALL.has(file) ? 10 : 20;
    assert.ok(rules.length >= min, `${file}: ${rules.length}`);
  }
});

for (const [file, rules] of Object.entries(extra.BY_FILE)) {
  test(`${file}: each rule flags its non-compliant sample and spares the compliant one`, () => {
    for (const rule of rules) {
      const ex = extra.examples(rule.key);
      assert.ok(ex, `${rule.key} has samples`);
      assert.ok(ex.bad.length > 0 && ex.good.length > 0, `${rule.key} has both samples`);
      assert.ok(applies(rule, ex.lang), `${rule.key} applies to sample language ${ex.lang}`);
      for (const line of ex.bad) {
        assert.ok(run(rule, line, ex.lang).length > 0, `${rule.key} should flag: ${line}`);
      }
      for (const line of ex.good) {
        assert.deepEqual(run(rule, line, ex.lang), [], `${rule.key} should not flag: ${line}`);
      }
    }
  });
}

const CLEAN = {
  js: [
    "'use strict';",
    "const path = require('node:path');",
    'function add(left, right) {',
    '  return left + right;',
    '}',
    'export async function load(url, { signal } = {}) {',
    '  const res = await fetch(url, { signal });',
    "  if (!res.ok) throw new Error(`HTTP ${res.status}`);",
    '  return res.json();',
    '}',
    'const items = list.filter((x) => x.active).map((x) => x.id);',
    'for (const [key, value] of Object.entries(map)) out[key] = value ?? null;',
  ].join('\n'),
  py: [
    'import os',
    'from pathlib import Path',
    '',
    'class Store:',
    '    def __init__(self, root: Path) -> None:',
    '        self.root = root',
    '',
    '    def read(self, name: str) -> str:',
    '        with open(self.root / name, encoding="utf-8") as fh:',
    '            return fh.read()',
    '',
    'def total(values=None):',
    '    values = values or []',
    '    return sum(v for v in values if v is not None)',
  ].join('\n'),
  java: [
    'package demo;',
    'import java.util.List;',
    'public final class Totals {',
    '    private static final int MAX_ITEMS = 100;',
    '    private final List<Integer> values;',
    '    public Totals(List<Integer> values) { this.values = values; }',
    '    public int sum() {',
    '        int s = 0;',
    '        for (int v : values) { s += v; }',
    '        return s;',
    '    }',
    '}',
  ].join('\n'),
  cs: [
    'namespace Demo;',
    'public sealed class Totals',
    '{',
    '    private readonly List<int> _values = new();',
    '    public int Sum() => _values.Sum();',
    '    public async Task<string> LoadAsync(HttpClient client, CancellationToken ct)',
    '    {',
    '        return await client.GetStringAsync("https://api.example.com/v1", ct);',
    '    }',
    '}',
  ].join('\n'),
  go: [
    'package store',
    'import "fmt"',
    'func Sum(values []int) int {',
    '\ttotal := 0',
    '\tfor _, v := range values {',
    '\t\ttotal += v',
    '\t}',
    '\treturn total',
    '}',
    'func wrap(err error) error { return fmt.Errorf("load: %w", err) }',
  ].join('\n'),
  php: [
    '<?php',
    'declare(strict_types=1);',
    'final class Totals',
    '{',
    '    public function __construct(private array $values) {}',
    '    public function sum(): int',
    '    {',
    '        return array_sum($this->values);',
    '    }',
    '}',
  ].join('\n'),
};

test('idiomatic clean code raises no bugs or vulnerabilities', () => {
  for (const [lang, text] of Object.entries(CLEAN)) {
    for (const rule of extra.RULES) {
      if (rule.type !== 'BUG' && rule.type !== 'VULNERABILITY') continue;
      assert.deepEqual(run(rule, text, lang), [], `${rule.key} fired on clean ${lang}`);
    }
  }
});

test('comments do not trigger code-scope rules', () => {
  const sample = { slash: '// ', hash: '# ', dash: '-- ', quote: "' ", cobol: '*> ', abap: '" ', jcl: '//* ', xml: null, none: null };
  for (const rule of extra.RULES) {
    if (rule.scope !== 'code') continue;
    const ex = extra.examples(rule.key);
    const prefix = sample[commentKind(ex.lang)];
    if (!prefix) continue;
    const line = ex.bad[0];
    assert.deepEqual(run(rule, prefix + line, ex.lang), [], `${rule.key} fired inside a comment`);
  }
});

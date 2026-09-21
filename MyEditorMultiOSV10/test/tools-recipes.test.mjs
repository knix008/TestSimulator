// Install recipes, formatters, linters and runtime helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { INSTALL_KIND_LABEL, INSTALL_STEPS, installProgress } from '../src/lib/install-progress.js';
import { resolveFormatter } from '../src/lib/formatters.js';

const require = createRequire(import.meta.url);
const { RECIPES, commandFor, isNtCrash, createInstaller } = require('../core/install');
const { FORMATTERS, formatXml, createFormatter } = require('../core/format');
const { LINTERS, createLinter } = require('../core/lint');
const { isAppAlias, runtimeMissing, PYTHON_WIN } = require('../core/runtime');

for (const [id, recipe] of Object.entries(RECIPES)) {
  test(`install recipe ${id} has a kind and identifiers`, () => {
    assert.ok(recipe.kind, id);
    if (recipe.kind === 'npm') assert.ok(recipe.pkg);
    if (recipe.kind === 'pip') assert.ok(recipe.pkg && recipe.module);
    if (recipe.kind === 'cargo') assert.ok(recipe.crate);
    if (recipe.kind === 'go') assert.ok(recipe.pkg);
    if (recipe.kind === 'gem') assert.ok(recipe.pkg);
    if (recipe.kind === 'rustup') assert.ok(recipe.component);
    if (recipe.kind === 'psmodule') assert.ok(recipe.module);
    if (recipe.kind === 'manual') assert.ok(recipe.hint);
  });
}

test('npm recipes install through node npm-cli.js when Node is present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-recipe-'));
  try {
    const c = commandFor(RECIPES.eslint, dir, false);
    if (c.missing) {
      assert.equal(c.runtime, 'node');
      return;
    }
    assert.ok(c.cmd);
    assert.ok(c.args.includes('install'));
    assert.ok(c.args.includes('eslint'));
    assert.ok(c.args.some((a) => String(a).includes('npm-cli.js')) || /\bnpm\b/i.test(path.basename(c.cmd)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown install tool is an error; gofmt is manual', () => {
  const inst = createInstaller({ toolsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'med-inst-')) });
  assert.equal(inst.start({ tool: 'no-such-tool' }).error.includes('no install recipe'), true);
  const manual = inst.start({ tool: 'gofmt' });
  assert.ok(manual.manual);
  const listed = inst.recipes();
  assert.equal(listed.eslint.kind, 'npm');
  assert.equal(listed.ruff.kind, 'pip');
});

test('Windows npm.cmd crash code is recognized', () => {
  assert.equal(isNtCrash(3221226505), true);
  assert.equal(isNtCrash(-1073740791), true);
  assert.equal(isNtCrash(1), false);
  assert.equal(isNtCrash(0), false);
});

test('runtimeMissing points pip at Python and npm at Node.js', () => {
  assert.deepEqual(runtimeMissing('pip'), { missing: 'Python', runtime: 'python' });
  assert.deepEqual(runtimeMissing('npm'), { missing: 'Node.js', runtime: 'node' });
  assert.equal(runtimeMissing('cargo'), null);
  assert.ok(PYTHON_WIN.version);
});

test('Windows Store python stubs are app aliases; winget is not', () => {
  assert.equal(isAppAlias(''), true);
  assert.equal(isAppAlias(null), true);
  assert.equal(isAppAlias('C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe'), true);
  assert.equal(isAppAlias('C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe'), true);
  assert.equal(isAppAlias('C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe'), false);
});

for (const [lang, tools] of Object.entries(FORMATTERS)) {
  test(`formatters for ${lang} have unique ids`, () => {
    assert.ok(tools.length >= 1, lang);
    const ids = tools.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, ids.join(','));
    for (const t of tools) {
      assert.ok(t.id && t.label, JSON.stringify(t));
      assert.ok(t.builtin || t.cmd || t.npm);
    }
  });
}

for (const [lang, tools] of Object.entries(LINTERS)) {
  test(`linters for ${lang} have unique ids`, () => {
    assert.ok(tools.length >= 1, lang);
    const ids = tools.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, ids.join(','));
  });
}

test('built-in JSON and XML formatters pretty-print without a tool', async () => {
  const fmt = createFormatter({ toolsDir: path.join(os.tmpdir(), 'med-no-tools') });
  const json = await fmt.run({ language: 'JSON', text: '{"a":1,"b":[2,3]}', tool: 'builtin-json', tabSize: 2, insertSpaces: true });
  assert.equal(json.tool, 'builtin-json');
  assert.match(String(json.text || ''), /"a": 1/);
  const xml = formatXml('<root><a>1</a><b/></root>', { tabSize: 2, insertSpaces: true });
  assert.match(xml, /<root>/);
  assert.match(xml, /<\/root>/);
});

test('resolveFormatter: none, indent, auto, missing', () => {
  const tools = { JavaScript: [{ id: 'prettier', label: 'Prettier', available: true }] };
  assert.equal(resolveFormatter({ lang: null }).label.length > 0, true);
  assert.equal(resolveFormatter({ lang: 'JavaScript', settings: { formatters: { JavaScript: 'none' } }, tools }).off, true);
  assert.ok(resolveFormatter({ lang: 'JavaScript', settings: { formatters: { JavaScript: 'indent' } }, tools }).label);
  const auto = resolveFormatter({ lang: 'JavaScript', settings: { formatters: {} }, tools });
  assert.equal(auto.auto, true);
  const miss = resolveFormatter({ lang: 'JavaScript', settings: { formatters: { JavaScript: 'black' } }, tools });
  assert.equal(miss.missing, true);
});

test('linter.languages lists every registered checker language', () => {
  const linter = createLinter({ toolsDir: path.join(os.tmpdir(), 'med-no-tools') });
  const langs = linter.languages();
  for (const name of Object.keys(LINTERS)) assert.ok(langs.includes(name), name);
});

for (const kind of Object.keys(INSTALL_KIND_LABEL)) {
  test(`install kind label ${kind}`, () => {
    assert.match(INSTALL_KIND_LABEL[kind], /^inst_kind_/);
  });
}

test('install steps stay four labelled stages', () => {
  assert.equal(INSTALL_STEPS.length, 4);
  assert.deepEqual(INSTALL_STEPS.map((s) => s.id), ['ready', 'fetch', 'apply', 'finish']);
  const idle = installProgress('running', '');
  assert.equal(idle[0].status, 'run');
  assert.equal(idle[3].status, 'wait');
});

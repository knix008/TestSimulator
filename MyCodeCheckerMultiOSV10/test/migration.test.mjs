// Workspaces saved by older versions load with renamed fields and keep their
// triage: the same sources re-analyzed give the same issue keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createStore } = require('../core/store.js');
const { analyzeSources } = require('../core/analyze.js');
const projectfile = require('../core/projectfile.js');
const { migrateWorkspace, LEGACY_KEYS, LEGACY_VALUES } = require('../core/compat/migrate.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'compat');
const SOURCES = [
  { path: 'src/a.c', text: 'int f(int x) {\n  int y = x / 0;\n  if (0) { y = 1; }\n  return y;\n}\n' },
  { path: 'src/b.js', text: 'var a = 1;\neval(a);\n' },
];

function loadOld() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-migrate-'));
  fs.copyFileSync(path.join(FIX, 'old-workspace.json'), path.join(dir, 'workspace.json'));
  return { dir, ws: createStore(dir).load() };
}

test('an old workspace loads with the renamed sections, fields and ids', () => {
  const { dir, ws } = loadOld();
  try {
    const left = [];
    (function walk(v) {
      if (typeof v === 'string') { if (LEGACY_VALUES.includes(v) || /^cov:/.test(v)) left.push(v); return; }
      if (!v || typeof v !== 'object') return;
      for (const [k, x] of Object.entries(v)) { if (LEGACY_KEYS.includes(k)) left.push(k); walk(x); }
    })(ws);
    assert.deepEqual(left, [], 'no legacy names left');
    assert.equal(ws.defectAnalysis.policies[0].name, 'Strict');
    assert.equal(ws.defectAnalysis.components[0].name, 'Core');
    assert.equal(ws.defectAnalysis.models[0].key, 'defect:model:pool');
    assert.equal(ws.gates[0].id, 'checker-way');
    assert.equal(ws.gates[0].name, 'Checker way');
    assert.equal(ws.projects[0].gateId, 'checker-way');
    assert.deepEqual(ws.profiles[0].inactive, ['defect:UNREACHABLE']);
    assert.deepEqual(ws.profiles[0].overrides, { 'defect:UNINIT': 'MINOR' });
    assert.equal(ws.customRules[0].ref, 'S100');
    assert.deepEqual(ws.customRules[0].tags, ['defect-analysis']);
    assert.equal(ws.schedules[0].kind, 'weakness');
    assert.deepEqual(ws.schedules[0].kinds, ['executive', 'defect-security', 'weakness']);
    assert.deepEqual(ws.webhooks[0].events, ['analysis', 'defect-high-impact']);
    assert.equal(ws.notifications.subscriptions[0].event, 'defect-high-impact');
    const latest = ws.projects[0].branches.main.latest;
    assert.equal(latest.defectAnalysis.snapshot, 3);
    assert.equal(latest.issues[0].rule, 'defect:DEADCODE');
    assert.equal(latest.issues[0].defectStatus, 'Triaged');
    assert.equal(ws.projects[0].history[0].defectAnalysis.outstanding, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('triage survives: re-analysis matches the stored issue keys', () => {
  const { dir, ws } = loadOld();
  try {
    const state = ws.projects[0].issueState;
    assert.equal(state['0f2317de9be9b3cc'].classification, 'Bug');
    assert.equal(state['0f2317de9be9b3cc'].defectStatus, 'Triaged');
    assert.equal(state['0f2317de9be9b3cc'].comments[0].text, 'real defect');
    const result = analyzeSources(SOURCES);
    const dead = result.issues.find((i) => i.rule === 'defect:DEADCODE');
    const evalIssue = result.issues.find((i) => i.rule === 'js:eval');
    assert.ok(dead && evalIssue, 'the same rules fire');
    assert.equal(dead.key, '0f2317de9be9b3cc');
    assert.equal(evalIssue.key, '4957d1765a92e258');
    for (const old of ws.projects[0].branches.main.latest.issues) {
      assert.ok(result.issues.some((i) => i.key === old.key && i.rule === old.rule), `issue ${old.key} matched`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migration is idempotent and leaves a current workspace unchanged', () => {
  const { dir, ws } = loadOld();
  try {
    assert.deepEqual(migrateWorkspace(ws), ws);
    const current = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-fresh-'))).load();
    assert.equal(migrateWorkspace(current), current);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an old project file opens with the current default gate id', () => {
  const info = projectfile.readProjectFile(path.join(FIX, 'old-project.mccp'));
  assert.equal(info.settings.gateId, 'checker-way');
  assert.deepEqual(info.settings.profiles, { js: 'all-checker-way' });
});

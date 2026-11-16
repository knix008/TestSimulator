// The Progress and Code tabs' models against a real run of the autonomous dev loop (offline model, real tests).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCore } from '../../core/app.js';
import { buildTemplate } from '../../core/templates.js';
import { changedLines, lineDiff } from '../../core/diff.js';
import { progressModel, codeModel, progressHtml, codeHtml } from '../../src/editor/progress.js';

const t = (k, v = {}) => `${k}${Object.values(v).length ? `(${Object.values(v).join(',')})` : ''}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-progress-'));
const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1, samples: false });
core.settings.update({ workDir: work, allowShell: true });
const doc = core.agents.create(buildTemplate('autodev-loop', 'ko'));
const started = core.engine.start(doc.id, { kind: 'manual', payload: undefined });
const run = await core.engine.wait(started.id);
test.after(async () => { await core.close(); fs.rmSync(work, { recursive: true, force: true }); });
// the page reads the same run for the guide's screenshots
if (process.env.MYAGENTS_DUMP_RUN) fs.writeFileSync(process.env.MYAGENTS_DUMP_RUN, JSON.stringify({ doc, run }));

test('changed lines: new, edited and removed lines between two versions', () => {
  const c = changedLines('a\nb\nc', 'a\nB\nc\nd');
  assert.deepEqual([...c.added], [2, 4]);
  assert.equal(c.removed, 1);
  assert.equal(changedLines(null, 'x\ny').fresh, true);
  assert.equal(lineDiff('a', 'a').same, true);
});

test('progress: eight phases in order, all done, two rounds, tests failed then passed', () => {
  assert.equal(run.status, 'succeeded', run.error?.message);
  const m = progressModel(doc, run, 'ko');
  assert.deepEqual(m.phases.map((p) => p.name), ['1 요구사항', '2 코드 가져오기', '3 분석', '4 구현', '5 단위 테스트', '6 통합 테스트', '7 GUI 테스트', '8 보고']);
  assert.equal(m.percent, 100);
  assert.equal(m.round, 2);
  const unit = m.tests.find((x) => x.kind === 'unit');
  assert.deepEqual(unit.rounds.map((r) => r.ok), [false, true]);
  assert.equal(unit.rounds[1].passed, 3);
  assert.deepEqual(m.tests.map((x) => x.kind), ['unit', 'integration', 'gui']);
  const html = progressHtml(m, t);
  assert.equal((html.match(/class="pg-phase /g) ?? []).length, 8);
  assert.match(html, /aria-valuenow="100"/);
  assert.equal((html.match(/<i class="(ok|bad)"/g) ?? []).length, 6, 'two rounds for each of the three test nodes');
});

test('progress while running: the busy phase shows, the rest wait; before any run: a hint', () => {
  const half = { ...run, status: 'running', endedAt: null, ms: 0, steps: run.steps.slice(0, 8).map((s, i, a) => (i === a.length - 1 ? { ...s, status: 'running' } : s)) };
  const m = progressModel(doc, half, 'ko', run.startedAt + 1500);
  assert.ok(m.percent > 0 && m.percent < 100);
  assert.ok(m.phases.some((p) => p.state === 'running'));
  assert.ok(m.phases.some((p) => p.state === 'pending'));
  assert.equal(m.ms, 1500);
  assert.match(progressHtml(progressModel(doc, null), t), /progress\.none/);
});

test('code: every file the run wrote, with versions and the changed lines of the newest', () => {
  const files = codeModel(run);
  const names = files.map((f) => f.file);
  for (const f of ['autodev/todo-app/src/todo.mjs', 'autodev/todo-app/test/unit/todo.test.mjs', 'autodev/todo-app/REPORT.md']) assert.ok(names.includes(f), f);
  const todo = files.find((f) => f.file === 'autodev/todo-app/src/todo.mjs');
  assert.ok(todo.versions.length >= 2, 'written again by the fix');
  assert.ok(todo.added > 0, 'the fix changed lines');
  const html = codeHtml(files, todo.file, t);
  assert.match(html, /class="code-file active"[^>]*data-code-file="autodev\/todo-app\/src\/todo.mjs"|data-code-file="autodev\/todo-app\/src\/todo.mjs"[^>]*aria-selected="true"/);
  assert.ok((html.match(/class="code-line changed"/g) ?? []).length === todo.added, 'the changed lines are marked');
  assert.match(codeHtml([], null, t), /code\.none/);
});

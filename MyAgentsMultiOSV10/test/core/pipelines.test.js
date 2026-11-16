// The end-to-end templates really do the work: files are written, tests run, the build produces dist/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCore } from '../../core/app.js';
import { buildTemplate } from '../../core/templates.js';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-pipe-'));
const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1, samples: true });
core.settings.update({ workDir: work, allowShell: true });
test.after(async () => { await core.close(); fs.rmSync(work, { recursive: true, force: true }); });

async function runDoc(doc, payload) {
  const agent = core.agents.create(doc);
  const trig = agent.nodes.find((n) => n.type.startsWith('trigger.'));
  const started = core.engine.start(agent.id, { kind: trig.type.split('.')[1], payload });
  const timer = setInterval(() => { if (core.engine.get(started.id)?.status === 'waiting') core.engine.resume(started.id, { approved: true, comment: 'ok' }); }, 5);
  try { return await core.engine.wait(started.id); } finally { clearInterval(timer); }
}
const runTemplate = (id, lang = 'en', payload) => runDoc(buildTemplate(id, lang), payload);
const stepsOf = (run, name) => run.steps.filter((s) => s.name === name);

test('software pipeline: analysis → code → tests pass → approval → build → report', async () => {
  const r = await runTemplate('sw-pipeline');
  assert.equal(r.status, 'succeeded', r.error?.message);
  const dir = path.join(work, 'pipeline', 'textutil');
  for (const f of ['src/textutil.mjs', 'test/textutil.test.mjs', 'build.mjs', 'dist/textutil.mjs', 'dist/build-info.json', 'REPORT.md']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const tests = stepsOf(r, 'Run tests');
  assert.equal(tests.length, 1, 'passed on the first attempt');
  assert.equal(tests[0].output.code, 0);
  assert.match(tests[0].output.stdout, /pass 3/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'build-info.json'), 'utf8')).files[0].file, 'textutil.mjs');
  assert.match(fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8'), /built 1 file/);
});

test('software pipeline: failing tests are analysed, fixed and run again', async () => {
  // The first files carry a bug (capitalize lower-cases); the fix step writes the correct example.
  const doc = buildTemplate('sw-pipeline', 'en');
  const prep = doc.nodes.find((n) => n.name === 'Prepare files');
  prep.config.code = prep.config.code.replace('return { files: usable ? given : fallback', "fallback[0].content = fallback[0].content.replace('toUpperCase()', 'toLowerCase()');\nreturn { files: usable ? given : fallback");
  const r = await runDoc(doc);
  assert.equal(r.status, 'succeeded', r.error?.message);
  assert.deepEqual(stepsOf(r, 'Run tests').map((s) => s.output.code), [1, 0], 'failed once, then passed after the fix');
  assert.equal(stepsOf(r, 'Analyse & fix').length, 1);
  assert.equal(stepsOf(r, 'Attempts').at(-1).output.attempt, 2);
});

test('bug fix pipeline: reproduce (fails) → patch → regression test passes → commit message', async () => {
  const r = await runTemplate('bugfix-pipeline');
  assert.equal(r.status, 'succeeded', r.error?.message);
  assert.notEqual(stepsOf(r, 'Reproduce')[0].output.code, 0, 'the bug was reproduced');
  assert.equal(stepsOf(r, 'Regression test')[0].output.code, 0, 'fixed');
  assert.match(fs.readFileSync(path.join(work, 'pipeline', 'pricing', 'src', 'price.mjs'), 'utf8'), /rate \/ 100/);
  assert.match(String(r.output), /Regression test: passed/);
});

test('release, incident, expense and contract pipelines do their work', async () => {
  await runTemplate('release-pipeline');
  assert.ok(fs.existsSync(path.join(work, 'pipeline', 'textutil', 'release', 'CHANGELOG-1.4.0.md')));
  const inc = await runTemplate('incident-pipeline');
  assert.equal(inc.steps.find((s) => s.name === 'Severity').output.category, 'critical');
  assert.match(stepsOf(inc, 'Remediate')[0].output.stdout, /restart requested for payment-api/);
  const exp = await runTemplate('expense-pipeline');
  const totals = exp.steps.find((s) => s.name === 'Totals & limits').output;
  assert.equal(totals.total, 157800);
  assert.deepEqual(totals.over.map((o) => o.desc), ['client lunch']);
  const con = await runTemplate('contract-pipeline');
  assert.equal(con.steps.find((s) => s.name === 'Risk level').output.level, 'high');
  assert.ok(fs.readdirSync(path.join(work, 'contracts')).length >= 1);
  const data = await runTemplate('data-pipeline');
  assert.equal(data.steps.find((s) => s.name === 'Statistics').output.total, 7300);
});

test('customer service pipeline: each kind of message takes its own branch', async () => {
  const reply = async (message) => String((await runTemplate('support-pipeline', 'en', { message })).output);
  assert.match(await reply('Where is order A-1002?'), /A-1002: shipped/);
  assert.match(await reply('It arrived broken, I want a refund'), /refund is approved/);
  assert.match(await reply('How long does shipping take?'), /offline model/);
});

test('autonomous dev loop: reads the code, implements, unit + integration + GUI tests, fails once, fixes, passes, reports', async () => {
  const r = await runTemplate('autodev-loop');
  assert.equal(r.status, 'succeeded', r.error?.message);
  const dir = path.join(work, 'autodev', 'todo-app');
  const rounds = stepsOf(r, 'Results').map((s) => s.output);
  assert.equal(rounds.length, 2, 'two rounds: the deliberate bug, then the fix');
  assert.equal(rounds[0].green, false);
  assert.equal(rounds[1].green, true);
  assert.equal(stepsOf(r, 'Analyse failures & fix').length, 1);
  const [u1, u2] = stepsOf(r, 'Unit tests').map((s) => s.output);
  assert.ok(u1.failed >= 1 && u2.failed === 0 && u2.passed === 3, 'unit: failed, then 3 passed');
  const integ = stepsOf(r, 'Integration tests').at(-1).output;
  assert.equal(integ.passed, 1);
  const gui = stepsOf(r, 'GUI tests').at(-1).output;
  assert.equal(gui.failed, 0);
  assert.ok(gui.passed === 4 || gui.skipped === 1, `GUI: ${gui.passed} passed, ${gui.skipped} skipped`);
  assert.ok(stepsOf(r, 'Read existing code')[0].output.count >= 4, 'the existing code was read');
  assert.match(fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8'), /all green in round 2/);
  assert.ok(r.steps.filter((s) => s.type === 'tool.file').every((s) => s.output.file && typeof s.output.text === 'string'), 'file steps carry their text for the code window');
  const phases = new Set(buildTemplate('autodev-loop', 'en').nodes.map((n) => n.phase));
  assert.equal(phases.size, 8);
});

// Task scheduler data (src/cad/tasks.js): schedules (once, daily, weekly, interval, missed slots), file selection,
// output names, property updates, run results and logs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, nextRun, dueTasks, filesOf, outputPath, applyProperties, partsWithoutDrawing, finishRun, logLine, logCsv, normalizeTask, scheduleText, fillValue } from '../../src/cad/tasks.js';
import { createProject, addDrawing } from '../../src/cad/document.js';

const at = (s) => new Date(s);
const task = (schedule, extra = {}) => ({ ...createTask('export', { id: 't1', name: 'Nightly' }), created: '2026-11-20T08:00:00', schedule: { ...createTask('export').schedule, ...schedule }, ...extra });

test('manual tasks never come due; disabled ones neither', () => {
  assert.equal(nextRun(task({ mode: 'manual' })), null);
  assert.equal(nextRun(task({ mode: 'daily', time: '22:00' }, { enabled: false })), null);
});

test('once: due at its time, then not again (and the task turns itself off)', () => {
  const t = task({ mode: 'once', at: '2026-11-21T10:30' });
  assert.equal(+nextRun(t), +at('2026-11-21T10:30'));
  assert.deepEqual(dueTasks([t], at('2026-11-21T10:29')), []);
  assert.deepEqual(dueTasks([t], at('2026-11-21T10:31')).map((x) => x.id), ['t1']);
  const done = finishRun(t, [logLine('ok', 'a.mymech', 'done')], { at: at('2026-11-21T10:31') });
  assert.equal(nextRun(done), null); assert.equal(done.enabled, false);
});

test('daily: the first slot after the last run; a slot missed while closed is due at once, only once', () => {
  const t = task({ mode: 'daily', time: '22:00' });
  assert.equal(+nextRun(t), +at('2026-11-20T22:00'), 'created at 08:00 → 22:00 the same day');
  const ran = { ...t, lastRun: at('2026-11-20T22:00:05').toISOString() };
  assert.equal(+nextRun(ran), +at('2026-11-21T22:00'));
  // Closed from the 21st to the 24th morning: the 21st's slot is due now; after running, the 24th at 22:00.
  assert.deepEqual(dueTasks([ran], at('2026-11-24T09:00')).map((x) => x.id), ['t1']);
  const caught = { ...ran, lastRun: at('2026-11-24T09:00').toISOString() };
  assert.equal(+nextRun(caught), +at('2026-11-24T22:00'));
});

test('weekly: only on its weekdays', () => {
  // 2026-11-20 is a Friday; Mon / Wed at 07:15 → Monday the 23rd.
  const t = task({ mode: 'weekly', time: '07:15', weekdays: [1, 3] });
  assert.equal(+nextRun(t), +at('2026-11-23T07:15'));
  assert.equal(+nextRun({ ...t, lastRun: at('2026-11-23T07:20').toISOString() }), +at('2026-11-25T07:15'));
  assert.equal(nextRun(task({ mode: 'weekly', weekdays: [] })), null);
});

test('interval: every N minutes after the last run; several due tasks come oldest first', () => {
  const a = task({ mode: 'interval', minutes: 30 }, { id: 'a', lastRun: at('2026-11-22T10:00').toISOString() });
  const b = task({ mode: 'interval', minutes: 10 }, { id: 'b', lastRun: at('2026-11-22T10:15').toISOString() });
  assert.equal(+nextRun(a), +at('2026-11-22T10:30'));
  assert.deepEqual(dueTasks([a, b], at('2026-11-22T10:31')).map((x) => x.id), ['b', 'a']);
  assert.deepEqual(dueTasks([a, b], at('2026-11-22T10:20')).map((x) => x.id), []);
});

test('files: a folder listing filtered by kind and name pattern, de-duplicated and sorted', () => {
  const listing = ['D:/w/b.mymech', 'D:/w/sub/a.MYMECH', 'D:/w/a.step', 'D:/w/notes.txt', 'D:/w/b.mymech', 'D:/w/x-old.mymech'];
  const t = { ...createTask('export'), source: { type: 'folder', folder: 'D:/w', pattern: '*' } };
  assert.deepEqual(filesOf(t, listing), ['D:/w/b.mymech', 'D:/w/sub/a.MYMECH', 'D:/w/x-old.mymech']);
  assert.deepEqual(filesOf({ ...t, source: { ...t.source, pattern: '*-old*' } }, listing), ['D:/w/x-old.mymech']);
  const imp = { ...createTask('import'), source: { type: 'files', paths: ['C:/m/a.step', 'C:/m/b.igs', 'C:/m/c.mymech'] } };
  assert.deepEqual(filesOf(imp), ['C:/m/a.step', 'C:/m/b.igs']);
});

test('output names: beside the source or in the output folder; tokens filled; unsafe characters replaced', () => {
  const t = createTask('export');
  assert.equal(outputPath(t, 'D:/w/Pump.mymech', 'Impeller', 'step'), 'D:/w/Pump - Impeller.step');
  const o = { ...t, output: { folder: 'E:/out', sameAsSource: false, template: '{name}_{doc}_{date}' } };
  assert.equal(outputPath(o, 'D:/w/Pump.mymech', 'A/B:C', 'dxf', at('2026-11-22T12:00')), 'E:/out/Pump_A_B_C_2026-11-22.dxf');
  assert.equal(outputPath(t, 'Pump.mymech', null, 'html'), 'Pump.html');
});

test('properties: set always or only where empty, tokens filled, unknown fields ignored, changes listed', () => {
  const p = createProject({ name: 'Pump', kind: 'part' });
  p.parts[0].name = 'Impeller'; p.parts[0].partNo = 'P-1';
  addDrawing(p, { kind: 'part', id: p.parts[0].id }, 'Impeller drawing').title.date = '';
  const rows = [
    { target: 'part', field: 'partNo', value: '{file}-{name}', mode: 'ifEmpty' },
    { target: 'part', field: 'description', value: 'From {project}', mode: 'set' },
    { target: 'drawing', field: 'company', value: 'ACME', mode: 'set' },
    { target: 'drawing', field: 'date', value: '{date}', mode: 'set' },
    { target: 'part', field: 'features', value: 'x', mode: 'set' },
  ];
  const changes = applyProperties(p, rows, { file: 'D:/w/pump-v2.mymech', now: at('2026-11-22T09:00') });
  assert.equal(p.parts[0].partNo, 'P-1', 'not empty → kept');
  assert.equal(p.parts[0].description, 'From Pump');
  assert.equal(p.drawings[0].title.company, 'ACME'); assert.equal(p.drawings[0].title.date, '2026-11-22');
  assert.deepEqual(changes.map((c) => c.field), ['description', 'company', 'date']);
  assert.equal(applyProperties(p, rows, { file: 'D:/w/pump-v2.mymech', now: at('2026-11-22T09:00') }).length, 0, 'a second run changes nothing');
  p.parts[0].partNo = '';
  applyProperties(p, rows, { file: 'D:/w/pump-v2.mymech' });
  assert.equal(p.parts[0].partNo, 'pump-v2-Impeller');
  assert.equal(fillValue('{date}', { now: at('2026-01-02T00:00') }), '2026-01-02');
});

test('drawings: the parts that still need one', () => {
  const p = createProject({ name: 'Set', kind: 'part' });
  p.parts.push({ ...p.parts[0], id: 'part-2', name: 'Second' });
  addDrawing(p, { kind: 'part', id: p.parts[0].id }, 'First drawing');
  assert.deepEqual(partsWithoutDrawing(p).map((x) => x.id), ['part-2']);
});

test('runs: status from the log, logs kept short, CSV escaped; tasks read back with defaults', () => {
  const t = createTask('rebuild');
  const r1 = finishRun(t, [logLine('ok', 'a.mymech', 'saved'), logLine('error', 'b.mymech', 'Fillet1: "failed", sorry')], { at: at('2026-11-22T10:00') });
  assert.equal(r1.lastStatus, 'partial');
  assert.equal(finishRun(t, [logLine('error', 'b', 'x')]).lastStatus, 'failed');
  assert.equal(finishRun(t, [logLine('info', '', 'nothing to do')]).lastStatus, 'ok');
  let many = t; for (let i = 0; i < 25; i++) many = finishRun(many, [logLine('ok', 'f', String(i))]);
  assert.equal(many.log.length, 20);
  const csv = logCsv(r1.log[0].lines);
  assert.match(csv, /^Time,Level,File,Message\n/);
  assert.ok(csv.includes('"Fillet1: ""failed"", sorry"'));
  assert.equal(normalizeTask({ kind: 'nope' }), null);
  const back = normalizeTask({ kind: 'export', id: 'x', schedule: { mode: 'daily' } });
  assert.equal(back.schedule.time, '22:00'); assert.deepEqual(back.options.formats, ['step']);
  const tt = (k, a) => `${k}:${JSON.stringify(a ?? {})}`;
  assert.equal(scheduleText(task({ mode: 'weekly', weekdays: [1, 5], time: '06:00' }), tt), 'sched.weeklyAt:{"days":"Mo Fr","time":"06:00"}');
});

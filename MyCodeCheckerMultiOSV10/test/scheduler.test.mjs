// Cron schedules and the scheduled-scan runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sch = require('../core/scheduler.js');
const { createApi } = require('../core/api.js');

const at = (s) => new Date(s);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

test('cron parsing: ranges, steps, lists, aliases and errors', () => {
  const c = sch.parseCron('*/15 9-17 * * 1-5');
  assert.deepEqual([...c.minute], [0, 15, 30, 45]);
  assert.equal(c.hour.size, 9);
  assert.deepEqual([...sch.parseCron('0 0 * * 7').weekday], [0], '7 is Sunday');
  assert.ok(sch.parseCron('@daily'));
  assert.throws(() => sch.parseCron('* * *'), /5 fields/);
  assert.throws(() => sch.parseCron('61 * * * *'), /out of range/);
  assert.throws(() => sch.parseCron('a * * * *'), /Bad cron/);
});

test('next run times', () => {
  assert.equal(iso(sch.nextRun('0 2 * * *', at('2026-10-26T10:00:00'))), '2026-10-27 02:00');
  assert.equal(iso(sch.nextRun('30 * * * *', at('2026-10-26T10:30:00'))), '2026-10-26 11:30');
  assert.equal(iso(sch.nextRun('0 9 * * 1', at('2026-10-26T09:00:00'))), '2026-11-02 09:00', 'next Monday (26 Oct 2026 is a Monday)');
  assert.equal(iso(sch.nextRun('0 0 1 * *', at('2026-10-26T00:00:00'))), '2026-11-01 00:00');
  assert.equal(iso(sch.nextRun('0 0 29 2 *', at('2026-03-01T00:00:00'))), '2028-02-29 00:00');
  assert.equal(iso(sch.nextRun('0 12 13 * 5', at('2026-10-26T00:00:00'))), '2026-10-30 12:00', 'day OR weekday when both are set');
});

test('the runner runs due schedules once and records history', async () => {
  let list = [sch.normalize({ id: 's1', kind: 'scan', path: '/x', cron: '* * * * *' }, at('2026-01-01T00:00:00'))];
  let clock = at('2026-01-01T00:05:00');
  const ran = [];
  const runner = sch.createScheduler({ load: () => JSON.parse(JSON.stringify(list)), save: (l) => { list = l; }, run: async (s) => { ran.push(s.id); return { status: 'SUCCESS', summary: 'ok' }; }, now: () => clock });
  await runner.tick();
  await runner.tick();
  assert.deepEqual(ran, ['s1'], 'not again before the next minute');
  assert.equal(list[0].lastStatus, 'SUCCESS');
  assert.equal(list[0].history.length, 1);
  clock = at('2026-01-01T00:07:00');
  await runner.tick();
  assert.equal(ran.length, 2);
  assert.throws(() => sch.normalize({ kind: 'dast', cron: '@daily' }), /target/);
});

test('API: save, preview, run now, and scheduled run through the workspace', async () => {
  const api = createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-sch-')) });
  const s = await api.call('schedule.save', { schedule: { kind: 'scan', path: path.resolve('samples/demo'), cron: '0 3 * * *', name: 'Nightly' } });
  assert.ok(s.nextRun);
  assert.equal((await api.call('schedule.preview', { cron: '0 3 * * *', count: 3 })).length, 3);
  const r = await api.call('schedule.runNow', { id: s.id });
  assert.match(r.summary, /gate/);
  assert.equal(api.store.load().projects.length, 1);
  const ws = api.store.load();
  ws.schedules[0].nextRun = new Date(Date.now() - 60000).toISOString();
  api.store.save(ws);
  const done = await api.scheduler.tick();
  assert.equal(done.length, 1);
  assert.ok(Date.parse(api.store.load().schedules[0].nextRun) > Date.now());
  await api.call('schedule.delete', { id: s.id });
  assert.deepEqual(await api.call('schedule.list'), []);
});

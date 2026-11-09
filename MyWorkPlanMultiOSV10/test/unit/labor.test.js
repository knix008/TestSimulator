// Wages and labor cost: pay bases turn into the hourly rate with the project's
// working time, the wage survives save and reload, the sheet columns edit it, and
// the labor split of every sample adds up to the scheduled cost.
import assert from 'node:assert/strict';
import test from 'node:test';
import { WAGE_BASES, hourlyFromWage, hoursPerBasis, laborBreakdown, refreshWages, setWage, wageOf } from '../../src/domain/labor.js';
import { parsePlan, serialize } from '../../src/domain/format.js';
import { schedule } from '../../src/domain/schedule.js';
import { addResource, assignResource, createProject, insertTask } from '../../src/domain/project.js';
import { RESOURCE_FIELD_MAP, RESOURCE_TABLES, TASK_FIELD_MAP, TASK_TABLES } from '../../src/domain/fields.js';
import { SAMPLE_PROJECTS, buildSampleProject } from '../../src/domain/samples/index.js';
import { buildSample } from '../../src/domain/templates.js';

const START = '2026-10-19T08:00';
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 0.5, `${label}: ${a} ≠ ${b}`);

/** Two people, a material and a fixed cost on three tasks. */
function plan() {
  const p = createProject({ title: 'Labor', start: START, language: 'en' });
  const a = insertTask(p, 0, { name: 'Design', duration: 5 * 480, durationUnit: 'd' });
  const b = insertTask(p, 1, { name: 'Build', duration: 10 * 480, durationUnit: 'd' });
  const c = insertTask(p, 2, { name: 'Paint', duration: 2 * 480, durationUnit: 'd' });
  c.fixedCost = 500;
  const ann = addResource(p, { name: 'Ann', type: 'work' });
  const bob = addResource(p, { name: 'Bob', type: 'work', stdRate: 30 });
  const paint = addResource(p, { name: 'Paint', type: 'material', stdRate: 20 });
  setWage(ann, 'month', 8000, p.options);
  assignResource(p, a.id, ann.id, 1);
  assignResource(p, b.id, ann.id, 0.5);
  assignResource(p, b.id, bob.id, 1);
  assignResource(p, c.id, paint.id, 10);
  return { p, ann, bob, paint };
}

test('hours in each pay period follow the project working time', () => {
  const o = { hoursPerDay: 8, hoursPerWeek: 40, daysPerMonth: 20 };
  assert.deepEqual(WAGE_BASES.map((b) => hoursPerBasis(b, o)), [1, 8, 40, 160, 1920]);
  assert.equal(hoursPerBasis('month', { hoursPerDay: 7.5, daysPerMonth: 22 }), 165);
  assert.equal(hourlyFromWage('month', 4000000, o), 25000);
  assert.equal(hourlyFromWage('day', 200000, o), 25000);
  assert.equal(hourlyFromWage('year', 48000000, o), 25000);
  assert.equal(hourlyFromWage('week', 1000000, o), 25000);
  assert.equal(hourlyFromWage('hour', 31.5, o), 31.5);
  assert.equal(hourlyFromWage('month', 'abc', o), 0, 'nonsense is no pay');
});

test('setWage keeps the wage and sets the hourly rate; hourly pay keeps no wage', () => {
  const r = { type: 'work', stdRate: 0 };
  setWage(r, 'month', 3200000, { hoursPerDay: 8, daysPerMonth: 20 });
  assert.deepEqual(r.wage, { basis: 'month', amount: 3200000 });
  assert.equal(r.stdRate, 20000);
  assert.deepEqual(wageOf(r), { basis: 'month', amount: 3200000 });
  setWage(r, 'hour', 18000, {});
  assert.equal(r.wage, null);
  assert.equal(r.stdRate, 18000);
  assert.deepEqual(wageOf(r), { basis: 'hour', amount: 18000 });
  setWage(r, 'fortnight', -5, {});
  assert.deepEqual([r.wage, r.stdRate], [null, 0], 'unknown basis and negative pay are refused');
});

test('changing the working hours moves the hourly rate of salaried people only', () => {
  const { p, ann, bob } = plan();
  assert.equal(ann.stdRate, 50);
  p.options.daysPerMonth = 25;
  refreshWages(p);
  assert.equal(ann.stdRate, 40);
  assert.equal(bob.stdRate, 30, 'hourly pay stays');
});

test('the wage survives save and reload; bad wages are dropped', () => {
  const { p } = plan();
  const again = parsePlan(serialize(p)).project;
  assert.deepEqual(again.resources[0].wage, { basis: 'month', amount: 8000 });
  assert.equal(again.resources[0].stdRate, 50);
  const raw = JSON.parse(serialize(p));
  raw.project.resources[0].wage = { basis: 'weird', amount: 3 };
  assert.equal(parsePlan(JSON.stringify(raw)).project.resources[0].wage, null);
});

test('labor breakdown: labor, materials, cost resources and fixed costs add up to the cost', () => {
  const { p, ann, bob } = plan();
  const s = schedule(p);
  const b = laborBreakdown(p, s);
  // Ann: 5 d + 10 d × 50% = 10 d = 80 h × 50; Bob: 10 d = 80 h × 30; paint 10 × 20; fixed 500.
  close(b.labor, 80 * 50 + 80 * 30, 'labor');
  close(b.material, 200, 'material');
  close(b.fixed, 500, 'fixed');
  close(b.total, s.cost, 'total = scheduled cost');
  close(b.laborShare, 6400 / 7100, 'share');
  assert.equal(b.people.length, 2, 'materials are not people');
  assert.deepEqual(b.people.map((x) => x.id), [ann.id, bob.id], 'most expensive first');
  assert.deepEqual(b.people.map((x) => x.basis), ['month', 'hour']);
  close(b.people.reduce((sum, x) => sum + x.share, 0), 1, 'people shares');
  close(b.averageHourly, 6400 / 160, 'average rate');
  close(s.laborCost, b.labor, 'schedule keeps the labor total');
});

test('progress: actual and remaining labor', () => {
  const { p } = plan();
  p.tasks[0].percentComplete = 100;
  const b = laborBreakdown(p, schedule(p));
  close(b.actualLabor, 40 * 50, 'actual');
  close(b.remainingLabor, b.labor - b.actualLabor, 'remaining');
});

test('every sample: the labor split adds up and phases cover the labor', () => {
  let paid = 0;
  for (const sample of SAMPLE_PROJECTS) {
    for (const language of ['ko', 'en']) {
      const p = buildSampleProject(sample.id, language, { today: '2026-11-11' });
      const s = schedule(p);
      const b = laborBreakdown(p, s);
      const label = `${sample.id}.${language}`;
      close(b.total, s.cost, `${label} total`);
      close(b.phases.reduce((sum, x) => sum + x.labor, 0), b.labor, `${label} phases`);
      close(b.people.reduce((sum, x) => sum + x.cost, 0), b.labor, `${label} people`);
      // Personal plans may be done by unpaid family members (no labor cost).
      assert.ok(b.labor >= 0 && b.laborShare >= 0 && b.laborShare <= 1, `${label}: labor share ${b.laborShare}`);
      if (b.labor > 0) paid += 1;
      for (const task of p.tasks) {
        const info = s.info(task.id);
        if (info.summary) close(info.laborCost, info.children.map((c) => s.info(c)).filter((c) => c.active).reduce((sum, c) => sum + c.laborCost, 0), `${label}: summary labor of ${task.name}`);
      }
    }
  }
  assert.ok(paid >= 70, `most samples pay their people (${paid} of 80)`);
});

test('the tutorial plan pays people monthly, daily, yearly and hourly at the same cost', () => {
  const p = buildSample('ko', { today: '2026-11-11' });
  const bases = new Set(p.resources.filter((r) => r.type === 'work').map((r) => wageOf(r).basis));
  for (const basis of ['month', 'day', 'year', 'hour']) assert.ok(bases.has(basis), basis);
  const pm = p.resources.find((r) => r.wage?.basis === 'month');
  assert.equal(pm.stdRate, 90000);
  assert.equal(pm.wage.amount, 90000 * 160);
});

test('sheet columns: pay basis and wage edit the hourly rate; typing a rate makes it hourly', () => {
  const { p, ann, paint } = plan();
  const ctx = { project: p, sched: schedule(p), language: 'en', t: (k) => k };
  const basis = RESOURCE_FIELD_MAP.get('wageBasis');
  const wage = RESOURCE_FIELD_MAP.get('wageAmount');
  const rate = RESOURCE_FIELD_MAP.get('stdRate');
  assert.equal(basis.get(ctx, ann), 'month');
  assert.equal(wage.get(ctx, ann), 8000);
  assert.ok(wage.set(ctx, ann, '9,600'));
  assert.equal(ann.stdRate, 60);
  assert.ok(basis.set(ctx, ann, 'day'));
  assert.deepEqual(ann.wage, { basis: 'day', amount: 9600 });
  assert.equal(ann.stdRate, 1200);
  assert.throws(() => wage.set(ctx, ann, '-5'), /badNumber/);
  assert.equal(basis.set(ctx, paint, 'month'), false, 'materials have no wage');
  assert.equal(wage.text(ctx, 0, paint), '');
  rate.set(ctx, ann, '45');
  assert.deepEqual([ann.stdRate, ann.wage], [45, null]);
  const share = RESOURCE_FIELD_MAP.get('laborShare');
  ctx.sched = schedule(p);
  assert.ok(share.get(ctx, ann) > 0 && share.get(ctx, ann) < 1);
  assert.equal(share.text(ctx, 0, paint), '');
  assert.deepEqual(RESOURCE_TABLES.labor, ['indicators', 'name', 'group', 'wageBasis', 'wageAmount', 'stdRate', 'work', 'cost', 'laborShare']);
  assert.ok(TASK_TABLES.cost.includes('laborCost'));
  const task = p.tasks[1];
  assert.equal(TASK_FIELD_MAP.get('laborCost').get(ctx, task, ctx.sched.info(task.id)), 80 * 45 * 0.5 + 80 * 30);
});

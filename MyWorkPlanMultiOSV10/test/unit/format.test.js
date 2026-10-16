// The .mwp / .mwpt file format: saving and reading back, templates, refusals,
// the repairs made to damaged files, and the file-name helpers.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Fm from '../../src/domain/format.js';
import * as P from '../../src/domain/project.js';
import { schedule } from '../../src/domain/schedule.js';
import { buildSample } from '../../src/domain/templates.js';
import { setBaseline } from '../../src/domain/tracking.js';

const sample = () => buildSample('ko', { today: '2026-10-16' });
const failsWith = (fn, code) => assert.throws(fn, (error) => error instanceof Fm.FormatError && error.code === code && error.message === code, code);
const rawPlan = (project) => ({ format: 'myworkplan', version: 1, kind: 'plan', project });

test('serialize / parsePlan round trip keeps the plan and its schedule', () => {
  const project = sample();
  const text = Fm.serialize(project);
  assert.ok(text.endsWith('\n'));
  const data = JSON.parse(text);
  assert.deepEqual([data.format, data.version, data.kind], ['myworkplan', 1, 'plan']);
  assert.ok(!Number.isNaN(Date.parse(data.saved)));
  const { project: back, template } = Fm.parsePlan(text);
  assert.equal(template, false);
  assert.deepEqual(back, JSON.parse(JSON.stringify(project)), 'nothing lost or changed');
  const [a, b] = [schedule(project), schedule(back)];
  assert.equal(b.finish, a.finish);
  assert.equal(b.cost, a.cost);
  assert.equal(Fm.serialize(back).replace(/"saved": "[^"]+"/, ''), text.replace(/"saved": "[^"]+"/, ''), 'saving again gives the same file');
});

test('serialize with a schedule writes dates for other programs, and reading drops them', () => {
  const project = sample();
  const sched = schedule(project);
  const data = JSON.parse(Fm.serialize(project, { sched }));
  const first = data.project.tasks[0];
  assert.match(first.scheduledStart, /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  assert.equal(first.scheduledStart, new Date(sched.info(first.id).start * 60000).toISOString().slice(0, 16));
  assert.equal(project.tasks[0].scheduledStart, undefined, 'the plan itself is not changed');
  const back = Fm.parsePlan(JSON.stringify(data)).project;
  assert.ok(back.tasks.every((task) => !('scheduledStart' in task) && !('scheduledFinish' in task)));
});

test('a template starts fresh: no progress, baselines or status date', () => {
  const project = sample();
  assert.ok(project.tasks.some((task) => task.percentComplete > 0));
  project.tasks[1].levelingDelay = 480;
  const text = Fm.serialize(project, { template: true });
  const { project: back, template } = Fm.parsePlan(text);
  assert.equal(template, true);
  assert.equal(JSON.parse(text).kind, 'template');
  assert.equal(back.statusDate, null);
  assert.deepEqual(back.baselineDates, {});
  for (const task of back.tasks) {
    assert.deepEqual([task.percentComplete, task.actualStart, task.actualFinish, task.levelingDelay], [0, null, null, 0], task.name);
    assert.deepEqual(task.baselines, {});
  }
  assert.equal(back.tasks.length, project.tasks.length, 'the tasks are all there');
  assert.ok(project.tasks.some((task) => task.percentComplete > 0), 'the plan itself keeps its progress');
});

test('parsePlan refuses what is not a plan, with a code', () => {
  failsWith(() => Fm.parsePlan('not json'), 'format.notJson');
  failsWith(() => Fm.parsePlan(''), 'format.notJson');
  failsWith(() => Fm.parsePlan(null), 'format.notJson');
  failsWith(() => Fm.parsePlan('42'), 'format.notPlan');
  failsWith(() => Fm.parsePlan('null'), 'format.notPlan');
  failsWith(() => Fm.parsePlan('"text"'), 'format.notPlan');
  failsWith(() => Fm.parsePlan('[]'), 'format.notPlan');
  failsWith(() => Fm.parsePlan('{}'), 'format.notPlan');
  failsWith(() => Fm.parsePlan(JSON.stringify({ format: 'other', project: { tasks: [] } })), 'format.notPlan');
  failsWith(() => Fm.parsePlan(JSON.stringify({ project: { tasks: 'x' } })), 'format.notPlan');
  failsWith(() => Fm.parsePlan(JSON.stringify({ format: 'myworkplan', version: 2, project: { tasks: [] } })), 'format.newer');
  const error = (() => { try { Fm.parsePlan('{bad'); } catch (e) { return e; } return null; })();
  assert.ok(error.detail, 'the parser message is kept as detail');
  assert.equal(Fm.parsePlan(JSON.stringify({ format: 'myworkplan', version: 2, project: { tasks: [] } }).replace('2', '"1"')).project.tasks.length, 0);
});

test('parsePlan accepts a byte order mark and a bare project object', () => {
  const project = P.createProject({ title: 'Plain', start: '2026-10-19T08:00' });
  P.insertTask(project, 0, { name: 'A' });
  const text = `\uFEFF${Fm.serialize(project)}`;
  assert.equal(Fm.parsePlan(text).project.title, 'Plain');
  const bare = Fm.parsePlan(JSON.stringify({ title: 'Bare', tasks: [{ name: 'X' }] }));
  assert.equal(bare.project.title, 'Bare');
  assert.equal(bare.project.tasks[0].name, 'X');
  assert.equal(bare.template, false);
});

test('normalizeProject fills a minimal project with defaults', () => {
  const p = Fm.normalizeProject({ tasks: [{}] }, 'en');
  assert.equal(p.format, 'myworkplan');
  assert.equal(p.title, 'Project');
  assert.equal(p.options.currency, '$');
  assert.deepEqual(p.calendars.map((cal) => cal.id), ['standard', '24hours', 'night']);
  assert.equal(p.calendarId, 'standard');
  const task = p.tasks[0];
  assert.ok(task.id);
  assert.deepEqual([task.name, task.outlineLevel, task.duration, task.priority, task.type], ['', 1, 480, 500, 'fixedUnits']);
  assert.deepEqual(task.constraint, { type: 'ASAP', date: null });
  assert.deepEqual([p.resources, p.assignments, p.baselineDates], [[], [], {}]);
  failsWith(() => Fm.normalizeProject(null), 'format.notPlan');
  failsWith(() => Fm.normalizeProject({ tasks: {} }), 'format.notPlan');
});

test('normalizeProject repairs outline levels and bad numbers', () => {
  const p = Fm.normalizeProject({
    tasks: [
      { id: 'a', name: 'A', outlineLevel: 3 },
      { id: 'b', name: 'B', outlineLevel: 7 },
      { id: 'c', name: 'C', outlineLevel: 'x' },
      { id: 'd', name: 'D', outlineLevel: -4, duration: -60, percentComplete: 250, priority: 5000, fixedCost: 'lots', levelingDelay: -5, type: 'odd' },
      { id: 'e', name: 7, duration: 'long', percentComplete: 'half' },
      null,
      'junk',
    ],
  });
  assert.deepEqual(p.tasks.map((task) => task.outlineLevel), [1, 2, 1, 1, 1]);
  const d = p.tasks[3];
  assert.deepEqual([d.duration, d.percentComplete, d.priority, d.fixedCost, d.levelingDelay, d.type], [0, 100, 1000, 0, 0, 'fixedUnits']);
  const e = p.tasks[4];
  assert.deepEqual([e.name, e.duration, e.percentComplete], ['7', 480, 0]);
});

test('normalizeProject drops broken links and keeps good ones', () => {
  const p = Fm.normalizeProject({
    tasks: [
      { id: 'a', predecessors: [{ taskId: 'a' }, { taskId: 'zzz' }, null] },
      { id: 'b', predecessors: [{ taskId: 'a', type: 'XX', lag: 'x' }, { taskId: 'c', type: 'SS', lag: 480, lagUnit: 'h' }] },
      { id: 'c', predecessors: 'nope' },
    ],
  });
  const [a, b, c] = p.tasks;
  assert.deepEqual(a.predecessors, [], 'self links and unknown targets go');
  assert.deepEqual(b.predecessors, [{ taskId: 'a', type: 'FS', lag: 0, lagUnit: 'd' }, { taskId: 'c', type: 'SS', lag: 480, lagUnit: 'h' }]);
  assert.deepEqual(c.predecessors, []);
});

test('normalizeProject repairs constraints, dates and calendars of tasks', () => {
  const p = Fm.normalizeProject({
    calendarId: 'gone',
    calendars: [{ id: 'mine', name: 'Mine', week: { 1: [[480, 1020]], 9: [[0, 60]], x: [] }, exceptions: [{ start: '2026-12-25' }, { start: 'never' }, { start: '2026-12-31', finish: 'bad', working: 1, periods: [[600, 500]] }] }],
    tasks: [
      { id: 'a', constraint: { type: 'MSO' } },
      { id: 'b', constraint: { type: 'SNET', date: '2026-10-20' } },
      { id: 'c', constraint: { type: 'WHENEVER', date: '2026-10-20T08:00' } },
      { id: 'd', constraint: { type: 'FNLT', date: 'soon' } },
      { id: 'e', start: '2026-10-19T08:00:00', deadline: 'friday', actualStart: '2026-02-30', calendarId: 'gone' },
      { id: 'f', calendarId: 'mine', constraint: { type: 'ALAP' } },
      { id: 'g', constraint: { type: 'ALAP', date: '2026-10-20T08:00' } },
    ],
  });
  const t = Object.fromEntries(p.tasks.map((task) => [task.id, task]));
  assert.deepEqual(t.a.constraint, { type: 'ASAP', date: null }, 'a dated constraint without a date');
  assert.deepEqual(t.b.constraint, { type: 'SNET', date: '2026-10-20T00:00' });
  assert.deepEqual(t.c.constraint, { type: 'ASAP', date: null }, 'unknown type');
  assert.deepEqual(t.d.constraint, { type: 'ASAP', date: null }, 'unreadable date');
  assert.deepEqual(t.f.constraint, { type: 'ALAP', date: null });
  assert.deepEqual(t.g.constraint, { type: 'ALAP', date: null }, 'ALAP has no date');
  assert.equal(t.e.start, '2026-10-19T08:00');
  assert.equal(t.e.deadline, null);
  assert.equal(t.e.actualStart, null);
  assert.equal(t.e.calendarId, null, 'a missing calendar');
  assert.equal(t.f.calendarId, 'mine');
  assert.equal(p.calendarId, 'mine', 'the project calendar falls back to the first one');
  const cal = p.calendars[0];
  assert.deepEqual(Object.keys(cal.week), ['1']);
  assert.equal(cal.base, null);
  assert.deepEqual(cal.exceptions.map((ex) => [ex.start, ex.finish, ex.working, ex.periods]), [['2026-12-25', '2026-12-25', false, []], ['2026-12-31', '2026-12-31', true, []]]);
  assert.ok(cal.exceptions.every((ex) => ex.id));
  schedule(p);
});

test('normalizeProject: missing or empty calendars get the defaults', () => {
  for (const calendars of [undefined, [], [null, 'x'], 'nope']) {
    const p = Fm.normalizeProject({ calendars, tasks: [] });
    assert.ok(p.calendars.length >= 1, String(calendars));
    assert.ok(p.calendars.some((cal) => cal.id === p.calendarId));
  }
  const unnamed = Fm.normalizeProject({ calendars: [{ week: {} }], tasks: [] });
  assert.deepEqual([unnamed.calendars[0].id, unnamed.calendars[0].name], ['cal-0', 'Calendar 1']);
});

test('normalizeProject makes duplicate task ids unique', () => {
  const p = Fm.normalizeProject({ tasks: [{ id: 'x', name: 'one' }, { id: 'x', name: 'two' }, { id: 'y' }, { id: 'x', name: 'three' }] });
  const ids = p.tasks.map((task) => task.id);
  assert.equal(new Set(ids).size, 4);
  assert.equal(ids[0], 'x', 'the first keeps its id');
});

test('normalizeProject drops assignments to missing tasks or resources', () => {
  const p = Fm.normalizeProject({
    tasks: [{ id: 't' }],
    resources: [{ id: 'r', name: 'R', type: 'robot', maxUnits: -1, stdRate: 'x', calendarId: 'gone' }, null, { name: 'No id' }],
    assignments: [
      { id: 'ok', taskId: 't', resourceId: 'r', units: -2 },
      { taskId: 't', resourceId: 'missing' },
      { taskId: 'missing', resourceId: 'r' },
      { taskId: 't', resourceId: 'r', units: 'x' },
      null,
    ],
  });
  assert.equal(p.resources.length, 2);
  const r = p.resources[0];
  assert.deepEqual([r.type, r.maxUnits, r.stdRate, r.calendarId], ['work', 0, 0, null]);
  assert.ok(p.resources[1].id, 'a resource without an id gets one');
  assert.deepEqual(p.assignments.map((a) => [a.id, a.units]), [['ok', 0], ['a-1', 1]]);
});

test('normalizeProject repairs project fields', () => {
  const p = Fm.normalizeProject({
    title: 42, start: '2026-10-19', finish: 'later', statusDate: '2026-10-21T12:00', scheduleFrom: 'finish',
    options: { hoursPerDay: 'x', hoursPerWeek: 0.1, daysPerMonth: 22, currency: '€' }, unknownField: 1, baselineDates: 'x', tasks: [],
  });
  assert.equal(p.title, '42');
  assert.equal(p.start, '2026-10-19T00:00');
  assert.equal(p.finish, null);
  assert.equal(p.statusDate, '2026-10-21T12:00');
  assert.equal(p.scheduleFrom, 'start', 'from the finish needs a finish date');
  assert.deepEqual([p.options.hoursPerDay, p.options.hoursPerWeek, p.options.daysPerMonth, p.options.currency], [8, 0.5, 22, '€']);
  assert.equal('unknownField' in p, false);
  assert.deepEqual(p.baselineDates, {});
  assert.equal(Fm.normalizeProject({ finish: '2026-12-01', scheduleFrom: 'finish', tasks: [] }).scheduleFrom, 'finish');
  assert.equal(Fm.normalizeProject({ title: '', tasks: [] }).title, 'Project');
});

test('a plan with baselines and progress survives a round trip', () => {
  const project = P.createProject({ start: '2026-10-19T08:00' });
  const a = P.insertTask(project, 0, { name: 'A', duration: 960 });
  setBaseline(project, schedule(project), 0, null, 'then');
  a.percentComplete = 50;
  a.actualStart = '2026-10-19T08:00';
  const back = Fm.parsePlan(Fm.serialize(project)).project;
  assert.deepEqual(back.tasks[0].baselines, a.baselines);
  assert.equal(back.tasks[0].percentComplete, 50);
  assert.equal(back.baselineDates[0], 'then');
});

test('file name helpers', () => {
  assert.equal(Fm.baseName('C:\\Plans\\Site.mwp'), 'Site.mwp');
  assert.equal(Fm.baseName('/home/me/site.mwp'), 'site.mwp');
  assert.equal(Fm.baseName('site.mwp'), 'site.mwp');
  assert.equal(Fm.baseName(null), '');
  assert.equal(Fm.directoryOf('C:\\Plans\\Site.mwp'), 'C:\\Plans');
  assert.equal(Fm.directoryOf('/home/me/site.mwp'), '/home/me');
  assert.equal(Fm.directoryOf('C:/Plans\\sub/x.mwp'), 'C:/Plans\\sub');
  assert.equal(Fm.directoryOf('site.mwp'), '');
  assert.equal(Fm.directoryOf('/site.mwp'), '', 'the root has no directory text');
  assert.equal(Fm.extensionOf('Plan.MWP'), 'mwp');
  assert.equal(Fm.extensionOf('archive.tar.gz'), 'gz');
  assert.equal(Fm.extensionOf('noext'), '');
  assert.equal(Fm.extensionOf('dir.v2/noext'), '', 'a dot in a folder name is not an extension');
  assert.equal(Fm.extensionOf(undefined), '');
  assert.equal(Fm.stripExtension('a/b.c/plan.mwp'), 'a/b.c/plan');
  assert.equal(Fm.stripExtension('plan'), 'plan');
  assert.equal(Fm.withExtension('plan', 'mwp'), 'plan.mwp');
  assert.equal(Fm.withExtension('plan.mwp', 'mwp'), 'plan.mwp');
  assert.equal(Fm.withExtension('plan.MWP', 'mwp'), 'plan.MWP', 'already right, whatever the case');
  assert.equal(Fm.withExtension('C:\\x\\plan.json', 'mwpt'), 'C:\\x\\plan.mwpt');
  for (const name of ['a.mwp', 'a.MWPT', 'a.json']) assert.ok(Fm.isPlanFileName(name), name);
  for (const name of ['a.xml', 'a.mwp.bak', 'mwp']) assert.ok(!Fm.isPlanFileName(name), name);
  assert.ok(Fm.isTemplateFileName('x.mwpt') && !Fm.isTemplateFileName('x.mwp'));
  assert.ok(Fm.isXmlFileName('Project.XML') && !Fm.isXmlFileName('x.mwp'));
  for (const name of ['a.csv', 'a.tsv', 'a.txt']) assert.ok(Fm.isCsvFileName(name), name);
  assert.ok(!Fm.isCsvFileName('a.xlsx'));
  for (const name of ['a.png', 'a.JPG', 'a.jpeg', 'a.svg', 'a.webp', 'a.avif']) assert.ok(Fm.isImageFileName(name), name);
  assert.ok(!Fm.isImageFileName('a.pdf'));
  assert.deepEqual([Fm.PLAN_EXTENSION, Fm.TEMPLATE_EXTENSION], ['mwp', 'mwpt']);
});

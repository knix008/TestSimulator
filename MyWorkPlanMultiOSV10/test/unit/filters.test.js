// Filters, highlighting, collapsed outlines, sorting and grouping of the task
// views, checked on the tutorial sample (a website relaunch, status date
// 2026-10-16: some work done, some late, a person booked twice).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Fl from '../../src/domain/filters.js';
import { outline } from '../../src/domain/project.js';
import { schedule } from '../../src/domain/schedule.js';
import { buildSample } from '../../src/domain/templates.js';
import { dayOf, toMin } from '../../src/domain/time.js';

function sample() {
  const project = buildSample('en', { today: '2026-10-16' });
  // The sample has no constrained or manual tasks: make one of each.
  project.tasks.find((task) => task.name === 'Buy stock images').constraint = { type: 'SNET', date: '2026-11-02T08:00' };
  project.tasks.find((task) => task.name === 'Design review').manual = true;
  const sched = schedule(project);
  return { project, sched, structure: outline(project) };
}

const paramsFor = (project, sched) => ({ resourceId: project.resources[0].id, from: sched.start + 5 * 1440, to: sched.start + 9 * 1440 });
const names = (rows) => rows.map((row) => row.task.name);
const leaves = (project, structure) => project.tasks.filter((task) => !structure.isSummary(task.id));

test('every filter keeps exactly the matching tasks and the summaries above them', () => {
  const { project, sched, structure } = sample();
  const params = paramsFor(project, sched);
  for (const filter of Fl.FILTERS) {
    const rows = Fl.rowsFor(project, sched, { filter, params });
    const shown = new Set(rows.map((row) => row.task.id));
    for (const task of project.tasks) {
      const own = Fl.matches(filter, task, sched.info(task.id), params, project);
      if (own) assert.ok(shown.has(task.id), `${filter}: ${task.name} matches and is shown`);
      if (shown.has(task.id) && !own) {
        assert.ok(structure.isSummary(task.id), `${filter}: ${task.name} is shown only as a summary`);
        const under = project.tasks.filter((other) => {
          for (let up = structure.parent.get(other.id); up; up = structure.parent.get(up)) if (up === task.id) return true;
          return false;
        });
        assert.ok(under.some((other) => Fl.matches(filter, other, sched.info(other.id), params, project)), `${filter}: ${task.name} has a match inside`);
      }
    }
    for (const row of rows) assert.equal(row.match, filter !== 'all' && Fl.matches(filter, row.task, row.info, params, project), `${filter}: match flag of ${row.task.name}`);
    // Row order is the plan order.
    const order = rows.map((row) => row.info.row);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${filter}: plan order`);
  }
});

test('what each filter finds in the sample', () => {
  const { project, sched } = sample();
  const params = paramsFor(project, sched);
  const found = (filter) => project.tasks.filter((task) => Fl.matches(filter, task, sched.info(task.id), params, project));
  assert.equal(found('all').length, project.tasks.length);
  assert.equal(found('active').length, project.tasks.length);
  assert.equal(found('completed').length + found('incomplete').length, project.tasks.length);
  assert.ok(found('completed').some((task) => task.name === 'Kickoff meeting'));
  assert.ok(found('completed').every((task) => sched.info(task.id).percentComplete === 100));
  assert.ok(found('critical').length > 0 && found('critical').every((task) => sched.info(task.id).critical));
  assert.deepEqual(found('milestones').map((task) => task.name), ['Scope signed off', 'UX approved', 'Design signed off', 'Go live', 'Project closed']);
  assert.equal(found('summary').length, 7);
  assert.ok(found('late').some((task) => task.name === 'Content plan'), 'the content plan is overdue');
  assert.ok(found('overallocated').some((task) => task.name === 'Integration testing'), 'QA is booked twice');
  assert.equal(found('unstarted').length + found('inProgress').length + found('completed').length, project.tasks.length);
  assert.ok(found('inProgress').every((task) => sched.info(task.id).percentComplete > 0 && sched.info(task.id).percentComplete < 100));
  assert.deepEqual(found('withDeadline').map((task) => task.name), ['Go live']);
  assert.deepEqual(found('constrained').map((task) => task.name), ['Buy stock images']);
  assert.deepEqual(found('manual').map((task) => task.name), ['Design review']);
  assert.ok(found('dateRange').length > 0);
  for (const task of found('dateRange')) {
    const info = sched.info(task.id);
    assert.ok(info.start <= params.to && info.finish >= params.from, `${task.name} overlaps the range`);
  }
  const assigned = new Set(project.assignments.filter((a) => a.resourceId === params.resourceId).map((a) => a.taskId));
  assert.deepEqual(new Set(found('usingResource').map((task) => task.id)), assigned);
  project.tasks[1].active = false;
  assert.equal(Fl.matches('active', project.tasks[1], sched.info(project.tasks[1].id)), false);
  assert.equal(Fl.matches('all', project.tasks[0], null), false, 'no schedule info: no match');
  assert.equal(Fl.matches('usingResource', project.tasks[1], sched.info(project.tasks[1].id), { resourceId: 'x' }), false, 'no project: no match');
  assert.equal(Fl.matches('dateRange', project.tasks[1], sched.info(project.tasks[1].id)), true, 'an open range matches everything');
});

test('highlight keeps every row and marks the matches', () => {
  const { project, sched } = sample();
  const rows = Fl.rowsFor(project, sched, { filter: 'milestones', highlight: true });
  assert.equal(rows.length, project.tasks.length);
  assert.deepEqual(rows.filter((row) => row.match).map((row) => row.task.name), ['Scope signed off', 'UX approved', 'Design signed off', 'Go live', 'Project closed']);
  const plain = Fl.rowsFor(project, sched, {});
  assert.equal(plain.length, project.tasks.length);
  assert.ok(plain.every((row) => row.match === false), 'nothing is marked without a filter');
});

test('collapsed summaries hide their rows, also when filtering', () => {
  const { project, sched } = sample();
  const design = project.tasks.find((task) => task.name === 'Visual design');
  const dev = project.tasks.find((task) => task.name === 'Development');
  design.collapsed = true;
  let rows = names(Fl.rowsFor(project, sched, {}));
  assert.ok(rows.includes('Visual design'));
  assert.ok(!rows.includes('Home page mockups'));
  assert.equal(rows.length, project.tasks.length - 6);
  rows = names(Fl.rowsFor(project, sched, { filter: 'incomplete' }));
  assert.ok(rows.includes('Visual design') && !rows.includes('Design review'));
  dev.collapsed = true;
  rows = names(Fl.rowsFor(project, sched, {}));
  assert.ok(rows.includes('Development') && !rows.includes('Front end') && !rows.includes('UI components'));
  assert.ok(rows.includes('Testing and launch'), 'the next phase shows again');
});

test('text search over name, notes, WBS, resources and custom text', () => {
  const { project, sched } = sample();
  const task = project.tasks.find((item) => item.name === 'Wireframes');
  const info = sched.info(task.id);
  assert.equal(Fl.matchesText('', task, info), true);
  assert.equal(Fl.matchesText('   ', task, info), true);
  assert.equal(Fl.matchesText('WIRE', task, info), true, 'case-insensitive');
  assert.equal(Fl.matchesText('zzz', task, info), false);
  assert.equal(Fl.matchesText(info.wbs, task, info), true);
  assert.equal(Fl.matchesText(info.resourceNames[0].slice(0, 4), task, info), true);
  task.text2 = 'Budget code 77';
  task.notes = 'Ask the client';
  assert.equal(Fl.matchesText('code 77', task, info), true);
  assert.equal(Fl.matchesText('client', task, info), true);
  assert.equal(Fl.matchesText('wire', task, null), true, 'works without schedule info');
  const rows = Fl.rowsFor(project, sched, { text: 'testing' });
  assert.deepEqual(names(rows), ['Testing and launch', 'Integration testing', 'User acceptance testing']);
  assert.deepEqual(rows.filter((row) => row.match).length, 3, 'the phase name matches too');
  const both = Fl.rowsFor(project, sched, { text: 'testing', filter: 'milestones' });
  assert.deepEqual(both, [], 'filter and text together');
});

test('sorting by every key, ascending and descending, lists the leaf tasks', () => {
  const { project, sched, structure } = sample();
  const leafCount = leaves(project, structure).length;
  const keys = {
    name: (row) => row.task.name.toLowerCase(),
    start: (row) => row.info.start,
    finish: (row) => row.info.finish,
    duration: (row) => row.info.duration,
    priority: (row) => -row.task.priority,
    cost: (row) => -row.info.cost,
    work: (row) => -row.info.work,
    slack: (row) => row.info.totalSlack,
  };
  for (const sort of Fl.SORTS.filter((key) => key !== 'id')) {
    const asc = Fl.rowsFor(project, sched, { sort });
    const desc = Fl.rowsFor(project, sched, { sort, descending: true });
    assert.equal(asc.length, leafCount, `${sort}: leaves only`);
    assert.ok(asc.every((row) => !row.info.summary), sort);
    for (let i = 1; i < asc.length; i++) {
      const [a, b] = [keys[sort](asc[i - 1]), keys[sort](asc[i])];
      assert.ok(a < b || (a === b && asc[i - 1].info.row < asc[i].info.row), `${sort}: ${asc[i - 1].task.name} before ${asc[i].task.name}`);
    }
    assert.deepEqual(desc.map((row) => row.task.id), asc.map((row) => row.task.id).reverse(), `${sort}: descending is the reverse`);
  }
  assert.equal(Fl.rowsFor(project, sched, { sort: 'id' }).length, project.tasks.length, 'id order is the outline');
  const items = Fl.rowsFor(project, sched, { sort: 'name' });
  Fl.sortRows(items, 'unknown');
  assert.deepEqual(items.map((row) => row.info.row), [...items.map((row) => row.info.row)].sort((a, b) => a - b), 'an unknown key sorts by row');
  const filtered = Fl.rowsFor(project, sched, { sort: 'start', filter: 'milestones' });
  assert.equal(filtered.length, 5, 'sorting a filter keeps only the matches');
  assert.equal(Fl.rowsFor(project, sched, { sort: 'start', filter: 'milestones', highlight: true }).length, leafCount);
});

test('grouping by every key: headings with counts that add up', () => {
  const { project, sched, structure } = sample();
  const leafCount = leaves(project, structure).length;
  for (const group of Fl.GROUPS.filter((key) => key !== 'none')) {
    const rows = Fl.rowsFor(project, sched, { group });
    const headings = rows.filter((row) => row.group);
    assert.ok(headings.length >= 1, group);
    assert.equal(headings.reduce((sum, row) => sum + row.group.count, 0), leafCount, `${group}: counts`);
    assert.equal(rows.length, leafCount + headings.length);
    assert.equal(new Set(headings.map((row) => row.group.key)).size, headings.length, `${group}: one heading per key`);
    // Each heading is followed by its rows.
    let i = 0;
    while (i < rows.length) {
      const heading = rows[i].group;
      assert.ok(heading, `${group}: a heading at ${i}`);
      assert.equal(heading.kind, group);
      const members = rows.slice(i + 1, i + 1 + heading.count);
      assert.ok(members.every((row) => !row.group), `${group}: ${heading.key} has ${heading.count} rows`);
      assert.equal(heading.start, Math.min(...members.map((row) => row.info.start)));
      assert.equal(heading.finish, Math.max(...members.map((row) => row.info.finish)));
      assert.equal(heading.cost, members.reduce((sum, row) => sum + row.info.cost, 0));
      i += 1 + heading.count;
    }
  }
  const byMode = Fl.rowsFor(project, sched, { group: 'mode' }).filter((row) => row.group);
  assert.deepEqual(byMode.map((row) => [row.group.key, row.group.count]), [['auto', leafCount - 1], ['manual', 1]]);
  const byMilestone = Fl.rowsFor(project, sched, { group: 'milestones' }).filter((row) => row.group);
  assert.deepEqual(byMilestone.map((row) => [row.group.key, row.group.count]), [['no', leafCount - 5], ['yes', 5]]);
  const byConstraint = Fl.rowsFor(project, sched, { group: 'constraint' }).filter((row) => row.group);
  assert.deepEqual(byConstraint.map((row) => row.group.key), ['ASAP', 'SNET']);
  project.tasks.find((task) => task.name === 'Go live').priority = 900;
  const byPriority = Fl.rowsFor(project, sched, { group: 'priority' }).filter((row) => row.group);
  const keys = byPriority.map((row) => Number(row.group.key));
  assert.equal(keys[0], 900, 'highest priority first');
  assert.deepEqual(keys, [...keys].sort((a, b) => b - a));
  assert.ok(keys.every((key) => key % 100 === 0), 'in steps of 100');
  const byDuration = Fl.rowsFor(project, sched, { group: 'duration' }).filter((row) => row.group);
  assert.ok(byDuration.some((row) => row.group.key === '0'), 'milestones have no duration');
  const byComplete = Fl.rowsFor(project, sched, { group: 'complete' }).filter((row) => row.group);
  assert.deepEqual(byComplete.map((row) => row.group.key).sort(), ['0', '100', 'some']);
  // Grouped and sorted together, and grouping with nothing to group.
  const sortedGroups = Fl.rowsFor(project, sched, { group: 'critical', sort: 'name' });
  const firstGroup = sortedGroups.slice(1, 1 + sortedGroups[0].group.count).map((row) => row.task.name);
  assert.deepEqual(firstGroup, [...firstGroup].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  assert.deepEqual(Fl.groupRows(project, [], 'status'), []);
  const all = Fl.groupRows(project, Fl.rowsFor(project, sched, { sort: 'name' }), 'none');
  assert.equal(all.length, leafCount + 1, "'none' makes one group");
  assert.equal(Fl.rowsFor(project, sched, { group: 'none' }).length, project.tasks.length);
});

test('resource groups list the assigned names, unassigned tasks together', () => {
  const { project, sched } = sample();
  const rows = Fl.rowsFor(project, sched, { group: 'resource' }).filter((row) => row.group);
  assert.ok(rows.some((row) => row.group.key === ''), 'milestones have nobody');
  const names = new Set(project.resources.map((r) => r.name));
  for (const row of rows.filter((item) => item.group.key)) {
    for (const name of row.group.key.split(', ')) assert.ok(names.has(name), name);
  }
});

test('spanOf covers the schedule, the rows and their baselines', () => {
  const { project, sched } = sample();
  const rows = Fl.rowsFor(project, sched, {});
  const span = Fl.spanOf(rows, sched);
  assert.equal(span.fromDay, dayOf(sched.start));
  assert.equal(span.toDay, dayOf(sched.finish));
  assert.deepEqual(Fl.spanOf([], sched), { fromDay: dayOf(sched.start), toDay: dayOf(sched.finish) });
  const late = toMin('2030-01-01T08:00');
  const fake = [{ info: { start: toMin('2020-01-01T08:00'), finish: sched.start, baseline: { finish: late } } }, { info: null }];
  assert.deepEqual(Fl.spanOf(fake, sched), { fromDay: dayOf(toMin('2020-01-01')), toDay: dayOf(late) });
});

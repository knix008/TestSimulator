import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import { exampleWorkspace } from '../../src/domain/examples.js';
import { parseCsvTable, parseXml } from '../../src/domain/requirements.js';
import {
  addTask, computeSchedule, deleteTask, importSchedule, indentTask, isWorkDay, moveTask, parsePreds, parseProjectXml, parseScheduleCsv,
  plannerItems, progressOf, saveBaseline, scheduleSummary, slip, sprintWindows, toProjectXml, toScheduleCsv, updateTask, wbsNumbers, WorkDays,
} from '../../src/domain/schedule.js';
import { applyConversion, planConversion } from '../../src/domain/schedule-apply.js';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { newProject, updateIssue } from '../../src/domain/store.js';
import { projectViews } from '../../src/domain/teams.js';
import { setLanguage } from '../../src/i18n.js';
import { renderModal } from '../../src/ui/chrome.js';
import { renderView } from '../../src/ui/pages.js';

const NOW = Date.parse('2026-11-19T09:00:00Z');

function plan(start = '2026-11-23') {
  const ws = sampleWorkspace(NOW);
  const project = newProject(ws, { name: 'Plan', key: 'PLN', type: 'business', leadId: 'u1', methods: ['schedule'] }, 'u1');
  project.schedule.start = start;
  const design = addTask(project, { name: 'Design', duration: 1 });
  const sketch = addTask(project, { afterId: design.id, child: true, name: 'Sketch', duration: 3 });
  const review = addTask(project, { afterId: sketch.id, name: 'Review', duration: 2 });
  updateTask(project, review.id, { preds: '2' });
  const build = addTask(project, { name: 'Build', duration: 5 });
  updateTask(project, build.id, { preds: '1FS+1d' });
  const launch = addTask(project, { name: 'Launch', milestone: true });
  updateTask(project, launch.id, { preds: '4' });
  computeSchedule(project, null);
  return { ws, project, design, sketch, review, build, launch };
}

describe('Schedule', () => {
  test('working days skip weekends and the calendar holidays', () => {
    assert.equal(isWorkDay(null, Date.UTC(2026, 10, 21)), false, 'Saturday');
    const calendar = { week: { mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'], thu: ['09:00', '18:00'], fri: ['09:00', '18:00'] }, holidays: ['2026-11-25'] };
    const days = new WorkDays(calendar, '2026-11-23');
    assert.equal(new Date(days.date(3)).toISOString().slice(0, 10), '2026-11-27', 'Wednesday the 25th is a holiday');
    assert.equal(days.between('2026-11-23', '2026-11-27'), 4);
  });

  test('works out dates from durations and FS / SS / FF links with lags, and the critical path', () => {
    const { project, design, sketch, review, build, launch } = plan();
    assert.deepEqual(wbsNumbers(project.schedule.tasks), ['1', '1.1', '1.2', '2', '3']);
    assert.deepEqual([sketch.start, sketch.finish], ['2026-11-23', '2026-11-25']);
    assert.deepEqual([review.start, review.finish], ['2026-11-26', '2026-11-27']);
    assert.deepEqual([design.start, design.finish, design.duration], ['2026-11-23', '2026-11-27', 5], 'a summary spans its children');
    assert.equal(build.start, '2026-12-01', 'FS+1d after Friday = Tuesday');
    assert.equal(launch.start, '2026-12-08');
    assert.ok(build.critical && review.critical);
    const extra = addTask(project, { name: 'Brochure', duration: 2 });
    updateTask(project, extra.id, { preds: '4SS' });
    computeSchedule(project, null);
    assert.equal(extra.start, build.start);
    assert.equal(extra.critical, false);
    assert.ok(extra.float > 0);
    updateTask(project, extra.id, { preds: '4FF' });
    computeSchedule(project, null);
    assert.equal(extra.finish, build.finish);
  });

  test('a fixed start holds a task back; loops are refused', () => {
    const { project, sketch, build } = plan();
    updateTask(project, sketch.id, { fixedStart: '2026-11-30' });
    computeSchedule(project, null);
    assert.equal(sketch.start, '2026-11-30');
    assert.throws(() => updateTask(project, sketch.id, { preds: '4' }), /dependency-cycle/);
    assert.throws(() => parsePreds(project.schedule.tasks, '99'), /pred-invalid/);
    assert.ok(build.start > '2026-12-01');
  });

  test('outline: indent, outdent, move with children, delete with children', () => {
    const { project, design, build } = plan();
    indentTask(project, build.id, 1);
    assert.equal(build.level, 2);
    indentTask(project, build.id, -1);
    assert.equal(build.level, 1);
    moveTask(project, build.id, -1);
    assert.deepEqual(project.schedule.tasks.map((task) => task.name), ['Build', 'Design', 'Sketch', 'Review', 'Launch']);
    deleteTask(project, design.id);
    assert.deepEqual(project.schedule.tasks.map((task) => task.name), ['Build', 'Launch']);
  });

  test('baseline and slip; progress rolls up by duration', () => {
    const { project, build, sketch } = plan();
    saveBaseline(project, '2026-11-19T00:00:00Z');
    updateTask(project, build.id, { duration: 7 });
    computeSchedule(project, null);
    assert.equal(slip(build), 2);
    updateTask(project, sketch.id, { percent: 100 });
    const progress = progressOf(project);
    assert.equal(progress.get(project.schedule.tasks[0].id), 60, 'summary: 3 of 5 days done');
    assert.equal(scheduleSummary(project, null, NOW).tasks, 3);
  });

  test('sprint windows follow the sprint length', () => {
    const { project } = plan();
    assert.equal(sprintWindows(project, { sprintDays: 7 }).length, 3);
    assert.equal(sprintWindows(project, { sprintDays: 14 }).length, 2);
    assert.equal(sprintWindows(project, { sprintDays: 7, count: 1 }).length, 1);
  });
});

describe('Switching a schedule to a board', () => {
  test('Scrum: epics, issues in sprints, a version, blocks links, and running it again only updates', () => {
    const { ws, project, sketch, build } = plan();
    const preview = planConversion(ws, project, 'scrum', { sprintDays: 7, now: Date.parse('2026-11-24') });
    assert.deepEqual([preview.counts.create, preview.counts.epics, preview.counts.versions, preview.counts.sprints], [3, 1, 1, 3]);
    const result = applyConversion(ws, project, 'scrum', { sprintDays: 7, now: Date.parse('2026-11-24'), sprintName: '스프린트' }, 'u1');
    assert.equal(result.created, 4);
    assert.equal(result.links, 3);
    assert.ok(project.methods.includes('scrum') && project.methods.includes('schedule'));
    assert.deepEqual(project.sprints.map((sprint) => `${sprint.name}:${sprint.state}`), ['스프린트 1:active', '스프린트 2:future', '스프린트 3:future']);
    const sketchIssue = project.issues.find((issue) => issue.id === sketch.issueId);
    assert.equal(sketchIssue.sprintId, project.sprints[0].id);
    assert.equal(sketchIssue.epicId, project.schedule.tasks[0].issueId);
    assert.equal(project.versions.length, 1);
    assert.equal(project.schedule.sprintDays, 7);
    // In progress: keeps its sprint and status when the plan moves.
    updateIssue(ws, project.id, build.issueId, { statusId: 'progress' }, 'u1');
    const before = project.issues.find((issue) => issue.id === build.issueId).sprintId;
    updateTask(project, build.id, { fixedStart: '2026-12-14' });
    const again = applyConversion(ws, project, 'scrum', { sprintDays: 7, now: Date.parse('2026-11-24') }, 'u1');
    assert.equal(again.created, 0);
    assert.equal(project.issues.length, 4);
    const buildIssue = project.issues.find((issue) => issue.id === build.issueId);
    assert.equal(buildIssue.sprintId, before);
    assert.equal(buildIssue.statusId, 'progress');
    assert.match(buildIssue.start, /^2026-12-14/);
  });

  test('Kanban: soon work in To Do, later work in the backlog; progress comes back from the issues', () => {
    const { ws, project, sketch, build } = plan();
    applyConversion(ws, project, 'kanban', { windowDays: 5, now: Date.parse('2026-11-23') }, 'u1');
    assert.ok(project.methods.includes('kanban'));
    assert.equal(project.issues.find((issue) => issue.id === sketch.issueId).statusId, 'todo');
    assert.equal(project.issues.find((issue) => issue.id === build.issueId).statusId, 'backlog');
    updateIssue(ws, project.id, sketch.issueId, { statusId: 'done' }, 'u1');
    assert.equal(progressOf(project).get(sketch.id), 100);
  });

  test('only a lead or an administrator may switch', () => {
    const { ws, project } = plan();
    ws.users.push({ id: 'dev', name: 'Dev', active: true });
    project.members.push({ userId: 'dev', role: 'developer' });
    assert.throws(() => applyConversion(ws, project, 'scrum', {}, 'dev'), /permission/);
  });
});

describe('Schedule files', () => {
  test('Microsoft Project XML keeps outline, durations, links with lags and resources', () => {
    const { ws, project } = plan();
    updateTask(project, project.schedule.tasks[3].id, { assigneeId: 'u2' });
    const xml = toProjectXml(project, ws);
    assert.match(xml, /<Project xmlns="http:\/\/schemas\.microsoft\.com\/project">/);
    const back = parseProjectXml(xml, parseXml);
    assert.deepEqual(back.tasks.map((task) => [task.name, task.level, task.milestone ? 0 : task.duration]), [['Design', 1, 5], ['Sketch', 2, 3], ['Review', 2, 2], ['Build', 1, 5], ['Launch', 1, 0]]);
    assert.deepEqual(back.tasks[3].preds.map((pred) => [pred.type, pred.lag]), [['FS', 1]]);
    assert.equal(back.tasks[3].resource, '박민준');
    const target = sampleWorkspace(NOW).projects[0];
    importSchedule(target, ws, back);
    computeSchedule(target, null);
    assert.equal(target.schedule.tasks[3].assigneeId, 'u2');
    assert.equal(target.schedule.tasks[3].start, '2026-12-01');
  });

  test('CSV round trip, and the sample files are current', () => {
    const { ws, project } = plan();
    const back = parseScheduleCsv(parseCsvTable(toScheduleCsv(project, ws)));
    assert.equal(back.tasks.length, 5);
    assert.equal(back.tasks[3].preds[0].lag, 1);
    for (const lang of ['ko', 'en']) {
      const site = exampleWorkspace('site', Date.parse('2026-11-19T09:00:00Z'), lang);
      const read = (name) => fs.readFileSync(new URL(`../../samples/${name}`, import.meta.url), 'utf8');
      assert.equal(read(`schedule.${lang}.xml`), toProjectXml(site.projects[0], site), `schedule.${lang}.xml — run npm run samples`);
      assert.equal(parseProjectXml(read(`schedule.${lang}.xml`), parseXml).tasks.length, 24);
      assert.equal(parseScheduleCsv(parseCsvTable(read(`schedule.${lang}.csv`))).tasks.length, 24);
    }
  });
});

describe('Schedule examples and screens', () => {
  test('schedule-only, switched-to-Scrum and switched-to-Kanban examples', () => {
    const site = exampleWorkspace('site', NOW, 'en').projects[0];
    assert.deepEqual(site.methods, ['schedule']);
    assert.ok(projectViews(site).has('schedule') && projectViews(site).has('planner') && !projectViews(site).has('board'));
    const car = exampleWorkspace('car', NOW, 'ko').projects[0];
    assert.ok(car.sprints.some((sprint) => sprint.state === 'active'));
    assert.ok(car.schedule.tasks.every((task) => task.milestone || task.issueId));
    const school = exampleWorkspace('school', NOW, 'en').projects[0];
    assert.ok(school.methods.includes('kanban'));
    assert.ok(school.issues.some((issue) => issue.statusId === 'backlog') && school.issues.some((issue) => issue.statusId === 'done'));
  });

  test('the planner lists tasks, issues, sprints and releases by day', () => {
    const ws = exampleWorkspace('car', NOW, 'en');
    const items = plannerItems(ws, {});
    assert.ok(['issue', 'sprint', 'version'].every((kind) => items.some((item) => item.kind === kind)));
    assert.ok(!items.some((item) => item.kind === 'task'), 'tasks that became issues show as issues');
    const mine = plannerItems(ws, { userId: 'u2', mine: true });
    assert.ok(mine.length && mine.every((item) => item.assigneeId === 'u2'));
    const site = exampleWorkspace('site', NOW, 'en');
    assert.ok(plannerItems(site, {}).some((item) => item.kind === 'milestone'));
  });

  const ctx = (id, view, extra = {}) => {
    setLanguage('en');
    const ws = exampleWorkspace(id, NOW, 'en');
    const project = ws.projects[0];
    ws.activeProjectId = project.id;
    return {
      ws, project, user: ws.users[0], desktop: false, version: '1.0.0', now: NOW,
      ui: { view, issueTab: 'details', selected: [], modal: null, screenFind: {}, ...extra },
      settings: { language: 'en', fontSize: 13, recent: [], customTheme: null, theme: 'light' },
    };
  };

  test('the schedule screen draws the table and the Gantt chart', () => {
    const html = renderView(ctx('site', 'schedule'));
    assert.match(html, /data-plan-field="preds"/);
    assert.match(html, /plan-bar critical/);
    assert.match(html, /plan-diamond-shape/);
    assert.match(html, /data-action="plan-switch" data-mode="kanban"/);
    assert.match(html, /data-action="plan-switch" data-mode="scrum"/);
    assert.match(html, /data-plan-setting="sprintDays"/);
  });

  test('the planner draws day, week, month and year', () => {
    for (const mode of ['day', 'week', 'month', 'year']) {
      const html = renderView(ctx('car', 'planner', { planner: { mode, date: '2026-11-19', scope: 'project' } }));
      assert.match(html, /planner-page/, mode);
    }
    assert.match(renderView(ctx('car', 'planner', { planner: { mode: 'month', date: '2026-11-19' } })), /pl-bar k-sprint/);
    assert.match(renderView(ctx('car', 'planner', { planner: { mode: 'year', date: '2026-11-19' } })), /pl-y-day h\d/);
    assert.match(renderView(ctx('site', 'planner', { planner: { mode: 'day', date: '2026-11-19' } })), /In progress/);
  });

  test('the switch dialog previews the sprints', () => {
    const c = ctx('site', 'schedule');
    c.ui.modal = { kind: 'plan-switch', mode: 'scrum', opts: { sprintDays: 10, now: NOW } };
    const html = renderModal(c);
    assert.match(html, /Switch to Scrum/);
    assert.match(html, /data-switch="sprintDays" value="10"/);
    assert.match(html, /Sprint 1/);
  });
});

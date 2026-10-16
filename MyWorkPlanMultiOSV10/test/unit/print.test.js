// Printing (SVG pages), the report data behind the Reports view, and the
// Gantt timescale.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CalendarEngine, defaultCalendars } from '../../src/domain/calendars.js';
import * as P from '../../src/domain/project.js';
import { schedule } from '../../src/domain/schedule.js';
import { buildSample } from '../../src/domain/templates.js';
import { dayOf, dayStart, toMin, weekdayOfDay } from '../../src/domain/time.js';
import * as Pr from '../../src/print/render.js';
import { reportData, series } from '../../src/views/reports.js';
import { Timescale, tiersFor } from '../../src/views/timescale.js';

const TODAY = '2026-10-16';
const t = (key, params) => (params ? `${key} ${params.n}/${params.total}` : key);
const sample = () => {
  const project = buildSample('en', { today: TODAY });
  return { project, sched: schedule(project) };
};
/** A plan of `count` one-day tasks in a chain. */
function chain(count) {
  const project = P.createProject({ title: 'Chain', start: '2026-10-19T08:00' });
  for (let i = 0; i < count; i++) P.insertTask(project, i, { name: `T${i + 1}`, duration: 480 });
  P.linkSequence(project, project.tasks.map((task) => task.id));
  return { project, sched: schedule(project) };
}
const render = (plan, options = {}) => Pr.renderPrintSvg(plan.project, plan.sched, { t, ...options });
const count = (text, needle) => text.split(needle).length - 1;

// ───────────────────────── print

test('selectRows: all, the view, rows by ID, dates and the selection', () => {
  const { project, sched } = sample();
  const all = Pr.selectRows(project, sched, Pr.defaultPrintOptions());
  assert.equal(all.length, project.tasks.length);
  const visible = project.tasks.slice(0, 4).map((task) => task.id);
  assert.deepEqual(Pr.selectRows(project, sched, { range: 'view' }, { visible }).map((task) => task.id), visible);
  assert.equal(Pr.selectRows(project, sched, { range: 'view' }).length, project.tasks.length, 'no view rows given: everything');
  const rows = Pr.selectRows(project, sched, { range: 'custom', fromRow: 3, toRow: 5 });
  assert.deepEqual(rows.map((task) => sched.info(task.id).row), [3, 4, 5]);
  assert.equal(Pr.selectRows(project, sched, { range: 'custom', fromRow: 30, toRow: 2 }).length, 1, 'a "to" before "from" prints just the "from" row');
  assert.equal(Pr.selectRows(project, sched, { range: 'custom', fromRow: 'x', toRow: '' }).length, project.tasks.length);
  const selected = [project.tasks[5].id, project.tasks[1].id];
  assert.deepEqual(Pr.selectRows(project, sched, { range: 'custom', selectedOnly: true }, { selected }).map((task) => task.id), [project.tasks[1].id, project.tasks[5].id], 'in plan order');
  const byDates = Pr.selectRows(project, sched, { range: 'custom', fromDate: '2026-10-26', toDate: '2026-10-30' });
  assert.ok(byDates.length > 0 && byDates.length < project.tasks.length);
  for (const task of byDates) {
    const info = sched.info(task.id);
    assert.ok(info.start <= toMin('2026-10-31') && info.finish >= toMin('2026-10-26'), task.name);
  }
  assert.equal(Pr.selectRows(project, sched, { range: 'custom', fromDate: '2099-01-01' }).length, 0, 'nothing after the plan');
});

test('renderPrintSvg: well-formed pages with header, page numbers and legend', () => {
  const plan = sample();
  const out = render(plan, { columns: ['name', 'duration', 'start', 'finish', 'resourceNames', 'indicators', 'nonsense'] });
  assert.equal(out.rows, plan.project.tasks.length);
  assert.equal(out.count, out.pages.length);
  assert.equal(out.svg, out.pages[0].svg);
  for (const [i, page] of out.pages.entries()) {
    assert.ok(page.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), `page ${i + 1}`);
    assert.ok(page.svg.endsWith('</svg>'));
    assert.equal(count(page.svg, '<g'), count(page.svg, '</g>'), 'groups are closed');
    assert.equal(count(page.svg, '<svg'), 1);
    assert.ok(!/undefined|NaN/.test(page.svg), `page ${i + 1} has no undefined or NaN`);
    assert.ok(page.svg.includes(`print.page ${i + 1}/${out.count}`), `page number ${i + 1}`);
    assert.ok(page.svg.includes('print.legendCritical'), 'a legend on every page');
    assert.ok(page.svg.includes('field.name') && page.svg.includes('field.resourceNames'));
    assert.ok(!page.svg.includes('field.nonsense') && !page.svg.includes('field.indicators'), 'unknown and icon columns are left out');
  }
  assert.ok(out.svg.includes(plan.project.title), 'the title in the header');
  const all = out.pages.map((page) => page.svg).join('');
  for (const task of plan.project.tasks) assert.ok(all.includes(task.name.slice(0, 12)), task.name);
});

test('renderPrintSvg: header and footer can be turned off, texts are escaped', () => {
  const plan = chain(3);
  plan.project.title = 'R&D <phase 1>';
  const out = render(plan, { header: true, footer: false, legend: false });
  assert.ok(out.svg.includes('R&amp;D &lt;phase 1&gt;'));
  assert.ok(!out.svg.includes('print.page'));
  assert.ok(!out.svg.includes('print.legendTask'));
  const custom = render(plan, { headerText: 'Mine', footerText: 'Bottom "line"' });
  assert.ok(custom.svg.includes('>Mine<'));
  assert.ok(custom.svg.includes('Bottom &quot;line&quot;'));
  const none = render(plan, { header: false });
  assert.ok(!none.svg.includes('R&amp;D'));
  assert.ok(Pr.defaultPrintOptions().footer && Pr.defaultPrintOptions().header);
});

test('page count grows with rows and shrinks with taller paper or a smaller scale', () => {
  const small = render(chain(10));
  const big = chain(120);
  assert.equal(small.count, 1);
  const landscape = render(big, { orientation: 'landscape' });
  const portrait = render(big, { orientation: 'portrait' });
  const a3 = render(big, { orientation: 'landscape', paper: 'A3' });
  const half = render(big, { orientation: 'landscape', scale: 50 });
  assert.ok(landscape.count > 1);
  assert.ok(landscape.width > landscape.height, 'landscape pages are wide');
  assert.ok(portrait.height > portrait.width);
  assert.ok(portrait.count < landscape.count, 'portrait pages are taller: more rows per page');
  assert.ok(a3.count < landscape.count, 'A3 holds more rows than A4');
  assert.ok(half.count < landscape.count, 'a smaller scale fits more rows');
  assert.ok(render(big, { margin: 'wide' }).count >= render(big, { margin: 'narrow' }).count);
  assert.equal(render(chain(240)).count >= landscape.count * 2 - 1, true, 'twice the rows, about twice the pages');
  // Every row is printed exactly once.
  const printed = landscape.pages.flatMap((page) => page.svg.match(/>T\d+</g) ?? []);
  assert.equal(printed.length, 120);
  assert.equal(new Set(printed).size, 120);
  for (const paper of Object.keys(Pr.PAPERS)) assert.ok(render(big, { paper }).count >= 1, paper);
});

test('single-page export is one page as tall as its rows', () => {
  const plan = chain(50);
  const out = render(plan, { single: true });
  assert.equal(out.count, 1);
  // margin 16, header 34, two timescale rows 40, rows 20 each, legend 22, footer 20, 8 spare.
  assert.equal(out.height, 16 * 2 + 34 + 40 + 50 * 20 + 22 + 20 + 8);
  assert.ok(out.width >= 900);
  const bare = render(plan, { single: true, header: false, footer: false, legend: false, content: 'table' });
  assert.equal(bare.height, 16 * 2 + 20 + 50 * 20 + 8, 'a table needs one header row');
  assert.ok(render(chain(100), { single: true }).height > out.height);
});

test("content 'table' has no bars, 'chart' only the name column", () => {
  const plan = sample();
  const table = render(plan, { content: 'table', columns: ['name', 'duration'] });
  assert.ok(!table.svg.includes('rx="2"'), 'no task bars');
  assert.ok(!table.svg.includes('clipPath'), 'no timescale');
  assert.ok(!table.svg.includes('print.legendTask'), 'no legend');
  assert.ok(table.svg.includes('field.duration'));
  const chart = render(plan, { content: 'chart', columns: ['name', 'duration'] });
  assert.ok(chart.svg.includes('rx="2"'), 'task bars');
  assert.ok(!chart.svg.includes('field.duration'), 'only the name column');
  const both = render(plan, { columns: ['name'] });
  assert.ok(both.svg.includes('rx="2"') && both.svg.includes('clipPath'));
  assert.ok(both.svg.includes('#d93a3f'), 'critical tasks in red');
  assert.ok(!render(plan, { showCritical: false, legend: false }).svg.replace(/stroke="#d93a3f"/g, '').includes('fill="#d93a3f"'), 'no red bars when critical is off');
});

test('an empty selection still renders one page', () => {
  const plan = chain(3);
  const out = render(plan, { range: 'custom', selectedOnly: true });
  assert.equal(out.rows, 0);
  assert.equal(out.count, 1);
  assert.ok(out.svg.startsWith('<svg'));
});

// ───────────────────────── reports

test('reportData lists the tasks of each report', () => {
  const { project, sched } = sample();
  const leaves = project.tasks.filter((task) => !sched.info(task.id).summary);
  assert.equal(reportData('overview', project, sched).length, leaves.length, 'other reports: every leaf task');
  const critical = reportData('critical', project, sched);
  assert.ok(critical.length > 0 && critical.every((r) => r.info.critical && !r.info.summary));
  const late = reportData('late', project, sched);
  assert.ok(late.some((r) => r.task.name === 'Content plan'));
  assert.ok(late.every((r) => r.info.late));
  assert.deepEqual(reportData('milestones', project, sched).map((r) => r.task.name), ['Scope signed off', 'UX approved', 'Design signed off', 'Go live', 'Project closed']);
  const upcoming = reportData('upcoming', project, sched);
  const status = sched.statusDate;
  assert.ok(upcoming.length > 0);
  for (const r of upcoming) {
    assert.ok(r.info.start >= status && r.info.start <= status + 14 * 1440, r.task.name);
    assert.ok(r.info.percentComplete < 100);
  }
  assert.deepEqual(upcoming.map((r) => r.info.start), [...upcoming.map((r) => r.info.start)].sort((a, b) => a - b), 'by start');
  project.tasks.find((task) => task.name === 'Go live').active = false;
  const s2 = schedule(project);
  assert.ok(!reportData('milestones', project, s2).some((r) => r.task.name === 'Go live'), 'inactive tasks are left out');
});

test('series: cumulative planned, scheduled and actual values', () => {
  const { project, sched } = sample();
  for (const kind of ['cost', 'work']) {
    const points = series(project, sched, kind);
    const span = dayOf(sched.finish) - dayOf(sched.start) + 1;
    assert.equal(points.length, Math.min(60, span), kind);
    assert.equal(points[0].day, dayOf(sched.start));
    assert.equal(points.at(-1).day, dayOf(sched.finish));
    const total = project.tasks.filter((task) => !sched.info(task.id).summary).reduce((sum, task) => sum + sched.info(task.id)[kind], 0);
    for (let i = 1; i < points.length; i++) {
      assert.ok(points[i].day > points[i - 1].day, `${kind}: days ascend`);
      assert.ok(points[i].scheduled >= points[i - 1].scheduled - 1e-6, `${kind}: scheduled never drops`);
      assert.ok(points[i].planned >= points[i - 1].planned - 1e-6, `${kind}: planned never drops`);
      if (points[i].actual != null) assert.ok(points[i].actual >= points[i - 1].actual - 1e-6, `${kind}: actual never drops`);
    }
    assert.ok(Math.abs(points.at(-1).scheduled - total) < 1e-6, `${kind}: everything is scheduled by the finish`);
    assert.ok(points.at(-1).planned > 0, `${kind}: the sample has a baseline`);
    const past = points.filter((p) => p.actual != null);
    const future = points.filter((p) => p.actual == null);
    assert.ok(past.length > 0 && future.length > 0, `${kind}: the status date is inside the plan`);
    assert.ok(past.every((p) => dayStart(p.day) <= sched.statusDate) && future.every((p) => dayStart(p.day) > sched.statusDate));
    for (const p of past) assert.ok(Math.abs(p.remaining - (total - p.actual)) < 1e-6);
    assert.ok(past.at(-1).actual > 0 && past.at(-1).actual < total);
  }
});

test('series of a short plan has one point per day, at least two', () => {
  const plan = chain(1);
  const points = series(plan.project, plan.sched, 'work');
  assert.equal(points.length, 2);
  assert.deepEqual(points.map((p) => p.planned), [0, 0], 'no baseline: nothing planned');
  const long = chain(80);
  assert.equal(series(long.project, long.sched, 'cost').length, 60, 'at most 60 points');
});

// ───────────────────────── timescale

test('tiersFor picks the tier units by zoom', () => {
  const cases = [[240, ['day', 'hour']], [120, ['day', 'hour']], [119, ['week', 'day']], [16, ['week', 'day']], [15.9, ['month', 'week']], [6, ['month', 'week']], [5.9, ['quarter', 'month']], [2.5, ['quarter', 'month']], [2.4, ['year', 'quarter']], [1, ['year', 'quarter']]];
  for (const [px, tiers] of cases) assert.deepEqual(tiersFor(px), tiers, String(px));
  const ts = new Timescale({ fromDay: dayOf(toMin('2026-10-19')), toDay: dayOf(toMin('2026-12-31')), pxPerDay: 30 });
  assert.deepEqual([ts.topUnit, ts.bottomUnit], ['week', 'day']);
});

test('x and minutesAt are inverses; the origin is a week start before the plan', () => {
  const from = dayOf(toMin('2026-10-21'));
  for (const [pxPerDay, weekStart] of [[30, 1], [2, 0], [120, 1], [0.8, 1]]) {
    const ts = new Timescale({ fromDay: from, toDay: from + 100, pxPerDay, weekStart });
    assert.equal(weekdayOfDay(ts.originDay), weekStart, `starts on a week start (${pxPerDay})`);
    assert.ok(ts.originDay < from - 6, 'a margin before the plan');
    assert.ok(ts.endDay > from + 100, 'and after it');
    assert.equal(ts.width, Math.ceil((ts.endDay - ts.originDay) * pxPerDay));
    assert.equal(ts.x(dayStart(ts.originDay)), 0);
    for (const m of [toMin('2026-10-21T08:00'), toMin('2026-11-03T13:37'), toMin('2027-01-01T00:00')]) {
      assert.equal(ts.minutesAt(ts.x(m)), m, `${pxPerDay}: ${m}`);
      assert.equal(ts.dayAt(ts.x(m)), dayOf(m));
    }
    assert.ok(ts.x(toMin('2026-10-22')) > ts.x(toMin('2026-10-21')), 'later is further right');
  }
  assert.equal(new Timescale({ fromDay: from, toDay: from, pxPerDay: 16, language: 'fr' }).language, 'ko');
});

test('cells of every unit cover the visible range without gaps or overlaps', () => {
  const from = dayOf(toMin('2026-10-19'));
  for (const [unit, px] of [['hour', 150], ['day', 30], ['week', 10], ['month', 4], ['quarter', 2], ['year', 1]]) {
    const ts = new Timescale({ fromDay: from, toDay: from + 400, pxPerDay: px });
    const x0 = ts.x(toMin('2026-11-10'));
    const x1 = ts.x(toMin('2027-08-01'));
    const cells = ts.cells(unit, x0, x1);
    assert.ok(cells.length > 0, unit);
    assert.ok(cells[0].x <= x0 && cells.at(-1).x + cells.at(-1).width >= x1, `${unit}: covers ${x0}–${x1}`);
    for (let i = 1; i < cells.length; i++) {
      assert.ok(Math.abs(cells[i].x - (cells[i - 1].x + cells[i - 1].width)) < 1e-6, `${unit}: cell ${i} follows cell ${i - 1}`);
      assert.ok(cells[i].width > 0);
    }
    assert.ok(cells.every((cell) => typeof cell.label === 'string' && cell.label && cell.title), `${unit}: labels`);
  }
});

test('cell labels in Korean and English', () => {
  const from = dayOf(toMin('2026-10-19'));
  const ko = new Timescale({ fromDay: from, toDay: from + 30, pxPerDay: 30, language: 'ko' });
  const en = new Timescale({ fromDay: from, toDay: from + 30, pxPerDay: 30, language: 'en' });
  const x = ko.x(toMin('2026-10-19'));
  const dayKo = ko.cells('day', x, x + 1).find((cell) => cell.x === x);
  const dayEn = en.cells('day', x, x + 1).find((cell) => cell.x === x);
  assert.equal(dayKo.label, '월 19');
  assert.equal(dayEn.label, 'M 19');
  assert.equal(dayEn.weekend, false);
  assert.equal(en.cells('day', en.x(toMin('2026-10-24')), en.x(toMin('2026-10-24')) + 1).find((cell) => cell.x === en.x(toMin('2026-10-24'))).weekend, true);
  assert.equal(ko.cells('week', x, x + 1).find((cell) => cell.x === x).label, '2026년 10월 19일');
  assert.equal(en.cells('week', x, x + 1).find((cell) => cell.x === x).label, 'Oct 19, 2026');
  const months = en.cells('month', x, x + 1);
  assert.ok(months.some((cell) => cell.label === 'Oct 2026'));
  assert.ok(en.cells('quarter', x, x + 1).some((cell) => cell.label === 'Q4 2026'));
  assert.ok(ko.cells('quarter', x, x + 1).some((cell) => cell.label === '2026년 4분기'));
  assert.ok(en.cells('year', x, x + 1).some((cell) => cell.label === '2026'));
  const hours = new Timescale({ fromDay: from, toDay: from + 3, pxPerDay: 200 });
  const hx = hours.x(toMin('2026-10-19T12:00'));
  assert.equal(hours.cells('hour', hx, hx + 1).find((cell) => Math.abs(cell.x - hx) < 1e-6).label, '12');
  assert.match(hours.cells('day', hx, hx + 1)[0].label, /^\d+\/\d+ \(.\)$/, 'wide days show the date and weekday');
  assert.deepEqual(ko.cells('nonsense', x, x + 100), []);
});

test('nonWorking marks weekends and holidays, not when zoomed far out', () => {
  const cals = defaultCalendars();
  cals[0].exceptions = [{ id: 'h', start: '2026-10-21', finish: '2026-10-21', working: false }];
  const calendar = new CalendarEngine(cals, 'standard');
  const from = dayOf(toMin('2026-10-19'));
  const ts = new Timescale({ fromDay: from, toDay: from + 30, pxPerDay: 20 });
  const x0 = ts.x(toMin('2026-10-19'));
  const x1 = ts.x(toMin('2026-10-25T12:00'));
  const marks = ts.nonWorking(calendar, x0, x1).map((mark) => ts.dayAt(mark.x));
  assert.ok(marks.includes(dayOf(toMin('2026-10-21'))), 'the holiday');
  assert.ok(marks.includes(dayOf(toMin('2026-10-24'))) && marks.includes(dayOf(toMin('2026-10-25'))), 'the weekend');
  assert.ok(!marks.includes(dayOf(toMin('2026-10-22'))), 'a working day');
  assert.ok(ts.nonWorking(calendar, x0, x1).every((mark) => mark.width === 20));
  const far = new Timescale({ fromDay: from, toDay: from + 30, pxPerDay: 4 });
  assert.deepEqual(far.nonWorking(calendar, 0, far.width), []);
});

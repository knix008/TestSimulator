// Exchange formats: MS Project XML (MSPDI) and CSV round trips, files written
// by MS Project itself, and text pasted from / for spreadsheets and outlines.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectDelimiter, exportCsv, exportMspdi, importCsv, importMspdi, isoDuration, parseCsv,
  parseIsoDuration, parseXml, tasksFromText, tasksToTsv,
} from '../../src/domain/interop.js';
import * as P from '../../src/domain/project.js';
import { schedule } from '../../src/domain/schedule.js';
import { setBaseline } from '../../src/domain/tracking.js';
import { fromMin } from '../../src/domain/time.js';

const DAY = 480;
const make = (title = 'Test') => P.createProject({ title, start: '2026-10-19T08:00', language: 'en' }); // Monday
const add = (project, name, days, data = {}) => P.insertTask(project, project.tasks.length, { name, duration: days * DAY, ...data });
const dates = (project) => {
  const s = schedule(project);
  return project.tasks.map((task) => `${task.name}: ${fromMin(s.info(task.id).start)} → ${fromMin(s.info(task.id).finish)}`);
};
const byName = (project, name) => project.tasks.find((task) => task.name === name);
const throwsCode = (fn, code) => assert.throws(fn, (error) => error instanceof Error && error.code === code);

/** A project using most of what MSPDI can carry. */
function richProject() {
  const p = make('R&D <Plan> "2026"');
  Object.assign(p, { author: 'Kim & Lee', manager: 'Park', company: 'ACME <Korea>', subject: 'Subject', category: 'Cat', statusDate: '2026-10-30T17:00' });
  p.options.currency = '$';
  // Calendars: a copied one with a short Friday and two exceptions, a derived one, a project holiday.
  const team = P.addCalendar(p, 'Team', 'standard');
  P.setWorkWeek(p, team.id, 5, [[480, 720]]);
  P.addException(p, team.id, { name: 'Off & away', start: '2026-10-28', finish: '2026-10-29' });
  P.addException(p, team.id, { name: 'Saturday work', start: '2026-10-31', working: true, periods: [[540, 780]] });
  p.calendars.push({ id: 'derived', name: 'Derived', base: 'standard', week: { 3: [[600, 960]] }, exceptions: [{ id: 'ex-1', name: 'Derived off', start: '2026-11-05', finish: '2026-11-05', working: false, periods: [] }] });
  P.addException(p, 'standard', { name: 'Holiday', start: '2026-11-02' });

  const phaseA = add(p, 'Phase A', 1, { outlineLevel: 1 });
  const a1 = add(p, 'A1 <design> & "spec"', 5, { outlineLevel: 2, priority: 700, deadline: '2026-10-30T17:00', notes: 'Line 1 & <b>\r\nLine "2" \'quoted\'', hyperlink: 'https://example.com/?a=1&b=2' });
  const a2 = add(p, 'A2', 3, { outlineLevel: 2, type: 'fixedWork' });
  const a3 = add(p, 'A3 hours', 0, { outlineLevel: 2, duration: 6 * 60, durationUnit: 'h', estimated: true });
  const phaseB = add(p, 'Phase B', 1, { outlineLevel: 1 });
  const b1 = add(p, 'B1 team', 4, { outlineLevel: 2, calendarId: team.id });
  const b2 = add(p, 'B2 elapsed', 0, { outlineLevel: 2, duration: 2 * 1440, durationUnit: 'ed' });
  const b3 = add(p, 'B3 manual', 2, { outlineLevel: 2, manual: true, start: '2026-11-03T08:00', finish: '2026-11-06T12:00' });
  const b4 = add(p, 'B4 snet', 2, { outlineLevel: 2, priority: 300, constraint: { type: 'SNET', date: '2026-11-10T08:00' } });
  const b5 = add(p, 'B5 mfo', 1, { outlineLevel: 3, constraint: { type: 'MFO', date: '2026-11-20T17:00' } });
  const b6 = add(p, 'B6 fnlt', 2, { outlineLevel: 3, constraint: { type: 'FNLT', date: '2026-12-31T17:00' } });
  const b7 = add(p, 'B7 alap', 1, { outlineLevel: 2, constraint: { type: 'ALAP', date: null } });
  const b8 = add(p, 'B8 derived', 3, { outlineLevel: 2, calendarId: 'derived' });
  const off = add(p, 'Inactive', 2, { outlineLevel: 1, active: false });
  const done = add(p, 'Done', 0, { outlineLevel: 1, milestone: true });
  // Links: all four types, leads, a percentage and an elapsed lag; one on a summary.
  P.linkTasks(p, a1.id, a2.id, 'FS', -1 * DAY, 'd');
  P.linkTasks(p, a1.id, a3.id, 'SS', 2 * DAY, 'd');
  P.linkTasks(p, a2.id, b1.id, 'FF', 50, '%');
  P.linkTasks(p, a3.id, b2.id, 'SF', 3 * DAY, 'd');
  P.linkTasks(p, b2.id, b7.id, 'FS', 1440, 'ed');
  P.linkTasks(p, phaseA.id, b8.id, 'FS', 2 * 60, 'h');
  P.linkTasks(p, b1.id, done.id, 'FS', 0, 'd');
  P.linkTasks(p, b8.id, done.id, 'SS', -2 * DAY, 'd');
  P.linkTasks(p, b4.id, b6.id, 'FS', 0, 'w');
  // Progress, custom fields, a leveling delay.
  Object.assign(a1, { percentComplete: 40, actualStart: '2026-10-19T08:00', text1: 'Text & one', number1: 42, flag1: true });
  b6.levelingDelay = 1440;
  // Resources and assignments.
  const kim = P.addResource(p, { name: 'Kim & Co', group: 'Dev <1>', email: 'kim@example.com', stdRate: 50, ovtRate: 75, costPerUse: 10, accrue: 'start' });
  const lee = P.addResource(p, { name: 'Lee', maxUnits: 0.5, calendarId: team.id, notes: 'Part time' });
  const cement = P.addResource(p, { name: 'Cement', type: 'material', materialLabel: 'ton', stdRate: 100 });
  const travel = P.addResource(p, { name: 'Travel', type: 'cost', accrue: 'end' });
  P.assignResource(p, a1.id, kim.id, 1);
  P.assignResource(p, a2.id, lee.id, 0.5, { work: 10 * 60 });
  P.assignResource(p, a1.id, cement.id, 3);
  P.assignResource(p, b1.id, travel.id, 1, { cost: 250 });
  // Baselines 0 and 3.
  setBaseline(p, schedule(p), 0);
  setBaseline(p, schedule(p), 3);
  return { p, off, phaseB, b5 };
}

// ───────────────────────── XML reader

test('parseXml: declaration, comments, CDATA, entities, attributes, namespaces', () => {
  const root = parseXml(`﻿<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE p [ <!ENTITY x "y"> ]>
<!-- a comment -->
<ns:Root xmlns:ns="urn:x" a='1 &amp; 2' b="&lt;&#65;&#x42;&gt;">
  <ns:Item>Fish &amp; chips &quot;&apos;&#169;</ns:Item>
  <Empty/>
  <Data><![CDATA[<not> & a tag]]></Data>
</ns:Root>`);
  assert.equal(root.name, 'Root');
  assert.deepEqual(root.attrs, { 'ns': 'urn:x', a: '1 & 2', b: '<AB>' });
  assert.equal(root.children[0].name, 'Item');
  assert.equal(root.children[0].text, 'Fish & chips "\'©');
  assert.equal(root.children[1].name, 'Empty');
  assert.equal(root.children[2].text, '<not> & a tag');
  assert.throws(() => parseXml('<a><b></a>'));
  assert.throws(() => parseXml('<a>'));
  assert.throws(() => parseXml('hello'));
  assert.throws(() => parseXml('<a/><b/>'));
});

test('ISO 8601 durations both ways', () => {
  assert.equal(isoDuration(16 * 60), 'PT16H0M0S');
  assert.equal(isoDuration(90), 'PT1H30M0S');
  assert.equal(parseIsoDuration('PT16H0M0S'), 960);
  assert.equal(parseIsoDuration('PT7H30M'), 450);
  assert.equal(parseIsoDuration('P1DT2H'), 600, 'a day is a working day (8 h)');
  assert.equal(parseIsoDuration('P1DT2H', undefined, true), 1560, 'elapsed: 24 h');
  assert.equal(parseIsoDuration('P2W'), 2 * 2400);
  assert.equal(parseIsoDuration('PT0.5H'), 30);
  assert.equal(parseIsoDuration('5d'), null);
  assert.equal(parseIsoDuration('P'), null);
});

// ───────────────────────── MSPDI

test('MSPDI export is well-formed MS Project XML with the expected structure', () => {
  const { p } = richProject();
  const xml = exportMspdi(p, schedule(p));
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8" standalone="yes"\?>\n<Project xmlns="http:\/\/schemas.microsoft.com\/project">/);
  const root = parseXml(xml);
  const text = (node, name) => node.children.find((c) => c.name === name)?.text;
  assert.equal(text(root, 'Title'), 'R&D <Plan> "2026"');
  assert.equal(text(root, 'MinutesPerDay'), '480');
  assert.equal(text(root, 'MinutesPerWeek'), '2400');
  assert.equal(text(root, 'StartDate'), '2026-10-19T08:00:00');
  assert.equal(text(root, 'ScheduleFromStart'), '1');
  const tasks = root.children.find((c) => c.name === 'Tasks').children;
  assert.equal(text(tasks[0], 'UID'), '0', 'project summary task first');
  assert.equal(text(tasks[0], 'OutlineLevel'), '0');
  assert.equal(tasks.length, p.tasks.length + 1);
  const a1 = tasks[2];
  assert.equal(text(a1, 'Duration'), 'PT40H0M0S');
  assert.equal(text(a1, 'DurationFormat'), '7');
  assert.equal(text(a1, 'WBS'), '1.1');
  assert.equal(text(a1, 'Start'), '2026-10-19T08:00:00');
  const link = tasks[3].children.find((c) => c.name === 'PredecessorLink');
  assert.equal(text(link, 'Type'), '1');
  assert.equal(text(link, 'LinkLag'), '-4800', '-1 day in tenths of minutes');
  const pct = tasks[6].children.find((c) => c.name === 'PredecessorLink');
  assert.deepEqual([text(pct, 'Type'), text(pct, 'LinkLag'), text(pct, 'LagFormat')], ['0', '500', '19']);
  // Escaping in the raw text.
  assert.ok(xml.includes('<Name>A1 &lt;design&gt; &amp; &quot;spec&quot;</Name>'));
  assert.ok(xml.includes('Line 1 &amp; &lt;b&gt;&#13;\nLine &quot;2&quot; &apos;quoted&apos;'));
  // Every element in a task is closed and numeric UIDs are unique.
  const uids = tasks.map((t) => text(t, 'UID'));
  assert.equal(new Set(uids).size, uids.length);
});

test('MSPDI round trip keeps tasks, links, resources, assignments, calendars and baselines', () => {
  const { p } = richProject();
  const q = importMspdi(exportMspdi(p, schedule(p)), { language: 'en' });
  assert.equal(q.title, p.title);
  for (const key of ['author', 'manager', 'company', 'subject', 'category', 'statusDate', 'start']) assert.equal(q[key], p[key], key);
  assert.equal(q.options.currency, '$');
  assert.equal(q.options.hoursPerDay, 8);
  assert.equal(q.tasks.length, p.tasks.length);
  const rowOf = (project, id) => P.rowOf(project, id);
  p.tasks.forEach((task, index) => {
    const got = q.tasks[index];
    const label = task.name;
    for (const key of ['name', 'outlineLevel', 'durationUnit', 'milestone', 'manual', 'priority', 'deadline', 'notes', 'active', 'type', 'hyperlink', 'actualStart', 'levelingDelay', 'text1', 'number1', 'flag1']) {
      assert.deepEqual(got[key], task[key], `${label}: ${key}`);
    }
    // Summaries carry rolled-up progress, like MS Project writes them.
    if (!P.outline(p).isSummary(task.id)) assert.equal(got.percentComplete, task.percentComplete, `${label}: percentComplete`);
    if (!P.outline(p).isSummary(task.id) && !task.manual) assert.equal(got.duration, task.duration, `${label}: duration`);
    assert.deepEqual(got.constraint, task.constraint, `${label}: constraint`);
    assert.equal(got.estimated, task.estimated, `${label}: estimated`);
    const links = (project, t) => t.predecessors.map((l) => ({ row: rowOf(project, l.taskId), type: l.type, lag: l.lag, lagUnit: l.lagUnit }));
    assert.deepEqual(links(q, got), links(p, task), `${label}: links`);
    assert.deepEqual(got.baselines, task.baselines, `${label}: baselines`);
    const calName = (project, id) => project.calendars.find((c) => c.id === id)?.name ?? null;
    assert.equal(calName(q, got.calendarId), calName(p, task.calendarId), `${label}: calendar`);
  });
  const manual = byName(q, 'B3 manual');
  assert.equal(manual.start, '2026-11-03T08:00');
  assert.equal(manual.finish, '2026-11-06T12:00');
  assert.ok(q.baselineDates[0] && q.baselineDates[3]);

  // Resources and assignments.
  assert.deepEqual(q.resources.map((r) => [r.name, r.type, r.maxUnits, r.stdRate, r.ovtRate, r.costPerUse, r.accrue, r.group, r.email, r.materialLabel, r.notes]),
    p.resources.map((r) => [r.name, r.type, r.maxUnits, r.stdRate, r.ovtRate, r.costPerUse, r.accrue, r.group, r.email, r.materialLabel, r.notes]));
  assert.equal(q.calendars.find((c) => c.id === q.resources[1].calendarId)?.name, 'Team');
  assert.equal(q.resources[0].calendarId, null, 'the project calendar stays implicit');
  const assignments = (project) => project.assignments.map((a) => [P.findTask(project, a.taskId).name, P.findResource(project, a.resourceId).name, a.units, a.work ?? null, a.cost ?? null]);
  assert.deepEqual(assignments(q), assignments(p));

  // Calendars: weeks, bases and exceptions.
  assert.equal(q.calendarId, 'standard');
  const calendars = (project) => project.calendars.map((c) => ({
    name: c.name,
    base: project.calendars.find((b) => b.id === c.base)?.name ?? null,
    week: c.week,
    exceptions: c.exceptions.map(({ name, start, finish, working, periods }) => ({ name, start, finish, working, periods })),
  }));
  assert.deepEqual(calendars(q), calendars(p));
  assert.deepEqual(q.calendars.map((c) => c.id).slice(0, 3), ['standard', '24hours', 'night']);
});

test('MSPDI round trip: the imported project schedules to the same dates', () => {
  const { p } = richProject();
  const s = schedule(p);
  const q = importMspdi(exportMspdi(p, s));
  assert.deepEqual(dates(q), dates(p));
  const t = schedule(q);
  assert.equal(t.finish, s.finish);
  assert.equal(t.cost, s.cost);
  assert.equal(t.work, s.work);
  // And once more: export of the import is the same file (apart from creation stamps).
  const strip = (xml) => xml.replace(/<CreationDate>.*<\/CreationDate>/, '');
  assert.equal(strip(exportMspdi(q, t)), strip(exportMspdi(p, s)));
});

test('MSPDI: a project scheduled from its finish date', () => {
  const p = make();
  p.scheduleFrom = 'finish';
  p.finish = '2026-11-27T17:00';
  const a = add(p, 'A', 3);
  const b = add(p, 'B', 2);
  P.linkTasks(p, a.id, b.id);
  const q = importMspdi(exportMspdi(p));
  assert.equal(q.scheduleFrom, 'finish');
  assert.equal(q.finish, '2026-11-27T17:00');
  assert.deepEqual(dates(q), dates(p));
  assert.equal(dates(q)[1], 'B: 2026-11-26T08:00 → 2026-11-27T17:00');
});

const MS_PROJECT_FILE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
	<SaveVersion>14</SaveVersion>
	<Name>Office Move.xml</Name>
	<Author>Jane</Author>
	<CreationDate>2026-09-01T09:12:44</CreationDate>
	<ScheduleFromStart>1</ScheduleFromStart>
	<StartDate>2026-10-19T08:00:00</StartDate>
	<FinishDate>2026-10-26T17:00:00</FinishDate>
	<CurrencySymbol>€</CurrencySymbol>
	<CalendarUID>1</CalendarUID>
	<DefaultStartTime>08:00:00</DefaultStartTime>
	<MinutesPerDay>480</MinutesPerDay>
	<MinutesPerWeek>2400</MinutesPerWeek>
	<DaysPerMonth>20</DaysPerMonth>
	<Calendars>
		<Calendar>
			<UID>1</UID>
			<Name>Standard</Name>
			<IsBaseCalendar>1</IsBaseCalendar>
			<BaseCalendarUID>-1</BaseCalendarUID>
			<WeekDays>
				<WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
				<WeekDay><DayType>2</DayType><DayWorking>1</DayWorking>
					<WorkingTimes>
						<WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>
						<WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>
					</WorkingTimes>
				</WeekDay>
				<WeekDay><DayType>3</DayType><DayWorking>1</DayWorking>
					<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>
				</WeekDay>
				<WeekDay><DayType>4</DayType><DayWorking>1</DayWorking>
					<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>
				</WeekDay>
				<WeekDay><DayType>5</DayType><DayWorking>1</DayWorking>
					<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>
				</WeekDay>
				<WeekDay><DayType>6</DayType><DayWorking>1</DayWorking>
					<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>
				</WeekDay>
				<WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
				<WeekDay>
					<DayType>0</DayType>
					<DayWorking>0</DayWorking>
					<TimePeriod><FromDate>2026-10-22T00:00:00</FromDate><ToDate>2026-10-22T23:59:00</ToDate></TimePeriod>
				</WeekDay>
			</WeekDays>
		</Calendar>
		<Calendar>
			<UID>2</UID>
			<Name>Jane</Name>
			<IsBaseCalendar>0</IsBaseCalendar>
			<BaseCalendarUID>1</BaseCalendarUID>
		</Calendar>
		<Calendar>
			<UID>3</UID>
			<Name>Night</Name>
			<IsBaseCalendar>1</IsBaseCalendar>
			<WeekDays>
				<WeekDay><DayType>2</DayType><DayWorking>1</DayWorking>
					<WorkingTimes><WorkingTime><FromTime>22:00:00</FromTime><ToTime>00:00:00</ToTime></WorkingTime></WorkingTimes>
				</WeekDay>
			</WeekDays>
			<Exceptions>
				<Exception>
					<EnteredByOccurrences>0</EnteredByOccurrences>
					<TimePeriod><FromDate>2026-12-24T00:00:00</FromDate><ToDate>2026-12-26T23:59:00</ToDate></TimePeriod>
					<Occurrences>1</Occurrences>
					<Name>Xmas</Name>
					<Type>1</Type>
					<DayWorking>0</DayWorking>
				</Exception>
			</Exceptions>
		</Calendar>
	</Calendars>
	<Tasks>
		<Task>
			<UID>0</UID>
			<ID>0</ID>
			<Name>Office Move</Name>
			<OutlineLevel>0</OutlineLevel>
			<Summary>1</Summary>
		</Task>
		<Task>
			<UID>7</UID>
			<ID>2</ID>
			<Name>Pack &amp; label</Name>
			<Manual>0</Manual>
			<OutlineLevel>2</OutlineLevel>
			<Start>2026-10-19T08:00:00</Start>
			<Finish>2026-10-20T17:00:00</Finish>
			<Duration>PT16H0M0S</Duration>
			<DurationFormat>39</DurationFormat>
			<Work>PT16H0M0S</Work>
			<Milestone>0</Milestone>
			<PercentComplete>25</PercentComplete>
			<ConstraintType>0</ConstraintType>
			<CalendarUID>-1</CalendarUID>
			<Notes><![CDATA[Boxes <first>]]></Notes>
		</Task>
		<Task>
			<UID>3</UID>
			<ID>1</ID>
			<Name>Move</Name>
			<OutlineLevel>1</OutlineLevel>
			<Summary>1</Summary>
			<Duration>PT40H0M0S</Duration>
		</Task>
		<Task>
			<UID>9</UID>
			<ID>3</ID>
			<Name>Truck</Name>
			<OutlineLevel>2</OutlineLevel>
			<Duration>P1DT0H</Duration>
			<DurationFormat>7</DurationFormat>
			<ConstraintType>4</ConstraintType>
			<ConstraintDate>2026-10-21T08:00:00</ConstraintDate>
			<Priority>800</Priority>
			<PredecessorLink>
				<PredecessorUID>7</PredecessorUID>
				<Type>1</Type>
				<CrossProject>0</CrossProject>
				<LinkLag>4800</LinkLag>
				<LagFormat>7</LagFormat>
			</PredecessorLink>
			<Baseline><Number>0</Number><Start>2026-10-20T08:00:00</Start><Finish>2026-10-20T17:00:00</Finish><Duration>PT8H0M0S</Duration><Work>PT8H0M0S</Work><Cost>120.5</Cost></Baseline>
		</Task>
		<Task>
			<UID>10</UID>
			<ID>4</ID>
			<Name>Manual check</Name>
			<Manual>1</Manual>
			<OutlineLevel>1</OutlineLevel>
			<Start>2026-10-26T13:00:00</Start>
			<Finish>2026-10-26T17:00:00</Finish>
			<Duration>PT4H0M0S</Duration>
			<ManualStart>2026-10-26T13:00:00</ManualStart>
			<ManualFinish>2026-10-26T17:00:00</ManualFinish>
			<DurationFormat>5</DurationFormat>
		</Task>
		<Task>
			<UID>11</UID>
			<ID>5</ID>
			<IsNull>1</IsNull>
		</Task>
	</Tasks>
	<Resources>
		<Resource><UID>0</UID><ID>0</ID><Type>1</Type><IsNull>0</IsNull></Resource>
		<Resource>
			<UID>1</UID><ID>1</ID><Name>Jane</Name><Type>1</Type><Initials>J</Initials>
			<MaxUnits>1.00</MaxUnits><StandardRate>40</StandardRate><CalendarUID>2</CalendarUID>
		</Resource>
		<Resource><UID>2</UID><ID>2</ID><Name>Boxes</Name><Type>0</Type><MaterialLabel>pcs</MaterialLabel><StandardRate>2</StandardRate></Resource>
	</Resources>
	<Assignments>
		<Assignment><UID>1</UID><TaskUID>7</TaskUID><ResourceUID>1</ResourceUID><Units>0.5</Units><Work>PT8H0M0S</Work></Assignment>
		<Assignment><UID>2</UID><TaskUID>7</TaskUID><ResourceUID>2</ResourceUID><Units>30</Units></Assignment>
		<Assignment><UID>3</UID><TaskUID>9</TaskUID><ResourceUID>-65535</ResourceUID><Units>1</Units></Assignment>
	</Assignments>
</Project>`;

test('MSPDI: a file written by MS Project', () => {
  const q = importMspdi(MS_PROJECT_FILE);
  assert.equal(q.title, 'Office Move');
  assert.equal(q.author, 'Jane');
  assert.equal(q.start, '2026-10-19T08:00');
  assert.equal(q.options.currency, '€');
  assert.equal(q.created, '2026-09-01T09:12');
  assert.deepEqual(q.tasks.map((t) => [t.name, t.outlineLevel]), [['Move', 1], ['Pack & label', 2], ['Truck', 2], ['Manual check', 1]], 'ordered by ID, UID 0 and blank rows skipped');
  const pack = q.tasks[1];
  assert.equal(pack.duration, 960);
  assert.equal(pack.durationUnit, 'd');
  assert.equal(pack.estimated, true, 'format 39 = days, estimated');
  assert.equal(pack.percentComplete, 25);
  assert.equal(pack.notes, 'Boxes <first>');
  const truck = q.tasks[2];
  assert.equal(truck.duration, 480, 'P1DT0H');
  assert.deepEqual(truck.constraint, { type: 'SNET', date: '2026-10-21T08:00' });
  assert.equal(truck.priority, 800);
  assert.deepEqual(truck.predecessors, [{ taskId: pack.id, type: 'FS', lag: 480, lagUnit: 'd' }]);
  assert.deepEqual(truck.baselines[0], { start: '2026-10-20T08:00', finish: '2026-10-20T17:00', duration: 480, work: 480, cost: 120.5 });
  const manual = q.tasks[3];
  assert.equal(manual.manual, true);
  assert.equal(manual.start, '2026-10-26T13:00');
  assert.equal(manual.finish, '2026-10-26T17:00');
  assert.equal(manual.durationUnit, 'h');
  // Calendars: the old WeekDay exception form; the empty resource calendar folds into Standard.
  assert.deepEqual(q.calendars.map((c) => c.name), ['Standard', 'Night']);
  assert.deepEqual(q.calendars[0].exceptions.map((e) => [e.start, e.finish, e.working]), [['2026-10-22', '2026-10-22', false]]);
  assert.deepEqual(q.calendars[1].week[1], [[1320, 1440]], 'ToTime 00:00 is midnight');
  assert.deepEqual(q.calendars[1].week[0], [], 'missing days of a base calendar: the standard week');
  assert.deepEqual(q.calendars[1].week[3], [[480, 720], [780, 1020]]);
  assert.deepEqual(q.calendars[1].exceptions.map((e) => [e.name, e.start, e.finish]), [['Xmas', '2026-12-24', '2026-12-26']]);
  // Resources: UID 0 skipped; the unassigned assignment dropped.
  assert.deepEqual(q.resources.map((r) => [r.name, r.type, r.stdRate, r.calendarId, r.materialLabel]), [['Jane', 'work', 40, null, ''], ['Boxes', 'material', 2, null, 'pcs']]);
  assert.deepEqual(q.assignments.map((a) => [P.findTask(q, a.taskId).name, P.findResource(q, a.resourceId).name, a.units]), [['Pack & label', 'Jane', 0.5], ['Pack & label', 'Boxes', 30]]);
  // Schedule: Pack Mon–Tue, Thursday 22nd is a holiday, Truck FS+1d → SNET Wed but lag pushes to Friday.
  const s = schedule(q);
  assert.equal(fromMin(s.info(truck.id).start), '2026-10-23T08:00');
  assert.equal(fromMin(s.info(truck.id).finish), '2026-10-23T17:00');
});

test('MSPDI: recurring exceptions are expanded inside their range', () => {
  const xml = `<Project xmlns="http://schemas.microsoft.com/project"><StartDate>2026-01-05T08:00:00</StartDate><CalendarUID>1</CalendarUID><Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar>
    <Exceptions>
      <Exception><EnteredByOccurrences>1</EnteredByOccurrences><TimePeriod><FromDate>2026-01-01T00:00:00</FromDate><ToDate>2028-01-01T23:59:00</ToDate></TimePeriod><Occurrences>3</Occurrences><Name>New year</Name><Type>2</Type><Month>0</Month><MonthDay>1</MonthDay><DayWorking>0</DayWorking></Exception>
      <Exception><TimePeriod><FromDate>2026-03-02T00:00:00</FromDate><ToDate>2026-03-15T23:59:00</ToDate></TimePeriod><Name>Fridays</Name><Type>6</Type><Period>1</Period><DaysOfWeek>32</DaysOfWeek><DayWorking>0</DayWorking></Exception>
    </Exceptions></Calendar></Calendars><Tasks/></Project>`;
  const q = importMspdi(xml);
  assert.deepEqual(q.calendars[0].exceptions.map((e) => `${e.name} ${e.start}`), ['New year 2026-01-01', 'Fridays 2026-03-06', 'Fridays 2026-03-13', 'New year 2027-01-01', 'New year 2028-01-01'], 'sorted by date');
});

test('MSPDI: garbage is refused with format.notMspdi', () => {
  for (const text of ['', 'hello world', '{"tasks": []}', '<html><body>x</body></html>', '<Project><Tasks>', '<?xml version="1.0"?><Project><Name>x</Nme></Project>', 'ID,Name\n1,A', null]) {
    throwsCode(() => importMspdi(text), 'format.notMspdi');
  }
  // A minimal <Project> is a valid (empty) project.
  const empty = importMspdi('<Project xmlns="http://schemas.microsoft.com/project"><Name>Empty</Name></Project>');
  assert.equal(empty.title, 'Empty');
  assert.equal(empty.tasks.length, 0);
  assert.equal(empty.calendars.length, 3, 'default calendars when the file has none');
});

test('MSPDI: & < > " \' survive in names, notes and properties', () => {
  const p = make('A & B <C> "D" \'E\'');
  const t = add(p, '<script>alert("x & y")</script>', 1, { notes: ']]> & <![CDATA[ x' });
  P.addResource(p, { name: 'R&D "Team" <1>' });
  const q = importMspdi(exportMspdi(p));
  assert.equal(q.title, p.title);
  assert.equal(q.tasks[0].name, t.name);
  assert.equal(q.tasks[0].notes, t.notes);
  assert.equal(q.resources[0].name, 'R&D "Team" <1>');
});

// ───────────────────────── CSV

function csvProject() {
  const p = make('CSV');
  const phase = add(p, 'Phase, one', 1);
  const a = add(p, 'Design "core"', 5, { outlineLevel: 2, notes: 'two\nlines, with commas', percentComplete: 50 });
  const b = add(p, 'Build', 3, { outlineLevel: 2 });
  const c = add(p, 'Review', 0, { outlineLevel: 2, duration: 4 * 60, durationUnit: 'h' });
  const d = add(p, 'Ship', 0, { outlineLevel: 1, milestone: true });
  const e = add(p, 'Docs', 2, { outlineLevel: 1, constraint: { type: 'SNET', date: '2026-11-02T08:00' } });
  P.linkTasks(p, a.id, b.id, 'SS', 2 * DAY, 'd');
  P.linkTasks(p, b.id, c.id, 'FS', -1 * DAY, 'd');
  P.linkTasks(p, phase.id, d.id);
  P.linkTasks(p, a.id, e.id, 'FF', 50, '%');
  const kim = P.addResource(p, { name: 'Kim' });
  const lee = P.addResource(p, { name: 'Lee' });
  P.assignResource(p, a.id, kim.id, 1);
  P.assignResource(p, a.id, lee.id, 0.5);
  P.assignResource(p, b.id, lee.id, 1);
  b.fixedCost = 1200;
  return p;
}

test('CSV export: header, quoting, durations, predecessors, resources', () => {
  const p = csvProject();
  const csv = exportCsv(p, schedule(p));
  assert.ok(csv.startsWith('﻿ID,WBS,Name,Outline Level,Duration,Start,Finish,Predecessors,Resource Names,% Complete,Cost,Work,Milestone,Notes\r\n'));
  const rows = parseCsv(csv);
  assert.equal(rows.length, p.tasks.length + 1);
  assert.deepEqual(rows[1].slice(0, 5), ['1', '1', 'Phase, one', '1', '5d']);
  assert.deepEqual(rows[2], ['2', '1.1', 'Design "core"', '2', '5d', '2026-10-19 08:00', '2026-10-23 17:00', '', 'Kim;Lee[50%]', '50', '0', '60', 'No', 'two\nlines, with commas']);
  assert.equal(rows[3][7], '2SS+2d');
  assert.equal(rows[4][4], '4h');
  assert.equal(rows[4][7], '3FS-1d');
  assert.deepEqual([rows[5][4], rows[5][12]], ['0d', 'Yes']);
  assert.equal(rows[6][7], '2FF+50%');
  assert.equal(rows[3][10], '1200');
  assert.ok(csv.includes('"Design ""core"""'));
});

test('CSV round trip: same tasks, levels, links, resources and dates', () => {
  const p = csvProject();
  const q = importCsv(exportCsv(p, schedule(p)), { language: 'en' });
  assert.deepEqual(q.tasks.map((t) => [t.name, t.outlineLevel, t.duration, t.durationUnit, t.milestone]), p.tasks.map((t) => [t.name, t.outlineLevel, P.outline(p).isSummary(t.id) ? 5 * DAY : t.duration, t.durationUnit, t.milestone]));
  assert.deepEqual(q.tasks.map((t) => t.predecessors.map((l) => [P.rowOf(q, l.taskId), l.type, l.lag, l.lagUnit])), p.tasks.map((t) => t.predecessors.map((l) => [P.rowOf(p, l.taskId), l.type, l.lag, l.lagUnit])));
  assert.deepEqual(q.resources.map((r) => r.name), ['Kim', 'Lee']);
  assert.deepEqual(q.assignments.map((a) => [P.findTask(q, a.taskId).name, P.findResource(q, a.resourceId).name, a.units]), [['Design "core"', 'Kim', 1], ['Design "core"', 'Lee', 0.5], ['Build', 'Lee', 1]]);
  assert.equal(q.tasks[1].notes, 'two\nlines, with commas');
  assert.equal(q.tasks[1].percentComplete, 50);
  assert.equal(q.tasks[2].fixedCost, 1200);
  assert.deepEqual(q.tasks[5].constraint, { type: 'SNET', date: '2026-11-02T08:00' }, 'a start later than its links allow keeps its date');
  assert.deepEqual(q.tasks[1].constraint, { type: 'SNET', date: '2026-10-19T08:00' }, 'a start without predecessors keeps its date');
  assert.deepEqual(q.tasks[2].constraint, { type: 'ASAP', date: null }, 'a start that follows from its links stays ASAP');
  assert.equal(q.start, '2026-10-19T08:00');
  assert.deepEqual(dates(q), dates(p));
  assert.equal(schedule(q).cost, schedule(p).cost);
});

test('CSV: Korean headers, semicolons, any column order, date-only values', () => {
  const csv = '작업 이름;기간;시작;완료;선행 작업;자원 이름;개요 수준;완료율;메모\n'
    + '준비;;;;;;1;;\n'
    + '설계;3일;2026-10-19;;;홍길동;2;20%;"메모; 하나"\n'
    + '구현;2d;;;2;홍길동[50%];2;;\n'
    + '검토;;2026-10-26;2026-10-27;;;1;;\n';
  const q = importCsv(csv);
  assert.deepEqual(q.tasks.map((t) => [t.name, t.outlineLevel]), [['준비', 1], ['설계', 2], ['구현', 2], ['검토', 1]]);
  assert.equal(q.tasks[1].duration, 3 * DAY);
  assert.equal(q.tasks[1].percentComplete, 20);
  assert.equal(q.tasks[1].notes, '메모; 하나');
  assert.deepEqual(q.tasks[1].constraint, { type: 'SNET', date: '2026-10-19T08:00' });
  assert.deepEqual(q.tasks[2].predecessors, [{ taskId: q.tasks[1].id, type: 'FS', lag: 0, lagUnit: 'd' }]);
  assert.equal(q.tasks[3].duration, 2 * DAY, 'duration from start and finish');
  assert.deepEqual(q.resources.map((r) => r.name), ['홍길동']);
  assert.deepEqual(q.assignments.map((a) => a.units), [1, 0.5]);
  assert.deepEqual(dates(q).slice(1), ['설계: 2026-10-19T08:00 → 2026-10-21T17:00', '구현: 2026-10-22T08:00 → 2026-10-23T17:00', '검토: 2026-10-26T08:00 → 2026-10-27T17:00']);
});

test('CSV: tab-separated table with an unusual name column and CRLF', () => {
  const q = importCsv('Summary\tDuration\tStart\r\nA\t2\t2026-10-20 13:00\r\nB\t1w\t\r\n');
  assert.deepEqual(q.tasks.map((t) => [t.name, t.duration, t.durationUnit]), [['A', 960, 'd'], ['B', 2400, 'w']]);
  assert.deepEqual(q.tasks[0].constraint, { type: 'SNET', date: '2026-10-20T13:00' });
  assert.equal(q.start, '2026-10-20T13:00');
});

test('CSV: plain lists — one column, headerless, indented', () => {
  const list = importCsv('Buy land\nDesign house\n\nBuild house\n');
  assert.deepEqual(list.tasks.map((t) => [t.name, t.outlineLevel]), [['Buy land', 1], ['Design house', 1], ['Build house', 1]]);
  assert.equal(list.tasks[0].duration, DAY, 'new tasks get the default duration');
  const named = importCsv('Name\r\n"Kick, off"\r\nWork\r\n');
  assert.deepEqual(named.tasks.map((t) => t.name), ['Kick, off', 'Work']);
  const work = importCsv('Work\nRest\n');
  assert.deepEqual(work.tasks.map((t) => t.name), ['Work', 'Rest'], 'a one-column list starting with a header-like word');
  const outlined = importCsv('Phase\n  Step 1\n  Step 2\n    Detail\nPhase 2\n');
  assert.deepEqual(outlined.tasks.map((t) => t.outlineLevel), [1, 2, 2, 3, 1]);
});

test('CSV: delimiter detection and RFC 4180 parsing', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a\tb\n'), '\t');
  assert.equal(detectDelimiter('"a;b",c\n'), ',');
  assert.equal(detectDelimiter('single'), ',');
  assert.deepEqual(parseCsv('a,"b,c","d ""e""",\r\n"multi\r\nline",x\n'), [['a', 'b,c', 'd "e"', ''], ['multi\nline', 'x']]);
  assert.deepEqual(parseCsv('﻿x;y', ';'), [['x', 'y']]);
});

test('CSV: nothing usable throws format.emptyCsv', () => {
  for (const text of ['', '   \n\n', '﻿', ',,,\n,,', 'Duration,Start\n5d,2026-10-19\n', 'Name\n\n']) throwsCode(() => importCsv(text), 'format.emptyCsv');
});

// ───────────────────────── clipboard text

test('tasksFromText: indentation, bullets, numbering and durations', () => {
  const items = tasksFromText('Plan\n\t- Research\t3d\n\t- Write\t2w\n\t\t* Draft\n  • Review\t4h\n1. Launch\n1.1 Prepare\n2) Party\tnope\n');
  assert.deepEqual(items, [
    { name: 'Plan', outlineLevel: 1 },
    { name: 'Research', outlineLevel: 2, duration: 3 * DAY, durationUnit: 'd' },
    { name: 'Write', outlineLevel: 2, duration: 2 * 2400, durationUnit: 'w' },
    { name: 'Draft', outlineLevel: 3 },
    { name: 'Review', outlineLevel: 2, duration: 240, durationUnit: 'h' },
    { name: 'Launch', outlineLevel: 1 },
    { name: 'Prepare', outlineLevel: 2 },
    { name: 'Party', outlineLevel: 1 },
  ]);
  assert.deepEqual(tasksFromText('    deep\n  shallow'), [{ name: 'deep', outlineLevel: 1 }, { name: 'shallow', outlineLevel: 1 }]);
  assert.deepEqual(tasksFromText('a\n        jump'), [{ name: 'a', outlineLevel: 1 }, { name: 'jump', outlineLevel: 2 }], 'never more than one level deeper');
  assert.deepEqual(tasksFromText(''), []);
});

test('tasksToTsv for Excel, and back through tasksFromText', () => {
  const p = csvProject();
  const s = schedule(p);
  const ids = p.tasks.slice(0, 4).map((t) => t.id);
  const tsv = tasksToTsv(p, s, ids);
  assert.deepEqual(tsv.split('\r\n').slice(0, 2), ['Phase, one\t5d\t2026-10-19 08:00\t2026-10-23 17:00', '  Design "core"\t5d\t2026-10-19 08:00\t2026-10-23 17:00']);
  assert.deepEqual(tasksFromText(tsv).map((t) => [t.name, t.outlineLevel, t.duration]), [['Phase, one', 1, 5 * DAY], ['Design "core"', 2, 5 * DAY], ['Build', 2, 3 * DAY], ['Review', 2, 240]]);
  assert.equal(tasksToTsv(p, s, []), '');
  // Only the chosen rows, in row order, indented from the shallowest one.
  assert.equal(tasksToTsv(p, s, [p.tasks[2].id, p.tasks[1].id]).split('\r\n')[0].split('\t')[0], 'Design "core"');
});

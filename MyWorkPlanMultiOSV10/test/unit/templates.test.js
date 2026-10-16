// The templates of File › New and the tutorial sample: every one builds in
// both languages, schedules cleanly, survives a save and reload, and the
// sample shows what the tutorial talks about (baseline, progress, late work,
// variances, an overallocated person).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parsePlan, serialize } from '../../src/domain/format.js';
import { outline } from '../../src/domain/project.js';
import { schedule } from '../../src/domain/schedule.js';
import { TEMPLATES, buildSample, buildTemplate } from '../../src/domain/templates.js';
import { dayOf, toMin, weekdayOfDay } from '../../src/domain/time.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HANGUL = /[가-힣]/;
const START = '2026-10-19T08:00';
const LANGUAGES = ['ko', 'en'];
const ICONS = ['blank', 'tplSoftware', 'tplBuild', 'tplEvent', 'tplMarketing', 'tplLaunch', 'tplResearch', 'tplMove'];
const FULL = TEMPLATES.filter((t) => t.id !== 'blank').map((t) => t.id);

const texts = (p) => [p.title, ...p.tasks.map((t) => t.name), ...p.resources.map((r) => r.name)];
const clean = (p) => JSON.parse(JSON.stringify(p));

/** Schedule checks every plan must pass. */
function assertSchedulesCleanly(p, label) {
  const s = schedule(p);
  assert.deepEqual(s.conflicts.filter((c) => c.kind === 'circular'), [], `${label}: no loops`);
  assert.deepEqual(s.errors, [], `${label}: no calendar errors`);
  assert.ok(s.finish > s.start, `${label}: finish after start`);
  assert.ok(p.tasks.some((t) => s.info(t.id).critical), `${label}: a critical path`);
  const resources = new Set(p.resources.map((r) => r.id));
  const tasks = new Set(p.tasks.map((t) => t.id));
  for (const a of p.assignments) assert.ok(resources.has(a.resourceId) && tasks.has(a.taskId), `${label}: assignment ${a.id} points at real rows`);
  return s;
}

test('the template list: ids, icons and names in both languages', () => {
  assert.deepEqual(TEMPLATES.map((t) => t.id), ['blank', 'software', 'construction', 'event', 'marketing', 'launch', 'research', 'move']);
  for (const t of TEMPLATES) {
    assert.ok(ICONS.includes(t.icon), t.id);
    assert.ok(HANGUL.test(t.name.ko) && HANGUL.test(t.description.ko), t.id);
    assert.ok(!HANGUL.test(t.name.en) && !HANGUL.test(t.description.en), t.id);
  }
});

test('blank is an empty plan with a title; the default start is a Monday 08:00 after today', () => {
  for (const language of LANGUAGES) {
    const p = buildTemplate('blank', { language });
    assert.equal(p.tasks.length, 0);
    assert.equal(p.resources.length, 0);
    assert.ok(p.title);
    const start = toMin(p.start);
    assert.equal(weekdayOfDay(dayOf(start)), 1);
    assert.equal(start % 1440, 480);
    assert.ok(start > Date.now() / 60000 - 1440 * 2);
  }
  assert.equal(buildTemplate('blank', { language: 'en', start: START }).start, START);
});

for (const id of FULL) {
  test(`template "${id}" builds and schedules in Korean and English`, () => {
    const ko = buildTemplate(id, { language: 'ko', start: START });
    const en = buildTemplate(id, { language: 'en', start: START });
    assert.equal(ko.start, START);
    assert.equal(ko.options.currency, '₩');
    assert.equal(en.options.currency, '$');
    assert.equal(ko.tasks.length, en.tasks.length, 'same plan in both languages');
    assert.ok(HANGUL.test(ko.title) && ko.tasks.every((t) => HANGUL.test(t.name) || /^[A-Z]{2,}/.test(t.name)), 'Korean text');
    assert.ok(texts(en).every((text) => !HANGUL.test(text)), 'no Korean in English');
    const koTexts = texts(ko);
    texts(en).forEach((text, i) => assert.notEqual(text, koTexts[i]));
    for (const p of [ko, en]) assertSchedulesCleanly(p, `${id}.${p.options.currency}`);
  });

  test(`template "${id}" has phases, milestones, links, resources and assignments`, () => {
    for (const language of LANGUAGES) {
      const p = buildTemplate(id, { language, start: START });
      const label = `${id}.${language}`;
      const { isSummary } = outline(p);
      const phases = p.tasks.filter((t) => t.outlineLevel === 1);
      const leaves = p.tasks.filter((t) => !isSummary(t.id));
      const milestones = p.tasks.filter((t) => t.milestone);
      assert.ok(p.tasks.length >= 18 && p.tasks.length <= 40, `${label}: ${p.tasks.length} tasks`);
      assert.ok(phases.length >= 3 && phases.length <= 6 && phases.every((t) => isSummary(t.id)), `${label}: phases`);
      assert.ok(Math.max(...p.tasks.map((t) => t.outlineLevel)) <= 3, label);
      assert.ok(milestones.length >= 2 && milestones.length <= 5 && milestones.every((t) => t.duration === 0), `${label}: milestones`);
      assert.ok(new Set(leaves.filter((t) => !t.milestone).map((t) => t.durationUnit)).size >= 2, `${label}: mixed units`);
      const links = p.tasks.flatMap((t) => t.predecessors);
      assert.ok(links.length >= leaves.length - 2, `${label}: a linked network`);
      assert.ok(links.some((l) => l.type === 'SS' && l.lag > 0), `${label}: SS with lag`);
      assert.ok(p.resources.length >= 4 && p.resources.length <= 8, `${label}: resources`);
      const work = p.resources.filter((r) => r.type === 'work');
      assert.ok(work.every((r) => r.group && r.initials && r.stdRate >= (language === 'ko' ? 35000 : 25) && r.stdRate <= (language === 'ko' ? 120000 : 120)), `${label}: rates`);
      const assigned = new Set(p.assignments.map((a) => a.taskId));
      const workLeaves = leaves.filter((t) => !t.milestone);
      assert.ok(workLeaves.filter((t) => assigned.has(t.id)).length >= workLeaves.length * 0.75, `${label}: most tasks have people`);
      assert.ok(p.assignments.some((a) => a.units === 0.5), `${label}: half-time units`);
      assert.ok(p.tasks.filter((t) => t.notes).length >= 1, `${label}: notes`);
      assert.ok(p.tasks.some((t) => t.deadline), `${label}: deadline`);
      assert.ok(p.tasks.some((t) => t.constraint.type === 'SNET' && t.constraint.date), `${label}: SNET`);
      assert.ok(p.tasks.some((t) => t.priority !== 500), `${label}: priority`);
      assert.ok(p.tasks.every((t) => !t.effortDriven), `${label}: not effort-driven`);
      // Holidays on the standard calendar, inside the plan.
      const s = schedule(p);
      const holidays = p.calendars.find((c) => c.id === 'standard').exceptions;
      assert.ok(holidays.length >= 1 && holidays.length <= 3, `${label}: holidays`);
      for (const h of holidays) {
        assert.ok(!h.working && h.name, label);
        assert.ok(dayOf(toMin(h.start)) >= dayOf(s.start) && dayOf(toMin(h.finish)) <= dayOf(s.finish), `${label}: ${h.name} inside the plan`);
        if (language === 'ko') assert.ok(HANGUL.test(h.name), h.name);
      }
    }
  });
}

test('across the templates: every link type feature, material and cost resources', () => {
  const all = FULL.map((id) => buildTemplate(id, { language: 'ko', start: START }));
  const links = all.flatMap((p) => p.tasks.flatMap((t) => t.predecessors));
  assert.ok(links.some((l) => l.type === 'FF'), 'FF');
  assert.ok(links.some((l) => l.lag < 0), 'lead (negative lag)');
  assert.ok(links.some((l) => l.lagUnit === '%'), '% lag');
  const resources = all.flatMap((p) => p.resources);
  assert.ok(resources.some((r) => r.type === 'material' && r.materialLabel), 'material');
  assert.ok(resources.some((r) => r.type === 'cost'), 'cost');
  assert.ok(all.some((p) => p.assignments.some((a) => a.cost > 0)), 'cost assignment');
});

test('templates and the sample survive saving and reading back', () => {
  const plans = [...FULL.flatMap((id) => LANGUAGES.map((language) => buildTemplate(id, { language, start: START }))), ...LANGUAGES.map((language) => buildSample(language, { today: '2026-10-16' }))];
  for (const p of plans) {
    const { project, template } = parsePlan(serialize(p, { sched: schedule(p) }), p.options.currency === '$' ? 'en' : 'ko');
    assert.equal(template, false);
    assert.deepEqual(clean(project), clean(p), p.title);
  }
  const t = parsePlan(serialize(plans[0], { template: true }));
  assert.equal(t.template, true);
  assert.deepEqual(clean(t.project), clean(plans[0]), 'a fresh template has no progress to drop');
});

for (const language of LANGUAGES) {
  test(`the tutorial sample (${language}): baseline, progress, late work, variance, overallocation`, () => {
    const today = '2026-10-16'; // a Friday
    const p = buildSample(language, { today });
    assert.equal(p.title, language === 'ko' ? '웹사이트 리뉴얼' : 'Website Redesign');
    assert.ok(p.tasks.length >= 25 && p.tasks.length <= 40);
    assert.equal(p.start, '2026-09-21T08:00', 'Monday three weeks back');
    assert.equal(p.statusDate, '2026-10-16T17:00');
    assert.ok(p.baselineDates[0]);
    assert.ok(p.tasks.every((t) => t.baselines[0]?.start && t.baselines[0]?.finish), 'baseline on every row');
    const types = new Set(p.tasks.flatMap((t) => t.predecessors.map((l) => l.type)));
    assert.deepEqual([...types].sort(), ['FF', 'FS', 'SF', 'SS']);
    const s = assertSchedulesCleanly(p, `sample.${language}`);
    const leaves = p.tasks.filter((t) => !s.info(t.id).summary);
    const done = leaves.filter((t) => t.percentComplete === 100);
    const partial = leaves.filter((t) => t.percentComplete > 0 && t.percentComplete < 100);
    assert.ok(done.length >= 3 && done.every((t) => t.actualStart && t.actualFinish), 'finished tasks');
    assert.ok(partial.length >= 2 && partial.every((t) => t.actualStart && !t.actualFinish), 'tasks under way');
    assert.ok(leaves.some((t) => s.info(t.id).late), 'a late task');
    assert.ok(p.tasks.some((t) => s.info(t.id).finishVariance > 0), 'a slip against the baseline');
    assert.ok(p.tasks.some((t) => s.info(t.id).durationVariance > 0), 'a longer task');
    const over = p.resources.filter((r) => s.resources.get(r.id).overallocated);
    assert.ok(over.length >= 1, 'an overallocated person');
    // The clash is in the future, so leveling can move it.
    const clash = over.flatMap((r) => s.resources.get(r.id).assignments.filter((a) => a.overallocated)).map((a) => p.tasks.find((t) => t.id === a.taskId));
    assert.ok(clash.some((t) => !t.actualStart), 'leveling has something to move');
  });
}

test('the sample started three weeks before any day of the week', () => {
  for (const today of ['2026-10-12', '2026-10-14', '2026-10-18', '2027-03-03']) {
    const p = buildSample('en', { today });
    const s = assertSchedulesCleanly(p, today);
    assert.equal(weekdayOfDay(dayOf(toMin(p.start))), 1);
    assert.ok(p.tasks.some((t) => s.info(t.id).late), `${today}: a late task`);
    assert.ok(p.tasks.some((t) => t.percentComplete > 0 && t.percentComplete < 100), `${today}: in progress`);
  }
});

test('make-samples wrote the installed sample files and they open', () => {
  const dir = path.join(root, 'samples');
  const expected = LANGUAGES.flatMap((l) => ['website-redesign', 'software-project', 'construction-project', 'event-plan'].map((n) => `${n}.${l}.mwp`).concat(`event-template.${l}.mwpt`));
  for (const name of expected) {
    const file = path.join(dir, name);
    assert.ok(fs.existsSync(file), `${name} (run: node scripts/make-samples.mjs)`);
    const { project, template } = parsePlan(fs.readFileSync(file, 'utf8'));
    assert.equal(template, name.endsWith('.mwpt'), name);
    assert.ok(project.tasks.length >= 18, name);
    assert.equal(HANGUL.test(project.title), name.includes('.ko.'), name);
    assertSchedulesCleanly(project, name);
  }
});

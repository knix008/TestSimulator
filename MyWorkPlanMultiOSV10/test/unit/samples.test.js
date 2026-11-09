// The start page's sample plans: eight groups of five, ids and icons valid, names
// in both languages, and every plan builds, schedules cleanly (no loops, a
// critical path from the start to the finish), uses its resources and survives
// a save and reload. Plans marked `started` are under way on any day.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlan, serialize } from '../../src/domain/format.js';
import { criticalPath } from '../../src/domain/critical.js';
import { schedule } from '../../src/domain/schedule.js';
import { SAMPLE_GROUPS, SAMPLE_PROJECTS, buildSampleProject } from '../../src/domain/samples/index.js';
import { hasIcon } from '../../src/icons.js';
import { dayOf, toMin, weekdayOfDay } from '../../src/domain/time.js';

const HANGUL = /[가-힣]/;
const LANGUAGES = ['ko', 'en'];

test('eight groups of five samples, unique ids, icons that exist', () => {
  assert.equal(SAMPLE_GROUPS.length, 8);
  assert.equal(SAMPLE_PROJECTS.length, 40);
  assert.equal(new Set(SAMPLE_PROJECTS.map((s) => s.id)).size, 40, 'ids are unique');
  for (const group of SAMPLE_GROUPS) {
    assert.ok(hasIcon(group.icon), `group ${group.id}: icon ${group.icon}`);
    assert.equal(SAMPLE_PROJECTS.filter((s) => s.group === group.id).length, 5, `group ${group.id} has five samples`);
  }
  for (const s of SAMPLE_PROJECTS) {
    assert.match(s.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${s.id}: id is kebab-case`);
    assert.ok(hasIcon(s.icon), `${s.id}: icon ${s.icon} exists`);
    assert.ok(SAMPLE_GROUPS.some((g) => g.id === s.group), `${s.id}: group ${s.group}`);
    assert.ok(HANGUL.test(s.ko[0]) && HANGUL.test(s.ko[1]), `${s.id}: Korean name and description`);
    assert.ok(s.en[0] && s.en[1] && !HANGUL.test(s.en[0] + s.en[1]), `${s.id}: English name and description`);
    assert.ok(s.ko[1].length <= 60 && s.en[1].length <= 90, `${s.id}: short descriptions`);
  }
  assert.ok(SAMPLE_PROJECTS.filter((s) => s.started).length >= 6, 'several samples are already under way');
});

for (const group of SAMPLE_GROUPS) {
  test(`group ${group.id}: every sample builds and schedules cleanly in both languages`, () => {
    for (const sample of SAMPLE_PROJECTS.filter((s) => s.group === group.id)) {
      for (const language of LANGUAGES) {
        const label = `${sample.id}.${language}`;
        const p = buildSampleProject(sample.id, language, { today: '2026-11-11' });
        assert.ok(p, label);
        assert.equal(HANGUL.test(p.title), language === 'ko', `${label}: title language`);
        for (const text of [...p.tasks.map((t) => t.name), ...p.resources.map((r) => r.name)]) {
          assert.ok(text, `${label}: empty name`);
          if (language === 'en') assert.ok(!HANGUL.test(text), `${label}: Korean text in the English plan: ${text}`);
        }
        if (sample.id !== 'website-redesign') {
          assert.ok(p.tasks.length >= 15, `${label}: at least 15 tasks (${p.tasks.length})`);
          assert.ok(p.resources.length >= 4, `${label}: at least 4 resources`);
          assert.ok(p.tasks.filter((t) => t.milestone).length >= 2, `${label}: at least 2 milestones`);
        }
        const s = schedule(p);
        assert.deepEqual(s.conflicts.filter((c) => c.kind === 'circular'), [], `${label}: no loops`);
        assert.deepEqual(s.errors, [], `${label}: no calendar errors`);
        assert.ok(s.finish > s.start, `${label}: finish after start`);
        const cp = criticalPath(p, s);
        assert.ok(cp.chains.some((chain) => s.info(chain[0]).start === s.start && s.info(chain.at(-1)).finish === s.finish), `${label}: the critical path runs from the project start to the finish`);
        const used = new Set(p.assignments.map((a) => a.resourceId));
        for (const r of p.resources) assert.ok(used.has(r.id), `${label}: resource ${r.name} is used`);
        const leaves = p.tasks.filter((t, i) => !(p.tasks[i + 1] && p.tasks[i + 1].outlineLevel > t.outlineLevel));
        assert.ok(leaves.filter((t) => !t.milestone).every((t) => p.assignments.some((a) => a.taskId === t.id) || t.notes), `${label}: work tasks have someone (or a note saying why not)`);
        if (sample.started) {
          assert.ok(p.statusDate, `${label}: status date`);
          assert.ok(p.tasks.some((t) => t.percentComplete === 100), `${label}: finished work`);
          assert.ok(p.tasks.some((t) => t.percentComplete > 0 && t.percentComplete < 100), `${label}: work under way`);
          assert.ok(p.tasks.every((t) => t.baselines?.[0]), `${label}: baseline`);
        } else {
          assert.equal(weekdayOfDay(dayOf(toMin(p.start))), 1, `${label}: starts on a Monday`);
        }
        const again = parsePlan(serialize(p, { sched: s })).project;
        assert.equal(again.tasks.length, p.tasks.length, `${label}: survives save and reload`);
      }
    }
  });
}

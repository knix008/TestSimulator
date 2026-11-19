import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EXAMPLES, exampleWorkspace } from '../../src/domain/examples.js';
import { TUTORIAL } from '../../src/domain/tutorial.js';

const NOW = Date.parse('2026-11-15T12:00:00');

describe('Examples', () => {
  test('offers at least twenty distinct workspaces', () => {
    assert.ok(EXAMPLES.length >= 20);
    assert.equal(new Set(EXAMPLES.map((item) => item.id)).size, EXAMPLES.length);
    assert.equal(new Set(EXAMPLES.map((item) => item.key)).size, EXAMPLES.length);
    for (const item of EXAMPLES) {
      assert.match(item.key, /^[A-Z][A-Z0-9]{1,9}$/);
      const ws = exampleWorkspace(item.id, NOW, 'en');
      assert.ok(ws.projects.length >= 1, item.id);
      const issues = ws.projects.reduce((sum, project) => sum + project.issues.length, 0);
      // A schedule-only example has tasks instead of issues.
      if (item.scheduleOnly) assert.ok(ws.projects[0].schedule.tasks.length >= 4 && issues === 0, item.id);
      else assert.ok(issues >= 4, item.id);
      assert.ok((ws.articles || []).length >= 1, item.id);
      assert.ok((ws.calendars || []).length >= 1, item.id);
      if (item.id !== 'shop' && item.type === 'software') {
        assert.ok(ws.projects[0].sprints.some((sprint) => sprint.state === 'active'), item.id);
      }
    }
  });

  test('keeps the shop sample unchanged', () => {
    const ws = exampleWorkspace('shop', NOW, 'en');
    const shop = ws.projects.find((project) => project.key === 'SHOP');
    assert.equal(shop.issues.find((issue) => issue.key === 'SHOP-1').summary, '결제 경험');
    assert.equal(ws.calendarId || '', '');
    assert.equal(ws.projects.some((project) => project.key === 'SUP'), true);
  });

  test('builds an English service example', () => {
    const ws = exampleWorkspace('clinic', NOW, 'en');
    assert.equal(ws.projects[0].name, 'Neighborhood clinic');
    assert.equal(ws.projects[0].issues[0].summary, 'Morning check-in is slow');
    assert.equal(ws.projects[0].type, 'service');
  });
});

describe('Tutorial', () => {
  test('walks through the main screens', () => {
    const views = TUTORIAL.map((step) => step.view);
    for (const view of ['home', 'board', 'backlog', 'issues', 'roadmap', 'knowledge', 'calendar', 'reports', 'help']) {
      assert.ok(views.includes(view), view);
    }
    for (const step of TUTORIAL) {
      assert.ok(step.ko && step.en && step.bodyKo && step.bodyEn);
    }
    assert.equal(TUTORIAL.find((step) => step.view === 'issues').query, 'type = bug');
  });
});

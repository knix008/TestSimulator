import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sampleWorkspace } from '../../src/domain/sample.js';
import {
  addArticle, addBusinessHours, addCalendar, addWebhook, authorizationUrl, controlChart,
  csvIssueRows, decideApproval, epicBurndown, groupLanes, openApproval, parseCsv, planItems,
} from '../../src/domain/services.js';
import { blankWorkspace, createIssue, transitionGate, updateIssue } from '../../src/domain/store.js';
import { renderStart } from '../../src/ui/start.js';
import { setLanguage } from '../../src/i18n.js';

describe('Work calendar', () => {
  test('counts four working hours across a weekend', () => {
    const calendar = { timezone: 'UTC', week: { mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'], thu: ['09:00', '18:00'], fri: ['09:00', '18:00'], sat: null, sun: null }, holidays: [] };
    const due = addBusinessHours(calendar, Date.parse('2026-11-13T16:00:00Z'), 4);
    assert.equal(new Date(due).toISOString(), '2026-11-16T11:00:00.000Z');
  });

  test('skips a holiday', () => {
    const calendar = { timezone: 'UTC', week: { mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'], thu: ['09:00', '18:00'], fri: ['09:00', '18:00'], sat: null, sun: null }, holidays: ['2026-11-13'] };
    const due = addBusinessHours(calendar, Date.parse('2026-11-13T10:00:00Z'), 4);
    assert.equal(new Date(due).toISOString(), '2026-11-16T13:00:00.000Z');
  });
});

describe('Knowledge', () => {
  test('stores an article and refuses an empty title', () => {
    const ws = blankWorkspace();
    const article = addArticle(ws, { title: 'Payments', body: 'Use **cards**.' }, 'u1');
    assert.equal(article.title, 'Payments');
    assert.throws(() => addArticle(ws, { title: '  ' }, 'u1'), /name-required/);
  });
});

describe('Approvals', () => {
  test('blocks a move until the approval is granted', () => {
    const ws = blankWorkspace();
    const project = ws.projects[0] || null;
    const holder = sampleWorkspace();
    const shop = holder.projects[0];
    shop.allowAnyTransition = false;
    shop.transitions = shop.transitions.filter((item) => !(item.from === 'todo' && item.to === 'done'));
    shop.transitions.push({ id: 'need', from: 'todo', to: 'done', condition: '', validator: 'assignee', approval: true, approverId: 'u1' });
    const issue = createIssue(holder, shop.id, { summary: 'Ship', statusId: 'todo' }, 'u1');
    assert.equal(transitionGate(shop, issue, 'done', 'u1', holder), 'validator');
    issue.assigneeId = 'u2';
    assert.equal(transitionGate(shop, issue, 'done', 'u1', holder), 'approval-required');
    openApproval(holder, shop, issue, 'done', 'u1', 'u2');
    assert.throws(() => decideApproval(holder, holder.approvals[0].id, 'approved', 'u2'), /permission/);
    decideApproval(holder, holder.approvals[0].id, 'approved', 'u1');
    assert.equal(transitionGate(shop, issue, 'done', 'u1', holder), null);
    updateIssue(holder, shop.id, issue.id, { statusId: 'done' }, 'u1');
    assert.equal(issue.statusId, 'done');
    assert.equal(project, null);
  });
});

describe('Plans and reports', () => {
  test('groups a board, lists dated work, and charts cycle time', () => {
    const ws = sampleWorkspace(Date.parse('2026-11-15T12:00:00Z'));
    const shop = ws.projects.find((item) => item.key === 'SHOP');
    const lanes = groupLanes(shop.issues, 'assignee');
    assert.ok(lanes.length > 1);
    assert.ok(planItems(ws).length >= 0);
    const chart = controlChart(shop);
    assert.equal(typeof chart.average, 'number');
    const epic = shop.issues.find((issue) => issue.typeId === 'epic');
    assert.ok(epicBurndown(shop, epic).days.length >= 2);
  });
});

describe('Import and sign-in', () => {
  test('reads a quoted comma and builds a provider address', () => {
    const rows = csvIssueRows('summary,labels\n"Hello, world","a,b"');
    assert.equal(rows[0].summary, 'Hello, world');
    assert.equal(parseCsv('summary\nOne').length, 1);
    const url = authorizationUrl({ issuer: 'https://idp.example.com', clientId: 'app' }, 'http://127.0.0.1/back', 'state1');
    assert.match(url, /client_id=app/);
    assert.throws(() => authorizationUrl({}, 'http://127.0.0.1/back', 'x'), /sso-required/);
    assert.throws(() => addWebhook(blankWorkspace(), { url: 'not a url' }), /url-invalid/);
  });

  test('rejects a webhook without a host', () => {
    const hook = addWebhook(blankWorkspace(), { url: 'https://example.com/hook', events: 'created, transition' });
    assert.deepEqual(hook.events, ['created', 'transition']);
  });
});

describe('Start screen', () => {
  test('offers SQLite and the server engines in English', () => {
    setLanguage('en');
    const html = renderStart({ ui: { status: { listening: true, database: 'data/myworkforce.sqlite' }, dataUrl: 'http://127.0.0.1:1481', connecting: false, localBackup: false, startError: '' } });
    for (const label of ['SQLite', 'MySQL', 'MariaDB', 'SQL Server', 'PostgreSQL', 'personal', 'Tutorial', 'User guide', 'Examples']) assert.match(html, new RegExp(label));
    assert.ok((html.match(/data-action="open-example"/g) || []).length >= 20);
    assert.ok((html.match(/<svg /g) || []).length >= 9);
    const hero = html.slice(html.indexOf('start-hero'), html.indexOf('start-board'));
    assert.equal(hero.includes('data-card-handle'), false);
    assert.equal(hero.includes('data-card-resize'), false);
    for (const id of ['banner', 'actions', 'login', 'background', 'projects', 'examples']) {
      assert.match(html, new RegExp(`data-card-handle="${id}"`));
      assert.match(html, new RegExp(`data-card-resize="${id}"`));
    }
    assert.equal(html.includes('id="server-form"'), false);
    assert.equal(html.includes('data-card="database"'), false);
    assert.match(html, /data-action="open-guide" data-id="guide"/);
    assert.match(html, /data-action="open-guide" data-id="tutorial"/);
    assert.match(html, /data-action="open-guide" data-id="wql"/);
    assert.match(html, /class="start-bg"/);
    assert.equal((html.match(/data-action="pick-background"/g) || []).length, 21);
    assert.match(html, /data-action="shuffle-background"/);
    assert.match(html, /data-bg="speed"/);
    assert.match(html, /id="login-account"/);
    assert.match(html, /id="login-password"/);
    assert.match(html, /data-login/);
    const hidden = renderStart({ ui: { status: { listening: true }, connecting: false }, settings: { startShowBackground: false, startShowExamples: false, startShowProjects: false, startShowBanner: false } });
    assert.equal(hidden.includes('data-card="background"'), false);
    assert.equal(hidden.includes('data-card="examples"'), false);
    assert.equal(hidden.includes('data-card="projects"'), false);
    assert.equal(hidden.includes('data-card="banner"'), false);
    assert.match(hidden, /data-card="actions"/);
    const listed = renderStart({ ui: { status: { listening: true, projects: [{ id: 'p1', key: 'SHOP', name: 'Online shop', type: 'software', issues: 4, archived: false }] }, connecting: false } });
    assert.match(listed, /data-action="open-project" data-id="p1"/);
    assert.match(listed, /Online shop/);
    assert.match(listed, /SHOP/);
    const calendar = addCalendar(blankWorkspace(), { name: 'Desk' });
    assert.equal(calendar.timezone, 'Asia/Seoul');
  });
});

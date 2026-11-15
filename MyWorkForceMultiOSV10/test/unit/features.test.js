import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_TYPES, PROJECT_TYPES } from '../../src/domain/catalog.js';
import { createDocument, updateDocument } from '../../src/domain/documents.js';
import { setNotice } from '../../src/domain/notices.js';
import { describeMail } from '../../src/domain/services.js';
import { toCsv, toMarkdown } from '../../src/domain/export.js';
import { setLanguage, L } from '../../src/i18n.js';
import { renderMarkdown, writingExport } from '../../src/domain/markdown.js';
import { illustrate } from '../../src/ui/figures.js';
import { allowed, roleForAccess, sharesTeam } from '../../src/domain/permissions.js';
import { runQuery } from '../../src/domain/query.js';
import { createdResolved, cumulativeFlow, inspect, pie, sprintReport, timeReport } from '../../src/domain/reports.js';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { DEFAULTS, PANEL_MIN } from '../../src/domain/settings.js';
import {
  addAttachment, addComment, addField, addGadget, addGroup, addLink, addRule, addStatus, addTransition, addUser, addVersion,
  addWorklog, blankWorkspace, cloneIssue, completeSprint, createIssue, createSprint, deleteIssue, mergeProject,
  newProject, projectDocument, rankIssues, readDocument, releaseVersion, removeGadget, removeStatus, saveFilter,
  setArchived, setCustomField, setMember, setUserActive, startSprint, toggleGroupUser, toggleWatch, updateIssue,
  updateProject, upgradeWorkspace, workspaceDocument,
} from '../../src/domain/store.js';
import { parseDuration } from '../../src/domain/util.js';
import { commentPage, updatePage } from '../../src/domain/wiki.js';
import { DARK_THEMES, LIGHT_THEMES, customFrom, resolveTheme } from '../../src/themes.js';
import { loginForm, renderMenubar, renderModal, renderNav, renderToolbar } from '../../src/ui/chrome.js';
import { takeShortcut } from '../../src/ui/shortcuts.js';
import { renderRight, renderView, showRight } from '../../src/ui/pages.js';

const NOW = Date.parse('2026-11-15T12:00:00');

function shop() {
  const ws = blankWorkspace();
  const project = newProject(ws, { name: 'Shop', key: 'SHOP', type: 'software', leadId: ws.currentUserId });
  return { ws, project, me: ws.currentUserId };
}

function person(ws, name, email, role, project) {
  const user = addUser(ws, { name, email });
  if (role) setMember(ws, project.id, user.id, role, ws.currentUserId);
  return user;
}

describe('Projects', () => {
  test('rejects a key that is not 2 to 10 capital letters', () => {
    const { ws, me } = shop();
    assert.throws(() => newProject(ws, { name: 'Bad', key: 'a', leadId: me }), /key-invalid/);
  });

  test('rejects a duplicate project key', () => {
    const { ws, me } = shop();
    assert.throws(() => newProject(ws, { name: 'Again', key: 'SHOP', leadId: me }), /duplicate-key/);
  });

  test('a software project opens with scrum and kanban boards and a planned sprint', () => {
    const { project } = shop();
    assert.deepEqual(project.boards.map((board) => board.type), ['scrum', 'kanban']);
    assert.equal(project.sprints[0].state, 'future');
    assert.equal(project.allowAnyTransition, true);
  });

  test('a service project has queues and no scrum board', () => {
    const ws = blankWorkspace();
    const project = newProject(ws, { name: 'Desk', key: 'DESK', type: 'service', leadId: ws.currentUserId });
    assert.ok(project.queues.length >= 1);
    assert.equal(project.boards.some((board) => board.type === 'scrum'), false);
  });

  test('a business project is kanban only', () => {
    const ws = blankWorkspace();
    const project = newProject(ws, { name: 'Office', key: 'OFFICE', type: 'business', leadId: ws.currentUserId });
    assert.deepEqual(project.boards.map((board) => board.type), ['kanban']);
  });

  test('archiving blocks new issues and unarchiving restores them', () => {
    const { ws, project, me } = shop();
    setArchived(ws, project.id, true, me);
    assert.throws(() => createIssue(ws, project.id, { summary: 'Later' }, me), /permission/);
    setArchived(ws, project.id, false, me);
    assert.equal(createIssue(ws, project.id, { summary: 'Later' }, me).summary, 'Later');
  });

  test('a child project gives parent participants the same access', () => {
    const { ws, project, me } = shop();
    const dev = person(ws, 'Dev', 'dev@example.com', 'developer', project);
    const reader = person(ws, 'Read', 'read@example.com', 'viewer', project);
    const child = newProject(ws, { name: 'Pay', key: 'PAY', parentId: project.id, leadId: me }, me);
    assert.equal(child.parentId, project.id);
    assert.equal(allowed(ws, child, dev.id, 'edit'), true);
    assert.equal(allowed(ws, child, dev.id, 'admin'), false);
    assert.equal(allowed(ws, child, reader.id, 'edit'), false);
    assert.equal(allowed(ws, child, reader.id, 'browse'), true);
    assert.equal(createIssue(ws, child.id, { summary: 'Inside' }, dev.id).summary, 'Inside');
    assert.throws(() => setMember(ws, child.id, reader.id, 'developer', dev.id), /permission/);
    const grand = newProject(ws, { name: 'Card', key: 'CARD', parentId: child.id, leadId: me }, me);
    assert.equal(allowed(ws, grand, dev.id, 'edit'), true);
    assert.throws(() => newProject(ws, { name: 'Nope', key: 'NOPE', parentId: project.id, leadId: dev.id }, dev.id), /permission/);
    assert.throws(() => updateProject(ws, project.id, { parentId: child.id }, me), /parent-required/);
    updateProject(ws, grand.id, { parentId: '' }, me);
    assert.equal(grand.parentId, '');
    setLanguage('en');
    const html = renderModal({
      ws, project: child, user: ws.users.find((user) => user.id === me),
      ui: { modal: { kind: 'participants', projectId: child.id, query: '' } },
      settings: { language: 'en' },
    });
    assert.match(html, /From SHOP/);
    assert.match(html, /Dev/);
    assert.match(html, /Parent project/);
    assert.doesNotMatch(html, new RegExp(`data-participant="${dev.id}"`));
  });

  test('renames a project and refuses an empty name', () => {
    const { ws, project, me } = shop();
    updateProject(ws, project.id, { name: 'Market' }, me);
    assert.equal(project.name, 'Market');
    assert.throws(() => updateProject(ws, project.id, { name: '  ' }, me), /name-required/);
  });
});

describe('Issues', () => {
  test('requires a summary and a parent for a sub-task', () => {
    const { ws, project, me } = shop();
    assert.throws(() => createIssue(ws, project.id, { summary: '  ' }, me), /summary-required/);
    assert.throws(() => createIssue(ws, project.id, { typeId: 'subtask', summary: 'Part' }, me), /parent-required/);
  });

  test('creates every issue type', () => {
    const { ws, project, me } = shop();
    for (const type of DEFAULT_TYPES) {
      const parent = type.id === 'subtask' ? createIssue(ws, project.id, { summary: 'Parent' }, me).id : '';
      const issue = createIssue(ws, project.id, { typeId: type.id, summary: type.en, parentId: parent }, me);
      assert.equal(issue.typeId, type.id);
      assert.match(issue.key, /^SHOP-\d+$/);
    }
  });

  test('fills a resolution when work is done and clears it when reopened', () => {
    const { ws, project, me } = shop();
    const issue = createIssue(ws, project.id, { summary: 'Ship', statusId: 'todo' }, me);
    updateIssue(ws, project.id, issue.id, { statusId: 'done' }, me);
    assert.equal(issue.resolutionId, 'fixed');
    updateIssue(ws, project.id, issue.id, { statusId: 'todo' }, me);
    assert.equal(issue.resolutionId, '');
  });

  test('clones an issue and links the copy', () => {
    const { ws, project, me } = shop();
    const issue = createIssue(ws, project.id, { summary: 'Original', storyPoints: 3, labels: ['pay'] }, me);
    const copy = cloneIssue(ws, project.id, issue.id, me);
    assert.match(copy.summary, /Original/);
    assert.equal(copy.storyPoints, 3);
    assert.ok(copy.links.some((link) => link.type === 'clones' && link.otherId === issue.id));
  });

  test('deletes an issue together with its sub-tasks', () => {
    const { ws, project, me } = shop();
    const parent = createIssue(ws, project.id, { summary: 'Parent' }, me);
    createIssue(ws, project.id, { typeId: 'subtask', summary: 'Child', parentId: parent.id }, me);
    deleteIssue(ws, project.id, parent.id, me);
    assert.equal(project.issues.length, 0);
  });

  test('stores a custom field value', () => {
    const { ws, project, me } = shop();
    const field = addField(ws, project.id, { name: 'Impact', type: 'select', options: 'High, Low' }, me);
    const issue = createIssue(ws, project.id, { summary: 'Field' }, me);
    setCustomField(ws, project.id, issue.id, field.id, 'High', me);
    assert.equal(issue.fields[field.id], 'High');
  });

  test('ranks cards inside one column', () => {
    const { ws, project, me } = shop();
    const first = createIssue(ws, project.id, { summary: 'First' }, me);
    const second = createIssue(ws, project.id, { summary: 'Second' }, me);
    rankIssues(project, [second.id, first.id]);
    assert.deepEqual([second.rank, first.rank], [10, 20]);
  });
});

describe('Workflow', () => {
  test('blocks a move that the workflow does not allow', () => {
    const { ws, project, me } = shop();
    project.allowAnyTransition = false;
    const issue = createIssue(ws, project.id, { summary: 'Held', statusId: 'backlog' }, me);
    assert.throws(() => updateIssue(ws, project.id, issue.id, { statusId: 'done' }, me), /transition-blocked/);
  });

  test('allows a named shortcut from to-do to done', () => {
    const { ws, project, me } = shop();
    project.allowAnyTransition = false;
    const issue = createIssue(ws, project.id, { summary: 'Fast', statusId: 'todo' }, me);
    updateIssue(ws, project.id, issue.id, { statusId: 'done' }, me);
    assert.equal(issue.statusId, 'done');
  });

  test('adds a status and refuses to remove one that issues use', () => {
    const { ws, project, me } = shop();
    const status = addStatus(ws, project.id, { name: 'Waiting', category: 'indeterminate' }, me);
    const issue = createIssue(ws, project.id, { summary: 'Wait', statusId: status.id }, me);
    assert.equal(issue.statusId, status.id);
    assert.throws(() => removeStatus(ws, project.id, status.id, me), /status-used/);
  });

  test('adds and removes a transition', () => {
    const { ws, project, me } = shop();
    const before = project.transitions.length;
    addTransition(ws, project.id, { name: 'Jump', from: 'backlog', to: 'done' }, me);
    assert.equal(project.transitions.length, before + 1);
    project.transitions.pop();
    assert.equal(project.transitions.length, before);
  });
});

describe('Permissions', () => {
  test('a viewer cannot create an issue', () => {
    const { ws, project } = shop();
    const user = person(ws, 'View', 'view@example.com', 'viewer', project);
    assert.equal(allowed(ws, project, user.id, 'create'), false);
    assert.throws(() => createIssue(ws, project.id, { summary: 'Hidden' }, user.id), /permission/);
  });

  test('a tester cannot assign and a customer cannot move status', () => {
    const { ws, project, me } = shop();
    const tester = person(ws, 'Test', 'test@example.com', 'tester', project);
    const customer = person(ws, 'Guest', 'guest@example.com', 'customer', project);
    const issue = createIssue(ws, project.id, { summary: 'Shared' }, me);
    assert.throws(() => updateIssue(ws, project.id, issue.id, { assigneeId: tester.id }, tester.id), /permission/);
    assert.throws(() => updateIssue(ws, project.id, issue.id, { statusId: 'progress' }, customer.id), /permission/);
  });

  test('a developer can create, edit, and move', () => {
    const { ws, project } = shop();
    const user = person(ws, 'Dev', 'dev@example.com', 'developer', project);
    const issue = createIssue(ws, project.id, { summary: 'Build' }, user.id);
    updateIssue(ws, project.id, issue.id, { statusId: 'progress', assigneeId: user.id }, user.id);
    assert.equal(issue.statusId, 'progress');
  });

  test('the lead stays an administrator without a member row', () => {
    const { ws, project, me } = shop();
    project.members = [];
    assert.equal(allowed(ws, project, me, 'admin'), true);
  });

  test('the workspace administrator manages a project they do not lead', () => {
    const ws = upgradeWorkspace(sampleWorkspace(NOW));
    const admin = ws.users.find((user) => user.login === 'admin');
    const project = ws.projects.find((item) => item.key === 'SHOP');
    assert.notEqual(project.leadId, admin.id);
    assert.equal(allowed(ws, project, admin.id, 'admin'), true);
    updateProject(ws, project.id, { name: 'Managed shop' }, admin.id);
    assert.equal(project.name, 'Managed shop');
    const member = ws.users.find((user) => user.name === '정하늘');
    setMember(ws, project.id, member.id, 'developer', admin.id);
    assert.equal(project.members.find((item) => item.userId === member.id).role, 'developer');
  });

  test('a lead gives read only and edit access', () => {
    const ws = upgradeWorkspace(sampleWorkspace(NOW));
    const project = ws.projects.find((item) => item.key === 'SHOP');
    const lead = ws.users.find((user) => user.id === project.leadId);
    const teammate = ws.users.find((user) => user.name === '박민준');
    const outsider = addUser(ws, { name: 'Outside', email: 'out@example.com' });
    assert.equal(sharesTeam(ws, lead.id, teammate.id), true);
    assert.equal(sharesTeam(ws, lead.id, outsider.id), false);
    setMember(ws, project.id, outsider.id, roleForAccess('read'), lead.id);
    assert.equal(allowed(ws, project, outsider.id, 'browse'), true);
    assert.equal(allowed(ws, project, outsider.id, 'edit'), false);
    setMember(ws, project.id, outsider.id, roleForAccess('edit'), lead.id);
    assert.equal(allowed(ws, project, outsider.id, 'edit'), true);
    assert.throws(() => setMember(ws, project.id, outsider.id, roleForAccess('edit'), teammate.id), /permission/);
  });

  test('an inactive person cannot browse', () => {
    const { ws, project } = shop();
    const user = person(ws, 'Gone', 'gone@example.com', 'developer', project);
    setUserActive(ws, user.id, false);
    assert.equal(allowed(ws, project, user.id, 'browse'), false);
  });
});

describe('Collaboration', () => {
  test('rejects an empty comment and notifies a mentioned person', () => {
    const { ws, project, me } = shop();
    const ann = person(ws, 'Ann', 'ann@example.com', 'developer', project);
    const issue = createIssue(ws, project.id, { summary: 'Talk' }, me);
    assert.throws(() => addComment(ws, project.id, issue.id, '  ', me), /summary-required/);
    addComment(ws, project.id, issue.id, '@Ann please look', me);
    assert.ok(project.notifications.some((item) => item.userId === ann.id && item.kind === 'comment'));
  });

  test('a person chooses notices for a project, a page, and a document', () => {
    const ws = sampleWorkspace(NOW);
    const project = ws.projects.find((item) => item.key === 'SHOP');
    const outsider = addUser(ws, { name: 'Outside', email: 'out@example.com' });
    setNotice(ws, outsider.id, 'project', project.id, { watch: true, created: true, assign: false, comment: false, transition: false, page: false });
    const issue = createIssue(ws, project.id, { summary: 'Notice', assigneeId: 'u3' }, 'u1');
    assert.ok(project.notifications.some((item) => item.userId === outsider.id && item.issueId === issue.id && item.kind === 'created'));
    setNotice(ws, 'u3', 'project', project.id, { watch: false, created: false, assign: false, comment: false, transition: false, page: false });
    const quiet = project.notifications.filter((item) => item.userId === 'u3' && item.issueId === issue.id).length;
    addComment(ws, project.id, issue.id, 'quiet', 'u1');
    assert.equal(project.notifications.filter((item) => item.userId === 'u3' && item.issueId === issue.id).length, quiet);
    const page = ws.articles.find((item) => item.title === '결제 안내');
    setNotice(ws, 'u2', 'page', page.id, { edit: false, comment: true });
    const edits = project.notifications.filter((item) => item.userId === 'u2' && item.kind === 'page').length;
    updatePage(ws, page.id, { body: 'Changed again' }, 'u1');
    assert.equal(project.notifications.filter((item) => item.userId === 'u2' && item.kind === 'page').length, edits);
    commentPage(ws, page.id, 'A note', 'u1');
    assert.ok(project.notifications.some((item) => item.userId === 'u2' && item.kind === 'page-comment'));
    const doc = createDocument(ws, { templateId: 'meeting', title: 'Notes', projectId: project.id }, 'u1');
    setNotice(ws, outsider.id, 'document', doc.id, { edit: true });
    updateDocument(ws, doc.id, { body: 'Decisions' }, 'u1');
    assert.ok(project.notifications.some((item) => item.userId === outsider.id && item.kind === 'document' && item.issueKey === 'Notes'));
    setLanguage('en');
    const view = renderView({
      ws, project, user: ws.users[0], desktop: false, version: '1.0.0', now: NOW,
      settings: { language: 'en', fontSize: 13 },
      ui: { view: 'notifications', query: '', modal: null },
    });
    assert.match(view, /Notification settings/);
    assert.match(view, /data-notice="project"/);
    assert.match(view, /data-notice="page"/);
    assert.match(view, /data-event="watch"/);
    assert.match(view, /결제 안내/);
  });

  test('a work log reduces the remaining estimate', () => {
    const { ws, project, me } = shop();
    const issue = createIssue(ws, project.id, { summary: 'Hours', originalEstimate: 120, remainingEstimate: 120 }, me);
    addWorklog(ws, project.id, issue.id, { minutes: 30, comment: 'start' }, me);
    assert.equal(issue.timeSpent, 30);
    assert.equal(issue.remainingEstimate, 90);
  });

  test('reads hours, days, and Korean units as minutes', () => {
    assert.equal(parseDuration('90'), 90);
    assert.equal(parseDuration('1h 30m'), 90);
    assert.equal(parseDuration('1.5h'), 90);
    assert.equal(parseDuration('2d'), 960);
    assert.equal(parseDuration('1시간 30분'), 90);
  });

  test('rejects a link to the same issue and stores both directions', () => {
    const { ws, project, me } = shop();
    const left = createIssue(ws, project.id, { summary: 'Left' }, me);
    const right = createIssue(ws, project.id, { summary: 'Right' }, me);
    assert.throws(() => addLink(ws, project.id, left.id, 'relates', left.key, me), /self-link/);
    addLink(ws, project.id, left.id, 'blocks', right.key, me);
    assert.equal(right.links[0].direction, 'in');
    assert.equal(left.links[0].direction, 'out');
  });

  test('rejects an attachment over 700KB and toggles a watcher', () => {
    const { ws, project, me } = shop();
    const issue = createIssue(ws, project.id, { summary: 'File' }, me);
    assert.throws(() => addAttachment(ws, project.id, issue.id, { name: 'big.bin', size: 800_000, data: 'x' }, me), /attachment-big/);
    const before = issue.watchers.includes(me);
    toggleWatch(ws, project.id, issue.id, me);
    assert.notEqual(issue.watchers.includes(me), before);
  });
});

describe('Sprints', () => {
  test('refuses a sprint whose end is before its start', () => {
    const { ws, project, me } = shop();
    assert.throws(() => createSprint(ws, project.id, { name: 'Bad', start: '2026-12-02', end: '2026-12-01' }, me), /sprint-dates/);
  });

  test('starts one sprint and refuses a second active sprint on the same board', () => {
    const { ws, project, me } = shop();
    const boardId = project.boards.find((board) => board.type === 'scrum').id;
    const first = project.sprints[0];
    startSprint(ws, project.id, first.id, me);
    const second = createSprint(ws, project.id, { name: 'Next', start: '2026-12-01', end: '2026-12-14', boardId }, me);
    assert.throws(() => startSprint(ws, project.id, second.id, me), /sprint-active/);
  });

  test('sends unfinished to-do issues back to the backlog', () => {
    const { ws, project, me } = shop();
    const sprint = project.sprints[0];
    startSprint(ws, project.id, sprint.id, me);
    const issue = createIssue(ws, project.id, { summary: 'Open', sprintId: sprint.id, statusId: 'todo' }, me);
    completeSprint(ws, project.id, sprint.id, 'backlog', me);
    assert.equal(issue.sprintId, '');
    assert.equal(issue.statusId, 'backlog');
    assert.equal(sprint.state, 'closed');
  });

  test('moves unfinished issues into the next sprint', () => {
    const { ws, project, me } = shop();
    const boardId = project.boards.find((board) => board.type === 'scrum').id;
    const active = project.sprints[0];
    startSprint(ws, project.id, active.id, me);
    const next = createSprint(ws, project.id, { name: 'Next', start: '2026-12-01', end: '2026-12-14', boardId }, me);
    const issue = createIssue(ws, project.id, { summary: 'Carry', sprintId: active.id, statusId: 'progress' }, me);
    completeSprint(ws, project.id, active.id, next.id, me);
    assert.equal(issue.sprintId, next.id);
    assert.equal(issue.statusId, 'progress');
  });
});

describe('Planning', () => {
  test('releases and unreleases a version', () => {
    const { ws, project, me } = shop();
    const version = addVersion(ws, project.id, { name: '1.0', description: 'First' }, me);
    releaseVersion(ws, project.id, version.id, true, me);
    assert.equal(version.released, true);
    assert.ok(version.releaseDate);
    releaseVersion(ws, project.id, version.id, false, me);
    assert.equal(version.released, false);
  });

  test('saves and deletes a group membership', () => {
    const { ws, project, me } = shop();
    const user = person(ws, 'Sam', 'sam@example.com', 'developer', project);
    const group = addGroup(ws, 'Developers', me, project.id);
    toggleGroupUser(ws, group.id, user.id);
    assert.deepEqual(group.userIds, [user.id]);
    toggleGroupUser(ws, group.id, user.id);
    assert.deepEqual(group.userIds, []);
  });

  test('saves the current query as a filter', () => {
    const { ws, project, me } = shop();
    const filter = saveFilter(ws, project.id, { name: 'Open bugs', query: 'type = bug AND status != done' }, me);
    assert.equal(project.filters.some((item) => item.id === filter.id), true);
  });

  test('adds and removes a dashboard gadget', () => {
    const { project } = shop();
    const before = project.dashboard.length;
    addGadget(project, 'activity');
    assert.equal(project.dashboard.length, before + 1);
    removeGadget(project, project.dashboard.at(-1).id);
    assert.equal(project.dashboard.length, before);
  });
});

describe('Automation', () => {
  test('assigns a bug when a create rule says so', () => {
    const { ws, project, me } = shop();
    const dev = person(ws, 'Dev', 'dev2@example.com', 'developer', project);
    addRule(ws, project.id, { name: 'Route bugs', when: 'created', typeId: 'bug', then: 'assign', userId: dev.id }, me);
    const bug = createIssue(ws, project.id, { typeId: 'bug', summary: 'Crash' }, me);
    const story = createIssue(ws, project.id, { typeId: 'story', summary: 'Page' }, me);
    assert.equal(bug.assigneeId, dev.id);
    assert.notEqual(story.assigneeId, dev.id);
  });

  test('adds a label when work moves to done', () => {
    const { ws, project, me } = shop();
    addRule(ws, project.id, { name: 'Tag done', when: 'transition', statusId: 'done', then: 'label', label: 'shipped' }, me);
    const issue = createIssue(ws, project.id, { summary: 'Finish', statusId: 'todo' }, me);
    updateIssue(ws, project.id, issue.id, { statusId: 'done' }, me);
    assert.ok(issue.labels.includes('shipped'));
  });
});

describe('Query language', () => {
  test('matches Korean field names, lists, and exclusion', () => {
    const ws = sampleWorkspace(NOW);
    const project = ws.projects.find((item) => item.key === 'SHOP');
    const bugs = runQuery(ws, project, '유형 = 결함 AND 상태 != done', { now: NOW });
    assert.ok(bugs.issues.every((issue) => issue.typeId === 'bug' && issue.statusId !== 'done'));
    const high = runQuery(ws, project, 'priority >= 높음', { now: NOW });
    assert.ok(high.issues.every((issue) => ['high', 'highest'].includes(issue.priorityId)));
    const open = runQuery(ws, project, 'assignee is not empty', { now: NOW });
    assert.ok(open.issues.every((issue) => issue.assigneeId));
  });

  test('orders by key and rejects a broken query', () => {
    const ws = sampleWorkspace(NOW);
    const project = ws.projects.find((item) => item.key === 'SHOP');
    const keys = runQuery(ws, project, 'ORDER BY key ASC', { now: NOW }).issues.map((issue) => issue.key);
    assert.equal(keys[0], 'SHOP-1');
    assert.ok(keys.indexOf('SHOP-2') < keys.indexOf('SHOP-10'));
    assert.equal(runQuery(ws, project, 'type = =').error, 'query');
  });

  test('currentUser and openSprints follow the active sprint', () => {
    const ws = sampleWorkspace(NOW);
    const project = ws.projects.find((item) => item.key === 'SHOP');
    const mine = runQuery(ws, project, 'assignee = currentUser()', { now: NOW });
    assert.ok(mine.issues.every((issue) => issue.assigneeId === 'u1'));
    const sprint = runQuery(ws, project, 'sprint = openSprints()', { now: NOW });
    assert.ok(sprint.issues.every((issue) => issue.sprintId === 's3'));
  });
});

describe('Reports', () => {
  test('builds a 14-day flow and an 8-week created chart', () => {
    const ws = sampleWorkspace(NOW);
    const project = ws.projects.find((item) => item.key === 'SHOP');
    assert.equal(cumulativeFlow(project, NOW).length, 14);
    assert.equal(createdResolved(project, NOW).length, 8);
  });

  test('groups a pie and sums logged time', () => {
    const ws = sampleWorkspace(NOW);
    const project = ws.projects.find((item) => item.key === 'SHOP');
    const slices = pie(project, project.issues, 'type');
    assert.ok(slices.some((slice) => slice.id === 'bug' && slice.value >= 1));
    const time = timeReport(project, project.issues);
    assert.ok(time.some((row) => row.userId === 'u2' && row.spent >= 90));
  });

  test('reports sprint points without counting sub-tasks twice', () => {
    const ws = sampleWorkspace(NOW);
    const project = ws.projects.find((item) => item.key === 'SHOP');
    const report = sprintReport(project, project.sprints.find((item) => item.id === 's3'));
    assert.equal(report.pointsTotal, 28);
    assert.equal(report.pointsDone, 5);
  });

  test('flags an unassigned sprint issue, a breached limit, and a blocked issue', () => {
    const ws = sampleWorkspace(NOW);
    const shopProject = ws.projects.find((item) => item.key === 'SHOP');
    const support = ws.projects.find((item) => item.key === 'SUP');
    const shopCodes = inspect(shopProject, NOW).map((item) => item.code);
    assert.ok(shopCodes.includes('unassigned-sprint'));
    assert.ok(shopCodes.includes('blocked'));
    assert.ok(inspect(support, NOW).some((item) => item.code === 'sla-breached'));
  });
});

describe('Markdown', () => {
  test('renders headings, lists, and tables', () => {
    const html = renderMarkdown('# Title\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    assert.match(html, /<h1>Title<\/h1>/);
    assert.match(html, /<li>one<\/li>/);
    assert.match(html, /<table>/);
  });

  test('keeps http links and drops other links', () => {
    const html = renderMarkdown('[ok](https://example.com) [no](javascript:alert(1))');
    assert.match(html, /href="https:\/\/example.com"/);
    assert.match(html, /data-external="https:\/\/example.com"/);
    assert.equal(html.includes('javascript:'), false);
  });

  test('shows an attached image and a file link that can be downloaded', () => {
    const files = [
      { id: 'pic', name: 'shot.png', mime: 'image/png', data: 'data:image/png;base64,abcd' },
      { id: 'note', name: 'note.txt', mime: 'text/plain', data: 'data:text/plain,hi' },
    ];
    const html = renderMarkdown('![shot.png](attachment:pic)\n\n[note.txt](attachment:note)\n\n![no](javascript:alert(1))', files);
    assert.match(html, /<img class="md-image" src="data:image\/png;base64,abcd"/);
    assert.match(html, /data-file="pic"/);
    assert.match(html, /class="file-link"[^>]*data-file="note"/);
    assert.match(html, /download="note.txt"/);
    assert.equal(html.includes('javascript:'), false);
    const exported = writingExport('결제 안내', '![shot.png](attachment:pic)', files);
    assert.match(exported.html, /<img /);
    assert.match(exported.markdown, /data:image\/png;base64,abcd/);
    assert.match(exported.filename, /결제/);
  });

  test('escapes raw markup', () => {
    assert.equal(renderMarkdown('<script>alert(1)</script>').includes('<script'), false);
  });

  test('puts a picture beside every guide and query section', () => {
    const pictured = (file, kind) => illustrate(renderMarkdown(fs.readFileSync(file, 'utf8')), kind);
    for (const file of ['UsersGuide.md', 'UsersGuide.en.md']) {
      const html = pictured(file, 'guide');
      const sections = (html.match(/<h2>/g) || []).length + 1;
      assert.equal((html.match(/<svg /g) || []).length, sections, file);
      assert.match(html, /doc-figure/);
    }
    for (const file of ['docs/WQL.md', 'docs/WQL.en.md']) {
      const html = pictured(file, 'wql');
      const sections = (html.match(/<h2>/g) || []).length + 1;
      assert.equal((html.match(/<svg /g) || []).length, sections, file);
    }
  });
});

describe('Export', () => {
  test('writes a spreadsheet file with a header and quoted commas', () => {
    const { ws, project, me } = shop();
    const issue = createIssue(ws, project.id, { summary: 'Hello, world' }, me);
    const csv = toCsv(ws, project, [issue], 'en');
    assert.ok(csv.startsWith('\uFEFFKey,'));
    assert.match(csv, /"Hello, world"/);
  });

  test('writes a markdown table of issues', () => {
    const { ws, project, me } = shop();
    const issue = createIssue(ws, project.id, { summary: 'Row' }, me);
    const text = toMarkdown(ws, project, [issue], 'en');
    assert.match(text, /\| Key \|/);
    assert.match(text, new RegExp(issue.key));
  });
});

describe('Documents', () => {
  test('round-trips a workspace file', () => {
    const { ws } = shop();
    const doc = readDocument(workspaceDocument(ws));
    assert.equal(doc.mode, 'workspace');
    assert.equal(doc.workspace.projects[0].key, 'SHOP');
  });

  test('round-trips one project and merges it into another workspace', () => {
    const { ws, project } = shop();
    const packed = projectDocument(ws, project.id);
    const doc = readDocument(packed);
    assert.equal(doc.mode, 'project');
    const other = blankWorkspace();
    mergeProject(other, structuredClone(doc.project), doc.users, doc.groups);
    assert.equal(other.projects[0].key, 'SHOP');
  });

  test('rejects a file that is not a workspace', () => {
    assert.throws(() => readDocument({}), /file-invalid/);
    assert.throws(() => readDocument({ format: 'myworkforce', kind: 'project' }), /file-invalid/);
  });
});

describe('Themes', () => {
  test('ships 20 light themes and 20 dark themes', () => {
    assert.equal(LIGHT_THEMES.length, 20);
    assert.equal(DARK_THEMES.length, 20);
  });

  test('follows the system appearance', () => {
    assert.equal(resolveTheme('system', true).dark, true);
    assert.equal(resolveTheme('system', false).dark, false);
  });

  test('builds a custom palette from the current theme', () => {
    const custom = customFrom(resolveTheme('light', false, null));
    assert.match(custom.accent, /^#[0-9a-f]{6}$/i);
    assert.equal(resolveTheme('custom', false, custom).id, 'custom');
  });

  test('defaults to Korean and a 13px font', () => {
    assert.equal(DEFAULTS.language, 'ko');
    assert.equal(DEFAULTS.fontSize, 13);
    assert.equal(PANEL_MIN, 280);
    assert.equal(DEFAULTS.leftWidth, PANEL_MIN);
    assert.equal(DEFAULTS.rightWidth, PANEL_MIN);
    assert.equal(PROJECT_TYPES.length, 3);
  });
});

describe('Language', () => {
  test('switches every label between Korean and English', () => {
    setLanguage('en');
    assert.equal(L('홈', 'Home'), 'Home');
    setLanguage('ko');
    assert.equal(L('홈', 'Home'), '홈');
  });
});

describe('Screens', () => {
  function context(view) {
    setLanguage('en');
    const ws = sampleWorkspace(NOW);
    const project = ws.projects.find((item) => item.key === (view === 'queues' ? 'SUP' : 'SHOP'));
    ws.activeProjectId = project.id;
    const ui = {
      view, boardId: 'board-scrum', issueId: 'i9', query: 'type = bug', quick: '', sort: null, selected: [],
      epicId: '', queueId: project.queues[0]?.id || '', report: 'burndown', help: 'guide', modal: null,
      menu: null, popover: null, issueTab: 'details', preview: false, maximized: false, dirty: false, path: null,
    };
    return {
      ws, project, ui, user: ws.users[0], desktop: false, version: '1.0.0', now: NOW,
      settings: { language: 'en', fontSize: 13, recent: [], customTheme: null, theme: 'light' },
      guide: '# Guide\n\nUse the boards.',
    };
  }

  const screens = [
    ['home', 'MyWorkForce'],
    ['board', 'Scrum board'],
    ['backlog', 'Backlog'],
    ['roadmap', 'Roadmap'],
    ['issues', 'Issues'],
    ['dashboard', 'Dashboard'],
    ['reports', 'Burndown'],
    ['releases', 'Releases'],
    ['components', 'Components'],
    ['filters', 'Filters'],
    ['people', 'People'],
    ['health', 'Health'],
    ['notifications', 'Notifications'],
    ['settings', 'Server database'],
    ['queues', 'Queues'],
    ['help', 'Guide'],
    ['issue', '카드 결제'],
    ['knowledge', 'Knowledge'],
    ['documents', 'Documents'],
    ['calendar', 'Work calendar'],
    ['portal', 'Customer portal'],
    ['plans', 'Cross-project plan'],
    ['extensions', 'Extensions'],
  ];

  const glyphs = {
    home: 'home', board: 'board', backlog: 'backlog', roadmap: 'roadmap', issues: 'issues', queues: 'list',
    dashboard: 'dashboard', reports: 'chart', releases: 'release', components: 'component', filters: 'filter',
    people: 'people', health: 'alert', notifications: 'bell', settings: 'settings', help: 'help',
    knowledge: 'box', documents: 'file', calendar: 'calendar', portal: 'request', plans: 'roadmap', extensions: 'bolt',
  };

  test('the tutorial window asks to start and whether to show again', () => {
    const ctx = context('home');
    ctx.ui.modal = { kind: 'welcome' };
    ctx.settings.showWelcome = true;
    const html = renderModal(ctx);
    assert.match(html, /data-setting="showWelcome"/);
    assert.match(html, /data-action="start-tutorial"/);
    assert.match(html, /data-action="open-guide" data-id="guide"/);
    assert.match(html, /data-action="open-guide" data-id="tutorial"/);
    assert.match(html, /without signing in/);
    ctx.ui.modal = { kind: 'login', next: 'tutorial' };
    const gate = renderModal(ctx);
    assert.match(gate, /Sign in as a registered user to run the tutorial/);
    assert.match(gate, /id="dialog-account"/);
    assert.match(gate, /id="dialog-password"/);
    assert.doesNotMatch(gate, /pick-login/);
    ctx.ui.modal = { kind: 'login', next: 'gate' };
    const locked = renderModal(ctx);
    assert.match(locked, /Sign in to use the rest/);
    assert.match(locked, /data-action="open-guide" data-id="guide"/);
    assert.match(locked, /data-action="open-guide" data-id="tutorial"/);
    assert.doesNotMatch(locked, /data-action="modal-cancel"/);
    assert.match(html, /Show this window again at start/);
    assert.match(html, /Later/);
  });

  test('the settings page configures the start page and its background', () => {
    const html = renderView(context('settings'));
    assert.match(html, /Show the start page when the program opens/);
    assert.match(html, /data-setting="startShowBackground"/);
    assert.match(html, /data-setting="showWelcome"/);
    assert.match(html, /Show this window again at start/);
    assert.match(html, /data-action="start-screen"/);
    assert.match(html, /data-bg="kind"/);
    assert.match(html, /data-bg="speed"/);
    assert.match(html, /data-bg="interval"/);
    assert.match(html, /data-mail="host"/);
    assert.match(html, /data-mail="security"/);
    assert.match(html, /smtp\.example\.com/);
    assert.match(html, /outside this company/);
    assert.match(html, /data-action="mail-test"/);
    assert.match(html, /Every project in this company is kept in this store/);
    assert.doesNotMatch(html, /data-project="name"/);
    assert.doesNotMatch(renderView(context('project-settings')), /id="server-form"/);
    assert.match(html, /data-setting="launchAtStartup"/);
    assert.match(html, /data-setting="autoLogin"/);
    assert.match(html, /Start MyWorkForce and Talk when the system starts/);
    assert.match(html, /Sign in when the program opens/);
    assert.doesNotMatch(html, /data-setting="launchAtStartup" checked/);
    assert.doesNotMatch(html, /data-setting="autoLogin" checked/);
    const starttls = describeMail({ host: 'smtp.example.com', port: 587, security: 'starttls' });
    assert.equal(starttls.secure, false);
    assert.equal(starttls.requireTLS, true);
    const ssl = describeMail({ host: 'smtp.example.com', port: 465, security: 'ssl' });
    assert.equal(ssl.secure, true);
    assert.equal(ssl.requireTLS, false);
    assert.equal(describeMail({ host: 'smtp.example.com', secure: true }).security, 'ssl');
    const notes = renderView(context('notifications'));
    assert.match(notes, /data-notice="project"/);
    assert.match(notes, /Issues I watch/);
    assert.match(notes, /data-notice="page"/);
    assert.equal((html.match(/<option value="(?:board|sprint|backlog|roadmap|calendar|pages|notes|queue|flow|links|people|hours|checks|milestones|lanes|priority|comments|archive|burndown|focus|pulse)"/g) || []).length, 21);
  });

  for (const [view, needle] of screens) {
    test(`renders the ${view} screen`, () => {
      const ctx = context(view);
      const html = renderView(ctx);
      assert.match(html, new RegExp(needle));
      if (glyphs[view]) assert.match(html, new RegExp(`data-icon="${glyphs[view]}"`));
    });
  }

  test('centers create and open actions when there is no project', () => {
    const ctx = context('home');
    ctx.ws = { ...ctx.ws, projects: [], activeProjectId: '' };
    ctx.project = null;
    const html = renderView(ctx);
    assert.match(html, /center-empty/);
    assert.match(html, /과제를 생성하거나 여세요|Create or open a project/);
    assert.match(html, /data-action="new-project"/);
    assert.match(html, /data-action="open-file"/);
    assert.match(html, /data-action="browse-examples"/);
    assert.match(html, /data-id="guide"/);
  });

  test('shows the property panel beside an issue and hides it on the home screen', () => {
    const issue = context('issue');
    const home = context('home');
    assert.equal(showRight(issue), true);
    assert.match(renderRight(issue), /Details/);
    assert.equal(showRight(home), false);
  });

  test('renders the menu bar, toolbar, and new-project dialog', () => {
    const ctx = context('board');
    const menu = renderMenubar(ctx);
    for (const label of ['Start', 'File', 'Edit', 'View', 'Issue', 'Plan', 'Help']) assert.match(menu, new RegExp(label));
    assert.match(menu, /data-tone="orange"/);
    assert.ok(menu.indexOf('app-brand-version') < menu.indexOf('menubar-home'));
    assert.ok(menu.indexOf('menubar-home') < menu.indexOf('data-menu="file"'));
    assert.ok(menu.indexOf('data-menu="help"') < menu.indexOf('app-brand-project'));
    const toolbar = renderToolbar(ctx);
    assert.match(toolbar, /Search or WQL/);
    assert.match(toolbar, /data-action="theme-random"/);
    assert.match(toolbar, /data-action="theme-menu"/);
    assert.match(toolbar, /data-action="about"/);
    assert.match(toolbar, /data-action="open-talk"/);
    assert.match(menu, /data-action="open-talk"/);
    assert.match(toolbar, /data-icon="info"/);
    assert.match(toolbar, /data-action="toggle-panel" data-id="left"/);
    assert.match(toolbar, /data-action="toggle-panel" data-id="right"/);
    assert.match(toolbar, /data-icon="panelLeft"/);
    assert.match(toolbar, /data-icon="panelRight"/);
    assert.ok(toolbar.indexOf('data-action="theme-menu"') < toolbar.indexOf('data-action="about"'));
    const nav = renderNav(ctx);
    assert.match(nav, /panel-header/);
    assert.match(nav, /data-icon="list"/);
    assert.match(nav, /data-icon="foldLeft"/);
    assert.match(nav, /Work/);
    assert.match(nav, /Review/);
    assert.match(nav, /Project home/);
    assert.match(menu, /menubar-home[\s\S]*?>Start</);
    assert.match(menu, /data-action="menubar-home"[^>]*disabled/);
    ctx.ui.loginUser = 'u1';
    assert.doesNotMatch(renderMenubar(ctx), /data-action="menubar-home"[^>]*disabled/);
    assert.match(menu, /data-action="open-current-project"/);
    assert.match(menu, /Ctrl\+Shift\+N/);
    assert.match(menu, /Ctrl\+2/);
    assert.match(menu, /Ctrl\+F/);
    ctx.ui.modal = { kind: 'shortcuts' };
    const shortcuts = renderModal(ctx);
    for (const key of ['Ctrl+1', 'Ctrl+Shift+H', 'G H', 'Delete', 'F1']) {
      assert.match(shortcuts, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.doesNotMatch(menu, /data-action="open-login"/);
    const login = loginForm(ctx);
    assert.match(login, /id="login-account"/);
    assert.match(login, /id="login-password"/);
    assert.match(login, /data-reveal="password"/);
    assert.match(login, /Show password/);
    assert.match(login, /Login ID/);
    assert.match(login, /admin \/ admin/);
    assert.doesNotMatch(login, /pick-login/);
    assert.match(nav, /User menu/);
    assert.match(nav, /data-view="projects"/);
    const ownProjects = renderView({ ...ctx, ui: { ...ctx.ui, view: 'projects' } });
    assert.match(ownProjects, /data-action="new-project"/);
    assert.match(ownProjects, /data-action="project-participants"/);
    assert.match(ownProjects, /data-managed="name"/);
    assert.match(ownProjects, /data-action="open-project-settings"/);
    assert.match(ownProjects, /data-parent=/);
    assert.match(ownProjects, /Sub-project/);
    assert.match(nav, /data-view="project-settings"/);
    const leadSettings = renderView({ ...ctx, ui: { ...ctx.ui, view: 'project-settings' } });
    assert.match(leadSettings, /Project settings/);
    assert.match(leadSettings, /data-project="description"/);
    assert.match(leadSettings, /Add status/);
    const developer = { ...ctx, user: ctx.ws.users.find((user) => user.id === 'u2') };
    assert.doesNotMatch(renderView({ ...developer, ui: { ...ctx.ui, view: 'projects' } }), /data-managed="name"/);
    assert.doesNotMatch(renderNav(developer), /data-view="project-settings"/);
    assert.match(renderView({ ...developer, ui: { ...ctx.ui, view: 'project-settings' } }), /You do not have permission/);
    const manager = { ...ctx, user: ctx.ws.users.find((user) => user.id === 'u3') };
    const shop = manager.ws.projects.find((item) => item.key === 'SHOP');
    shop.members = shop.members.map((member) => (member.userId === 'u3' ? { ...member, role: 'administrator' } : member));
    assert.match(renderView({ ...manager, ui: { ...ctx.ui, view: 'project-settings' } }), /data-project="name"/);
    ctx.ui.modal = { kind: 'participants', projectId: ctx.project.id, query: '' };
    const participants = renderModal(ctx);
    assert.match(participants, /Read only/);
    assert.match(participants, /Can edit/);
    assert.match(participants, /Team/);
    assert.match(participants, /Other people/);
    assert.match(participants, /id="participant-search"/);
    assert.match(participants, /data-participant-search/);
    assert.doesNotMatch(ownProjects, /Sign in with the administrator/);
    assert.doesNotMatch(nav, /Administrator menu/);
    assert.doesNotMatch(nav, /data-view="people"/);
    assert.doesNotMatch(nav, /data-view="settings"/);
    assert.doesNotMatch(menu, /data-menu="admin"/);
    assert.doesNotMatch(menu, /data-view="people"/);
    const admin = context('home');
    admin.user = { ...admin.user, login: 'admin', active: true };
    admin.ui.ready = true;
    const managed = renderNav(admin);
    assert.match(managed, /User menu/);
    assert.match(managed, /Administrator menu/);
    assert.match(managed, /data-view="users"/);
    assert.match(managed, /data-view="projects"/);
    const adminMenu = renderMenubar(admin);
    assert.match(adminMenu, /data-menu="admin"/);
    assert.match(adminMenu, />Administrator</);
    assert.ok(adminMenu.indexOf('data-menu="help"') < adminMenu.indexOf('data-menu="admin"'));
    assert.match(adminMenu, /data-view="extensions"/);
    assert.match(renderView({ ...admin, ui: { ...admin.ui, view: 'users' } }), /data-action="new-user"/);
    assert.match(renderView({ ...admin, ui: { ...admin.ui, view: 'projects' } }), /data-managed="name"/);
    assert.match(renderView({ ...admin, ui: { ...admin.ui, view: 'projects' } }), /data-action="new-project"/);
    assert.match(nav, /My projects/);
    assert.match(nav, /data-action="activate" data-id="p-shop"/);
    assert.match(nav, /data-action="activate" data-id="p-sup"/);
    const devNav = renderNav(developer);
    assert.match(devNav, /data-action="activate" data-id="p-shop"/);
    assert.doesNotMatch(devNav, /data-action="activate" data-id="p-sup"/);
    const child = newProject(ctx.ws, { name: 'Payments', key: 'PAY', type: 'software', leadId: 'u2', parentId: 'p-shop' }, 'u1');
    assert.match(renderNav(developer), new RegExp(`data-action="activate" data-id="${child.id}"`));
    const outsider = addUser(ctx.ws, { name: 'Outside', email: 'out@example.com' });
    const outside = renderNav({ ...ctx, user: outsider });
    assert.doesNotMatch(outside, /data-action="activate"/);
    assert.match(outside, /You are not in a project yet/);
    ctx.settings.showLeftPanel = false;
    assert.match(renderNav(ctx), /data-icon="foldRight"/);
    const side = renderRight(ctx);
    assert.match(side, /panel-header/);
    assert.match(side, /data-id="right"/);
    ctx.ui.popover = 'theme';
    const picker = renderToolbar(ctx);
    assert.match(picker, /Custom theme settings/);
    assert.match(picker, /data-id="custom"/);
    assert.match(picker, /data-tone=/);
    ctx.ui.modal = { kind: 'project' };
    const dialog = renderModal(ctx);
    assert.match(dialog, /New project/);
    assert.match(dialog, /Parent project/);
    assert.match(dialog, /data-icon="folder"/);
    assert.match(dialog, /data-icon="close"/);
    assert.match(dialog, /popup-close/);
    assert.match(dialog, /data-tone=/);
    ctx.ui.modal = { kind: 'about' };
    ctx.ui.about = { version: '1.0.0', commit: 'abc', buildDate: '2026-01-02T03:04:00.000Z', os: 'Windows', arch: 'x64', target: 'web', profile: 'development', web: true, rustc: '-', tauri: '-' };
    const about = renderModal(ctx);
    assert.match(about, /about-table/);
    assert.match(about, /about-description/);
    assert.match(about, /knix008@naver.com/);
    assert.match(about, /data-action="copy-about"/);
    assert.match(about, /PostgreSQL/);
  });
});

describe('Shortcuts', () => {
  function press(key, extra = {}, now = 0) {
    return takeShortcut({
      key,
      code: extra.code || '',
      ctrlKey: Boolean(extra.ctrl),
      metaKey: Boolean(extra.meta),
      altKey: false,
      shiftKey: Boolean(extra.shift),
      target: { id: extra.id || '', matches: () => Boolean(extra.typing) },
    }, now);
  }

  test('maps file, view, and issue keys', () => {
    assert.equal(press('s', { ctrl: true }).id, 'save-file');
    assert.equal(press('S', { ctrl: true, shift: true }).id, 'save-as');
    assert.equal(press('1', { ctrl: true, code: 'Digit1' }).view, 'home');
    assert.equal(press('!', { ctrl: true, shift: true, code: 'Digit1' }).panel, 'left');
    assert.equal(press('k', { ctrl: true, meta: true }).id, 'command-palette');
    assert.equal(press('F1').id, 'open-guide');
    assert.equal(press('c').id, 'new-issue');
    assert.equal(press('c', { typing: true }), null);
    assert.equal(press('s', { ctrl: true, typing: true }).id, 'save-file');
    assert.equal(press('Enter', { id: 'comment-body', ctrl: true, typing: true }).id, 'add-comment');
    assert.equal(press('g', {}, 1000).id, 'wait');
    assert.equal(press('b', {}, 1500).view, 'board');
  });
});

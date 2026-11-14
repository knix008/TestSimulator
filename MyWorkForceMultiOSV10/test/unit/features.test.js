import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TYPES, PROJECT_TYPES } from '../../src/domain/catalog.js';
import { toCsv, toMarkdown } from '../../src/domain/export.js';
import { setLanguage, L } from '../../src/i18n.js';
import { renderMarkdown } from '../../src/domain/markdown.js';
import { allowed } from '../../src/domain/permissions.js';
import { runQuery } from '../../src/domain/query.js';
import { createdResolved, cumulativeFlow, inspect, pie, sprintReport, timeReport } from '../../src/domain/reports.js';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { DEFAULTS } from '../../src/domain/settings.js';
import {
  addAttachment, addComment, addField, addGadget, addGroup, addLink, addRule, addStatus, addTransition, addUser, addVersion,
  addWorklog, blankWorkspace, cloneIssue, completeSprint, createIssue, createSprint, deleteIssue, mergeProject,
  newProject, projectDocument, rankIssues, readDocument, releaseVersion, removeGadget, removeStatus, saveFilter,
  setArchived, setCustomField, setMember, setUserActive, startSprint, toggleGroupUser, toggleWatch, updateIssue,
  updateProject, workspaceDocument,
} from '../../src/domain/store.js';
import { parseDuration } from '../../src/domain/util.js';
import { DARK_THEMES, LIGHT_THEMES, customFrom, resolveTheme } from '../../src/themes.js';
import { renderMenubar, renderModal, renderToolbar } from '../../src/ui/chrome.js';
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
    assert.equal(html.includes('javascript:'), false);
  });

  test('escapes raw markup', () => {
    assert.equal(renderMarkdown('<script>alert(1)</script>').includes('<script'), false);
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
    ['settings', 'Workflow'],
    ['queues', 'Queues'],
    ['help', 'Guide'],
    ['issue', '카드 결제'],
  ];

  for (const [view, needle] of screens) {
    test(`renders the ${view} screen`, () => {
      const ctx = context(view);
      assert.match(renderView(ctx), new RegExp(needle));
    });
  }

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
    for (const label of ['File', 'Edit', 'View', 'Issue', 'Plan', 'Help']) assert.match(menu, new RegExp(label));
    assert.match(renderToolbar(ctx), /Search or WQL/);
    ctx.ui.modal = { kind: 'project' };
    assert.match(renderModal(ctx), /New project/);
  });
});

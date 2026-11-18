import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { inboxOf, markInboxRead } from '../../src/domain/notices.js';
import { blankWorkspace } from '../../src/domain/store.js';
import { addPage, addSpace, commentPage, mentionsIn, updatePage, watchPage } from '../../src/domain/wiki.js';

function people() {
  const ws = blankWorkspace();
  const me = ws.users[0].id;
  ws.users.push({ id: 'u-kim', name: 'Kim', active: true }, { id: 'u-kimann', name: 'Kim Ann', active: true }, { id: 'u-lee', name: 'Lee', active: true });
  const space = addSpace(ws, { name: 'Company notes' }, me);
  return { ws, me, space };
}

describe('Mentions on pages', () => {
  test('finds @names, preferring the longer name', () => {
    const { ws } = people();
    assert.deepEqual(mentionsIn(ws, 'Hello @Kim Ann and @Lee').sort(), ['u-kimann', 'u-lee']);
    assert.deepEqual(mentionsIn(ws, 'mail kim@example.com'), []);
    assert.deepEqual(mentionsIn(ws, 'no one'), []);
  });

  test('a comment mention lands in the company inbox and can be read', () => {
    const { ws, me, space } = people();
    const page = addPage(ws, { spaceId: space.id, title: 'Plan' }, me);
    commentPage(ws, page.id, 'Please check, @Lee', me);
    const notes = inboxOf(ws, 'u-lee');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].kind, 'mention');
    assert.equal(notes[0].where, 'comment');
    assert.equal(notes[0].pageId, page.id);
    markInboxRead(ws, 'u-lee', notes[0].id);
    assert.equal(inboxOf(ws, 'u-lee')[0].read, true);
  });

  test('a page edit tells only newly mentioned people, and never the writer', () => {
    const { ws, me, space } = people();
    const page = addPage(ws, { spaceId: space.id, title: 'Spec', body: 'Owner: @Kim' }, me);
    updatePage(ws, page.id, { body: 'Owner: @Kim, reviewer: @Lee' }, me);
    assert.equal(inboxOf(ws, 'u-lee').filter((item) => item.kind === 'mention').length, 1);
    assert.equal(inboxOf(ws, 'u-kim').filter((item) => item.kind === 'mention').length, 0);
    updatePage(ws, page.id, { body: 'Owner: @Kim, reviewer: @Lee. Done.' }, me);
    assert.equal(inboxOf(ws, 'u-lee').filter((item) => item.kind === 'mention').length, 1);
    assert.equal(inboxOf(ws, me).length, 0);
  });

  test('a restricted page tells no one who cannot read it', () => {
    const { ws, me, space } = people();
    const page = addPage(ws, { spaceId: space.id, title: 'Secret' }, me);
    updatePage(ws, page.id, { restricted: true }, me);
    commentPage(ws, page.id, '@Lee look', me);
    assert.equal(inboxOf(ws, 'u-lee').length, 0);
  });

  test('watchers of a company page hear about edits in the inbox', () => {
    const { ws, me, space } = people();
    const page = addPage(ws, { spaceId: space.id, title: 'Rules' }, me);
    watchPage(ws, page.id, 'u-lee');
    updatePage(ws, page.id, { body: 'New rule' }, me);
    assert.equal(inboxOf(ws, 'u-lee').filter((item) => item.kind === 'page').length, 1);
  });
});

describe('Page differences', async () => {
  const { diffLines, diffStats, merge3 } = await import('../../src/domain/diff.js');

  test('lists kept, removed and added lines in order', () => {
    const parts = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne');
    assert.deepEqual(parts.map((part) => `${part.type[0]}${part.text}`), ['sa', 'db', 'aB', 'sc', 'sd', 'ae']);
    assert.deepEqual(diffStats(parts), { added: 2, removed: 1 });
    assert.deepEqual(diffLines('', 'x'), [{ type: 'add', text: 'x' }]);
    assert.deepEqual(diffLines('same', 'same'), [{ type: 'same', text: 'same' }]);
  });

  test('merges two people changing different lines', () => {
    const base = 'title\none\ntwo\nthree';
    const merged = merge3(base, 'title\nONE\ntwo\nthree', 'title\none\ntwo\nTHREE\nfour');
    assert.equal(merged.text, 'title\nONE\ntwo\nTHREE\nfour');
    assert.equal(merged.conflicts, 0);
  });

  test('keeps both sides when the same line changed two ways', () => {
    const merged = merge3('a\nb\nc', 'a\nmine\nc', 'a\ntheirs\nc');
    assert.equal(merged.text, 'a\nmine\ntheirs\nc');
    assert.equal(merged.conflicts, 1);
    assert.equal(merge3('a', 'a\nx', 'a\nx').text, 'a\nx');
    assert.equal(merge3('a', 'a', 'b').text, 'b');
  });

  test('keeps both insertions made at the same place', () => {
    const merged = merge3('a\nz', 'a\nm\nz', 'a\nt\nz');
    assert.equal(merged.text, 'a\nm\nt\nz');
  });
});

describe('Inline comments and replies', async () => {
  const { deletePageComment, resolvePageComment } = await import('../../src/domain/wiki.js');

  test('ties a comment to a passage until it is resolved', () => {
    const { ws, me, space } = people();
    const page = addPage(ws, { spaceId: space.id, title: 'Draft', body: 'The launch is in May.' }, me);
    const comment = commentPage(ws, page.id, 'Is May still right?', 'u-lee', '  launch is   in May ', { inline: true });
    assert.equal(comment.inline, true);
    assert.equal(comment.quote, 'launch is in May');
    assert.throws(() => commentPage(ws, page.id, 'x', me, '', { inline: true }), /summary-required/);
    resolvePageComment(ws, page.id, comment.id, true, me);
    assert.equal(comment.resolved, true);
    assert.equal(comment.resolvedBy, me);
    resolvePageComment(ws, page.id, comment.id, false, 'u-lee');
    assert.equal(comment.resolved, false);
    const plain = commentPage(ws, page.id, 'General note', me);
    assert.throws(() => resolvePageComment(ws, page.id, plain.id, true, me), /not-found/);
  });

  test('keeps replies under their comment and removes them with it', () => {
    const { ws, me, space } = people();
    const page = addPage(ws, { spaceId: space.id, title: 'Q&A' }, me);
    const question = commentPage(ws, page.id, 'Who owns this?', 'u-lee');
    const answer = commentPage(ws, page.id, 'I do, @Lee', me, 'ignored quote', { replyTo: question.id });
    assert.equal(answer.replyTo, question.id);
    assert.equal(answer.quote, '');
    assert.equal(inboxOf(ws, 'u-lee').filter((item) => item.kind === 'mention').length, 1);
    assert.throws(() => commentPage(ws, page.id, 'x', me, '', { replyTo: 'missing' }), /not-found/);
    deletePageComment(ws, page.id, question.id, 'u-lee');
    assert.equal(page.comments.length, 0);
  });
});

describe('Issues inside pages', async () => {
  const { findIssueByKey, issueMacrosToMarkdown, parseListMacro, runListMacro } = await import('../../src/domain/issue-macros.js');
  const { createIssue, newProject } = await import('../../src/domain/store.js');

  function withIssues() {
    const { ws, me } = people();
    const project = newProject(ws, { name: 'Payments', key: 'PAY', leadId: me }, me);
    const a = createIssue(ws, project.id, { summary: 'Refund fails' }, me);
    const b = createIssue(ws, project.id, { summary: 'Add receipts' }, me);
    return { ws, me, project, a, b, user: ws.users.find((item) => item.id === me) };
  }

  test('reads list macros with and without a project key', () => {
    assert.deepEqual(parseListMacro('PAY | status != done'), { key: 'PAY', query: 'status != done', fallbackProjectId: '' });
    assert.deepEqual(parseListMacro('PAY'), { key: 'PAY', query: '', fallbackProjectId: '' });
    assert.equal(parseListMacro('type = bug').key, '');
  });

  test('finds one issue and runs a list only for people in the project', () => {
    const { ws, me, project, a, user } = withIssues();
    assert.equal(findIssueByKey(ws, a.key.toLowerCase(), me).issue.id, a.id);
    assert.equal(findIssueByKey(ws, a.key, 'u-lee'), null);
    const list = runListMacro(ws, 'PAY | text ~ "refund"', user);
    assert.equal(list.error, '');
    assert.deepEqual(list.issues.map((issue) => issue.id), [a.id]);
    assert.equal(runListMacro(ws, 'PAY', user).total, 2);
    assert.equal(runListMacro(ws, '', user, project.id).total, 2);
    assert.equal(runListMacro(ws, 'NOPE | x', user).error, 'no-project');
    assert.equal(runListMacro(ws, 'PAY', ws.users.find((item) => item.id === 'u-lee')).error, 'permission');
  });

  test('writes the macros out as Markdown for exports', () => {
    const { ws, a, user } = withIssues();
    const text = issueMacrosToMarkdown(ws, `See [[issue:${a.key}]].\n\n[[issues:PAY | text ~ "receipts"]]`, user, '', true);
    assert.ok(text.includes(`**${a.key}** Refund fails`), text);
    assert.match(text, /\| Key \| Summary \| Status \| Assignee \|/);
    assert.match(text, /Add receipts/);
    assert.match(issueMacrosToMarkdown(ws, '[[issue:PAY-999]]', user, '', true), /PAY-999 \(Not available\)/);
  });
});

describe('Dependencies and the timeline', async () => {
  const { blockersOf, issueSpan, scheduleConflicts, shiftedDates, wouldCycle } = await import('../../src/domain/dependencies.js');
  const { addLink, createIssue, newProject, updateIssue } = await import('../../src/domain/store.js');

  function plan() {
    const { ws, me } = people();
    const project = newProject(ws, { name: 'Launch', key: 'LCH', leadId: me }, me);
    const design = createIssue(ws, project.id, { summary: 'Design', start: '2026-03-02T03:00:00.000Z', due: '2026-03-06T03:00:00.000Z' }, me);
    const build = createIssue(ws, project.id, { summary: 'Build', start: '2026-03-09T03:00:00.000Z', due: '2026-03-13T03:00:00.000Z' }, me);
    const ship = createIssue(ws, project.id, { summary: 'Ship' }, me);
    return { ws, me, project, design, build, ship };
  }

  test('records who waits for whom and refuses a loop', () => {
    const { ws, me, project, design, build, ship } = plan();
    addLink(ws, project.id, design.id, 'blocks', build.key, me);
    addLink(ws, project.id, build.id, 'blocks', ship.key, me);
    assert.deepEqual(blockersOf(project, build).open.map((issue) => issue.id), [design.id]);
    assert.equal(wouldCycle(project, ship.id, design.id), true);
    assert.throws(() => addLink(ws, project.id, ship.id, 'blocks', design.key, me), /dependency-cycle/);
    addLink(ws, project.id, ship.id, 'relates', design.key, me);
  });

  test('spans come from the issue, else its sprint, else a week from creation', () => {
    const { project, design, ship } = plan();
    const span = issueSpan(project, design);
    assert.equal(span.planned, true);
    assert.equal(Math.round((span.end - span.start) / 86_400_000), 4);
    const guess = issueSpan(project, ship);
    assert.equal(guess.planned, false);
    assert.equal(Math.round((guess.end - guess.start) / 86_400_000), 6);
  });

  test('finds a blocker that ends after the next one starts, and moves dates by days', () => {
    const { ws, me, project, design, build } = plan();
    addLink(ws, project.id, design.id, 'blocks', build.key, me);
    assert.equal(scheduleConflicts(project).length, 0);
    updateIssue(ws, project.id, design.id, shiftedDates(project, design, 5, 'end'), me);
    const conflicts = scheduleConflicts(project);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].toId, build.id);
    const moved = shiftedDates(project, build, 2, 'both');
    assert.equal(moved.start.slice(0, 10) <= '2026-03-11', true);
    assert.ok(moved.due > moved.start);
  });
});

describe('Writing a page together', async () => {
  const { createLive } = await import('../../server/live.mjs');

  function room() {
    const { ws, me, space } = people();
    ws.revision = 1;
    const page = addPage(ws, { spaceId: space.id, title: 'Plan', body: 'one\ntwo\nthree' }, me);
    const repository = { cached: ws, writes: 0, async writeWorkspace(next) { this.writes += 1; next.revision = (next.revision || 0) + 1; } };
    const live = createLive(repository, { saveAfter: 5 });
    return { ws, me, page, repository, live, a: ws.users.find((user) => user.id === me), b: ws.users.find((user) => user.id === 'u-lee') };
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  test('merges two writers who started from the same text', async () => {
    const { page, live, a, b, repository } = room();
    const first = live.sync(a, { pageId: page.id, rev: 0, base: page.body, text: page.body, baseTitle: 'Plan', title: 'Plan' });
    assert.equal(first.rev, 1);
    const fromA = live.sync(a, { pageId: page.id, rev: 1, base: first.text, text: 'ONE\ntwo\nthree', baseTitle: 'Plan', title: 'Plan' });
    assert.equal(fromA.rev, 2);
    // B still has rev 1: its change to another line is merged with A's.
    const fromB = live.sync(b, { pageId: page.id, rev: 1, base: first.text, text: 'one\ntwo\nTHREE', baseTitle: 'Plan', title: 'Plan v2' });
    assert.equal(fromB.text, 'ONE\ntwo\nTHREE');
    assert.equal(fromB.title, 'Plan v2');
    assert.deepEqual(fromB.editors.map((item) => item.id).sort(), [a.id, b.id].sort());
    await wait(30);
    assert.equal(page.body, 'ONE\ntwo\nTHREE');
    assert.equal(page.title, 'Plan v2');
    assert.ok(repository.writes >= 1);
    assert.equal(live.sync(a, { pageId: page.id }).saved, true);
  });

  test('saves at once when the last writer leaves, and refuses readers who may not see it', async () => {
    const { ws, page, live, a } = room();
    const start = live.sync(a, { pageId: page.id, rev: 0, base: page.body, text: page.body, baseTitle: 'Plan', title: 'Plan' });
    live.sync(a, { pageId: page.id, rev: start.rev, base: start.text, text: 'changed', baseTitle: 'Plan', title: 'Plan' });
    await live.leave(a, page.id);
    assert.equal(page.body, 'changed');
    updatePage(ws, page.id, { restricted: true }, a.id);
    assert.throws(() => live.sync(ws.users.find((user) => user.id === 'u-kim'), { pageId: page.id }), /permission/);
    assert.throws(() => live.sync(a, { pageId: 'missing' }), /not-found/);
  });
});

describe('Workspace properties', async () => {
  const { updateSpace } = await import('../../src/domain/wiki.js');

  test('changes who sees a workspace: company, a team or a project', () => {
    const { ws, me, space } = people();
    ws.teams = [{ id: 't1', name: 'Design', members: [] }];
    ws.projects = [{ id: 'p1', key: 'PAY', name: 'Payments', issues: [] }];
    const page = addPage(ws, { spaceId: space.id, title: 'Note' }, me);
    updateSpace(ws, space.id, { where: 'team:t1' }, me);
    assert.equal(space.scope, 'team');
    assert.equal(space.teamId, 't1');
    updateSpace(ws, space.id, { where: 'project:p1' }, me);
    assert.equal(space.scope, 'project');
    assert.equal(page.projectId, 'p1');
    updateSpace(ws, space.id, { where: '' }, me);
    assert.equal(space.scope, 'company');
    assert.equal(page.projectId, '');
    assert.throws(() => updateSpace(ws, space.id, { where: 'team:missing' }, me), /not-found/);
    assert.throws(() => updateSpace(ws, space.id, { where: 'team:t1' }, 'u-lee'), /permission/);
  });
});

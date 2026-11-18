import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { addArticle } from '../../src/domain/services.js';
import { blankWorkspace } from '../../src/domain/store.js';
import { addColumn, addPage, addRow, addShape, addSpace, attachPage, commentPage, copyPage, deletePage, deletePageComment, deleteSpace, editPageComment, suggestSpaceKey, updateSpace, expandPage, likePage, movePage, pageByShare, pageDocument, restorePage, restoreTrashed, searchPages, setPageStatus, shareLink, updatePage, visiblePage, watchPage } from '../../src/domain/wiki.js';

describe('Wiki', () => {
  test('puts an article in a space and keeps a page tree', () => {
    const ws = blankWorkspace();
    const space = addSpace(ws, { name: 'Handbook', key: 'BOOK' }, 'u1');
    const parent = addPage(ws, { spaceId: space.id, title: 'Start', body: 'Hello' }, 'u1');
    const child = addPage(ws, { spaceId: space.id, parentId: parent.id, title: 'Details', labels: ['How to'] }, 'u1');
    assert.equal(child.parentId, parent.id);
    assert.deepEqual(child.labels, ['how-to']);
    assert.throws(() => addPage(ws, { spaceId: space.id, parentId: child.id, title: 'News', kind: 'blog' }, 'u1'), /parent-required/);
    const blog = addPage(ws, { spaceId: space.id, title: 'News', kind: 'blog' }, 'u1');
    assert.throws(() => movePage(ws, blog.id, parent.id, 'u1'), /parent-required/);
    movePage(ws, child.id, '', 'u1');
    assert.equal(child.parentId, '');
    movePage(ws, child.id, parent.id, 'u1');
    assert.throws(() => movePage(ws, parent.id, child.id, 'u1'), /parent-required/);
    assert.throws(() => addArticle(ws, { title: '  ' }, 'u1'), /name-required/);
  });

  test('keeps versions, comments, watchers, and a private page', () => {
    const ws = sampleWorkspace(Date.parse('2026-11-15T12:00:00Z'));
    const page = ws.articles.find((item) => item.title === '결제 안내');
    assert.ok(page.spaceId);
    updatePage(ws, page.id, { body: 'Changed', labels: 'pay, card' }, 'u2');
    assert.equal(page.versions.length, 1);
    assert.equal(page.versions[0].body.includes('승인'), true);
    watchPage(ws, page.id, 'u2');
    commentPage(ws, page.id, 'Looks good', 'u2');
    const before = ws.projects[0].notifications.length;
    updatePage(ws, page.id, { title: '결제 안내 개정' }, 'u1');
    assert.ok(ws.projects[0].notifications.length > before);
    restorePage(ws, page.id, page.versions[0].id, 'u1');
    assert.equal(page.title, '결제 안내');
    updatePage(ws, page.id, { restricted: true }, 'u1');
    assert.equal(visiblePage(page, 'u2'), false);
    assert.throws(() => commentPage(ws, page.id, 'Nope', 'u2'), /permission/);
    assert.throws(() => commentPage(ws, page.id, '  ', 'u1'), /summary-required/);
    const found = searchPages(ws, 'card', 'u1');
    assert.ok(found.some((item) => item.id === page.id));
    assert.equal(searchPages(ws, 'card', 'u2').some((item) => item.id === page.id), false);
  });

  test('copies, hides a draft, likes, attaches, and restores trash', () => {
    const ws = blankWorkspace();
    const space = addSpace(ws, { name: 'Notes', key: 'NOTE' }, 'u1');
    const page = addPage(ws, { spaceId: space.id, title: 'Guide', body: '# Start\n\n[[children]]\n\n:::note\nRead me\n:::' }, 'u1');
    addPage(ws, { spaceId: space.id, parentId: page.id, title: 'Child' }, 'u1');
    const copy = copyPage(ws, page.id, 'u1');
    assert.equal(copy.status, 'draft');
    assert.equal(visiblePage(copy, 'u2'), false);
    setPageStatus(ws, copy.id, 'current', 'u1');
    assert.equal(visiblePage(copy, 'u2'), true);
    assert.equal(likePage(ws, page.id, 'u2'), true);
    assert.equal(likePage(ws, page.id, 'u2'), false);
    commentPage(ws, page.id, 'Here', 'u1', 'Start');
    assert.equal(page.comments[0].quote, 'Start');
    assert.match(expandPage(ws, page), /Child/);
    assert.match(expandPage(ws, page), /> \*\*note\*\*/);
    assert.throws(() => attachPage(ws, page.id, { name: 'big.bin', size: 800_000, data: '' }, 'u1'), /attachment-big/);
    attachPage(ws, page.id, { name: 'note.txt', mime: 'text/plain', size: 4, data: 'data:text/plain,hi' }, 'u1');
    assert.equal(page.attachments.length, 1);
    assert.match(page.body, /\[note.txt\]\(attachment:/);
    const shot = attachPage(ws, page.id, { name: 'shot.png', mime: 'image/png', size: 12, data: 'data:image/png;base64,abcd' }, 'u1');
    assert.match(page.body, new RegExp(`!\\[shot.png\\]\\(attachment:${shot.id}\\)`));
    const doc = pageDocument(ws.articles.find((item) => item.id === page.id), page.body);
    assert.match(doc.html, /<img class="md-image"/);
    assert.match(doc.markdown, /data:image\/png;base64,abcd/);
    const token = shareLink(ws, page.id, 'u1', true);
    assert.equal(pageByShare(ws, token).id, page.id);
    deletePage(ws, page.id, 'u1');
    assert.equal(visiblePage(page, 'u1'), false);
    restoreTrashed(ws, page.id, 'u1');
    assert.equal(page.trashed, false);
    const board = addPage(ws, { spaceId: space.id, kind: 'board', title: 'Wall' }, 'u1');
    addShape(ws, board.id, 'Idea', 'u1');
    assert.equal(board.shapes[0].text, 'Idea');
    const table = addPage(ws, { spaceId: space.id, kind: 'table', title: 'List' }, 'u1');
    addColumn(ws, table.id, 'Name', 'u1');
    addRow(ws, table.id, ['Ada'], 'u1');
    assert.equal(table.rows[0].Name, 'Ada');
    assert.throws(() => addColumn(ws, table.id, 'Name', 'u1'), /duplicate-key/);
  });
test('makes a workspace from a name alone and keys it automatically', () => {
    const ws = blankWorkspace();
    const first = addSpace(ws, { name: 'Design notes' }, 'u1');
    assert.equal(first.key, 'DESIGNNO');
    const again = addSpace(ws, { name: 'Design notes' }, 'u1');
    assert.equal(again.key, 'DESIGNNO2');
    const korean = addSpace(ws, { name: '개발 문서' }, 'u1');
    assert.match(korean.key, /^WSd*$/);
    assert.equal(suggestSpaceKey(ws, '개발 문서'), korean.key === 'WS' ? 'WS2' : 'WS');
    assert.equal(first.scope, 'company');
    const team = addSpace(ws, { name: 'Team room', teamId: 't1' }, 'u1');
    assert.equal(team.scope, 'team');
  });

  test('renames a workspace and deletes it only when empty', () => {
    const ws = blankWorkspace();
    const space = addSpace(ws, { name: 'Drafts' }, 'u1');
    assert.throws(() => updateSpace(ws, space.id, { name: 'Other' }, 'u2'), /permission/);
    updateSpace(ws, space.id, { name: 'Drafts 2', description: 'Rough work' }, 'u1');
    assert.equal(space.name, 'Drafts 2');
    updateSpace(ws, space.id, { name: 'By admin' }, 'u2', true);
    assert.equal(space.name, 'By admin');
    assert.throws(() => updateSpace(ws, space.id, { name: ' ' }, 'u1'), /name-required/);
    const page = addPage(ws, { spaceId: space.id, title: 'One' }, 'u1');
    assert.throws(() => deleteSpace(ws, space.id, 'u1'), /space-not-empty/);
    deletePage(ws, page.id, 'u1');
    assert.throws(() => deleteSpace(ws, space.id, 'u1'), /space-not-empty/);
    ws.articles = ws.articles.filter((item) => item.id !== page.id);
    assert.throws(() => deleteSpace(ws, space.id, 'u2'), /permission/);
    deleteSpace(ws, space.id, 'u1');
    assert.equal(ws.spaces.some((item) => item.id === space.id), false);
  });

  test('adds files to a page list without touching its text', () => {
    const ws = blankWorkspace();
    const space = addSpace(ws, { name: 'Files', key: 'FILE' }, 'u1');
    const page = addPage(ws, { spaceId: space.id, title: 'Spec', body: 'Text' }, 'u1');
    const file = attachPage(ws, page.id, { name: 'plan.pdf', mime: 'application/pdf', size: 10, data: 'data:application/pdf;base64,AA' }, 'u1', { embed: false });
    assert.equal(page.body, 'Text');
    assert.equal(page.attachments.length, 1);
    assert.equal(file.authorId, 'u1');
    updatePage(ws, page.id, { restricted: true }, 'u1');
    assert.throws(() => attachPage(ws, page.id, { name: 'x.txt', size: 1, data: '' }, 'u2', { embed: false }), /permission/);
  });

  test('lets a commenter edit their own comment', () => {
    const ws = blankWorkspace();
    const space = addSpace(ws, { name: 'Talk', key: 'TALK' }, 'u1');
    const page = addPage(ws, { spaceId: space.id, title: 'Topic' }, 'u1');
    const comment = commentPage(ws, page.id, 'First', 'u2');
    assert.throws(() => editPageComment(ws, page.id, comment.id, 'Changed', 'u1'), /permission/);
    editPageComment(ws, page.id, comment.id, 'Second', 'u2');
    assert.equal(page.comments[0].body, 'Second');
    assert.ok(page.comments[0].edited);
    assert.throws(() => editPageComment(ws, page.id, comment.id, '  ', 'u2'), /summary-required/);
    deletePageComment(ws, page.id, comment.id, 'u1');
    assert.equal(page.comments.length, 0);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { htmlToMarkdown } from '../../src/domain/htmlmd.js';
import { renderMarkdown } from '../../src/domain/markdown.js';
import { PAGE_TEMPLATES, TEMPLATE_GROUPS, templateBody, templateById } from '../../src/domain/page-templates.js';
import { searchAll, snippet } from '../../src/domain/search.js';
import { blankWorkspace, createIssue, newProject, addComment } from '../../src/domain/store.js';
import { addPage, addSpace, attachPage, commentPage, updatePage } from '../../src/domain/wiki.js';

describe('Page templates', () => {
  test('offers forty templates, five in each of eight groups, with unique ids', () => {
    assert.equal(PAGE_TEMPLATES.length, 45);
    assert.equal(new Set(PAGE_TEMPLATES.map((item) => item.id)).size, 45);
    for (const group of TEMPLATE_GROUPS) assert.equal(PAGE_TEMPLATES.filter((item) => item.group === group.id).length, 5, group.id);
    for (const item of PAGE_TEMPLATES) {
      assert.ok(item.ko && item.en && item.about?.[0] && item.about?.[1], item.id);
      assert.ok(TEMPLATE_GROUPS.some((group) => group.id === item.group), item.id);
    }
    assert.equal(templateById('meeting-notes').en, 'Meeting notes');
    assert.equal(templateById('missing'), null);
  });

  test('every template renders cleanly in both languages and survives the editor round trip', () => {
    for (const item of PAGE_TEMPLATES) {
      for (const language of ['ko', 'en']) {
        const body = templateBody(item, language);
        assert.ok(body.includes('## '), `${item.id} ${language} has headings`);
        const html = renderMarkdown(body);
        assert.doesNotMatch(html, /<p>-/, `${item.id} ${language} has no stray list marker`);
        // Saving from the editor turns the page back into Markdown; it must show exactly the same page.
        assert.equal(renderMarkdown(htmlToMarkdown(html)), html, `${item.id} ${language} round trip`);
      }
    }
    assert.match(templateBody(templateById('prd'), 'ko'), /## 요구사항/);
    assert.match(templateBody(templateById('prd'), 'en'), /## Requirements/);
  });
});

describe('Search everything', () => {
  function workspace() {
    const ws = blankWorkspace();
    const me = ws.users[0].id;
    ws.modules = { ...(ws.modules || {}), knowledge: true, documents: true };
    const project = newProject(ws, { name: 'Payments', key: 'PAY', leadId: me }, me);
    const issue = createIssue(ws, project.id, { summary: 'Refund button broken', description: 'The refund flow fails on mobile.' }, me);
    addComment(ws, project.id, issue.id, 'Refund works again after the fix', me);
    const space = addSpace(ws, { name: 'Handbook' }, me);
    const page = addPage(ws, { spaceId: space.id, title: 'Refund policy', body: 'Customers may ask for a refund within 30 days.' }, me);
    commentPage(ws, page.id, 'Should refunds include shipping?', me);
    attachPage(ws, page.id, { name: 'refund-form.pdf', mime: 'application/pdf', size: 10, data: 'data:application/pdf;base64,AA' }, me, { embed: false });
    ws.documents = [{ id: 'd1', title: 'Refund memo', body: 'Notes', authorId: me, visibility: 'workspace' }];
    return { ws, me, project, issue, page };
  }

  test('groups every kind of match', () => {
    const { ws, me, project, issue, page } = workspace();
    const groups = searchAll(ws, 'refund', me);
    assert.equal(groups.issues[0].id, issue.id);
    assert.equal(groups.issues[0].projectId, project.id);
    assert.equal(groups.pages[0].id, page.id);
    assert.equal(groups.comments.length, 2);
    assert.deepEqual(groups.comments.map((hit) => hit.on).sort(), ['issue', 'page']);
    assert.equal(groups.files[0].title, 'refund-form.pdf');
    assert.equal(groups.documents[0].id, 'd1');
    assert.equal(searchAll(ws, 'payments', me).projects[0].id, project.id);
    assert.equal(searchAll(ws, 'handbook', me).spaces[0].title, 'Handbook');
  });

  test('needs every word and returns nothing for an empty query', () => {
    const { ws, me } = workspace();
    assert.equal(searchAll(ws, 'refund mobile', me).issues.length, 1);
    assert.equal(searchAll(ws, 'refund nowhere', me).issues.length, 0);
    const empty = searchAll(ws, '   ', me);
    assert.equal(Object.values(empty).reduce((sum, list) => sum + list.length, 0), 0);
  });

  test('leaves out what the person may not see', () => {
    const { ws, me, page } = workspace();
    ws.users.push({ id: 'u9', name: 'Guest', active: true });
    updatePage(ws, page.id, { restricted: true }, me);
    ws.documents[0].visibility = 'private';
    const groups = searchAll(ws, 'refund', 'u9');
    assert.equal(groups.pages.length, 0);
    assert.equal(groups.files.length, 0);
    assert.equal(groups.documents.length, 0);
    assert.equal(groups.issues.length, 0);
    ws.modules.knowledge = false;
    assert.equal(searchAll(ws, 'refund', me).pages.length, 0);
  });

  test('cuts a snippet around the first word found', () => {
    const text = `${'a '.repeat(100)}needle ${'b '.repeat(100)}`;
    const piece = snippet(text, ['needle'], 60);
    assert.match(piece, /needle/);
    assert.ok(piece.startsWith('…') && piece.endsWith('…'));
  });
});

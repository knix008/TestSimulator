import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FORMS, attachDocument, createDocument, deleteDocument, removeDocumentFile, shareDocument, updateDocument, visibleDocuments } from '../../src/domain/documents.js';
import { blankWorkspace } from '../../src/domain/store.js';

describe('Documents', () => {
  test('offers a deliverable form and fourteen other forms', () => {
    assert.ok(FORMS.length >= 15);
    const ids = FORMS.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('deliverable'));
    for (const item of FORMS) {
      assert.match(item.bodyKo, /^## /);
      assert.match(item.bodyEn, /^## /);
    }
  });

  test('keeps a private document with its author and shares it', () => {
    const ws = blankWorkspace();
    const projectId = 'p1';
    const doc = createDocument(ws, { templateId: 'deliverable', projectId, lang: 'en' }, 'u1');
    assert.equal(doc.title, 'Deliverable');
    assert.equal(doc.visibility, 'private');
    assert.equal(visibleDocuments(ws, 'u2', projectId).length, 0);
    assert.equal(visibleDocuments(ws, 'u1', projectId).length, 1);
    shareDocument(ws, doc.id, 'project', 'u1');
    assert.equal(visibleDocuments(ws, 'u2', projectId).length, 1);
    assert.equal(visibleDocuments(ws, 'u2', 'other').length, 0);
    shareDocument(ws, doc.id, 'workspace', 'u1');
    assert.equal(visibleDocuments(ws, 'u2', 'other').length, 1);
    updateDocument(ws, doc.id, { title: 'Floor plan', issueKey: 'CLIN-1' }, 'u1');
    assert.equal(doc.issueKey, 'CLIN-1');
    assert.throws(() => updateDocument(ws, doc.id, { title: 'Nope' }, 'u2'), /permission/);
    assert.throws(() => deleteDocument(ws, doc.id, 'u2'), /permission/);
    assert.throws(() => createDocument(ws, { templateId: 'missing' }, 'u1'), /not-found/);
    assert.throws(() => updateDocument(ws, doc.id, { title: '  ' }, 'u1'), /name-required/);
    const loose = createDocument(ws, { templateId: 'meeting' }, 'u1');
    assert.throws(() => shareDocument(ws, loose.id, 'project', 'u1'), /project-required/);
    const shot = attachDocument(ws, doc.id, { name: 'plan.png', mime: 'image/png', size: 8, data: 'data:image/png;base64,abcd' }, 'u1');
    assert.match(doc.body, new RegExp(`!\\[plan.png\\]\\(attachment:${shot.id}\\)`));
    assert.equal(doc.attachments.length, 1);
    assert.throws(() => attachDocument(ws, doc.id, { name: 'x.txt', size: 1, data: 'data:text/plain,x' }, 'u2'), /permission/);
    removeDocumentFile(ws, doc.id, shot.id, 'u1');
    assert.equal(doc.attachments.length, 0);
    deleteDocument(ws, doc.id, 'u1');
    assert.equal(ws.documents.some((item) => item.id === doc.id), false);
  });
});

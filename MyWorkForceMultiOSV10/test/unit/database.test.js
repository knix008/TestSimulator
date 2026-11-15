import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createDocument, shareDocument } from '../../src/domain/documents.js';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { blankWorkspace, upgradeWorkspace } from '../../src/domain/store.js';
import { checkPassword, hashPassword, openRepository } from '../../server/repository.mjs';
import { schemaFor } from '../../server/schema.mjs';

describe('Database', () => {
  test('uses a wide text type on each server engine', () => {
    assert.match(schemaFor('sqlite').join('\n'), /CREATE TABLE IF NOT EXISTS workspace_document/);
    assert.match(schemaFor('mysql').join('\n'), /MEDIUMTEXT/);
    assert.match(schemaFor('mariadb').join('\n'), /MEDIUMTEXT/);
    assert.match(schemaFor('postgres').join('\n'), /body TEXT/);
    assert.match(schemaFor('mssql').join('\n'), /NVARCHAR\(MAX\)/);
  });

  test('round-trips a workspace through SQLite', async () => {
    const repository = await openRepository({ engine: 'sqlite', file: ':memory:' });
    const ws = sampleWorkspace(Date.parse('2026-11-15T12:00:00Z'));
    ws.savedAt = '2026-11-15T12:00:00.000Z';
    const doc = createDocument(ws, { templateId: 'deliverable', projectId: ws.projects[0].id, lang: 'ko' }, 'u1');
    shareDocument(ws, doc.id, 'workspace', 'u1');
    await repository.writeWorkspace(ws);
    const loaded = await repository.readWorkspace();
    assert.equal(loaded.projects.length, 2);
    assert.equal(loaded.articles[0].title, '결제 안내');
    const articles = await repository.engine.query('SELECT title FROM articles', []);
    assert.equal(articles[0].title, '결제 안내');
    const documents = await repository.engine.query('SELECT title, visibility FROM documents', []);
    assert.equal(documents[0].title, '결과물');
    assert.equal(documents[0].visibility, 'workspace');
    const issues = await repository.engine.query('SELECT issue_key FROM issue_index WHERE issue_key = ?', ['SHOP-1']);
    assert.equal(issues.length, 1);
    const password = hashPassword('secret');
    assert.equal(checkPassword('secret', password), true);
    assert.equal(checkPassword('other', password), false);
    await repository.close();
  });

  test('the administrator signs in as admin with password admin', () => {
    const blank = blankWorkspace();
    const admin = blank.users.find((user) => user.login === 'admin');
    assert.equal(admin.name, '관리자');
    assert.equal(checkPassword('admin', admin.passwordHash), true);
    assert.equal(checkPassword('other', admin.passwordHash), false);
    const ws = upgradeWorkspace(sampleWorkspace(Date.parse('2026-11-15T12:00:00Z')));
    const added = ws.users.find((user) => user.login === 'admin');
    assert.equal(added.name, '관리자');
    assert.equal(checkPassword('admin', added.passwordHash), true);
    assert.ok(ws.users.some((user) => user.name === '김서연'));
    assert.equal(ws.currentUserId, 'u1');
  });
});

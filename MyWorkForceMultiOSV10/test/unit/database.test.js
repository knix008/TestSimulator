import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import { openValue, seal } from '../../server/privacy.mjs';
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
    await repository.writeWorkspace(ws, 0);
    assert.equal((await repository.readWorkspace()).revision, 1);
    await assert.rejects(() => repository.writeWorkspace(ws, 0), /conflict/);
    await repository.writeWorkspace(ws, 1);
    const loaded = await repository.readWorkspace();
    assert.equal(loaded.projects.length, 2);
    assert.equal(loaded.articles[0].title, '결제 안내');
    // What people wrote is sealed in the tables, and opens with the database's key.
    const articles = await repository.engine.query('SELECT title FROM articles', []);
    assert.ok(articles[0].title.startsWith('mwf1:'));
    assert.equal(openValue(articles[0].title, repository.privacyKey), '결제 안내');
    const documents = await repository.engine.query('SELECT title, visibility FROM documents', []);
    assert.equal(openValue(documents[0].title, repository.privacyKey), '결과물');
    const raw = await repository.engine.query('SELECT body FROM workspace_document', []);
    assert.ok(raw[0].body.startsWith('mwf1:') && !raw[0].body.includes('결제'), 'the workspace document is sealed as a whole');
    assert.equal(documents[0].visibility, 'workspace');
    const issues = await repository.engine.query('SELECT issue_key FROM issue_index WHERE issue_key = ?', ['SHOP-1']);
    assert.equal(issues.length, 1);
    const password = hashPassword('secret');
    assert.equal(checkPassword('secret', password), true);
    assert.equal(checkPassword('other', password), false);
    await repository.close();
  });

  test('personal details are encrypted in the database and come back readable', async () => {
    const key = randomBytes(32);
    assert.equal(openValue('김서연', key), '김서연');
    const sealed = seal('김서연', key);
    assert.equal(sealed.startsWith('mwf1:'), true);
    assert.equal(openValue(sealed, key), '김서연');
    assert.equal(seal('', key), '');
    assert.equal(seal(sealed, key), sealed);
    const repository = await openRepository({ engine: 'sqlite', file: ':memory:' });
    const ws = blankWorkspace();
    const user = ws.users[0];
    user.email = 'lead@example.com';
    user.phone = '010-1111-2222';
    user.jobTitle = '팀장';
    user.team = '기획';
    user.photo = 'data:image/png;base64,aaaa';
    ws.mailOutbox = [{ id: 'm1', to: 'lead@example.com', subject: '안녕', body: '본문', state: 'sent', created: '2026-11-15T12:00:00.000Z' }];
    await repository.writeWorkspace(ws, 0);
    assert.equal(repository.cached.users[0].name, '관리자');
    assert.equal(repository.cached.users[0].phone, '010-1111-2222');
    const raw = await repository.engine.query('SELECT body FROM workspace_document', []);
    const body = raw[0].body;
    assert.equal(body.includes('010-1111-2222'), false);
    assert.equal(body.includes('lead@example.com'), false);
    assert.equal(body.includes('팀장'), false);
    assert.equal(body.includes('data:image/png;base64,aaaa'), false);
    const accounts = await repository.engine.query('SELECT name, email FROM accounts', []);
    assert.equal(String(accounts[0].name).startsWith('mwf1:'), true);
    assert.equal(String(accounts[0].email).startsWith('mwf1:'), true);
    const loaded = await repository.readWorkspace();
    assert.equal(loaded.users[0].name, '관리자');
    assert.equal(loaded.users[0].email, 'lead@example.com');
    assert.equal(loaded.users[0].phone, '010-1111-2222');
    assert.equal(loaded.users[0].jobTitle, '팀장');
    assert.equal(loaded.users[0].team, '기획');
    assert.equal(loaded.users[0].photo, 'data:image/png;base64,aaaa');
    assert.equal(loaded.users[0].login, 'admin');
    assert.equal(loaded.mailOutbox[0].to, 'lead@example.com');
    assert.equal(checkPassword('admin', loaded.users[0].passwordHash), true);
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

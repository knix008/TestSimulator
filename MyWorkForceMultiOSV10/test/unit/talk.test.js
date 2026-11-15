import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { openRepository } from '../../server/repository.mjs';
import { checkMessage, inviteMembers, listMessages, listRooms, noticeTarget, openRoom, postFile, postMessage, postNotice, readFile } from '../../server/chat.mjs';

const people = [
  { id: 'u1', name: '서연' },
  { id: 'u2', name: '민준' },
  { id: 'u3', name: '하은' },
  { id: 'u4', name: '도윤' },
];

describe('Talk', () => {
  test('reuses a direct talk, opens a group, and keeps a file inside the room', async () => {
    const repository = await openRepository({ engine: 'sqlite', file: ':memory:' });
    const engine = repository.engine;
    const first = await openRoom(engine, 'u1', { kind: 'direct', members: ['u2'] }, people);
    const again = await openRoom(engine, 'u2', { kind: 'direct', members: ['u1'] }, people);
    assert.equal(again.id, first.id);
    assert.equal(first.kind, 'direct');
    const group = await openRoom(engine, 'u1', { kind: 'group', name: '결제', members: ['u2', 'u3'] }, people);
    assert.equal(group.kind, 'group');
    assert.equal(group.members.length, 3);
    await assert.rejects(() => openRoom(engine, 'u1', { kind: 'group', name: '둘', members: ['u2'] }, people), /members-required/);
    await postMessage(engine, 'u1', group.id, '같이 봅시다');
    const file = await postFile(engine, 'u2', group.id, { name: 'note.txt', mime: 'text/plain', data: Buffer.from('hello').toString('base64') });
    const messages = await listMessages(engine, 'u3', group.id, '');
    assert.equal(messages.length, 2);
    const savedMessage = messages.find((item) => item.kind === 'file');
    assert.equal(savedMessage.fileId, file.fileId);
    const saved = await readFile(engine, 'u3', file.fileId);
    assert.equal(Buffer.from(saved.data, 'base64').toString(), 'hello');
    await assert.rejects(() => readFile(engine, 'u4', file.fileId), /permission/);
    await assert.rejects(() => postMessage(engine, 'u4', group.id, '밖'), /permission/);
    const outsider = await listRooms(engine, 'u4', people);
    assert.equal(outsider.some((room) => room.id === group.id), false);
    assert.equal(outsider.some((room) => room.kind === 'notices'), true);
    await postNotice(engine, 'u1', 'n1', 'SHOP · SHOP-1 · comment');
    await postNotice(engine, 'u1', 'n1', 'SHOP · SHOP-1 · comment');
    const notes = await listRooms(engine, 'u1', people);
    const notice = notes.find((room) => room.kind === 'notices');
    const noticeMessages = await listMessages(engine, 'u1', notice.id, '');
    assert.equal(noticeMessages.filter((item) => item.id === 'notice-u1-n1').length, 1);
    assert.equal(noticeMessages[0].checked, false);
    const still = await listRooms(engine, 'u1', people);
    assert.equal(still.find((room) => room.kind === 'notices').unread, 1);
    await checkMessage(engine, 'u1', 'notice-u1-n1');
    const checked = await listRooms(engine, 'u1', people);
    assert.equal(checked.find((room) => room.kind === 'notices').unread, 0);
    const invited = await inviteMembers(engine, 'u1', first.id, ['u3', 'u4'], people);
    assert.equal(invited.id, first.id);
    assert.equal(invited.kind, 'group');
    assert.equal(invited.members.length, 4);
    await postMessage(engine, 'u4', first.id, '같이 봅니다');
    const fresh = await openRoom(engine, 'u1', { kind: 'direct', members: ['u2'] }, people);
    assert.notEqual(fresh.id, first.id);
    await assert.rejects(() => inviteMembers(engine, 'u1', notice.id, ['u2'], people), /permission/);
    await postNotice(engine, 'u2', 'n1', 'SHOP · SHOP-1 · comment');
    const other = await listRooms(engine, 'u2', people);
    const otherRoom = other.find((room) => room.kind === 'notices');
    assert.equal(otherRoom.unread, 1);
    const otherMessages = await listMessages(engine, 'u2', otherRoom.id, '');
    assert.equal(otherMessages[0].id, 'notice-u2-n1');
    assert.equal(otherMessages[0].checked, false);
    await repository.close();
  });

  test('a notice opens the issue, page, or document it is about', () => {
    const issue = noticeTarget({
      projects: [{ id: 'p', key: 'SHOP', notifications: [{ id: 'n1', issueId: 'i9', issueKey: 'SHOP-9', kind: 'comment' }] }],
    }, 'u1', { id: 'notice-u1-n1', kind: 'notice' });
    assert.equal(issue.view, 'issue');
    assert.equal(issue.projectKey, 'SHOP');
    assert.equal(issue.issueId, 'i9');
    const page = noticeTarget({
      projects: [{ id: 'p', key: 'SHOP', notifications: [{ id: 'n2', issueKey: '결제 안내', kind: 'page', pageId: 'page1' }] }],
    }, 'u1', { id: 'notice-u1-n2', kind: 'notice' });
    assert.equal(page.view, 'knowledge');
    assert.equal(page.pageId, 'page1');
    const doc = noticeTarget({
      projects: [{ id: 'p', key: 'SHOP', notifications: [{ id: 'n3', issueKey: '회의', kind: 'document' }] }],
      documents: [{ id: 'd1', title: '회의', projectId: 'p' }],
    }, 'u1', { id: 'notice-u1-n3', kind: 'notice' });
    assert.equal(doc.view, 'documents');
    assert.equal(doc.documentId, 'd1');
  });
});

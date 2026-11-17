import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { canDeleteProject, deleteProject, newProject, upgradeWorkspace } from '../../src/domain/store.js';

function workspace() {
  const ws = upgradeWorkspace(sampleWorkspace(Date.parse('2026-11-15T12:00:00Z')));
  const admin = ws.users.find((user) => user.login === 'admin');
  const lead = ws.users.find((user) => user.login !== 'admin');
  return { ws, admin, lead };
}

describe('Deleting a project', () => {
  test('only the administrator may delete; a project lead or editor may not', () => {
    const { ws, admin, lead } = workspace();
    const project = ws.projects[0];
    assert.equal(canDeleteProject(ws, project, admin.id), true);
    assert.equal(canDeleteProject(ws, project, lead.id), false);
    assert.throws(() => deleteProject(ws, project.id, lead.id), /permission/);
    assert.ok(ws.projects.some((item) => item.id === project.id));
  });

  test('removes the project with its documents, articles and approvals, and moves the active project', () => {
    const { ws, admin } = workspace();
    const project = ws.projects.find((item) => (ws.articles || []).some((article) => article.projectId === item.id));
    ws.activeProjectId = project.id;
    deleteProject(ws, project.id, admin.id);
    assert.equal(ws.projects.some((item) => item.id === project.id), false);
    assert.equal((ws.articles || []).some((item) => item.projectId === project.id), false);
    assert.equal((ws.documents || []).some((item) => item.projectId === project.id), false);
    assert.equal((ws.approvals || []).some((item) => item.projectId === project.id), false);
    assert.notEqual(ws.activeProjectId, project.id);
  });

  test('a project with sub-projects is refused until they are gone', () => {
    const { ws, admin } = workspace();
    const parent = ws.projects[0];
    const child = newProject(ws, { name: 'Child', key: 'KID', type: 'software', parentId: parent.id }, admin.id);
    assert.throws(() => deleteProject(ws, parent.id, admin.id), /project-has-children/);
    deleteProject(ws, child.id, admin.id);
    deleteProject(ws, parent.id, admin.id);
    assert.equal(ws.projects.some((item) => item.id === parent.id), false);
  });
});

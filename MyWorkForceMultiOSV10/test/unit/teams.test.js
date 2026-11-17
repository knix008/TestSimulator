import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { newProject, upgradeWorkspace } from '../../src/domain/store.js';
import {
  accessOf, canSeeSpace, createTeam, deleteTeam, moveProjectToTeam, projectMethods, projectViews, projectsOfTeam,
  setProjectAccess, setProjectMethod, setTeamMember, teamSpace, teamsOf, updateTeam, visibleSpaces,
} from '../../src/domain/teams.js';

function company() {
  const ws = upgradeWorkspace(sampleWorkspace(Date.parse('2026-11-15T12:00:00Z')));
  const admin = ws.users.find((user) => user.login === 'admin');
  const others = ws.users.filter((user) => user.login !== 'admin');
  return { ws, admin, alice: others[0], bob: others[1] };
}

describe('Teams', () => {
  test('an older workspace gets teams from its groups, and every project belongs to one', () => {
    const { ws } = company();
    assert.ok(ws.teams.length >= 1);
    for (const project of ws.projects) assert.ok(ws.teams.some((team) => team.id === project.teamId), project.key);
    assert.ok(ws.spaces.some((space) => space.scope === 'company'));
    for (const team of ws.teams) assert.ok(ws.spaces.some((space) => space.scope === 'team' && space.teamId === team.id));
  });

  test('an empty company starts with one default team that holds everybody', () => {
    const ws = upgradeWorkspace({});
    assert.equal(ws.teams.length, 1);
    assert.equal(ws.teams[0].members.length, ws.users.length);
  });

  test('only the administrator creates or deletes a team; leads manage members', () => {
    const { ws, admin, alice, bob } = company();
    assert.throws(() => createTeam(ws, { name: 'Design' }, alice.id), /permission/);
    const team = createTeam(ws, { name: 'Design', leadId: alice.id }, admin.id);
    assert.equal(team.leadId, alice.id);
    assert.ok(teamSpace(ws, team));
    setTeamMember(ws, team.id, bob.id, 'member', alice.id);
    assert.ok(teamsOf(ws, bob.id).some((item) => item.id === team.id));
    assert.throws(() => setTeamMember(ws, team.id, admin.id, 'member', bob.id), /permission/);
    updateTeam(ws, team.id, { name: 'Product design' }, alice.id);
    assert.equal(ws.spaces.find((space) => space.teamId === team.id).name, 'Product design');
    assert.throws(() => createTeam(ws, { name: 'product design' }, admin.id), /duplicate-team/);
    assert.throws(() => deleteTeam(ws, team.id, alice.id), /permission/);
    deleteTeam(ws, team.id, admin.id);
    assert.equal(ws.teams.some((item) => item.id === team.id), false);
  });

  test('a team with projects is not deleted, and its pages go to the company space when it is', () => {
    const { ws, admin } = company();
    const team = createTeam(ws, { name: 'Ops' }, admin.id);
    const project = newProject(ws, { name: 'Runbook', key: 'RUN', teamId: team.id }, admin.id);
    assert.throws(() => deleteTeam(ws, team.id, admin.id), /team-has-projects/);
    moveProjectToTeam(ws, project.id, ws.teams[0].id, admin.id);
    const space = teamSpace(ws, team);
    ws.articles.push({ id: 'kb-ops', spaceId: space.id, title: 'On call', body: '', labels: [], comments: [] });
    deleteTeam(ws, team.id, admin.id);
    const shared = ws.spaces.find((item) => item.scope === 'company');
    assert.equal(ws.articles.find((page) => page.id === 'kb-ops').spaceId, shared.id);
  });
});

describe('Projects in a team', () => {
  test('a project is made inside a team by its members, with chosen methods', () => {
    const { ws, admin, alice, bob } = company();
    const team = createTeam(ws, { name: 'Web', leadId: alice.id }, admin.id);
    assert.throws(() => newProject(ws, { name: 'Site', key: 'SITE', teamId: team.id }, bob.id), /permission/);
    const project = newProject(ws, { name: 'Site', key: 'SITE', teamId: team.id, type: 'business', methods: ['kanban'] }, alice.id);
    assert.equal(project.teamId, team.id);
    assert.deepEqual(projectMethods(project), ['kanban']);
    assert.ok(projectsOfTeam(ws, team.id).includes(project));
    const views = projectViews(project);
    assert.ok(views.has('board'));
    assert.equal(views.has('backlog'), false);
    assert.equal(views.has('issues'), false);
  });

  test('methods are switched on and off by a lead, and one always stays', () => {
    const { ws, admin, alice, bob } = company();
    const team = createTeam(ws, { name: 'Support', leadId: alice.id }, admin.id);
    setTeamMember(ws, team.id, bob.id, 'member', alice.id);
    const project = newProject(ws, { name: 'Desk', key: 'DESK', teamId: team.id, methods: ['issues'] }, alice.id);
    setProjectMethod(ws, project.id, 'service', true, alice.id);
    assert.ok(projectViews(project).has('queues'));
    assert.throws(() => setProjectMethod(ws, project.id, 'kanban', true, bob.id), /permission/);
    setProjectMethod(ws, project.id, 'service', false, alice.id);
    assert.throws(() => setProjectMethod(ws, project.id, 'issues', false, alice.id), /method-required/);
  });

  test('people get View, Edit or Lead; only managers change it; the main lead stays a lead', () => {
    const { ws, admin, alice, bob } = company();
    const team = createTeam(ws, { name: 'Data', leadId: alice.id }, admin.id);
    const project = newProject(ws, { name: 'Lake', key: 'LAKE', teamId: team.id, leadId: alice.id }, alice.id);
    setProjectAccess(ws, project.id, bob.id, 'view', alice.id);
    assert.equal(accessOf(ws, project, bob.id), 'view');
    setProjectAccess(ws, project.id, bob.id, 'edit', alice.id);
    assert.equal(accessOf(ws, project, bob.id), 'edit');
    assert.throws(() => setProjectAccess(ws, project.id, admin.id, 'lead', bob.id), /permission/);
    assert.throws(() => setProjectAccess(ws, project.id, alice.id, 'view', admin.id), /lead-required/);
    setProjectAccess(ws, project.id, bob.id, '', alice.id);
    assert.equal(accessOf(ws, project, bob.id), '');
  });
});

describe('Page spaces', () => {
  test('company pages are for everyone, team pages for members, project pages for its people', () => {
    const { ws, admin, alice, bob } = company();
    const team = createTeam(ws, { name: 'Finance', leadId: alice.id }, admin.id);
    const space = teamSpace(ws, team);
    const shared = ws.spaces.find((item) => item.scope === 'company');
    assert.equal(canSeeSpace(ws, shared, bob.id), true);
    assert.equal(canSeeSpace(ws, space, alice.id), true);
    assert.equal(canSeeSpace(ws, space, bob.id), false);
    assert.equal(canSeeSpace(ws, space, admin.id), true);
    setTeamMember(ws, team.id, bob.id, 'member', alice.id);
    assert.ok(visibleSpaces(ws, bob.id).includes(space));
  });
});

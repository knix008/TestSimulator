// The company's shape: Company → Teams → Projects, and Pages (spaces) for the company, each team and each project.
//
//   Team      people who work together; a team owns projects and has its own page space.
//   Project   work inside a team. How it is run is a set of management methods (issue list, Kanban,
//             Scrum, roadmap, releases, service queues); a board or an issue list is one way, not the project.
//   Access    each project lists its people with View, Edit or Lead. Deleting a project is the
//             administrator's alone for now (canDeleteProject in store.js).
//   Pages     a space is scoped to the company (everyone), a team (its members) or a project (its people).
import { isWorkspaceAdmin, participatesIn, rolesOf } from './permissions.js';
import { nowIso, uid } from './util.js';
import { ensureQualityTypes } from './requirements.js';

/** How a project can be run. `views` are the screens the method brings into the project's navigation. */
export const METHODS = [
  { id: 'issues', glyph: 'issues', ko: '이슈 목록', en: 'Issue list', views: ['issues', 'filters'], aboutKo: '이슈를 목록과 질의로 관리합니다.', aboutEn: 'Track work as issues in lists and queries.' },
  { id: 'kanban', glyph: 'board', ko: '칸반', en: 'Kanban', views: ['board'], aboutKo: '열을 따라 카드를 옮기며 흐름을 봅니다.', aboutEn: 'Move cards across columns and watch the flow.' },
  { id: 'scrum', glyph: 'backlog', ko: '스크럼', en: 'Scrum', views: ['backlog', 'board'], aboutKo: '백로그와 스프린트로 일정한 주기를 돕니다.', aboutEn: 'Work in sprints planned from a backlog.' },
  { id: 'roadmap', glyph: 'roadmap', ko: '로드맵', en: 'Roadmap', views: ['roadmap', 'timeline'], aboutKo: '에픽과 이슈를 시간 축에 놓고 의존 관계를 잇습니다.', aboutEn: 'Lay epics and issues out on a timeline with their dependencies.' },
  { id: 'releases', glyph: 'release', ko: '릴리스', en: 'Releases', views: ['releases', 'components'], aboutKo: '버전과 구성 요소로 결과물을 묶습니다.', aboutEn: 'Group the work into versions and components.' },
  { id: 'service', glyph: 'request', ko: '서비스 대기열', en: 'Service queues', views: ['queues', 'portal'], aboutKo: '요청을 대기열과 고객 포털로 받습니다.', aboutEn: 'Take requests through queues and a customer portal.' },
  { id: 'schedule', glyph: 'roadmap', ko: '일정 계획', en: 'Schedule', views: ['schedule'], aboutKo: 'MS-Project처럼 작업, 기간, 선행 관계로 일정을 짜고 간트 차트로 봅니다. 칸반이나 스크럼으로 전환할 수 있습니다.', aboutEn: 'Plan tasks, durations and dependencies on a Gantt chart, like Microsoft Project, and switch to Kanban or Scrum when ready.' },
  { id: 'requirements', glyph: 'flag', ko: '요구 사항 추적', en: 'Requirements', views: ['requirements', 'trace'], aboutKo: '요구 사항을 구현 이슈와 테스트에 이어 추적 매트릭스로 봅니다.', aboutEn: 'Trace requirements to the work and the tests in a matrix.' },
  { id: 'testing', glyph: 'check', ko: '테스트 관리', en: 'Test management', views: ['tests', 'executions'], aboutKo: '테스트 케이스와 단계, 실행 결과, 발견한 결함을 관리합니다.', aboutEn: 'Test cases with steps, test runs, results and the defects they find.' },
];

/** Screens every project has, whatever its methods. */
export const PROJECT_VIEWS = ['home', 'planner', 'dashboard', 'reports', 'health'];

export const DEFAULT_METHODS = {
  software: ['issues', 'scrum', 'kanban', 'roadmap', 'releases', 'schedule'],
  business: ['issues', 'kanban', 'schedule'],
  service: ['issues', 'service'],
};

/** What a person may do in one project. */
export const ACCESS = [
  { id: 'view', role: 'viewer', glyph: 'eye', ko: '보기', en: 'View' },
  { id: 'edit', role: 'developer', glyph: 'pencil', ko: '편집', en: 'Edit' },
  { id: 'lead', role: 'administrator', glyph: 'shield', ko: '책임자', en: 'Lead' },
];

const METHOD_IDS = new Set(METHODS.map((method) => method.id));

export function projectMethods(project) {
  const listed = Array.isArray(project?.methods) ? project.methods.filter((id) => METHOD_IDS.has(id)) : [];
  return listed.length ? listed : [...(DEFAULT_METHODS[project?.type] || DEFAULT_METHODS.software)];
}

/** The screens a project shows: its own screens plus those its methods bring. */
export function projectViews(project) {
  const views = new Set(PROJECT_VIEWS);
  for (const id of projectMethods(project)) for (const view of METHODS.find((method) => method.id === id)?.views || []) views.add(view);
  return views;
}

/** Fills in methods for a project made before methods existed: from its type and the boards it has. */
export function upgradeMethods(project) {
  if (Array.isArray(project.methods) && project.methods.some((id) => METHOD_IDS.has(id))) {
    project.methods = project.methods.filter((id) => METHOD_IDS.has(id));
    return project;
  }
  const methods = new Set(DEFAULT_METHODS[project.type] || DEFAULT_METHODS.software);
  for (const board of project.boards || []) if (board.type === 'kanban' || board.type === 'scrum') methods.add(board.type);
  if ((project.queues || []).length) methods.add('service');
  project.methods = METHODS.map((method) => method.id).filter((id) => methods.has(id));
  ensureQualityTypes(project);
  return project;
}

function actorOf(ws, actorId) {
  return (ws.users || []).find((user) => user.id === actorId && user.active !== false) || null;
}

function mustTeam(ws, teamId) {
  const team = (ws.teams || []).find((item) => item.id === teamId);
  if (!team) throw new Error('not-found');
  return team;
}

function teamKey(ws, name) {
  const letters = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let base = /^[A-Z]/.test(letters) ? letters.slice(0, 6) : 'TEAM';
  if (base.length < 2) base = 'TEAM';
  let key = base;
  let n = 2;
  while ((ws.teams || []).some((team) => team.key === key)) { key = `${base}${n}`.slice(0, 10); n += 1; }
  return key;
}

export function isTeamMember(team, userId) {
  return Boolean(team && userId && (team.leadId === userId || (team.members || []).some((member) => member.userId === userId)));
}

export function isTeamLead(team, userId) {
  return Boolean(team && userId && (team.leadId === userId || (team.members || []).some((member) => member.userId === userId && member.role === 'lead')));
}

/** The administrator and the team's leads manage a team. */
export function canManageTeam(ws, team, actorId) {
  return isWorkspaceAdmin(actorOf(ws, actorId)) || isTeamLead(team, actorId);
}

/** Teams this person belongs to (the administrator sees every team). */
export function teamsOf(ws, userId) {
  const admin = isWorkspaceAdmin(actorOf(ws, userId));
  return (ws.teams || []).filter((team) => admin || isTeamMember(team, userId));
}

export function teamOfProject(ws, project) {
  return (ws.teams || []).find((team) => team.id === project?.teamId) || null;
}

export function projectsOfTeam(ws, teamId) {
  return (ws.projects || []).filter((project) => project.teamId === teamId);
}

export function createTeam(ws, input, actorId) {
  if (!isWorkspaceAdmin(actorOf(ws, actorId))) throw new Error('permission');
  const name = String(input?.name || '').trim();
  if (!name) throw new Error('name-required');
  ws.teams = Array.isArray(ws.teams) ? ws.teams : [];
  if (ws.teams.some((team) => team.name.toLowerCase() === name.toLowerCase())) throw new Error('duplicate-team');
  const key = String(input.key || '').trim().toUpperCase() || teamKey(ws, name);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw new Error('key-invalid');
  if (ws.teams.some((team) => team.key === key)) throw new Error('duplicate-key');
  const leadId = input.leadId && (ws.users || []).some((user) => user.id === input.leadId) ? input.leadId : actorId;
  const team = {
    id: uid('t'), key, name, description: String(input.description || ''), leadId,
    members: [{ userId: leadId, role: 'lead' }], created: nowIso(),
  };
  ws.teams.push(team);
  teamSpace(ws, team);
  return team;
}

export function updateTeam(ws, teamId, patch, actorId) {
  const team = mustTeam(ws, teamId);
  if (!canManageTeam(ws, team, actorId)) throw new Error('permission');
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('name-required');
    if (ws.teams.some((item) => item.id !== team.id && item.name.toLowerCase() === name.toLowerCase())) throw new Error('duplicate-team');
    team.name = name;
    const space = (ws.spaces || []).find((item) => item.teamId === team.id && item.scope === 'team');
    if (space) space.name = name;
  }
  if (patch.description != null) team.description = String(patch.description);
  if (patch.leadId) {
    if (!(ws.users || []).some((user) => user.id === patch.leadId)) throw new Error('not-found');
    team.leadId = patch.leadId;
    setTeamMember(ws, team.id, patch.leadId, 'lead', actorId);
  }
  return team;
}

/** A team with projects is refused; move or delete the projects first. */
export function deleteTeam(ws, teamId, actorId) {
  const team = mustTeam(ws, teamId);
  if (!isWorkspaceAdmin(actorOf(ws, actorId))) throw new Error('permission');
  if (projectsOfTeam(ws, team.id).length) throw new Error('team-has-projects');
  if ((ws.teams || []).length <= 1) throw new Error('team-last');
  ws.teams = ws.teams.filter((item) => item.id !== team.id);
  const space = (ws.spaces || []).find((item) => item.teamId === team.id && item.scope === 'team');
  if (space) {
    // The team's pages move to the company space instead of disappearing.
    const company = companySpace(ws);
    for (const page of ws.articles || []) if (page.spaceId === space.id) page.spaceId = company.id;
    ws.spaces = ws.spaces.filter((item) => item.id !== space.id);
  }
  return team;
}

/** role 'lead' | 'member' adds or changes a person; a falsy role takes them out. */
export function setTeamMember(ws, teamId, userId, role, actorId) {
  const team = mustTeam(ws, teamId);
  if (!canManageTeam(ws, team, actorId)) throw new Error('permission');
  if (!(ws.users || []).some((user) => user.id === userId)) throw new Error('not-found');
  team.members = (team.members || []).filter((member) => member.userId !== userId);
  if (role) {
    if (role !== 'lead' && role !== 'member') throw new Error('not-found');
    team.members.push({ userId, role });
  } else if (team.leadId === userId) {
    team.leadId = team.members.find((member) => member.role === 'lead')?.userId || team.members[0]?.userId || '';
  }
  if (role === 'lead' && !team.leadId) team.leadId = userId;
  return team;
}

/** Moves a project to another team (administrator, or a lead of both teams). */
export function moveProjectToTeam(ws, projectId, teamId, actorId) {
  const project = (ws.projects || []).find((item) => item.id === projectId);
  if (!project) throw new Error('not-found');
  const target = mustTeam(ws, teamId);
  const from = teamOfProject(ws, project);
  if (!canManageTeam(ws, target, actorId) || (from && !canManageTeam(ws, from, actorId))) throw new Error('permission');
  project.teamId = target.id;
  return project;
}

/** A person's access in a project: 'lead', 'edit', 'view' or '' (not in it). */
export function accessOf(ws, project, userId) {
  if (!project || !userId) return '';
  const own = (project.members || []).find((member) => member.userId === userId);
  if (project.leadId === userId || own?.role === 'administrator') return 'lead';
  if (own?.role) return ['developer', 'tester'].includes(own.role) ? 'edit' : 'view';
  if (!participatesIn(ws, project, userId)) return '';
  const roles = rolesOf(ws, project, userId);
  if (roles.includes('administrator')) return 'lead';
  if (roles.some((role) => role === 'developer' || role === 'tester')) return 'edit';
  return 'view';
}

/** Gives a person View, Edit or Lead in a project, or takes them out ('' or null). */
export function setProjectAccess(ws, projectId, userId, access, actorId) {
  const project = (ws.projects || []).find((item) => item.id === projectId);
  if (!project) throw new Error('not-found');
  const team = teamOfProject(ws, project);
  const actor = actorOf(ws, actorId);
  const manages = isWorkspaceAdmin(actor) || accessOf(ws, project, actorId) === 'lead' || (team && isTeamLead(team, actorId));
  if (!manages) throw new Error('permission');
  if (!(ws.users || []).some((user) => user.id === userId)) throw new Error('not-found');
  if (userId === project.leadId && access !== 'lead') throw new Error('lead-required');
  project.members = (project.members || []).filter((member) => member.userId !== userId);
  if (access) {
    const level = ACCESS.find((item) => item.id === access);
    if (!level) throw new Error('not-found');
    project.members.push({ userId, role: level.role });
  }
  return project;
}

// ---- Pages: company, team and project spaces -------------------------------------------------

function spaceKeyFrom(ws, base) {
  let key = String(base || 'SPACE').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'SPACE';
  if (!/^[A-Z]/.test(key)) key = `S${key}`.slice(0, 8);
  let candidate = key;
  let n = 2;
  while ((ws.spaces || []).some((space) => space.key === candidate)) { candidate = `${key}${n}`.slice(0, 10); n += 1; }
  return candidate;
}

export function companySpace(ws) {
  ws.spaces = Array.isArray(ws.spaces) ? ws.spaces : [];
  let space = ws.spaces.find((item) => item.scope === 'company');
  if (!space) {
    space = { id: uid('sp'), key: spaceKeyFrom(ws, 'COMPANY'), name: '회사 공용', scope: 'company', projectId: '', teamId: '', description: '', authorId: '', updated: nowIso() };
    ws.spaces.unshift(space);
  }
  return space;
}

export function teamSpace(ws, team) {
  ws.spaces = Array.isArray(ws.spaces) ? ws.spaces : [];
  let space = ws.spaces.find((item) => item.scope === 'team' && item.teamId === team.id);
  if (!space) {
    space = { id: uid('sp'), key: spaceKeyFrom(ws, team.key), name: team.name, scope: 'team', projectId: '', teamId: team.id, description: '', authorId: team.leadId || '', updated: nowIso() };
    ws.spaces.push(space);
  }
  return space;
}

/** Who may open a space: everyone for the company, members for a team, the project's people for a project. */
export function canSeeSpace(ws, space, userId) {
  if (!space || !userId) return false;
  const actor = actorOf(ws, userId);
  if (!actor) return false;
  if (isWorkspaceAdmin(actor)) return true;
  if (space.scope === 'team') return isTeamMember((ws.teams || []).find((team) => team.id === space.teamId), userId);
  if (space.scope === 'project') {
    const project = (ws.projects || []).find((item) => item.id === space.projectId);
    return Boolean(project) && participatesIn(ws, project, userId);
  }
  return true;
}

export function visibleSpaces(ws, userId) {
  return (ws.spaces || []).filter((space) => canSeeSpace(ws, space, userId));
}

/**
 * Gives an older workspace its teams and space scopes: each old group becomes a team, and when there
 * are no teams at all one default team holds everybody. Every project then belongs to a team.
 */
export function ensureTeams(ws) {
  ws.teams = Array.isArray(ws.teams) ? ws.teams : [];
  const users = (ws.users || []).filter((user) => user.active !== false);
  const admin = users.find((user) => isWorkspaceAdmin(user)) || users[0] || null;
  if (!ws.teams.length) {
    for (const group of ws.groups || []) {
      const name = String(group.name || group.ko || group.en || '').trim();
      if (!name || ws.teams.some((team) => team.name === name)) continue;
      const ids = (group.userIds || []).filter((id) => (ws.users || []).some((user) => user.id === id));
      const leadId = ids[0] || admin?.id || '';
      ws.teams.push({ id: group.id || uid('t'), key: teamKey(ws, name), name, description: '', leadId, members: ids.map((id) => ({ userId: id, role: id === leadId ? 'lead' : 'member' })), created: nowIso() });
    }
  }
  const orphans = (ws.projects || []).filter((project) => !ws.teams.some((team) => team.id === project.teamId));
  if (!ws.teams.length || orphans.length) {
    let home = ws.teams.find((team) => team.isDefault);
    if (!home && !ws.teams.length) {
      home = { id: 't-default', key: 'TEAM', name: '기본 팀', description: '', leadId: admin?.id || '', members: users.map((user) => ({ userId: user.id, role: user.id === admin?.id ? 'lead' : 'member' })), isDefault: true, created: nowIso() };
      ws.teams.push(home);
    }
    home = home || ws.teams[0];
    for (const project of orphans) project.teamId = home.id;
  }
  for (const team of ws.teams) {
    team.members = Array.isArray(team.members) ? team.members.filter((member) => member && member.userId) : [];
    if (team.leadId && !team.members.some((member) => member.userId === team.leadId)) team.members.push({ userId: team.leadId, role: 'lead' });
  }
  return ws;
}

/** Scopes for spaces made before scopes existed, plus the company space and one space per team. */
export function ensureSpaceScopes(ws) {
  ws.spaces = Array.isArray(ws.spaces) ? ws.spaces : [];
  for (const space of ws.spaces) {
    if (space.scope === 'company' || space.scope === 'team' || space.scope === 'project') continue;
    space.scope = space.teamId ? 'team' : (space.projectId ? 'project' : 'company');
    // The space older versions made when there was no project was called "팀": it is the company's.
    if (space.scope === 'company' && space.name === '팀') {
      space.name = '회사 공용';
      if (space.key === 'TEAM' && !ws.spaces.some((item) => item.key === 'COMPANY')) space.key = 'COMPANY';
    }
  }
  companySpace(ws);
  for (const team of ws.teams || []) teamSpace(ws, team);
  return ws;
}

/** Turns a management method on or off for a project. At least one method stays on. */
export function setProjectMethod(ws, projectId, methodId, on, actorId) {
  const project = (ws.projects || []).find((item) => item.id === projectId);
  if (!project) throw new Error('not-found');
  const team = teamOfProject(ws, project);
  const actor = actorOf(ws, actorId);
  if (!isWorkspaceAdmin(actor) && accessOf(ws, project, actorId) !== 'lead' && !(team && isTeamLead(team, actorId))) throw new Error('permission');
  if (!METHOD_IDS.has(methodId)) throw new Error('not-found');
  const methods = new Set(projectMethods(project));
  if (on) methods.add(methodId);
  else methods.delete(methodId);
  if (!methods.size) throw new Error('method-required');
  project.methods = METHODS.map((method) => method.id).filter((id) => methods.has(id));
  ensureQualityTypes(project);
  return project;
}

export const ROLE_PERMISSIONS = {
  administrator: ['browse', 'create', 'edit', 'transition', 'assign', 'comment', 'work', 'attach', 'delete', 'sprint', 'admin'],
  developer: ['browse', 'create', 'edit', 'transition', 'assign', 'comment', 'work', 'attach', 'sprint'],
  tester: ['browse', 'create', 'edit', 'transition', 'comment', 'work', 'attach'],
  customer: ['browse', 'create', 'comment'],
  viewer: ['browse'],
};

export function isWorkspaceAdmin(user) {
  if (!user || user.active === false) return false;
  // The administrator is marked, so the administrator may change their ID. A workspace from before
  // the mark knew the administrator by the ID "admin" (upgradeWorkspace sets the mark).
  if (typeof user.admin === 'boolean') return user.admin;
  return String(user.login || '').toLowerCase() === 'admin';
}

/** Ancestors from the nearest parent upward. A broken or repeated link stops the walk. */
export function projectAncestors(ws, project) {
  const chain = [];
  const seen = new Set(project?.id ? [project.id] : []);
  let parentId = project?.parentId || '';
  while (parentId && !seen.has(parentId)) {
    const parent = (ws?.projects || []).find((item) => item.id === parentId);
    if (!parent) break;
    chain.push(parent);
    seen.add(parent.id);
    parentId = parent.parentId || '';
  }
  return chain;
}

/** A person takes part when they lead or belong to the project, or to one of its parents. */
export function participatesIn(ws, project, userId) {
  if (!project || !userId) return false;
  const user = (ws?.users || []).find((item) => item.id === userId);
  if (!user || user.active === false) return false;
  if (isWorkspaceAdmin(user)) return true;
  const seen = new Set();
  let current = project;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.leadId === userId) return true;
    if ((current.members || []).some((member) => member.userId === userId && member.role)) return true;
    current = current.parentId ? (ws?.projects || []).find((item) => item.id === current.parentId) : null;
  }
  return false;
}

/** Projects this person takes part in, parents before their children. */
export function participatingProjects(ws, userId) {
  return orderedProjects(ws).filter((project) => participatesIn(ws, project, userId));
}

/** Parents first, then each child, so a sub-project sits under its project. */
export function orderedProjects(ws) {
  const projects = ws?.projects || [];
  const known = new Set(projects.map((project) => project.id));
  const children = new Map();
  for (const project of projects) {
    const parentId = project.parentId && known.has(project.parentId) ? project.parentId : '';
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(project);
  }
  for (const list of children.values()) list.sort((left, right) => String(left.key).localeCompare(String(right.key)));
  const ordered = [];
  const walk = (parentId) => {
    for (const project of children.get(parentId) || []) {
      ordered.push(project);
      walk(project.id);
    }
  };
  walk('');
  return ordered;
}

export function rolesOf(ws, project, userId) {
  const roles = new Set();
  const seen = new Set();
  let current = project;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    for (const member of current.members || []) {
      if (member.userId === userId && member.role) roles.add(member.role);
    }
    if (current.leadId === userId) roles.add('administrator');
    current = current.parentId ? (ws?.projects || []).find((item) => item.id === current.parentId) : null;
  }
  const user = (ws?.users || []).find((item) => item.id === userId);
  if (isWorkspaceAdmin(user)) roles.add('administrator');
  if (roles.size === 0) roles.add('viewer');
  return [...roles];
}

/** A participant is read-only, or able to edit the project's issues. */
export function participantAccess(role) {
  return (ROLE_PERMISSIONS[role] || []).includes('edit') ? 'edit' : 'read';
}

export function roleForAccess(access) {
  return access === 'edit' ? 'developer' : 'viewer';
}

/** People in the lead's teams. When the lead is in none, every person in a team counts. */
export function sharesTeam(ws, leadId, userId) {
  const teams = ws?.teams || [];
  if (teams.length) {
    const inTeam = (team, id) => team.leadId === id || (team.members || []).some((member) => member.userId === id);
    const leadTeams = teams.filter((team) => inTeam(team, leadId));
    return (leadTeams.length ? leadTeams : teams).some((team) => inTeam(team, userId));
  }
  const groups = ws?.groups || [];
  const leadGroups = groups.filter((group) => (group.userIds || []).includes(leadId));
  const pool = leadGroups.length ? leadGroups : groups;
  return pool.some((group) => (group.userIds || []).includes(userId));
}

export function allowed(ws, project, userId, perm) {
  if (!project || !userId) return false;
  const user = (ws.users || []).find((item) => item.id === userId);
  if (!user || user.active === false) return false;
  const ok = rolesOf(ws, project, userId).some((role) => (ROLE_PERMISSIONS[role] || []).includes(perm));
  if (!ok) return false;
  if (project.archived && perm !== 'browse' && perm !== 'admin') return false;
  return true;
}

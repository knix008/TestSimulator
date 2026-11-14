export const ROLE_PERMISSIONS = {
  administrator: ['browse', 'create', 'edit', 'transition', 'assign', 'comment', 'work', 'attach', 'delete', 'sprint', 'admin'],
  developer: ['browse', 'create', 'edit', 'transition', 'assign', 'comment', 'work', 'attach', 'sprint'],
  tester: ['browse', 'create', 'edit', 'transition', 'comment', 'work', 'attach'],
  customer: ['browse', 'create', 'comment'],
  viewer: ['browse'],
};

export function rolesOf(ws, project, userId) {
  const roles = new Set((project?.members || []).filter((member) => member.userId === userId).map((member) => member.role));
  if (project?.leadId === userId) roles.add('administrator');
  if (roles.size === 0) roles.add('viewer');
  return [...roles];
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

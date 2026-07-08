import { getDatabase } from '../db/index.js';
import { getSystemDefaultProject } from './systemProject.js';

export const PROJECT_MEMBER_ROLES = new Set(['VIEWER', 'EDITOR']);

export function isAdmin(user) {
  return user?.role === 'ADMIN';
}

export function normalizeMemberRole(role) {
  const value = String(role || 'VIEWER').toUpperCase();
  return PROJECT_MEMBER_ROLES.has(value) ? value : 'VIEWER';
}

export async function getProjectMembership(db, user, projectId) {
  if (!user) return null;
  if (isAdmin(user)) {
    return { memberRole: 'EDITOR', canView: true, canEdit: true, canManage: true, isAdmin: true };
  }

  const row = await db.prepare(
    'SELECT member_role FROM project_members WHERE project_id = ? AND user_id = ?',
  ).get(projectId, user.id);

  if (!row) return null;

  const memberRole = normalizeMemberRole(row.member_role);
  return {
    memberRole,
    canView: true,
    canEdit: memberRole === 'EDITOR',
    canManage: memberRole === 'EDITOR',
    isAdmin: false,
  };
}

export async function userCanViewProject(db, user, projectId) {
  const membership = await getProjectMembership(db, user, projectId);
  return Boolean(membership?.canView);
}

export async function userCanEditProject(db, user, projectId) {
  const membership = await getProjectMembership(db, user, projectId);
  return Boolean(membership?.canEdit);
}

export async function userCanManageProject(db, user, projectId) {
  if (isAdmin(user)) return true;
  const membership = await getProjectMembership(db, user, projectId);
  return Boolean(membership?.canManage);
}

export async function userCanDeleteProject(db, user, project) {
  if (isAdmin(user)) return true;
  if (!project) return false;
  return userCanManageProject(db, user, project.id);
}

export async function userHasProjectAccess(db, user, projectId) {
  return userCanViewProject(db, user, projectId);
}

export async function listProjectsForUser(db, user, { manage = false } = {}) {
  if (isAdmin(user) && manage) {
    const rows = await db.prepare(`
      SELECT p.*, COUNT(r.id) AS requirement_count
      FROM projects p
      LEFT JOIN requirements r ON r.project_id = p.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all();
    return rows.map((row) => ({ ...row, member_role: 'EDITOR' }));
  }

  if (isAdmin(user)) {
    const rows = await db.prepare(`
      SELECT p.*, COUNT(r.id) AS requirement_count
      FROM projects p
      LEFT JOIN requirements r ON r.project_id = p.id
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all();
    return rows.map((row) => ({ ...row, member_role: 'EDITOR' }));
  }

  return db.prepare(`
    SELECT p.*, COUNT(r.id) AS requirement_count, pm.member_role
    FROM projects p
    LEFT JOIN requirements r ON r.project_id = p.id
    INNER JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all(user.id);
}

export async function getProjectMembers(db, projectId) {
  const rows = await db.prepare(`
    SELECT u.id, u.username, u.name, u.email, u.role AS global_role, u.is_active,
           pm.member_role, pm.assigned_at
    FROM project_members pm
    INNER JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
    ORDER BY u.name, u.username
  `).all(projectId);

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    email: r.email,
    globalRole: r.global_role,
    memberRole: normalizeMemberRole(r.member_role),
    isActive: Boolean(r.is_active),
    assignedAt: r.assigned_at,
  }));
}

export async function setProjectMembers(db, projectId, members = []) {
  const normalized = members
    .map((member) => ({
      userId: Number(member.userId ?? member.id),
      memberRole: normalizeMemberRole(member.memberRole),
    }))
    .filter((member) => !Number.isNaN(member.userId) && member.userId > 0);

  const unique = [];
  const seen = new Set();
  for (const member of normalized) {
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);
    unique.push(member);
  }

  await db.transaction(async (tx) => {
    await tx.prepare('DELETE FROM project_members WHERE project_id = ?').run(projectId);
    for (const member of unique) {
      const user = await tx.prepare('SELECT id, role FROM users WHERE id = ?').get(member.userId);
      if (!user || user.role === 'ADMIN') continue;
      await tx.prepare(
        'INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, ?)',
      ).run(projectId, member.userId, member.memberRole);
    }
  });
}

export async function addUserToProject(db, projectId, userId, memberRole = 'VIEWER') {
  const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!user || user.role === 'ADMIN') return;
  await db.prepare(
    `INSERT INTO project_members (project_id, user_id, member_role)
     VALUES (?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET member_role = excluded.member_role`,
  ).run(projectId, userId, normalizeMemberRole(memberRole));
}

export async function setUserProjects(db, userId, assignments = []) {
  const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('사용자를 찾을 수 없습니다.');
  if (user.role === 'ADMIN') return;

  const normalized = (Array.isArray(assignments) ? assignments : [])
    .map((item) => {
      if (typeof item === 'number') return { projectId: item, memberRole: 'VIEWER' };
      return {
        projectId: Number(item.projectId ?? item.id),
        memberRole: normalizeMemberRole(item.memberRole),
      };
    })
    .filter((item) => !Number.isNaN(item.projectId) && item.projectId > 0);

  await db.transaction(async (tx) => {
    await tx.prepare('DELETE FROM project_members WHERE user_id = ?').run(userId);
    for (const item of normalized) {
      const project = await tx.prepare('SELECT id FROM projects WHERE id = ?').get(item.projectId);
      if (!project) continue;
      await tx.prepare(
        'INSERT INTO project_members (project_id, user_id, member_role) VALUES (?, ?, ?)',
      ).run(item.projectId, userId, item.memberRole);
    }
  });
}

export async function getUserProjects(db, userId) {
  const rows = await db.prepare(`
    SELECT p.id, p.code, p.name, p.is_active, pm.member_role
    FROM project_members pm
    INNER JOIN projects p ON p.id = pm.project_id
    WHERE pm.user_id = ?
    ORDER BY p.name
  `).all(userId);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isActive: Boolean(r.is_active),
    memberRole: normalizeMemberRole(r.member_role),
  }));
}

export async function migrateProjectMemberRoleColumn(db) {
  const columns = await db.prepare('PRAGMA table_info(project_members)').all();
  const hasRole = columns.some((col) => col.name === 'member_role');
  if (!hasRole) {
    await db.exec("ALTER TABLE project_members ADD COLUMN member_role TEXT NOT NULL DEFAULT 'EDITOR'");
  }
}

export async function backfillProjectMembers(db) {
  await migrateProjectMemberRoleColumn(db);

  const countRow = await db.prepare('SELECT COUNT(*) AS count FROM project_members').get();
  if (Number(countRow?.count ?? 0) > 0) {
    await db.prepare("UPDATE project_members SET member_role = 'EDITOR' WHERE member_role IS NULL OR member_role = ''").run();
    return;
  }

  const defaultProject = await getSystemDefaultProject(db);
  if (!defaultProject) return;

  const users = await db.prepare("SELECT id, role FROM users WHERE role != 'ADMIN'").all();
  for (const user of users) {
    await db.prepare(
      "INSERT OR IGNORE INTO project_members (project_id, user_id, member_role) VALUES (?, ?, 'EDITOR')",
    ).run(defaultProject.id, user.id);
  }
}

export async function getRequirementProjectId(db, requirementId) {
  const row = await db.prepare('SELECT project_id FROM requirements WHERE id = ?').get(requirementId);
  return row?.project_id ?? null;
}

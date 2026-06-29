import { query, queryOne } from '../db.js';
import { isAdminRole } from './roles.js';

export const PROJECT_MEMBER_ROLES = ['member', 'project_admin'];
export const PROJECT_MEMBER_PERMISSIONS = ['view', 'edit'];
export const JOIN_REQUEST_STATUSES = ['pending', 'approved', 'rejected'];

export async function getProjectById(projectId) {
  return queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
}

export async function getProjectMembership(userId, projectId) {
  return queryOne(
    'SELECT * FROM project_members WHERE user_id = ? AND project_id = ?',
    [userId, projectId]
  );
}

export function parseProjectId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function canAccessProject(user, projectId) {
  if (!user || !projectId) return false;
  if (isAdminRole(user.role)) return true;
  const membership = await getProjectMembership(user.id, projectId);
  return !!membership;
}

export async function isProjectAdmin(user, projectId) {
  if (!user || !projectId) return false;
  if (isAdminRole(user.role)) return true;
  const membership = await getProjectMembership(user.id, projectId);
  return membership?.role === 'project_admin';
}

export async function canEditProjectContent(user, projectId) {
  if (!user || !projectId) return false;
  if (isAdminRole(user.role)) return true;
  const membership = await getProjectMembership(user.id, projectId);
  if (!membership) return false;
  if (membership.role === 'project_admin') return true;
  return membership.permission === 'edit';
}

export async function listUserProjects(userId) {
  return query(
    `SELECT p.id, p.code, p.name, p.description, p.status,
            pm.role AS member_role, pm.permission AS member_permission, pm.joined_at
     FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.user_id = ?
     ORDER BY p.name`,
    [userId]
  );
}

export async function assertRequirementProjectAccess(user, requirementId, needsEdit = false) {
  const row = await queryOne('SELECT * FROM requirements WHERE id = ?', [requirementId]);
  if (!row) return { ok: false, status: 404, error: 'Requirement not found' };
  if (!(await canAccessProject(user, row.project_id))) {
    return { ok: false, status: 403, error: 'Project access denied' };
  }
  if (needsEdit && !(await canEditProjectContent(user, row.project_id))) {
    return { ok: false, status: 403, error: 'Project edit permission required' };
  }
  return { ok: true, projectId: row.project_id, row };
}

export async function assertTestCaseProjectAccess(user, testCaseId, needsEdit = false) {
  const row = await queryOne(
    `SELECT tc.id, r.project_id
     FROM test_cases tc
     JOIN requirements r ON r.id = tc.requirement_id
     WHERE tc.id = ?`,
    [testCaseId]
  );
  if (!row) return { ok: false, status: 404, error: 'Test case not found' };
  if (!(await canAccessProject(user, row.project_id))) {
    return { ok: false, status: 403, error: 'Project access denied' };
  }
  if (needsEdit && !(await canEditProjectContent(user, row.project_id))) {
    return { ok: false, status: 403, error: 'Project edit permission required' };
  }
  return { ok: true, projectId: row.project_id, row };
}

export function mapProject(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberRole: row.member_role ?? null,
    memberPermission: row.member_permission ?? null,
    joinedAt: row.joined_at ?? null,
  };
}

export function mapProjectMember(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    permission: row.permission,
    joinedAt: row.joined_at,
  };
}

export function mapJoinRequest(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    message: row.message,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

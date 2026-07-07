const ROLE_RANK = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

export function hasRole(userRole, minRole) {
  if (!userRole) return false;
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

export function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    company: row.company,
    department: row.department,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

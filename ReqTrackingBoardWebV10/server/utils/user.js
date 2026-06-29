export function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email || '',
    role: row.role,
    permission: row.permission,
    theme: row.theme || 'default',
  };
}

export function validateEmail(email) {
  const trimmed = (email || '').trim();
  if (!trimmed) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Invalid email format';
  return null;
}

export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

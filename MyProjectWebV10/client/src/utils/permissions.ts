export function formatPermissionSummary(canRead: boolean, canModify: boolean): string {
  const parts: string[] = [];
  if (canRead) parts.push('읽기');
  if (canModify) parts.push('수정');
  return parts.length > 0 ? parts.join(', ') : '없음';
}

export function normalizePermissionInput(
  role: 'admin' | 'user',
  canRead: boolean,
  canModify: boolean,
): { canRead: boolean; canModify: boolean } {
  if (role === 'admin') {
    return { canRead: true, canModify: true };
  }
  if (canModify) {
    return { canRead: true, canModify: true };
  }
  return { canRead, canModify: false };
}

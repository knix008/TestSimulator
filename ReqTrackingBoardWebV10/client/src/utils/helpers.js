export function getStatusBadge(status) {
  const map = {
    'Draft': 'draft', 'Active': 'active', 'Approved': 'approved', 'Deprecated': 'deprecated',
    'Not Run': 'notrun', 'Passed': 'passed', 'Failed': 'failed', 'Blocked': 'blocked', 'In Progress': 'inprogress',
  };
  return map[status] || 'draft';
}

export function getPriorityBadge(priority) {
  const map = { 'Low': 'low', 'Medium': 'medium', 'High': 'high', 'Critical': 'critical' };
  return map[priority] || 'medium';
}

export const REQ_STATUSES = ['Draft', 'Active', 'Approved', 'Deprecated'];
export const TC_STATUSES = ['Not Run', 'In Progress', 'Passed', 'Failed', 'Blocked'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
export const CATEGORIES = ['General', 'Functional', 'Performance', 'Security', 'UI/UX', 'Integration'];

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

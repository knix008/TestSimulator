const PRIORITY_ORDER = ['LOW', 'MEDIUM', 'HIGH'];
const STATUS_ORDER = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE'];
const TC_STATUS_ORDER = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'];
const MEMBER_ROLE_ORDER = ['VIEWER', 'EDITOR'];
const GLOBAL_ROLE_ORDER = ['VIEWER', 'EDITOR', 'ADMIN'];

export const REQUIREMENTS_TABLE_SORT = {
  code: { type: 'string' },
  classification: { type: 'string' },
  title: { type: 'string' },
  description: { type: 'string' },
  category: { type: 'string' },
  assignee: { type: 'string', key: 'assigneeName' },
  priority: { type: 'enum', enumOrder: PRIORITY_ORDER },
  status: { type: 'enum', enumOrder: STATUS_ORDER },
  testCaseCount: { type: 'number' },
};

export const TEST_CASES_TABLE_SORT = {
  code: { type: 'string' },
  requirement: { type: 'string', key: 'requirementCode' },
  title: { type: 'string' },
  description: { type: 'string' },
  steps: { type: 'string' },
  expectedResult: { type: 'string' },
  status: { type: 'enum', enumOrder: TC_STATUS_ORDER },
  updatedAt: { type: 'date' },
};

export const PROJECTS_TABLE_SORT = {
  code: { type: 'string' },
  name: { type: 'string' },
  memberRole: { type: 'enum', enumOrder: MEMBER_ROLE_ORDER },
  isActive: { type: 'boolean' },
  requirementCount: { type: 'number' },
  updatedAt: { type: 'date' },
};

export const USERS_TABLE_SORT = {
  username: { type: 'string' },
  name: { type: 'string' },
  email: { type: 'string' },
  role: { type: 'enum', enumOrder: GLOBAL_ROLE_ORDER },
  isActive: { type: 'boolean' },
  createdAt: { type: 'date' },
};

export const REGISTRATION_REQUESTS_TABLE_SORT = {
  username: { type: 'string' },
  name: { type: 'string' },
  email: { type: 'string' },
  createdAt: { type: 'date' },
};

export const REQUIREMENT_FORM_TC_SORT = {
  code: { type: 'string' },
  title: { type: 'string' },
  description: { type: 'string' },
  status: { type: 'enum', enumOrder: TC_STATUS_ORDER },
};

function getCellValue(row, config, columnId) {
  if (typeof config.getValue === 'function') return config.getValue(row);
  const key = config.key ?? columnId;
  return row[key];
}

function compareString(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function compareNumber(a, b) {
  return (Number(a) || 0) - (Number(b) || 0);
}

function compareDate(a, b) {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
  if (!Number.isFinite(ta)) return -1;
  if (!Number.isFinite(tb)) return 1;
  return ta - tb;
}

function compareBoolean(a, b) {
  return Number(Boolean(a)) - Number(Boolean(b));
}

function compareEnum(a, b, enumOrder) {
  const ia = enumOrder.indexOf(a);
  const ib = enumOrder.indexOf(b);
  const safeA = ia === -1 ? enumOrder.length : ia;
  const safeB = ib === -1 ? enumOrder.length : ib;
  return safeA - safeB;
}

function compareByType(a, b, config) {
  switch (config.type) {
    case 'number':
      return compareNumber(a, b);
    case 'date':
      return compareDate(a, b);
    case 'boolean':
      return compareBoolean(a, b);
    case 'enum':
      return compareEnum(a, b, config.enumOrder || []);
    case 'string':
    default:
      return compareString(a, b);
  }
}

export function sortRows(rows, sortState, columnConfigs) {
  if (!sortState?.columnId || !sortState?.direction || !Array.isArray(rows)) return rows;

  const config = columnConfigs[sortState.columnId];
  if (!config) return rows;

  const dir = sortState.direction === 'desc' ? -1 : 1;

  return [...rows].sort((left, right) => {
    const a = getCellValue(left, config, sortState.columnId);
    const b = getCellValue(right, config, sortState.columnId);
    const cmp = compareByType(a, b, config);
    if (cmp !== 0) return cmp * dir;

    const leftId = Number(left?.id) || 0;
    const rightId = Number(right?.id) || 0;
    return (leftId - rightId) * dir;
  });
}

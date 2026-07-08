export const REQUIREMENTS_TABLE_COLUMN_DEFS = [
  { id: 'select', minWidth: 40, defaultWidth: 44 },
  { id: 'code', minWidth: 70, defaultWidth: 100 },
  { id: 'classification', minWidth: 80, defaultWidth: 120 },
  { id: 'title', minWidth: 120, defaultWidth: 280 },
  { id: 'description', minWidth: 140, defaultWidth: 260 },
  { id: 'category', minWidth: 80, defaultWidth: 120 },
  { id: 'assignee', minWidth: 120, defaultWidth: 160 },
  { id: 'priority', minWidth: 90, defaultWidth: 110 },
  { id: 'status', minWidth: 90, defaultWidth: 110 },
  { id: 'testCaseCount', minWidth: 50, defaultWidth: 70 },
  { id: 'actions', minWidth: 70, defaultWidth: 90 },
];

export function getVisibleRequirementsColumns(canEdit) {
  return REQUIREMENTS_TABLE_COLUMN_DEFS.filter((column) => column.id !== 'select' || canEdit);
}

export function resolveRequirementsColumnWidths(uiSettings, canEdit) {
  const saved = uiSettings?.requirementsTable?.columnWidths || {};
  const columns = getVisibleRequirementsColumns(canEdit);
  const widths = {};

  for (const column of columns) {
    const raw = Number(saved[column.id]);
    widths[column.id] = Number.isFinite(raw) && raw >= column.minWidth
      ? Math.round(raw)
      : column.defaultWidth;
  }

  return widths;
}

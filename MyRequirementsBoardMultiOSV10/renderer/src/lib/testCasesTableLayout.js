export const TEST_CASES_TABLE_COLUMN_DEFS = [
  { id: 'select', minWidth: 40, defaultWidth: 44 },
  { id: 'code', minWidth: 90, defaultWidth: 130 },
  { id: 'requirement', minWidth: 110, defaultWidth: 170 },
  { id: 'title', minWidth: 160, defaultWidth: 340 },
  { id: 'description', minWidth: 180, defaultWidth: 420 },
  { id: 'status', minWidth: 100, defaultWidth: 130 },
  { id: 'updatedAt', minWidth: 130, defaultWidth: 180 },
  { id: 'actions', minWidth: 80, defaultWidth: 96 },
];

export function getVisibleTestCasesColumns(canEdit) {
  return TEST_CASES_TABLE_COLUMN_DEFS.filter((column) => {
    if (column.id === 'select') return canEdit;
    if (column.id === 'actions') return canEdit;
    return true;
  });
}

export function resolveTestCasesColumnWidths(uiSettings, canEdit) {
  const saved = uiSettings?.testCasesTable?.columnWidths || {};
  const columns = getVisibleTestCasesColumns(canEdit);
  const widths = {};

  for (const column of columns) {
    const raw = Number(saved[column.id]);
    widths[column.id] = Number.isFinite(raw) && raw >= column.minWidth
      ? Math.round(raw)
      : column.defaultWidth;
  }

  return widths;
}

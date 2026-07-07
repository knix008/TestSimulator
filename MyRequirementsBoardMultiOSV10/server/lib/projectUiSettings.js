export function parseProjectUiSettings(raw) {
  if (!raw) return {};
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function mergeProjectUiSettings(existing, patch) {
  const base = parseProjectUiSettings(existing);
  const next = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};

  return {
    ...base,
    ...next,
    requirementsTable: {
      ...(base.requirementsTable || {}),
      ...(next.requirementsTable || {}),
      columnWidths: {
        ...(base.requirementsTable?.columnWidths || {}),
        ...(next.requirementsTable?.columnWidths || {}),
      },
    },
    testCasesTable: {
      ...(base.testCasesTable || {}),
      ...(next.testCasesTable || {}),
      columnWidths: {
        ...(base.testCasesTable?.columnWidths || {}),
        ...(next.testCasesTable?.columnWidths || {}),
      },
    },
  };
}

export function serializeProjectUiSettings(settings) {
  return JSON.stringify(parseProjectUiSettings(settings));
}

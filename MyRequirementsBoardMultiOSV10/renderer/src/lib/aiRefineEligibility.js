const PLACEHOLDER_VALUES = new Set(['—', '-', '–', 'null', 'undefined', 'n/a', 'na', 'none']);

function isEmptyValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return PLACEHOLDER_VALUES.has(text.toLowerCase());
}

function hasAnyEmptyField(item, fields) {
  return fields.some((field) => isEmptyValue(item?.[field]));
}

export function hasRequirementRefineGap(item) {
  return hasAnyEmptyField(item, ['title', 'description', 'category', 'classification']);
}

export function hasTestCaseRefineGap(item) {
  return hasAnyEmptyField(item, ['title', 'description', 'steps', 'expectedResult']);
}

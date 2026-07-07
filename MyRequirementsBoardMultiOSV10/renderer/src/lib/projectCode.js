export function normalizeProjectCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export function isValidProjectCode(raw) {
  return normalizeProjectCode(raw).length > 0;
}

function fmt(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function eq(actual, expected, message) {
  if (Object.is(actual, expected)) return;
  throw new Error(message || `expected ${fmt(expected)}\n         got ${fmt(actual)}`);
}

export function ok(value, message) {
  if (!value) throw new Error(message || 'expected a truthy value');
}

export function includes(haystack, needle, message) {
  if (!String(haystack).includes(needle)) {
    throw new Error(message || `expected ${fmt(needle)} inside the result`);
  }
}

export function deepEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(message || `expected ${b}\n         got ${a}`);
}

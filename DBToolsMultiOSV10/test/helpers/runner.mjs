// A tiny test runner — no dependencies, so `npm test` works straight after
// `npm install` without pulling a framework in.
//
// Usage inside a *.test.mjs file:
//   import { suite, test, expect } from '../helpers/runner.mjs';
//   suite('thing', () => { test('does x', () => { expect(1).toBe(1); }); });

const suites = [];
let current = null;

export function suite(name, body) {
  const entry = { name, tests: [] };
  suites.push(entry);
  const previous = current;
  current = entry;
  try {
    body();
  } finally {
    current = previous;
  }
}

export function test(name, fn) {
  if (!current) throw new Error(`test("${name}") must be inside a suite()`);
  current.tests.push({ name, fn });
}

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

function show(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Set) return `Set(${[...value].map(show).join(', ')})`;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function expect(actual) {
  return {
    toBe(expected, note) {
      if (!Object.is(actual, expected)) {
        throw new AssertionError(
          `expected ${show(expected)}, got ${show(actual)}${note ? ` (${note})` : ''}`,
        );
      }
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new AssertionError(`expected ${b}, got ${a}`);
    },
    toBeTruthy(note) {
      if (!actual) throw new AssertionError(`expected truthy, got ${show(actual)}${note ? ` (${note})` : ''}`);
    },
    toBeFalsy(note) {
      if (actual) throw new AssertionError(`expected falsy, got ${show(actual)}${note ? ` (${note})` : ''}`);
    },
    toContain(needle) {
      const ok = typeof actual === 'string' ? actual.includes(needle) : Array.isArray(actual) && actual.includes(needle);
      if (!ok) throw new AssertionError(`expected ${show(actual).slice(0, 120)} to contain ${show(needle)}`);
    },
    notToContain(needle) {
      const hit = typeof actual === 'string' ? actual.includes(needle) : Array.isArray(actual) && actual.includes(needle);
      if (hit) throw new AssertionError(`expected value not to contain ${show(needle)}`);
    },
    toMatch(regex) {
      if (!regex.test(String(actual))) {
        throw new AssertionError(`expected ${show(actual).slice(0, 120)} to match ${regex}`);
      }
    },
    toHaveLength(n) {
      const len = actual?.length;
      if (len !== n) throw new AssertionError(`expected length ${n}, got ${len}`);
    },
    toBeCloseTo(expected, tolerance = 0.001) {
      if (Math.abs(actual - expected) > tolerance) {
        throw new AssertionError(`expected ~${expected} (±${tolerance}), got ${actual}`);
      }
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) throw new AssertionError(`expected > ${n}, got ${actual}`);
    },
    toBeLessThanOrEqual(n) {
      if (!(actual <= n)) throw new AssertionError(`expected <= ${n}, got ${actual}`);
    },
    async toThrow(match) {
      let threw = false;
      let message = '';
      try {
        await actual();
      } catch (err) {
        threw = true;
        message = err instanceof Error ? err.message : String(err);
      }
      if (!threw) throw new AssertionError('expected the call to throw, it did not');
      if (match && !message.includes(match)) {
        throw new AssertionError(`expected the error to mention ${show(match)}, got ${show(message)}`);
      }
    },
  };
}

/** Run every registered suite. Returns { passed, failed, failures }. */
export async function runAll({ filter } = {}) {
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const s of suites) {
    if (filter && !s.name.toLowerCase().includes(filter.toLowerCase())) continue;
    const results = [];
    for (const t of s.tests) {
      try {
        await t.fn();
        passed++;
        results.push(null);
      } catch (err) {
        failed++;
        const detail = err instanceof Error ? err.message : String(err);
        failures.push({ suite: s.name, test: t.name, detail });
        results.push(detail);
      }
    }
    const bad = results.filter(Boolean).length;
    const mark = bad === 0 ? 'PASS' : 'FAIL';
    console.log(`${mark}  ${s.name} (${s.tests.length - bad}/${s.tests.length})`);
    s.tests.forEach((t, i) => {
      if (results[i]) console.log(`        ✗ ${t.name}\n          ${results[i]}`);
    });
  }

  return { passed, failed, failures };
}

export function resetSuites() {
  suites.length = 0;
}

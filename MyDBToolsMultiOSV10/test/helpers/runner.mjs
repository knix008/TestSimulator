// A tiny test runner — no dependencies, so `npm test` works straight after
// `npm install` without pulling a framework in.
//
// Usage inside a *.test.mjs file:
//   import { suite, test, expect } from '../helpers/runner.mjs';
//   suite('thing', () => { test('does x', () => { expect(1).toBe(1); }); });

import { c, pad, padStart, width, duration } from './colors.mjs';

const suites = [];
let current = null;
let sourceFile = null;

/**
 * Tag the suites registered from here on with the file they came from, so the
 * report can group them. The discovery loop sets this before each `import()`;
 * ESM evaluates imports one at a time, so the tag is always accurate.
 */
export function setSourceFile(label) {
  sourceFile = label;
}

export function suite(name, body) {
  const entry = { name, tests: [], file: sourceFile };
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

/** Anything slower than this is called out in yellow — it is usually I/O. */
const SLOW_SUITE_MS = 250;

/**
 * Indent and colour a (possibly multi-line) assertion message. Each line gets
 * its own colour span — spanning one across newlines leaves the colour dangling
 * in terminals that reset styling at the line break.
 */
function detailBlock(text, prefix) {
  return String(text)
    .split('\n')
    .map((line) => prefix + c.red(line))
    .join('\n');
}

/**
 * Run every registered suite, reporting as it goes.
 *
 * Returns { passed, failed, failures, suites, files, durationMs } — the extra
 * fields are what the caller needs to print the closing summary without
 * recomputing anything.
 */
export async function runAll({ filter } = {}) {
  const needle = filter?.toLowerCase();
  const selected = needle
    ? suites.filter((s) => s.name.toLowerCase().includes(needle))
    : suites;

  // One column width for the whole run, so the counts and timings line up
  // across files rather than jittering per section.
  const nameColumn = Math.min(
    56,
    selected.reduce((max, s) => Math.max(max, width(s.name)), 0),
  );

  let passed = 0;
  let failed = 0;
  const failures = [];
  const report = [];
  const files = new Map();
  const startedAll = Date.now();
  let currentFile = null;

  for (const s of selected) {
    if (s.file !== currentFile) {
      currentFile = s.file;
      console.log(`\n  ${c.bold(c.blue(currentFile ?? '(unknown file)'))}`);
    }

    const results = [];
    const startedSuite = Date.now();
    for (const t of s.tests) {
      try {
        await t.fn();
        passed++;
        results.push(null);
      } catch (err) {
        failed++;
        const detail = err instanceof Error ? err.message : String(err);
        failures.push({ suite: s.name, test: t.name, file: s.file, detail });
        results.push(detail);
      }
    }
    const elapsed = Date.now() - startedSuite;
    const bad = results.filter(Boolean).length;
    const good = s.tests.length - bad;
    const ok = bad === 0;

    const mark = ok ? c.green('✔') : c.red('✘');
    const label = ok ? c.grey(s.name) : c.red(c.bold(s.name));
    const count = ok
      ? c.grey(`${good}/${s.tests.length}`)
      : c.red(`${good}/${s.tests.length}`);
    const time = elapsed >= SLOW_SUITE_MS ? c.yellow(duration(elapsed)) : c.grey(duration(elapsed));

    console.log(
      `   ${mark} ${pad(label, nameColumn + 2)}${padStart(count, 8)}  ${padStart(time, 7)}`,
    );

    s.tests.forEach((t, i) => {
      if (!results[i]) return;
      console.log(`       ${c.red('✘')} ${c.bold(t.name)}`);
      console.log(detailBlock(results[i], '         '));
    });

    report.push({ name: s.name, file: s.file, passed: good, failed: bad, durationMs: elapsed });
    const fileStats = files.get(s.file) ?? { passed: 0, failed: 0, suites: 0, durationMs: 0 };
    fileStats.passed += good;
    fileStats.failed += bad;
    fileStats.suites += 1;
    fileStats.durationMs += elapsed;
    files.set(s.file, fileStats);
  }

  return {
    passed,
    failed,
    failures,
    suites: report,
    files,
    durationMs: Date.now() - startedAll,
    skippedSuites: suites.length - selected.length,
  };
}

export function resetSuites() {
  suites.length = 0;
}

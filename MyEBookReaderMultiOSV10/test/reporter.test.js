import { describe, it, expect } from 'vitest';
import {
  CATEGORIES, categoryOf, categoryLabel, fileStats, formatSummary, formatSummaryTable,
  formatFileBlock, formatProgressLine, groupByCategory, totals, formatDuration, stripAnsi, paint, useColor,
  testState, splitItemName, displayWidth, padDisplay,
} from './reporters/summary.mjs';

// The reporter is what the task's "results sorted by kind, with a summary" asks
// for, so it is tested like any other code.
const file = (name, tests) => ({
  name: `C:/project/test/${name}`,
  result: { duration: 12 },
  tasks: tests.map((test) => ({
    type: 'test',
    name: test.name,
    mode: test.mode || 'run',
    result: { state: test.state, duration: 1, errors: test.error ? [{ message: test.error }] : [] },
  })),
});

describe('categories', () => {
  it('sorts every test file into one of the printed groups', () => {
    expect(categoryOf('epub.test.js')).toBe('formats');
    expect(categoryOf('inflate.test.js')).toBe('engine');
    expect(categoryOf('settings.test.js')).toBe('state');
    expect(categoryOf('app.test.jsx')).toBe('gui');
    expect(categoryOf('i18n.test.js')).toBe('i18n');
    expect(categoryOf('package.test.js')).toBe('build');
  });

  it('has a heading for each one, and a fallback for anything new', () => {
    for (const category of CATEGORIES) expect(categoryLabel(category.id)).toBeTruthy();
    expect(categoryOf('something-new.test.js')).toBe('other');
    expect(categoryLabel('other')).toContain('Other');
  });

  it('never files one test file under two categories', () => {
    const seen = new Set();
    for (const category of CATEGORIES) {
      for (const name of category.files) {
        expect(seen.has(name), name).toBe(false);
        seen.add(name);
      }
    }
  });
});

describe('fileStats', () => {
  const stats = fileStats(file('epub.test.js', [
    { name: 'opens', state: 'pass' },
    { name: 'fails', state: 'fail', error: 'boom' },
    { name: 'skipped', state: 'skip' },
  ]));

  it('counts the results of one file', () => {
    expect(stats).toMatchObject({ name: 'epub.test.js', category: 'formats', pass: 1, fail: 1, skip: 1, total: 3 });
  });

  it('keeps the first line of a failure', () => {
    expect(stats.items.find((item) => item.state === 'fail').error).toBe('boom');
    expect(stats.failed).toEqual(['fails']);
  });

  it('reads a skipped test from its mode as well as its state', () => {
    expect(testState({ mode: 'skip' })).toBe('skip');
    expect(testState({ result: { state: 'pass' } })).toBe('pass');
  });
});

describe('the summary', () => {
  const rows = [
    fileStats(file('epub.test.js', [{ name: 'a', state: 'pass' }, { name: 'b', state: 'pass' }])),
    fileStats(file('app.test.jsx', [{ name: 'c', state: 'pass' }])),
    fileStats(file('view.test.js', [{ name: 'd', state: 'fail', error: 'nope' }])),
  ];

  it('groups the files by category, dropping the empty ones', () => {
    const groups = groupByCategory(rows);
    expect(groups.map((g) => g.id)).toEqual(['formats', 'engine', 'gui']);
  });

  it('adds the counts up', () => {
    expect(totals(rows)).toMatchObject({ files: 3, pass: 3, fail: 1, skip: 0 });
  });

  it('prints a heading, every category and the totals', () => {
    const text = stripAnsi(formatSummary(rows, { duration: 100 }));
    expect(text).toContain('MyEBookReader — 테스트 결과');
    expect(text).toContain('요약 (Summary)');
    expect(text).toContain('책 형식 (Formats)');
    expect(text).toContain('GUI 동작 (User interface)');
    expect(text).toContain('합계 (Total)');
    expect(text).toContain('실패 1');
    expect(text).toContain('전체 실패');
  });

  it('lays the summary out as a table whose columns line up', () => {
    const lines = stripAnsi(formatSummaryTable(rows)).split(String.fromCharCode(10)).filter((line) => line.includes('│'));
    expect(lines.length).toBeGreaterThan(2);
    // Every row puts its separators in exactly the same columns — measured the
    // way a terminal measures, so Korean labels line up with English ones.
    const columns = (line) => [...line].reduce((out, char, i) => (char === '│' ? [...out, displayWidth(line.slice(0, i))] : out), []);
    const first = columns(lines[0]);
    for (const line of lines) expect(columns(line)).toEqual(first);
  });

  it('says so plainly when everything passed', () => {
    const clean = [fileStats(file('zip.test.js', [{ name: 'a', state: 'pass' }]))];
    expect(stripAnsi(formatSummary(clean))).toContain('전체 성공');
  });

  it('prints a test on its own line while the run is still going', () => {
    const line = stripAnsi(formatProgressLine({
      index: 3,
      total: 12,
      file: 'epub.test.js',
      item: { name: 'opening › opens a book', state: 'pass', ms: 4 },
    }));
    expect(line).toContain('3/12');
    expect(line).toContain('✓');
    expect(line).toContain('epub.test.js');
    expect(line).toContain('opens a book');
    expect(line).toContain('4ms');
    const failed = stripAnsi(formatProgressLine({
      index: 4,
      total: 12,
      file: 'view.test.js',
      item: { name: 'layout › fits', state: 'fail', ms: 2, error: 'too wide' },
    }));
    expect(failed).toContain('✗');
    expect(failed).toContain('too wide');
  });

  it('lists each test under its file, with the failure message', () => {
    const block = stripAnsi(formatFileBlock(rows[2]));
    expect(block).toContain('view.test.js');
    expect(block).toContain('✗');
    expect(block).toContain('nope');
  });
});

describe('display width', () => {
  it('counts Korean as two columns and Latin as one', () => {
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('한글')).toBe(4);
    expect(displayWidth('책 형식 (Formats)')).toBe(7 + 10);
  });

  it('pads to a width the terminal agrees with', () => {
    expect(displayWidth(padDisplay('한글', 10))).toBe(10);
    expect(displayWidth(padDisplay('abc', 10, 'right'))).toBe(10);
    expect(padDisplay('abc', 6, 'right')).toBe('   abc');
  });
});

describe('formatting helpers', () => {
  it('formats a duration', () => {
    expect(formatDuration(120)).toBe('120ms');
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('splits a test name into its group and its title', () => {
    expect(splitItemName('suite › case')).toEqual({ group: 'suite', title: 'case' });
    expect(splitItemName('bare')).toEqual({ group: '', title: 'bare' });
  });

  it('colours only when colour is wanted', () => {
    expect(paint('red', 'x', false)).toBe('x');
    expect(stripAnsi(paint('red', 'x', true))).toBe('x');
    expect(useColor({ env: { NO_COLOR: '1' }, tty: true })).toBe(false);
    expect(useColor({ env: { FORCE_COLOR: '1' }, tty: false })).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectTests, fileStats, formatDuration, formatFileBlock, formatSummary,
  paint, splitItemName, stripAnsi, taskName, testState, useColor, MARK,
} from './reporters/summary.mjs';

function sampleFile() {
  return {
    name: 'test/comments.test.js',
    result: { duration: 12 },
    tasks: [
      {
        type: 'suite',
        name: 'comments',
        tasks: [
          { type: 'test', name: 'kind', result: { state: 'pass', duration: 2 } },
          {
            type: 'test',
            name: 'rects',
            result: { state: 'fail', duration: 4, errors: [{ message: 'expected 2\n  at test' }] },
          },
          { type: 'test', name: 'later', mode: 'skip' },
        ],
      },
    ],
  };
}

describe('summary reporter', () => {
  it('walks nested suites to count pass / fail / skip', () => {
    const file = sampleFile();
    const tests = collectTests(file.tasks);
    expect(tests).toHaveLength(3);
    const row = fileStats(file);
    expect(row).toMatchObject({
      name: 'comments.test.js', pass: 1, fail: 1, skip: 1, total: 3,
    });
    expect(row.failed[0]).toContain('rects');
    expect(taskName(tests[1])).toContain('rects');
    expect(row.items.map((t) => t.state)).toEqual(['pass', 'fail', 'skip']);
    expect(row.items[1].error).toBe('expected 2');
  });

  it('lists every test with a pass / fail / skip mark and no progress dots', () => {
    const row = fileStats(sampleFile());
    const text = formatFileBlock(row, { color: false });
    expect(text).toContain('comments.test.js');
    expect(text).toContain(`${MARK.pass}  comments › kind`);
    expect(text).toContain(`${MARK.fail}  comments › rects`);
    expect(text).toContain(`${MARK.skip}  comments › later`);
    expect(text).toContain('expected 2');
    expect(text).toContain('1 통과');
    expect(text).toContain('1 실패');
    expect(text).toContain('1 건너뜀');
    expect(text).not.toMatch(/\.{3}/);
  });

  it('prints a colourful report of files, items and totals', () => {
    const rows = [
      fileStats(sampleFile()),
      {
        name: 'b.test.js', pass: 8, fail: 0, skip: 2, ms: 1500, failed: [],
        items: [
          { name: 'ok', state: 'pass', ms: 3, error: '' },
          { name: 'later', state: 'skip', ms: 0, error: '' },
        ],
      },
    ];
    const plain = formatSummary(rows, { duration: 1512, color: false });
    expect(plain).toContain('테스트 결과');
    expect(plain).toContain('comments.test.js');
    expect(plain).toContain('b.test.js');
    expect(plain).toContain(`${MARK.pass}  ok`);
    expect(plain).toContain('파일 2개');
    expect(plain).toContain('통과 9');
    expect(plain).toContain('실패 1');
    expect(plain).toContain('건너뜀 3');
    expect(plain).not.toMatch(/\.{3}/);

    const color = formatSummary(rows, { duration: 1512, color: true });
    expect(color).toMatch(/\x1b\[96m/);
    expect(color).toMatch(/\x1b\[92m/);
    expect(color).toMatch(/\x1b\[91m/);
    expect(color).toMatch(/\x1b\[93m/);
    expect(stripAnsi(color)).toContain('테스트 결과');
    expect(stripAnsi(color)).toContain(`${MARK.fail}  comments › rects`);
    expect(color).toContain(paint('brightGreen', MARK.pass, true));
    expect(color).toContain(paint('brightRed', MARK.fail, true));
    expect(color).toContain(paint('green', 'comments.test.js', true));
    expect(color).toContain(paint('green', 'comments', true));
    expect(color).not.toMatch(/\x1b\[92m✓ {2}comments/);
    expect(color).not.toMatch(/\x1b\[32mok\x1b/);
    expect(formatDuration(20)).toBe('20ms');
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('colours the suite, not the item title, and keeps marks for pass / fail', () => {
    expect(splitItemName('TabBar › hides overflow')).toEqual({
      group: 'TabBar', title: 'hides overflow',
    });
    expect(splitItemName('kind')).toEqual({ group: '', title: 'kind' });
    const colored = formatFileBlock(fileStats(sampleFile()), { color: true });
    expect(colored).toContain(`${paint('brightGreen', MARK.pass, true)}  ${paint('green', 'comments', true)} › kind`);
    expect(colored).toContain(`${paint('brightRed', MARK.fail, true)}  ${paint('green', 'comments', true)} › rects`);
    expect(colored).not.toContain(paint('brightGreen', `${MARK.pass}  comments › kind`, true));
  });

  it('paints only when colour is enabled and respects NO_COLOR', () => {
    expect(paint('green', 'ok', false)).toBe('ok');
    expect(paint('green', 'ok', true)).toMatch(/^\x1b\[32mok\x1b\[0m$/);
    expect(useColor({ env: { NO_COLOR: '1' }, tty: true })).toBe(false);
    expect(useColor({ env: { FORCE_COLOR: '1' }, tty: false })).toBe(true);
    expect(useColor({ env: {}, tty: true })).toBe(true);
    expect(useColor({ env: {}, tty: false })).toBe(false);
    expect(testState({ result: { state: 'todo' } })).toBe('skip');
    expect(testState({ mode: 'skip' })).toBe('skip');
  });

  it('does not use the vitest dot progress reporter', () => {
    const cfg = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'vite.config.mjs'), 'utf8');
    expect(cfg).toMatch(/reporters:\s*\[\s*'\.\/test\/reporters\/summary\.mjs'\s*\]/);
    expect(cfg).not.toMatch(/['"]dot['"]/);
  });
});

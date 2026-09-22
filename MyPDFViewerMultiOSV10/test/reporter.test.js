import { describe, it, expect } from 'vitest';
import {
  collectTests, fileStats, formatDuration, formatSummary, taskName,
} from './reporters/summary.mjs';

describe('summary reporter', () => {
  it('walks nested suites to count pass / fail / skip', () => {
    const file = {
      name: 'test/comments.test.js',
      result: { duration: 12 },
      tasks: [
        {
          type: 'suite',
          name: 'comments',
          tasks: [
            { type: 'test', name: 'kind', result: { state: 'pass' } },
            { type: 'test', name: 'rects', result: { state: 'fail' } },
            { type: 'test', name: 'later', mode: 'skip' },
          ],
        },
      ],
    };
    const tests = collectTests(file.tasks);
    expect(tests).toHaveLength(3);
    const row = fileStats(file);
    expect(row).toMatchObject({
      name: 'comments.test.js', pass: 1, fail: 1, skip: 1, total: 3,
    });
    expect(row.failed[0]).toContain('rects');
    expect(taskName(tests[1])).toContain('rects');
  });

  it('prints a table with totals and a failure list', () => {
    const text = formatSummary([
      { name: 'a.test.js', pass: 4, fail: 1, skip: 0, ms: 20, failed: ['broken'] },
      { name: 'b.test.js', pass: 8, fail: 0, skip: 2, ms: 1500, failed: [] },
    ], { duration: 1520 });
    expect(text).toContain('테스트 결과');
    expect(text).toContain('a.test.js');
    expect(text).toContain('파일 2개');
    expect(text).toContain('통과 12');
    expect(text).toContain('실패 1');
    expect(text).toContain('실패한 테스트');
    expect(text).toContain('broken');
    expect(formatDuration(20)).toBe('20ms');
    expect(formatDuration(1500)).toBe('1.5s');
  });
});

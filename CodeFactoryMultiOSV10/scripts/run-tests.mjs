// Test runner with categorized output.
//
// `node --test` prints one flat stream, which for 150+ tests tells you nothing
// at a glance. This runner groups the results by category (one per test file,
// labelled by what it covers), prints each group with its own pass/fail tally,
// and then prints a separate summary block — so "what broke" and "how are we
// doing overall" are two distinct things to read, not one long list.
//
//   node scripts/run-tests.mjs            categorized output
//   node scripts/run-tests.mjs --verbose  every test name, not just failures
//   node scripts/run-tests.mjs --json     machine-readable summary

import { run } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const testDir = path.join(root, 'test');

/** What each test file covers, in the order the report should read. */
const CATEGORIES = [
  { file: 'text.test.mjs', ko: '소스 텍스트 처리', en: 'Source text handling', detail: '마스킹·줄 수 계산·오프셋 인덱스' },
  { file: 'functions.test.mjs', ko: '함수 추출', en: 'Function extraction', detail: '12개 언어의 선언·본문 범위' },
  { file: 'complexity.test.mjs', ko: '복잡도 메트릭', en: 'Complexity metrics', detail: '순환·인지 복잡도, MI, Halstead' },
  { file: 'graph.test.mjs', ko: '호출 그래프·구조', en: 'Call graph & structure', detail: '호출 관계, 순환, 타입·상속, 시퀀스' },
  { file: 'inspections.test.mjs', ko: '검사 규칙', en: 'Inspections', detail: '중복 코드, 전역 변수, 버그 위험, 보안' },
  { file: 'database.test.mjs', ko: '데이터베이스 분석', en: 'Database analysis', detail: '스키마·ORM·테이블 접근·카탈로그' },
  { file: 'settings.test.mjs', ko: '설정·집계', en: 'Settings & rollups', detail: '임계값, 언어 레지스트리, 파일·패키지 집계' },
  { file: 'report.test.mjs', ko: '보고서 생성', en: 'Report generation', detail: 'HTML·Markdown·Word·CSV 출력' },
  { file: 'analyze.test.mjs', ko: '통합(End-to-End)', en: 'End-to-end', detail: '다언어 프로젝트 전체 분석 파이프라인' },
];

const args = new Set(process.argv.slice(2));
const verbose = args.has('--verbose') || args.has('-v');
const asJson = args.has('--json');

const color = process.stdout.isTTY && !asJson;
const c = {
  reset: color ? '[0m' : '',
  dim: color ? '[2m' : '',
  bold: color ? '[1m' : '',
  green: color ? '[32m' : '',
  red: color ? '[31m' : '',
  yellow: color ? '[33m' : '',
  cyan: color ? '[36m' : '',
};

const files = fs
  .readdirSync(testDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => path.join(testDir, name));

// Files the category table does not name still run — they land in "기타".
const known = new Set(CATEGORIES.map((entry) => entry.file));
const ordered = [
  ...CATEGORIES.filter((entry) => files.some((f) => path.basename(f) === entry.file)),
  ...files.filter((f) => !known.has(path.basename(f))).map((f) => ({ file: path.basename(f), ko: '기타', en: 'Other', detail: '' })),
];

const results = new Map(ordered.map((entry) => [entry.file, { ...entry, tests: [], pass: 0, fail: 0, skip: 0, durationMs: 0 }]));

function bucketFor(fileName) {
  if (!fileName) return null;
  const base = path.basename(fileName);
  if (!results.has(base)) {
    results.set(base, { file: base, ko: '기타', en: 'Other', detail: '', tests: [], pass: 0, fail: 0, skip: 0, durationMs: 0 });
  }
  return results.get(base);
}

const stream = run({ files, concurrency: 1 });

// The TestsStream only emits its `test:*` events while it is flowing, and
// attaching listeners for custom event names does not start the flow — a
// `data` listener does. Without this the run produces no output at all.
stream.on('data', () => {});

stream.on('test:pass', (event) => {
  // Node emits a `test:pass` for the file-level suite too; skip those so the
  // counts match the number of real assertions-bearing tests.
  if (event.nesting !== 0 || !event.file) return;
  const bucket = bucketFor(event.file);
  if (!bucket) return;
  if (event.skip || event.todo) {
    bucket.skip++;
    bucket.tests.push({ name: event.name, status: 'skip' });
    return;
  }
  bucket.pass++;
  bucket.durationMs += event.details ? event.details.duration_ms || 0 : 0;
  bucket.tests.push({ name: event.name, status: 'pass', durationMs: event.details ? event.details.duration_ms : 0 });
});

stream.on('test:fail', (event) => {
  if (event.nesting !== 0 || !event.file) return;
  const bucket = bucketFor(event.file);
  if (!bucket) return;
  bucket.fail++;
  bucket.durationMs += event.details ? event.details.duration_ms || 0 : 0;

  const error = event.details && event.details.error;
  const cause = error && error.cause ? error.cause : error;
  bucket.tests.push({
    name: event.name,
    status: 'fail',
    message: (cause && (cause.message || String(cause))) || 'failed',
    expected: cause && 'expected' in cause ? format(cause.expected) : undefined,
    actual: cause && 'actual' in cause ? format(cause.actual) : undefined,
    stack: cause && cause.stack ? String(cause.stack).split('\n').slice(1, 3).join('\n') : '',
  });
});

stream.on('end', () => report());
stream.on('error', (error) => {
  console.error('[run-tests] runner error:', error);
  process.exitCode = 1;
});

function format(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function bar(pass, total, width = 22) {
  if (total === 0) return c.dim + '─'.repeat(width) + c.reset;
  const filled = Math.round((pass / total) * width);
  const tone = pass === total ? c.green : c.red;
  return tone + '█'.repeat(filled) + c.reset + c.dim + '░'.repeat(width - filled) + c.reset;
}

function report() {
  const groups = [...results.values()].filter((group) => group.tests.length > 0);

  const totals = groups.reduce(
    (acc, group) => ({
      pass: acc.pass + group.pass,
      fail: acc.fail + group.fail,
      skip: acc.skip + group.skip,
      durationMs: acc.durationMs + group.durationMs,
    }),
    { pass: 0, fail: 0, skip: 0, durationMs: 0 },
  );
  const total = totals.pass + totals.fail + totals.skip;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          totals: { ...totals, total },
          categories: groups.map((group) => ({
            file: group.file,
            name: group.ko,
            nameEn: group.en,
            detail: group.detail,
            pass: group.pass,
            fail: group.fail,
            skip: group.skip,
            durationMs: Math.round(group.durationMs),
            failures: group.tests.filter((entry) => entry.status === 'fail'),
          })),
        },
        null,
        2,
      ),
    );
    process.exitCode = totals.fail > 0 ? 1 : 0;
    return;
  }

  // ---------------------------------------------------- per-category detail
  console.log('');
  console.log(c.bold + 'CodeFactory — 단위 테스트 결과 / Unit test results' + c.reset);
  console.log(c.dim + '─'.repeat(78) + c.reset);

  for (const group of groups) {
    const groupTotal = group.pass + group.fail + group.skip;
    const ok = group.fail === 0;
    const mark = ok ? c.green + '✔' + c.reset : c.red + '✖' + c.reset;

    console.log('');
    console.log(
      mark + ' ' + c.bold + group.ko + c.reset + c.dim + '  ·  ' + group.en + c.reset,
    );
    if (group.detail) console.log('  ' + c.dim + group.detail + c.reset);
    console.log(
      '  ' + bar(group.pass, groupTotal) +
        '  ' + String(group.pass) + '/' + String(groupTotal) +
        (group.fail ? c.red + '  실패 ' + group.fail + c.reset : '') +
        (group.skip ? c.yellow + '  건너뜀 ' + group.skip + c.reset : '') +
        c.dim + '  ' + group.durationMs.toFixed(0) + 'ms  (' + group.file + ')' + c.reset,
    );

    if (verbose) {
      for (const entry of group.tests) {
        const glyph = entry.status === 'pass' ? c.green + '·' + c.reset : entry.status === 'skip' ? c.yellow + '-' + c.reset : c.red + '✖' + c.reset;
        console.log('    ' + glyph + ' ' + entry.name);
      }
    }

    for (const failure of group.tests.filter((entry) => entry.status === 'fail')) {
      console.log('    ' + c.red + '✖ ' + failure.name + c.reset);
      console.log('      ' + failure.message);
      if (failure.expected !== undefined || failure.actual !== undefined) {
        console.log('      ' + c.dim + 'expected: ' + failure.expected + '   actual: ' + failure.actual + c.reset);
      }
      if (failure.stack) console.log(c.dim + failure.stack.replace(/^/gm, '      ') + c.reset);
    }
  }

  // -------------------------------------------------------------- summary --
  console.log('');
  console.log(c.dim + '─'.repeat(78) + c.reset);
  console.log(c.bold + '요약 / Summary' + c.reset);
  console.log('');

  const pad = (text, width) => {
    const value = String(text);
    // Korean glyphs are double-width in a terminal; count them as two columns.
    const printed = [...value].reduce((acc, ch) => acc + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠]/.test(ch) ? 2 : 1), 0);
    return value + ' '.repeat(Math.max(0, width - printed));
  };

  console.log('  ' + pad('분류 / Category', 30) + pad('통과', 8) + pad('실패', 8) + pad('건너뜀', 10) + '시간');
  console.log('  ' + c.dim + '─'.repeat(66) + c.reset);
  for (const group of groups) {
    const failCell = group.fail > 0 ? c.red + pad(group.fail, 8) + c.reset : pad(group.fail, 8);
    console.log(
      '  ' + pad(group.ko, 30) + pad(group.pass, 8) + failCell + pad(group.skip, 10) + c.dim + group.durationMs.toFixed(0) + 'ms' + c.reset,
    );
  }
  console.log('  ' + c.dim + '─'.repeat(66) + c.reset);
  console.log('  ' + pad('합계 / Total', 30) + pad(totals.pass, 8) + pad(totals.fail, 8) + pad(totals.skip, 10) + c.dim + totals.durationMs.toFixed(0) + 'ms' + c.reset);
  console.log('');

  const rate = total === 0 ? 0 : Math.round((totals.pass / total) * 100);
  const verdict =
    totals.fail === 0
      ? c.green + '✔ 전체 ' + total + '개 테스트 통과 (' + rate + '%)' + c.reset
      : c.red + '✖ ' + totals.fail + '개 실패 / 전체 ' + total + '개 (' + rate + '% 통과)' + c.reset;

  console.log('  ' + verdict);
  console.log('  ' + bar(totals.pass, total, 40));
  console.log('');

  process.exitCode = totals.fail > 0 ? 1 : 0;
}

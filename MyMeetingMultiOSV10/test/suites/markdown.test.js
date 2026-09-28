import {
  stripLeadingNumberPrefix, stripHeadingNumbers, applyHeadingNumbering, renumberHeadings,
  getOutline, mergeFiles, mergeFilesAsync, SORT_ORDERS, sortFiles,
  parseExcludePatterns, isExcluded, renderHtml, documentExportBaseName, sanitizeExportName,
} from '../../src/lib/markdown.js';
import { eq, ok, includes, deepEq } from '../assert.js';

export const title = 'Markdown';

export default async function suite(test) {
  await test('제목 앞의 번호 토큰을 벗긴다', () => {
    eq(stripLeadingNumberPrefix('1.2.3 제목'), '제목');
    eq(stripLeadingNumberPrefix('(1) 제목'), '제목');
    eq(stripLeadingNumberPrefix('1) 제목'), '제목');
    eq(stripLeadingNumberPrefix('제목'), '제목');
  });

  await test('계층 번호를 붙이고 다시 매기며 코드 펜스는 건너뛴다', () => {
    const src = '# 제목\n\n## 가\n\n### 나\n\n```\n## 코드\n```\n\n## 다';
    const numbered = applyHeadingNumbering(src);
    includes(numbered, '# 1 제목');
    includes(numbered, '## 1.1 가');
    includes(numbered, '### 1.1.1 나');
    includes(numbered, '## 코드');
    includes(numbered, '## 1.2 다');
    const again = renumberHeadings(numbered);
    eq(again, numbered);
    const stripped = stripHeadingNumbers(numbered);
    includes(stripped, '# 제목');
    ok(!stripped.includes('# 1 '));
  });

  await test('개요는 펜스 안 제목을 빼고 순서 번호를 매긴다', () => {
    const items = getOutline('# A\n\n```\n## hidden\n```\n\n## B');
    eq(items.length, 2);
    eq(items[0].text, 'A');
    eq(items[0].level, 1);
    eq(items[0].index, 0);
    eq(items[1].text, 'B');
    eq(items[1].index, 1);
    eq(items[1].line, 6);
  });

  await test('여러 파일을 구분선으로 합치고 진행 상황을 알린다', async () => {
    const files = [
      { name: 'a.md', relPath: 'docs/a.md', content: '# A\n' },
      { name: 'b.md', relPath: 'docs/b.md', content: '# B' },
    ];
    const merged = mergeFiles(files, { insertFileHeaders: true });
    includes(merged, '## docs/a.md');
    includes(merged, '\n\n---\n\n');
    includes(merged, '## docs/b.md');
    eq(mergeFiles([]), '');
    const seen = [];
    const asyncMerged = await mergeFilesAsync(files, { insertFileHeaders: true }, (done, total, name) => {
      seen.push([done, total, name]);
    });
    eq(asyncMerged, merged);
    deepEq(seen, [[1, 2, 'docs/a.md'], [2, 2, 'docs/b.md']]);
  });

  await test('파일 목록을 이름과 날짜로 정렬한다', () => {
    const files = [
      { name: 'b.md', mtime: 2 },
      { name: 'a.md', mtime: 3 },
      { name: 'c.md', mtime: 1 },
    ];
    deepEq(SORT_ORDERS, ['nameAsc', 'nameDesc', 'dateNewest', 'dateOldest', 'custom']);
    deepEq(sortFiles(files, 'nameAsc').map((f) => f.name), ['a.md', 'b.md', 'c.md']);
    deepEq(sortFiles(files, 'nameDesc').map((f) => f.name), ['c.md', 'b.md', 'a.md']);
    deepEq(sortFiles(files, 'dateNewest').map((f) => f.name), ['a.md', 'b.md', 'c.md']);
    deepEq(sortFiles(files, 'dateOldest').map((f) => f.name), ['c.md', 'b.md', 'a.md']);
    deepEq(sortFiles(files, 'custom').map((f) => f.name), ['b.md', 'a.md', 'c.md']);
  });

  await test('제외 패턴은 경로 조각과 와일드카드에 맞춘다', () => {
    deepEq(parseExcludePatterns(' node_modules, , *.tmp '), ['node_modules', '*.tmp']);
    ok(isExcluded('src/node_modules/pkg/a.md', ['node_modules']));
    ok(isExcluded('notes/Foo.TMP', ['*.tmp']));
    ok(!isExcluded('notes/today.md', ['*.tmp', 'node_modules']));
    ok(!isExcluded('notes/today.md', []));
  });

  await test('HTML로 그리면 제목에 id를 달고 스크립트는 지운다', () => {
    const html = renderHtml('# 안녕\n\n**굵게**\n\n<script>alert(1)</script>\n\n<video controls src="data:video/mp4,xx"></video>');
    includes(html, 'id="h-0"');
    includes(html, '<strong>굵게</strong>');
    ok(!html.includes('<script'));
    ok(!html.includes('alert(1)'));
    includes(html, '<video');
    includes(html, 'controls');
    includes(html, '<strong>굵게</strong>');
    ok(!html.includes('<script'));
    ok(!html.includes('alert(1)'));
    includes(html, '<video');
    includes(html, 'controls');
  });

  await test('내보내기 파일 이름에서 번호와 확장자, 금지 문자를 뺀다', () => {
    eq(documentExportBaseName('# 1. 분기 회의'), '분기 회의');
    eq(documentExportBaseName(''), 'merged');
    eq(documentExportBaseName('   \n'), 'merged');
    eq(sanitizeExportName('My:File.pdf'), 'My_File');
    eq(sanitizeExportName('notes.docx'), 'notes');
    eq(sanitizeExportName(''), '');
  });
}

import {
  DEFAULT_EXPORT_SETTINGS, fontStack, toStandaloneHtml, buildMergedMarkdownDocument,
} from '../../src/lib/markdown.js';
import {
  exportMarkdown, exportHtml, exportPdf, exportWord, preparePrint, runPrint,
} from '../../src/lib/export.js';
import { eq, ok, includes } from '../assert.js';

export const title = '내보내기';

const MD = '# 기획 회의\n\n## 안건\n\n로드맵을 검토한다.\n';

export default async function suite(test) {
  await test('기본 내보내기 설정은 표지, 목차, 번호, 쪽번호를 켠다', () => {
    eq(DEFAULT_EXPORT_SETTINGS.numbering, true);
    eq(DEFAULT_EXPORT_SETTINGS.coverPage, true);
    eq(DEFAULT_EXPORT_SETTINGS.tocPage, true);
    eq(DEFAULT_EXPORT_SETTINGS.showPageNumber, true);
    eq(DEFAULT_EXPORT_SETTINGS.pageNumberPos, 'bottom-right');
    eq(DEFAULT_EXPORT_SETTINGS.pageNumberOnCover, false);
    eq(DEFAULT_EXPORT_SETTINGS.fontSizePt, 10);
  });

  await test('글꼴 스택은 고른 글꼴을 앞에 두고 한글 글꼴을 뒤에 둔다', () => {
    includes(fontStack(''), 'Malgun Gothic');
    ok(!fontStack('').startsWith('"'));
    includes(fontStack('Pretendard'), '"Pretendard"');
    includes(fontStack('Pretendard'), 'Apple SD Gothic Neo');
  });

  await test('HTML 문서는 표지, 목차, A4, 쪽번호를 담는다', () => {
    const html = toStandaloneHtml(MD, '기획 회의', {
      coverTitle: '2026 기획',
      coverAuthor: 'SHKWON',
      coverVersion: '1.0',
      coverDate: '2026-09-26',
      headerText: 'MyMeeting',
      fontFamily: 'Pretendard',
      contentsLabel: '차례',
    });
    includes(html, '<!DOCTYPE html>');
    includes(html, 'class="cover"');
    includes(html, '2026 기획');
    includes(html, 'SHKWON');
    includes(html, '1.0');
    includes(html, '2026-09-26');
    includes(html, '차례');
    includes(html, '안건');
    includes(html, '@page{size:A4');
    includes(html, 'counter(page)');
    includes(html, '@page:first');
    includes(html, 'Pretendard');
    includes(html, 'id="h-0"');
  });

  await test('표지와 목차를 끄면 그 구역이 빠진다', () => {
    const html = toStandaloneHtml(MD, '기획 회의', {
      coverPage: false,
      tocPage: false,
      showPageNumber: false,
      headerText: '',
    });
    ok(!html.includes('class="cover"'));
    ok(!html.includes('class="toc"'));
    ok(!html.includes('counter(page)'));
  });

  await test('Word용 HTML은 Office 표식과 쪽 나눔을 넣는다', () => {
    const html = toStandaloneHtml(MD, '기획 회의', { forWord: true, coverAuthor: 'SHKWON' });
    includes(html, 'Word.Document');
    includes(html, 'urn:schemas-microsoft-com:office:word');
    includes(html, 'page-break-before:always');
  });

  await test('Markdown 내보내기 문서는 표지와 차례를 가로선으로 잇는다', () => {
    const doc = buildMergedMarkdownDocument(MD, {
      coverPage: true,
      tocPage: true,
      coverTitle: '2026 기획',
      coverAuthor: 'SHKWON',
      coverVersion: '1.0',
      coverDate: '2026-09-26',
      contentsLabel: '차례',
    });
    includes(doc, '# 2026 기획');
    includes(doc, 'SHKWON');
    includes(doc, '## 차례');
    includes(doc, '- 기획 회의');
    includes(doc, '\n\n---\n\n');
    ok(doc.endsWith('\n'));
  });

  await test('Markdown, HTML, PDF, Word, 인쇄 함수를 제공한다', () => {
    for (const fn of [exportMarkdown, exportHtml, exportPdf, exportWord, preparePrint, runPrint]) {
      eq(typeof fn, 'function');
    }
  });
}

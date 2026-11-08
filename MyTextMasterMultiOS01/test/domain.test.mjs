// Pure modules: document kinds, text tools, outline, statistics, rendering, recent files, settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, baseName, dirName, untitledName, withExt, decodeText, encodeText, detectEol } from '../src/domain/doctypes.js';
import * as tools from '../src/domain/texttools.js';
import { markdownOutline, htmlOutline, slugify, textStats } from '../src/domain/outline.js';
import { markdownToHtml, standaloneHtml, titleOf, textPage } from '../src/domain/render.js';
import { addRecent, removeRecent, sessionOf, MAX_RECENT } from '../src/domain/recent.js';
import { normalizeSettings, DEFAULTS } from '../src/domain/settings.js';

test('document kinds come from the extension; unknown is text', () => {
  assert.equal(kindOf('C:\\docs\\read.ME.md'), 'markdown');
  assert.equal(kindOf('/x/page.HTM'), 'html');
  assert.equal(kindOf('notes.txt'), 'text');
  assert.equal(kindOf('config.json'), 'text');
  assert.equal(kindOf('Makefile'), 'text');
  assert.equal(baseName('C:\\a\\b\\c.md'), 'c.md');
  assert.equal(dirName('/home/u/c.md'), '/home/u');
  assert.equal(dirName('c.md'), '');
});

test('untitled names take the first free number; Save as fixes the extension', () => {
  assert.equal(untitledName('markdown', []), 'Untitled-1.md');
  assert.equal(untitledName('html', ['Untitled-1.html', 'Untitled-2.html'], '제목없음'), '제목없음-1.html');
  assert.equal(untitledName('html', ['Untitled-1.html']), 'Untitled-2.html');
  assert.equal(withExt('notes.txt', 'markdown'), 'notes.md');
  assert.equal(withExt('a.markdown', 'markdown'), 'a.markdown');
  assert.equal(withExt('plain', 'html'), 'plain.html');
});

test('line endings and BOM survive a round trip', () => {
  const raw = '\ufeffline 1\r\nline 2\r\n';
  const decoded = decodeText(raw);
  assert.deepEqual(decoded, { text: 'line 1\nline 2\n', eol: 'crlf', bom: true });
  assert.equal(encodeText(decoded.text, decoded), raw);
  assert.equal(detectEol('a\nb\r\nc\n'), 'lf');
  assert.equal(detectEol('single line'), 'lf');
  assert.equal(encodeText('a\r\nb', { eol: 'lf' }), 'a\nb');
});

test('case tools', () => {
  assert.equal(tools.toUpper('abc 가'), 'ABC 가');
  assert.equal(tools.toTitle('hello wORLD-wide (test)'), 'Hello World-Wide (Test)');
});

test('line tools: sort (numeric, case-insensitive), dedupe, trim, join, reverse', () => {
  assert.equal(tools.sortLines('b\nA\na10\na2'), 'A\na2\na10\nb');
  assert.equal(tools.sortLines('1\n3\n2', { descending: true }), '3\n2\n1');
  assert.equal(tools.removeDuplicateLines('x\ny\nx\ny\nz'), 'x\ny\nz');
  assert.equal(tools.trimTrailing('a  \nb\t\n c '), 'a\nb\n c');
  assert.equal(tools.removeEmptyLines('a\n\n  \nb'), 'a\nb');
  assert.equal(tools.joinLines(' a \n b\n\nc '), 'a b c');
  assert.equal(tools.reverseLines('1\n2\n3'), '3\n2\n1');
});

test('tabs and spaces convert by tab stops', () => {
  assert.equal(tools.tabsToSpaces('\tx\na\ty', 4), '    x\na   y');
  assert.equal(tools.spacesToTabs('      x\n  y', 4), '\t  x\n  y');
});

test('Markdown wrap and prefix toggle on and off', () => {
  assert.equal(tools.toggleWrap('word', '**'), '**word**');
  assert.equal(tools.toggleWrap('**word**', '**'), 'word');
  assert.equal(tools.togglePrefix('a\nb', '- '), '- a\n- b');
  assert.equal(tools.togglePrefix('- a\n- b', '- '), 'a\nb');
  assert.equal(tools.togglePrefix('a\nb\nc', '1. '), '1. a\n2. b\n3. c');
  assert.equal(tools.togglePrefix('1. a\n2. b', '1. '), 'a\nb');
  assert.equal(tools.togglePrefix('a\n\nb', '> '), '> a\n\n> b');
  assert.equal(tools.setHeading('## Title', 1), '# Title');
  assert.equal(tools.setHeading('Title', 3), '### Title');
  assert.equal(tools.setHeading('### Title', 0), 'Title');
});

test('tables: Markdown and HTML with the asked size', () => {
  const md = tools.markdownTable(2, 3, 'Col').split('\n');
  assert.equal(md.length, 5);
  assert.equal(md[0], '| Col 1 | Col 2 |');
  assert.match(md[1], /^\| -{3,} \| -{3,} \|$/);
  const html = tools.htmlTable(3, 2);
  assert.equal((html.match(/<th>/g) ?? []).length, 3);
  assert.equal((html.match(/<td>/g) ?? []).length, 6);
});

test('HTML formatting indents blocks and keeps <pre>, inline tags and comments', () => {
  const out = tools.formatHtml('<html><body><div><p>Hi <b>there</b></p><pre>  keep\n    this</pre><!-- note --><br></div></body></html>');
  assert.equal(out, [
    '<html>',
    '  <body>',
    '    <div>',
    '      <p>',
    '        Hi <b>there</b>',
    '      </p>',
    '      <pre>  keep\n    this</pre>',
    '      <!-- note -->',
    '      <br>',
    '    </div>',
    '  </body>',
    '</html>',
  ].join('\n'));
  assert.equal(tools.escapeHtmlText('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('Markdown outline: ATX and Setext headings, none inside code fences', () => {
  const text = '# One\n\ntext\n\nTwo\n---\n\n```\n# not a heading\n```\n\n### Three ###\n\n- item\n---\n';
  assert.deepEqual(markdownOutline(text), [
    { level: 1, text: 'One', line: 1 },
    { level: 2, text: 'Two', line: 5 },
    { level: 3, text: 'Three', line: 12 },
  ]);
  assert.deepEqual(markdownOutline('## [Link](http://x) and `code`'), [{ level: 2, text: 'Link and code', line: 1 }]);
});

test('HTML outline finds <h1>…<h6> with their lines and plain text', () => {
  const html = '<html>\n<body>\n<h1 class="x">Title &amp; more</h1>\n<p>x</p>\n<h2>\n  <span>Sub</span>\n</h2>\n</body>';
  assert.deepEqual(htmlOutline(html), [{ level: 1, text: 'Title & more', line: 3 }, { level: 2, text: 'Sub', line: 5 }]);
});

test('slugs keep Korean letters', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('한글 제목 2'), '한글-제목-2');
  assert.equal(slugify('***'), 'section');
});

test('text statistics count Korean and English words', () => {
  const text = 'Hello world.\n\n안녕하세요 반갑습니다';
  const s = textStats(text);
  assert.equal(s.words, 4);
  assert.equal(s.lines, 3);
  assert.equal(s.paragraphs, 2);
  assert.equal(s.chars, text.length);
  assert.equal(s.minutes, 1);
});

test('rendered Markdown carries source lines and unique heading ids', () => {
  const html = markdownToHtml('# A\n\npara\n\n# A\n\n| x |\n| - |\n| 1 |\n');
  assert.match(html, /data-line="1"><h1 id="a">A<\/h1>/);
  assert.match(html, /data-line="3"><p>para<\/p>/);
  assert.match(html, /data-line="5"><h1 id="a-1">A<\/h1>/);
  assert.match(html, /data-line="7"><table>/);
  assert.doesNotMatch(markdownToHtml('# A', { lines: false }), /data-line/);
});

test('reference links resolve in single-block rendering', () => {
  assert.match(markdownToHtml('See [docs][d].\n\n[d]: https://example.com'), /<a href="https:\/\/example.com">docs<\/a>/);
});

test('standalone HTML is a complete page with its title and style', () => {
  const page = standaloneHtml('# Hi & bye', { title: 'T & U', style: 'document', lang: 'en' });
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<title>T &amp; U<\/title>/);
  assert.match(page, /class="preview-body style-document"/);
  assert.match(page, /<h1 id="hi-bye">Hi &amp; bye<\/h1>/);
  assert.match(textPage('<b>', { title: 'x' }), /&lt;b&gt;/);
  assert.equal(titleOf('markdown', 'intro\n# Main title #\n'), 'Main title');
  assert.equal(titleOf('html', '<title> Page </title><h1>H</h1>'), 'Page');
  assert.equal(titleOf('html', '<h1>Only <i>h1</i></h1>'), 'Only h1');
  assert.equal(titleOf('text', 'x', 'fallback'), 'fallback');
});

test('recent files: newest first, no duplicates (case and slashes), limited', () => {
  let list = [];
  list = addRecent(list, 'C:\\a\\x.md');
  list = addRecent(list, 'C:\\a\\y.md');
  list = addRecent(list, 'c:/A/X.md');
  assert.deepEqual(list.map((item) => item.path), ['c:/A/X.md', 'C:\\a\\y.md']);
  assert.deepEqual(removeRecent(list, 'C:\\A\\Y.MD').map((item) => item.path), ['c:/A/X.md']);
  for (let i = 0; i < 40; i += 1) list = addRecent(list, `/f${i}.md`);
  assert.equal(list.length, MAX_RECENT);
});

test('the session keeps paths of saved files and the text of unsaved ones', () => {
  const session = sessionOf([
    { id: 1, name: 'a.md', path: '/a.md', kind: 'markdown', text: 'saved', dirty: false },
    { id: 2, name: 'Untitled-1.md', path: null, kind: 'markdown', text: 'draft', dirty: true, eol: 'lf' },
    { id: 3, name: 'b.txt', path: '/b.txt', kind: 'text', text: 'changed', dirty: true, eol: 'crlf' },
  ], 2);
  assert.equal(session.active, 1);
  assert.deepEqual(session.docs[0], { path: '/a.md', kind: 'markdown' });
  assert.equal(session.docs[1].text, 'draft');
  assert.equal(session.docs[2].path, '/b.txt');
  assert.equal(session.docs[2].dirty, true);
});

test('settings: broken values fall back to the defaults', () => {
  assert.deepEqual(normalizeSettings(null), { ...DEFAULTS });
  const s = normalizeSettings({ theme: 'nope', editorFontSize: 400, tabSize: 3, viewMode: 'preview', language: 'en', splitRatio: 2, wordWrap: 'yes' });
  assert.equal(s.theme, DEFAULTS.theme);
  assert.equal(s.editorFontSize, 32);
  assert.equal(s.tabSize, DEFAULTS.tabSize);
  assert.equal(s.viewMode, 'preview');
  assert.equal(s.language, 'en');
  assert.equal(s.splitRatio, 0.85);
  assert.equal(s.wordWrap, DEFAULTS.wordWrap);
});

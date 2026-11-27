// Note editor pure logic (src/editor: mdtext.js, table.js, htmlmd.js, foldranges.js): line prefixes,
// headings, tasks, wrapping marks, smart punctuation, focus ranges, completion contexts, tables,
// HTML → Markdown and fold ranges. The CodeMirror parts are checked in a browser (see the module docs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLine, toggleLinePrefixLines, setHeadingLine, headingOf, toggleTaskLine, cycleTaskLine, toggleWrap, smartPunctuation,
  paragraphAt, sentenceAt, linkContext, tagContext, emojiContext, slashContext, propertyContext, filterByQuery,
  frontMatterRange, nextFootnoteNumber, splitWikiLink, splitUrl, embedSize, headingBefore, displayWidth, codeLineTest,
  imageOptions, setImageOptions, droppedImage, imageMarkdown,
} from '../../src/editor/mdtext.js';
import {
  splitRow, tableRangeAt, parseTable, formatTable, formatTableLines, cellIndexAt, cellStart, addRow, addColumn, deleteRow, deleteColumn, newTable, isSeparatorLine,
} from '../../src/editor/table.js';
import { htmlToMarkdown, hasFormatting, parseHtml } from '../../src/editor/htmlmd.js';
import { foldRangeAt, linesDoc, codeLines } from '../../src/editor/foldranges.js';

const wrap = (text, from, to, before, after, ph) => {
  const r = toggleWrap(text, from, to, before, after, ph);
  const out = text.slice(0, r.from) + r.insert + text.slice(r.to);
  return { out, sel: out.slice(r.selFrom, r.selTo) };
};

test('parseLine splits quotes, list markers and task boxes', () => {
  assert.deepEqual(parseLine('  - [x] done'), { quote: '', indent: '  ', marker: '-', space: ' ', box: '[x] ', boxChar: 'x', body: 'done' });
  assert.equal(parseLine('> 1. one').marker, '1.');
  assert.equal(parseLine('> 1. one').quote, '> ');
  assert.equal(parseLine('plain').marker, '');
});

test('toggleLinePrefixLines toggles bullets, numbers, tasks and quotes on every line', () => {
  assert.deepEqual(toggleLinePrefixLines(['a', 'b'], '- '), ['- a', '- b']);
  assert.deepEqual(toggleLinePrefixLines(['- a', '- b'], '- '), ['a', 'b']);
  assert.deepEqual(toggleLinePrefixLines(['- a', 'b'], '- '), ['- a', '- b']);
  assert.deepEqual(toggleLinePrefixLines(['a', '', 'b'], '1. '), ['1. a', '', '2. b']);
  assert.deepEqual(toggleLinePrefixLines(['- a', '  - b', '- c'], '1. '), ['1. a', '  1. b', '2. c']);
  assert.deepEqual(toggleLinePrefixLines(['- a'], '- [ ] '), ['- [ ] a']);
  assert.deepEqual(toggleLinePrefixLines(['- [x] a', '- [ ] b'], '- [ ] '), ['a', 'b']);
  assert.deepEqual(toggleLinePrefixLines(['a', 'b'], '> '), ['> a', '> b']);
  assert.deepEqual(toggleLinePrefixLines(['> a', '>b'], '> '), ['a', 'b']);
  assert.deepEqual(toggleLinePrefixLines([''], '- '), ['- ']);
});

test('headings: set, clear and read', () => {
  assert.equal(setHeadingLine('Title', 2), '## Title');
  assert.equal(setHeadingLine('### Title', 1), '# Title');
  assert.equal(setHeadingLine('## Title', 0), 'Title');
  assert.equal(setHeadingLine('> # Quote', 3), '> ### Quote');
  assert.deepEqual(headingOf('## Hello ##'), { level: 2, text: 'Hello' });
  assert.equal(headingOf('#tag'), null);
  assert.equal(headingOf('####### seven'), null);
});

test('tasks toggle and cycle', () => {
  assert.equal(toggleTaskLine('buy milk'), '- [ ] buy milk');
  assert.equal(toggleTaskLine('  * item'), '  * [ ] item');
  assert.equal(toggleTaskLine('- [ ] x'), '- [x] x');
  assert.equal(toggleTaskLine('- [x] x'), '- [ ] x');
  assert.equal(cycleTaskLine('- [ ] x'), '- [/] x');
  assert.equal(cycleTaskLine('- [/] x'), '- [x] x');
  assert.equal(cycleTaskLine('- [x] x'), '- [-] x');
  assert.equal(cycleTaskLine('- [-] x'), '- [ ] x');
});

test('toggleWrap wraps, unwraps and keeps bold apart from italic', () => {
  assert.deepEqual(wrap('a word b', 2, 6, '**'), { out: 'a **word** b', sel: 'word' });
  assert.deepEqual(wrap('a **word** b', 4, 8, '**'), { out: 'a word b', sel: 'word' });
  assert.deepEqual(wrap('a **word** b', 2, 10, '**'), { out: 'a word b', sel: 'word' });
  assert.deepEqual(wrap('a **word** b', 4, 8, '*'), { out: 'a ***word*** b', sel: 'word' });
  assert.deepEqual(wrap('a ***word*** b', 5, 9, '*'), { out: 'a **word** b', sel: 'word' });
  assert.deepEqual(wrap('ab', 1, 1, '==', '==', 'text'), { out: 'a==text==b', sel: 'text' });
  assert.deepEqual(wrap('x  word  y', 1, 9, '*'), { out: 'x  *word*  y', sel: 'word' });
  assert.deepEqual(wrap('<u>a</u>', 3, 4, '<u>', '</u>'), { out: 'a', sel: 'a' });
});

test('smart punctuation: curly quotes, em dash, ellipsis, but not rules or tables', () => {
  assert.deepEqual(smartPunctuation('say ', '"'), { deleteBefore: 0, insert: '“' });
  assert.deepEqual(smartPunctuation('say “hi', '"'), { deleteBefore: 0, insert: '”' });
  assert.deepEqual(smartPunctuation('don', "'"), { deleteBefore: 0, insert: '’' });
  assert.deepEqual(smartPunctuation('', "'"), { deleteBefore: 0, insert: '‘' });
  assert.deepEqual(smartPunctuation('a -', '-'), { deleteBefore: 1, insert: '—' });
  assert.equal(smartPunctuation('-', '-'), null);
  assert.equal(smartPunctuation('--', '-'), null);
  assert.equal(smartPunctuation('| a |-', '-'), null);
  assert.equal(smartPunctuation('<!-', '-'), null);
  assert.deepEqual(smartPunctuation('wait..', '.'), { deleteBefore: 2, insert: '…' });
  assert.equal(smartPunctuation('a.', '.'), null);
  assert.equal(smartPunctuation('a', 'x'), null);
});

test('focus ranges: paragraph and sentence', () => {
  assert.deepEqual(paragraphAt(['a', 'b', '', 'c'], 1), [0, 1]);
  assert.deepEqual(paragraphAt(['a', 'b', '', 'c'], 3), [3, 3]);
  const text = 'One. Two words! Three?';
  assert.deepEqual(sentenceAt(text, 0), [0, 4]);
  assert.deepEqual(sentenceAt(text, 7), [5, 15]);
  assert.deepEqual(sentenceAt(text, 20), [16, 22]);
  assert.deepEqual(sentenceAt('첫 문장입니다. 둘째', 10), [9, 11]);
});

test('completion contexts: links, headings, blocks, tags, emoji, slash, properties', () => {
  assert.deepEqual(linkContext('see [[No'), { kind: 'note', embed: false, start: 6, query: 'No', target: '' });
  assert.deepEqual(linkContext('![[pic'), { kind: 'note', embed: true, start: 3, query: 'pic', target: '' });
  assert.deepEqual(linkContext('[[Note#Int'), { kind: 'heading', embed: false, start: 7, query: 'Int', target: 'Note' });
  assert.deepEqual(linkContext('[[Note#^ab'), { kind: 'block', embed: false, start: 8, query: 'ab', target: 'Note' });
  assert.deepEqual(linkContext('[[#Here'), { kind: 'heading', embed: false, start: 3, query: 'Here', target: '' });
  assert.equal(linkContext('[[Note|al').kind, 'alias');
  assert.equal(linkContext('[[done]] and'), null);
  assert.equal(linkContext('plain'), null);
  assert.deepEqual(tagContext('text #pro'), { start: 5, query: 'pro' });
  assert.deepEqual(tagContext('#한글'), { start: 0, query: '한글' });
  assert.equal(tagContext('a#b'), null);
  assert.equal(tagContext('# '), null);
  assert.deepEqual(emojiContext('hi :sm'), { start: 3, query: 'sm' });
  assert.equal(emojiContext('hi :s'), null);
  assert.equal(emojiContext('10:30'), null);
  assert.equal(emojiContext('a:bc'), null);
  assert.deepEqual(slashContext('/tab'), { start: 0, query: 'tab' });
  assert.deepEqual(slashContext('text /'), { start: 5, query: '' });
  assert.equal(slashContext('http://x'), null);
  assert.deepEqual(propertyContext('tit'), { start: 0, query: 'tit' });
  assert.equal(propertyContext('title: x'), null);
  const items = [{ label: 'Table', keywords: ['grid'] }, { label: 'Heading' }, { label: 'Code table' }];
  assert.deepEqual(filterByQuery(items, 'ta').map((i) => i.label), ['Table', 'Code table']);
  assert.deepEqual(filterByQuery(items, 'gri').map((i) => i.label), ['Table']);
});

test('front matter, footnotes, link parts, embed sizes', () => {
  const fm = frontMatterRange('---\ntitle: A\ntags: [x]\n---\nBody');
  assert.equal(fm.from, 0);
  assert.equal(fm.to, 26);
  assert.equal(fm.lastLine, 3);
  assert.equal(frontMatterRange('---\nno end'), null);
  assert.equal(frontMatterRange('text\n---\n'), null);
  assert.equal(nextFootnoteNumber('a[^1] b[^3] [^x]'), 4);
  assert.equal(nextFootnoteNumber('none'), 1);
  assert.deepEqual(splitWikiLink('Note#Head|Alias'), { target: 'Note', subpath: 'Head', alias: 'Alias' });
  assert.deepEqual(splitWikiLink('Note'), { target: 'Note', subpath: '', alias: '' });
  assert.deepEqual(splitUrl('https://x.org/a#b'), { target: 'https://x.org/a#b', subpath: '', external: 'https://x.org/a#b' });
  assert.deepEqual(splitUrl('folder/My%20Note.md#Part'), { target: 'folder/My Note.md', subpath: 'Part', external: undefined });
  assert.deepEqual(embedSize('300'), { width: 300, height: undefined });
  assert.deepEqual(embedSize('300x200'), { width: 300, height: 200 });
  assert.deepEqual(embedSize('caption'), { width: undefined, height: undefined });
});

test('image options: size and alignment in any order, rewriting the embed', () => {
  assert.deepEqual(imageOptions('center|300'), { width: 300, height: undefined, align: 'center', text: '' });
  assert.deepEqual(imageOptions('300x200|Right'), { width: 300, height: 200, align: 'right', text: '' });
  assert.deepEqual(imageOptions('A cat|left'), { width: undefined, height: undefined, align: 'left', text: 'A cat' });
  assert.deepEqual(embedSize('center|240'), { width: 240, height: undefined });
  assert.equal(setImageOptions('![[img.png]]', { width: 320 }), '![[img.png|320]]');
  assert.equal(setImageOptions('![[img.png|300x200]]', { width: 150 }), '![[img.png|150]]');
  assert.equal(setImageOptions('![[img.png|300]]', { align: 'center' }), '![[img.png|center|300]]');
  assert.equal(setImageOptions('![[img.png|center|300]]', { align: null }), '![[img.png|300]]');
  assert.equal(setImageOptions('![[img.png|center|300]]', { width: null }), '![[img.png|center]]');
  assert.equal(setImageOptions('![[img.png|300]]', { width: null }), '![[img.png]]');
  assert.equal(setImageOptions('![Logo](a/b.png)', { width: 120, align: 'right' }), '![Logo|right|120](a/b.png)');
  assert.equal(setImageOptions('![](https://x.org/a.png "t")', { align: 'left' }), '![left](https://x.org/a.png "t")');
  assert.equal(setImageOptions('[[Note]]', { width: 1 }), '[[Note]]');
});

test('a picture dropped from a web page', () => {
  assert.deepEqual(droppedImage({ html: '<meta charset="utf-8"><img src="https://x.org/a.jpg?w=2&amp;h=1" alt="A &quot;cat&quot;">' }), { url: 'https://x.org/a.jpg?w=2&h=1', alt: 'A "cat"' });
  assert.deepEqual(droppedImage({ uriList: '# comment\r\nhttps://x.org/pic.png' }), { url: 'https://x.org/pic.png', alt: '' });
  assert.equal(droppedImage({ uriList: 'https://x.org/page.html', plain: 'https://x.org/page.html' }), null);
  assert.equal(droppedImage({ plain: 'hello' }), null);
  assert.equal(imageMarkdown('https://x.org/a b(1).png', 'A [x] | y'), '![A x y](https://x.org/a%20b%281%29.png)');
});

test('headingBefore skips headings inside code', () => {
  const lines = ['# Top', 'text', '```', '# not a heading', '```', 'more', '## Sub', 'x'];
  assert.deepEqual(headingBefore(lines, 5), { text: 'Top', level: 1, line: 1 });
  assert.deepEqual(headingBefore(lines, 7), { text: 'Sub', level: 2, line: 7 });
  assert.equal(headingBefore(['plain'], 0), null);
  const code = codeLineTest(['---', 'a: 1', '---', '```', 'x', '```', 'y']);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(code), [true, true, true, true, true, true, false]);
});

test('displayWidth counts wide characters twice', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('한글'), 4);
  assert.equal(displayWidth('a😀'), 3);
});

test('tables: split rows, find, parse and format', () => {
  assert.deepEqual(splitRow('| a | `b|c` | d\\|e |'), ['a', '`b|c`', 'd\\|e']);
  assert.ok(isSeparatorLine('|:--|--:|'));
  assert.ok(!isSeparatorLine('| a | b |'));
  const lines = ['text', '| a | b |', '|:-|-:|', '| 한글 | 1 |', '|x|', 'after'];
  assert.deepEqual(tableRangeAt(lines, 3), [1, 4]);
  assert.equal(tableRangeAt(lines, 0), null);
  const formatted = formatTableLines(lines.slice(1, 5));
  assert.deepEqual(formatted, [
    '| a    |   b |',
    '| :--- | --: |',
    '| 한글 |   1 |',
    '| x    |     |',
  ]);
  const model = parseTable(lines.slice(1, 5));
  assert.deepEqual(model.aligns, ['left', 'right']);
  assert.equal(formatTable({ indent: '', aligns: ['center'], rows: [['h'], ['abcde']] })[1], '| :---: |');
  assert.equal(cellIndexAt('| a | b | c |', 1), 0);
  assert.equal(cellIndexAt('| a | b | c |', 5), 1);
  assert.equal(cellIndexAt('| a | b | c |', 11), 2);
  assert.equal(cellStart('| a    | bb |', 1), 9);
  assert.equal(cellStart('| a    | bb |', 0), 2);
});

test('tables: add and delete rows and columns, new tables', () => {
  const model = parseTable(['| a | b |', '| - | - |', '| 1 | 2 |']);
  const r = addRow(model, 1);
  assert.deepEqual(r.model.rows, [['a', 'b'], ['1', '2'], ['', '']]);
  assert.equal(r.row, 2);
  assert.deepEqual(addRow(model, 0).model.rows[1], ['', '']);
  const c = addColumn(model, 0, 'new');
  assert.deepEqual(c.model.rows, [['a', 'new', 'b'], ['1', '', '2']]);
  assert.deepEqual(deleteRow(model, 1).model.rows, [['a', 'b']]);
  assert.deepEqual(deleteRow(model, 0).model.rows[0], ['', '']);
  assert.deepEqual(deleteColumn(model, 0).model.rows, [['b'], ['2']]);
  assert.equal(deleteColumn(parseTable(['| a |', '| - |']), 0), null);
  assert.deepEqual(newTable(1, 2, (i) => `H${i + 1}`), ['| H1  | H2  |', '| --- | --- |', '|     |     |']);
});

test('HTML → Markdown: blocks, inline marks, links, images, code', () => {
  assert.equal(htmlToMarkdown('<h2>Title</h2><p>Some <b>bold</b> and <em>it</em> text.</p>'), '## Title\n\nSome **bold** and *it* text.');
  assert.equal(htmlToMarkdown('<p>A <a href="https://x.org">link</a> <img src="a b.png" alt="pic"></p>'), 'A [link](https://x.org) ![pic](a%20b.png)');
  assert.equal(htmlToMarkdown('<p>use <code>npm i</code></p><pre><code class="language-js">let a = 1;\nlet b;</code></pre>'), 'use `npm i`\n\n```js\nlet a = 1;\nlet b;\n```');
  assert.equal(htmlToMarkdown('<p>a<br>b</p><hr><blockquote><p>quote</p></blockquote>'), 'a\nb\n\n---\n\n> quote');
  assert.equal(htmlToMarkdown('<p><del>old</del> <mark>hi</mark> &amp; &lt;x&gt;</p>'), '~~old~~ ==hi== & <x>');
  assert.equal(htmlToMarkdown('<span style="font-weight:700">B</span> <span style="font-style:italic">I</span>'), '**B** *I*');
  // Google Docs wraps everything in <b style="font-weight:normal">.
  assert.equal(htmlToMarkdown('<b style="font-weight:normal" id="docs-internal"><p>plain</p></b>'), 'plain');
});

test('HTML → Markdown: lists, tasks and tables', () => {
  assert.equal(htmlToMarkdown('<ul><li>one<ul><li>sub</li></ul></li><li>two</li></ul>'), '- one\n  - sub\n- two');
  assert.equal(htmlToMarkdown('<ol start="3"><li>c<li>d</ol>'), '3. c\n4. d');
  assert.equal(htmlToMarkdown('<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>'), '- [x] done\n- [ ] todo');
  assert.equal(htmlToMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>x|y</td></tr></table>'), '| A | B |\n| --- | --- |\n| 1 | x\\|y |');
  assert.equal(htmlToMarkdown('<html><head><style>p{}</style></head><body><!--StartFragment--><p>x</p><script>bad()</script></body></html>'), 'x');
});

test('hasFormatting tells formatted HTML from plain', () => {
  assert.ok(hasFormatting('<p><b>x</b></p>'));
  assert.ok(hasFormatting('<a href="u">x</a>'));
  assert.ok(!hasFormatting('<div><span>plain</span><br></div>'));
  assert.ok(!hasFormatting('<b style="font-weight:normal"><span>x</span></b>'));
  assert.equal(parseHtml('<p>a<p>b').children.length, 2);
});

test('fold ranges: headings, lists, code, quotes, front matter, math', () => {
  const lines = [
    '---', 'a: 1', '---', // 1-3
    '# One', 'text', '## Two', 'two text', '', '# Three', // 4-9
    '- item', '  - child', '  - child 2', '- next', // 10-13
    '```js', '# not heading', '```', // 14-16
    '> [!note] Title', '> body', '> more', // 17-19
    '$$', 'x^2', '$$', // 20-22
  ];
  const doc = linesDoc(lines);
  const code = codeLines(doc);
  const at = (n) => foldRangeAt(doc, n, code);
  assert.deepEqual(at(1), { fromLine: 1, toLine: 3 });
  assert.deepEqual(at(4), { fromLine: 4, toLine: 7 });
  assert.deepEqual(at(6), { fromLine: 6, toLine: 7 });
  assert.deepEqual(at(9), { fromLine: 9, toLine: 22 });
  assert.equal(at(5), null);
  assert.deepEqual(at(10), { fromLine: 10, toLine: 12 });
  assert.equal(at(11), null);
  assert.deepEqual(at(14), { fromLine: 14, toLine: 16 });
  assert.equal(at(15), null);
  assert.equal(at(16), null);
  assert.deepEqual(at(17), { fromLine: 17, toLine: 19 });
  assert.equal(at(18), null);
  assert.deepEqual(at(20), { fromLine: 20, toLine: 22 });
  assert.deepEqual(foldRangeAt(linesDoc(['# A', '```', '# B', '```', 'x']), 1), { fromLine: 1, toLine: 5 });
});

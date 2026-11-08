// The newer pure modules: WYSIWYG's HTML → Markdown, problem checks, encode tools, the user
// dictionary, the hex editor's helpers and the document kinds of the viewers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, minimalChange } from '../src/domain/htmltomd.js';
import { markdownToHtml } from '../src/domain/render.js';
import { lint, lintMarkdown, lintHtml } from '../src/domain/lint.js';
import * as tools from '../src/domain/texttools.js';
import { addWords, removeWord, isWord, parseWordList } from '../src/domain/userdict.js';
import { toHex, parseHex, findBytes, inspect } from '../src/ui/hexeditor.js';
import { kindOf, isTextKind, isViewerKind, formatSize } from '../src/domain/doctypes.js';
import { imageMarkup, isImageFile } from '../src/editor/images.js';

test('WYSIWYG: Markdown → HTML → Markdown comes back the same', () => {
  const source = '# Title\n\nSome **bold** and *it* and ~~gone~~ and `code`.\n\n- [x] done\n- [ ] todo\n\n1. one\n2. two\n   - nested\n\n> quote\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nlet x = 1;\n```\n\n![pic](images/a.png)\n\n[link](https://x.com)\n';
  assert.equal(htmlToMarkdown(markdownToHtml(source, { lines: false })), source);
});

test('WYSIWYG: pictures keep the path written in the document, ticked boxes become [x]', () => {
  assert.equal(htmlToMarkdown('<p><img src="asset://x/a.png" data-src="images/a.png" alt="A"></p>'), '![A](images/a.png)\n');
  assert.equal(htmlToMarkdown('<ul><li><input type="checkbox" checked> done</li></ul>'), '- [x] done\n');
  assert.equal(htmlToMarkdown('<h2>Hi</h2><p>a<br>b</p>'), '## Hi\n\na  \nb\n');
});

test('the smallest change between two texts', () => {
  assert.deepEqual(minimalChange('hello world', 'hello brave world'), { from: 6, to: 6, insert: 'brave ' });
  assert.deepEqual(minimalChange('abc', 'abX'), { from: 2, to: 3, insert: 'X' });
  assert.equal(minimalChange('same', 'same'), null);
});

test('Markdown problems: skipped heading, alt text, missing anchor, no space after #, open fence', () => {
  const codes = lintMarkdown('# A\n\n### C\n\n![](x.png) [x](#nope) [ok](#a)\n#bad\n```\n').map((p) => p.code);
  assert.deepEqual(codes, ['headingSkip', 'imageAlt', 'missingAnchor', 'headingSpace', 'openFence']);
  assert.deepEqual(lintMarkdown('# Fine\n\n## Also fine\n\n[top](#fine)\n'), []);
});

test('HTML problems: unclosed and stray tags, duplicate ids, alt text; optional end tags are fine', () => {
  const found = lintHtml('<!doctype html><html><head><title>t</title></head><body><div id="a"><p>x<span>y</div><img src=a><i id="a"></i>\n</section><ul><li>one<li>two</ul></body></html>');
  assert.deepEqual(found.map((p) => p.code).sort(), ['duplicateId', 'imageAlt', 'strayClose', 'unclosed'].sort());
});

test('JSON files are parsed for errors; trailing spaces are reported in any text', () => {
  assert.equal(lint('text', '{"a": 1,}', 'x.json')[0].code, 'json');
  assert.deepEqual(lint('text', '{"a": 1}', 'x.json'), []);
  assert.equal(lint('text', 'a   \nb', 'notes.txt')[0].code, 'trailingSpace');
  assert.deepEqual(lint('text', 'a  \nb', 'notes.txt'), [], 'two spaces are a Markdown line break, not a mistake');
});

test('encode tools: Base64 (UTF-8), URL, HTML entities, hashes', async () => {
  assert.equal(tools.base64Encode('한글 ok'), '7ZWc6riAIG9r');
  assert.equal(tools.base64Decode('7ZWc6riAIG9r'), '한글 ok');
  assert.equal(tools.urlEncode('a b&c'), 'a%20b%26c');
  assert.equal(tools.urlDecode('a+b%26c'), 'a b&c');
  assert.equal(tools.unescapeHtmlText('&lt;b&gt; &#65;&#x42; &amp; &copy;'), '<b> AB & ©');
  assert.equal(await tools.digest('abc', 'SHA-256'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(tools.trimBoth('  a  \n b '), 'a\nb');
  assert.equal(tools.sortByLength('ccc\na\nbb'), 'a\nbb\nccc');
  assert.equal(tools.numberLines('x\ny'), '1  x\n2  y');
});

test('user dictionary: words only, sorted, no duplicates; word lists from text files', () => {
  assert.deepEqual(addWords(['zeta'], ['alpha', ' alpha ', 'MyTextMaster', '한글', 'two words', '!!']), ['alpha', 'MyTextMaster', 'zeta', '한글'].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(removeWord(['a', 'b'], 'a'), ['b']);
  assert.ok(isWord("don't") && isWord('e-mail') && !isWord('a b'));
  assert.deepEqual(parseWordList('# comment\nalpha\n\n beta \r\ngamma'), ['alpha', 'beta', 'gamma']);
});

test('hex helpers: hex text, finding bytes (wrapping), numbers at an offset', () => {
  assert.equal(toHex(Uint8Array.of(0, 15, 255)), '00 0F FF');
  assert.deepEqual([...parseHex('de ad 0xBE,ef')], [0xde, 0xad, 0xbe, 0xef]);
  assert.equal(parseHex('abc'), null);
  const bytes = Uint8Array.of(1, 2, 3, 1, 2, 3);
  assert.equal(findBytes(bytes, Uint8Array.of(2, 3), 0), 1);
  assert.equal(findBytes(bytes, Uint8Array.of(2, 3), 2), 4);
  assert.equal(findBytes(bytes, Uint8Array.of(2, 3), 5), 1, 'wraps around');
  assert.equal(findBytes(bytes, Uint8Array.of(9), 0), -1);
  const v = inspect(Uint8Array.of(0x01, 0x02, 0x03, 0x04), 0);
  assert.equal(v.u8, 1);
  assert.equal(v.u16le, 0x0201);
  assert.equal(v.u16be, 0x0102);
  assert.equal(v.u32le, 0x04030201);
});

test('document kinds for the viewers and the hex editor', () => {
  assert.equal(kindOf('photo.JPG'), 'image');
  assert.equal(kindOf('clip.webm'), 'video');
  assert.equal(kindOf('song.flac'), 'audio');
  assert.equal(kindOf('paper.pdf'), 'pdf');
  assert.equal(kindOf('app.exe'), 'hex');
  assert.equal(kindOf('icon.svg'), 'text', 'SVG is text: it is edited');
  assert.ok(isTextKind('markdown') && !isTextKind('image'));
  assert.ok(isViewerKind('pdf') && !isViewerKind('hex'));
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB');
});

test('pictures: file detection and the markup for Markdown and HTML', () => {
  assert.ok(isImageFile('a.PNG') && isImageFile('blob', 'image/webp') && !isImageFile('a.txt'));
  assert.equal(imageMarkup('markdown', 'images/a b.png', 'A [x]'), '![A x](<images/a b.png>)');
  assert.equal(imageMarkup('html', 'images/a.png', 'say "hi"'), '<img src="images/a.png" alt="say &quot;hi&quot;">');
});

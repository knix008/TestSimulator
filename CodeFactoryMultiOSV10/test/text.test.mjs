import test from 'node:test';
import assert from 'node:assert/strict';

import {
  maskSource,
  countLines,
  countTodoMarkers,
  looksLikeTestFile,
  matchBracket,
  indentWidth,
  buildLineStarts,
  lineFromStarts,
  lineOfOffset,
  escapeRegExp,
  toPosix,
} from '../src/core/text.js';

test('maskSource preserves length and every newline position', () => {
  const source = 'const a = "hello world"; // trailing\nconst b = 2;\n';
  const masked = maskSource(source, 'javascript');

  assert.equal(masked.length, source.length);
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') assert.equal(masked[i], '\n', 'newline at ' + i + ' must survive masking');
  }
});

test('maskSource blanks string contents but keeps the code around them', () => {
  const masked = maskSource('call("a + b");', 'javascript');
  assert.ok(masked.startsWith('call('), 'the call itself stays visible');
  assert.ok(!masked.includes('a + b'), 'the literal body is blanked');
  assert.ok(masked.includes(');'), 'the closing punctuation stays');
});

test('maskSource hides braces inside strings so brace matching cannot be fooled', () => {
  const source = 'function f() { const s = "}"; return 1; }';
  const masked = maskSource(source, 'javascript');
  const open = masked.indexOf('{');
  const close = matchBracket(masked, open);
  assert.equal(close, source.length - 1, 'the closing brace is the real one, not the one in the string');
});

test('maskSource blanks line and block comments', () => {
  const masked = maskSource('a(); // if (x) { y(); }\n/* while (true) */ b();', 'javascript');
  assert.ok(!masked.includes('if ('), 'line comment contents are gone');
  assert.ok(!masked.includes('while'), 'block comment contents are gone');
  assert.ok(masked.includes('a();') && masked.includes('b();'), 'real code survives');
});

test('maskSource handles python triple-quoted strings', () => {
  const source = 'def f():\n    """doc if for while"""\n    return 1\n';
  const masked = maskSource(source, 'python');
  assert.ok(!masked.includes('doc if for while'));
  assert.ok(masked.includes('return 1'));
});

test('maskSource handles an unterminated quote without consuming the file', () => {
  const source = 'const a = "oops;\nconst b = 2;\nconst c = 3;\n';
  const masked = maskSource(source, 'javascript');
  assert.ok(masked.includes('const b = 2;'), 'a stray quote must not swallow the following lines');
});

test('countLines separates code, comment and blank lines', () => {
  const counts = countLines(['// header', '', 'const a = 1;', '/* block', '   still block */', 'const b = 2; // trailing'].join('\n'));

  assert.equal(counts.physical, 6);
  assert.equal(counts.blank, 1);
  assert.equal(counts.comment, 3, 'the two block lines plus the header');
  assert.equal(counts.code, 2, 'code with a trailing comment counts as code');
});

test('countLines on empty input returns zeros', () => {
  assert.deepEqual(countLines(''), { physical: 0, code: 0, blank: 0, comment: 0 });
});

test('countTodoMarkers finds every marker word, case-insensitively', () => {
  assert.equal(countTodoMarkers('// TODO fix\n# fixme later\n/* HACK */\nXXX'), 4);
  assert.equal(countTodoMarkers('nothing here'), 0);
});

test('looksLikeTestFile recognizes the common conventions', () => {
  assert.ok(looksLikeTestFile('/repo/tests/foo.js'));
  assert.ok(looksLikeTestFile('/repo/src/foo.test.ts'));
  assert.ok(looksLikeTestFile('/repo/spec/bar.rb'));
  assert.ok(looksLikeTestFile('/repo/src/test_helper.py'));
  assert.ok(!looksLikeTestFile('/repo/src/latest.js'), '"latest" is not a test file');
});

test('matchBracket finds the matching close and reports imbalance', () => {
  assert.equal(matchBracket('{ a { b } c }', 0), 12);
  assert.equal(matchBracket('{ unbalanced', 0), -1);
  assert.equal(matchBracket('no brace here', 0), -1);
});

test('indentWidth counts a tab as four columns', () => {
  assert.equal(indentWidth('    x'), 4);
  assert.equal(indentWidth('\tx'), 4);
  assert.equal(indentWidth('\t  x'), 6);
  assert.equal(indentWidth('x'), 0);
});

test('line lookup agrees between the scanning and indexed implementations', () => {
  const source = 'a\nbb\nccc\n\ndddd';
  const starts = buildLineStarts(source);

  for (let offset = 0; offset < source.length; offset++) {
    assert.equal(lineFromStarts(starts, offset), lineOfOffset(source, offset), 'offset ' + offset);
  }
});

test('escapeRegExp neutralizes regex metacharacters', () => {
  const pattern = new RegExp(escapeRegExp('a.b*c'));
  assert.ok(pattern.test('a.b*c'));
  assert.ok(!pattern.test('axbbbc'));
});

test('toPosix normalizes Windows separators', () => {
  assert.equal(toPosix('C:\\a\\b\\c.cs'), 'C:/a/b/c.cs');
});

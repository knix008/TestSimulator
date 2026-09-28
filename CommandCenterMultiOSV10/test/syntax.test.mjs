// Syntax highlighting (src/lib/syntax.js): which files are source code, what
// gets a colour, and that nothing from a file can turn into markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { languageOf, highlightHtml, canHighlight, MAX_CHARS } from '../src/lib/syntax.js';

// The text a browser would show, with the colouring stripped out again.
const plain = (html) => html.replace(/<span class="sx-[a-z]+">/g, '').replace(/<\/span>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// The pieces that carry a given class.
const of = (html, cls) => [...html.matchAll(new RegExp(`<span class="sx-${cls}">([^<]*)</span>`, 'g'))].map((m) => m[1]);

test('languageOf: source files are recognised, plain text is left alone', () => {
  assert.equal(languageOf('D:/x/app.js'), 'js');
  assert.equal(languageOf('app.tsx'), 'ts');
  assert.equal(languageOf('main.CPP'), 'c');          // the extension's case does not matter
  assert.equal(languageOf('build.gradle'), 'java');
  assert.equal(languageOf('/etc/nginx/nginx.conf'), 'ini');
  assert.equal(languageOf('Makefile'), 'sh');
  assert.equal(languageOf('.gitignore'), 'ini');
  assert.equal(languageOf('notes.txt'), null);
  assert.equal(languageOf('server.log'), null);
  assert.equal(languageOf('table.csv'), null);
  assert.equal(languageOf('README'), null);
  assert.equal(languageOf(''), null);
});

test('canHighlight: only a known language, and only up to the size limit', () => {
  assert.equal(canHighlight('x', 'js'), true);
  assert.equal(canHighlight('x', null), false);
  assert.equal(canHighlight('x'.repeat(MAX_CHARS + 1), 'js'), false);
});

test('every language: the text survives the colouring unchanged', () => {
  const samples = {
    js: 'const x = `a${b}c`;\nfunction go(a) { /* c */ return a < 3 && b > 1; }\n',
    ts: 'export interface A { n: number }\nlet s: string = "hi";\n',
    py: 'def go(a):\n    """doc"""\n    return None if a else True  # note\n',
    c: '#include <stdio.h>\nint main(void) { char *s = "a\\"b"; return 0; }\n',
    java: '@Override\npublic static void main(String[] a) { int i = 0xFF; }\n',
    cs: 'namespace N { public class C { void M() { var x = 1; } } }\n',
    go: 'package main\nfunc main() { s := `raw` ; _ = s }\n',
    rust: '#[derive(Debug)]\nfn main() { let v: Vec<u8> = vec![1, 2]; }\n',
    php: '<?php\n$a = 1; // c\necho "x $a";\n',
    ruby: 'class A\n  def go(x) = x.to_s # c\nend\n',
    swift: 'func go(_ a: Int) -> String { return "\\(a)" }\n',
    kotlin: 'fun main() { val x: Int = 1 }\n',
    lua: '-- c\nlocal function go(a) return a end\n',
    sql: 'SELECT id, name FROM t WHERE a = 1 -- c\n',
    sh: '#!/bin/sh\nfor f in *.txt; do echo "$f"; done\n',
    ps: '<# c #>\nfunction Get-X { param($a) Write-Host "$a" }\n',
    bat: '@echo off\nrem a comment\nset X=1\nif "%X%"=="1" echo yes\n',
    json: '{ "a": [1, true, null], "b": "x" }\n',
    css: '/* c */\n.a > b, #c { color: #fff; margin: 0 2px; }\n@media print { a { b: c } }\n',
    html: '<!doctype html>\n<!-- c -->\n<div class="a" id=\'b\'>x &amp; y</div>\n',
    md: '# Title\n\n- a *b* **c** `d` [e](f)\n\n```js\nvar x\n```\n> quote\n',
    yaml: '# c\nkey: value\nlist:\n  - a: 1\n    b: true\n',
    ini: '; c\n[sec]\nkey = value\nn = 12\n',
  };
  for (const [lang, src] of Object.entries(samples)) {
    const html = highlightHtml(src, lang);
    assert.equal(plain(html), src, `${lang}: the text must come out as it went in`);
  }
});

test('keywords, strings, comments and numbers get their own class', () => {
  const js = highlightHtml('const n = 42; // note\nfunction go() {}', 'js');
  assert.ok(of(js, 'kw').includes('const'), 'const is a keyword');
  assert.ok(of(js, 'kw').includes('function'));
  assert.ok(of(js, 'num').includes('42'));
  assert.ok(of(js, 'com').includes('// note'));
  assert.ok(of(js, 'fn').includes('go'), 'the name in front of ( is a call');

  const py = highlightHtml('def go():\n    return True  # ok', 'py');
  assert.ok(of(py, 'kw').includes('def'));
  assert.ok(of(py, 'lit').includes('True'));
  assert.ok(of(py, 'com').includes('# ok'));

  const c = highlightHtml('#include <stdio.h>\nint x = 1;', 'c');
  assert.ok(of(c, 'pre').some((s) => s.startsWith('#include')), 'a preprocessor line');
  assert.ok(of(c, 'typ').includes('int'));

  const sh = highlightHtml('cd $HOME/x # c', 'sh');
  assert.ok(of(sh, 'var').includes('$HOME'));
  assert.ok(of(sh, 'com').includes('# c'));
  // inside a quoted string the whole string is the string — the shallow grammar does not look into it
  assert.deepEqual(of(highlightHtml('echo "$HOME"', 'sh'), 'str'), ['"$HOME"']);

  const sql = highlightHtml('select * from t', 'sql');
  assert.ok(of(sql, 'kw').includes('select'), 'SQL keywords are case-insensitive');

  const bat = highlightHtml('rem hello\nset A=1', 'bat');
  assert.ok(of(bat, 'com').includes('rem hello'));

  const json = highlightHtml('{ "a": "b", "n": 1 }', 'json');
  assert.deepEqual(of(json, 'att'), ['"a"', '"n"'], 'a field name is not a value');
  assert.deepEqual(of(json, 'str'), ['"b"']);
  assert.ok(of(json, 'num').includes('1'));

  const html = highlightHtml('<a href="x">t</a>', 'html');
  assert.ok(of(html, 'tag').some((s) => s.includes('a')));
  assert.ok(of(html, 'att').includes('href'));
  assert.ok(of(html, 'str').includes('"x"'));
});

test('a string or a comment swallows what looks like code inside it', () => {
  const js = highlightHtml('const s = "const 42"; /* const */', 'js');
  assert.equal(of(js, 'kw').length, 1, 'only the real const outside the string');
  assert.equal(of(js, 'num').length, 0);
  // a quote inside a string, escaped
  assert.deepEqual(of(highlightHtml('a = "x\\"y" + 1', 'js'), 'str'), ['"x\\"y"']);
  // a string that never closes must not eat the rest as an error — it just runs to the line end
  assert.equal(plain(highlightHtml('a = "oops\nb = 1\n', 'js')), 'a = "oops\nb = 1\n');
});

test('nothing in a file can become markup', () => {
  const evil = '<script>alert(1)</script> & <span class="sx-kw">x</span>\n';
  for (const lang of ['js', 'py', 'html', 'md', 'json', 'yaml', 'ini', 'css', 'sh']) {
    const html = highlightHtml(evil, lang);
    assert.ok(!/<script/i.test(html), `${lang}: no raw <script>`);
    assert.equal(plain(html), evil, `${lang}: the text is unchanged`);
    // every tag in the output is one of ours
    for (const tag of html.match(/<[^>]*>/g) || []) {
      assert.ok(/^<span class="sx-[a-z]+">$|^<\/span>$/.test(tag), `${lang}: unexpected markup ${tag}`);
    }
  }
});

test('an unknown language is escaped but not coloured', () => {
  assert.equal(highlightHtml('a < b & c', null), 'a &lt; b &amp; c');
});

import { describe, it, expect } from 'vitest';
import {
  sanitizeChapter, htmlToText, textToHtml, escapeHtml, parseDocument,
} from '../src/lib/html.js';

describe('sanitizeChapter', () => {
  it('keeps the text and the structure of a chapter', () => {
    const out = sanitizeChapter('<h1>제목</h1><p>본문 <em>강조</em></p>');
    expect(out.html).toContain('<h1');
    expect(out.html).toContain('<em>강조</em>');
    expect(out.text).toContain('본문 강조');
    expect(out.title).toBe('제목');
  });

  it('removes scripts, styles and iframes', () => {
    const out = sanitizeChapter(`
      <p>before</p>
      <script>window.stolen = 1;</script>
      <style>p { color: red }</style>
      <iframe src="https://example.com"></iframe>
      <p>after</p>`);
    expect(out.html).not.toMatch(/script|iframe|<style/i);
    expect(out.html).toContain('before');
    expect(out.html).toContain('after');
  });

  it('strips event handlers and inline styles', () => {
    const out = sanitizeChapter('<p onclick="steal()" style="position:fixed" class="x">hi</p>');
    expect(out.html).not.toMatch(/onclick|style=|class=/);
    expect(out.html).toContain('hi');
  });

  it('drops a javascript: link but keeps its text', () => {
    const out = sanitizeChapter('<a href="javascript:alert(1)">click</a>');
    expect(out.html).not.toContain('javascript:');
    expect(out.html).toContain('click');
  });

  it('marks an http link as external rather than navigating in place', () => {
    const out = sanitizeChapter('<a href="https://example.com/x">link</a>');
    expect(out.html).toContain('data-external="https://example.com/x"');
    expect(out.html).not.toContain('href=');
  });

  it('turns an internal link into the section it points at', () => {
    const out = sanitizeChapter('<a href="ch3.xhtml#part">next</a>', {
      linkTarget: (href) => (href.startsWith('ch3') ? { section: 2, anchor: 'part' } : null),
    });
    expect(out.html).toContain('data-section="2"');
    expect(out.html).toContain('data-anchor="part"');
  });

  it('re-points an image at the resolved resource', () => {
    const out = sanitizeChapter('<p><img src="../images/a.png" width="900"></p>', {
      resolveSrc: (href) => `blob:resolved/${href}`,
    });
    expect(out.html).toContain('src="blob:resolved/../images/a.png"');
    // The author's pixel width would fight the reading width.
    expect(out.html).not.toContain('width=');
  });

  it('removes an image whose resource is missing', () => {
    const out = sanitizeChapter('<p><img src="gone.png"></p>', { resolveSrc: () => null });
    expect(out.html).not.toContain('<img');
  });

  it('replaces an SVG cover wrapper with the image inside it', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="cover.png"/></svg>';
    const out = sanitizeChapter(svg, { resolveSrc: (href) => `blob:${href}` });
    expect(out.html).toContain('<img');
    expect(out.html).toContain('blob:cover.png');
    expect(out.html).not.toContain('<svg');
  });

  it('collects the headings, giving each one an id', () => {
    const out = sanitizeChapter('<h1>One</h1><p>x</p><h2>Two</h2>');
    expect(out.headings.map((h) => h.text)).toEqual(['One', 'Two']);
    expect(out.headings[0].level).toBe(1);
    expect(out.html).toContain(`id="${out.headings[0].id}"`);
  });

  it('survives malformed XHTML by retrying as HTML', () => {
    const out = sanitizeChapter('<p>Tom & Jerry<p>unclosed', { mime: 'application/xhtml+xml' });
    expect(out.text).toContain('Tom & Jerry');
  });

  it('returns empty output for empty input', () => {
    const out = sanitizeChapter('');
    expect(out.html).toBe('');
    expect(out.headings).toEqual([]);
  });

  it('keeps a MOBI picture that is named by recindex rather than src', () => {
    const out = sanitizeChapter('<p><img recindex="00001" width="320" height="225"></p>', {
      resolveSrc: (href) => (href === '00001' ? 'blob:first-page' : ''),
    });
    expect(out.html).toContain('src="blob:first-page"');
    expect(out.html).not.toContain('recindex');
    expect(out.html).not.toContain('width=');
  });

  it('unwraps a MOBI chapter so its paragraphs are the page, as in an EPUB', () => {
    const out = sanitizeChapter(
      '<mbp:pagebreak><p align="justify" width="0pt" height="6pt"><font><font>본문</font></font></p>'
      + '<guide><reference type="toc" title="Table of Contents"></reference></guide>',
    );
    expect(out.html).not.toMatch(/mbp:pagebreak|<font|align=|width=|height=|<guide|<reference/i);
    expect(out.html).toContain('<p>본문</p>');
    expect(out.text).toContain('본문');
  });

  it('keeps tables, lists and ruby markup', () => {
    const out = sanitizeChapter('<table><tr><td>a</td></tr></table><ul><li>b</li></ul><ruby>漢<rt>かん</rt></ruby>');
    expect(out.html).toContain('<td>a</td>');
    expect(out.html).toContain('<li>b</li>');
    expect(out.html).toContain('<rt>かん</rt>');
  });
});

describe('htmlToText', () => {
  it('drops the tags and keeps the words', () => {
    expect(htmlToText('<h1>Title</h1><p>One</p><p>Two</p>')).toContain('Title');
    expect(htmlToText('<p>One</p><p>Two</p>')).toMatch(/One[\s\S]*Two/);
  });

  it('ignores script content', () => {
    expect(htmlToText('<p>keep</p><script>drop()</script>')).not.toContain('drop');
  });
});

describe('textToHtml', () => {
  it('makes a paragraph of each block', () => {
    const html = textToHtml('one\n\ntwo');
    expect(html).toBe('<p>one</p>\n<p>two</p>');
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(textToHtml('one\ntwo')).toContain('one<br>two');
  });

  it('escapes markup in the source text', () => {
    expect(textToHtml('<b>not bold</b>')).toContain('&lt;b&gt;');
  });
});

describe('escapeHtml / parseDocument', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('parses XML', () => {
    const doc = parseDocument('<root><child>v</child></root>', 'application/xml');
    expect(doc.documentElement.tagName).toBe('root');
  });
});

describe('the plain text of a whole document', () => {
  // A real EPUB chapter, in the shape that broke: an XHTML document whose head
  // carries a self-closed <script/>. That is valid XML and meaningless in HTML —
  // a script element is never self-closing there, so an HTML parser swallows the
  // rest of the file as script content and the body comes out empty. The chapter
  // showed on screen (the reading path parses it as XML) while search found
  // nothing in it, an export of it was blank and it counted as no pages at all.
  const xhtmlChapter = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <title>3</title>
  <link href="../Styles/epub.css" rel="stylesheet" type="text/css"/>
  <script xmlns="http://www.w3.org/1999/xhtml" type="text/javascript" src="../../js/book.js"/>
  <style type="text/css">.bookSpan { color: red; }</style>
</head>
<body id="ch3">
  <h1>Chapter three</h1>
  <p>The text a reader would expect to be able to search for.</p>
</body>
</html>`;

  it('reads the body of an XHTML document the HTML parser would swallow', () => {
    const text = htmlToText(xhtmlChapter);
    expect(text).toContain('Chapter three');
    expect(text).toContain('search for');
  });

  it('leaves the head out of it', () => {
    const text = htmlToText(xhtmlChapter);
    expect(text).not.toContain('bookSpan');
    expect(text).not.toContain('book.js');
  });

  it('still reads an ordinary HTML document', () => {
    const text = htmlToText('<html><head><title>T</title></head><body><p>one</p><p>two</p></body></html>');
    expect(text).toContain('one');
    expect(text).toContain('two');
    expect(text).not.toContain('<p>');
  });

  it('still reads a bare fragment', () => {
    expect(htmlToText('<p>첫째</p><p>둘째</p>')).toBe('첫째\n둘째');
  });

  it('has nothing to say about nothing', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null)).toBe('');
    expect(htmlToText('   ')).toBe('');
  });

  it('falls back to stripping the tags when nothing will parse it', () => {
    // Markup with no elements at all still has words in it.
    expect(htmlToText('plain words')).toBe('plain words');
  });
});

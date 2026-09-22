// The Pandoc-wide format set: every reader on a native sample, every writer
// on the reference document, round trips wherever both exist, and the
// Pandoc AST bridge.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import JSZip from 'jszip'
import { readDocument, writeDocument } from '../src/lib/doc/convert.ts'
import { formats, readableFormats, writableFormats, groupedFormats, formatForFile } from '../src/lib/doc/formats.ts'
import { blocksToText, headings, inlinesToText } from '../src/lib/doc/ast.ts'
import { toPandoc, fromPandoc, writeNative, readNative } from '../src/lib/doc/pandocAst.ts'
import { readMarkdown, MARKDOWN_DIALECTS } from '../src/lib/doc/readers/markdown.ts'
import { sectionize, slideLevel, slidesAt } from '../src/lib/doc/sections.ts'

const check = (category, name, fn) => test(`${category} › ${name}`, fn)

const SAMPLE = `---
title: Sample Title
author: SHKWON
date: 2026-09-22
---

# Heading one

Some *emphasis*, **strong**, ~~strike~~, \`code\`, and a [link](https://example.com "Title").

## Lists

- one
- two
  - nested
- [x] done

1. first
2. second

Term
:   Definition of the term.

> quoted text

\`\`\`js
console.log('hi')
\`\`\`

| A | B |
|:--|--:|
| 1 | 2 |

Footnote here[^1].

[^1]: The note.
`

const sample = () => readDocument({ format: 'markdown', text: SAMPLE })
const types = (doc) => doc.blocks.map((block) => block.t)
const has = (doc, ...kinds) => kinds.every((kind) => types(doc).includes(kind))

/* ------------------------------------------------------------ catalogue */

check('catalogue', 'the format set matches Pandoc 3 (45 inputs, 60+ outputs) plus PostScript', () => {
  const inputs = ['bibtex', 'biblatex', 'bits', 'commonmark', 'commonmark_x', 'creole', 'csljson', 'csv', 'tsv', 'djot', 'docbook', 'docx', 'dokuwiki', 'endnotexml', 'epub', 'fb2', 'gfm', 'haddock', 'html', 'ipynb', 'jats', 'jira', 'json', 'latex', 'markdown', 'markdown_mmd', 'markdown_phpextra', 'markdown_strict', 'mdoc', 'man', 'mediawiki', 'muse', 'native', 'odt', 'opml', 'org', 'pod', 'ris', 'rst', 'rtf', 't2t', 'textile', 'tikiwiki', 'twiki', 'typst', 'vimwiki']
  const outputs = ['ansi', 'asciidoc', 'asciidoc_legacy', 'asciidoctor', 'beamer', 'bibtex', 'biblatex', 'chunkedhtml', 'commonmark', 'commonmark_x', 'context', 'csljson', 'djot', 'docbook', 'docbook4', 'docbook5', 'docx', 'dokuwiki', 'dzslides', 'epub', 'epub2', 'epub3', 'fb2', 'gfm', 'haddock', 'html', 'html4', 'html5', 'icml', 'ipynb', 'jats', 'jats_archiving', 'jats_articleauthoring', 'jats_publishing', 'jira', 'json', 'latex', 'man', 'markdown', 'markdown_mmd', 'markdown_phpextra', 'markdown_strict', 'markua', 'mediawiki', 'ms', 'muse', 'native', 'odt', 'opendocument', 'opml', 'org', 'pdf', 'plain', 'pptx', 'revealjs', 'rst', 'rtf', 's5', 'slideous', 'slidy', 'tei', 'texinfo', 'textile', 'typst', 'xwiki', 'zimwiki']
  const readable = new Set(readableFormats.map((format) => format.id))
  const writable = new Set(writableFormats.map((format) => format.id))
  for (const id of inputs) assert.ok(readable.has(id), `cannot read ${id}`)
  for (const id of outputs) assert.ok(writable.has(id), `cannot write ${id}`)
  assert.ok(readable.size >= 45 && writable.size >= 60)
  // PostScript is the one format Pandoc lacks; it carries no Pandoc name.
  assert.ok(formats.every((format) => format.pandoc === format.id || format.id === 'postscript'))
  assert.ok(readable.has('postscript') && writable.has('postscript'))
})

check('catalogue', 'grouped selects cover every format once', () => {
  const ids = groupedFormats(writableFormats, 'ko').flatMap((group) => group.options.map((option) => option.value))
  assert.equal(new Set(ids).size, writableFormats.length)
  assert.equal(ids.length, writableFormats.length)
  assert.equal(formatForFile('a.dj'), 'djot')
  assert.equal(formatForFile('a.typ'), 'typst')
  assert.equal(formatForFile('a.bib'), 'bibtex')
  assert.equal(formatForFile('a.wiki'), 'mediawiki')
})

/* ------------------------------------------------------------- writers */

const expectations = {
  markdown_strict: ['# Heading one', '    console.log', '<table>', '(The note.)'],
  markdown_phpextra: ['~~~js', '[^1]:', 'Term\n:   Definition', '<s>strike</s>'],
  markdown_mmd: ['Title: Sample Title', '[^1]:', '| A'],
  commonmark_x: ['title: Sample Title', '- [x] done', '~~strike~~'],
  markua: ['{title: "Sample Title"', '{format: js}', '[^1]'],
  djot: ['# Heading one', '_emphasis_', '*strong*', '{-strike-}', '[^1]:', '| A'],
  html5: ['<!DOCTYPE html>', '<h1 id="heading-one">'],
  html4: ['XHTML 1.0 Transitional', '<div class="header"', '<h1 id="heading-one">'],
  ansi: ['\u001b[1;34mHeading one', '\u001b[3memphasis\u001b[23m', '\u001b[1mstrong'],
  beamer: ['\\documentclass[ignorenonframetext]{beamer}', '\\begin{frame}[fragile]{Heading one}', '\\frame{\\titlepage}', '\\begin{itemize}'],
  context: ['\\starttext', '\\startsubject[title={Heading one}', '\\stopsubject', '\\startitemize', '\\starttyping', '\\startxtable', '\\stoptext'],
  texinfo: ['\\input texinfo', '@unnumbered Heading one', '@itemize @bullet', '@verbatim', '@multitable', '@bye'],
  asciidoctor: ['== Heading one', '[source,js]'],
  asciidoc_legacy: ["'emphasis'", '== Heading one'],
  typst: ['#set document(', '= Heading one', '_emphasis_', '*strong*', '#strike[strike]', '#table(', '#footnote['],
  haddock: ['= Heading one', '/emphasis/', '__strong__', '@\nconsole.log', '+---'],
  muse: ['#title Sample Title', '* Heading one', '**strong**', '<src lang="js">', '[1] The note.'],
  dokuwiki: ['====== Heading one ======', '//emphasis//', '**strong**', '<code js>', '^ A ^ B ^', '((The note.))'],
  xwiki: ['= Heading one =', '//emphasis//', '{{code language="js"}}', '|=A|=B', '{{footnote}}'],
  zimwiki: ['Content-Type: text/x-zim-wiki', '====== Heading one ======', "'''", '[*] done'],
  jira: ['h1. Heading one', '_emphasis_', '*strong*', '-strike-', '{code:js}', '||A||B||'],
  man: ['.TH "SAMPLE TITLE"', '.SH HEADING ONE', '\\f[I]emphasis\\f[R]', '.IP \\[bu] 2', '.TS', '.SH NOTES'],
  ms: ['.TL', '.NH 1', '.IP "1." 4', '.FS', '.TS'],
  opendocument: ['<office:document ', 'office:mimetype="application/vnd.oasis.opendocument.text"', '<text:h ', '<table:table'],
  icml: ['<?aid style="50"', '<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Header1">', 'CharacterStyle/Bold', '<Table '],
  fb2: ['<FictionBook', '<book-title>Sample Title</book-title>', '<section>', '<emphasis>emphasis</emphasis>', '<body name="notes">'],
  revealjs: ['reveal.js', '<div class="slides">', '<section', 'Reveal.initialize'],
  slidy: ['slidy.js', '<div class="slide"'],
  slideous: ['Slideous', '<div class="slide"'],
  s5: ['S5 1.1', '<div class="slide"'],
  dzslides: ['<section id="heading-one" class="slide">'],
  docbook: ['<article xmlns="http://docbook.org/ns/docbook"', '<section xml:id="heading-one">', '<programlisting language="js">', '<itemizedlist>', '<footnote>'],
  docbook5: ['version="5.0"'],
  docbook4: ['DocBook XML V4.5', '<sect1 id="heading-one">', '<ulink url="https://example.com">'],
  jats: ['<article xmlns:xlink', '<sec id="heading-one">', '<list list-type="bullet">', '<preformat language="js">', '<table-wrap>', '<fn id="fn1">'],
  jats_publishing: ['Journal Publishing DTD'],
  jats_articleauthoring: ['Article Authoring DTD'],
  jats_archiving: ['Archiving and Interchange DTD'],
  tei: ['<TEI xmlns="http://www.tei-c.org/ns/1.0">', '<div type="level1" xml:id="heading-one">', '<hi rend="italic">emphasis</hi>', '<list rend="bulleted">', '<note place="foot">'],
  opml: ['<opml version="2.0">', '<title>Sample Title</title>', 'text="Heading one"', '_note='],
  json: ['"pandoc-api-version"', '"t":"Header"', '"t":"BulletList"', '"t":"Table"', '"t":"Note"'],
  native: ['Pandoc', 'Meta', 'Header 1 ( "heading-one" , [] , [] )', 'BulletList', 'Table ( "" , [] , [] )'],
}

for (const [format, markers] of Object.entries(expectations)) {
  check('writer:pandoc-set', `${format} output carries the expected structure`, async () => {
    const output = await writeDocument(await sample(), format, {})
    assert.ok(typeof output.text === 'string' && output.text.length > 0, 'empty output')
    for (const marker of markers) assert.ok(output.text.includes(marker), `${format}: missing ${JSON.stringify(marker)}\n${output.text.slice(0, 400)}`)
  })
}

check('writer:pandoc-set', 'every writer produces output for the reference document', async () => {
  const doc = await sample()
  for (const format of writableFormats) {
    const output = await writeDocument(doc, format.id, {})
    if (format.id === 'pdf') { assert.ok(output.preview.includes('@page')); continue }
    assert.ok((output.text && output.text.length > 0) || (output.bytes && output.bytes.length > 0), `${format.id}: nothing written`)
    assert.ok(output.preview.includes('<'), `${format.id}: no preview`)
  }
})

check('writer:pandoc-set', 'PPTX is a valid package with one slide per section and a title slide', async () => {
  const output = await writeDocument(await sample(), 'pptx', {})
  const zip = await JSZip.loadAsync(output.bytes)
  assert.ok(zip.file('[Content_Types].xml') && zip.file('ppt/presentation.xml') && zip.file('ppt/slideMasters/slideMaster1.xml'))
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  assert.ok(slides.length >= 2, `${slides.length} slides`)
  const first = await zip.file('ppt/slides/slide1.xml').async('string')
  assert.ok(first.includes('Sample Title'))
  const content = await zip.file('ppt/slides/slide2.xml').async('string')
  assert.ok(content.includes('emphasis') && content.includes('Heading one'))
  const multi = await writeDocument(readMarkdown('# One\n\na\n\n# Two\n\nb\n\n# Three\n\nc'), 'pptx', { standalone: false })
  const zip2 = await JSZip.loadAsync(multi.bytes)
  assert.equal(Object.keys(zip2.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length, 3)
})

check('writer:pandoc-set', 'chunked HTML is a zip with an index and one file per section', async () => {
  const output = await writeDocument(await sample(), 'chunkedhtml', {})
  const zip = await JSZip.loadAsync(output.bytes)
  assert.ok(zip.file('index.html'))
  assert.ok(zip.file('heading-one.html'))
  const index = await zip.file('index.html').async('string')
  assert.ok(index.includes('href="heading-one.html"'))
})

check('writer:pandoc-set', 'EPUB 2 carries an NCX and an OPF 2.0 package', async () => {
  const output = await writeDocument(await sample(), 'epub2', {})
  const zip = await JSZip.loadAsync(output.bytes)
  const opf = await zip.file('EPUB/package.opf').async('string')
  assert.ok(opf.includes('version="2.0"') && opf.includes('toc="ncx"'))
  assert.ok(zip.file('EPUB/toc.ncx'))
  assert.equal(zip.file('EPUB/nav.xhtml'), null)
})

check('writer:pandoc-set', 'slides split at the slide level and a rule starts a new slide', () => {
  const doc = readMarkdown('# Part\n\n## One\n\ntext\n\n---\n\nmore\n\n## Two\n\nend')
  assert.equal(slideLevel(doc.blocks), 2)
  const slides = slidesAt(doc.blocks, 2)
  assert.equal(slides.length, 4)
  assert.equal(inlinesToText(slides[1].title), 'One')
  assert.equal(slides[2].title, null)
  const tree = sectionize(doc.blocks)
  assert.equal(tree.length, 1)
  assert.equal(tree[0].children.length, 2)
})

/* ------------------------------------------------------------- readers */

const samples = {
  markdown_strict: ['# Title\n\nSome *em* and **st**.\n\n* a\n* b\n\nAfter the list.\n\n    code\n', ['header', 'para', 'bullet', 'code']],
  markdown_phpextra: ['# T {#id}\n\nTerm\n:   Def\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nx[^1]\n\n[^1]: n\n', ['header', 'deflist', 'table', 'para']],
  markdown_mmd: ['Title: MMD Doc\nAuthor: Me\n\n# H\n\nx^2^ and $y$\n', ['header', 'para']],
  commonmark_x: ['# H\n\n- [x] done\n\nhttps://example.com auto\n', ['header', 'bullet', 'para']],
  djot: ['# Title\n\nSome _em_ and *st* and {-del-} and `code`.\n\n- a\n- b\n\n```js\nx()\n```\n\n: term\n\n  definition\n', ['header', 'para', 'bullet', 'code', 'deflist']],
  typst: ['#set document(title: "Typ", author: "A")\n\n= Heading\n\nSome *strong* and _em_ with `code` and #link("https://x.y")[link].\n\n- one\n- two\n\n+ first\n\n```rust\nfn main() {}\n```\n\n#quote(block: true)[\nquoted\n]\n\n#table(columns: 2, table.header([A], [B]), [1], [2])\n', ['header', 'para', 'bullet', 'ordered', 'code', 'quote', 'table']],
  haddock: ['= Title\n\nSome /em/ and __bold__ and @code@ and <https://x.y link>.\n\n* one\n* two\n\n@\ncode block\n@\n\n[term]: def\n', ['header', 'para', 'bullet', 'code', 'deflist']],
  t2t: ['My Doc\nAuthor\n2026\n\n= Section =\n\nSome **bold** //em// __und__ [link http://x.y].\n\n- a\n- b\n\n+ one\n+ two\n\n```\ncode\n```\n\n| a | b |\n', ['header', 'para', 'bullet', 'ordered', 'code', 'table']],
  pod: ['=pod\n\n=head1 NAME\n\nfoo - does things\n\n=head1 DESCRIPTION\n\nSome B<bold> and I<em> and C<code> and L<text|https://x.y>.\n\n=over 4\n\n=item * one\n\n=item * two\n\n=back\n\n    verbatim code\n\n=cut\n', ['header', 'para', 'header', 'para', 'bullet', 'code']],
  muse: ['#title Muse Doc\n\n* Heading\n\nSome *em* and **strong** and =code= [[https://x.y][link]].\n\n - one\n - two\n\n<example>\ncode\n</example>\n\n<quote>\nq\n</quote>\n', ['header', 'para', 'bullet', 'code', 'quote']],
  dokuwiki: ['====== Title ======\n\nSome **bold** //em// __u__ \'\'code\'\' [[https://x.y|link]].\n\n  * one\n  * two\n    * nested\n  - first\n\n<code java>\nint x;\n</code>\n\n^ A ^ B ^\n| 1 | 2 |\n\n> quoted\n', ['header', 'para', 'bullet', 'ordered', 'code', 'table', 'quote']],
  tikiwiki: ['!Title\n\nSome __bold__ \'\'em\'\' -+code+- [https://x.y|link].\n\n* one\n* two\n# first\n\n{CODE(colors=php)}echo 1;{CODE}\n\n||a|b\nc|d||\n', ['header', 'para', 'bullet', 'ordered', 'code', 'table']],
  twiki: ['---+ Title\n\nSome *bold* _em_ =code= [[https://x.y][link]].\n\n   * one\n   * two\n   1 first\n\n<verbatim>\ncode\n</verbatim>\n\n| *A* | *B* |\n| 1 | 2 |\n', ['header', 'para', 'bullet', 'ordered', 'code', 'table']],
  vimwiki: ['%title Vim\n\n= Title =\n\nSome *bold* _em_ `code` [[https://x.y|link]].\n\n- one\n- [X] done\n\n{{{python\ncode\n}}}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', ['header', 'para', 'bullet', 'code', 'table']],
  creole: ['= Title =\n\nSome **bold** //em// {{{code}}} [[https://x.y|link]].\n\n* one\n** nested\n# first\n\n{{{\ncode block\n}}}\n\n|=A|=B|\n|1|2|\n', ['header', 'para', 'bullet', 'ordered', 'code', 'table']],
  jira: ['h1. Title\n\nSome *bold* _em_ -del- +und+ {{code}} [link|https://x.y].\n\n* one\n** nested\n# first\n\n{code:java}\nint x;\n{code}\n\n||A||B||\n|1|2|\n\nbq. quoted\n', ['header', 'para', 'bullet', 'ordered', 'code', 'table', 'quote']],
  man: ['.TH FOO 1 "2026" "Me"\n.SH NAME\nfoo \\- does things\n.SH DESCRIPTION\nSome \\fBbold\\fR and \\fIitalic\\fR text.\n.IP \\[bu] 2\none\n.IP \\[bu] 2\ntwo\n.TP\n\\fB\\-x\\fR\nthe x flag\n.IP\n.nf\n\\f[C]\ncode here\n\\f[R]\n.fi\n.TS\ntab(@);\nlb lb\nl l.\nA@B\n_\n1@2\n.TE\n', ['header', 'para', 'header', 'para', 'bullet', 'deflist', 'code', 'table']],
  mdoc: ['.Dd 2026\n.Dt FOO 1\n.Os\n.Sh NAME\n.Nm foo\n.Nd does things\n.Sh DESCRIPTION\nSome\n.Em italic\nand\n.Sy bold\ntext.\n.Bl -bullet\n.It\none\n.It\ntwo\n.El\n.Bl -tag -width x\n.It Fl x\nthe x flag\n.El\n.Bd -literal\ncode here\n.Ed\n', ['header', 'para', 'header', 'para', 'bullet', 'deflist', 'code']],
  docbook: ['<?xml version="1.0"?><article xmlns="http://docbook.org/ns/docbook" version="5.0"><info><title>DB</title><author><personname><firstname>A</firstname><surname>B</surname></personname></author></info><section><title>Sec</title><para>Some <emphasis>em</emphasis> <emphasis role="strong">st</emphasis> <literal>code</literal> <link xlink:href="https://x.y">l</link>.</para><itemizedlist><listitem><para>one</para></listitem></itemizedlist><programlisting language="js">x()</programlisting><table><title>T</title><tgroup cols="2"><thead><row><entry>A</entry><entry>B</entry></row></thead><tbody><row><entry>1</entry><entry>2</entry></row></tbody></tgroup></table></section></article>', ['header', 'para', 'bullet', 'code', 'table']],
  jats: ['<article xmlns:xlink="http://www.w3.org/1999/xlink"><front><article-meta><title-group><article-title>J</article-title></title-group><contrib-group><contrib><name><surname>B</surname><given-names>A</given-names></name></contrib></contrib-group><pub-date><year>2026</year></pub-date></article-meta></front><body><sec><title>Sec</title><p>Some <italic>em</italic> <bold>st</bold> <monospace>c</monospace> <ext-link xlink:href="https://x.y">l</ext-link>.</p><list list-type="bullet"><list-item><p>one</p></list-item></list><preformat>code</preformat><table-wrap><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></table-wrap></sec></body></article>', ['header', 'para', 'bullet', 'code', 'table']],
  bits: ['<book><book-meta><book-title-group><book-title>Bits</book-title></book-title-group></book-meta><book-body><book-part><book-part-meta><title-group><title>Chapter</title></title-group></book-part-meta><body><p>text</p></body></book-part></book-body></book>', ['header', 'para']],
  opml: ['<?xml version="1.0"?><opml version="2.0"><head><title>Outline</title></head><body><outline text="First" _note="Some **bold** text."><outline text="Nested"/></outline><outline text="Second"/></body></opml>', ['header', 'para', 'header', 'header']],
  fb2: ['<?xml version="1.0"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>FB</book-title><author><first-name>A</first-name><last-name>B</last-name></author></title-info></description><body><section><title><p>Ch</p></title><p>Some <emphasis>em</emphasis> <strong>st</strong>.</p><cite><p>q</p></cite><poem><stanza><v>line</v></stanza></poem></section></body></FictionBook>', ['header', 'para', 'quote', 'linebl']],
  bibtex: ['@article{smith2020,\n  title = {A Study of Things},\n  author = {Smith, John and Doe, Jane},\n  journal = {Journal of Stuff},\n  year = {2020},\n  volume = {12},\n  pages = {1--10},\n  doi = {10.1000/xyz}\n}\n\n@book{lee2019,\n  title = {The Book},\n  author = {Lee, Ann},\n  publisher = {Pub},\n  year = {2019}\n}\n', ['div']],
  csljson: [JSON.stringify([{ id: 'a1', type: 'article-journal', title: 'T', author: [{ family: 'Smith', given: 'John' }], issued: { 'date-parts': [[2020, 5]] }, 'container-title': 'J' }]), ['div']],
  ris: ['TY  - JOUR\nAU  - Smith, John\nTI  - A Study\nJO  - Journal\nPY  - 2020\nVL  - 1\nSP  - 10\nEP  - 20\nDO  - 10.1/x\nER  - \n', ['div']],
  endnotexml: ['<xml><records><record><ref-type name="Journal Article"/><contributors><authors><author>Smith, John</author></authors></contributors><titles><title>A Study</title><secondary-title>Journal</secondary-title></titles><dates><year>2020</year></dates></record></records></xml>', ['div']],
  native: [writeNative(readMarkdown('# H\n\ntext *em*\n\n- a\n')), ['header', 'para', 'bullet']],
  json: [JSON.stringify(toPandoc(readMarkdown('# H\n\ntext\n'))), ['header', 'para']],
}

for (const [format, [source, kinds]] of Object.entries(samples)) {
  check('reader:pandoc-set', `${format} sample reads into the expected blocks`, async () => {
    const doc = await readDocument({ format, text: source })
    for (const kind of kinds) assert.ok(types(doc).includes(kind), `${format}: no ${kind} in [${types(doc).join(', ')}]`)
    assert.ok(blocksToText(doc.blocks).length > 0)
  })
}

check('reader:pandoc-set', 'dialect flags switch extensions on and off', () => {
  const text = '# H {#custom}\n\n| A |\n|---|\n| 1 |\n\n~~x~~ and H~2~O\n\n- [x] done\n'
  const strict = readMarkdown(text, 'markdown_strict')
  assert.ok(!has(strict, 'table'), 'strict read a table')
  assert.equal(strict.blocks[0].id, 'h-custom')
  const gfm = readMarkdown(text, 'gfm')
  assert.ok(has(gfm, 'table'))
  assert.deepEqual(gfm.blocks[gfm.blocks.length - 1].tasks, [true])
  assert.ok(Object.keys(MARKDOWN_DIALECTS).length >= 7)
})

check('reader:pandoc-set', 'bibliographies carry references and render as a list', async () => {
  const doc = await readDocument({ format: 'bibtex', text: samples.bibtex[0] })
  assert.equal(doc.references.length, 2)
  assert.equal(doc.references[0].author, 'John Smith, Jane Doe')
  assert.equal(doc.references[0]['container-title'], 'Journal of Stuff')
  assert.equal(doc.references[0].page, '1–10')
  assert.ok(blocksToText(doc.blocks).includes('A Study of Things'))
  const bib = await writeDocument(doc, 'bibtex', {})
  assert.ok(bib.text.includes('@article{smith2020') && bib.text.includes('author = {Smith, John and Doe, Jane}'))
  const biblatex = await writeDocument(doc, 'biblatex', {})
  assert.ok(biblatex.text.includes('date = {2020}') && biblatex.text.includes('journaltitle'))
  const csl = JSON.parse((await writeDocument(doc, 'csljson', {})).text)
  assert.equal(csl[0].author[0].family, 'Smith')
  assert.deepEqual(csl[0].issued['date-parts'], [[2020]])
  const back = await readDocument({ format: 'csljson', text: JSON.stringify(csl) })
  assert.equal(back.references[1].title, 'The Book')
})

/* ---------------------------------------------------------- round trips */

const roundTrippable = ['markdown_phpextra', 'markdown_mmd', 'commonmark_x', 'djot', 'typst', 'haddock', 'muse', 'dokuwiki', 'jira', 'docbook', 'jats', 'opml', 'json', 'native']
for (const format of roundTrippable) {
  check('roundtrip:pandoc-set', `markdown → ${format} → document keeps headings, lists, code and tables`, async () => {
    const written = await writeDocument(await sample(), format, {})
    const back = await readDocument({ format, text: written.text })
    for (const kind of ['header', 'bullet', 'ordered', 'code', 'table']) assert.ok(has(back, kind), `${format}: lost ${kind} in [${types(back).join(', ')}]`)
    assert.ok(headings(back).some((heading) => /heading one/i.test(heading.text)), `${format}: heading lost`)
    assert.ok(blocksToText(back.blocks).includes('emphasis'), `${format}: text lost`)
  })
}

check('roundtrip:pandoc-set', 'man pages keep headings (upper-cased), lists, code and tables', async () => {
  const written = await writeDocument(await sample(), 'man', {})
  const back = await readDocument({ format: 'man', text: written.text })
  for (const kind of ['header', 'bullet', 'ordered', 'code', 'table']) assert.ok(has(back, kind), `man: lost ${kind}`)
  assert.ok(headings(back).some((heading) => /HEADING ONE/.test(heading.text)))
})

check('roundtrip:pandoc-set', 'the Pandoc JSON AST survives a round trip unchanged in structure', async () => {
  const doc = await sample()
  const json = toPandoc(doc)
  assert.deepEqual(json['pandoc-api-version'].slice(0, 2), [1, 23])
  const back = fromPandoc(JSON.parse(JSON.stringify(json)))
  assert.deepEqual(types(back), types(doc))
  assert.equal(back.meta.title, 'Sample Title')
  const table = back.blocks.find((block) => block.t === 'table')
  assert.deepEqual(table.aligns, ['left', 'right'])
  assert.equal(inlinesToText(table.rows[0][1]), '2')
  const native = readNative(writeNative(doc))
  assert.deepEqual(types(native), types(doc))
  assert.equal(native.meta.author, 'SHKWON')
})

check('roundtrip:pandoc-set', 'every readable format accepts its own writer output', async () => {
  const original = await sample()
  for (const format of readableFormats) {
    if (!format.write) continue
    const written = await writeDocument(original, format.id, {})
    const back = await readDocument({ format: format.id, text: written.text, bytes: written.bytes })
    assert.ok(Array.isArray(back.blocks), `${format.id}: nothing read back`)
  }
})

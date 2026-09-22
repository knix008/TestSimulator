// The conversion engine: every reader, every writer, round trips and the
// binary packages. Categories are the part before " › " in each test name;
// the reporter groups on them.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import JSZip from 'jszip'
import { readDocument, writeDocument, convert, printableHtml } from '../src/lib/doc/convert.ts'
import { readMarkdown } from '../src/lib/doc/readers/markdown.ts'
import { readHtml } from '../src/lib/doc/readers/html.ts'
import { readRst, readOrg, readTextile, readMediaWiki, readAsciiDoc, readLatex } from '../src/lib/doc/readers/markup.ts'
import { readCsv, readJson, readIpynb, readPlain } from '../src/lib/doc/readers/text.ts'
import { readRtf } from '../src/lib/doc/readers/rtf.ts'
import { blocksToText, documentStats, headings, inlinesToText, slug, uniqueHeadingIds } from '../src/lib/doc/ast.ts'
import { formats, writableFormats, readableFormats } from '../src/lib/doc/formats.ts'
import { defaultWriterOptions, wrapText, applyLineEnding } from '../src/lib/doc/options.ts'
import { parseHtml, decodeEntities, textContent } from '../src/lib/doc/htmlParse.ts'

const check = (category, name, fn) => test(`${category} › ${name}`, fn)

const SAMPLE = `---
title: Sample Title
author: SHKWON
date: 2026-09-22
---

# Heading one {#custom}

Some *emphasis*, **strong**, ~~strike~~, \`code\`, and a [link](https://example.com "Title").
Line two with H~2~O and x^2^ and $E=mc^2$.\\
Hard break above.

## Lists

- one
- two
  - nested
- [x] done
- [ ] todo

1. first
2. second

Term
:   Definition of the term.

> quoted
> text

\`\`\`js
console.log('hi')
\`\`\`

| A | B |
|:--|--:|
| 1 | 2 |
| 3 | 4 |

: Table caption

![alt text](image.png)

Footnote here[^1]. Auto link https://pandoc.org and <mailto:a@b.co>.

[^1]: The note.

---

$$
\\int_0^1 x\\,dx
$$

<div class="raw">raw html</div>
`

const types = (doc) => doc.blocks.map((block) => block.t)

/* ------------------------------------------------------------ markdown */

check('reader:markdown', 'front matter becomes metadata', () => {
  const doc = readMarkdown(SAMPLE)
  assert.equal(doc.meta.title, 'Sample Title')
  assert.equal(doc.meta.author, 'SHKWON')
  assert.equal(doc.meta.date, '2026-09-22')
})

check('reader:markdown', 'block structure of the sample', () => {
  const doc = readMarkdown(SAMPLE)
  assert.deepEqual(types(doc), ['header', 'para', 'header', 'bullet', 'ordered', 'deflist', 'quote', 'code', 'table', 'para', 'para', 'hr', 'para', 'raw'])
})

check('reader:markdown', 'heading keeps an explicit id and the slug otherwise', () => {
  const doc = readMarkdown(SAMPLE)
  assert.equal(doc.blocks[0].id, 'custom')
  assert.equal(doc.blocks[2].id, 'lists')
})

check('reader:markdown', 'inline formatting: emph, strong, strike, code, link, sup, sub, math, hard break', () => {
  const para = readMarkdown(SAMPLE).blocks[1]
  const kinds = para.c.map((inline) => inline.t)
  for (const kind of ['emph', 'strong', 'strike', 'code', 'link', 'sub', 'sup', 'math', 'linebreak']) assert.ok(kinds.includes(kind), `missing ${kind}`)
  const link = para.c.find((inline) => inline.t === 'link')
  assert.equal(link.url, 'https://example.com')
  assert.equal(link.title, 'Title')
})

check('reader:markdown', 'two trailing spaces make a hard break', () => {
  const para = readMarkdown('abc.  \ndef\n').blocks[0]
  assert.deepEqual(para.c.map((inline) => inline.t), ['str', 'linebreak', 'str'])
})

check('reader:markdown', 'task list items and nesting', () => {
  const list = readMarkdown(SAMPLE).blocks[3]
  assert.equal(list.t, 'bullet')
  assert.equal(list.items.length, 4)
  assert.deepEqual(list.tasks, [null, null, true, false])
  assert.equal(list.items[1][1].t, 'bullet')
})

check('reader:markdown', 'pipe table with alignments and caption', () => {
  const table = readMarkdown(SAMPLE).blocks[8]
  assert.equal(table.t, 'table')
  assert.deepEqual(table.aligns, ['left', 'right'])
  assert.equal(table.rows.length, 2)
  assert.equal(inlinesToText(table.caption), 'Table caption')
})

check('reader:markdown', 'footnotes, autolinks and mail links', () => {
  const para = readMarkdown(SAMPLE).blocks[10]
  const note = para.c.find((inline) => inline.t === 'note')
  assert.ok(note, 'no footnote')
  assert.equal(blocksToText(note.c), 'The note.')
  const links = para.c.filter((inline) => inline.t === 'link').map((inline) => inline.url)
  assert.deepEqual(links, ['https://pandoc.org', 'mailto:a@b.co'])
})

check('reader:markdown', 'display math and raw HTML blocks', () => {
  const doc = readMarkdown(SAMPLE)
  assert.equal(doc.blocks[12].c[0].t, 'math')
  assert.equal(doc.blocks[12].c[0].display, true)
  assert.equal(doc.blocks[13].t, 'raw')
})

check('reader:markdown', 'setext headings, reference links and indented code', () => {
  const doc = readMarkdown('Title\n=====\n\nSub\n---\n\nSee [the site][ref].\n\n    indented code\n\n[ref]: https://ref.example "Ref"\n')
  assert.deepEqual(types(doc), ['header', 'header', 'para', 'code'])
  assert.equal(doc.blocks[0].level, 1)
  assert.equal(doc.blocks[1].level, 2)
  assert.equal(doc.blocks[2].c.find((inline) => inline.t === 'link').url, 'https://ref.example')
  assert.equal(doc.blocks[3].text, 'indented code')
})

check('reader:markdown', 'loose lists produce paragraphs, tight lists plain', () => {
  const tight = readMarkdown('- a\n- b\n')
  const loose = readMarkdown('- a\n\n- b\n')
  assert.equal(tight.blocks[0].items[0][0].t, 'plain')
  assert.equal(loose.blocks[0].items[0][0].t, 'para')
})

/* ---------------------------------------------------------------- html */

check('reader:html', 'elements map to blocks and inlines', () => {
  const doc = readHtml('<html><head><title>T</title><meta name="author" content="A"></head><body><h1 id="x">Head</h1><p>Some <em>em</em> <strong>st</strong> <code>c</code> <a href="/u" title="t">link</a> <img src="i.png" alt="pic"></p><ul><li>one</li><li>two<ul><li>n</li></ul></li></ul><ol start="3"><li>three</li></ol><pre><code class="language-js">code()</code></pre><blockquote><p>q</p></blockquote><table><caption>Cap</caption><thead><tr><th>A</th><th style="text-align:right">B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><hr><dl><dt>t</dt><dd>d</dd></dl></body></html>')
  assert.equal(doc.meta.title, 'T')
  assert.equal(doc.meta.author, 'A')
  assert.deepEqual(types(doc), ['header', 'para', 'bullet', 'ordered', 'code', 'quote', 'table', 'hr', 'deflist'])
  assert.equal(doc.blocks[0].id, 'x')
  assert.equal(doc.blocks[3].start, 3)
  assert.equal(doc.blocks[4].lang, 'js')
  assert.deepEqual(doc.blocks[6].aligns, ['default', 'right'])
  assert.equal(inlinesToText(doc.blocks[6].caption), 'Cap')
})

check('reader:html', 'the parser handles entities, void tags, comments and implied closes', () => {
  const root = parseHtml('<p>a &amp; b &#169; &lt;<br>c<p>second<!-- x --><img src=y>')
  const paragraphs = root.children.filter((node) => node.type === 'element' && node.tag === 'p')
  assert.equal(paragraphs.length, 2)
  assert.equal(textContent(paragraphs[0]), 'a & b © <c')
  assert.equal(decodeEntities('&nbsp;&hellip;&#x41;'), '\u00a0…A')
})

/* -------------------------------------------------------------- markup */

check('reader:rst', 'sections, lists, literal blocks, tables and links', () => {
  const doc = readRst('=====\nTitle\n=====\n\nSection\n-------\n\nA *em* **st* ``code`` `link <https://x.y>`_ text::\n\n   literal\n\n- one\n- two\n\n1. first\n2. second\n\n.. code-block:: python\n\n   print(1)\n\n=====  =====\nA      B\n=====  =====\n1      2\n=====  =====\n')
  assert.equal(doc.meta.title, 'Title')
  assert.deepEqual(types(doc), ['header', 'para', 'code', 'bullet', 'ordered', 'code', 'table'])
  assert.equal(doc.blocks[5].lang, 'python')
  assert.equal(inlinesToText(doc.blocks[6].header[1]), 'B')
})

check('reader:org', 'headlines, markup, src blocks, lists and tables', () => {
  const doc = readOrg('#+TITLE: Org Doc\n\n* Top\n\nSome *bold* /italic/ =code= [[https://x.y][link]].\n\n#+BEGIN_SRC js\nlet a = 1\n#+END_SRC\n\n- item\n- [X] done\n\n| A | B |\n|---+---|\n| 1 | 2 |\n\n** Sub\n')
  assert.equal(doc.meta.title, 'Org Doc')
  assert.deepEqual(types(doc), ['header', 'para', 'code', 'bullet', 'table', 'header'])
  assert.equal(doc.blocks[2].lang, 'js')
  assert.deepEqual(doc.blocks[3].tasks, [null, true])
  assert.equal(doc.blocks[5].level, 2)
})

check('reader:textile', 'headings, paragraphs, lists, code and tables', () => {
  const doc = readTextile('h1. Title\n\nA *strong* _em_ @code@ "link":https://x.y.\n\n* one\n** nested\n# first\n\nbc. code here\n\n|_. A |_. B |\n| 1 | 2 |\n')
  assert.deepEqual(types(doc), ['header', 'para', 'bullet', 'ordered', 'code', 'table'])
  assert.equal(doc.blocks[2].items[0][1].t, 'bullet')
  assert.equal(inlinesToText(doc.blocks[5].header[0]), 'A')
})

check('reader:mediawiki', 'headings, lists, wiki tables and links', () => {
  const doc = readMediaWiki("== Section ==\nText with '''bold''' and ''italic'' and [https://x.y label] and [[Page|text]].\n\n* a\n** b\n# one\n\n<syntaxhighlight lang=\"js\">x()</syntaxhighlight>\n\n{| class=\"wikitable\"\n! A !! B\n|-\n| 1 || 2\n|}\n----\n")
  assert.deepEqual(types(doc), ['header', 'para', 'bullet', 'ordered', 'code', 'table', 'hr'])
  assert.equal(doc.blocks[0].level, 2)
  assert.equal(doc.blocks[4].lang, 'js')
  assert.equal(doc.blocks[5].rows[0].length, 2)
})

check('reader:asciidoc', 'document header, sections, lists, listings, tables', () => {
  const doc = readAsciiDoc('= Title\nAuthor Name\n\n== Section\n\nSome *bold* _em_ `code` link:https://x.y[label].\n\n* one\n** nested\n. first\n\n[source,ruby]\n----\nputs 1\n----\n\n[cols="1,1",options="header"]\n|===\n| A | B\n\n| 1 | 2\n|===\n')
  assert.equal(doc.meta.title, 'Title')
  assert.equal(doc.meta.author, 'Author Name')
  assert.deepEqual(types(doc), ['header', 'para', 'bullet', 'ordered', 'code', 'table'])
  assert.equal(doc.blocks[4].lang, 'ruby')
  assert.equal(inlinesToText(doc.blocks[5].header[1]), 'B')
})

check('reader:latex', 'sections, environments, inline commands and math', () => {
  const doc = readLatex('\\documentclass{article}\\title{T}\\author{A}\\begin{document}\\maketitle\\section{One}\nText \\textbf{bold} \\emph{em} \\texttt{code} \\href{https://x.y}{link} $a^2$.\n\\begin{itemize}\\item a \\item b\\end{itemize}\n\\begin{verbatim}\nraw\n\\end{verbatim}\n\\begin{tabular}{lr}\\hline A & B \\\\ \\hline 1 & 2 \\\\ \\hline\\end{tabular}\n\\end{document}')
  assert.equal(doc.meta.title, 'T')
  assert.deepEqual(types(doc), ['header', 'para', 'bullet', 'code', 'table'])
  const kinds = doc.blocks[1].c.map((inline) => inline.t)
  for (const kind of ['strong', 'emph', 'code', 'link', 'math']) assert.ok(kinds.includes(kind), kind)
  assert.deepEqual(doc.blocks[4].aligns, ['left', 'right'])
})

check('reader:text', 'plain text paragraphs and indented code', () => {
  const doc = readPlain('para one\nsame para\n\n    code\n    more\n\npara two')
  assert.deepEqual(types(doc), ['para', 'code', 'para'])
})

check('reader:text', 'CSV becomes a table with numeric columns right-aligned', () => {
  const doc = readCsv('name,qty\n"Smith, J",3\nLee,12\n')
  assert.equal(doc.blocks[0].t, 'table')
  assert.equal(doc.blocks[0].rows.length, 2)
  assert.equal(inlinesToText(doc.blocks[0].rows[0][0]), 'Smith, J')
  assert.deepEqual(doc.blocks[0].aligns, ['default', 'right'])
})

check('reader:text', 'JSON document model round trip and rejection of other JSON', () => {
  const doc = readMarkdown('# H\n\ntext')
  const json = JSON.stringify({ meta: {}, blocks: doc.blocks })
  assert.deepEqual(readJson(json).blocks, doc.blocks)
  assert.throws(() => readJson('{"a":1}'))
})

check('reader:text', 'Jupyter notebook cells', () => {
  const doc = readIpynb(JSON.stringify({ cells: [{ cell_type: 'markdown', source: ['# Title\n', 'text'] }, { cell_type: 'code', source: 'print(1)', outputs: [{ output_type: 'stream', text: ['1\n'] }] }], metadata: { language_info: { name: 'python' } } }))
  assert.deepEqual(types(doc), ['header', 'para', 'code', 'code'])
  assert.equal(doc.blocks[2].lang, 'python')
})

check('reader:rtf', 'RTF written by the app reads back', async () => {
  const doc = readMarkdown('# Title\n\nSome **bold** and *italic* text.\n\n- a\n- b\n')
  const rtf = (await writeDocument(doc, 'rtf', {})).text
  const back = readRtf(rtf)
  assert.ok(types(back).includes('header'), 'no heading')
  assert.ok(back.blocks.some((block) => block.t === 'bullet'), 'no list')
  const para = back.blocks.find((block) => block.t === 'para')
  assert.ok(para.c.some((inline) => inline.t === 'strong'), 'bold lost')
  assert.ok(para.c.some((inline) => inline.t === 'emph'), 'italic lost')
})

/* ------------------------------------------------------------- writers */

const sample = () => readDocument({ format: 'markdown', text: SAMPLE })

const expectations = {
  markdown: ['# Heading one', '- one', '1. first', '```js', '| A', '[^1]:', 'title: Sample Title'],
  gfm: ['# Heading one', '~~strike~~', '<sup>2</sup>'],
  commonmark: ['# Heading one', '<s>strike</s>'],
  html: ['<h1 id="custom">', '<em>emphasis</em>', '<table>', '<pre class="sourceCode js">', 'class="footnote-ref"', '<title>Sample Title</title>', 'class="math inline"'],
  plain: ['Heading one', '===========', '- one', '1. first', '[1] The note.'],
  rst: ['Heading one', '\\begin{', '.. code-block:: js', '+-----', '.. [#]'].filter((entry) => entry !== '\\begin{'),
  latex: ['\\documentclass', '\\section', '\\begin{itemize}', '\\begin{lstlisting}[language=js]', '\\footnote{', '\\begin{tabular}', '\\title{Sample Title}'],
  org: ['* Heading one', '#+BEGIN_SRC js', '| A', '[fn:1]', '#+TITLE: Sample Title'],
  textile: ['h1. Heading one', '* one', '# first', 'bc.. ', '|_. A'],
  mediawiki: ['= Heading one =', '* one', '# first', '<syntaxhighlight lang="js">', '{| class="wikitable"', '<ref>'],
  asciidoc: ['== Heading one', '* one', '. first', '[source,js]', '|===', 'footnote:['],
  rtf: ['{\\rtf1', '\\b ', '\\i ', '\\trowd', '{\\title Sample Title}'],
  json: ['"pandoc-api-version"', '"blocks"', '"Header"'],
  csv: ['A,B', '1,2'],
  tsv: ['A\tB'],
  ipynb: ['"cell_type": "code"', '"nbformat": 4', "console.log('hi')"],
}

for (const [format, markers] of Object.entries(expectations)) {
  check('writer:text', `${format} output carries the expected structure`, async () => {
    const output = await writeDocument(await sample(), format, {})
    assert.equal(output.format, format)
    assert.ok(typeof output.text === 'string' && output.text.length > 0, 'empty output')
    for (const marker of markers) assert.ok(output.text.includes(marker), `${format}: missing ${JSON.stringify(marker)}`)
    assert.ok(output.preview.includes('<html'), 'no preview')
  })
}

check('writer:text', 'HTML fragment mode omits the document wrapper', async () => {
  const output = await writeDocument(await sample(), 'html', { standalone: false })
  assert.ok(!output.text.includes('<html'), 'wrapper present')
  assert.ok(output.text.includes('<h1'), 'content missing')
})

check('writer:text', 'table of contents and section numbers', async () => {
  const output = await writeDocument(await sample(), 'html', { toc: true, numberSections: true })
  assert.ok(output.text.includes('id="TOC"'), 'no TOC')
  assert.ok(output.text.includes('header-section-number'), 'no numbering')
  const md = await writeDocument(await sample(), 'markdown', { toc: true })
  assert.ok(md.text.includes('- [Heading one](#custom)'), 'markdown TOC missing')
})

check('writer:text', 'metadata overrides replace the source metadata', async () => {
  const output = await writeDocument(await sample(), 'html', { title: 'Override', author: 'Someone' })
  assert.ok(output.text.includes('<title>Override</title>'))
  assert.ok(output.text.includes('Someone'))
})

check('writer:text', 'wrap modes and line endings', async () => {
  const doc = readMarkdown(`${'word '.repeat(40)}\nnext line`)
  const auto = await writeDocument(doc, 'markdown', { wrap: 'auto', columns: 40, standalone: false })
  assert.ok(auto.text.split('\n').every((line) => line.length <= 41), 'a line exceeds 40 columns')
  const none = await writeDocument(doc, 'markdown', { wrap: 'none', standalone: false })
  assert.equal(none.text.trim().split('\n').length, 1)
  const crlf = await writeDocument(doc, 'markdown', { lineEnding: 'crlf', standalone: false })
  assert.ok(crlf.text.includes('\r\n'))
  assert.equal(wrapText('a b c d', { ...defaultWriterOptions, wrap: 'auto', columns: 20 }), 'a b c d')
  assert.equal(applyLineEnding('a\nb', { ...defaultWriterOptions, lineEnding: 'crlf' }), 'a\r\nb')
})

check('writer:text', 'markdown flavours and markers', async () => {
  const doc = readMarkdown('# H\n\n*em* and **st** and ~~x~~\n\n- a\n\n```\ncode\n```')
  const out = await writeDocument(doc, 'markdown', { standalone: false, headingStyle: 'setext', bulletMarker: '*', emphasisMarker: '_', codeFence: '~~~' })
  assert.ok(out.text.includes('H\n==='), 'setext heading missing')
  assert.ok(out.text.includes('* a'), 'bullet marker')
  assert.ok(out.text.includes('_em_') && out.text.includes('__st__'), 'emphasis marker')
  assert.ok(out.text.includes('~~~'), 'code fence')
})

check('writer:text', 'HTML stylesheets: every style produces a document, none omits CSS', async () => {
  for (const style of ['default', 'github', 'minimal', 'print', 'none']) {
    const output = await writeDocument(await sample(), 'html', { htmlStyle: style })
    assert.ok(output.text.includes('<!DOCTYPE html>'))
    assert.equal(output.text.includes('<style>'), style !== 'none', style)
  }
})

check('writer:text', 'HTML section divs wrap headings', async () => {
  const output = await writeDocument(await sample(), 'html', { htmlSectionDivs: true })
  assert.ok(output.text.includes('<section id="custom" class="level1">'))
})

check('writer:text', 'printable HTML carries the page rule', () => {
  const html = printableHtml(readMarkdown('# T\n\nx'), { ...defaultWriterOptions, pageSize: 'Letter', landscape: true, marginMm: 12 })
  assert.ok(html.includes('@page { size: Letter landscape; margin: 12mm; }'))
})

/* ------------------------------------------------------------- binary */

check('writer:binary', 'DOCX is a valid package with the text in document.xml', async () => {
  const output = await writeDocument(await sample(), 'docx', {})
  const zip = await JSZip.loadAsync(output.bytes)
  const xml = await zip.file('word/document.xml').async('string')
  assert.ok(xml.includes('Heading one'))
  assert.ok(xml.includes('w:tbl'), 'no table')
  assert.ok(zip.file('word/footnotes.xml'), 'no footnotes part')
  assert.ok(zip.file('word/numbering.xml'), 'no numbering part')
})

check('writer:binary', 'ODT is a valid package with mimetype first and content.xml', async () => {
  const output = await writeDocument(await sample(), 'odt', {})
  const zip = await JSZip.loadAsync(output.bytes)
  assert.equal(await zip.file('mimetype').async('string'), 'application/vnd.oasis.opendocument.text')
  const xml = await zip.file('content.xml').async('string')
  assert.ok(xml.includes('Heading one'))
  assert.ok(xml.includes('<table:table'), 'no table')
  assert.ok(xml.includes('<text:note'), 'no footnote')
  assert.ok(zip.file('styles.xml') && zip.file('META-INF/manifest.xml'))
})

check('writer:binary', 'EPUB has container, package, navigation and chapters', async () => {
  const output = await writeDocument(await sample(), 'epub', {})
  const zip = await JSZip.loadAsync(output.bytes)
  assert.equal(await zip.file('mimetype').async('string'), 'application/epub+zip')
  assert.ok(zip.file('META-INF/container.xml'))
  const opf = await zip.file('EPUB/package.opf').async('string')
  assert.ok(opf.includes('<dc:title>Sample Title</dc:title>'))
  assert.ok(opf.includes('chapter1.xhtml'))
  assert.ok(zip.file('EPUB/nav.xhtml'))
  const chapter = await zip.file('EPUB/chapter1.xhtml').async('string')
  assert.ok(chapter.includes('<br />') || !chapter.includes('<br>'), 'unclosed void tag')
})

check('writer:binary', 'PDF without a renderer yields the printable HTML preview only', async () => {
  const output = await writeDocument(await sample(), 'pdf', {})
  assert.equal(output.bytes, undefined)
  assert.ok(output.preview.includes('@page'))
  const fake = await writeDocument(await sample(), 'pdf', {}, { renderPdf: async (html) => new TextEncoder().encode(html) })
  assert.ok(fake.bytes.length > 100)
})

/* --------------------------------------------------------- round trips */

for (const format of ['markdown', 'gfm', 'html', 'rst', 'org', 'textile', 'mediawiki', 'asciidoc', 'latex', 'json', 'rtf']) {
  check('roundtrip', `markdown → ${format} → document keeps headings, lists, code and tables`, async () => {
    const original = await sample()
    const written = await writeDocument(original, format, {})
    const back = await readDocument({ format, text: written.text })
    const kinds = types(back)
    for (const kind of ['header', 'bullet', 'ordered', 'code', 'table']) assert.ok(kinds.includes(kind), `${format}: lost ${kind}`)
    assert.ok(headings(back).some((heading) => heading.text.includes('Heading one')), `${format}: heading text lost`)
    assert.ok(blocksToText(back.blocks).includes('emphasis'), `${format}: body text lost`)
  })
}

for (const format of ['docx', 'odt', 'epub']) {
  check('roundtrip', `markdown → ${format} → document reads back`, async () => {
    const original = await sample()
    const written = await writeDocument(original, format, {})
    const back = await readDocument({ format, bytes: written.bytes })
    assert.ok(types(back).includes('header'), `${format}: heading lost`)
    assert.ok(blocksToText(back.blocks).includes('emphasis'), `${format}: text lost`)
    if (format !== 'epub') assert.ok(types(back).includes('table'), `${format}: table lost`)
  })
}

check('roundtrip', 'every readable format accepts its own writer output', async () => {
  const original = await sample()
  for (const format of readableFormats) {
    if (!format.write) continue
    const written = await writeDocument(original, format.id, {})
    const back = await readDocument({ format: format.id, text: written.text, bytes: written.bytes })
    assert.ok(Array.isArray(back.blocks) && (back.blocks.length > 0 || format.group === 'biblio'), `${format.id}: nothing read back`)
  }
})

check('roundtrip', 'convert() reads and writes in one call', async () => {
  const output = await convert({ format: 'html', text: '<h1>Hi</h1><p>there</p>' }, 'markdown', { standalone: false })
  assert.equal(output.text.trim(), '# Hi\n\nthere')
})

/* ----------------------------------------------------------------- ast */

check('ast', 'slug, unique ids and heading listing', () => {
  assert.equal(slug('Hello World! 안녕'), 'hello-world-안녕')
  const doc = uniqueHeadingIds(readMarkdown('# Same\n\n# Same\n\n## Same'))
  assert.deepEqual(headings(doc).map((heading) => heading.id), ['same', 'same-1', 'same-2'])
})

check('ast', 'document statistics count words and structures', () => {
  const stats = documentStats(readMarkdown(SAMPLE))
  assert.ok(stats.words > 30)
  assert.equal(stats.headings, 2)
  assert.equal(stats.tables, 1)
  assert.equal(stats.codeBlocks, 1)
  assert.equal(stats.images, 1)
  assert.ok(stats.links >= 3)
})

check('ast', 'the format catalogue is consistent', () => {
  const ids = new Set()
  for (const format of formats) {
    assert.ok(!ids.has(format.id), `duplicate ${format.id}`)
    ids.add(format.id)
    assert.ok(format.extensions.length > 0 && format.names.ko && format.names.en && format.mime && (format.pandoc || format.id === 'postscript'), format.id)
    assert.ok(format.read || format.write, `${format.id} neither reads nor writes`)
  }
  assert.ok(writableFormats.length >= 20)
  assert.ok(readableFormats.length >= 18)
})

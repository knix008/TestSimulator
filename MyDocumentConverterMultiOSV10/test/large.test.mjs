// Large documents: a generated 46,000-line Markdown file (14,000 blocks,
// ~0.75 MB) must read, convert and round-trip within fixed time budgets,
// and the writers whose libraries scale badly (DOCX numbering) are held to
// the same budgets. The budgets are generous for CI machines; the numbers
// in the test names are what a laptop does.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDocument, writeDocument } from '../src/lib/doc/convert.ts'
import { documentStats } from '../src/lib/doc/ast.ts'

const check = (category, name, fn) => test(`${category} › ${name}`, fn)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const loadFont = async (file) => new Uint8Array(await fs.readFile(path.join(root, 'public', 'fonts', file)))

/** The generated document: 2,000 sections, each with prose, lists, a table, code and a quote. */
export function largeMarkdown(sections = 2000) {
  const parts = []
  for (let i = 0; i < sections; i += 1) {
    parts.push(`## 절 ${i} — Section ${i}\n\n이 문단은 ${i}번째 문단입니다. **굵게**, *기울임*, \`code\`, [링크](https://example.com/${i}) 와 English text mixed in for good measure, and a bit more prose so that lines wrap across the page width comfortably.\n\n- 항목 하나 ${i}\n- 항목 둘\n  - 중첩 ${i}\n\n1. first\n2. second\n\n| A | B | C |\n|---|---|---|\n| ${i} | 가 | x |\n| ${i + 1} | 나 | y |\n\n\`\`\`js\nconst v${i} = ${i} * 2\nconsole.log(v${i})\n\`\`\`\n\n> 인용 ${i}\n`)
  }
  return `# 큰 문서\n\n${parts.join('\n')}`
}

const timed = async (fn) => { const started = performance.now(); const value = await fn(); return { value, ms: Math.round(performance.now() - started) } }

let cached = null
async function large() {
  if (!cached) {
    const text = largeMarkdown()
    const { value: doc, ms } = await timed(() => readDocument({ format: 'markdown', text }))
    cached = { text, doc, readMs: ms }
  }
  return cached
}

check('large', 'a 46,000-line Markdown file (0.75 MB, 14,000 blocks) reads in well under 3 s', async () => {
  const { text, doc, readMs } = await large()
  assert.ok(text.length > 700_000 && text.split('\n').length > 40_000)
  assert.ok(doc.blocks.length >= 14_000, `${doc.blocks.length} blocks`)
  assert.ok(readMs < 3000, `read took ${readMs} ms`)
  const stats = documentStats(doc)
  assert.equal(stats.headings, 2001)
  assert.equal(stats.tables, 2000)
})

const budgets = { html: 3000, markdown: 3000, latex: 3000, rst: 3000, plain: 3000, json: 3000, native: 4000, org: 3000, mediawiki: 3000, epub: 5000, odt: 5000, rtf: 4000, docx: 12000, postscript: 6000, pptx: 8000, typst: 3000, asciidoc: 3000 }

for (const [format, budget] of Object.entries(budgets)) {
  check('large', `the large document converts to ${format} within ${budget / 1000} s`, async () => {
    const { doc } = await large()
    const { value: output, ms } = await timed(() => writeDocument(doc, format, {}, { loadFont }))
    const size = output.bytes?.length ?? output.text.length
    assert.ok(size > 100_000, `${format}: ${size} bytes`)
    assert.ok(ms < budget, `${format} took ${ms} ms`)
  })
}

check('large', 'HTML and Markdown outputs of the large document read back with every block', async () => {
  const { doc } = await large()
  const html = await writeDocument(doc, 'html', {})
  const { value: fromHtml, ms: htmlMs } = await timed(() => readDocument({ format: 'html', text: html.text }))
  assert.equal(fromHtml.blocks.length, doc.blocks.length)
  assert.ok(htmlMs < 4000, `HTML read took ${htmlMs} ms`)
  const markdown = await writeDocument(doc, 'markdown', { standalone: false })
  const fromMarkdown = await readDocument({ format: 'markdown', text: markdown.text })
  assert.equal(fromMarkdown.blocks.length, doc.blocks.length)
})

check('large', 'the PostScript output of the large document declares as many pages as it draws', async () => {
  const { doc } = await large()
  const output = await writeDocument(doc, 'postscript', {}, { loadFont })
  const text = new TextDecoder().decode(output.bytes)
  const declared = Number(/%%Pages: (\d+)/.exec(text)[1])
  const drawn = (text.match(/^%%Page: /gm) ?? []).length
  assert.ok(declared > 200, `${declared} pages`)
  assert.equal(drawn, declared)
  const back = await readDocument({ format: 'postscript', bytes: output.bytes })
  assert.equal(back.blocks.length, doc.blocks.length)
})

check('large', 'a 5 MB plain-text file passes through the plain reader and writer quickly', async () => {
  const line = '가나다라마바사 The quick brown fox jumps over the lazy dog. 0123456789\n'
  const text = line.repeat(Math.ceil((5 * 1024 * 1024) / Buffer.byteLength(line)))
  const { value: doc, ms: readMs } = await timed(() => readDocument({ format: 'plain', text }))
  assert.ok(doc.blocks.length >= 1)
  assert.ok(readMs < 4000, `plain read took ${readMs} ms`)
  const { value: output, ms: writeMs } = await timed(() => writeDocument(doc, 'html', {}))
  assert.ok(output.text.length > text.length / 2)
  assert.ok(writeMs < 4000, `html write took ${writeMs} ms`)
})

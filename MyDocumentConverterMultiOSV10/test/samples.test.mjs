// Every sample document in samples/ is converted to every writable format
// with the real engine, and the results for the representative targets are
// written to samples/output/ (with REPORT.md) so the conversions can be
// inspected by hand. One test per sample: all of its targets must succeed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { convertAll, listSamples, outputDir, DISK_TARGETS } from '../scripts/convert-samples.mjs'
import { readDocument } from '../src/lib/doc/convert.ts'

const check = (category, name, fn) => test(`${category} › ${name}`, fn)

const samples = await listSamples()
const results = await convertAll({ write: true })

check('samples', `the samples folder holds a readable sample for every input format (${samples.length})`, () => {
  assert.ok(samples.length >= 45, `${samples.length} samples`)
  assert.equal(results.length, samples.length)
})

for (const result of results) {
  const { sample } = result
  check('samples', `${sample.group}/${sample.name} converts to every output format (${result.rows.length})`, async () => {
    assert.ok(result.blocks > 0, 'nothing was read from the sample')
    const failed = result.rows.filter((row) => !row.ok)
    assert.equal(failed.length, 0, failed.map((row) => `${row.target}: ${row.error}`).join('\n'))
    // The representative outputs exist on disk and are not empty.
    for (const target of DISK_TARGETS) {
      const row = result.rows.find((entry) => entry.target === target)
      assert.ok(row && row.file, `${target} not written`)
      const stat = await fs.stat(path.join(outputDir, row.file))
      assert.ok(stat.size > 0, `${row.file} is empty`)
    }
    // And the HTML output reads back into a document with content.
    const html = result.rows.find((entry) => entry.target === 'html')
    const back = await readDocument({ format: 'html', text: await fs.readFile(path.join(outputDir, html.file), 'utf8') })
    assert.ok(back.blocks.length > 0, 'the HTML output has no blocks')
  })
}

check('samples', 'REPORT.md summarises every sample with no failures', async () => {
  const report = await fs.readFile(path.join(outputDir, 'REPORT.md'), 'utf8')
  assert.ok(report.includes('실패 0건') || report.includes('0 failed'))
  for (const sample of samples) assert.ok(report.includes(`${sample.group}/${sample.name}`), `${sample.name} missing from the report`)
})

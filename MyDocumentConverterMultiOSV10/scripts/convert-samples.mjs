// Converts every readable sample in samples/ with the real engine and keeps
// the results in samples/output/<group>/<sample>/<target>.<ext>, so anyone
// can open the folder and see that the conversions actually happen. A
// report (samples/output/REPORT.md) lists each sample × target with size
// and time, and every failure.
//
//   npm run samples:convert          writes samples/output and the report
//   (test/samples.test.mjs runs the same function and fails on any error)
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formats, formatForFile, getFormat, groupOrder, writableFormats } from '../src/lib/doc/formats.ts'
import { readDocument, writeDocument } from '../src/lib/doc/convert.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const samplesDir = path.join(root, 'samples')
export const outputDir = path.join(samplesDir, 'output')
const loadFont = async (file) => new Uint8Array(await fs.readFile(path.join(root, 'public', 'fonts', file)))

/** Targets written to disk for every sample (a cross-section of the groups); all other writers still run in memory. */
export const DISK_TARGETS = ['html', 'markdown', 'docx', 'odt', 'rtf', 'epub', 'latex', 'rst', 'plain', 'postscript', 'json', 'pptx']

const BINARY_EXT = new Set(['docx', 'odt', 'epub', 'pptx', 'zip', 'ps'])

/** Every sample file under samples/<group>/, with the format its name says. */
export async function listSamples() {
  const out = []
  for (const group of groupOrder) {
    const dir = path.join(samplesDir, group)
    let names = []
    try { names = (await fs.readdir(dir)).sort() } catch { continue }
    for (const name of names) {
      const id = name.slice(0, name.indexOf('.'))
      const format = formats.find((entry) => entry.id === id) ?? getFormat(formatForFile(name))
      if (!format?.read) continue
      out.push({ group, name, id: format.id, file: path.join(dir, name), binary: BINARY_EXT.has(name.split('.').pop()) })
    }
  }
  return out
}

/**
 * Reads one sample and writes it to every writable format. Returns one row
 * per target: ok, size, ms, and the error text when a writer failed. Files
 * for DISK_TARGETS land under samples/output when `write` is set.
 */
export async function convertSample(sample, { write = true, targets = writableFormats.map((format) => format.id) } = {}) {
  const raw = await fs.readFile(sample.file)
  const started = performance.now()
  const doc = await readDocument({ format: sample.id, bytes: sample.binary ? new Uint8Array(raw) : undefined, text: sample.binary ? undefined : raw.toString('utf8') })
  const readMs = Math.round(performance.now() - started)
  const blocks = doc.blocks.length + (doc.references?.length ?? 0)
  const rows = []
  const dir = path.join(outputDir, sample.group, sample.name.replace(/\.[^.]+$/, ''))
  if (write) await fs.mkdir(dir, { recursive: true })
  for (const target of targets) {
    if (target === 'pdf') continue // needs the desktop print engine
    const format = getFormat(target)
    const t0 = performance.now()
    try {
      const output = await writeDocument(doc, target, { standalone: true }, { loadFont })
      const bytes = output.bytes ?? new TextEncoder().encode(output.text ?? '')
      if (!bytes.length) throw new Error('empty output')
      const file = `${target}.${format.extensions[0]}`
      if (write && DISK_TARGETS.includes(target)) await fs.writeFile(path.join(dir, file), bytes)
      rows.push({ target, ok: true, size: bytes.length, ms: Math.round(performance.now() - t0), file: DISK_TARGETS.includes(target) ? path.relative(outputDir, path.join(dir, file)).replace(/\\/g, '/') : null })
    } catch (error) {
      rows.push({ target, ok: false, size: 0, ms: Math.round(performance.now() - t0), error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { sample, readMs, blocks, rows }
}

export async function convertAll({ write = true } = {}) {
  const samples = await listSamples()
  if (write) {
    await fs.rm(outputDir, { recursive: true, force: true })
    await fs.mkdir(outputDir, { recursive: true })
  }
  const results = []
  for (const sample of samples) results.push(await convertSample(sample, { write }))
  if (write) await fs.writeFile(path.join(outputDir, 'REPORT.md'), report(results), 'utf8')
  return results
}

function report(results) {
  const targets = writableFormats.filter((format) => format.id !== 'pdf').map((format) => format.id)
  const failures = results.flatMap((result) => result.rows.filter((row) => !row.ok).map((row) => ({ sample: result.sample.name, target: row.target, error: row.error })))
  const conversions = results.reduce((sum, result) => sum + result.rows.length, 0)
  const lines = [
    '# Sample conversion report',
    '',
    `생성 / generated: ${new Date().toISOString()} · \`npm run samples:convert\``,
    '',
    `읽은 샘플 ${results.length}개 × 출력 형식 ${targets.length}종 = 변환 ${conversions}건, 실패 ${failures.length}건. ${DISK_TARGETS.length}개 대표 형식(${DISK_TARGETS.join(', ')})의 결과 파일이 이 폴더에 있고, 나머지 형식은 메모리에서 변환만 검증했습니다.`,
    `${results.length} samples × ${targets.length} output formats = ${conversions} conversions, ${failures.length} failed. Files for ${DISK_TARGETS.length} representative targets are stored here; the other writers were run in memory.`,
    '',
  ]
  if (failures.length) {
    lines.push('## 실패 / Failures', '', '| 샘플 | 대상 | 오류 |', '|---|---|---|')
    for (const failure of failures) lines.push(`| ${failure.sample} | ${failure.target} | ${failure.error.replace(/\|/g, '\\|').slice(0, 200)} |`)
    lines.push('')
  }
  lines.push('## 샘플별 결과 / Per sample', '')
  for (const result of results) {
    const { sample } = result
    const failed = result.rows.filter((row) => !row.ok).length
    lines.push(`### ${sample.group}/${sample.name} (\`${sample.id}\`) — ${result.blocks} blocks read in ${result.readMs} ms, ${result.rows.length - failed}/${result.rows.length} targets OK`, '')
    lines.push('| 대상 / Target | 결과 | 크기 | 시간 | 파일 |', '|---|:-:|--:|--:|---|')
    for (const row of result.rows) lines.push(`| ${row.target} | ${row.ok ? 'OK' : 'FAIL'} | ${row.ok ? row.size.toLocaleString() : '-'} | ${row.ms} ms | ${row.file ? `[${row.file}](${row.file})` : ''} |`)
    lines.push('')
  }
  return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await convertAll({ write: true })
  const failures = results.flatMap((result) => result.rows.filter((row) => !row.ok).map((row) => `${result.sample.name} → ${row.target}: ${row.error}`))
  const conversions = results.reduce((sum, result) => sum + result.rows.length, 0)
  console.log(`${results.length} samples, ${conversions} conversions, ${failures.length} failed → ${outputDir}`)
  for (const failure of failures) console.log('  FAIL', failure)
  process.exit(failures.length ? 1 : 0)
}

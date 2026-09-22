/**
 * Bibliography formats: BibTeX / BibLaTeX, CSL JSON, RIS and EndNote XML.
 *
 * These carry references rather than prose. Reading one produces a document
 * whose `references` hold the entries (CSL field names, as Pandoc's
 * `references` metadata does) and whose blocks list them, so a bibliography
 * converts to any document format as a readable list; writing to a
 * bibliography format takes the `references` back out.
 */
import type { Block, Doc, Inline, Reference } from './ast'
import { str, textToInlines } from './ast'
import { parseHtml, textContent, type HtmlElement, type HtmlNode } from './htmlParse'
import { applyLineEnding, type WriterOptions } from './options'

/* ---------------------------------------------------------- rendering */

/** The blocks that show a reference list in a prose document. */
export function referencesToBlocks(references: Reference[]): Block[] {
  if (!references.length) return []
  const items: Block[][] = references.map((reference) => {
    const inlines: Inline[] = []
    const author = reference.author
    if (author) inlines.push(...textToInlines(author), str('.'), { t: 'space' })
    const year = reference.issued ?? reference.year
    if (year) inlines.push(str(`(${year}).`), { t: 'space' })
    if (reference.title) inlines.push({ t: 'emph', c: textToInlines(reference.title) }, str('.'))
    const container = reference['container-title'] ?? reference.journal ?? reference.booktitle
    if (container) inlines.push({ t: 'space' }, ...textToInlines(container), str('.'))
    if (reference.volume) inlines.push({ t: 'space' }, str(`${reference.volume}${reference.issue ? `(${reference.issue})` : ''}${reference.page ? `, ${reference.page}` : ''}.`))
    else if (reference.page) inlines.push({ t: 'space' }, str(`pp. ${reference.page}.`))
    if (reference.publisher) inlines.push({ t: 'space' }, ...textToInlines(reference.publisher), str('.'))
    if (reference.DOI) inlines.push({ t: 'space' }, { t: 'link', c: [str(`doi:${reference.DOI}`)], url: `https://doi.org/${reference.DOI}` })
    else if (reference.URL) inlines.push({ t: 'space' }, { t: 'link', c: [str(reference.URL)], url: reference.URL })
    return [{ t: 'para', c: [{ t: 'span', c: inlines, attrs: { id: `ref-${reference.id}` } }] }]
  })
  return [{ t: 'div', attrs: { id: 'refs', classes: ['references'] }, c: [{ t: 'bullet', items, tight: false }] }]
}

function referenceDoc(references: Reference[]): Doc {
  return { meta: {}, blocks: referencesToBlocks(references), references }
}

/* -------------------------------------------------------------- BibTeX */

const BIB_TYPES: Record<string, string> = { article: 'article-journal', book: 'book', inbook: 'chapter', incollection: 'chapter', inproceedings: 'paper-conference', conference: 'paper-conference', proceedings: 'book', phdthesis: 'thesis', mastersthesis: 'thesis', thesis: 'thesis', techreport: 'report', report: 'report', unpublished: 'manuscript', manual: 'book', misc: 'document', online: 'webpage', electronic: 'webpage', booklet: 'pamphlet', software: 'software', dataset: 'dataset' }
const CSL_TO_BIB: Record<string, string> = Object.fromEntries(Object.entries(BIB_TYPES).map(([bib, csl]) => [csl, bib]))

const BIB_FIELDS: Record<string, string> = { journal: 'container-title', journaltitle: 'container-title', booktitle: 'container-title', pages: 'page', year: 'issued', date: 'issued', doi: 'DOI', url: 'URL', isbn: 'ISBN', issn: 'ISSN', number: 'issue', address: 'publisher-place', location: 'publisher-place', institution: 'publisher', school: 'publisher', organization: 'publisher', howpublished: 'note', abstract: 'abstract', keywords: 'keyword', edition: 'edition', series: 'collection-title', chapter: 'chapter-number', editor: 'editor', volume: 'volume', title: 'title', author: 'author', publisher: 'publisher', note: 'note', month: 'month', language: 'language', eprint: 'eprint', type: 'genre' }
const CSL_TO_BIB_FIELD: Record<string, string> = { 'container-title': 'journal', page: 'pages', issued: 'year', DOI: 'doi', URL: 'url', ISBN: 'isbn', ISSN: 'issn', issue: 'number', 'publisher-place': 'address', 'collection-title': 'series', 'chapter-number': 'chapter', keyword: 'keywords', genre: 'type' }

function stripTex(value: string): string {
  return value.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1').replace(/[{}]/g, '').replace(/~/g, ' ').replace(/--/g, '–').replace(/\s+/g, ' ').trim()
}

/** `Last, First and Last2, First2` → `First Last, First2 Last2`. */
function bibNames(value: string): string {
  return stripTex(value).split(/\s+and\s+/i).map((name) => {
    const parts = name.split(',').map((part) => part.trim())
    return parts.length >= 2 ? `${parts.slice(1).join(' ')} ${parts[0]}`.trim() : name.trim()
  }).join(', ')
}

export function readBibtex(source: string): Doc {
  const references: Reference[] = []
  const text = source.replace(/\r\n?/g, '\n')
  const strings = new Map<string, string>()
  let i = 0
  while (i < text.length) {
    const at = text.indexOf('@', i)
    if (at < 0) break
    const typeMatch = /^@\s*([A-Za-z]+)\s*[{(]/.exec(text.slice(at))
    if (!typeMatch) { i = at + 1; continue }
    const open = at + typeMatch[0].length - 1
    let depth = 0
    let end = open
    for (let k = open; k < text.length; k += 1) {
      const ch = text[k]
      if (ch === '{' || (ch === '(' && k === open)) depth += 1
      if (ch === '}' || (ch === ')' && depth === 1 && text[open] === '(')) { depth -= 1; if (depth === 0) { end = k; break } }
    }
    const body = text.slice(open + 1, end)
    i = end + 1
    const type = typeMatch[1].toLowerCase()
    if (type === 'comment' || type === 'preamble') continue
    if (type === 'string') {
      const pair = /^\s*(\w+)\s*=\s*(?:\{([\s\S]*)\}|"([\s\S]*)")\s*$/.exec(body)
      if (pair) strings.set(pair[1].toLowerCase(), pair[2] ?? pair[3] ?? '')
      continue
    }
    const comma = body.indexOf(',')
    const key = (comma < 0 ? body : body.slice(0, comma)).trim()
    const reference: Reference = { id: key, type: BIB_TYPES[type] ?? type }
    const fields = comma < 0 ? '' : body.slice(comma + 1)
    let pos = 0
    while (pos < fields.length) {
      const fieldMatch = /^\s*,?\s*([A-Za-z_-]+)\s*=\s*/.exec(fields.slice(pos))
      if (!fieldMatch) break
      pos += fieldMatch[0].length
      const name = fieldMatch[1].toLowerCase()
      let value = ''
      if (fields[pos] === '{') {
        let d = 0
        let k = pos
        for (; k < fields.length; k += 1) { if (fields[k] === '{') d += 1; if (fields[k] === '}') { d -= 1; if (d === 0) break } }
        value = fields.slice(pos + 1, k)
        pos = k + 1
      } else if (fields[pos] === '"') {
        const close = fields.indexOf('"', pos + 1)
        value = fields.slice(pos + 1, close < 0 ? fields.length : close)
        pos = close < 0 ? fields.length : close + 1
      } else {
        const bare = /^([^,\n]+)/.exec(fields.slice(pos))
        value = (bare?.[1] ?? '').trim().split(/\s*#\s*/).map((part) => strings.get(part.toLowerCase()) ?? part.replace(/^"|"$/g, '')).join('')
        pos += bare?.[0].length ?? 0
      }
      const cslName = BIB_FIELDS[name] ?? name
      reference[cslName] = name === 'author' || name === 'editor' ? bibNames(value) : stripTex(value)
    }
    if (reference.issued && reference.month) reference.issued = `${reference.issued}-${monthNumber(reference.month)}`
    references.push(reference)
  }
  return referenceDoc(references)
}

function monthNumber(month: string): string {
  const names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const index = names.indexOf(month.slice(0, 3).toLowerCase())
  return index >= 0 ? String(index + 1).padStart(2, '0') : month.padStart(2, '0')
}

export function writeBibtex(doc: Doc, options: WriterOptions, variant: 'bibtex' | 'biblatex' = 'bibtex'): string {
  const references = doc.references ?? []
  const entries = references.map((reference) => {
    const type = CSL_TO_BIB[reference.type] ?? (variant === 'biblatex' && reference.type === 'webpage' ? 'online' : 'misc')
    const lines: string[] = []
    const put = (name: string, value: string | undefined) => { if (value) lines.push(`  ${name} = {${value}}`) }
    put('title', reference.title)
    put('author', reference.author?.split(/,\s*(?=[A-Z가-힣])/).map((name) => { const parts = name.trim().split(' '); return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}` : name.trim() }).join(' and '))
    put('editor', reference.editor)
    const issued = reference.issued ?? reference.year
    if (issued) {
      if (variant === 'biblatex') put('date', issued)
      else { put('year', issued.slice(0, 4)); if (issued.length >= 7) put('month', issued.slice(5, 7)) }
    }
    if (reference['container-title']) put(variant === 'biblatex' ? (type === 'article' ? 'journaltitle' : 'booktitle') : (type === 'article' ? 'journal' : 'booktitle'), reference['container-title'])
    for (const [csl, value] of Object.entries(reference)) {
      if (['id', 'type', 'title', 'author', 'editor', 'issued', 'year', 'month', 'container-title'].includes(csl) || !value) continue
      const bibName = CSL_TO_BIB_FIELD[csl] ?? csl
      if (variant === 'biblatex' && bibName === 'address') { put('location', value); continue }
      if (/^[a-z-]+$/i.test(bibName)) put(bibName, value)
    }
    return `@${type}{${reference.id || 'ref'},\n${lines.join(',\n')}\n}`
  })
  void options
  return applyLineEnding(`${entries.join('\n\n')}\n`, options)
}

/* ------------------------------------------------------------ CSL JSON */

export function readCslJson(source: string): Doc {
  const parsed = JSON.parse(source) as unknown
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { references?: unknown[] }).references) ? (parsed as { references: unknown[] }).references : null
  if (!list) throw new Error('Not CSL JSON: expected an array of references')
  const references: Reference[] = list.map((item, index) => {
    const record = item as Record<string, unknown>
    const reference: Reference = { id: String(record.id ?? `ref${index + 1}`), type: String(record.type ?? 'document') }
    for (const [key, value] of Object.entries(record)) {
      if (key === 'id' || key === 'type' || value === undefined || value === null) continue
      if (Array.isArray(value)) {
        if (key === 'author' || key === 'editor') reference[key] = value.map((name) => { const n = name as Record<string, string>; return n.literal ?? [n.given, n.family].filter(Boolean).join(' ') }).join(', ')
        else reference[key] = value.map((entry) => String(entry)).join(', ')
      } else if (typeof value === 'object') {
        const parts = (value as { 'date-parts'?: (number | string)[][]; raw?: string; literal?: string })
        reference[key] = parts['date-parts']?.[0]?.map((part, k) => (k ? String(part).padStart(2, '0') : String(part))).join('-') ?? parts.raw ?? parts.literal ?? JSON.stringify(value)
      } else reference[key] = String(value)
    }
    return reference
  })
  return referenceDoc(references)
}

export function writeCslJson(doc: Doc, options: WriterOptions): string {
  const list = (doc.references ?? []).map((reference) => {
    const out: Record<string, unknown> = { id: reference.id, type: reference.type }
    for (const [key, value] of Object.entries(reference)) {
      if (key === 'id' || key === 'type' || !value) continue
      if (key === 'author' || key === 'editor') out[key] = value.split(/,\s*(?=[A-Z가-힣])/).map((name) => { const parts = name.trim().split(' '); return parts.length > 1 ? { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') } : { literal: name.trim() } })
      else if (key === 'issued' || key === 'accessed') out[key] = { 'date-parts': [value.split('-').map((part) => Number(part)).filter((part) => Number.isFinite(part))] }
      else out[key] = value
    }
    return out
  })
  return applyLineEnding(`${JSON.stringify(list, null, 2)}\n`, options)
}

/* ----------------------------------------------------------------- RIS */

const RIS_TYPES: Record<string, string> = { JOUR: 'article-journal', BOOK: 'book', CHAP: 'chapter', CONF: 'paper-conference', CPAPER: 'paper-conference', THES: 'thesis', RPRT: 'report', ELEC: 'webpage', WEB: 'webpage', GEN: 'document', MGZN: 'article-magazine', NEWS: 'article-newspaper', COMP: 'software', DATA: 'dataset', UNPB: 'manuscript' }

export function readRis(source: string): Doc {
  const references: Reference[] = []
  let current: Reference | null = null
  const authors: string[] = []
  const finish = () => {
    if (!current) return
    if (authors.length) current.author = authors.map((name) => { const parts = name.split(',').map((part) => part.trim()); return parts.length >= 2 ? `${parts[1]} ${parts[0]}` : name }).join(', ')
    references.push(current)
    current = null
    authors.length = 0
  }
  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/.exec(rawLine)
    if (!match) continue
    const [, tag, value] = match
    if (tag === 'TY') { finish(); current = { id: `ref${references.length + 1}`, type: RIS_TYPES[value.trim()] ?? 'document' }; continue }
    if (!current) continue
    if (tag === 'ER') { finish(); continue }
    switch (tag) {
      case 'AU': case 'A1': case 'A2': case 'A3': authors.push(value.trim()); break
      case 'TI': case 'T1': current.title = value.trim(); break
      case 'T2': case 'JO': case 'JF': case 'BT': current['container-title'] = value.trim(); break
      case 'PY': case 'Y1': case 'DA': current.issued = value.trim().replace(/\/+$/, '').replace(/\//g, '-'); break
      case 'VL': current.volume = value.trim(); break
      case 'IS': current.issue = value.trim(); break
      case 'SP': current.page = current.page ? `${value.trim()}-${current.page}` : value.trim(); break
      case 'EP': current.page = current.page ? `${current.page}-${value.trim()}` : value.trim(); break
      case 'PB': current.publisher = value.trim(); break
      case 'CY': current['publisher-place'] = value.trim(); break
      case 'DO': current.DOI = value.trim(); break
      case 'UR': current.URL = value.trim(); break
      case 'SN': current.ISSN = value.trim(); break
      case 'KW': current.keyword = current.keyword ? `${current.keyword}, ${value.trim()}` : value.trim(); break
      case 'AB': case 'N2': current.abstract = value.trim(); break
      case 'N1': current.note = value.trim(); break
      case 'ID': current.id = value.trim(); break
      case 'LA': current.language = value.trim(); break
      case 'ET': current.edition = value.trim(); break
      default: break
    }
  }
  finish()
  return referenceDoc(references)
}

/* ------------------------------------------------------------ EndNote XML */

export function readEndnoteXml(source: string): Doc {
  const root = parseHtml(source)
  const references: Reference[] = []
  const walk = (node: HtmlNode): HtmlElement[] => (node.type === 'element' ? [node, ...node.children.flatMap(walk)] : [])
  const text = (node: HtmlElement | undefined) => (node ? textContent(node).replace(/\s+/g, ' ').trim() : '')
  const first = (node: HtmlElement, tag: string) => walk(node).find((element) => element.tag === tag && element !== node)
  const all = (node: HtmlElement, tag: string) => walk(node).filter((element) => element.tag === tag && element !== node)
  const typeMap: Record<string, string> = { 'Journal Article': 'article-journal', Book: 'book', 'Book Section': 'chapter', 'Conference Paper': 'paper-conference', 'Conference Proceedings': 'paper-conference', Thesis: 'thesis', Report: 'report', 'Web Page': 'webpage', 'Electronic Article': 'article-journal', Generic: 'document' }
  for (const record of walk(root).filter((element) => element.tag === 'record')) {
    const refType = first(record, 'ref-type')
    const reference: Reference = { id: text(first(record, 'rec-number')) || `ref${references.length + 1}`, type: typeMap[refType?.attrs.name ?? ''] ?? 'document' }
    const authors = all(record, 'author').map((author) => { const value = text(author); const parts = value.split(',').map((part) => part.trim()); return parts.length >= 2 ? `${parts[1]} ${parts[0]}` : value })
    if (authors.length) reference.author = authors.join(', ')
    const titles = first(record, 'titles')
    if (titles) {
      reference.title = text(first(titles, 'title'))
      const secondary = text(first(titles, 'secondary-title'))
      if (secondary) reference['container-title'] = secondary
    }
    const year = text(first(record, 'year'))
    if (year) reference.issued = year
    const fields: [string, string][] = [['volume', 'volume'], ['number', 'issue'], ['pages', 'page'], ['publisher', 'publisher'], ['pub-location', 'publisher-place'], ['isbn', 'ISBN'], ['abstract', 'abstract'], ['edition', 'edition'], ['language', 'language'], ['label', 'note']]
    for (const [tag, csl] of fields) { const value = text(first(record, tag)); if (value) reference[csl] = value }
    const doi = text(first(record, 'electronic-resource-num'))
    if (doi) reference.DOI = doi
    const url = text(first(record, 'url'))
    if (url) reference.URL = url
    const keywords = all(record, 'keyword').map(text).filter(Boolean)
    if (keywords.length) reference.keyword = keywords.join(', ')
    references.push(reference)
  }
  return referenceDoc(references)
}

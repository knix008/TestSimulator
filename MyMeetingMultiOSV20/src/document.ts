// The finished minutes. One Markdown text is built from the meeting; the print preview, the paper,
// and the HTML, Word and Markdown exports are all made from it, so they always agree.
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { resolveAssets } from './assets'
import { timeRange, type ActionItem, type Attendee, type Entry, type Meeting, type Section } from './meeting'

export type DocLabels = {
  untitled: string
  field: string
  value: string
  date: string
  time: string
  location: string
  organizer: string
  recorder: string
  attendees: string
  name: string
  role: string
  attendance: string
  present: string
  remote: string
  absent: string
  agenda: string
  discussion: string
  decisions: string
  actions: string
  no: string
  task: string
  owner: string
  due: string
  status: string
  done: string
  open: string
  info: string
  section: string
}

export const EN_LABELS: DocLabels = {
  untitled: 'Untitled Meeting', field: 'Item', value: 'Details', date: 'Date', time: 'Time', location: 'Location',
  organizer: 'Organizer', recorder: 'Recorder', attendees: 'Attendees', name: 'Name', role: 'Role / Team',
  attendance: 'Attendance', present: 'Present', remote: 'Remote', absent: 'Absent', agenda: 'Agenda',
  discussion: 'Discussion', decisions: 'Decisions', actions: 'Action Items', no: 'No.', task: 'Task', owner: 'Owner',
  due: 'Due', status: 'Status', done: 'Done', open: 'Open', info: 'Meeting Details', section: 'Section',
}

export type DocOptions = { numbering: boolean }

marked.setOptions({ gfm: true, breaks: false })

const MEDIA_ATTR = ['type', 'checked', 'disabled', 'align', 'width', 'height', 'controls', 'style']
const MEDIA_TAGS = ['video', 'audio', 'source', 'u']

/** Markdown as safe HTML: pictures stay as data: URLs, scripts and handlers never survive. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md || '', { async: false }) as string
  return resolveAssets(DOMPurify.sanitize(html, { ADD_ATTR: MEDIA_ATTR, ADD_TAGS: MEDIA_TAGS }))
}

/** Pasted HTML (a browser, Word): its structure, without styles, classes or scripts. */
export function sanitizePaste(html: string): string {
  const stripped = String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<xml[\s\S]*?<\/xml>/gi, '')
  return DOMPurify.sanitize(stripped, { ADD_ATTR: MEDIA_ATTR, ADD_TAGS: MEDIA_TAGS, FORBID_TAGS: ['style', 'meta', 'link', 'title', 'head'], FORBID_ATTR: ['class', 'style'] })
}

const cell = (text: string) => String(text || '').replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim()
const fence = (line: string, open: string) => {
  const match = line.match(/^\s*(```+|~~~+)/)
  if (!match) return null
  const char = match[1][0]
  return open === char ? '' : open || char
}

/** The discussion's own headings sit under its section: the shallowest becomes `minLevel`. */
export function demoteHeadings(md: string, minLevel = 3): string {
  const rows = md.split('\n')
  let shallowest = 7
  let open = ''
  for (const line of rows) {
    const next = fence(line, open)
    if (next !== null) {
      open = next
      continue
    }
    if (open) continue
    const match = line.match(/^(#{1,6})\s+\S/)
    if (match) shallowest = Math.min(shallowest, match[1].length)
  }
  const shift = shallowest === 7 ? 0 : Math.max(0, minLevel - shallowest)
  if (!shift) return md
  open = ''
  return rows
    .map((line) => {
      const next = fence(line, open)
      if (next !== null) {
        open = next
        return line
      }
      if (open) return line
      return line.replace(/^(#{1,6})(\s+)/, (_, hashes: string, space: string) => '#'.repeat(Math.min(6, hashes.length + shift)) + space)
    })
    .join('\n')
}

/** 1, 2, 2.1 … on every heading but the title. Numbers already typed are replaced, not doubled. */
export function numberSections(md: string): string {
  const counters = [0, 0, 0, 0, 0]
  let open = ''
  return md
    .split('\n')
    .map((line) => {
      const next = fence(line, open)
      if (next !== null) {
        open = next
        return line
      }
      if (open) return line
      const match = line.match(/^(#{2,6})\s+(.*?)\s*$/)
      if (!match) return line
      const index = match[1].length - 2
      counters[index]++
      for (let i = index + 1; i < counters.length; i++) counters[i] = 0
      let start = 0
      while (start < index && counters[start] === 0) start++
      const title = match[2].replace(/^(\d+(\.\d+)*\.?\s+)+/, '')
      const numbers = counters.slice(start, index + 1)
      return `${match[1]} ${numbers.join('.')}${numbers.length === 1 ? '.' : ''} ${title}`
    })
    .join('\n')
}

const BUILTIN_LABEL: Record<string, keyof DocLabels> = { info: 'info', attendees: 'attendees', agenda: 'agenda', discussion: 'discussion', decisions: 'decisions', actionItems: 'actions' }

/** A section's heading: the user's title, else the built-in's name. */
export const sectionHeading = (s: Section, L: DocLabels) => s.title.trim() || (BUILTIN_LABEL[s.kind] ? L[BUILTIN_LABEL[s.kind]] : L.section)

/** What a section holds, wherever it lives: a built-in's contents are the meeting's own fields. */
function contents(m: Meeting, s: Section): { body: string; entries: Entry[]; tasks: ActionItem[]; people: Attendee[]; numbered: boolean } {
  switch (s.kind) {
    case 'attendees': return { body: '', entries: [], tasks: [], people: m.attendees, numbered: false }
    case 'agenda': return { body: '', entries: m.agenda, tasks: [], people: [], numbered: true }
    case 'discussion': return { body: m.body, entries: [], tasks: [], people: [], numbered: false }
    case 'decisions': return { body: '', entries: m.decisions, tasks: [], people: [], numbered: true }
    case 'actionItems': return { body: '', entries: [], tasks: m.actionItems, people: [], numbered: false }
    default: return { body: s.body, entries: s.entries, tasks: s.tasks, people: s.people, numbered: s.kind === 'numbered' }
  }
}

const infoRows = (m: Meeting, L: DocLabels): [string, string][] =>
  ([[L.date, m.date], [L.time, timeRange(m)], [L.location, m.location], [L.organizer, m.organizer], [L.recorder, m.recorder]] as [string, string][]).filter(([, value]) => value.trim())

export function meetingToMarkdown(m: Meeting, L: DocLabels, options: DocOptions = { numbering: true }): string {
  const out: string[] = [`# ${m.title.trim() || L.untitled}`]
  m.sections.forEach((s, position) => {
    const heading = sectionHeading(s, L)
    if (s.kind === 'info') {
      const rows = infoRows(m, L)
      if (!rows.length) return
      // First on the page it reads as the title's details; anywhere else it needs its own heading.
      if (position > 0 || s.title.trim()) out.push('', `## ${heading}`)
      out.push('', `| ${L.field} | ${L.value} |`, '| --- | --- |', ...rows.map(([key, value]) => `| ${cell(key)} | ${cell(value)} |`))
      return
    }
    const c = contents(m, s)
    const people = c.people.filter((person) => person.name.trim() || person.role.trim())
    const entries = c.entries.filter((item) => item.text.trim())
    const tasks = c.tasks.filter((item) => item.task.trim() || item.owner.trim())
    const body = c.body.trim()
    if (s.kind === 'discussion' || s.kind === 'text') {
      if (body) out.push('', `## ${heading}`, '', demoteHeadings(body, 3))
    } else if (people.length) {
      out.push('', `## ${heading}`, '', `| ${L.no} | ${L.name} | ${L.role} | ${L.attendance} |`, '| --- | --- | --- | --- |')
      people.forEach((person, index) => out.push(`| ${index + 1} | ${cell(person.name)} | ${cell(person.role)} | ${L[person.attendance]} |`))
    } else if (tasks.length) {
      out.push('', `## ${heading}`, '', `| ${L.no} | ${L.task} | ${L.owner} | ${L.due} | ${L.status} |`, '| --- | --- | --- | --- | --- |')
      tasks.forEach((item, index) => out.push(`| ${index + 1} | ${cell(item.task)} | ${cell(item.owner)} | ${cell(item.due)} | ${item.done ? `☑ ${L.done}` : `☐ ${L.open}`} |`))
    } else if (entries.length) {
      out.push('', `## ${heading}`, '', ...entries.map((item, index) => `${c.numbered ? `${index + 1}.` : '-'} ${item.text.trim()}`))
    }
  })
  const md = out.join('\n')
  return `${options.numbering ? numberSections(md) : md}\n`
}

const plainText = (body: string) =>
  body
    .replace(/<img[^>]*>|!\[[^\]]*\]\([^)]*\)|<(video|audio)[^>]*>.*?<\/\1>/gi, '')
    .replace(/<\/?u>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()

/** The document as plain text, for .txt. */
export function meetingToText(m: Meeting, L: DocLabels, options: DocOptions = { numbering: true }): string {
  const title = m.title.trim() || L.untitled
  const out: string[] = [title, '='.repeat(Math.max(8, title.length * 2)), '']
  const section = (heading: string, lines: string[]) => {
    if (lines.length) out.push('', `## ${heading}`, '', ...lines)
  }
  m.sections.forEach((s, position) => {
    const heading = sectionHeading(s, L)
    if (s.kind === 'info') {
      const lines = infoRows(m, L).map(([key, value]) => `${key}: ${value.trim()}`)
      if (position > 0 || s.title.trim()) section(heading, lines)
      else out.push(...lines)
      return
    }
    const c = contents(m, s)
    if (s.kind === 'discussion' || s.kind === 'text') {
      const plain = plainText(c.body)
      section(heading, plain ? plain.split('\n') : [])
    } else if (c.people.length) {
      section(heading, c.people.filter((p) => p.name.trim()).map((p) => `- ${p.name.trim()}${p.role.trim() ? ` (${p.role.trim()})` : ''} — ${L[p.attendance]}`))
    } else if (c.tasks.length) {
      section(heading, c.tasks.filter((a) => a.task.trim()).map((a) => `[${a.done ? 'x' : ' '}] ${a.task.trim()}${a.owner.trim() ? ` — ${a.owner.trim()}` : ''}${a.due.trim() ? ` (${a.due.trim()})` : ''}`))
    } else {
      section(heading, c.entries.filter((e) => e.text.trim()).map((e, i) => `${c.numbered ? `${i + 1}.` : '-'} ${e.text.trim()}`))
    }
  })
  const text = out.join('\n')
  return `${options.numbering ? numberSections(text) : text}\n`
}

/** How the document looks on paper and in exports. `--doc-font` and `--doc-size` come from the settings. */
export const DOC_CSS = `
.doc { font-family: var(--doc-font, 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI', sans-serif); font-size: var(--doc-size, 10.5pt); line-height: 1.55; color: #1f2328; word-wrap: break-word; }
.doc h1 { font-size: 1.9em; margin: 0 0 0.6em; padding-bottom: 0.3em; border-bottom: 2px solid #2b4c7e; color: #1d3557; }
.doc h2 { font-size: 1.35em; margin: 1.3em 0 0.5em; padding-bottom: 0.2em; border-bottom: 1px solid #c9d3e0; color: #1d3557; }
.doc h3 { font-size: 1.15em; margin: 1.1em 0 0.4em; }
.doc h4, .doc h5, .doc h6 { font-size: 1em; margin: 1em 0 0.3em; }
.doc p { margin: 0.45em 0; }
.doc ul, .doc ol { margin: 0.4em 0; padding-left: 1.6em; }
.doc li { margin: 0.15em 0; }
.doc li > input[type=checkbox] { margin-right: 0.4em; }
.doc table { border-collapse: collapse; width: 100%; margin: 0.6em 0; font-size: 0.95em; }
.doc th, .doc td { border: 1px solid #b8c2cf; padding: 0.35em 0.6em; text-align: left; vertical-align: top; }
.doc th { background: #eef2f7; font-weight: 600; }
.doc tr { break-inside: avoid; }
.doc blockquote { margin: 0.6em 0; padding: 0.2em 0.9em; border-left: 4px solid #c9d3e0; color: #57606a; }
.doc code { font-family: Consolas, 'D2Coding', monospace; font-size: 0.92em; background: #f1f3f5; padding: 0.05em 0.3em; border-radius: 3px; }
.doc pre { background: #f6f8fa; border: 1px solid #e1e4e8; padding: 0.6em 0.8em; border-radius: 4px; white-space: pre-wrap; }
.doc pre code { background: none; padding: 0; }
.doc hr { border: 0; border-top: 1px solid #c9d3e0; margin: 1em 0; }
.doc img, .doc video { max-width: 100%; height: auto; }
.doc img[alt^="icon:"] { display: inline-block; vertical-align: -0.22em; margin: 0 0.08em; }
.doc a { color: #1f5fbf; }
`

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export type DocStyle = { fontFamily: string; fontSizePt: number }

export const docStyleVars = (style: DocStyle) => `--doc-font:${style.fontFamily ? `'${style.fontFamily.replace(/'/g, '')}', ` : ''}'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;--doc-size:${style.fontSizePt}pt`

/** A stand-alone .html file: pictures are inside, so it can be mailed as it is. */
export function standaloneHtml(title: string, bodyHtml: string, style: DocStyle, lang: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MyMeeting ${__APP_VERSION__}">
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; background: #f3f4f6; }
.doc { max-width: 820px; margin: 24px auto; padding: 40px 48px; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
@media print { body { background: #fff; } .doc { box-shadow: none; margin: 0; padding: 0; max-width: none; } }
${DOC_CSS}
</style>
</head>
<body>
<article class="doc" style="${docStyleVars(style)}">
${bodyHtml}
</article>
</body>
</html>
`
}

/** A Word document: Word opens HTML saved as .doc, with its own page size and margins. */
export function wordDocument(title: string, bodyHtml: string, style: DocStyle, paper: { width: number; height: number; margins: { top: number; right: number; bottom: number; left: number } }): string {
  const font = style.fontFamily || 'Malgun Gothic'
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page Section1 { size: ${paper.width}mm ${paper.height}mm; margin: ${paper.margins.top}mm ${paper.margins.right}mm ${paper.margins.bottom}mm ${paper.margins.left}mm; }
div.Section1 { page: Section1; }
body { font-family: '${font}', 'Malgun Gothic', sans-serif; font-size: ${style.fontSizePt}pt; }
${DOC_CSS.replace(/var\(--doc-font[^)]*\)\)?/, `'${font}', 'Malgun Gothic', sans-serif`).replace(/var\(--doc-size[^)]*\)/, `${style.fontSizePt}pt`)}
</style>
</head>
<body>
<div class="Section1 doc">
${bodyHtml}
</div>
</body>
</html>
`
}

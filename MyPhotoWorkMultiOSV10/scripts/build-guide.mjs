// npm run build:guide: doc/UsersGuide.md (Korean) and doc/UsersGuide.en.md (English) into
// doc/index.html, the page the user guide window shows. The Markdown is what gets edited;
// test/guide.test.mjs fails when index.html has not been regenerated.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docDir = path.join(root, 'doc')

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function inline(text) {
  // Code first, so what is inside it is not read as Markdown.
  const codes = []
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`)
    return `\uE000${codes.length - 1}\uE000`
  })
  out = escapeHtml(out)
  out = out.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<i>$2</i>')
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => (/^https?:/.test(href) ? `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>` : label))
  return out.replace(/\uE000(\d+)\uE000/g, (_, index) => codes[Number(index)])
}

const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/

function renderList(lines, start) {
  const baseIndent = listItem.exec(lines[start])[1].length
  const ordered = /\d/.test(listItem.exec(lines[start])[2])
  let html = ordered ? '<ol>' : '<ul>'
  let at = start
  while (at < lines.length) {
    const match = listItem.exec(lines[at])
    if (!match || match[1].length < baseIndent) {
      // A wrapped line belongs to the item above.
      break
    }
    if (match[1].length > baseIndent) break
    let body = match[3]
    at += 1
    while (at < lines.length && lines[at].trim() && !listItem.test(lines[at]) && /^\s/.test(lines[at])) {
      body += ` ${lines[at].trim()}`
      at += 1
    }
    let nested = ''
    if (at < lines.length && listItem.test(lines[at]) && listItem.exec(lines[at])[1].length > baseIndent) {
      const sub = renderList(lines, at)
      nested = sub.html
      at = sub.next
    }
    html += `<li>${inline(body)}${nested}</li>`
    if (at < lines.length && !lines[at].trim() && at + 1 < lines.length && listItem.test(lines[at + 1]) && listItem.exec(lines[at + 1])[1].length === baseIndent) at += 1
  }
  return { html: `${html}${ordered ? '</ol>' : '</ul>'}`, next: at }
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())

export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let html = ''
  let open = false
  let at = 0
  let number = 0
  while (at < lines.length) {
    const line = lines[at]
    if (!line.trim()) { at += 1; continue }
    if (line.startsWith('# ')) { at += 1; continue }
    if (line.startsWith('## ')) {
      if (open) html += '</section>'
      number += 1
      html += `<section id="s${number}"><h2>${inline(line.slice(3))}</h2>`
      open = true
      at += 1
      continue
    }
    const heading = /^(#{3,4}) (.*)$/.exec(line)
    if (heading) {
      html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`
      at += 1
      continue
    }
    if (line.startsWith('```')) {
      const code = []
      at += 1
      while (at < lines.length && !lines[at].startsWith('```')) { code.push(lines[at]); at += 1 }
      at += 1
      html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`
      continue
    }
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim())
    if (image) {
      html += `<figure><img src="${image[2]}" alt="${escapeHtml(image[1])}" loading="lazy"><figcaption>${inline(image[1])}</figcaption></figure>`
      at += 1
      continue
    }
    if (line.trim().startsWith('|') && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[at + 1] ?? '')) {
      const head = cells(line)
      at += 2
      let rows = ''
      while (at < lines.length && lines[at].trim().startsWith('|')) {
        rows += `<tr>${cells(lines[at]).map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`
        at += 1
      }
      html += `<div class="table"><table><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
      continue
    }
    if (listItem.test(line)) {
      const list = renderList(lines, at)
      html += list.html
      at = list.next
      continue
    }
    if (line.startsWith('>')) {
      const quote = []
      while (at < lines.length && lines[at].startsWith('>')) { quote.push(lines[at].replace(/^>\s?/, '')); at += 1 }
      html += `<blockquote>${inline(quote.join(' '))}</blockquote>`
      continue
    }
    const paragraph = []
    while (at < lines.length && lines[at].trim() && !/^(#{2,4} |```|\||!\[|>)/.test(lines[at]) && !listItem.test(lines[at])) {
      paragraph.push(lines[at].trim())
      at += 1
    }
    if (!paragraph.length) { paragraph.push(lines[at].trim()); at += 1 }
    html += `<p>${inline(paragraph.join(' '))}</p>`
  }
  return open ? `${html}</section>` : html
}

const icon = (body) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export function buildGuide() {
  const ko = renderMarkdown(fs.readFileSync(path.join(docDir, 'UsersGuide.md'), 'utf8'))
  const en = renderMarkdown(fs.readFileSync(path.join(docDir, 'UsersGuide.en.md'), 'utf8'))
  return `<!doctype html>
<!-- Generated by scripts/build-guide.mjs from UsersGuide.md and UsersGuide.en.md. Do not edit. -->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Photo Work 사용자 설명서</title>
<link rel="icon" type="image/svg+xml" href="../app-icon.svg">
<link rel="stylesheet" href="manual.css">
</head>
<body class="ko">
<header class="doc-head">
  <h1><img src="../app-icon.svg" alt=""><span class="ko">My Photo Work 사용자 설명서</span><span class="en">My Photo Work User Guide</span></h1>
  <div class="tools">
    <div class="font-pick" data-font-control>
      <button type="button" id="font-button" aria-haspopup="listbox" aria-expanded="false">${icon('<path d="M4 20 10 4h1l6 16M6.5 14h8"/><path d="M21 20v-6"/>')}<span id="font-now"></span>${icon('<path d="m6 9 6 6 6-6"/>')}</button>
      <div class="font-list" id="font-list" role="listbox" hidden></div>
    </div>
    <div class="size" role="group">
      <button type="button" id="size-down">${icon('<path d="M5 12h14"/>')}</button>
      <output id="size-now">15px</output>
      <button type="button" id="size-up">${icon('<path d="M5 12h14M12 5v14"/>')}</button>
    </div>
    <div class="lang-group" role="group" aria-label="Language">
      <button type="button" data-lang="ko"><svg class="flag" width="22" height="16" viewBox="2 5 20 14" aria-hidden="true"><rect x="2" y="5" width="20" height="14" fill="#fff"/><g fill="none" stroke="#111" stroke-width="0.9"><g transform="translate(5.8 8.6) rotate(-56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2"/></g><g transform="translate(18.2 8.6) rotate(56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2"/></g><g transform="translate(5.8 15.4) rotate(56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2"/></g><g transform="translate(18.2 15.4) rotate(-56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2"/></g></g><g transform="rotate(-34 12 12)"><circle cx="12" cy="12" r="3.8" fill="#0047a0"/><path d="M8.2 12a3.8 3.8 0 0 1 7.6 0a1.9 1.9 0 0 1-3.8 0a1.9 1.9 0 0 0-3.8 0z" fill="#cd2e3a"/></g></svg>한국어</button>
      <button type="button" data-lang="en"><svg class="flag" width="22" height="16" viewBox="2 5 20 14" aria-hidden="true"><rect x="2" y="5" width="20" height="14" fill="#012169"/><path d="M2 5l20 14M22 5L2 19" stroke="#fff" stroke-width="3.4"/><path d="M2 5l20 14M22 5L2 19" stroke="#c8102e" stroke-width="1.2"/><path d="M12 5v14M2 12h20" stroke="#fff" stroke-width="4.6"/><path d="M12 5v14M2 12h20" stroke="#c8102e" stroke-width="2.6"/></svg>English</button>
    </div>
  </div>
  <span class="spacer"></span>
  <span class="win-buttons">
    <button type="button" class="win-btn" id="win-min"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor"/></svg></button>
    <button type="button" class="win-btn" id="win-max"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x=".5" y=".5" width="9" height="9"/></svg></button>
    <button type="button" class="win-btn close" id="win-close"><svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.1"><path d="M.5.5l9 9M9.5.5l-9 9"/></svg></button>
  </span>
</header>
<div class="layout">
  <nav id="side" aria-label="Contents"></nav>
  <div id="content">
    <main>
      <article class="ko">${ko}</article>
      <article class="en">${en}</article>
    </main>
  </div>
</div>
<span class="grip" id="grip" aria-hidden="true"></span>
<script src="manual.js"></script>
</body>
</html>
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fs.writeFileSync(path.join(docDir, 'index.html'), buildGuide())
  console.log('doc/index.html written.')
}

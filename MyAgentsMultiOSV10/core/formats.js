// File formats for the Read / Save / Convert nodes, with no dependencies (ARCHITECTURE.md §3.4):
//
//   read:   text · markdown · html · csv · json · pdf (text) · docx (text, headings) · xlsx (rows) · image
//   write:  text · markdown · html · csv · json · pdf (Korean too) · docx · xlsx · image (from a picture or an SVG card)
//
// parse(bytes, format, name) → a plain value (always with `format` and `text` where there is text);
// render(value, format, opts) → { bytes, mime, ext }. ZIP (docx, xlsx) is read and written here; PDF text comes
// from the content streams (FlateDecode, ToUnicode maps, UCS-2 hex strings); written PDFs use the standard Korean
// CID font (HYGoThic-Medium, UniKS-UCS2-H), which PDF viewers have or substitute, so no font file is embedded.
import zlib from 'node:zlib';
import { AppError } from './errors.js';

export const FORMATS = ['text', 'markdown', 'html', 'csv', 'json', 'pdf', 'docx', 'xlsx', 'image'];
export const TEXT_FORMATS = ['text', 'markdown', 'html', 'csv', 'json'];
const EXT = { text: 'txt', markdown: 'md', html: 'html', csv: 'csv', json: 'json', pdf: 'pdf', docx: 'docx', xlsx: 'xlsx' };
const MIME = {
  text: 'text/plain; charset=utf-8', markdown: 'text/markdown; charset=utf-8', html: 'text/html; charset=utf-8', csv: 'text/csv; charset=utf-8', json: 'application/json',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' };

/** The format of a file name or a MIME type ('auto' when unknown). */
export function formatOf(name = '', mime = '') {
  const m = String(mime).toLowerCase();
  const ext = String(name).toLowerCase().split(/[?#]/)[0].match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (/^image\//.test(m) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (m.includes('pdf') || ext === 'pdf') return 'pdf';
  if (m.includes('wordprocessingml') || ext === 'docx') return 'docx';
  if (m.includes('spreadsheetml') || ext === 'xlsx') return 'xlsx';
  if (m.includes('html') || ['html', 'htm'].includes(ext)) return 'html';
  if (m.includes('markdown') || ['md', 'markdown'].includes(ext)) return 'markdown';
  if (m.includes('csv') || ['csv', 'tsv'].includes(ext)) return 'csv';
  if (m.includes('json') || ext === 'json') return 'json';
  if (m.startsWith('text/') || ['txt', 'log', 'text', 'ini', 'yaml', 'yml', 'xml'].includes(ext)) return 'text';
  return 'auto';
}

/** Guesses from the bytes when the name says nothing. */
export function sniff(bytes) {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (imageInfo(b)) return 'image';
  if (b[0] === 0x50 && b[1] === 0x4b) {
    try { const names = [...unzip(b).keys()]; if (names.includes('word/document.xml')) return 'docx'; if (names.some((n) => n.startsWith('xl/'))) return 'xlsx'; } catch { /* not a zip */ }
  }
  const head = b.subarray(0, 2000).toString('utf8').trimStart();
  if (/^[[{]/.test(head)) { try { JSON.parse(b.toString('utf8')); return 'json'; } catch { /* text */ } }
  if (/^<!doctype html|^<html|<body[\s>]/i.test(head)) return 'html';
  if (/^#{1,6} |\n#{1,6} |\n- |\n\* |\n```/.test(`\n${head}`)) return 'markdown';
  return 'text';
}

// ───────────────────────── small helpers

const xmlDecode = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlEncode = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const esc = xmlEncode;

const textOf = (v) => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  if (typeof v === 'object' && !Array.isArray(v)) { if (typeof v.markdown === 'string') return v.markdown; if (typeof v.text === 'string') return v.text; }
  return JSON.stringify(v, null, 2);
};
const rowsOf = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') { if (Array.isArray(v.items)) return v.items; if (Array.isArray(v.rows)) return v.rows; if (Array.isArray(v.data)) return v.data; }
  return null;
};

// ───────────────────────── CSV

export function parseCsv(text, d = ',') {
  const s = String(text ?? '').replace(/^﻿/, '');
  const delim = d === 'tab' || d === '\\t' ? '\t' : d;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const data = rows.filter((r) => r.some((c) => c !== ''));
  if (!data.length) return [];
  const head = data[0].map((h, i) => h.trim() || `col${i + 1}`);
  const num = (c) => (/^-?\d+(\.\d+)?$/.test(c.trim()) ? Number(c) : c);
  return data.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, num(r[i] ?? '')])));
}

export function toCsv(items, d = ',') {
  const list = rowsOf(items) ?? [];
  if (!list.length) return '';
  const delim = d === 'tab' || d === '\\t' ? '\t' : d;
  const cols = [...new Set(list.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : ['value'])))];
  const cell = (v) => { const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /["\n\r]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(cell).join(delim), ...list.map((r) => cols.map((c) => cell(r && typeof r === 'object' ? r[c] : r)).join(delim))].join('\n');
}

// ───────────────────────── Markdown ↔ HTML

const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

/** Markdown (headings, lists, code, quotes, tables, links, emphasis) → HTML. */
export function markdownToHtml(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const lang = line.slice(3).trim();
      const code = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i]); i += 1) code.push(lines[i]);
      out.push(`<pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(code.join('\n'))}</code></pre>`);
      i += 1; continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i += 1; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { flush(); out.push('<hr>'); i += 1; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      flush();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      const body = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i += 1) body.push(cells(lines[i]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d/.test(line);
      const items = [];
      for (; i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]); i += 1) items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x.replace(/^\[( |x)\]\s*/i, (m, c) => (c.trim() ? '☑ ' : '☐ ')))}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const q = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i += 1) q.push(lines[i].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    if (!line.trim()) { flush(); i += 1; continue; }
    para.push(line.trim());
    i += 1;
  }
  flush();
  return out.join('\n');
}

export function htmlDocument(body, title = '') {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.6 'Segoe UI','Malgun Gothic','Apple SD Gothic Neo',sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#1b1f24}
h1,h2,h3{line-height:1.25}code{background:#f1f3f6;padding:1px 4px;border-radius:4px}pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}
pre code{background:none;padding:0}table{border-collapse:collapse;margin:12px 0}th,td{border:1px solid #d0d7de;padding:5px 10px;text-align:left}th{background:#f1f3f6}
blockquote{margin:0;padding:4px 14px;border-left:4px solid #d0d7de;color:#57606a}img{max-width:100%}</style></head>
<body>
${body}
</body></html>
`;
}

/** HTML → plain text (blocks on their own lines). */
export function htmlText(html) {
  return xmlDecode(String(html ?? '')
    .replace(/<(script|style|head|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote|pre|section|article|header|footer)>/gi, '\n')
    .replace(/<t[dh][^>]*>/gi, '\t').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+\n/g, '\n').replace(/\n\t+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[  ]{2,}/g, ' ').trim();
}

/** HTML → Markdown (headings, paragraphs, lists, links, emphasis, code, tables). */
export function htmlToMarkdown(html) {
  let s = String(html ?? '').replace(/<(script|style|head|noscript)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, c) => `\n\n\`\`\`\n${xmlDecode(c.replace(/<[^>]+>/g, ''))}\n\`\`\`\n\n`);
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, t) => {
    const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => htmlText(c[1]).replace(/\|/g, '\\|')));
    if (!rows.length) return '';
    return `\n\n| ${rows[0].join(' | ')} |\n| ${rows[0].map(() => '---').join(' | ')} |\n${rows.slice(1).map((r) => `| ${r.join(' | ')} |`).join('\n')}\n\n`;
  });
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(Number(n))} ${htmlText(t)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${htmlText(t)}`)
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => `[${htmlText(t)}](${h})`)
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**').replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|ul|ol|blockquote)>/gi, '\n\n').replace(/<[^>]+>/g, '');
  return xmlDecode(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const headingsOf = (md) => [...String(md).matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: m[2].trim() }));

/** A list of rows as a Markdown table. */
export function markdownTable(items) {
  const list = rowsOf(items) ?? [];
  if (!list.length) return '';
  const cols = [...new Set(list.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : ['value'])))];
  const c = (v) => String(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...list.map((r) => `| ${cols.map((k) => c(r && typeof r === 'object' ? r[k] : r)).join(' | ')} |`)].join('\n');
}

// ───────────────────────── ZIP (docx, xlsx)

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** name → () => Buffer for each entry of a ZIP file. */
export function unzip(input) {
  const buf = Buffer.from(input);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new AppError('BAD_ZIP', 'Not a ZIP file (docx / xlsx)', 400);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count && off + 46 <= buf.length; n += 1) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const size = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extra = buf.readUInt16LE(off + 30);
    const comment = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files.set(name, () => (method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : Buffer.alloc(0)));
    off += 46 + nameLen + extra + comment;
  }
  return files;
}

/** [{ name, data }] → a ZIP file (deflated). */
export function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    const comp = zlib.deflateRawSync(data);
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, comp);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(8, 10);
    head.writeUInt16LE(0, 12); head.writeUInt16LE(0x21, 14); head.writeUInt32LE(crc, 16); head.writeUInt32LE(comp.length, 20); head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(name.length, 28); head.writeUInt32LE(offset, 42);
    central.push(head, name);
    offset += 30 + name.length + comp.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

// ───────────────────────── DOCX

export function readDocx(bytes) {
  const files = unzip(bytes);
  const doc = files.get('word/document.xml')?.();
  if (!doc) throw new AppError('BAD_DOCX', 'No word/document.xml: not a Word file', 400);
  const xml = doc.toString('utf8');
  const body = xml.slice(xml.indexOf('<w:body'));
  const paragraphs = [];
  for (const p of body.split(/<\/w:p>/)) {
    if (!/<w:p[\s>]/.test(p)) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? '';
    let text = '';
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) text += m[1] !== undefined ? xmlDecode(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n';
    const level = /heading\s*(\d)|^(?:제목)\s*(\d)|^Title$/i.exec(style.replace(/([a-z])(\d)/i, '$1 $2'));
    const list = /<w:numPr[\s/>]/.test(p);
    paragraphs.push({ style, text, heading: level ? Number(level[1] ?? level[2] ?? 1) : 0, list });
  }
  const markdown = paragraphs.map((p) => (p.heading ? `${'#'.repeat(Math.min(6, p.heading))} ${p.text}` : p.list ? `- ${p.text}` : p.text)).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: paragraphs.map((p) => p.text).join('\n').trim(), markdown, paragraphs: paragraphs.filter((p) => p.text.trim()).length };
}

const docxRun = (text, { bold = false, size = 0, mono = false } = {}) => `<w:r><w:rPr><w:rFonts w:ascii="${mono ? 'Consolas' : 'Segoe UI'}" w:hAnsi="${mono ? 'Consolas' : 'Segoe UI'}" w:eastAsia="맑은 고딕"/>${bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xmlEncode(text)}</w:t></w:r>`;
/** **bold** inside a line → runs. */
const docxRuns = (line, opts) => line.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? docxRun(part.slice(2, -2), { ...opts, bold: true }) : docxRun(part.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'), opts))).join('');

/** Markdown → a Word document (headings, lists, code, tables as tab-separated lines). */
export function writeDocx(markdown, { title = '' } = {}) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const paras = [];
  let code = false;
  for (const raw of lines) {
    if (/^```/.test(raw)) { code = !code; continue; }
    if (code) { paras.push(`<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${docxRun(raw, { mono: true, size: 19 })}</w:p>`); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (h) { const size = [0, 36, 30, 26, 24, 22, 22][h[1].length]; paras.push(`<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>${docxRuns(h[2], { bold: true, size })}</w:p>`); continue; }
    if (/^\s*\|?\s*:?-{3,}/.test(raw) && raw.includes('-')) continue;
    if (/^\s*\|.*\|\s*$/.test(raw)) { paras.push(`<w:p>${docxRuns(raw.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join('\t'), {})}</w:p>`); continue; }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (li) { paras.push(`<w:p><w:pPr><w:ind w:left="${360 + li[1].length * 180}" w:hanging="240"/></w:pPr>${docxRuns(`${/\d/.test(li[2]) ? li[2] : '•'} ${li[3]}`, {})}</w:p>`); continue; }
    paras.push(raw.trim() ? `<w:p>${docxRuns(raw, {})}</w:p>` : '<w:p/>');
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEncode(title)}</dc:title><dc:creator>MyAgents</dc:creator></cp:coreProperties>` },
    { name: 'word/document.xml', data: document },
  ]);
}

// ───────────────────────── XLSX

const colIndex = (ref) => { let n = 0; for (const ch of String(ref).replace(/\d+/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const colName = (i) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

export function readXlsx(bytes) {
  const files = unzip(bytes);
  const shared = files.get('xl/sharedStrings.xml')?.()?.toString('utf8') ?? '';
  const strings = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlDecode([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join('')));
  const book = files.get('xl/workbook.xml')?.()?.toString('utf8') ?? '';
  const names = [...book.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => xmlDecode(m[1]));
  const sheetFiles = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const sheets = sheetFiles.map((f, si) => {
    const xml = files.get(f)().toString('utf8');
    const grid = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(c[1])?.[1];
        const type = /t="([^"]+)"/.exec(c[1])?.[1] ?? '';
        const inner = c[2] ?? '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value = '';
        if (type === 's') value = strings[Number(v)] ?? '';
        else if (type === 'inlineStr') value = xmlDecode([...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join(''));
        else if (type === 'b') value = v === '1';
        else if (v !== undefined) value = /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v) ? Number(v) : xmlDecode(v);
        row[ref ? colIndex(ref) : row.length] = value;
      }
      grid.push(Array.from(row, (x) => (x === undefined ? '' : x)));
    }
    const rows = grid.filter((r) => r.some((x) => x !== ''));
    const head = (rows[0] ?? []).map((h, i) => String(h).trim() || `col${i + 1}`);
    const items = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
    return { name: names[si] ?? `Sheet${si + 1}`, columns: head, items };
  });
  const first = sheets[0] ?? { columns: [], items: [] };
  return { items: first.items, count: first.items.length, columns: first.columns, sheets: sheets.map((s) => ({ name: s.name, count: s.items.length, columns: s.columns })), text: toCsv(first.items) };
}

export function writeXlsx(items, { sheet = 'Sheet1' } = {}) {
  const list = rowsOf(items) ?? [];
  const cols = [...new Set(list.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : ['value'])))];
  const cell = (v, ref) => (typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : typeof v === 'boolean' ? `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEncode(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : v)}</t></is></c>`);
  const rows = [cols, ...list.map((r) => cols.map((c) => (r && typeof r === 'object' ? r[c] : r)))];
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(v, `${colName(j)}${i + 1}`)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEncode(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
  ]);
}

// ───────────────────────── PDF

function pdfStringBytes(s, i) {
  // a literal string starting at s[i] === '(' → [bytes, next index]
  const out = [];
  let depth = 0;
  for (let k = i; k < s.length; k += 1) {
    const ch = s[k];
    if (ch === '\\') {
      const n = s[k + 1];
      const map = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
      if (n in map) { out.push(map[n]); k += 1; } else if (/[0-7]/.test(n)) { const oct = /^[0-7]{1,3}/.exec(s.slice(k + 1, k + 4))[0]; out.push(parseInt(oct, 8) & 255); k += oct.length; } else if (n === '\r' || n === '\n') { k += n === '\r' && s[k + 2] === '\n' ? 2 : 1; } else { k += 1; }
      continue;
    }
    if (ch === '(') { depth += 1; if (depth === 1) continue; }
    if (ch === ')') { depth -= 1; if (depth === 0) return [out, k + 1]; }
    out.push(ch.charCodeAt(0) & 255);
  }
  return [out, s.length];
}

function parseCmap(text, map) {
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(m[1], 16), utf16(m[2]));
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (m[4]) { const base = parseInt(m[4], 16); for (let c = lo; c <= hi && c - lo < 65536; c += 1) map.set(c, String.fromCodePoint(base + (c - lo))); }
      else { const list = [...m[5].matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => utf16(x[1])); list.forEach((v, j) => map.set(lo + j, v)); }
    }
  }
  return map;
}
function utf16(hex) { const b = Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex'); let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i)); return s || String.fromCharCode(parseInt(hex, 16)); }

/** Text of a PDF: every content stream's text operators, lines kept. */
export function readPdf(bytes) {
  const buf = Buffer.from(bytes);
  const raw = buf.toString('latin1');
  const streams = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const dict = raw.slice(Math.max(0, raw.lastIndexOf('obj', m.index)), m.index);
    let data = buf.subarray(start, end);
    if (/FlateDecode/.test(dict)) { try { data = zlib.inflateSync(data); } catch { try { data = zlib.inflateSync(data.subarray(0, data.length - 1)); } catch { data = null; } } }
    else if (/(DCTDecode|JPXDecode|CCITT|JBIG2)/.test(dict)) data = null;
    if (data) streams.push(data.toString('latin1'));
    re.lastIndex = end;
  }
  const cmap = new Map();
  for (const s of streams) if (s.includes('begincmap')) parseCmap(s, cmap);
  const twoByte = /UCS2|Identity-H|UTF16/.test(raw) || [...cmap.keys()].some((k) => k > 255);
  const decode = (bytesArr, hex) => {
    if (cmap.size) {
      let out = '';
      const step = twoByte ? 2 : 1;
      for (let i = 0; i + step - 1 < bytesArr.length; i += step) { const code = step === 2 ? (bytesArr[i] << 8) | bytesArr[i + 1] : bytesArr[i]; out += cmap.get(code) ?? (step === 1 ? String.fromCharCode(code) : ''); }
      return out;
    }
    if ((hex && twoByte) || (bytesArr[0] === 0xfe && bytesArr[1] === 0xff)) { let out = ''; for (let i = bytesArr[0] === 0xfe ? 2 : 0; i + 1 < bytesArr.length; i += 2) out += String.fromCharCode((bytesArr[i] << 8) | bytesArr[i + 1]); return out; }
    return Buffer.from(bytesArr).toString('latin1');
  };
  const pages = [];
  for (const s of streams) {
    if (!/\bBT\b/.test(s) || !/T[Jj]|'/.test(s)) continue;
    let text = '';
    let i = 0;
    const pending = [];
    while (i < s.length) {
      const ch = s[i];
      if (ch === '(') { const [b, next] = pdfStringBytes(s, i); pending.push(decode(b, false)); i = next; continue; }
      if (ch === '<' && s[i + 1] !== '<') { const end = s.indexOf('>', i); const hex = s.slice(i + 1, end).replace(/\s+/g, ''); pending.push(decode([...Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex')], true)); i = end + 1; continue; }
      if (ch === '[') { pending.push('\u0000['); i += 1; continue; }
      if (ch === ']') { pending.push('\u0000]'); i += 1; continue; }
      const op = /^(-?\d*\.?\d+|[A-Za-z'"*]+)/.exec(s.slice(i, i + 12));
      if (op) {
        const word = op[1];
        if (/^-?\d*\.?\d+$/.test(word)) { pending.push(Number(word)); i += word.length; continue; }
        if (word === 'Tj' || word === "'" || word === '"') { if (word !== 'Tj') text += '\n'; text += pending.filter((x) => typeof x === 'string' && !x.startsWith('\u0000')).join(''); pending.length = 0; }
        else if (word === 'TJ') { for (const x of pending) { if (typeof x === 'number' && x < -200) text += ' '; else if (typeof x === 'string' && !x.startsWith('\u0000')) text += x; } pending.length = 0; }
        else if (word === 'Td' || word === 'TD') { const ty = pending.filter((x) => typeof x === 'number').at(-1) ?? 0; if (ty !== 0) { if (text && !text.endsWith('\n')) text += '\n'; } else if (text && !/\s$/.test(text)) text += ' '; pending.length = 0; }
        else if (word === 'T*' || word === 'ET' || word === 'Tm') { if (text && !text.endsWith('\n')) text += '\n'; pending.length = 0; }
        else pending.length = 0;
        i += word.length; continue;
      }
      i += 1;
    }
    const clean = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (clean) pages.push(clean);
  }
  const count = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length || pages.length;
  return { text: pages.join('\n\n'), pages: count };
}

/** Width of a character in em (the Korean CID font: full width for CJK, half for the rest). */
const charEm = (ch) => (/[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/.test(ch) ? 1 : 0.5);

/** Markdown / text → PDF (A4, Korean-capable, headings bigger, long lines wrapped, pages numbered). */
export function writePdf(markdown, { title = '' } = {}) {
  const W = 595.28;
  const H = 841.89;
  const M = 56;
  const blocks = [];
  let code = false;
  for (const raw of String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^```/.test(raw)) { code = !code; continue; }
    const h = !code && /^(#{1,6})\s+(.*)$/.exec(raw);
    if (h) { blocks.push({ text: h[2].replace(/\*\*/g, ''), size: [0, 18, 15, 13, 12, 11, 11][h[1].length], gapBefore: 10 }); continue; }
    if (!code && /^\s*\|?\s*:?-{3,}/.test(raw) && raw.includes('-')) continue;
    let line = code ? raw : raw.replace(/^(\s*)[-*+]\s+/, '$1• ').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    if (!code && /^\s*\|.*\|\s*$/.test(line)) line = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join('   ');
    blocks.push({ text: line, size: code ? 9.5 : 10.5, gapBefore: 0 });
  }
  // wrap and paginate
  const pages = [[]];
  let y = H - M;
  const maxW = W - 2 * M;
  for (const b of blocks) {
    const lead = b.size * 1.55;
    const pieces = [];
    let cur = '';
    let width = 0;
    for (const ch of [...b.text]) {
      const w = charEm(ch) * b.size;
      if (width + w > maxW && cur) { pieces.push(cur); cur = ''; width = 0; if (ch === ' ') continue; }
      cur += ch;
      width += w;
    }
    pieces.push(cur);
    y -= b.gapBefore;
    for (const piece of pieces) {
      if (y - lead < M) { pages.push([]); y = H - M; }
      y -= lead;
      pages.at(-1).push({ text: piece, size: b.size, y });
    }
  }
  const hex = (s) => [...s].map((ch) => { const c = ch.codePointAt(0); return c > 0xffff ? '003F' : c.toString(16).padStart(4, '0').toUpperCase(); }).join('');
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const descriptor = add('<< /Type /FontDescriptor /FontName /HYGoThic-Medium /Flags 6 /FontBBox [-6 -145 1003 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 93 >>');
  const cidFont = add(`<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYGoThic-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 2 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /W [1 95 500] >>`);
  const font = add(`<< /Type /Font /Subtype /Type0 /BaseFont /HYGoThic-Medium-UniKS-UCS2-H /Encoding /UniKS-UCS2-H /DescendantFonts [${cidFont} 0 R] >>`);
  const kids = [];
  pages.forEach((lines, pi) => {
    const ops = lines.map((l) => `BT /F1 ${l.size} Tf ${M} ${l.y.toFixed(2)} Td <${hex(l.text)}> Tj ET`);
    const foot = `${pi + 1} / ${pages.length}`;
    ops.push(`BT /F1 8 Tf ${(W - M - foot.length * 4).toFixed(2)} ${(M / 2).toFixed(2)} Td <${hex(foot)}> Tj ET`);
    const content = Buffer.from(ops.join('\n'), 'latin1');
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content.toString('latin1')}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title <FEFF${hex(title)}> /Producer (MyAgents) >>`);
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ───────────────────────── images

/** { mime, width, height } of PNG, JPEG, GIF, WebP, BMP or SVG bytes (null otherwise). */
export function imageInfo(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { mime: 'image/jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return { mime: 'image/jpeg', width: 0, height: 0 };
  }
  if (b.length >= 10 && b.subarray(0, 4).toString('latin1') === 'GIF8') return { mime: 'image/gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.length >= 30 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    const kind = b.subarray(12, 16).toString('latin1');
    if (kind === 'VP8X') return { mime: 'image/webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return { mime: 'image/webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
    return { mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) return { mime: 'image/bmp', width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) };
  const head = b.subarray(0, 1000).toString('utf8');
  if (/<svg[\s>]/i.test(head)) {
    const w = /<svg[^>]*\swidth="([\d.]+)/i.exec(head)?.[1];
    const h = /<svg[^>]*\sheight="([\d.]+)/i.exec(head)?.[1];
    const vb = /viewBox="[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/i.exec(head);
    return { mime: 'image/svg+xml', width: Math.round(Number(w ?? vb?.[1] ?? 0)), height: Math.round(Number(h ?? vb?.[2] ?? 0)) };
  }
  return null;
}

/** A picture from what a node holds: a data URL, { dataUrl }, { data, mime }, base64 text or bytes → { bytes, mime }. */
export function imageBytes(v) {
  if (!v) return null;
  if (Buffer.isBuffer(v)) { const info = imageInfo(v); return info ? { bytes: v, mime: info.mime } : null; }
  if (typeof v === 'object' && !Array.isArray(v)) {
    if (typeof v.dataUrl === 'string') return imageBytes(v.dataUrl);
    if (typeof v.data === 'string') return { bytes: Buffer.from(v.data, 'base64'), mime: v.mime || imageInfo(Buffer.from(v.data, 'base64'))?.mime || 'image/png' };
    return null;
  }
  const s = String(v).trim();
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(s);
  if (m) { const bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8'); return { bytes, mime: m[1] }; }
  if (/^[A-Za-z0-9+/=\s]{40,}$/.test(s)) { const bytes = Buffer.from(s, 'base64'); const info = imageInfo(bytes); if (info) return { bytes, mime: info.mime }; }
  if (/^\s*<svg[\s>]/i.test(s)) return { bytes: Buffer.from(s, 'utf8'), mime: 'image/svg+xml' };
  return null;
}

/** Text as a picture: an SVG card (title line bigger), wrapped to about 60 characters. */
export function textImage(text, { title = '' } = {}) {
  const lines = [];
  for (const raw of String(text ?? '').split('\n')) { let cur = ''; let w = 0; for (const ch of [...raw]) { const cw = charEm(ch); if (w + cw > 60 && cur) { lines.push(cur); cur = ''; w = 0; } cur += ch; w += cw; } lines.push(cur); }
  const shown = lines.slice(0, 60);
  const height = 60 + (title ? 40 : 0) + shown.length * 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${height}" viewBox="0 0 760 ${height}"><rect width="760" height="${height}" rx="18" fill="#ffffff" stroke="#d0d7de"/>${title ? `<text x="32" y="54" font-family="Segoe UI, Malgun Gothic, sans-serif" font-size="24" font-weight="700" fill="#1b1f24">${esc(title)}</text>` : ''}${shown.map((l, i) => `<text x="32" y="${(title ? 96 : 50) + i * 24}" font-family="Segoe UI, Malgun Gothic, sans-serif" font-size="16" fill="#3b4048">${esc(l)}</text>`).join('')}</svg>`;
}

// ───────────────────────── parse / render

/** Bytes (or text) of a given format → a plain value. */
export function parse(input, format = 'auto', { name = '', mime = '', delimiter = ',', maxChars = 200000 } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : input instanceof Uint8Array ? Buffer.from(input) : Buffer.from(String(input ?? ''), 'utf8');
  let f = format && format !== 'auto' ? format : formatOf(name, mime);
  if (f === 'auto') f = sniff(bytes);
  const base = { format: f, name, bytes: bytes.length };
  const cut = (s) => (s.length > maxChars ? s.slice(0, maxChars) : s);
  const utf8 = () => bytes.toString('utf8').replace(/^﻿/, '');
  switch (f) {
    case 'markdown': { const text = utf8(); return { ...base, text: cut(text), markdown: cut(text), headings: headingsOf(text), html: markdownToHtml(text) }; }
    case 'html': { const html = utf8(); return { ...base, title: htmlText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''), text: cut(htmlText(html)), markdown: cut(htmlToMarkdown(html)), html: cut(html) }; }
    case 'csv': { const text = utf8(); const items = parseCsv(text, delimiter || (name.toLowerCase().endsWith('.tsv') ? '\t' : ',')); return { ...base, items, count: items.length, columns: Object.keys(items[0] ?? {}), text: cut(text) }; }
    case 'json': { const text = utf8(); let data; try { data = JSON.parse(text); } catch (err) { throw new AppError('BAD_JSON', `Not JSON: ${err.message}`, 400); } return { ...base, data, ...(Array.isArray(data) ? { items: data, count: data.length } : {}), text: cut(text) }; }
    case 'pdf': { const r = readPdf(bytes); return { ...base, ...r, text: cut(r.text) }; }
    case 'docx': { const r = readDocx(bytes); return { ...base, ...r, text: cut(r.text), markdown: cut(r.markdown) }; }
    case 'xlsx': return { ...base, ...readXlsx(bytes) };
    case 'image': {
      const info = imageInfo(bytes);
      if (!info) throw new AppError('BAD_IMAGE', 'Not a picture this app knows (PNG, JPEG, GIF, WebP, BMP, SVG)', 400);
      return { ...base, ...info, dataUrl: `data:${info.mime};base64,${bytes.toString('base64')}`, text: `[image ${info.mime} ${info.width}×${info.height}]` };
    }
    default: return { ...base, format: 'text', text: cut(utf8()) };
  }
}

/** A value → bytes of a format. */
export function render(value, format = 'text', { title = '', delimiter = ',' } = {}) {
  const v = value;
  const rows = rowsOf(v);
  const md = () => (v && typeof v === 'object' && !Array.isArray(v) && typeof v.markdown === 'string' ? v.markdown
    : rows && !(v && typeof v.text === 'string') ? markdownTable(rows)
      : v && typeof v === 'object' && typeof v.html === 'string' && typeof v.text !== 'string' ? htmlToMarkdown(v.html)
        : textOf(v));
  switch (format) {
    case 'markdown': return { bytes: Buffer.from(md(), 'utf8'), mime: MIME.markdown, ext: 'md' };
    case 'html': {
      const html = v && typeof v === 'object' && typeof v.html === 'string' && /<html/i.test(v.html) ? v.html : htmlDocument(v && typeof v === 'object' && typeof v.html === 'string' ? v.html : markdownToHtml(md()), title);
      return { bytes: Buffer.from(html, 'utf8'), mime: MIME.html, ext: 'html' };
    }
    case 'csv': return { bytes: Buffer.from(rows ? toCsv(rows, delimiter) : textOf(v), 'utf8'), mime: MIME.csv, ext: 'csv' };
    case 'json': return { bytes: Buffer.from(JSON.stringify(rows ?? (v && typeof v === 'object' && !Array.isArray(v) && 'data' in v ? v.data : v), null, 2), 'utf8'), mime: MIME.json, ext: 'json' };
    case 'pdf': return { bytes: writePdf(md(), { title }), mime: MIME.pdf, ext: 'pdf' };
    case 'docx': return { bytes: writeDocx(md(), { title }), mime: MIME.docx, ext: 'docx' };
    case 'xlsx': {
      const list = rows ?? (v && typeof v === 'object' ? [v] : textOf(v).split('\n').map((line) => ({ text: line })));
      return { bytes: writeXlsx(list), mime: MIME.xlsx, ext: 'xlsx' };
    }
    case 'image': {
      const pic = imageBytes(v);
      if (pic) return { bytes: pic.bytes, mime: pic.mime, ext: IMAGE_EXT[pic.mime] ?? 'png' };
      return { bytes: Buffer.from(textImage(md(), { title }), 'utf8'), mime: 'image/svg+xml', ext: 'svg' };
    }
    default: return { bytes: Buffer.from(textOf(v), 'utf8'), mime: MIME.text, ext: 'txt' };
  }
}

/** One text format to another in memory (no files): markdown ↔ html ↔ text, csv ↔ json. */
export function convert(value, from = 'auto', to = 'markdown', opts = {}) {
  const source = typeof value === 'string' || Buffer.isBuffer(value)
    ? parse(value, from, opts)
    : value && typeof value === 'object' && !Array.isArray(value) && value.format ? value
      : Array.isArray(value) ? { format: 'json', data: value, items: value } : { format: 'json', data: value, text: JSON.stringify(value, null, 2) };
  const out = render(source, to, opts);
  return parse(out.bytes, to, { name: `x.${out.ext}` });
}

export const extOf = (format) => EXT[format] ?? 'txt';
export const mimeOf = (format) => MIME[format] ?? 'application/octet-stream';

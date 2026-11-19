// Documents for printing and exporting — a statistics window (Expert Information, Conversations, …),
// a chart's picture and data — written as Markdown, HTML, Word (.docx), PDF, or
// plain lines for the print window. Self-contained (no Node, no libraries): the Word file is a
// stored ZIP, the PDF uses the reader's built-in Korean CID font, so Hangul needs no embedded font.
//
// doc = { title, subtitle?, note?, blocks?: [block…] } with blocks
//   { type: 'h', level: 2|3, text } · { type: 'p', text } · { type: 'pre', lines: [line…] }
//   { type: 'table', columns: [{ label, num? }], rows: [{ depth?, cells: [text…] }] }
//   { type: 'image', dataUrl, caption?, href?, mime? }   (href: Markdown links the picture by that name)
// Shorthands: doc.columns + doc.rows is one table, doc.pre one block of lines, doc.images pictures first.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// eslint-disable-next-line no-control-regex
const xml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const INDENT = '    ';

/** The document's blocks, with the shorthands expanded. */
export function blocksOf(doc) {
  const out = [];
  for (const img of doc.images ?? []) out.push({ type: 'image', ...img });
  if (doc.blocks) out.push(...doc.blocks);
  if (doc.columns?.length) out.push({ type: 'table', columns: doc.columns, rows: doc.rows ?? [] });
  if (doc.pre) out.push({ type: 'pre', lines: doc.pre });
  return out;
}

/** Display width in columns: Hangul and other wide characters count two. */
export function textWidth(text) {
  let n = 0;
  for (const ch of String(text)) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return n;
}
const pad = (text, width, right) => { const gap = ' '.repeat(Math.max(0, width - textWidth(text))); return right ? gap + text : text + gap; };

// ───────────────────────── Markdown

export function toMarkdown(doc) {
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out = [`# ${doc.title}`, ''];
  if (doc.subtitle) out.push(doc.subtitle, '');
  if (doc.note) out.push(doc.note, '');
  for (const b of blocksOf(doc)) {
    if (b.type === 'h') out.push(`${'#'.repeat(Math.min(6, b.level ?? 2))} ${b.text}`, '');
    else if (b.type === 'p') out.push(b.text, '');
    else if (b.type === 'pre') out.push('```text', ...b.lines, '```', '');
    else if (b.type === 'image') out.push(`![${String(b.caption ?? '').replace(/[[\]]/g, '')}](${b.href ?? b.dataUrl})`, '');
    else if (b.type === 'table') {
      out.push(`| ${b.columns.map((c) => cell(c.label)).join(' | ')} |`, `| ${b.columns.map((c) => (c.num ? '---:' : '---')).join(' | ')} |`);
      for (const row of b.rows) out.push(`| ${row.cells.map((v, i) => cell(i === 0 && row.depth ? `${'&nbsp;'.repeat(4 * row.depth)}${v}` : v)).join(' | ')} |`);
      out.push('');
    }
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

// ───────────────────────── HTML

export function toHtml(doc, { lang = 'ko' } = {}) {
  const parts = blocksOf(doc).map((b) => {
    if (b.type === 'h') return `<h${Math.min(6, b.level ?? 2)}>${esc(b.text)}</h${Math.min(6, b.level ?? 2)}>`;
    if (b.type === 'p') return `<p>${esc(b.text)}</p>`;
    if (b.type === 'pre') return `<pre>${esc(b.lines.join('\n'))}</pre>`;
    if (b.type === 'image') return `<figure><img src="${esc(b.href ?? b.dataUrl)}" alt="${esc(b.caption ?? '')}">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`;
    const head = b.columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
    const body = b.rows.map((row) => `<tr>${row.cells.map((v, i) => `<td${b.columns[i]?.num ? ' class="num"' : ''}${i === 0 && row.depth ? ` style="padding-left:${8 + row.depth * 18}px"` : ''}>${esc(v)}</td>`).join('')}</tr>`).join('\n');
    return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
  });
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>
body { font: 14px/1.5 "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; margin: 32px auto; max-width: 1200px; padding: 0 20px; color: #1d2430; }
h1 { font-size: 22px; margin: 0 0 4px; border-bottom: 3px solid #2b6cf6; padding-bottom: 6px; }
h2 { font-size: 18px; margin-top: 26px; color: #2b4fbf; }
.sub, .note { color: #5b6575; margin: 0 0 12px; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; font-size: 13px; }
th, td { border-bottom: 1px solid #dde2ea; padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #eef2f7; }
tbody tr:nth-child(even) { background: #f7f9fc; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
pre { font: 12px/1.45 Consolas, "D2Coding", monospace; white-space: pre; overflow-x: auto; }
figure { margin: 0 0 16px; } figure img { max-width: 100%; border: 1px solid #dde2ea; } figcaption { color: #5b6575; font-size: 12px; }
@media print { body { margin: 0; max-width: none; } }
</style>
</head>
<body>
<h1>${esc(doc.title)}</h1>
${doc.subtitle ? `<p class="sub">${esc(doc.subtitle)}</p>\n` : ''}${doc.note ? `<p class="note">${esc(doc.note)}</p>\n` : ''}${parts.join('\n')}
</body>
</html>
`;
}

// ───────────────────────── plain lines (print window, PDF)

/** Monospaced lines: headings underlined, tables padded so the columns line up (wide characters count two). */
export function toLines(doc, { maxCell = 60 } = {}) {
  const clip = (v) => { const s = String(v ?? '').replace(/\s+/g, ' '); return s.length > maxCell ? `${s.slice(0, maxCell - 1)}…` : s; };
  const lines = [doc.title, '='.repeat(Math.min(100, textWidth(doc.title)))];
  if (doc.subtitle) lines.push(doc.subtitle);
  if (doc.note) lines.push(doc.note);
  lines.push('');
  for (const b of blocksOf(doc)) {
    if (b.type === 'h') lines.push(b.text, '-'.repeat(Math.min(100, textWidth(b.text))));
    else if (b.type === 'p') lines.push(b.text, '');
    else if (b.type === 'pre') lines.push(...b.lines, '');
    else if (b.type === 'image') lines.push(`[${b.caption ?? 'image'}]`, '');
    else if (b.type === 'table') {
      const table = b.rows.map((row) => row.cells.map((v, i) => clip(i === 0 ? `${INDENT.repeat(row.depth ?? 0)}${v}` : v)));
      const heads = b.columns.map((c) => clip(c.label));
      const widths = heads.map((h, i) => Math.max(textWidth(h), ...table.map((r) => textWidth(r[i] ?? ''))));
      const fmt = (cells) => cells.map((v, i) => pad(v ?? '', widths[i], b.columns[i]?.num)).join('  ').replace(/\s+$/, '');
      lines.push(fmt(heads), widths.map((w) => '-'.repeat(w)).join('  '), ...table.map(fmt), '');
    }
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// ───────────────────────── ZIP (stored) and Word

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** [{ name, data: string | Uint8Array }] → a ZIP file with every entry stored (Word reads it as is). */
export function zipStored(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const entry of entries) {
    const data = typeof entry.data === 'string' ? enc.encode(entry.data) : entry.data;
    const name = enc.encode(entry.name);
    const crc = crc32(data);
    const local = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(local, name, data);
    central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(dirSize), ...u32(offset), ...u16(0)]);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) { out.set(c, at); at += c.length; }
  return out;
}

const run = (text, { bold = false, size = 0, color = '', mono = false } = {}) => `<w:r><w:rPr><w:rFonts w:ascii="${mono ? 'Consolas' : 'Segoe UI'}" w:hAnsi="${mono ? 'Consolas' : 'Segoe UI'}" w:eastAsia="맑은 고딕"/>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const dataBytes = (dataUrl) => { const b64 = String(dataUrl).split(',')[1] ?? ''; const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const imageSize = (bytes) => {
  // PNG: IHDR width/height; JPEG and others: a 4:3 guess (Word scales the picture to the box anyway).
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [(bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0, (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0];
  return [800, 600];
};

/** A Word document: headings, paragraphs, real tables (header row repeated on every page, rows banded), code lines and pictures (PNG). */
export function toDocx(doc) {
  const blocks = blocksOf(doc);
  const landscape = blocks.some((b) => b.type === 'table' && b.columns.length > 5);
  const pageW = landscape ? 16838 : 11906;
  const pageH = landscape ? 11906 : 16838;
  const margin = 1000;
  const usable = pageW - margin * 2;
  const media = [];
  const parts = [`<w:p><w:pPr><w:spacing w:after="80"/></w:pPr>${run(doc.title, { bold: true, size: 32 })}</w:p>`];
  if (doc.subtitle) parts.push(`<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>${run(doc.subtitle, { color: '5B6575', size: 19 })}</w:p>`);
  if (doc.note) parts.push(`<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${run(doc.note, { color: '5B6575', size: 19 })}</w:p>`);
  for (const b of blocks) {
    if (b.type === 'h') parts.push(`<w:p><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/></w:pPr>${run(b.text, { bold: true, size: b.level >= 3 ? 24 : 28, color: '2B4FBF' })}</w:p>`);
    else if (b.type === 'p') parts.push(`<w:p>${run(b.text, { size: 20 })}</w:p>`);
    else if (b.type === 'pre') parts.push(...b.lines.map((line) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${run(line, { mono: true, size: 17 })}</w:p>`));
    else if (b.type === 'image' && /^data:image\/png;base64,/.test(b.dataUrl ?? '')) {
      const bytes = dataBytes(b.dataUrl);
      const n = media.length + 1;
      media.push({ name: `word/media/image${n}.png`, data: bytes });
      const [w, h] = imageSize(bytes);
      const cx = Math.round((usable / 1440) * 914400);
      const cy = Math.round((cx * h) / Math.max(1, w));
      parts.push(`<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      if (b.caption) parts.push(`<w:p>${run(b.caption, { color: '5B6575', size: 18 })}</w:p>`);
    } else if (b.type === 'table') {
      const weights = b.columns.map((c, i) => Math.max(1, Math.min(4, Math.max(textWidth(c.label), ...b.rows.slice(0, 200).map((r) => textWidth(r.cells[i] ?? ''))) / 10)));
      const total = weights.reduce((x, y) => x + y, 0);
      const widths = weights.map((w) => Math.floor((usable * w) / total));
      const cell = (text, i, { header = false, shade = '', indent = 0 } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${b.columns[i]?.num ? '<w:jc w:val="right"/>' : ''}${indent ? `<w:ind w:left="${indent}"/>` : ''}</w:pPr>${run(text, { bold: header, size: 18 })}</w:p></w:tc>`;
      const border = '<w:top w:val="single" w:sz="4" w:color="C9D1DC"/><w:bottom w:val="single" w:sz="4" w:color="C9D1DC"/><w:insideH w:val="single" w:sz="4" w:color="E1E6EE"/>';
      const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.columns.map((c, i) => cell(c.label, i, { header: true, shade: 'EEF2F7' })).join('')}</w:tr>`;
      const rows = b.rows.map((row, r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${b.columns.map((_, i) => cell(row.cells[i] ?? '', i, { shade: r % 2 ? 'F7F9FC' : '', indent: i === 0 ? (row.depth ?? 0) * 240 : 0 })).join('')}</w:tr>`).join('');
      parts.push(`<w:tbl><w:tblPr><w:tblW w:w="${usable}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${rows}</w:tbl>`, '<w:p/>');
    }
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${parts.join('')}<w:sectPr><w:pgSz w:w="${pageW}" w:h="${pageH}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${media.map((m, i) => `<Relationship Id="rImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.png"/>`).join('')}</Relationships>`;
  return zipStored([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(doc.title)}</dc:title><dc:creator>MyChartMaster</dc:creator></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: rels },
    { name: 'word/document.xml', data: document },
    ...media,
  ]);
}

// ───────────────────────── PDF

/**
 * A PDF of the same lines the print window shows, on A4 (landscape when the lines are wide).
 * The font is the reader's own Korean CID font: ASCII is half width and Hangul full width, so
 * the padded columns line up exactly as they do on screen.
 */
export function toPdf(doc) {
  const lines = toLines(doc);
  const widest = Math.max(1, ...lines.map(textWidth));
  const landscape = widest > 110;
  const W = landscape ? 841.89 : 595.28;
  const H = landscape ? 595.28 : 841.89;
  const M = 36;
  const size = Math.max(5.5, Math.min(10, ((W - 2 * M) / widest) * 2));
  const lead = size * 1.45;
  const perPage = Math.max(1, Math.floor((H - 2 * M - 12) / lead));
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (!pages.length) pages.push([]);
  const hex = (s) => [...String(s)].map((ch) => { const c = ch.codePointAt(0); return c > 0xffff ? '003F' : c.toString(16).padStart(4, '0').toUpperCase(); }).join('');
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const descriptor = add('<< /Type /FontDescriptor /FontName /HYGoThic-Medium /Flags 6 /FontBBox [-6 -145 1003 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 93 >>');
  const cidFont = add(`<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYGoThic-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 2 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /W [1 95 500] >>`);
  const font = add(`<< /Type /Font /Subtype /Type0 /BaseFont /HYGoThic-Medium-UniKS-UCS2-H /Encoding /UniKS-UCS2-H /DescendantFonts [${cidFont} 0 R] >>`);
  const kids = [];
  pages.forEach((list, pi) => {
    const ops = list.map((line, k) => `BT /F1 ${(pi === 0 && k === 0 ? size * 1.4 : size).toFixed(2)} Tf ${M} ${(H - M - (k + 1) * lead).toFixed(2)} Td <${hex(line)}> Tj ET`);
    const foot = `${pi + 1} / ${pages.length}`;
    ops.push(`BT /F1 8 Tf ${(W - M - foot.length * 4).toFixed(2)} ${(M / 2).toFixed(2)} Td <${hex(foot)}> Tj ET`);
    const content = ops.join('\n');
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title <FEFF${hex(doc.title)}> /Producer (MyChartMaster) >>`);
  // Text goes in as hex, so every character below is one byte: string offsets are byte offsets.
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (ch) => ch.charCodeAt(0) & 0xff);
}

/** The formats documents export to: id → [extension, save type, mime]. */
export const DOC_FORMATS = {
  html: ['html', 'html', 'text/html'],
  markdown: ['md', 'md', 'text/markdown'],
  pdf: ['pdf', 'pdf', 'application/pdf'],
  docx: ['docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

/** The file's content for a format: a string (HTML, Markdown) or bytes (PDF, Word). */
export function exportDocument(doc, format, opts = {}) {
  if (format === 'html') return toHtml(doc, opts);
  if (format === 'markdown') return toMarkdown(doc);
  if (format === 'pdf') return toPdf(doc);
  if (format === 'docx') return toDocx(doc);
  throw new Error(`Unknown export format: ${format}`);
}

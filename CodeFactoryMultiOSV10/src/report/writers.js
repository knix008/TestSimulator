// Renders the report document (report/builder.js) into each export format.
//
// HTML doubles as the PDF source: Electron prints it with printToPDF, and the
// browser opens it in a print window where "Save as PDF" produces the same
// file — one layout, four outputs.

import { createZip } from '../lib/zip.js';
import { themeTokens } from '../themes.js';

// ------------------------------------------------------------------- HTML --

export function escapeHtml(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Standalone HTML: all styling inlined, colors baked from the chosen theme, so
 * the file renders identically wherever it is opened.
 */
export function toHtml(doc, options = {}) {
  const tokens = themeTokens(options.theme || 'daylight');
  const tocItems = doc.blocks.filter((b) => b.kind === 'heading' && b.level === 1 && b.id);

  const body = doc.blocks.map((block) => renderHtmlBlock(block)).join('\n');

  const css = `
:root{${Object.entries(tokens).map(([k, v]) => k + ':' + v).join(';')}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:14px;line-height:1.65}
.page{max-width:1100px;margin:0 auto;padding:40px 24px 80px}
header.report{border-bottom:2px solid var(--accent);padding-bottom:18px;margin-bottom:28px}
header.report h1{margin:0 0 6px;font-size:28px;letter-spacing:-0.01em}
header.report .sub{color:var(--text-dim);font-size:13px;word-break:break-all}
header.report .meta{color:var(--text-faint);font-size:12px;margin-top:8px}
nav.toc{background:var(--bg-panel);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:32px}
nav.toc h2{margin:0 0 10px;font-size:14px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em}
nav.toc ol{margin:0;padding-left:20px;columns:2;column-gap:32px}
nav.toc a{color:var(--accent);text-decoration:none}
nav.toc a:hover{text-decoration:underline}
h1{font-size:23px;margin:40px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border)}
h2{font-size:18px;margin:28px 0 10px}
h3{font-size:15px;margin:20px 0 8px;color:var(--text-dim)}
p{margin:0 0 12px}
ul,ol{margin:0 0 14px;padding-left:22px}
li{margin:3px 0}
table{border-collapse:collapse;width:100%;margin:0 0 18px;font-size:12.5px}
th,td{border:1px solid var(--border);padding:6px 9px;text-align:left;vertical-align:top}
th{background:var(--bg-panel);font-weight:600;white-space:nowrap}
tbody tr:nth-child(even){background:color-mix(in srgb,var(--bg-panel) 45%,transparent)}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 20px;margin:0 0 20px;font-size:13px}
.kv dt{color:var(--text-dim)}
.kv dd{margin:0;font-weight:600}
.callout{border-left:4px solid var(--info);background:var(--info-bg);padding:11px 15px;border-radius:0 8px 8px 0;margin:0 0 16px;font-size:13px}
.callout.critical{border-color:var(--critical);background:var(--critical-bg)}
.callout.warning{border-color:var(--warning);background:var(--warning-bg)}
.callout.ok{border-color:var(--ok);background:var(--ok-bg)}
.chart{margin:0 0 22px}
.chart h4{margin:0 0 8px;font-size:13px;color:var(--text-dim);font-weight:600}
.bar-row{display:grid;grid-template-columns:180px 1fr 70px;align-items:center;gap:10px;margin:3px 0;font-size:12px}
.bar-row .label{color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-row .track{background:var(--bg-panel);border-radius:4px;height:14px;overflow:hidden}
.bar-row .fill{background:var(--accent);height:100%;border-radius:4px}
.bar-row .value{text-align:right;font-variant-numeric:tabular-nums;color:var(--text)}
code,pre{font-family:"Cascadia Mono",Consolas,"SF Mono",Menlo,monospace;font-size:12px}
td code{background:var(--bg-panel);padding:1px 4px;border-radius:3px;word-break:break-all}
footer.report{margin-top:56px;padding-top:16px;border-top:1px solid var(--border);color:var(--text-faint);font-size:11.5px}
@media print{
  body{background:#fff;color:#000}
  .page{max-width:none;padding:0}
  nav.toc{break-after:page}
  h1{break-before:page;break-after:avoid}
  h1:first-of-type{break-before:auto}
  h2,h3{break-after:avoid}
  table,.callout,.chart{break-inside:avoid}
  thead{display:table-header-group}
}
`.trim();

  const author = doc.appInfo && doc.appInfo.author ? doc.appInfo.author : null;
  const authorLine = author ? escapeHtml(author.name + (author.email ? ' (' + author.email + ')' : '')) : '';

  return `<!doctype html>
<html lang="${doc.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(doc.title)}</title>
<style>${css}</style>
</head>
<body>
<div class="page">
<header class="report">
  <h1>${escapeHtml(doc.title)}</h1>
  ${doc.subtitle ? '<div class="sub">' + escapeHtml(doc.subtitle) + '</div>' : ''}
  <div class="meta">${escapeHtml(new Date(doc.generatedAt).toLocaleString())} · CodeFactory${authorLine ? ' · ' + authorLine : ''}</div>
</header>
${tocItems.length > 1 ? '<nav class="toc"><h2>' + (doc.lang === 'en' ? 'Contents' : '목차') + '</h2><ol>' + tocItems.map((h) => '<li><a href="#' + escapeHtml(h.id) + '">' + escapeHtml(h.text) + '</a></li>').join('') + '</ol></nav>' : ''}
${body}
<footer class="report">CodeFactory — ${escapeHtml(doc.lang === 'en' ? 'Multi-language source code analyzer' : '다언어 소스 코드 분석기')}${authorLine ? ' · ' + authorLine : ''}</footer>
</div>
</body>
</html>`;
}

function renderHtmlBlock(block) {
  switch (block.kind) {
    case 'heading': {
      const tag = 'h' + Math.min(4, block.level);
      const id = block.id ? ' id="' + escapeHtml(block.id) + '"' : '';
      return '<' + tag + id + '>' + escapeHtml(block.text) + '</' + tag + '>';
    }
    case 'paragraph':
      return '<p>' + escapeHtml(block.text) + '</p>';
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      return '<' + tag + '>' + block.items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</' + tag + '>';
    }
    case 'keyValue':
      return '<dl class="kv">' + block.pairs.map(([k, v]) => '<dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(v) + '</dd>').join('') + '</dl>';
    case 'callout':
      return '<div class="callout ' + escapeHtml(block.tone || 'info') + '">' + escapeHtml(block.text) + '</div>';
    case 'table': {
      const head = '<thead><tr>' + block.columns.map((c) => '<th>' + escapeHtml(c) + '</th>').join('') + '</tr></thead>';
      const rows = block.rows
        .map(
          (row) =>
            '<tr>' +
            row.map((cell) => '<td' + (isNumeric(cell) ? ' class="num"' : '') + '>' + escapeHtml(cell) + '</td>').join('') +
            '</tr>',
        )
        .join('');
      const caption = block.caption ? '<caption>' + escapeHtml(block.caption) + '</caption>' : '';
      return '<table>' + caption + head + '<tbody>' + rows + '</tbody></table>';
    }
    case 'chart': {
      const max = block.max || Math.max(1, ...block.data.map((d) => d.value));
      const rows = block.data
        .slice(0, 14)
        .map(
          (d) =>
            '<div class="bar-row"><span class="label" title="' + escapeHtml(d.label) + '">' + escapeHtml(d.label) + '</span>' +
            '<span class="track"><span class="fill" style="width:' + Math.round((d.value / max) * 100) + '%"></span></span>' +
            '<span class="value">' + escapeHtml(Number(d.value).toLocaleString('en-US')) + '</span></div>',
        )
        .join('');
      return '<div class="chart"><h4>' + escapeHtml(block.title) + '</h4>' + rows + '</div>';
    }
    default:
      return '';
  }
}

function isNumeric(cell) {
  return /^-?[\d,.]+%?$/.test(String(cell).trim()) && String(cell).trim() !== '';
}

// --------------------------------------------------------------- Markdown --

export function toMarkdown(doc) {
  const lines = [];

  lines.push('# ' + doc.title, '');
  if (doc.subtitle) lines.push('> ' + doc.subtitle, '');
  lines.push('_' + new Date(doc.generatedAt).toLocaleString() + ' · CodeFactory_', '');

  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'heading':
        // The document title is already the H1 above.
        lines.push('#'.repeat(Math.min(6, block.level + 1)) + ' ' + block.text, '');
        break;
      case 'paragraph':
        lines.push(escapeMarkdown(block.text), '');
        break;
      case 'list':
        for (let i = 0; i < block.items.length; i++) {
          lines.push((block.ordered ? i + 1 + '.' : '-') + ' ' + escapeMarkdown(block.items[i]));
        }
        lines.push('');
        break;
      case 'keyValue':
        lines.push('| | |', '|---|---|');
        for (const [k, v] of block.pairs) lines.push('| ' + escapeCell(k) + ' | **' + escapeCell(v) + '** |');
        lines.push('');
        break;
      case 'callout':
        lines.push('> **' + calloutLabel(block.tone) + '** ' + escapeMarkdown(block.text), '');
        break;
      case 'table':
        lines.push('| ' + block.columns.map(escapeCell).join(' | ') + ' |');
        lines.push('|' + block.columns.map(() => '---').join('|') + '|');
        for (const row of block.rows) lines.push('| ' + row.map(escapeCell).join(' | ') + ' |');
        lines.push('');
        break;
      case 'chart': {
        const max = block.max || Math.max(1, ...block.data.map((d) => d.value));
        lines.push('**' + block.title + '**', '');
        lines.push('| | | |', '|---|---|---|');
        for (const d of block.data.slice(0, 14)) {
          const filled = Math.round((d.value / max) * 20);
          lines.push('| ' + escapeCell(d.label) + ' | `' + '█'.repeat(filled) + '░'.repeat(20 - filled) + '` | ' + Number(d.value).toLocaleString('en-US') + ' |');
        }
        lines.push('');
        break;
      }
      default:
        break;
    }
  }

  return lines.join('\n');
}

function calloutLabel(tone) {
  return { critical: '⚠ 심각', warning: '⚠ 경고', ok: '✔', info: 'ℹ' }[tone] || 'ℹ';
}

function escapeMarkdown(text) {
  return String(text === null || text === undefined ? '' : text);
}

function escapeCell(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// -------------------------------------------------------------- Word docx --

function xmlEscape(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Control characters are illegal in XML 1.0 and make Word refuse the file.
    .replace(/[ --]/g, '');
}

function run(text, opts = {}) {
  const props = [];
  if (opts.bold) props.push('<w:b/>');
  if (opts.italic) props.push('<w:i/>');
  if (opts.color) props.push('<w:color w:val="' + opts.color + '"/>');
  if (opts.size) props.push('<w:sz w:val="' + opts.size + '"/>');
  if (opts.mono) props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
  const rPr = props.length ? '<w:rPr>' + props.join('') + '</w:rPr>' : '';
  return '<w:r>' + rPr + '<w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r>';
}

function paragraph(content, style, extraProps) {
  const pPr =
    '<w:pPr>' + (style ? '<w:pStyle w:val="' + style + '"/>' : '') + (extraProps || '') + '</w:pPr>';
  return '<w:p>' + pPr + content + '</w:p>';
}

/**
 * Generates a .docx. Returns the raw archive bytes.
 * @returns {Uint8Array}
 */
export function toDocx(doc) {
  const parts = [];

  parts.push(paragraph(run(doc.title, { bold: true, size: '44' }), 'Title'));
  if (doc.subtitle) parts.push(paragraph(run(doc.subtitle, { color: '666666', size: '20' })));
  const author = doc.appInfo && doc.appInfo.author ? doc.appInfo.author : null;
  parts.push(
    paragraph(
      run(
        new Date(doc.generatedAt).toLocaleString() +
          ' · CodeFactory' +
          (author ? ' · ' + author.name + (author.email ? ' (' + author.email + ')' : '') : ''),
        { color: '888888', size: '18' },
      ),
    ),
  );

  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'heading':
        parts.push(paragraph(run(block.text, { bold: true, size: block.level === 1 ? '32' : block.level === 2 ? '26' : '22' }), 'Heading' + Math.min(4, block.level)));
        break;
      case 'paragraph':
        parts.push(paragraph(run(block.text)));
        break;
      case 'list':
        for (const item of block.items) {
          parts.push(paragraph(run('• ' + item), null, '<w:ind w:left="360"/>'));
        }
        break;
      case 'keyValue':
        parts.push(docxTable(['', ''], block.pairs.map(([k, v]) => [k, v]), true));
        break;
      case 'callout':
        parts.push(
          paragraph(run(calloutLabel(block.tone) + '  ' + block.text, { italic: true }), null, '<w:ind w:left="240"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="' + calloutColor(block.tone) + '"/></w:pBdr>'),
        );
        break;
      case 'table':
        parts.push(docxTable(block.columns, block.rows, false));
        break;
      case 'chart': {
        const max = block.max || Math.max(1, ...block.data.map((d) => d.value));
        parts.push(paragraph(run(block.title, { bold: true })));
        parts.push(
          docxTable(
            ['', '', ''],
            block.data.slice(0, 14).map((d) => {
              const filled = Math.round((d.value / max) * 20);
              return [d.label, '█'.repeat(filled) + '░'.repeat(20 - filled), Number(d.value).toLocaleString('en-US')];
            }),
            true,
          ),
        );
        break;
      }
      default:
        break;
    }
  }

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    parts.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1000" w:bottom="1134" w:left="1000" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic" w:cs="Malgun Gothic"/>' +
    '<w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>' +
    ['Title', 'Heading1', 'Heading2', 'Heading3', 'Heading4']
      .map(
        (id) =>
          '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + id + '"/>' +
          '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr>' +
          '<w:rPr><w:b/></w:rPr></w:style>',
      )
      .join('') +
    '</w:styles>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  const documentRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  return createZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/_rels/document.xml.rels', data: documentRels },
  ]);
}

function calloutColor(tone) {
  return { critical: 'C62828', warning: 'B26A00', ok: '2E7D32', info: '1565C0' }[tone] || '1565C0';
}

function docxTable(columns, rows, borderless) {
  const border = borderless ? 'nil' : 'single';
  const tblPr =
    '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((side) => '<w:' + side + ' w:val="' + border + '" w:sz="4" w:space="0" w:color="C0C8D2"/>')
      .join('') +
    '</w:tblBorders></w:tblPr>';

  const header =
    columns.some((c) => c)
      ? '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
        columns
          .map((c) => '<w:tc><w:tcPr><w:shd w:val="clear" w:fill="EEF1F5"/></w:tcPr>' + paragraph(run(c, { bold: true })) + '</w:tc>')
          .join('') +
        '</w:tr>'
      : '';

  const body = rows
    .map(
      (row) =>
        '<w:tr>' +
        row.map((cell) => '<w:tc>' + paragraph(run(String(cell === null || cell === undefined ? '' : cell))) + '</w:tc>').join('') +
        '</w:tr>',
    )
    .join('');

  return '<w:tbl>' + tblPr + header + body + '</w:tbl>' + paragraph('');
}

// --------------------------------------------------------------------- CSV --

/** RFC 4180 CSV, with a UTF-8 BOM so Excel opens Korean text correctly. */
export function toCsv(header, rows, withBom = true) {
  const encode = (value) => {
    const text = String(value === null || value === undefined ? '' : value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const lines = [header.map(encode).join(','), ...rows.map((row) => row.map(encode).join(','))];
  return (withBom ? '﻿' : '') + lines.join('\r\n');
}

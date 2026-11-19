// Writing the data table out: CSV, TSV, JSON (records), Markdown, HTML and Excel (.xlsx). Pure, no DOM.
import { cellText, columnLetter } from './table.js';
import { writeZip } from './zip.js';

/** Data export formats: id → [extension, label, mime]. */
export const DATA_FORMATS = {
  csv: ['csv', 'CSV', 'text/csv'],
  tsv: ['tsv', 'TSV', 'text/tab-separated-values'],
  json: ['json', 'JSON', 'application/json'],
  markdown: ['md', 'Markdown', 'text/markdown'],
  html: ['html', 'HTML', 'text/html'],
  xlsx: ['xlsx', 'Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

const quote = (text, delimiter) => (/["\r\n]/.test(text) || text.includes(delimiter) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** CSV (with a BOM so Excel reads Korean as UTF-8), or any delimiter. */
export function toDelimited(table, delimiter = ',', { bom = delimiter === ',' } = {}) {
  const lines = [table.columns.map((c) => quote(c.name, delimiter)), ...table.rows.map((r) => r.map((v) => quote(cellText(v), delimiter)))];
  return `${bom ? '﻿' : ''}${lines.map((l) => l.join(delimiter)).join('\r\n')}\r\n`;
}

export function toJson(table) {
  return `${JSON.stringify(table.rows.map((r) => Object.fromEntries(table.columns.map((c, i) => [c.name, r[i] ?? null]))), null, 2)}\n`;
}

const mdCell = (text) => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export function toMarkdown(table, title = '') {
  const numeric = table.columns.map((c) => c.type === 'number');
  const head = `| ${table.columns.map((c) => mdCell(c.name)).join(' | ')} |`;
  const rule = `| ${numeric.map((n) => (n ? '---:' : '---')).join(' | ')} |`;
  const body = table.rows.map((r) => `| ${table.columns.map((_, i) => mdCell(cellText(r[i]))).join(' | ')} |`);
  return `${title ? `# ${mdCell(title)}\n\n` : ''}${[head, rule, ...body].join('\n')}\n`;
}

const esc = (text) => String(text ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** An HTML table (just the <table>, or a whole page with `page`). */
export function toHtmlTable(table, { title = '', page = false } = {}) {
  const head = `<thead><tr>${table.columns.map((c) => `<th${c.type === 'number' ? ' class="num"' : ''}>${esc(c.name)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${table.rows.map((r) => `<tr>${table.columns.map((c, i) => `<td${c.type === 'number' ? ' class="num"' : ''}>${esc(cellText(r[i]))}</td>`).join('')}</tr>`).join('\n')}</tbody>`;
  const html = `<table>${title && !page ? `<caption>${esc(title)}</caption>` : ''}${head}${body}</table>`;
  if (!page) return html;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title || 'Data')}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 10px}th{background:#f2f4f7;text-align:left}.num{text-align:right}</style>
</head><body>${title ? `<h1>${esc(title)}</h1>` : ''}${html}</body></html>
`;
}

const xmlEsc = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** An Excel workbook with one sheet (header row in bold, numbers as numbers). */
export async function toXlsx(table, { sheetName = 'Data' } = {}) {
  const strings = [];
  const index = new Map();
  const shared = (text) => { if (!index.has(text)) { index.set(text, strings.length); strings.push(text); } return index.get(text); };
  const cell = (r, c, value, style = 0) => {
    const ref = `${columnLetter(c)}${r + 1}`;
    if (value == null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`;
    return `<c r="${ref}" t="s"${style ? ` s="${style}"` : ''}><v>${shared(String(value))}</v></c>`;
  };
  const rows = [
    `<row r="1">${table.columns.map((c, i) => cell(0, i, c.name, 1)).join('')}</row>`,
    ...table.rows.map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(ri + 1, ci, v)).join('')}</row>`),
  ];
  const widths = table.columns.map((c, i) => Math.min(60, Math.max(8, c.name.length + 2, ...table.rows.slice(0, 200).map((r) => cellText(r[i]).length + 2))));
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join('')}</sst>`;
  const name = xmlEsc(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Data');
  return writeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/sharedStrings.xml', data: sst },
  ]);
}

/** Text of a data export (everything but xlsx). */
export function exportData(table, format, { title = '' } = {}) {
  switch (format) {
    case 'tsv': return toDelimited(table, '\t', { bom: false });
    case 'json': return toJson(table);
    case 'markdown': return toMarkdown(table, title);
    case 'html': return toHtmlTable(table, { title, page: true });
    default: return toDelimited(table, ',');
  }
}

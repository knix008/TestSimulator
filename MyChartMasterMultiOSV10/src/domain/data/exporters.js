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

/** Excel number format codes for the data window's formats (formula.js formatValue). */
function numberFormatCode(fmt) {
  if (!fmt?.type || fmt.type === 'general') return null;
  const decimals = fmt.decimals ?? (fmt.type === 'percent' ? 0 : 2);
  const tail = decimals > 0 ? `.${'0'.repeat(decimals)}` : '';
  switch (fmt.type) {
    case 'number': return `0${tail}`;
    case 'thousands': return `#,##0${tail}`;
    case 'currency': return `"${fmt.symbol ?? '₩'}"#,##0${tail}`;
    case 'percent': return `0${tail}%`;
    case 'scientific': return `0${tail}E+00`;
    case 'date': return 'yyyy-mm-dd';
    case 'text': return '@';
    default: return null;
  }
}
const argb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '')); return m ? `FF${m[1].toUpperCase()}` : null; };
const XLSX_ERRORS = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A)$/;

/**
 * An Excel workbook with one sheet (header row in bold, numbers as numbers). With `sheet` (the data window's
 * extras: formulas, formats, widths) the formulas are written with their results, and bold / italic / underline /
 * colours / alignment / number formats and column widths go with the cells.
 */
export async function toXlsx(table, { sheetName = 'Data', sheet = null } = {}) {
  const strings = [];
  const index = new Map();
  const shared = (text) => { if (!index.has(text)) { index.set(text, strings.length); strings.push(text); } return index.get(text); };
  // Styles: fonts, fills, number formats and cell formats, made as the cells need them.
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const numFmts = [];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const pick = (list, item) => { let i = list.indexOf(item); if (i < 0) { list.push(item); i = list.length - 1; } return i; };
  const styleCache = new Map();
  const styleOf = (format, header) => {
    const f = { ...(header ? { b: true } : {}), ...(format ?? {}) };
    const key = JSON.stringify(f);
    if (styleCache.has(key)) return styleCache.get(key);
    let id = 0;
    if (Object.keys(f).length) {
      const color = argb(f.color);
      const font = `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}${f.u ? '<u/>' : ''}${f.s ? '<strike/>' : ''}<sz val="11"/>${color ? `<color rgb="${color}"/>` : ''}<name val="Calibri"/></font>`;
      const fontId = pick(fonts, font);
      const fillColor = argb(f.fill);
      const fillId = fillColor ? pick(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${fillColor}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const code = numberFormatCode({ type: f.fmt, decimals: f.dec, symbol: f.sym });
      let numFmtId = 0;
      if (code) { let k = numFmts.indexOf(code); if (k < 0) { numFmts.push(code); k = numFmts.length - 1; } numFmtId = 164 + k; }
      const align = ['left', 'center', 'right'].includes(f.align) ? `<alignment horizontal="${f.align}"/>` : '';
      id = pick(xfs, `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${numFmtId ? ' applyNumberFormat="1"' : ''}${align ? ` applyAlignment="1">${align}</xf>` : '/>'}`);
    }
    styleCache.set(key, id);
    return id;
  };
  const formulas = sheet?.formulas ?? {};
  const formats = sheet?.formats ?? {};
  const cell = (r, c, value) => {
    const ref = `${columnLetter(c)}${r + 1}`;
    const style = styleOf(formats[`${r},${c}`], r === 0);
    const s = style ? ` s="${style}"` : '';
    const formula = r > 0 ? formulas[`${r},${c}`] : null;
    if (formula) {
      const f = `<f>${xmlEsc(formula.slice(1))}</f>`;
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}>${f}<v>${value}</v></c>`;
      if (XLSX_ERRORS.test(String(value ?? ''))) return `<c r="${ref}"${s} t="e">${f}<v>${xmlEsc(value)}</v></c>`;
      if (value === 'TRUE' || value === 'FALSE') return `<c r="${ref}"${s} t="b">${f}<v>${value === 'TRUE' ? 1 : 0}</v></c>`;
      return `<c r="${ref}"${s} t="str">${f}<v>${xmlEsc(value ?? '')}</v></c>`;
    }
    if (value == null || value === '') return style ? `<c r="${ref}"${s}/>` : '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
    return `<c r="${ref}" t="s"${s}><v>${shared(String(value))}</v></c>`;
  };
  const rows = [
    `<row r="1">${table.columns.map((c, i) => cell(0, i, c.name)).join('')}</row>`,
    ...table.rows.map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(ri + 1, ci, v)).join('')}</row>`),
  ];
  const widths = table.columns.map((c, i) => (sheet?.widths?.[i] ? Math.round((sheet.widths[i] / 7) * 10) / 10 : Math.min(60, Math.max(8, c.name.length + 2, ...table.rows.slice(0, 200).map((r) => cellText(r[i]).length + 2)))));
  const xmlSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((x) => `<si><t xml:space="preserve">${xmlEsc(x)}</t></si>`).join('')}</sst>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((code, k) => `<numFmt numFmtId="${164 + k}" formatCode="${xmlEsc(code)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs></styleSheet>`;
  const name = xmlEsc(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Data');
  const calc = Object.keys(formulas).length ? '<calcPr calcId="191029" fullCalcOnLoad="1"/>' : '';
  return writeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    // Formulas are calculated again when Excel opens the file.
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>${calc}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: xmlSheet },
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

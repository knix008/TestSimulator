// A whole drawing as a document: Markdown, Word, Excel or plain text. Each page gives a picture and
// a table of its shapes (name, text and shape data); a report can also go to Excel. No DOM here:
// the app renders the pages to PNG and hands them in.
import { blockTable, escapeXml, reportToDocx, zip } from './report-export.js';

const shapeRows = (page, nameOf) => page.shapes
  .filter((shape) => shape.type === 'shape' && !shape.groupId)
  .map((shape) => ({ name: nameOf(shape), text: String(shape.text ?? '').replace(/\s*\r?\n\s*/g, ' ').trim(), data: shape.data ?? [] }));

/**
 * The drawing as pages of tables. `labels`: { page, shape, text, pages, shapes, connectors, generated },
 * `nameOf(shape)`: the name of a shape's kind in the current language.
 */
export function documentTables(doc, { labels, nameOf }) {
  const pages = doc.pages.filter((page) => !page.background).map((page) => {
    const rows = shapeRows(page, nameOf);
    const keys = [...new Set(rows.flatMap((row) => row.data.map((item) => item.label || item.key)))];
    return {
      name: page.name,
      connectors: page.shapes.filter((shape) => shape.type === 'connector').length,
      columns: [labels.shape, labels.text, ...keys],
      rows: rows.map((row) => [row.name, row.text, ...keys.map((key) => {
        const item = row.data.find((entry) => (entry.label || entry.key) === key);
        return item ? item.value : '';
      })]),
    };
  });
  return { title: doc.title, author: doc.author ?? '', pages, labels };
}

const mdCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** images: page index → data URL (embedded, so one file is enough). */
export function documentToMarkdown(tables, images = []) {
  const out = [`# ${tables.title}`, ''];
  if (tables.author) out.push(tables.author, '');
  tables.pages.forEach((page, index) => {
    out.push(`## ${page.name}`, '');
    if (images[index]) out.push(`![${mdCell(page.name)}](${images[index]})`, '');
    if (page.rows.length) {
      out.push(`| ${page.columns.map(mdCell).join(' | ')} |`, `| ${page.columns.map(() => '---').join(' | ')} |`);
      for (const row of page.rows) out.push(`| ${row.map(mdCell).join(' | ')} |`);
      out.push('');
    }
  });
  return out.join('\n');
}

export function documentToText(tables) {
  const out = [tables.title, '='.repeat(Math.max(4, tables.title.length)), ''];
  for (const page of tables.pages) {
    out.push(page.name, '-'.repeat(Math.max(4, page.name.length)));
    for (const row of page.rows) out.push(row.filter((cell) => cell !== '').join(' — '));
    out.push('');
  }
  return out.join('\n');
}

/** images: page index → { png: Uint8Array, width, height }. */
export function documentToDocx(tables, images = [], { now = new Date() } = {}) {
  const model = {
    title: tables.title, project: tables.author, date: now.toISOString().slice(0, 10), labels: { generated: tables.labels.generated },
    blocks: tables.pages.map((page) => ({ type: 'table', title: page.name, columns: page.columns.map((label) => ({ label })), rows: page.rows })),
  };
  return reportToDocx(model, { images: Object.fromEntries(images.map((image, index) => [index, image]).filter(([, image]) => image)), now });
}

// ───────────────────────── Excel (.xlsx)

const columnName = (index) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};
const isNumber = (value) => typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()));

function sheetXml({ columns, rows }) {
  const cell = (value, c, r, style = 0) => {
    const ref = `${columnName(c)}${r}`;
    if (value === '' || value == null) return '';
    if (isNumber(value)) return `<c r="${ref}"><v>${Number(value)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  };
  const head = `<row r="1">${columns.map((label, c) => cell(String(label), c, 1, 1)).join('')}</row>`;
  const body = rows.map((row, r) => `<row r="${r + 2}">${row.map((value, c) => cell(value, c, r + 2)).join('')}</row>`).join('');
  const widths = columns.map((label, c) => Math.min(60, Math.max(10, ...[label, ...rows.map((row) => row[c])].map((value) => String(value ?? '').length * 1.4 + 2))));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, c) => `<col min="${c + 1}" max="${c + 1}" width="${width.toFixed(1)}" customWidth="1"/>`).join('')}</cols><sheetData>${head}${body}</sheetData></worksheet>`;
}

/** Sheet names: at most 31 characters, none of []:*?/\, each different. */
function sheetNames(sheets) {
  const used = new Set();
  return sheets.map((sheet, index) => {
    const clean = String(sheet.name || `Sheet${index + 1}`).replace(/[[\]:*?/\\]/g, '_').slice(0, 28) || `Sheet${index + 1}`;
    let name = clean;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${clean} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** sheets: [{ name, columns: [label], rows: [[value]] }] */
export function sheetsToXlsx(sheets, { now = new Date() } = {}) {
  const names = sheetNames(sheets);
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    { name: '[Content_Types].xml', data: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `${head}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Malgun Gothic"/></font><font><b/><sz val="11"/><name val="Malgun Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>` },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet) })),
  ], now);
}

export const documentToXlsx = (tables, options) => sheetsToXlsx(tables.pages.map((page) => ({ name: page.name, columns: page.columns, rows: page.rows })), options);

/** A report's tables, one sheet each. */
export function reportToXlsx(model, options) {
  const sheets = [];
  for (const block of model.blocks) {
    const table = blockTable(block, model.labels ?? {});
    if (table?.rows?.length) sheets.push({ name: block.title || model.title, columns: table.columns.map((column) => column.label), rows: table.rows.map((row) => row.map((value) => (typeof value === 'object' && value ? value.text ?? value.label ?? '' : value))) });
  }
  return sheetsToXlsx(sheets.length ? sheets : [{ name: model.title, columns: [''], rows: [] }], options);
}

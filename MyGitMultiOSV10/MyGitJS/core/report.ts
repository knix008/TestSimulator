export type ReportRow = { label: string; value: string };

export type ReportTable = { title: string; headers: string[]; rows: string[][] };

export type Report = {
  title: string;
  filename: string;
  generatedAt: string;
  summary: ReportRow[];
  tables: ReportTable[];
  text?: { title: string; body: string };
};

export type ReportFormat = "md" | "csv" | "docx" | "xlsx" | "pdf";

const FORMAT_EXT: Record<ReportFormat, string> = {
  md: "md",
  csv: "csv",
  docx: "docx",
  xlsx: "xlsx",
  pdf: "pdf",
};

export function reportFilename(report: Report, format: ReportFormat): string {
  const day = report.generatedAt.slice(0, 10) || "report";
  const slug = (report.filename || "report").replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "report";
  return `${slug}-${day}.${FORMAT_EXT[format]}`;
}

export function renderMarkdown(report: Report): string {
  const lines = [`# ${report.title}`, "", `_${report.generatedAt}_`, ""];
  if (report.summary.length) {
    lines.push(...report.summary.map((row) => `- ${row.label}: ${row.value}`), "");
  }
  for (const table of report.tables) {
    lines.push(`## ${table.title}`, "");
    if (table.headers.length) {
      lines.push(`| ${table.headers.map(mdCell).join(" | ")} |`);
      lines.push(`| ${table.headers.map(() => "---").join(" | ")} |`);
      for (const row of table.rows) lines.push(`| ${table.headers.map((_, index) => mdCell(row[index] ?? "")).join(" | ")} |`);
      lines.push("");
    }
  }
  if (report.text) {
    lines.push(`## ${report.text.title}`, "", "```", report.text.body.replaceAll("```", "'''"), "```", "");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function renderCsv(report: Report): string {
  const lines = [csvRow(["#", report.title]), csvRow(["#", report.generatedAt]), ""];
  if (report.summary.length) {
    lines.push(csvRow(["Field", "Value"]));
    for (const row of report.summary) lines.push(csvRow([row.label, row.value]));
    lines.push("");
  }
  for (const table of report.tables) {
    lines.push(csvRow([`# ${table.title}`]));
    lines.push(csvRow(table.headers));
    for (const row of table.rows) lines.push(csvRow(table.headers.map((_, index) => row[index] ?? "")));
    lines.push("");
  }
  if (report.text) {
    lines.push(csvRow([`# ${report.text.title}`]));
    lines.push(csvRow([report.text.body]));
  }
  return `\uFEFF${lines.join("\r\n").trim()}\r\n`;
}

export function renderDocx(report: Report): Uint8Array {
  const body = [
    paragraph(report.title, true),
    paragraph(report.generatedAt, false),
    ...report.summary.map((row) => paragraph(`${row.label}: ${row.value}`, false)),
  ];
  for (const table of report.tables) {
    body.push(paragraph(table.title, true));
    body.push(wordTable([table.headers, ...table.rows.map((row) => table.headers.map((_, index) => row[index] ?? ""))]));
  }
  if (report.text) {
    body.push(paragraph(report.text.title, true));
    for (const line of report.text.body.split(/\r?\n/)) body.push(paragraph(line || " ", false));
  }
  body.push(`<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr>`);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}</w:body></w:document>`;
  return zipStore([
    { name: "[Content_Types].xml", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`) },
    { name: "_rels/.rels", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: "word/document.xml", data: utf8(documentXml) },
    { name: "word/_rels/document.xml.rels", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`) },
  ]);
}

export function renderXlsx(report: Report): Uint8Array {
  const sheets: { name: string; rows: string[][] }[] = [];
  const summaryRows = [["Field", "Value"], ...report.summary.map((row) => [row.label, row.value])];
  if (report.text) summaryRows.push([report.text.title, report.text.body]);
  sheets.push({ name: "Summary", rows: summaryRows });
  report.tables.forEach((table, index) => {
    sheets.push({
      name: sheetName(table.title, index + 2),
      rows: [table.headers, ...table.rows.map((row) => table.headers.map((_, column) => row[column] ?? ""))],
    });
  });
  const files = [
    { name: "[Content_Types].xml", data: utf8(xlsxContentTypes(sheets.length)) },
    { name: "_rels/.rels", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: utf8(xlsxWorkbook(sheets.map((sheet) => sheet.name))) },
    { name: "xl/_rels/workbook.xml.rels", data: utf8(xlsxWorkbookRels(sheets.length)) },
  ];
  sheets.forEach((sheet, index) => {
    files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: utf8(xlsxSheet(sheet.rows)) });
  });
  return zipStore(files);
}

export function renderHtml(report: Report): string {
  const summary = report.summary.map((row) => `<tr><th>${html(row.label)}</th><td>${html(row.value)}</td></tr>`).join("");
  const tables = report.tables.map((table) => {
    const head = table.headers.map((cell) => `<th>${html(cell)}</th>`).join("");
    const body = table.rows.map((row) => `<tr>${table.headers.map((_, index) => `<td>${html(row[index] ?? "")}</td>`).join("")}</tr>`).join("");
    return `<h2>${html(table.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }).join("");
  const text = report.text ? `<h2>${html(report.text.title)}</h2><pre>${html(report.text.body)}</pre>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${html(report.title)}</title>
<style>
  body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", sans-serif; margin: 24px; color: #1c1c1c; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 18px 0 6px; }
  .when { color: #555; margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 8px; }
  th, td { border: 1px solid #c8c8c8; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 12px; }
  th { background: #f2f2f2; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 12px; }
</style></head><body>
<h1>${html(report.title)}</h1><p class="when">${html(report.generatedAt)}</p>
<table>${summary}</table>${tables}${text}</body></html>`;
}

function mdCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function csvRow(cells: string[]): string {
  return cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",");
}

function html(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function xml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paragraph(text: string, heading: boolean): string {
  const bold = heading ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:p><w:r>${bold}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

function wordTable(rows: string[][]): string {
  const trs = rows.map((row, rowIndex) => {
    const cells = row.map((cell) => `<w:tc><w:p><w:r>${rowIndex === 0 ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xml(cell)}</w:t></w:r></w:p></w:tc>`);
    return `<w:tr>${cells.join("")}</w:tr>`;
  });
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>
    <w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>
  </w:tblBorders></w:tblPr>${trs.join("")}</w:tbl>`;
}

function sheetName(title: string, fallback: number): string {
  const cleaned = title.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31);
  return cleaned || `Sheet${fallback}`;
}

function xlsxContentTypes(count: number): string {
  const sheets = Array.from({ length: count }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets}</Types>`;
}

function xlsxWorkbook(names: string[]): string {
  const sheets = names.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function xlsxWorkbookRels(count: number): string {
  const rels = Array.from({ length: count }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function xlsxSheet(rows: string[][]): string {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell, column) => `<c r="${columnName(column)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`);
    return `<row r="${rowIndex + 1}">${cells.join("")}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = utf8(file.name);
    const crc = crc32(file.data);
    const local = bytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0),
      name, file.data,
    ]);
    locals.push(local);
    centrals.push(bytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }
  const central = concat(centrals);
  const end = bytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0),
  ]);
  return concat([...locals, central, end]);
}

let crcTable: Uint32Array | null = null;

function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 255, (value >> 8) & 255);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255);
}

function bytes(parts: (number[] | Uint8Array)[]): Uint8Array {
  return concat(parts.map((part) => part instanceof Uint8Array ? part : Uint8Array.from(part)));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

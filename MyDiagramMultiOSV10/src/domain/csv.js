// CSV / TSV reading and writing (RFC 4180): delimiter detection, quoted fields
// with delimiters, line breaks and doubled quotes. Used by the shape data import
// and export and by the org chart from data.

export function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const c of String(text)) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && c in counts) counts[c] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/** RFC 4180 records: quoted fields may hold delimiters, line breaks and doubled quotes. */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else if (c === '\r' && src[i + 1] === '\n') {
        field += '\n';
        i++;
      } else field += c;
    } else if (c === '"' && !wasQuoted && field.trim() === '') {
      quoted = true;
      wasQuoted = true;
      field = '';
    } else if (c === delimiter) {
      row.push(field);
      field = '';
      wasQuoted = false;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      wasQuoted = false;
      if (c === '\r' && src[i + 1] === '\n') i++;
    } else field += c;
  }
  if (field !== '' || row.length || wasQuoted) { row.push(field); rows.push(row); }
  return rows;
}

/** One CSV field, quoted when needed. */
export function csvField(value, delimiter = ",") {
  const text = String(value ?? '');
  return text.includes(delimiter) || /["\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
/** Rows → CSV text (UTF-8 BOM and CRLF so Excel reads Korean text). */
export const toCsv = (rows, delimiter = ',') => `\uFEFF${rows.map((row) => row.map((cell) => csvField(cell, delimiter)).join(delimiter)).join('\r\n')}\r\n`;

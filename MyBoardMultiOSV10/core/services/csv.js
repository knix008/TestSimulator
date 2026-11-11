// RFC 4180 CSV parse / format (no dependencies).

/** Guess the delimiter from the first line. */
export function detectDelimiter(text) {
  const line = String(text).replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t', '|'].map((d) => [d, line.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/**
 * @param {string} text
 * @param {string} [delimiter]
 * @returns {string[][]}
 */
export function parseCsv(text, delimiter) {
  const s = String(text).replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(s);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

const cell = (v, d) => {
  if (v == null) return '';
  const s = String(v);
  return /["\r\n]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** @param {any[][]} rows */
export function formatCsv(rows, delimiter = ',') {
  return '﻿' + rows.map((r) => r.map((v) => cell(v, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
}

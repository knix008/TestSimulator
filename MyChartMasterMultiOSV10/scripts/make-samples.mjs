// Writes every sample chart to samples/<id>.mychart, and a few data files for trying the importers
// (samples/data/*.csv, .tsv, .json, .xlsx, .md, .html, .xml) — npm run samples.
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLES } from '../src/domain/chart/samples.js';
import { ChartDoc } from '../src/domain/chart/doc.js';
import { exportData, toXlsx } from '../src/domain/data/exporters.js';

const dir = path.join(import.meta.dirname, '..', 'samples');
const dataDir = path.join(dir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const keep = new Set();
for (const s of SAMPLES) {
  const built = s.build('ko');
  const doc = new ChartDoc({ name: `${s.id}.mychart`, table: built.table, chart: built.chart });
  doc.created = '2025-01-01T00:00:00.000Z';
  const json = { ...doc.toJSON(), modified: '2025-01-01T00:00:00.000Z' };
  const name = `${s.id}.mychart`;
  keep.add(name);
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(json, null, 1)}\n`);
  console.log(`${name.padEnd(34)} ${String(built.table.rows.length).padStart(4)} rows × ${built.table.columns.length} cols  [${s.group}] ${s.type}`);
}
for (const f of fs.readdirSync(dir)) if (f.endsWith('.mychart') && !keep.has(f)) fs.rmSync(path.join(dir, f));

// Data files: the monthly sales table in every import format.
const sales = SAMPLES.find((s) => s.id === 'monthly-sales').build('ko');
const title = sales.chart.title;
fs.writeFileSync(path.join(dataDir, 'monthly-sales.csv'), exportData(sales.table, 'csv'));
fs.writeFileSync(path.join(dataDir, 'monthly-sales.tsv'), exportData(sales.table, 'tsv'));
fs.writeFileSync(path.join(dataDir, 'monthly-sales.json'), exportData(sales.table, 'json'));
fs.writeFileSync(path.join(dataDir, 'monthly-sales.md'), exportData(sales.table, 'markdown', { title }));
fs.writeFileSync(path.join(dataDir, 'monthly-sales.html'), exportData(sales.table, 'html', { title }));
fs.writeFileSync(path.join(dataDir, 'monthly-sales.xlsx'), await toXlsx(sales.table, { sheetName: '매출' }));
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sales>\n${sales.table.rows.map((r) => `  <month name="${r[0]}">${sales.table.columns.slice(1).map((c, i) => `<${['appliances', 'mobile', 'accessories'][i]}>${r[i + 1]}</${['appliances', 'mobile', 'accessories'][i]}>`).join('')}</month>`).join('\n')}\n</sales>\n`;
fs.writeFileSync(path.join(dataDir, 'monthly-sales.xml'), xml);
console.log(`${SAMPLES.length} samples and 7 data files written to ${dir}`);

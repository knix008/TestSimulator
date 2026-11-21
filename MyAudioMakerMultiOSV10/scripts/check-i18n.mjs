// Lists i18n keys the code uses that neither dictionary has (static t('…') calls and label: '…').
import fs from 'node:fs';
import path from 'node:path';
import { DICTIONARIES } from '../src/i18n.js';
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/i18n$/.test(p)) walk(p); } else if (/\.js$/.test(f)) files.push(p); } })('src');
const keys = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  for (const m of s.matchAll(/label:\s*'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
}
const missing = { ko: [], en: [] };
for (const k of keys) for (const l of ['ko', 'en']) if (DICTIONARIES[l][k] == null) missing[l].push(k);
console.log('ko missing', missing.ko.length, missing.ko.sort().join(' '));
console.log('en missing', missing.en.length, missing.en.sort().join(' '));
process.exitCode = missing.ko.length || missing.en.length ? 1 : 0;

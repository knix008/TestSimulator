// npm run i18n:check — every literal t('key') in src/ has a Korean and an English text.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { DICTIONARIES } = await import(pathToFileURL(path.join(root, 'src/i18n.js')).href);
const files = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'i18n') walk(p); } else if (/\.js$/.test(e.name)) files.push(p); } };
walk(path.join(root, 'src'));
const used = new Map();
const re = /\bt\(\s*'([a-zA-Z0-9_.:-]+)'/g;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(re)) if (!used.has(m[1])) used.set(m[1], path.relative(root, f));
  // label: 'x.y' in command tables and similar
  for (const m of text.matchAll(/\blabel: '([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9_.:-]+)'/g)) if (!used.has(m[1])) used.set(m[1], path.relative(root, f));
}
const extra = (process.argv.slice(2).join(' ').match(/[a-zA-Z0-9_.:-]+/g) ?? []);
for (const k of extra) used.set(k, 'argv');
const missing = { ko: [], en: [] };
for (const [k, f] of used) for (const L of ['ko', 'en']) if (DICTIONARIES[L][k] == null) missing[L].push(`${k}  (${f})`);
console.log(`keys used: ${used.size}`);
console.log(`missing ko: ${missing.ko.length}\n${missing.ko.join('\n')}`);
console.log(`missing en only: ${missing.en.filter((x) => !missing.ko.includes(x)).length}`);
process.exitCode = missing.ko.length || missing.en.length ? 1 : 0;

// Lists i18n keys the code uses (t('…') with a literal key, plus the dynamic families below) that
// a dictionary lacks, and dictionary keys nothing uses. `node scripts/i18n-check.mjs [--prune]`.
// --prune drops unused keys from both dictionaries (keeps the order of the rest).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'i18n') walk(full); } else if (/\.js$/.test(entry.name)) files.push(full);
  }
};
walk(path.join(root, 'src'));

const used = new Set();
const dynamic = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*'([A-Za-z0-9_.:-]+)'/g)) used.add(m[1]);
  for (const m of text.matchAll(/\bt\(\s*`([^`]*\$\{[^`]*)`/g)) dynamic.push(m[1]);
  // Keys stored in tables: label: 'action.x', ['…', 'settings.x'], titleKey 'error.x'.
  for (const m of text.matchAll(/'((?:action|settings|time|precision|filterHow|conversationFilter|column|start|menu|submenu|progress|error|notice|tip|status|recent|confirm|filter|capopts|stats|chart|follow|flow|export|expr|coloring|decodeAs|protocols|goto|find|timeshift|columns|netmap|capture|captureError|context|copy|merge|tabs|details|bytes|packetList|expert|sampleGroup|window|common|tutorial|welcome|about|drop)\.[A-Za-z0-9_.:-]+)'/g)) used.add(m[1]);
}

const load = async (lang) => (await import(`file://${path.join(root, 'src', 'i18n', `${lang}.js`).replace(/\\/g, '/')}`)).default;
const ko = { ...(await load('ko')), ...(await load('net-ko')) };
const en = { ...(await load('en')), ...(await load('net-en')) };
const families = dynamic.map((d) => d.replace(/\$\{[^}]*\}/g, '*'));
const familyRe = families.map((f) => new RegExp(`^${f.replace(/[.+?^()|[\]\\]/g, '\\$&').replace(/\*/g, '[^]*')}$`));
const isUsed = (key) => used.has(key) || familyRe.some((re) => re.test(key));

const missing = (dict) => [...used].filter((key) => !(key in dict)).sort();
console.log(`used literal keys: ${used.size}, dynamic families: ${new Set(families).size}`);
console.log('missing in ko:', missing(ko).length);
console.log(missing(ko).join('\n'));
console.log('missing in en:', missing(en).length);
const enOnly = missing(en).filter((k) => !missing(ko).includes(k));
if (enOnly.length) console.log(enOnly.join('\n'));
console.log('ko keys missing in en:', Object.keys(ko).filter((k) => !(k in en)).join(', ') || 'none');
console.log('en keys missing in ko:', Object.keys(en).filter((k) => !(k in ko)).join(', ') || 'none');
const unused = Object.keys(ko).filter((key) => !isUsed(key));
console.log('unused:', unused.length);
if (process.argv.includes('--families')) console.log([...new Set(families)].sort().join('\n'));
if (process.argv.includes('--prune')) {
  for (const lang of ['ko', 'en']) {
    const file = path.join(root, 'src', 'i18n', `${lang}.js`);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const kept = lines.filter((line) => { const m = /^\s*'([^']+)':/.exec(line); return !m || isUsed(m[1]); });
    fs.writeFileSync(file, kept.join('\n'));
  }
  console.log('pruned');
}

// i18n check: every text key the UI uses exists in Korean and English, and both dictionaries have the
// same keys. Keys are collected from the sources: t('…'), label: '…', titleKey strings, and the
// prefixes of dynamic keys (t(`animation.${kind}`) → every 'animation.*' key counts as used).
//
//   node scripts/i18n-check.mjs            report (exit 1 when a used key is missing)
//   node scripts/i18n-check.mjs --unused   also list dictionary keys nothing uses
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) { if (name !== 'i18n') walk(file, out); } else if (/\.js$/.test(name) && !/emoji-data|icons-catalog/.test(name)) out.push(file);
  }
  return out;
}

/** { used: Set, prefixes: Set } from the sources. */
export function collectKeys(files) {
  const used = new Set();
  const prefixes = new Set();
  const KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_-]+)+$/;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*'([^'\\]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/\bt\(\s*`([a-zA-Z0-9.]+)\.\$\{/g)) prefixes.add(`${m[1]}.`);
    for (const m of text.matchAll(/\bt\(\s*`([a-zA-Z0-9.]+)\$\{/g)) prefixes.add(m[1]);
    for (const m of text.matchAll(/(?:label|title|titleKey|tip|text)\s*:\s*'([^'\\]+)'/g)) if (KEY.test(m[1])) used.add(m[1]);
    for (const m of text.matchAll(/(?:withProgress|showError|busy)\(\s*'([^'\\]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/\['[a-zA-Z0-9]+',\s*'[a-zA-Z0-9]+',\s*'([a-z][A-Za-z0-9]*\.[A-Za-z0-9.]+)'\]/g)) used.add(m[1]);
    for (const m of text.matchAll(/\['[^'\]]+',\s*'([a-z][A-Za-z0-9]*\.[A-Za-z0-9.]+)'\]/g)) used.add(m[1]);
  }
  return { used, prefixes };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { DICTIONARIES } = await import(pathToFileURL(path.join(src, 'i18n-data.mjs')).href).catch(async () => {
    const ko = (await import(pathToFileURL(path.join(src, 'i18n', 'ko.js')).href)).default;
    const en = (await import(pathToFileURL(path.join(src, 'i18n', 'en.js')).href)).default;
    const board = await import(pathToFileURL(path.join(src, 'i18n', 'board.js')).href);
    return { DICTIONARIES: { ko: { ...ko, ...board.ko }, en: { ...en, ...board.en } } };
  });
  // Feature modules register their own texts (registerTexts): every src/views/**/texts.js exports { ko, en }
  // (or TEXTS / default = { ko, en }).
  for (const file of walk(path.join(src, 'views')).filter((f) => path.basename(f) === 'texts.js')) {
    const mod = await import(pathToFileURL(file).href);
    const extra = mod.TEXTS ?? mod.default ?? mod;
    Object.assign(DICTIONARIES.ko, extra.ko ?? {});
    Object.assign(DICTIONARIES.en, extra.en ?? {});
  }
  const { used, prefixes } = collectKeys(walk(src));
  const missing = { ko: [], en: [] };
  for (const key of used) for (const lang of ['ko', 'en']) if (!(key in DICTIONARIES[lang])) missing[lang].push(key);
  const onlyKo = Object.keys(DICTIONARIES.ko).filter((k) => !(k in DICTIONARIES.en));
  const onlyEn = Object.keys(DICTIONARIES.en).filter((k) => !(k in DICTIONARIES.ko));
  console.log(`used keys: ${used.size}, dynamic prefixes: ${[...prefixes].join(' ')}`);
  console.log(`missing ko (${missing.ko.length}): ${missing.ko.sort().join(' ')}`);
  console.log(`missing en (${missing.en.length}): ${missing.en.sort().join(' ')}`);
  console.log(`only ko (${onlyKo.length}): ${onlyKo.slice(0, 40).join(' ')}`);
  console.log(`only en (${onlyEn.length}): ${onlyEn.slice(0, 40).join(' ')}`);
  if (process.argv.includes('--unused')) {
    const unused = Object.keys(DICTIONARIES.ko).filter((k) => !used.has(k) && ![...prefixes].some((p) => k.startsWith(p)));
    console.log(`unused (${unused.length})`);
  }
  if (missing.ko.length || missing.en.length || onlyKo.length || onlyEn.length) process.exitCode = 1;
}

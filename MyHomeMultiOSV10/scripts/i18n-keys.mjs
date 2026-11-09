// The UI text keys the sources use: t('key'), t(`prefix.${…}`) expanded with the values the
// app knows (menus, commands, tutorial steps …). `node scripts/i18n-keys.mjs` lists the keys
// missing from src/i18n/ko.js or en.js (the i18n unit test runs the same check).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'i18n' ? [] : sources(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/** Static keys: t('a.b'), t("a.b"), label: 'action.x', titleKey. */
export function staticKeys() {
  const keys = new Set();
  for (const file of sources(path.join(root, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) keys.add(m[1]);
    for (const m of text.matchAll(/\blabel: '([a-z]+\.[\w.]+)'/g)) keys.add(m[1]);
    for (const m of text.matchAll(/(?:showError|titleKey:?|withProgress)\(\s*'([a-z]+\.[\w.]+)'/g)) keys.add(m[1]);
    for (const m of text.matchAll(/\['[\w-]+', '[\w]+', '(settings\.[\w.]+)'\]/g)) keys.add(m[1]);
    for (const m of text.matchAll(/\{ key: '(check\.[\w]+)'/g)) keys.add(m[1]);
  }
  return keys;
}

/** Keys made at run time, from the app's own lists. */
export async function dynamicKeys() {
  const url = (p) => new URL(`file:///${path.join(root, p).replace(/\\/g, '/')}`).href;
  const { BLOCK_TYPES, PAGE_BLOCK_TYPES, STYLE_BACKGROUNDS, STYLE_ALIGNS, STYLE_WIDTHS } = await import(url('src/domain/blocks.js'));
  const { TEMPLATES } = await import(url('src/domain/templates.js'));
  const { ART_KINDS } = await import(url('src/domain/art.js'));
  const { ANIMATIONS, BACKGROUND_KINDS, BACKGROUND_FITS, FONT_WEIGHTS, FONT_STYLES, DEVICE_IDS } = await import(url('src/domain/settings.js'));
  const keys = new Set();
  const add = (k) => keys.add(k);
  for (const name of ['file', 'edit', 'insert', 'page', 'view', 'design', 'tools', 'help']) add(`menu.${name}`);
  for (const key of ['siteCode', 'exportTo', 'zoom', 'device', 'appearance', 'panels', 'insert:hero', 'insert:basic', 'insert:content', 'insert:showcase', 'insert:contact']) add(`submenu.${key}`);
  for (const [id] of TEMPLATES) { add(`template.${id}`); add(`template.${id}.desc`); }
  for (const type of PAGE_BLOCK_TYPES) add(`block.${type}`);
  for (const kind of ART_KINDS) add(`art.${kind}`);
  for (const a of ANIMATIONS) add(`animation.${a}`);
  for (const k of BACKGROUND_KINDS) add(`bgKind.${k}`);
  for (const f of BACKGROUND_FITS) add(`settings.fit.${f}`);
  for (const w of FONT_WEIGHTS) add(`settings.weight.${w}`);
  for (const s of FONT_STYLES) add(`settings.${s}`);
  for (const d of DEVICE_IDS) add(`device.${d}`);
  for (const bg of STYLE_BACKGROUNDS) add(`bg.${bg || 'default'}`);
  for (const a of STYLE_ALIGNS) add(`align.${a}`);
  for (const w of STYLE_WIDTHS) add(`width.${w}`);
  for (const k of ['primary', 'accent', 'bg', 'surface', 'text', 'headerBg', 'footerBg']) add(`design.${k}`);
  for (const id of ['blank', 'about', 'services', 'gallery', 'contact', 'pricing', 'blog']) add(`pageStart.${id}`);
  for (const id of ['content', 'style', 'page', 'site']) add(`editors.${id}`);
  for (const kind of ['page']) { add(`confirm.delete.${kind}`); add(`confirm.delete.${kind}Title`); }
  for (const key of ['bg', 'surface', 'panel', 'text', 'muted', 'border', 'accent', 'accentText', 'gridAlt', 'chart', 'toolbar', 'status']) add(`colorKey.${key}`);
  for (const id of ['addBlock', 'publish', 'previewMode', 'previewBrowser']) add(`toolbar.${id}`);
  const { STEPS, CHAPTERS } = await import(url('src/ui/tutorial.js')).catch(() => ({ STEPS: [], CHAPTERS: [] }));
  for (const step of STEPS) { add(`tutorial.${step.id}.title`); add(`tutorial.${step.id}.text`); }
  for (const c of CHAPTERS) add(`tutorial.chapter.${c}`);
  void BLOCK_TYPES;
  return keys;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all = new Set([...staticKeys(), ...(await dynamicKeys())]);
  const load = async (lang) => (await import(new URL(`file:///${path.join(root, 'src', 'i18n', `${lang}.js`).replace(/\\/g, '/')}`).href).catch(() => ({ default: {} }))).default;
  const ko = await load('ko');
  const en = await load('en');
  const missing = [...all].filter((k) => !(k in ko) || !(k in en)).sort();
  if (process.argv.includes('--json')) console.log(JSON.stringify(missing));
  else console.log(missing.length ? `missing ${missing.length}:\n${missing.join('\n')}` : `all ${all.size} keys present`);
  process.exitCode = missing.length ? 1 : 0;
}

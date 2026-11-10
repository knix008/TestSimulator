// Builds src/i18n/ko.js and en.js: the shell's shared strings (MyUMLMaker's dictionaries, by key
// family) plus MyPhotoCut's own (scripts/i18n-photo.mjs, which win). Run once after editing
// i18n-photo.mjs: node scripts/make-i18n.mjs [path to MyUMLMakerMultiOSV10]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PHOTO_STRINGS } from './i18n-photo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'i18n');
const shell = process.argv[2] ?? path.join(root, '..', 'MyUMLMakerMultiOSV10');

const SHARED_PREFIXES = ['colorKey.', 'settings.weight.', 'settings.fit.', 'bgKind.', 'reader.', 'common.', 'tabs.', 'stepper.', 'window.', 'theme.', 'recent.'];
const SHARED_KEYS = [
  'about.author', 'about.buildDate', 'about.buildInfo', 'about.commit', 'about.platform', 'about.profile', 'about.runtime', 'about.target', 'about.title', 'about.version', 'about.webBuild',
  'error.copied', 'error.copy', 'error.copyFailed', 'error.detail', 'error.fonts', 'error.hint', 'error.location', 'error.log', 'error.thread', 'error.title', 'error.when', 'error.where',
  'error.unexpected', 'error.fatal', 'error.background', 'error.docWindow',
  'start.actions', 'start.arrange', 'start.arrangeTip', 'start.background', 'start.bgInterval', 'start.bgRandom', 'start.cardOpacity', 'start.everyMinutes', 'start.everySeconds',
  'start.moveCard', 'start.never', 'start.recent', 'start.recentFolders', 'start.resizeCard', 'start.settings', 'start.theme', 'start.themeDark', 'start.themeLight', 'start.themeSettings',
  'start.tipAbout', 'start.tipExit', 'start.tipLanguage', 'start.tipSettings', 'start.tipStartSettings', 'start.tipTheme',
  'settings.animation', 'settings.animationOnStartOnly', 'settings.animationSpeed', 'settings.bgChoose', 'settings.bgClear', 'settings.bgFit', 'settings.bgImage', 'settings.bgInterval',
  'settings.bgKind', 'settings.bgNone', 'settings.bgOpacity', 'settings.bgRandom', 'settings.confirmDelete', 'settings.contrastOk', 'settings.copyTheme', 'settings.customDark',
  'settings.editCustom', 'settings.fontCount', 'settings.fontDefault', 'settings.fontFamily', 'settings.fontLoading', 'settings.fontSample', 'settings.fontScope', 'settings.fontSize',
  'settings.fontStyle', 'settings.fontWeight', 'settings.language', 'settings.lastDirectory', 'settings.lowContrast', 'settings.reset', 'settings.restoreSession', 'settings.showStartPage',
  'settings.showWelcome', 'settings.startOpen', 'settings.startOpenButton', 'settings.startRecentCount', 'settings.startShowBackground', 'settings.startShowFolders',
  'settings.startShowRecent', 'settings.startShowSamples', 'settings.statusClock', 'settings.themeCustom', 'settings.themeDark', 'settings.themeLight', 'settings.title',
  'settings.useCustom', 'settings.zoom', 'settings.general', 'settings.startPage', 'settings.theme', 'settings.font', 'settings.background', 'settings.recent', 'settings.shortcuts',
  'settings.normal', 'settings.italic',
  'status.clock', 'status.modified', 'status.ready', 'status.saved', 'status.theme',
  'tip.bgInterval', 'tip.bgRandom', 'tip.home', 'tip.panelSplitter', 'tip.resize', 'tip.userGuide',
  'action.about', 'action.backgroundImage', 'action.clearBackground', 'action.copy', 'action.exit', 'action.language', 'action.settings', 'action.shuffleBackground',
  'action.statusBar', 'action.themeChoose', 'action.themeRandom', 'action.userGuide',
  'notice.animation', 'notice.background', 'notice.backgroundCleared', 'notice.language', 'notice.recentCleared', 'notice.theme',
  'progress.bytes', 'progress.steps', 'progress.wait',
  'confirm.cancel', 'confirm.delete', 'confirm.discard', 'confirm.save', 'confirm.title', 'confirm.exitTitle',
  'web.desktopOnly',
];

const load = async (lang) => (await import(pathToFileURL(path.join(shell, 'src', 'i18n', `${lang}.js`)).href)).default;
const [ko, en] = await Promise.all([load('ko'), load('en')]);

function build(source, column) {
  const dict = {};
  for (const [key, value] of Object.entries(source)) {
    if (SHARED_KEYS.includes(key) || SHARED_PREFIXES.some((prefix) => key.startsWith(prefix))) dict[key] = value.replace(/MyUMLMaker/g, 'MyPhotoCut');
  }
  for (const row of PHOTO_STRINGS) dict[row[0]] = row[column];
  return Object.fromEntries(Object.entries(dict).sort(([a], [b]) => a.localeCompare(b)));
}

function write(lang, dict, header) {
  let section = '';
  const lines = [header, 'export default {'];
  for (const [key, value] of Object.entries(dict)) {
    const head = key.split('.')[0];
    if (head !== section) { section = head; lines.push(`  // ── ${head}`); }
    lines.push(`  ${JSON.stringify(key).replace(/^"|"$/g, "'")}: ${JSON.stringify(value)},`);
  }
  lines.push('};', '');
  fs.writeFileSync(path.join(out, `${lang}.js`), lines.join('\n'));
  console.log(`${lang}.js: ${Object.keys(dict).length} strings`);
}

fs.mkdirSync(out, { recursive: true });
const koDict = build(ko, 1);
const enDict = build(en, 2);
const missing = SHARED_KEYS.filter((key) => !(key in koDict) || !(key in enDict));
if (missing.length) console.warn(`not in the shell dictionaries: ${missing.join(', ')}`);
write('ko', koDict, '// 한국어 UI 문자열 (키는 en.js와 같음). scripts/make-i18n.mjs 가 만듭니다.');
write('en', enDict, '// English UI strings (same keys as ko.js). Generated by scripts/make-i18n.mjs.');

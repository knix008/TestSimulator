'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertIncludes(hay, needle, label) {
  assert(hay.includes(needle), `${label || 'source'} missing ${JSON.stringify(needle)}`);
}

const PRINT_PAPERS = {
  A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6],
  A3: [297, 420], A5: [148, 210], Tabloid: [279.4, 431.8],
};
const PRINT_BAND_MM = 7;

function printLayout(f, imgW, imgH) {
  const [pw0, ph0] = PRINT_PAPERS[f.paper] || PRINT_PAPERS.A4;
  const landscape = f.orient === 'landscape' || (f.orient === 'auto' && imgW > imgH);
  const pw = landscape ? ph0 : pw0;
  const ph = landscape ? pw0 : ph0;
  const headerMm = f.headerOn ? PRINT_BAND_MM : 0;
  const footerMm = f.pageNoOn && String(f.pageNoPos || 'footer-center').startsWith('footer') ? PRINT_BAND_MM : 0;
  const headerMm2 = f.pageNoOn && String(f.pageNoPos || '').startsWith('header') ? PRINT_BAND_MM : headerMm;
  const cw = Math.max(1, pw - 2 * f.marginMm);
  const ch = Math.max(1, ph - 2 * f.marginMm - headerMm2 - footerMm);
  const fit = Math.min(cw / imgW, ch / imgH);
  let k = fit;
  if (f.scale === 'actual') k = 25.4 / 96;
  else if (f.scale === 'custom') k = fit * f.scalePct / 100;
  return { pw, ph, cw, ch, iw: imgW * k, ih: imgH * k, landscape, headerMm: headerMm2, footerMm };
}

function pageNumberText(fmt, page, total) {
  if (fmt === 'n') return String(page);
  if (fmt === 'pageN') return `페이지 ${page}`;
  if (fmt === 'dash') return `- ${page} -`;
  return `${page} / ${total}`;
}

function formatExt(filePath) {
  const name = filePath.split(/[/\\]/).pop() || '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','bmp','webp','svg','ico','tiff','tif','heic','heif','hif','dcm','dicom','avif']);
const VIDEO_EXTS = new Set(['mp4','webm','ogv','mov','avi','mkv','m4v','flv','wmv','3gp','mpeg','mpg','ts','m2ts','vob','rm','rmvb']);
const AUDIO_EXTS = new Set(['mp3','wav','flac','aac','m4a','ogg','opus','wma','mid','midi','aiff','aif']);

function fmtMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(3)} ms`;
}

function extractPresetIds(editorSrc) {
  const start = editorSrc.indexOf('const PRESETS = {');
  const end = editorSrc.indexOf('function applyPreset', start);
  if (start < 0 || end < 0) return [];
  return [...editorSrc.slice(start, end).matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*):\s+/gm)].map((m) => m[1]);
}

function extractThemeIds(themesSrc) {
  return [...themesSrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
}

function i18nPrefixes(map) {
  return [...new Set(Object.keys(map).map((k) => k.split('.')[0]))].sort();
}

function loadSources() {
  return {
    html: read('src/index.html'),
    app: read('src/js/app.js'),
    editor: read('src/js/editor.js'),
    main: read('main.js'),
    preload: read('preload.js'),
    css: read('src/styles/main.css'),
    icons: read('src/js/icons.js'),
    ko: JSON.parse(read('src/i18n/ko.json')),
    en: JSON.parse(read('src/i18n/en.json')),
    pkg: JSON.parse(read('package.json')),
    themes: read('src/js/themes.js'),
    fileTree: read('src/js/fileTree.js'),
    browse: read('src/js/browse.js'),
    thumbs: read('src/js/thumbs.js'),
    contextMenu: read('src/js/contextMenu.js'),
    fileDialog: read('src/js/fileDialog.js'),
    formatSupport: read('src/js/formatSupport.js'),
  };
}

module.exports = {
  ROOT, read, exists, assert, assertIncludes,
  printLayout, pageNumberText, formatExt, fmtMs,
  extractPresetIds, extractThemeIds, i18nPrefixes,
  IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS, loadSources,
};

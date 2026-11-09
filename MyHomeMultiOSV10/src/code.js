// The code editor window: HTML, CSS, JavaScript and JSON files in tabs, with colours, line
// numbers, find and replace, go to line, comments, indentation, tidying (Prettier) and checks
// (JSHint, HTMLHint, JSON, CSS braces), and a live preview beside an HTML file. It also edits
// the open site's own CSS, JavaScript and <head> HTML: those tabs apply to the site as you type.
//
// Desktop: an OS window "doc-code" (lib.rs open_doc_window) with the system title bar. Web: a
// browser tab at index.html?viewer=code. The main window talks to it through localStorage
// (every window of the app shares it, and each hears the others' changes):
//   myhomemaker.code.inbox  — requests for this window: open a file, open the site's code …
//   myhomemaker.code.outbox — this window's messages: the site's code changed, open Packages …
//   myhomemaker.code.site   — the open site's code as the main window has it now.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask as askDialog } from '@tauri-apps/plugin-dialog';
import { loadSettings, STORAGE_KEY } from './domain/settings.js';
import { CODE_EXTENSIONS, findAll, highlight, languageOf, LANGUAGES, lineColumn, lineOffset, toggleComment } from './domain/highlight.js';
import { checkCode, formatCode, PARSERS } from './domain/codetools.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { loadPackage, packageView, PACKAGES_STATE_KEY } from './platform/packages.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';
import { CODE_INBOX_KEY, CODE_OUTBOX_KEY, CODE_SESSION_KEY, CODE_SITE_KEY, readQueue } from './domain/codebus.js';

const desktop = native.isDesktop();
const params = new URLSearchParams(location.search);
const osWindow = desktop && !params.has('viewer');
const appWindow = osWindow ? getCurrentWindow() : null;
const root = document.querySelector('#app');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const storageGet = (key) => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } };
const storageSet = (key, value) => { try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; } };
const INDENT = '  ';
const FONT = { min: 10, max: 28 };

let settings = loadSettings(globalThis.localStorage);
let session = {};
try { session = JSON.parse(storageGet(CODE_SESSION_KEY) ?? '{}') ?? {}; } catch { session = {}; }

const state = {
  tabs: [],
  active: null,
  wrap: Boolean(session.wrap),
  preview: session.preview !== false,
  fontSize: Math.min(FONT.max, Math.max(FONT.min, Number(session.fontSize) || 14)),
  find: { open: false, replace: false, query: '', replacement: '', regex: false, caseSensitive: false, index: -1 },
  problems: null,
  message: null,
  site: null,
  untitled: 0,
  seen: new Set(),
};

document.documentElement.classList.add('is-viewer', 'viewer-kind-code', 'is-code');

function applyLook() {
  setLanguage(settings.language);
  const theme = resolveTheme(settings.theme, prefersDark(), settings.customTheme);
  applyTheme(theme);
  applyFont(settings);
  document.documentElement.style.setProperty('--code-size', `${state.fontSize}px`);
  const title = `${t('code.title')} — MyHomeMaker`;
  document.title = osWindow ? 'doc-code' : title;
  if (appWindow) {
    appWindow.setTitle(activeTab() ? `${tabName(activeTab())}${activeTab().dirty ? ' ●' : ''} — ${title}` : title).catch(() => {});
    appWindow.setTheme(theme.dark ? 'dark' : 'light').catch(() => {});
  }
}

// ───────────────────────── tabs

let nextId = 1;
const activeTab = () => state.tabs.find((tab) => tab.id === state.active) ?? null;
const tabName = (tab) => (tab.kind === 'site' ? t(`code.site.${tab.field}`) : tab.name);
const baseName = (path) => String(path ?? '').split(/[\\/]/).pop();
const dirName = (path) => String(path ?? '').replace(/[\\/][^\\/]*$/, '');

function addTab(tab) {
  const full = { id: `t${nextId++}`, dirty: false, eol: '\n', selection: [0, 0], scroll: [0, 0], ...tab };
  full.language ??= languageOf(full.name);
  full.saved = full.text;
  state.tabs.push(full);
  activate(full.id);
  saveSession();
  return full;
}

function activate(id) {
  rememberView();
  state.active = id;
  state.problems = null;
  state.find.index = -1;
  render();
  const tab = activeTab();
  const input = editorInput();
  if (tab && input) {
    input.setSelectionRange(tab.selection[0], tab.selection[1]);
    const scroller = root.querySelector('.code-scroll');
    if (scroller) { scroller.scrollLeft = tab.scroll[0]; scroller.scrollTop = tab.scroll[1]; }
    input.focus({ preventScroll: true });
  }
  revealTab();
}

function rememberView() {
  const tab = activeTab();
  const input = editorInput();
  if (!tab || !input) return;
  tab.text = input.value;
  tab.selection = [input.selectionStart, input.selectionEnd];
  const scroller = root.querySelector('.code-scroll');
  if (scroller) tab.scroll = [scroller.scrollLeft, scroller.scrollTop];
}

async function closeTab(id, { ask = true } = {}) {
  const tab = state.tabs.find((x) => x.id === id);
  if (!tab) return true;
  rememberView();
  if (ask && tab.dirty && tab.kind !== 'site') {
    const choice = await confirmDiscard(t('code.confirmClose', { name: tabName(tab) }));
    if (choice === 'save') { if (!(await saveTab(tab))) return false; } else if (choice !== 'discard') return false;
  }
  const index = state.tabs.indexOf(tab);
  state.tabs.splice(index, 1);
  if (state.active === id) state.active = state.tabs[Math.min(index, state.tabs.length - 1)]?.id ?? null;
  render();
  saveSession();
  return true;
}

/** Save / Don't save / Cancel. The system's question box (desktop) or the browser's (web). */
async function confirmDiscard(message) {
  if (desktop) {
    const save = await askDialog(`${message}\n\n${t('code.confirmSaveFirst')}`, { title: t('code.title'), kind: 'warning', okLabel: t('confirm.save'), cancelLabel: t('confirm.discard') }).catch(() => null);
    if (save === null) return 'cancel';
    return save ? 'save' : 'discard';
  }
  return globalThis.confirm(`${message}\n\n${t('code.confirmDiscardWeb')}`) ? 'discard' : 'cancel';
}

function revealTab() {
  const strip = root.querySelector('.code-tab-strip');
  const tab = strip?.querySelector('.code-tab.active');
  if (tab) {
    if (tab.offsetLeft < strip.scrollLeft) strip.scrollLeft = tab.offsetLeft;
    else if (tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = tab.offsetLeft + tab.offsetWidth - strip.clientWidth;
  }
  updateTabArrows();
}

function updateTabArrows() {
  const strip = root.querySelector('.code-tab-strip');
  const [left, right] = root.querySelectorAll('[data-code="tabs-scroll"]');
  if (!strip || !left) return;
  left.disabled = strip.scrollLeft <= 0;
  right.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
}

// ───────────────────────── files

const normalizeText = (text) => {
  const raw = String(text ?? '').replace(/^﻿/, '');
  return { text: raw.replace(/\r\n?/g, '\n'), eol: /\r\n/.test(raw) ? '\r\n' : '\n' };
};

async function openPath(path) {
  const existing = state.tabs.find((tab) => tab.path && tab.path.toLowerCase() === String(path).toLowerCase());
  if (existing) { activate(existing.id); return existing; }
  try {
    const { text, eol } = normalizeText(await native.readTextFile(path));
    return addTab({ kind: 'file', name: baseName(path), path, text, eol });
  } catch (error) {
    say('error', t('code.openFailed', { name: baseName(path), error: native.errorText(error) }));
    return null;
  }
}

function openContent(name, content, handle = null) {
  const { text, eol } = normalizeText(content);
  return addTab({ kind: 'file', name, path: null, handle, text, eol });
}

function newFile(language = 'html') {
  state.untitled += 1;
  const ext = LANGUAGES[language]?.extensions[0] ?? 'txt';
  const name = `${t('code.untitled', { n: state.untitled })}.${ext}`;
  return addTab({ kind: 'file', name, path: null, text: starterText(language), language, untitled: true });
}

function starterText(language) {
  if (language === 'html') return `<!doctype html>\n<html lang="${getLanguage() === 'en' ? 'en' : 'ko'}">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>${t('code.starterTitle')}</title>\n  <style>\n    body { font-family: system-ui, sans-serif; margin: 40px; }\n  </style>\n</head>\n<body>\n  <h1>${t('code.starterHeading')}</h1>\n  <p>${t('code.starterText')}</p>\n</body>\n</html>\n`;
  if (language === 'css') return '/* style.css */\nbody {\n  margin: 0;\n}\n';
  if (language === 'js') return "// script.js\ndocument.addEventListener('DOMContentLoaded', () => {\n  console.log('ready');\n});\n";
  if (language === 'json') return '{\n  "name": "value"\n}\n';
  return '';
}

const FILTERS = () => [
  { name: t('code.filterAll'), extensions: CODE_EXTENSIONS },
  ...Object.values(LANGUAGES).map((language) => ({ name: `${language[getLanguage()] ?? language.en} (*.${language.extensions.join(', *.')})`, extensions: language.extensions })),
];

async function openWithDialog() {
  try {
    if (desktop) {
      const paths = await native.chooseFiles(settings.lastDirectory ?? undefined, FILTERS(), true);
      for (const path of paths) await openPath(path);
    } else if (native.hasFileSystemAccess()) {
      const handles = await globalThis.showOpenFilePicker({ multiple: true, types: [{ description: t('code.filterAll'), accept: { 'text/plain': CODE_EXTENSIONS.map((ext) => `.${ext}`) } }] });
      for (const handle of handles) { const file = await handle.getFile(); openContent(file.name, await file.text(), handle); }
    } else {
      const files = await native.pickWithInput(CODE_EXTENSIONS.map((ext) => `.${ext}`).join(','), true);
      for (const file of files) openContent(file.name, await file.text());
    }
  } catch (error) {
    if (error?.name !== 'AbortError') say('error', t('code.openFailed', { name: '', error: native.errorText(error) }));
  }
}

const MIME = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', text: 'text/plain' };

/** Saves a tab: a file to its path (or a new one), the site's code to the site. True when it was kept. */
async function saveTab(tab, { saveAs = false } = {}) {
  if (tab === activeTab()) rememberView();
  if (tab.kind === 'site') { sendSiteCode(tab, true); return true; }
  const content = tab.eol === '\r\n' ? tab.text.replace(/\n/g, '\r\n') : tab.text;
  try {
    if (desktop) {
      let path = saveAs || !tab.path ? null : tab.path;
      if (!path) {
        const ext = LANGUAGES[tab.language]?.extensions[0] ?? 'txt';
        const start = tab.path ?? (settings.lastDirectory ? `${settings.lastDirectory}\\${tab.name}` : tab.name);
        path = await native.chooseSavePath(start, [tab.language === 'text' ? 'txt' : ext]);
        if (!path) return false;
      }
      await native.writeTextFile(path, content);
      tab.path = path;
      tab.name = baseName(path);
      tab.language = languageOf(tab.name) === 'text' && tab.language !== 'text' ? tab.language : languageOf(tab.name);
    } else {
      const result = await native.saveFileWeb(content, { name: tab.name, handle: saveAs ? null : tab.handle, saveAs: saveAs || !tab.handle, mime: MIME[tab.language] ?? 'text/plain' });
      if (!result) return false;
      if (result.handle) tab.handle = result.handle;
      if (result.name) tab.name = result.name;
    }
    tab.saved = tab.text;
    tab.dirty = false;
    tab.untitled = false;
    say('success', t('code.saved', { name: tab.name }));
    render();
    saveSession();
    return true;
  } catch (error) {
    say('error', t('code.saveFailed', { name: tab.name, error: native.errorText(error) }));
    return false;
  }
}

async function saveAll() {
  for (const tab of state.tabs.filter((x) => x.dirty)) if (!(await saveTab(tab))) return;
}

// ───────────────────────── the site's code (to and from the main window)

function post(message) {
  const queue = readQueue(CODE_OUTBOX_KEY);
  queue.push({ ...message, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  storageSet(CODE_OUTBOX_KEY, JSON.stringify(queue.slice(-50)));
}

let siteTimer = 0;
function sendSiteCode(tab, now = false) {
  clearTimeout(siteTimer);
  const go = () => {
    if (!state.site || tab.siteId !== state.site.siteId) { say('error', t('code.siteGone')); return; }
    post({ type: 'site-code', siteId: tab.siteId, field: tab.field, value: tab.text });
    tab.saved = tab.text;
    tab.dirty = false;
    state.site.code[tab.field] = tab.text;
    renderTabsOnly();
  };
  if (now) go(); else siteTimer = setTimeout(go, 450);
}

function readSite() {
  try { return JSON.parse(storageGet(CODE_SITE_KEY) ?? 'null'); } catch { return null; }
}

/** The main window's site changed (another site, an undo): the site tabs follow unless they have unsent typing. */
function siteChanged() {
  const site = readSite();
  state.site = site;
  let changed = false;
  for (const tab of state.tabs.filter((x) => x.kind === 'site')) {
    if (!site || site.siteId !== tab.siteId) {
      if (site) { tab.siteId = site.siteId; tab.siteName = site.name; tab.text = site.code[tab.field] ?? ''; tab.saved = tab.text; tab.dirty = false; changed = true; }
      continue;
    }
    const value = site.code[tab.field] ?? '';
    if (!tab.dirty && value !== tab.text) { tab.text = value; tab.saved = value; changed = true; }
  }
  if (changed) render();
}

function openSiteCode(field) {
  const site = state.site ?? readSite();
  state.site = site;
  if (!site) { say('error', t('code.noSite')); return null; }
  const existing = state.tabs.find((tab) => tab.kind === 'site' && tab.field === field);
  if (existing) { activate(existing.id); return existing; }
  const language = { css: 'css', js: 'js', head: 'html' }[field];
  return addTab({ kind: 'site', field, siteId: site.siteId, siteName: site.name, name: `site.${field === 'head' ? 'head.html' : field}`, language, text: site.code[field] ?? '' });
}

/** Requests from the main window (open a file, the site's code, a page as HTML). Each is done once. */
async function readInbox() {
  const queue = readQueue(CODE_INBOX_KEY);
  if (!queue.length) return;
  storageSet(CODE_INBOX_KEY, '[]');
  for (const request of queue) {
    if (state.seen.has(request.id)) continue;
    state.seen.add(request.id);
    if (request.type === 'open-path') await openPath(request.path);
    else if (request.type === 'open-content') openContent(request.name, request.content);
    else if (request.type === 'site-code') { siteChanged(); openSiteCode(request.field ?? 'css'); }
    else if (request.type === 'new') newFile(request.language ?? 'html');
  }
  if (appWindow) { appWindow.unminimize().catch(() => {}); appWindow.setFocus().catch(() => {}); }
}

// ───────────────────────── session (the open files come back next time)

function saveSession() {
  const tabs = state.tabs.filter((tab) => tab.kind === 'file' && (tab.path || tab.text.length < 200000)).slice(0, 30).map((tab) => (tab.path
    ? { path: tab.path, dirtyText: tab.dirty && tab.text.length < 200000 ? tab.text : undefined }
    : { name: tab.name, text: tab.text, language: tab.language }));
  storageSet(CODE_SESSION_KEY, JSON.stringify({ tabs, active: state.tabs.findIndex((tab) => tab.id === state.active), wrap: state.wrap, preview: state.preview, fontSize: state.fontSize }));
}

async function restoreSession() {
  for (const item of session.tabs ?? []) {
    if (item.path && desktop) {
      const tab = await openPath(item.path);
      if (tab && typeof item.dirtyText === 'string') { tab.text = item.dirtyText; tab.dirty = tab.text !== tab.saved; }
    } else if (item.name) {
      const tab = addTab({ kind: 'file', name: item.name, path: null, text: String(item.text ?? ''), language: item.language, untitled: true });
      tab.saved = '';
      tab.dirty = Boolean(tab.text);
    }
  }
  const index = Number(session.active);
  if (state.tabs[index]) activate(state.tabs[index].id);
}

// ───────────────────────── drawing

function toolButton(id, glyph, label, { active = false, disabled = false, text = false, extra = '' } = {}) {
  return `<button class="tool-button ${text ? 'tool-labeled' : ''} ${active ? 'active' : ''}" data-code="${id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${active ? 'aria-pressed="true"' : ''} ${disabled ? 'disabled' : ''} ${extra}>${icon(glyph)}${text ? `<span>${escapeHtml(text)}</span>` : ''}</button>`;
}

function toolbarHtml() {
  const tab = activeTab();
  const none = !tab;
  const sep = '<span class="tool-sep" aria-hidden="true"></span>';
  return `<div class="tool-group">
      ${toolButton('new-html', 'htmlFile', t('code.newHtml'), { text: 'HTML' })}${toolButton('new-css', 'fileNew', t('code.newCss'), { text: 'CSS' })}${toolButton('new-js', 'fileNew', t('code.newJs'), { text: 'JS' })}
      ${toolButton('open', 'folderOpen', `${t('code.open')} (Ctrl+O)`)}${toolButton('save', 'save', `${t('code.save')} (Ctrl+S)`, { disabled: none })}${toolButton('save-as', 'saveAs', `${t('code.saveAs')} (Ctrl+Shift+S)`, { disabled: none || tab.kind === 'site' })}${toolButton('save-all', 'saveAll', t('code.saveAll'), { disabled: !state.tabs.some((x) => x.dirty) })}
    </div>${sep}<div class="tool-group">
      ${toolButton('undo', 'undo', `${t('code.undo')} (Ctrl+Z)`, { disabled: none })}${toolButton('redo', 'redo', `${t('code.redo')} (Ctrl+Y)`, { disabled: none })}
    </div>${sep}<div class="tool-group">
      ${toolButton('find', 'search', `${t('code.find')} (Ctrl+F)`, { disabled: none, active: state.find.open && !state.find.replace })}${toolButton('replace', 'replace', `${t('code.replace')} (Ctrl+H)`, { disabled: none, active: state.find.open && state.find.replace })}${toolButton('goto', 'goTo', `${t('code.goto')} (Ctrl+G)`, { disabled: none })}${toolButton('comment', 'comment', `${t('code.comment')} (Ctrl+/)`, { disabled: none || !LANGUAGES[tab.language]?.comment })}
    </div>${sep}<div class="tool-group">
      ${toolButton('format', 'sparkles', `${t('code.format')} (Shift+Alt+F)`, { disabled: none || !PARSERS[tab.language], text: t('code.formatShort') })}${toolButton('check', 'check', `${t('code.check')} (F8)`, { disabled: none || tab.language === 'text', text: t('code.checkShort') })}
    </div>${sep}<div class="tool-group">
      ${toolButton('wrap', 'textAlignLeft', t('code.wrap'), { active: state.wrap })}${toolButton('preview', 'eye', t('code.preview'), { active: state.preview, disabled: none || tab.language !== 'html', text: t('code.previewShort') })}
      ${toolButton('font-down', 'fontDown', t('code.fontDown'))}<span class="code-font-size" title="${escapeHtml(t('code.fontSize'))}">${state.fontSize}px</span>${toolButton('font-up', 'fontUp', t('code.fontUp'))}
    </div>
    <span class="grow"></span>
    <div class="tool-group">${state.site ? toolButton('site-css', 'palette', t('code.site.css'), { text: t('code.siteShort.css') }) + toolButton('site-js', 'blkHtml', t('code.site.js'), { text: t('code.siteShort.js') }) + toolButton('site-head', 'htmlFile', t('code.site.head'), { text: t('code.siteShort.head') }) : ''}${toolButton('packages', 'importFile', t('action.packages'))}</div>`;
}

function tabsHtml() {
  return `<div class="code-tab-strip" role="tablist">${state.tabs.map((tab) => `<div class="code-tab ${tab.id === state.active ? 'active' : ''} ${tab.kind === 'site' ? 'site' : ''}" role="tab" aria-selected="${tab.id === state.active}" data-tab="${tab.id}" title="${escapeHtml(tab.path ?? (tab.kind === 'site' ? `${tabName(tab)} — ${tab.siteName ?? ''}` : tab.name))}">
      ${icon(tab.kind === 'site' ? 'siteProps' : tab.language === 'html' ? 'htmlFile' : 'file')}<span class="code-tab-name">${escapeHtml(tabName(tab))}</span>${tab.dirty ? '<span class="code-dirty" aria-hidden="true">●</span>' : ''}
      <button class="code-tab-close" data-code="close-tab" data-value="${tab.id}" title="${escapeHtml(t('code.closeTab'))} (Ctrl+W)" aria-label="${escapeHtml(t('code.closeTab'))}">${icon('close')}</button></div>`).join('')}</div>
    <div class="code-tab-nav">
      <button class="tab-scroll" data-code="tabs-scroll" data-value="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
      <button class="tab-scroll" data-code="tabs-scroll" data-value="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
    </div>`;
}

function emptyHtml() {
  const card = (id, glyph, title, text) => `<button class="code-start-card" data-code="${id}" title="${escapeHtml(title)}">${icon(glyph)}<b>${escapeHtml(title)}</b><span>${escapeHtml(text)}</span></button>`;
  return `<div class="code-empty">
    <h2>${icon('blkHtml')}<span>${escapeHtml(t('code.emptyTitle'))}</span></h2>
    <p class="muted">${escapeHtml(t('code.emptyText'))}</p>
    <div class="code-start-cards">
      ${card('new-html', 'htmlFile', t('code.newHtml'), t('code.newHtmlText'))}
      ${card('new-css', 'palette', t('code.newCss'), t('code.newCssText'))}
      ${card('new-js', 'blkHtml', t('code.newJs'), t('code.newJsText'))}
      ${card('open', 'folderOpen', t('code.open'), t('code.openText'))}
      ${state.site ? card('site-css', 'siteProps', t('code.site.css'), t('code.siteText', { name: state.site.name })) + card('site-js', 'siteProps', t('code.site.js'), t('code.siteText', { name: state.site.name })) + card('site-head', 'siteProps', t('code.site.head'), t('code.siteText', { name: state.site.name })) : ''}
    </div></div>`;
}

function findHtml() {
  const f = state.find;
  if (!f.open || !activeTab()) return '';
  return `<div class="code-find" role="search">
    <span class="code-find-row">${icon('search')}<input type="text" data-find="query" value="${escapeHtml(f.query)}" placeholder="${escapeHtml(t('code.findPlaceholder'))}" aria-label="${escapeHtml(t('code.find'))}" spellcheck="false" />
      <output class="code-find-count" data-find-count></output>
      <button class="icon-button ${f.caseSensitive ? 'active' : ''}" data-code="find-case" title="${escapeHtml(t('code.findCase'))}" aria-pressed="${f.caseSensitive}">Aa</button>
      <button class="icon-button ${f.regex ? 'active' : ''}" data-code="find-regex" title="${escapeHtml(t('code.findRegex'))}" aria-pressed="${f.regex}">.*</button>
      <button class="icon-button" data-code="find-prev" title="${escapeHtml(t('code.findPrev'))} (Shift+F3)" aria-label="${escapeHtml(t('code.findPrev'))}">${icon('chevronUp')}</button>
      <button class="icon-button" data-code="find-next" title="${escapeHtml(t('code.findNext'))} (F3)" aria-label="${escapeHtml(t('code.findNext'))}">${icon('chevronDown')}</button>
      <button class="icon-button" data-code="find-close" title="${escapeHtml(t('common.close'))} (Esc)" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button></span>
    ${f.replace ? `<span class="code-find-row">${icon('replace')}<input type="text" data-find="replacement" value="${escapeHtml(f.replacement)}" placeholder="${escapeHtml(t('code.replacePlaceholder'))}" aria-label="${escapeHtml(t('code.replace'))}" spellcheck="false" />
      <button class="button small" data-code="replace-one" title="${escapeHtml(t('code.replaceOne'))}">${escapeHtml(t('code.replaceOne'))}</button>
      <button class="button small" data-code="replace-all" title="${escapeHtml(t('code.replaceAll'))}">${escapeHtml(t('code.replaceAll'))}</button></span>` : ''}
  </div>`;
}

function problemsHtml() {
  const list = state.problems;
  if (!list) return '';
  return `<section class="code-problems" aria-label="${escapeHtml(t('code.problems'))}">
    <header>${icon('problems')}<b>${escapeHtml(t('code.problemsCount', { n: list.items.length }))}</b><span class="muted">${escapeHtml(list.tool)}</span><span class="grow"></span>
      <button class="icon-button" data-code="problems-close" title="${escapeHtml(t('common.close'))}" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button></header>
    <div class="code-problem-list">${list.items.length ? list.items.map((p, i) => `<button class="code-problem ${p.severity}" data-code="problem" data-value="${i}" title="${escapeHtml(p.message)}">${icon(p.severity === 'error' ? 'error' : 'warning')}<span class="code-problem-at">${p.line}:${p.column}</span><span>${escapeHtml(p.message)}</span>${p.rule ? `<span class="muted">${escapeHtml(p.rule)}</span>` : ''}</button>`).join('') : `<div class="code-problem none">${icon('check')}<span>${escapeHtml(t('code.noProblems'))}</span></div>`}</div>
  </section>`;
}

function render() {
  const tab = activeTab();
  const showPreview = Boolean(tab) && state.preview && tab.language === 'html';
  root.innerHTML = `<div class="code-window ${state.wrap ? 'wrap' : ''} ${showPreview ? 'with-preview' : ''}">
    <div class="code-toolbar" role="toolbar">${toolbarHtml()}</div>
    <div class="code-tabs">${tabsHtml()}</div>
    ${findHtml()}
    <div class="code-main">
      ${tab ? `<div class="code-editor">
        <div class="code-gutter" aria-hidden="true"><div class="code-gutter-inner"></div></div>
        <div class="code-scroll"><div class="code-layer">
          <div class="code-current" aria-hidden="true"></div>
          <pre class="code-marks" aria-hidden="true"></pre>
          <pre class="code-hl" aria-hidden="true"></pre>
          <textarea class="code-input" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="${state.wrap ? 'soft' : 'off'}" aria-label="${escapeHtml(tabName(tab))}" data-tab="${tab.id}"></textarea>
        </div></div>
      </div>
      ${showPreview ? `<div class="code-split" data-code-split aria-hidden="true"></div><div class="code-preview"><div class="code-preview-bar">${icon('eye')}<span>${escapeHtml(t('code.previewTitle'))}</span><span class="grow"></span>${toolButton('preview-browser', 'previewBrowser', t('code.previewBrowser'))}</div><iframe sandbox="allow-scripts allow-modals allow-forms" title="${escapeHtml(t('code.previewTitle'))}"></iframe></div>` : ''}` : emptyHtml()}
    </div>
    ${problemsHtml()}
    <footer class="code-status" role="status"></footer>
  </div>`;
  if (tab) {
    const input = editorInput();
    input.value = tab.text;
    input.setSelectionRange(Math.min(tab.selection[0], tab.text.length), Math.min(tab.selection[1], tab.text.length));
    paint();
    const scroller = root.querySelector('.code-scroll');
    scroller.scrollLeft = tab.scroll[0];
    scroller.scrollTop = tab.scroll[1];
    syncScroll();
    if (showPreview) {
      root.querySelector('.code-preview').style.width = `${session.previewWidth ?? 46}%`;
      refreshPreview(true);
    }
  }
  renderStatus();
  updateTabArrows();
  applyLook();
}

function renderTabsOnly() {
  const box = root.querySelector('.code-tabs');
  if (!box) return;
  const scroll = box.querySelector('.code-tab-strip')?.scrollLeft ?? 0;
  box.innerHTML = tabsHtml();
  box.querySelector('.code-tab-strip').scrollLeft = scroll;
  updateTabArrows();
  const save = root.querySelector('[data-code="save-all"]');
  if (save) save.disabled = !state.tabs.some((x) => x.dirty);
  applyLook();
}

const editorInput = () => root.querySelector('.code-input');

/** Colours, line numbers, find marks and the current line, from the textarea's text. */
function paint() {
  const tab = activeTab();
  const input = editorInput();
  if (!tab || !input) return;
  const text = input.value;
  const hl = root.querySelector('.code-hl');
  // A last empty line still has a height (the caret can stand on it).
  hl.innerHTML = linesHtml(highlight(text, tab.language));
  paintMarks(text);
  const lines = text.split('\n').length;
  const gutter = root.querySelector('.code-gutter-inner');
  const width = String(lines).length;
  root.querySelector('.code-editor').style.setProperty('--gutter-digits', String(Math.max(2, width)));
  if (state.wrap) {
    const rows = hl.querySelectorAll('.cl');
    gutter.innerHTML = [...rows].map((row, i) => `<div style="height:${row.offsetHeight}px">${i + 1}</div>`).join('');
  } else {
    let html = '';
    for (let i = 1; i <= lines; i += 1) html += `<div>${i}</div>`;
    gutter.innerHTML = html;
  }
  syncScroll();
  paintCurrentLine();
}

/** The coloured HTML as one block per line (a coloured run that crosses a line break is closed and opened again). */
function linesHtml(html) {
  const out = [];
  let line = '';
  let open = '';
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<span', i)) { const end = html.indexOf('>', i) + 1; open = html.slice(i, end); line += open; i = end; continue; }
    if (html.startsWith('</span>', i)) { line += '</span>'; open = ''; i += 7; continue; }
    if (html[i] === '\n') { out.push(`<div class="cl">${open ? `${line}</span>` : line}​</div>`); line = open; i += 1; continue; }
    line += html[i];
    i += 1;
  }
  out.push(`<div class="cl">${line}​</div>`);
  return out.join('');
}

function matches() {
  const tab = activeTab();
  const f = state.find;
  if (!tab || !f.open || !f.query) return [];
  return findAll(editorInput()?.value ?? tab.text, f.query, { regex: f.regex, caseSensitive: f.caseSensitive });
}

function paintMarks(text) {
  const marks = root.querySelector('.code-marks');
  if (!marks) return;
  const list = matches();
  if (!list.length) { marks.innerHTML = ''; updateFindCount(list); return; }
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  let html = '';
  let at = 0;
  list.forEach((m, i) => {
    html += esc(text.slice(at, m.start)) + `<mark class="${i === state.find.index ? 'current' : ''}">${esc(text.slice(m.start, m.end))}</mark>`;
    at = m.end;
  });
  html += esc(text.slice(at));
  marks.innerHTML = linesHtml(html.replace(/<mark class="(current)?">/g, (_, c) => `<span class="mk${c ? ' current' : ''}">`).replace(/<\/mark>/g, '</span>'));
  updateFindCount(list);
}

function updateFindCount(list = matches()) {
  const out = root.querySelector('[data-find-count]');
  if (!out) return;
  out.textContent = state.find.query ? (list.length ? (state.find.index < 0 ? t('code.findTotal', { total: list.length }) : t('code.findCount', { n: state.find.index + 1, total: list.length })) : t('code.findNone')) : '';
  out.classList.toggle('none', Boolean(state.find.query) && !list.length);
}

function syncScroll() {
  const scroller = root.querySelector('.code-scroll');
  const gutter = root.querySelector('.code-gutter-inner');
  if (scroller && gutter) gutter.style.transform = `translateY(${-scroller.scrollTop}px)`;
}

function paintCurrentLine() {
  const input = editorInput();
  const bar = root.querySelector('.code-current');
  const hl = root.querySelector('.code-hl');
  if (!input || !bar || !hl) return;
  const { line } = lineColumn(input.value, input.selectionStart);
  const row = hl.children[line - 1];
  if (!row) return;
  bar.style.top = `${row.offsetTop}px`;
  bar.style.height = `${row.offsetHeight}px`;
  for (const n of root.querySelectorAll('.code-gutter-inner > .on')) n.classList.remove('on');
  root.querySelector(`.code-gutter-inner > :nth-child(${line})`)?.classList.add('on');
}

function renderStatus() {
  const bar = root.querySelector('.code-status');
  if (!bar) return;
  const tab = activeTab();
  const input = editorInput();
  const items = [];
  const m = state.message;
  items.push(`<span class="status-notice ${m?.kind ?? ''}" title="${escapeHtml(m?.text ?? t('status.ready'))}">${icon(m?.kind === 'error' ? 'error' : m?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(m?.text ?? t('status.ready'))}</span></span>`);
  if (tab && input) {
    const { line, column } = lineColumn(input.value, input.selectionStart);
    const selected = Math.abs(input.selectionEnd - input.selectionStart);
    items.push(`<button class="status-item" data-code="goto" title="${escapeHtml(t('code.goto'))}">${escapeHtml(t('code.position', { line, column }))}${selected ? ` · ${escapeHtml(t('code.selected', { n: selected }))}` : ''}</button>`);
    items.push(`<span class="status-item" title="${escapeHtml(t('code.lines'))}">${escapeHtml(t('code.lineCount', { n: input.value.split('\n').length }))}</span>`);
    items.push(`<span class="status-item">${escapeHtml(LANGUAGES[tab.language]?.[getLanguage()] ?? tab.language)}</span>`);
    items.push(`<span class="status-item">UTF-8 · ${tab.eol === '\r\n' ? 'CRLF' : 'LF'}</span>`);
    items.push(`<span class="status-item ${tab.dirty ? 'modified' : 'saved'}">${icon(tab.dirty ? 'edit' : 'save')}<span>${escapeHtml(tab.kind === 'site' ? (tab.dirty ? t('code.siteApplying') : t('code.siteApplied')) : tab.dirty ? t('status.modified') : t('status.saved'))}</span></span>`);
  }
  bar.innerHTML = items.join('');
}

let messageTimer = 0;
function say(kind, text) {
  state.message = { kind, text };
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { state.message = null; renderStatus(); }, kind === 'error' ? 12000 : 5000);
  renderStatus();
}

// ───────────────────────── preview

let previewTimer = 0;
function refreshPreview(now = false) {
  clearTimeout(previewTimer);
  const go = () => {
    const frame = root.querySelector('.code-preview iframe');
    const input = editorInput();
    if (frame && input) frame.srcdoc = input.value;
  };
  if (now) go(); else previewTimer = setTimeout(go, 350);
}

async function previewInBrowser() {
  const tab = activeTab();
  if (!tab) return;
  rememberView();
  try {
    if (desktop) {
      await native.previewSite([{ path: tab.name.replace(/[^\w.-]+/g, '_') || 'index.html', data: tab.text }], tab.name.replace(/[^\w.-]+/g, '_') || 'index.html');
    } else {
      const url = URL.createObjectURL(new Blob([tab.text], { type: 'text/html' }));
      globalThis.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (error) {
    say('error', native.errorText(error));
  }
}

// ───────────────────────── editing

/** Replaces [start, end) with text through the browser's editing, so Ctrl+Z undoes it like typing. */
function insert(text, start, end, select = null) {
  const input = editorInput();
  input.focus({ preventScroll: true });
  input.setSelectionRange(start, end);
  if (!document.execCommand('insertText', false, text)) {
    input.setRangeText(text, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (select) input.setSelectionRange(select[0], select[1]);
}

function replaceAllText(next, select = null) {
  const input = editorInput();
  if (!input || next === input.value) return;
  const keep = select ?? [input.selectionStart, input.selectionEnd];
  insert(next, 0, input.value.length);
  input.setSelectionRange(Math.min(keep[0], next.length), Math.min(keep[1], next.length));
  afterEdit();
}

function onInput() {
  const tab = activeTab();
  const input = editorInput();
  if (!tab || !input) return;
  tab.text = input.value;
  const dirty = tab.text !== tab.saved;
  const was = tab.dirty;
  tab.dirty = dirty;
  if (tab.kind === 'site') sendSiteCode(tab);
  paintSoon();
  if (was !== dirty) renderTabsOnly();
  if (tab.language === 'html' && state.preview) refreshPreview();
  if (state.problems) state.problems.stale = true;
}

function afterEdit() { onInput(); }

let paintFrame = 0;
function paintSoon() {
  cancelAnimationFrame(paintFrame);
  paintFrame = requestAnimationFrame(() => { paint(); renderStatus(); });
}

function indentLines(outdent) {
  const input = editorInput();
  const text = input.value;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const from = text.lastIndexOf('\n', start - 1) + 1;
  let to = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end);
  if (to < 0) to = text.length;
  const lines = text.slice(from, to).split('\n');
  const changed = lines.map((l) => (outdent ? l.replace(new RegExp(`^(?:${INDENT}|\\t| )`), '') : INDENT + l)).join('\n');
  insert(changed, from, to, [from, from + changed.length]);
}

function onEditorKey(event) {
  const input = event.target;
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === 'Tab' && !mod) {
    event.preventDefault();
    if (input.selectionStart !== input.selectionEnd && input.value.slice(input.selectionStart, input.selectionEnd).includes('\n')) indentLines(event.shiftKey);
    else if (event.shiftKey) indentLines(true);
    else insert(INDENT, input.selectionStart, input.selectionEnd);
    return;
  }
  if (event.key === 'Enter' && !mod && !event.altKey) {
    event.preventDefault();
    const text = input.value;
    const start = input.selectionStart;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart, start))[0];
    const before = text.slice(lineStart, start).trimEnd();
    const after = text.slice(input.selectionEnd, text.indexOf('\n', input.selectionEnd) < 0 ? text.length : text.indexOf('\n', input.selectionEnd)).trimStart();
    const opens = /[{[(]$/.test(before) || (/<([a-z][\w-]*)(?:\s[^<>]*)?>$/i.test(before) && !/<\/|\/>$/.test(before.slice(before.lastIndexOf('<'))) && !/^<(br|hr|img|input|meta|link|area|base|col|embed|source|track|wbr)\b/i.test(before.slice(before.lastIndexOf('<'))));
    const closes = /^[}\])]/.test(after) || /^<\//.test(after);
    if (opens && closes) insert(`\n${indent}${INDENT}\n${indent}`, start, input.selectionEnd, [start + 1 + indent.length + INDENT.length, start + 1 + indent.length + INDENT.length]);
    else insert(`\n${indent}${opens ? INDENT : ''}`, start, input.selectionEnd);
    return;
  }
  if (mod && event.key === '/') { event.preventDefault(); commentLines(); }
}

function commentLines() {
  const tab = activeTab();
  const input = editorInput();
  if (!tab || !input) return;
  const result = toggleComment(input.value, input.selectionStart, input.selectionEnd, tab.language);
  if (result.text === input.value) return;
  // Only the lines that changed go through the editing (one undo step): the text before and after them is the same.
  const old = input.value;
  const tail = old.length - (result.text.length - result.end);
  insert(result.text.slice(result.start, result.end), result.start, tail, [result.start, result.end]);
  afterEdit();
}

// ───────────────────────── find, replace, go to line

function openFind(replace = false) {
  const input = editorInput();
  const selected = input ? input.value.slice(input.selectionStart, input.selectionEnd) : '';
  state.find.open = true;
  state.find.replace = replace;
  if (selected && !selected.includes('\n')) state.find.query = selected;
  rememberView();
  render();
  const field = root.querySelector('[data-find="query"]');
  field?.focus();
  field?.select();
}

function findStep(step) {
  const list = matches();
  const input = editorInput();
  if (!list.length || !input) { updateFindCount(list); return; }
  const caret = step > 0 ? input.selectionEnd : input.selectionStart;
  let index = step > 0 ? list.findIndex((m) => m.start >= caret) : list.map((m) => m.end <= caret).lastIndexOf(true);
  if (index < 0) index = step > 0 ? 0 : list.length - 1;
  state.find.index = index;
  input.setSelectionRange(list[index].start, list[index].end);
  revealOffset(list[index].start);
  paintMarks(input.value);
  renderStatus();
}

function revealOffset(offset) {
  const input = editorInput();
  const hl = root.querySelector('.code-hl');
  const scroller = root.querySelector('.code-scroll');
  if (!input || !hl || !scroller) return;
  const { line } = lineColumn(input.value, offset);
  const row = hl.children[line - 1];
  if (!row) return;
  if (row.offsetTop < scroller.scrollTop || row.offsetTop + row.offsetHeight > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = Math.max(0, row.offsetTop - scroller.clientHeight / 3);
  if (!state.wrap) {
    const columnPx = (offset - lineOffset(input.value, line)) * (state.fontSize * 0.6);
    if (columnPx < scroller.scrollLeft || columnPx > scroller.scrollLeft + scroller.clientWidth - 60) scroller.scrollLeft = Math.max(0, columnPx - scroller.clientWidth / 2);
  }
  paintCurrentLine();
}

function replaceOne() {
  const input = editorInput();
  const list = matches();
  if (!input || !list.length) return;
  const current = list.find((m) => m.start === input.selectionStart && m.end === input.selectionEnd);
  if (!current) { findStep(1); return; }
  const replacement = state.find.regex ? input.value.slice(current.start, current.end).replace(new RegExp(state.find.query, state.find.caseSensitive ? '' : 'i'), state.find.replacement) : state.find.replacement;
  insert(replacement, current.start, current.end);
  input.setSelectionRange(current.start + replacement.length, current.start + replacement.length);
  afterEdit();
  findStep(1);
}

function replaceAll() {
  const input = editorInput();
  const list = matches();
  if (!input || !list.length) return;
  const f = state.find;
  let re;
  try { re = new RegExp(f.regex ? f.query : f.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f.caseSensitive ? 'g' : 'gi'); } catch { return; }
  const next = input.value.replace(re, f.regex ? f.replacement : () => f.replacement);
  replaceAllText(next);
  say('success', t('code.replaced', { n: list.length }));
}

function gotoLine() {
  const input = editorInput();
  if (!input) return;
  const lines = input.value.split('\n').length;
  const { line } = lineColumn(input.value, input.selectionStart);
  const answer = globalThis.prompt(t('code.gotoPrompt', { total: lines }), String(line));
  if (answer == null) { input.focus(); return; }
  const [l, c] = answer.split(/[:,\s]+/).map((n) => Number(n));
  if (!Number.isFinite(l)) return;
  jumpTo(Math.min(lines, Math.max(1, Math.round(l))), Number.isFinite(c) ? c : 1);
}

function jumpTo(line, column = 1) {
  const input = editorInput();
  if (!input) return;
  const start = lineOffset(input.value, line);
  const lineEnd = input.value.indexOf('\n', start) < 0 ? input.value.length : input.value.indexOf('\n', start);
  const at = Math.min(lineEnd, start + Math.max(0, column - 1));
  input.focus({ preventScroll: true });
  input.setSelectionRange(at, at);
  revealOffset(at);
  renderStatus();
}

// ───────────────────────── tidy and check (packages)

async function needPackage(id) {
  const tools = await loadPackage(id).catch((error) => { say('error', native.errorText(error)); return null; });
  if (tools) return tools;
  const view = packageView(id);
  const busy = ['download', 'queued', 'saving'].includes(view.phase);
  say('info', busy ? t('code.packageDownloading') : t('code.packageMissing', { name: id }));
  if (!busy) post({ type: 'install-packages', ids: [id] });
  post({ type: 'open-packages' });
  return null;
}

async function formatActive() {
  const tab = activeTab();
  const input = editorInput();
  if (!tab || !input || !PARSERS[tab.language]) return;
  const tools = await needPackage('prettier');
  if (!tools) return;
  try {
    const next = await formatCode(tools, input.value, tab.language);
    replaceAllText(next);
    say('success', t('code.formatted'));
  } catch (error) {
    say('error', t('code.formatFailed', { error: String(error?.message ?? error).split('\n')[0] }));
  }
}

async function checkActive() {
  const tab = activeTab();
  const input = editorInput();
  if (!tab || !input) return;
  const id = tab.language === 'js' ? 'jshint' : tab.language === 'html' ? 'htmlhint' : null;
  const tools = id ? await needPackage(id) : {};
  if (id && !tools) return;
  const result = checkCode(tools, input.value, tab.language);
  state.problems = result;
  rememberView();
  render();
  say(result.items.length ? 'info' : 'success', result.items.length ? t('code.problemsCount', { n: result.items.length }) : t('code.noProblems'));
}

// ───────────────────────── events

root.addEventListener('click', async (event) => {
  const tabEl = event.target.closest('.code-tab');
  const target = event.target.closest('[data-code]');
  if (tabEl && !target) { activate(tabEl.dataset.tab); return; }
  if (!target || target.disabled) return;
  const value = target.dataset.value;
  switch (target.dataset.code) {
    case 'new-html': newFile('html'); break;
    case 'new-css': newFile('css'); break;
    case 'new-js': newFile('js'); break;
    case 'open': await openWithDialog(); break;
    case 'save': { const tab = activeTab(); if (tab) await saveTab(tab); break; }
    case 'save-as': { const tab = activeTab(); if (tab) await saveTab(tab, { saveAs: true }); break; }
    case 'save-all': await saveAll(); break;
    case 'undo': editorInput()?.focus(); document.execCommand('undo'); break;
    case 'redo': editorInput()?.focus(); document.execCommand('redo'); break;
    case 'find': openFind(false); break;
    case 'replace': openFind(true); break;
    case 'goto': gotoLine(); break;
    case 'comment': commentLines(); break;
    case 'format': await formatActive(); break;
    case 'check': await checkActive(); break;
    case 'wrap': rememberView(); state.wrap = !state.wrap; saveSession(); render(); break;
    case 'preview': rememberView(); state.preview = !state.preview; saveSession(); render(); break;
    case 'preview-browser': await previewInBrowser(); break;
    case 'font-down': case 'font-up': rememberView(); state.fontSize = Math.min(FONT.max, Math.max(FONT.min, state.fontSize + (target.dataset.code === 'font-up' ? 1 : -1))); saveSession(); render(); break;
    case 'site-css': openSiteCode('css'); break;
    case 'site-js': openSiteCode('js'); break;
    case 'site-head': openSiteCode('head'); break;
    case 'packages': post({ type: 'open-packages' }); break;
    case 'close-tab': event.stopPropagation(); await closeTab(value); break;
    case 'tabs-scroll': { const strip = root.querySelector('.code-tab-strip'); strip?.scrollBy({ left: Number(value) * Math.max(160, strip.clientWidth * 0.6), behavior: 'instant' }); updateTabArrows(); break; }
    case 'find-case': state.find.caseSensitive = !state.find.caseSensitive; target.classList.toggle('active'); state.find.index = -1; paintMarks(editorInput()?.value ?? ''); break;
    case 'find-regex': state.find.regex = !state.find.regex; target.classList.toggle('active'); state.find.index = -1; paintMarks(editorInput()?.value ?? ''); break;
    case 'find-next': findStep(1); break;
    case 'find-prev': findStep(-1); break;
    case 'find-close': rememberView(); state.find.open = false; render(); editorInput()?.focus(); break;
    case 'replace-one': replaceOne(); break;
    case 'replace-all': replaceAll(); break;
    case 'problems-close': rememberView(); state.problems = null; render(); break;
    case 'problem': { const p = state.problems?.items[Number(value)]; if (p) jumpTo(p.line, p.column); break; }
    default: break;
  }
});

root.addEventListener('auxclick', (event) => {
  const tabEl = event.target.closest('.code-tab');
  if (event.button === 1 && tabEl) closeTab(tabEl.dataset.tab);
});

root.addEventListener('input', (event) => {
  if (event.target.classList?.contains('code-input')) { onInput(); return; }
  const key = event.target.dataset?.find;
  if (key) {
    state.find[key] = event.target.value;
    if (key === 'query') { state.find.index = -1; paintMarks(editorInput()?.value ?? ''); }
  }
});

root.addEventListener('keydown', (event) => {
  if (event.target.classList?.contains('code-input')) onEditorKey(event);
  if (event.target.dataset?.find && event.key === 'Enter') { event.preventDefault(); if (event.target.dataset.find === 'replacement' && (event.ctrlKey || event.altKey)) replaceAll(); else if (event.target.dataset.find === 'replacement') replaceOne(); else findStep(event.shiftKey ? -1 : 1); }
});

const selectionChanged = () => { if (document.activeElement === editorInput()) { paintCurrentLine(); renderStatus(); } };
document.addEventListener('selectionchange', selectionChanged);

root.addEventListener('scroll', (event) => {
  if (event.target.classList?.contains('code-scroll')) syncScroll();
  if (event.target.classList?.contains('code-tab-strip')) updateTabArrows();
}, true);

// The preview's width: drag the bar between the code and the preview.
root.addEventListener('pointerdown', (event) => {
  const split = event.target.closest('[data-code-split]');
  if (!split) return;
  event.preventDefault();
  const main = root.querySelector('.code-main');
  const preview = root.querySelector('.code-preview');
  split.setPointerCapture(event.pointerId);
  const move = (e) => {
    const box = main.getBoundingClientRect();
    const pct = Math.min(80, Math.max(15, ((box.right - e.clientX) / box.width) * 100));
    preview.style.width = `${pct}%`;
    session.previewWidth = Math.round(pct);
  };
  const up = () => { split.removeEventListener('pointermove', move); saveSessionWidth(); requestAnimationFrame(paint); };
  split.addEventListener('pointermove', move);
  split.addEventListener('pointerup', up, { once: true });
});
const saveSessionWidth = () => { const saved = (() => { try { return JSON.parse(storageGet(CODE_SESSION_KEY) ?? '{}') ?? {}; } catch { return {}; } })(); storageSet(CODE_SESSION_KEY, JSON.stringify({ ...saved, previewWidth: session.previewWidth })); };

window.addEventListener('resize', () => { if (state.wrap) paintSoon(); updateTabArrows(); });

window.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const tab = activeTab();
  const run = (fn) => { event.preventDefault(); fn(); };
  if (mod && !event.altKey) {
    if (key === 's' && event.shiftKey && tab) return run(() => saveTab(tab, { saveAs: true }));
    if (key === 's' && tab) return run(() => saveTab(tab));
    if (key === 'o') return run(openWithDialog);
    if (key === 'n') return run(() => newFile(tab?.language && tab.language !== 'text' ? tab.language : 'html'));
    if (key === 'w' && tab) return run(() => closeTab(tab.id));
    if (key === 'f' && tab) return run(() => openFind(false));
    if (key === 'h' && tab) return run(() => openFind(true));
    if (key === 'g' && tab) return run(gotoLine);
    if (key === 'tab' && state.tabs.length > 1) return run(() => { const i = state.tabs.indexOf(tab); activate(state.tabs[(i + (event.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length].id); });
    if ((key === '=' || key === '+') && !event.shiftKey) return run(() => root.querySelector('[data-code="font-up"]')?.click());
    if (key === '-') return run(() => root.querySelector('[data-code="font-down"]')?.click());
  }
  if (event.shiftKey && event.altKey && key === 'f' && tab) return run(formatActive);
  if (key === 'f8' && tab) return run(checkActive);
  if (key === 'f3' && tab) return run(() => (state.find.open ? findStep(event.shiftKey ? -1 : 1) : openFind(false)));
  if (key === 'escape' && state.find.open) return run(() => root.querySelector('[data-code="find-close"]')?.click());
  return undefined;
});

window.addEventListener('storage', (event) => {
  if (event.key === CODE_INBOX_KEY) readInbox();
  else if (event.key === CODE_SITE_KEY) { siteChanged(); if (!activeTab()) render(); }
  else if (event.key === STORAGE_KEY) { settings = loadSettings(globalThis.localStorage); rememberView(); render(); }
  else if (event.key === PACKAGES_STATE_KEY) renderStatus();
});

// Unsaved files: asked before the window closes.
if (appWindow) {
  appWindow.onCloseRequested(async (event) => {
    rememberView();
    saveSession();
    const dirty = state.tabs.filter((tab) => tab.dirty && tab.kind !== 'site');
    if (!dirty.length) return;
    event.preventDefault();
    const choice = await confirmDiscard(t('code.confirmCloseWindow', { n: dirty.length }));
    if (choice === 'cancel') return;
    if (choice === 'save') for (const tab of dirty) if (!(await saveTab(tab))) return;
    for (const tab of dirty) tab.dirty = false;
    saveSession();
    appWindow.destroy();
  });
} else {
  window.addEventListener('beforeunload', (event) => {
    rememberView();
    saveSession();
    if (state.tabs.some((tab) => tab.dirty && tab.kind !== 'site')) { event.preventDefault(); event.returnValue = ''; }
  });
}
// The site's tabs send what is still waiting before the window goes.
window.addEventListener('pagehide', () => { for (const tab of state.tabs.filter((x) => x.kind === 'site' && x.dirty)) sendSiteCode(tab, true); });

async function start() {
  applyLook();
  state.site = readSite();
  render();
  await restoreSession();
  await readInbox();
  if (!state.tabs.length) render();
  if (osWindow) native.invoke('popup_ready').catch(() => {});
}

start();

// Test hook (E2E).
window.__myhomemakerCode = { state, render, openContent, openPath, openSiteCode, newFile, saveTab, closeTab, activeTab, formatActive, checkActive, findStep, openFind, replaceAll, jumpTo, commentLines, paint };

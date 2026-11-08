// The side and bottom panels. Each has a title bar (icon, name, tabs, collapse button); a collapsed
// side panel becomes a narrow rail of tab icons, and a click on one opens the panel at that tab.
//   left   Explorer (drives, places, a folder tree) · Outline · Open documents
//   right  Information (line counter, statistics, file details, hashes) · Bookmarks · Find in files
//   bottom Problems (checks + spelling) · Log
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { KINDS, baseName, dirName, formatSize, kindOf, isTextKind } from '../domain/doctypes.js';
import { outlineOf } from '../domain/outline.js';

export const LEFT_TABS = [['explorer', 'explorer'], ['outline', 'outline'], ['documents', 'closeAll']];
export const RIGHT_TABS = [['info', 'fileInfo'], ['bookmarks', 'bookmark'], ['search', 'findInFiles']];
export const BOTTOM_TABS = [['problems', 'problems'], ['log', 'logList']];

const PLACE_ICONS = { drive: 'drive', root: 'drive', home: 'homeFolder', desktop: 'desktopFolder', documents: 'documentsFolder', downloads: 'downloadsFolder' };
const fileIcon = (name) => KINDS[kindOf(name)]?.icon ?? 'file';
const time = (ms) => (ms ? new Date(ms).toLocaleString() : '—');

function head(side, tabs, current, counts = {}) {
  return `<div class="panel-header panel-title" data-panel-head="${side}">
    ${icon(tabs.find(([id]) => id === current)?.[1] ?? 'menu')}<span class="panel-name">${escapeHtml(t(`panel.${current}`))}</span>
    <span class="panel-tabs" role="tablist">${tabs.map(([id, glyph]) => `<button class="panel-tab ${id === current ? 'active' : ''}" data-panel-tab="${side}:${id}" role="tab" aria-selected="${id === current}" title="${escapeHtml(t(`panel.${id}`))}">${icon(glyph)}${counts[id] ? `<i class="panel-badge">${counts[id]}</i>` : ''}</button>`).join('')}</span>
    <button class="icon-button panel-collapse" data-panel-collapse="${side}" title="${escapeHtml(t('panel.collapse'))}" aria-label="${escapeHtml(t('panel.collapse'))}">${icon(side === 'left' ? 'chevronLeft' : side === 'right' ? 'chevronRight' : 'chevronDown')}</button>
  </div>`;
}

/** A collapsed side panel: its tab icons in a column, and the expand button. */
function rail(side, tabs, counts = {}) {
  return `<div class="panel-rail-thin">
    <button class="icon-button" data-panel-expand="${side}" title="${escapeHtml(t('panel.expand'))}" aria-label="${escapeHtml(t('panel.expand'))}">${icon(side === 'left' ? 'chevronRight' : 'chevronLeft')}</button>
    ${tabs.map(([id, glyph]) => `<button class="icon-button rail-tab" data-panel-open="${side}:${id}" title="${escapeHtml(t(`panel.${id}`))}">${icon(glyph)}${counts[id] ? `<i class="panel-badge">${counts[id]}</i>` : ''}</button>`).join('')}
  </div>`;
}

// ───────────────────────── left

export function renderLeft(app, host) {
  const s = app.settings();
  if (!s.leftOpen) { host.innerHTML = rail('left', LEFT_TABS); return; }
  const tab = s.leftTab;
  let body = '';
  if (tab === 'explorer') body = explorerBody(app);
  else if (tab === 'outline') body = outlineBody(app);
  else body = documentsBody(app);
  host.innerHTML = head('left', LEFT_TABS, tab) + `<div class="panel-body">${body}</div>`;
}

function explorerBody(app) {
  const ex = app.state.explorer;
  if (!app.desktop) {
    return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('explorer.web'))}</span></p><div class="panel-actions"><button class="button small" data-command="open">${icon('folderOpen')}<span>${escapeHtml(t('action.open'))}</span></button></div>`;
  }
  const places = (ex.places ?? []).map((p) => `<button class="place ${ex.root && samePath(ex.root, p.path) ? 'active' : ''}" data-explorer-root="${escapeHtml(p.path)}" title="${escapeHtml(p.path)}">${icon(PLACE_ICONS[p.kind] ?? 'folder')}<span>${escapeHtml(p.kind === 'drive' || p.kind === 'root' ? p.name : t(`place.${p.kind}`, null, p.name))}</span></button>`).join('');
  const tools = `<div class="explorer-tools">
    <button class="icon-button" data-explorer="up" ${ex.root && dirName(ex.root) ? '' : 'disabled'} title="${escapeHtml(t('explorer.up'))}">${icon('folderUp')}</button>
    <button class="icon-button" data-explorer="choose" title="${escapeHtml(t('explorer.choose'))}">${icon('folderOpen')}</button>
    <button class="icon-button" data-explorer="docFolder" ${app.activeDoc()?.path && !app.activeDoc().web ? '' : 'disabled'} title="${escapeHtml(t('explorer.docFolder'))}">${icon('goTo')}</button>
    <button class="icon-button" data-explorer="refresh" title="${escapeHtml(t('explorer.refresh'))}">${icon('refresh')}</button>
    <button class="icon-button ${ex.showHidden ? 'active' : ''}" data-explorer="hidden" title="${escapeHtml(t('explorer.hidden'))}">${icon('eye')}</button>
    <button class="icon-button" data-explorer="collapseAll" title="${escapeHtml(t('explorer.collapseAll'))}">${icon('foldAll')}</button>
  </div>`;
  const tree = ex.root ? `<div class="explorer-path" title="${escapeHtml(ex.root)}">${icon('folder')}<span>${escapeHtml(ex.root)}</span></div><div class="explorer-tree" role="tree">${treeRows(app, ex.root, 0)}</div>` : `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('explorer.pick'))}</span></p>`;
  return `<div class="explorer-places">${places}</div>${tools}${tree}`;
}

function treeRows(app, dir, depth) {
  const ex = app.state.explorer;
  const entries = ex.cache.get(dir);
  if (!entries) { app.loadDir(dir); return `<div class="tree-row muted" style="--depth:${depth}">${icon('hourglass')}<span>${escapeHtml(t('explorer.loading'))}</span></div>`; }
  if (entries.error) return `<div class="tree-row danger-text" style="--depth:${depth}">${icon('error')}<span>${escapeHtml(entries.error)}</span></div>`;
  if (!entries.length) return `<div class="tree-row muted" style="--depth:${depth}"><span>${escapeHtml(t('explorer.empty'))}</span></div>`;
  const active = app.activeDoc()?.path;
  return entries.map((e) => {
    if (e.dir) {
      const open = ex.expanded.has(e.path);
      return `<div class="tree-row folder ${open ? 'open' : ''}" style="--depth:${depth}" data-tree-dir="${escapeHtml(e.path)}" role="treeitem" aria-expanded="${open}" title="${escapeHtml(e.path)}">${icon(open ? 'caretDown' : 'caretRight', 'icon tiny')}${icon('folder')}<span>${escapeHtml(e.name)}</span></div>${open ? treeRows(app, e.path, depth + 1) : ''}`;
    }
    return `<div class="tree-row file ${active && samePath(active, e.path) ? 'current' : ''}" style="--depth:${depth}" data-tree-file="${escapeHtml(e.path)}" role="treeitem" title="${escapeHtml(`${e.path}\n${formatSize(e.size)} · ${time(e.mtime)}`)}"><i class="tree-spacer"></i>${icon(fileIcon(e.name))}<span>${escapeHtml(e.name)}</span><small>${escapeHtml(formatSize(e.size))}</small></div>`;
  }).join('');
}

const samePath = (a, b) => String(a).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() === String(b).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();

function outlineBody(app) {
  const doc = app.activeDoc();
  const items = doc && isTextKind(doc.kind) && !app.state.showStart ? outlineOf(doc.kind, app.editor().text(doc)) : [];
  if (!items.length) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t(doc && doc.kind === 'text' ? 'outline.text' : 'outline.empty'))}</span></p>`;
  const min = Math.min(...items.map((item) => item.level));
  return `<div class="outline-list" role="tree">${items.map((item, index) => `<button class="outline-item level-${item.level}" style="--depth:${item.level - min}" data-outline-line="${item.line}" data-outline-index="${index}" role="treeitem" title="${escapeHtml(item.text)} — ${escapeHtml(t('status.line', { n: item.line }))}">${icon(item.level <= 1 ? 'heading1' : item.level === 2 ? 'heading2' : item.level === 3 ? 'heading3' : 'heading')}<span>${escapeHtml(item.text || '—')}</span></button>`).join('')}</div>`;
}

function documentsBody(app) {
  const docs = app.state.docs;
  if (!docs.length) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('documents.empty'))}</span></p>`;
  return `<div class="doc-list">${docs.map((doc) => `<div class="doc-row ${doc.id === app.state.activeId ? 'current' : ''} ${app.isDirty(doc) ? 'dirty' : ''}" data-tab="${doc.id}" title="${escapeHtml(doc.path ?? doc.name)}">${icon(KINDS[doc.kind]?.icon ?? 'file')}<span class="name">${escapeHtml(doc.name)}</span><span class="tab-dirty">●</span><small>${escapeHtml(doc.path && !doc.web ? dirName(doc.path) : t('status.new'))}</small><button class="tab-close" data-tab-close="${doc.id}" title="${escapeHtml(t('action.closeTab'))}">${icon('close')}</button></div>`).join('')}</div>`;
}

// ───────────────────────── right

export function renderRight(app, host) {
  const s = app.settings();
  const counts = { bookmarks: app.bookmarkLines().length || 0, search: app.state.search?.hits?.length || 0 };
  if (!s.rightOpen) { host.innerHTML = rail('right', RIGHT_TABS, counts); return; }
  const tab = s.rightTab;
  const body = tab === 'info' ? infoBody(app) : tab === 'bookmarks' ? bookmarksBody(app) : searchBody(app);
  host.innerHTML = head('right', RIGHT_TABS, tab, counts) + `<div class="panel-body">${body}</div>`;
}

const row = (glyph, label, value, attrs = '') => `<div class="info-row" ${attrs}><span class="info-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="info-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span></div>`;

function infoBody(app) {
  const doc = app.state.showStart ? null : app.activeDoc();
  if (!doc) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('info.none'))}</span></p>`;
  const info = app.docInfo(doc);
  const parts = [`<div class="info-name">${icon(KINDS[doc.kind]?.icon ?? 'file')}<b>${escapeHtml(doc.name)}</b></div>`];
  if (info.lineCounter) {
    const { line, lines, col, selectedLines } = info.lineCounter;
    parts.push(`<div class="line-counter" title="${escapeHtml(t('info.lineCounterTip'))}"><div><b>${line.toLocaleString()}</b><small>${escapeHtml(t('info.currentLine'))}</small></div><div><b>${lines.toLocaleString()}</b><small>${escapeHtml(t('info.totalLines'))}</small></div><div><b>${col.toLocaleString()}</b><small>${escapeHtml(t('info.column'))}</small></div>${selectedLines ? `<div><b>${selectedLines.toLocaleString()}</b><small>${escapeHtml(t('info.selectedLines'))}</small></div>` : ''}</div>`);
  }
  parts.push(`<h3 class="info-sub">${icon('file')}<span>${escapeHtml(t('info.document'))}</span></h3>`);
  parts.push(row('folder', t('info.location'), doc.path && !doc.web ? dirName(doc.path) : t('status.new')));
  parts.push(row('codeFile', t('info.kind'), t(`kind.${doc.kind}`)));
  if (info.syntax) parts.push(row('syntax', t('info.syntax'), info.syntax));
  if (isTextKind(doc.kind)) {
    parts.push(row('encoding', t('stats.encoding'), `${app.encodingLabel(doc.encoding)} · ${doc.eol.toUpperCase()}`));
    const st = info.stats;
    parts.push(`<h3 class="info-sub">${icon('wordCount')}<span>${escapeHtml(t('info.statistics'))}</span></h3>`);
    for (const [glyph, key, value] of [['wordCount', 'stats.words', st.words], ['textTool', 'stats.chars', st.chars], ['trimSpace', 'stats.noSpaces', st.noSpaces], ['notes', 'stats.paragraphs', st.paragraphs], ['clock', 'stats.reading', t('stats.minutes', { n: st.minutes })], ['bookmark', 'panel.bookmarks', app.bookmarkLines().length]]) parts.push(row(glyph, t(key), typeof value === 'number' ? value.toLocaleString() : value));
  } else if (doc.kind === 'hex') {
    parts.push(row('hexFile', t('info.bytes'), `${doc.bytes.length.toLocaleString()} (${formatSize(doc.bytes.length)})`));
  }
  const d = app.state.details.get(doc.path);
  if (doc.path && !doc.web && app.desktop) {
    parts.push(`<h3 class="info-sub">${icon('calendar')}<span>${escapeHtml(t('info.file'))}</span></h3>`);
    if (d) {
      parts.push(row('hexFile', t('info.size'), `${formatSize(d.size)} (${d.size.toLocaleString()} B)`));
      parts.push(row('calendar', t('info.created'), time(d.created)));
      parts.push(row('edit', t('info.modified'), time(d.modified)));
      parts.push(row('clock', t('info.accessed'), time(d.accessed)));
      parts.push(row('lock', t('info.attributes'), [d.readonly ? t('info.readonly') : '', d.hidden ? t('info.hidden') : ''].filter(Boolean).join(', ') || '—'));
    } else { app.loadDetails(doc.path); parts.push(`<p class="muted">${escapeHtml(t('explorer.loading'))}</p>`); }
  }
  const h = app.state.hashes.get(doc.path ?? `doc:${doc.id}`);
  parts.push(`<h3 class="info-sub">${icon('hashTool')}<span>${escapeHtml(t('info.hashes'))}</span><span class="grow"></span><button class="small-button" data-info="hashes">${icon('hashTool')}<span>${escapeHtml(t('info.computeHashes'))}</span></button></h3>`);
  if (h) for (const [name, value] of Object.entries(h)) parts.push(`<div class="hash-row"><b>${escapeHtml(name.toUpperCase())}</b><code title="${escapeHtml(value)}">${escapeHtml(value)}</code><button class="icon-button" data-copy="${escapeHtml(value)}" title="${escapeHtml(t('action.copy'))}">${icon('copy')}</button></div>`);
  parts.push(`<div class="panel-actions"><button class="button small" data-info="copyAll">${icon('copy')}<span>${escapeHtml(t('info.copyAll'))}</span></button></div>`);
  return parts.join('');
}

function bookmarksBody(app) {
  const doc = app.activeDoc();
  const lines = app.bookmarkLines();
  const tools = `<div class="explorer-tools">
    <button class="icon-button" data-command="bookmarkToggle" title="${escapeHtml(app.commandTip('bookmarkToggle'))}">${icon('bookmark')}</button>
    <button class="icon-button" data-command="bookmarkPrev" title="${escapeHtml(app.commandTip('bookmarkPrev'))}">${icon('bookmarkPrev')}</button>
    <button class="icon-button" data-command="bookmarkNext" title="${escapeHtml(app.commandTip('bookmarkNext'))}">${icon('bookmarkNext')}</button>
    <button class="icon-button" data-command="bookmarkClear" title="${escapeHtml(app.commandTip('bookmarkClear'))}">${icon('bookmarkClear')}</button></div>`;
  if (!doc || !isTextKind(doc.kind) || !lines.length) return `${tools}<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('bookmarks.empty'))}</span></p>`;
  const state = doc.state;
  return tools + `<div class="result-list">${lines.map((n) => `<button class="result-row" data-goto-line="${n}"><b>${n}</b><span>${escapeHtml(state.doc.line(n).text.trim().slice(0, 120) || '—')}</span></button>`).join('')}</div>`;
}

function searchBody(app) {
  if (!app.desktop) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('search.web'))}</span></p>`;
  const s = app.state.search;
  const form = `<form class="search-form" data-search-form>
    <div class="search-box">${icon('search')}<input name="query" value="${escapeHtml(s.query)}" placeholder="${escapeHtml(t('search.query'))}" /></div>
    <div class="search-box" title="${escapeHtml(t('search.folder'))}">${icon('folder')}<input name="dir" value="${escapeHtml(s.dir || app.state.explorer.root || '')}" placeholder="${escapeHtml(t('search.folder'))}" /><button type="button" class="icon-button" data-search="chooseDir" title="${escapeHtml(t('explorer.choose'))}">${icon('folderOpen')}</button></div>
    <div class="search-box" title="${escapeHtml(t('search.extensionsTip'))}">${icon('filter')}<input name="ext" value="${escapeHtml(s.ext)}" placeholder="md, html, txt" /></div>
    <div class="search-options"><label><input type="checkbox" name="caseSensitive" ${s.caseSensitive ? 'checked' : ''}/> ${escapeHtml(t('search.case'))}</label><label><input type="checkbox" name="wholeWord" ${s.wholeWord ? 'checked' : ''}/> ${escapeHtml(t('search.word'))}</label><span class="grow"></span><button class="button small primary" type="submit">${icon('findInFiles')}<span>${escapeHtml(t('search.run'))}</span></button></div>
  </form>`;
  if (s.busy) return `${form}<p class="panel-hint">${icon('hourglass')}<span>${escapeHtml(t('search.busy'))}</span></p>`;
  if (!s.hits) return form;
  const groups = new Map();
  for (const hit of s.hits) { if (!groups.has(hit.path)) groups.set(hit.path, []); groups.get(hit.path).push(hit); }
  const summary = `<p class="muted search-summary">${escapeHtml(t('search.summary', { hits: s.hits.length, files: groups.size, scanned: s.files }))}${s.truncated ? ` · ${escapeHtml(t('search.truncated'))}` : ''}</p>`;
  return form + summary + `<div class="result-list">${[...groups].map(([path, hits]) => `<div class="result-file" title="${escapeHtml(path)}">${icon(fileIcon(path))}<b>${escapeHtml(baseName(path))}</b><small>${hits.length}</small></div>${hits.map((h) => `<button class="result-row" data-search-hit="${escapeHtml(path)}" data-line="${h.line}" data-col="${h.column}"><b>${h.line}</b><span>${escapeHtml(h.text.trim())}</span></button>`).join('')}`).join('')}</div>`;
}

// ───────────────────────── bottom

export function renderBottom(app, host) {
  const s = app.settings();
  const problems = app.state.problems;
  const counts = { problems: problems.length, log: app.state.log.length };
  const tab = s.bottomTab;
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.filter((p) => p.severity === 'warning').length;
  const extra = tab === 'problems'
    ? `<span class="problem-counts">${icon('error', 'icon tiny')}${errors} ${icon('warning', 'icon tiny')}${warnings} ${icon('info', 'icon tiny')}${problems.length - errors - warnings}</span>`
    : `<button class="small-button" data-log="clear">${icon('clearHistory')}<span>${escapeHtml(t('log.clear'))}</span></button>`;
  const body = tab === 'problems' ? problemsBody(app) : logBody(app);
  host.innerHTML = head('bottom', BOTTOM_TABS, tab, counts).replace('<button class="icon-button panel-collapse"', `${extra}<button class="icon-button panel-collapse"`) + `<div class="panel-body">${body}</div>`;
}

function problemsBody(app) {
  const problems = app.state.problems;
  if (!problems.length) return `<p class="panel-hint">${icon('check')}<span>${escapeHtml(t(app.activeDoc() ? 'problems.none' : 'problems.noDoc'))}</span></p>`;
  return `<div class="problem-list">${problems.map((p) => `<button class="problem-row ${p.severity}" data-goto-line="${p.line}" data-goto-col="${p.col}">${icon(p.severity === 'error' ? 'error' : p.severity === 'warning' ? 'warning' : 'info')}<span class="problem-text">${escapeHtml(p.code === 'spelling' ? t('problem.spelling', { word: p.params.word }) : t(`problem.${p.code}`, p.params))}</span><small>${escapeHtml(t('problem.at', { line: p.line, col: p.col }))}</small></button>`).join('')}</div>`;
}

function logBody(app) {
  const log = app.state.log;
  if (!log.length) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('log.empty'))}</span></p>`;
  return `<div class="log-list">${[...log].reverse().map((e) => `<div class="log-row ${e.kind}">${icon(e.kind === 'error' ? 'error' : e.kind === 'success' ? 'check' : e.kind === 'warning' ? 'warning' : 'info')}<time>${escapeHtml(new Date(e.at).toLocaleTimeString())}</time><span>${escapeHtml(e.text)}</span></div>`).join('')}</div>`;
}

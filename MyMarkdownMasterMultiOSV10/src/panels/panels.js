// HTML of the side and bottom panels. Left: Files (the vault tree), Search, Bookmarks, Tags (nested, Bear
// style), Notes (a Bear / Ulysses list with excerpts, pinned first, smart filters). Right: Outline,
// Backlinks (linked and unlinked mentions), Outgoing links, Properties, Local graph, AI, Statistics.
// Bottom: Problems (unresolved links, front matter errors, style check), Messages, Information.
// Events are data-* attributes the app handles (app.js bindEvents).
import { getLanguage, t } from '../i18n.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import { extOf, fileNameOf, folderOf, isNote, kindOf, nameOf } from '../vault/index.js';

export const LEFT_TABS = [['files', 'filesList'], ['explorer', 'folderOpen'], ['search', 'search'], ['bookmarks', 'bookmark'], ['tags', 'tag'], ['notes', 'notesList']];
export const RIGHT_TABS = [['outline', 'structureTree'], ['backlinks', 'backlink'], ['outgoing', 'outLink'], ['properties', 'docProperties'], ['localgraph', 'graphView'], ['ai', 'aiSpark'], ['stats', 'wordCount']];
export const FILE_ICONS = { note: 'markdownFile', canvas: 'canvasFile', image: 'picture', audio: 'audioFile', video: 'tutorialVideo', pdf: 'pdfFile', base: 'csvFile', other: 'file' };
export const fileIcon = (path) => icon(FILE_ICONS[kindOf(path)] ?? 'file');
const h = escapeHtml;

const SORTS = {
  nameAsc: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
  nameDesc: (a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }),
  modifiedNew: (a, b) => (b.mtime ?? 0) - (a.mtime ?? 0),
  modifiedOld: (a, b) => (a.mtime ?? 0) - (b.mtime ?? 0),
  createdNew: (a, b) => (b.ctime ?? 0) - (a.ctime ?? 0),
  createdOld: (a, b) => (a.ctime ?? 0) - (b.ctime ?? 0),
};
export const SORT_ORDERS = Object.keys(SORTS);

/** The vault tree as nested { name, path, folder, children, file }. */
export function buildTree(index) {
  const root = { name: '', path: '', folder: true, children: new Map() };
  const ensure = (path) => {
    let node = root;
    for (const part of path.split('/').filter(Boolean)) {
      const p = node.path ? `${node.path}/${part}` : part;
      if (!node.children.has(part)) node.children.set(part, { name: part, path: p, folder: true, children: new Map(), mtime: 0, ctime: 0 });
      node = node.children.get(part);
    }
    return node;
  };
  for (const f of index.folders) ensure(f);
  for (const [path, info] of index.files) {
    const parent = ensure(folderOf(path));
    parent.children.set(fileNameOf(path), { name: fileNameOf(path), path, folder: false, mtime: info.mtime, ctime: info.ctime, size: info.size });
  }
  return root;
}

export function filesHtml(app) {
  const s = app.vaultPrefs();
  const index = app.index;
  if (!app.vault) return `<p class="panel-hint">${icon('info')}<span>${h(t('vault.none'))}</span></p>`;
  const expanded = new Set(s.expanded ?? []);
  const sort = SORTS[s.sort] ?? SORTS.nameAsc;
  const active = app.activePath();
  const filter = (app.state.fileFilter ?? '').toLowerCase();
  const showAll = app.settings().showAllFiles !== false;
  const rows = [];
  const walk = (node, depth) => {
    const kids = [...node.children.values()];
    const folders = kids.filter((k) => k.folder).sort(SORTS.nameAsc);
    const files = kids.filter((k) => !k.folder && (showAll || isNote(k.path) || ['canvas', 'base'].includes(extOf(k.path)))).sort(sort);
    for (const f of [...(s.foldersFirst === false ? [] : folders), ...(s.foldersFirst === false ? [...folders, ...files].sort(sort) : files)]) {
      if (filter && !f.folder && !f.path.toLowerCase().includes(filter)) continue;
      if (f.folder) {
        const open = expanded.has(f.path) || Boolean(filter);
        const count = [...f.children.values()].filter((c) => !c.folder).length;
        rows.push(`<div class="tree-row tree-folder ${open ? 'open' : ''}" data-tree-folder="${h(f.path)}" data-tree-path="${h(f.path)}" style="--depth:${depth}" title="${h(f.path)}">
          <span class="tree-twisty">${icon(open ? 'chevronDown' : 'chevronRight')}</span>${icon(open ? 'folderOpen' : 'folder')}<span class="tree-name">${h(f.name)}</span><span class="tree-count">${count || ''}</span></div>`);
        if (open) walk(f, depth + 1);
      } else {
        const name = isNote(f.path) && s.hideExtensions !== false ? nameOf(f.path) : f.name;
        const pinned = (app.vaultPrefs().pinned ?? []).includes(f.path);
        rows.push(`<div class="tree-row tree-file ${f.path === active ? 'active' : ''} ${app.isDirty(f.path) ? 'dirty' : ''}" data-tree-file="${h(f.path)}" data-tree-path="${h(f.path)}" style="--depth:${depth}" title="${h(f.path)}">
          <span class="tree-twisty"></span>${fileIcon(f.path)}<span class="tree-name">${h(name)}</span>${isNote(f.path) ? '' : `<span class="tree-ext">${h(extOf(f.path))}</span>`}${pinned ? icon('pin', 'icon tiny') : ''}</div>`);
      }
    }
  };
  walk(buildTree(index), 0);
  const tools = [['newNote', 'fileNew'], ['newFolder', 'folderAdd'], ['newCanvas', 'canvasFile'], ['fileSort', 'sortAsc'], ['collapseAll', 'collapseAll'], ['revealActive', 'locate']];
  return `<div class="panel-tools">${tools.map(([id, glyph]) => `<button class="icon-button" data-command="${id}" title="${h(app.commandTip(id))}">${icon(glyph)}</button>`).join('')}
      <label class="search-box mini">${icon('filter')}<input type="search" data-file-filter value="${h(app.state.fileFilter ?? '')}" placeholder="${h(t('files.filter'))}" /></label></div>
    <div class="tree" data-tree-root role="tree" tabindex="0">${rows.join('') || `<p class="panel-hint">${icon('info')}<span>${h(t('files.empty'))}</span></p>`}</div>`;
}

export function searchHtml(app) {
  const st = app.state.search;
  const results = st.results ?? [];
  const options = `<div class="search-options">
      <label class="check-row" title="${h(t('search.matchCaseTip'))}"><input type="checkbox" data-search-opt="matchCase" ${st.matchCase ? 'checked' : ''} /><span>Aa</span></label>
      <label class="check-row"><input type="checkbox" data-search-opt="explain" ${st.explain ? 'checked' : ''} /><span>${h(t('search.explain'))}</span></label>
      <select data-search-sort data-icon="sortAsc">${['relevance', 'nameAsc', 'nameDesc', 'modifiedNew'].map((k) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${h(t(`sort.${k}`))}</option>`).join('')}</select>
      <button class="icon-button" data-search-collapse title="${h(t('search.collapse'))}">${icon(st.collapsed ? 'expandAll' : 'collapseAll')}</button></div>`;
  const help = st.explain ? `<div class="search-help">${['file:', 'path:', 'content:', 'tag:#', 'line:( )', 'block:( )', 'section:( )', 'task:', 'task-todo:', 'task-done:', 'match-case:', '[property:value]', '"phrase"', '-exclude', 'a OR b', '/regex/'].map((op) => `<button class="chip" data-search-insert="${h(op)}">${h(op)}</button>`).join('')}<p class="muted">${h(t('search.help'))}</p></div>` : '';
  const sorted = [...results];
  if (st.sort === 'nameAsc') sorted.sort((a, b) => a.path.localeCompare(b.path));
  if (st.sort === 'nameDesc') sorted.sort((a, b) => b.path.localeCompare(a.path));
  if (st.sort === 'modifiedNew') sorted.sort((a, b) => (app.index.file(b.path)?.mtime ?? 0) - (app.index.file(a.path)?.mtime ?? 0));
  const list = sorted.map((r) => `<div class="search-result ${st.collapsed ? 'collapsed' : ''}">
      <div class="search-file" data-open-path="${h(r.path)}">${fileIcon(r.path)}<span class="tree-name">${h(isNote(r.path) ? nameOf(r.path) : fileNameOf(r.path))}</span><span class="path">${h(folderOf(r.path))}</span><span class="tree-count">${r.matches.length || ''}</span></div>
      ${st.collapsed ? '' : r.matches.map((m) => `<div class="search-match" data-open-path="${h(r.path)}" data-line="${m.line}" data-col="${m.col}" data-len="${m.len}">${markHit(m)}</div>`).join('')}</div>`).join('');
  return `<div class="panel-tools"><label class="search-box wide">${icon('search')}<input type="search" data-search-input value="${h(st.query ?? '')}" placeholder="${h(t('search.placeholder'))}" /></label></div>${options}${help}
    <div class="search-summary muted">${st.query ? h(t('search.count', { n: results.length })) : ''}${st.query && results.length ? ` <button class="small-button" data-command="copySearchResults">${icon('copy')}<span>${h(t('search.copy'))}</span></button>` : ''}</div>
    <div class="search-results">${list}</div>`;
}

function markHit(m) {
  // col / len are UTF-16 units, which is how JavaScript strings index too.
  const s = m.text ?? '';
  const start = Math.max(0, m.col - 40);
  const pre = s.slice(start, m.col);
  const hit = s.slice(m.col, m.col + m.len);
  const post = s.slice(m.col + m.len, m.col + m.len + 80);
  return `<span class="line-no">${m.line + 1}</span><span>${start > 0 ? '…' : ''}${h(pre)}<mark>${h(hit)}</mark>${h(post)}</span>`;
}

export function bookmarksHtml(app) {
  const list = app.vaultPrefs().bookmarks ?? [];
  const rows = list.map((b, i) => `<div class="tree-row bookmark" data-bookmark="${i}" title="${h(b.path ?? b.query ?? '')}" style="--depth:0">
      ${icon(b.type === 'search' ? 'search' : b.type === 'heading' ? 'heading1' : fileIconName(b.path))}<span class="tree-name">${h(b.title || (b.type === 'search' ? b.query : nameOf(b.path ?? '')))}</span>
      <span class="tree-ext">${h(b.subpath ?? '')}</span><button class="icon-button mini" data-bookmark-remove="${i}" title="${h(t('bookmarks.remove'))}">${icon('close')}</button></div>`).join('');
  return `<div class="panel-tools"><button class="small-button" data-command="bookmarkActive">${icon('bookmarkAdd')}<span>${h(t('bookmarks.addActive'))}</span></button><button class="small-button" data-command="bookmarkSearch">${icon('search')}<span>${h(t('bookmarks.addSearch'))}</span></button></div>
    <div class="tree">${rows || `<p class="panel-hint">${icon('info')}<span>${h(t('bookmarks.empty'))}</span></p>`}</div>`;
}
const fileIconName = (path) => FILE_ICONS[kindOf(path ?? '')] ?? 'file';

/** Nested tags (a/b/c) as a tree with counts; click searches, Bear style. */
export function tagsHtml(app) {
  const tags = app.index.tags();
  const root = { children: new Map(), count: 0 };
  for (const tg of tags) {
    let node = root;
    const parts = tg.tag.replace(/^#/, '').split('/');
    parts.forEach((part, i) => {
      if (!node.children.has(part.toLowerCase())) node.children.set(part.toLowerCase(), { name: part, full: `#${parts.slice(0, i + 1).join('/')}`, children: new Map(), count: 0 });
      node = node.children.get(part.toLowerCase());
      node.count += tg.count;
    });
  }
  const open = new Set(app.vaultPrefs().openTags ?? []);
  const sort = app.vaultPrefs().tagSort ?? 'name';
  const rows = [];
  const walk = (node, depth) => {
    const kids = [...node.children.values()].sort(sort === 'count' ? (a, b) => b.count - a.count : (a, b) => a.name.localeCompare(b.name));
    for (const k of kids) {
      const isOpen = open.has(k.full);
      rows.push(`<div class="tree-row tag-row" data-tag-search="${h(k.full)}" style="--depth:${depth}">${k.children.size ? `<span class="tree-twisty" data-tag-toggle="${h(k.full)}">${icon(isOpen ? 'chevronDown' : 'chevronRight')}</span>` : '<span class="tree-twisty"></span>'}${icon('tag')}<span class="tree-name">${h(k.name)}</span><span class="tree-count">${k.count}</span></div>`);
      if (isOpen) walk(k, depth + 1);
    }
  };
  walk(root, 0);
  return `<div class="panel-tools"><select data-tag-sort data-icon="sortAsc"><option value="name" ${sort === 'name' ? 'selected' : ''}>${h(t('tags.sortName'))}</option><option value="count" ${sort === 'count' ? 'selected' : ''}>${h(t('tags.sortCount'))}</option></select><span class="muted">${h(t('tags.count', { n: tags.length }))}</span></div>
    <div class="tree">${rows.join('') || `<p class="panel-hint">${icon('info')}<span>${h(t('tags.empty'))}</span></p>`}</div>`;
}

/** Smart filters (Bear): all, pinned, todo, today, untagged, orphans; then the notes with excerpts. */
export const NOTE_FILTERS = [['all', 'notesList'], ['pinned', 'pin'], ['todo', 'checkAll'], ['today', 'calendar'], ['untagged', 'tagOff'], ['orphans', 'unlink'], ['archive', 'archive']];
export function notesHtml(app) {
  const prefs = app.vaultPrefs();
  const filter = app.state.noteFilter ?? 'all';
  const pinned = new Set(prefs.pinned ?? []);
  const archive = (prefs.archiveFolder ?? 'Archive').toLowerCase();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const orphans = filter === 'orphans' ? new Set(app.index.orphans()) : null;
  let paths = app.index.notePaths().filter((p) => filter === 'archive' ? p.toLowerCase().startsWith(`${archive}/`) : !p.toLowerCase().startsWith(`${archive}/`));
  paths = paths.filter((p) => {
    const m = app.index.meta(p);
    if (filter === 'pinned') return pinned.has(p);
    if (filter === 'todo') return (m?.tasks ?? []).some((x) => x.status === ' ');
    if (filter === 'today') return (app.index.file(p)?.mtime ?? 0) >= startOfDay.getTime();
    if (filter === 'untagged') return !(m?.tags ?? []).length;
    if (filter === 'orphans') return orphans.has(p);
    return true;
  });
  const q = (app.state.noteQuery ?? '').toLowerCase();
  if (q) paths = paths.filter((p) => p.toLowerCase().includes(q) || (app.excerpt(p) ?? '').toLowerCase().includes(q));
  paths.sort((a, b) => (pinned.has(b) - pinned.has(a)) || ((app.index.file(b)?.mtime ?? 0) - (app.index.file(a)?.mtime ?? 0)));
  const active = app.activePath();
  const fmt = new Intl.DateTimeFormat(getLanguage() === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'medium' });
  const cards = paths.slice(0, 400).map((p) => {
    const m = app.index.meta(p);
    const todo = (m?.tasks ?? []).filter((x) => x.status === ' ').length;
    const done = (m?.tasks ?? []).length - todo;
    return `<div class="note-card ${p === active ? 'active' : ''}" data-open-path="${h(p)}" title="${h(p)}">
      <div class="note-card-title">${pinned.has(p) ? icon('pin', 'icon tiny') : ''}<b>${h(nameOf(p))}</b><span class="grow"></span><span class="muted">${h(fmt.format(new Date(app.index.file(p)?.mtime || Date.now())))}</span></div>
      <div class="note-card-excerpt">${h(app.excerpt(p) ?? '')}</div>
      <div class="note-card-meta">${(m?.tags ?? []).slice(0, 4).map((tg) => `<span class="tag-pill">${h(tg)}</span>`).join('')}${todo + done ? `<span class="task-count">${icon('checkAll', 'icon tiny')}${done}/${todo + done}</span>` : ''}${folderOf(p) ? `<span class="muted">${icon('folder', 'icon tiny')}${h(folderOf(p))}</span>` : ''}</div></div>`;
  }).join('');
  return `<div class="note-filters" role="tablist">${NOTE_FILTERS.map(([id, glyph]) => `<button class="chip ${filter === id ? 'active' : ''}" data-note-filter="${id}" title="${h(t(`notes.filter.${id}`))}">${icon(glyph)}<span>${h(t(`notes.filter.${id}`))}</span></button>`).join('')}</div>
    <div class="panel-tools"><label class="search-box wide">${icon('filter')}<input type="search" data-note-query value="${h(app.state.noteQuery ?? '')}" placeholder="${h(t('notes.filter'))}" /></label></div>
    <div class="note-cards">${cards || `<p class="panel-hint">${icon('info')}<span>${h(t('notes.empty'))}</span></p>`}</div>`;
}

// ───────────────────────── right panel

export function outlineHtml(app) {
  const path = app.activePath();
  const m = path ? app.index.meta(path) : null;
  if (!m) return `<p class="panel-hint">${icon('info')}<span>${h(t('outline.none'))}</span></p>`;
  const current = app.currentHeadingLine?.();
  const folded = new Set(app.state.outlineFolded ?? []);
  const rows = [];
  let hideBelow = 99;
  for (const [i, hd] of (m.headings ?? []).entries()) {
    if (hd.level > hideBelow) continue;
    hideBelow = 99;
    const hasKids = (m.headings[i + 1]?.level ?? 0) > hd.level;
    const isFolded = folded.has(`${path}:${hd.line}`);
    if (isFolded) hideBelow = hd.level;
    rows.push(`<div class="tree-row outline-row ${current === hd.line ? 'active' : ''}" data-goto-line="${hd.line}" style="--depth:${hd.level - 1}" title="${h(hd.text)}">${hasKids ? `<span class="tree-twisty" data-outline-fold="${hd.line}">${icon(isFolded ? 'chevronRight' : 'chevronDown')}</span>` : '<span class="tree-twisty"></span>'}<span class="outline-level">H${hd.level}</span><span class="tree-name">${h(hd.text)}</span></div>`);
  }
  return `<div class="tree">${rows.join('') || `<p class="panel-hint">${icon('info')}<span>${h(t('outline.empty'))}</span></p>`}</div>`;
}

export function backlinksHtml(app) {
  const path = app.activePath();
  if (!path) return `<p class="panel-hint">${icon('info')}<span>${h(t('backlinks.none'))}</span></p>`;
  const linked = app.index.backlinks(path);
  const unlinked = app.state.unlinked?.path === path ? app.state.unlinked.list : null;
  const section = (title, glyph, groups, kind) => `<details class="panel-section" open><summary>${icon(glyph)}<span>${h(title)}</span><span class="tree-count">${groups?.length ?? '…'}</span></summary>
    ${(groups ?? []).map((g) => `<div class="backlink-group"><div class="search-file" data-open-path="${h(g.from)}">${fileIcon(g.from)}<span class="tree-name">${h(nameOf(g.from))}</span><span class="path">${h(folderOf(g.from))}</span>${kind === 'unlinked' ? `<button class="small-button" data-link-mention="${h(g.from)}" title="${h(t('backlinks.linkAllTip'))}">${icon('hyperlink')}<span>${h(t('backlinks.link'))}</span></button>` : ''}</div>
      ${(g.links ?? g.hits).map((l) => `<div class="search-match" data-open-path="${h(g.from)}" data-line="${l.line}" data-col="${l.col}" data-len="${l.len}"><span class="line-no">${l.line + 1}</span><span>${h(app.lineText(g.from, l.line) ?? l.text ?? l.raw ?? '')}</span></div>`).join('')}</div>`).join('') || `<p class="panel-hint muted">${h(t('backlinks.empty'))}</p>`}</details>`;
  return section(t('backlinks.linked'), 'backlink', linked, 'linked') + section(t('backlinks.unlinked'), 'unlink', unlinked, 'unlinked');
}

export function outgoingHtml(app) {
  const path = app.activePath();
  if (!path) return `<p class="panel-hint">${icon('info')}<span>${h(t('backlinks.none'))}</span></p>`;
  const links = app.index.outgoing(path).filter((l) => l.target);
  const resolved = new Map();
  const missing = new Map();
  for (const l of links) (l.resolved ? resolved : missing).set(l.resolved ?? l.target, l);
  const row = (key, l, ok) => `<div class="tree-row" ${ok ? `data-open-path="${h(key)}"` : `data-create-note="${h(key)}"`} style="--depth:0" title="${h(key)}">${ok ? fileIcon(key) : icon('fileNew')}<span class="tree-name ${ok ? '' : 'unresolved'}">${h(ok ? (isNote(key) ? nameOf(key) : fileNameOf(key)) : key)}</span>${l.embed ? `<span class="tree-ext">${h(t('links.embed'))}</span>` : ''}</div>`;
  return `<details class="panel-section" open><summary>${icon('outLink')}<span>${h(t('links.resolved'))}</span><span class="tree-count">${resolved.size}</span></summary>${[...resolved].map(([k, l]) => row(k, l, true)).join('')}</details>
    <details class="panel-section" open><summary>${icon('unlink')}<span>${h(t('links.unresolved'))}</span><span class="tree-count">${missing.size}</span></summary>${[...missing].map(([k, l]) => row(k, l, false)).join('')}</details>`;
}

/** The active note's properties (editable) and every property name in the vault. */
export function propertiesPanelHtml(app) {
  const path = app.activePath();
  const fm = path ? app.index.meta(path)?.frontmatter ?? {} : null;
  const all = app.index.properties();
  const mine = fm ? `<details class="panel-section" open><summary>${icon('docProperties')}<span>${h(t('props.thisNote'))}</span><span class="tree-count">${Object.keys(fm).length}</span></summary>${propertyRows(path, fm)}<div class="panel-tools"><button class="small-button" data-prop-add="${h(path)}">${icon('plus')}<span>${h(t('props.add'))}</span></button></div></details>` : '';
  return `${mine}<details class="panel-section" open><summary>${icon('csvFile')}<span>${h(t('props.all'))}</span><span class="tree-count">${all.length}</span></summary>
    ${all.map((p) => `<div class="tree-row" data-search-property="${h(p.key)}" style="--depth:0">${icon(PROP_ICONS[p.type] ?? 'editorText')}<span class="tree-name">${h(p.key)}</span><span class="tree-ext">${h(t(`props.type.${p.type}`))}</span><span class="tree-count">${p.count}</span></div>`).join('')}</details>`;
}
export const PROP_ICONS = { text: 'editorText', list: 'notesList', number: 'numbering', checkbox: 'checkAll', date: 'calendar', datetime: 'clock' };
export function propertyRows(path, fm) {
  return `<div class="prop-table">${Object.entries(fm).map(([k, v]) => {
    const type = Array.isArray(v) ? 'list' : typeof v === 'boolean' ? 'checkbox' : typeof v === 'number' ? 'number' : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? 'date' : 'text';
    const input = type === 'checkbox' ? `<input type="checkbox" data-prop-key="${h(k)}" data-prop-path="${h(path)}" data-prop-type="checkbox" ${v ? 'checked' : ''} />`
      : type === 'date' ? `<input type="date" data-prop-key="${h(k)}" data-prop-path="${h(path)}" data-prop-type="date" value="${h(String(v))}" />`
      : type === 'number' ? `<input type="number" data-prop-key="${h(k)}" data-prop-path="${h(path)}" data-prop-type="number" value="${h(String(v))}" />`
      : `<input type="text" data-prop-key="${h(k)}" data-prop-path="${h(path)}" data-prop-type="${type}" value="${h(type === 'list' ? v.join(', ') : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))}" />`;
    return `<div class="prop-row">${icon(PROP_ICONS[type])}<span class="prop-key" title="${h(k)}">${h(k)}</span>${input}<button class="icon-button mini" data-prop-remove="${h(k)}" data-prop-path="${h(path)}" title="${h(t('props.remove'))}">${icon('close')}</button></div>`;
  }).join('')}</div>`;
}

export function statsHtml(app) {
  const st = app.state.stats;
  const path = app.activePath();
  if (!path || !st) return `<p class="panel-hint">${icon('info')}<span>${h(t('stats.none'))}</span></p>`;
  const goal = app.vaultPrefs().goals?.[path] ?? 0;
  const pct = goal ? Math.min(100, Math.round((st.words / goal) * 100)) : 0;
  const minutes = (m) => (m < 1 ? t('stats.lessMinute') : t('stats.minutes', { n: Math.round(m) }));
  const rows = [
    ['wordCount', 'stats.words', st.words.toLocaleString()], ['font', 'stats.chars', st.chars.toLocaleString()], ['font', 'stats.charsNoSpaces', st.charsNoSpaces.toLocaleString()],
    ['notesList', 'stats.sentences', st.sentences], ['editorText', 'stats.paragraphs', st.paragraphs], ['heading1', 'stats.headings', st.headings], ['hyperlink', 'stats.links', st.links],
    ['checkAll', 'stats.tasks', `${st.tasksDone}/${st.tasks}`], ['clock', 'stats.reading', minutes(st.readingMinutes)], ['microphone', 'stats.speaking', minutes(st.speakingMinutes)],
    ['numbering', 'stats.avgSentence', st.averageSentenceWords.toFixed(1)], ['warning', 'stats.longest', st.longestSentenceWords],
  ];
  return `<div class="stats-grid">${rows.map(([glyph, key, value]) => `<div class="stat">${icon(glyph)}<span>${h(t(key))}</span><b>${h(String(value))}</b></div>`).join('')}</div>
    <details class="panel-section" open><summary>${icon('target')}<span>${h(t('goal.title'))}</span></summary>
      <div class="goal-row"><input type="number" min="0" step="50" data-goal-input value="${goal || ''}" placeholder="${h(t('goal.placeholder'))}" /><span class="muted">${h(t('goal.words'))}</span></div>
      ${goal ? `<div class="goal-bar" title="${pct}%"><span style="width:${pct}%"></span></div><p class="muted">${h(t('goal.progress', { words: st.words, goal, pct }))}</p>` : ''}
    </details>
    <details class="panel-section" open><summary>${icon('spellCheck')}<span>${h(t('style.title'))}</span><span class="tree-count">${app.state.styleIssues?.length ?? 0}</span></summary>
      <div class="panel-tools"><button class="small-button" data-command="styleCheck">${icon(app.settings().showStyleCheck ? 'eye' : 'eyeOff')}<span>${h(t(app.settings().showStyleCheck ? 'style.hide' : 'style.show'))}</span></button></div>
      ${countKinds(app.state.styleIssues ?? []).map(([k, n]) => `<div class="tree-row" data-style-kind="${k}" style="--depth:0">${icon('warning')}<span class="tree-name">${h(t(`style.kind.${k}`))}</span><span class="tree-count">${n}</span></div>`).join('')}
    </details>`;
}
const countKinds = (issues) => [...issues.reduce((m, i) => m.set(i.kind, (m.get(i.kind) ?? 0) + 1), new Map())];

// ───────────────────────── bottom panel

export function problemsHtml(app) {
  const list = app.state.problems ?? [];
  if (!list.length) return `<div class="problems-empty">${icon('check')}<span>${h(t('problems.none'))}</span></div>`;
  return list.map((p, i) => `<div class="problem-row sev-${p.severity}" data-problem="${i}">${icon(p.severity === 'error' ? 'error' : p.severity === 'warning' ? 'warning' : 'info')}<span class="problem-text">${h(p.text)}</span><span class="path">${h(p.path)}${p.line != null ? `:${p.line + 1}` : ''}</span></div>`).join('');
}

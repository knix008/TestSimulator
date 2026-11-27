// The left panel's Explorer tab: Favorites (folders and notes the user pinned, from the vault or anywhere on
// disk), the user's home and the usual places, the drives, and a lazily expanded folder tree from the Rust
// backend (explorer_places / explorer_list). A folder opens as a vault; a note opens in place when it is in
// the open vault, else its folder becomes the vault. On the web only Favorites of the open vault are shown.
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml as h } from '../ui/dom.js';

const sizeText = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
const PLACE_ICON = { home: 'home', desktop: 'monitor', documents: 'folder', downloads: 'download', pictures: 'image', drive: 'drive' };
const sep = (p) => (p.includes('\\') ? '\\' : '/');
const baseName = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
const parentOf = (p) => { const s = String(p).replace(/[\\/]+$/, ''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i > 0 ? s.slice(0, i + (s[i - 1] === ':' ? 1 : 0)) : s; };
const same = (a, b) => String(a).replace(/[\\/]+$/, '').toLowerCase() === String(b).replace(/[\\/]+$/, '').toLowerCase();

/**
 * app: { desktop, native, settings(), updateSettings(patch), vault() → Vault|null, openVaultAt(dir, file?), openFile(rel),
 *        notify(kind, text), redraw() }
 */
export function createExplorer(app) {
  const st = { places: null, expanded: new Set(), lists: new Map(), loading: new Set(), errors: new Map(), selected: null };

  const favorites = () => (app.settings().favorites ?? []).filter((f) => f && f.path);
  const isFavorite = (entry) => favorites().some((f) => same(f.path, entry.path) && (f.vault ?? null) === (entry.vault ?? null));

  async function loadPlaces() {
    if (!app.desktop || st.places) return;
    st.places = [];
    try { st.places = await app.native.invoke('explorer_places'); } catch (error) { st.errors.set('places', String(error?.message ?? error)); }
    app.redraw();
  }

  async function load(dir) {
    if (st.loading.has(dir)) return;
    st.loading.add(dir);
    try { st.lists.set(dir, await app.native.invoke('explorer_list', { path: dir, showHidden: Boolean(app.settings().explorerHidden) })); st.errors.delete(dir); }
    catch (error) { st.errors.set(dir, String(error?.message ?? error)); }
    st.loading.delete(dir);
    app.redraw();
  }

  function toggle(dir) {
    if (st.expanded.has(dir)) st.expanded.delete(dir);
    else { st.expanded.add(dir); if (!st.lists.has(dir)) load(dir); }
    app.redraw();
  }

  const rowAttrs = (entry, depth) => `data-xp-path="${h(entry.path)}" data-xp-dir="${entry.dir ? 1 : 0}" ${entry.vault ? `data-xp-vault="${h(entry.vault)}"` : ''} style="--depth:${depth}" title="${h(entry.path)}"`;

  function treeRows(dir, depth) {
    const list = st.lists.get(dir);
    if (st.errors.has(dir)) return `<div class="tree-row xp-note" style="--depth:${depth}">${icon('warning')}<span class="tree-name">${h(t('explorer.cannotRead'))}</span></div>`;
    if (!list) return `<div class="tree-row xp-note" style="--depth:${depth}">${icon('recent')}<span class="tree-name">${h(t('explorer.loading'))}</span></div>`;
    const shown = list;
    if (!shown.length) return `<div class="tree-row xp-note" style="--depth:${depth}">${icon('info')}<span class="tree-name">${h(t('explorer.empty'))}</span></div>`;
    return shown.map((e) => {
      if (e.dir) {
        const open = st.expanded.has(e.path);
        return `<div class="tree-row tree-folder xp-row ${open ? 'open' : ''} ${isFavorite(e) ? 'fav' : ''}" ${rowAttrs(e, depth)}><span class="tree-twisty">${icon(open ? 'chevronDown' : 'chevronRight')}</span>${icon(open ? 'folderOpen' : 'folder')}<span class="tree-name">${h(e.name)}</span>${isFavorite(e) ? icon('star', 'icon xp-star') : ''}</div>${open ? treeRows(e.path, depth + 1) : ''}`;
      }
      const open = app.isOpen?.(e.path);
      return `<div class="tree-row tree-file xp-row xp-noteFile ${open ? 'active' : ''} ${isFavorite(e) ? 'fav' : ''}" ${rowAttrs(e, depth)}><span class="tree-twisty"></span>${icon('hexFile')}<span class="tree-name">${h(e.name)}</span><span class="tree-ext">${h(sizeText(e.size))}</span>${isFavorite(e) ? icon('star', 'icon xp-star') : ''}</div>`;
    }).join('');
  }

  function section(id, glyph, title, body, count = '') {
    const open = !(app.settings().explorerFolded ?? []).includes(id);
    return `<details class="panel-section xp-section" data-xp-section="${id}" ${open ? 'open' : ''}><summary>${icon(glyph)}<span>${h(title)}</span><span class="tree-count">${count}</span></summary>${body}</details>`;
  }

  function html() {
    loadPlaces();
    const favs = favorites();
    const favRows = favs.length ? favs.map((f) => {
      const entry = { path: f.path, dir: Boolean(f.dir), vault: f.vault ?? null };
      const open = entry.dir && !entry.vault && st.expanded.has(entry.path);
      return `<div class="tree-row xp-row xp-fav ${entry.dir ? 'tree-folder' : 'tree-file'} ${open ? 'open' : ''}" ${rowAttrs(entry, 0)} data-xp-fav="1"><span class="tree-twisty">${entry.dir && !entry.vault ? icon(open ? 'chevronDown' : 'chevronRight') : ''}</span>${icon(entry.dir ? 'folderStar' : 'star')}<span class="tree-name">${h(f.name || baseName(f.path))}</span>${f.vault ? `<span class="tree-ext">${h(f.vault)}</span>` : ''}</div>${open ? treeRows(entry.path, 1) : ''}`;
    }).join('') : `<div class="tree-row xp-note" style="--depth:0">${icon('info')}<span class="tree-name">${h(t('explorer.noFavorites'))}</span></div>`;
    const parts = [section('favorites', 'star', t('explorer.favorites'), favRows, favs.length || '')];
    if (app.desktop) {
      const places = st.places ?? [];
      const home = places.filter((p) => p.id !== 'drive');
      const drives = places.filter((p) => p.id === 'drive');
      const placeRows = (list) => list.map((p) => {
        const open = st.expanded.has(p.path);
        const entry = { path: p.path, dir: true };
        return `<div class="tree-row tree-folder xp-row xp-place ${open ? 'open' : ''}" ${rowAttrs(entry, 0)}><span class="tree-twisty">${icon(open ? 'chevronDown' : 'chevronRight')}</span>${icon(PLACE_ICON[p.id] ?? 'folder')}<span class="tree-name">${h(p.id === 'home' ? `${t('explorer.home')} (${p.name})` : t(`explorer.place.${p.id}`) === `explorer.place.${p.id}` ? p.name : p.id === 'drive' ? p.name : t(`explorer.place.${p.id}`))}</span>${isFavorite(entry) ? icon('star', 'icon xp-star') : ''}</div>${open ? treeRows(p.path, 1) : ''}`;
      }).join('');
      parts.push(section('home', 'home', t('explorer.homeSection'), st.places ? placeRows(home) : `<div class="tree-row xp-note">${icon('recent')}<span class="tree-name">${h(t('explorer.loading'))}</span></div>`, home.length || ''));
      parts.push(section('drives', 'drive', t('explorer.drives'), placeRows(drives), drives.length || ''));
    } else {
      parts.push(`<p class="panel-hint">${icon('info')}<span>${h(t('explorer.webOnly'))}</span></p><div class="panel-tools"><button class="button small primary" data-command="open" title="${h(t('action.open'))}">${icon('folderOpen')}<span>${h(t('action.open'))}</span></button><button class="button small" data-command="newFile" title="${h(t('action.newFile'))}">${icon('fileNew')}<span>${h(t('action.newFile'))}</span></button></div>`);
    }
    const docs = app.openDocs?.() ?? [];
    parts.push(section('open', 'hexFile', t('explorer.openDocs'), docs.length ? docs.map((d) => `<div class="tree-row tree-file xp-doc ${d.active ? 'active' : ''}" data-xp-tab="${h(d.tab)}" style="--depth:0" title="${h(d.path ?? d.name)}"><span class="tree-twisty"></span>${icon(d.icon)}<span class="tree-name">${h(d.name)}${d.modified ? ' ●' : ''}</span><span class="tree-ext">${h(sizeText(d.len))}</span></div>`).join('') : `<div class="tree-row xp-note" style="--depth:0">${icon('info')}<span class="tree-name">${h(t('explorer.noDocs'))}</span></div>`, docs.length || ''));
    const tools = `<div class="panel-tools"><button class="icon-button" data-xp-action="refresh" title="${h(t('explorer.refresh'))}">${icon('refresh')}</button><button class="icon-button ${app.settings().explorerHidden ? 'active' : ''}" data-xp-action="hidden" title="${h(t('explorer.hidden'))}" aria-pressed="${Boolean(app.settings().explorerHidden)}">${icon('eye')}</button><button class="icon-button" data-xp-action="collapse" title="${h(t('files.collapseAll'))}">${icon('collapseAll')}</button></div>`;
    return `${tools}<div class="tree xp-tree">${parts.join('')}</div>`;
  }

  /** Opens a file in a hex tab (a folder opens in the tree). */
  async function open(entry, options = {}) {
    if (entry.dir) { toggle(entry.path); return undefined; }
    return app.openFile(entry.path, options);
  }

  function setFavorite(entry, on) {
    const list = favorites().filter((f) => !(same(f.path, entry.path) && (f.vault ?? null) === (entry.vault ?? null)));
    if (on) list.push({ path: entry.path, dir: Boolean(entry.dir), name: entry.name || baseName(entry.path), vault: entry.vault ?? null });
    app.updateSettings({ favorites: list });
    app.notify('success', t(on ? 'explorer.favoriteAdded' : 'explorer.favoriteRemoved', { name: entry.name || baseName(entry.path) }));
  }

  const entryOf = (row) => ({ path: row.dataset.xpPath, dir: row.dataset.xpDir === '1', vault: row.dataset.xpVault || null, name: row.querySelector('.tree-name')?.textContent ?? '' });

  /** A click in the panel: true when it was the explorer's. */
  function click(target) {
    const action = target.closest('[data-xp-action]');
    if (action) {
      const a = action.dataset.xpAction;
      if (a === 'refresh') { st.lists.clear(); st.places = null; for (const dir of st.expanded) load(dir); app.redraw(); }
      else if (a === 'allFiles') app.updateSettings({ explorerAllFiles: !app.settings().explorerAllFiles });
      else if (a === 'hidden') { app.updateSettings({ explorerHidden: !app.settings().explorerHidden }); st.lists.clear(); for (const dir of st.expanded) load(dir); }
      else if (a === 'collapse') { st.expanded.clear(); app.redraw(); }
      return true;
    }
    const summary = target.closest('.xp-section > summary');
    if (summary) {
      const id = summary.parentElement.dataset.xpSection;
      const folded = new Set(app.settings().explorerFolded ?? []);
      if (folded.has(id)) folded.delete(id); else folded.add(id);
      setTimeout(() => app.updateSettings({ explorerFolded: [...folded] }, { quiet: true }), 0);
      return true;
    }
    const doc = target.closest('[data-xp-tab]');
    if (doc) { app.activateTab(doc.dataset.xpTab); return true; }
    const row = target.closest('.xp-row');
    if (!row) return false;
    const entry = entryOf(row);
    if (entry.dir) toggle(entry.path);
    return true;
  }

  function dblclick(target) {
    const row = target.closest('.xp-row');
    if (!row) return false;
    const entry = entryOf(row);
    if (!entry.dir) open(entry);
    return true;
  }

  /** The context menu for a row: { items, handlers, header } or null. */
  function menu(target) {
    const row = target.closest('.xp-row');
    if (!row) return null;
    const entry = entryOf(row);
    const fav = isFavorite(entry);
    const items = [
      ...(entry.dir ? [] : [
        { id: 'custom:xpOpen', label: t('explorer.openHex'), icon: 'hexFile' },
        { id: 'custom:xpOpenRo', label: t('explorer.openReadonly'), icon: 'lock' },
        { id: 'custom:xpCompare', label: t('explorer.compareActive'), icon: 'compare', disabled: !app.hasActive?.() },
        ...(app.desktop ? [{ id: 'custom:xpSystem', label: t('file.openDefault'), icon: 'openFile' }] : []),
        { separator: true },
      ]),
      { id: 'custom:xpFavorite', label: t(fav ? 'explorer.favoriteRemove' : 'explorer.favoriteAdd'), icon: fav ? 'starOff' : 'star' },
      { separator: true },
      ...(app.desktop && !entry.vault ? [{ id: 'custom:xpReveal', label: t('file.revealSystem'), icon: 'folderOpen' }] : []),
      { id: 'custom:xpCopy', label: t('file.copyPath'), icon: 'copy' },
    ];
    const handlers = {
      'custom:xpOpen': () => open(entry),
      'custom:xpOpenRo': () => open(entry, { readonly: true }),
      'custom:xpCompare': () => app.compareWith?.(entry.path),
      'custom:xpSystem': () => app.native.openExternal(entry.path),
      'custom:xpFavorite': () => setFavorite(entry, !fav),
      'custom:xpReveal': () => app.native.openExternal(entry.dir ? entry.path : parentOf(entry.path)),
      'custom:xpCopy': () => app.copyText(entry.path),
    };
    return { items, handlers, header: { icon: entry.dir ? 'folder' : 'openFile', title: entry.name || baseName(entry.path) } };
  }

  return { html, click, dblclick, menu, setFavorite, isFavorite, reset: () => { st.lists.clear(); st.places = null; } };
}

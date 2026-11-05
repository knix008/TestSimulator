// Folders pane: favorites, places (home folders, drives) or — in the browser —
// the folders the user opened, each as a lazily loaded tree.
import { baseName, parentOf } from '../catalog/catalog.js';
import { t } from '../i18n.js';
import { fs, hasFolderAccess, webFs } from '../platform/fs.js';
import { errorText } from '../platform/native.js';
import { app, catalogFolder, openFolder, transfer } from '../store.js';
import { toast } from './dialog.js';
import { clear, h } from './dom.js';
import { icon } from './icons.js';
import { pressDrag } from './itemdrag.js';
import { contextMenu } from './menu.js';
import { formatBytes } from '../util/format.js';

/** 'System (C:)', or 'Local disk (C:)' when the drive has no label. */
function driveName(place) {
  if (place.kind !== 'drive') return place.label || place.name;
  const label = place.label || t(`drive.${place.media || 'fixed'}`);
  return `${label} (${place.name})`;
}

const PLACE_ICONS = { home: 'home', pictures: 'images', desktop: 'monitor', documents: 'file', downloads: 'download', drive: 'drive', volume: 'drive', root: 'drive', webfolder: 'folder', memory: 'folderOpen' };

export function createFolderPane({ onOpenWebFolder, onOpenWebFiles, folderMenuItems, folderMenu }) {
  const el = h('div.pane-body.folders');
  const tree = h('div.tree', { role: 'tree' });
  const actions = h('div.folder-actions');
  el.append(actions, tree);
  // The tree is two parts that scroll on their own: the explorer, and below the line that
  // moves between them, the quick access and favorites.
  const rest = h('div.tree-rest');
  const splitter = h('div.tree-splitter', { role: 'separator', tabIndex: 0, 'aria-orientation': 'horizontal' });
  const nodes = new Map(); // path → { row, children, loaded, expanded, depth }
  // The drives are buttons on the pane's title row; the chosen one's folders are shown below.
  const driveBar = h('div.drive-buttons', { role: 'tablist' });
  let drives = [];
  const sameRoot = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
  const driveOf = (path) => drives.filter((d) => path && (sameRoot(path, d.path) || path.toLowerCase().startsWith(d.path.toLowerCase().replace(/[\\/]?$/, (m) => m || '/')))).sort((a, b) => b.path.length - a.path.length)[0] ?? null;
  const chosenDrive = () => {
    const saved = drives.find((d) => sameRoot(d.path, app.settings.panes.drive));
    return saved ?? driveOf(app.state.source.path) ?? drives[0] ?? null;
  };
  function chooseDrive(drive, { open = true } = {}) {
    app.settings.panes.drive = drive.path;
    app.saveSettings();
    render();
    if (open) openFolder(drive.path).catch((error) => toast(errorText(error), 'error'));
  }
  function drawDriveBar() {
    const current = chosenDrive();
    driveBar.replaceChildren(...drives.map((drive) => {
      const free = drive.total > 0 ? ` — ${t('folders.free', { free: formatBytes(drive.free), total: formatBytes(drive.total) })}` : '';
      return h(`button.drive-button${current && sameRoot(current.path, drive.path) ? '.on' : ''}`, {
        type: 'button', role: 'tab', title: `${driveName(drive)}${free}`, dataset: { drive: drive.path },
        onclick: () => chooseDrive(drive),
      }, h('span', { html: icon(drive.media === 'cdrom' ? 'disc' : drive.media === 'network' ? 'globe' : drive.media === 'removable' ? 'usb' : PLACE_ICONS[drive.kind] ?? 'drive') }), h('span.drive-name', drive.kind === 'drive' ? drive.name.replace(/\\+$/, '') : (drive.label || drive.name)));
    }));
  }

  function row(path, name, depth, { iconName = 'folder', hasDirs = true, place = null } = {}) {
    const arrow = h('span.tree-arrow', { html: hasDirs ? icon('chevronRight') : '' });
    const r = h('div.tree-row', { role: 'treeitem', tabIndex: -1, dataset: { path, drop: place?.readOnly ? undefined : path }, style: { paddingLeft: `${6 + depth * 14}px` }, title: path },
      arrow, h('span.tree-icon', { html: icon(iconName) }), h('span.tree-name', name));
    if (place && place.granted === false) {
      r.classList.add('needs-permission');
      r.append(h('span.tree-badge', { title: t('folders.reconnect') }, t('folders.reconnectShort')));
    }
    const children = h('div.tree-children', { role: 'group', hidden: true });
    const node = { row: r, children, loaded: false, expanded: false, depth, path, arrow, hasDirs, place };
    nodes.set(path, node);
    arrow.addEventListener('click', (event) => { event.stopPropagation(); toggle(node); });
    r.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.tree-arrow')) return;
      pressDrag(event, () => [path], { threshold: 10 });
    });
    r.addEventListener('click', async () => {
      if (place?.granted === false) {
        try { await webFs.reconnect(path); place.granted = true; r.classList.remove('needs-permission'); r.querySelector('.tree-badge')?.remove(); } catch { return; }
      }
      openFolder(path);
    });
    r.addEventListener('dblclick', () => toggle(node));
    r.addEventListener('contextmenu', (event) => contextMenu(event, folderMenu ? folderMenu(node) : menuFor(node)));
    return h('div.tree-node', r, children);
  }

  async function load(node) {
    if (node.loaded) return;
    node.loaded = true;
    try {
      const { dirs } = await fs.list(node.path, { hidden: app.settings.showHidden, probe: true });
      clear(node.children);
      for (const dir of dirs) node.children.append(row(dir.path, dir.name, node.depth + 1, { hasDirs: dir.hasDirs }));
      if (!dirs.length) { node.arrow.innerHTML = ''; node.hasDirs = false; }
    } catch (error) {
      node.loaded = false;
      node.children.replaceChildren(h('div.tree-error', { style: { paddingLeft: `${20 + node.depth * 14}px` } }, errorText(error)));
    }
  }

  async function toggle(node, force) {
    const expand = force ?? !node.expanded;
    if (expand) await load(node);
    node.expanded = expand;
    node.children.hidden = !expand;
    node.row.classList.toggle('expanded', expand);
  }

  function menuFor(node) {
    const favorite = app.settings.favorites.includes(node.path);
    return [
      { label: t('folders.open'), icon: 'folderOpen', action: () => openFolder(node.path) },
      { label: favorite ? t('folders.unfavorite') : t('folders.favorite'), icon: 'starFill', action: () => toggleFavorite(node.path) },
      'separator',
      { label: t('catalog.indexFolder'), icon: 'layers', action: () => catalogFolder(node.path) },
      { label: t('file.paste'), icon: 'copy', disabled: !app.state.clipboard || !fs.caps.write, action: async () => { const clip = app.state.clipboard; await transfer(clip.paths, node.path, { move: clip.cut }); if (clip.cut) app.state.clipboard = null; } },
      ...(folderMenuItems?.(node.path) ?? []),
      { label: t('file.reveal'), icon: 'reveal', disabled: !fs.caps.reveal, action: () => fs.reveal(node.path).catch((e) => toast(errorText(e), 'error')) },
      { label: t('folders.refresh'), icon: 'refresh', action: () => refreshNode(node.path) },
      ...(node.place && fs.kind === 'web' ? ['separator', { label: t('folders.close'), icon: 'close', action: async () => { await webFs.closeRoot(node.path); render(); } }] : []),
    ];
  }

  function toggleFavorite(path) {
    const list = app.settings.favorites;
    app.settings.favorites = list.includes(path) ? list.filter((p) => p !== path) : [...list, path];
    app.saveSettings();
    render();
  }

  async function refreshNode(path) {
    const node = nodes.get(path);
    if (!node) return;
    const expanded = node.expanded;
    node.loaded = false;
    if (expanded) await toggle(node, true);
  }

  /** A titled block of the tree (icon, title, fold arrow); folding it is remembered. */
  function block(id, title, iconName, parent) {
    const folded = () => app.settings.panes.foldedSections ?? [];
    const body = h('div.tree-block-body', { hidden: folded().includes(id) });
    const arrow = h('span.tree-block-arrow');
    const paint = () => { arrow.innerHTML = icon(body.hidden ? 'chevronDown' : 'chevronUp'); head.setAttribute('aria-expanded', String(!body.hidden)); };
    const fold = () => {
      body.hidden = !body.hidden;
      app.settings.panes.foldedSections = body.hidden ? [...folded(), id] : folded().filter((entry) => entry !== id);
      app.saveSettings();
      paint();
      syncTreeLayout();
    };
    const head = h('div.tree-section', { role: 'button', tabIndex: 0, dataset: { section: id }, onclick: fold, onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fold(); } } },
      h('span.tree-section-icon', { html: icon(iconName) }), h('span.tree-section-label', title), arrow);
    paint();
    parent.append(h('div.tree-block', { dataset: { block: id } }, head, body));
    return body;
  }

  /** A folded side has nothing to share: the other side takes the room and the line stays put. */
  function syncTreeLayout() {
    const bodyOf = (el) => [...el.querySelectorAll(':scope > .tree-block > .tree-block-body')];
    tree.classList.toggle('explorer-folded', bodyOf(tree).every((body) => body.hidden));
    tree.classList.toggle('rest-folded', bodyOf(rest).every((body) => body.hidden));
    tree.style.setProperty('--explorer-height', app.settings.panes.explorerHeight ? `${app.settings.panes.explorerHeight}px` : '');
  }

  const SIDE_MIN = 64; // the title row and a row of folders stay visible on both sides

  function setExplorerHeight(height) {
    const room = tree.clientHeight - splitter.offsetHeight;
    const next = Math.round(Math.max(SIDE_MIN, Math.min(height, room - SIDE_MIN)));
    app.settings.panes.explorerHeight = next;
    tree.style.setProperty('--explorer-height', `${next}px`);
    return next;
  }

  const splitterLocked = () => tree.classList.contains('explorer-folded') || tree.classList.contains('rest-folded');
  const explorerHeight = () => tree.querySelector(':scope > [data-block=explorer]').getBoundingClientRect().height;

  splitter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || splitterLocked()) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = explorerHeight();
    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add('dragging');
    const move = (e) => setExplorerHeight(startHeight + e.clientY - startY);
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      splitter.removeEventListener('pointercancel', up);
      splitter.classList.remove('dragging');
      app.saveSettings();
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
    splitter.addEventListener('pointercancel', up);
  });
  splitter.addEventListener('keydown', (event) => {
    if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || splitterLocked()) return;
    event.preventDefault();
    setExplorerHeight(explorerHeight() + (event.key === 'ArrowUp' ? -20 : 20));
    app.saveSettings();
  });

  let renderToken = 0;
  async function render() {
    const mine = ++renderToken;
    let places = [];
    try { places = await fs.places(); } catch (error) { toast(errorText(error), 'error'); }
    // A newer render started while this one waited: it draws instead.
    if (mine !== renderToken) return;
    nodes.clear();
    clear(tree);
    clear(actions);
    if (fs.kind === 'web') {
      if (hasFolderAccess()) actions.append(h('button.btn.small', { type: 'button', onclick: onOpenWebFolder }, h('span', { html: icon('folderPlus') }), t('web.openFolder')));
      else actions.append(h('button.btn.small', { type: 'button', onclick: () => onOpenWebFolder({ input: true }) }, h('span', { html: icon('folderPlus') }), t('web.openFolder')));
      actions.append(h('button.btn.small', { type: 'button', onclick: onOpenWebFiles }, h('span', { html: icon('images') }), t('web.openFiles')));
    }
    const QUICK = { home: 1, pictures: 1, desktop: 1, documents: 1, downloads: 1 };
    drives = places.filter((p) => !(p.kind in QUICK) && fs.kind !== 'web');
    const quick = places.filter((p) => p.kind in QUICK || fs.kind === 'web');
    drawDriveBar();
    // The chosen drive's folders, right under the drive buttons.
    const chosen = chosenDrive();
    if (chosen) {
      const explorer = block('explorer', t('folders.explorer'), 'folder', tree);
      splitter.title = t('folders.splitter');
      tree.append(splitter);
      for (const place of [chosen]) {
        const node = row(place.path, driveName(place), 0, { iconName: place.media === 'cdrom' ? 'disc' : place.media === 'network' ? 'globe' : place.media === 'removable' ? 'usb' : PLACE_ICONS[place.kind] ?? 'drive', place });
        if (place.total > 0) {
          const used = 1 - place.free / place.total;
          node.querySelector('.tree-row').after(h('div.drive-usage', { style: { marginLeft: '40px' }, title: t('folders.free', { free: formatBytes(place.free), total: formatBytes(place.total) }) },
            h('div.drive-bar', h('div.drive-fill', { className: used > 0.9 ? 'drive-fill full' : 'drive-fill', style: { width: `${Math.round(used * 100)}%` } })),
            h('span.drive-free', t('folders.free', { free: formatBytes(place.free), total: formatBytes(place.total) }))));
        }
        explorer.append(node);
        toggle(nodes.get(place.path), true);
      }
    }
    clear(rest);
    tree.append(rest);
    const shortcuts = block('quick', fs.kind === 'web' ? t('folders.opened') : t('folders.quick'), fs.kind === 'web' ? 'folderOpen' : 'link', rest);
    if (!quick.length && fs.kind === 'web') shortcuts.append(h('div.tree-hint', t('web.noFolders')));
    for (const place of quick) {
      const name = place.kind in QUICK ? t(`place.${place.kind}`, { name: place.name }) : place.name;
      shortcuts.append(row(place.path, name, 0, { iconName: PLACE_ICONS[place.kind] ?? 'folder', place }));
    }
    const favorites = app.settings.favorites;
    if (favorites.length) {
      const starred = block('favorites', t('folders.favorites'), 'starFill', rest);
      for (const path of favorites) starred.append(row(path, baseName(path) || path, 0, { iconName: 'starFill' }));
    }
    syncTreeLayout();
    highlight();
  }

  /** Expands the tree down to the shown folder and marks it. */
  async function highlight() {
    for (const node of nodes.values()) node.row.classList.remove('current');
    const { source } = app.state;
    if (source.type !== 'folder') return;
    const target = source.path;
    const sep = (p) => p.replace(/[\\/]+$/, '').toLowerCase();
    // Deepest top-level node that contains the folder.
    const tops = [...nodes.values()].filter((n) => n.depth === 0 && (sep(target) === sep(n.path) || sep(target).startsWith(`${sep(n.path)}/`) || sep(target).startsWith(`${sep(n.path)}\\`)));
    tops.sort((a, b) => b.path.length - a.path.length);
    let node = tops[0];
    if (!node) return;
    while (node && sep(node.path) !== sep(target)) {
      await toggle(node, true);
      const next = [...node.children.querySelectorAll(':scope > .tree-node > .tree-row')].map((r) => nodes.get(r.dataset.path))
        .find((child) => child && (sep(target) === sep(child.path) || sep(target).startsWith(`${sep(child.path)}/`) || sep(target).startsWith(`${sep(child.path)}\\`)));
      node = next;
    }
    if (node) {
      node.row.classList.add('current');
      node.row.scrollIntoView({ block: 'nearest' });
    }
  }

  app.on('source', () => {
    // Opening a folder on another drive selects that drive's button.
    const drive = driveOf(app.state.source.path);
    if (drive && !sameRoot(drive.path, chosenDrive()?.path) && app.state.source.type === 'folder') { app.settings.panes.drive = drive.path; render(); return; }
    highlight();
  });
  app.on('folders-changed', (path) => {
    for (const p of [path, path && parentOf(path)]) if (p && nodes.has(p)) refreshNode(p);
    if (!path && app.state.source.type === 'folder') refreshNode(app.state.source.path);
  });

  // Drops of items on folder rows are handled by the file list's drag (data-drop).
  return { el, render, highlight, toggleFavorite, headTools: () => driveBar, chooseDrive: (path) => { const drive = drives.find((d) => sameRoot(d.path, path)); if (drive) chooseDrive(drive); } };
}

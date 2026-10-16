// The file list: thumbnails, details or list view of the current items.
// Virtualized (only rows on screen exist in the DOM), with group headers,
// keyboard navigation, rubber-band selection and dragging items onto folders.
import { LABEL_COLORS } from '../catalog/catalog.js';
import { badgeOf, kindOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { app, openFolder, selectItem, setSelection, viewItem } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { formatBytes, formatDate, formatDateTime, formatDuration } from '../util/format.js';
import { h, rafThrottle } from './dom.js';
import { icon } from './icons.js';
import { beginPointerDrag } from './itemdrag.js';

const PAD = 10;
const HEADER_H = 34;
const DETAIL_H = 26;
const LIST_W = 260;
const LIST_H = 34;
const TILES_W = 330;
const TILES_H = 104;
const FILM_W = 128;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const DETAIL_COLUMNS = [
  { id: 'name', width: 280, sort: 'name' },
  { id: 'size', width: 90, sort: 'size', align: 'right' },
  { id: 'type', width: 80, sort: 'type' },
  { id: 'modified', width: 150, sort: 'modified' },
  { id: 'taken', width: 150, sort: 'taken' },
  { id: 'dimensions', width: 110, sort: 'dimensions' },
  { id: 'rating', width: 90, sort: 'rating' },
  { id: 'label', width: 70, sort: 'label' },
  { id: 'camera', width: 170, sort: 'camera' },
];

function stars(n) {
  if (!n) return '';
  return `<span class="stars">${'★'.repeat(n)}</span>`;
}

export function createFileList({ onContextMenu, onDropItems }) {
  const scroller = h('div.filelist', { tabIndex: 0, role: 'listbox', 'aria-multiselectable': 'true' });
  // Filmstrip view: the focused photo large above the strip.
  const filmPreview = h('div.film-preview', { hidden: true });
  let filmToken = 0;
  let filmItem = null;
  async function showFilmPreview() {
    const item = app.state.list.find((i) => i.path === app.state.focus && !i.isDir) ?? app.state.list.find((i) => !i.isDir);
    filmItem = item ?? null;
    const mine = ++filmToken;
    if (!item) { filmPreview.replaceChildren(); return; }
    const { fs } = await import('../platform/fs.js');
    const kind = kindOf(item.name);
    const src = kind === 'native' || kind === 'svg' ? await fs.objectUrl(item.path) : (await thumbs.get(item, 10))?.url;
    if (mine !== filmToken || !src) return;
    const img = h('img', { src, alt: item.name, crossOrigin: kind === 'native' ? 'anonymous' : null });
    if (kind === 'native' || kind === 'svg') img.addEventListener('load', () => URL.revokeObjectURL(src), { once: true });
    img.addEventListener('dblclick', () => viewItem(item.path));
    filmPreview.replaceChildren(img, h('div.film-caption', item.name));
  }
  const head = h('div.details-head');
  const canvas = h('div.filelist-canvas');
  const empty = h('div.filelist-empty');
  const band = h('div.rubber-band');
  scroller.append(head, canvas, empty, band);

  let rows = [];
  let positions = new Map(); // path → { x, y, w, h, index }
  let mounted = new Map(); // key → element
  let columns = 1;
  let tile = { w: 0, h: 0, thumb: 0 };
  let width = 0;

  const view = () => app.settings.view;

  // ───────── layout

  function captionLines() {
    const c = app.settings.caption;
    return (c.name ? 1 : 0) + (c.size || c.dims ? 1 : 0) + (c.date ? 1 : 0);
  }

  function layout() {
    width = scroller.clientWidth;
    rows = [];
    positions = new Map();
    const groups = app.state.groups;
    const grouped = app.settings.groupBy !== 'none';
    let y = view() === 'details' ? 30 : PAD;
    let index = 0;
    if (view() === 'thumbs') {
      const size = app.settings.thumbSize;
      const minW = size + 14;
      columns = Math.max(1, Math.floor((width - PAD * 2) / minW));
      const w = Math.floor((width - PAD * 2) / columns);
      const lines = captionLines();
      tile = { w, h: size + 14 + (lines ? lines * 17 + 4 : 0), thumb: size };
    } else if (view() === 'tiles') {
      columns = Math.max(1, Math.floor((width - PAD * 2) / TILES_W));
      tile = { w: Math.floor((width - PAD * 2) / columns), h: TILES_H, thumb: TILES_H - 14 };
    } else if (view() === 'filmstrip') {
      // One row of items; the big preview sits above (filmPreview).
      columns = Number.MAX_SAFE_INTEGER;
      tile = { w: FILM_W, h: FILM_W + 18, thumb: FILM_W - 14 };
    } else if (view() === 'list') {
      columns = Math.max(1, Math.floor((width - PAD * 2) / LIST_W));
      tile = { w: Math.floor((width - PAD * 2) / columns), h: LIST_H, thumb: 28 };
    } else {
      columns = 1;
      tile = { w: Math.max(width, DETAIL_COLUMNS.reduce((s, c) => s + c.width, 0)), h: DETAIL_H, thumb: 20 };
    }
    const film = view() === 'filmstrip';
    for (const group of film ? [{ key: 'all', items: app.state.list }] : groups) {
      if (!group.items.length) continue;
      if (grouped && !film) {
        rows.push({ kind: 'header', top: y, height: HEADER_H, group });
        y += HEADER_H;
      }
      for (let i = 0; i < group.items.length; i += columns) {
        const items = group.items.slice(i, i + columns);
        const x0 = view() === 'details' ? 0 : PAD;
        items.forEach((item, col) => positions.set(item.path, { x: x0 + col * tile.w, y, w: tile.w, h: tile.h, index: index + col, row: rows.length }));
        rows.push({ kind: 'items', top: y, height: tile.h, items });
        y += tile.h;
        index += items.length;
      }
      if (grouped) y += 6;
    }
    canvas.style.height = film ? `${tile.h + PAD}px` : `${y + PAD}px`;
    canvas.style.width = view() === 'details' ? `${tile.w}px` : film ? `${PAD * 2 + app.state.list.length * tile.w}px` : '';
    filmPreview.hidden = !film;
    if (film) showFilmPreview();
    else filmItem = null;
    scroller.dataset.view = view();
    head.hidden = view() !== 'details';
    if (view() === 'details') renderHead();
  }

  function renderHead() {
    head.innerHTML = '';
    let x = 0;
    for (const col of DETAIL_COLUMNS) {
      const sorted = app.settings.sort.key === col.sort;
      const cell = h(`button.details-cell${sorted ? '.sorted' : ''}`, { type: 'button', style: { left: `${x}px`, width: `${col.width}px`, textAlign: col.align ?? 'left' }, dataset: { sort: col.sort } },
        t(`column.${col.id}`), sorted ? h('span.sort-arrow', app.settings.sort.desc ? '▼' : '▲') : null);
      cell.addEventListener('click', () => {
        const desc = sorted ? !app.settings.sort.desc : false;
        app.settings.sort = { key: col.sort, desc };
        app.saveSettings();
        app.emit('resort');
      });
      head.append(cell);
      x += col.width;
    }
    head.style.width = `${x}px`;
  }

  // ───────── rendering

  function tileHtml(item) {
    const record = app.catalog.get(item.path);
    const c = app.settings.caption;
    const kind = item.isDir ? 'folder' : kindOf(item.name);
    const thumb = item.isDir ? null : thumbs.peek(item);
    const media = item.isDir
      ? `<span class="tile-icon folder">${icon('folder')}</span>`
      : thumb?.url ? `<img class="tile-img" src="${thumb.url}" alt="" draggable="false">`
        : thumb?.error ? `<span class="tile-icon broken" title="${esc(thumb.error)}">${icon(kind === 'video' ? 'video' : 'warning')}</span>`
          : kind ? `<span class="tile-icon loading">${icon(kind === 'video' ? 'video' : 'image')}</span>` : `<span class="tile-icon">${icon('file')}</span>`;
    if (view() === 'details') {
      let x = 0;
      const cells = DETAIL_COLUMNS.map((col) => {
        let value = '';
        switch (col.id) {
          case 'name': value = `<span class="detail-icon">${item.isDir ? icon('folder') : thumb?.url ? `<img src="${thumb.url}" alt="">` : icon(kind === 'video' ? 'video' : 'image')}</span>${esc(item.name)}`; break;
          case 'size': value = item.isDir ? '' : formatBytes(item.size); break;
          case 'type': value = item.isDir ? t('type.folder') : badgeOf(item.name); break;
          case 'modified': value = formatDateTime(item.modified); break;
          case 'taken': value = formatDateTime(record?.meta?.taken); break;
          case 'dimensions': value = record?.width ? `${record.width} × ${record.height}` : ''; break;
          case 'rating': value = stars(record?.rating); break;
          case 'label': value = record?.label ? `<span class="label-dot" style="background:${LABEL_COLORS[record.label]}"></span>` : ''; break;
          case 'camera': value = esc(record?.meta?.camera ?? ''); break;
          default: break;
        }
        const html = `<div class="details-cell" style="left:${x}px;width:${col.width}px;text-align:${col.align ?? 'left'}">${value}</div>`;
        x += col.width;
        return html;
      }).join('');
      return `${cells}${record?.tagged ? '<span class="detail-tag"></span>' : ''}`;
    }
    if (view() === 'tiles') {
      const parts = [record?.width ? `${record.width} × ${record.height}` : '', item.isDir ? '' : formatBytes(item.size)].filter(Boolean).join(' · ');
      return `<span class="tiles-media" style="width:${tile.thumb}px;height:${tile.thumb}px">${media}</span><span class="tiles-text"><span class="tiles-name">${esc(item.name)}</span><span class="tiles-sub">${esc(parts)}</span><span class="tiles-sub">${esc(formatDate(record?.meta?.taken ?? item.modified))}${record?.meta?.camera ? ` · ${esc(record.meta.camera)}` : ''}</span><span class="tiles-sub">${record?.rating ? stars(record.rating) : ''}${record?.label ? `<span class="label-dot" style="background:${LABEL_COLORS[record.label]}"></span>` : ''}${record?.tagged ? ' ☑' : ''}</span></span>`;
    }
    if (view() === 'list') {
      return `<span class="list-media">${media}</span><span class="list-name">${esc(item.name)}</span>${record?.rating ? stars(record.rating) : ''}${record?.label ? `<span class="label-dot" style="background:${LABEL_COLORS[record.label]}"></span>` : ''}`;
    }
    const overlay = c.overlay && !item.isDir;
    const lines = [];
    if (c.name) lines.push(`<div class="tile-name">${esc(item.name)}</div>`);
    if (c.size || c.dims) {
      const parts = [];
      if (c.dims && record?.width) parts.push(`${record.width}×${record.height}`);
      if (c.size && !item.isDir) parts.push(formatBytes(item.size));
      lines.push(`<div class="tile-sub">${parts.join(' · ')}</div>`);
    }
    if (c.date) lines.push(`<div class="tile-sub">${formatDate(record?.meta?.taken ?? item.modified)}</div>`);
    return `<div class="tile-thumb" style="height:${tile.thumb}px">${media}
      ${overlay ? `<button type="button" class="tag-box${record?.tagged ? ' on' : ''}" title="${esc(t('organize.tag'))}" tabindex="-1">${icon(record?.tagged ? 'checkSquare' : 'square')}</button>` : ''}
      ${overlay && kind ? `<span class="type-badge">${esc(badgeOf(item.name))}</span>` : ''}
      ${overlay && record?.rating ? `<span class="rating-badge">${stars(record.rating)}</span>` : ''}
      ${overlay && record?.edited ? `<span class="edited-badge" title="${esc(t('organize.edited'))}">${icon('pencil')}</span>` : ''}
      ${overlay && record?.meta?.duration ? `<span class="duration-badge">${formatDuration(record.meta.duration)}</span>` : ''}
      ${record?.label ? `<span class="label-bar" style="background:${LABEL_COLORS[record.label]}"></span>` : ''}
    </div>${lines.join('')}`;
  }

  function fillTile(el, item) {
    el.innerHTML = tileHtml(item);
    el.classList.toggle('selected', app.state.selection.has(item.path));
    el.classList.toggle('focused', app.state.focus === item.path);
    el.classList.toggle('cut', Boolean(app.state.clipboard?.cut && app.state.clipboard.paths.includes(item.path)));
    if (!item.isDir && kindOf(item.name) && !thumbs.peek(item)) {
      thumbs.get(item, 10).then((result) => {
        if (result?.cancelled) return;
        if (mounted.get(item.path) === el) fillTile(el, item);
      });
    }
  }

  function makeTile(item, pos) {
    const el = document.createElement('div');
    el.className = `tile${item.isDir ? ' is-dir' : ''}`;
    el.dataset.path = item.path;
    el.setAttribute('role', 'option');
    if (item.isDir) el.dataset.drop = item.path;
    el.style.cssText = `left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px`;
    el._item = item;
    fillTile(el, item);
    return el;
  }

  const render = rafThrottle(() => {
    const top = scroller.scrollTop - 200;
    const bottom = scroller.scrollTop + scroller.clientHeight + 400;
    const wanted = new Map();
    const visibleItems = [];
    // Binary search first row.
    let lo = 0;
    let hi = rows.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].top + rows[mid].height < top) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < rows.length && rows[i].top < bottom; i++) {
      const row = rows[i];
      if (row.kind === 'header') {
        const key = `h:${row.group.key}`;
        let el = mounted.get(key);
        if (!el) {
          el = h('div.group-header', { style: { top: `${row.top}px` } }, groupTitle(row.group), h('span.group-count', String(row.group.items.length)));
          el.addEventListener('click', () => setSelection(row.group.items.map((item) => item.path)));
          canvas.append(el);
        } else el.style.top = `${row.top}px`;
        wanted.set(key, el);
        continue;
      }
      for (const item of row.items) {
        const pos = positions.get(item.path);
        if (view() === 'filmstrip' && (pos.x + pos.w < scroller.scrollLeft - 400 || pos.x > scroller.scrollLeft + scroller.clientWidth + 400)) continue;
        let el = mounted.get(item.path);
        if (!el || el._item !== item) {
          el?.remove();
          el = makeTile(item, pos);
          canvas.append(el);
        } else {
          el.style.cssText = `left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px`;
        }
        wanted.set(item.path, el);
        if (!item.isDir) visibleItems.push(item);
      }
    }
    for (const [key, el] of mounted) if (!wanted.has(key)) el.remove();
    mounted = wanted;
    thumbs.prioritize(visibleItems);
  });

  // Warms the cache for the whole list once (visible items keep jumping the queue).
  function warm() {
    for (const item of app.state.list) if (!item.isDir && kindOf(item.name) && !thumbs.peek(item)) thumbs.get(item, 0);
  }

  function groupTitle(group) {
    switch (group.kind) {
      case 'folders': return t('group.folders');
      case 'day': return formatDate(group.time, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
      case 'month': return formatDate(group.time, { year: 'numeric', month: 'long' });
      case 'year': return String(new Date(group.time).getFullYear());
      case 'rating': return group.value ? '★'.repeat(group.value) : t('group.unrated');
      case 'label': return group.value === 'none' ? t('group.nolabel') : t(`label.${group.value}`);
      case 'unknown': return t('group.unknown');
      default: return group.key;
    }
  }

  function updateEmpty() {
    const { state } = app;
    empty.hidden = state.list.length > 0 && !state.error;
    if (state.error) empty.textContent = state.error;
    else if (state.loading) empty.textContent = t('list.loading');
    else if (!state.list.length) empty.textContent = state.items.length ? t('list.allFiltered') : t('list.empty');
  }

  function rebuild({ reset = false } = {}) {
    for (const el of mounted.values()) el.remove();
    mounted = new Map();
    layout();
    if (reset) scroller.scrollTop = 0;
    updateEmpty();
    render();
    setTimeout(warm, 50);
  }

  function refreshTiles(paths) {
    const list = paths ? paths : [...mounted.keys()];
    for (const path of list) {
      const el = mounted.get(path);
      if (el?._item) fillTile(el, el._item);
    }
  }

  function updateSelection() {
    for (const [key, el] of mounted) {
      if (!el._item) continue;
      el.classList.toggle('selected', app.state.selection.has(key));
      el.classList.toggle('focused', app.state.focus === key);
    }
  }

  function scrollIntoView(path) {
    const pos = positions.get(path);
    if (!pos) return;
    if (view() === 'filmstrip') {
      if (pos.x < scroller.scrollLeft) scroller.scrollLeft = pos.x - 4;
      else if (pos.x + pos.w > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = pos.x + pos.w - scroller.clientWidth + 4;
      return;
    }
    const headH = view() === 'details' ? 30 : 0;
    if (pos.y - headH < scroller.scrollTop) scroller.scrollTop = pos.y - headH - 4;
    else if (pos.y + pos.h > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = pos.y + pos.h - scroller.clientHeight + 4;
  }

  // ───────── events from the app

  app.on('items', (detail) => rebuild(detail ?? {}));
  app.on('source', () => { rebuild({ reset: true }); });
  app.on('selection', () => { updateSelection(); if (app.state.focus) scrollIntoView(app.state.focus); if (view() === 'filmstrip') showFilmPreview(); });
  app.on('catalog', (change) => {
    if (!change?.paths || change.paths.length > 300) refreshTiles();
    else refreshTiles(change.paths);
  });
  app.on('info', (path) => refreshTiles([path]));
  app.on('clipboard', () => refreshTiles());
  app.on('settings', () => {});
  new ResizeObserver(() => { if (Math.abs(scroller.clientWidth - width) > 1) rebuild(); }).observe(scroller);
  scroller.addEventListener('scroll', () => render(), { passive: true });

  // ───────── mouse

  const tileOf = (target) => target.closest?.('.tile');

  scroller.addEventListener('dblclick', (event) => {
    const el = tileOf(event.target);
    if (!el) return;
    if (el._item.isDir) openFolder(el._item.path);
    else viewItem(el._item.path);
  });

  scroller.addEventListener('contextmenu', (event) => {
    const el = tileOf(event.target);
    if (el && !app.state.selection.has(el._item.path)) selectItem(el._item.path);
    if (!el) setSelection([]);
    onContextMenu?.(event, el?._item ?? null);
  });

  scroller.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    scroller.focus({ preventScroll: true });
    const el = tileOf(event.target);
    if (event.target.closest('.tag-box') && el) {
      event.preventDefault();
      app.catalog.toggleTagged([el._item.path]);
      return;
    }
    if (event.target.closest('.details-head')) return;
    if (el) startItemPress(event, el);
    else startBand(event);
  });

  function startItemPress(event, el) {
    const item = el._item;
    const additive = event.ctrlKey || event.metaKey;
    const wasSelected = app.state.selection.has(item.path);
    if (event.shiftKey) selectItem(item.path, { range: true, toggle: additive });
    else if (additive) selectItem(item.path, { toggle: true });
    else if (!wasSelected) selectItem(item.path);
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = null;
    const move = (e) => {
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 6 && !item.isDir || (!dragging && item.isDir && Math.hypot(e.clientX - startX, e.clientY - startY) > 10)) {
        if (!app.state.selection.has(item.path)) selectItem(item.path);
        dragging = beginPointerDrag([...app.state.selection], {
          onDrop: onDropItems,
          onExternal() {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          },
        });
      }
      dragging?.move(e);
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragging) dragging.drop(e);
      // A plain click on an item of a multi-selection selects just that one.
      else if (!event.shiftKey && !additive && wasSelected) selectItem(item.path);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startBand(event) {
    const rect = scroller.getBoundingClientRect();
    const x0 = event.clientX - rect.left + scroller.scrollLeft;
    const y0 = event.clientY - rect.top + scroller.scrollTop;
    const base = event.ctrlKey || event.metaKey ? new Set(app.state.selection) : new Set();
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) setSelection([]);
    let active = false;
    const move = (e) => {
      const x1 = e.clientX - rect.left + scroller.scrollLeft;
      const y1 = e.clientY - rect.top + scroller.scrollTop;
      if (!active && Math.hypot(x1 - x0, y1 - y0) < 5) return;
      active = true;
      const left = Math.min(x0, x1);
      const top = Math.min(y0, y1);
      const w = Math.abs(x1 - x0);
      const hgt = Math.abs(y1 - y0);
      band.style.cssText = `display:block;left:${left}px;top:${top}px;width:${w}px;height:${hgt}px`;
      const hit = [...base];
      for (const [path, pos] of positions) {
        if (pos.x < left + w && pos.x + pos.w > left && pos.y < top + hgt && pos.y + pos.h > top) hit.push(path);
      }
      app.state.selection = new Set(hit);
      updateSelection();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      band.style.display = 'none';
      if (active) { app.state.focus = [...app.state.selection].pop() ?? null; app.state.anchor = app.state.focus; app.emit('selection'); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ───────── keyboard

  scroller.addEventListener('keydown', (event) => {
    const { list } = app.state;
    if (!list.length) return;
    const index = Math.max(0, list.findIndex((item) => item.path === app.state.focus));
    const perPage = Math.max(1, Math.floor(scroller.clientHeight / tile.h)) * columns;
    let next = null;
    const vertical = (dir) => {
      // Same column in the previous / next row (rows can be short at group ends).
      const pos = positions.get(list[index].path);
      const targetRow = rows.slice(pos ? (dir > 0 ? pos.row + 1 : 0) : 0, pos ? (dir > 0 ? undefined : pos.row) : undefined).filter((r) => r.kind === 'items');
      const row = dir > 0 ? targetRow[0] : targetRow[targetRow.length - 1];
      if (!row) return index;
      const col = pos ? Math.round((pos.x - PAD) / tile.w) : 0;
      return list.indexOf(row.items[Math.min(col, row.items.length - 1)]);
    };
    switch (event.key) {
      case 'ArrowRight': next = view() === 'details' ? null : Math.min(list.length - 1, index + 1); break;
      case 'ArrowLeft': next = view() === 'details' ? null : Math.max(0, index - 1); break;
      case 'ArrowDown': next = vertical(1); break;
      case 'ArrowUp': next = vertical(-1); break;
      case 'Home': next = 0; break;
      case 'End': next = list.length - 1; break;
      case 'PageDown': next = Math.min(list.length - 1, index + perPage); break;
      case 'PageUp': next = Math.max(0, index - perPage); break;
      case 'Enter': {
        const item = list[index];
        if (item) { event.preventDefault(); if (item.isDir) openFolder(item.path); else viewItem(item.path); }
        return;
      }
      case ' ':
        if (event.ctrlKey) { event.preventDefault(); selectItem(list[index].path, { toggle: true }); }
        return;
      default: return;
    }
    if (next == null || next < 0) return;
    event.preventDefault();
    const path = list[next].path;
    if (event.shiftKey) selectItem(path, { range: true });
    else if (event.ctrlKey) { app.state.focus = path; app.emit('selection'); }
    else selectItem(path);
  });

  // Filmstrip view: ◀ ▶ at both ends of the strip select the previous / next item.
  const stepFocus = (dir) => {
    const list = app.state.list;
    if (!list.length) return;
    const at = list.findIndex((item) => item.path === app.state.focus);
    const next = at < 0 ? 0 : Math.max(0, Math.min(list.length - 1, at + dir));
    selectItem(list[next].path);
    scroller.focus({ preventScroll: true });
  };
  const filmPrev = h('button.film-nav.prev', { type: 'button', title: `${t('view.prev')} (←)`, 'aria-label': t('view.prev'), html: icon('prev'), dataset: { key: 'film-prev' }, onclick: () => stepFocus(-1) });
  const filmNext = h('button.film-nav.next', { type: 'button', title: `${t('view.next')} (→)`, 'aria-label': t('view.next'), html: icon('next'), dataset: { key: 'film-next' }, onclick: () => stepFocus(1) });
  const box = h('div.film-box', filmPrev, scroller, filmNext);
  const syncFilmNav = () => {
    const list = app.state.list;
    const at = list.findIndex((item) => item.path === app.state.focus);
    filmPrev.disabled = !list.length || at === 0;
    filmNext.disabled = !list.length || at === list.length - 1;
  };
  app.on('selection', syncFilmNav);
  app.on('items', syncFilmNav);
  return {
    el: scroller, box, filmPreview, rebuild, refreshTiles, scrollIntoView, focus: () => scroller.focus({ preventScroll: true }),
    /** The large picture above the filmstrip, including when no file is selected. */
    displayedFile: () => (view() === 'filmstrip' && !filmPreview.hidden ? filmItem : null),
  };
}

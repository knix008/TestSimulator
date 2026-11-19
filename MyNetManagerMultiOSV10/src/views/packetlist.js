// The packet list: one row per displayed frame, drawn only for the rows on screen (virtual
// scrolling: 100 000 rows cost the same as 30). Columns can be resized, moved by dragging the
// header, sorted by a click, and hidden from the header's context menu.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { displayValue, fieldColumn, formatTime } from '../domain/capture/doc.js';

const OVERSCAN = 8;

export function columnTitle(column, t) {
  if (column.title) return column.title;
  if (column.kind === 'field') return column.field;
  return t(`column.${column.kind}`);
}

export class PacketList {
  /** app: { doc(), settings(), t, onSelect(index, event), onContext(event, index), onOpen(index), onHeaderContext(event, column), onColumnsChanged(columns) } */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.sort = null; // { id, desc }
    this.order = null; // sorted copy of doc.displayed
    this.lastDraw = { first: -1, last: -1 };
    host.classList.add('packet-list');
    host.innerHTML = `<div class="pl-head" role="row"></div><div class="pl-scroll" tabindex="0" role="grid"><div class="pl-spacer"></div><div class="pl-rows" role="rowgroup"></div><div class="pl-empty" hidden></div></div>`;
    this.head = host.querySelector('.pl-head');
    this.scroller = host.querySelector('.pl-scroll');
    this.spacer = host.querySelector('.pl-spacer');
    this.rows = host.querySelector('.pl-rows');
    this.empty = host.querySelector('.pl-empty');
    this.scroller.addEventListener('scroll', () => { this.head.scrollLeft = this.scroller.scrollLeft; this.draw(); }, { passive: true });
    this.rows.addEventListener('pointerdown', (event) => this.onRowPointer(event));
    this.rows.addEventListener('dblclick', (event) => { const row = event.target.closest('[data-index]'); if (row) app.onOpen?.(Number(row.dataset.index)); });
    this.rows.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const row = event.target.closest('[data-index]');
      if (row) { const index = Number(row.dataset.index); if (app.doc().selected !== index) app.onSelect(index, event); app.onContext?.(event, index); }
    });
    this.scroller.addEventListener('keydown', (event) => this.onKey(event));
    this.head.addEventListener('pointerdown', (event) => this.onHeadPointer(event));
    this.head.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const cell = event.target.closest('[data-col]');
      app.onHeaderContext?.(event, cell ? this.columns().find((c) => c.id === cell.dataset.col) : null);
    });
    this.resizeObserver = new ResizeObserver(() => this.draw(true));
    this.resizeObserver.observe(this.scroller);
  }

  destroy() { this.resizeObserver.disconnect(); this.host.innerHTML = ''; this.host.classList.remove('packet-list'); }

  columns() { return this.app.settings().columns.filter((c) => c.visible); }
  rowHeight() { return Math.round(this.app.settings().rowHeight * (this.app.settings().textZoom / 100)); }

  /** The frame indices in row order (the displayed list, sorted when a column sort is on). */
  list() {
    const doc = this.app.doc();
    if (!doc) return [];
    if (!this.sort) return doc.displayed;
    if (!this.order || this.order.source !== doc.displayed || this.order.length !== doc.displayed.length || this.order.sortKey !== `${this.sort.id}:${this.sort.desc}`) this.order = this.sorted(doc);
    return this.order.list;
  }

  sorted(doc) {
    const column = this.app.settings().columns.find((c) => c.id === this.sort.id);
    const list = [...doc.displayed];
    if (column) {
      const keys = new Map(list.map((index, row) => [index, this.sortKey(doc, column, index, row)]));
      list.sort((a, b) => {
        const ka = keys.get(a);
        const kb = keys.get(b);
        const cmp = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), undefined, { numeric: true });
        return (this.sort.desc ? -cmp : cmp) || a - b;
      });
    }
    return { list, source: doc.displayed, length: doc.displayed.length, sortKey: `${this.sort.id}:${this.sort.desc}` };
  }

  sortKey(doc, column, index, row) {
    const s = doc.summaries[index] ?? {};
    switch (column.kind) {
      case 'no': return index;
      case 'time': case 'abs_time': return doc.epoch(index);
      case 'delta': return doc.delta(index);
      case 'length': return s.length ?? doc.frames[index].len;
      case 'caplen': return doc.frames[index].caplen;
      case 'srcport': return s.srcport ?? -1;
      case 'dstport': return s.dstport ?? -1;
      case 'stream': return s.tcpStream ?? s.udpStream ?? -1;
      default: return this.cellText(doc, column, index, row);
    }
  }

  setSort(id) {
    if (this.sort?.id === id) this.sort = this.sort.desc ? null : { id, desc: true };
    else this.sort = { id, desc: false };
    const doc = this.app.doc();
    if (doc) doc.listSort = this.sort;
    this.order = null;
    this.render();
  }

  // ───────────────────────── drawing

  /** Rebuilds the header and the rows (columns or settings changed). */
  render() {
    // The sort belongs to one capture: another tab starts in capture order.
    const doc = this.app.doc();
    if (doc !== this.sortDoc) { this.sortDoc = doc; this.sort = doc?.listSort ?? null; this.order = null; }
    const cols = this.columns();
    const t = this.app.t;
    const width = cols.reduce((sum, c) => sum + c.width, 0);
    this.host.style.setProperty('--pl-width', `${width}px`);
    this.host.style.setProperty('--pl-row', `${this.rowHeight()}px`);
    this.host.style.setProperty('--pl-template', cols.map((c) => `${c.width}px`).join(' '));
    this.head.innerHTML = `<div class="pl-head-inner">${cols.map((c) => {
      const sorted = this.sort?.id === c.id ? (this.sort.desc ? 'desc' : 'asc') : '';
      return `<div class="pl-th ${sorted} ${['no', 'length', 'caplen', 'srcport', 'dstport', 'stream'].includes(c.kind) ? 'num' : ''}" data-col="${escapeHtml(c.id)}" role="columnheader" title="${escapeHtml(t('packetList.headerTip', { name: columnTitle(c, t) }))}"><span>${escapeHtml(columnTitle(c, t))}</span>${sorted ? icon(sorted === 'asc' ? 'chevronUp' : 'chevronDown', 'icon tiny') : ''}<i class="pl-resize" data-resize="${escapeHtml(c.id)}"></i></div>`;
    }).join('')}</div>`;
    this.draw(true);
  }

  /** Draws the rows in view. force: even when the same rows are in view. */
  draw(force = false) {
    const doc = this.app.doc();
    const list = this.list();
    const height = this.rowHeight();
    this.spacer.style.height = `${list.length * height}px`;
    const view = this.scroller.clientHeight || 400;
    const first = Math.max(0, Math.floor(this.scroller.scrollTop / height) - OVERSCAN);
    const last = Math.min(list.length, Math.ceil((this.scroller.scrollTop + view) / height) + OVERSCAN);
    this.empty.hidden = list.length > 0;
    if (!list.length) this.empty.textContent = doc ? (doc.filterText ? this.app.t('packetList.noMatch') : doc.live ? this.app.t('packetList.waiting') : this.app.t('packetList.empty')) : '';
    if (!force && first === this.lastDraw.first && last === this.lastDraw.last && list.length === this.lastDraw.length) return;
    this.lastDraw = { first, last, length: list.length };
    if (!doc) { this.rows.innerHTML = ''; return; }
    const cols = this.columns();
    const s = this.app.settings();
    const html = [];
    for (let row = first; row < last; row += 1) {
      const index = list[row];
      const summary = doc.summary(index);
      if (!summary) continue;
      const color = s.colorize ? doc.colorOf(index) : null;
      const ignored = doc.ignored.has(index);
      const marked = doc.marked.has(index);
      const classes = ['pl-row', index === doc.selected ? 'selected' : '', marked ? 'marked' : '', ignored ? 'ignored' : '', doc.expertOf(index) === 'error' ? 'expert-error' : doc.expertOf(index) === 'warn' ? 'expert-warn' : '', doc.related?.has(index) ? 'related' : ''].filter(Boolean).join(' ');
      const style = `top:${row * height}px;${color && !marked && !ignored ? `--row-bg:${color.bg};--row-fg:${color.fg};` : ''}`;
      html.push(`<div class="${classes}" data-index="${index}" data-row="${row}" role="row" aria-selected="${index === doc.selected}" style="${style}"${color ? ` data-color-rule="${escapeHtml(color.name)}"` : ''}>${cols.map((c) => `<div class="pl-td ${['no', 'length', 'caplen', 'srcport', 'dstport', 'stream'].includes(c.kind) ? 'num' : ''}" role="gridcell">${c.kind === 'no' ? this.relationGlyph(doc, index) : ''}${escapeHtml(this.cellText(doc, c, index, doc.timeRefs.size || s.timeFormat === 'delta_displayed' ? doc.displayed.indexOf(index) : row))}</div>`).join('')}</div>`);
    }
    this.rows.innerHTML = html.join('');
  }

  /** The "related packet" mark in the No. column: request / response of the selected packet. */
  relationGlyph(doc, index) {
    const rel = doc.relations?.get(index);
    return rel ? `<span class="pl-rel ${rel}" aria-hidden="true"></span>` : '';
  }

  cellText(doc, column, index, row) {
    const s = doc.summary(index) ?? {};
    const frame = doc.frames[index];
    const settings = this.app.settings();
    switch (column.kind) {
      case 'no': return String(index + 1);
      case 'time': return formatTime(doc, index, row, settings.timeFormat, settings.timePrecision);
      case 'abs_time': return formatTime(doc, index, row, 'abs_ymd', settings.timePrecision);
      case 'delta': return formatTime(doc, index, row, 'delta', settings.timePrecision);
      case 'src': return s.src ?? '';
      case 'dst': return s.dst ?? '';
      case 'protocol': return s.protocol ?? '';
      case 'length': return String(s.length ?? frame.len);
      case 'caplen': return String(frame.caplen);
      case 'info': return s.info ?? '';
      case 'srcport': return s.srcport != null ? String(s.srcport) : '';
      case 'dstport': return s.dstport != null ? String(s.dstport) : '';
      case 'iface': return doc.file.interfaces?.[frame.iface ?? 0]?.name ?? String(frame.iface ?? 0);
      case 'comment': return frame.comment ?? '';
      case 'expert': { const e = doc.expertOf(index); return e ? this.app.t(`expert.${e}`) : ''; }
      case 'stream': return s.tcpStream != null ? String(s.tcpStream) : s.udpStream != null ? String(s.udpStream) : '';
      case 'hw_src': case 'hw_dst': case 'net_src': case 'net_dst': {
        const d = doc.dissection(index);
        const key = { hw_src: 'hwSrc', hw_dst: 'hwDst', net_src: 'netSrc', net_dst: 'netDst' }[column.kind];
        return d.columns?.[key] ?? '';
      }
      case 'field': return fieldColumn(doc.dissection(index), column.field);
      default: return '';
    }
  }

  /** Keeps the selected row's highlight right without a full redraw. */
  markSelection() {
    const doc = this.app.doc();
    for (const row of this.rows.querySelectorAll('.pl-row')) {
      const on = Number(row.dataset.index) === doc?.selected;
      row.classList.toggle('selected', on);
      row.setAttribute('aria-selected', String(on));
    }
  }

  /** Scrolls so that frame `index` is in view (centre when far away). */
  reveal(index, { center = false } = {}) {
    const row = this.list().indexOf(index);
    if (row < 0) return;
    const height = this.rowHeight();
    const top = row * height;
    const view = this.scroller.clientHeight;
    if (center || top < this.scroller.scrollTop || top + height > this.scroller.scrollTop + view) {
      this.scroller.scrollTop = center ? top - view / 2 + height / 2 : top < this.scroller.scrollTop ? top : top + height - view;
    }
    this.draw(true);
  }

  scrollToEnd() {
    this.scroller.scrollTop = this.scroller.scrollHeight;
    this.draw();
  }

  atEnd() { return this.scroller.scrollTop + this.scroller.clientHeight >= this.scroller.scrollHeight - this.rowHeight() * 2; }

  focus() { this.scroller.focus({ preventScroll: true }); }

  // ───────────────────────── input

  onRowPointer(event) {
    if (event.button !== 0) return;
    const row = event.target.closest('[data-index]');
    if (!row) return;
    this.focus();
    this.app.onSelect(Number(row.dataset.index), event);
  }

  onKey(event) {
    const doc = this.app.doc();
    if (!doc) return;
    const list = this.list();
    const row = list.indexOf(doc.selected);
    const page = Math.max(1, Math.floor(this.scroller.clientHeight / this.rowHeight()) - 1);
    const go = (target) => { event.preventDefault(); const next = list[Math.max(0, Math.min(list.length - 1, target))]; if (next != null) { this.app.onSelect(next, event); this.reveal(next); } };
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowDown') go(row + 1);
    else if (event.key === 'ArrowUp') go(row < 0 ? 0 : row - 1);
    else if (event.key === 'PageDown') go(row + page);
    else if (event.key === 'PageUp') go(row - page);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(list.length - 1);
    else if (event.key === 'Enter' && doc.selected >= 0) { event.preventDefault(); this.app.onOpen?.(doc.selected); }
  }

  /** Header: a click sorts, the edge resizes (double-click fits), dragging moves the column. */
  onHeadPointer(event) {
    if (event.button !== 0) return;
    const resize = event.target.closest('[data-resize]');
    const cell = event.target.closest('[data-col]');
    if (!cell) return;
    const columns = this.app.settings().columns.map((c) => ({ ...c }));
    const id = resize ? resize.dataset.resize : cell.dataset.col;
    const column = columns.find((c) => c.id === id);
    const startX = event.clientX;
    const startWidth = column.width;
    let moved = false;
    if (resize && event.detail >= 2) { this.fitColumn(id); return; }
    const move = (e) => {
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 4) return;
      moved = true;
      if (resize) {
        column.width = Math.max(30, Math.round(startWidth + dx));
        this.app.settings().columns.find((c) => c.id === id).width = column.width;
        this.host.style.setProperty('--pl-template', this.columns().map((c) => `${c.width}px`).join(' '));
        this.host.style.setProperty('--pl-width', `${this.columns().reduce((sum, c) => sum + c.width, 0)}px`);
        this.head.querySelector('.pl-head-inner').style.gridTemplateColumns = '';
      } else {
        cell.classList.add('dragging');
        cell.style.transform = `translateX(${dx}px)`;
      }
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cell.classList.remove('dragging');
      cell.style.transform = '';
      if (!moved) { if (!resize) this.setSort(id); return; }
      if (resize) { this.app.onColumnsChanged?.(columns); return; }
      // Dropped: the column goes before the header cell under the pointer.
      const over = document.elementFromPoint(e.clientX, cell.getBoundingClientRect().top + 4)?.closest?.('[data-col]');
      if (!over || over.dataset.col === id) return;
      const from = columns.findIndex((c) => c.id === id);
      const [item] = columns.splice(from, 1);
      const to = columns.findIndex((c) => c.id === over.dataset.col);
      columns.splice(e.clientX > over.getBoundingClientRect().left + over.offsetWidth / 2 ? to + 1 : to, 0, item);
      this.app.onColumnsChanged?.(columns);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Width that fits the column's header and the rows in view. */
  fitColumn(id) {
    const doc = this.app.doc();
    const columns = this.app.settings().columns.map((c) => ({ ...c }));
    const column = columns.find((c) => c.id === id);
    if (!column || !doc) return;
    const canvas = this.fitCanvas ?? (this.fitCanvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    context.font = getComputedStyle(this.rows).font;
    const list = this.list();
    const first = Math.max(0, Math.floor(this.scroller.scrollTop / this.rowHeight()));
    let width = context.measureText(columnTitle(column, this.app.t)).width + 34;
    for (let row = first; row < Math.min(list.length, first + 200); row += 1) width = Math.max(width, context.measureText(this.cellText(doc, column, list[row], row)).width + 18);
    column.width = Math.min(1600, Math.ceil(width));
    this.app.onColumnsChanged?.(columns);
  }

  /** View › Resize Columns: every column fits its content. */
  fitAll() { for (const c of this.columns()) this.fitColumn(c.id); }
}

export { displayValue };

// The hex view: offset column, hex (or decimal / octal / binary) cells in groups, the text column in a chosen
// character set. Only the rows in sight exist (any file size: the scroll bar maps onto the row count, also past
// what a browser can scroll); bytes come from the document's page cache. The caret is a byte and a nibble in
// the hex pane or a byte in the text pane; Shift extends the selection; typing overwrites or inserts; Insert
// toggles the mode. Colours: byte classes (00, text, control, high, FF), modified bytes, selection, bookmarks,
// template fields, search results, differences; the caret's row and column are lit (crosshair).
import { encodeChar, textCells, unitOf } from './charsets.js';

const MAX_SCROLL = 8_000_000;
const DIGITS = { hex: 2, dec: 3, oct: 3, bin: 8 };

export function formatOffset(value, base, digits, upper = true) {
  if (base === 'dec') return String(value).padStart(digits, '0');
  if (base === 'oct') return value.toString(8).padStart(digits, '0');
  const s = value.toString(16).padStart(digits, '0');
  return upper ? s.toUpperCase() : s;
}

export function offsetDigits(max, base) {
  const n = base === 'dec' ? String(max).length : base === 'oct' ? max.toString(8).length : max.toString(16).length;
  return Math.max(base === 'hex' ? 8 : base === 'oct' ? 11 : 10, n);
}

export function formatByte(b, base, upper) {
  if (base === 'dec') return String(b).padStart(3, '0');
  if (base === 'oct') return b.toString(8).padStart(3, '0');
  if (base === 'bin') return b.toString(2).padStart(8, '0');
  const s = b.toString(16).padStart(2, '0');
  return upper ? s.toUpperCase() : s;
}

const byteClass = (b) => (b === 0 ? 'z' : b === 0xFF ? 'f' : b >= 0x20 && b < 0x7F ? 'p' : b < 0x20 || b === 0x7F ? 'c' : 'h');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class HexView {
  /**
   * host: the element to fill. opts:
   *   doc: HexDocument; settings(): the app settings; edit(op, args) → Promise (the app applies it through the core);
   *   onCaret(view); onContextMenu(event, view); notify(kind, textKey); toggleInsert(); marks(view) → extra ranges
   *   [{ start, end, color?, cls? }]; t(key) for tooltips; onScroll(view) (compare: the other side follows).
   */
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
    this.doc = opts.doc;
    this.caret = 0;
    this.nibble = 0;
    this.anchor = null;
    this.pane = 'hex';
    this.topRow = 0;
    this.metrics = null;
    this.layout = null;
    this.dragging = false;
    this.frame = 0;
    this.destroyed = false;
    host.classList.add('hx-host');
    host.innerHTML = `<div class="hx-view" data-pane="hex">
        <textarea class="hx-input" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="hex editor"></textarea>
        <div class="hx-header"></div>
        <div class="hx-body"><div class="hx-rows"></div></div>
        <div class="hx-vscroll" aria-hidden="true"><div class="hx-vspace"></div></div>
        <span class="hx-probe" aria-hidden="true">0000000000</span>
      </div>`;
    this.el = host.querySelector('.hx-view');
    this.input = this.el.querySelector('.hx-input');
    this.header = this.el.querySelector('.hx-header');
    this.body = this.el.querySelector('.hx-body');
    this.rowsEl = this.el.querySelector('.hx-rows');
    this.vscroll = this.el.querySelector('.hx-vscroll');
    this.vspace = this.el.querySelector('.hx-vspace');
    this.probe = this.el.querySelector('.hx-probe');
    this.unlisten = this.doc.onChange(() => this.schedule());
    this.bind();
    this.resizeObserver = new ResizeObserver(() => { this.layout = null; this.schedule(); });
    this.resizeObserver.observe(this.body);
    this.applySettings();
  }

  get s() { return this.opts.settings(); }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.unlisten?.();
    this.resizeObserver?.disconnect();
    this.host.innerHTML = '';
  }

  focus() { this.input.focus({ preventScroll: true }); }

  applySettings() {
    const s = this.s;
    this.el.style.setProperty('--hx-font-size', `${s.hexFontSize}px`);
    this.el.style.setProperty('--hx-line', String(s.hexLineHeight));
    this.el.style.setProperty('--hx-font', s.hexFontFamily ? `"${s.hexFontFamily}", ui-monospace, monospace` : 'ui-monospace, "Cascadia Mono", Consolas, "D2Coding", "Courier New", monospace');
    this.el.classList.toggle('no-colors', !s.byteColors);
    this.el.classList.toggle('no-modified', !s.highlightModified);
    this.el.classList.toggle('no-text', !s.showText);
    this.el.classList.toggle('no-offsets', !s.showOffsets);
    this.el.classList.toggle('no-header', !s.showHeader);
    this.metrics = null;
    this.layout = null;
    this.schedule();
  }

  measure() {
    const rect = this.probe.getBoundingClientRect();
    const ch = rect.width / 10 || 8;
    const rowH = Math.max(12, Math.round(rect.height * 1) || Math.round(this.s.hexFontSize * this.s.hexLineHeight));
    this.metrics = { ch, rowH };
    this.el.style.setProperty('--hx-ch', `${ch}px`);
    this.el.style.setProperty('--hx-row', `${rowH}px`);
  }

  /** Columns, cell widths, offset digits. */
  computeLayout() {
    if (!this.metrics) this.measure();
    const s = this.s;
    const { ch } = this.metrics;
    const cellChars = DIGITS[s.valueBase] ?? 2;
    const group = Math.max(1, s.groupSize);
    const digits = offsetDigits(this.doc.len + (s.baseAddress || 0), s.offsetBase) + (s.offsetPrefix ? 2 : 0);
    let cols = s.bytesPerRow;
    if (!cols) {
      // Auto: as many bytes as fit, in whole groups (at least 4).
      const width = this.body.clientWidth - (s.showOffsets ? (digits + 2) * ch : 0) - 24;
      const per = (cellChars + 1) * ch + (s.showText ? ch : 0) + (group > 1 ? ch / group : 0);
      const unit = Math.max(group, 4);
      cols = Math.max(unit, Math.floor(width / per / unit) * unit);
    }
    this.layout = { cols, cellChars, group, digits, unit: unitOf(s.charset) };
    return this.layout;
  }

  totalRows() {
    this.ready();
    const { cols } = this.layout;
    const extra = this.doc.resizable && !this.doc.readonly ? 1 : 0;
    return Math.max(1, Math.ceil((this.doc.len + extra) / cols));
  }

  /** Metrics and layout now (a key or a call can come before the first frame is drawn). */
  ready() { if (!this.metrics) this.measure(); if (!this.layout) this.computeLayout(); }

  visibleRows() { this.ready(); return Math.max(1, Math.floor(this.body.clientHeight / this.metrics.rowH)); }

  maxTop() { return Math.max(0, this.totalRows() - this.visibleRows()); }

  /** The scroll bar: its spacer stands for every row (scaled when there are too many). */
  syncScrollbar() {
    const total = this.totalRows() * this.metrics.rowH;
    const h = Math.min(total, MAX_SCROLL);
    this.vspace.style.height = `${h}px`;
    const room = h - this.vscroll.clientHeight;
    const max = this.maxTop();
    const want = max > 0 && room > 0 ? Math.round((this.topRow / max) * room) : 0;
    if (Math.abs(this.vscroll.scrollTop - want) > 1) { this.ignoreScroll = true; this.vscroll.scrollTop = want; }
  }

  scrollToRow(row) {
    const top = Math.max(0, Math.min(this.maxTop(), Math.round(row)));
    if (top === this.topRow) return;
    this.topRow = top;
    this.schedule();
    this.opts.onScroll?.(this);
  }

  /** Scrolls so `offset` is in sight (centred when it was far away). */
  reveal(offset, { center = false } = {}) {
    if (!this.layout) this.computeLayout();
    const row = Math.floor(offset / this.layout.cols);
    const rows = this.visibleRows();
    if (center || row < this.topRow - rows || row > this.topRow + 2 * rows) this.scrollToRow(row - Math.floor(rows / 3));
    else if (row < this.topRow) this.scrollToRow(row);
    else if (row >= this.topRow + rows) this.scrollToRow(row - rows + 1);
  }

  selection() {
    if (this.anchor == null || this.anchor === this.caret) return { start: this.caret, end: this.caret, length: 0 };
    const start = Math.min(this.anchor, this.caret);
    const end = Math.min(this.doc.len, Math.max(this.anchor, this.caret) + 1);
    return { start, end, length: end - start };
  }

  /** Selects [start, end) (end exclusive) and shows it. */
  select(start, end, { reveal = true, center = false } = {}) {
    const len = this.doc.len;
    start = Math.max(0, Math.min(len, start));
    end = Math.max(start, Math.min(len, end));
    if (end - start <= 1) { this.anchor = null; this.caret = start; } else { this.anchor = start; this.caret = end - 1; }
    this.nibble = 0;
    if (reveal) this.reveal(start, { center });
    this.changed();
  }

  setCaret(offset, { extend = false, reveal = true } = {}) {
    const max = this.doc.resizable && !this.doc.readonly ? this.doc.len : Math.max(0, this.doc.len - 1);
    const next = Math.max(0, Math.min(max, offset));
    if (extend) { if (this.anchor == null) this.anchor = this.caret; } else this.anchor = null;
    this.caret = next;
    this.nibble = 0;
    if (reveal) this.reveal(next);
    this.changed();
  }

  changed() { this.schedule(); this.opts.onCaret?.(this); }

  schedule() {
    if (this.destroyed || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  /** Draws the rows in sight (fetching missing pages, then drawing again). */
  render() {
    if (this.destroyed || !this.host.isConnected) return;
    if (!this.metrics) this.measure();
    if (!this.layout) this.computeLayout();
    const s = this.s;
    const { cols, cellChars, group, digits } = this.layout;
    this.topRow = Math.min(this.topRow, this.maxTop());
    const rows = this.visibleRows() + 1;
    const start = this.topRow * cols;
    const span = rows * cols;
    const len = this.doc.len;
    const ctx = 4;
    if (!this.doc.has(Math.max(0, start - ctx), span + ctx)) {
      this.doc.ensure(Math.max(0, start - ctx), span + ctx).then(() => this.schedule()).catch((error) => this.opts.notify?.('error', String(error?.message ?? error)));
    }
    this.el.dataset.pane = this.pane;
    this.el.classList.toggle('insert', Boolean(s.insertMode));
    this.el.style.setProperty('--hx-cell', String(cellChars));
    // Marks: selection, bookmarks, template, search, diff — those overlapping what is in sight.
    const sel = this.selection();
    const end = Math.min(len, start + span);
    const marks = (this.opts.marks?.(this) ?? []).filter((m) => m.end > start && m.start < end);
    const modified = this.doc.ranges('modified', start, span);
    const holes = this.doc.ranges('holes', start, span);
    const inRanges = (list, o) => list.some((r) => o >= r[0] && o < r[1]);
    const caretCol = this.caret % cols;
    const caretRow = Math.floor(this.caret / cols);
    const base = s.baseAddress || 0;
    const upper = s.uppercase;
    // header
    if (s.showHeader) {
      let head = `<span class="hx-off">${' '.repeat(digits)}</span><span class="hx-hex">`;
      for (let c = 0; c < cols; c += 1) {
        const gap = group > 1 && (c + 1) % group === 0 && c + 1 < cols ? ' g' : '';
        head += `<span class="hx-b${c === caretCol && s.crosshair ? ' x' : ''}${gap}">${formatByte(c % 256, s.valueBase === 'bin' ? 'dec' : s.valueBase, upper).slice(-cellChars).padStart(cellChars, ' ')}</span>`;
      }
      head += '</span>';
      if (s.showText) head += `<span class="hx-txt">${Array.from({ length: cols }, (_, c) => `<span class="hx-c${c === caretCol && s.crosshair ? ' x' : ''}">${(c % 16).toString(16).toUpperCase()}</span>`).join('')}</span>`;
      this.header.innerHTML = head;
      this.header.style.transform = `translateX(${-this.body.scrollLeft}px)`;
    }
    let html = '';
    const have = this.doc.has(Math.max(0, start - ctx), span + ctx);
    for (let r = 0; r < rows; r += 1) {
      const rowStart = start + r * cols;
      if (rowStart > len || (rowStart === len && !(this.doc.resizable && !this.doc.readonly))) break;
      const n = Math.max(0, Math.min(cols, len - rowStart));
      const bytes = have ? this.doc.slice(rowStart, n) : null;
      const prev = have && s.showText && rowStart > 0 ? this.doc.slice(Math.max(0, rowStart - ctx), Math.min(ctx, rowStart)) : null;
      const cells = bytes && s.showText ? textCells(bytes, rowStart, s.charset, prev) : null;
      const rowIndex = this.topRow + r;
      const off = formatOffset(rowStart + base, s.offsetBase, digits - (s.offsetPrefix ? 2 : 0), upper);
      let hex = '';
      let txt = '';
      for (let c = 0; c < cols; c += 1) {
        const o = rowStart + c;
        const gap = group > 1 && (c + 1) % group === 0 && c + 1 < cols ? ' g' : '';
        if (c >= n) {
          const caretHere = o === this.caret && o === len;
          hex += `<span class="hx-b e${gap}${caretHere ? ' k' : ''}" data-i="${c}">${caretHere ? '__'.padEnd(cellChars, '_') : ' '.repeat(cellChars)}</span>`;
          if (s.showText) txt += `<span class="hx-c e${caretHere ? ' k' : ''}" data-i="${c}"> </span>`;
          continue;
        }
        let cls = '';
        let style = '';
        const b = bytes ? bytes[c] : undefined;
        if (holes.length && inRanges(holes, o)) cls += ' u';
        else if (b !== undefined) cls += ` ${byteClass(b)}`;
        if (modified.length && inRanges(modified, o)) cls += ' m';
        for (const m of marks) if (o >= m.start && o < m.end) { if (m.color) style = ` style="--mk:${m.color}"`; cls += ` ${m.cls ?? 'mk'}`; }
        if (sel.length && o >= sel.start && o < sel.end) cls += ' s';
        if (o === this.caret) cls += this.nibble ? ' k n1' : ' k';
        if (s.crosshair && c === caretCol && rowIndex !== caretRow) cls += ' x';
        const shown = cls.includes(' u') ? '?'.repeat(cellChars) : b === undefined ? ' '.repeat(cellChars) : formatByte(b, s.valueBase, upper);
        hex += `<span class="hx-b${cls}${gap}" data-i="${c}"${style}>${shown}</span>`;
        if (s.showText) {
          const cell = cells?.[c];
          const t = cls.includes(' u') ? '?' : !cell ? ' ' : cell.cont ? '' : cell.text || '.';
          txt += `<span class="hx-c${cls}${cell && !cell.text && !cell.cont ? ' np' : ''}${cell?.cont ? ' cont' : ''}" data-i="${c}"${style}>${t ? esc(t) : '&#8203;'}</span>`;
        }
      }
      html += `<div class="hx-row${s.crosshair && rowIndex === caretRow ? ' cur' : ''}" data-row="${rowStart}"><span class="hx-off">${s.offsetPrefix ? '0x' : ''}${off}</span><span class="hx-hex">${hex}</span>${s.showText ? `<span class="hx-txt">${txt}</span>` : ''}</div>`;
    }
    this.rowsEl.innerHTML = html;
    this.syncScrollbar();
    this.updateInputPlace();
  }

  /** The hidden text box sits on the caret, so an input method's candidate window opens there. */
  updateInputPlace() {
    const cell = this.rowsEl.querySelector('.hx-row .k');
    if (!cell) return;
    const box = cell.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    this.input.style.left = `${box.left - host.left}px`;
    this.input.style.top = `${box.top - host.top}px`;
  }

  /** The byte under a point: { offset, pane } or null. */
  hit(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest?.('.hx-b, .hx-c');
    const row = el?.closest?.('.hx-row');
    if (row && cell && row.contains(cell)) return { offset: Number(row.dataset.row) + Number(cell.dataset.i), pane: cell.classList.contains('hx-c') ? 'text' : 'hex' };
    if (row) {
      // Beyond the cells of the row: its last byte.
      const start = Number(row.dataset.row);
      return { offset: Math.min(this.doc.len, start + this.layout.cols - 1), pane: this.pane };
    }
    return null;
  }

  bind() {
    this.vscroll.addEventListener('scroll', () => {
      if (this.ignoreScroll) { this.ignoreScroll = false; return; }
      const room = this.vspace.offsetHeight - this.vscroll.clientHeight;
      const top = room > 0 ? Math.round((this.vscroll.scrollTop / room) * this.maxTop()) : 0;
      if (top !== this.topRow) { this.topRow = top; this.schedule(); this.opts.onScroll?.(this); }
    });
    this.body.addEventListener('scroll', () => { this.header.style.transform = `translateX(${-this.body.scrollLeft}px)`; });
    this.el.addEventListener('wheel', (event) => {
      if (event.ctrlKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const lines = event.deltaMode === 1 ? event.deltaY : event.deltaMode === 2 ? event.deltaY * this.visibleRows() : event.deltaY / this.metrics.rowH;
      this.wheelRest = (this.wheelRest ?? 0) + lines;
      const step = Math.trunc(this.wheelRest);
      if (step) { this.wheelRest -= step; this.scrollToRow(this.topRow + step); }
    }, { passive: false });
    this.body.addEventListener('pointerdown', (event) => {
      if (event.button === 2) {
        const at = this.hit(event.clientX, event.clientY);
        const sel = this.selection();
        if (at && !(sel.length && at.offset >= sel.start && at.offset < sel.end)) { this.pane = at.pane; this.setCaret(at.offset, { reveal: false }); }
        return;
      }
      if (event.button !== 0) return;
      const at = this.hit(event.clientX, event.clientY);
      if (!at) return;
      event.preventDefault();
      this.focus();
      this.pane = at.pane;
      this.setCaret(at.offset, { extend: event.shiftKey, reveal: false });
      this.dragging = true;
      this.body.setPointerCapture(event.pointerId);
      let lastY = event.clientY;
      const auto = setInterval(() => {
        if (!this.dragging) return;
        const box = this.body.getBoundingClientRect();
        if (lastY < box.top) this.scrollToRow(this.topRow - Math.ceil((box.top - lastY) / this.metrics.rowH));
        else if (lastY > box.bottom) this.scrollToRow(this.topRow + Math.ceil((lastY - box.bottom) / this.metrics.rowH));
      }, 60);
      const move = (e) => {
        lastY = e.clientY;
        const box = this.body.getBoundingClientRect();
        const y = Math.max(box.top + 2, Math.min(box.bottom - 2, e.clientY));
        const hit = this.hit(e.clientX, y);
        if (hit && hit.offset !== this.caret) { if (this.anchor == null) this.anchor = this.caret; this.caret = Math.min(hit.offset, Math.max(0, this.doc.len - 1)); this.changed(); }
      };
      const up = () => { this.dragging = false; clearInterval(auto); this.body.removeEventListener('pointermove', move); this.body.removeEventListener('pointerup', up); this.body.removeEventListener('pointercancel', up); };
      this.body.addEventListener('pointermove', move);
      this.body.addEventListener('pointerup', up);
      this.body.addEventListener('pointercancel', up);
    });
    this.body.addEventListener('dblclick', (event) => {
      const at = this.hit(event.clientX, event.clientY);
      if (!at) return;
      // A whole group (hex) or a run of text (text pane).
      if (at.pane === 'hex') { const g = this.layout.group; const s0 = Math.floor(at.offset / g) * g; this.select(s0, s0 + g, { reveal: false }); return; }
      let a = at.offset; let b = at.offset;
      const word = (o) => { const v = this.doc.byte(o); return v !== undefined && ((v >= 0x30 && v <= 0x39) || (v >= 0x41 && v <= 0x5A) || (v >= 0x61 && v <= 0x7A) || v === 0x5F || v >= 0x80); };
      while (a > 0 && word(a - 1) && at.offset - a < 4096) a -= 1;
      while (b < this.doc.len && word(b) && b - at.offset < 4096) b += 1;
      if (b > a) this.select(a, b, { reveal: false });
    });
    this.body.addEventListener('contextmenu', (event) => { event.preventDefault(); this.opts.onContextMenu?.(event, this); });
    this.input.addEventListener('keydown', (event) => this.onKey(event));
    this.input.addEventListener('input', (event) => { if (!event.isComposing) this.onText(); });
    this.input.addEventListener('compositionend', () => this.onText());
    this.input.addEventListener('focus', () => this.el.classList.add('focused'));
    this.input.addEventListener('blur', () => this.el.classList.remove('focused'));
  }

  onKey(event) {
    if (event.isComposing) return;
    this.ready();
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    const cols = this.layout?.cols ?? 16;
    const ext = event.shiftKey;
    const page = Math.max(1, this.visibleRows() - 1) * cols;
    const move = (to) => { event.preventDefault(); this.setCaret(to, { extend: ext }); };
    switch (key) {
      case 'ArrowLeft': return move(mod ? this.caret - this.layout.group : this.caret - 1);
      case 'ArrowRight': return move(mod ? this.caret + this.layout.group : this.caret + 1);
      case 'ArrowUp': if (mod) { event.preventDefault(); return this.scrollToRow(this.topRow - 1); } return move(this.caret - cols);
      case 'ArrowDown': if (mod) { event.preventDefault(); return this.scrollToRow(this.topRow + 1); } return move(this.caret + cols);
      case 'PageUp': return move(this.caret - page);
      case 'PageDown': return move(this.caret + page);
      case 'Home': return move(mod ? 0 : this.caret - (this.caret % cols));
      case 'End': return move(mod ? this.doc.len : this.caret - (this.caret % cols) + cols - 1);
      case 'Tab': event.preventDefault(); this.pane = this.pane === 'hex' && this.s.showText ? 'text' : 'hex'; this.nibble = 0; this.changed(); return undefined;
      case 'Insert': event.preventDefault(); this.opts.toggleInsert?.(); return undefined;
      case 'Escape': if (this.anchor != null) { event.preventDefault(); this.anchor = null; this.changed(); } return undefined;
      case 'Backspace': event.preventDefault(); return this.backspace();
      case 'Delete': if (mod) return undefined; event.preventDefault(); return this.deleteKey();
      default: break;
    }
    if (mod || event.altKey) return undefined;
    if (this.pane === 'hex' && key.length === 1) {
      event.preventDefault();
      const digit = this.digitOf(key);
      if (digit == null) return undefined;
      return this.typeDigit(digit);
    }
    return undefined;
  }

  digitOf(key) {
    const base = this.s.valueBase;
    if (base === 'hex') return /^[0-9a-f]$/i.test(key) ? parseInt(key, 16) : null;
    return null;
  }

  canEdit(resize = false) {
    if (this.doc.readonly) { this.opts.notify?.('warning', 'edit.readonly'); return false; }
    if (resize && !this.doc.resizable) { this.opts.notify?.('warning', 'edit.fixedSize'); return false; }
    return true;
  }

  /** A typed hex digit: the high nibble, then the low one (overwriting or inserting). */
  async typeDigit(d) {
    const insert = this.s.insertMode;
    if (!this.canEdit(insert || this.caret >= this.doc.len)) return;
    const sel = this.selection();
    if (sel.length > 1) {
      if (insert) { await this.opts.edit('delete', { offset: sel.start, length: sel.length }); }
      this.anchor = null;
      this.caret = sel.start;
      this.nibble = 0;
    }
    const at = this.caret;
    if (this.nibble === 0) {
      if (insert || at >= this.doc.len) await this.opts.edit('insert', { offset: at, data: Uint8Array.of(d << 4), kind: 'type', merge: true });
      else {
        await this.doc.ensure(at, 1);
        const old = this.doc.byte(at) ?? 0;
        await this.opts.edit('write', { offset: at, data: Uint8Array.of((d << 4) | (old & 0x0F)), kind: 'type', merge: true });
      }
      this.nibble = 1;
    } else {
      await this.doc.ensure(at, 1);
      const old = this.doc.byte(at) ?? 0;
      await this.opts.edit('write', { offset: at, data: Uint8Array.of((old & 0xF0) | d), kind: 'type', merge: true });
      this.caret = at + 1;
      this.nibble = 0;
    }
    this.reveal(this.caret);
    this.changed();
  }

  /** Text typed in the text pane (also from an input method). */
  async onText() {
    const text = this.input.value;
    this.input.value = '';
    if (!text) return;
    if (this.pane === 'hex') {
      for (const ch of text) { const d = this.digitOf(ch); if (d != null) await this.typeDigit(d); }
      return;
    }
    const parts = [];
    for (const ch of text) {
      const bytes = encodeChar(ch, this.s.charset);
      if (!bytes) { this.opts.notify?.('warning', 'edit.cannotEncode'); return; }
      parts.push(...bytes);
    }
    const data = Uint8Array.from(parts);
    const insert = this.s.insertMode;
    if (!this.canEdit(insert || this.caret + data.length > this.doc.len)) return;
    const sel = this.selection();
    let at = this.caret;
    if (sel.length > 1) { at = sel.start; if (insert) await this.opts.edit('delete', { offset: sel.start, length: sel.length }); }
    await this.opts.edit(insert ? 'insert' : 'write', { offset: at, data, kind: 'type', merge: true });
    this.anchor = null;
    this.caret = Math.min(at + data.length, this.doc.len);
    this.nibble = 0;
    this.reveal(this.caret);
    this.changed();
  }

  async backspace() {
    const sel = this.selection();
    if (sel.length) { if (this.canEdit(true)) { await this.opts.edit('delete', { offset: sel.start, length: sel.length }); this.setCaret(sel.start); } return; }
    if (this.nibble) { this.nibble = 0; this.changed(); return; }
    if (this.s.insertMode && this.caret > 0) {
      if (!this.canEdit(true)) return;
      await this.opts.edit('delete', { offset: this.caret - 1, length: 1 });
      this.setCaret(this.caret - 1);
      return;
    }
    this.setCaret(this.caret - 1);
  }

  async deleteKey() {
    const sel = this.selection();
    const offset = sel.length ? sel.start : this.caret;
    const length = sel.length || 1;
    if (offset >= this.doc.len) return;
    if (!this.canEdit(true)) return;
    await this.opts.edit('delete', { offset, length });
    this.setCaret(offset);
  }

  /** Offsets of the first byte of each visible row (tests, the tutorial). */
  visibleRange() {
    if (!this.layout) this.computeLayout();
    return { start: this.topRow * this.layout.cols, end: Math.min(this.doc.len, (this.topRow + this.visibleRows()) * this.layout.cols), cols: this.layout.cols };
  }
}

// The data grid under the chart: a spreadsheet of the table. Only the visible rows are in the page (100 000-row
// files scroll smoothly). One cell is active; arrows, Tab and Enter move, typing or F2 / double-click edits,
// Delete clears, Ctrl+C / Ctrl+V copy and paste tab-separated blocks (Excel ranges), a click on a header picks the
// column, a double-click renames it. The header shows each column's type and the role it plays in the chart.
import { cellText, columnLetter } from '../domain/data/table.js';
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';

const TYPE_ICON = { number: 'typeNumber', text: 'typeText', date: 'typeDate' };
const OVERSCAN = 8;

export class DataGrid {
  /**
   * api: { t, doc(), settings(), rows() (visible row indices), roleOf(col) → { label, color } | null,
   *        onEdit(r, c, text), onRename(c, name), onPaste(r, c, text), onClear(cells), onSelect(cell),
   *        onContext(event, { row, col, header }), onSort(c) }
   */
  constructor(host, api) {
    this.host = host;
    this.api = api;
    this.active = { row: 0, col: 0 };
    this.anchor = null;
    this.editing = null;
    host.innerHTML = `<div class="dg-wrap" tabindex="0" role="grid" aria-label="${escapeHtml(api.t('grid.title'))}">
      <div class="dg-head"></div>
      <div class="dg-scroll"><div class="dg-spacer"></div><div class="dg-rows"></div></div>
      <input class="dg-editor" type="text" hidden spellcheck="false" autocomplete="off" />
    </div>`;
    this.wrap = host.querySelector('.dg-wrap');
    this.headEl = host.querySelector('.dg-head');
    this.scroll = host.querySelector('.dg-scroll');
    this.spacer = host.querySelector('.dg-spacer');
    this.rowsEl = host.querySelector('.dg-rows');
    this.editor = host.querySelector('.dg-editor');
    this.scroll.addEventListener('scroll', () => { this.headEl.scrollLeft = this.scroll.scrollLeft; this.drawRows(); this.placeEditor(); }, { passive: true });
    this.wrap.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.wrap.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    this.wrap.addEventListener('keydown', (e) => this.onKey(e));
    this.wrap.addEventListener('contextmenu', (e) => this.onContext(e));
    this.wrap.addEventListener('copy', (e) => this.onCopy(e));
    this.wrap.addEventListener('paste', (e) => this.onPaste(e));
    this.editor.addEventListener('keydown', (e) => this.onEditorKey(e));
    this.editor.addEventListener('blur', () => this.commit());
    this.resizer = new ResizeObserver(() => this.drawRows());
    this.resizer.observe(this.scroll);
  }

  destroy() { this.destroyed = true; this.editing = null; this.resizer.disconnect(); }

  get table() { return this.api.doc()?.table; }
  rowHeight() { return this.api.settings().rowHeight ?? 26; }
  widths() {
    const table = this.table;
    if (!table) return [];
    return table.columns.map((c, i) => {
      const units = (text) => [...String(text)].reduce((a, ch) => a + (/[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch) ? 1.85 : 1), 0);
      const sample = table.rows.slice(0, 60).map((r) => units(cellText(r[i])));
      return Math.max(90, Math.min(280, 30 + 7.4 * Math.max(units(c.name) + 7, ...sample)));
    });
  }

  render() {
    const table = this.table;
    if (!table) { this.headEl.innerHTML = ''; this.rowsEl.innerHTML = ''; return; }
    this.colWidths = this.widths();
    const t = this.api.t;
    const cols = this.colWidths.map((w) => `${w}px`).join(' ');
    this.template = `48px ${cols} 40px`;
    const total = 48 + this.colWidths.reduce((a, b) => a + b, 0) + 40;
    this.headEl.innerHTML = `<div class="dg-hrow" style="grid-template-columns:${this.template};width:${total}px">
      <div class="dg-corner" title="${escapeHtml(t('grid.selectAll'))}">#</div>
      ${table.columns.map((c, i) => {
        const role = this.api.roleOf(i);
        return `<div class="dg-hcell ${this.active.col === i ? 'active' : ''} ${role ? 'mapped' : ''}" data-col="${i}" title="${escapeHtml(`${c.name} (${t(`type.${c.type}`)})${role ? ` — ${role.label}` : ''}\n${t('grid.headerTip')}`)}">
          <span class="dg-type" data-tone-type="${c.type}">${icon(TYPE_ICON[c.type] ?? 'typeText')}</span>
          <span class="dg-name">${escapeHtml(c.name)}</span>
          ${role ? `<span class="dg-role" style="--role:${role.color ?? 'var(--accent)'}" title="${escapeHtml(role.label)}">${escapeHtml(role.short ?? '')}</span>` : ''}
          <span class="dg-letter">${columnLetter(i)}</span>
        </div>`;
      }).join('')}
      <button class="dg-addcol icon-button" data-grid-action="addColumn" title="${escapeHtml(t('action.addColumn'))}" aria-label="${escapeHtml(t('action.addColumn'))}">${icon('plus')}</button>
    </div>`;
    this.rowsEl.style.width = `${total}px`;
    this.spacer.style.width = `${total}px`;
    this.drawRows(true);
  }

  visibleRows() { return this.api.rows(); }

  drawRows(force = false) {
    const table = this.table;
    if (!table || !this.colWidths) return;
    const rows = this.visibleRows();
    const rh = this.rowHeight();
    const extra = 1; // the empty row at the end to type into
    this.spacer.style.height = `${(rows.length + extra) * rh}px`;
    const first = Math.max(0, Math.floor(this.scroll.scrollTop / rh) - OVERSCAN);
    const last = Math.min(rows.length + extra, Math.ceil((this.scroll.scrollTop + this.scroll.clientHeight) / rh) + OVERSCAN);
    const key = `${first}:${last}:${rows.length}:${this.active.row}:${this.active.col}:${this.anchor?.row}:${this.anchor?.col}:${this.version ?? 0}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    const sel = this.selectionBox();
    const html = [];
    for (let k = first; k < last; k++) {
      const r = rows[k] ?? null;
      const ghost = r == null;
      const rowIndex = ghost ? table.rows.length : r;
      const cells = table.columns.map((c, i) => {
        const v = ghost ? null : table.rows[r][i];
        const inSel = !ghost && sel && rowIndex >= sel.r0 && rowIndex <= sel.r1 && i >= sel.c0 && i <= sel.c1;
        const active = rowIndex === this.active.row && i === this.active.col;
        const bad = !ghost && c.type === 'number' && v != null && typeof v !== 'number';
        const fx = !ghost && this.api.formulaAt?.(rowIndex, i);
        return `<div class="dg-cell ${c.type === 'number' ? 'num' : ''} ${active ? 'active' : ''} ${inSel ? 'sel' : ''} ${bad ? 'bad' : ''} ${fx ? 'fx' : ''} ${this.api.hasRange?.() ? (this.api.inChart(rowIndex, i) ? 'in-chart' : 'out-chart') : ''}" data-row="${rowIndex}" data-col="${i}"${fx ? ` title="${escapeHtml(fx)}"` : ''}>${escapeHtml(cellText(v))}</div>`;
      }).join('');
      html.push(`<div class="dg-row ${ghost ? 'ghost' : ''} ${rowIndex === this.active.row ? 'current' : ''}" style="top:${k * rh}px;height:${rh}px;grid-template-columns:${this.template}" data-row="${rowIndex}"><div class="dg-rownum" data-rownum="${rowIndex}">${ghost ? '+' : rowIndex + 1}</div>${cells}<div></div></div>`);
    }
    this.rowsEl.innerHTML = html.join('');
  }

  refresh() { this.version = (this.version ?? 0) + 1; this.render(); }

  selectionBox() {
    if (!this.anchor) return null;
    return { r0: Math.min(this.anchor.row, this.active.row), r1: Math.max(this.anchor.row, this.active.row), c0: Math.min(this.anchor.col, this.active.col), c1: Math.max(this.anchor.col, this.active.col) };
  }

  /** The selected cells: { r0, r1, c0, c1 } (a single cell when nothing is spanned). */
  selection() {
    return this.selectionBox() ?? { r0: this.active.row, r1: this.active.row, c0: this.active.col, c1: this.active.col };
  }

  setActive(row, col, { extend = false, reveal = true } = {}) {
    const table = this.table;
    if (!table) return;
    const maxRow = table.rows.length;
    const nextRow = Math.max(0, Math.min(maxRow, row));
    const nextCol = Math.max(0, Math.min(table.columns.length - 1, col));
    if (extend) this.anchor ??= { ...this.active };
    else this.anchor = null;
    this.active = { row: nextRow, col: nextCol };
    if (reveal) this.reveal();
    this.drawRows(true);
    for (const h of this.headEl.querySelectorAll('.dg-hcell')) h.classList.toggle('active', Number(h.dataset.col) === nextCol);
    this.api.onSelect?.(this.active);
  }

  /** Scrolls so the active cell is in view. */
  reveal() {
    const rows = this.visibleRows();
    const k = rows.indexOf(this.active.row);
    const pos = k < 0 ? rows.length : k;
    const rh = this.rowHeight();
    const top = pos * rh;
    if (top < this.scroll.scrollTop) this.scroll.scrollTop = top;
    else if (top + rh > this.scroll.scrollTop + this.scroll.clientHeight) this.scroll.scrollTop = top + rh - this.scroll.clientHeight;
    const left = 48 + this.colWidths.slice(0, this.active.col).reduce((a, b) => a + b, 0);
    const w = this.colWidths[this.active.col] ?? 0;
    if (left < this.scroll.scrollLeft + 48) this.scroll.scrollLeft = Math.max(0, left - 48);
    else if (left + w > this.scroll.scrollLeft + this.scroll.clientWidth) this.scroll.scrollLeft = left + w - this.scroll.clientWidth;
  }

  focus() { this.wrap.focus({ preventScroll: true }); }

  onMouseDown(event) {
    if (event.target.closest('.dg-editor')) return;
    const action = event.target.closest('[data-grid-action]');
    if (action) { event.preventDefault(); this.api.onAction?.(action.dataset.gridAction); return; }
    const cell = event.target.closest('.dg-cell');
    const head = event.target.closest('.dg-hcell');
    const rownum = event.target.closest('[data-rownum]');
    if (this.editing) this.commit();
    // A right-click inside the selection keeps it: the context menu acts on the selected cells.
    if (event.button === 2 && (cell || head || rownum) && this.insideSelection(cell, head, rownum)) {
      event.preventDefault();
      this.focus();
      return;
    }
    if (cell) {
      event.preventDefault();
      this.setActive(Number(cell.dataset.row), Number(cell.dataset.col), { extend: event.shiftKey, reveal: false });
      this.focus();
      if (event.button === 0) this.dragSelect(event);
    } else if (head) {
      event.preventDefault();
      const c = Number(head.dataset.col);
      this.anchor = { row: 0, col: c };
      this.active = { row: Math.max(0, this.table.rows.length - 1), col: c };
      this.drawRows(true);
      for (const h of this.headEl.querySelectorAll('.dg-hcell')) h.classList.toggle('active', Number(h.dataset.col) === c);
      this.api.onSelect?.({ row: 0, col: c, column: true });
      this.focus();
    } else if (rownum) {
      event.preventDefault();
      const r = Number(rownum.dataset.rownum);
      this.anchor = event.shiftKey ? this.anchor ?? { row: this.active.row, col: 0 } : { row: r, col: 0 };
      this.active = { row: r, col: Math.max(0, this.table.columns.length - 1) };
      this.drawRows(true);
      this.api.onSelect?.({ row: r, col: 0, wholeRow: true });
      this.focus();
    } else if (event.target.closest('.dg-corner')) {
      event.preventDefault();
      this.anchor = { row: 0, col: 0 };
      this.active = { row: Math.max(0, this.table.rows.length - 1), col: this.table.columns.length - 1 };
      this.drawRows(true);
      this.focus();
    }
  }

  /** Whether a cell, a column header or a row number lies in the current selection (a spanned one, or the active cell). */
  insideSelection(cell, head, rownum) {
    const s = this.selection();
    const lastRow = Math.max(0, (this.table?.rows.length ?? 1) - 1);
    const lastCol = Math.max(0, (this.table?.columns.length ?? 1) - 1);
    if (cell) {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      return r >= s.r0 && r <= s.r1 && c >= s.c0 && c <= s.c1;
    }
    if (head) {
      const c = Number(head.dataset.col);
      return Boolean(this.anchor) && s.r0 === 0 && s.r1 >= lastRow && c >= s.c0 && c <= s.c1;
    }
    if (rownum) {
      const r = Number(rownum.dataset.rownum);
      return Boolean(this.anchor) && s.c0 === 0 && s.c1 >= lastCol && r >= s.r0 && r <= s.r1;
    }
    return false;
  }

  dragSelect(event) {
    const move = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.dg-cell');
      if (!el || !this.wrap.contains(el)) return;
      const r = Number(el.dataset.row);
      const c = Number(el.dataset.col);
      if (r === this.active.row && c === this.active.col) return;
      this.anchor ??= { ...this.active };
      this.active = { row: r, col: c };
      this.drawRows(true);
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    void event;
  }

  onDoubleClick(event) {
    const head = event.target.closest('.dg-hcell');
    if (head) { this.renameColumn(Number(head.dataset.col)); return; }
    const cell = event.target.closest('.dg-cell');
    if (cell) this.edit(null);
  }

  renameColumn(c) {
    const head = this.headEl.querySelector(`.dg-hcell[data-col="${c}"]`);
    if (!head) return;
    const rect = head.getBoundingClientRect();
    const base = this.wrap.getBoundingClientRect();
    this.editing = { header: true, col: c, doc: this.api.doc()?.id };
    Object.assign(this.editor.style, { left: `${rect.left - base.left}px`, top: `${rect.top - base.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    this.editor.value = this.table.columns[c].name;
    this.editor.hidden = false;
    this.editor.focus();
    this.editor.select();
  }

  /** Starts editing the active cell (with `text` typed, or the cell's value). */
  edit(text) {
    const table = this.table;
    if (!table) return;
    this.editing = { row: this.active.row, col: this.active.col, doc: this.api.doc()?.id };
    this.anchor = null;
    // A formula cell shows its formula while it is edited.
    this.editor.value = text ?? this.api.formulaAt?.(this.active.row, this.active.col) ?? cellText(table.rows[this.active.row]?.[this.active.col]);
    this.editor.hidden = false;
    this.placeEditor();
    this.editor.focus();
    if (text == null) this.editor.select();
    else this.editor.setSelectionRange(this.editor.value.length, this.editor.value.length);
  }

  placeEditor() {
    if (!this.editing || this.editing.header) return;
    const el = this.rowsEl.querySelector(`.dg-cell[data-row="${this.editing.row}"][data-col="${this.editing.col}"]`);
    if (!el) { this.editor.style.top = '-9999px'; return; }
    const rect = el.getBoundingClientRect();
    const base = this.wrap.getBoundingClientRect();
    Object.assign(this.editor.style, { left: `${rect.left - base.left}px`, top: `${rect.top - base.top}px`, width: `${Math.max(rect.width, 120)}px`, height: `${rect.height}px` });
  }

  commit(cancel = false) {
    const editing = this.editing;
    if (!editing) return;
    this.editing = null;
    const value = this.editor.value;
    this.editor.hidden = true;
    // The chart closed (or another tab came up) while a cell was being typed in: nothing to write into.
    if (this.destroyed || !this.table || editing.doc !== this.api.doc()?.id) return;
    if (cancel) { this.focus(); return; }
    if (editing.header) { if (value.trim() && value !== this.table.columns[editing.col]?.name) this.api.onRename(editing.col, value.trim()); }
    else if (value !== (this.api.formulaAt?.(editing.row, editing.col) ?? cellText(this.table.rows[editing.row]?.[editing.col]))) this.api.onEdit(editing.row, editing.col, value);
    this.focus();
  }

  onEditorKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); this.commit(true); return; }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const header = this.editing?.header;
      this.commit();
      if (!header) {
        if (event.key === 'Tab') this.setActive(this.active.row, this.active.col + (event.shiftKey ? -1 : 1));
        else this.setActive(this.active.row + (event.shiftKey ? -1 : 1), this.active.col);
      }
    }
    event.stopPropagation();
  }

  onKey(event) {
    if (this.editing) return;
    const table = this.table;
    if (!table) return;
    const mod = event.ctrlKey || event.metaKey;
    const { row, col } = this.active;
    const page = Math.max(1, Math.floor(this.scroll.clientHeight / this.rowHeight()) - 1);
    const rows = this.visibleRows();
    const k = rows.indexOf(row);
    const step = (delta) => { const next = rows[Math.max(0, Math.min(rows.length, (k < 0 ? rows.length : k) + delta))]; return next ?? table.rows.length; };
    const moves = {
      ArrowUp: () => this.setActive(mod ? rows[0] ?? 0 : step(-1), col, { extend: event.shiftKey }),
      ArrowDown: () => this.setActive(mod ? rows[rows.length - 1] ?? 0 : step(1), col, { extend: event.shiftKey }),
      ArrowLeft: () => this.setActive(row, mod ? 0 : col - 1, { extend: event.shiftKey }),
      ArrowRight: () => this.setActive(row, mod ? table.columns.length - 1 : col + 1, { extend: event.shiftKey }),
      PageUp: () => this.setActive(step(-page), col, { extend: event.shiftKey }),
      PageDown: () => this.setActive(step(page), col, { extend: event.shiftKey }),
      Home: () => this.setActive(mod ? rows[0] ?? 0 : row, 0, { extend: event.shiftKey }),
      End: () => this.setActive(mod ? rows[rows.length - 1] ?? 0 : row, table.columns.length - 1, { extend: event.shiftKey }),
      Tab: () => this.setActive(row, col + (event.shiftKey ? -1 : 1)),
      Enter: () => this.edit(null),
      F2: () => this.edit(null),
    };
    if (moves[event.key] && !(mod && ['Enter', 'Tab'].includes(event.key))) { event.preventDefault(); event.stopPropagation(); moves[event.key](); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); this.api.onClear(this.selection()); return; }
    if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); event.stopPropagation(); this.anchor = { row: 0, col: 0 }; this.active = { row: Math.max(0, table.rows.length - 1), col: table.columns.length - 1 }; this.drawRows(true); return; }
    if (!mod && !event.altKey && event.key.length === 1) { event.preventDefault(); event.stopPropagation(); this.edit(event.key); }
  }

  /** Tab-separated text of the selection (Excel and other spreadsheets read it). */
  selectionText() {
    const s = this.selection();
    const table = this.table;
    const out = [];
    for (let r = s.r0; r <= Math.min(s.r1, table.rows.length - 1); r++) out.push(table.rows[r].slice(s.c0, s.c1 + 1).map(cellText).join('\t'));
    return out.join('\r\n');
  }

  onCopy(event) {
    if (this.editing) return;
    event.preventDefault();
    event.clipboardData?.setData('text/plain', this.selectionText());
  }

  onPaste(event) {
    if (this.editing) return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    this.api.onPaste(this.active.row, this.active.col, text);
  }

  onContext(event) {
    event.preventDefault();
    const cell = event.target.closest('.dg-cell');
    const head = event.target.closest('.dg-hcell');
    const rownum = event.target.closest('[data-rownum]');
    if (cell) {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      const s = this.selection();
      if (!(r >= s.r0 && r <= s.r1 && c >= s.c0 && c <= s.c1)) this.setActive(r, c, { reveal: false });
      this.api.onContext(event, { row: r, col: c });
    } else if (head) this.api.onContext(event, { col: Number(head.dataset.col), header: true });
    else if (rownum) {
      // The mousedown already selected the whole row (or kept the rows that were selected): keep that.
      const r = Number(rownum.dataset.rownum);
      if (!this.insideSelection(null, null, rownum)) {
        this.anchor = { row: r, col: 0 };
        this.active = { row: r, col: Math.max(0, (this.table?.columns.length ?? 1) - 1) };
        this.drawRows(true);
      }
      this.api.onContext(event, { row: r, col: this.selection().c0, wholeRow: true });
    }
    else this.api.onContext(event, { row: this.active.row, col: this.active.col });
  }
}

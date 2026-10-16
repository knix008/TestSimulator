// The editable sheet used by the task and resource views: a header row,
// virtual rows (only the visible ones are in the DOM), a fixed row-number
// column, in-cell editors, column resizing, keyboard navigation, row
// selection (click, Ctrl+click, Shift+click) and dragging rows to reorder.
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml, frameThrottle, pointerDrag } from './dom.js';
import { fieldOptions, fieldText } from '../domain/fields.js';

export const ROW_NUMBER_WIDTH = 46;

export class Grid {
  /**
   * options: { kind, rows(), fields(), ctx(), rowHeight(), widths (object), onWidth(fieldId, width),
   *   selected(row) → bool, onSelect(row, event), onEdit(row, field, value), onCreate(field, value),
   *   onActivate(row, field), onContext(event, row, field), onHeaderContext(event, field), onDragRows(rows, targetIndex, level),
   *   onToggle(row), indicators(row) → html, nameCell(row, text) → html, rowClass(row), newRow: bool, onScroll(top) }
   */
  constructor(host, options) {
    this.host = host;
    this.o = options;
    this.active = { index: 0, field: null };
    this.editing = null;
    this.list = [];
    this.host.classList.add('grid');
    this.host.innerHTML = `<div class="grid-head" role="row"></div><div class="grid-body" tabindex="0" role="grid"><div class="grid-spacer"></div><div class="grid-rows"></div></div>`;
    this.head = this.host.querySelector('.grid-head');
    this.body = this.host.querySelector('.grid-body');
    this.spacer = this.host.querySelector('.grid-spacer');
    this.rowsEl = this.host.querySelector('.grid-rows');
    this.renderWindow = frameThrottle(() => this.drawRows());
    this.body.addEventListener('scroll', () => {
      this.head.scrollLeft = this.body.scrollLeft;
      this.renderWindow();
      this.o.onScroll?.(this.body.scrollTop);
    }, { passive: true });
    this.bind();
  }

  get rowHeight() {
    return this.o.rowHeight?.() ?? 26;
  }

  fields() {
    return this.o.fields();
  }

  width(field) {
    return Math.max(30, this.o.widths?.[field.id] ?? field.width);
  }

  /** Full redraw: header, rows, sizes. */
  render() {
    this.list = this.o.rows();
    const fields = this.fields();
    this.columns = fields;
    const total = ROW_NUMBER_WIDTH + fields.reduce((sum, field) => sum + this.width(field), 0);
    this.totalWidth = total;
    this.head.innerHTML = `<div class="grid-head-inner" style="width:${total + 40}px">
      <div class="grid-hcell rownum" style="width:${ROW_NUMBER_WIDTH}px" title="${escapeHtml(t('grid.selectAll'))}" data-select-all>${icon('selectAll', 'icon tiny')}</div>
      ${fields.map((field) => `<div class="grid-hcell ${field.align}" data-field="${field.id}" style="width:${this.width(field)}px" title="${escapeHtml(t(`field.${field.id}.tip`, null, t(`field.${field.id}`)))}">
        ${field.id === 'indicators' ? icon('info', 'icon tiny') : field.id === 'mode' ? icon('autoMode', 'icon tiny') : `<span>${escapeHtml(t(`field.${field.id}`))}</span>`}
        <i class="grid-resize" data-resize="${field.id}" title="${escapeHtml(t('grid.resize'))}"></i>
      </div>`).join('')}
    </div>`;
    this.head.scrollLeft = this.body.scrollLeft;
    this.spacer.style.height = `${(this.list.length + (this.o.newRow ? 1 : 0)) * this.rowHeight + 4}px`;
    this.spacer.style.width = `${total + 40}px`;
    this.drawRows();
  }

  /** Data changed (same columns): redraw the visible rows. */
  update() {
    this.list = this.o.rows();
    this.spacer.style.height = `${(this.list.length + (this.o.newRow ? 1 : 0)) * this.rowHeight + 4}px`;
    this.drawRows();
  }

  visibleRange() {
    const h = this.rowHeight;
    const first = Math.max(0, Math.floor(this.body.scrollTop / h) - 4);
    const count = Math.ceil((this.body.clientHeight || 600) / h) + 8;
    return { first, last: Math.min(this.list.length + (this.o.newRow ? 1 : 0), first + count) };
  }

  drawRows() {
    if (this.editing) return;
    const { first, last } = this.visibleRange();
    const h = this.rowHeight;
    const ctx = this.o.ctx();
    const fields = this.columns ?? this.fields();
    const html = [];
    for (let index = first; index < last; index++) {
      const row = this.list[index];
      if (!row) {
        html.push(`<div class="grid-row new-row" data-index="${index}" style="top:${index * h}px;height:${h}px;width:${this.totalWidth}px" role="row">
          <div class="grid-cell rownum" style="width:${ROW_NUMBER_WIDTH}px">${icon('plus', 'icon tiny')}</div>
          ${fields.map((field) => `<div class="grid-cell ${field.align} ${field.id === 'name' ? 'new-hint' : ''}" data-field="${field.id}" style="width:${this.width(field)}px">${field.id === 'name' ? escapeHtml(t(this.o.kind === 'resource' ? 'grid.newResource' : 'grid.newTask')) : ''}</div>`).join('')}
        </div>`);
        continue;
      }
      if (row.group) {
        html.push(`<div class="grid-row group-row" data-index="${index}" style="top:${index * h}px;height:${h}px;width:${this.totalWidth}px" role="row">
          <div class="grid-cell rownum" style="width:${ROW_NUMBER_WIDTH}px">${icon('group', 'icon tiny')}</div>
          <div class="grid-cell group-label" style="width:${this.totalWidth - ROW_NUMBER_WIDTH}px">${this.o.groupLabel?.(row.group) ?? ''}</div>
        </div>`);
        continue;
      }
      const selected = this.o.selected(row);
      const classes = ['grid-row', selected ? 'selected' : '', row.match ? 'match' : '', index % 2 ? 'odd' : '', this.o.rowClass?.(row) ?? ''].join(' ');
      html.push(`<div class="${classes}" data-index="${index}" data-id="${escapeHtml(row.id)}" style="top:${index * h}px;height:${h}px;width:${this.totalWidth}px" role="row" aria-selected="${selected}">
        <div class="grid-cell rownum" style="width:${ROW_NUMBER_WIDTH}px" data-drag-row title="${escapeHtml(t('grid.rowTip'))}">${row.number ?? index + 1}</div>
        ${fields.map((field) => this.cellHtml(ctx, row, field, index)).join('')}
      </div>`);
    }
    this.rowsEl.innerHTML = html.join('');
    this.markActive();
  }

  cellHtml(ctx, row, field, index) {
    let content;
    if (field.id === 'indicators') content = this.o.indicators?.(row) ?? '';
    else if (field.id === 'mode' && row.item) {
      const manual = Boolean(row.item.manual);
      content = `<span class="mode-icon ${manual ? 'manual' : ''}" title="${escapeHtml(t(manual ? 'mode.manual' : 'mode.auto'))}">${icon(manual ? 'manualMode' : 'autoMode', 'icon tiny')}</span>`;
    } else {
      let text = '';
      try { text = row.item ? fieldText(ctx, field, row.item, row.info) : row.cells?.[field.id] ?? ''; } catch { text = '#'; }
      content = field.id === 'name' && this.o.nameCell ? this.o.nameCell(row, text) : escapeHtml(text);
    }
    const editable = field.set && field.kind !== 'readonly' && row.item && (!row.info?.summary || !['duration', 'start', 'finish', 'percentComplete', 'work', 'resourceNames', 'actualStart', 'actualFinish'].includes(field.id));
    const title = field.id === 'indicators' ? this.o.indicatorTip?.(row) ?? '' : '';
    return `<div class="grid-cell ${field.align} ${editable ? 'editable' : ''} kind-${field.kind}" data-field="${field.id}" data-index="${index}" style="width:${this.width(field)}px" ${title ? `title="${escapeHtml(title)}"` : ''}>${content}</div>`;
  }

  markActive() {
    for (const cell of this.rowsEl.querySelectorAll('.grid-cell.active')) cell.classList.remove('active');
    if (!this.active.field) return;
    this.rowsEl.querySelector(`.grid-row[data-index="${this.active.index}"] .grid-cell[data-field="${this.active.field}"]`)?.classList.add('active');
  }

  setActive(index, fieldId, { scroll = true } = {}) {
    const fields = this.columns ?? this.fields();
    const max = this.list.length + (this.o.newRow ? 0 : -1);
    this.active = { index: Math.max(0, Math.min(index, max)), field: fieldId ?? this.active.field ?? fields.find((f) => f.id === 'name')?.id ?? fields[0]?.id };
    if (scroll) this.scrollToIndex(this.active.index);
    this.markActive();
    this.scrollToField(this.active.field);
  }

  scrollToIndex(index) {
    const h = this.rowHeight;
    const top = index * h;
    if (top < this.body.scrollTop) this.body.scrollTop = top;
    else if (top + h > this.body.scrollTop + this.body.clientHeight) this.body.scrollTop = top + h - this.body.clientHeight;
  }

  scrollToField(fieldId) {
    const fields = this.columns ?? this.fields();
    let left = ROW_NUMBER_WIDTH;
    for (const field of fields) {
      if (field.id === fieldId) {
        const width = this.width(field);
        if (left < this.body.scrollLeft + ROW_NUMBER_WIDTH) this.body.scrollLeft = left - ROW_NUMBER_WIDTH;
        else if (left + width > this.body.scrollLeft + this.body.clientWidth) this.body.scrollLeft = left + width - this.body.clientWidth;
        return;
      }
      left += this.width(field);
    }
  }

  rowAt(index) {
    return this.list[index] ?? null;
  }

  // ───────────────────────── editing

  startEdit(index, fieldId, initial = null) {
    const row = this.list[index];
    const field = (this.columns ?? this.fields()).find((f) => f.id === fieldId);
    if (!field) return;
    const creating = !row && this.o.newRow && index === this.list.length;
    if (!creating && (!row?.item || !field.set || field.kind === 'readonly')) return;
    if (creating && field.id !== 'name') return;
    if (row?.info?.summary && ['duration', 'start', 'finish', 'percentComplete', 'work', 'resourceNames', 'actualStart', 'actualFinish'].includes(field.id)) return;
    this.setActive(index, fieldId);
    const cell = this.rowsEl.querySelector(`.grid-row[data-index="${index}"] .grid-cell[data-field="${fieldId}"]`);
    if (!cell) return;
    const ctx = this.o.ctx();
    let value = '';
    if (!creating) {
      try {
        const raw = field.get(ctx, row.item, row.info);
        value = ['select', 'bool'].includes(field.kind) ? raw : field.kind === 'text' || field.kind === 'predecessors' || field.kind === 'resources' ? String(raw ?? '') : fieldText(ctx, field, row.item, row.info);
      } catch { value = ''; }
    }
    if (field.id === 'percentComplete' || field.id === 'maxUnits') value = String(row?.item ? field.get(ctx, row.item, row.info) ?? '' : '');
    let editor;
    if (field.kind === 'select') {
      editor = document.createElement('select');
      editor.innerHTML = fieldOptions(ctx, field).map((option) => `<option value="${escapeHtml(option)}" ${String(option) === String(value) ? 'selected' : ''}>${escapeHtml(field.text ? field.text(ctx, option, row?.item, row?.info) : option)}</option>`).join('');
    } else if (field.kind === 'bool') {
      editor = document.createElement('select');
      editor.innerHTML = `<option value="1" ${value ? 'selected' : ''}>${escapeHtml(t('common.yes'))}</option><option value="" ${value ? '' : 'selected'}>${escapeHtml(t('common.no'))}</option>`;
    } else if (field.id === 'notes') {
      editor = document.createElement('input');
      editor.type = 'text';
      editor.value = initial ?? value;
    } else {
      editor = document.createElement('input');
      editor.type = 'text';
      editor.value = initial ?? value;
      if (field.kind === 'date') editor.placeholder = ctx.dateFormat === 'us' ? 'MM/DD/YYYY' : ctx.dateFormat === 'eu' ? 'DD/MM/YYYY' : 'YYYY-MM-DD';
    }
    editor.className = 'grid-editor';
    editor.setAttribute('aria-label', t(`field.${field.id}`));
    editor.title = t(`field.${field.id}`);
    cell.classList.add('editing');
    cell.innerHTML = '';
    cell.append(editor);
    this.editing = { index, fieldId, editor, creating, row };
    editor.focus();
    if (editor.select && initial == null) editor.select();
    else if (editor.setSelectionRange && initial != null) editor.setSelectionRange(editor.value.length, editor.value.length);
    editor.addEventListener('blur', () => this.commit(), { once: true });
    if (editor.tagName === 'SELECT') editor.addEventListener('change', () => this.commit());
  }

  commit(move = null) {
    const editing = this.editing;
    if (!editing) return;
    this.editing = null;
    const value = editing.editor.value;
    const field = (this.columns ?? this.fields()).find((f) => f.id === editing.fieldId);
    try {
      if (editing.creating) {
        if (String(value).trim()) this.o.onCreate?.(field, value);
      } else {
        const ctx = this.o.ctx();
        const before = field.kind === 'bool' ? Boolean(field.get(ctx, editing.row.item, editing.row.info)) : null;
        const next = field.kind === 'bool' ? Boolean(value) : value;
        if (field.kind !== 'bool' || before !== next) this.o.onEdit?.(editing.row, field, next);
      }
    } finally {
      this.update();
      if (move) this.moveActive(move.dy, move.dx);
      this.body.focus({ preventScroll: true });
    }
  }

  cancel() {
    if (!this.editing) return;
    this.editing = null;
    this.drawRows();
    this.body.focus({ preventScroll: true });
  }

  moveActive(dy, dx = 0) {
    const fields = (this.columns ?? this.fields()).filter((field) => field.id !== 'indicators');
    let fieldIndex = Math.max(0, fields.findIndex((field) => field.id === this.active.field));
    fieldIndex = Math.max(0, Math.min(fields.length - 1, fieldIndex + dx));
    let index = this.active.index + dy;
    while (this.list[index]?.group && dy) index += Math.sign(dy);
    this.setActive(index, fields[fieldIndex]?.id);
  }

  // ───────────────────────── events

  bind() {
    this.head.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-resize]');
      if (!handle) return;
      event.preventDefault();
      event.stopPropagation();
      const field = (this.columns ?? this.fields()).find((f) => f.id === handle.dataset.resize);
      const start = this.width(field);
      pointerDrag(event, {
        cursor: 'col-resize',
        move: (dx) => {
          const width = Math.max(30, Math.round(start + dx));
          this.o.widths[field.id] = width;
          this.render();
        },
        end: (e, moved) => { if (moved) this.o.onWidth?.(field.id, this.width(field)); },
      });
    });
    this.head.addEventListener('click', (event) => {
      if (event.target.closest('[data-select-all]')) this.o.onSelectAll?.();
    });
    this.head.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const cell = event.target.closest('[data-field]');
      const field = cell ? (this.columns ?? this.fields()).find((f) => f.id === cell.dataset.field) : null;
      this.o.onHeaderContext?.(event, field);
    });
    this.head.addEventListener('dblclick', (event) => {
      // Double-click on a column border: fit the column to its content.
      const handle = event.target.closest('[data-resize]');
      if (!handle) return;
      const field = (this.columns ?? this.fields()).find((f) => f.id === handle.dataset.resize);
      const cells = [...this.rowsEl.querySelectorAll(`.grid-cell[data-field="${field.id}"]`)];
      const widest = Math.max(60, ...cells.map((cell) => cell.scrollWidth + 12));
      this.o.widths[field.id] = Math.min(600, widest);
      this.o.onWidth?.(field.id, this.o.widths[field.id]);
      this.render();
    });

    this.rowsEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.grid-editor')) return;
      const rowEl = event.target.closest('.grid-row');
      if (!rowEl) return;
      const index = Number(rowEl.dataset.index);
      const row = this.list[index];
      const cell = event.target.closest('.grid-cell');
      if (event.target.closest('[data-toggle]')) {
        event.preventDefault();
        this.o.onToggle?.(row);
        return;
      }
      if (this.editing) this.commit();
      if (!row) { this.setActive(index, 'name'); this.o.onSelect?.(null, event); return; }
      if (row.group) return;
      this.o.onSelect?.(row, event);
      this.setActive(index, cell?.dataset.field && cell.dataset.field !== 'indicators' ? cell.dataset.field : this.active.field, { scroll: false });
      if (event.target.closest('[data-drag-row]') && this.o.onDragRows && !event.shiftKey && !event.ctrlKey) this.dragRows(event, index);
      this.body.focus({ preventScroll: true });
    });
    this.rowsEl.addEventListener('dblclick', (event) => {
      const rowEl = event.target.closest('.grid-row');
      if (!rowEl) return;
      const index = Number(rowEl.dataset.index);
      const cell = event.target.closest('.grid-cell');
      const field = cell?.dataset.field;
      if (!this.list[index]) return this.startEdit(index, 'name');
      if (cell?.classList.contains('rownum') || field === 'indicators' || !cell?.classList.contains('editable')) return this.o.onActivate?.(this.list[index], field);
      return this.startEdit(index, field);
    });
    this.rowsEl.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const rowEl = event.target.closest('.grid-row');
      const index = rowEl ? Number(rowEl.dataset.index) : -1;
      const row = this.list[index];
      if (row && !row.group && !this.o.selected(row)) this.o.onSelect?.(row, { ctrlKey: false, shiftKey: false, metaKey: false });
      const field = event.target.closest('.grid-cell')?.dataset.field;
      if (index >= 0) this.setActive(index, field && field !== 'indicators' ? field : this.active.field, { scroll: false });
      this.o.onContext?.(event, row?.group ? null : row, field);
    });
    this.body.addEventListener('keydown', (event) => this.onKey(event));
  }

  onKey(event) {
    if (this.editing) {
      const { editor } = this.editing;
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); this.commit({ dy: event.shiftKey ? -1 : 1 }); }
      else if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); this.commit({ dy: 0, dx: event.shiftKey ? -1 : 1 }); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.cancel(); }
      else if (editor.tagName !== 'SELECT' && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey) { event.preventDefault(); this.commit({ dy: event.key === 'ArrowUp' ? -1 : 1 }); }
      return;
    }
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      this.moveActive(key === 'ArrowDown' ? 1 : -1);
      const row = this.list[this.active.index];
      if (row && !row.group) this.o.onSelect?.(row, { shiftKey: event.shiftKey, ctrlKey: false, metaKey: false, keyboard: true });
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      if (event.altKey) return;
      event.preventDefault();
      this.moveActive(0, key === 'ArrowRight' ? 1 : -1);
    } else if (key === 'PageDown' || key === 'PageUp') {
      event.preventDefault();
      const page = Math.max(1, Math.floor(this.body.clientHeight / this.rowHeight) - 1);
      this.moveActive(key === 'PageDown' ? page : -page);
    } else if (key === 'Home' && mod) { event.preventDefault(); this.setActive(0); }
    else if (key === 'End' && mod) { event.preventDefault(); this.setActive(this.list.length - 1); }
    else if (key === 'F2' || (key === 'Enter' && !mod && !event.shiftKey && !event.altKey && this.o.enterEdits !== false)) {
      event.preventDefault();
      event.stopPropagation();
      this.startEdit(this.active.index, this.active.field ?? 'name');
    } else if (key.length === 1 && !mod && !event.altKey && key !== ' ') {
      // Typing starts editing the active cell with that character.
      const field = (this.columns ?? this.fields()).find((f) => f.id === this.active.field);
      if (field && ['text', 'duration', 'date', 'number', 'percent', 'money', 'predecessors', 'resources'].includes(field.kind)) {
        event.preventDefault();
        event.stopPropagation();
        this.startEdit(this.active.index, field.id, key);
      }
    }
  }

  /** Drag rows by their number cell: a line shows where they will go. */
  dragRows(event, index) {
    const h = this.rowHeight;
    const line = document.createElement('div');
    line.className = 'grid-drop-line';
    let target = index;
    let level = null;
    pointerDrag(event, {
      threshold: 6,
      move: (dx, dy, e) => {
        if (!line.isConnected) this.rowsEl.append(line);
        document.body.classList.add('dragging-rows');
        const rect = this.body.getBoundingClientRect();
        const y = e.clientY - rect.top + this.body.scrollTop;
        target = Math.max(0, Math.min(this.list.length, Math.round(y / h)));
        // Dragging right/left changes the outline level of the dropped rows.
        const above = this.list[target - 1]?.item;
        level = above ? Math.max(1, Math.min((above.outlineLevel ?? 1) + 1, (above.outlineLevel ?? 1) + Math.round(dx / 24))) : 1;
        line.style.top = `${target * h - 1}px`;
        line.style.left = `${ROW_NUMBER_WIDTH + (level - 1) * 16}px`;
        line.style.width = `${this.totalWidth - ROW_NUMBER_WIDTH}px`;
        if (e.clientY > rect.bottom - 20) this.body.scrollTop += 12;
        else if (e.clientY < rect.top + 20) this.body.scrollTop -= 12;
      },
      end: (e, moved) => {
        line.remove();
        document.body.classList.remove('dragging-rows');
        if (moved && target !== index && target !== index + 1) this.o.onDragRows?.(target, level);
        else if (moved && level != null && this.list[index]?.item && level !== this.list[index].item.outlineLevel) this.o.onDragRows?.(target, level);
      },
    });
  }
}

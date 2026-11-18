// A list view: a table whose headings sort (click; again to reverse), whose column edges drag to resize, and
// whose columns drag to a new place — a silhouette of the column follows the pointer and a line shows where
// it will land. Each list keeps its order, widths and sort under its id (settings.listViews).

import { esc, L } from './bits.js';

const MIN_WIDTH = 48;

/** The columns in the order this list keeps, with their widths. */
export function arrangedColumns(columns, state = {}) {
  const known = new Map(columns.map((column) => [column.id, column]));
  const order = (state.order || []).filter((id) => known.has(id));
  for (const column of columns) if (!order.includes(column.id)) order.push(column.id);
  return order.map((id) => {
    const column = known.get(id);
    const width = Number(state.widths?.[id]) || column.width || 140;
    return { ...column, width: Math.max(MIN_WIDTH, Math.round(width)) };
  });
}

/** The rows sorted by the list's sort column (numbers as numbers, words in the reader's language). */
export function sortedRows(rows, columns, sort) {
  const column = columns.find((item) => item.id === sort?.col);
  if (!column) return rows;
  const dir = sort.dir === 'desc' ? -1 : 1;
  const value = column.value || ((row) => row[column.id]);
  return rows.map((row, index) => ({ row, index, key: value(row) }))
    .sort((a, b) => {
      const x = a.key;
      const y = b.key;
      let order;
      if (typeof x === 'number' && typeof y === 'number') order = x - y;
      else order = String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return order * dir || a.index - b.index;
    })
    .map((item) => item.row);
}

/**
 * The list's HTML. columns: [{ id, label, width, value(row), html(row), align }]; rowAttrs(row) adds
 * attributes to a row (for example data-action to open it); selected(row) marks the chosen row.
 */
export function renderListView({ id, columns, rows, state = {}, empty = '', rowAttrs = () => '', selected = () => false }) {
  const cols = arrangedColumns(columns, state);
  const sort = state.sort || null;
  const list = sortedRows(rows, cols, sort);
  const total = cols.reduce((sum, column) => sum + column.width, 0);
  const head = cols.map((column) => {
    const on = sort?.col === column.id;
    const aria = on ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none';
    const arrow = on ? `<span class="lv-arrow" aria-hidden="true">${sort.dir === 'desc' ? '▼' : '▲'}</span>` : '';
    return `<th scope="col" data-lv-col="${esc(column.id)}" aria-sort="${aria}" class="${on ? 'sorted' : ''}${column.align === 'right' ? ' right' : ''}" title="${esc(L('눌러서 정렬, 끌어서 옮기기', 'Click to sort, drag to move'))}"><span class="lv-head"><span class="lv-label">${esc(column.label)}</span>${arrow}</span><span class="lv-resize" data-lv-resize="${esc(column.id)}" title="${esc(L('끌어서 폭 바꾸기', 'Drag to resize'))}"></span></th>`;
  }).join('');
  const body = list.map((row) => `<tr ${rowAttrs(row)}${selected(row) ? ' class="selected" aria-selected="true"' : ''}>${cols.map((column) => `<td data-lv-col="${esc(column.id)}"${column.align === 'right' ? ' class="right"' : ''}>${column.html ? column.html(row) : esc(row[column.id] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<div class="lv" data-lv="${esc(id)}">
    <table class="lv-table" style="width:${total}px">
      <colgroup>${cols.map((column) => `<col data-lv-col="${esc(column.id)}" style="width:${column.width}px">`).join('')}</colgroup>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${list.length ? '' : `<p class="lv-empty muted">${esc(empty || L('항목이 없습니다.', 'Nothing to show.'))}</p>`}
  </div>`;
}

/**
 * Makes every list view in the document work. `store.read(id)` / `store.write(id, state)` keep each list's
 * state; `store.repaint()` draws again after a sort or a move (a resize changes the widths in place).
 */
export function bindListViews(store) {
  let suppressClick = false;

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const th = event.target.closest?.('.lv th[data-lv-col]');
    if (!th) return;
    const box = th.closest('.lv');
    const id = box.dataset.lv;
    const table = box.querySelector('.lv-table');
    const handle = event.target.closest('.lv-resize');
    if (handle) { startResize(event, box, id, table, handle.dataset.lvResize); return; }
    startMove(event, box, id, table, th);
  });

  document.addEventListener('click', (event) => {
    const th = event.target.closest?.('.lv th[data-lv-col]');
    if (!th) return;
    if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
    if (event.target.closest('.lv-resize')) return;
    const id = th.closest('.lv').dataset.lv;
    const col = th.dataset.lvCol;
    const state = { ...(store.read(id) || {}) };
    state.sort = state.sort?.col === col ? { col, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
    store.write(id, state);
    store.repaint();
  }, true);

  function currentOrder(box) {
    return [...box.querySelectorAll('thead th[data-lv-col]')].map((cell) => cell.dataset.lvCol);
  }

  function startResize(event, box, id, table, col) {
    event.preventDefault();
    const colEl = box.querySelector(`col[data-lv-col="${CSS.escape(col)}"]`);
    const startX = event.clientX;
    const startWidth = colEl.getBoundingClientRect().width || parseFloat(colEl.style.width) || 140;
    const startTotal = table.getBoundingClientRect().width;
    document.body.classList.add('lv-resizing');
    const move = (e) => {
      const width = Math.max(MIN_WIDTH, Math.round(startWidth + e.clientX - startX));
      colEl.style.width = `${width}px`;
      table.style.width = `${Math.round(startTotal - startWidth + width)}px`;
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.classList.remove('lv-resizing');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const state = { ...(store.read(id) || {}) };
      state.widths = { ...(state.widths || {}) };
      for (const item of box.querySelectorAll('col[data-lv-col]')) state.widths[item.dataset.lvCol] = Math.round(parseFloat(item.style.width) || item.getBoundingClientRect().width);
      state.order = currentOrder(box);
      store.write(id, state);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function startMove(event, box, id, table, th) {
    const col = th.dataset.lvCol;
    const startX = event.clientX;
    const startY = event.clientY;
    let ghost = null;
    let line = null;
    let target = -1;
    const order = currentOrder(box);
    const from = order.indexOf(col);

    const begin = () => {
      // The silhouette: the heading and the column's cells that are on screen, half see-through.
      const rect = th.getBoundingClientRect();
      ghost = document.createElement('div');
      ghost.className = 'lv-ghost';
      ghost.style.width = `${rect.width}px`;
      const cells = [...box.querySelectorAll(`tbody td[data-lv-col="${CSS.escape(col)}"]`)].filter((cell) => {
        const r = cell.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      }).slice(0, 14);
      ghost.innerHTML = `<div class="lv-ghost-head">${th.querySelector('.lv-label')?.innerHTML || ''}</div>${cells.map((cell) => `<div class="lv-ghost-cell" style="height:${cell.getBoundingClientRect().height}px">${cell.innerHTML}</div>`).join('')}`;
      document.body.appendChild(ghost);
      line = document.createElement('div');
      line.className = 'lv-drop';
      document.body.appendChild(line);
      for (const cell of box.querySelectorAll(`[data-lv-col="${CSS.escape(col)}"]`)) if (cell.tagName !== 'COL') cell.classList.add('lv-moving');
      document.body.classList.add('lv-dragging');
      ghost.dataset.offset = String(startX - rect.left);
    };

    const move = (e) => {
      if (!ghost) {
        if (Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) return;
        begin();
      }
      e.preventDefault();
      const tableRect = table.getBoundingClientRect();
      ghost.style.left = `${e.clientX - Number(ghost.dataset.offset)}px`;
      ghost.style.top = `${tableRect.top}px`;
      // The gap nearest the pointer: before the column under it, or after it past its middle.
      const heads = [...box.querySelectorAll('thead th[data-lv-col]')];
      let at = heads.length;
      for (let i = 0; i < heads.length; i += 1) {
        const r = heads[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) { at = i; break; }
      }
      target = at;
      const edge = at < heads.length ? heads[at].getBoundingClientRect().left : heads[heads.length - 1].getBoundingClientRect().right;
      const boxRect = box.getBoundingClientRect();
      line.style.left = `${Math.round(Math.min(Math.max(edge, boxRect.left), boxRect.right) - 1)}px`;
      line.style.top = `${Math.max(tableRect.top, boxRect.top)}px`;
      line.style.height = `${Math.min(tableRect.bottom, boxRect.bottom) - Math.max(tableRect.top, boxRect.top)}px`;
      line.hidden = at === from || at === from + 1;
    };

    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (!ghost) return;
      ghost.remove();
      line.remove();
      document.body.classList.remove('lv-dragging');
      for (const cell of box.querySelectorAll('.lv-moving')) cell.classList.remove('lv-moving');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (target < 0 || target === from || target === from + 1) return;
      const next = order.filter((item) => item !== col);
      next.splice(target > from ? target - 1 : target, 0, col);
      const state = { ...(store.read(id) || {}) };
      state.order = next;
      store.write(id, state);
      store.repaint();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
}

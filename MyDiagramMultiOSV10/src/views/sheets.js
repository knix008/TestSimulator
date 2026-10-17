// Table views: the Shape Sheet (every shape of the current page with its
// position, size, angle, colours, font size, layer and link — edit in the
// cells) and Shape Data (the data fields of the shapes on this page or on all
// pages, one column per field; add a field, link a CSV file, export to CSV).
import { Grid } from '../ui/grid.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import { dataKeys, findShape, isConnector, isGroup } from '../domain/diagram.js';
import { dataField, pageField, SHAPE_FIELD_MAP, SHEET_COLUMNS } from '../domain/fields.js';
import { masterIcon } from '../render/svg.js';

/** One row per shape (groups included, members after them). */
function shapeRows(app, pages) {
  const rows = [];
  for (const page of pages) {
    for (const shape of page.shapes) rows.push({ id: shape.id, item: shape, info: { pageId: page.id, pageName: page.name, page }, number: rows.length + 1 });
  }
  return rows;
}

class TableView {
  constructor(app, host, kind) {
    this.app = app;
    this.host = host;
    this.kind = kind;
    host.classList.add('table-view');
    host.innerHTML = `<div class="table-bar"></div><div class="table-grid"></div>`;
    this.bar = host.querySelector('.table-bar');
    this.grid = new Grid(host.querySelector('.table-grid'), this.options());
    host.addEventListener('click', (event) => {
      const button = event.target.closest('[data-table-action]');
      if (button) this.onAction(button.dataset.tableAction, button);
    });
    host.addEventListener('change', (event) => {
      if (event.target.matches('[data-table-scope]')) { this.app.doc().view.dataScope = event.target.value; this.render(); }
    });
  }

  options() {
    const app = this.app;
    return {
      kind: this.kind,
      rows: () => this.rows(),
      fields: () => this.fields(),
      ctx: () => app.fieldCtx(),
      rowHeight: () => app.rowHeight(),
      widths: app.columnWidths(this.kind),
      onWidth: () => app.saveColumnWidths(),
      selected: (row) => app.isSelected(row.id),
      onSelect: (row, event) => {
        if (!row) return app.select([]);
        if (row.info.pageId !== app.page()?.id) app.goToPage(row.info.pageId, { keepView: true });
        const ids = app.selection().ids;
        if (event.ctrlKey || event.metaKey) return app.select(ids.includes(row.id) ? ids.filter((id) => id !== row.id) : [...ids, row.id]);
        return app.select([row.id]);
      },
      onSelectAll: () => app.run('selectAll'),
      onEdit: (row, field, value) => app.editShapeField(row, field, value),
      onActivate: (row) => { if (row) { app.goToPage(row.info.pageId); app.select([row.id]); app.switchView('drawing'); } },
      onContext: (event, row) => { if (row) { app.select([row.id]); app.contextMenu(event, isConnector(row.item) ? 'connector' : 'shape', { id: row.id }); } else app.contextMenu(event, 'canvas', {}); },
      onHeaderContext: (event) => app.contextMenu(event, 'canvas', {}),
      nameCell: (row, text) => {
        const shape = row.item;
        const glyph = isConnector(shape) ? icon('connectorTool', 'icon tiny name-glyph') : isGroup(shape) ? icon('groupShapes', 'icon tiny name-glyph') : `<span class="name-glyph master-mini">${masterIcon(shape.master, { size: 18 })}</span>`;
        return `<span class="outline" style="padding-left:${shape.groupId ? 14 : 0}px">${glyph}<span>${escapeHtml(text || '—')}</span></span>`;
      },
      rowClass: (row) => (row.item.groupId ? 'member-row' : ''),
      newRow: false,
    };
  }

  render() {
    this.renderBar();
    this.grid.render();
  }

  update() {
    this.renderBar();
    this.grid.render();
  }

  selectionChanged() { this.grid.drawRows(); }
  scrollToShape(id) { const index = this.grid.list.findIndex((row) => row.id === id); if (index >= 0) this.grid.scrollToIndex(index); }
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}

export class ShapeSheetView extends TableView {
  constructor(app, host) { super(app, host, 'sheet'); }
  rows() { return shapeRows(this.app, [this.app.page()]); }
  fields() { return SHEET_COLUMNS.map((id) => SHAPE_FIELD_MAP.get(id)); }
  renderBar() {
    const t = this.app.t;
    const page = this.app.page();
    this.bar.innerHTML = `${icon('viewShapeSheet')}<b>${escapeHtml(t('view.shapeSheet'))}</b><span class="muted">${escapeHtml(t('table.pageShapes', { page: page.name, count: page.shapes.length }))}</span><span class="grow"></span>
      <button class="small-button" data-table-action="drawing" title="${escapeHtml(t('view.drawing'))}">${icon('viewDrawing')}<span>${escapeHtml(t('view.drawing'))}</span></button>`;
  }
  onAction(action) { if (action === 'drawing') this.app.switchView('drawing'); }
}

export class ShapeDataView extends TableView {
  constructor(app, host) { super(app, host, 'data'); }
  pages() { return this.app.doc().view.dataScope === 'all' ? this.app.doc().doc.pages : [this.app.page()]; }
  rows() { return shapeRows(this.app, this.pages()).filter((row) => !isGroup(row.item) || row.item.data?.length); }
  fields() {
    const keys = dataKeys(this.pages());
    return [...(this.app.doc().view.dataScope === 'all' ? [pageField] : []), SHAPE_FIELD_MAP.get('name'), SHAPE_FIELD_MAP.get('text'), ...keys.map(dataField)];
  }
  renderBar() {
    const t = this.app.t;
    const scope = this.app.doc().view.dataScope === 'all' ? 'all' : 'page';
    const keys = dataKeys(this.pages());
    this.bar.innerHTML = `${icon('viewShapeData')}<b>${escapeHtml(t('view.shapeData'))}</b>
      <select data-table-scope title="${escapeHtml(t('table.scope'))}" aria-label="${escapeHtml(t('table.scope'))}"><option value="page" ${scope === 'page' ? 'selected' : ''}>${escapeHtml(t('table.scopePage'))}</option><option value="all" ${scope === 'all' ? 'selected' : ''}>${escapeHtml(t('table.scopeAll'))}</option></select>
      <span class="muted">${escapeHtml(t('table.fields', { count: keys.length }))}</span><span class="grow"></span>
      <button class="small-button" data-table-action="addField" title="${escapeHtml(t('table.addField'))}">${icon('plus')}<span>${escapeHtml(t('table.addField'))}</span></button>
      <button class="small-button" data-table-action="link" title="${escapeHtml(t('action.linkData'))}">${icon('linkData')}<span>${escapeHtml(t('toolShort.linkData'))}</span></button>
      <button class="small-button" data-table-action="export" title="${escapeHtml(t('action.exportData'))}">${icon('exportData')}<span>${escapeHtml(t('toolShort.exportData'))}</span></button>`;
  }
  onAction(action) {
    if (action === 'addField') this.app.addDataField();
    else if (action === 'link') this.app.run('linkData');
    else if (action === 'export') this.app.run('exportData');
  }
}

export { findShape };

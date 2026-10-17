// The Model Explorer: the project as a tree (packages, classifiers with their
// attributes and operations, relationships, diagrams …). Click selects (and
// selects the element's views on the current diagram), double-click opens a
// diagram or renames, F2 renames, the arrow keys move and expand, dragging a
// row onto another moves the element there, dragging it onto the canvas shows
// it on the diagram, and the filter box narrows the tree to matching names.
import { childrenOf, displayName, isDiagram, isRelationship, relationshipEnds, refId } from '../domain/model.js';
import { typeDef, typeLabel } from '../domain/meta.js';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';

const HIDDEN = new Set(['UMLAssociationEnd', 'ERDRelationshipEnd', 'UMLRegion', 'UMLTag']);

/** Children shown in the tree (regions are flattened, association ends and tags hidden). */
export function treeChildren(element, { sort = false } = {}) {
  const out = [];
  for (const child of childrenOf(element, { ends: false })) {
    if (child._type === 'UMLRegion') out.push(...treeChildren(child));
    else if (!HIDDEN.has(child._type)) out.push(child);
  }
  if (!sort) return out;
  const rank = (e) => (isDiagram(e) ? 0 : typeDef(e._type)?.feature ? 1 : isRelationship(e) ? 3 : 2);
  return [...out].sort((a, b) => rank(a) - rank(b) || String(a.name ?? '').localeCompare(String(b.name ?? '')));
}

export class ModelExplorer {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.query = '';
    this.renaming = null;
    host.addEventListener('click', (event) => this.onClick(event));
    host.addEventListener('dblclick', (event) => this.onDoubleClick(event));
    host.addEventListener('keydown', (event) => this.onKey(event));
    host.addEventListener('contextmenu', (event) => this.onContextMenu(event));
    host.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    host.addEventListener('input', (event) => {
      if (event.target.matches('[data-explorer-filter]')) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.query = event.target.value.trim().toLowerCase(); this.renderTree(); }, 150);
      }
    });
  }

  get tab() { return this.app.tab(); }
  get expanded() { return this.tab?.view.expanded ?? new Set(); }

  render() {
    const t = this.app.t;
    const sort = this.app.settings().explorerSort;
    this.host.innerHTML = `
      <div class="explorer-tools">
        <label class="search-box" title="${escapeHtml(t('explorer.filterTip'))}">${icon('search')}<input type="search" data-explorer-filter value="${escapeHtml(this.query)}" placeholder="${escapeHtml(t('explorer.filter'))}" aria-label="${escapeHtml(t('explorer.filterTip'))}" /></label>
        <button class="icon-button ${sort ? 'active' : ''}" data-explorer="sort" title="${escapeHtml(t('explorer.sort'))}" aria-pressed="${Boolean(sort)}">${icon('sortAlpha')}</button>
        <button class="icon-button" data-explorer="expandAll" title="${escapeHtml(t('explorer.expandAll'))}">${icon('expandAll')}</button>
        <button class="icon-button" data-explorer="collapseAll" title="${escapeHtml(t('explorer.collapseAll'))}">${icon('collapseAll')}</button>
      </div>
      <div class="explorer-tree" role="tree" tabindex="0" aria-label="${escapeHtml(t('panel.explorer'))}"></div>`;
    this.renderTree();
  }

  /** Rows of the visible tree: [{ element, depth, hasChildren, open }]. */
  rows() {
    const tab = this.tab;
    if (!tab) return [];
    const sort = this.app.settings().explorerSort;
    const out = [];
    const query = this.query;
    const matches = new Set();
    if (query) {
      const visit = (element, trail) => {
        const hit = String(element.name ?? '').toLowerCase().includes(query) || typeLabel(element._type, this.app.language()).toLowerCase().includes(query);
        if (hit) { matches.add(element._id); trail.forEach((e) => matches.add(e._id)); }
        for (const child of treeChildren(element)) visit(child, [...trail, element]);
      };
      visit(tab.project, []);
    }
    const walk = (element, depth) => {
      const children = treeChildren(element, { sort });
      const visible = query ? children.filter((c) => matches.has(c._id)) : children;
      const open = query ? true : this.expanded.has(element._id) || depth === 0;
      out.push({ element, depth, hasChildren: visible.length > 0, open });
      if (open) for (const child of visible) walk(child, depth + 1);
    };
    walk(tab.project, 0);
    return out;
  }

  renderTree() {
    const tree = this.host.querySelector('.explorer-tree');
    if (!tree) return;
    const tab = this.tab;
    if (!tab) { tree.innerHTML = `<p class="panel-hint">${icon('info')}<span>${escapeHtml(this.app.t('explorer.empty'))}</span></p>`; return; }
    const selected = new Set(this.app.explorerSelection());
    const current = tab.view.diagramId;
    const lang = this.app.language();
    const index = tab.index;
    const scrollTop = tree.scrollTop;
    tree.innerHTML = this.rows().map(({ element, depth, hasChildren, open }) => {
      const def = typeDef(element._type);
      let name = element._type === 'Project' ? element.name || this.app.t('explorer.project') : displayName(element, lang);
      if (isRelationship(element) && !element.name) {
        const [a, b] = relationshipEnds(element).map((id) => index.get(id)?.name ?? '?');
        name = `(${typeLabel(element._type, lang)}) ${a} → ${b}`;
      }
      if (element._type === 'UMLPseudostate' && !element.name) name = `(${this.app.t(`enum.${element.kind ?? 'initial'}`)})`;
      const glyph = element._type === 'Project' ? 'umlProject' : def?.icon ?? 'umlClass';
      const classes = ['tree-row', selected.has(element._id) ? 'selected' : '', isDiagram(element) && element._id === current ? 'current' : '', element.isAbstract ? 'abstract' : ''].filter(Boolean).join(' ');
      return `<div class="${classes}" role="treeitem" aria-level="${depth + 1}" aria-selected="${selected.has(element._id)}" ${hasChildren ? `aria-expanded="${open}"` : ''} data-element="${element._id}" style="--depth:${depth}" title="${escapeHtml(`${name} — ${typeLabel(element._type, lang)}`)}">
        <button class="tree-caret ${hasChildren ? '' : 'leaf'}" data-toggle="${element._id}" tabindex="-1" aria-hidden="true">${hasChildren ? icon(open ? 'caretDown' : 'caretRight', 'icon tiny') : ''}</button>${icon(glyph)}<span class="tree-name">${escapeHtml(name)}</span></div>`;
    }).join('');
    tree.scrollTop = scrollTop;
  }

  /** Expands the owners of an element and scrolls its row into sight. */
  reveal(id) {
    const tab = this.tab;
    if (!tab) return;
    for (let owner = tab.index.parent(id); owner; owner = tab.index.parent(owner._id)) this.expanded.add(owner._id);
    this.renderTree();
    this.host.querySelector(`[data-element="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  onClick(event) {
    const action = event.target.closest('[data-explorer]');
    if (action) {
      const tab = this.tab;
      if (action.dataset.explorer === 'sort') { this.app.updateSettings({ explorerSort: !this.app.settings().explorerSort }, { quiet: true }); this.render(); }
      if (action.dataset.explorer === 'expandAll' && tab) { const add = (e) => { this.expanded.add(e._id); treeChildren(e).forEach(add); }; add(tab.project); this.renderTree(); }
      if (action.dataset.explorer === 'collapseAll' && tab) { this.expanded.clear(); this.renderTree(); }
      return;
    }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) { const id = toggle.dataset.toggle; if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id); this.renderTree(); return; }
    const row = event.target.closest('[data-element]');
    if (!row) return;
    const id = row.dataset.element;
    const current = this.app.explorerSelection();
    if (event.ctrlKey || event.metaKey) this.app.selectElements(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
    else this.app.selectElements([id]);
    this.host.querySelector('.explorer-tree')?.focus({ preventScroll: true });
  }

  onDoubleClick(event) {
    const row = event.target.closest('[data-element]');
    if (!row) return;
    const element = this.tab.index.get(row.dataset.element);
    if (isDiagram(element)) this.app.openDiagram(element._id);
    else if (element && element._type !== 'Project') this.startRename(element._id);
  }

  onContextMenu(event) {
    const row = event.target.closest('[data-element]');
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.app.explorerSelection().includes(row.dataset.element)) this.app.selectElements([row.dataset.element]);
    this.app.contextMenu(event, 'element', { id: row.dataset.element });
  }

  onKey(event) {
    if (event.target.matches('input')) return;
    const rows = this.rows();
    const selected = this.app.explorerSelection()[0];
    const i = rows.findIndex((r) => r.element._id === selected);
    const key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, i + (key === 'ArrowDown' ? 1 : -1)))];
      if (next) { this.app.selectElements([next.element._id]); this.reveal(next.element._id); }
    } else if (key === 'ArrowRight' && i >= 0) { event.preventDefault(); this.expanded.add(rows[i].element._id); this.renderTree(); } else if (key === 'ArrowLeft' && i >= 0) {
      event.preventDefault();
      if (this.expanded.has(rows[i].element._id)) { this.expanded.delete(rows[i].element._id); this.renderTree(); } else { const owner = this.tab.index.parent(rows[i].element._id); if (owner) { this.app.selectElements([owner._id]); this.reveal(owner._id); } }
    } else if (key === 'F2' && selected) { event.preventDefault(); this.startRename(selected); } else if (key === 'Enter' && selected) { const e = this.tab.index.get(selected); if (isDiagram(e)) this.app.openDiagram(e._id); } else if (key === 'Delete' && selected) { event.preventDefault(); event.stopPropagation(); this.app.run('deleteFromModel'); }
  }

  startRename(id) {
    const row = this.host.querySelector(`[data-element="${CSS.escape(id)}"]`);
    const element = this.tab.index.get(id);
    if (!row || !element) return;
    const label = row.querySelector('.tree-name');
    const input = document.createElement('input');
    input.className = 'tree-input';
    input.value = element.name ?? '';
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save && input.value !== (element.name ?? '')) this.app.renameElement(id, input.value);
      else this.renderTree();
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  /** Dragging rows: onto another row (move into it) or onto the canvas (show on the diagram). */
  onPointerDown(event) {
    const row = event.button === 0 ? event.target.closest('[data-element]') : null;
    if (!row || event.target.closest('[data-toggle], input')) return;
    const id = row.dataset.element;
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;
    let ids = null;
    const targetRow = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.explorer-tree [data-element]');
    const overCanvas = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.canvas-scroll');
    const move = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        const sel = this.app.explorerSelection();
        ids = sel.includes(id) ? sel : [id];
        ghost = document.createElement('div');
        ghost.className = 'explorer-ghost';
        ghost.innerHTML = row.innerHTML;
        document.body.append(ghost);
      }
      ghost.style.transform = `translate(${e.clientX + 8}px, ${e.clientY + 6}px)`;
      this.host.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
      const over = targetRow(e);
      if (over && !ids.includes(over.dataset.element)) over.classList.add('drop-target');
      ghost.classList.toggle('over', Boolean(overCanvas(e) || over));
    };
    const up = (e) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      if (!ghost) return;
      ghost.remove();
      this.host.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      const canvas = overCanvas(e);
      if (canvas) { canvas.dispatchEvent(new CustomEvent('explorer-drop', { detail: { ids, x: e.clientX, y: e.clientY } })); return; }
      const over = targetRow(e);
      if (over && !ids.includes(over.dataset.element)) this.app.moveElements(ids, over.dataset.element);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }
}

export { refId };

// Packet details: the dissection tree of the selected packet. A node opens with a click on its
// arrow (or ← → keys); selecting a node highlights its bytes; the context menu builds filters,
// columns and copies values. Which subtrees are open is remembered per field (like Wireshark).
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';

/** A stable key of a node for "which subtrees are open": the field name, else its label stem. */
export const nodeKey = (node) => node.abbrev ?? `text:${String(node.label).replace(/[\d.:]+/g, '#').slice(0, 40)}`;

export class DetailsTree {
  /** app: { doc(), t, expanded: Set, onSelectNode(node), onContext(event, node), onActivate(node) } */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.dissection = null;
    this.flat = [];
    this.selected = null;
    host.classList.add('details-tree');
    host.tabIndex = 0;
    host.setAttribute('role', 'tree');
    host.addEventListener('pointerdown', (event) => this.onPointer(event));
    host.addEventListener('dblclick', (event) => {
      const row = event.target.closest('[data-n]');
      if (row) { const node = this.flat[Number(row.dataset.n)]?.node; if (node?.children?.length) this.toggle(node); else app.onActivate?.(node); }
    });
    host.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const row = event.target.closest('[data-n]');
      const node = row ? this.flat[Number(row.dataset.n)]?.node : null;
      if (node) this.select(node);
      app.onContext?.(event, node);
    });
    host.addEventListener('keydown', (event) => this.onKey(event));
  }

  destroy() { this.host.innerHTML = ''; }

  get expanded() { return this.app.expanded; }

  show(dissection, { keepNode = true } = {}) {
    const previous = keepNode && this.selected ? nodeKey(this.selected) : null;
    this.dissection = dissection;
    this.selected = null;
    if (previous && dissection) this.selected = this.find((node) => nodeKey(node) === previous) ?? null;
    this.render();
  }

  find(test, nodes = this.dissection?.tree ?? []) {
    for (const node of nodes) {
      if (node.hidden) continue;
      if (test(node)) return node;
      const hit = node.children ? this.find(test, node.children) : null;
      if (hit) return hit;
    }
    return null;
  }

  isOpen(node) { return this.expanded.has(nodeKey(node)); }

  toggle(node, open = !this.isOpen(node)) {
    if (open) this.expanded.add(nodeKey(node)); else this.expanded.delete(nodeKey(node));
    this.render();
  }

  /** Opens or closes a node and everything below it. */
  setSubtree(node, open) {
    const walk = (n) => { if (n.children?.length) { if (open) this.expanded.add(nodeKey(n)); else this.expanded.delete(nodeKey(n)); n.children.forEach(walk); } };
    walk(node);
    this.render();
  }

  setAll(open) {
    if (!open) this.expanded.clear();
    else for (const node of this.dissection?.tree ?? []) { const walk = (n) => { if (n.children?.length) { this.expanded.add(nodeKey(n)); n.children.forEach(walk); } }; walk(node); }
    this.render();
  }

  render() {
    const t = this.app.t;
    this.flat = [];
    if (!this.dissection) {
      this.host.innerHTML = `<div class="details-empty">${icon('paneDetails')}<span>${escapeHtml(t('details.empty'))}</span></div>`;
      return;
    }
    const lines = [];
    const visit = (nodes, depth, path) => {
      for (const node of nodes) {
        if (node.hidden) continue;
        const n = this.flat.length;
        this.flat.push({ node, depth, path });
        const branch = Boolean(node.children?.some((c) => !c.hidden));
        const open = branch && this.isOpen(node);
        const severity = node.expert?.severity ?? '';
        const cls = ['dt-row', depth === 0 ? 'top' : '', node === this.selected ? 'selected' : '', node.generated ? 'generated' : '', severity ? `expert-${severity}` : '', node.type === 'protocol' ? 'proto' : ''].filter(Boolean).join(' ');
        const label = node.generated && !/^\[/.test(node.label) ? `[${node.label}]` : node.label;
        lines.push(`<div class="${cls}" data-n="${n}" role="treeitem" aria-level="${depth + 1}" ${branch ? `aria-expanded="${open}"` : ''} aria-selected="${node === this.selected}" style="--depth:${depth}" title="${escapeHtml(node.abbrev ? `${node.abbrev}${node.length ? ` · ${node.length} ${t('details.bytes')}` : ''}` : label)}">
          <span class="dt-arrow ${branch ? '' : 'leaf'}" data-toggle="${n}">${branch ? icon(open ? 'caretDown' : 'caretRight', 'icon tiny') : ''}</span>${severity ? `<span class="dt-expert ${severity}" aria-hidden="true"></span>` : ''}<span class="dt-label">${escapeHtml(label)}</span></div>`);
        if (open) visit(node.children, depth + 1, [...path, node]);
      }
    };
    visit(this.dissection.tree, 0, []);
    const scroll = this.host.scrollTop;
    this.host.innerHTML = lines.join('');
    this.host.scrollTop = scroll;
  }

  select(node, { notify = true } = {}) {
    this.selected = node;
    for (const row of this.host.querySelectorAll('.dt-row')) {
      const on = this.flat[Number(row.dataset.n)]?.node === node;
      row.classList.toggle('selected', on);
      row.setAttribute('aria-selected', String(on));
    }
    if (notify) this.app.onSelectNode?.(node);
  }

  /** Selects the node (opening its parents) — from a click in the bytes pane. */
  reveal(node) {
    if (!node || !this.dissection) return;
    const parents = [];
    const walk = (nodes, path) => { for (const n of nodes) { if (n === node) { parents.push(...path); return true; } if (n.children && walk(n.children, [...path, n])) return true; } return false; };
    walk(this.dissection.tree, []);
    for (const p of parents) this.expanded.add(nodeKey(p));
    this.selected = node;
    this.render();
    this.host.querySelector('.dt-row.selected')?.scrollIntoView({ block: 'nearest' });
  }

  onPointer(event) {
    if (event.button !== 0) return;
    const toggle = event.target.closest('[data-toggle]');
    const row = event.target.closest('[data-n]');
    if (!row) return;
    const item = this.flat[Number(row.dataset.n)];
    if (!item) return;
    this.host.focus({ preventScroll: true });
    if (toggle && toggle.innerHTML) { this.toggle(item.node); this.select(item.node); return; }
    this.select(item.node);
  }

  onKey(event) {
    if (!this.flat.length) return;
    const at = this.flat.findIndex((item) => item.node === this.selected);
    const item = this.flat[at];
    const go = (n) => { event.preventDefault(); const next = this.flat[Math.max(0, Math.min(this.flat.length - 1, n))]; if (next) { this.select(next.node); this.host.querySelector('.dt-row.selected')?.scrollIntoView({ block: 'nearest' }); } };
    const branch = item?.node.children?.some((c) => !c.hidden);
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'ArrowRight' && item) {
      event.preventDefault();
      if (event.ctrlKey && event.shiftKey) this.setAll(true);
      else if (event.ctrlKey || event.shiftKey) this.setSubtree(item.node, true);
      else if (branch && !this.isOpen(item.node)) this.toggle(item.node, true); else go(at + 1);
    } else if (event.key === 'ArrowLeft' && item) {
      event.preventDefault();
      if (event.ctrlKey && event.shiftKey) this.setAll(false);
      else if (event.ctrlKey || event.shiftKey) this.setSubtree(item.node, false);
      else if (branch && this.isOpen(item.node)) this.toggle(item.node, false);
      else if (item.path.length) { this.select(item.path[item.path.length - 1]); this.render(); }
    } else if (event.key === 'Enter' && item) { event.preventDefault(); if (branch) this.toggle(item.node); else this.app.onActivate?.(item.node); }
  }
}

// The centre's layout (Obsidian's workspace): a tree of splits (rows / columns with sizes) whose leaves are
// panes holding tabs. Pure model functions (Node-testable) and a renderer that keeps each tab's view
// element alive while panes are split, merged or tabs dragged between them.
//
//   node = { type: 'split', id, dir: 'row'|'column', sizes: [fractions], children: [node] }
//        | { type: 'leaf', id, tabs: [tab], active: index }
//   tab  = { id, kind: 'note'|'canvas'|'graph'|'media'|'empty'|'search'|'bases', path?, mode?, pinned?, state? }
let seq = 0;
export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(seq += 1).toString(36)}`;

export const newLeaf = (tabs = []) => ({ type: 'leaf', id: newId('l'), tabs: tabs.length ? tabs : [newTab({ kind: 'empty' })], active: 0 });
export const newTab = (props) => ({ id: newId('t'), mode: null, pinned: false, state: {}, ...props });
export const emptyLayout = () => ({ root: newLeaf(), active: null });

export function* leaves(node) { if (!node) return; if (node.type === 'leaf') yield node; else for (const c of node.children) yield* leaves(c); }
export const findLeaf = (layout, id) => [...leaves(layout.root)].find((l) => l.id === id) ?? null;
export const leafOfTab = (layout, tabId) => [...leaves(layout.root)].find((l) => l.tabs.some((t) => t.id === tabId)) ?? null;
export const findTab = (layout, tabId) => leafOfTab(layout, tabId)?.tabs.find((t) => t.id === tabId) ?? null;
export const allTabs = (layout) => [...leaves(layout.root)].flatMap((l) => l.tabs);
export function activeLeaf(layout) { return findLeaf(layout, layout.active) ?? [...leaves(layout.root)][0]; }
export function activeTab(layout) { const leaf = activeLeaf(layout); return leaf?.tabs[leaf.active] ?? null; }

function parentOf(node, id, parent = null) {
  if (node.id === id) return parent;
  if (node.type === 'split') for (const c of node.children) { const p = parentOf(c, id, node); if (p) return p; }
  return null;
}

/** Puts `tab` into the active leaf: replaces its current tab unless that one is pinned or `newTab`. */
export function openTab(layout, tab, { newTab: inNew = false, leafId = null } = {}) {
  const leaf = (leafId && findLeaf(layout, leafId)) || activeLeaf(layout);
  const current = leaf.tabs[leaf.active];
  if (!inNew && current && !current.pinned) {
    leaf.tabs[leaf.active] = { ...tab, id: tab.id ?? current.id, history: [...(current.history ?? []), current.path ? { kind: current.kind, path: current.path } : null].filter(Boolean).slice(-50), forward: [] };
    layout.active = leaf.id;
    return { leaf, tab: leaf.tabs[leaf.active], replaced: current };
  }
  leaf.tabs.splice(leaf.active + 1, 0, tab);
  leaf.active += current ? 1 : 0;
  if (!current) leaf.active = leaf.tabs.length - 1;
  layout.active = leaf.id;
  return { leaf, tab, replaced: null };
}

/** Splits leaf `leafId` (dir 'row' = side by side, 'column' = one above the other); the new leaf gets `tab`. */
export function splitLeaf(layout, leafId, dir, tab, { before = false } = {}) {
  const leaf = findLeaf(layout, leafId) ?? activeLeaf(layout);
  const fresh = newLeaf([tab]);
  const parent = parentOf(layout.root, leaf.id);
  if (parent && parent.dir === dir) {
    const i = parent.children.indexOf(leaf);
    const share = parent.sizes[i] / 2;
    parent.children.splice(before ? i : i + 1, 0, fresh);
    parent.sizes.splice(i, 1, share);
    parent.sizes.splice(before ? i : i + 1, 0, share);
  } else {
    const split = { type: 'split', id: newId('s'), dir, sizes: [0.5, 0.5], children: before ? [fresh, leaf] : [leaf, fresh] };
    if (!parent) layout.root = split; else parent.children[parent.children.indexOf(leaf)] = split;
  }
  layout.active = fresh.id;
  return fresh;
}

/** Removes a tab; an emptied leaf goes away (the last leaf keeps an empty tab). Returns the removed tab. */
export function closeTab(layout, tabId) {
  const leaf = leafOfTab(layout, tabId);
  if (!leaf) return null;
  const i = leaf.tabs.findIndex((t) => t.id === tabId);
  const [removed] = leaf.tabs.splice(i, 1);
  if (leaf.active >= leaf.tabs.length) leaf.active = Math.max(0, leaf.tabs.length - 1);
  else if (i < leaf.active) leaf.active -= 1;
  if (!leaf.tabs.length) removeLeaf(layout, leaf.id);
  return removed;
}

export function removeLeaf(layout, leafId) {
  const all = [...leaves(layout.root)];
  const leaf = all.find((l) => l.id === leafId);
  if (!leaf) return;
  if (all.length === 1) { leaf.tabs = [newTab({ kind: 'empty' })]; leaf.active = 0; return; }
  const parent = parentOf(layout.root, leafId);
  const i = parent.children.indexOf(leaf);
  const share = parent.sizes[i];
  parent.children.splice(i, 1);
  parent.sizes.splice(i, 1);
  const total = parent.sizes.reduce((a, b) => a + b, 0) || 1;
  parent.sizes = parent.sizes.map((s) => s + (share * s) / total);
  if (layout.active === leafId) layout.active = [...leaves(parent.children[Math.max(0, i - 1)])][0]?.id ?? null;
  normalize(layout);
}

/** Collapses single-child splits and merges nested splits of the same direction. */
export function normalize(layout) {
  const fix = (node) => {
    if (node.type === 'leaf') return node;
    node.children = node.children.map(fix);
    if (node.children.length === 1) return node.children[0];
    const children = [];
    const sizes = [];
    node.children.forEach((c, i) => {
      if (c.type === 'split' && c.dir === node.dir) { c.children.forEach((cc, j) => { children.push(cc); sizes.push(node.sizes[i] * c.sizes[j]); }); }
      else { children.push(c); sizes.push(node.sizes[i]); }
    });
    const total = sizes.reduce((a, b) => a + b, 0) || 1;
    return { ...node, children, sizes: sizes.map((s) => s / total) };
  };
  layout.root = fix(layout.root);
  if (!findLeaf(layout, layout.active)) layout.active = [...leaves(layout.root)][0]?.id ?? null;
  return layout;
}

/** Moves a tab: into leaf `toLeafId` at `index`, or to an edge of that leaf ('left'|'right'|'top'|'bottom') as a new split. */
export function moveTab(layout, tabId, toLeafId, { index = null, edge = null } = {}) {
  const from = leafOfTab(layout, tabId);
  const target = findLeaf(layout, toLeafId);
  if (!from || !target) return;
  if (edge === 'center') edge = null;
  if (!edge && from === target && index == null) return;
  const tab = from.tabs.find((t) => t.id === tabId);
  if (edge) {
    if (from === target && from.tabs.length === 1) return;
    const i = from.tabs.indexOf(tab);
    from.tabs.splice(i, 1);
    if (from.active >= from.tabs.length) from.active = Math.max(0, from.tabs.length - 1);
    splitLeaf(layout, target.id, edge === 'left' || edge === 'right' ? 'row' : 'column', tab, { before: edge === 'left' || edge === 'top' });
    if (!from.tabs.length) removeLeaf(layout, from.id);
    normalize(layout);
    return;
  }
  const oldIndex = from.tabs.indexOf(tab);
  from.tabs.splice(oldIndex, 1);
  let at = index ?? target.tabs.length;
  if (from === target && oldIndex < at) at -= 1;
  target.tabs.splice(Math.max(0, Math.min(at, target.tabs.length)), 0, tab);
  target.active = target.tabs.indexOf(tab);
  if (from !== target) { if (from.active >= from.tabs.length) from.active = Math.max(0, from.tabs.length - 1); if (!from.tabs.length) removeLeaf(layout, from.id); }
  layout.active = target.id;
  normalize(layout);
}

/** A copy for saving (workspaces, the session): tab state kept, views dropped. */
export const serialize = (layout) => JSON.parse(JSON.stringify(layout, (key, value) => (key === 'view' ? undefined : value)));
export function deserialize(saved) {
  const valid = (node) => node && ((node.type === 'leaf' && Array.isArray(node.tabs)) || (node.type === 'split' && Array.isArray(node.children) && node.children.length && node.children.every(valid)));
  if (!saved || !valid(saved.root)) return emptyLayout();
  const layout = JSON.parse(JSON.stringify(saved));
  for (const leaf of leaves(layout.root)) {
    leaf.tabs = leaf.tabs.filter((t) => t && t.kind).map((t) => ({ ...t, id: t.id ?? newId('t'), state: t.state ?? {} }));
    if (!leaf.tabs.length) leaf.tabs = [newTab({ kind: 'empty' })];
    leaf.active = Math.max(0, Math.min(leaf.active ?? 0, leaf.tabs.length - 1));
  }
  const fixSizes = (node) => { if (node.type !== 'split') return; if (!Array.isArray(node.sizes) || node.sizes.length !== node.children.length) node.sizes = node.children.map(() => 1 / node.children.length); node.children.forEach(fixSizes); };
  fixSizes(layout.root);
  return normalize(layout);
}

// ───────────────────────── rendering

/**
 * Draws the layout into `host`. `ui` supplies: tabHtml(tab, leaf, active) → inner HTML of a tab button,
 * leafToolsHtml(leaf) → buttons at the right of a tab strip, hostFor(tab) → the tab's view element (kept
 * alive between draws), onResize(). Splitters drag the sizes; the model is changed in place.
 */
export function renderLayout(host, layout, ui) {
  const keep = new Set();
  const build = (node) => {
    if (node.type === 'split') {
      const el = document.createElement('div');
      el.className = `ws-split ws-${node.dir}`;
      el.dataset.split = node.id;
      node.children.forEach((child, i) => {
        if (i) {
          const bar = document.createElement('div');
          bar.className = `ws-splitter ${node.dir === 'row' ? 'vertical' : 'horizontal'}`;
          bar.dataset.splitIndex = String(i);
          bar.dataset.splitOf = node.id;
          bar.setAttribute('role', 'separator');
          el.append(bar);
        }
        const c = build(child);
        c.style.flex = `${node.sizes[i]} 1 0px`;
        el.append(c);
      });
      return el;
    }
    const el = document.createElement('section');
    el.className = `ws-leaf ${layout.active === node.id ? 'is-active' : ''}`;
    el.dataset.leaf = node.id;
    const strip = document.createElement('div');
    strip.className = 'ws-tabs';
    strip.setAttribute('role', 'tablist');
    strip.innerHTML = `<div class="ws-tab-list">${node.tabs.map((tab, i) => `<div class="ws-tab ${i === node.active ? 'active' : ''} ${tab.pinned ? 'pinned' : ''}" data-tab="${tab.id}" draggable="true" role="tab" aria-selected="${i === node.active}">${ui.tabHtml(tab, node, i === node.active)}</div>`).join('')}</div>${ui.leafToolsHtml(node)}`;
    const body = document.createElement('div');
    body.className = 'ws-leaf-body';
    for (const [i, tab] of node.tabs.entries()) {
      const view = ui.hostFor(tab);
      view.hidden = i !== node.active;
      view.classList.add('ws-view');
      body.append(view);
      keep.add(tab.id);
    }
    el.append(strip, body);
    return el;
  };
  const tree = build(layout.root);
  host.replaceChildren(tree);
  ui.onResize?.();
  return keep;
}

/** Splitter dragging (call once on the host). */
export function bindSplitters(host, getLayout, { onChange, onResize }) {
  host.addEventListener('pointerdown', (event) => {
    const bar = event.target.closest?.('.ws-splitter');
    if (!bar || event.button !== 0) return;
    event.preventDefault();
    const layout = getLayout();
    const find = (node) => (node.id === bar.dataset.splitOf ? node : node.type === 'split' ? node.children.map(find).find(Boolean) : null);
    const split = find(layout.root);
    if (!split) return;
    const i = Number(bar.dataset.splitIndex);
    const container = bar.parentElement;
    const panes = [...container.children].filter((c) => !c.classList.contains('ws-splitter'));
    const row = split.dir === 'row';
    const total = panes.reduce((s, p) => s + (row ? p.offsetWidth : p.offsetHeight), 0) || 1;
    const start = row ? event.clientX : event.clientY;
    const a = split.sizes[i - 1];
    const b = split.sizes[i];
    const sum = a + b;
    bar.setPointerCapture(event.pointerId);
    document.body.style.cursor = row ? 'col-resize' : 'row-resize';
    const move = (e) => {
      const delta = ((row ? e.clientX : e.clientY) - start) / total * split.sizes.reduce((x, y) => x + y, 0);
      const min = 0.06 * sum;
      split.sizes[i - 1] = Math.max(min, Math.min(sum - min, a + delta));
      split.sizes[i] = sum - split.sizes[i - 1];
      panes[i - 1].style.flex = `${split.sizes[i - 1]} 1 0px`;
      panes[i].style.flex = `${split.sizes[i]} 1 0px`;
      onResize?.();
    };
    const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); document.body.style.cursor = ''; onChange?.(); };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });
  host.addEventListener('dblclick', (event) => {
    const bar = event.target.closest?.('.ws-splitter');
    if (!bar) return;
    const layout = getLayout();
    const find = (node) => (node.id === bar.dataset.splitOf ? node : node.type === 'split' ? node.children.map(find).find(Boolean) : null);
    const split = find(layout.root);
    if (!split) return;
    split.sizes = split.children.map(() => 1 / split.children.length);
    onChange?.(true);
  });
}

/** Where a dragged tab would land over a leaf body: an edge (new split) or the centre (join the pane). */
export function dropZone(rect, x, y) {
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
  if (edge > 0.22) return 'center';
  if (edge === fx) return 'left';
  if (edge === 1 - fx) return 'right';
  if (edge === fy) return 'top';
  return 'bottom';
}

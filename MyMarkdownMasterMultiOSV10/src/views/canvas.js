// Canvas view: an Obsidian-style infinite board for `.canvas` files (JSON Canvas 1.0).
// Cards are DOM elements in one transformed layer (crisp text at every zoom), edges are SVG
// curves in the same layer between the groups and the cards. The data model, geometry and
// Undo stack live in canvas-model.js (no DOM, unit-tested).
//
//   const view = createCanvasView(host, api);   // loads the file and fits it into view
//   view.resize(); view.zoomToFit(); view.undo(); view.redo(); view.dirty; view.destroy();
import './canvas.css';
import { registerTexts, t } from '../i18n.js';
import { icon, registerIcons } from '../icons.js';
import { escapeHtml, pointerDrag } from '../ui/dom.js';
import * as M from './canvas-model.js';
import TEXTS from './canvas/texts.js';

registerTexts(TEXTS);
registerIcons({
  canvasCard: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/>',
  canvasNote: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
  canvasGroup: '<rect x="3" y="4" width="18" height="16" rx="2" stroke-dasharray="3 2.5"/><path d="M6.5 8h5"/>',
  canvasArrowNone: '<path d="M4 12h16"/><circle cx="4" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
  canvasArrowTo: '<path d="M4 12h15M14 7l5 5-5 5"/>',
  canvasArrowBoth: '<path d="M5 12h14M10 7l-5 5 5 5M14 7l5 5-5 5"/>',
});

const SAVE_DELAY = 600;
const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const PRESETS = ['1', '2', '3', '4', '5', '6'];
const KIND_ICON = { note: 'markdownFile', image: 'picture', audio: 'play', video: 'tutorialVideo', pdf: 'pdfFile', canvas: 'diagram', other: 'file' };
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Nodes and edges copied with Ctrl+C (shared by every open canvas). */
let clipboard = null;

const colorStyle = (color) => {
  const info = M.colorInfo(color);
  if (!info) return '';
  return info.preset ? `var(--tone-${info.preset})` : info.hex;
};

export function createCanvasView(host, api = {}) {
  let doc = M.emptyCanvas();
  let view = { x: 0, y: 0, scale: 1 };
  let selected = new Set();
  let editingId = null;
  let dirty = false;
  let version = 0;
  let saveTimer = 0;
  let broken = false;
  let loaded = false;
  let pendingFit = false;
  let spaceHeld = false;
  let destroyed = false;
  let lastPointer = null;
  let lastDown = null;
  let paletteOpen = false;
  let dragging = false;
  let inlineEditor = null;
  const history = new M.CanvasHistory();
  const elements = new Map();

  host.classList.add('cv-host');
  if (!host.hasAttribute('tabindex')) host.tabIndex = 0;
  host.innerHTML = `
    <div class="cv-board">
      <div class="cv-world">
        <div class="cv-groups"></div>
        <svg class="cv-edges" width="1" height="1" aria-hidden="true"><g class="cv-edge-items"></g><path class="cv-live-edge" d="" /></svg>
        <div class="cv-nodes"></div>
        <div class="cv-labels"></div>
      </div>
      <div class="cv-selbox" hidden></div>
      <div class="cv-hint" hidden>${escapeHtml(t('canvas.emptyHint'))}</div>
    </div>
    <div class="cv-banner" hidden>${escapeHtml(t('canvas.readOnly'))}</div>
    <div class="cv-menu" hidden></div>
    <div class="cv-palette" hidden></div>
    <form class="cv-inputbar" hidden>
      ${icon('hyperlink')}
      <input type="text" spellcheck="false" autocomplete="off" placeholder="${escapeHtml(t('canvas.linkPlaceholder'))}">
      <button type="submit" class="icon-button" title="${escapeHtml(t('canvas.add'))}">${icon('check')}</button>
      <button type="button" class="icon-button cv-input-cancel" title="${escapeHtml(t('canvas.cancel'))}">${icon('close')}</button>
    </form>
    <div class="cv-toolbar" role="toolbar">
      ${toolButton('addText', 'canvasCard', 'canvas.addText')}
      ${toolButton('addNote', 'canvasNote', 'canvas.addNote')}
      ${toolButton('addMedia', 'picture', 'canvas.addMedia')}
      ${toolButton('addLink', 'hyperlink', 'canvas.addLink')}
      ${toolButton('addGroup', 'canvasGroup', 'canvas.addGroup')}
      <span class="cv-sep"></span>
      ${toolButton('zoomOut', 'zoomOut', 'canvas.zoomOut')}
      <span class="cv-zoom" title="${escapeHtml(t('canvas.zoomReset'))}">100%</span>
      ${toolButton('zoomIn', 'zoomIn', 'canvas.zoomIn')}
      ${toolButton('zoomFit', 'fitPage', 'canvas.zoomFit')}
      ${toolButton('zoomReset', 'zoomReset', 'canvas.zoomReset')}
      <span class="cv-sep"></span>
      ${toolButton('undo', 'undo', 'canvas.undo')}
      ${toolButton('redo', 'redo', 'canvas.redo')}
    </div>`;

  const $ = (sel) => host.querySelector(sel);
  const board = $('.cv-board');
  const world = $('.cv-world');
  const groupLayer = $('.cv-groups');
  const nodeLayer = $('.cv-nodes');
  const labelLayer = $('.cv-labels');
  const edgeItems = $('.cv-edge-items');
  const liveEdge = $('.cv-live-edge');
  const selBox = $('.cv-selbox');
  const hint = $('.cv-hint');
  const banner = $('.cv-banner');
  const menu = $('.cv-menu');
  const palette = $('.cv-palette');
  const inputBar = $('.cv-inputbar');
  const inputField = inputBar.querySelector('input');
  const toolbar = $('.cv-toolbar');
  const zoomLabel = $('.cv-zoom');

  function toolButton(action, iconName, key) {
    return `<button type="button" class="tool-button" data-action="${action}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(iconName)}</button>`;
  }

  // ───────── helpers

  const byId = (id) => doc.nodes.find((n) => n.id === id) ?? null;
  const edgeById = (id) => doc.edges.find((e) => e.id === id) ?? null;
  const selectedNodes = () => doc.nodes.filter((n) => selected.has(n.id));
  const selectedEdges = () => doc.edges.filter((e) => selected.has(e.id));
  const boardRect = () => board.getBoundingClientRect();
  const kindOf = (path) => { try { return api.kindOf?.(path) ?? guessKind(path); } catch { return guessKind(path); } };
  const notify = (kind, text) => { try { api.notify?.(kind, text); } catch { /* host gone */ } };

  function guessKind(path) {
    const ext = String(path).split('.').pop().toLowerCase();
    if (['md', 'markdown', 'txt'].includes(ext)) return 'note';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio';
    if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'canvas') return 'canvas';
    return 'other';
  }

  /** World point of a pointer event (or client x / y). */
  function toWorld(e) {
    const r = boardRect();
    return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale };
  }
  const toScreen = (p) => ({ x: p.x * view.scale + view.x, y: p.y * view.scale + view.y });

  function viewCenterWorld() {
    const r = boardRect();
    return { x: (r.width / 2 - view.x) / view.scale, y: (r.height / 2 - view.y) / view.scale };
  }

  /** Keyboard focus to the board (this also ends a text edit or label edit through its blur). */
  function focusHost() {
    if (!destroyed && document.activeElement !== host) host.focus({ preventScroll: true });
  }

  // ───────── saving and history

  function markDirty() {
    version++;
    if (!dirty) { dirty = true; api.onDirty?.(true); }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
  }

  async function save() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (broken || !dirty) return;
    const v = version;
    try {
      await api.write?.(M.serializeCanvas(doc));
      if (v === version && dirty) { dirty = false; api.onDirty?.(false); }
    } catch (error) {
      notify('error', t('canvas.saveError', { error: error?.message ?? String(error) }));
    }
  }

  /** Records the current state for Undo and schedules a save. */
  function commit() {
    if (broken) return;
    if (history.push(doc)) markDirty();
    updateUndoButtons();
  }

  function restore(snapshot) {
    if (!snapshot) return;
    editingId = null;
    closeInlineEditor(false);
    doc = snapshot;
    selected = new Set([...selected].filter((id) => byId(id) || edgeById(id)));
    renderAll();
    markDirty();
    updateUndoButtons();
  }

  const undo = () => { if (editingId) stopEditing(); restore(history.undo()); };
  const redo = () => { if (editingId) stopEditing(); restore(history.redo()); };

  function updateUndoButtons() {
    toolbar.querySelector('[data-action="undo"]').disabled = !history.canUndo;
    toolbar.querySelector('[data-action="redo"]').disabled = !history.canRedo;
  }

  // ───────── loading

  async function reload() {
    let text = '';
    try { text = (await api.read?.()) ?? ''; } catch (error) { text = ''; notify('error', String(error?.message ?? error)); }
    if (destroyed) return;
    try {
      doc = M.parseCanvas(text);
      broken = false;
    } catch (error) {
      doc = M.emptyCanvas();
      broken = true;
      notify('error', t('canvas.parseError', { error: error?.message ?? String(error) }));
    }
    banner.hidden = !broken;
    host.classList.toggle('cv-readonly', broken);
    for (const button of toolbar.querySelectorAll('[data-action^="add"]')) button.disabled = broken;
    editingId = null;
    selected = new Set([...selected].filter((id) => byId(id) || edgeById(id)));
    for (const el of elements.values()) el.remove();
    elements.clear();
    history.reset(doc);
    clearTimeout(saveTimer);
    if (dirty) { dirty = false; api.onDirty?.(false); }
    renderAll();
    updateUndoButtons();
    if (!loaded) { loaded = true; zoomToFit(); }
  }

  // ───────── view transform

  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    world.style.setProperty('--cv-inv', String(1 / view.scale));
    let step = 20 * view.scale;
    while (step < 12) step *= 2;
    board.style.backgroundSize = `${step}px ${step}px`;
    board.style.backgroundPosition = `${view.x}px ${view.y}px`;
    board.style.setProperty('--cv-dot', `${Math.max(0.7, Math.min(1.4, view.scale))}px`);
    zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
    positionMenu();
    positionInlineEditor();
  }

  function setView(next) { view = next; applyView(); }

  function zoomBy(factor, sx, sy) {
    const r = boardRect();
    setView(M.zoomViewAt(view, factor, sx ?? r.width / 2, sy ?? r.height / 2, MIN_SCALE, MAX_SCALE));
  }

  function fitTo(bounds, maxScale = 1) {
    const r = boardRect();
    if (r.width < 10 || r.height < 10) { pendingFit = true; return; }
    pendingFit = false;
    setView(M.fitView(bounds, r.width, r.height, { padding: 60, maxScale, minScale: MIN_SCALE }));
  }

  function zoomToFit() { fitTo(M.boundsOf(doc.nodes)); }

  function zoomToSelection() {
    const nodes = selectedNodes();
    const edges = selectedEdges();
    for (const e of edges) { const a = byId(e.fromNode); const b = byId(e.toNode); if (a) nodes.push(a); if (b) nodes.push(b); }
    if (nodes.length) fitTo(M.boundsOf(nodes), 2); else zoomToFit();
  }

  // ───────── rendering

  function renderAll() {
    syncNodes();
    renderEdges();
    updateSelectionClasses();
    hint.hidden = doc.nodes.length > 0 || broken;
    renderMenu();
    applyView();
  }

  function syncNodes() {
    const alive = new Set(doc.nodes.map((n) => n.id));
    for (const [id, el] of elements) if (!alive.has(id)) { el.remove(); elements.delete(id); }
    const groups = doc.nodes.filter((n) => n.type === 'group').sort((a, b) => b.width * b.height - a.width * a.height);
    const cards = doc.nodes.filter((n) => n.type !== 'group');
    placeInLayer(groupLayer, groups);
    placeInLayer(nodeLayer, cards);
  }

  function placeInLayer(layer, nodes) {
    nodes.forEach((node, index) => {
      let el = elements.get(node.id);
      if (!el || el.dataset.type !== node.type) { el?.remove(); el = createNodeElement(node); elements.set(node.id, el); }
      const at = layer.children[index];
      if (at !== el) layer.insertBefore(el, at ?? null);
      updateNodeElement(node, el);
    });
  }

  function createNodeElement(node) {
    const el = document.createElement('div');
    el.className = `cv-node cv-type-${node.type === 'group' ? 'group' : escapeHtml(node.type)}`;
    el.dataset.id = node.id;
    el.dataset.type = node.type;
    const handles = RESIZE_DIRS.map((d) => `<div class="cv-resize cv-resize-${d}" data-dir="${d}"></div>`).join('');
    const connects = M.SIDES.map((s) => `<div class="cv-connect cv-connect-${s}" data-side="${s}" title="${escapeHtml(t('canvas.connect'))}"></div>`).join('');
    el.innerHTML = `<div class="cv-content"></div>${handles}${connects}`;
    return el;
  }

  function updateNodeElement(node, el = elements.get(node.id)) {
    if (!el) return;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.width}px`;
    el.style.height = `${node.height}px`;
    const info = M.colorInfo(node.color);
    if (info?.preset) { el.dataset.color = node.color; el.style.removeProperty('--cv-color'); }
    else if (info?.hex) { el.dataset.color = 'custom'; el.style.setProperty('--cv-color', info.hex); }
    else { delete el.dataset.color; el.style.removeProperty('--cv-color'); }
    renderContent(node, el);
  }

  /** Fills a card's content when what it shows changed. */
  function renderContent(node, el) {
    const editing = editingId === node.id;
    const key = JSON.stringify([node.type, node.text, node.file, node.subpath, node.url, node.label, node.background, node.backgroundStyle, editing]);
    if (el._key === key) return;
    el._key = key;
    const token = (el._token = (el._token ?? 0) + 1);
    const content = el.querySelector('.cv-content');
    const stale = () => el._token !== token || destroyed;

    if (node.type === 'text') {
      if (editing) {
        content.innerHTML = '<textarea class="cv-editor cv-scroll" spellcheck="false"></textarea>';
        const area = content.firstChild;
        area.value = node.text ?? '';
        area.addEventListener('input', () => { node.text = area.value; el._key = JSON.stringify([node.type, node.text, node.file, node.subpath, node.url, node.label, node.background, node.backgroundStyle, true]); });
        area.addEventListener('blur', () => { if (editingId === node.id) stopEditing(); });
        requestAnimationFrame(() => { if (!stale()) { area.focus({ preventScroll: true }); area.setSelectionRange(area.value.length, area.value.length); } });
      } else {
        content.innerHTML = '<div class="cv-md cv-scroll"></div>';
        renderMarkdownInto(node.text ?? '', content.firstChild, api.path, stale);
      }
      return;
    }

    if (node.type === 'file') {
      const kind = kindOf(node.file);
      const name = M.baseName(node.file) + (node.subpath ? node.subpath : '');
      content.innerHTML = `<div class="cv-file-head" title="${escapeHtml(node.file)}">${icon(KIND_ICON[kind] ?? 'file')}<span>${escapeHtml(name)}</span></div><div class="cv-file-body cv-scroll cv-kind-${kind}"></div>`;
      const body = content.lastChild;
      if (kind === 'note') {
        body.innerHTML = '<div class="cv-md"></div>';
        Promise.resolve(api.readNote?.(node.file))
          .then((text) => { if (!stale()) return renderMarkdownInto(M.extractSection(text ?? '', node.subpath), body.firstChild, node.file, stale); })
          .catch(() => { if (!stale()) showMissing(body, node); });
      } else if (kind === 'image' || kind === 'video' || kind === 'audio') {
        Promise.resolve(api.resourceUrl?.(node.file)).then((url) => {
          if (stale()) return;
          if (!url) { showMissing(body, node); return; }
          const tag = kind === 'image' ? 'img' : kind;
          const media = document.createElement(tag);
          if (kind === 'image') { media.draggable = false; media.alt = M.baseName(node.file); media.onerror = () => showMissing(body, node); } else media.controls = true;
          media.src = url;
          body.replaceChildren(media);
        }).catch(() => { if (!stale()) showMissing(body, node); });
      } else {
        body.innerHTML = `<div class="cv-file-other">${icon(KIND_ICON[kind] ?? 'file', 'icon cv-big-icon')}<span>${escapeHtml(M.baseName(node.file))}</span>
          <button type="button" class="icon-button cv-open-file" title="${escapeHtml(t('canvas.openFile'))}">${icon('readerExternal')}</button></div>`;
        body.querySelector('.cv-open-file').addEventListener('click', (e) => { e.stopPropagation(); api.openFile?.(node.file, { newTab: e.ctrlKey || e.metaKey }); });
      }
      return;
    }

    if (node.type === 'link') {
      let hostName = node.url;
      try { hostName = new URL(node.url).hostname || node.url; } catch { /* not a URL */ }
      content.innerHTML = `<div class="cv-link">
        <div class="cv-link-title">${icon('globe')}<span>${escapeHtml(hostName)}</span></div>
        <div class="cv-link-url" title="${escapeHtml(node.url)}">${escapeHtml(node.url)}</div>
        <button type="button" class="cv-open-link" title="${escapeHtml(node.url)}">${icon('readerExternal')}<span>${escapeHtml(t('canvas.openLink'))}</span></button>
      </div>`;
      content.querySelector('.cv-open-link').addEventListener('click', (e) => { e.stopPropagation(); if (node.url) api.openExternal?.(node.url); });
      return;
    }

    if (node.type === 'group') {
      content.innerHTML = `<div class="cv-group-label"${node.label ? '' : ' data-empty=""'}>${escapeHtml(node.label ?? '')}</div><div class="cv-group-bg"></div>`;
      const bg = content.lastChild;
      if (node.background) {
        Promise.resolve(api.resourceUrl?.(node.background)).then((url) => {
          if (stale() || !url) return;
          bg.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
          bg.dataset.style = node.backgroundStyle ?? 'cover';
        }).catch(() => {});
      }
      return;
    }

    content.innerHTML = `<div class="cv-file-other">${icon('question', 'icon cv-big-icon')}<span>${escapeHtml(t('canvas.unknownType', { type: node.type }))}</span></div>`;
  }

  function renderMarkdownInto(text, element, sourcePath, stale) {
    if (!api.renderMarkdown) { element.textContent = text; return Promise.resolve(); }
    return Promise.resolve(api.renderMarkdown(text, element, sourcePath)).catch(() => { if (!stale()) element.textContent = text; });
  }

  function showMissing(body, node) {
    body.innerHTML = `<div class="cv-file-other cv-missing">${icon('warning', 'icon cv-big-icon')}<span>${escapeHtml(t('canvas.missingFile', { name: M.baseName(node.file) }))}</span></div>`;
  }

  function updateSelectionClasses() {
    for (const [id, el] of elements) el.classList.toggle('cv-selected', selected.has(id));
    for (const el of edgeItems.querySelectorAll('[data-edge]')) el.classList.toggle('cv-selected', selected.has(el.dataset.edge));
    for (const el of labelLayer.querySelectorAll('[data-edge]')) el.classList.toggle('cv-selected', selected.has(el.dataset.edge));
    host.classList.toggle('cv-single', selected.size === 1);
  }

  function edgeGeometry(edge) {
    const from = byId(edge.fromNode);
    const to = byId(edge.toNode);
    if (!from || !to) return null;
    return M.edgeCurve(from, edge.fromSide, to, edge.toSide);
  }

  function renderEdges() {
    let svg = '';
    let labels = '';
    for (const edge of doc.edges) {
      const c = edgeGeometry(edge);
      if (!c) continue;
      const d = M.curvePath(c);
      const color = colorStyle(edge.color);
      const sel = selected.has(edge.id) ? ' cv-selected' : '';
      let arrows = '';
      for (const which of ['from', 'to']) {
        if (M.edgeEnd(edge, which) !== 'arrow') continue;
        const [a, b, e] = M.arrowHead(c, which, 14);
        arrows += `<path class="cv-edge-arrow" d="M${a.x},${a.y} L${b.x},${b.y} L${e.x},${e.y} Z"/>`;
      }
      svg += `<g class="cv-edge${sel}" data-edge="${escapeHtml(edge.id)}"${color ? ` style="color:${escapeHtml(color)}"` : ''}><path class="cv-edge-hit" d="${d}"/><path class="cv-edge-line" d="${d}"/>${arrows}</g>`;
      if (edge.label && !(inlineEditor?.edgeId === edge.id)) {
        const mid = M.curvePoint(c, 0.5);
        labels += `<div class="cv-edge-label${sel}" data-edge="${escapeHtml(edge.id)}" style="left:${mid.x}px;top:${mid.y}px${color ? `;--cv-color:${escapeHtml(color)}` : ''}">${escapeHtml(edge.label)}</div>`;
      }
    }
    edgeItems.innerHTML = svg;
    labelLayer.innerHTML = labels;
  }

  // ───────── selection menu

  function renderMenu() {
    paletteOpen = false;
    palette.hidden = true;
    if (!selected.size || broken || editingId || dragging) { menu.hidden = true; return; }
    const nodes = selectedNodes();
    const edges = selectedEdges();
    if (!nodes.length && !edges.length) { menu.hidden = true; return; }
    const one = nodes.length === 1 && !edges.length ? nodes[0] : null;
    const oneEdge = edges.length === 1 && !nodes.length ? edges[0] : null;
    const colors = [...nodes, ...edges].map((x) => x.color ?? '');
    const current = colors.every((c) => c === colors[0]) ? colors[0] : '';
    const swatch = colorStyle(current);
    const b = (action, iconName, key, extra = '') => `<button type="button" class="icon-button${extra}" data-menu="${action}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(iconName)}</button>`;
    let html = `<button type="button" class="icon-button cv-swatch-button" data-menu="color" title="${escapeHtml(t('canvas.color'))}"><span class="cv-swatch${swatch ? '' : ' cv-swatch-none'}" style="${swatch ? `background:${escapeHtml(swatch)}` : ''}"></span></button>`;
    if (oneEdge) {
      const dir = M.edgeDirection(oneEdge);
      html += b('arrowNone', 'canvasArrowNone', 'canvas.arrowNone', dir === 'none' ? ' active' : '');
      html += b('arrowTo', 'canvasArrowTo', 'canvas.arrowTo', dir === 'to' || dir === 'from' ? ' active' : '');
      html += b('arrowBoth', 'canvasArrowBoth', 'canvas.arrowBoth', dir === 'both' ? ' active' : '');
      html += b('label', 'tag', 'canvas.editLabel');
    }
    if (one?.type === 'text') html += b('edit', 'edit', 'canvas.edit');
    if (one?.type === 'group') html += b('label', 'tag', 'canvas.editLabel');
    if (one?.type === 'file') html += b('openFile', 'readerExternal', 'canvas.openFile');
    if (one?.type === 'link') html += b('openLink', 'readerExternal', 'canvas.openLink');
    if (nodes.length) html += b('duplicate', 'duplicate', 'canvas.duplicate');
    html += b('zoomSelection', 'zoomSelection', 'canvas.zoomSelection');
    html += b('delete', 'trash', 'canvas.delete');
    menu.innerHTML = html;
    menu.hidden = false;
    positionMenu();
  }

  function selectionScreenRect() {
    const rects = selectedNodes().map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
    for (const e of selectedEdges()) {
      const c = edgeGeometry(e);
      if (c) { const p = M.curvePoint(c, 0.5); rects.push({ x: p.x, y: p.y, width: 0, height: 0 }); }
    }
    const b = M.boundsOf(rects);
    if (!b) return null;
    const a = toScreen(b);
    return { x: a.x, y: a.y, width: b.width * view.scale, height: b.height * view.scale };
  }

  function positionMenu() {
    if (menu.hidden) return;
    const s = selectionScreenRect();
    if (!s) { menu.hidden = true; return; }
    const r = boardRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    let left = s.x + s.width / 2 - w / 2;
    let top = s.y - h - 12;
    if (top < 8) top = s.y + s.height + 12;
    if (top + h > r.height - 8) top = Math.max(8, Math.min(r.height - h - 8, s.y + 8));
    left = Math.max(8, Math.min(r.width - w - 8, left));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    if (paletteOpen) positionPalette();
  }

  function positionPalette() {
    const button = menu.querySelector('[data-menu="color"]');
    if (!button) return;
    const hostRect = host.getBoundingClientRect();
    const br = button.getBoundingClientRect();
    const w = palette.offsetWidth;
    let left = br.left - hostRect.left;
    left = Math.max(8, Math.min(hostRect.width - w - 8, left));
    let top = br.bottom - hostRect.top + 6;
    if (top + palette.offsetHeight > hostRect.height - 8) top = br.top - hostRect.top - palette.offsetHeight - 6;
    palette.style.left = `${Math.round(left)}px`;
    palette.style.top = `${Math.round(top)}px`;
  }

  function openPalette() {
    const items = [...selectedNodes(), ...selectedEdges()];
    const current = items[0]?.color ?? '';
    const custom = M.colorInfo(current)?.hex ?? '#888888';
    palette.innerHTML = `<button type="button" class="cv-color" data-color="" title="${escapeHtml(t('canvas.colorNone'))}"><span class="cv-swatch cv-swatch-none"></span></button>${
      PRESETS.map((c) => `<button type="button" class="cv-color${current === c ? ' active' : ''}" data-color="${c}" title="${escapeHtml(t(`canvas.color${c}`))}"><span class="cv-swatch" style="background:${colorStyle(c)}"></span></button>`).join('')
    }<label class="cv-color cv-color-custom${M.colorInfo(current)?.hex ? ' active' : ''}" title="${escapeHtml(t('canvas.colorCustom'))}"><span class="cv-swatch cv-swatch-custom"></span><input type="color" value="${escapeHtml(custom)}"></label>`;
    palette.hidden = false;
    paletteOpen = true;
    positionPalette();
    const input = palette.querySelector('input');
    input.addEventListener('input', () => setColor(input.value, false));
    input.addEventListener('change', () => setColor(input.value, true));
  }

  function setColor(color, finish = true) {
    for (const item of [...selectedNodes(), ...selectedEdges()]) {
      if (color) item.color = color; else delete item.color;
    }
    for (const n of selectedNodes()) updateNodeElement(n);
    renderEdges();
    updateSelectionClasses();
    if (finish) { commit(); renderMenu(); }
  }

  menu.addEventListener('pointerdown', (e) => e.stopPropagation());
  palette.addEventListener('pointerdown', (e) => e.stopPropagation());
  menu.addEventListener('click', (e) => {
    const button = e.target.closest('[data-menu]');
    if (!button) return;
    const action = button.dataset.menu;
    const one = selected.size === 1 ? [...selected][0] : null;
    if (action === 'color') { if (paletteOpen) { palette.hidden = true; paletteOpen = false; } else openPalette(); return; }
    if (action === 'delete') deleteSelection();
    else if (action === 'zoomSelection') zoomToSelection();
    else if (action === 'duplicate') duplicateSelection();
    else if (action === 'edit' && one) startEditing(one);
    else if (action === 'openFile' && one) api.openFile?.(byId(one)?.file, { newTab: e.ctrlKey || e.metaKey });
    else if (action === 'openLink' && one) { const url = byId(one)?.url; if (url) api.openExternal?.(url); }
    else if (action === 'label' && one) { if (edgeById(one)) editEdgeLabel(one); else editGroupLabel(one); }
    else if (action.startsWith('arrow') && one && edgeById(one)) {
      M.setEdgeDirection(edgeById(one), { arrowNone: 'none', arrowTo: 'to', arrowBoth: 'both' }[action]);
      renderEdges(); updateSelectionClasses(); commit(); renderMenu();
    }
    if (!editingId && !inlineEditor) focusHost();
  });
  palette.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-color]');
    if (!button) return;
    setColor(button.dataset.color, true);
    focusHost();
  });

  // ───────── selection

  function selectOnly(...ids) { selected = new Set(ids); updateSelectionClasses(); renderMenu(); }
  function clearSelection() { if (!selected.size) return; selected = new Set(); updateSelectionClasses(); renderMenu(); }
  function selectAll() { selected = new Set([...doc.nodes.map((n) => n.id), ...doc.edges.map((e) => e.id)]); updateSelectionClasses(); renderMenu(); }

  /** The nodes a drag moves: the selected ones plus everything inside selected groups. */
  function movingNodes() {
    const ids = new Set();
    for (const n of selectedNodes()) {
      ids.add(n.id);
      if (n.type === 'group') for (const inner of M.nodesInGroup(doc.nodes, n)) ids.add(inner.id);
    }
    return doc.nodes.filter((n) => ids.has(n.id));
  }

  // ───────── editing

  function startEditing(id) {
    const node = byId(id);
    if (!node || node.type !== 'text' || broken) return;
    if (editingId && editingId !== id) stopEditing();
    editingId = id;
    selected = new Set([id]);
    updateSelectionClasses();
    menu.hidden = true;
    updateNodeElement(node);
    elements.get(id)?.classList.add('cv-editing');
  }

  function stopEditing() {
    const id = editingId;
    if (!id) return;
    editingId = null;
    const node = byId(id);
    elements.get(id)?.classList.remove('cv-editing');
    if (node) updateNodeElement(node);
    commit();
    renderMenu();
  }

  /** A small text field over the board (edge and group labels). */
  function openInlineEditor({ value, edgeId = null, groupId = null, done }) {
    closeInlineEditor(false);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cv-inline-input';
    input.value = value ?? '';
    input.placeholder = t('canvas.labelPlaceholder');
    input.spellcheck = false;
    host.appendChild(input);
    inlineEditor = { input, edgeId, groupId, done };
    menu.hidden = true;
    renderEdges();
    updateSelectionClasses();
    positionInlineEditor();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); closeInlineEditor(true); focusHost(); } else if (e.key === 'Escape') { e.preventDefault(); closeInlineEditor(false); focusHost(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => closeInlineEditor(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  function closeInlineEditor(accept) {
    const ed = inlineEditor;
    if (!ed) return;
    inlineEditor = null;
    const value = ed.input.value;
    ed.input.remove();
    if (accept) ed.done(value.trim());
    renderEdges();
    updateSelectionClasses();
    renderMenu();
  }

  function positionInlineEditor() {
    const ed = inlineEditor;
    if (!ed) return;
    let p = null;
    if (ed.edgeId) { const e = edgeById(ed.edgeId); const c = e && edgeGeometry(e); if (c) p = toScreen(M.curvePoint(c, 0.5)); }
    if (ed.groupId) { const g = byId(ed.groupId); if (g) { const s = toScreen(g); p = { x: s.x + 90, y: s.y - 16 }; } }
    if (!p) { closeInlineEditor(false); return; }
    ed.input.style.left = `${Math.round(p.x)}px`;
    ed.input.style.top = `${Math.round(p.y)}px`;
  }

  function editEdgeLabel(id) {
    const edge = edgeById(id);
    if (!edge || broken) return;
    selectOnly(id);
    openInlineEditor({ value: edge.label, edgeId: id, done: (v) => { if (v) edge.label = v; else delete edge.label; commit(); } });
  }

  function editGroupLabel(id) {
    const group = byId(id);
    if (!group || group.type !== 'group' || broken) return;
    selectOnly(id);
    openInlineEditor({ value: group.label, groupId: id, done: (v) => { if (v) group.label = v; else delete group.label; updateNodeElement(group); commit(); } });
  }

  // ───────── creating and changing

  function freeSpot(x, y, width, height) {
    let px = x; let py = y;
    for (let i = 0; i < 40 && doc.nodes.some((n) => n.type !== 'group' && M.intersects(n, { x: px, y: py, width, height })); i++) { px += 30; py += 30; }
    return { x: px, y: py };
  }

  function addNodes(nodes, { edit = false, front = true } = {}) {
    if (broken) return;
    if (front) doc.nodes.push(...nodes); else doc.nodes.unshift(...nodes);
    selected = new Set(nodes.map((n) => n.id));
    renderAll();
    if (edit && nodes.length === 1 && nodes[0].type === 'text') { commit(); startEditing(nodes[0].id); } else commit();
  }

  function createTextAt(p, edit = true) {
    const { width, height } = M.DEFAULT_SIZE.text;
    const node = M.makeNode('text', { x: M.snap(p.x - width / 2), y: M.snap(p.y - height / 2) });
    addNodes([node], { edit });
    return node;
  }

  function centerSpot(width, height) {
    const c = viewCenterWorld();
    return freeSpot(M.snap(c.x - width / 2), M.snap(c.y - height / 2), width, height);
  }

  async function addFile(path, at = null) {
    if (!path || broken) return;
    const kind = kindOf(path);
    let width = 400; let height = 400;
    if (kind === 'audio') { width = 400; height = 110; }
    if (kind === 'video') { width = 480; height = 320; }
    if (kind === 'pdf') { width = 400; height = 120; }
    if (kind === 'other' || kind === 'canvas') { width = 320; height = 120; }
    if (kind === 'image') {
      const size = await imageSize(path);
      if (size) { width = 400; height = Math.max(60, Math.min(1200, Math.round((400 * size.height) / Math.max(1, size.width)) + 36)); }
    }
    if (destroyed) return;
    const spot = at ? { x: M.snap(at.x - width / 2), y: M.snap(at.y - height / 2) } : centerSpot(width, height);
    addNodes([M.makeNode('file', { file: path, ...spot, width, height })]);
  }

  async function imageSize(path) {
    try {
      const url = await api.resourceUrl?.(path);
      if (!url) return null;
      return await new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => resolve(null), 3000);
        img.onload = () => { clearTimeout(timer); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = url;
      });
    } catch { return null; }
  }

  function addLink(url, at = null) {
    let value = String(url ?? '').trim();
    if (!value) return;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
    const { width, height } = M.DEFAULT_SIZE.link;
    const spot = at ? { x: M.snap(at.x - width / 2), y: M.snap(at.y - height / 2) } : centerSpot(width, height);
    addNodes([M.makeNode('link', { url: value, ...spot })]);
  }

  function addGroup() {
    if (broken) return;
    const picked = selectedNodes();
    let rect;
    if (picked.length) {
      const b = M.boundsOf(picked);
      rect = { x: M.snap(b.x - 40), y: M.snap(b.y - 40), width: M.snap(b.width + 80), height: M.snap(b.height + 80) };
    } else {
      const { width, height } = M.DEFAULT_SIZE.group;
      const c = viewCenterWorld();
      rect = { x: M.snap(c.x - width / 2), y: M.snap(c.y - height / 2), width, height };
    }
    const group = M.makeNode('group', rect);
    addNodes([group], { front: false });
    editGroupLabel(group.id);
  }

  function deleteSelection() {
    if (!selected.size || broken) return;
    M.removeItems(doc, [...selected]);
    selected = new Set();
    renderAll();
    commit();
  }

  function copySelection() {
    const nodes = selectedNodes();
    if (!nodes.length) return null;
    const ids = new Set(nodes.map((n) => n.id));
    const edges = doc.edges.filter((e) => ids.has(e.fromNode) && ids.has(e.toNode));
    clipboard = JSON.parse(JSON.stringify({ nodes, edges }));
    return clipboard;
  }

  function pasteData(data, at = null) {
    if (!data?.nodes?.length || broken) return;
    const source = { nodes: data.nodes, edges: data.edges ?? [] };
    const b = M.boundsOf(source.nodes);
    let dx = 30; let dy = 30;
    if (at) { dx = M.snap(at.x - (b.x + b.width / 2)); dy = M.snap(at.y - (b.y + b.height / 2)); }
    const { nodes, edges } = M.cloneSubset(source, source.nodes.map((n) => n.id), dx, dy);
    const normalized = M.normalizeCanvas({ nodes, edges });
    doc.edges.push(...normalized.edges);
    addNodes(normalized.nodes);
  }

  function pasteText(text, at) {
    const value = String(text ?? '');
    if (!value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      if (parsed && Array.isArray(parsed.nodes)) { pasteData(M.normalizeCanvas(parsed), at); return; }
    } catch { /* plain text */ }
    if (/^https?:\/\/\S+$/i.test(value.trim())) { addLink(value.trim(), at); return; }
    const p = at ?? viewCenterWorld();
    const node = M.makeNode('text', { text: value, x: M.snap(p.x - 130), y: M.snap(p.y - 40) });
    addNodes([node]);
  }

  function duplicateSelection() {
    const nodes = selectedNodes();
    if (!nodes.length || broken) return;
    const { nodes: copies, edges } = M.cloneSubset(doc, nodes.map((n) => n.id), 30, 30);
    doc.edges.push(...edges);
    addNodes(copies);
  }

  function nudge(dx, dy) {
    const nodes = movingNodes();
    if (!nodes.length) return;
    for (const n of nodes) { n.x += dx; n.y += dy; updateNodeElement(n); }
    renderEdges();
    updateSelectionClasses();
    positionMenu();
    commit();
  }

  // ───────── pointer input

  function targetKey(e) {
    const node = e.target.closest?.('.cv-node');
    const edge = e.target.closest?.('[data-edge]');
    return edge ? `e:${edge.dataset.edge}` : node ? `n:${node.dataset.id}` : 'bg';
  }

  /** Double presses are found by hand: re-rendering and pointer capture swallow dblclick. */
  function isDouble(e) {
    const now = performance.now();
    const key = targetKey(e);
    const prev = lastDown;
    lastDown = { time: now, x: e.clientX, y: e.clientY, key };
    if (prev && prev.key === key && now - prev.time < 450 && Math.hypot(prev.x - e.clientX, prev.y - e.clientY) < 6) { lastDown = null; return true; }
    return false;
  }

  board.addEventListener('pointerdown', (e) => {
    if (e.target.closest('textarea, input, select, video, audio, button, a, .cv-open-link')) return;
    if (paletteOpen) { palette.hidden = true; paletteOpen = false; }
    if (inlineEditor) closeInlineEditor(true);
    focusHost();
    if (e.button === 1 || (e.button === 0 && spaceHeld)) { e.preventDefault(); startPan(e, false); return; }
    if (e.button !== 0) return;
    const double = isDouble(e);
    const p = toWorld(e);

    const connect = e.target.closest('.cv-connect');
    if (connect && !broken) { e.preventDefault(); startConnect(e, connect.closest('.cv-node').dataset.id, connect.dataset.side); return; }
    const resize = e.target.closest('.cv-resize');
    if (resize && !broken) { e.preventDefault(); startResize(e, resize.closest('.cv-node').dataset.id, resize.dataset.dir); return; }

    const edgeEl = e.target.closest('[data-edge]');
    if (edgeEl) {
      e.preventDefault();
      if (editingId) stopEditing();
      const id = edgeEl.dataset.edge;
      if (double) { editEdgeLabel(id); return; }
      if (e.shiftKey || e.ctrlKey || e.metaKey) { if (selected.has(id)) selected.delete(id); else selected.add(id); updateSelectionClasses(); renderMenu(); } else selectOnly(id);
      return;
    }

    const nodeEl = e.target.closest('.cv-node');
    if (nodeEl) {
      const id = nodeEl.dataset.id;
      const node = byId(id);
      if (!node) return;
      if (editingId === id) return;
      if (editingId) stopEditing();
      // A second press acts as a double-click only if it is released without dragging.
      if (double && !(e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault(); startMove(e, node, () => onNodeDouble(node, e, p)); return; }
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (selected.has(id)) { selected.delete(id); updateSelectionClasses(); renderMenu(); return; }
        selected.add(id); updateSelectionClasses(); renderMenu();
      } else if (!selected.has(id)) selectOnly(id);
      const scroller = e.target.closest('.cv-scroll');
      if (scroller && e.target === scroller && (e.offsetX > scroller.clientWidth || e.offsetY > scroller.clientHeight)) return; // its scroll bar
      e.preventDefault();
      startMove(e, node);
      return;
    }

    e.preventDefault();
    if (editingId) stopEditing();
    if (e.shiftKey || e.ctrlKey || e.metaKey) startSelectionBox(e);
    else startPan(e, true, double && !broken ? () => createTextAt(p, true) : null);
  });

  function onNodeDouble(node, e, p) {
    if (node.type === 'text') startEditing(node.id);
    else if (node.type === 'file') api.openFile?.(node.file, { newTab: e.ctrlKey || e.metaKey });
    else if (node.type === 'link') { if (node.url) api.openExternal?.(node.url); }
    else if (node.type === 'group') {
      if (e.target.closest('.cv-group-label')) editGroupLabel(node.id);
      else if (!broken) createTextAt(p, true);
    }
  }

  function startPan(e, clearOnClick, onTap = null) {
    const sx = view.x; const sy = view.y;
    board.classList.add('cv-panning');
    pointerDrag(e, {
      threshold: 3,
      move: (dx, dy) => { view.x = sx + dx; view.y = sy + dy; applyView(); },
      end: (ev, moved) => {
        board.classList.remove('cv-panning');
        if (moved) return;
        if (clearOnClick) clearSelection();
        onTap?.();
      },
    });
  }

  function startSelectionBox(e) {
    const start = toWorld(e);
    const base = new Set(selected);
    pointerDrag(e, {
      move: (dx, dy, ev) => {
        const cur = toWorld(ev);
        const rect = M.rectFromPoints(start, cur);
        const s = toScreen(rect);
        Object.assign(selBox.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${rect.width * view.scale}px`, height: `${rect.height * view.scale}px` });
        selBox.hidden = false;
        const hit = M.nodesInRect(doc.nodes, rect).map((n) => n.id);
        const inside = new Set(hit);
        const edges = doc.edges.filter((ed) => inside.has(ed.fromNode) && inside.has(ed.toNode)).map((ed) => ed.id);
        selected = new Set([...base, ...hit, ...edges]);
        updateSelectionClasses();
        menu.hidden = true;
      },
      end: () => { selBox.hidden = true; renderMenu(); },
    });
  }

  function startMove(e, primary, onTap = null) {
    const nodes = movingNodes();
    const starts = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const p0 = { x: primary.x, y: primary.y };
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    pointerDrag(e, {
      move: (dx, dy, ev) => {
        if (broken) return;
        if (!dragging) { dragging = true; menu.hidden = true; host.classList.add('cv-dragging'); }
        let wx = dx / view.scale; let wy = dy / view.scale;
        if (!ev.altKey) { wx = M.snap(p0.x + wx) - p0.x; wy = M.snap(p0.y + wy) - p0.y; }
        for (const n of nodes) { const s = starts.get(n.id); n.x = Math.round(s.x + wx); n.y = Math.round(s.y + wy); updateNodeElement(n); }
        renderEdges();
        updateSelectionClasses();
      },
      end: (ev, moved) => {
        if (dragging) { dragging = false; host.classList.remove('cv-dragging'); }
        if (moved && !broken) { if (primary.type === 'group' || nodes.some((n) => n.type === 'group')) syncNodes(); commit(); renderMenu(); }
        else if (!moved && onTap) { if (selected.size > 1) selectOnly(primary.id); onTap(); }
        else if (!moved && !additive && selected.size > 1) selectOnly(primary.id);
        else renderMenu();
      },
    });
  }

  function startResize(e, id, dir) {
    const node = byId(id);
    if (!node) return;
    if (!selected.has(id)) selectOnly(id);
    const start = { x: node.x, y: node.y, width: node.width, height: node.height };
    pointerDrag(e, {
      threshold: 1,
      move: (dx, dy, ev) => {
        if (!dragging) { dragging = true; menu.hidden = true; host.classList.add('cv-dragging'); }
        Object.assign(node, M.resizeRect(start, dir, dx / view.scale, dy / view.scale, { grid: ev.altKey ? 0 : M.GRID }));
        updateNodeElement(node);
        renderEdges();
        updateSelectionClasses();
      },
      end: (ev, moved) => {
        dragging = false;
        host.classList.remove('cv-dragging');
        if (moved) { if (node.type === 'group') syncNodes(); commit(); }
        renderMenu();
      },
    });
  }

  function startConnect(e, id, side) {
    const from = byId(id);
    if (!from) return;
    let target = null;
    const highlight = (node) => {
      if (target?.id === node?.id) return;
      if (target) elements.get(target.id)?.classList.remove('cv-drop-target');
      target = node;
      if (target) elements.get(target.id)?.classList.add('cv-drop-target');
    };
    host.classList.add('cv-connecting');
    menu.hidden = true;
    pointerDrag(e, {
      move: (dx, dy, ev) => {
        const p = toWorld(ev);
        const hit = M.hitNode(doc.nodes, p, id);
        highlight(hit);
        const c = hit ? M.edgeCurve(from, side, hit, M.nearestSide(hit, p)) : M.edgeCurve(from, side, p, null);
        liveEdge.setAttribute('d', M.curvePath(c));
      },
      end: (ev, moved) => {
        host.classList.remove('cv-connecting');
        liveEdge.setAttribute('d', '');
        const hit = target;
        highlight(null);
        if (!moved) { renderMenu(); return; }
        const p = toWorld(ev);
        if (hit) {
          const edge = M.makeEdge(id, side, hit.id, M.nearestSide(hit, p));
          doc.edges.push(edge);
          selected = new Set([edge.id]);
          renderAll();
          commit();
          return;
        }
        // Dropped on empty space: a new text card, connected, ready for typing.
        const { width, height } = M.DEFAULT_SIZE.text;
        const c = M.center(from);
        const ddx = (p.x - c.x) / Math.max(1, from.width);
        const ddy = (p.y - c.y) / Math.max(1, from.height);
        const toSide = Math.abs(ddx) >= Math.abs(ddy) ? (ddx >= 0 ? 'left' : 'right') : (ddy >= 0 ? 'top' : 'bottom');
        const x = toSide === 'left' ? p.x : toSide === 'right' ? p.x - width : p.x - width / 2;
        const y = toSide === 'top' ? p.y : toSide === 'bottom' ? p.y - height : p.y - height / 2;
        const node = M.makeNode('text', { x: M.snap(x), y: M.snap(y) });
        doc.edges.push(M.makeEdge(id, side, node.id, toSide));
        addNodes([node], { edit: true });
      },
    });
  }

  board.addEventListener('pointermove', (e) => { lastPointer = { clientX: e.clientX, clientY: e.clientY }; });
  board.addEventListener('pointerleave', () => { lastPointer = null; });

  board.addEventListener('wheel', (e) => {
    const r = boardRect();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(-delta * 0.0025), e.clientX - r.left, e.clientY - r.top);
      return;
    }
    const scroller = e.target.closest('.cv-scroll');
    if (scroller && canScroll(scroller, e)) return;
    e.preventDefault();
    let dx = e.deltaX; let dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    view.x -= dx; view.y -= dy;
    applyView();
  }, { passive: false });

  function canScroll(el, e) {
    if (e.deltaY < 0 && el.scrollTop > 0) return true;
    if (e.deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    if (e.deltaX < 0 && el.scrollLeft > 0) return true;
    if (e.deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
    return false;
  }

  // Text, links and vault paths dropped from elsewhere become cards.
  board.addEventListener('dragover', (e) => { if (!broken && e.dataTransfer?.types?.some((ty) => ty === 'text/plain' || ty === 'text/uri-list')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  board.addEventListener('drop', (e) => {
    const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
    if (!text || broken) return;
    e.preventDefault();
    const p = toWorld(e);
    const value = text.trim().split(/\r?\n/)[0];
    if (/^https?:\/\//i.test(value)) addLink(value, p);
    else if (!/\s/.test(value.replace(/ /g, '')) && /\.[A-Za-z0-9]{1,8}$/.test(value) && !/^[a-z]+:/i.test(value)) addFile(value, p);
    else pasteText(text, p);
  });

  // ───────── keyboard

  host.addEventListener('keydown', (e) => {
    const field = e.target.closest?.('textarea, input');
    if (field) {
      if (e.key === 'Escape' && field.classList.contains('cv-editor')) { e.preventDefault(); e.stopPropagation(); stopEditing(); focusHost(); }
      return;
    }
    if (e.target.closest?.('.cv-toolbar, .cv-menu, .cv-palette') && (e.key === 'Enter' || e.key === ' ')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let handled = true;
    if (key === ' ' && !mod) { if (!spaceHeld) { spaceHeld = true; board.classList.add('cv-space'); } }
    else if (mod && key === 'z' && !e.shiftKey) undo();
    else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) redo();
    else if (mod && key === 'a') selectAll();
    // Copy / cut: no preventDefault, so the copy / cut event still puts the JSON on the system clipboard.
    else if (mod && key === 'c') { if (copySelection()) copiedAt = performance.now(); handled = false; }
    else if (mod && key === 'x') { if (copySelection()) { copiedAt = performance.now(); deleteSelection(); } handled = false; }
    else if (mod && key === 'v') { pasteRequested(); handled = false; }
    else if (mod && key === 'd') duplicateSelection();
    else if (mod && (key === '=' || key === '+')) zoomBy(ZOOM_STEP);
    else if (mod && key === '-') zoomBy(1 / ZOOM_STEP);
    else if (mod && key === '0') setView({ ...view, ...zoomResetView() });
    else if (key === 'Delete' || key === 'Backspace') deleteSelection();
    else if (key === 'Escape') { if (paletteOpen) { palette.hidden = true; paletteOpen = false; } else if (!inputBar.hidden) closeInputBar(); else clearSelection(); }
    else if (key === 'Enter' && selected.size === 1) { const n = byId([...selected][0]); if (n?.type === 'text') startEditing(n.id); else if (n?.type === 'group') editGroupLabel(n.id); else if (edgeById([...selected][0])) editEdgeLabel([...selected][0]); }
    else if (e.shiftKey && e.code === 'Digit1') zoomToFit();
    else if (e.shiftKey && e.code === 'Digit2') zoomToSelection();
    else if (key.startsWith('Arrow') && selected.size && !broken) {
      const step = e.shiftKey ? 1 : M.GRID;
      nudge(key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0);
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  });

  host.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceHeld = false; board.classList.remove('cv-space'); } });
  host.addEventListener('focusout', () => { requestAnimationFrame(() => { if (!host.contains(document.activeElement)) { spaceHeld = false; board.classList.remove('cv-space'); } }); });

  function zoomResetView() {
    const r = boardRect();
    const c = viewCenterWorld();
    return { scale: 1, x: r.width / 2 - c.x, y: r.height / 2 - c.y };
  }

  // Clipboard: the copy / paste events carry the canvas as JSON (so it also pastes into Obsidian);
  // when the WebView sends no paste event for a non-editable element, the internal copy is used.
  let pasteTimer = 0;
  let copiedAt = -1e9;
  const owns = () => host.contains(document.activeElement) && !document.activeElement.closest?.('textarea, input');
  const pasteAt = () => (lastPointer ? toWorld(lastPointer) : null);
  function pasteRequested() {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => { pasteTimer = 0; if (clipboard) pasteData(clipboard, pasteAt()); }, 80);
  }
  const onCopy = (e) => {
    if (!owns() || destroyed) return;
    const data = (performance.now() - copiedAt < 1000 && clipboard) || copySelection();
    if (!data) return;
    e.clipboardData?.setData('text/plain', JSON.stringify(data));
    e.preventDefault();
  };
  const onCut = (e) => { if (!owns()) return; onCopy(e); };
  const onPaste = (e) => {
    if (!owns() || destroyed) return;
    clearTimeout(pasteTimer);
    pasteTimer = 0;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text) pasteText(text, pasteAt()); else if (clipboard) pasteData(clipboard, pasteAt());
  };
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCut);
  document.addEventListener('paste', onPaste);

  // ───────── toolbar and link bar

  toolbar.addEventListener('pointerdown', (e) => e.stopPropagation());
  toolbar.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-action]');
    if (!button || button.disabled) return;
    if (editingId) stopEditing();
    const action = button.dataset.action;
    if (action === 'addText') { const c = viewCenterWorld(); const { width, height } = M.DEFAULT_SIZE.text; const s = freeSpot(M.snap(c.x - width / 2), M.snap(c.y - height / 2), width, height); createTextAt({ x: s.x + width / 2, y: s.y + height / 2 }, true); return; }
    if (action === 'addNote' || action === 'addMedia') {
      let path = null;
      try { path = await api.pickFile?.({ kind: action === 'addNote' ? 'note' : 'media' }); } catch { path = null; }
      if (path) await addFile(path);
    } else if (action === 'addLink') openInputBar();
    else if (action === 'addGroup') addGroup();
    else if (action === 'zoomIn') zoomBy(ZOOM_STEP);
    else if (action === 'zoomOut') zoomBy(1 / ZOOM_STEP);
    else if (action === 'zoomFit') zoomToFit();
    else if (action === 'zoomReset') setView({ ...view, ...zoomResetView() });
    else if (action === 'undo') undo();
    else if (action === 'redo') redo();
    if (action !== 'addLink' && !editingId && !inlineEditor) focusHost();
  });
  zoomLabel.addEventListener('click', () => setView({ ...view, ...zoomResetView() }));

  function openInputBar() {
    inputBar.hidden = false;
    inputField.value = '';
    inputField.focus();
  }
  function closeInputBar() { inputBar.hidden = true; focusHost(); }
  inputBar.addEventListener('pointerdown', (e) => e.stopPropagation());
  inputBar.addEventListener('submit', (e) => { e.preventDefault(); const v = inputField.value; closeInputBar(); addLink(v); });
  inputBar.querySelector('.cv-input-cancel').addEventListener('click', closeInputBar);
  inputField.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeInputBar(); } });

  // ───────── size

  function resize() {
    if (pendingFit) zoomToFit();
    applyView();
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  observer?.observe(host);

  function destroy() {
    if (destroyed) return;
    if (editingId) { const node = byId(editingId); editingId = null; if (node) history.push(doc) && markDirty(); }
    destroyed = true;
    clearTimeout(saveTimer);
    clearTimeout(pasteTimer);
    observer?.disconnect();
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCut);
    document.removeEventListener('paste', onPaste);
    if (dirty && !broken) {
      const text = M.serializeCanvas(doc);
      Promise.resolve().then(() => api.write?.(text)).then(() => api.onDirty?.(false)).catch((error) => notify('error', t('canvas.saveError', { error: error?.message ?? String(error) })));
    }
    host.innerHTML = '';
    host.classList.remove('cv-host', 'cv-readonly', 'cv-single', 'cv-dragging', 'cv-connecting');
    elements.clear();
  }

  applyView();
  updateUndoButtons();
  reload();

  return {
    reload,
    resize,
    destroy,
    get dirty() { return dirty; },
    zoomToFit,
    undo,
    redo,
    /** Saves now (e.g. before the app closes). */
    flush: () => save(),
    /** The current document (read-only use). */
    get document() { return doc; },
  };
}

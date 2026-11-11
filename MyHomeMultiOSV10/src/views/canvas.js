// The editor canvas: the current page drawn as the real site (render.js) inside a frame as wide
// as the chosen device, scaled by the zoom. Over the frame a layer shows the block under the
// pointer, the selected block with its name and tool buttons, and where a dragged block lands.
//
// Click selects a block; a click on its text (or a double click) edits the text in place;
// a double click on a picture chooses another; a double click on formatted text opens its field
// in the Content tab. Blocks are moved by dragging their name tab, or with the ↑ ↓ buttons.
// Dragging is done with pointer events (the desktop webview takes HTML drag and drop for files).
import { EDITOR_CSS, pageBody, siteStyles } from '../domain/render.js';
import { customPageView, pageHasSource } from '../domain/sourcefiles.js';
import { blockDef, blockLabel, fieldLabel } from '../domain/blocks.js';
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';

export const DEVICES = { desktop: 1280, tablet: 820, mobile: 390 };

export class SiteCanvas {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.hoverId = null;
    this.editing = null;
    this.destroyed = false;
    host.innerHTML = `<div class="canvas-wrap"><div class="source-banner" hidden></div><div class="canvas-scroll" tabindex="-1">
      <div class="canvas-stage"><div class="device-frame">
        <iframe class="site-frame" title="page" scrolling="no"></iframe>
        <div class="canvas-overlay" aria-hidden="false">
          <div class="hover-box" hidden><span class="hover-label"></span></div>
          <div class="sel-box" hidden></div>
          <div class="sel-bar" hidden></div>
          <div class="drop-line" hidden><span></span></div>
        </div>
      </div></div>
    </div></div>`;
    this.scroll = host.querySelector('.canvas-scroll');
    this.stage = host.querySelector('.canvas-stage');
    this.frameBox = host.querySelector('.device-frame');
    this.frame = host.querySelector('.site-frame');
    this.overlay = host.querySelector('.canvas-overlay');
    this.initFrame();
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.scroll);
    this.scroll.addEventListener('scroll', () => app.rememberScroll?.(this.scroll.scrollTop), { passive: true });
    this.scroll.addEventListener('pointerdown', (event) => { if (event.target === this.scroll || event.target === this.stage) app.select(null); });
  }

  get doc() { return this.frame.contentDocument; }
  get tab() { return this.app.doc(); }
  get zoom() { return (this.tab?.view.zoom ?? 100) / 100; }
  get width() { return DEVICES[this.tab?.view.device] ?? DEVICES.desktop; }

  initFrame() {
    const doc = this.doc;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style id="hm-site"></style><style id="hm-editor"></style></head><body class="hm-editor"><div id="hm-root"></div></body></html>');
    doc.close();
    doc.getElementById('hm-editor').textContent = EDITOR_CSS;
    this.bindFrame(doc);
    this.bodyObserver = new ResizeObserver(() => this.fitHeight());
    this.bodyObserver.observe(doc.body);
  }

  /** Draws the page again (after every change). */
  render() {
    if (this.destroyed) return;
    const tab = this.tab;
    const doc = this.doc;
    if (!tab || !doc?.body) return;
    const site = tab.site;
    const page = tab.page;
    this.finishEdit(false);
    doc.documentElement.lang = site.meta.language;
    const custom = pageHasSource(page);
    const banner = this.host.querySelector('.source-banner');
    if (banner) {
      banner.hidden = !custom;
      if (custom) banner.innerHTML = `<span>${escapeHtml(this.app.t('source.banner'))}</span><button type="button" class="small-button" data-command="revertPageSource" title="${escapeHtml(this.app.t('source.revertPage'))}">${icon('refresh')}<span>${escapeHtml(this.app.t('source.revertPage'))}</span></button><button type="button" class="small-button" data-command="sourceMode" title="${escapeHtml(this.app.t('action.sourceMode'))}">${icon('htmlFile')}<span>${escapeHtml(this.app.t('action.sourceMode'))}</span></button>`;
    }
    const preview = Boolean(this.app.state.preview);
    if (custom) {
      const view = customPageView(page.source, site);
      doc.getElementById('hm-site').textContent = view.css;
      doc.getElementById('hm-editor').textContent = '';
      doc.body.classList.remove('hm-editor');
      this.overlay.hidden = true;
      doc.getElementById('hm-root').innerHTML = view.body;
    } else {
      doc.getElementById('hm-site').textContent = siteStyles(site);
      doc.getElementById('hm-editor').textContent = EDITOR_CSS;
      doc.body.classList.toggle('hm-editor', !preview);
      this.overlay.hidden = preview;
      doc.getElementById('hm-root').innerHTML = pageBody(site, page, { editor: !preview, L: site.meta.language, emptyText: [this.app.t('canvas.emptyTitle'), this.app.t('canvas.emptyText')] });
    }
    this.layout();
    this.updateOverlay();
    this.applyMarks();
    for (const img of doc.images) if (!img.complete) img.addEventListener('load', () => { this.fitHeight(); this.updateOverlay(); }, { once: true });
  }

  // ───────────────────────── problems: unknown words underlined, the shown problem marked

  /** The element that shows a block's field (its text), or null. */
  fieldElement(blockId, path) {
    const block = this.blockElement(blockId);
    if (!block || !path) return null;
    const p = CSS.escape(path);
    return block.querySelector(`[data-edit="${p}"], [data-edit-field="${p}"]`);
  }

  /** The range of the `occurrence`-th (0 = first) `word` in an element's text, or null. */
  wordRange(el, word, occurrence = 0) {
    if (!el || !word) return null;
    const doc = this.doc;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = '';
    while (walker.nextNode()) { nodes.push([walker.currentNode, text.length]); text += walker.currentNode.data; }
    let at = -1;
    for (let i = 0; i <= occurrence; i++) { at = text.indexOf(word, at + 1); if (at < 0) return null; }
    // A start lies in the node that holds its character; an end in the node that holds the character before it.
    const locate = (pos, end) => {
      for (const [node, offset] of nodes) {
        const inside = end ? pos > offset && pos <= offset + node.data.length : pos >= offset && pos < offset + node.data.length;
        if (inside) return [node, pos - offset];
      }
      return null;
    };
    const from = locate(at, false);
    const to = locate(at + word.length, true);
    if (!from || !to) return null;
    const range = doc.createRange();
    range.setStart(from[0], from[1]);
    range.setEnd(to[0], to[1]);
    return range;
  }

  /** Unknown words of the page: [{ blockId, path, word, occurrence }] get a wavy underline. */
  markSpelling(list) {
    this.spelling = list ?? [];
    this.applyMarks();
  }

  applyMarks() {
    const win = this.doc?.defaultView;
    if (!win?.CSS?.highlights || typeof win.Highlight !== 'function') return;
    const preview = Boolean(this.app.state.preview);
    const ranges = preview ? [] : (this.spelling ?? []).map((m) => this.wordRange(this.fieldElement(m.blockId, m.path), m.word, m.occurrence)).filter(Boolean);
    win.CSS.highlights.set('hm-spell', new win.Highlight(...ranges));
    this.spellRanges = ranges.length;
    const p = this.problemMark;
    const mark = !preview && p ? this.wordRange(this.fieldElement(p.blockId, p.path), p.word, p.occurrence) : null;
    if (mark) win.CSS.highlights.set('hm-problem', new win.Highlight(mark)); else win.CSS.highlights.delete('hm-problem');
  }

  /** Shows a problem's place: scrolled into sight, the field flashing, the word marked. True when found. */
  showProblem({ blockId, path, word = '', occurrence = 0 }) {
    const el = this.fieldElement(blockId, path) ?? this.blockElement(blockId);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const z = this.zoom;
    const top = this.stage.offsetTop + r.top * z;
    if (top < this.scroll.scrollTop + 20 || top + Math.min(r.height * z, 160) > this.scroll.scrollTop + this.scroll.clientHeight) this.scroll.scrollTop = Math.max(0, top - this.scroll.clientHeight / 3);
    el.classList.remove('hm-problem-flash');
    void el.offsetWidth;
    el.classList.add('hm-problem-flash');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove('hm-problem-flash'), 1700);
    this.problemMark = word ? { blockId, path, word, occurrence } : null;
    this.applyMarks();
    this.shownProblem = { blockId, path, word, found: Boolean(word && this.wordRange(this.fieldElement(blockId, path), word, occurrence)) };
    return true;
  }

  update() { this.render(); }

  /** Frame width (device), scale (zoom) and the stage size around them. */
  layout() {
    const z = this.zoom;
    const w = this.width;
    this.frameBox.style.width = `${w}px`;
    this.frameBox.style.transform = `scale(${z})`;
    this.frame.style.width = `${w}px`;
    this.fitHeight();
    this.host.querySelector('.canvas-wrap').dataset.device = this.tab?.view.device ?? 'desktop';
    this.overlay.style.setProperty('--inv', String(1 / z));
  }

  fitHeight() {
    const body = this.doc?.body;
    if (!body) return;
    const height = Math.max(480, Math.ceil(body.getBoundingClientRect().height));
    if (this.frame.style.height !== `${height}px`) this.frame.style.height = `${height}px`;
    const z = this.zoom;
    this.stage.style.width = `${Math.round(this.width * z)}px`;
    this.stage.style.height = `${Math.round(height * z)}px`;
    this.updateOverlay();
  }

  /** The zoom at which the device width fits the canvas (at most 100 %). */
  fitZoom() {
    const available = this.scroll.clientWidth - 48;
    return Math.max(10, Math.min(100, Math.floor((available / this.width) * 100)));
  }

  destroy() {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.bodyObserver?.disconnect();
    this.host.innerHTML = '';
  }

  // ───────────────────────── geometry

  blockElement(id) { return id ? this.doc?.querySelector(`[data-block-id="${CSS.escape(id)}"]`) : null; }

  /** A block's box in frame pixels (unscaled). */
  boxOf(id) {
    const el = this.blockElement(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** Scrolls the canvas so the block can be seen. */
  reveal(id) {
    const box = this.boxOf(id);
    if (!box) return;
    const z = this.zoom;
    const top = this.stage.offsetTop + box.y * z;
    if (top < this.scroll.scrollTop + 20 || top + Math.min(box.h * z, 200) > this.scroll.scrollTop + this.scroll.clientHeight) this.scroll.scrollTop = Math.max(0, top - 60);
  }

  /** A point of the main window → frame pixels, or null outside the frame. */
  toFrame(clientX, clientY) {
    const r = this.frame.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top - 40 || clientY > r.bottom + 40) return null;
    const z = this.zoom;
    return { x: (clientX - r.left) / z, y: (clientY - r.top) / z };
  }

  /** Where a block dropped at frame y goes: { index, y } (y of the line in frame pixels). */
  dropIndexAt(y, exceptId = null) {
    const els = [...(this.doc?.querySelectorAll('main > [data-block-id]') ?? [])].filter((el) => el.dataset.blockId !== exceptId);
    const main = this.doc?.querySelector('main');
    if (!els.length) { const r = main?.getBoundingClientRect(); return { index: 0, y: r ? r.top + 8 : 80 }; }
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return { index: i, y: r.top };
    }
    const last = els.at(-1).getBoundingClientRect();
    return { index: els.length, y: last.bottom };
  }

  showDrop(target, label = '') {
    const line = this.overlay.querySelector('.drop-line');
    if (!target) { line.hidden = true; return; }
    line.hidden = false;
    line.style.top = `${target.y - 2}px`;
    line.querySelector('span').textContent = label;
  }

  // ───────────────────────── overlay

  updateOverlay() {
    if (this.destroyed) return;
    const selected = this.app.selectedId();
    const hover = this.overlay.querySelector('.hover-box');
    const box = this.overlay.querySelector('.sel-box');
    const bar = this.overlay.querySelector('.sel-bar');
    const L = this.app.language();
    const hb = this.hoverId && this.hoverId !== selected ? this.boxOf(this.hoverId) : null;
    hover.hidden = !hb;
    if (hb) {
      Object.assign(hover.style, { left: `${hb.x}px`, top: `${hb.y}px`, width: `${hb.w}px`, height: `${hb.h}px` });
      const el = this.blockElement(this.hoverId);
      hover.querySelector('.hover-label').textContent = blockLabel(el?.dataset.blockType, L);
    }
    const sb = selected ? this.boxOf(selected) : null;
    box.hidden = !sb;
    bar.hidden = !sb;
    if (!sb) return;
    Object.assign(box.style, { left: `${sb.x}px`, top: `${sb.y}px`, width: `${sb.w}px`, height: `${sb.h}px` });
    const type = this.blockElement(selected)?.dataset.blockType;
    const def = blockDef(type);
    const global = Boolean(def?.global);
    const t = this.app.t;
    const button = (action, glyph, tip, extra = '') => `<button class="sel-tool ${extra}" data-block-action="${action}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${icon(glyph)}</button>`;
    bar.innerHTML = `<button class="sel-name" data-block-drag="${escapeHtml(selected)}" title="${escapeHtml(global ? blockLabel(type, L) : t('canvas.dragTip'))}">${icon(def?.icon ?? 'blkText')}<span>${escapeHtml(blockLabel(type, L))}</span>${global ? '' : icon('moveHandle', 'icon tiny')}</button>
      <span class="sel-tools">${global ? button('content', 'edit', t('canvas.editContent')) + button('style', 'formatShape', t('canvas.editStyle')) + button('hide', 'eye', t('canvas.toggleHide')) : [
        button('up', 'arrowUp', t('action.moveUp')), button('down', 'arrowDown', t('action.moveDown')), button('duplicate', 'duplicate', t('action.duplicate')),
        button('style', 'formatShape', t('canvas.editStyle')), button('hide', 'eye', t('canvas.toggleHide')), button('delete', 'trash', t('action.delete'), 'danger'),
      ].join('')}</span>${global ? '' : `<button class="sel-add" data-block-action="add-after" title="${escapeHtml(t('canvas.addAfter'))}" aria-label="${escapeHtml(t('canvas.addAfter'))}">${icon('plus')}</button>`}`;
    // The bar keeps its size whatever the zoom: it sits at the block's top edge, scaled back.
    const top = Math.max(0, sb.y - 34 / this.zoom);
    Object.assign(bar.style, { left: `${sb.x}px`, top: `${top}px`, width: `${sb.w}px` });
    const add = bar.querySelector('.sel-add');
    if (add) add.style.top = `${(sb.y + sb.h - top) - 14 / this.zoom}px`;
  }

  // ───────────────────────── inline text editing

  startEdit(el) {
    if (!el || this.editing?.el === el) return;
    this.finishEdit(true);
    const block = el.closest('[data-block-id]');
    if (!block) return;
    const path = el.dataset.edit;
    const field = this.app.fieldOf(block.dataset.blockId, path);
    this.editing = { el, blockId: block.dataset.blockId, path, original: el.innerText, multiline: field?.kind === 'textarea' };
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.focus();
    const range = this.doc.createRange();
    range.selectNodeContents(el);
    const selection = this.doc.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    this.app.editingChanged?.(field ? fieldLabel(field, this.app.language()) : '');
  }

  /** Ends inline editing; `commit` keeps the typed text. */
  finishEdit(commit = true) {
    const editing = this.editing;
    if (!editing) return;
    this.editing = null;
    const { el, blockId, path, original } = editing;
    const text = el.innerText.replace(/ /g, ' ').replace(/\n$/, '');
    el.removeAttribute('contenteditable');
    this.app.editingChanged?.(null);
    if (commit && text !== original) this.app.commitText(blockId, path, text);
    else if (!commit) el.innerText = original;
  }

  // ───────────────────────── events inside the frame

  bindFrame(doc) {
    const app = this.app;
    doc.addEventListener('click', (event) => {
      if (app.state.preview) { this.previewClick(event); return; }
      // Links and buttons of the site do nothing on the canvas (Ctrl+click on a menu link opens that page).
      const link = event.target.closest('a, button, summary, label');
      if (link && !event.target.closest('[contenteditable]')) event.preventDefault();
      if (event.target.closest('[contenteditable]')) return;
      const pageLink = event.target.closest('[data-page-link]');
      if (pageLink && (event.ctrlKey || event.metaKey)) { app.openPage(pageLink.dataset.pageLink); return; }
      const block = event.target.closest('[data-block-id]');
      if (!block) { if (event.target.closest('[data-empty-page]')) app.run('addBlock'); else app.select(null); return; }
      const id = block.dataset.blockId;
      const edit = event.target.closest('[data-edit]');
      const wasSelected = app.selectedId() === id;
      if (!wasSelected) app.select(id, { from: 'canvas' });
      // A second click on text of the selected block (or a double click) edits it.
      if (edit && (wasSelected || event.detail >= 2)) this.startEdit(edit);
      else if (event.detail >= 2) {
        const image = event.target.closest('[data-edit-image]');
        const field = event.target.closest('[data-edit-field]');
        if (image) app.chooseImageFor(id, image.dataset.editImage);
        else if (field) app.focusField(id, field.dataset.editField);
        else app.focusField(id, null);
      }
    });
    doc.addEventListener('submit', (event) => event.preventDefault());
    doc.addEventListener('mousemove', (event) => {
      const id = event.target.closest?.('[data-block-id]')?.dataset.blockId ?? null;
      if (id !== this.hoverId) { this.hoverId = id; this.updateOverlay(); }
    });
    doc.addEventListener('mouseleave', () => { this.hoverId = null; this.updateOverlay(); });
    doc.addEventListener('keydown', (event) => {
      if (this.editing) {
        if (event.key === 'Escape') { event.preventDefault(); this.finishEdit(false); return; }
        if (event.key === 'Enter' && !(this.editing.multiline && event.shiftKey)) { event.preventDefault(); this.finishEdit(true); return; }
        if ((event.ctrlKey || event.metaKey) && ['z', 'y', 'a', 'c', 'x', 'v'].includes(event.key.toLowerCase())) return;
        if (event.key === 'Tab') { event.preventDefault(); this.finishEdit(true); }
        return;
      }
      app.onKeyDown(event);
    });
    doc.addEventListener('focusout', (event) => { if (this.editing && event.target === this.editing.el) this.finishEdit(true); });
    doc.addEventListener('paste', (event) => {
      if (!this.editing) return;
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain') ?? '';
      doc.execCommand('insertText', false, this.editing.multiline ? text : text.replace(/\s*\n\s*/g, ' '));
    });
    doc.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (this.editing) return;
      const block = event.target.closest('[data-block-id]');
      const point = this.toClient(event.clientX, event.clientY);
      if (block) { if (app.selectedId() !== block.dataset.blockId) app.select(block.dataset.blockId, { from: 'canvas' }); app.contextMenu(point, 'block', { id: block.dataset.blockId }); }
      else app.contextMenu(point, 'canvas');
    });
    doc.addEventListener('wheel', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      app.zoomBy(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    doc.addEventListener('dragstart', (event) => event.preventDefault());
  }

  /** Preview: menu links open their page, # links scroll to their part, other links do nothing here. */
  previewClick(event) {
    const link = event.target.closest('a[href]');
    if (event.target.closest('button[type="submit"]')) { event.preventDefault(); this.app.notify('info', this.app.t('notice.previewForm')); return; }
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href') ?? '';
    const page = this.app.site().pages.find((p) => href === (p.slug === 'index' ? 'index.html' : `${p.slug}.html`));
    if (page) { this.app.openPage(page.id); return; }
    if (href.startsWith('#') && href.length > 1) { const target = this.doc.getElementById(href.slice(1)); if (target) this.scroll.scrollTop = this.stage.offsetTop + target.getBoundingClientRect().top * this.zoom - 20; return; }
    if (/^(https?:|mailto:|tel:)/i.test(href)) this.app.notify('info', this.app.t('notice.previewLink', { href }));
  }

  /** A point in the frame → the main window ({ clientX, clientY }). */
  toClient(x, y) {
    const r = this.frame.getBoundingClientRect();
    const z = this.zoom;
    return { clientX: r.left + x * z, clientY: r.top + y * z };
  }

  /**
   * While a drag that started in the main window runs, pointer events over the frame go to the
   * frame's own document: they are passed on as main-window coordinates. Returns the stop function.
   */
  forwardPointer({ move, up }) {
    const doc = this.doc;
    if (!doc) return () => {};
    const convert = (e) => ({ ...this.toClient(e.clientX, e.clientY), type: e.type, buttons: e.buttons, pointerId: e.pointerId });
    const onMove = (e) => move(convert(e));
    const onUp = (e) => up(convert(e));
    doc.addEventListener('pointermove', onMove, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onUp, true);
    return () => {
      doc.removeEventListener('pointermove', onMove, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
    };
  }

  /** Drags the selected block by its name tab to another place in the page. */
  dragBlock(event, id) {
    const app = this.app;
    let target = null;
    let moved = false;
    let done = false;
    const start = { x: event.clientX, y: event.clientY };
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      moved = true;
      const p = this.toFrame(e.clientX, e.clientY);
      target = p ? this.dropIndexAt(p.y, id) : null;
      this.showDrop(target, app.t('canvas.dropHere'));
      this.autoScroll(e.clientY);
    };
    const finish = (e) => {
      if (done) return;
      done = true;
      stopFrame();
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      document.body.style.cursor = '';
      this.showDrop(null);
      if (moved && target && e.type === 'pointerup') app.moveBlockTo(id, target.index);
    };
    try { event.target.setPointerCapture?.(event.pointerId); } catch { /* a synthetic event */ }
    document.body.style.cursor = 'grabbing';
    const stopFrame = this.forwardPointer({ move, up: finish });
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  }

  /** Near the top or bottom edge while dragging: scroll. */
  autoScroll(clientY) {
    const r = this.scroll.getBoundingClientRect();
    if (clientY < r.top + 40) this.scroll.scrollTop -= 18;
    else if (clientY > r.bottom - 40) this.scroll.scrollTop += 18;
  }
}

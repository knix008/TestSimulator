// WYSIWYG for Markdown: the rendered document, editable in place (a frame that runs no scripts,
// so the page's styles never mix with the app's). Every edit is turned back into Markdown
// (domain/htmltomd.js) and handed to the app, which puts it into the source document. Pictures
// are elements like characters: select, delete, drop or paste them where the caret is.
import DOMPurify from 'dompurify';
import { markdownToHtml } from '../domain/render.js';
import { PREVIEW_CSS } from '../domain/previewcss.js';
import { htmlToMarkdown } from '../domain/htmltomd.js';
import { htmlTable } from '../domain/texttools.js';

const EDIT_CSS = `
.markdown-body[contenteditable] { outline: none; min-height: 70vh; caret-color: #f5a524; }
.markdown-body img { cursor: default; }
.markdown-body img:hover { outline: 2px solid #3a6cf0; }
.markdown-body li > input[type="checkbox"] { cursor: pointer; }
.markdown-body ::selection { background: rgba(58, 108, 240, 0.25); }
.markdown-body:empty::before { content: attr(data-placeholder); color: #9aa3b2; }
`;
const SKELETON = `<!doctype html><html><head><meta charset="utf-8"><style>${PREVIEW_CSS}${EDIT_CSS}</style></head><body class="preview-body"><article class="markdown-body" contenteditable="true" spellcheck="false"></article></body></html>`;
const isRelative = (url) => url && !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(url);

export class Wysiwyg {
  /** hooks: onChange(markdown), resolve(src) → url, onKey(event), onDropFiles(files, insert), style(), dark(), placeholder() */
  constructor(host, hooks) {
    this.host = host;
    this.hooks = hooks;
    this.frame = null;
    this.docId = null;
    this.lastMarkdown = null;
    this.timer = 0;
    this.ready = null;
  }

  frameDoc() { try { return this.frame?.contentDocument ?? null; } catch { return null; } }
  article() { return this.frameDoc()?.querySelector('article') ?? null; }

  async ensureFrame() {
    if (this.frame?.isConnected && this.article()) return;
    this.frame?.remove();
    const frame = document.createElement('iframe');
    frame.className = 'wysiwyg-frame';
    frame.title = 'WYSIWYG';
    frame.setAttribute('sandbox', 'allow-same-origin');
    this.host.appendChild(frame);
    this.frame = frame;
    this.ready = new Promise((resolve) => { frame.addEventListener('load', resolve, { once: true }); frame.srcdoc = SKELETON; });
    await this.ready;
    this.lastMarkdown = null;
    this.wire();
  }

  /** Shows a document's Markdown, unless it is the text this view produced itself. */
  async show(doc, markdown, { force = false } = {}) {
    await this.ensureFrame();
    const article = this.article();
    const fdoc = this.frameDoc();
    if (!article) return;
    fdoc.body.className = `preview-body style-${this.hooks.style()}${this.hooks.dark() ? ' dark' : ''}`;
    article.dataset.placeholder = this.hooks.placeholder();
    if (!force && this.docId === doc.id && markdown === this.lastMarkdown) return;
    this.docId = doc.id;
    this.lastMarkdown = markdown;
    article.innerHTML = DOMPurify.sanitize(markdownToHtml(markdown, { lines: false }), { FORBID_TAGS: ['style', 'script'] });
    for (const box of article.querySelectorAll('li > input[type="checkbox"]')) box.removeAttribute('disabled');
    await this.resolveImages(article);
  }

  /** Relative picture paths load through the app (asset URLs); the written path stays in data-src. */
  async resolveImages(root) {
    const jobs = [];
    for (const img of root.querySelectorAll('img[src]')) {
      const src = img.getAttribute('data-src') ?? img.getAttribute('src');
      if (!isRelative(src)) continue;
      img.setAttribute('data-src', src);
      jobs.push(Promise.resolve(this.hooks.resolve(src)).then((url) => { if (url) img.setAttribute('src', url); }).catch(() => {}));
    }
    await Promise.all(jobs);
  }

  wire() {
    const fdoc = this.frameDoc();
    const article = this.article();
    fdoc.execCommand?.('defaultParagraphSeparator', false, 'p');
    article.addEventListener('input', () => this.changed());
    // The tag bar shows what the caret is in.
    fdoc.addEventListener('selectionchange', () => this.hooks.onSelection?.());
    article.addEventListener('change', (event) => {
      // Ticking a task box is an edit too (the attribute carries it into Markdown).
      if (event.target.matches('input[type="checkbox"]')) { event.target.toggleAttribute('checked', event.target.checked); this.changed(0); }
    });
    fdoc.addEventListener('keydown', (event) => {
      if (this.hooks.onKey?.(event)) event.preventDefault();
    });
    // Links are followed with Ctrl+click only (a plain click puts the caret in them).
    article.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (link && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this.hooks.onLink?.(link.getAttribute('href')); }
    });
    // Pasted pictures and dropped picture files become <img> at the caret; pasted HTML is cleaned.
    article.addEventListener('paste', (event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); this.hooks.onDropFiles?.(files.map((file) => ({ file, path: file.name, web: true })), (markup) => this.insertImage(markup)); return; }
      const html = event.clipboardData?.getData('text/html');
      if (html) {
        event.preventDefault();
        this.exec('insertHTML', DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'script', 'meta', 'link'], FORBID_ATTR: ['style', 'class', 'id'] }));
      }
    });
    article.addEventListener('dragover', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) event.preventDefault(); });
    article.addEventListener('drop', (event) => {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (!files.length) return;
      event.preventDefault();
      const range = fdoc.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (range) { const sel = fdoc.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
      this.hooks.onDropFiles?.(files.map((file) => ({ file, path: file.name, web: true })), (markup) => this.insertImage(markup));
    });
  }

  changed(delay = 250) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delay);
  }

  /** The page as Markdown, sent to the app now. */
  flush() {
    clearTimeout(this.timer);
    const article = this.article();
    if (!article) return null;
    const markdown = htmlToMarkdown(article.innerHTML);
    this.lastMarkdown = markdown;
    this.hooks.onChange?.(markdown);
    return markdown;
  }

  focus() { this.article()?.focus(); }

  exec(command, value = null) {
    const fdoc = this.frameDoc();
    if (!fdoc) return;
    this.article().focus();
    fdoc.execCommand(command, false, value);
    this.changed(0);
  }

  selectedText() { return this.frameDoc()?.getSelection()?.toString() ?? ''; }

  /** Inserts an <img> (Markdown markup or a ready element string) at the caret. */
  async insertImage(markup) {
    const m = /!\[([^\]]*)\]\(<?([^)>]+)>?\)/.exec(markup);
    const src = m ? m[2] : /src="([^"]+)"/.exec(markup)?.[1];
    const alt = m ? m[1] : /alt="([^"]*)"/.exec(markup)?.[1] ?? '';
    if (!src) return;
    const url = isRelative(src) ? await this.hooks.resolve(src) : src;
    const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    this.exec('insertHTML', `<img src="${esc(url)}" ${isRelative(src) ? `data-src="${esc(src)}"` : ''} alt="${esc(alt)}">`);
  }

  /** Format commands of the toolbar and the menus, on the selection. */
  command(what, value) {
    const fdoc = this.frameDoc();
    if (!fdoc) return false;
    const sel = fdoc.getSelection();
    const text = sel?.toString() ?? '';
    const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    switch (what) {
      case 'bold': this.exec('bold'); return true;
      case 'italic': this.exec('italic'); return true;
      case 'strike': this.exec('strikeThrough'); return true;
      case 'code': { const inside = this.caretElement()?.closest('code'); if (inside && !inside.closest('pre')) { inside.replaceWith(...inside.childNodes); this.changed(0); return true; } return this.wrapSelection('code', text || 'code'); }
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': this.exec('formatBlock', `<${what}>`); return true;
      case 'boldItalic': {
        const s = this.state();
        if (s.bold === s.italic) { this.exec('bold'); this.exec('italic'); } else if (!s.bold) this.exec('bold'); else this.exec('italic');
        return true;
      }
      case 'br': this.exec('insertLineBreak'); return true;
      case 'clear': this.exec('removeFormat'); this.exec('unlink'); return true;
      case 'kbd': case 'mark': case 'u': case 'sup': case 'sub': return this.toggleInline(what, text);
      case 'p': this.exec('formatBlock', '<p>'); return true;
      case 'quote': this.exec('formatBlock', '<blockquote>'); return true;
      case 'ul': this.exec('insertUnorderedList'); return true;
      case 'ol': this.exec('insertOrderedList'); return true;
      case 'task': {
        this.exec('insertUnorderedList');
        const li = sel?.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('li');
        if (li && !li.querySelector(':scope > input[type="checkbox"]')) li.insertAdjacentHTML('afterbegin', '<input type="checkbox"> ');
        this.changed(0);
        return true;
      }
      case 'link': this.exec('insertHTML', `<a href="${esc(value.url)}">${esc(value.text || value.url)}</a>`); return true;
      case 'image': this.insertImage(`![${value.alt}](${value.url})`); return true;
      case 'table': return this.insertBlock(htmlTable(value.cols, value.rows, value.header), 'th');
      case 'codeBlock': return this.insertBlock(`<pre><code${value ? ` class="language-${esc(value)}"` : ''}>${esc(text || '\n')}</code></pre>`, 'code');
      case 'hr': this.exec('insertHorizontalRule'); return true;
      case 'undo': this.exec('undo'); return true;
      case 'redo': this.exec('redo'); return true;
      case 'selectAll': this.exec('selectAll'); return true;
      case 'text': this.exec('insertText', value); return true;
      default: return false;
    }
  }

  /** The element the caret is in (inside the article), or null. */
  caretElement() {
    const sel = this.frameDoc()?.getSelection();
    const node = sel?.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return el && this.article()?.contains(el) ? el : null;
  }

  /** Wraps the selection in an inline HTML tag that Markdown keeps (<kbd>, <mark> …); unwraps it when the caret is inside one. */
  toggleInline(tag, text) {
    const inside = this.caretElement()?.closest(tag);
    if (inside && this.article().contains(inside)) {
      inside.replaceWith(...inside.childNodes);
      this.changed(0);
      return true;
    }
    return this.wrapSelection(tag, text || tag);
  }

  /**
   * Wraps the selection in an element by working on the DOM: Chrome's insertHTML turns <kbd>, <code>
   * and the like into styled <span>s and eats the spaces around them. The wrapped text stays selected.
   */
  wrapSelection(tag, placeholder) {
    const fdoc = this.frameDoc();
    const sel = fdoc?.getSelection();
    if (!sel?.rangeCount || !this.caretElement()) return false;
    const range = sel.getRangeAt(0);
    const el = fdoc.createElement(tag);
    if (range.collapsed) el.textContent = placeholder; else el.appendChild(range.extractContents());
    range.insertNode(el);
    const inside = fdoc.createRange();
    inside.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(inside);
    this.changed(0);
    return true;
  }

  /** A block (table, code block) after the paragraph the caret is in, or in place of an empty one. */
  insertBlock(html, focusSelector) {
    const fdoc = this.frameDoc();
    const article = this.article();
    if (!fdoc || !article) return false;
    const template = fdoc.createElement('template');
    template.innerHTML = html;
    const nodes = [...template.content.childNodes];
    let block = this.caretElement();
    while (block && block.parentElement !== article) block = block.parentElement;
    if (block && !block.textContent.trim() && !block.querySelector('img')) block.replaceWith(...nodes);
    else if (block) block.after(...nodes);
    else article.append(...nodes);
    // Somewhere to go on writing after the block.
    const last = nodes[nodes.length - 1];
    if (!last.nextElementSibling) last.after(Object.assign(fdoc.createElement('p'), { innerHTML: '<br>' }));
    const target = last.querySelector?.(focusSelector) ?? (last.matches?.(focusSelector) ? last : null);
    if (target) {
      const r = fdoc.createRange();
      r.selectNodeContents(target);
      const sel = fdoc.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    article.focus();
    this.changed(0);
    return true;
  }

  /** What the caret is in, for the tag bar: inline marks, the block kind, the list. */
  state() {
    const fdoc = this.frameDoc();
    const out = { bold: false, italic: false, strike: false, block: 'p', list: null, task: false, inline: [] };
    const el = this.caretElement();
    if (!fdoc || !el) return out;
    const q = (name) => { try { return fdoc.queryCommandState(name); } catch { return false; } };
    out.bold = q('bold');
    out.italic = q('italic');
    out.strike = q('strikeThrough');
    const block = el.closest('h1, h2, h3, h4, h5, h6, blockquote, pre, p, li');
    out.block = block ? block.tagName.toLowerCase() : 'p';
    if (el.closest('blockquote')) out.block = 'quote';
    if (el.closest('pre')) out.block = 'codeBlock';
    const list = el.closest('ul, ol');
    out.list = list ? list.tagName.toLowerCase() : null;
    out.task = Boolean(el.closest('li')?.querySelector(':scope > input[type="checkbox"]'));
    out.inline = ['code', 'kbd', 'mark', 'u', 'sup', 'sub', 'a'].filter((tag) => el.closest(tag) && this.article().contains(el.closest(tag)));
    return out;
  }

  /** Scrolls to the n-th heading (the outline). */
  scrollToHeading(index) {
    const heading = this.article()?.querySelectorAll('h1, h2, h3, h4, h5, h6')[index];
    heading?.scrollIntoView({ block: 'start' });
  }

  clear() { this.frame?.remove(); this.frame = null; this.docId = null; this.lastMarkdown = null; }
}

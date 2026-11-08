// The preview beside the editor. Markdown is rendered, cleaned by DOMPurify and put into a frame
// that runs no scripts (sandbox without allow-scripts, so the page can still reach into it to
// scroll it and catch link clicks). An HTML document is shown as it is: without scripts by
// default; with "run scripts" on it gets allow-scripts but loses allow-same-origin, so a page
// can never reach the app (and the scroll then follows by proportion only).
import DOMPurify from 'dompurify';
import { markdownToHtml } from '../domain/render.js';
import { PREVIEW_CSS } from '../domain/previewcss.js';
import { dirName } from '../domain/doctypes.js';

const SKELETON = `<!doctype html><html><head><meta charset="utf-8"><style>${PREVIEW_CSS}</style></head><body class="preview-body"><article class="markdown-body"></article></body></html>`;
const isRelative = (url) => url && !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(url);
const join = (dir, rel) => `${dir}${dir.includes('\\') ? '\\' : '/'}${decodeURIComponent(rel).replace(/\//g, dir.includes('\\') ? '\\' : '/')}`;

export class Preview {
  /** hooks: fileUrl(path) → Promise<url>, onLink(href), onScroll(), style(), dark(), scripts() */
  constructor(host, hooks) {
    this.host = host;
    this.hooks = hooks;
    this.frame = null;
    this.mode = null; // 'markdown' | 'html' | 'html-scripts'
    this.docId = null;
    this.pending = 0;
    this.lastHtml = null;
  }

  frameDoc() {
    try { return this.frame?.contentDocument ?? null; } catch { return null; }
  }

  makeFrame(mode) {
    this.frame?.remove();
    const frame = document.createElement('iframe');
    frame.className = 'preview-frame';
    frame.title = 'preview';
    frame.setAttribute('sandbox', mode === 'html-scripts' ? 'allow-scripts allow-popups allow-forms allow-modals' : 'allow-same-origin');
    this.host.appendChild(frame);
    this.frame = frame;
    // A frame the browser reloads on its own (moved in the page) comes back empty: draw it again.
    let loads = 0;
    frame.addEventListener('load', () => {
      loads += 1;
      if (loads > 1 && this.frame === frame) { this.lastHtml = null; this.hooks.onReload?.(); }
    });
    this.mode = mode;
    this.lastHtml = null;
    return frame;
  }

  clear() {
    this.frame?.remove();
    this.frame = null;
    this.mode = null;
    this.docId = null;
    this.lastHtml = null;
  }

  /** Shows a document (kind markdown or html). Fast to call on every edit: the page debounces. */
  async show(doc, text) {
    this.generation = (this.generation ?? 0) + 1;
    const mode = doc.kind === 'markdown' ? 'markdown' : this.hooks.scripts() ? 'html-scripts' : 'html';
    const changedDoc = this.docId !== doc.id;
    this.docId = doc.id;
    if (mode === 'markdown') return this.showMarkdown(doc, text, changedDoc || this.mode !== mode);
    return this.showHtml(doc, text, mode, changedDoc);
  }

  async showMarkdown(doc, text, fresh) {
    if (fresh || !this.frameDoc()?.querySelector('article')) {
      const generation = this.generation;
      const frame = this.makeFrame('markdown');
      await new Promise((resolve) => { frame.addEventListener('load', resolve, { once: true }); frame.srcdoc = SKELETON; });
      // Another show() started meanwhile (or the frame was replaced): that one draws.
      if (generation !== this.generation || this.frame !== frame) return;
      this.wire();
    }
    const fdoc = this.frameDoc();
    if (!fdoc?.querySelector('article')) return;
    fdoc.body.className = `preview-body style-${this.hooks.style()}${this.hooks.dark() ? ' dark' : ''}`;
    const html = DOMPurify.sanitize(markdownToHtml(text), { ADD_ATTR: ['data-line', 'target'], FORBID_TAGS: ['style'] });
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    const article = fdoc.querySelector('article');
    const top = fdoc.scrollingElement?.scrollTop ?? 0;
    article.innerHTML = html;
    await this.fixUrls(article, doc);
    if (fdoc.scrollingElement) fdoc.scrollingElement.scrollTop = top;
  }

  async showHtml(doc, text, mode, changedDoc) {
    if (text === this.lastHtml && this.mode === mode && !changedDoc) return;
    const keep = !changedDoc && this.mode === mode ? this.scrollRatio() : 0;
    const frame = this.makeFrame(mode);
    this.lastHtml = text;
    let source = text;
    // Relative pictures and style sheets next to the file: <base> pointing at its folder (desktop).
    if (mode === 'html') {
      const dir = doc.path && !doc.web ? dirName(doc.path) : '';
      if (dir) {
        const parsed = new DOMParser().parseFromString(text, 'text/html');
        await this.fixUrls(parsed, doc);
        source = `<!doctype html>\n${parsed.documentElement.outerHTML}`;
      }
    }
    await new Promise((resolve) => {
      frame.addEventListener('load', resolve, { once: true });
      frame.srcdoc = source;
    });
    if (mode === 'html') this.wire();
    this.setScrollRatio(keep);
  }

  /** Relative src / href of pictures, style sheets and links resolved against the document's folder. */
  async fixUrls(root, doc) {
    const dir = doc.path && !doc.web ? dirName(doc.path) : '';
    if (!dir) return;
    const jobs = [];
    for (const el of root.querySelectorAll('img[src], source[src], video[src], audio[src], link[rel~="stylesheet"][href]')) {
      const attr = el.hasAttribute('src') ? 'src' : 'href';
      const value = el.getAttribute(attr);
      if (!isRelative(value)) continue;
      const [path] = value.split(/[?#]/);
      jobs.push(this.hooks.fileUrl(join(dir, path)).then((url) => el.setAttribute(attr, url)).catch(() => {}));
    }
    await Promise.all(jobs);
  }

  /** Link clicks go to the app (an external browser, another document, a heading in this one); scrolling is reported. */
  wire() {
    const fdoc = this.frameDoc();
    if (!fdoc) return;
    fdoc.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      event.preventDefault();
      const href = link.getAttribute('href');
      if (href.startsWith('#')) {
        const target = fdoc.getElementById(decodeURIComponent(href.slice(1)));
        target?.scrollIntoView({ block: 'start' });
        return;
      }
      this.hooks.onLink(href);
    });
    fdoc.addEventListener('scroll', () => this.hooks.onScroll(), { passive: true });
    // Keys pressed in the preview still reach the app's shortcuts.
    fdoc.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey || event.key.startsWith('F'))) return;
      const copy = new KeyboardEvent('keydown', event);
      if (!document.dispatchEvent(copy)) event.preventDefault();
    });
  }

  scroller() { return this.frameDoc()?.scrollingElement ?? null; }

  scrollRatio() {
    const s = this.scroller();
    if (!s) return 0;
    const max = s.scrollHeight - s.clientHeight;
    return max > 0 ? s.scrollTop / max : 0;
  }

  setScrollRatio(ratio) {
    const s = this.scroller();
    if (s) s.scrollTop = ratio * (s.scrollHeight - s.clientHeight);
  }

  /** Markdown: the source line at the top of the preview (fractional), from the data-line blocks. */
  topLine() {
    const fdoc = this.frameDoc();
    const s = this.scroller();
    if (!fdoc || !s || this.mode !== 'markdown') return null;
    const blocks = [...fdoc.querySelectorAll('.md-block')];
    if (!blocks.length) return null;
    const top = s.scrollTop;
    let previous = null;
    for (const block of blocks) {
      const y = block.offsetTop;
      if (y > top) {
        if (!previous) return Number(block.dataset.line);
        const from = Number(previous.dataset.line);
        const span = y - previous.offsetTop;
        return from + (span > 0 ? ((top - previous.offsetTop) / span) * (Number(block.dataset.line) - from) : 0);
      }
      previous = block;
    }
    return Number(previous.dataset.line);
  }

  /** Markdown: scrolls the preview so that this source line (fractional) is at its top. */
  scrollToLine(line) {
    const fdoc = this.frameDoc();
    const s = this.scroller();
    if (!fdoc || !s || this.mode !== 'markdown') return false;
    const blocks = [...fdoc.querySelectorAll('.md-block')];
    if (!blocks.length) return false;
    let before = blocks[0];
    let after = null;
    for (const block of blocks) {
      if (Number(block.dataset.line) <= line) before = block; else { after = block; break; }
    }
    const from = Number(before.dataset.line);
    const y0 = before.offsetTop;
    if (!after) { s.scrollTop = y0 + (line - from) * 20; return true; }
    const to = Number(after.dataset.line);
    s.scrollTop = y0 + ((line - from) / Math.max(1, to - from)) * (after.offsetTop - y0);
    return true;
  }

  /** Marks the block the editor's cursor is in. */
  markLine(line) {
    const fdoc = this.frameDoc();
    if (!fdoc || this.mode !== 'markdown') return;
    let hit = null;
    for (const block of fdoc.querySelectorAll('.md-block')) { if (Number(block.dataset.line) <= line) hit = block; else break; }
    for (const old of fdoc.querySelectorAll('.cursor-block')) if (old !== hit) old.classList.remove('cursor-block');
    hit?.classList.add('cursor-block');
  }

  /** The rendered body (for "Copy as HTML"). */
  renderedHtml() { return this.frameDoc()?.querySelector('article')?.innerHTML ?? ''; }

  print() {
    const win = this.frame?.contentWindow;
    if (!win) return false;
    try { win.focus(); win.print(); return true; } catch { return false; }
  }
}

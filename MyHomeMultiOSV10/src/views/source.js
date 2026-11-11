// The site's own files in the main window: the current page's HTML, style.css and script.js.
// Typing is kept on the site (undoable). A file that still matches the blocks is not stored,
// so the design keeps writing it until the text actually changes.
import { highlight, lineColumn } from '../domain/highlight.js';
import { cssFileText, cssHasSource, jsFileText, pageFileText, pageHasSource } from '../domain/sourcefiles.js';
import { pageFile } from '../domain/render.js';
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';

const INDENT = '  ';
const HIGHLIGHT_LIMIT = 80000;

export class SourceEditor {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.key = '';
    this.frame = 0;
    this.abort = new AbortController();
    const opt = { signal: this.abort.signal };
    host.addEventListener('input', (event) => {
      if (!event.target.classList?.contains('code-input')) return;
      this.schedule();
      this.paint();
    }, opt);
    host.addEventListener('keydown', (event) => {
      if (!event.target.classList?.contains('code-input')) return;
      this.onKeyDown(event);
    }, opt);
    host.addEventListener('keyup', (event) => { if (event.target.classList?.contains('code-input')) this.paintCurrent(); }, opt);
    host.addEventListener('click', (event) => {
      const tab = event.target.closest?.('[data-source-file]');
      if (tab && this.host.contains(tab)) {
        const file = tab.dataset.sourceFile;
        if (file && file !== this.file()) { this.commit(); this.app.showSource(file); }
        return;
      }
      if (event.target.classList?.contains('code-input')) this.paintCurrent();
    }, opt);
    host.addEventListener('scroll', (event) => {
      if (!event.target.classList?.contains('code-scroll')) return;
      const gutter = this.host.querySelector('.code-gutter-inner');
      if (gutter) gutter.style.transform = `translateY(${-event.target.scrollTop}px)`;
    }, { ...opt, capture: true });
  }

  file() { return this.app.state.sourceFile || 'page'; }
  get input() { return this.host.querySelector('.code-input'); }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.commit();
    this.abort.abort();
    this.host.replaceChildren();
  }

  /** Writes the textarea into the site. `live` is a keystroke: the page updates at once and the burst is one undo step. */
  commit(live = false) {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    const input = this.input;
    const doc = this.app.doc();
    if (!input || !doc) return;
    this.app.commitSource(this.file(), input.value, { live });
  }

  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.commit(true); });
  }

  textOf() {
    const doc = this.app.doc();
    if (!doc) return '';
    if (this.file() === 'css') return cssFileText(doc.site);
    if (this.file() === 'js') return jsFileText(doc.site);
    return pageFileText(doc.site, doc.page);
  }

  viewKey() {
    const doc = this.app.doc();
    const file = this.file();
    return `${doc?.id ?? ''}|${file}|${file === 'page' ? doc?.page?.id ?? '' : ''}|${this.app.language()}`;
  }

  render() {
    const doc = this.app.doc();
    if (!doc) return;
    const key = this.viewKey();
    if (this.host.querySelector('.source-view') && this.key === key) { this.syncFromSite(); return; }
    this.key = key;
    const file = this.file();
    const t = this.app.t;
    const wrap = Boolean(this.app.state.settings.wordWrap);
    const tab = (id, glyph, label) => `<button type="button" class="source-file ${file === id ? 'active' : ''}" data-source-file="${id}" role="tab" aria-selected="${file === id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
    const pageName = pageFile(doc.page);
    this.host.innerHTML = `<div class="source-view ${wrap ? 'wrap' : ''}">
      <div class="source-bar">
        <div class="source-files" role="tablist">
          ${tab('page', 'htmlFile', pageName)}
          ${tab('css', 'palette', 'style.css')}
          ${tab('js', 'blkHtml', 'script.js')}
        </div>
        <span class="source-note"></span>
        <button type="button" class="small-button source-wrap ${wrap ? 'active' : ''}" data-command="wordWrap" title="${escapeHtml(t('tip.wordWrap'))}" aria-pressed="${wrap}">${icon('textAlignLeft')}<span>${escapeHtml(t('action.wordWrap'))}</span></button>
        <button type="button" class="small-button source-save" data-command="save" title="${escapeHtml(t('action.save'))} (Ctrl+S)">${icon('save')}<span>${escapeHtml(t('action.save'))}</span></button>
        <button type="button" class="small-button source-revert" data-command="revertPageSource" hidden>${icon('refresh')}<span></span></button>
      </div>
      <div class="code-editor">
        <div class="code-gutter" aria-hidden="true"><div class="code-gutter-inner"></div></div>
        <div class="code-scroll"><div class="code-layer">
          <div class="code-current" aria-hidden="true"></div>
          <pre class="code-hl" aria-hidden="true"></pre>
          <textarea class="code-input" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="${wrap ? 'soft' : 'off'}" aria-label="${escapeHtml(file === 'page' ? pageName : file === 'css' ? 'style.css' : 'script.js')}"></textarea>
        </div></div>
      </div>
    </div>`;
    this.input.value = this.textOf();
    this.refreshChrome();
    this.paint();
    this.input.focus({ preventScroll: true });
  }

  /** An undo, or the code window, changed the file under the caret. */
  syncFromSite() {
    this.refreshChrome();
    const input = this.input;
    if (!input) return;
    const next = this.textOf();
    if (input.value === next || document.activeElement === input) return;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    input.value = next;
    this.paint();
  }

  refreshChrome() {
    const note = this.host.querySelector('.source-note');
    const revert = this.host.querySelector('.source-revert');
    const doc = this.app.doc();
    if (!note || !doc) return;
    const t = this.app.t;
    const file = this.file();
    const pageName = pageFile(doc.page);
    const pageTab = this.host.querySelector('[data-source-file="page"] span');
    if (pageTab) pageTab.textContent = pageName;
    this.applyWrap();
    if (file === 'css') {
      note.textContent = t(cssHasSource(doc.site) ? 'source.hint.cssCustom' : 'source.hint.css');
      revert.hidden = !cssHasSource(doc.site);
      revert.dataset.command = 'revertCssFile';
      revert.querySelector('span').textContent = t('source.revertCss');
      revert.title = t('source.revertCss');
    } else if (file === 'js') {
      note.textContent = t('source.hint.js');
      revert.hidden = true;
    } else {
      note.textContent = t(pageHasSource(doc.page) ? 'source.hint.pageCustom' : 'source.hint.page', { file: pageName });
      revert.hidden = !pageHasSource(doc.page);
      revert.dataset.command = 'revertPageSource';
      revert.querySelector('span').textContent = t('source.revertPage');
      revert.title = t('source.revertPage');
    }
  }

  /** Turns long lines onto the next row when Word Wrap is on. */
  applyWrap() {
    const on = Boolean(this.app.state.settings.wordWrap);
    const view = this.host.querySelector('.source-view');
    const input = this.input;
    const button = this.host.querySelector('.source-wrap');
    if (!view || !input) return;
    const was = view.classList.contains('wrap');
    view.classList.toggle('wrap', on);
    input.wrap = on ? 'soft' : 'off';
    if (button) {
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', String(on));
    }
    if (was !== on) this.paint();
  }

  paint() {
    const input = this.input;
    const hl = this.host.querySelector('.code-hl');
    if (!input || !hl) return;
    const text = input.value;
    const language = { page: 'html', css: 'css', js: 'js' }[this.file()] ?? 'text';
    const coloured = text.length > HIGHLIGHT_LIMIT ? escapeHtml(text) : highlight(text, language);
    hl.innerHTML = linesHtml(coloured);
    const lines = text.split('\n').length;
    const editor = this.host.querySelector('.code-editor');
    const gutter = this.host.querySelector('.code-gutter-inner');
    editor.style.setProperty('--gutter-digits', String(Math.max(2, String(lines).length)));
    const wrapped = this.host.querySelector('.source-view')?.classList.contains('wrap');
    if (wrapped) {
      const rows = hl.querySelectorAll('.cl');
      gutter.innerHTML = [...rows].map((row, i) => `<div style="height:${row.offsetHeight}px">${i + 1}</div>`).join('');
    } else {
      let html = '';
      for (let i = 1; i <= lines; i += 1) html += `<div>${i}</div>`;
      gutter.innerHTML = html;
    }
    this.paintCurrent();
    this.paintMarks();
  }

  /** Marks the lines the Problems panel found in this file. */
  paintMarks() {
    const file = this.file();
    const rows = (this.app.problems?.list?.() ?? []).filter((row) => row.kind === 'code' && row.path === file);
    const byLine = new Map();
    for (const row of rows) {
      const prev = byLine.get(row.line);
      if (!prev || row.severity === 'error') byLine.set(row.line, row);
    }
    const mark = (node, line) => {
      const row = byLine.get(line);
      node.classList.toggle('problem-error', row?.severity === 'error');
      node.classList.toggle('problem-warning', row?.severity === 'warning');
      if (row) node.title = row.message;
      else node.removeAttribute('title');
    };
    this.host.querySelectorAll('.code-gutter-inner > div').forEach((node, index) => mark(node, index + 1));
    this.host.querySelectorAll('.code-hl > div').forEach((node, index) => mark(node, index + 1));
  }

  jumpTo(line, column = 1) {
    const input = this.input;
    if (!input) return;
    const start = lineOffset(input.value, line);
    const end = input.value.indexOf('\n', start);
    const at = Math.min(end < 0 ? input.value.length : end, start + Math.max(0, column - 1));
    input.focus({ preventScroll: true });
    input.setSelectionRange(at, at);
    const row = this.host.querySelector('.code-hl')?.children[Math.max(0, line - 1)];
    row?.scrollIntoView({ block: 'nearest' });
    this.paintCurrent();
  }

  paintCurrent() {
    const input = this.input;
    const bar = this.host.querySelector('.code-current');
    const hl = this.host.querySelector('.code-hl');
    if (!input || !bar || !hl) return;
    const { line } = lineColumn(input.value, input.selectionStart);
    const row = hl.children[line - 1];
    if (!row) return;
    bar.style.top = `${row.offsetTop}px`;
    bar.style.height = `${row.offsetHeight}px`;
    for (const node of this.host.querySelectorAll('.code-gutter-inner > .on')) node.classList.remove('on');
    this.host.querySelector(`.code-gutter-inner > :nth-child(${line})`)?.classList.add('on');
  }

  onKeyDown(event) {
    const input = this.input;
    if (!input || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) this.outdent();
      else this.insert(INDENT, input.selectionStart, input.selectionEnd);
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    const text = input.value;
    const start = input.selectionStart;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart, start))[0];
    this.insert(`\n${indent}`, start, input.selectionEnd);
  }

  outdent() {
    const input = this.input;
    const text = input.value;
    const start = input.selectionStart;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart))[0];
    const cut = Math.min(indent.length, INDENT.length);
    if (cut) this.insert('', lineStart, lineStart + cut);
  }

  /** Replaces [start, end) through the browser's editing, so Ctrl+Z undoes it like typing. */
  insert(text, start, end) {
    const input = this.input;
    input.focus({ preventScroll: true });
    input.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) {
      input.setRangeText(text, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

function lineOffset(text, line) {
  let at = 0;
  for (let i = 1; i < line; i += 1) {
    const next = text.indexOf('\n', at);
    if (next < 0) return text.length;
    at = next + 1;
  }
  return at;
}

/** Coloured HTML as one block per line (a run that crosses a line break is closed and opened again). */
function linesHtml(html) {
  const out = [];
  let line = '';
  let open = '';
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<span', i)) { const end = html.indexOf('>', i) + 1; open = html.slice(i, end); line += open; i = end; continue; }
    if (html.startsWith('</span>', i)) { line += '</span>'; open = ''; i += 7; continue; }
    if (html[i] === '\n') { out.push(`<div class="cl">${open ? `${line}</span>` : line}​</div>`); line = open; i += 1; continue; }
    line += html[i];
    i += 1;
  }
  out.push(`<div class="cl">${line}​</div>`);
  return out.join('');
}

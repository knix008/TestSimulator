// Live preview (Obsidian / Typora style): on lines that do not hold the cursor or the selection, the
// Markdown marks are hidden and the result is shown — sized headings, bold / italic / strike /
// highlight, code pills, links and [[wiki links]] (unresolved ones dimmer), #tag pills, checkboxes,
// bullets, quote bars and callouts, rules, images under their line, tinted code / math / front matter
// blocks. Fenced code and front matter show their fences again while the cursor is inside the block.
// Everything is decorations over the real text, so the text stays editable and IME composition is
// untouched (the cursor's own line is always raw).
import { syntaxTree } from '@codemirror/language';
import { StateEffect } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { calloutIcon } from './editor-icons.js';
import { contextOf } from './context.js';
import { IMAGE_EXT, imageOptions, setImageOptions, splitUrl, splitWikiLink } from './mdtext.js';
import { calloutType, calloutLabel } from './texts.js';

/** Dispatch to rebuild the live decorations (e.g. after links were created or images changed). */
export const refreshLivePreview = StateEffect.define();

// ───────────────────────── widgets

class BulletWidget extends WidgetType {
  constructor(level) { super(); this.level = level; }
  eq(other) { return other.level === this.level; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-mm-bullet';
    span.textContent = ['•', '◦', '▪'][this.level % 3];
    return span;
  }
  ignoreEvent() { return false; }
}

class CheckboxWidget extends WidgetType {
  constructor(checked, state) { super(); this.checked = checked; this.state = state; }
  eq(other) { return other.checked === this.checked && other.state === this.state; }
  toDOM() {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-mm-checkbox';
    box.checked = this.checked;
    box.dataset.mmTask = this.state;
    box.title = t('editor.task.toggle');
    box.setAttribute('aria-label', t('editor.task.toggle'));
    return box;
  }
  ignoreEvent() { return false; }
}

// Front matter in live view: one chip in place of the YAML ("3 properties · right panel"); the properties
// themselves are shown and edited in the right panel's Properties tab. Clicking the chip opens that tab.
class PropertiesChipWidget extends WidgetType {
  constructor(count) { super(); this.count = count; }
  eq(other) { return other.count === this.count; }
  toDOM() {
    const chip = document.createElement('span');
    chip.className = 'cm-mm-props-chip';
    chip.innerHTML = `${icon('docProperties')}<span>${t('editor.properties.chip', { n: this.count })}</span>`;
    chip.title = t('editor.properties.tip');
    chip.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      chip.dispatchEvent(new CustomEvent('mm-show-properties', { bubbles: true }));
    });
    return chip;
  }
  ignoreEvent() { return true; }
}

class RuleWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-mm-hr';
    return span;
  }
}

class CodeLabelWidget extends WidgetType {
  constructor(lang) { super(); this.lang = lang; }
  eq(other) { return other.lang === this.lang; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-mm-codelabel';
    span.textContent = this.lang || t('editor.code.plain');
    return span;
  }
}

class CalloutWidget extends WidgetType {
  constructor(type, raw, label) { super(); this.type = type; this.raw = raw; this.label = label; }
  eq(other) { return other.type === this.type && other.label === this.label; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-mm-callout-icon';
    span.innerHTML = icon(calloutIcon(this.type));
    if (this.label) span.append(calloutLabel(this.raw));
    return span;
  }
}

const EXTERNAL = /^(https?:|data:|blob:|file:|asset:|tauri:)/i;

// A picture under its line. In live view it can be resized (the corner handle, ratio kept), sized from
// the hover toolbar (25 / 50 / 100 % of the text column, original), aligned (left / center / right) and
// dragged elsewhere in the note; each of these rewrites the embed's text in one undoable transaction
// (`![[img.png|center|300]]`, `![caption|center|300](url)`, see mdtext.js setImageOptions).
class ImageWidget extends WidgetType {
  constructor(path, width, height, alt, align) { super(); this.path = path; this.width = width; this.height = height; this.alt = alt; this.align = align; }
  eq(other) { return other.path === this.path && other.width === this.width && other.height === this.height && other.align === this.align; }
  get estimatedHeight() { return this.height ?? 160; }
  toDOM(view) {
    const box = document.createElement('div');
    box.className = 'cm-mm-image';
    const frame = document.createElement('span');
    frame.className = 'cm-mm-img-frame';
    const img = document.createElement('img');
    img.alt = this.alt ?? '';
    img.draggable = false;
    img.title = t('editor.image.move');
    frame.append(img);
    box.append(frame);
    this.applySize(box);
    const fail = () => {
      box.className = 'cm-mm-image missing';
      box.innerHTML = `${icon('editorImageMissing')}<span></span>`;
      box.lastChild.textContent = t('editor.image.missing', { path: this.path });
      view.requestMeasure();
    };
    img.onload = () => view.requestMeasure();
    img.onerror = fail;
    resolveImage(view, this.path).then((url) => { if (url) img.src = url; else fail(); }, fail);
    if (view.dom.classList.contains('mm-live')) imageControls(view, box, frame, img);
    return box;
  }
  /** The same picture with another size / alignment: keep the element (no reload, no flicker). */
  updateDOM(dom, view) {
    if (dom.dataset.mmPath !== this.path || dom.classList.contains('missing')) return false;
    this.applySize(dom);
    view.requestMeasure();
    return true;
  }
  applySize(box) {
    box.dataset.mmPath = this.path;
    if (this.align) box.dataset.align = this.align; else delete box.dataset.align;
    const img = box.querySelector('img');
    if (!img) return;
    img.alt = this.alt ?? '';
    img.style.width = this.width ? `${this.width}px` : '';
    img.style.height = this.height ? `${this.height}px` : '';
  }
  ignoreEvent(event) {
    // The picture's own controls (handle, toolbar, the picture itself) handle their events.
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(target?.closest('.cm-mm-img-frame'));
  }
}

/** The image embeds (Image / Embed of a picture) of a line, in text order: [{ from, to }]. */
export function imageEmbedsInLine(state, line) {
  const found = [];
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter: (ref) => {
      if (ref.name === 'Image') { if (ref.node.getChild('URL')) found.push({ from: ref.from, to: ref.to }); return false; }
      if (ref.name === 'Embed') {
        const parts = splitWikiLink(state.doc.sliceString(ref.from + 3, ref.to - 2));
        if (IMAGE_EXT.test(parts.target)) found.push({ from: ref.from, to: ref.to });
        return false;
      }
      return true;
    },
  });
  return found.filter((r) => r.from >= line.from && r.to <= line.to).sort((a, b) => a.from - b.from);
}

/** The embed (text range) a picture widget shows: its line, then its place among the line's pictures. */
function embedOfWidget(view, box) {
  let pos;
  try { pos = view.posAtDOM(box); } catch { return null; }
  const line = view.state.doc.lineAt(pos);
  const holder = box.parentElement;
  const index = holder ? [...holder.querySelectorAll(':scope > .cm-mm-image')].indexOf(box) : 0;
  const embeds = imageEmbedsInLine(view.state, line);
  return embeds[Math.max(0, index)] ?? embeds[0] ?? null;
}

/** Rewrites the picture's embed text with new options (one transaction, undoable). */
function rewriteEmbed(view, box, changes) {
  const range = embedOfWidget(view, box);
  if (!range) return false;
  const source = view.state.doc.sliceString(range.from, range.to);
  const next = setImageOptions(source, changes);
  if (next === source) return false;
  view.dispatch({ changes: { from: range.from, to: range.to, insert: next }, userEvent: 'input.image' });
  return true;
}

const PRESETS = [0.25, 0.5, 1];

function imageControls(view, box, frame, img) {
  const tools = document.createElement('span');
  tools.className = 'cm-mm-img-tools';
  tools.setAttribute('role', 'toolbar');
  tools.setAttribute('aria-label', t('editor.image.tools'));
  const button = (cls, html, title, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cm-mm-img-btn ${cls}`;
    b.innerHTML = html;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
    b.addEventListener('mousedown', (event) => { event.preventDefault(); event.stopPropagation(); });
    b.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); run(); });
    tools.append(b);
    return b;
  };
  const column = () => Math.max(40, box.clientWidth || view.contentDOM.clientWidth);
  for (const pct of PRESETS) {
    const label = `${Math.round(pct * 100)}%`;
    button('size', `<span>${label}</span>`, t('editor.image.width', { pct: label }), () => rewriteEmbed(view, box, { width: Math.round(column() * pct) }));
  }
  button('original', icon('editorImageOriginal'), t('editor.image.original'), () => rewriteEmbed(view, box, { width: null }));
  const sep = document.createElement('span');
  sep.className = 'cm-mm-img-sep';
  tools.append(sep);
  for (const [align, name, key] of [['left', 'editorImageLeft', 'alignLeft'], ['center', 'editorImageCenter', 'alignCenter'], ['right', 'editorImageRight', 'alignRight']]) {
    const b = button(`align align-${align}`, icon(name), t(`editor.image.${key}`), () => rewriteEmbed(view, box, { align: box.dataset.align === align ? null : align }));
    b.dataset.align = align;
  }

  const handle = document.createElement('span');
  handle.className = 'cm-mm-img-resize';
  handle.title = t('editor.image.resize');
  handle.innerHTML = icon('editorImageResize');
  const badge = document.createElement('span');
  badge.className = 'cm-mm-img-badge';
  frame.append(tools, handle, badge);

  // Resize: the corner handle; the width follows the pointer (both sides when centred), the height keeps the ratio.
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = img.getBoundingClientRect().width;
    const factor = box.dataset.align === 'center' ? 2 : box.dataset.align === 'right' ? -1 : 1;
    const max = column();
    let width = startW;
    try { handle.setPointerCapture(event.pointerId); } catch { /* a synthetic pointer */ }
    box.classList.add('resizing');
    const move = (e) => {
      width = Math.max(24, Math.min(max, startW + (e.clientX - startX) * factor));
      img.style.width = `${Math.round(width)}px`;
      img.style.height = 'auto';
      badge.textContent = `${Math.round(width)} px`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      box.classList.remove('resizing');
      badge.textContent = '';
      if (Math.abs(width - startW) >= 1) { if (!rewriteEmbed(view, box, { width: Math.round(width) })) view.requestMeasure(); }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('mousedown', (event) => { event.preventDefault(); event.stopPropagation(); });

  // Move: drag the picture; a caret shows where it goes. A plain click puts the cursor after the embed (raw text).
  img.addEventListener('mousedown', (event) => { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); } });
  img.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const range = embedOfWidget(view, box);
    if (!range) return;
    try { img.setPointerCapture(event.pointerId); } catch { /* a synthetic pointer */ }
    let dragging = false;
    let target = null;
    let caret = null;
    const scroller = view.scrollDOM;
    const place = (e) => {
      const r = scroller.getBoundingClientRect();
      if (e.clientY < r.top + 24) scroller.scrollTop -= 12; else if (e.clientY > r.bottom - 24) scroller.scrollTop += 12;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
      target = pos;
      const coords = pos == null ? null : view.coordsAtPos(pos);
      if (!coords || (pos >= range.from && pos <= range.to)) { if (caret) caret.style.display = 'none'; return; }
      caret ??= scroller.appendChild(Object.assign(document.createElement('div'), { className: 'cm-mm-img-dropcaret' }));
      caret.style.display = '';
      caret.style.left = `${coords.left - r.left + scroller.scrollLeft}px`;
      caret.style.top = `${coords.top - r.top + scroller.scrollTop}px`;
      caret.style.height = `${Math.max(12, coords.bottom - coords.top)}px`;
    };
    const move = (e) => {
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
      if (!dragging) { dragging = true; box.classList.add('moving'); view.dom.classList.add('mm-image-moving'); }
      place(e);
    };
    const up = (e) => {
      img.removeEventListener('pointermove', move);
      img.removeEventListener('pointerup', up);
      img.removeEventListener('pointercancel', up);
      caret?.remove();
      box.classList.remove('moving');
      view.dom.classList.remove('mm-image-moving');
      if (!dragging) {
        if (e.type === 'pointerup') { view.dispatch({ selection: { anchor: range.to }, scrollIntoView: false }); view.focus(); }
        return;
      }
      if (e.type !== 'pointerup' || target == null) return;
      moveEmbed(view, range, target);
    };
    img.addEventListener('pointermove', move);
    img.addEventListener('pointerup', up);
    img.addEventListener('pointercancel', up);
  });
}

/** Moves the embed text `range` to `pos` in one transaction; a line left empty goes with it. */
export function moveEmbed(view, range, pos) {
  const { state } = view;
  if (pos >= range.from && pos <= range.to) return false;
  const text = state.doc.sliceString(range.from, range.to);
  const line = state.doc.lineAt(range.from);
  let from = range.from;
  let to = range.to;
  if (line.text.trim() === text && line.to >= range.to) {
    // The embed was alone on its line: take the whole line (and one line break) unless the drop is inside it.
    if (line.to < state.doc.length) { from = line.from; to = line.to + 1; } else if (line.from > 0) { from = line.from - 1; to = line.to; }
    // Between two blank lines (a paragraph of its own): one of the blank lines goes too.
    const blank = (n) => n >= 1 && n <= state.doc.lines && state.doc.line(n).text.trim() === '';
    if (to === line.to + 1 && blank(line.number + 1) && (line.number === 1 || blank(line.number - 1)) && line.number + 1 < state.doc.lines) to = state.doc.line(line.number + 1).to + 1;
    if (pos > from && pos < to) { from = range.from; to = range.to; }
  }
  const target = state.doc.lineAt(pos);
  // On an empty line or at a line edge the picture gets a line of its own; inside text it goes inline.
  let insert = text;
  if (target.text.trim() !== '') {
    if (pos === target.from) insert = `${text}\n`;
    else if (pos === target.to) insert = `\n${text}`;
  }
  const changes = state.changes([{ from, to, insert: '' }, { from: pos, insert }].sort((a, b) => a.from - b.from));
  view.dispatch({ changes, userEvent: 'move.drop' });
  return true;
}

function resolveImage(view, path) {
  if (EXTERNAL.test(path)) return Promise.resolve(path);
  const ctx = contextOf(view);
  if (!ctx.resolveResource) return Promise.resolve(null);
  ctx.imageCache ??= new Map();
  if (!ctx.imageCache.has(path)) {
    const pending = Promise.resolve().then(() => ctx.resolveResource(path)).catch(() => null);
    ctx.imageCache.set(path, pending);
    pending.then((url) => { if (!url) ctx.imageCache.delete(path); });
  }
  return ctx.imageCache.get(path);
}

// ───────────────────────── helpers

/** Line numbers the selection touches (those lines show their Markdown). */
export function activeLines(state) {
  const lines = new Set();
  for (const range of state.selection.ranges) {
    const a = state.doc.lineAt(range.from).number;
    const b = state.doc.lineAt(range.to).number;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  return lines;
}

const children = (node, name) => {
  const out = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (!name || child.name === name) out.push(child);
  return out;
};

const LINK_PARENTS = new Set(['Link', 'Image', 'Autolink']);

/**
 * The link or tag at a document position: { kind: 'wiki'|'embed'|'link'|'image'|'url'|'tag', target,
 * subpath, external, tag, text, from, to } or null.
 */
export function linkAt(state, pos) {
  const tree = syntaxTree(state);
  for (const side of [1, -1]) {
    for (let node = tree.resolveInner(pos, side); node; node = node.parent) {
      const info = linkInfo(state, node);
      if (info) return info;
    }
  }
  return null;
}

function linkInfo(state, node) {
  const text = (a, b) => state.doc.sliceString(a, b);
  const { from, to } = node;
  switch (node.name) {
    case 'WikiLink':
    case 'Embed': {
      const open = node.name === 'Embed' ? 3 : 2;
      const parts = splitWikiLink(text(from + open, to - 2));
      return { kind: node.name === 'Embed' ? 'embed' : 'wiki', target: parts.target, subpath: parts.subpath, alias: parts.alias, external: undefined, text: parts.alias || parts.target, from, to };
    }
    case 'Link':
    case 'Image': {
      const url = node.getChild('URL');
      if (!url) return null;
      const parts = splitUrl(text(url.from, url.to));
      const marks = node.getChildren('LinkMark');
      const label = marks.length >= 2 ? text(marks[0].to, marks[1].from) : '';
      return { kind: node.name === 'Image' ? 'image' : 'link', ...parts, text: label, from, to };
    }
    case 'URL':
    case 'Autolink': {
      if (node.name === 'URL' && node.parent && LINK_PARENTS.has(node.parent.name)) return null;
      const urlNode = node.name === 'Autolink' ? node.getChild('URL') : node;
      if (!urlNode) return null;
      let url = text(urlNode.from, urlNode.to);
      if (/^www\./i.test(url)) url = `https://${url}`;
      else if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && url.includes('@')) url = `mailto:${url}`;
      return { kind: 'url', target: url, subpath: '', external: url, text: url, from, to };
    }
    case 'Hashtag':
      return { kind: 'tag', tag: text(from + 1, to), target: undefined, from, to };
    default:
      return null;
  }
}

// ───────────────────────── decorations

const hidden = Decoration.replace({});

function buildDecorations(view) {
  const { state } = view;
  const { doc } = state;
  const ctx = contextOf(state);
  const active = activeLines(state);
  const tree = syntaxTree(state);
  const out = [];
  const lineDeco = new Map();
  const seen = new Set();
  const lineNo = (pos) => doc.lineAt(pos).number;
  const isActive = (pos) => active.has(lineNo(pos));
  const addLine = (pos, cls, attrs) => {
    const line = doc.lineAt(pos);
    let entry = lineDeco.get(line.from);
    if (!entry) lineDeco.set(line.from, (entry = { classes: new Set(), attrs: {} }));
    for (const c of cls.split(' ')) if (c) entry.classes.add(c);
    if (attrs) Object.assign(entry.attrs, attrs);
  };
  const eachLine = (from, to, fn) => {
    for (let n = lineNo(from), last = lineNo(to); n <= last; n++) fn(doc.line(n), n, last);
  };
  const hide = (from, to) => { if (to > from) out.push(hidden.range(from, to)); };
  const mark = (from, to, spec) => { if (to > from) out.push(Decoration.mark(spec).range(from, to)); };
  const widget = (pos, w, side = 1) => out.push(Decoration.widget({ widget: w, side }).range(pos));
  const replace = (from, to, w) => out.push(Decoration.replace({ widget: w }).range(from, to));
  const spaceAfter = (pos) => (doc.sliceString(pos, pos + 1) === ' ' ? 1 : 0);
  const imageUnder = (pos, path, opts) => widget(doc.lineAt(pos).to, new ImageWidget(path, opts.width, opts.height, opts.text, opts.align), 1);
  const resolved = (target) => {
    if (!target || !ctx.resolveLink) return true;
    try { return ctx.resolveLink(target, ctx.path) != null; } catch { return true; }
  };
  const linkTitle = t('editor.link.open');

  const enter = (ref) => {
    const node = ref.node;
    const { name, from, to } = ref;
    switch (name) {
      case 'FrontMatter': {
        if (seen.has(`fm${from}`)) return false;
        seen.add(`fm${from}`);
        let fmActive = false;
        // A note opens with the cursor on line 1: the YAML only shows while the editor really is in it.
        if (view.hasFocus) for (let n = lineNo(from), last = lineNo(to); n <= last; n++) if (active.has(n)) { fmActive = true; break; }
        if (!fmActive && lineNo(to) > lineNo(from)) {
          // Collapsed: the opening fence becomes the chip, the other lines are hidden (back as soon as the cursor enters).
          let count = 0;
          eachLine(from, to, (line, n) => { if (n !== lineNo(from) && /^[\p{L}\p{N}_-]+:/u.test(line.text)) count += 1; });
          const first = doc.lineAt(from);
          addLine(first.from, 'cm-mm-props-line');
          replace(first.from, first.to, new PropertiesChipWidget(count));
          eachLine(from, to, (line, n) => { if (n !== first.number) addLine(line.from, 'cm-mm-fm-collapsed'); });
          return false;
        }
        eachLine(from, to, (line, n, last) => {
          addLine(line.from, `cm-mm-frontmatter${n === lineNo(from) ? ' cm-mm-frontmatter-begin' : ''}${n === last ? ' cm-mm-frontmatter-end' : ''}`);
          const key = /^([\p{L}\p{N}_-]+):/u.exec(line.text);
          if (key) mark(line.from, line.from + key[1].length, { class: 'cm-mm-fmkey' });
        });
        return false;
      }
      case 'FencedCode': {
        if (seen.has(`fc${from}`)) return false;
        seen.add(`fc${from}`);
        const first = lineNo(from);
        const lastLine = lineNo(to);
        let blockActive = false;
        for (let n = first; n <= lastLine; n++) if (active.has(n)) { blockActive = true; break; }
        eachLine(from, to, (line, n, last) => addLine(line.from, `cm-mm-codeblock${n === first ? ' cm-mm-codeblock-begin' : ''}${n === last ? ' cm-mm-codeblock-end' : ''}`));
        if (!blockActive) {
          const info = node.getChild('CodeInfo');
          const lang = info ? doc.sliceString(info.from, info.to).trim().split(/\s/)[0] : '';
          const head = doc.line(first);
          replace(from, head.to, new CodeLabelWidget(lang));
          const marks = node.getChildren('CodeMark');
          if (marks.length > 1 && lastLine > first) {
            const close = marks[marks.length - 1];
            const tail = doc.line(lastLine);
            if (close.from >= tail.from) hide(tail.from, tail.to);
          }
        }
        return false;
      }
      case 'BlockMath': {
        eachLine(from, to, (line) => addLine(line.from, 'cm-mm-mathblock'));
        return false;
      }
      case 'Blockquote': {
        if (node.parent?.name === 'Blockquote' || seen.has(`bq${from}`)) return true;
        seen.add(`bq${from}`);
        const head = doc.lineAt(from);
        const callout = /^(\s*>\s*)\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/.exec(head.text);
        if (callout) {
          const type = calloutType(callout[2]);
          eachLine(from, to, (line, n, last) => addLine(line.from, `cm-mm-callout${n === head.number ? ' cm-mm-callout-title' : ''}${n === last ? ' cm-mm-callout-last' : ''}`, { 'data-callout': type }));
          if (!active.has(head.number)) {
            const start = head.from + callout[1].length;
            const markEnd = start + 3 + callout[2].length + callout[3].length;
            const end = markEnd + spaceAfter(markEnd);
            replace(start, end, new CalloutWidget(type, callout[2], !callout[4].trim()));
          }
        } else {
          eachLine(from, to, (line) => addLine(line.from, 'cm-mm-quote'));
        }
        return true;
      }
      case 'QuoteMark':
        if (!isActive(from)) hide(from, to + spaceAfter(to));
        return false;
      case 'ATXHeading1': case 'ATXHeading2': case 'ATXHeading3': case 'ATXHeading4': case 'ATXHeading5': case 'ATXHeading6': {
        addLine(from, `cm-mm-h${name.slice(-1)}`);
        if (!isActive(from)) {
          const marks = node.getChildren('HeaderMark');
          if (marks[0]) hide(marks[0].from, Math.min(to, marks[0].to + spaceAfter(marks[0].to)));
          const closing = marks.length > 1 ? marks[marks.length - 1] : null;
          if (closing && closing.from > marks[0].to) {
            let a = closing.from;
            while (a > marks[0].to + 1 && doc.sliceString(a - 1, a) === ' ') a--;
            hide(a, closing.to);
          }
        }
        return true;
      }
      case 'SetextHeading1': case 'SetextHeading2': {
        addLine(from, `cm-mm-h${name.slice(-1)}`);
        const mk = node.getChild('HeaderMark');
        if (mk && !isActive(mk.from)) addLine(mk.from, 'cm-mm-table-sep');
        return true;
      }
      case 'Emphasis': case 'StrongEmphasis': case 'Strikethrough': case 'Highlight': {
        if (name === 'Highlight') mark(from, to, { class: 'cm-mm-highlight' });
        for (const child of children(node)) if (/Mark$/.test(child.name) && !isActive(child.from)) hide(child.from, child.to);
        return true;
      }
      case 'InlineCode': {
        if (isActive(from)) return false;
        mark(from, to, { class: 'cm-mm-code' });
        for (const child of node.getChildren('CodeMark')) hide(child.from, child.to);
        return false;
      }
      case 'InlineMath': {
        mark(from, to, { class: 'cm-mm-math' });
        if (!isActive(from)) for (const child of node.getChildren('MathMark')) hide(child.from, child.to);
        return false;
      }
      case 'Comment': case 'PercentComment':
        mark(from, to, { class: 'cm-mm-comment' });
        return false;
      case 'Link': {
        const url = node.getChild('URL');
        const marks = node.getChildren('LinkMark');
        if (!url || marks.length < 2 || isActive(from) || lineNo(from) !== lineNo(to)) return true;
        const href = doc.sliceString(url.from, url.to);
        const external = Boolean(splitUrl(href).external);
        hide(from, marks[0].to);
        hide(marks[1].from, to);
        mark(marks[0].to, marks[1].from, { class: `cm-mm-link${external ? ' external' : ''}`, attributes: { 'data-mm-href': href, title: `${href}\n${linkTitle}` } });
        return true;
      }
      case 'Image': {
        const url = node.getChild('URL');
        if (!url) return false;
        const marks = node.getChildren('LinkMark');
        const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : '';
        imageUnder(to, splitUrl(doc.sliceString(url.from, url.to)).target, imageOptions(alt));
        if (!isActive(from) && lineNo(from) === lineNo(to)) hide(from, to);
        return false;
      }
      case 'URL': {
        if (node.parent && LINK_PARENTS.has(node.parent.name)) return false;
        if (!isActive(from)) {
          const info = linkInfo(state, node);
          if (info) mark(from, to, { class: 'cm-mm-link external', attributes: { 'data-mm-href': info.external, title: `${info.external}\n${linkTitle}` } });
        }
        return false;
      }
      case 'Autolink': {
        const url = node.getChild('URL');
        if (!url || isActive(from)) return false;
        const info = linkInfo(state, node);
        hide(from, url.from);
        hide(url.to, to);
        mark(url.from, url.to, { class: 'cm-mm-link external', attributes: { 'data-mm-href': info?.external ?? '', title: linkTitle } });
        return false;
      }
      case 'WikiLink': case 'Embed': {
        const embed = name === 'Embed';
        const open = embed ? 3 : 2;
        const parts = splitWikiLink(doc.sliceString(from + open, to - 2));
        if (embed && IMAGE_EXT.test(parts.target)) {
          imageUnder(to, parts.target, imageOptions(parts.alias));
          if (!isActive(from)) hide(from, to);
          return false;
        }
        if (isActive(from)) return false;
        const alias = node.getChild('WikiAlias');
        const target = node.getChild('WikiTarget');
        const ok = resolved(parts.target);
        const cls = `cm-mm-link${ok ? '' : ' unresolved'}${embed ? ' embed' : ''}`;
        const attributes = { 'data-mm-wiki': parts.target, 'data-mm-sub': parts.subpath, title: ok ? linkTitle : t('editor.link.unresolved') };
        const shown = alias ?? target;
        if (!shown) return false;
        hide(from, shown.from);
        mark(shown.from, shown.to, { class: cls, attributes });
        hide(shown.to, to);
        return false;
      }
      case 'Hashtag':
        if (!isActive(from)) mark(from, to, { class: 'cm-mm-tag', attributes: { 'data-mm-tag': doc.sliceString(from + 1, to), title: t('editor.tag.open') } });
        return false;
      case 'ListMark': {
        if (isActive(from)) return false;
        const item = node.parent;
        const task = node.nextSibling?.name === 'Task' ? node.nextSibling : null;
        const marker = task?.getChild('TaskMarker');
        if (marker) {
          const state = doc.sliceString(marker.from + 1, marker.to - 1);
          const checked = state !== ' ';
          replace(from, marker.to + spaceAfter(marker.to), new CheckboxWidget(checked, state));
          if (checked) {
            addLine(from, 'cm-mm-task-done');
            const end = doc.lineAt(from).to;
            mark(marker.to + spaceAfter(marker.to), end, { class: 'cm-mm-task-text' });
          }
          return false;
        }
        if (item?.parent?.name === 'BulletList') {
          let level = 0;
          for (let p = item.parent; p; p = p.parent) if (p.name === 'BulletList' || p.name === 'OrderedList') level++;
          replace(from, to, new BulletWidget(Math.max(0, level - 1)));
        }
        return false;
      }
      case 'HorizontalRule':
        if (!isActive(from)) replace(from, to, new RuleWidget());
        return false;
      case 'Table': {
        eachLine(from, to, (line, n) => addLine(line.from, `cm-mm-table${n === lineNo(from) + 1 ? ' cm-mm-table-sep' : ''}`));
        return true;
      }
      case 'TableDelimiter':
        mark(from, to, { class: 'cm-mm-table-pipe' });
        return false;
      case 'Escape':
        if (!isActive(from)) hide(from, from + 1);
        return false;
      default:
        return true;
    }
  };

  for (const { from, to } of view.visibleRanges) tree.iterate({ from, to, enter });
  for (const [pos, entry] of lineDeco) {
    out.push(Decoration.line({ class: [...entry.classes].join(' '), attributes: entry.attrs }).range(pos));
  }
  return Decoration.set(out, true);
}

// Source mode keeps the text raw; only blocks get their tint / monospace lines.
const SOURCE_BLOCKS = { FencedCode: 'cm-mm-codeblock', FrontMatter: 'cm-mm-frontmatter', BlockMath: 'cm-mm-mathblock', Table: 'cm-mm-table' };

function buildSourceBlocks(view) {
  const { doc } = view.state;
  const tree = syntaxTree(view.state);
  const lines = new Map();
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter: (ref) => {
        const cls = SOURCE_BLOCKS[ref.name];
        if (!cls) return !/^(Paragraph|ATXHeading\d|SetextHeading\d|HTMLBlock)$/.test(ref.name);
        const first = doc.lineAt(ref.from).number;
        const last = doc.lineAt(ref.to).number;
        for (let n = first; n <= last; n++) {
          const extra = cls === 'cm-mm-table' ? '' : `${n === first ? ` ${cls}-begin` : ''}${n === last ? ` ${cls}-end` : ''}`;
          lines.set(doc.line(n).from, cls + extra);
        }
        return false;
      },
    });
  }
  return Decoration.set([...lines].map(([pos, cls]) => Decoration.line({ class: cls }).range(pos)), true);
}

/** Mode 'source': block lines only (code, front matter, math, tables). */
export const sourceBlocks = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = buildSourceBlocks(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = buildSourceBlocks(update.view);
  }
}, { decorations: (plugin) => plugin.decorations });

/** The live preview view plugin (mode 'live'). */
export const livePreview = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = safeBuild(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged
      || syntaxTree(update.startState) !== syntaxTree(update.state)
      || update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshLivePreview)))) {
      this.decorations = safeBuild(update.view);
    }
  }
}, { decorations: (plugin) => plugin.decorations });

function safeBuild(view) {
  try {
    return buildDecorations(view);
  } catch (error) {
    console.error('[editor] live preview', error);
    return Decoration.none;
  }
}

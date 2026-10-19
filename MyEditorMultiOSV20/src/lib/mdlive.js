// Markdown WYSIWYG ("live") editing inside CodeMirror.
//
// The document stays plain Markdown, but the syntax is rendered in place:
// heading marks, emphasis / code / strikethrough marks, link targets and
// quote marks are hidden, list bullets become "•", task boxes become real
// (clickable) checkboxes, horizontal rules become lines and fenced code gets
// a box. The line(s) the cursor is on show the raw syntax again, so every
// mark stays editable — the Typora / Obsidian "live preview" behaviour.
//
// Images — "![alt](src)" and "<img src alt width>" — are always shown as the
// image itself, never as their syntax (local paths are resolved against the
// document's folder, see imageBase / ../lib/images.js); the range is atomic,
// so the cursor steps over it and Backspace / Delete remove it whole. A
// handle at the bottom-right corner resizes the image; the result is written
// back as an <img … width="N"> tag, the one form of a sized image every
// Markdown renderer understands.
//
// Colours (headings, bold, italic…) come from the highlight style in
// ./editor.js; the H1–H6 sizes and the inline-code box are applied here, so
// the source view (WYSIWYG off) stays uniform monospace.
import { ViewPlugin, Decoration, WidgetType, EditorView } from '@codemirror/view';
import { Facet } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { resolveImageSrc } from './images';

// The folder relative image paths are resolved against (the document's folder).
export const imageBase = Facet.define({ combine: (v) => v[0] || '' });

const IMG_TAG = /^<img\s[^>]*>$/i;
const attrOf = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[2] ?? m[3] ?? m[4]) : null; };
const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const imgTag = (src, alt, width) => `<img src="${escAttr(src)}" alt="${escAttr(alt)}"${width ? ` width="${Math.round(width)}"` : ''}>`;

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'md-bullet'; s.textContent = '•'; return s; }
  ignoreEvent() { return false; }
}

class CheckWidget extends WidgetType {
  constructor(checked, pos) { super(); this.checked = checked; this.pos = pos; }
  eq(o) { return o.checked === this.checked && o.pos === this.pos; }
  toDOM(view) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'md-check';
    input.checked = this.checked;
    // The marker is "[ ]" / "[x]" starting at `pos`: flip the middle character.
    input.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return input;
  }
  ignoreEvent() { return false; }
}

class HrWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'md-hr'; return s; }
}

// The image itself. `from`/`to` is the syntax it stands for (updated in place
// on every rebuild, see updateDOM); dragging the handle rewrites that range.
class ImageWidget extends WidgetType {
  constructor(src, alt, width, from, to) { super(); this.src = src; this.alt = alt; this.width = width; this.from = from; this.to = to; }
  eq(o) { return o.src === this.src && o.alt === this.alt && o.width === this.width; }
  // Same picture at a new position: keep the element, only refresh the range it stands for.
  updateDOM(dom) { const prev = dom.__mdImage; if (!prev || !this.eq(prev)) return false; dom.__mdImage = this; return true; }
  get estimatedHeight() { return this.width ? this.width * 0.6 : 120; }
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'md-image';
    wrap.__mdImage = this;
    const img = document.createElement('img');
    img.alt = this.alt;
    img.title = this.alt;
    img.draggable = false;
    if (this.width) img.style.width = `${this.width}px`;
    resolveImageSrc(this.src, view.state.facet(imageBase)).then((u) => { img.src = u; }).catch(() => { wrap.classList.add('broken'); });
    const handle = document.createElement('span');
    handle.className = 'md-image-handle';
    handle.title = 'Drag to resize';
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const x0 = e.clientX, w0 = Math.round(img.getBoundingClientRect().width);
      let w = w0;
      wrap.classList.add('resizing');
      const move = (ev) => { w = Math.max(24, Math.round(w0 + ev.clientX - x0)); img.style.width = `${w}px`; };
      const up = () => {
        window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
        wrap.classList.remove('resizing');
        const cur = wrap.__mdImage || this;
        if (w !== w0) view.dispatch({ changes: { from: cur.from, to: cur.to, insert: imgTag(cur.src, cur.alt, w) } });
      };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    wrap.append(img, handle);
    return wrap;
  }
  ignoreEvent(e) { return e.target && e.target.classList && e.target.classList.contains('md-image-handle'); }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const hrDeco = Decoration.replace({ widget: new HrWidget() });
const inlineCode = Decoration.mark({ class: 'md-inline-code' });
const quoteLine = Decoration.line({ class: 'md-quote-line' });
const codeLine = Decoration.line({ class: 'md-code-line' });
const codeFenceLine = Decoration.line({ class: 'md-code-line md-code-fence' });
const headingLine = (n) => Decoration.line({ class: `md-heading-line md-h${n}` });

function build(view) {
  const { state } = view;
  const tree = syntaxTree(state);
  const decos = [];
  const doc = state.doc;
  const images = [];   // the image ranges, also served as atomic ranges

  // An image at [from, to) is the picture, whether the cursor is on its line or not.
  const addImage = (from, to, src, alt, width) => {
    const deco = Decoration.replace({ widget: new ImageWidget(src, alt, width, from, to) });
    decos.push(deco.range(from, to));
    images.push(deco.range(from, to));
  };

  // Lines touched by the selection show their raw syntax.
  const cursorLines = new Set();
  for (const r of state.selection.ranges) {
    const a = doc.lineAt(r.from).number, b = doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) cursorLines.add(n);
  }
  const revealed = (from, to) => {
    const a = doc.lineAt(from).number, b = doc.lineAt(Math.min(to, doc.length)).number;
    for (let n = a; n <= b; n++) if (cursorLines.has(n)) return true;
    return false;
  };
  const eachLine = (from, to, fn) => {
    const a = doc.lineAt(from).number, b = doc.lineAt(Math.min(to, doc.length)).number;
    for (let n = a; n <= b; n++) fn(doc.line(n));
  };
  const lineDecoSeen = new Set();
  const addLine = (line, deco) => { const key = `${line.from}:${deco.spec.class}`; if (!lineDecoSeen.has(key)) { lineDecoSeen.add(key); decos.push(deco.range(line.from)); } };

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter: (node) => {
        const name = node.name;
        const parent = node.node.parent;
        switch (name) {
          case 'ATXHeading1': case 'ATXHeading2': case 'ATXHeading3': case 'ATXHeading4': case 'ATXHeading5': case 'ATXHeading6':
            addLine(doc.lineAt(node.from), headingLine(Number(name.slice(-1))));
            break;
          case 'SetextHeading1': case 'SetextHeading2':
            eachLine(node.from, node.to, (l) => addLine(l, headingLine(Number(name.slice(-1)))));
            break;
          case 'HeaderMark': {
            if (!parent || revealed(parent.from, parent.to)) break;
            // "# " (ATX) — hide the marks and the following space; the Setext
            // underline ("===" / "---") is hidden entirely.
            const isAtx = /^ATX/.test(parent.name);
            const end = isAtx ? Math.min(node.to + 1, parent.to) : node.to;
            if (isAtx && node.from < node.to && node.from === parent.from) decos.push(hide.range(node.from, end));
            else if (isAtx) decos.push(hide.range(Math.max(node.from - 1, parent.from), node.to));   // closing "#"s
            else decos.push(hide.range(node.from, node.to));
            break;
          }
          case 'InlineCode':
            decos.push(inlineCode.range(node.from, node.to));
            break;
          case 'EmphasisMark': case 'CodeMark': case 'StrikethroughMark':
            if (!parent || revealed(parent.from, parent.to)) break;
            if (name === 'CodeMark' && parent.name === 'FencedCode') break;   // handled below
            decos.push(hide.range(node.from, node.to));
            break;
          case 'FencedCode': {
            eachLine(node.from, node.to, (l) => addLine(l, codeLine));
            const first = doc.lineAt(node.from), last = doc.lineAt(node.to);
            addLine(first, codeFenceLine);
            if (last.number !== first.number) addLine(last, codeFenceLine);
            if (!revealed(node.from, node.to)) {
              // Hide the fences ("```lang") but keep their lines as the box's top / bottom padding.
              decos.push(hide.range(first.from, first.to));
              if (last.number !== first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text)) decos.push(hide.range(last.from, last.to));
            }
            break;
          }
          case 'Link': {
            if (revealed(node.from, node.to)) break;
            // "[text](url)" → "text".
            let cur = node.node.firstChild;
            while (cur) {
              if (cur.name === 'LinkMark' || cur.name === 'URL' || cur.name === 'LinkTitle') decos.push(hide.range(cur.from, cur.to));
              cur = cur.nextSibling;
            }
            break;
          }
          case 'Image': {
            // "![alt](src)" → the image.
            const urlNode = node.node.getChild('URL');
            const src = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : '';
            // The alt text is not a node of its own: it is what lies between the first two marks ("![" and "]").
            const marks = node.node.getChildren('LinkMark');
            const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : '';
            if (!src) break;
            addImage(node.from, node.to, src, alt.trim(), null);
            return false;
          }
          case 'HTMLTag': case 'HTMLBlock': {
            const text = doc.sliceString(node.from, node.to).trim();
            if (!IMG_TAG.test(text)) break;
            const src = attrOf(text, 'src');
            if (!src) break;
            const w = Number(attrOf(text, 'width')) || null;
            addImage(node.from, node.to, src, attrOf(text, 'alt') || '', w);
            return false;
          }
          case 'ListMark': {
            if (!parent) break;
            const list = parent.parent;
            if (revealed(node.from, node.to)) break;
            if (list && list.name === 'BulletList') {
              // A task item keeps its checkbox widget (see TaskMarker); the "-" becomes a bullet otherwise.
              const item = parent;
              const task = item.getChild('Task');
              if (!task) decos.push(bullet.range(node.from, node.to));
              else decos.push(hide.range(node.from, Math.min(node.to + 1, item.to)));
            }
            break;
          }
          case 'TaskMarker': {
            if (revealed(node.from, node.to)) break;
            const checked = /x/i.test(doc.sliceString(node.from, node.to));
            decos.push(Decoration.replace({ widget: new CheckWidget(checked, node.from) }).range(node.from, node.to));
            break;
          }
          case 'Blockquote':
            eachLine(node.from, node.to, (l) => addLine(l, quoteLine));
            break;
          case 'QuoteMark':
            if (!parent || revealed(node.from, node.to)) break;
            decos.push(hide.range(node.from, Math.min(node.to + 1, doc.lineAt(node.from).to)));
            break;
          case 'HorizontalRule':
            if (!revealed(node.from, node.to)) decos.push(hrDeco.range(node.from, node.to));
            break;
          default: break;
        }
      },
    });
  }
  return { decorations: Decoration.set(decos, true), images: Decoration.set(images, true) };
}

export const markdownLive = [
  ViewPlugin.fromClass(class {
    constructor(view) { Object.assign(this, build(view)); }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || syntaxTree(u.state) !== syntaxTree(u.startState)) Object.assign(this, build(u.view));
    }
  }, { decorations: (v) => v.decorations, provide: (plugin) => EditorView.atomicRanges.of((view) => { const v = view.plugin(plugin); return v ? v.images : Decoration.none; }) }),
  EditorView.baseTheme({
    '.md-bullet': { color: 'var(--accent)', fontWeight: 'bold' },
    '.md-check': { verticalAlign: '-2px', margin: '0 6px 0 0', accentColor: 'var(--accent)' },
    '.md-hr': { display: 'inline-block', width: '100%', borderTop: '2px solid var(--border-strong)', verticalAlign: 'middle' },
    '.md-quote-line': { borderLeft: '3px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', paddingLeft: '10px !important' },
    '.md-code-line': { background: 'color-mix(in srgb, var(--fg) 6%, transparent)' },
    '.md-code-fence': { background: 'color-mix(in srgb, var(--fg) 10%, transparent)' },
    '.md-heading-line': { paddingTop: '2px', paddingBottom: '2px' },
    '.md-h1': { fontSize: '1.6em' }, '.md-h2': { fontSize: '1.4em' }, '.md-h3': { fontSize: '1.25em' }, '.md-h4': { fontSize: '1.12em' }, '.md-h5': { fontSize: '1.05em' }, '.md-h6': { fontSize: '1em' },
    '.md-h1, .md-h2': { borderBottom: '1px solid var(--border)' },
    '.md-inline-code': { background: 'color-mix(in srgb, var(--fg) 9%, transparent)', borderRadius: '3px', padding: '0 2px' },
    '.md-image': { position: 'relative', display: 'inline-block', maxWidth: '100%', verticalAlign: 'bottom', lineHeight: '0' },
    '.md-image img': { maxWidth: '100%', height: 'auto', borderRadius: '3px', minWidth: '24px', minHeight: '16px' },
    '.md-image.broken img': { minHeight: '24px', background: 'color-mix(in srgb, var(--danger) 15%, transparent)', outline: '1px dashed var(--danger)' },
    '.md-image .md-image-handle': { position: 'absolute', right: '-2px', bottom: '-2px', width: '12px', height: '12px', border: '2px solid var(--accent)', borderRadius: '3px', background: 'var(--bg)', cursor: 'nwse-resize', opacity: '0' },
    '.md-image:hover .md-image-handle, .md-image.resizing .md-image-handle': { opacity: '1' },
    '.md-image.resizing img': { outline: '1px solid var(--accent)' },
  }),
];

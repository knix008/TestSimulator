// Markdown WYSIWYG ("live") editing inside CodeMirror.
//
// The document stays plain Markdown, but the syntax is rendered in place:
// heading marks, emphasis / code / strikethrough marks, link targets and
// quote marks are hidden, list bullets become "•", task boxes become real
// (clickable) checkboxes, horizontal rules become lines and fenced code gets
// a box. The line(s) the cursor is on show the raw syntax again, so every
// mark stays editable — the Typora / Obsidian "live preview" behaviour.
//
// Colours and sizes (headings H1–H6, bold, italic…) come from the highlight
// style in ./editor.js; this module only decides what is shown.
import { ViewPlugin, Decoration, WidgetType, EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

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

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const hrDeco = Decoration.replace({ widget: new HrWidget() });
const quoteLine = Decoration.line({ class: 'md-quote-line' });
const codeLine = Decoration.line({ class: 'md-code-line' });
const codeFenceLine = Decoration.line({ class: 'md-code-line md-code-fence' });
const headingLine = (n) => Decoration.line({ class: `md-heading-line md-h${n}` });

function build(view) {
  const { state } = view;
  const tree = syntaxTree(state);
  const decos = [];
  const doc = state.doc;

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
          case 'Link': case 'Image': {
            if (revealed(node.from, node.to)) break;
            // "[text](url)" → "text"; "![alt](url)" → "alt" with an image mark.
            const c = node.node.firstChild;
            let cur = c;
            while (cur) {
              if (cur.name === 'LinkMark' || cur.name === 'URL' || cur.name === 'LinkTitle') decos.push(hide.range(cur.from, cur.to));
              cur = cur.nextSibling;
            }
            break;
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
  return Decoration.set(decos, true);
}

export const markdownLive = [
  ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = build(view); }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || syntaxTree(u.state) !== syntaxTree(u.startState)) this.decorations = build(u.view);
    }
  }, { decorations: (v) => v.decorations }),
  EditorView.baseTheme({
    '.md-bullet': { color: 'var(--accent)', fontWeight: 'bold' },
    '.md-check': { verticalAlign: '-2px', margin: '0 6px 0 0', accentColor: 'var(--accent)' },
    '.md-hr': { display: 'inline-block', width: '100%', borderTop: '2px solid var(--border-strong)', verticalAlign: 'middle' },
    '.md-quote-line': { borderLeft: '3px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', paddingLeft: '10px !important' },
    '.md-code-line': { background: 'color-mix(in srgb, var(--fg) 6%, transparent)' },
    '.md-code-fence': { background: 'color-mix(in srgb, var(--fg) 10%, transparent)' },
    '.md-heading-line': { paddingTop: '2px', paddingBottom: '2px' },
    '.md-h1, .md-h2': { borderBottom: '1px solid var(--border)' },
  }),
];

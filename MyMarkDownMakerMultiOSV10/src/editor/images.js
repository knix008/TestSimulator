// Pictures in the editor: every Markdown picture `![caption](src "w=60%")` is shown as the picture itself,
// inline, and behaves like one character (the caret steps over it, Backspace deletes it whole). The corner
// handle resizes it with the mouse (the size goes into the Markdown as w=NN% of the page width), a
// right-click opens the picture's own menu, and pictures can be dropped in from outside.
//
//   pictureExtension({ resolve(src) → displayable URL, onResize(pos, percent), onContext(event, pos),
//                      onDropFiles(files, pos) })
import { Decoration, EditorView, MatchDecorator, ViewPlugin, WidgetType } from '@codemirror/view';

const PICTURE = /!\[([^\]\n]*)\]\(\s*<?([^)\s"<>]+)>?\s*(?:"([^"\n]*)")?\s*\)/g;
const widthOf = (title) => { const m = /^\s*w=(\d{1,3})%\s*$/i.exec(title ?? ''); const n = m ? Number(m[1]) : 0; return n > 0 && n <= 100 ? n : 0; };
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|ico|avif)$/i;
export const isImageFile = (name) => IMAGE_FILE.test(String(name ?? ''));

class PictureWidget extends WidgetType {
  constructor(src, alt, width, hooks) {
    super();
    this.src = src;
    this.alt = alt;
    this.width = width;
    this.hooks = hooks;
  }

  eq(other) { return other.src === this.src && other.alt === this.alt && other.width === this.width; }

  toDOM(view) {
    const box = document.createElement('span');
    box.className = 'cm-picture';
    box.title = this.alt || this.src.slice(0, 80);
    const url = this.hooks.resolve(this.src);
    const img = document.createElement('img');
    img.alt = this.alt;
    img.draggable = false;
    const contentWidth = () => Math.max(120, view.contentDOM.clientWidth - 60);
    const apply = (percent) => {
      if (percent) { img.style.width = `${Math.round((contentWidth() * percent) / 100)}px`; img.style.maxHeight = 'none'; }
      else { img.style.width = ''; img.style.maxHeight = ''; }
    };
    if (url) img.src = url;
    else { box.classList.add('missing'); box.textContent = `🖼 ${this.alt || this.src}`; return box; }
    apply(this.width);
    const label = document.createElement('span');
    label.className = 'cm-picture-size';
    label.textContent = this.width ? `${this.width}%` : '';
    const grip = document.createElement('span');
    grip.className = 'cm-picture-grip';
    grip.title = this.hooks.gripTip ?? '';
    box.append(img, grip, label);
    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startW = img.getBoundingClientRect().width;
      let percent = this.width || Math.round((startW / contentWidth()) * 100);
      box.classList.add('resizing');
      try { grip.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
      const move = (e) => {
        percent = Math.max(10, Math.min(100, Math.round((((startW + (e.clientX - startX)) / contentWidth()) * 100) / 5) * 5));
        apply(percent);
        label.textContent = `${percent}%`;
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        box.classList.remove('resizing');
        if (percent !== this.width) this.hooks.onResize?.(view.posAtDOM(box), percent);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    box.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); this.hooks.onContext?.(event, view.posAtDOM(box)); });
    box.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.target === grip) return;
      // A click selects the picture (as one character), so Delete removes it and typing replaces it.
      event.preventDefault();
      const pos = view.posAtDOM(box);
      const end = view.state.doc.lineAt(pos).text.slice(pos - view.state.doc.lineAt(pos).from).match(/^!\[[^\]\n]*\]\([^)\n]*\)/)?.[0].length ?? 0;
      view.dispatch({ selection: { anchor: pos, head: pos + end } });
      view.focus();
    });
    return box;
  }

  ignoreEvent() { return true; }
}

export function pictureExtension(hooks) {
  const matcher = new MatchDecorator({
    regexp: PICTURE,
    decoration: (match) => Decoration.replace({ widget: new PictureWidget(match[2], match[1], widthOf(match[3]), hooks) }),
  });
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = matcher.createDeco(view); }
    update(update) { this.decorations = matcher.updateDeco(update, this.decorations); }
  }, {
    decorations: (instance) => instance.decorations,
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
  });
  const drop = EditorView.domEventHandlers({
    dragover: (event) => { if ([...(event.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) { event.preventDefault(); return true; } return false; },
    drop: (event, view) => {
      const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/') || isImageFile(f.name));
      if (!files.length) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      hooks.onDropFiles?.(files, pos);
      return true;
    },
  });
  return [plugin, drop];
}

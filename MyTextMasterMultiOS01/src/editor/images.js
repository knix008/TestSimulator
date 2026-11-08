// Pictures in the Markdown source, shown like characters: after each ![alt](src) of the visible
// text the picture itself appears in the line (small, at most 160 px high). Deleting the text
// deletes the picture. `resolve(src)` turns a relative path into a URL the page can load.
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';

const IMAGE = /!\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_IMG = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

class PictureWidget extends WidgetType {
  constructor(src, alt, resolve) { super(); this.src = src; this.alt = alt; this.resolve = resolve; }
  eq(other) { return other.src === this.src && other.alt === this.alt; }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-inline-image';
    const img = document.createElement('img');
    img.alt = this.alt;
    img.title = this.src;
    img.draggable = false;
    img.addEventListener('error', () => wrap.classList.add('broken'));
    Promise.resolve(this.resolve(this.src)).then((url) => { img.src = url; }).catch(() => wrap.classList.add('broken'));
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() { return false; }
}

/** The extension; `resolve(src) → url | Promise<url>`. */
export function inlineImages(resolve) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(update) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view); }
    build(view) {
      const builder = new RangeSetBuilder();
      const found = [];
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.sliceDoc(from, to);
        for (const m of text.matchAll(IMAGE)) found.push({ at: from + m.index + m[0].length, src: m[2], alt: m[1] });
        for (const m of text.matchAll(HTML_IMG)) found.push({ at: from + m.index + m[0].length, src: m[1], alt: '' });
      }
      found.sort((a, b) => a.at - b.at);
      for (const f of found) builder.add(f.at, f.at, Decoration.widget({ widget: new PictureWidget(f.src, f.alt, resolve), side: 1 }));
      return builder.finish();
    }
  }, { decorations: (plugin) => plugin.decorations });
}

/** Files that are pictures (by type or extension). */
export const isImageFile = (name, type = '') => /^image\//.test(type) || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(name);

/** The Markdown / HTML text that inserts a picture. */
export function imageMarkup(kind, src, alt) {
  const safeAlt = String(alt).replace(/[[\]]/g, '');
  const path = /\s/.test(src) && !src.startsWith('data:') ? `<${src}>` : src;
  return kind === 'html' ? `<img src="${src.replace(/"/g, '&quot;')}" alt="${safeAlt.replace(/"/g, '&quot;')}">` : `![${safeAlt}](${path})`;
}

/* The text editor laid over the canvas while a text shape is being typed.
 *
 * It is a contenteditable element whose content is one <span data-rt> per run of the shape
 * (paint.js "text runs"). Every span carries its style in data attributes, so reading what was
 * typed never depends on computed styles: a character typed inside a span belongs to that run.
 *
 * Changing the font with nothing selected applies from the caret onward: an empty span with
 * the new style is put at the caret, holding a zero-width space so the caret can sit inside
 * it, and what is typed next — including Hangul composed by the IME — goes into that span.
 * With characters selected, the change applies to exactly those characters.
 *
 *   RichText.attach(el)                      give el a `.value` (plain text) like a textarea
 *   RichText.render(el, runs, base, zoom)    rebuild the content from runs
 *   RichText.read(el, base)                  the runs as typed
 *   RichText.selection(el)                   { start, end } in characters, or null
 *   RichText.select(el, start, end)
 *   RichText.caretStyle(el, base)            the style the next typed character takes
 *   RichText.restyle(el, patch, base, zoom, fallback)  apply a change as described above
 */
(function (root, factory) {
  const api = factory(root.PaintEngine || (typeof require === "function" ? require("./paint") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintRichText = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Paint) {
  const ZW = "\u200B";
  const KEYS = ["fontFamily", "fontSize", "bold", "italic", "underline", "strike", "color"];

  function cssFamily(name) {
    return '"' + String(name || "Segoe UI").replace(/["\\]/g, "") + '", sans-serif';
  }

  function styleSpan(span, style, zoom) {
    span.setAttribute("data-rt", "");
    span.dataset.family = style.fontFamily;
    span.dataset.size = String(style.fontSize);
    span.dataset.bold = style.bold ? "1" : "0";
    span.dataset.italic = style.italic ? "1" : "0";
    span.dataset.underline = style.underline ? "1" : "0";
    span.dataset.strike = style.strike ? "1" : "0";
    span.dataset.color = style.color;
    span.style.fontFamily = cssFamily(style.fontFamily);
    span.style.fontSize = (style.fontSize * (zoom || 1)) + "px";
    span.style.fontWeight = style.bold ? "700" : "400";
    span.style.fontStyle = style.italic ? "italic" : "normal";
    span.style.textDecoration = [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none";
    span.style.color = style.color;
    return span;
  }

  function spanStyle(span, base) {
    if (!span) return Object.assign({}, base);
    return {
      fontFamily: span.dataset.family || base.fontFamily,
      fontSize: Number(span.dataset.size) || base.fontSize,
      bold: span.dataset.bold === "1",
      italic: span.dataset.italic === "1",
      underline: span.dataset.underline === "1",
      strike: span.dataset.strike === "1",
      color: span.dataset.color || base.color,
    };
  }

  function ownerSpan(node, el) {
    let at = node && node.nodeType === 3 ? node.parentNode : node;
    while (at && at !== el) {
      if (at.nodeType === 1 && at.hasAttribute("data-rt")) return at;
      at = at.parentNode;
    }
    return null;
  }

  function textNodes(el) {
    const out = [];
    const walk = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) out.push(node);
    return out;
  }

  function clean(text) { return String(text || "").split(ZW).join(""); }

  function read(el, base) {
    const runs = textNodes(el).map((node) => Object.assign({ text: clean(node.nodeValue).replace(/[\r\n]+/g, " ") }, spanStyle(ownerSpan(node, el), base)));
    return Paint ? Paint.normalizeRuns(runs, base) : runs.filter((run) => run.text);
  }

  function render(el, runs, base, zoom) {
    el.textContent = "";
    (runs || []).forEach((run) => {
      if (!run.text) return;
      const span = styleSpan(el.ownerDocument.createElement("span"), Object.assign({}, base, run), zoom);
      span.textContent = run.text;
      el.appendChild(span);
    });
  }

  /* A caret position (node, offset) as a character count, zero-width spaces not counted. */
  function offsetOf(el, node, offset) {
    if (node !== el && !el.contains(node)) return null;
    const range = el.ownerDocument.createRange();
    range.setStart(el, 0);
    range.setEnd(node, offset);
    return clean(range.toString()).length;
  }

  function selection(el) {
    const doc = el.ownerDocument;
    const sel = doc.getSelection ? doc.getSelection() : null;
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const inside = (node) => node === el || el.contains(node);
    if (!inside(range.startContainer) || !inside(range.endContainer)) return null;
    const a = offsetOf(el, range.startContainer, range.startOffset);
    const b = offsetOf(el, range.endContainer, range.endOffset);
    if (a == null || b == null) return null;
    return { start: Math.min(a, b), end: Math.max(a, b) };
  }

  /* Where character `offset` is, as a (text node, index) pair; zero-width spaces skipped. */
  function pointAt(el, offset, preferEnd) {
    const nodes = textNodes(el);
    let left = offset;
    for (let i = 0; i < nodes.length; i += 1) {
      const value = nodes[i].nodeValue;
      const visible = clean(value).length;
      if (left < visible || (left === visible && (preferEnd || i === nodes.length - 1))) {
        let index = 0;
        let seen = 0;
        while (index < value.length && (seen < left || value[index] === ZW)) {
          if (value[index] !== ZW) seen += 1;
          index += 1;
          if (seen === left && left === visible) break;
        }
        return { node: nodes[i], index: index };
      }
      left -= visible;
    }
    return null;
  }

  function select(el, start, end) {
    const doc = el.ownerDocument;
    const sel = doc.getSelection ? doc.getSelection() : null;
    if (!sel) return;
    const range = doc.createRange();
    const a = pointAt(el, start, true);
    const b = end === start ? a : pointAt(el, end, true);
    if (!a || !b) {
      range.selectNodeContents(el);
      range.collapse(false);
    } else {
      range.setStart(a.node, a.index);
      range.setEnd(b.node, b.index);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function caretStyle(el, base) {
    const doc = el.ownerDocument;
    const sel = doc.getSelection ? doc.getSelection() : null;
    const node = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    const runs = read(el, base);
    if (node && (node === el || el.contains(node))) {
      // the empty span that holds a style waiting for the next character
      const span = ownerSpan(node, el);
      if (span && clean(span.textContent) === "") return spanStyle(span, base);
      const at = selection(el);
      // over a selection, the style of its first character; at a caret, of the one before it
      return Paint.styleAt(runs, at ? (at.end > at.start ? at.start + 1 : at.start) : Infinity, base);
    }
    const pending = Array.from(el.querySelectorAll("[data-rt]")).filter((item) => clean(item.textContent) === "").pop();
    if (pending) return spanStyle(pending, base);
    return Paint.styleAt(runs, Infinity, base);
  }

  /* Apply a style change: to the selected characters, or from the caret onward. `fallback`
   * is where the caret is taken to be when the editor holds no selection (the end). */
  function restyle(el, patch, base, zoom, fallback) {
    const runs = read(el, base);
    const total = runs.reduce((sum, run) => sum + run.text.length, 0);
    const sel = selection(el) || { start: fallback == null ? total : fallback, end: fallback == null ? total : fallback };
    if (sel.end > sel.start) {
      const next = Paint.restyleRuns(runs, sel.start, sel.end, patch, base);
      render(el, next, base, zoom);
      select(el, sel.start, sel.end);
      return { mode: "range", runs: next, start: sel.start, end: sel.end };
    }
    const style = Object.assign({}, caretStyle(el, base), patch);
    // put the empty span at the caret, then the caret inside it after its zero-width space
    render(el, runs, base, zoom);
    const span = styleSpan(el.ownerDocument.createElement("span"), style, zoom);
    span.textContent = ZW;
    const at = pointAt(el, sel.start, true);
    if (!at) el.appendChild(span);
    else {
      const owner = ownerSpan(at.node, el);
      const tail = at.node.splitText(at.index);
      if (owner && owner.parentNode === el) {
        // split the run's span in two around the caret
        const after = owner.cloneNode(false);
        let next = tail;
        while (next) { const move = next; next = next.nextSibling; after.appendChild(move); }
        owner.after(after);
        owner.after(span);
        if (!clean(after.textContent)) after.remove();
      } else {
        tail.parentNode.insertBefore(span, tail);
      }
    }
    const doc = el.ownerDocument;
    const range = doc.createRange();
    range.setStart(span.firstChild, 1);
    range.collapse(true);
    const docSel = doc.getSelection();
    if (docSel) { docSel.removeAllRanges(); docSel.addRange(range); }
    return { mode: "caret", style: style, at: sel.start };
  }

  /* `.value` reads the plain text; setting it replaces the content with one run in the style
   * the editor carries (its data-* base), like typing into an empty textarea. */
  function attach(el, baseOf) {
    if (el.__richText) return el;
    el.__richText = true;
    Object.defineProperty(el, "value", {
      configurable: true,
      get() { return clean(el.textContent).replace(/[\r\n]+/g, " "); },
      set(text) {
        const base = baseOf();
        const style = el.__pending || base;
        render(el, text ? [Object.assign({ text: String(text) }, style)] : [], base, el.__zoom || 1);
      },
    });
    el.addEventListener("paste", (event) => {
      const data = event.clipboardData;
      const textValue = data ? data.getData("text/plain") : "";
      event.preventDefault();
      if (textValue) el.ownerDocument.execCommand("insertText", false, textValue.replace(/[\r\n]+/g, " "));
    });
    el.addEventListener("drop", (event) => event.preventDefault());
    return el;
  }

  return {
    ZW: ZW,
    KEYS: KEYS,
    attach: attach,
    render: render,
    read: read,
    selection: selection,
    select: select,
    caretStyle: caretStyle,
    restyle: restyle,
    styleSpan: styleSpan,
  };
});

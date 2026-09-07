import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { loadMedia, isMediaFile, readFileAsDataURL } from '../lib/media';

// A WYSIWYG-style editor: it renders the meeting notes Markdown as formatted
// HTML in a contentEditable surface, so the user edits the *interpreted* content
// directly (not raw Markdown). The stored model stays Markdown — on every edit
// the DOM is serialized back to Markdown via htmlToMarkdown() so the export
// pipeline and structure view keep working unchanged.
//
// The contentEditable is uncontrolled: innerHTML is only (re)set when a new
// document loads (docKey changes), never on keystrokes, so the caret is stable.
//
// Media (image / video / audio) is embedded as base64 data: URLs and serialized
// as raw HTML (<img>/<video>/<audio>) so a chosen display size survives the
// Markdown round-trip and every export stays self-contained. Images and video
// can be resized by dragging the handle on the selection overlay.

marked.setOptions({ gfm: true, breaks: false });

// Attributes we must preserve through sanitization for sized/controllable media.
const MEDIA_ATTR = ['type', 'checked', 'disabled', 'id', 'align', 'target', 'width', 'height', 'controls', 'style', 'controlslist'];

function renderMarkdown(md) {
  const html = marked.parse(md || '');
  return DOMPurify.sanitize(html, { ADD_ATTR: MEDIA_ATTR, ADD_TAGS: ['video', 'audio', 'source'] });
}

function caretRangeAtPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) { const r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); r.collapse(true); return r; }
  }
  return null;
}

// Build the HTML fragment for an embedded media descriptor from loadMedia().
function mediaMarkup({ kind, dataUrl, width }) {
  const w = width ? ` width="${width}"` : '';
  if (kind === 'video') return `<video src="${dataUrl}" controls${w}></video>`;
  if (kind === 'audio') return `<audio src="${dataUrl}" controls></audio>`;
  return `<img src="${dataUrl}" alt=""${w}>`;
}

export default function RichEditor({ markdown, docKey, placeholder, onChange, apiRef, onContextMenu, style }) {
  const ref = useRef(null);      // the contentEditable surface
  const wrapRef = useRef(null);  // positioned wrapper hosting the resize overlay
  const selRef = useRef(null);   // currently selected <img>/<video> element
  const [box, setBox] = useState(null); // overlay rect in wrapper coordinates
  const mdRef = useRef(markdown);
  mdRef.current = markdown;
  // Whether the surface has been edited since the model was last written.
  // Serializing an untouched document would round-trip it through
  // htmlToMarkdown() for nothing and quietly rewrite Markdown the renderer
  // understands but the serializer spells differently (setext headings,
  // reference links, _emphasis_ …). Switching to the Markdown view and back
  // must leave an untouched document byte-for-byte identical.
  const dirtyRef = useRef(false);

  // (Re)load the document when its identity changes (new / open / template).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = renderMarkdown(mdRef.current);
    if (el.innerHTML !== html) el.innerHTML = html;
    dirtyRef.current = false;
    selRef.current = null; setBox(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // Write the surface back into the Markdown model. A no-op unless something
  // actually changed, so blur / tab switches never rewrite the source.
  const serialize = () => {
    const el = ref.current;
    if (!el || !dirtyRef.current) return;
    dirtyRef.current = false;
    onChange(htmlToMarkdown(el));
  };

  // Mark the surface edited, then write it back.
  const touch = () => { dirtyRef.current = true; serialize(); };

  // Reposition the selection overlay over the currently selected media element.
  const updateBox = () => {
    const el = selRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap || !wrap.contains(el)) { selRef.current = null; setBox(null); return; }
    const ir = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    setBox({ left: ir.left - wr.left, top: ir.top - wr.top, width: ir.width, height: ir.height });
  };

  const clearSelection = () => { selRef.current = null; setBox(null); };

  const insertMedia = (info) => {
    const el = ref.current;
    if (!el || !info) return;
    el.focus();
    try { document.execCommand('insertHTML', false, mediaMarkup(info)); } catch { /* ignore */ }
    touch();
  };

  // Paste rich HTML from an external source (browser, Word, another editor):
  // sanitize it (drop scripts/styles, keep formatting/tables/links/media), insert
  // at the caret, then embed any non-data images so exports stay self-contained.
  const pasteRichHtml = (html) => {
    const el = ref.current;
    if (!el || !html) return;
    el.focus();
    try { document.execCommand('insertHTML', false, sanitizePasteHtml(html)); } catch { /* ignore */ }
    touch();
    embedForeignImages();
  };

  const insertPlainText = (text) => {
    const el = ref.current;
    if (!el || !text) return;
    el.focus();
    const html = attrEsc(text).replace(/\r?\n/g, '<br>');
    try { document.execCommand('insertHTML', false, html); } catch { /* ignore */ }
    touch();
  };

  // Best-effort: turn remote/blob <img> sources introduced by a paste into
  // embedded base64 so they survive save/export (CORS failures are left as-is).
  const embedForeignImages = async () => {
    const el = ref.current;
    if (!el) return;
    const imgs = Array.from(el.querySelectorAll('img'))
      .filter((im) => !/^data:/i.test(im.getAttribute('src') || ''));
    if (!imgs.length) return;
    let changed = false;
    for (const im of imgs) {
      try {
        const res = await fetch(im.src);
        const blob = await res.blob();
        if (!/^image\//.test(blob.type)) continue;
        im.setAttribute('src', await readFileAsDataURL(blob));
        changed = true;
      } catch { /* keep original src on failure */ }
    }
    if (changed) touch();
  };

  // Expose an imperative API for the formatting toolbar / context menu.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      el: () => ref.current,
      focus: () => ref.current?.focus(),
      cmd: (command, value) => {
        const el = ref.current; if (!el) return;
        el.focus();
        try { document.execCommand(command, false, value); } catch { /* ignore */ }
        touch();
      },
      insertHTML: (html) => {
        const el = ref.current; if (!el) return;
        el.focus();
        try { document.execCommand('insertHTML', false, html); } catch { /* ignore */ }
        touch();
      },
      insertMedia,
      pasteRichHtml,
      insertPlainText,
      selection: () => (window.getSelection ? window.getSelection().toString() : ''),
      serialize,
    };
    return () => { if (apiRef) apiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the overlay glued to its element while the editor scrolls / the window
  // resizes (only wired while something is selected).
  useEffect(() => {
    if (!box) return undefined;
    const onReflow = () => updateBox();
    const el = ref.current;
    el?.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      el?.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box]);

  // Prefer <p> paragraphs on Enter for clean serialization.
  const onFocus = () => { try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ } };

  // Select an image/video on click (so it can be resized); clear otherwise.
  const onClick = (e) => {
    const tag = e.target?.tagName;
    if (tag === 'IMG' || tag === 'VIDEO') { selRef.current = e.target; updateBox(); }
    else clearSelection();
  };

  const onInput = () => { touch(); updateBox(); };

  // Drag the bottom-right handle to resize the selected image/video (keeps aspect
  // ratio: only the width is set, height stays auto). Serializes on release.
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = selRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startW = el.getBoundingClientRect().width;
    const onMove = (ev) => {
      const w = Math.max(32, Math.round(startW + (ev.clientX - startX)));
      el.setAttribute('width', String(w));
      el.style.width = `${w}px`;
      el.style.height = 'auto';
      updateBox();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      touch();
      updateBox();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Drag & drop / paste of media files ──────────────────
  const onDragOver = (e) => {
    const dt = e.dataTransfer;
    if (dt && Array.from(dt.types || []).includes('Files')) { e.preventDefault(); dt.dropEffect = 'copy'; }
  };
  const onDrop = async (e) => {
    const dt = e.dataTransfer;
    const files = dt ? Array.from(dt.files).filter(isMediaFile) : [];
    if (!files.length) return; // let the browser handle non-media (text) drops
    e.preventDefault();
    const el = ref.current;
    el.focus();
    const range = caretRangeAtPoint(e.clientX, e.clientY);
    if (range) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); }
    for (const f of files) {
      try { insertMedia(await loadMedia(f)); } catch { /* skip unreadable file */ }
    }
  };
  const onPaste = (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    // 1) A pasted image/media FILE (e.g. a screenshot) → embed it.
    const items = Array.from(cd.items || []);
    const fileItem = items.find((x) => x.kind === 'file' && isMediaFile({ type: x.type }));
    if (fileItem) {
      const file = fileItem.getAsFile();
      if (file) { e.preventDefault(); loadMedia(file).then(insertMedia).catch(() => { /* ignore */ }); return; }
    }
    // 2) Rich HTML (from a browser / Word / another doc) → keep the formatting.
    const html = cd.getData('text/html');
    if (html && html.trim()) { e.preventDefault(); pasteRichHtml(html); return; }
    // 3) Plain text falls through to the browser's default paste.
  };

  return (
    <div className="richeditor-wrap" ref={wrapRef}>
      <div
        ref={ref}
        className="richeditor markdown-body"
        style={style}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder={placeholder || ''}
        onInput={onInput}
        onBlur={serialize}
        onFocus={onFocus}
        onClick={onClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaste={onPaste}
        onContextMenu={onContextMenu}
      />
      {box && (
        <div className="media-resize" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
          <span className="media-handle" onMouseDown={startResize} title="Resize" />
        </div>
      )}
    </div>
  );
}

// Sanitize HTML arriving from an external paste: strip scripts/styles/Office
// noise but keep the block/inline structure our Markdown serializer understands
// (headings, lists, tables, links, images, media).
function sanitizePasteHtml(html) {
  // Drop Word's conditional comments and <style>/<xml> blocks before sanitizing.
  const stripped = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '');
  return DOMPurify.sanitize(stripped, {
    ADD_ATTR: MEDIA_ATTR,
    ADD_TAGS: ['video', 'audio', 'source'],
    FORBID_TAGS: ['style', 'meta', 'link', 'title', 'head'],
    FORBID_ATTR: ['class'],
  });
}

// ── HTML → Markdown serialization ─────────────────────────
const esc = (s) => String(s);
const attrEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Preserve an explicit media size: prefer the width attribute, fall back to a
// pixel inline style set by the resize handle.
function mediaWidth(node) {
  const attr = node.getAttribute('width');
  if (attr && /^\d+$/.test(attr.trim())) return attr.trim();
  const sw = node.style && node.style.width;
  const m = sw && sw.match(/^(\d+(?:\.\d+)?)px$/);
  return m ? String(Math.round(parseFloat(m[1]))) : '';
}

function imgToMarkup(node) {
  const src = node.getAttribute('src') || '';
  const alt = node.getAttribute('alt') || '';
  if (!src) return '';
  const w = mediaWidth(node);
  // Sized images use HTML so the width survives; plain images stay clean Markdown.
  if (w) return `<img src="${src}" alt="${attrEsc(alt)}" width="${w}">`;
  return `![${alt}](${src})`;
}

function avToMarkup(node) {
  const tag = node.tagName.toLowerCase();
  const src = node.getAttribute('src') || node.querySelector('source')?.getAttribute('src') || '';
  if (!src) return '';
  const w = tag === 'video' ? mediaWidth(node) : '';
  const wAttr = w ? ` width="${w}"` : '';
  return `<${tag} src="${src}" controls${wAttr}></${tag}>`;
}

function htmlToMarkdown(root) {
  const blocks = [];
  root.childNodes.forEach((n) => {
    const b = serializeBlock(n, 0);
    if (b != null && b.trim() !== '') blocks.push(b);
  });
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Tags that carry their own Markdown block syntax. A container holding any of
// these must be walked as blocks — serializing it inline would melt headings,
// lists and tables down into one run of plain text.
const BLOCK_TAG = /^(address|article|aside|blockquote|details|div|dl|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|table|ul)$/;

function hasBlockChild(node) {
  for (const c of node.childNodes) {
    if (c.nodeType === 1 && BLOCK_TAG.test(c.tagName.toLowerCase())) return true;
  }
  return false;
}

// A container (<div>, <p>, <span>-ish wrapper) is a block *group* when it holds
// block children — walk into it; otherwise it is a single paragraph of inline
// content. contentEditable and pasted HTML produce both shapes freely.
function serializeContainer(node, depth) {
  if (!hasBlockChild(node)) return paragraph(node);
  const out = [];
  node.childNodes.forEach((c) => {
    const b = serializeBlock(c, depth);
    if (b != null && b.trim() !== '') out.push(b);
  });
  return out.join('\n\n');
}

function serializeBlock(node, depth) {
  if (node.nodeType === 3) {
    const t = node.textContent.replace(/\s+/g, ' ');
    return t.trim();
  }
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      // A heading is a single line: hard breaks inside it become spaces.
      return '#'.repeat(Number(tag[1])) + ' ' + inline(node).replace(/\n/g, ' ');
    case 'p': case 'div': case 'section': case 'article': case 'main':
    case 'header': case 'footer': case 'aside': case 'figure':
      return serializeContainer(node, depth);
    case 'blockquote':
      return blockChildren(node).join('\n\n').split('\n').map((l) => '> ' + l).join('\n');
    case 'pre':
      return '```\n' + node.textContent.replace(/\n+$/, '') + '\n```';
    case 'ul': return serializeList(node, false, depth);
    case 'ol': return serializeList(node, true, depth);
    case 'hr': return '---';
    case 'table': return serializeTable(node);
    case 'img': return imgToMarkup(node);
    case 'video': case 'audio': return avToMarkup(node);
    case 'br': return '';
    default: return serializeContainer(node, depth);
  }
}

function blockChildren(node) {
  const out = [];
  node.childNodes.forEach((c) => {
    const b = serializeBlock(c, 0);
    if (b != null && b.trim() !== '') out.push(b);
  });
  return out;
}

function serializeList(listNode, ordered, depth) {
  const items = [];
  let n = 1;
  listNode.childNodes.forEach((li) => {
    if (li.nodeType !== 1 || li.tagName.toLowerCase() !== 'li') return;
    let text = '';
    let check = '';
    const nested = [];
    li.childNodes.forEach((c) => {
      if (c.nodeType === 1 && c.tagName.toLowerCase() === 'input' && c.getAttribute('type') === 'checkbox') {
        check = c.checked || c.getAttribute('checked') != null ? '[x] ' : '[ ] ';
      } else if (c.nodeType === 1 && /^(ul|ol)$/i.test(c.tagName)) {
        nested.push(c);
      } else if (c.nodeType === 1 && c.tagName.toLowerCase() === 'p') {
        // Loose list: each <p> in the item is its own line.
        text += (text ? '\n' : '') + inline(c);
      } else {
        text += inlineNode(c);
      }
    });
    const indent = '  '.repeat(depth);
    const marker = ordered ? `${n}. ` : '- ';
    // Continuation lines must be indented past the marker to stay in the item.
    const body = (check + text).replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim()
      .replace(/\n/g, `  \n${indent}${' '.repeat(marker.length)}`);
    items.push(indent + marker + body);
    nested.forEach((nl) => items.push(serializeList(nl, nl.tagName.toLowerCase() === 'ol', depth + 1)));
    n += 1;
  });
  return items.join('\n');
}

function serializeTable(node) {
  const rows = Array.from(node.querySelectorAll('tr'));
  if (!rows.length) return '';
  // A cell must stay on one line: escape pipes and keep hard breaks as <br>.
  const cellsOf = (tr) => Array.from(tr.querySelectorAll('th,td'))
    .map((c) => inline(c).replace(/\|/g, '\\|').replace(/\n/g, '<br>') || ' ');
  const header = cellsOf(rows[0]);
  const cols = header.length || 1;
  const lines = [`| ${header.join(' | ')} |`, `| ${Array(cols).fill('---').join(' | ')} |`];
  for (let i = 1; i < rows.length; i++) {
    const cells = cellsOf(rows[i]);
    while (cells.length < cols) cells.push(' ');
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

// Inline content of a node. Newlines here mean a real <br> (text-node newlines
// are source formatting and were already collapsed in inlineNode), so only
// spaces/tabs are squeezed — the hard breaks the user typed survive.
function inline(node) {
  let s = '';
  node.childNodes.forEach((c) => { s += inlineNode(c); });
  return s.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

// A paragraph of inline content: <br> becomes a Markdown hard break so
// Shift+Enter line breaks survive the round-trip.
function paragraph(node) {
  return inline(node).replace(/\n/g, '  \n');
}

function inlineNode(node) {
  if (node.nodeType === 3) return esc(node.textContent).replace(/\s+/g, ' ');
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  const inner = () => { let s = ''; node.childNodes.forEach((c) => { s += inlineNode(c); }); return s; };
  switch (tag) {
    case 'strong': case 'b': { const x = inner().trim(); return x ? `**${x}**` : ''; }
    case 'em': case 'i': { const x = inner().trim(); return x ? `*${x}*` : ''; }
    case 'del': case 's': case 'strike': { const x = inner().trim(); return x ? `~~${x}~~` : ''; }
    // Underline has no Markdown equivalent — keep it as HTML (rendered by marked,
    // kept by DOMPurify) so it survives the round-trip and every export.
    case 'u': case 'ins': { const x = inner().trim(); return x ? `<u>${x}</u>` : ''; }
    case 'code': return '`' + node.textContent + '`';
    case 'a': { const href = node.getAttribute('href') || ''; return `[${inner()}](${href})`; }
    case 'br': return '\n';
    case 'img': return imgToMarkup(node);
    case 'video': case 'audio': return avToMarkup(node);
    default: return inner();
  }
}

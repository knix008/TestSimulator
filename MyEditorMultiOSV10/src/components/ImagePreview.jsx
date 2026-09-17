// Image preview next to the editor (Ctrl+Shift+M on an image file): the
// picture itself, whatever the file — an SVG (text, edited on the left;
// the preview follows every change) or a binary image (PNG · JPEG · GIF ·
// WebP · BMP · ICO · AVIF, shown as a hex dump on the left, the picture read
// once through the backend). Fit to the pane or 1:1 (click toggles), a
// checkerboard behind transparent pixels, the pixel size underneath.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Icons';
import { IMAGE_MIME } from '../lib/images';

const RENDER_DELAY = 120;   // ms after the last edit of an SVG — the preview follows the typing

export const isSvgName = (name) => /\.svg$/i.test(String(name || ''));
export const isBinaryImageName = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return !!(m && IMAGE_MIME[m[1].toLowerCase()] && m[1].toLowerCase() !== 'svg'); };
export const isImageName = (name) => isSvgName(name) || isBinaryImageName(name);

export function ImagePreview({ view, docVersion, path, name, mtime, width }) {
  useLanguage();
  const [src, setSrc] = useState('');
  const [err, setErr] = useState('');
  const [dim, setDim] = useState(null);   // [w, h] once loaded
  const [fit, setFit] = useState(true);
  const timer = useRef(null);
  const svg = isSvgName(name);

  // The source: an SVG document's text as a data URL (re-made a moment after each change), a binary file's bytes from the backend.
  useEffect(() => {
    setErr('');
    if (svg) {
      if (!view) return undefined;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(view.state.doc.toString())}`), src ? RENDER_DELAY : 0);
      return () => clearTimeout(timer.current);
    }
    let alive = true;
    setSrc('');
    call('file.dataUrl', { path }).then((r) => { if (alive) setSrc(r.dataUrl); }).catch((e) => { if (alive) setErr(e.message || String(e)); });
    return () => { alive = false; };
  }, [svg, view, docVersion, path, mtime]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="image-preview" style={{ width }}>
      <div className={`image-preview-body ${fit ? 'fit' : 'natural'}`} onClick={() => setFit((f) => !f)} title={t(fit ? 'img_pv_natural' : 'img_pv_fit')}>
        {src && !err && <img src={src} alt={name} onLoad={(e) => setDim([e.target.naturalWidth, e.target.naturalHeight])} onError={() => setErr(t('img_pv_broken'))} />}
        {err && <div className="image-preview-err"><Icon name="warning" size={18} /> {err}</div>}
      </div>
      <div className="image-preview-foot muted small">
        <span>{name}</span>
        <span className="spacer" />
        {dim && <span>{dim[0]} × {dim[1]} px</span>}
        <span>{fit ? t('img_pv_fit_on') : '1:1'}</span>
      </div>
    </div>
  );
}

// The SVG elements the bar above an SVG document inserts (a button each, drawn as the shape it makes):
// [id, tooltip key, the markup, a glyph]. The markup goes in at the cursor on its own line; a selection is
// wrapped by <g>.
const SVG_TAGS = [
  ['rect', 'svg_rect', '<rect x="10" y="10" width="100" height="60" rx="4" fill="#3a86ff"/>', <rect x="3" y="5" width="12" height="8" rx="1" />],
  ['circle', 'svg_circle', '<circle cx="50" cy="50" r="30" fill="#ffbe0b"/>', <circle cx="9" cy="9" r="5.5" />],
  ['ellipse', 'svg_ellipse', '<ellipse cx="60" cy="40" rx="40" ry="20" fill="#8338ec"/>', <ellipse cx="9" cy="9" rx="7" ry="4.5" />],
  ['line', 'svg_line', '<line x1="10" y1="10" x2="110" y2="70" stroke="#000" stroke-width="2"/>', <path d="M3 14L15 4" />],
  ['polyline', 'svg_polyline', '<polyline points="10,60 40,20 70,50 110,10" fill="none" stroke="#000" stroke-width="2"/>', <path d="M2 13l4-7 4 5 6-8" />],
  ['polygon', 'svg_polygon', '<polygon points="60,10 110,70 10,70" fill="#ff006e"/>', <path d="M9 3l6 11H3z" />],
  ['path', 'svg_path', '<path d="M10 60 C 40 10, 80 10, 110 60" fill="none" stroke="#000" stroke-width="2"/>', <path d="M2 13c3-9 8-9 11 0 1 2 2 2 3 0" />],
  ['text', 'svg_text', '<text x="10" y="40" font-family="sans-serif" font-size="24" fill="#000">텍스트</text>', <path d="M4 4h10M9 4v10" />],
  ['image', 'svg_image', '<image href="image.png" x="10" y="10" width="100" height="60"/>', <><rect x="2.5" y="3.5" width="13" height="11" rx="1" /><circle cx="6.5" cy="7" r="1.3" /><path d="M3 13l4-4 3 3 2-2 3 3" /></>],
  ['g', 'svg_group', '<g id="group" transform="translate(0 0)">\n  \n</g>', <><rect x="2.5" y="2.5" width="8" height="8" rx="1" /><rect x="7.5" y="7.5" width="8" height="8" rx="1" /></>],
  ['gradient', 'svg_gradient', '<defs>\n  <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">\n    <stop offset="0" stop-color="#3a86ff"/>\n    <stop offset="1" stop-color="#ff006e"/>\n  </linearGradient>\n</defs>', <><rect x="3" y="4" width="12" height="10" rx="1" /><path d="M6 4v10M9 4v10M12 4v10" opacity="0.5" /></>],
  ['use', 'svg_use', '<use href="#group" x="0" y="0"/>', <><rect x="2.5" y="5.5" width="7" height="7" rx="1" /><rect x="8.5" y="5.5" width="7" height="7" rx="1" strokeDasharray="2 1.5" /></>],
  ['transform', 'svg_transform', ' transform="rotate(15 60 40)"', <><path d="M9 3a6 6 0 1 1-6 6" /><path d="M6 9l-3 0 0-3" /></>],
];
export function insertSvgTag(view, id) {
  const tag = SVG_TAGS.find((x) => x[0] === id);
  if (!view || !tag) return;
  const { state } = view;
  const sel = state.selection.main;
  let markup = tag[2].replace(/\\n/g, '\n');
  if (id === 'transform') { view.dispatch({ changes: { from: sel.to, insert: markup }, selection: { anchor: sel.to + markup.length } }); view.focus(); return; }   // an attribute: right where the cursor is
  const line = state.doc.lineAt(sel.from);
  const indent = /^\s*/.exec(line.text)[0];
  if (id === 'g' && !sel.empty) markup = `<g id="group">\n${state.sliceDoc(sel.from, sel.to)}\n</g>`;   // wrap the selection
  const atLineStart = sel.from === line.from;
  const text = (atLineStart ? '' : '\n') + markup.split('\n').map((l, i) => (i ? indent + l : (atLineStart ? indent : indent) + l)).join('\n') + (atLineStart ? '\n' : '');
  const from = id === 'g' && !sel.empty ? sel.from : (atLineStart ? line.from : sel.to), to = id === 'g' && !sel.empty ? sel.to : from;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
  view.focus();
}

// The slim bar above an image file: for an SVG the elements to insert (as icons), then the preview toggle.
export function ImageBar({ onAction, preview, svg }) {
  useLanguage();
  return (
    <div className="mdbar htmlbar">
      {svg && SVG_TAGS.map(([id, tip, , glyph]) => (
        <button key={id} className="md-btn svg-btn" title={`${t(tip)} — <${id === 'gradient' ? 'linearGradient' : id === 'transform' ? 'transform=' : id}>`} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction(`svg:${id}`)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyph}</svg>
        </button>
      ))}
      {!svg && <span className="muted small htmlbar-hint">{t('img_pv_hint')}</span>}
      <span className="spacer" />
      <button className={`md-btn md-toggle ${preview ? 'on' : ''}`} title={`${t('img_pv_menu')} (Ctrl+Shift+M)`} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction('toggle:imagePreview')}>
        <Icon name="fileImage" size={16} /><span>{t('md_preview')}</span>
      </button>
    </div>
  );
}

export default ImagePreview;

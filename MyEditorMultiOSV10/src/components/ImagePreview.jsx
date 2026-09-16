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

// The slim bar above an image file: the preview toggle.
export function ImageBar({ onAction, preview, svg }) {
  useLanguage();
  return (
    <div className="mdbar htmlbar">
      <span className="muted small htmlbar-hint">{t(svg ? 'img_pv_hint_svg' : 'img_pv_hint')}</span>
      <span className="spacer" />
      <button className={`md-btn md-toggle ${preview ? 'on' : ''}`} title={`${t('img_pv_menu')} (Ctrl+Shift+M)`} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction('toggle:imagePreview')}>
        <Icon name="fileImage" size={16} /><span>{t('md_preview')}</span>
      </button>
    </div>
  );
}

export default ImagePreview;

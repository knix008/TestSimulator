// "Insert image" (Markdown toolbar › 이미지, Ctrl+Shift+I): pick an image file
// (or type a path / URL), choose how it goes into the document — as a link
// (a path relative to the document's folder when possible) or embedded as a
// Base64 data URL — set the alt text and, optionally, a width. The result is
// the Markdown / <img> text to insert.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { isElectron, nativeDialog } from '../lib/backend';
import { resolveImageSrc, isRemote, mimeOfName } from '../lib/images';
import { imgTag } from '../lib/mdlive';
import { Dialog } from './Dialogs';
import { FileDialog } from './FileDialog';

const fwd = (p) => String(p || '').replace(/\\/g, '/');
const baseName = (p) => fwd(p).split('/').pop() || '';

// The link text for a file: relative to `base` when it lies inside it,
// otherwise the absolute path; wrapped in <…> when it contains spaces.
function linkPath(file, base) {
  let p = fwd(file);
  const b = fwd(base).replace(/\/+$/, '');
  if (b) {
    const win = /^[a-zA-Z]:\//.test(p);
    const head = win ? p.slice(0, b.length + 1).toLowerCase() : p.slice(0, b.length + 1);
    if (head === (win ? b.toLowerCase() : b) + '/') p = p.slice(b.length + 1);
  }
  return /[\s()]/.test(p) ? `<${p}>` : p;
}

const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function ImageDialog({ base, home, sep, onResult }) {
  useLanguage();
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [altTouched, setAltTouched] = useState(false);
  const [mode, setMode] = useState('link');
  const [width, setWidth] = useState('');
  const [preview, setPreview] = useState(null);      // { url, size } | { error }
  const [browse, setBrowse] = useState(false);       // web version: the app's own file dialog
  const [busy, setBusy] = useState(false);

  const remote = isRemote(src.trim());
  const pick = (p) => { setSrc(p); if (!altTouched) setAlt(baseName(p).replace(/\.[^.]+$/, '')); };

  const doBrowse = async () => {
    if (isElectron) {
      try { const r = await nativeDialog('open', { multi: false, images: true, defaultPath: base || undefined }); const p = Array.isArray(r) ? r[0] : r; if (p) pick(p); } catch { /* cancelled */ }
    } else setBrowse(true);
  };

  // Preview of the chosen image (also tells whether the path is readable).
  useEffect(() => {
    const s = src.trim();
    if (!s) { setPreview(null); return undefined; }
    let stale = false;
    resolveImageSrc(s, base).then((url) => { if (!stale) setPreview({ url, size: /^data:/.test(url) ? Math.round((url.length - url.indexOf(',') - 1) * 0.75) : null }); })
      .catch((e) => { if (!stale) setPreview({ error: e.message }); });
    return () => { stale = true; };
  }, [src, base]);

  const ok = async () => {
    const s = src.trim();
    if (!s || busy) return;
    setBusy(true);
    try {
      let target;
      if (mode === 'embed' && !/^data:/i.test(s)) {
        if (remote) {
          // A remote picture is fetched by the page itself (CORS permitting).
          const res = await fetch(s); const blob = await res.blob();
          target = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
          if (!/^data:image\//.test(target) && mimeOfName(s)) target = target.replace(/^data:[^;,]*/, `data:${mimeOfName(s)}`);
        } else target = await resolveImageSrc(s, base);   // local file → data URL (relative to the document's folder)
      } else target = remote || /^data:/i.test(s) ? s : linkPath(s, base);
      const w = Number(width) > 0 ? Math.round(Number(width)) : 0;
      onResult(w ? imgTag(target.replace(/^<|>$/g, ''), alt, w) : `![${alt.replace(/[\[\]]/g, '')}](${target})`);
    } catch (e) {
      setPreview({ error: e.message });
      setBusy(false);
    }
  };

  const embedSize = preview && preview.size != null ? fmtSize(preview.size) : null;
  return (
    <>
      <Dialog title={t('img_title')} icon="fileImage" kind="info" width={520} onClose={() => onResult(null)} onEnter={ok}
        footer={<><button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" disabled={!src.trim() || busy || (preview && preview.error && mode === 'embed')} onClick={ok}>{t('img_insert')}</button></>}>
        <div className="form-grid settings-grid">
          <label>{t('img_file')}</label>
          <span className="row">
            <input className="mono" value={src} placeholder={t('img_file_hint')} spellCheck={false} onChange={(e) => pick(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn" onClick={doBrowse}>{t('set_browse')}</button>
          </span>
          <label>{t('img_alt')}</label>
          <input value={alt} onChange={(e) => { setAlt(e.target.value); setAltTouched(true); }} spellCheck={false} />
          <label>{t('img_mode')}</label>
          <span className="form-row">
            <label className="check"><input type="radio" name="img-mode" checked={mode === 'link'} onChange={() => setMode('link')} /><span>{t('img_link')} <span className="muted small">— {t('img_link_hint')}</span></span></label>
            <label className="check"><input type="radio" name="img-mode" checked={mode === 'embed'} onChange={() => setMode('embed')} /><span>{t('img_embed')} <span className="muted small">— {t('img_embed_hint')}{embedSize ? ` (${embedSize})` : ''}</span></span></label>
          </span>
          <label>{t('img_width')}</label>
          <span className="row">
            <input type="number" min={1} value={width} onChange={(e) => setWidth(e.target.value)} style={{ width: 90 }} />
            <span className="muted small">{t('img_width_hint')}</span>
          </span>
          <label />
          <div className="img-preview">
            {preview && preview.url && <img src={preview.url} alt="" />}
            {preview && preview.error && <span className="danger small">{t('img_not_found')}</span>}
            {!preview && <span className="muted small">{t('img_preview_empty')}</span>}
          </div>
        </div>
      </Dialog>
      {browse && <FileDialog kind="open" startPath={base || home} sep={sep} onResult={(r) => { setBrowse(false); const p = Array.isArray(r) ? r[0] : r; if (p) pick(p); }} />}
    </>
  );
}

export default ImageDialog;

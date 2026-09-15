// "Save image as…" from the preview: the format (PNG · JPEG · WebP · BMP, or
// the original file as it is), the quality for lossy formats and — when the
// picture has transparent pixels — whether to keep the transparency (PNG /
// WebP) or flatten it onto a background colour (JPEG / BMP always do). The
// result is the encoded data URL and a file name; the caller asks where to
// save it.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { analyzeImage, encodeImage } from '../lib/images';
import { Dialog } from './Dialogs';

const FORMATS = [['png', 'PNG', true], ['jpeg', 'JPEG', false], ['webp', 'WebP', true], ['bmp', 'BMP', false]];

export function ImageExportDialog({ src, alt, onResult }) {
  useLanguage();
  const [info, setInfo] = useState(null);       // { width, height, hasAlpha, canvas, mime }
  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState(92);
  const [keepAlpha, setKeepAlpha] = useState(true);
  const [background, setBackground] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const origMime = (/^data:([^;,]+)/.exec(src || '') || [])[1] || '';
  const origExt = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif' })[origMime] || '';

  useEffect(() => {
    let alive = true;
    analyzeImage(src).then((i) => { if (!alive) return; setInfo(i); if (!i.hasAlpha) setKeepAlpha(false); if (origExt && origExt !== 'png') setFormat('original'); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [src]);   // eslint-disable-line react-hooks/exhaustive-deps

  const alphaOk = format === 'png' || format === 'webp' || (format === 'original' && ['png', 'webp', 'gif', 'svg', 'avif'].includes(origExt));
  const lossy = format === 'jpeg' || format === 'webp';
  const ext = format === 'original' ? origExt : format === 'jpeg' ? 'jpg' : format;
  const name = `${(alt || 'image').replace(/[\\/:*?"<>|]+/g, '_') || 'image'}.${ext}`;

  const ok = async () => {
    if (!info || busy) return;
    setBusy(true);
    try {
      const dataUrl = format === 'original' ? src : encodeImage(info.canvas, { format, quality: quality / 100, keepAlpha: alphaOk && keepAlpha, background });
      onResult({ dataUrl, name, ext });
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Dialog title={t('imgx_title')} icon="fileImage" kind="info" width={520} onClose={() => onResult(null)} onEnter={ok}
      footer={<><button className="btn" onClick={() => onResult(null)}>{t('cancel')}</button><button className="btn primary" disabled={!info || busy} onClick={ok}>{t('save')}</button></>}>
      <div className="form-grid settings-grid">
        <label />
        <div className="img-preview imgx-preview"><img src={src} alt="" /></div>
        <label>{t('imgx_info')}</label>
        <span className="small">{info ? `${info.width} × ${info.height} · ${origMime || t('imgx_unknown')}${info.hasAlpha ? ` · ${t('imgx_has_alpha')}` : ''}` : '…'}</span>
        <label>{t('imgx_format')}</label>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          {origExt && <option value="original">{t('imgx_original', { ext: origExt.toUpperCase() })}</option>}
          {FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {lossy && (
          <>
            <label>{t('imgx_quality')}</label>
            <span className="row"><input type="range" min={10} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} style={{ flex: 1 }} /><span className="muted small" style={{ width: 36, textAlign: 'right' }}>{quality}</span></span>
          </>
        )}
        {info && info.hasAlpha && (
          <>
            <label>{t('imgx_alpha')}</label>
            <span className="form-row">
              <label className="check"><input type="checkbox" checked={alphaOk && keepAlpha} disabled={!alphaOk} onChange={(e) => setKeepAlpha(e.target.checked)} /><span>{t('imgx_keep_alpha')}{!alphaOk ? ` — ${t('imgx_no_alpha_format')}` : ''}</span></label>
              {!(alphaOk && keepAlpha) && format !== 'original' && <span className="row"><span className="muted small">{t('imgx_background')}</span><input type="color" value={background} onChange={(e) => setBackground(e.target.value)} /><span className="mono small">{background}</span></span>}
            </span>
          </>
        )}
        <label>{t('imgx_file')}</label>
        <span className="mono small">{name}</span>
        {error && <><label /><span className="danger small">{error}</span></>}
      </div>
    </Dialog>
  );
}

export default ImageExportDialog;

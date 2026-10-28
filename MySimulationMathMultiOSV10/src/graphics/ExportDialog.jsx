// The figure export dialog (fixed size): what to export (whole figure, the
// selected axes, or a region drawn on the figure), format, size (scale or
// pixels with an aspect lock), DPI, quality, background, overlays, file name /
// folder, a live preview of the real encoded output (checkerboard under
// transparency), Save and Copy. Options are remembered in settings.figures.export.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconSelect, Stepper, Toggle } from '../views/common';
import { CloseButton } from '../components/Chrome';
import { FigIcon } from './icons.jsx';
import { tr } from './i18n.js';
import { FORMATS, formatInfo, backgroundChoices, outputSize, lockedPair, fileNameFor, orientationOf, orientedPixels } from './exportopts.js';
import { encodeExport, planExport } from './paint.js';

const PREVIEW_W = 470, PREVIEW_H = 372;

/** Fits w × h into the preview box (device px). */
function previewSize(w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const k = Math.min((PREVIEW_W * dpr) / w, (PREVIEW_H * dpr) / h, 1);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export function ExportDialog({ ctl, lang, onSave, onCopy, version }) {
  const L = (k, v) => tr(lang, k, v);
  const o = ctl.exportOpts();
  const fig = ctl.figure();
  const req = ctl.exportRequest();
  const [preview, setPreview] = useState({ url: '', bytes: 0, error: '' });
  const [busy, setBusy] = useState(false);
  const urlRef = useRef('');
  const plan = fig && req ? planExport(fig, { ...req, sizeMode: 'scale', scale: 1 }, ctl.views2d) : null;
  // orientation: chosen for a whole-figure export; an axes / region export keeps the selection's shape
  const wholeFigure = !!req && req.target === 'figure';
  const screen = fig ? ctl.sizeOf(fig) : { width: 4, height: 3 };
  const orient = wholeFigure ? (o.orientation || orientationOf(screen.width, screen.height)) : plan ? orientationOf(plan.crop.w, plan.crop.h) : 'landscape';
  const out = plan ? outputSize(o, plan.baseW, plan.baseH) : { width: 0, height: 0 };
  const f = formatInfo(o.format);
  const set = (patch) => ctl.setExportOpts(patch);

  // live preview: the real encoder at preview size
  const key = JSON.stringify([o, req && [req.figW, req.figH, req.axesId, req.rect, req.target, (req.tipList || []).length], version]);
  useEffect(() => {
    if (!fig || !req || ctl.exportDlg.picking) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        // GIF transparency is 1-bit: a downscaled render would lose thin lines, so preview it at full size when small enough
        const ps = o.format === 'gif' && out.width * out.height <= 2e6 ? { width: out.width, height: out.height } : previewSize(out.width, out.height);
        const r = await encodeExport(fig, { ...req, sizeMode: 'pixels', lock: false, width: ps.width, height: ps.height, dpi: 0 }, ctl.paintOptions(fig));
        if (!alive) return;
        const url = URL.createObjectURL(new Blob([r.bytes], { type: r.ext === 'pdf' ? 'image/png' : r.mime }));
        let shown = url;
        if (r.ext === 'pdf') { // a PDF page cannot go in <img>: show the same raster as PNG
          URL.revokeObjectURL(url);
          const p = await encodeExport(fig, { ...req, format: 'png', background: req.background === 'none' ? 'white' : req.background, sizeMode: 'pixels', lock: false, width: ps.width, height: ps.height, dpi: 0 }, ctl.paintOptions(fig));
          shown = URL.createObjectURL(new Blob([p.bytes], { type: 'image/png' }));
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = shown;
        setPreview({ url: shown, bytes: r.bytes.length, error: '' });
      } catch (e) { if (alive) setPreview({ url: '', bytes: 0, error: e.message || String(e) }); }
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !ctl.exportDlg.picking) { e.stopPropagation(); ctl.closeExport(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [ctl]);

  if (!fig) return null;
  if (ctl.exportDlg.picking) {
    return createPortal(
      <div className="fig-pickbar" role="status">
        <FigIcon name={ctl.exportDlg.picking === 'axes' ? 'point' : 'boxzoom'} size={15} />
        <span>{L(`pick_${ctl.exportDlg.picking}`)}</span>
        <button type="button" className="vbtn" onClick={() => ctl.finishPick(null)}><span>{L('cancel')}</span></button>
      </div>, document.body);
  }

  const targets = [
    { value: 'figure', label: L('tFigure'), icon: 'image' },
    { value: 'axes', label: L('tAxes'), icon: 'chart' },
    { value: 'region', label: L('tRegion'), icon: 'target' },
  ];
  const formats = FORMATS.map((x) => ({ value: x.id, label: `${x.id.toUpperCase()} — ${L(`fmt_${x.id}`)}`, icon: x.raster ? 'image' : x.id === 'svg' ? 'code' : 'file' }));
  const bgIcons = { theme: 'palette', white: 'sun', none: 'grid' };
  const bgs = backgroundChoices(o.format).map((b) => ({ value: b, label: L(`bg_${b}`), icon: bgIcons[b] }));
  const note = !f.alpha ? L(o.format === 'jpg' ? 'noAlphaJpg' : 'noAlphaPdf') : '';
  const save = async () => { setBusy(true); try { await onSave(); } finally { setBusy(false); } };
  const copy = async () => { setBusy(true); try { await onCopy(); } finally { setBusy(false); } };
  const pickKind = o.target === 'region' ? 'region' : 'axes';

  return createPortal(
    <div className="modal-back fig-export-back">
      <div className="fig-export" role="dialog" aria-label={L('exportTitle')} data-dialog="export">
        <div className="dialog-title">
          <strong><FigIcon name="export" size={16} />{L('exportTitle')}</strong>
          <CloseButton onClick={() => ctl.closeExport()} size={14} />
        </div>
        <div className="fig-export-body">
          <div className="fig-export-opts">
            <div className="fig-xrow"><span className="fig-xlbl">{L('target')}</span>
              <IconSelect value={o.target} options={targets} onChange={(v) => { set({ target: v }); if (v === 'region' && !ctl.exportRect) ctl.startPick('region'); }} width={150} />
              <button type="button" className="vbtn fig-xpick" disabled={o.target === 'figure'} title={L(`pick_${pickKind}`)} onClick={() => ctl.startPick(pickKind)}><FigIcon name={pickKind === 'axes' ? 'point' : 'boxzoom'} size={14} /><span>{L('pickOnFigure')}</span></button>
            </div>
            <div className="fig-xrow"><span className="fig-xlbl">{L('orientation')}</span>
              {['landscape', 'portrait'].map((k) => (
                <button key={k} type="button" className={`vbtn fig-xorient ${orient === k ? 'on' : ''}`} aria-pressed={orient === k} disabled={!wholeFigure}
                  title={wholeFigure ? L(k) : L('orientFixed')}
                  onClick={() => set({ orientation: k, ...(o.sizeMode === 'pixels' ? orientedPixels(o.width, o.height, k) : {}) })}>
                  <FigIcon name={k} size={15} /><span>{L(k)}</span>
                </button>
              ))}
              {!wholeFigure && <span className="fig-xhint small" title={L('orientFixed')}>{L('orientFixed')}</span>}
            </div>
            <div className="fig-xrow"><span className="fig-xlbl">{L('format')}</span>
              <IconSelect value={o.format} options={formats} onChange={(v) => set({ format: v, name: fileNameFor(o.name, v).replace(/\.[^.]+$/, '') })} width={262} />
            </div>
            <div className="fig-xrow"><span className="fig-xlbl">{L('size')}</span>
              <IconSelect value={o.sizeMode} options={[{ value: 'scale', label: L('sizeScale'), icon: 'scale' }, { value: 'pixels', label: L('sizePixels'), icon: 'hash' }]} onChange={(v) => set({ sizeMode: v, ...(v === 'pixels' ? { width: out.width, height: out.height } : {}) })} width={128} />
              {o.sizeMode === 'scale'
                ? <IconSelect value={o.scale} options={[1, 2, 3, 4].map((n) => ({ value: n, label: `×${n}`, icon: 'scale' }))} onChange={(v) => set({ scale: v })} width={96} />
                : <Toggle checked={o.lock} onChange={(v) => set({ lock: v })} label={L('lockAspect')} />}
            </div>
            {o.sizeMode === 'pixels' && (
              <div className="fig-xrow fig-xpair">
                <Stepper label={L('width')} value={o.width} min={16} max={16000} step={10} width={52} onChange={(v) => set(lockedPair(o, 'width', v, plan.baseW, plan.baseH))} />
                <Stepper label={L('height')} value={o.lock ? out.height : o.height} min={16} max={16000} step={10} width={52} disabled={o.lock} onChange={(v) => set(lockedPair(o, 'height', v, plan.baseW, plan.baseH))} />
              </div>
            )}
            <div className="fig-xrow fig-xinfo"><span className="fig-xlbl" /><span>{L('outSize', { w: out.width, h: out.height })}{preview.bytes ? ` · ${L('previewBytes', { k: (preview.bytes / 1024).toFixed(1) })}` : ''}</span></div>
            <div className="fig-xrow fig-xpair">
              <Stepper label={L('dpi')} value={o.dpi} min={36} max={2400} step={6} width={56} disabled={!f.dpi} onChange={(v) => set({ dpi: v })} />
              <Stepper label={L('quality')} value={o.quality} min={10} max={100} step={1} width={44} unit="%" disabled={!f.quality} onChange={(v) => set({ quality: v })} />
            </div>
            <div className="fig-xrow"><span className="fig-xlbl">{L('background')}</span>
              <IconSelect value={o.background} options={bgs} onChange={(v) => set({ background: v })} width={180} />
            </div>
            <div className={`fig-xnote ${note ? '' : 'empty'}`}>{note && <><FigIcon name="point" size={12} /><span>{note}</span></>}</div>
            <div className="fig-xrow"><span className="fig-xlbl">{L('include')}</span>
              <Toggle checked={o.rulers} onChange={(v) => set({ rulers: v })} label={L('incRulers')} />
              <Toggle checked={o.tips} onChange={(v) => set({ tips: v })} label={L('incTips')} />
            </div>
            <div className="fig-xrow"><span className="fig-xlbl">{L('fileName')}</span>
              <input type="text" className="fig-xname" value={o.name} onChange={(e) => set({ name: e.target.value })} spellCheck={false} aria-label={L('fileName')} />
              <span className="fig-xext">.{f.ext}</span>
            </div>
            <div className="fig-xrow"><span className="fig-xlbl">{L('folder')}</span>
              <span className="fig-xfolder ellipsis" title={o.folder || L('folderAsk')}>{o.folder || L('folderAsk')}</span>
            </div>
          </div>
          <div className="fig-export-preview">
            <div className={`fig-xcheck ${o.background === 'none' && f.alpha ? 'on' : ''}`}>
              {preview.url ? <img src={preview.url} alt={L('preview')} /> : <span className="small">{preview.error || L('preview')}</span>}
            </div>
            <div className="fig-xcaption small">{L('previewHint')}</div>
          </div>
        </div>
        <div className="fig-export-foot">
          <button type="button" className="vbtn" disabled={busy} onClick={copy} title={L('copy_tip')}><FigIcon name="copy" size={15} /><span>{L('copyPng')}</span></button>
          <span className="spacer" />
          <button type="button" className="vbtn" onClick={() => ctl.closeExport()}><span>{L('cancel')}</span></button>
          <button type="button" className="vbtn vbtn-primary" disabled={busy} onClick={save}><FigIcon name="export" size={15} /><span>{L('save')}</span></button>
        </div>
      </div>
    </div>, document.body);
}

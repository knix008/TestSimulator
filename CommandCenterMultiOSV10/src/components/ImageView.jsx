// The picture pane of the viewer (F3) and of the preview window: a decoded
// image (src/lib/images.js — HEIC / DICOM / TIFF included) that can be
// zoomed (Ctrl+wheel, buttons, +/−/0/1, double-click fit ⇄ 100 %), panned by
// dragging, rotated, printed, copied to the clipboard and saved in another
// format (PNG / JPEG / WebP / BMP). A right-click opens the same commands as a
// context menu. The host (ViewerDialog) reaches print() through a ref.
// A DICOM gets a second bar: frame navigation (multi-frame files) and the
// window (centre / width) with presets, inputs, inversion and Ctrl+drag.
import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { call, isElectron, pickSavePath } from '../lib/backend';
import { decodeImage, renderImage, encodeImage, blobToBase64, withExt, SAVE_FORMATS } from '../lib/images';
import { PrintDialog } from '../dialogs/PrintDialog';
import { dirName, joinPath, baseName } from '../lib/format';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';

const ZOOM_MIN = 0.05, ZOOM_MAX = 32;
const STEPS = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const nextStep = (z, dir) => (dir > 0 ? STEPS.find((s) => s > z * 1.001) || ZOOM_MAX : [...STEPS].reverse().find((s) => s < z * 0.999) || ZOOM_MIN);

// spec: { data (fs.readFile result), path, name, prefs, canOpen, onOpen, onStatus(text), onError(err, title), onSaved(path), onInfo(text) }
export const ImageView = forwardRef(function ImageView({ spec }, ref) {
  const { data, path } = spec;
  const name = spec.name || baseName(path);
  const [decoded, setDecoded] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState('fit');   // 'fit' or a factor
  const [rot, setRot] = useState(0);         // quarter turns clockwise
  const [fitZoom, setFitZoom] = useState(1);
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState('');      // 'print' | 'save' | 'copy'
  const stageRef = useRef(null);
  const drag = useRef(null);
  // DICOM: the window / frame state mirrored from the decoder (decoded.dicom) so the bar can show it.
  const [dicom, setDicom] = useState(null);
  const dicomBusy = useRef(false);
  const dicomNext = useRef(null);
  // Multi-frame DICOM: every frame at once (a contact sheet) instead of one frame — see the ⊞ button.
  const [sheet, setSheet] = useState(false);
  // Cine: the frames played one after another (▶ button / Space), looping, at the file's frame rate.
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef(0);   // the frame shown last (the timer reads it; state lags behind the decoder)
  const [sheetUrls, setSheetUrls] = useState([]);   // one data URL per frame, rendered with the current window

  // Decode once per file.
  useEffect(() => {
    let alive = true;
    setDecoded(null); setError(''); setZoom('fit'); setRot(0);
    setDicom(null); setSheet(false); setSheetUrls([]); setPlaying(false); frameRef.current = 0;
    decodeImage(data, name).then((d) => { if (alive) { setDecoded(d); setDicom(d.dicom ? { ...d.dicom } : null); } }, (err) => { if (alive) setError(err && err.message ? err.message : String(err)); });
    return () => { alive = false; };
  }, [data, name]);

  // The picture's size after rotation.
  const [imgW, imgH] = useMemo(() => (decoded ? (rot % 2 ? [decoded.height, decoded.width] : [decoded.width, decoded.height]) : [0, 0]), [decoded, rot]);

  // "Fit" is a real factor (so the toolbar can show it): recomputed when the pane or the picture changes.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || !decoded) return undefined;
    const measure = () => {
      const w = el.clientWidth - 24, h = el.clientHeight - 24;
      setFitZoom(Math.max(ZOOM_MIN, Math.min(1, w / imgW, h / imgH)));   // never enlarged to fit
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [decoded, imgW, imgH]);

  const z = zoom === 'fit' ? fitZoom : zoom;
  useEffect(() => { if (spec.onInfo && decoded) spec.onInfo(`${decoded.width} × ${decoded.height}${decoded.note ? `  ·  ${decoded.note}` : ''}`); }, [decoded]); // eslint-disable-line react-hooks/exhaustive-deps

  // DICOM re-render (another frame, another window). One at a time: a request made while one is being
  // drawn is kept and applied afterwards, so dragging the window never queues up.
  const applyDicom = (opts) => {
    if (!decoded || !decoded.dicom) return;
    if (dicomBusy.current) { dicomNext.current = { ...(dicomNext.current || {}), ...opts }; return; }
    dicomBusy.current = true;
    decoded.dicom.show(opts).then((r) => {
      setDecoded((d) => (d ? { ...d, source: r.canvas, url: r.canvas.toDataURL('image/png') } : d));
      setDicom((s) => ({ ...(s || {}), ...r.state }));
    }, (err) => { if (spec.onError) spec.onError(err, t('img_decode_failed', { name })); })
      .finally(() => { dicomBusy.current = false; const next = dicomNext.current; dicomNext.current = null; if (next) applyDicom(next); });
  };
  const dicomFrame = (i) => { if (dicom && dicom.frames > 1) applyDicom({ frame: Math.max(0, Math.min(dicom.frames - 1, i)) }); };
  // The sheet: every frame rendered in turn with the current window / inversion (decoded frames are cached by
  // the decoder, so this costs one pass of window mapping per frame), then the current frame is put back.
  useEffect(() => {
    if (!sheet || !decoded || !decoded.dicom || !dicom) return undefined;
    let alive = true;
    (async () => {
      const urls = [];
      for (let i = 0; i < dicom.frames; i++) {
        const r = await decoded.dicom.show({ frame: i });
        if (!alive) return;
        urls.push(r.canvas.toDataURL('image/png'));
        if (i % 4 === 3 || i === dicom.frames - 1) setSheetUrls(urls.slice());
      }
      await decoded.dicom.show({ frame: dicom.frame });
    })().catch((err) => { if (spec.onError) spec.onError(err, t('img_decode_failed', { name })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, dicom && dicom.wc, dicom && dicom.ww, dicom && dicom.invert, decoded]);
  const pickFrame = (i) => { setSheet(false); dicomFrame(i); };
  useEffect(() => { if (dicom) frameRef.current = dicom.frame; }, [dicom && dicom.frame]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing || !dicom || dicom.frames < 2) return undefined;
    const ms = Math.max(20, Math.min(2000, dicom.frameTime || 100));
    const timer = setInterval(() => { if (!dicomBusy.current) applyDicom({ frame: (frameRef.current + 1) % dicom.frames }); }, ms);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, dicom && dicom.frames, dicom && dicom.frameTime, decoded]);
  const togglePlay = () => { if (dicom && dicom.frames > 1) { setSheet(false); setPlaying((v) => !v); } };
  const dicomWindow = (wc, ww) => applyDicom({ wc, ww });
  const dicomPreset = (id) => {
    if (!dicom) return;
    if (id === 'auto' && dicom.range) { dicomWindow((dicom.range.min + dicom.range.max) / 2, Math.max(1, dicom.range.max - dicom.range.min)); return; }
    if (id.startsWith('file:')) { const w = dicom.fileWindows[Number(id.slice(5))]; if (w) dicomWindow(w.wc, w.ww); return; }
    const p = (dicom.presets || []).find((x) => x.id === id);
    if (p) dicomWindow(p.wc, p.ww);
  };
  const dicomPresetId = () => {
    if (!dicom) return '';
    const same = (a, b) => Math.abs(a - b) < 0.5;
    const fi = dicom.fileWindows.findIndex((w) => same(w.wc, dicom.wc) && same(w.ww, dicom.ww));
    if (fi >= 0) return `file:${fi}`;
    const p = (dicom.presets || []).find((x) => same(x.wc, dicom.wc) && same(x.ww, dicom.ww));
    if (p) return p.id;
    if (dicom.range && same((dicom.range.min + dicom.range.max) / 2, dicom.wc) && same(Math.max(1, dicom.range.max - dicom.range.min), dicom.ww)) return 'auto';
    return '';
  };

  // Zoom keeping the point under the cursor (or the centre) still.
  const zoomTo = (factor, at) => {
    const el = stageRef.current;
    const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, factor));
    if (!el) { setZoom(nz); return; }
    const box = el.getBoundingClientRect();
    const px = at ? at.x - box.left : el.clientWidth / 2, py = at ? at.y - box.top : el.clientHeight / 2;
    const cx = (el.scrollLeft + px) / z, cy = (el.scrollTop + py) / z;   // picture coordinates under the cursor
    setZoom(nz);
    requestAnimationFrame(() => { el.scrollLeft = cx * nz - px; el.scrollTop = cy * nz - py; });
  };
  const zoomIn = (at) => zoomTo(nextStep(z, 1), at);
  const zoomOut = (at) => zoomTo(nextStep(z, -1), at);
  const fit = () => setZoom('fit');
  const actual = () => zoomTo(1);
  const rotate = (dir) => setRot((r) => (r + dir + 4) % 4);

  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;   // a plain wheel scrolls the pane
    e.preventDefault();
    (e.deltaY < 0 ? zoomIn : zoomOut)({ x: e.clientX, y: e.clientY });
  };
  // Ctrl+wheel must be stopped before the browser zooms the whole page: a passive React listener cannot.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const h = (e) => onWheel(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  });

  // Drag to pan.
  const onMouseDown = (e) => {
    // Ctrl+drag (or the middle button) on a grey DICOM: left/right changes the width, up/down the centre.
    if (dicom && dicom.gray && ((e.button === 0 && (e.ctrlKey || e.metaKey)) || e.button === 1)) {
      e.preventDefault();
      const wc0 = dicom.wc, ww0 = dicom.ww, x0 = e.clientX, y0 = e.clientY;
      const k = Math.max(0.05, ((dicom.range ? dicom.range.max - dicom.range.min : ww0) || 256) / 400);   // units per pixel
      const move = (ev) => dicomWindow(wc0 + (ev.clientY - y0) * k, Math.max(1e-3, ww0 + (ev.clientX - x0) * k));
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      return;
    }
    if (e.button !== 0) return;
    const el = stageRef.current;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
    const move = (ev) => { const d = drag.current; if (!d) return; el.scrollLeft = d.sl - (ev.clientX - d.x); el.scrollTop = d.st - (ev.clientY - d.y); if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 3) d.moved = true; };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setTimeout(() => { drag.current = null; }, 0); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const onDoubleClick = (e) => { if (drag.current && drag.current.moved) return; if (zoom === 'fit' || Math.abs(z - fitZoom) < 0.001) zoomTo(1, { x: e.clientX, y: e.clientY }); else fit(); };

  // Keys: + / − / 0 (fit) / 1 (100 %) / R (rotate) — not while typing somewhere.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.altKey) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if ((e.key === '+' || e.key === '=') && !ctrl) { e.preventDefault(); zoomIn(); }
      else if (e.key === '-' && !ctrl) { e.preventDefault(); zoomOut(); }
      else if (e.key === '0' && !e.shiftKey) { e.preventDefault(); fit(); }
      else if (e.key === '1' && !e.shiftKey) { e.preventDefault(); actual(); }
      else if (e.key.toLowerCase() === 'r' && !ctrl) { e.preventDefault(); rotate(e.shiftKey ? -1 : 1); }
      else if (dicom && (e.key === 'ArrowLeft' || e.key === 'PageUp') && !ctrl) { e.preventDefault(); dicomFrame(dicom.frame - 1); }
      else if (dicom && (e.key === 'ArrowRight' || e.key === 'PageDown') && !ctrl) { e.preventDefault(); dicomFrame(dicom.frame + 1); }
      else if (dicom && e.key === 'Home' && !ctrl) { e.preventDefault(); dicomFrame(0); }
      else if (dicom && e.key === 'End' && !ctrl) { e.preventDefault(); dicomFrame(dicom.frames - 1); }
      else if (dicom && dicom.frames > 1 && e.key.toLowerCase() === 'g' && !ctrl) { e.preventDefault(); setSheet((v) => !v); }
      else if (dicom && dicom.frames > 1 && e.key === ' ' && !ctrl) { e.preventDefault(); togglePlay(); }
      else if (dicom && dicom.gray && e.key.toLowerCase() === 'i' && !ctrl) { e.preventDefault(); applyDicom({ invert: !dicom.invert }); }
      else if (dicom && dicom.gray && e.key.toLowerCase() === 'w' && !ctrl) { e.preventDefault(); dicomPreset(dicom.fileWindows.length ? 'file:0' : 'auto'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Commands (the toolbar buttons and the context menu share them) ──
  const picture = () => renderImage(decoded, rot);

  // The print dialog (preview + page setup) for the picture as shown (decoded, rotated).
  const [printDoc, setPrintDoc] = useState(null);
  const print = () => {
    if (!decoded || busy || printDoc) return;
    try {
      const canvas = picture();
      setPrintDoc({ title: name, kind: 'image', mime: 'image/png', base64: canvas.toDataURL('image/png').split(',')[1], meta: `${canvas.width} × ${canvas.height}` });
    } catch (err) { if (spec.onError) spec.onError(err, t('print_failed')); }
  };
  const printDone = (r) => {
    setPrintDoc(null);
    if (spec.onStatus && r) spec.onStatus(t(r.ok ? 'print_sent' : 'print_cancelled', { name }));
  };

  const saveAs = async (format) => {
    if (!decoded || busy) return;
    const f = SAVE_FORMATS.find((x) => x.id === format) || SAVE_FORMATS[0];
    const outName = withExt(name, f.ext);
    setBusy('save');
    try {
      const blob = await encodeImage(picture(), f.id);
      if (isElectron) {
        const target = await pickSavePath(joinPath(dirName(path), outName), [{ name: f.label, extensions: [f.ext] }, { name: t('img_all_files'), extensions: ['*'] }]);
        if (!target) return;
        await call('fs.writeBytes', { path: target, base64: await blobToBase64(blob) });
        if (spec.onSaved) spec.onSaved(target);
        if (spec.onStatus) spec.onStatus(t('img_saved', { name: baseName(target) }));
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = outName; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        if (spec.onStatus) spec.onStatus(t('img_saved', { name: outName }));
      }
    } catch (err) { if (spec.onError) spec.onError(err, t('img_save_failed')); }
    finally { setBusy(''); }
  };

  const copy = async () => {
    if (!decoded || busy) return;
    setBusy('copy');
    try {
      const canvas = picture();
      if (isElectron) await call('clipboard.writeImage', { dataUrl: canvas.toDataURL('image/png') });
      else {
        const blob = await encodeImage(canvas, 'png');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
      if (spec.onStatus) spec.onStatus(t('img_copied'));
    } catch (err) { if (spec.onError) spec.onError(err, t('img_copy_failed')); }
    finally { setBusy(''); }
  };

  useImperativeHandle(ref, () => ({ print, saveAs, copy, zoomIn, zoomOut, fit, actual }), [print, saveAs, copy]); // eslint-disable-line react-hooks/exhaustive-deps

  const menuItems = [
    { id: 'zoomIn', label: t('img_zoom_in'), icon: 'zoomIn', shortcut: '+' },
    { id: 'zoomOut', label: t('img_zoom_out'), icon: 'zoomOut', shortcut: '−' },
    { id: 'fit', label: t('img_fit'), icon: 'fit', shortcut: '0', checked: zoom === 'fit' },
    { id: 'actual', label: t('img_actual'), icon: 'actual', shortcut: '1', checked: zoom !== 'fit' && Math.abs(z - 1) < 0.001 },
    { sep: true },
    { id: 'rotL', label: t('img_rotate_left'), icon: 'rotateL', shortcut: 'Shift+R' },
    { id: 'rotR', label: t('img_rotate_right'), icon: 'rotateR', shortcut: 'R' },
    ...(dicom && dicom.frames > 1 ? [{ sep: true }, { id: 'prevFrame', label: t('dcm_prev_frame'), icon: 'chevronLeft', shortcut: '←', disabled: dicom.frame <= 0 }, { id: 'nextFrame', label: t('dcm_next_frame'), icon: 'chevronRight', shortcut: '→', disabled: dicom.frame >= dicom.frames - 1 }] : []),
    ...(dicom && dicom.gray ? [{ sep: true }, { id: 'invert', label: t('dcm_invert'), icon: 'moon', shortcut: 'I', checked: !!dicom.invert }, { id: 'resetWindow', label: t('dcm_reset_window'), icon: 'refresh', shortcut: 'W' },
      ...(dicom.presets || []).map((p) => ({ id: `preset:${p.id}`, label: `${t(`dcm_preset_${p.id}`)}  (C ${p.wc} / W ${p.ww})`, icon: 'sun', checked: dicomPresetId() === p.id }))] : []),
    { sep: true },
    { id: 'print', label: t('print'), icon: 'print', shortcut: 'Ctrl+P' },
    { id: 'copy', label: t('img_copy'), icon: 'copy' },
    ...SAVE_FORMATS.map((f) => ({ id: `save:${f.id}`, label: t('img_save_as_fmt', { fmt: f.label }), icon: 'save' })),
    ...(spec.canOpen ? [{ sep: true }, { id: 'open', label: t('viewer_open_app'), icon: 'open' }] : []),
  ];
  const onPick = (id) => {
    setMenu(null);
    if (id === 'zoomIn') zoomIn(); else if (id === 'zoomOut') zoomOut(); else if (id === 'fit') fit(); else if (id === 'actual') actual();
    else if (id === 'rotL') rotate(-1); else if (id === 'rotR') rotate(1);
    else if (id === 'print') print(); else if (id === 'copy') copy();
    else if (id.startsWith('save:')) saveAs(id.slice(5));
    else if (id === 'prevFrame') dicomFrame(dicom.frame - 1); else if (id === 'nextFrame') dicomFrame(dicom.frame + 1);
    else if (id === 'invert') applyDicom({ invert: !dicom.invert }); else if (id === 'resetWindow') dicomPreset(dicom.fileWindows.length ? 'file:0' : 'auto');
    else if (id.startsWith('preset:')) dicomPreset(id.slice(7));
    else if (id === 'open' && spec.onOpen) spec.onOpen();
  };

  const pct = `${Math.round(z * 100)} %`;
  return (
    <div className="imgview">
      <div className="imgview-bar">
        <button className="tb-btn tb-icon-only" title={`${t('img_zoom_out')} (−)`} aria-label={t('img_zoom_out')} onClick={() => zoomOut()} disabled={!decoded || z <= ZOOM_MIN}><Icon name="zoomOut" /></button>
        <button className="imgview-pct" title={t('img_zoom_reset')} onClick={() => (zoom === 'fit' ? actual() : fit())}>{decoded ? pct : '—'}</button>
        <button className="tb-btn tb-icon-only" title={`${t('img_zoom_in')} (+)`} aria-label={t('img_zoom_in')} onClick={() => zoomIn()} disabled={!decoded || z >= ZOOM_MAX}><Icon name="zoomIn" /></button>
        <button className={`tb-btn tb-icon-only ${zoom === 'fit' ? 'on' : ''}`} title={`${t('img_fit')} (0)`} aria-label={t('img_fit')} onClick={fit} disabled={!decoded}><Icon name="fit" /></button>
        <button className={`tb-btn tb-icon-only ${zoom !== 'fit' && Math.abs(z - 1) < 0.001 ? 'on' : ''}`} title={`${t('img_actual')} (1)`} aria-label={t('img_actual')} onClick={actual} disabled={!decoded}><Icon name="actual" /></button>
        <span className="tb-sep" />
        <button className="tb-btn tb-icon-only" title={`${t('img_rotate_left')} (Shift+R)`} aria-label={t('img_rotate_left')} onClick={() => rotate(-1)} disabled={!decoded}><Icon name="rotateL" /></button>
        <button className="tb-btn tb-icon-only" title={`${t('img_rotate_right')} (R)`} aria-label={t('img_rotate_right')} onClick={() => rotate(1)} disabled={!decoded}><Icon name="rotateR" /></button>
        <span className="tb-sep" />
        <button className="tb-btn tb-icon-only" title={`${t('print')} (Ctrl+P)`} aria-label={t('print')} onClick={print} disabled={!decoded || !!busy}><Icon name="print" /></button>
        <button className="tb-btn tb-icon-only" title={t('img_copy')} aria-label={t('img_copy')} onClick={copy} disabled={!decoded || !!busy}><Icon name="copy" /></button>
        <button className="tb-btn tb-icon-only" title={t('img_save_as')} aria-label={t('img_save_as')} disabled={!decoded || !!busy} onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setMenu({ x: b.left, y: b.bottom + 2, save: true }); }}><Icon name="save" /><Icon name="chevronDown" size={12} /></button>
        <span className="tb-spacer" />
        {!decoded && !error && <span className="muted small imgview-info">{t('img_loading')}</span>}
      </div>
      {dicom && (dicom.frames > 1 || dicom.gray) && (
        <div className="imgview-bar imgview-dicom">
          {dicom.frames > 1 && <>
            <button className="tb-btn tb-icon-only" title={`${t('dcm_prev_frame')} (←)`} aria-label={t('dcm_prev_frame')} onClick={() => dicomFrame(dicom.frame - 1)} disabled={dicom.frame <= 0}><Icon name="chevronLeft" /></button>
            <input type="range" className="imgview-frames" min={0} max={dicom.frames - 1} value={dicom.frame} onChange={(e) => dicomFrame(Number(e.target.value))} title={t('dcm_frame')} />
            <button className="tb-btn tb-icon-only" title={`${t('dcm_next_frame')} (→)`} aria-label={t('dcm_next_frame')} onClick={() => dicomFrame(dicom.frame + 1)} disabled={dicom.frame >= dicom.frames - 1}><Icon name="chevronRight" /></button>
            <span className="imgview-frameno">{t('dcm_frame')} {dicom.frame + 1} / {dicom.frames}</span>
            <button className={`tb-btn tb-icon-only ${playing ? 'on' : ''}`} title={`${t(playing ? 'dcm_pause' : 'dcm_play')} (Space) — ${Math.round(1000 / Math.max(20, Math.min(2000, dicom.frameTime || 100)))} fps`} aria-label={t(playing ? 'dcm_pause' : 'dcm_play')} onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} /></button>
            <button className={`tb-btn tb-icon-only ${sheet ? 'on' : ''}`} title={`${t('dcm_all_frames')} (G)`} aria-label={t('dcm_all_frames')} onClick={() => setSheet((v) => !v)}><Icon name="grid" /></button>
            {dicom.gray && <span className="tb-sep" />}
          </>}
          {dicom.gray && <>
            <select className="imgview-preset" value={dicomPresetId()} onChange={(e) => dicomPreset(e.target.value)} title={t('tip_dcm_preset')}>
              <option value="" disabled>{t('dcm_preset_custom')}</option>
              {dicom.fileWindows.map((w, i) => <option key={`file:${i}`} value={`file:${i}`}>{t('dcm_preset_file')}{w.label ? ` — ${w.label}` : dicom.fileWindows.length > 1 ? ` ${i + 1}` : ''} (C {w.wc} / W {w.ww})</option>)}
              <option value="auto">{t('dcm_preset_auto')}</option>
              {(dicom.presets || []).map((p) => <option key={p.id} value={p.id}>{t(`dcm_preset_${p.id}`)} (C {p.wc} / W {p.ww})</option>)}
            </select>
            <label className="imgview-wl">C <input type="number" value={Math.round(dicom.wc)} onChange={(e) => dicomWindow(Number(e.target.value), dicom.ww)} /></label>
            <label className="imgview-wl">W <input type="number" min={1} value={Math.round(dicom.ww)} onChange={(e) => dicomWindow(dicom.wc, Math.max(1, Number(e.target.value)))} /></label>
            <button className={`tb-btn tb-icon-only ${dicom.invert ? 'on' : ''}`} title={`${t('dcm_invert')} (I)`} aria-label={t('dcm_invert')} onClick={() => applyDicom({ invert: !dicom.invert })}><Icon name="moon" /></button>
            <button className="tb-btn tb-icon-only" title={`${t('dcm_reset_window')} (W)`} aria-label={t('dcm_reset_window')} onClick={() => dicomPreset(dicom.fileWindows.length ? 'file:0' : 'auto')}><Icon name="refresh" /></button>
            <span className="muted small imgview-hint" title={t('tip_dcm_drag')}>{dicom.range ? `${Math.round(dicom.range.min)} … ${Math.round(dicom.range.max)}` : ''}</span>
          </>}
        </div>
      )}
      <div className="imgview-stage" ref={stageRef} onMouseDown={decoded ? onMouseDown : undefined} onDoubleClick={decoded ? onDoubleClick : undefined}
        onContextMenu={(e) => { e.preventDefault(); if (decoded) setMenu({ x: e.clientX, y: e.clientY }); }}
        style={{ cursor: decoded ? 'grab' : undefined }} title={dicom && dicom.gray ? t('tip_dcm_drag') : undefined}>
        {error && <div className="imgview-error"><Icon name="image" size={28} /><div>{t('img_decode_failed', { name })}</div><div className="muted small">{error}</div></div>}
        {decoded && sheet && dicom && (
          <div className="imgview-sheet">
            {Array.from({ length: dicom.frames }, (_, i) => (
              <button type="button" key={i} className={`sheet-cell ${i === dicom.frame ? 'current' : ''}`} onClick={() => pickFrame(i)} title={`${t('dcm_frame')} ${i + 1}`}>
                {sheetUrls[i] ? <img src={sheetUrls[i]} alt={`${i + 1}`} draggable={false} /> : <span className="sheet-wait">…</span>}
                <span className="sheet-no">{i + 1}</span>
              </button>
            ))}
          </div>
        )}
        {decoded && !sheet && (
          <div className="imgview-canvas" style={{ width: Math.max(1, Math.round(imgW * z)), height: Math.max(1, Math.round(imgH * z)) }}>
            <img src={decoded.url} alt={name} draggable={false}
              style={{ width: Math.round(decoded.width * z), height: Math.round(decoded.height * z), transform: `translate(-50%, -50%) rotate(${rot * 90}deg)`, imageRendering: z >= 4 ? 'pixelated' : 'auto' }} />
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.save ? menuItems.filter((it) => it.id && it.id.startsWith('save:')) : menuItems} onClose={() => setMenu(null)} onPick={onPick} />
      )}
      {printDoc && <PrintDialog spec={{ doc: printDoc, setup: spec.prefs && spec.prefs.printSetup, onError: (err) => { if (spec.onError) spec.onError(err, t('print_failed')); } }} done={printDone} />}
    </div>
  );
});

export default ImageView;

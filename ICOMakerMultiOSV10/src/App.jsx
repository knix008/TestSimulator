import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Toolbar from './components/Toolbar.jsx';
import DrawTools from './components/DrawTools.jsx';
import IconCanvas from './components/IconCanvas.jsx';
import RightPanel from './components/RightPanel.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import CanvasInfo from './components/CanvasInfo.jsx';
import StatusBar from './components/StatusBar.jsx';
import AboutDialog from './components/AboutDialog.jsx';
import ErrorDialog from './components/ErrorDialog.jsx';
import {
  DuplicateIcon, BringFrontIcon, SendBackIcon, ForwardIcon, BackwardIcon, TrashIcon,
  FitIcon, ActualIcon, CursorIcon,
} from './components/Icons.jsx';
import { buildIco, buildIcoEach, createObject, uid, ICO_SIZES, CANVAS } from './lib/iconCanvas.js';
import { toDisplayable, ALL_INPUT_EXTS } from './lib/decode.js';
import buildInfo from './build-info.json';

const api = (typeof window !== 'undefined' && window.electronAPI) || null;

function uint8ToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function downloadBlob(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function loadDims(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 512, h: img.naturalHeight || 512 });
    img.onerror = () => reject(new Error('Failed to decode the image.'));
    img.src = src;
  });
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState(() => localStorage.getItem('icomaker.theme') || 'dark');
  const [lang, setLang] = useState(i18n.language || 'ko');

  const [objects, setObjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select');
  const [background, setBackground] = useState('transparent');
  const [bgPad, setBgPad] = useState(0);
  // Default to the smallest size selected; the user adds more as needed.
  const [sizes, setSizes] = useState([Math.min(...ICO_SIZES)]);
  const [perSize, setPerSize] = useState(false);
  const [exportOpacity, setExportOpacity] = useState(100);
  const [zoom, setZoom] = useState(1);

  const [ctx, setCtx] = useState(null); // { x, y, objId }
  const [about, setAbout] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('icomaker.theme', theme);
  }, [theme]);
  useEffect(() => {
    i18n.changeLanguage(lang);
    localStorage.setItem('icomaker.lang', lang);
    document.documentElement.setAttribute('lang', lang);
  }, [lang, i18n]);

  const showError = useCallback((err) => setError(err instanceof Error ? err : new Error(String(err))), []);
  const flash = (msg) => { setToast(msg); setStatusMsg(msg); setTimeout(() => setToast(''), 2600); };

  const sel = objects.find((o) => o.id === selectedId) || null;

  // ── Object ops ──────────────────────────────────────────
  const updateSel = useCallback((patch) => {
    if (!selectedId) return;
    setObjects((prev) => prev.map((o) => (o.id === selectedId ? { ...o, ...patch } : o)));
  }, [selectedId]);
  const updateFx = useCallback((patch) => {
    if (!selectedId) return;
    setObjects((prev) => prev.map((o) => (o.id === selectedId ? { ...o, fx: { ...o.fx, ...patch } } : o)));
  }, [selectedId]);

  const deleteObj = useCallback((id) => {
    setObjects((prev) => prev.filter((o) => o.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const duplicateObj = useCallback((id) => {
    setObjects((prev) => {
      const o = prev.find((x) => x.id === id);
      if (!o) return prev;
      const c = JSON.parse(JSON.stringify(o));
      c.id = uid();
      if (c.type === 'line') { c.x1 += 24; c.y1 += 24; c.x2 += 24; c.y2 += 24; }
      else if (c.type === 'pen') { c.points = c.points.map((p) => [p[0] + 24, p[1] + 24]); }
      else { c.x += 24; c.y += 24; }
      setSelectedId(c.id);
      return [...prev, c];
    });
  }, []);

  const reorder = useCallback((id, dir) => {
    setObjects((prev) => {
      const i = prev.findIndex((o) => o.id === id);
      if (i < 0) return prev;
      const arr = [...prev];
      const [o] = arr.splice(i, 1);
      if (dir === 'front') arr.push(o);
      else if (dir === 'back') arr.unshift(o);
      else if (dir === 'up') arr.splice(Math.min(arr.length, i + 1), 0, o);
      else if (dir === 'down') arr.splice(Math.max(0, i - 1), 0, o);
      return arr;
    });
  }, []);

  // ── Image import (all formats) ──────────────────────────
  const addImageFromSource = useCallback(async (source) => {
    const url = await toDisplayable(source);
    const { w, h } = await loadDims(url);
    const max = 400;
    const s = Math.min(max / w, max / h, 1.5);
    const dw = Math.round(w * s), dh = Math.round(h * s);
    const o = createObject('image', Math.round((CANVAS - dw) / 2), Math.round((CANVAS - dh) / 2));
    o.w = dw; o.h = dh; o.href = url;
    setObjects((prev) => [...prev, o]);
    setSelectedId(o.id);
    setTool('select');
  }, []);

  const onImport = useCallback(async () => {
    try {
      if (api) {
        const imgs = await api.openImages();
        for (const im of imgs) await addImageFromSource({ name: im.name, dataUrl: im.dataUrl });
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) { showError(err); }
  }, [addImageFromSource, showError]);

  const onImageDrop = useCallback(async (files) => {
    try {
      for (const f of files) {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (!ALL_INPUT_EXTS.includes(ext) && !f.type.startsWith('image/')) continue;
        await addImageFromSource({ name: f.name, file: f });
      }
    } catch (err) { showError(err); }
  }, [addImageFromSource, showError]);

  // ── Zoom ────────────────────────────────────────────────
  const zoomIn = () => setZoom((z) => Math.min(6, z * 1.25));
  const zoomOut = () => setZoom((z) => Math.max(0.25, z / 1.25));
  const fit = () => setZoom(1);

  // ── Export ICO ──────────────────────────────────────────
  const doExport = useCallback(async () => {
    if (!objects.length) { showError(new Error(t('export.noContent'))); return; }
    if (!sizes.length) { showError(new Error(t('export.pickSize'))); return; }
    setExporting(true);
    try {
      if (perSize) {
        // One .ico file per selected size.
        const files = await buildIcoEach(objects, { sizes, background, opacity: exportOpacity, bgPad });
        if (api) {
          const saved = await api.saveFiles(files.map((f) => ({ name: f.name, base64: uint8ToBase64(f.bytes) })));
          if (saved) flash(t('export.savedTo', { path: saved }));
        } else {
          const { default: JSZip } = await import('jszip');
          const zip = new JSZip();
          files.forEach((f) => zip.file(f.name, f.bytes));
          const blob = await zip.generateAsync({ type: 'uint8array' });
          downloadBlob(blob, 'icons.zip', 'application/zip');
          flash(t('export.savedZip', { name: 'icons.zip' }));
        }
      } else {
        // Single multi-resolution .ico.
        const bytes = await buildIco(objects, { sizes, background, opacity: exportOpacity, bgPad });
        if (api) {
          const saved = await api.saveBinary({
            defaultName: 'icon.ico',
            base64: uint8ToBase64(bytes),
            filters: [{ name: 'Icon', extensions: ['ico'] }],
          });
          if (saved) flash(t('export.savedTo', { path: saved }));
        } else {
          downloadBlob(bytes, 'icon.ico', 'image/x-icon');
          flash(t('export.savedZip', { name: 'icon.ico' }));
        }
      }
    } catch (err) { showError(err); }
    finally { setExporting(false); }
  }, [objects, sizes, perSize, background, exportOpacity, bgPad, t, showError]);

  // ── About ───────────────────────────────────────────────
  const openAbout = useCallback(async () => {
    try {
      if (api) setAbout({ ...buildInfo, ...(await api.getInfo()) });
      else setAbout({ ...buildInfo, platform: null });
    } catch (err) { showError(err); }
  }, [showError]);

  // ── Keyboard shortcuts ──────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteObj(selectedId); }
      else if (e.key === 'Escape') setSelectedId(null);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedId) { e.preventDefault(); duplicateObj(selectedId); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, deleteObj, duplicateObj]);

  const toggleSize = (s) => setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s].sort((a, b) => a - b)));

  // ── Context menu items (icon + label) ───────────────────
  const ctxItems = () => {
    if (ctx?.objId) {
      const id = ctx.objId;
      return [
        { icon: <DuplicateIcon size={16} />, label: t('ctx.duplicate'), shortcut: 'Ctrl+D', onClick: () => duplicateObj(id) },
        { separator: true },
        { icon: <BringFrontIcon size={16} />, label: t('ctx.front'), onClick: () => reorder(id, 'front') },
        { icon: <ForwardIcon size={16} />, label: t('ctx.forward'), onClick: () => reorder(id, 'up') },
        { icon: <BackwardIcon size={16} />, label: t('ctx.backward'), onClick: () => reorder(id, 'down') },
        { icon: <SendBackIcon size={16} />, label: t('ctx.back'), onClick: () => reorder(id, 'back') },
        { separator: true },
        { icon: <TrashIcon size={16} />, label: t('ctx.delete'), shortcut: 'Del', danger: true, onClick: () => deleteObj(id) },
      ];
    }
    return [
      { icon: <FitIcon size={16} />, label: t('ctx.fit'), onClick: fit },
      { icon: <ActualIcon size={16} />, label: t('ctx.actual'), onClick: () => setZoom(1) },
      { icon: <CursorIcon size={16} />, label: t('ctx.deselect'), onClick: () => setSelectedId(null) },
    ];
  };

  return (
    <div className="app">
      <Toolbar
        hasObjects={objects.length > 0}
        lang={lang}
        onImport={onImport}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fit} onActual={() => setZoom(1)}
        onToggleTheme={() => setTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
        onToggleLang={() => setLang((l) => (l === 'ko' ? 'en' : 'ko'))}
        onExport={doExport}
        onAbout={openAbout}
      />

      <div className="main">
        <aside className="side side-left">
          <DrawTools
            tool={tool} setTool={setTool}
            onImportImage={onImport}
            objects={objects}
            selectedId={selectedId} setSelectedId={setSelectedId}
            onReorder={reorder} onDelete={deleteObj}
          />
        </aside>

        <div className="center">
          <CanvasInfo
            count={objects.length} sizes={sizes}
            background={background} bgPad={bgPad}
            opacity={exportOpacity} perSize={perSize}
          />
          <div className="canvas-host">
            <IconCanvas
              objects={objects} setObjects={setObjects}
              selectedId={selectedId} setSelectedId={setSelectedId}
              tool={tool} setTool={setTool}
              background={background} bgPad={bgPad}
              zoom={zoom} setZoom={setZoom}
              onContextMenu={(e, objId) => setCtx({ x: e.clientX, y: e.clientY, objId })}
              onImageDrop={onImageDrop}
            />
          </div>
        </div>

        <aside className="side side-right">
          <RightPanel
            sel={sel} updateSel={updateSel} updateFx={updateFx}
            background={background} setBackground={setBackground}
            bgPad={bgPad} setBgPad={setBgPad}
            sizes={sizes} toggleSize={toggleSize}
            perSize={perSize} setPerSize={setPerSize}
            exportOpacity={exportOpacity} setExportOpacity={setExportOpacity}
            onExport={doExport} exporting={exporting}
            hasObjects={objects.length > 0}
          />
        </aside>
      </div>

      <StatusBar tool={tool} sel={sel} zoom={zoom} exporting={exporting} statusMsg={statusMsg} />

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems()} onClose={() => setCtx(null)} />}
      {toast && <div className="toast">{toast}</div>}
      <AboutDialog info={about} onClose={() => setAbout(null)} />
      <ErrorDialog error={error} onClose={() => setError(null)} />

      <input
        ref={fileInputRef}
        type="file"
        accept={'image/*,' + ALL_INPUT_EXTS.map((e) => '.' + e).join(',')}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { onImageDrop([...e.target.files]); e.target.value = ''; }}
      />
    </div>
  );
}

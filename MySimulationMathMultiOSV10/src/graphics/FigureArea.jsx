// The figure area (one tab per figure): toolbar, the shown figure, the lights
// panel, ginput / uiwait banners and the inputdlg / listdlg dialogs. The
// state and the engine protocol live in controller.js.
//
//   <FigureArea engine={engine} lang="ko" active defaults={{ grid, rulers }} />
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FigureController } from './controller.js';
import { FigureView } from './FigureView.jsx';
import { FigIcon } from './icons.jsx';
import { tr } from './i18n.js';
import { figureTitle } from './scene.js';
import { readTheme } from './theme.js';
import { exportFigureBytes, frameOf, encodeExport } from './paint.js';
import { ExportDialog } from './ExportDialog.jsx';
import { fileNameFor, formatInfo } from './exportopts.js';
import { bytesToBase64 } from './encode.js';
import { saveBase64, Stepper } from '../views/common';
import { fsApi } from '../lib/backend';
import { Dialog } from '../components/Chrome';
import { ask, toast } from '../lib/ui';
import { chooseFile } from '../lib/prompt';
import { patchSettings, getSettings } from '../lib/settings';
import { printFigure, isPrintDialogOpen } from '../print';
import { openMenu } from '../lib/menu';
import './figures.css';

async function copyImage(bytes) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('The clipboard is not available.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
}

/** Re-reads the theme colours when the app theme changes (CSS variables on <html>). */
function useFigureTheme() {
  const [theme, setTheme] = useState(() => readTheme());
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(readTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'data-mode', 'class'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

function Tb({ icon, label, title, on, onClick, disabled, minor }) {
  return (
    <button type="button" className={`fig-tb ${on ? 'on' : ''} ${minor ? 'minor' : ''}`} title={title || label} aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onClick={onClick}>
      <FigIcon name={icon} size={15} /><span className="fig-tb-label">{label}</span>
    </button>
  );
}

/** One −/+ press of the zoom ratio stepper (the % it would add); read as zoom out / in ×1.25. */
const ZOOM_STEP = 1; // 1 keeps typed values exact (the stepper snaps to whole steps)
/** The value the stepper's − / + produce from v (it snaps to min + k·step, min = 1). */
const zoomBump = (v, dir) => Math.min(100000, Math.max(1, Math.round((v + dir * ZOOM_STEP - 1) / ZOOM_STEP) * ZOOM_STEP + 1));

function InputDialog({ dlg, lang }) {
  const prompts = dlg.prompts || [];
  const [vals, setVals] = useState(() => prompts.map((_, i) => String((dlg.defaults || [])[i] ?? '')));
  const ok = () => dlg.resolve({ values: vals });
  const cancel = () => dlg.resolve({ cancelled: true });
  return (
    <Dialog title={dlg.title || tr(lang, 'input')} icon="edit" onClose={cancel} className="fig-dialog">
      {prompts.map((p, i) => (
        <label key={i} className="fig-dlg-field"><span>{p}</span>
          <input type="text" autoFocus={i === 0} value={vals[i]} onChange={(e) => { const v = vals.slice(); v[i] = e.target.value; setVals(v); }}
            onKeyDown={(e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); }} />
        </label>
      ))}
      <div className="dialog-actions fig-dlg-actions">
        <button type="button" className="vbtn" onClick={cancel}><span>{tr(lang, 'cancel')}</span></button>
        <button type="button" className="vbtn vbtn-primary" onClick={ok}><span>{tr(lang, 'ok')}</span></button>
      </div>
    </Dialog>
  );
}

function ListDialog({ dlg, lang }) {
  const items = dlg.items || [];
  const [sel, setSelState] = useState(() => new Set((dlg.initial || [1]).filter((i) => i >= 1 && i <= items.length)));
  const selRef = useRef(sel);
  const setSel = (s) => { selRef.current = s; setSelState(s); };
  const ok = () => { const cur = selRef.current; dlg.resolve(cur.size ? { indices: [...cur].sort((a, b) => a - b) } : { cancelled: true }); };
  const cancel = () => dlg.resolve({ cancelled: true });
  const pick = (i, e) => {
    const next = new Set(dlg.multiple && (e.ctrlKey || e.metaKey) ? selRef.current : []);
    if (next.has(i) && dlg.multiple) next.delete(i); else next.add(i);
    setSel(next);
  };
  return (
    <Dialog title={dlg.title || tr(lang, 'select')} icon="list" onClose={cancel} className="fig-dialog">
      {dlg.prompt && <p className="fig-dlg-prompt">{dlg.prompt}</p>}
      <div className="fig-dlg-list" role="listbox" aria-multiselectable={!!dlg.multiple}>
        {items.map((s, k) => <div key={k} role="option" aria-selected={sel.has(k + 1)} className={`fig-ui-item ${sel.has(k + 1) ? 'on' : ''}`} onClick={(e) => pick(k + 1, e)} onDoubleClick={() => { setSel(new Set([k + 1])); dlg.resolve({ indices: [k + 1] }); }}>{s}</div>)}
      </div>
      <div className="dialog-actions fig-dlg-actions">
        {dlg.multiple && <button type="button" className="vbtn" onClick={() => setSel(new Set(items.map((_, k) => k + 1)))}><span>{tr(lang, 'selectAll')}</span></button>}
        <span className="spacer" />
        <button type="button" className="vbtn" onClick={cancel}><span>{tr(lang, 'cancel')}</span></button>
        <button type="button" className="vbtn vbtn-primary" onClick={ok}><span>{tr(lang, 'ok')}</span></button>
      </div>
    </Dialog>
  );
}

export function FigureArea({ engine, lang = 'ko', active = true, defaults = {} }) {
  const langRef = useRef(lang);
  langRef.current = lang;
  const ctl = useMemo(() => new FigureController(engine, {
    exportFigure: exportFigureBytes, frame: frameOf, ask, chooseFile, copyImage, toBase64: bytesToBase64,
    lang: () => langRef.current,
    showFigures: () => window.dispatchEvent(new CustomEvent('msm-show-figures')),
    loadExportOpts: () => (getSettings().figures || {}).export || {},
    saveExportOpts: (o) => patchSettings({ figures: { export: o } }),
  }), [engine]);
  const [version, setVersion] = useState(0);
  const theme = useFigureTheme();
  useEffect(() => ctl.subscribe(setVersion), [ctl]);
  useEffect(() => ctl.attach(), [ctl]);
  useEffect(() => { ctl.grid = !!defaults.grid; ctl.rulers = !!defaults.rulers; ctl.axesLines = defaults.axes !== false; ctl.emit(); }, [ctl, defaults.grid, defaults.rulers, defaults.axes]);
  if (typeof window !== 'undefined') window.__msmFigures = ctl;

  const order = ctl.visibleOrder();
  const fig = ctl.figure();
  const figId = fig ? fig.id : null;
  const mode = ctl.mode();
  const is3d = ctl.is3d();
  const L = (k, v) => tr(lang, k, v);

  const setPersist = (key, on) => {
    if (key === 'axes') ctl.setAxesLines(on); else ctl[key === 'grid' ? 'setGrid' : 'setRulers'](on);
    patchSettings({ figures: { [key]: on } });
  };

  /** Saves the export through the app's save dialog (start folder = the last one); download as the fallback. */
  const doSave = async () => {
    const req = ctl.exportRequest();
    if (!fig || !req) return;
    try {
      const out = await encodeExport(fig, req, ctl.paintOptions(fig));
      const name = fileNameFor(req.name, req.format);
      let path = null;
      try { path = await chooseFile({ mode: 'save', title: L('exportTitle'), start: req.folder || engine.cwd || undefined, name, exts: [`.${formatInfo(req.format).ext}`] }); } catch { path = undefined; }
      if (path === null) return; // cancelled
      if (path) {
        const p = String(path).replace(/\\/g, '/');
        await fsApi.writeBytes(p, out.bytes);
        ctl.setExportOpts({ folder: p.slice(0, p.lastIndexOf('/')), name: p.slice(p.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '') });
        toast(L('savedTo', { path: p }));
      } else await saveBase64(name, bytesToBase64(out.bytes), out.mime);
      ctl.closeExport();
    } catch (e) { toast(L('exportFailed', { error: e.message || e }), 'bad'); }
  };
  /** PNG to the clipboard with the dialog's options (transparency kept). */
  // Right-click on a figure: the toolbar actions as an icon menu (icons from components/Chrome.jsx).
  const figureMenu = (e) => {
    e.preventDefault();
    const items = [
      { id: 'zoomOut', label: L('zoomOut'), icon: 'zoomOut' },
      { id: 'zoomIn', label: L('zoomIn'), icon: 'zoomIn' },
      { id: 'reset', label: L('reset'), icon: 'refresh' },
      { sep: true },
      { id: 'pan', label: L('pan'), icon: 'move', on: mode === 'pan' },
      { id: 'rotate', label: L('rotate'), icon: 'rotate', on: mode === 'rotate' },
      { id: 'datacursor', label: L('datacursor'), icon: 'target', on: mode === 'datacursor' },
      { id: 'view', label: is3d ? L('view2d') : L('view3d'), icon: is3d ? 'grid' : 'cube' },
      { sep: true },
      { id: 'grid', label: L('grid'), icon: 'grid', on: ctl.grid },
      { id: 'rulers', label: L('rulers'), icon: 'scale', on: ctl.rulers },
      { id: 'axes', label: L('axesLines'), icon: 'plotLog', on: ctl.axesLines },
      { id: 'legend', label: L('legend'), icon: 'legend', on: ctl.isShown('Legend') },
      { sep: true },
      { id: 'export', label: L('export'), icon: 'download' },
      { id: 'copy', label: L('copy'), icon: 'copy' },
      { id: 'print', label: L('print'), icon: 'print' },
    ];
    openMenu({ x: e.clientX, y: e.clientY }, items, (id) => {
      if (id === 'zoomIn') ctl.zoomBy(1.25);
      else if (id === 'zoomOut') ctl.zoomBy(1 / 1.25);
      else if (id === 'reset') ctl.resetView();
      else if (id === 'pan' || id === 'rotate' || id === 'datacursor') ctl.setMode(id);
      else if (id === 'view') ctl.toggle2d3d();
      else if (id === 'grid' || id === 'rulers') setPersist(id, !ctl[id]);
      else if (id === 'axes') setPersist('axes', !ctl.axesLines);
      else if (id === 'legend') ctl.toggleShown('legend');
      else if (id === 'export') ctl.openExport();
      else if (id === 'copy') doCopy(false);
      else if (id === 'print' && !isPrintDialogOpen()) printFigure(ctl).catch((err) => toast(String((err && err.message) || err), 'bad'));
    });
  };
  const doCopy = async (fromDialog) => {
    const req = ctl.exportRequest(fromDialog ? { format: 'png' } : { format: 'png', target: 'figure' });
    if (!fig || !req) return;
    try {
      const out = await encodeExport(fig, req, ctl.paintOptions(fig));
      await copyImage(out.bytes);
      toast(L('copied'));
    } catch (e) { toast(L('copyFailed', { error: e.message || e }), 'bad'); }
  };

  const ginput = ctl.ginput && ctl.ginput.figId === figId ? ctl.ginput : null;
  const uiwait = ctl.uiwait && ctl.uiwait.figId === figId ? ctl.uiwait : null;
  const dlg = ctl.dialog;
  const zoom = ctl.zoomPercent();

  return (
    <div className="fig-area" data-active={active ? 'true' : 'false'}>
      <div className="fig-tabs" role="tablist">
        {order.map((id) => {
          const f = ctl.figure(id);
          return (
            <div key={id} role="tab" aria-selected={id === figId} className={`fig-tab ${id === figId ? 'on' : ''}`} onClick={() => ctl.selectFigure(id)} title={figureTitle(f, L('figure'))}
              onAuxClick={(e) => { if (e.button === 1) ctl.closeFigure(id); }}>
              <FigIcon name="figure" size={14} /><span className="ellipsis">{figureTitle(f, L('figure'))}</span>
              <button type="button" className="icon-btn close-x fig-tab-x" title={L('closeFig')} aria-label={L('closeFig')} onClick={(e) => { e.stopPropagation(); ctl.closeFigure(id); }}><FigIcon name="close" size={12} /></button>
            </div>
          );
        })}
      </div>
      <div className="fig-toolbar" role="toolbar">
        <span className="fig-zoom" title={L('zoomRatio')}>
          {/* 축소 · ratio · 확대: the stepper's − / + are the zoom buttons (one step = ×1.25); a typed % is applied as is */}
          <Stepper value={zoom} min={1} max={100000} step={ZOOM_STEP} width={58} unit="%" ariaLabel={L('zoomRatio')} disabled={!fig}
            decIcon="zoomOut" incIcon="zoomIn" decTitle={L('zoomOut')} incTitle={L('zoomIn')}
            onChange={(v) => {
              if (v === zoomBump(zoom, 1)) ctl.zoomBy(1.25);
              else if (v === zoomBump(zoom, -1)) ctl.zoomBy(1 / 1.25);
              else ctl.setZoomPercent(v);
            }} />
        </span>
        <Tb icon="reset" label={L('reset')} title={L('reset_tip')} disabled={!fig} onClick={() => ctl.resetView()} />
        <span className="fig-sep" />
        <Tb icon="boxzoom" label={L('boxZoom')} title={L('boxZoom_tip')} on={mode === 'zoom'} disabled={!fig} onClick={() => ctl.setMode('zoom')} minor />
        <Tb icon="pan" label={L('pan')} title={L('pan_tip')} on={mode === 'pan'} disabled={!fig} onClick={() => ctl.setMode('pan')} />
        <Tb icon="rotate" label={L('rotate')} title={L('rotate_tip')} on={mode === 'rotate'} disabled={!fig} onClick={() => ctl.setMode('rotate')} />
        <Tb icon="datacursor" label={L('datacursor')} title={L('datacursor_tip')} on={mode === 'datacursor'} disabled={!fig} onClick={() => ctl.setMode('datacursor')} />
        <span className="fig-sep" />
        {/* Names the action: 3D 보기 while in 2D, 2D 보기 while in 3D. */}
        <Tb icon={is3d ? 'square' : 'cube'} label={is3d ? L('view2d') : L('view3d')} title={L('view_tip')} disabled={!fig} onClick={() => ctl.toggle2d3d()} />
        <span className="fig-sep" />
        <Tb icon="grid" label={L('grid')} title={L('grid_tip')} on={ctl.grid} onClick={() => setPersist('grid', !ctl.grid)} />
        <Tb icon="rulers" label={L('rulers')} title={L('rulers_tip')} on={ctl.rulers} onClick={() => setPersist('rulers', !ctl.rulers)} />
        <Tb icon="axes3" label={L('axesLines')} title={L('axesLines_tip')} on={ctl.axesLines} onClick={() => setPersist('axes', !ctl.axesLines)} />
        <Tb icon="legend" label={L('legend')} title={L('legend_tip')} on={ctl.isShown('Legend')} disabled={!fig} onClick={() => ctl.toggleShown('legend')} minor />
        <Tb icon="colorbar" label={L('colorbar')} title={L('colorbar_tip')} on={ctl.isShown('Colorbar')} disabled={!fig} onClick={() => ctl.toggleShown('colorbar')} minor />
        <span className="fig-sep" />
        <Tb icon="export" label={L('export')} title={L('export_tip')} disabled={!fig} onClick={() => ctl.openExport()} on={!!ctl.exportDlg} />
        <Tb icon="copy" label={L('copy')} title={L('copy_tip')} disabled={!fig} onClick={() => doCopy(false)} minor />
        <Tb icon="print" label={L('print')} title={L('print_tip')} disabled={!fig} onClick={() => { if (!isPrintDialogOpen()) printFigure(ctl).catch((e) => toast(String((e && e.message) || e), 'bad')); }} />
      </div>
      {(ginput || uiwait) && (
        <div className="fig-banner" role="status">
          <FigIcon name={ginput ? 'point' : 'hand'} size={15} />
          <span>{ginput ? L('ginput', { n: ginput.n > 0 ? `${ginput.points.length}/${ginput.n}` : L('ginputAny') }) : L('uiwait')}</span>
          <span className="spacer" />
          <button type="button" className="vbtn" onClick={() => (ginput ? ctl.finishGinput() : ctl.finishUiwait())}><span>{ginput ? L('ok') : L('resume')}</span></button>
        </div>
      )}
      <div className="fig-body">
        {fig ? <FigureView key={fig.id} ctl={ctl} fig={fig} lang={lang} theme={theme} version={version} onMenu={figureMenu} />
          : (
            <div className="empty empty-big fig-empty">
              <span className="empty-icon"><FigIcon name="figure" size={26} /></span>
              <strong>{L('noFigures')}</strong>
              <span className="small">{L('noFiguresHint')}</span>
            </div>
          )}
      </div>
      {ctl.exportDlg && fig && <ExportDialog ctl={ctl} lang={lang} version={version} onSave={doSave} onCopy={() => doCopy(true)} />}
      {dlg && typeof document !== 'undefined' && createPortal(dlg.kind === 'listdlg' ? <ListDialog dlg={dlg} lang={lang} /> : <InputDialog dlg={dlg} lang={lang} />, document.body)}
    </div>
  );
}

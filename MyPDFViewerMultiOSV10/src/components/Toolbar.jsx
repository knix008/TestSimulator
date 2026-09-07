import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  IconOpen, IconUrl, IconRecent, IconSave, IconSaveAs, IconUndo, IconRedo, IconCopy,
  IconSelectAll, IconMarquee, IconImage, IconText, IconHighlight, IconBookmark,
  IconFirst, IconPrev, IconNext, IconLast, IconZoomIn, IconZoomOut, IconFitWidth,
  IconFitPage, IconActual, IconRotateLeft, IconRotateRight, IconSearch, IconSidebar,
  IconSettings, IconInfo, IconLang, IconTheme, IconTrash, IconDown, IconLayout, IconFolder,
  IconSelectText, IconPrint,
} from './Icons.jsx';
import { THEMES } from '../lib/themes.js';

// Every toolbar control carries a `title`, which the global Tooltip component
// turns into a fast custom tooltip.
function ToolButton({ icon: Icon, label, tip, onClick, disabled, active, showLabel }) {
  return (
    <button
      className={`tbtn${active ? ' active' : ''}${showLabel ? ' with-label' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={tip || label}
      aria-label={label}
    >
      <Icon size={18} />
      {showLabel ? <span className="tbtn-label">{label}</span> : null}
    </button>
  );
}

// A toolbar button that opens a small popup menu below itself.
//
// The menu is rendered into <body> through a portal: the toolbar scrolls
// horizontally, and an overflow container clips absolutely positioned
// children — which silently hid the whole recent-files list.
function MenuButton({ icon: Icon, label, tip, disabled, showLabel, children, width = 300 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(6, Math.min(r.left, window.innerWidth - width - 6));
    setPos({ left, top: r.bottom + 6, maxHeight: Math.max(180, window.innerHeight - r.bottom - 20) });
  }, [width]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const reflow = () => place();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reflow);
    // Any scroll (the toolbar's own, or the page area) moves the anchor.
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open, place]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    place();
    setOpen(true);
  };

  return (
    <span className="menu-wrap">
      <button
        ref={btnRef}
        className={`tbtn${open ? ' active' : ''}${showLabel ? ' with-label' : ''}`}
        onClick={toggle}
        disabled={disabled}
        title={tip || label}
        aria-label={label}
        aria-expanded={open}
      >
        <Icon size={18} />
        {showLabel ? <span className="tbtn-label">{label}</span> : null}
        <IconDown size={11} />
      </button>
      {open && pos ? createPortal(
        <div
          ref={popRef}
          className="dropdown"
          style={{ left: pos.left, top: pos.top, width, maxHeight: pos.maxHeight }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>,
        document.body
      ) : null}
    </span>
  );
}

export default function Toolbar({
  settings, doc, pageNumber, numPages, scale, hasSelection, dirty,
  history, tool, onTool, panel,
  onOpen, onOpenUrl, onOpenRecent, onRemoveRecent, onClearRecent,
  onSave, onSaveAs, onCopyText, onSelectPage, onExtractImages, onExportText,
  onHighlight, onBookmark,
  onGoToPage, onZoom, onZoomMode, onRotate, onLayout,
  onSearch, onTogglePanel, onTheme, onLang, onSettings, onAbout, onPrint,
}) {
  const { t } = useTranslation();
  const [pageInput, setPageInput] = useState(String(pageNumber));
  const showLabel = settings.showToolbarLabels;

  useEffect(() => { setPageInput(String(pageNumber)); }, [pageNumber]);

  const commitPage = () => {
    const n = parseInt(pageInput, 10);
    if (Number.isFinite(n) && n >= 1 && n <= numPages) onGoToPage(n);
    else setPageInput(String(pageNumber));
  };

  const zoomPercent = Math.round(scale * 100);

  return (
    <div className="toolbar">
      {/* One row, always. Commands are grouped by kind behind a menu button —
          File, Copy, View — and only the everyday ones sit out here. */}
      <div className="toolbar-scroll">

      {/* File */}
      <div className="toolbar-group">
        <MenuButton icon={IconFolder} label={t('toolbar.fileMenu')} tip={t('tip.fileMenu')} showLabel={showLabel} width={430}>
          <ul className="dd-list">
            <li><button className="dd-item" onClick={onOpen} title={t('tip.open')}>
              <IconOpen size={15} /><span className="dd-name wide">{t('toolbar.open')}</span><span className="dd-key">Ctrl+O</span></button></li>
            <li><button className="dd-item" onClick={onOpenUrl} title={t('tip.openUrl')}>
              <IconUrl size={15} /><span className="dd-name wide">{t('toolbar.openUrl')}</span></button></li>
            <li><button className="dd-item" onClick={onSave} disabled={!doc} title={t('tip.save')}>
              <IconSave size={15} /><span className="dd-name wide">{t('toolbar.save')}</span><span className="dd-key">Ctrl+S</span></button></li>
            <li><button className="dd-item" onClick={onSaveAs} disabled={!doc} title={t('tip.saveAs')}>
              <IconSaveAs size={15} /><span className="dd-name wide">{t('toolbar.saveAs')}</span></button></li>
            <li><button className="dd-item" onClick={onExportText} disabled={!doc} title={t('tip.exportText')}>
              <IconText size={15} /><span className="dd-name wide">{t('toolbar.exportText')}</span></button></li>
            <li><button className="dd-item" onClick={onPrint} disabled={!doc} title={t('tip.print')}>
              <IconPrint size={15} /><span className="dd-name wide">{t('toolbar.print')}</span><span className="dd-key">Ctrl+P</span></button></li>
          </ul>

          <div className="dd-head">
            <span>{t('recent.title')}</span>
            {settings.recentFiles.length ? (
              <button
                className="linkish"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onClearRecent(); }}
                title={t('settings.clearRecent')}
              >
                <IconTrash size={13} /> {t('recent.clear')}
              </button>
            ) : null}
          </div>
          {settings.recentFiles.length === 0 ? (
            <p className="dd-empty">{t('recent.empty')}</p>
          ) : (
            <ul className="dd-list">
              {settings.recentFiles.map((f) => (
                <li key={f.path || f.name}>
                  <button className="dd-item" onClick={() => onOpenRecent(f)} title={f.path || f.name}>
                    <IconRecent size={15} />
                    <span className="dd-name">{f.name}</span>
                    <span className="dd-dir">{f.dir || ''}</span>
                  </button>
                  <button
                    className="icon-btn"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onRemoveRecent(f.path || f.name); }}
                    title={t('recent.remove')}
                  >
                    <IconTrash size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </MenuButton>

        {/* Printing stays out here: it is asked for often and is easy to miss
            inside a menu. Everything else about files lives in the menu. */}
        <ToolButton icon={IconPrint} label={t('toolbar.print')} tip={t('tip.print')} onClick={onPrint} disabled={!doc} showLabel={showLabel} />
      </div>

      <div className="toolbar-sep" />

      {/* Undo / redo */}
      <div className="toolbar-group">
        <ToolButton
          icon={IconUndo}
          label={t('toolbar.undo')}
          tip={history.canUndo && history.undoLabel ? `${t('toolbar.undo')}: ${history.undoLabel}` : t('tip.undo')}
          onClick={history.undo}
          disabled={!history.canUndo}
          showLabel={showLabel}
        />
        <ToolButton
          icon={IconRedo}
          label={t('toolbar.redo')}
          tip={history.canRedo && history.redoLabel ? `${t('toolbar.redo')}: ${history.redoLabel}` : t('tip.redo')}
          onClick={history.redo}
          disabled={!history.canRedo}
          showLabel={showLabel}
        />
      </div>

      <div className="toolbar-sep" />

      {/* Mouse tool — three mutually exclusive choices, always labelled so text,
          image and region selection are told apart at a glance. */}
      <div className="toolbar-group tool-picker" role="radiogroup" aria-label={t('toolbar.toolGroup')}>
        {[
          { id: 'text', icon: IconSelectText, label: t('toolbar.toolText'), tip: t('tip.textTool') },
          { id: 'image', icon: IconImage, label: t('toolbar.toolImage'), tip: t('tip.imageTool') },
          { id: 'region', icon: IconMarquee, label: t('toolbar.toolRegion'), tip: t('tip.regionTool') },
        ].map((item) => (
          <button
            key={item.id}
            className={`tbtn tool-btn${tool === item.id ? ' active' : ''}`}
            onClick={() => onTool(item.id)}
            disabled={!doc}
            title={item.tip}
            aria-label={item.label}
            role="radio"
            aria-checked={tool === item.id}
          >
            <item.icon size={18} />
            <span className="tbtn-label">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      {/* Copying */}
      <div className="toolbar-group">
        <ToolButton icon={IconCopy} label={t('toolbar.copyText')} tip={t('tip.copyText')} onClick={onCopyText} disabled={!hasSelection} showLabel={showLabel} />
        <MenuButton icon={IconSelectAll} label={t('toolbar.copyMenu')} tip={t('tip.copyMenu')} showLabel={showLabel} width={260}>
          <ul className="dd-list">
            <li><button className="dd-item" onClick={onSelectPage} disabled={!doc} title={t('tip.selectAll')}>
              <IconSelectAll size={15} /><span className="dd-name wide">{t('toolbar.selectAll')}</span><span className="dd-key">Ctrl+A</span></button></li>
            <li><button className="dd-item" onClick={onHighlight} disabled={!hasSelection} title={t('tip.highlight')}>
              <IconHighlight size={15} /><span className="dd-name wide">{t('toolbar.highlight')}</span></button></li>
            <li><button className="dd-item" onClick={() => onExtractImages(pageNumber)} disabled={!doc} title={t('tip.images')}>
              <IconImage size={15} /><span className="dd-name wide">{t('toolbar.images')}</span></button></li>
            <li><button className="dd-item" onClick={onBookmark} disabled={!doc} title={t('menu.addBookmark')}>
              <IconBookmark size={15} /><span className="dd-name wide">{t('menu.addBookmark')}</span></button></li>
          </ul>
        </MenuButton>
      </div>

      <div className="toolbar-sep" />

      {/* Navigation */}
      <div className="toolbar-group">
        <ToolButton icon={IconPrev} label={t('toolbar.prevPage')} tip={t('toolbar.prevPage')} onClick={() => onGoToPage(pageNumber - 1)} disabled={!doc || pageNumber <= 1} />
        <span className="page-box">
          <input
            className="page-input"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={commitPage}
            onKeyDown={(e) => { if (e.key === 'Enter') commitPage(); }}
            disabled={!doc}
            title={t('tip.page')}
            aria-label={t('tip.page')}
          />
          <span className="page-total">/ {numPages || 0}</span>
        </span>
        <ToolButton icon={IconNext} label={t('toolbar.nextPage')} tip={t('toolbar.nextPage')} onClick={() => onGoToPage(pageNumber + 1)} disabled={!doc || pageNumber >= numPages} />
      </div>

      <div className="toolbar-sep" />

      {/* Zoom, with the rest of the view commands in one menu */}
      <div className="toolbar-group">
        <ToolButton icon={IconZoomOut} label={t('toolbar.zoomOut')} tip={t('tip.zoomOut')} onClick={() => onZoom(-1)} disabled={!doc} />
        <select
          className="zoom-select"
          value={settings.zoomMode === 'custom' ? 'custom' : settings.zoomMode}
          onChange={(e) => onZoomMode(e.target.value)}
          disabled={!doc}
          title={t('tip.zoom')}
          aria-label={t('tip.zoom')}
        >
          <option value="fit-width">{t('toolbar.fitWidth')}</option>
          <option value="fit-page">{t('toolbar.fitPage')}</option>
          <option value="actual">{t('toolbar.actual')}</option>
          <option value="custom">{zoomPercent}%</option>
        </select>
        <ToolButton icon={IconZoomIn} label={t('toolbar.zoomIn')} tip={t('tip.zoomIn')} onClick={() => onZoom(1)} disabled={!doc} />

        <MenuButton icon={IconLayout} label={t('toolbar.viewMenu')} tip={t('tip.viewMenu')} showLabel={showLabel} width={260}>
          <ul className="dd-list">
            <li><button className={`dd-item${settings.zoomMode === 'fit-width' ? ' active' : ''}`} onClick={() => onZoomMode('fit-width')} disabled={!doc} title={t('tip.fitWidth')}>
              <IconFitWidth size={15} /><span className="dd-name wide">{t('toolbar.fitWidth')}</span></button></li>
            <li><button className={`dd-item${settings.zoomMode === 'fit-page' ? ' active' : ''}`} onClick={() => onZoomMode('fit-page')} disabled={!doc} title={t('tip.fitPage')}>
              <IconFitPage size={15} /><span className="dd-name wide">{t('toolbar.fitPage')}</span></button></li>
            <li><button className={`dd-item${settings.zoomMode === 'actual' ? ' active' : ''}`} onClick={() => onZoomMode('actual')} disabled={!doc} title={t('tip.actual')}>
              <IconActual size={15} /><span className="dd-name wide">{t('toolbar.actual')}</span><span className="dd-key">Ctrl+0</span></button></li>
            <li><button className="dd-item" onClick={() => onRotate(-90)} disabled={!doc} title={t('tip.rotateLeft')}>
              <IconRotateLeft size={15} /><span className="dd-name wide">{t('toolbar.rotateLeft')}</span></button></li>
            <li><button className="dd-item" onClick={() => onRotate(90)} disabled={!doc} title={t('tip.rotateRight')}>
              <IconRotateRight size={15} /><span className="dd-name wide">{t('toolbar.rotateRight')}</span></button></li>
            <li><button className={`dd-item${settings.pageLayout === 'continuous' ? ' active' : ''}`} onClick={onLayout} disabled={!doc}
              title={`${t('toolbar.layout')}: ${settings.pageLayout === 'single' ? t('settings.single') : t('settings.continuous')}`}>
              <IconLayout size={15} /><span className="dd-name wide">{t('toolbar.layout')}</span></button></li>
            <li><button className="dd-item" onClick={() => onGoToPage(1)} disabled={!doc || pageNumber <= 1} title={t('toolbar.firstPage')}>
              <IconFirst size={15} /><span className="dd-name wide">{t('toolbar.firstPage')}</span></button></li>
            <li><button className="dd-item" onClick={() => onGoToPage(numPages)} disabled={!doc || pageNumber >= numPages} title={t('toolbar.lastPage')}>
              <IconLast size={15} /><span className="dd-name wide">{t('toolbar.lastPage')}</span></button></li>
          </ul>
        </MenuButton>
      </div>
      </div>

      {/* View & app — pinned to the right edge, always visible */}
      <div className="toolbar-right">
        <ToolButton icon={IconSearch} label={t('toolbar.search')} tip={t('tip.search')} onClick={onSearch} disabled={!doc} active={panel === 'search'} />
        <ToolButton icon={IconSidebar} label={t('toolbar.sidebar')} tip={t('tip.sidebar')} onClick={onTogglePanel} active={panel !== 'none'} />

        <MenuButton icon={IconTheme} label={t('toolbar.theme')} tip={t('tip.theme')} width={210}>
          <ul className="dd-list themes">
            {THEMES.map((th) => (
              <li key={th.id}>
                <button
                  className={`dd-item${settings.theme === th.id ? ' active' : ''}`}
                  onClick={() => onTheme(th.id)}
                  title={th.id}
                >
                  <span className="theme-swatch small">
                    {th.bars.map((c, i) => <i key={i} style={{ background: c }} />)}
                  </span>
                  <span className="dd-name wide">{th.id}</span>
                </button>
              </li>
            ))}
          </ul>
        </MenuButton>

        <ToolButton icon={IconLang} label={t('toolbar.lang')} tip={t('tip.lang')} onClick={onLang} />
        <ToolButton icon={IconSettings} label={t('toolbar.settings')} tip={t('tip.settings')} onClick={onSettings} />
        <ToolButton icon={IconInfo} label={t('toolbar.about')} tip={t('tip.about')} onClick={onAbout} />
      </div>
    </div>
  );
}

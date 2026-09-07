import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  IconOpen, IconUrl, IconRecent, IconSave, IconSaveAs, IconUndo, IconRedo, IconCopy,
  IconSelectAll, IconMarquee, IconImage, IconText, IconHighlight, IconBookmark,
  IconFirst, IconPrev, IconNext, IconLast, IconZoomIn, IconZoomOut, IconFitWidth,
  IconFitPage, IconActual, IconRotateLeft, IconRotateRight, IconSearch, IconSidebar,
  IconSettings, IconInfo, IconLang, IconTheme, IconTrash, IconDown, IconLayout, IconFolder,
  IconSelectText,
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
  onSearch, onTogglePanel, onTheme, onLang, onSettings, onAbout,
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
      {/* Everything before the app group scrolls horizontally when the window
          is too narrow, so Settings and About are never pushed out of sight. */}
      <div className="toolbar-scroll">
      {/* File */}
      <div className="toolbar-group">
        <ToolButton icon={IconOpen} label={t('toolbar.open')} tip={t('tip.open')} onClick={onOpen} showLabel={showLabel} />
        <ToolButton icon={IconUrl} label={t('toolbar.openUrl')} tip={t('tip.openUrl')} onClick={onOpenUrl} showLabel={showLabel} />

        <MenuButton icon={IconRecent} label={t('toolbar.recent')} tip={t('tip.recent')} showLabel={showLabel} width={430}>
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
                    <IconFolder size={15} />
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

        <ToolButton icon={IconSave} label={t('toolbar.save')} tip={t('tip.save')} onClick={onSave} disabled={!doc} active={dirty} showLabel={showLabel} />
        <ToolButton icon={IconSaveAs} label={t('toolbar.saveAs')} tip={t('tip.saveAs')} onClick={onSaveAs} disabled={!doc} showLabel={showLabel} />
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

      {/* Mouse tool — three separate, mutually exclusive choices, always
          labelled so text / image / region selection are told apart at a glance. */}
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

      {/* Copy tools */}
      <div className="toolbar-group">
        <ToolButton icon={IconCopy} label={t('toolbar.copyText')} tip={t('tip.copyText')} onClick={onCopyText} disabled={!hasSelection} showLabel={showLabel} />
        <ToolButton icon={IconSelectAll} label={t('toolbar.selectAll')} tip={t('tip.selectAll')} onClick={onSelectPage} disabled={!doc} showLabel={showLabel} />
        <ToolButton icon={IconImage} label={t('toolbar.images')} tip={t('tip.images')} onClick={() => onExtractImages(pageNumber)} disabled={!doc} showLabel={showLabel} />
        <ToolButton icon={IconText} label={t('toolbar.exportText')} tip={t('tip.exportText')} onClick={onExportText} disabled={!doc} showLabel={showLabel} />
        <ToolButton icon={IconHighlight} label={t('toolbar.highlight')} tip={t('tip.highlight')} onClick={onHighlight} disabled={!hasSelection} showLabel={showLabel} />
        <ToolButton icon={IconBookmark} label={t('menu.addBookmark')} tip={t('menu.addBookmark')} onClick={onBookmark} disabled={!doc} showLabel={showLabel} />
      </div>

      <div className="toolbar-sep" />

      {/* Navigation */}
      <div className="toolbar-group">
        <ToolButton icon={IconFirst} label={t('toolbar.firstPage')} tip={t('toolbar.firstPage')} onClick={() => onGoToPage(1)} disabled={!doc || pageNumber <= 1} />
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
        <ToolButton icon={IconLast} label={t('toolbar.lastPage')} tip={t('toolbar.lastPage')} onClick={() => onGoToPage(numPages)} disabled={!doc || pageNumber >= numPages} />
      </div>

      <div className="toolbar-sep" />

      {/* Zoom & rotation */}
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
        <ToolButton icon={IconFitWidth} label={t('toolbar.fitWidth')} tip={t('tip.fitWidth')} onClick={() => onZoomMode('fit-width')} disabled={!doc} active={settings.zoomMode === 'fit-width'} />
        <ToolButton icon={IconFitPage} label={t('toolbar.fitPage')} tip={t('tip.fitPage')} onClick={() => onZoomMode('fit-page')} disabled={!doc} active={settings.zoomMode === 'fit-page'} />
        <ToolButton icon={IconActual} label={t('toolbar.actual')} tip={t('tip.actual')} onClick={() => onZoomMode('actual')} disabled={!doc} active={settings.zoomMode === 'actual'} />
        <ToolButton icon={IconRotateLeft} label={t('toolbar.rotateLeft')} tip={t('tip.rotateLeft')} onClick={() => onRotate(-90)} disabled={!doc} />
        <ToolButton icon={IconRotateRight} label={t('toolbar.rotateRight')} tip={t('tip.rotateRight')} onClick={() => onRotate(90)} disabled={!doc} />
        <ToolButton
          icon={IconLayout}
          label={t('toolbar.layout')}
          tip={`${t('toolbar.layout')}: ${settings.pageLayout === 'single' ? t('settings.single') : t('settings.continuous')}`}
          onClick={onLayout}
          disabled={!doc}
          active={settings.pageLayout === 'continuous'}
        />
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
                  <span className="dd-name">{th.id}</span>
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

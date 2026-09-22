import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  IconOpen, IconUrl, IconRecent, IconSave, IconSaveAs, IconUndo, IconRedo, IconCopy, IconClip,
  IconSelectAll, IconMarquee, IconImage, IconText, IconHighlight, IconBookmark, IconComment,
  IconFirst, IconPrev, IconNext, IconLast, IconZoomIn, IconZoomOut, IconFitWidth,
  IconFitPage, IconActual, IconRotateLeft, IconRotateRight, IconSearch, IconSidebar,
  IconSettings, IconInfo, IconFlag, IconTheme, IconTrash, IconDown, IconLayout, IconFolder,
  IconSelectText, IconPrint,
} from './Icons.jsx';
import { THEMES, nextTheme } from '../lib/themes.js';
import { LANGUAGES } from '../i18n.js';
import { api, isElectron } from '../lib/platform.js';

// The window must never be narrow enough to hide a toolbar button. How much the
// row needs depends on the language, the UI font and whether button labels are
// shown, so it is measured from the laid-out toolbar and handed to the main
// process as the window's minimum width rather than guessed as a constant.
function useToolbarMinWidth(barRef, scrollRef, deps) {
  const last = useRef(0);

  const measure = useCallback(() => {
    if (!isElectron) return;
    const bar = barRef.current;
    const scroll = scrollRef.current;
    if (!bar || !scroll) return;
    const kids = [...scroll.children];
    if (!kids.length) return;
    const gap = parseFloat(getComputedStyle(scroll).columnGap) || 0;
    // Every group is `flex: none`, so its laid-out width is its natural width
    // even while the row is scrolled — the sum is what the row really wants.
    // Margins have to be added by hand: a border box does not include them, and
    // the separators carry 6px on each side, which is most of a button.
    const content = kids.reduce((w, el) => {
      const cs = getComputedStyle(el);
      return w + el.getBoundingClientRect().width
        + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
    }, 0) + gap * (kids.length - 1);
    // Everything else on the row: the toolbar's own padding, the gap and the
    // app group pinned to the right.
    const chrome = bar.getBoundingClientRect().width - scroll.getBoundingClientRect().width;
    const needed = Math.ceil(chrome + content) + 2;
    if (!Number.isFinite(needed) || needed <= 0) return;
    if (Math.abs(needed - last.current) < 2) return;
    last.current = needed;
    api?.win?.setMinWidth?.(needed)?.catch?.(() => {});
  }, [barRef, scrollRef]);

  // Anything that changes a label — language, the label toggle, the UI font —
  // changes the answer, and so does a font that only finishes loading later.
  useLayoutEffect(() => {
    measure();
    let cancelled = false;
    document.fonts?.ready?.then(() => { if (!cancelled) measure(); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);
}

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
// Pass `onAction` to split the control: the icon runs that action (cycle a
// theme, …) and only the chevron on the right opens the menu.
//
// The menu is rendered into <body> through a portal: the toolbar scrolls
// horizontally, and an overflow container clips absolutely positioned
// children — which silently hid the whole recent-files list.
function MenuButton({
  icon: Icon, label, tip, menuTip, disabled, showLabel, children, width = 300, onAction,
  constrain = true, overflowWindow = false, menuValue,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    const pop = popRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = pop?.offsetWidth || width;
    const h = pop?.offsetHeight || 0;
    let left = r.left;
    let top = r.bottom + 6;
    if (constrain) {
      left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6));
      if (h && top + h > window.innerHeight - 6) {
        const above = r.top - h - 6;
        top = above >= 6 ? above : Math.max(6, window.innerHeight - h - 6);
      }
    }
    setPos({ left, top });
  }, [constrain, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const reflow = () => place();
    place();
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

  const openDetached = () => {
    if (!overflowWindow || !isElectron || !api.win?.openThemePopup) return false;
    const el = btnRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    void (async () => {
      const bounds = await api.win.getContentBounds?.();
      if (!bounds) {
        place();
        setOpen(true);
        return;
      }
      await api.win.openThemePopup({
        x: bounds.x + r.left,
        y: bounds.y + r.bottom + 6,
        aboveY: bounds.y + r.top,
        width,
        current: menuValue,
      });
    })();
    return true;
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    if (openDetached()) return;
    place();
    setOpen(true);
  };

  const split = typeof onAction === 'function';

  return (
    <span className={`menu-wrap${split ? ' split' : ''}`} ref={btnRef}>
      {split ? (
        <>
          <button
            className={`tbtn${showLabel ? ' with-label' : ''}`}
            onClick={() => { setOpen(false); onAction(); }}
            disabled={disabled}
            title={tip || label}
            aria-label={label}
          >
            <Icon size={18} />
            {showLabel ? <span className="tbtn-label">{label}</span> : null}
          </button>
          <button
            className={`tbtn chevron${open ? ' active' : ''}`}
            onClick={toggle}
            disabled={disabled}
            title={menuTip || tip || label}
            aria-label={menuTip || label}
            aria-expanded={open}
            aria-haspopup="listbox"
          >
            <IconDown size={11} />
          </button>
        </>
      ) : (
        <button
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
      )}
      {open && pos ? createPortal(
        <div
          ref={popRef}
          className="dropdown"
          style={{ left: pos.left, top: pos.top, width }}
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
  onSave, onSaveAs, onSaveWorkspace, onSaveWorkspaceAs, onAttachFile,
  onCopyText, onSelectPage, onExtractImages, onExportText,
  onHighlight, onComment, onComments, onBookmarks, onBookmark,
  onGoToPage, onZoom, onZoomMode, onRotate, onLayout,
  onSearch, onTogglePanel, onTheme, onLang, onSettings, onAbout, onPrint,
}) {
  const { t, i18n } = useTranslation();
  const [pageInput, setPageInput] = useState(String(pageNumber));
  const showLabel = settings.showToolbarLabels;
  const barRef = useRef(null);
  const scrollRef = useRef(null);

  useToolbarMinWidth(barRef, scrollRef, [
    showLabel, i18n.language, settings.fontFamily, settings.fontSize,
    settings.fontWeight, settings.fontStyle, !!doc, numPages,
  ]);

  useEffect(() => { setPageInput(String(pageNumber)); }, [pageNumber]);

  useEffect(() => {
    if (!isElectron || !api.win?.onThemePicked) return undefined;
    return api.win.onThemePicked((id) => onTheme(id));
  }, [onTheme]);

  const commitPage = () => {
    const n = parseInt(pageInput, 10);
    if (Number.isFinite(n) && n >= 1 && n <= numPages) onGoToPage(n);
    else setPageInput(String(pageNumber));
  };

  const zoomPercent = Math.round(scale * 100);

  return (
    <div className="toolbar" ref={barRef}>
      {/* One row, always. Commands are grouped by kind behind a menu button —
          File, Copy, View — and only the everyday ones sit out here. */}
      <div className="toolbar-scroll" ref={scrollRef}>

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
            {onAttachFile ? (
              <li><button className="dd-item" onClick={onAttachFile} disabled={!doc} title={t('tip.attach')}>
                <IconClip size={15} /><span className="dd-name wide">{t('toolbar.attach')}</span></button></li>
            ) : null}
            {onSaveWorkspace ? (
              <li><button className="dd-item" onClick={onSaveWorkspace} disabled={!doc} title={t('tip.saveWorkspace')}>
                <IconSave size={15} /><span className="dd-name wide">{t('toolbar.saveWorkspace')}</span></button></li>
            ) : null}
            {onSaveWorkspaceAs ? (
              <li><button className="dd-item" onClick={onSaveWorkspaceAs} disabled={!doc} title={t('tip.saveWorkspaceAs')}>
                <IconSaveAs size={15} /><span className="dd-name wide">{t('toolbar.saveWorkspaceAs')}</span></button></li>
            ) : null}
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

      {/* Copy, markup and the left-panel tools that belong on the bar. */}
      <div className="toolbar-group">
        <ToolButton icon={IconCopy} label={t('toolbar.copyText')} tip={t('tip.copyText')} onClick={onCopyText} disabled={!hasSelection} showLabel={showLabel} />
        <ToolButton icon={IconHighlight} label={t('toolbar.highlight')} tip={t('tip.highlight')} onClick={onHighlight} disabled={!hasSelection} showLabel={showLabel} />
        <ToolButton
          icon={IconComment}
          label={t('toolbar.comments')}
          tip={t('tip.comments')}
          onClick={onComments}
          disabled={!doc}
          active={panel === 'comments'}
          showLabel={showLabel}
        />
        <ToolButton
          icon={IconBookmark}
          label={t('toolbar.bookmarks')}
          tip={t('tip.bookmarks')}
          onClick={onBookmarks}
          disabled={!doc}
          active={panel === 'bookmarks'}
          showLabel={showLabel}
        />
        <ToolButton
          icon={IconSearch}
          label={t('toolbar.search')}
          tip={t('tip.search')}
          onClick={onSearch}
          disabled={!doc}
          active={panel === 'search'}
          showLabel={showLabel}
        />
        <MenuButton icon={IconSelectAll} label={t('toolbar.copyMenu')} tip={t('tip.copyMenu')} showLabel={showLabel} width={260}>
          <ul className="dd-list">
            <li><button className="dd-item" onClick={onSelectPage} disabled={!doc} title={t('tip.selectAll')}>
              <IconSelectAll size={15} /><span className="dd-name wide">{t('toolbar.selectAll')}</span><span className="dd-key">Ctrl+A</span></button></li>
            <li><button className="dd-item" onClick={onHighlight} disabled={!hasSelection} title={t('tip.highlight')}>
              <IconHighlight size={15} /><span className="dd-name wide">{t('toolbar.highlight')}</span></button></li>
            <li><button className="dd-item" onClick={onComment} disabled={!hasSelection} title={t('tip.comment')}>
              <IconComment size={15} /><span className="dd-name wide">{t('menu.comment')}</span></button></li>
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

        <MenuButton
          icon={IconTheme}
          label={t('toolbar.theme')}
          tip={t('tip.theme', { name: nextTheme(settings.theme) })}
          menuTip={t('tip.themePick')}
          width={210}
          constrain={false}
          overflowWindow
          menuValue={settings.theme}
          onAction={() => onTheme(nextTheme(settings.theme))}
        >
          <ul className="dd-list themes" role="listbox" aria-label={t('toolbar.theme')}>
            {THEMES.map((th) => (
              <li key={th.id}>
                <button
                  className={`dd-item${settings.theme === th.id ? ' active' : ''}`}
                  onClick={() => onTheme(th.id)}
                  title={th.id}
                  role="option"
                  aria-selected={settings.theme === th.id}
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

        <MenuButton
          icon={(p) => <IconFlag lang={settings.lang} {...p} />}
          label={t('toolbar.lang')}
          tip={t('tip.lang')}
          menuTip={t('tip.langPick')}
          width={180}
          onAction={() => onLang()}
        >
          <ul className="dd-list" role="listbox" aria-label={t('toolbar.lang')}>
            {LANGUAGES.map((lng) => (
              <li key={lng.id}>
                <button
                  className={`dd-item${settings.lang === lng.id ? ' active' : ''}`}
                  onClick={() => onLang(lng.id)}
                  title={lng.native}
                  role="option"
                  aria-selected={settings.lang === lng.id}
                >
                  <IconFlag lang={lng.id} size={18} />
                  <span className="dd-name wide">{lng.native}</span>
                </button>
              </li>
            ))}
          </ul>
        </MenuButton>
        <ToolButton icon={IconSettings} label={t('toolbar.settings')} tip={t('tip.settings')} onClick={onSettings} />
        <ToolButton icon={IconInfo} label={t('toolbar.about')} tip={t('tip.about')} onClick={onAbout} />
      </div>
    </div>
  );
}

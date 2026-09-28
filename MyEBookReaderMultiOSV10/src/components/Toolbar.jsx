import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconOpen, IconSave, IconPrint, IconUndo, IconRedo, IconBookmarkAdd, IconHighlight,
  IconNote, IconSearch, IconPrev, IconNext, IconTextSize, IconZoomIn, IconZoomOut,
  IconPanelLeft, IconPanelRight, IconTheme, IconSettings, IconInfo, IconFlag,
  IconFolder, IconContents, IconLayout, IconBookmark, IconScroll, IconPaged, IconDown,
  IconActual, IconColumns, IconLibrary, IconImage, IconFitWidth, IconFitPage, IconFitHeight,
  IconPageTurn,
} from './Icons.jsx';
import { nextTheme } from '../lib/themes.js';
import { otherLang } from '../i18n.js';
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
    const content = kids.reduce((width, el) => {
      const cs = getComputedStyle(el);
      return width + el.getBoundingClientRect().width
        + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
    }, 0) + gap * (kids.length - 1);
    // Everything else on the row: the toolbar's own padding and the app group
    // pinned to the right.
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
export function ToolButton({ icon: Icon, label, tip, onClick, disabled, active, showLabel }) {
  return (
    <button
      type="button"
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

/**
 * A button that opens one of the menus.
 *
 * The menu itself is never drawn inside the toolbar: the button reports where it
 * is on screen and the menu opens as its own window, so a long list (ten recent
 * files, twenty-three themes) can be taller than the application and is always
 * a single column. On the web, where there is no second window to open, the
 * caller falls back to the in-page context menu at the same anchor.
 */
function MenuButton({ icon: Icon, label, tip, menu, showLabel, onOpenMenu, disabled, chevron = true }) {
  const btnRef = useRef(null);

  const open = () => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onOpenMenu(menu, {
      x: rect.left,
      y: rect.bottom + 4,
      width: rect.width,
      height: rect.height + 4,
    });
  };

  return (
    <button
      type="button"
      ref={btnRef}
      className={`tbtn menu-btn${showLabel ? ' with-label' : ''}`}
      onClick={open}
      disabled={disabled}
      title={tip || label}
      aria-label={label}
      aria-haspopup="menu"
    >
      <Icon size={18} />
      {showLabel ? <span className="tbtn-label">{label}</span> : null}
      {chevron ? <IconDown size={11} /> : null}
    </button>
  );
}

/** The effects in the order the button steps through them. */
const NEXT_TURN = { none: 'slide', slide: 'flip', flip: 'none' };
const TURN_LABEL = { none: 'None', slide: 'Slide', flip: 'Flip' };

export default function Toolbar({
  settings, book, section, sectionCount, scale, hasSelection, history, bookmarkCount,
  galleryOpen, onOpenMenu, onCommand, onGoToSection, onTheme, onLang,
}) {
  const { t, i18n } = useTranslation();
  const [sectionInput, setSectionInput] = useState(String(section + 1));
  const showLabel = settings.showToolbarLabels;
  const barRef = useRef(null);
  const scrollRef = useRef(null);
  const reflowable = book ? book.reflowable : true;

  useToolbarMinWidth(barRef, scrollRef, [
    showLabel, i18n.language, settings.fontFamily, settings.fontSize,
    settings.fontWeight, settings.fontStyle, !!book, sectionCount,
  ]);

  useEffect(() => { setSectionInput(String(section + 1)); }, [section]);

  const commitSection = () => {
    const n = parseInt(sectionInput, 10);
    if (Number.isFinite(n) && n >= 1 && n <= sectionCount) onGoToSection(n - 1);
    else setSectionInput(String(section + 1));
  };

  const run = (id) => () => onCommand(id);

  return (
    <div className="toolbar" ref={barRef}>
      {/* One row, always. Commands are grouped by kind behind a menu button —
          File, Reading, View, Marks — and only the everyday ones sit out here. */}
      <div className="toolbar-scroll" ref={scrollRef}>

        {/* File */}
        <div className="toolbar-group">
          <MenuButton icon={IconFolder} label={t('menu.file')} tip={t('tip.fileMenu')} menu="file" showLabel={showLabel} onOpenMenu={onOpenMenu} />
          <ToolButton icon={IconOpen} label={t('cmd.open')} tip={t('tip.open')} onClick={run('open')} showLabel={showLabel} />
          <ToolButton icon={IconSave} label={t('cmd.saveLibrary')} tip={t('tip.save')} onClick={run('saveLibrary')} disabled={!book} showLabel={showLabel} />
          <ToolButton icon={IconPrint} label={t('cmd.print')} tip={t('tip.print')} onClick={run('print')} disabled={!book} showLabel={showLabel} />
        </div>

        <div className="toolbar-sep" />

        {/* Undo / redo */}
        <div className="toolbar-group">
          <ToolButton
            icon={IconUndo}
            label={t('cmd.undo')}
            tip={history.canUndo && history.undoLabel ? `${t('cmd.undo')}: ${history.undoLabel}` : t('tip.undo')}
            onClick={history.undo}
            disabled={!history.canUndo}
            showLabel={showLabel}
          />
          <ToolButton
            icon={IconRedo}
            label={t('cmd.redo')}
            tip={history.canRedo && history.redoLabel ? `${t('cmd.redo')}: ${history.redoLabel}` : t('tip.redo')}
            onClick={history.redo}
            disabled={!history.canRedo}
            showLabel={showLabel}
          />
        </div>

        <div className="toolbar-sep" />

        {/* Marks */}
        <div className="toolbar-group">
          <MenuButton icon={IconContents} label={t('menu.marks')} tip={t('tip.marksMenu')} menu="marks" showLabel={showLabel} onOpenMenu={onOpenMenu} />
          {/* Split: the button adds a bookmark, the chevron lists the ones
              already made — in its own window, like every other menu. */}
          <span className="menu-wrap split">
            <ToolButton
              icon={IconBookmarkAdd}
              label={t('cmd.addBookmark')}
              tip={t('tip.bookmark')}
              onClick={run('addBookmark')}
              disabled={!book}
              showLabel={showLabel}
            />
            <MenuButton
              icon={IconBookmark}
              label={t('menu.bookmarks')}
              tip={t('tip.bookmarkList', { n: bookmarkCount || 0 })}
              menu="bookmarks"
              onOpenMenu={onOpenMenu}
              disabled={!book || !bookmarkCount}
              chevron={false}
            />
          </span>
          <ToolButton icon={IconHighlight} label={t('cmd.highlight')} tip={t('tip.highlight')} onClick={run('highlight')} disabled={!hasSelection} showLabel={showLabel} />
          <ToolButton icon={IconNote} label={t('cmd.addNote')} tip={t('tip.note')} onClick={run('addNote')} disabled={!book} showLabel={showLabel} />
          <ToolButton
            icon={IconSearch}
            label={t('cmd.find')}
            tip={t('tip.find')}
            onClick={run('find')}
            disabled={!book}
            active={settings.leftPanel === 'search'}
            showLabel={showLabel}
          />
        </div>

        <div className="toolbar-sep" />

        {/* Navigation */}
        <div className="toolbar-group">
          <MenuButton icon={IconLayout} label={t('menu.reading')} tip={t('tip.readingMenu')} menu="reading" showLabel={showLabel} onOpenMenu={onOpenMenu} />
          <ToolButton icon={IconPrev} label={t('cmd.prevSection')} tip={t('tip.prev')} onClick={run('prevSection')} disabled={!book || section <= 0} />
          <span className="page-box">
            <input
              className="page-input"
              value={sectionInput}
              onChange={(e) => setSectionInput(e.target.value.replace(/[^\d]/g, ''))}
              onBlur={commitSection}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSection(); }}
              disabled={!book}
              title={t('tip.section')}
              aria-label={t('tip.section')}
            />
            <span className="page-total">/ {sectionCount || 0}</span>
          </span>
          <ToolButton icon={IconNext} label={t('cmd.nextSection')} tip={t('tip.next')} onClick={run('nextSection')} disabled={!book || section >= sectionCount - 1} />
          {/* The page-turn effect, one press at a time: none → slide → leaf. */}
          <ToolButton
            icon={IconPageTurn}
            label={t(`cmd.turn${TURN_LABEL[settings.pageTurn] || 'None'}`)}
            tip={t('tip.pageTurn', { name: t(`reading.turn${TURN_LABEL[settings.pageTurn] || 'None'}`) })}
            onClick={run(`turn${TURN_LABEL[NEXT_TURN[settings.pageTurn] || 'slide']}`)}
            active={settings.pageTurn !== 'none'}
          />
          <ToolButton
            icon={settings.pageMode === 'paged' ? IconPaged : IconScroll}
            label={settings.pageMode === 'paged' ? t('cmd.modePaged') : t('cmd.modeScroll')}
            tip={t('tip.pageMode')}
            onClick={run(settings.pageMode === 'paged' ? 'modeScroll' : 'modePaged')}
            disabled={!book || !reflowable}
          />
        </div>

        <div className="toolbar-sep" />

        {/* Size: text scale for reflowable books, zoom for PDFs and comics */}
        <div className="toolbar-group">
          <MenuButton icon={IconTextSize} label={t('menu.view')} tip={t('tip.viewMenu')} menu="view" showLabel={showLabel} onOpenMenu={onOpenMenu} />
          {/* Three controls, always: smaller — the current size, which puts it
              back to 100% — larger. Text for a reflowable book, zoom for a
              fixed-layout one. */}
          {reflowable ? (
            <>
              <ToolButton icon={IconZoomOut} label={t('cmd.textSmaller')} tip={t('tip.textSmaller')} onClick={run('textSmaller')} disabled={!book} />
              <button
                type="button"
                className="tbtn zoom-readout"
                onClick={run('textReset')}
                disabled={!book}
                title={t('tip.textReset')}
                aria-label={t('cmd.textReset')}
              >
                {Math.round((settings.fontScale || 1) * 100)}%
              </button>
              <ToolButton icon={IconZoomIn} label={t('cmd.textBigger')} tip={t('tip.textBigger')} onClick={run('textBigger')} disabled={!book} />
            </>
          ) : (
            <>
              <ToolButton icon={IconZoomOut} label={t('cmd.zoomOut')} tip={t('tip.zoomOut')} onClick={run('zoomOut')} disabled={!book} />
              <button
                type="button"
                className="tbtn zoom-readout"
                onClick={run('actualSize')}
                disabled={!book}
                title={t('tip.zoomReset')}
                aria-label={t('cmd.actualSize')}
              >
                {Math.round((scale || 1) * 100)}%
              </button>
              <ToolButton icon={IconZoomIn} label={t('cmd.zoomIn')} tip={t('tip.zoomIn')} onClick={run('zoomIn')} disabled={!book} />
            </>
          )}
          {/* How a fixed page meets the window: the whole of it, its width, its
              height, or not at all. */}
          <ToolButton
            icon={IconFitPage}
            label={t('cmd.fitPage')}
            tip={t('tip.fitPage')}
            onClick={run('fitPage')}
            disabled={!book || reflowable}
            active={settings.zoomMode === 'fit-page'}
          />
          <ToolButton
            icon={IconFitWidth}
            label={t('cmd.fitWidth')}
            tip={t('tip.fitWidth')}
            onClick={run('fitWidth')}
            disabled={!book || reflowable}
            active={settings.zoomMode === 'fit-width'}
          />
          <ToolButton
            icon={IconFitHeight}
            label={t('cmd.fitHeight')}
            tip={t('tip.fitHeight')}
            onClick={run('fitHeight')}
            disabled={!book || reflowable}
            active={settings.zoomMode === 'fit-height'}
          />
          <ToolButton
            icon={IconActual}
            label={t('cmd.actualSize')}
            tip={t('tip.actualSize')}
            onClick={run('actualSize')}
            disabled={!book || reflowable}
            active={settings.zoomMode === 'actual'}
          />

          {/* One page, or two side by side — for PDFs, comics and pictures. */}
          <ToolButton
            icon={settings.spread === 'double' ? IconColumns : IconActual}
            label={settings.spread === 'double' ? t('cmd.spreadDouble') : t('cmd.spreadSingle')}
            tip={t('tip.spread')}
            onClick={run(settings.spread === 'double' ? 'spreadSingle' : 'spreadDouble')}
            disabled={!book || reflowable}
            active={settings.spread === 'double'}
          />
        </div>

      </div>

      {/* Panels, theme, language and the app dialogs — pinned to the right */}
      <div className="toolbar-right">
        <ToolButton
          icon={IconImage}
          label={t('cmd.copyImage')}
          tip={t('tip.copyImage')}
          onClick={run('copyImage')}
          disabled={!book}
        />
        <ToolButton
          icon={IconLibrary}
          label={t('cmd.gallery')}
          tip={t('tip.gallery')}
          onClick={run('gallery')}
          active={!!galleryOpen}
        />
        <ToolButton
          icon={IconPanelLeft}
          label={t('cmd.toggleLeft')}
          tip={t('tip.leftPanel')}
          onClick={run('toggleLeft')}
          active={settings.leftPanel !== 'none'}
        />
        <ToolButton
          icon={IconPanelRight}
          label={t('cmd.toggleRight')}
          tip={t('tip.rightPanel')}
          onClick={run('toggleRight')}
          active={settings.rightPanel !== 'none'}
        />

        <span className="menu-wrap split">
          <button
            type="button"
            className="tbtn"
            onClick={() => onTheme(nextTheme(settings.theme))}
            title={t('tip.theme', { name: nextTheme(settings.theme) })}
            aria-label={t('menu.theme')}
          >
            <IconTheme size={18} />
          </button>
          <MenuButton
            icon={IconDown}
            label={t('menu.theme')}
            tip={t('tip.themePick')}
            menu="theme"
            onOpenMenu={onOpenMenu}
            chevron={false}
          />
        </span>

        <ToolButton
          icon={(p) => <IconFlag lang={otherLang(settings.lang)} {...p} />}
          label={t('cmd.language')}
          tip={t('tip.lang')}
          onClick={() => onLang()}
        />
        {/* One settings button, and one only: the gear. Shortcuts, language and
            About have their own controls, and the right-click menu lists them
            again for good measure. */}
        <ToolButton icon={IconSettings} label={t('cmd.settings')} tip={t('tip.settings')} onClick={run('settings')} />
        <ToolButton icon={IconInfo} label={t('cmd.about')} tip={t('tip.about')} onClick={run('about')} />
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconOpen, IconFolderOpen, IconSave, IconPrint, IconUndo, IconRedo,
  IconPrev, IconNext, IconZoomIn, IconZoomOut,
  IconPanelLeft, IconPanelRight, IconTheme, IconSettings, IconInfo, IconFlag,
  IconScroll, IconDown,
  IconLibrary, IconImage, IconFitWidth, IconFitPage, IconFitHeight,
  IconPageTurn, IconOnePage, IconTwoPages, IconColumns, IconTextSize,
} from './Icons.jsx';
import { nextTheme } from '../lib/themes.js';
import { viewLayoutOf, effectiveZoomMode, textColumnsOf, fontPixels } from '../lib/view.js';
import { otherLang } from '../i18n.js';
import { api, isElectron } from '../lib/platform.js';
import { getSystemFonts } from '../lib/fonts.js';

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
export function ToolButton({ icon: Icon, label, tip, onClick, disabled, active, pressed, showLabel, testId }) {
  return (
    <button
      type="button"
      className={`tbtn${active ? ' active' : ''}${showLabel ? ' with-label' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={tip || label}
      aria-label={label}
      aria-pressed={typeof pressed === 'boolean' ? pressed : undefined}
      // A handle for the GUI tests on the buttons whose label changes with the
      // state and the language, which there is no stable way to look up.
      data-testid={testId}
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
function MenuButton({ icon: Icon, label, tip, menu, showLabel, onOpenMenu, disabled, testId, chevron = true }) {
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
      data-testid={testId}
    >
      <Icon size={18} />
      {showLabel ? <span className="tbtn-label">{label}</span> : null}
      {chevron ? <IconDown size={11} /> : null}
    </button>
  );
}

/** What each effect is called, for the button that opens the list of them. */
const TURN_LABEL = { none: 'None', slide: 'Slide', flip: 'Flip' };

export default function Toolbar({
  settings, book, section, sectionCount, scale, hasImage, history,
  galleryOpen, onOpenMenu, onCommand, onGoToSection, onTheme, onLang, onReaderFont,
}) {
  const { t, i18n } = useTranslation();
  const [sectionInput, setSectionInput] = useState(String(section + 1));
  const [fonts, setFonts] = useState([]);
  const showLabel = settings.showToolbarLabels;
  const barRef = useRef(null);
  const scrollRef = useRef(null);
  const reflowable = book ? book.reflowable : true;
  // One layout for every format. A continuous run has nothing to turn.
  const layout = viewLayoutOf(settings, book);
  const fit = effectiveZoomMode(settings, layout);

  useToolbarMinWidth(barRef, scrollRef, [
    showLabel, i18n.language, settings.fontFamily, settings.fontSize,
    settings.fontWeight, settings.fontStyle, !!book, sectionCount,
  ]);

  useEffect(() => { setSectionInput(String(section + 1)); }, [section]);

  // Installed faces for an EPUB or MOBI. A list the system has already given
  // is kept; opening the control asks again, which is when the computer can
  // hand over every font it has.
  const loadFonts = useCallback(() => {
    getSystemFonts().then((list) => {
      setFonts((prev) => (list.length >= prev.length ? list : prev));
    }).catch(() => {});
  }, []);
  useEffect(() => { loadFonts(); }, [loadFonts]);

  const commitSection = () => {
    const n = parseInt(sectionInput, 10);
    if (Number.isFinite(n) && n >= 1 && n <= sectionCount) onGoToSection(n - 1);
    else setSectionInput(String(section + 1));
  };

  const run = (id) => () => onCommand(id);

  return (
    <div className="toolbar" ref={barRef}>
      {/* One row, always, and it holds *actions* only. Bookmarks, notes,
          highlights and search live in the left tools, so they are not repeated
          here. The page-turn effect is a setting picked from a list. */}
      <div className="toolbar-scroll" ref={scrollRef}>

        {/* File */}
        <div className="toolbar-group">
          <ToolButton icon={IconOpen} label={t('cmd.open')} tip={t('tip.open')} onClick={run('open')} showLabel={showLabel} />
          <ToolButton
            icon={IconFolderOpen}
            label={t('cmd.openFolder')}
            tip={t('tip.openFolder')}
            onClick={run('openFolder')}
            disabled={!isElectron}
            showLabel={showLabel}
            testId="open-folder"
          />
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

        {/* Navigation. There is no Reading menu button here: everything in that
            menu is already a button on this row — where to go, how big the
            letters are, one page or one long column — and having both meant two
            ways to the same thing an inch apart. The menu bar still has it. */}
        <div className="toolbar-group">
          <ToolButton icon={IconPrev} label={t('cmd.prevSection')} tip={t('tip.prev')} onClick={run('prevSection')} disabled={!book || section <= 0} testId="prev-section" />
          <span className="page-box">
            <input
              className="page-input"
              style={{ width: `${Math.max(1, String(sectionInput).length)}ch` }}
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
          <ToolButton icon={IconNext} label={t('cmd.nextSection')} tip={t('tip.next')} onClick={run('nextSection')} disabled={!book || section >= sectionCount - 1} testId="next-section" />
          {/* One page, two pages, or a continuous run. Exactly one is on:
              pressing one clears the other two, for every format. */}
          <ToolButton
            icon={IconOnePage}
            label={t('cmd.viewSingle')}
            tip={t('tip.viewSingle')}
            onClick={run('viewSingle')}
            disabled={!book}
            active={!!book && layout === 'single'}
            pressed={!!book && layout === 'single'}
            showLabel={showLabel}
            testId="view-single"
          />
          <ToolButton
            icon={IconTwoPages}
            label={t('cmd.viewDouble')}
            tip={t('tip.viewDouble')}
            onClick={run('viewDouble')}
            disabled={!book}
            active={!!book && layout === 'double'}
            pressed={!!book && layout === 'double'}
            showLabel={showLabel}
            testId="view-double"
          />
          <ToolButton
            icon={IconScroll}
            label={t('cmd.viewContinuous')}
            tip={t('tip.viewContinuous')}
            onClick={run('viewContinuous')}
            disabled={!book}
            active={!!book && layout === 'continuous'}
            pressed={!!book && layout === 'continuous'}
            showLabel={showLabel}
            testId="view-continuous"
          />
          {/* The page-turn effect sits with the view it belongs to: one page
              or two. A continuous run has nothing to turn, so the button is
              off there. It is a list to pick from, not a cycle to press through. */}
          <MenuButton
            icon={IconPageTurn}
            label={t(`cmd.turn${TURN_LABEL[settings.pageTurn] || 'None'}`)}
            tip={t('tip.pageTurn', { name: t(`reading.turn${TURN_LABEL[settings.pageTurn] || 'None'}`) })}
            menu="turn"
            onOpenMenu={onOpenMenu}
            disabled={!book || layout === 'continuous'}
            testId="page-turn"
          />
          {/* One column or two, on a single page. A PDF page does not reflow.
              The digit is drawn beside the icon so the two buttons can be told
              apart. */}
          {[1, 2].map((count) => {
            const shown = layout === 'single' ? textColumnsOf(settings) : 1;
            const on = !!book && reflowable && layout === 'single' && shown === count;
            const columnsOff = !reflowable || layout !== 'single';
            const columnsTip = !reflowable
              ? t('tip.columnsFixed')
              : layout === 'double'
                ? t('tip.columnsFacing')
                : layout !== 'single'
                  ? t('tip.columnsFlow')
                  : t(`tip.columns${count}`);
            return (
              <button
                key={count}
                type="button"
                className={`tbtn col-btn${on ? ' active' : ''}`}
                onClick={run(`columns${count}`)}
                disabled={!book || columnsOff}
                title={columnsTip}
                aria-label={t(`cmd.columns${count}`)}
                aria-pressed={on}
                data-testid={`columns-${count}`}
              >
                <IconColumns size={16} />
                <span className="col-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="toolbar-sep" />

        {/* Size. A picture zooms. An ebook is already the window, so its zoom
            stays off and the type size beside it is what changes. */}
        <div className="toolbar-group">
          <ToolButton
            icon={IconZoomOut}
            label={t('cmd.zoomOut')}
            tip={reflowable ? t('tip.zoomEbook') : t('tip.zoomOut')}
            onClick={run('zoomOut')}
            disabled={!book || reflowable}
            testId="zoom-out"
          />
          <button
            type="button"
            className="tbtn zoom-readout"
            onClick={run('actualSize')}
            disabled={!book || reflowable}
            title={reflowable ? t('tip.zoomEbook') : t('tip.zoomReset')}
            aria-label={t('cmd.actualSize')}
            data-testid="zoom-readout"
          >
            {Math.round((scale || 1) * 100)}%
          </button>
          <ToolButton
            icon={IconZoomIn}
            label={t('cmd.zoomIn')}
            tip={reflowable ? t('tip.zoomEbook') : t('tip.zoomIn')}
            onClick={run('zoomIn')}
            disabled={!book || reflowable}
            testId="zoom-in"
          />
          {reflowable ? (
            <>
              <select
                className="font-pick"
                value={settings.readerFont || ''}
                disabled={!book}
                title={t('tip.readerFont')}
                aria-label={t('reading.font')}
                data-testid="reader-font"
                style={settings.readerFont ? { fontFamily: `'${String(settings.readerFont).replace(/'/g, "\\'")}'` } : undefined}
                onPointerDown={loadFonts}
                onChange={(e) => onReaderFont?.(e.target.value)}
              >
                <option value="">{t('reading.defaultFont')}</option>
                {(settings.readerFont && !fonts.includes(settings.readerFont) ? [settings.readerFont, ...fonts] : fonts).map((font) => (
                  <option key={font} value={font} style={{ fontFamily: `'${String(font).replace(/'/g, "\\'")}'` }}>{font}</option>
                ))}
              </select>
              <button
                type="button"
                className="tbtn font-step"
                onClick={run('textSmaller')}
                disabled={!book}
                title={t('tip.textSmaller')}
                aria-label={t('cmd.textSmaller')}
                data-testid="font-smaller"
              >
                <IconTextSize size={16} />
                <span className="col-count">−</span>
              </button>
              <button
                type="button"
                className="tbtn zoom-readout font-readout"
                onClick={run('textReset')}
                disabled={!book}
                title={t('tip.textReset')}
                aria-label={t('cmd.textReset')}
                data-testid="font-readout"
              >
                {fontPixels(settings.fontScale)}px
              </button>
              <button
                type="button"
                className="tbtn font-step"
                onClick={run('textBigger')}
                disabled={!book}
                title={t('tip.textBigger')}
                aria-label={t('cmd.textBigger')}
                data-testid="font-bigger"
              >
                <IconTextSize size={16} />
                <span className="col-count">+</span>
              </button>
            </>
          ) : null}
          {/* How a fixed page meets the window. An ebook is always fitted to
              the window, with a margin, so these are not choices for it. */}
          {book && !reflowable ? (
            <>
              <ToolButton
                icon={IconFitPage}
                label={t('cmd.fitPage')}
                tip={layout === 'single' ? t('tip.fitSingle') : t('tip.fitPage')}
                onClick={run('fitPage')}
                disabled={!book}
                active={!!book && fit === 'fit-page'}
                pressed={!!book && fit === 'fit-page'}
                testId="fit-page"
              />
              <ToolButton
                icon={IconFitWidth}
                label={t('cmd.fitWidth')}
                tip={layout === 'single' ? t('tip.fitSingle') : t('tip.fitWidth')}
                onClick={run('fitWidth')}
                disabled={!book || layout === 'single'}
                active={!!book && fit === 'fit-width'}
                pressed={!!book && fit === 'fit-width'}
                testId="fit-width"
              />
              <ToolButton
                icon={IconFitHeight}
                label={t('cmd.fitHeight')}
                tip={layout === 'single' ? t('tip.fitSingle') : t('tip.fitHeight')}
                onClick={run('fitHeight')}
                disabled={!book || layout === 'single'}
                active={!!book && fit === 'fit-height'}
                pressed={!!book && fit === 'fit-height'}
                testId="fit-height"
              />
            </>
          ) : null}
          {/* There is no "original size" button here: the readout in the
              middle of the three size controls already is one — it shows the
              scale and puts it back to 100% when pressed. */}
        </div>

      </div>

      {/* Panels, theme, language and the app dialogs — pinned to the right */}
      <div className="toolbar-right">
        <ToolButton
          icon={IconImage}
          label={t('cmd.copyImage')}
          tip={t('tip.copyImage')}
          onClick={run('copyImage')}
          disabled={!book || !hasImage}
        />
        <ToolButton
          icon={IconLibrary}
          label={t('cmd.gallery')}
          tip={t('tip.gallery')}
          onClick={run('gallery')}
          active={!!galleryOpen || settings.leftPanel === 'gallery'}
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

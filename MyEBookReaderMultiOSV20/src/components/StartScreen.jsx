import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconOpen, IconUrl, IconFolderOpen, IconGallery, IconLibrary, IconGuide, IconRecent, IconClose, IconSparkles, IconInfo,
  IconPdf, IconTrash, IconGrid,
} from './Icons.jsx';
import {
  START_CARDS, normalizeStartLayout, measureLayout, clampLayout, moveCard, resizeCard, boardHeight,
} from '../lib/startlayout.js';
import StartBackground from './StartBackground.jsx';
import BackgroundPicker from './BackgroundPicker.jsx';
import { GalleryThumb } from './Gallery.jsx';
import { favoritesOf, recentlyOpened, isCurrent } from '../lib/gallery.js';
import { nextStartBg } from '../lib/startbg.js';
import buildInfo from '../build-info.json';
import { bookTitleOf } from '../lib/folders.js';

const START_RECENT = 6;
const START_BOOKS = 18;

// The start screen, after MyTrainer's: a title card with the guide and the
// library, then three cards — getting started (open, recent files), the
// library on a shelf, and the moving 3D background with its controls.
export default function StartScreen({
  settings, onSettings, entries = [], currentPath = '',
  onOpenFile, onOpenFolder, onOpenUrl, onOpenEntry, onEntryMenu, onForgetRecent, onForgetAllRecent, onUnfavorite, onClearLibrary, onShowLibrary, onShowGallery, onOpenGuide, onNeedThumb,
}) {
  const { t } = useTranslation();
  const books = useMemo(() => favoritesOf(entries), [entries]);
  const recent = useMemo(() => recentlyOpened(entries, START_RECENT), [entries]);

  // Change the background by itself every few seconds, if asked to.
  useEffect(() => {
    const secs = Number(settings.startBgInterval) || 0;
    if (!secs) return undefined;
    const id = setInterval(() => {
      onSettings?.((s) => ({ startBg: nextStartBg(s.startBg, { random: !!s.startBgRandom }) }));
    }, secs * 1000);
    return () => clearInterval(id);
  }, [settings.startBgInterval, onSettings]);

  const patch = (p) => onSettings?.(() => p);

  // ── Cards the user can move and resize ──
  // The automatic grid until a card is first moved or resized; from then on
  // every card has its own box, saved in settings.startLayout, until
  // "Auto arrange" clears it.
  const boardRef = useRef(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [live, setLive] = useState(null);      // the layout while a grip is held
  const [front, setFront] = useState(null);    // the card last touched sits on top
  const saved = useMemo(() => normalizeStartLayout(settings.startLayout), [settings.startLayout]);
  const layout = clampLayout(live || saved, boardWidth || Infinity);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setBoardWidth(board.clientWidth));
    ro.observe(board);
    setBoardWidth(board.clientWidth);
    return () => ro.disconnect();
  }, []);

  const startGrip = (e, id, kind) => {
    if (e.button !== 0) return;
    const board = boardRef.current;
    if (!board) return;
    e.preventDefault();
    e.stopPropagation();
    let base = live || saved;
    if (!base) {
      const rects = {};
      for (const cid of START_CARDS) {
        const el = board.querySelector(`[data-card="${cid}"]`);
        if (el) rects[cid] = el.getBoundingClientRect();
      }
      base = measureLayout(board.getBoundingClientRect(), rects);
      if (!base) return;
    }
    const width = board.clientWidth;
    base = clampLayout(base, width);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const grip = e.currentTarget;
    let last = base;
    setFront(id);
    setLive(base);
    try { grip.setPointerCapture?.(e.pointerId); } catch { /* a synthetic event has no pointer to capture */ }
    const onMove = (ev) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      last = kind === 'move' ? moveCard(base, id, dx, dy, width) : resizeCard(base, id, dx, dy, width);
      setLive(last);
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      setLive(null);
      onSettings?.(() => ({ startLayout: last }));
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  };

  const cardStyle = (id) => (layout ? {
    position: 'absolute',
    left: layout[id].x,
    top: layout[id].y,
    width: layout[id].w,
    height: layout[id].h,
    zIndex: front === id ? 3 : 1,
  } : undefined);

  // The move handle sits at the start of a card's title line (the intro card,
  // which has none, carries it in its top-left corner); the resize grip is the
  // bottom-right corner of every card.
  const moveHandle = (id) => (
    <button
      type="button"
      className="card-handle"
      title={t('start.moveCard')}
      aria-label={t('start.moveCard')}
      onPointerDown={(e) => startGrip(e, id, 'move')}
      data-card-move={id}
    >
      ⠿
    </button>
  );
  const resizeGrip = (id) => (
    <span
      className="card-resize"
      title={t('start.resizeCard')}
      aria-hidden="true"
      onPointerDown={(e) => startGrip(e, id, 'resize')}
      data-card-resize={id}
    />
  );

  return (
    <section className="start" aria-label={t('start.title')} data-start>
      <StartBackground scene={settings.startBg} opacity={settings.startBgOpacity} speed={settings.startBgSpeed} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            <button
              type="button"
              className="btn small"
              onClick={() => onSettings?.(() => ({ startLayout: null }))}
              title={t('start.autoArrangeTip')}
              data-start-arrange
            >
              <IconGrid size={14} /> {t('start.autoArrange')}
            </button>
          </div>
          <div className={`start-board${layout ? ' free' : ''}`} ref={boardRef} style={layout ? { height: boardHeight(layout) } : undefined}>
            <header className="start-hero start-card" data-card="hero" style={cardStyle('hero')}>
              <span className="card-handle-float">{moveHandle('hero')}</span>
              {resizeGrip('hero')}
              <img src="./icon.svg" alt="" className="start-icon" />
              <div className="start-hero-text">
                <h1>MyEBookReader <small>v{buildInfo.version || '1.0.0'}</small></h1>
                <p>{t('start.tagline')}</p>
              </div>
              <div className="start-hero-actions">
                <button type="button" className="btn big" onClick={onOpenGuide} title={t('tip.help')}>
                  <IconGuide size={18} /><span>{t('start.guide')}</span>
                </button>
                <button type="button" className="btn big primary" onClick={onShowLibrary} title={t('tip.library')}>
                  <IconLibrary size={18} /><span>{t('library.open')}</span>
                </button>
              </div>
            </header>

            <div className="start-grid">
              <section className="start-card start-begin" data-card="begin" style={cardStyle('begin')}>
                {resizeGrip('begin')}
                <h2>{moveHandle('begin')}<IconOpen size={16} /><span>{t('start.begin')}</span></h2>
                <div className="start-actions">
                  <button type="button" className="start-link" onClick={onOpenFile}>
                    <IconOpen size={16} /><span className="name">{t('toolbar.open')}</span><span className="path">.pdf · .epub · .mobi · .azw3 · .djvu · .fb2 · .cbz · .zip · .md · .txt</span>
                  </button>
                  {onOpenFolder ? (
                    <button type="button" className="start-link" onClick={onOpenFolder} title={t('tip.openFolder')}>
                      <IconFolderOpen size={16} /><span className="name">{t('toolbar.openFolder')}</span><span className="path">{t('start.openFolderHint')}</span>
                    </button>
                  ) : null}
                  <button type="button" className="start-link" onClick={onOpenUrl}>
                    <IconUrl size={16} /><span className="name">{t('toolbar.openUrl')}</span><span className="path">https://…</span>
                  </button>
                  <button type="button" className="start-link" onClick={onShowGallery}>
                    <IconGallery size={16} /><span className="name">{t('gallery.title')}</span><span className="path">{t('gallery.count', { n: entries.length })}</span>
                  </button>
                </div>
                <h2>
                  <IconRecent size={16} /><span>{t('side.recentOpened')}</span>
                  <span className="grow" />
                  {onForgetAllRecent ? (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => onForgetAllRecent()}
                      disabled={!recent.length}
                      title={t('start.clearRecentTip')}
                      data-start-clear-recent
                    >
                      <IconTrash size={13} /> {t('library.removeAll')}
                    </button>
                  ) : null}
                </h2>
                <div className="start-list">
                  {recent.length ? recent.map((e) => (
                    <div className="start-row" key={e.path} onContextMenu={onEntryMenu ? (ev) => onEntryMenu(ev, e, { recent: true }) : undefined}>
                      <button type="button" className="start-link" title={e.path} onClick={() => onOpenEntry?.(e)}>
                        <IconPdf size={16} /><span className="name">{e.name}</span><span className="path">{e.dir}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t('history.removeOne')}
                        aria-label={t('history.removeOne')}
                        onClick={() => onForgetRecent?.(e.path)}
                      >
                        <IconClose size={13} />
                      </button>
                    </div>
                  )) : (
                    <p className="start-empty"><IconInfo size={15} /><span>{t('recent.empty')}</span></p>
                  )}
                </div>
              </section>

              <section className="start-card start-library" data-card="library" style={cardStyle('library')}>
                {resizeGrip('library')}
                <h2>
                  {moveHandle('library')}
                  <IconLibrary size={16} /><span>{t('start.myLibrary')}</span>
                  <span className="muted small">{t('library.count', { n: books.length })}</span>
                  <span className="grow" />
                  {onClearLibrary ? (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => onClearLibrary(books)}
                      disabled={!books.length}
                      title={t('library.removeAllTip')}
                      data-start-clear-library
                    >
                      <IconTrash size={13} /> {t('library.removeAll')}
                    </button>
                  ) : null}
                  <button type="button" className="btn small" onClick={onShowLibrary}>{t('start.seeAll')}</button>
                </h2>
                {books.length ? (
                  <div className="start-shelf">
                    <ul className="shelf-books">
                      {books.slice(0, START_BOOKS).map((e) => (
                        <li key={e.path} className="book-slot">
                          <div
                            role="button"
                            tabIndex={0}
                            className={`book${isCurrent(e, currentPath) ? ' current' : ''}`}
                            title={e.path}
                            onClick={() => onOpenEntry?.(e)}
                            onKeyDown={(ev) => { if (ev.key === 'Enter') onOpenEntry?.(e); }}
                            onContextMenu={onEntryMenu ? (ev) => onEntryMenu(ev, e) : undefined}
                          >
                            <GalleryThumb entry={e} onNeedThumb={onNeedThumb} className="gal-thumb book-cover" />
                            {onUnfavorite ? (
                              <button
                                type="button"
                                className="gal-remove book-remove"
                                title={t('library.removeOne')}
                                aria-label={t('library.removeOne')}
                                onClick={(ev) => { ev.stopPropagation(); onUnfavorite(e); }}
                                onKeyDown={(ev) => ev.stopPropagation()}
                              >
                                <IconClose size={13} />
                              </button>
                            ) : null}
                          </div>
                          <span className="book-title">{bookTitleOf(e.name)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="shelf-board" aria-hidden="true" />
                  </div>
                ) : (
                  <p className="start-empty"><IconInfo size={15} /><span>{t('library.empty')}</span></p>
                )}
              </section>

              <section className="start-card start-bgcard" data-card="bg" style={cardStyle('bg')}>
                {resizeGrip('bg')}
                <h2>{moveHandle('bg')}<IconSparkles size={16} /><span>{t('startbg.title')}</span></h2>
                <BackgroundPicker settings={settings} onChange={patch} />
                <h2 className="start-tips-title"><IconInfo size={16} /><span>{t('start.tipsTitle')}</span></h2>
                <ul className="start-tips">
                  {[1, 2, 3, 4].map((n) => <li key={n}>{t(`start.tip${n}`)}</li>)}
                </ul>
              </section>
            </div>
          </div>

          <footer className="start-foot start-card">
            <label className="bg-check">
              <input
                type="checkbox"
                checked={settings.showStartPage !== false}
                onChange={(e) => patch({ showStartPage: e.target.checked })}
              />
              <span>{t('start.showOnStart')}</span>
            </label>
            <span className="grow" />
            <span className="muted">© SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </section>
  );
}

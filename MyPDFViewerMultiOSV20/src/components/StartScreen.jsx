import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconOpen, IconUrl, IconGallery, IconLibrary, IconGuide, IconRecent, IconClose, IconSparkles, IconInfo,
  IconPdf, IconTrash, IconSettings, IconGrid, IconMove,
} from './Icons.jsx';
import StartBackground from './StartBackground.jsx';
import BackgroundPicker from './BackgroundPicker.jsx';
import { GalleryThumb } from './Gallery.jsx';
import { favoritesOf, recentlyOpened, isCurrent } from '../lib/gallery.js';
import { nextStartBg } from '../lib/startbg.js';
import { startBoard } from '../lib/startboard.js';
import buildInfo from '../build-info.json';

const START_RECENT = 6;
const START_BOOKS = 18;

// Resize corner: six dots, as in MyUMLMaker.
const GRIP = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2" /><circle cx="14" cy="20" r="2" /><circle cx="20" cy="14" r="2" /><circle cx="8" cy="20" r="2" /><circle cx="14" cy="14" r="2" /><circle cx="20" cy="8" r="2" /></svg>
);

// One card on the board: its move handle and title, its body and its resize corner.
function Card({ id, icon, title, extra = null, className = '', children }) {
  const { t } = useTranslation();
  return (
    <section className={`start-card start-card-${id} ${className}`} data-card={id} aria-label={title}>
      <h2>
        <button type="button" className="card-handle" data-card-handle={id} title={t('start.moveCard')} aria-label={t('start.moveCard')}>
          <IconMove size={15} />
        </button>
        {icon}<span className="start-card-title">{title}</span><span className="grow" />{extra}
      </h2>
      <div className="card-body">{children}</div>
      <span className="card-resize" data-card-resize={id} title={t('start.resizeCard')}>{GRIP}</span>
    </section>
  );
}

// The start screen, after MyUMLMaker's: a moving background behind a fixed
// title card (no handle, no resize corner) and a board of translucent cards
// that can be moved (the handle) and resized (the corner; a double click fits
// it again). By default the cards stand one under another. lib/startboard.js
// places them and the arrangement is kept in settings.startLayout.
export default function StartScreen({
  settings, onSettings, entries = [], currentPath = '',
  onOpenFile, onOpenUrl, onOpenEntry, onForgetRecent, onUnfavorite, onClearLibrary, onShowLibrary, onShowGallery, onOpenGuide, onNeedThumb,
  onOpenSettings, onForgetAllRecent,
}) {
  const { t } = useTranslation();
  const books = useMemo(() => favoritesOf(entries), [entries]);
  const recent = useMemo(() => recentlyOpened(entries, START_RECENT), [entries]);
  const version = buildInfo.version || '1.0.0';

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

  // The card board. It reads the saved arrangement once; later saves come from it.
  const boardRef = useRef(null);
  const board = useRef(null);
  const save = useRef(null);
  save.current = (layout) => onSettings?.(() => ({ startLayout: layout }));
  useLayoutEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    board.current = startBoard(boardRef.current, { saved: settings.startLayout, reduced, onSave: (next) => save.current?.(next) });
    return () => { board.current?.destroy(); board.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="start" aria-label={t('start.title')} data-start>
      <StartBackground scene={settings.startBg} opacity={settings.startBgOpacity} speed={settings.startBgSpeed} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            <label className="start-btn start-startup" title={t('start.showOnStart')}>
              <input
                type="checkbox"
                checked={settings.showStartPage !== false}
                onChange={(e) => patch({ showStartPage: e.target.checked })}
              />
              <span>{t('start.showOnStart')}</span>
            </label>
            {onOpenSettings ? (
              <button type="button" className="start-btn" onClick={onOpenSettings} title={t('tip.settings')} data-start-settings>
                <IconSettings size={15} /><span>{t('toolbar.settings')}</span>
              </button>
            ) : null}
            <button type="button" className="start-btn" onClick={() => board.current?.arrange()} title={t('start.arrangeTip')} data-start-arrange>
              <IconGrid size={15} /><span>{t('start.arrange')}</span>
            </button>
          </div>

          {/* The title card is fixed: always on top, full width, no move handle and no resize corner. */}
          <header className="start-card start-hero" aria-label="MyPDFViewer">
            <img src="./icon.svg" alt="" className="start-icon" draggable={false} />
            <div className="start-hero-text">
              <h1>MyPDFViewer <small>v{version}</small></h1>
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

          <div className="start-board" ref={boardRef}>
            <Card id="begin" icon={<IconOpen size={16} />} title={t('start.begin')}>
              <div className="start-actions">
                <button type="button" className="start-tile" onClick={onOpenFile} title={t('toolbar.open')}>
                  <IconOpen size={20} /><b>{t('toolbar.open')}</b><small>.pdf · .pdfvw</small>
                </button>
                <button type="button" className="start-tile" onClick={onOpenUrl} title={t('toolbar.openUrl')}>
                  <IconUrl size={20} /><b>{t('toolbar.openUrl')}</b><small>https://…</small>
                </button>
                <button type="button" className="start-tile" onClick={onShowGallery} title={t('gallery.title')}>
                  <IconGallery size={20} /><b>{t('gallery.title')}</b><small>{t('gallery.count', { n: entries.length })}</small>
                </button>
              </div>
            </Card>

            <Card
              id="recent"
              icon={<IconRecent size={16} />}
              title={t('side.recentOpened')}
              extra={onForgetAllRecent ? (
                <button
                  type="button"
                  className="btn small"
                  onClick={onForgetAllRecent}
                  disabled={!recent.length}
                  title={t('history.clearRecentTip')}
                  data-start-clear-recent
                >
                  <IconTrash size={13} /> {t('history.clearAll')}
                </button>
              ) : null}
            >
              <div className="start-list">
                {recent.length ? recent.map((e) => (
                  <div className="start-row" key={e.path}>
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
            </Card>

            <Card
              id="library"
              className="start-library"
              icon={<IconLibrary size={16} />}
              title={t('start.myLibrary')}
              extra={(
                <>
                  <span className="muted small">{t('library.count', { n: books.length })}</span>
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
                </>
              )}
            >
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
                        <span className="book-title">{e.name.replace(/\.pdf$/i, '')}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="shelf-board" aria-hidden="true" />
                </div>
              ) : (
                <p className="start-empty"><IconInfo size={15} /><span>{t('library.empty')}</span></p>
              )}
            </Card>

            <Card id="background" icon={<IconSparkles size={16} />} title={t('startbg.title')}>
              <BackgroundPicker settings={settings} onChange={patch} compact />
            </Card>

            <Card id="tips" icon={<IconInfo size={16} />} title={t('start.tipsTitle')}>
              <ul className="start-tips">
                {[1, 2, 3, 4].map((n) => <li key={n}>{t(`start.tip${n}`)}</li>)}
              </ul>
            </Card>
          </div>

          <footer className="start-foot">
            <IconInfo size={15} /><span className="grow">MyPDFViewer v{version}</span>
            <span className="muted">© SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </section>
  );
}

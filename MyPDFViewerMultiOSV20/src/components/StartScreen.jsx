import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconOpen, IconUrl, IconGallery, IconLibrary, IconGuide, IconRecent, IconClose, IconSparkles, IconInfo,
  IconPdf, IconTrash,
} from './Icons.jsx';
import StartBackground from './StartBackground.jsx';
import BackgroundPicker from './BackgroundPicker.jsx';
import { GalleryThumb } from './Gallery.jsx';
import { favoritesOf, recentlyOpened, isCurrent } from '../lib/gallery.js';
import { nextStartBg } from '../lib/startbg.js';
import buildInfo from '../build-info.json';

const START_RECENT = 6;
const START_BOOKS = 18;

// The start screen, after MyTrainer's: a title card with the guide and the
// library, then three cards — getting started (open, recent files), the
// library on a shelf, and the moving 3D background with its controls.
export default function StartScreen({
  settings, onSettings, entries = [], currentPath = '',
  onOpenFile, onOpenUrl, onOpenEntry, onForgetRecent, onUnfavorite, onClearLibrary, onShowLibrary, onShowGallery, onOpenGuide, onNeedThumb,
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

  return (
    <section className="start" aria-label={t('start.title')} data-start>
      <StartBackground scene={settings.startBg} opacity={settings.startBgOpacity} speed={settings.startBgSpeed} />
      <div className="start-scroll">
        <div className="start-inner">
          <header className="start-hero start-card">
            <img src="./icon.svg" alt="" className="start-icon" />
            <div className="start-hero-text">
              <h1>MyPDFViewer <small>v{buildInfo.version || '1.0.0'}</small></h1>
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
            <section className="start-card start-begin">
              <h2><IconOpen size={16} /><span>{t('start.begin')}</span></h2>
              <div className="start-actions">
                <button type="button" className="start-link" onClick={onOpenFile}>
                  <IconOpen size={16} /><span className="name">{t('toolbar.open')}</span><span className="path">.pdf · .pdfvw</span>
                </button>
                <button type="button" className="start-link" onClick={onOpenUrl}>
                  <IconUrl size={16} /><span className="name">{t('toolbar.openUrl')}</span><span className="path">https://…</span>
                </button>
                <button type="button" className="start-link" onClick={onShowGallery}>
                  <IconGallery size={16} /><span className="name">{t('gallery.title')}</span><span className="path">{t('gallery.count', { n: entries.length })}</span>
                </button>
              </div>
              <h2><IconRecent size={16} /><span>{t('side.recentOpened')}</span></h2>
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
            </section>

            <section className="start-card start-library">
              <h2>
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
            </section>

            <section className="start-card start-bgcard">
              <h2><IconSparkles size={16} /><span>{t('startbg.title')}</span></h2>
              <BackgroundPicker settings={settings} onChange={patch} />
              <h2 className="start-tips-title"><IconInfo size={16} /><span>{t('start.tipsTitle')}</span></h2>
              <ul className="start-tips">
                {[1, 2, 3, 4].map((n) => <li key={n}>{t(`start.tip${n}`)}</li>)}
              </ul>
            </section>
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

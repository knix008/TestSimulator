import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconStar, IconClose, IconPdf, IconTiles, IconDetails, IconPlus, IconGallery, IconSearch,
} from './Icons.jsx';
import {
  sortGallery, filterGallery, isCurrent, favoritesOf, TILE_MIN, TILE_MAX, GALLERY_SORTS,
} from '../lib/gallery.js';
import { getThumb, peekThumb, subscribeThumb } from '../lib/thumb-store.js';
import { formatBytes } from '../lib/platform.js';

// The first-page picture of one entry. It is fetched when the card scrolls
// near the view; a file added without being opened asks the app to draw one.
export function GalleryThumb({ entry, onNeedThumb, className = 'gal-thumb' }) {
  const ref = useRef(null);
  const [url, setUrl] = useState(() => peekThumb(entry.path));
  const [seen, setSeen] = useState(false);

  useEffect(() => subscribeThumb(entry.path, setUrl), [entry.path]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver((list) => {
      if (list.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen || url) return undefined;
    let alive = true;
    getThumb(entry.path).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else onNeedThumb?.(entry);
    });
    return () => { alive = false; };
  }, [seen, url, entry, onNeedThumb]);

  return (
    <span className={className} ref={ref}>
      {url ? <img src={url} alt="" draggable={false} /> : <IconPdf size={28} />}
    </span>
  );
}

function fmtDate(ts, lang) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

// The gallery fills the document area: every registered PDF as a picture with
// its name (tiles, resizable) or as a sortable table (details).
export default function Gallery({
  entries = [], currentPath = '', view = 'tiles', tileSize = 168,
  onView, onTileSize, onOpen, onRemove, onFavorite, onAdd, onNeedThumb, onClose, onCardMenu,
}) {
  const { t, i18n } = useTranslation();
  const [only, setOnly] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'opened', dir: 'desc' });
  const rootRef = useRef(null);

  const shown = useMemo(
    () => sortGallery(filterGallery(entries, { only, query }), sort.key, sort.dir),
    [entries, only, query, sort],
  );
  const favCount = favoritesOf(entries).length;

  useEffect(() => {
    rootRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sortBy = (key) => setSort((s) => (
    s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }
  ));
  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const star = (e) => (
    <button
      type="button"
      className={`gal-star${e.favorite ? ' on' : ''}`}
      title={e.favorite ? t('gallery.unfavorite') : t('gallery.favorite')}
      aria-label={e.favorite ? t('gallery.unfavorite') : t('gallery.favorite')}
      aria-pressed={!!e.favorite}
      onClick={(ev) => { ev.stopPropagation(); onFavorite?.(e, !e.favorite); }}
    >
      <IconStar size={15} filled={!!e.favorite} />
    </button>
  );
  const remove = (e) => (
    <button
      type="button"
      className="gal-remove"
      title={t('gallery.remove')}
      aria-label={t('gallery.remove')}
      onClick={(ev) => { ev.stopPropagation(); onRemove?.(e.path); }}
    >
      <IconClose size={13} />
    </button>
  );

  return (
    <section className="gallery" ref={rootRef} tabIndex={-1} aria-label={t('gallery.title')} data-gallery>
      <header className="gal-bar">
        <span className="gal-title"><IconGallery size={17} />{t('gallery.title')}<span className="gal-count">{t('gallery.count', { n: entries.length })}</span></span>

        <div className="seg-row gal-filter" role="group" aria-label={t('gallery.filter')}>
          <button type="button" className={`btn seg${only === 'all' ? ' active' : ''}`} onClick={() => setOnly('all')}>
            {t('gallery.all')}
          </button>
          <button type="button" className={`btn seg${only === 'favorites' ? ' active' : ''}`} onClick={() => setOnly('favorites')}>
            <IconStar size={13} filled /> {t('gallery.favorites')} {favCount}
          </button>
        </div>

        <label className="gal-search">
          <IconSearch size={14} />
          <input
            type="search"
            value={query}
            placeholder={t('gallery.search')}
            aria-label={t('gallery.search')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <span className="gal-spacer" />

        {view === 'tiles' ? (
          <>
            <select
              className="input gal-sort"
              value={`${sort.key}:${sort.dir}`}
              aria-label={t('gallery.sort')}
              title={t('gallery.sort')}
              onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir }); }}
            >
              {GALLERY_SORTS.map((k) => (
                <option key={k} value={`${k}:${k === 'name' ? 'asc' : 'desc'}`}>{t(`gallery.sortBy.${k}`)}</option>
              ))}
            </select>
            <label className="gal-size" title={t('gallery.tileSize')}>
              <span>{t('gallery.tileSize')}</span>
              <input
                type="range"
                min={TILE_MIN}
                max={TILE_MAX}
                step={8}
                value={tileSize}
                aria-label={t('gallery.tileSize')}
                onChange={(e) => onTileSize?.(Number(e.target.value))}
              />
            </label>
          </>
        ) : null}

        <div className="seg-row gal-views" role="group" aria-label={t('gallery.view')}>
          <button
            type="button"
            className={`btn seg${view === 'tiles' ? ' active' : ''}`}
            onClick={() => onView?.('tiles')}
            title={t('gallery.tiles')}
            aria-pressed={view === 'tiles'}
          >
            <IconTiles size={15} /> {t('gallery.tiles')}
          </button>
          <button
            type="button"
            className={`btn seg${view === 'details' ? ' active' : ''}`}
            onClick={() => onView?.('details')}
            title={t('gallery.details')}
            aria-pressed={view === 'details'}
          >
            <IconDetails size={15} /> {t('gallery.details')}
          </button>
        </div>

        {onAdd ? (
          <button type="button" className="btn" onClick={onAdd} title={t('gallery.addTip')}>
            <IconPlus size={15} /> {t('gallery.add')}
          </button>
        ) : null}
        <button type="button" className="btn icon-only" onClick={onClose} title={t('gallery.close')} aria-label={t('gallery.close')}>
          <IconClose size={15} />
        </button>
      </header>

      <div className="gal-body">
        {!entries.length ? (
          <p className="empty gal-empty">{t('gallery.empty')}</p>
        ) : !shown.length ? (
          <p className="empty gal-empty">{only === 'favorites' && !query ? t('gallery.noFavorites') : t('gallery.noMatch')}</p>
        ) : view === 'tiles' ? (
          <ul className="gal-tiles" style={{ '--tile': `${tileSize}px` }}>
            {shown.map((e) => (
              <li key={e.path}>
                <div
                  role="button"
                  tabIndex={0}
                  className={`gal-card${isCurrent(e, currentPath) ? ' current' : ''}`}
                  title={e.path}
                  onClick={() => onOpen?.(e)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen?.(e); }}
                  onContextMenu={onCardMenu ? (ev) => onCardMenu(ev, e) : undefined}
                >
                  <GalleryThumb entry={e} onNeedThumb={onNeedThumb} />
                  <span className="gal-name">{e.name}</span>
                  {star(e)}
                  {remove(e)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <table className="gal-table">
            <thead>
              <tr>
                <th className="c-fav" aria-label={t('gallery.favorites')}><IconStar size={13} /></th>
                <th className="c-name"><button type="button" onClick={() => sortBy('name')}>{t('gallery.col.name')}{arrow('name')}</button></th>
                <th className="c-dir">{t('gallery.col.folder')}</th>
                <th className="c-size"><button type="button" onClick={() => sortBy('size')}>{t('gallery.col.size')}{arrow('size')}</button></th>
                <th className="c-date"><button type="button" onClick={() => sortBy('opened')}>{t('gallery.col.opened')}{arrow('opened')}</button></th>
                <th className="c-date"><button type="button" onClick={() => sortBy('added')}>{t('gallery.col.added')}{arrow('added')}</button></th>
                <th className="c-act" aria-label={t('gallery.remove')} />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr
                  key={e.path}
                  className={isCurrent(e, currentPath) ? 'current' : ''}
                  title={e.path}
                  tabIndex={0}
                  onClick={() => onOpen?.(e)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') onOpen?.(e); }}
                  onContextMenu={onCardMenu ? (ev) => onCardMenu(ev, e) : undefined}
                >
                  <td className="c-fav">{star(e)}</td>
                  <td className="c-name">
                    <div className="c-name-in">
                      <GalleryThumb entry={e} onNeedThumb={onNeedThumb} className="gal-thumb small" />
                      <span>{e.name}</span>
                    </div>
                  </td>
                  <td className="c-dir">{e.dir}</td>
                  <td className="c-size">{e.size ? formatBytes(e.size) : '—'}</td>
                  <td className="c-date">{fmtDate(e.openedAt, i18n.language)}</td>
                  <td className="c-date">{fmtDate(e.addedAt, i18n.language)}</td>
                  <td className="c-act">{remove(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

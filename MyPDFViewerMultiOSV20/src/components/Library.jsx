import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconClose, IconPlus, IconGallery, IconSearch, IconLibrary, IconTiles, IconDetails, IconOutline, IconTrash,
} from './Icons.jsx';
import {
  sortGallery, filterGallery, favoritesOf, isCurrent, booksPerShelf, shelvesOf,
  BOOK_MIN, BOOK_MAX, GALLERY_SORTS, LIBRARY_VIEWS,
} from '../lib/gallery.js';
import { GalleryThumb, fmtDate } from './Gallery.jsx';
import { formatBytes } from '../lib/platform.js';

const VIEW_ICONS = { shelf: IconLibrary, list: IconOutline, details: IconDetails, covers: IconTiles };

// The library: the favorites, large, as books standing on shelves — or as a
// list, a covers wall, or a sortable table. One size slider scales whichever
// view is showing. It fills the document area like the gallery; a book opens
// its PDF.
export default function Library({
  entries = [], currentPath = '', bookSize = 220, view = 'shelf',
  onView, onBookSize, onOpen, onUnfavorite, onRemoveAll, onAdd, onNeedThumb, onClose, onBookMenu, onShowGallery,
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'opened', dir: 'desc' });
  const [shelfWidth, setShelfWidth] = useState(0);
  const rootRef = useRef(null);
  const bodyRef = useRef(null);

  const favorites = useMemo(() => favoritesOf(entries), [entries]);
  const shown = useMemo(
    () => sortGallery(filterGallery(favorites, { query }), sort.key, sort.dir),
    [favorites, query, sort],
  );
  const shelves = useMemo(
    () => shelvesOf(shown, booksPerShelf(shelfWidth || 1, bookSize)),
    [shown, shelfWidth, bookSize],
  );

  // Shelves hold as many books as the window is wide.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const measure = () => setShelfWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  const title = (e) => e.name.replace(/\.pdf$/i, '');

  const openProps = (e) => ({
    role: 'button',
    tabIndex: 0,
    title: e.path,
    onClick: () => onOpen?.(e),
    onKeyDown: (ev) => { if (ev.key === 'Enter') onOpen?.(e); },
    onContextMenu: onBookMenu ? (ev) => onBookMenu(ev, e) : undefined,
  });

  // Takes the book off the shelves at once (its star goes; the file and its
  // gallery card stay).
  const unstar = (e, className = 'gal-remove book-remove') => (
    <button
      type="button"
      className={className}
      title={t('library.removeOne')}
      aria-label={t('library.removeOne')}
      onClick={(ev) => { ev.stopPropagation(); onUnfavorite?.(e); }}
    >
      <IconClose size={13} />
    </button>
  );

  const renderShelf = () => shelves.map((row, i) => (
    <div className="shelf" key={i} data-shelf={i}>
      <ul className="shelf-books">
        {row.map((e) => (
          <li key={e.path} className="book-slot">
            <div className={`book${isCurrent(e, currentPath) ? ' current' : ''}`} {...openProps(e)}>
              <GalleryThumb entry={e} onNeedThumb={onNeedThumb} className="gal-thumb book-cover" />
              {unstar(e)}
            </div>
            <span className="book-title">{title(e)}</span>
          </li>
        ))}
      </ul>
      <div className="shelf-board" aria-hidden="true" />
    </div>
  ));

  const renderCovers = () => (
    <ul className="lib-covers">
      {shown.map((e) => (
        <li key={e.path}>
          <div className={`book cover-card${isCurrent(e, currentPath) ? ' current' : ''}`} {...openProps(e)}>
            <GalleryThumb entry={e} onNeedThumb={onNeedThumb} className="gal-thumb book-cover" />
            {unstar(e)}
            <span className="cover-title">{title(e)}</span>
          </div>
        </li>
      ))}
    </ul>
  );

  const renderList = () => (
    <ul className="lib-list">
      {shown.map((e) => (
        <li key={e.path}>
          <div className={`lib-row${isCurrent(e, currentPath) ? ' current' : ''}`} {...openProps(e)}>
            <GalleryThumb entry={e} onNeedThumb={onNeedThumb} className="gal-thumb lib-row-cover" />
            <span className="lib-row-text">
              <span className="lib-row-title">{title(e)}</span>
              <span className="lib-row-dir">{e.dir}</span>
              <span className="lib-row-meta">
                {e.size ? formatBytes(e.size) : '—'}
                {' · '}
                {t('library.lastOpened', { when: fmtDate(e.openedAt, i18n.language) })}
              </span>
            </span>
            {unstar(e, 'gal-remove lib-row-remove')}
          </div>
        </li>
      ))}
    </ul>
  );

  const renderDetails = () => (
    <table className="gal-table lib-table">
      <thead>
        <tr>
          <th className="c-name"><button type="button" onClick={() => sortBy('name')}>{t('gallery.col.name')}{arrow('name')}</button></th>
          <th className="c-dir">{t('gallery.col.folder')}</th>
          <th className="c-size"><button type="button" onClick={() => sortBy('size')}>{t('gallery.col.size')}{arrow('size')}</button></th>
          <th className="c-date"><button type="button" onClick={() => sortBy('opened')}>{t('gallery.col.opened')}{arrow('opened')}</button></th>
          <th className="c-date"><button type="button" onClick={() => sortBy('added')}>{t('gallery.col.added')}{arrow('added')}</button></th>
          <th className="c-act" aria-label={t('library.removeOne')} />
        </tr>
      </thead>
      <tbody>
        {shown.map((e) => (
          <tr key={e.path} className={isCurrent(e, currentPath) ? 'current' : ''} {...openProps(e)}>
            <td className="c-name">
              <div className="c-name-in">
                <GalleryThumb entry={e} onNeedThumb={onNeedThumb} className="gal-thumb lib-cell-cover" />
                <span>{e.name}</span>
              </div>
            </td>
            <td className="c-dir">{e.dir}</td>
            <td className="c-size">{e.size ? formatBytes(e.size) : '—'}</td>
            <td className="c-date">{fmtDate(e.openedAt, i18n.language)}</td>
            <td className="c-date">{fmtDate(e.addedAt, i18n.language)}</td>
            <td className="c-act">{unstar(e, 'gal-remove')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const body = () => {
    if (!favorites.length) return <p className="empty gal-empty">{t('library.empty')}</p>;
    if (!shown.length) return <p className="empty gal-empty">{t('gallery.noMatch')}</p>;
    if (view === 'list') return renderList();
    if (view === 'details') return renderDetails();
    if (view === 'covers') return renderCovers();
    return renderShelf();
  };

  return (
    <section
      className={`gallery library view-${view}`}
      ref={rootRef}
      tabIndex={-1}
      aria-label={t('library.title')}
      data-library
      style={{ '--book': `${bookSize}px` }}
    >
      <header className="gal-bar">
        <span className="gal-title">
          <IconLibrary size={18} />{t('library.title')}
          <span className="gal-count">{t('library.count', { n: favorites.length })}</span>
        </span>

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

        {view !== 'details' ? (
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
        ) : null}
        <label className="gal-size" title={t('library.bookSize')}>
          <span>{t('library.bookSize')}</span>
          <input
            type="range"
            min={BOOK_MIN}
            max={BOOK_MAX}
            step={10}
            value={bookSize}
            aria-label={t('library.bookSize')}
            onChange={(e) => onBookSize?.(Number(e.target.value))}
          />
        </label>

        <div className="seg-row gal-views" role="group" aria-label={t('gallery.view')}>
          {LIBRARY_VIEWS.map((v) => {
            const Icon = VIEW_ICONS[v];
            return (
              <button
                key={v}
                type="button"
                className={`btn seg${view === v ? ' active' : ''}`}
                onClick={() => onView?.(v)}
                title={t(`library.views.${v}`)}
                aria-pressed={view === v}
              >
                <Icon size={15} /> {t(`library.views.${v}`)}
              </button>
            );
          })}
        </div>

        {onRemoveAll ? (
          <button
            type="button"
            className="btn"
            onClick={() => onRemoveAll(favorites)}
            disabled={!favorites.length}
            title={t('library.removeAllTip')}
          >
            <IconTrash size={15} /> {t('library.removeAll')}
          </button>
        ) : null}
        {onAdd ? (
          <button type="button" className="btn" onClick={onAdd} title={t('library.addTip')}>
            <IconPlus size={15} /> {t('gallery.add')}
          </button>
        ) : null}
        {onShowGallery ? (
          <button type="button" className="btn icon-only" onClick={onShowGallery} title={t('favorites.openGallery')} aria-label={t('favorites.openGallery')}>
            <IconGallery size={15} />
          </button>
        ) : null}
        <button type="button" className="btn icon-only" onClick={onClose} title={t('library.close')} aria-label={t('library.close')}>
          <IconClose size={15} />
        </button>
      </header>

      <div className="gal-body lib-body" ref={bodyRef}>
        {body()}
      </div>
    </section>
  );
}

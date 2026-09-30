import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconBook, IconCover, IconContents, IconSearch, IconTrash, IconClose, IconCheck,
} from './Icons.jsx';
import {
  galleryKey, galleryProgress, sortGallery, searchGallery, coverInitials, GALLERY_SORTS,
} from '../lib/gallery.js';
import { galleryStore } from '../lib/gallerystore.js';

// The gallery: the books that have been read, as a shelf.
//
// Two ways of looking at the same list, because the two answer different
// questions: large covers for "which book was that?", and the detailed list for
// "how far did I get, and where is the file?". Which one is showing is a
// setting, so it survives closing the program.
//
// It is built for a shelf that has grown for years. A hundred thousand books
// are sorted and searched as plain data (tens of milliseconds) but only the
// couple of dozen rows in view are ever made into elements, and a cover is
// fetched only when its card appears. What is on screen therefore costs the
// same whether the shelf holds fifty books or a hundred thousand.
//
// The component is pure in the sense that matters: it renders the list it is
// given and reports what the reader did. Everything that changes is owned by
// App.

const CARD_HEIGHT = 268;   // a card plus the gap below it
const CARD_WIDTH = 182;    // the narrowest a card is allowed to be, plus its gap
const ROW_HEIGHT = 53;     // one row of the detailed list
const OVERSCAN = 2;        // rows kept either side of the view, so scrolling is quiet

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(at, language) {
  const time = Number(at) || 0;
  if (!time) return '—';
  try {
    return new Date(time).toLocaleString(language === 'en' ? 'en-GB' : 'ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return new Date(time).toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * Which rows of a list are worth making elements for.
 * Everything above and below them is one blank spacer, so the scrollbar still
 * describes the whole shelf.
 */
export function windowOf(scrollTop, viewHeight, rowHeight, rows, overscan = OVERSCAN) {
  if (!rows) return { first: 0, last: 0, above: 0, below: 0 };
  const visible = Math.ceil((viewHeight || rowHeight) / rowHeight) + overscan * 2;
  // Clamped to the end of the list: a search that shortens the shelf while it
  // is scrolled down must still show something, never a blank pane.
  const first = Math.min(
    Math.max(0, rows - visible),
    Math.max(0, Math.floor((scrollTop || 0) / rowHeight) - overscan),
  );
  const last = Math.min(rows, first + visible);
  return { first, last, above: first * rowHeight, below: Math.max(0, (rows - last) * rowHeight) };
}

/** Follows a scrolling element and says which rows it is showing. */
function useRowWindow(ref, rowHeight, rows) {
  const [view, setView] = useState({ top: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setView({ top: el.scrollTop, height: el.clientHeight });
    read();
    el.addEventListener('scroll', read, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', read);
      observer?.disconnect();
    };
  }, [ref, rowHeight, rows]);

  return useMemo(
    () => windowOf(view.top, view.height, rowHeight, rows),
    [view.top, view.height, rowHeight, rows],
  );
}

/** How many cards fit across the grid. */
function useColumns(ref) {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setColumns(Math.max(1, Math.floor((el.clientWidth - 24) / CARD_WIDTH) || 1));
    read();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [ref]);
  return columns;
}

/**
 * The cover, or a lettered plate in its place.
 *
 * In the desktop app a cover is an ordinary <img> pointed at app://covers/…,
 * so the browser fetches it; on the web it comes out of IndexedDB. Either way
 * it happens here, in a card that is already on screen, and never for the rest
 * of the shelf.
 */
function coverOf(entry, store) {
  if (!entry?.cover) return '';
  // A shelf written before covers had a store of their own keeps the picture
  // itself on the entry; it is still perfectly good to show.
  if (typeof entry.cover === 'string' && entry.cover.startsWith('data:')) return entry.cover;
  return store.coverSrc(entry);
}

export function Cover({ entry }) {
  const store = galleryStore();
  const [src, setSrc] = useState(() => coverOf(entry, store));

  useEffect(() => {
    let cancelled = false;
    const direct = coverOf(entry, store);
    setSrc(direct);
    if (direct) return undefined;
    const key = entry?.path || entry?.name;
    if (!key) return undefined;
    // The picture may already have been made even when the shelf row does not
    // say so. Asking for it is what puts the small cover on the row.
    store.loadCover({ ...entry, cover: true })
      .then((value) => { if (!cancelled) setSrc(value || ''); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [entry, store]);

  if (src) {
    return (
      <img
        className="gcover-img"
        src={src}
        alt={entry.title || entry.name}
        loading="lazy"
        draggable={false}
        onError={() => setSrc('')}
      />
    );
  }
  return (
    <span className="gcover-blank" data-format={entry.format || 'book'}>
      <IconBook size={22} />
      <b>{coverInitials(entry)}</b>
    </span>
  );
}

function progressText(entry, t) {
  const fraction = galleryProgress(entry);
  if (fraction <= 0) return t('gallery.unread');
  if (fraction >= 1) return t('gallery.finished');
  return t('gallery.progress', { percent: Math.round(fraction * 100) });
}

export default function Gallery({
  entries = [],
  view = 'icons',
  sort = 'recent',
  language = 'ko',
  onOpen,
  onForget,
  onClear,
  onView,
  onSort,
  onClose,
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const bodyRef = useRef(null);

  // Searching a long shelf is cheap but not free, and nobody wants it run on
  // every keystroke of a hundred thousand books.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed), 140);
    return () => clearTimeout(timer);
  }, [typed]);

  const shown = useMemo(
    () => sortGallery(searchGallery(entries, query), sort),
    [entries, query, sort],
  );

  // A different list means a different place in it: searching, sorting or
  // switching views puts the reader back at the top.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [query, sort, view]);

  const columns = useColumns(bodyRef);
  const rowHeight = view === 'details' ? ROW_HEIGHT : CARD_HEIGHT;
  const rows = view === 'details' ? shown.length : Math.ceil(shown.length / columns);
  const win = useRowWindow(bodyRef, rowHeight, rows);

  const forget = useCallback((e, entry) => {
    e.stopPropagation();
    onForget?.(galleryKey(entry));
  }, [onForget]);

  const header = (
    <div className="gallery-head">
      <div className="gallery-title">
        <h2>{t('gallery.title')}</h2>
        <span className="gallery-count">
          {t('gallery.count', { n: entries.length })}
          {query && shown.length !== entries.length ? ` · ${shown.length}` : ''}
        </span>
      </div>

      <label className="gallery-search">
        <IconSearch size={15} />
        <input
          type="search"
          value={typed}
          placeholder={t('gallery.search')}
          aria-label={t('gallery.search')}
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>

      {/* The two ways of showing the same books. */}
      <div className="seg gallery-views" role="group" aria-label={t('cmd.gallery')}>
        <button
          type="button"
          className={view === 'icons' ? 'on' : ''}
          title={t('gallery.icons')}
          aria-pressed={view === 'icons'}
          onClick={() => onView?.('icons')}
        >
          <IconCover size={15} />
          <span>{t('gallery.icons')}</span>
        </button>
        <button
          type="button"
          className={view === 'details' ? 'on' : ''}
          title={t('gallery.details')}
          aria-pressed={view === 'details'}
          onClick={() => onView?.('details')}
        >
          <IconContents size={15} />
          <span>{t('gallery.details')}</span>
        </button>
      </div>

      <select
        className="gallery-sort"
        value={sort}
        aria-label={t('gallery.sort')}
        title={t('gallery.sort')}
        onChange={(e) => onSort?.(e.target.value)}
      >
        {GALLERY_SORTS.map((id) => (
          <option key={id} value={id}>
            {t(`gallery.sort${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="gallery-clear"
        title={t('gallery.clear')}
        disabled={!entries.length}
        onClick={() => onClear?.()}
      >
        <IconTrash size={15} />
      </button>

      {onClose ? (
        <button type="button" className="gallery-close" title={t('common.close')} onClick={onClose}>
          <IconClose size={15} />
        </button>
      ) : null}
    </div>
  );

  if (!entries.length || !shown.length) {
    return (
      <section className={`gallery gallery-${view}`} aria-label={t('gallery.title')}>
        {header}
        <p className="gallery-empty">
          {entries.length ? t('gallery.noMatch', { query }) : t('gallery.empty')}
        </p>
      </section>
    );
  }

  let body;
  if (view === 'details') {
    const rowsShown = shown.slice(win.first, win.last);
    body = (
      <div className="gallery-table-wrap" ref={bodyRef}>
        <table className="gallery-table">
          <thead>
            <tr>
              <th className="gcol-cover" aria-label={t('gallery.columns.title')} />
              <th>{t('gallery.columns.title')}</th>
              <th>{t('gallery.columns.author')}</th>
              <th>{t('gallery.columns.format')}</th>
              <th className="gcol-num">{t('gallery.columns.size')}</th>
              <th>{t('gallery.columns.progress')}</th>
              <th>{t('gallery.columns.lastRead')}</th>
              <th>{t('gallery.columns.location')}</th>
              <th aria-label={t('gallery.forget')} />
            </tr>
          </thead>
          <tbody>
            {win.above ? <tr className="gspacer" style={{ height: win.above }} aria-hidden="true"><td colSpan={9} /></tr> : null}
            {rowsShown.map((entry) => (
              <tr
                key={galleryKey(entry)}
                tabIndex={0}
                onDoubleClick={() => onOpen?.(entry)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(entry); }}
              >
                <td className="gcol-cover">
                  <button
                    type="button"
                    className="gthumb small"
                    title={t('gallery.open')}
                    onClick={() => onOpen?.(entry)}
                  >
                    <Cover entry={entry} />
                  </button>
                </td>
                <td className="gcol-title">
                  <button type="button" className="glink" onClick={() => onOpen?.(entry)}>
                    {entry.title || entry.name}
                  </button>
                </td>
                <td>{entry.author || '—'}</td>
                <td>{entry.formatLabel || entry.format || '—'}</td>
                <td className="gcol-num">{formatSize(entry.size)}</td>
                <td>
                  <span className="gbar" aria-hidden="true">
                    <i style={{ width: `${Math.round(galleryProgress(entry) * 100)}%` }} />
                  </span>
                  <span className="gbar-text">{progressText(entry, t)}</span>
                </td>
                <td>{formatDate(entry.openedAt, language)}</td>
                <td className="gcol-path" title={entry.path || entry.dir || ''}>
                  {entry.dir || entry.path || '—'}
                </td>
                <td>
                  <button
                    type="button"
                    className="gforget"
                    title={t('gallery.forget')}
                    aria-label={`${t('gallery.forget')}: ${entry.title || entry.name}`}
                    onClick={(e) => forget(e, entry)}
                  >
                    <IconClose size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {win.below ? <tr className="gspacer" style={{ height: win.below }} aria-hidden="true"><td colSpan={9} /></tr> : null}
          </tbody>
        </table>
      </div>
    );
  } else {
    const cards = shown.slice(win.first * columns, win.last * columns);
    body = (
      <div className="gallery-grid-wrap" ref={bodyRef}>
        <div style={{ height: win.above }} aria-hidden="true" />
        <ul className="gallery-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {cards.map((entry) => (
            <li key={galleryKey(entry)}>
              <button
                type="button"
                className="gcard"
                title={`${entry.title || entry.name}\n${entry.path || ''}`}
                onClick={() => onOpen?.(entry)}
              >
                <span className="gthumb">
                  <Cover entry={entry} />
                  {galleryProgress(entry) >= 1 ? <span className="gdone"><IconCheck size={12} /></span> : null}
                </span>
                <span className="gname">{entry.title || entry.name}</span>
                <span className="gauthor">{entry.author || t('gallery.unknownAuthor')}</span>
                <span className="gmeta">
                  <span className="gformat">{entry.formatLabel || entry.format}</span>
                  <span className="gbar" aria-hidden="true">
                    <i style={{ width: `${Math.round(galleryProgress(entry) * 100)}%` }} />
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="gforget"
                title={t('gallery.forget')}
                aria-label={`${t('gallery.forget')}: ${entry.title || entry.name}`}
                onClick={(e) => forget(e, entry)}
              >
                <IconClose size={13} />
              </button>
            </li>
          ))}
        </ul>
        <div style={{ height: win.below }} aria-hidden="true" />
      </div>
    );
  }

  return (
    <section className={`gallery gallery-${view}`} aria-label={t('gallery.title')}>
      {header}
      {body}
    </section>
  );
}

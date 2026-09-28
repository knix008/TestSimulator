import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconBook, IconCover, IconContents, IconSearch, IconTrash, IconClose, IconCheck,
} from './Icons.jsx';
import {
  galleryKey, galleryProgress, sortGallery, searchGallery, coverInitials, GALLERY_SORTS,
} from '../lib/gallery.js';

// The gallery: the books that have been read, as a shelf.
//
// Two ways of looking at the same list, because the two answer different
// questions: large covers for "which book was that?", and the detailed list for
// "how far did I get, and where is the file?". Which one is showing is a
// setting, so it survives closing the program.
//
// The component is pure: it renders the list it is given and reports what the
// reader did — open this book, forget that one, sort this way. Everything that
// changes is owned by App.

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

/** The cover, or a lettered plate in its place. */
function Cover({ entry, t }) {
  if (entry.cover) {
    return <img className="gcover-img" src={entry.cover} alt={entry.title || entry.name} draggable={false} />;
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
  const [query, setQuery] = useState('');

  const shown = useMemo(
    () => sortGallery(searchGallery(entries, query), sort),
    [entries, query, sort],
  );

  const header = (
    <div className="gallery-head">
      <div className="gallery-title">
        <h2>{t('gallery.title')}</h2>
        <span className="gallery-count">{t('gallery.count', { n: entries.length })}</span>
      </div>

      <label className="gallery-search">
        <IconSearch size={15} />
        <input
          type="search"
          value={query}
          placeholder={t('gallery.search')}
          aria-label={t('gallery.search')}
          onChange={(e) => setQuery(e.target.value)}
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

  let body;
  if (!entries.length) {
    body = <p className="gallery-empty">{t('gallery.empty')}</p>;
  } else if (!shown.length) {
    body = <p className="gallery-empty">{t('gallery.noMatch', { query })}</p>;
  } else if (view === 'details') {
    body = (
      <div className="gallery-table-wrap">
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
            {shown.map((entry) => (
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
                    <Cover entry={entry} t={t} />
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
                    onClick={() => onForget?.(galleryKey(entry))}
                  >
                    <IconClose size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else {
    body = (
      <ul className="gallery-grid">
        {shown.map((entry) => (
          <li key={galleryKey(entry)}>
            <button
              type="button"
              className="gcard"
              title={`${entry.title || entry.name}\n${entry.path || ''}`}
              onClick={() => onOpen?.(entry)}
            >
              <span className="gthumb">
                <Cover entry={entry} t={t} />
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
              onClick={() => onForget?.(galleryKey(entry))}
            >
              <IconClose size={13} />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className={`gallery gallery-${view}`} aria-label={t('gallery.title')}>
      {header}
      {body}
    </section>
  );
}

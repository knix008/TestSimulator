import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconGrid, IconOutline, IconImage, IconSearch, IconBookmark, IconClip,
  IconCopy, IconDownload, IconTrash, IconChevron,
} from './Icons.jsx';

const PANELS = [
  { id: 'thumbnails', icon: IconGrid, key: 'side.thumbnails' },
  { id: 'outline', icon: IconOutline, key: 'side.outline' },
  { id: 'search', icon: IconSearch, key: 'side.search' },
  { id: 'images', icon: IconImage, key: 'side.images' },
  { id: 'bookmarks', icon: IconBookmark, key: 'side.bookmarks' },
  { id: 'clips', icon: IconClip, key: 'side.clips' },
];

// The left panel. One rail of tabs plus the active panel; each tab has a
// tooltip, like every other control in the app.
export default function Sidebar({
  panel, onPanel,
  doc, pageNumber, onGoToPage,
  outline, images, onExtractImages, extracting,
  search, bookmarks, clips,
  onCopyImage, onSaveImage, onRemoveBookmark, onCopyClip, onSaveClip, onRemoveClip,
}) {
  const { t } = useTranslation();

  // The panel is a fixed width (see --side-width in App.css); only the rail
  // remains when every panel is closed.
  return (
    <aside className={`sidebar${panel === 'none' ? ' collapsed' : ''}`}>
      <nav className="side-rail">
        {PANELS.map(({ id, icon: Icon, key }) => (
          <button
            key={id}
            className={`rail-btn${panel === id ? ' active' : ''}`}
            onClick={() => onPanel(panel === id ? 'none' : id)}
            title={t(key)}
            aria-label={t(key)}
          >
            <Icon size={19} />
          </button>
        ))}
      </nav>

      {panel !== 'none' ? (
        <div className="side-panel">
          <div className="side-head">{t(`side.${panel}`)}</div>
          <div className="side-body">
            {panel === 'thumbnails' && <Thumbnails doc={doc} current={pageNumber} onGoToPage={onGoToPage} />}

            {panel === 'outline' && (
              outline.length === 0
                ? <p className="empty">{t('side.noOutline')}</p>
                : <OutlineTree nodes={outline} onGoToPage={onGoToPage} currentPage={pageNumber} />
            )}

            {panel === 'search' && <SearchPanel search={search} onGoToPage={onGoToPage} />}

            {panel === 'images' && (
              <>
                <div className="side-actions">
                  <button className="btn small" onClick={() => onExtractImages(pageNumber)} disabled={!doc || extracting} title={t('side.extract')}>
                    {t('side.extract')}
                  </button>
                </div>
                {images.length === 0 ? (
                  <p className="empty">{t('side.noImages')}</p>
                ) : (
                  <ul className="img-list">
                    {images.map((im) => (
                      <li key={im.id}>
                        <img src={im.dataUrl} alt="" />
                        <div className="img-meta">
                          <span>{im.width}×{im.height}</span>
                          <span className="img-actions">
                            <button className="icon-btn" onClick={() => onCopyImage(im)} title={t('menu.copy')}><IconCopy size={15} /></button>
                            <button className="icon-btn" onClick={() => onSaveImage(im)} title={t('menu.saveImage')}><IconDownload size={15} /></button>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {panel === 'bookmarks' && (
              bookmarks.length === 0
                ? <p className="empty">{t('side.noBookmarks')}</p>
                : (
                  <ul className="bm-list">
                    {bookmarks.map((b) => (
                      <li key={b.id}>
                        <button className="side-item" onClick={() => onGoToPage(b.page)} title={b.label}>
                          <IconBookmark size={14} />
                          <span className="ol-title">{b.label}</span>
                          <span className="ol-page">{b.page}</span>
                        </button>
                        <button className="icon-btn" onClick={() => onRemoveBookmark(b.id)} title={t('common.delete')}>
                          <IconTrash size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
            )}

            {panel === 'clips' && (
              clips.length === 0
                ? <p className="empty">{t('side.noClips')}</p>
                : (
                  <ul className="clip-list">
                    {clips.map((c) => (
                      <li key={c.id}>
                        {c.kind === 'image'
                          ? <img src={c.content} alt="" />
                          : <p className="clip-text">{c.content.slice(0, 300)}</p>}
                        <div className="img-meta">
                          <span>{t('side.page', { n: c.page })}</span>
                          <span className="img-actions">
                            <button className="icon-btn" onClick={() => onCopyClip(c)} title={t('menu.copy')}><IconCopy size={15} /></button>
                            <button className="icon-btn" onClick={() => onSaveClip(c)} title={t('common.save')}><IconDownload size={15} /></button>
                            <button className="icon-btn" onClick={() => onRemoveClip(c.id)} title={t('common.delete')}><IconTrash size={15} /></button>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

// ── Outline tree ──────────────────────────────────────────
// A real tree: branches fold away, and parents are joined to their children by
// connector lines (drawn in CSS from the list items themselves).
function OutlineTree({ nodes, onGoToPage, currentPage }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => new Set());

  const allParents = useMemo(() => {
    const ids = [];
    const walk = (list) => list.forEach((n) => { if (n.items.length) { ids.push(n.id); walk(n.items); } });
    walk(nodes);
    return ids;
  }, [nodes]);

  const toggle = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const renderLevel = (list) => (
    <ul className="tree">
      {list.map((node) => {
        const hasKids = node.items.length > 0;
        const isCollapsed = collapsed.has(node.id);
        return (
          <li key={node.id} className={hasKids ? 'branch' : 'leaf'}>
            <div className={`tree-row${node.page && node.page === currentPage ? ' current' : ''}`}>
              {hasKids ? (
                <button
                  className="tree-toggle"
                  onClick={() => toggle(node.id)}
                  title={isCollapsed ? t('side.expand') : t('side.collapse')}
                  aria-label={isCollapsed ? t('side.expand') : t('side.collapse')}
                  aria-expanded={!isCollapsed}
                >
                  <IconChevron size={13} className={isCollapsed ? '' : 'open'} />
                </button>
              ) : <span className="tree-toggle placeholder" />}

              <button
                className="tree-label"
                onClick={() => (node.page ? onGoToPage(node.page) : hasKids && toggle(node.id))}
                title={node.title}
              >
                <span className="ol-title">{node.title || '—'}</span>
                {node.page ? <span className="ol-page">{node.page}</span> : null}
              </button>
            </div>
            {hasKids && !isCollapsed ? renderLevel(node.items) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="outline-tree">
      {allParents.length ? (
        <div className="side-actions">
          <button className="btn small" onClick={() => setCollapsed(new Set())} title={t('side.expandAll')}>
            {t('side.expandAll')}
          </button>
          <button className="btn small" onClick={() => setCollapsed(new Set(allParents))} title={t('side.collapseAll')}>
            {t('side.collapseAll')}
          </button>
        </div>
      ) : null}
      {renderLevel(nodes)}
    </div>
  );
}

// ── Thumbnails ────────────────────────────────────────────
function Thumbnails({ doc, current, onGoToPage }) {
  if (!doc) return null;
  return (
    <ul className="thumb-list">
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
        <Thumb key={n} doc={doc} num={n} active={n === current} onClick={() => onGoToPage(n)} />
      ))}
    </ul>
  );
}

function Thumb({ doc, num, active, onClick }) {
  const ref = useRef(null);
  const canvasRef = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true);
    }, { root: el.closest('.side-body'), rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen) return undefined;
    let cancelled = false;
    let task = null;
    (async () => {
      try {
        const page = await doc.getPage(num);
        if (cancelled || !canvasRef.current) return;
        const vp = page.getViewport({ scale: 1 });
        const scale = 150 / vp.width;
        const view = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(view.width);
        canvas.height = Math.floor(view.height);
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport: view, background: '#ffffff' });
        await task.promise;
      } catch { /* a thumbnail that fails simply stays blank */ }
    })();
    return () => { cancelled = true; try { task?.cancel(); } catch { /* ignore */ } };
  }, [seen, doc, num]);

  // Keep the active thumbnail in view as the page changes — by scrolling the
  // panel itself, never scrollIntoView, which would also scroll the whole app.
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    const panel = el?.closest('.side-body');
    if (!el || !panel) return;
    const elRect = el.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    if (elRect.top >= panelRect.top && elRect.bottom <= panelRect.bottom) return;
    const delta = elRect.top - panelRect.top;
    panel.scrollTo({ top: Math.max(0, panel.scrollTop + delta - 8), behavior: 'smooth' });
  }, [active]);

  return (
    <li ref={ref} className={active ? 'active' : ''}>
      <button onClick={onClick} title={`${num}`}>
        <canvas ref={canvasRef} />
        <span>{num}</span>
      </button>
    </li>
  );
}

// ── Search ────────────────────────────────────────────────
function SearchPanel({ search, onGoToPage }) {
  const { t } = useTranslation();
  const [term, setTerm] = useState(search.query || '');

  return (
    <div className="search-panel">
      <form
        className="search-row"
        onSubmit={(e) => { e.preventDefault(); search.run(term); }}
      >
        <input
          className="input"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('side.searchPlaceholder')}
          title={t('side.searchPlaceholder')}
          data-search-input
        />
        <button className="btn small" type="submit" disabled={search.busy} title={t('toolbar.search')}>
          <IconSearch size={15} />
        </button>
      </form>

      {search.busy ? <p className="empty">{t('progress.searching')}…</p> : null}
      {!search.busy && search.query && search.results.length === 0 ? <p className="empty">{t('side.noResults')}</p> : null}
      {search.results.length > 0 ? (
        <>
          <p className="search-count">{t('side.results', { count: search.results.length })}</p>
          <ul className="hit-list">
            {search.results.slice(0, 500).map((h, i) => (
              <li key={i}>
                <button className="side-item" onClick={() => onGoToPage(h.page)} title={h.snippet}>
                  <span className="hit-page">{t('side.page', { n: h.page })}</span>
                  <span className="hit-text">{h.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

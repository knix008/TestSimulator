import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconContents, IconLibrary, IconBookmark, IconSearch, IconFolder, IconFolderOpen,
  IconBook, IconChevron, IconTrash, IconRecent, IconClose,
} from './Icons.jsx';
import { flattenToc } from '../lib/book.js';
import { folderLabel } from '../lib/folders.js';
import { formatBytes } from '../lib/platform.js';
import { PANEL_WIDTH_MAX } from '../lib/settings.js';
import { usePanelMinWidth, clampToPanelMin } from './panelWidth.js';

// The left panel: the tools you read *with* — the contents list, the folder of
// books, the bookmarks you made and the search results. One tab at a time, and
// the whole panel can be dragged wider or closed from the toolbar.

const TABS = [
  { id: 'contents', icon: IconContents, label: 'panel.contents' },
  { id: 'library', icon: IconLibrary, label: 'panel.library' },
  { id: 'bookmarks', icon: IconBookmark, label: 'panel.bookmarks' },
  { id: 'search', icon: IconSearch, label: 'panel.search' },
];

function Resizer({ width, onResize, side = 'left', min }) {
  const drag = useRef(null);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x0: e.clientX, w0: width };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const delta = side === 'left' ? e.clientX - d.x0 : d.x0 - e.clientX;
    // Never past the point where the panel's own tabs would be cut off.
    onResize(clampToPanelMin(d.w0 + delta, min));
  };

  const stop = (e) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      className={`panel-resizer ${side}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    />
  );
}

function FolderNode({ entry, depth, currentPath, onOpenFile, loadFolder }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState(null);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (children) return;
    setBusy(true);
    try {
      setChildren(await loadFolder(entry.path));
    } finally {
      setBusy(false);
    }
  };

  if (entry.kind === 'dir') {
    return (
      <li className="tree-item">
        <button type="button" className="tree-row" onClick={toggle} title={entry.path} style={{ paddingLeft: 6 + depth * 12 }}>
          <IconChevron size={13} className={open ? 'open' : ''} />
          {open ? <IconFolderOpen size={15} /> : <IconFolder size={15} />}
          <span className="tree-name">{entry.name}</span>
        </button>
        {open ? (
          <ul className="tree-list">
            {busy ? <li className="tree-note">…</li> : null}
            {(children || []).map((childEntry) => (
              <FolderNode
                key={childEntry.path}
                entry={childEntry}
                depth={depth + 1}
                currentPath={currentPath}
                onOpenFile={onOpenFile}
                loadFolder={loadFolder}
              />
            ))}
            {children && !children.length && !busy ? <li className="tree-note">—</li> : null}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <li className="tree-item">
      <button
        type="button"
        className={`tree-row${currentPath === entry.path ? ' active' : ''}`}
        onClick={() => onOpenFile(entry.path)}
        title={`${entry.path}${entry.size ? ` · ${formatBytes(entry.size)}` : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <span className="tree-spacer" />
        <IconBook size={15} />
        <span className="tree-name">{entry.name}</span>
        <span className="tree-format">{String(entry.format || '').toUpperCase()}</span>
      </button>
    </li>
  );
}

export default function LeftPanel({
  panel, width, onPanel, onResize,
  book, section, toc, onGoTo,
  bookmarks, onGoToBookmark, onRemoveBookmark, onClearBookmarks,
  search, onSearch, onGoToHit,
  folderRoot, currentPath, desktop, onPickFolder, onOpenFile, loadFolder,
  recentFiles, onOpenRecent, onRemoveRecent, onClearRecent,
}) {
  const { t, i18n } = useTranslation();
  const tabsRef = useRef(null);
  // The panel is never narrower than its own tab strip, in any language.
  const minWidth = usePanelMinWidth(tabsRef, [i18n.language]);
  const [query, setQuery] = useState(search?.query || '');
  const [roots, setRoots] = useState([]);
  const [rootBusy, setRootBusy] = useState(false);

  useEffect(() => { setQuery(search?.query || ''); }, [search?.query]);

  useEffect(() => {
    if (panel !== 'library' || !folderRoot || !desktop) return;
    let alive = true;
    setRootBusy(true);
    loadFolder(folderRoot)
      .then((entries) => { if (alive) setRoots(entries); })
      .finally(() => { if (alive) setRootBusy(false); });
    return () => { alive = false; };
  }, [panel, folderRoot, desktop, loadFolder]);

  const submit = useCallback((e) => {
    e?.preventDefault?.();
    onSearch(query);
  }, [onSearch, query]);

  if (panel === 'none') return null;

  const rows = flattenToc(toc || []);
  const shown = Math.max(width, minWidth);

  return (
    <aside
      className="side-panel left"
      style={{ width: shown, minWidth }}
      aria-label={t('panel.left')}
    >
      <div className="panel-tabs" role="tablist" aria-label={t('panel.left')} ref={tabsRef}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={panel === tab.id}
            className={`panel-tab${panel === tab.id ? ' active' : ''}`}
            onClick={() => onPanel(tab.id)}
            title={t(tab.label)}
            aria-label={t(tab.label)}
          >
            <tab.icon size={16} />
            <span className="panel-tab-label">{t(tab.label)}</span>
          </button>
        ))}
      </div>

      <div className="panel-body">
        {panel === 'contents' ? (
          !book ? <p className="panel-note">{t('panel.empty')}</p> : (
            <>
              {!toc?.length ? <p className="panel-note">{t('panel.noContents')}</p> : null}
              <ul className="toc-list">
                {rows.map((row, i) => (
                  <li key={`${row.section}-${i}`}>
                    <button
                      type="button"
                      className={`toc-row${row.section === section ? ' active' : ''}`}
                      style={{ paddingLeft: 8 + row.depth * 14 }}
                      onClick={() => onGoTo(row.section, row.anchor)}
                      disabled={row.section == null}
                      title={row.label}
                    >
                      <span className="toc-label">{row.label}</span>
                      {row.section != null ? <span className="toc-num">{row.section + 1}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}

        {panel === 'library' ? (
          <>
            <div className="panel-actions">
              <button type="button" className="btn small" onClick={onPickFolder} disabled={!desktop} title={t('panel.pickFolder')}>
                <IconFolderOpen size={15} />{t('panel.pickFolder')}
              </button>
            </div>
            {!desktop ? <p className="panel-note">{t('panel.folderWeb')}</p> : null}
            {desktop && !folderRoot ? <p className="panel-note">{t('panel.noFolder')}</p> : null}
            {folderRoot ? (
              <>
                <p className="panel-head" title={folderRoot}>{folderLabel(folderRoot)}</p>
                <ul className="tree-list">
                  {rootBusy ? <li className="tree-note">…</li> : null}
                  {roots.map((entry) => (
                    <FolderNode
                      key={entry.path}
                      entry={entry}
                      depth={0}
                      currentPath={currentPath}
                      onOpenFile={onOpenFile}
                      loadFolder={loadFolder}
                    />
                  ))}
                </ul>
              </>
            ) : null}

            <p className="panel-head">
              {t('recent.title')}
              {recentFiles?.length ? (
                <button type="button" className="linkish" onClick={onClearRecent} title={t('recent.clear')}>
                  <IconTrash size={13} />{t('recent.clear')}
                </button>
              ) : null}
            </p>
            {!recentFiles?.length ? <p className="panel-note">{t('recent.empty')}</p> : (
              <ul className="recent-list">
                {recentFiles.map((file) => (
                  <li key={file.path || file.name}>
                    <button
                      type="button"
                      className="recent-row"
                      onClick={() => onOpenRecent(file)}
                      title={`${file.path || file.name}${file.format ? ` · ${String(file.format).toUpperCase()}` : ''}`}
                    >
                      <IconRecent size={14} />
                      <span className="recent-name">{file.name}</span>
                      <span className="recent-dir">{file.dir || ''}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onRemoveRecent(file.path || file.name)}
                      title={t('recent.remove')}
                      aria-label={t('recent.remove')}
                    >
                      <IconClose size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {panel === 'bookmarks' ? (
          <>
            <div className="panel-actions">
              <button
                type="button"
                className="btn small"
                onClick={onClearBookmarks}
                disabled={!bookmarks?.length}
                title={t('panel.removeAll')}
              >
                <IconTrash size={15} />{t('panel.removeAll')}
              </button>
            </div>
            {!bookmarks?.length ? <p className="panel-note">{t('panel.noBookmarks')}</p> : (
              <ul className="mark-list">
                {bookmarks.map((mark) => (
                  <li key={mark.id}>
                    <button
                      type="button"
                      className="mark-row"
                      onClick={() => onGoToBookmark(mark)}
                      title={`${t('panel.goTo')} — ${mark.label}`}
                    >
                      <IconBookmark size={14} />
                      <span className="mark-label">{mark.label}</span>
                      <span className="mark-where">{(mark.section ?? 0) + 1}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onRemoveBookmark(mark.id)}
                      title={t('panel.remove')}
                      aria-label={t('panel.remove')}
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {panel === 'search' ? (
          <>
            <form className="panel-search" onSubmit={submit}>
              <input
                className="input"
                data-search-input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('panel.searchPlaceholder')}
                title={t('panel.searchPlaceholder')}
                disabled={!book}
              />
              <button type="submit" className="icon-btn" disabled={!book || !query.trim()} title={t('cmd.find')} aria-label={t('cmd.find')}>
                <IconSearch size={16} />
              </button>
            </form>
            {search?.busy ? <p className="panel-note">{t('panel.searching')}</p> : null}
            {!search?.busy && search?.query && !search?.results?.length ? (
              <p className="panel-note">{t('panel.noResults')}</p>
            ) : null}
            {search?.results?.length ? (
              <>
                <p className="panel-head">{t('panel.results', { count: search.results.length })}</p>
                <ul className="hit-list">
                  {search.results.map((hit, i) => (
                    <li key={`${hit.section}-${hit.index}-${i}`}>
                      <button
                        type="button"
                        className={`hit-row${search.activeIndex === i ? ' active' : ''}`}
                        onClick={() => onGoToHit(i)}
                        title={hit.snippet}
                      >
                        <span className="hit-where">{hit.section + 1}</span>
                        <span className="hit-snippet">{hit.snippet}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <Resizer width={shown} onResize={onResize} side="left" min={minWidth} />
    </aside>
  );
}

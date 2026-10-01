import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconContents, IconLibrary, IconBookmark, IconBookmarkAdd, IconSearch, IconFolder, IconFolderOpen,
  IconBook, IconChevron, IconTrash, IconRecent, IconClose, IconDrive, IconHome,
  IconNote, IconHighlight, IconCopy,
} from './Icons.jsx';
import { flattenToc } from '../lib/book.js';
import { folderLabel } from '../lib/folders.js';
import { galleryKey, sortGallery } from '../lib/gallery.js';
import { formatBytes, listDrives } from '../lib/platform.js';
import { PANEL_WIDTH_MAX } from '../lib/settings.js';
import { Cover } from './Gallery.jsx';
import { usePanelMinWidth, usePanelBodyMin, clampToPanelMin } from './panelWidth.js';

// The left panel: the tools you read *with* — the contents list, the folder of
// books, the files opened lately, the gallery of those books, the bookmarks,
// notes and highlights you made, and the search results.
// One tab at a time, and the whole panel can be dragged wider or closed from
// the toolbar. Those tools are not also buttons on the toolbar.
// The folder and the recent files are different tools: one is a place on disk,
// the other is the books that have been opened.

// The order of the rail, top to bottom. The folder comes first — it is where
// a reading session starts, with nothing open yet — and the book's own
// structure under it, because there is nothing to show there until a book has
// been picked from the folder above.
const TABS = [
  { id: 'library', icon: IconFolder, label: 'panel.library' },
  { id: 'contents', icon: IconContents, label: 'panel.contents' },
  { id: 'history', icon: IconRecent, label: 'panel.history' },
  { id: 'bookmarks', icon: IconBookmark, label: 'panel.bookmarks' },
  { id: 'notes', icon: IconNote, label: 'panel.notes' },
  { id: 'highlights', icon: IconHighlight, label: 'panel.highlights' },
  { id: 'search', icon: IconSearch, label: 'panel.search' },
];

const TAB_LABEL = Object.fromEntries(TABS.map((tab) => [tab.id, tab.label]));

/**
 * Every row of buttons the tools put along the top of the panel.
 *
 * The panel is made wide enough for the widest of them, whichever tool is
 * open — so choosing a tool never changes the width. Measuring only the tool
 * on screen is what made the panel grow when the folder browser was opened
 * (three buttons) and stay grown afterwards, so the divider moved by itself.
 *
 * Kept beside the markup it mirrors: a button added to a row belongs here too,
 * and the test 'measures every row of buttons the tools show' says so.
 */
export const ACTION_ROWS = [
  ['panel.pickFolder', 'panel.home'],
  ['recent.clear'],
  ['cmd.addBookmark', 'panel.removeAll'],
  ['cmd.addNote', 'panel.removeAll'],
  ['panel.showHighlights', 'cmd.highlight', 'panel.removeAll'],
];

// How little of the panel the contents beside the rail may be squeezed into.
// The rail itself is measured; this is what has to be left over for the tool it
// selects, so dragging the divider in can never close the contents to a sliver.
const BODY_MIN = 150;

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

function MarkList({ marks, empty, icon: Icon, labelOf, onGo, onCopy, onRemove, kind }) {
  const { t } = useTranslation();
  if (!marks?.length) return <p className="panel-note">{empty}</p>;
  return (
    <ul className="mark-list">
      {marks.map((mark) => {
        const label = labelOf(mark);
        return (
          <li key={mark.id}>
            <button type="button" className="mark-row" onClick={() => onGo(mark)} title={label}>
              <Icon size={14} />
              <span className="mark-label">{label}</span>
              <span className="mark-where">{(mark.section ?? 0) + 1}</span>
            </button>
            <button type="button" className="icon-btn" onClick={() => onCopy(mark)} title={t('cmd.copySelection')} aria-label={t('cmd.copySelection')}>
              <IconCopy size={14} />
            </button>
            <button type="button" className="icon-btn" onClick={() => onRemove(mark.id, kind)} title={t('panel.remove')} aria-label={t('panel.remove')}>
              <IconTrash size={14} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function LeftPanel({
  panel, width, onPanel, onResize,
  book, section, toc, onGoTo,
  bookmarks, onAddBookmark, onGoToBookmark, onRemoveBookmark, onClearBookmarks,
  notes, highlights, showHighlights, hasSelection,
  onAddNote, onHighlight, onShowHighlights, onGoToMark, onRemoveMark, onCopyMark,
  search, onSearch, onGoToHit,
  folderRoot, currentPath, desktop, onPickFolder, onOpenFolder, onOpenFile, loadFolder,
  recentFiles, onOpenRecent, onRemoveRecent, onClearRecent,
  gallery, onOpenGallery, onForgetGallery, onClearGallery,
}) {
  const { t, i18n } = useTranslation();
  const tabsRef = useRef(null);
  const bodyRef = useRef(null);
  const measureRef = useRef(null);
  // The rail stands beside the tool it opens, so the panel needs room for both.
  // What the tool beside the rail needs, measured from its own buttons
  // rather than assumed — see usePanelBodyMin.
  // Measured from the hidden strip, not from the tool on screen, so the
  // width does not change as the reader moves between the tools.
  const bodyMin = usePanelBodyMin(measureRef, [i18n.language], BODY_MIN);
  const minWidth = usePanelMinWidth(tabsRef, [i18n.language, bodyMin], { stacked: true, beside: bodyMin });
  const [query, setQuery] = useState(search?.query || '');
  const [roots, setRoots] = useState([]);
  const [rootBusy, setRootBusy] = useState(false);
  const [drives, setDrives] = useState([]);

  // The shelf entry for a recent book, so the history can show its cover.
  const shelved = useMemo(() => {
    const map = new Map();
    for (const entry of gallery || []) map.set(galleryKey(entry), entry);
    return map;
  }, [gallery]);
  const coverFor = (file) => shelved.get(file?.path || file?.name || '') || null;

  useEffect(() => { setQuery(search?.query || ''); }, [search?.query]);

  // The drives are asked for once, when the shelf is first opened: a machine
  // does not grow a disk while the panel is on screen, and asking on every
  // render would spin a CD drive up each time.
  useEffect(() => {
    if (panel !== 'library' || !desktop || drives.length) return;
    let alive = true;
    listDrives().then((found) => { if (alive) setDrives(found); }).catch(() => {});
    return () => { alive = false; };
  }, [panel, desktop, drives.length]);

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
  // The reader's own folder is offered as a place to start, but it is not one
  // of the machine's drives and is not listed as one.
  const homeDrive = drives.find((drive) => drive.kind === 'home') || null;
  const diskDrives = drives.filter((drive) => drive.kind !== 'home');
  const shown = Math.max(width, minWidth);

  return (
    <aside
      className="side-panel left"
      style={{ width: shown, minWidth }}
      aria-label={t('panel.left')}
    >
      <div className="panel-tabs stacked" role="tablist" aria-label={t('panel.left')} ref={tabsRef}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={panel === tab.id}
            className={`panel-tab${panel === tab.id ? ' active' : ''}`}
            data-panel={tab.id}
            onClick={() => onPanel(tab.id)}
            title={t(tab.label)}
            aria-label={t(tab.label)}
          >
            <tab.icon size={18} />
          </button>
        ))}
      </div>

      {/* Not shown, and not reachable: a copy of every tool's row of buttons,
          so the panel can be as wide as the widest of them without the tool
          that owns it having to be open. */}
      <div className="panel-measure" aria-hidden="true" ref={measureRef}>
        {ACTION_ROWS.map((row) => (
          <div className="panel-actions" key={row.join('|')}>
            {row.map((label) => (
              <span className="btn small" key={label}>
                <IconFolderOpen size={15} />{t(label)}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="panel-body" role="tabpanel" ref={bodyRef} aria-label={t(TAB_LABEL[panel] || 'panel.left')}>
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
                      {/* A PDF's contents point at pages. An ebook's contents
                          point at headings, and the number of a page that
                          changes with the window is not part of that structure. */}
                      {!book.reflowable && row.section != null ? <span className="toc-num">{row.section + 1}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}

        {panel === 'library' ? (
          <>
            {/* Two ways to say where to start: pick any folder, or go straight
                to the reader's own. The reader's folder is not a drive, so it
                sits here rather than among them. */}
            <div className="panel-actions">
              <button type="button" className="btn small" onClick={onPickFolder} disabled={!desktop} title={t('panel.pickFolder')}>
                <IconFolderOpen size={15} />{t('panel.pickFolder')}
              </button>
              {homeDrive ? (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => onOpenFolder?.(homeDrive.path)}
                  title={homeDrive.path}
                >
                  <IconHome size={15} />{t('panel.home')}
                </button>
              ) : null}
            </div>

            {/* The drives of the machine, so the shelf can be browsed from the
                top rather than only from a folder the reader already knows the
                way to. */}
            {diskDrives.length ? (
              <>
                <p className="panel-head">{t('panel.drives')}</p>
                <div className="drive-row">
                  {diskDrives.map((drive) => (
                    <button
                      key={drive.path}
                      type="button"
                      className={`drive-btn${folderRoot === drive.path ? ' active' : ''}`}
                      onClick={() => onOpenFolder?.(drive.path)}
                      title={drive.path}
                    >
                      <IconDrive size={14} />
                      <span className="drive-name">{drive.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
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
          </>
        ) : null}

        {panel === 'history' ? (
          <>
            <div className="panel-actions">
              <button
                type="button"
                className="btn small"
                onClick={onClearRecent}
                disabled={!recentFiles?.length}
                title={t('recent.clear')}
              >
                <IconTrash size={15} />{t('recent.clear')}
              </button>
            </div>
            {!recentFiles?.length ? <p className="panel-note">{t('recent.empty')}</p> : (
              <ul className="recent-list">
                {recentFiles.map((file) => (
                  <li key={file.path || file.name}>
                    {/* The name in full, and the path where it came from on
                        hover: a folder shown beside the name takes half the row
                        from it, and half a name does not say which book it is,
                        whereas the folder is what the reader wants only when
                        two books share a name. */}
                    <button
                      type="button"
                      className="recent-row"
                      onClick={() => onOpenRecent(file)}
                      title={`${file.path || file.name}${file.format ? ` · ${String(file.format).toUpperCase()}` : ''}`}
                    >
                      {/* The cover, where the shelf has one for this book.
                          A list of file names is hard to read past; the
                          picture is how a reader recognises a book. */}
                      {coverFor(file) ? (
                        <span className="gthumb small">
                          <Cover entry={coverFor(file)} />
                        </span>
                      ) : <IconRecent size={14} />}
                      <span className="recent-name">{file.name}</span>
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

        {panel === 'gallery' ? (
          <>
            <div className="panel-actions">
              <button
                type="button"
                className="btn small"
                onClick={onClearGallery}
                disabled={!gallery?.length}
                title={t('recent.clear')}
              >
                <IconTrash size={15} />{t('recent.clear')}
              </button>
            </div>
            {!gallery?.length ? <p className="panel-note">{t('gallery.empty')}</p> : (
              <ul className="shelf-list">
                {sortGallery(gallery, 'recent').map((entry) => (
                  <li key={galleryKey(entry)}>
                    <button
                      type="button"
                      className="shelf-row"
                      onClick={() => onOpenGallery?.(entry)}
                      title={`${entry.title || entry.name}${entry.path ? `\n${entry.path}` : ''}`}
                    >
                      <span className="gthumb small">
                        <Cover entry={entry} />
                      </span>
                      <span className="shelf-name">{entry.title || entry.name}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onForgetGallery?.(galleryKey(entry))}
                      title={t('gallery.forget')}
                      aria-label={`${t('gallery.forget')}: ${entry.title || entry.name}`}
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
                onClick={onAddBookmark}
                disabled={!book}
                title={t('tip.bookmark')}
                aria-label={t('cmd.addBookmark')}
              >
                <IconBookmarkAdd size={15} />{t('cmd.addBookmark')}
              </button>
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

        {panel === 'notes' ? (
          <>
            <div className="panel-actions">
              <button
                type="button"
                className="btn small"
                onClick={onAddNote}
                disabled={!book}
                title={t('tip.note')}
                aria-label={t('cmd.addNote')}
              >
                <IconNote size={15} />{t('cmd.addNote')}
              </button>
            </div>
            <MarkList
              marks={notes}
              empty={t('panel.noNotes')}
              icon={IconNote}
              kind="note"
              labelOf={(mark) => mark.note || mark.text}
              onGo={onGoToMark}
              onCopy={onCopyMark}
              onRemove={onRemoveMark}
            />
          </>
        ) : null}

        {panel === 'highlights' ? (
          <>
            <div className="panel-actions">
              <button
                type="button"
                className="btn small"
                aria-pressed={showHighlights !== false}
                disabled={!book}
                onClick={() => onShowHighlights?.(showHighlights === false)}
                title={t('panel.showHighlights')}
                aria-label={t('panel.showHighlights')}
                data-testid="show-highlights"
              >
                <IconHighlight size={15} />{t('panel.showHighlights')}
              </button>
              <button
                type="button"
                className="btn small"
                onClick={onHighlight}
                disabled={!book || !hasSelection}
                title={t('tip.highlight')}
                aria-label={t('cmd.highlight')}
                data-testid="apply-highlight"
              >
                <IconHighlight size={15} />{t('cmd.highlight')}
              </button>
            </div>
            <MarkList
              marks={highlights}
              empty={t('panel.noHighlights')}
              icon={IconHighlight}
              kind="highlight"
              labelOf={(mark) => mark.text}
              onGo={onGoToMark}
              onCopy={onCopyMark}
              onRemove={onRemoveMark}
            />
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

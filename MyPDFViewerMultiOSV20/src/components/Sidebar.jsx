import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconGrid, IconOutline, IconImage, IconSearch, IconBookmark, IconClip,
  IconComment, IconCopy, IconDownload, IconTrash, IconChevron, IconFolder, IconFolderOpen,
  IconExpandAll, IconCollapseAll, IconExtract, IconHistory, IconUndo, IconRedo,
  IconStar, IconGallery, IconClose, IconHighlight, IconOpen, IconNext, IconSidebar, IconLibrary,
} from './Icons.jsx';
import { GalleryThumb } from './Gallery.jsx';
import { isCurrent } from '../lib/gallery.js';
import { isSameSearchHit } from '../lib/search.js';
import { commentPreview } from '../lib/comments.js';
import { outlineActiveId } from '../lib/nav.js';
import FolderTree from './FolderTree.jsx';
import { isSameDrive } from '../lib/folders.js';
import { historyList } from '../lib/history.js';

function HeadAction({ title, onClick, disabled, children }) {
  return (
    <button
      className="icon-btn side-head-action"
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

const PANELS = [
  { id: 'folders', icon: IconFolder, key: 'side.folders' },
  { id: 'thumbnails', icon: IconGrid, key: 'side.thumbnails' },
  { id: 'outline', icon: IconOutline, key: 'side.outline' },
  { id: 'highlights', icon: IconHighlight, key: 'side.highlights' },
  { id: 'comments', icon: IconComment, key: 'side.comments' },
  { id: 'bookmarks', icon: IconBookmark, key: 'side.bookmarks' },
  { id: 'search', icon: IconSearch, key: 'side.search' },
  { id: 'images', icon: IconImage, key: 'side.images' },
  { id: 'clips', icon: IconClip, key: 'side.clips' },
  { id: 'favorites', icon: IconLibrary, key: 'side.favorites' },
  { id: 'history', icon: IconHistory, key: 'side.history' },
];

// The left panel. One rail of tabs plus the active panel; each tab has a
// tooltip, like every other control in the app.
export default function Sidebar({
  panel, onPanel, width, onResize,
  doc, pageNumber, onGoToPage,
  outline, images, onExtractImages, extracting,
  search, onGoToSearchHit, bookmarks, activeBookmarkId, onGoToBookmark,
  comments = [], commentsBusy = false, activeCommentId, onGoToComment, onAddComment, onAttachFile, onSaveAttachment, onRemoveComment, clips,
  onCopyImage, onSaveImage, onRemoveBookmark, onCopyClip, onSaveClip, onRemoveClip,
  history = null,
  recentFiles = [], favorites = [], currentEntry = null, currentIsFavorite = false,
  onOpenGalleryEntry, onToggleFavorite, onShowGallery, onShowLibrary, onNeedGalleryThumb,
  onForgetRecent, onForgetAllRecent, onClearEditHistory, onClearLibrary,
  highlights = [], highlightsBusy = false, onGoToHighlight, onDeleteHighlights,
  onContextMenuItems, onRevealPath, onCopyText,
  isInGallery, isFavoritePath, onAddPathToGallery, onRemoveFromGallery,
  folderRoot = '', currentFilePath = '', desktop = false, onPickFolder, onSelectDrive, onOpenFolderFile, loadFolder,
  drives = [],
}) {
  const { t } = useTranslation();
  const drag = useRef(null);
  const [outlineControls, setOutlineControls] = useState({
    expandable: false,
    expandAll: () => {},
    collapseAll: () => {},
  });

  const pointX = (e) => {
    const x = Number(e.clientX);
    return Number.isFinite(x) ? x : Number(e.nativeEvent?.clientX) || 0;
  };
  const onSplitDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (drag.current) return;
    e.preventDefault();
    drag.current = { x: pointX(e), w: width };
    document.body.classList.add('resizing-sidebar');
    const move = (ev) => {
      if (!drag.current) return;
      onResize?.(drag.current.w + (pointX(ev) - drag.current.x));
    };
    const up = () => {
      drag.current = null;
      document.body.classList.remove('resizing-sidebar');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('mousemove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('mouseup', up);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };

  // Right-click menus. Every row has its own (with an icon on every item);
  // anywhere else in the panel gets the general one, never the browser's.
  // Add to / remove from the library: both always listed, only the one
  // that applies enabled.
  const libraryPair = (entry, inLibrary, { add = t('gallery.favorite'), remove = t('gallery.unfavorite') } = {}) => [
    { icon: IconStar, label: add, disabled: inLibrary, onClick: () => onToggleFavorite?.(entry, true) },
    { icon: IconLibrary, label: remove, disabled: !inLibrary, onClick: () => onToggleFavorite?.(entry, false) },
  ];
  const currentLibraryItems = () => (currentEntry
    ? libraryPair(currentEntry, !!currentIsFavorite, { add: t('favorites.addCurrent'), remove: t('favorites.removeCurrent') })
    : []);
  const generalItems = () => [
    ...currentLibraryItems(),
    currentEntry ? { separator: true } : null,
    { icon: IconGallery, label: t('favorites.openGallery'), onClick: () => onShowGallery?.() },
    onShowLibrary ? { icon: IconLibrary, label: t('library.open'), onClick: () => onShowLibrary() } : null,
    { icon: IconStar, label: t('side.favorites'), onClick: () => onPanel('favorites') },
    { icon: IconHighlight, label: t('side.highlights'), onClick: () => onPanel('highlights') },
    { icon: IconHistory, label: t('side.history'), onClick: () => onPanel('history') },
    { separator: true },
    { icon: IconSidebar, label: t('ctx.closePanel'), onClick: () => onPanel('none') },
  ];
  const menu = (build) => (e) => {
    if (!onContextMenuItems) return;
    e.preventDefault();
    e.stopPropagation();
    const items = (typeof build === 'function' ? build() : build).filter(Boolean);
    onContextMenuItems(e, items);
  };
  const onPanelMenu = (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    menu(generalItems)(e);
  };
  const fileItems = (f, { forget = false, library = false } = {}) => [
    { icon: IconOpen, label: t('ctx.open'), onClick: () => onOpenGalleryEntry?.(f) },
    ...libraryPair(f, !!f.favorite),
    forget ? { icon: IconClose, label: t('history.removeOne'), onClick: () => onForgetRecent?.(f.path) } : null,
    { separator: true },
    desktop && onRevealPath ? { icon: IconFolderOpen, label: t('ctx.reveal'), onClick: () => onRevealPath(f.path) } : null,
    onCopyText ? { icon: IconCopy, label: t('ctx.copyPath'), onClick: () => onCopyText(f.path) } : null,
    forget ? { separator: true } : null,
    forget ? { icon: IconTrash, label: t('history.clearAll'), onClick: () => onForgetAllRecent?.(), danger: true } : null,
    library ? { separator: true } : null,
    library ? { icon: IconTrash, label: t('library.removeAllMenu'), onClick: () => onClearLibrary?.(favorites), danger: true } : null,
  ];

  // The rail stays put; the panel width is --side-width and the splitter on
  // the right edge is what the user drags.
  return (
    <aside
      onContextMenu={onPanelMenu}
      className={`sidebar${panel === 'none' ? ' collapsed' : ''}`}
      style={{ '--side-width': `${width}px` }}
    >
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
          <div className="side-head">
            {panel === 'folders' && desktop && drives.length ? (
              <span className="side-head-title side-drives">
                {drives.map((d) => (
                  <button
                    key={d.path}
                    type="button"
                    className={`drive-chip${isSameDrive(d.path, folderRoot) ? ' on' : ''}`}
                    title={d.path}
                    aria-label={t('side.drive', { name: d.name })}
                    aria-pressed={isSameDrive(d.path, folderRoot)}
                    onClick={() => onSelectDrive?.(d.path)}
                  >
                    {d.name}
                  </button>
                ))}
              </span>
            ) : (
              <span className="side-head-title">{t(`side.${panel}`)}</span>
            )}
            <span className="side-head-actions">
              {panel === 'folders' ? (
                <HeadAction title={t('side.pickFolder')} onClick={() => onPickFolder?.()} disabled={!desktop}>
                  <IconFolderOpen size={16} />
                </HeadAction>
              ) : null}
              {panel === 'outline' && outlineControls.expandable ? (
                <>
                  <HeadAction title={t('side.expandAll')} onClick={outlineControls.expandAll}>
                    <IconExpandAll size={16} />
                  </HeadAction>
                  <HeadAction title={t('side.collapseAll')} onClick={outlineControls.collapseAll}>
                    <IconCollapseAll size={16} />
                  </HeadAction>
                </>
              ) : null}
              {panel === 'images' ? (
                <HeadAction
                  title={t('side.extract')}
                  onClick={() => onExtractImages(pageNumber)}
                  disabled={!doc || extracting}
                >
                  <IconExtract size={16} />
                </HeadAction>
              ) : null}
              {panel === 'comments' ? (
                <>
                  <HeadAction title={t('side.addComment')} onClick={() => onAddComment?.()} disabled={!doc}>
                    <IconComment size={16} />
                  </HeadAction>
                  <HeadAction title={t('side.addAttachment')} onClick={() => onAttachFile?.()} disabled={!doc}>
                    <IconClip size={16} />
                  </HeadAction>
                </>
              ) : null}
              {panel === 'highlights' ? (
                <HeadAction
                  title={t('highlights.deleteAll')}
                  onClick={() => onDeleteHighlights?.(highlights)}
                  disabled={!highlights.length}
                >
                  <IconTrash size={16} />
                </HeadAction>
              ) : null}
              {panel === 'favorites' ? (
                <>
                  <HeadAction
                    title={currentIsFavorite ? t('favorites.removeCurrent') : t('favorites.addCurrent')}
                    onClick={() => currentEntry && onToggleFavorite?.(currentEntry, !currentIsFavorite)}
                    disabled={!currentEntry}
                  >
                    <IconStar size={16} filled={currentIsFavorite} />
                  </HeadAction>
                  <HeadAction title={t('library.open')} onClick={() => onShowLibrary?.()}>
                    <IconLibrary size={16} />
                  </HeadAction>
                  <HeadAction title={t('favorites.openGallery')} onClick={() => onShowGallery?.()}>
                    <IconGallery size={16} />
                  </HeadAction>
                </>
              ) : null}
              {panel === 'history' ? (
                <>
                  <HeadAction title={t('favorites.openGallery')} onClick={() => onShowGallery?.()}>
                    <IconGallery size={16} />
                  </HeadAction>
                  <HeadAction title={t('toolbar.undo')} onClick={() => history?.undo()} disabled={!history?.canUndo}>
                    <IconUndo size={16} />
                  </HeadAction>
                  <HeadAction title={t('toolbar.redo')} onClick={() => history?.redo()} disabled={!history?.canRedo}>
                    <IconRedo size={16} />
                  </HeadAction>
                </>
              ) : null}
            </span>
          </div>
          <div className="side-body">
            {panel === 'folders' && (
              <FolderTree
                root={folderRoot}
                currentPath={currentFilePath}
                desktop={desktop}
                onOpenFile={onOpenFolderFile}
                loadFolder={loadFolder}
                onNodeMenu={(e, node, { isOpen, toggle }) => menu(() => (node.kind === 'dir'
                  ? [
                    { icon: IconFolderOpen, label: isOpen ? t('side.collapse') : t('side.expand'), onClick: toggle },
                    { separator: true },
                    onRevealPath ? { icon: IconFolder, label: t('ctx.reveal'), onClick: () => onRevealPath(node.path) } : null,
                    onCopyText ? { icon: IconCopy, label: t('ctx.copyPath'), onClick: () => onCopyText(node.path) } : null,
                  ]
                  : [
                    { icon: IconOpen, label: t('ctx.open'), onClick: () => onOpenFolderFile?.(node.path) },
                    isInGallery?.(node.path)
                      ? { icon: IconGallery, label: t('ctx.removeFromGallery'), onClick: () => onRemoveFromGallery?.(node.path) }
                      : { icon: IconGallery, label: t('ctx.addToGallery'), onClick: () => onAddPathToGallery?.(node.path) },
                    ...libraryPair({ path: node.path, name: node.name, size: node.size }, !!isFavoritePath?.(node.path)),
                    { separator: true },
                    onRevealPath ? { icon: IconFolderOpen, label: t('ctx.reveal'), onClick: () => onRevealPath(node.path) } : null,
                    onCopyText ? { icon: IconCopy, label: t('ctx.copyPath'), onClick: () => onCopyText(node.path) } : null,
                  ]))(e)}
              />
            )}

            {panel === 'thumbnails' && (
              <Thumbnails
                doc={doc}
                current={pageNumber}
                onGoToPage={onGoToPage}
                onMenu={(n) => menu(() => [
                  { icon: IconNext, label: t('ctx.goToPage', { n }), onClick: () => onGoToPage(n) },
                  { separator: true },
                  ...generalItems(),
                ])}
              />
            )}

            {panel === 'outline' && (
              outline.length === 0
                ? <p className="empty">{t('side.noOutline')}</p>
                : (
                  <OutlineTree
                    nodes={outline}
                    onGoToPage={onGoToPage}
                    currentPage={pageNumber}
                    onControls={setOutlineControls}
                    onMenu={(node, go) => menu(() => [
                      { icon: IconNext, label: t('ctx.goTo'), onClick: go, disabled: !node.page },
                      onCopyText ? { icon: IconCopy, label: t('ctx.copyText'), onClick: () => onCopyText(node.title || '') } : null,
                      { separator: true },
                      { icon: IconExpandAll, label: t('side.expandAll'), onClick: () => outlineControls.expandAll() },
                      { icon: IconCollapseAll, label: t('side.collapseAll'), onClick: () => outlineControls.collapseAll() },
                    ])}
                  />
                )
            )}

            {panel === 'search' && (
              <SearchPanel
                search={search}
                onGoToPage={onGoToPage}
                onGoToSearchHit={onGoToSearchHit}
                onMenu={(h, go) => menu(() => [
                  { icon: IconNext, label: t('ctx.goTo'), onClick: go },
                  onCopyText ? { icon: IconCopy, label: t('ctx.copyText'), onClick: () => onCopyText(h.snippet || '') } : null,
                ])}
              />
            )}

            {panel === 'images' && (
              <>
                {images.length === 0 ? (
                  <p className="empty">{t('side.noImages')}</p>
                ) : (
                  <ul className="img-list">
                    {images.map((im) => (
                      <li
                        key={im.id}
                        onContextMenu={menu(() => [
                          { icon: IconCopy, label: t('menu.copy'), onClick: () => onCopyImage(im) },
                          { icon: IconDownload, label: t('menu.saveImage'), onClick: () => onSaveImage(im) },
                        ])}
                      >
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
                      <li
                        key={b.id}
                        onContextMenu={menu(() => [
                          { icon: IconNext, label: t('ctx.goTo'), onClick: () => (onGoToBookmark ? onGoToBookmark(b) : onGoToPage(b.page)) },
                          onCopyText ? { icon: IconCopy, label: t('ctx.copyText'), onClick: () => onCopyText(b.label || '') } : null,
                          { separator: true },
                          { icon: IconTrash, label: t('common.delete'), onClick: () => onRemoveBookmark(b.id), danger: true },
                        ])}
                      >
                        <button
                          className={`side-item${activeBookmarkId === b.id ? ' active' : ''}`}
                          onClick={() => (onGoToBookmark ? onGoToBookmark(b) : onGoToPage(b.page))}
                          title={b.label}
                        >
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

            {panel === 'highlights' && (
              highlightsBusy && !highlights.length
                ? <p className="empty">{t('highlights.loading')}</p>
                : !highlights.length
                  ? <p className="empty">{t('highlights.empty')}</p>
                  : (
                    <ul className="hl-list">
                      {highlights.map((h) => (
                        <li
                          key={`${h.source}-${h.id}`}
                          className="fav-row"
                          onContextMenu={menu(() => [
                            { icon: IconNext, label: t('ctx.goTo'), onClick: () => onGoToHighlight?.(h) },
                            onCopyText ? { icon: IconCopy, label: t('ctx.copyText'), onClick: () => onCopyText(h.text || ''), disabled: !h.text } : null,
                            { separator: true },
                            { icon: IconClose, label: t('highlights.deleteOne'), onClick: () => onDeleteHighlights?.([h]) },
                            { icon: IconTrash, label: t('highlights.deleteAll'), onClick: () => onDeleteHighlights?.(highlights), danger: true },
                          ])}
                        >
                          <button
                            type="button"
                            className={`side-item hl-item${activeCommentId === h.id ? ' active' : ''}`}
                            title={h.text}
                            onClick={() => onGoToHighlight?.(h)}
                          >
                            <span className="hl-swatch" style={{ background: h.color || 'rgba(255, 214, 0, 0.6)' }} />
                            <span className="fav-text">
                              <span className="ol-title">{h.text || t('highlights.noText')}</span>
                              <span className="fav-dir">
                                {t('highlights.page', { n: h.page })}
                                {' · '}
                                {h.source === 'pdf' ? t('highlights.saved') : t('highlights.unsaved')}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="icon-btn row-del"
                            title={t('highlights.deleteOne')}
                            aria-label={t('highlights.deleteOne')}
                            onClick={() => onDeleteHighlights?.([h])}
                          >
                            <IconClose size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
            )}

            {panel === 'comments' && (
              <>
                {commentsBusy && comments.length === 0 ? (
                  <p className="empty">{t('side.commentsLoading')}</p>
                ) : comments.length === 0 ? (
                  <p className="empty">{t('side.noComments')}</p>
                ) : (
                  <ul className="comment-list">
                    {comments.map((c) => {
                      const preview = commentPreview(c) || t('side.commentFallback');
                      const key = `${c.source || 'item'}-${c.page}-${c.id}`;
                      return (
                        <li
                          key={key}
                          onContextMenu={menu(() => [
                            { icon: IconNext, label: t('ctx.goTo'), onClick: () => (onGoToComment ? onGoToComment(c) : onGoToPage(c.page)) },
                            onCopyText ? { icon: IconCopy, label: t('ctx.copyText'), onClick: () => onCopyText(c.text || ''), disabled: !c.text } : null,
                            c.kind === 'fileattachment' && (c.fileData || c.data)
                              ? { icon: IconDownload, label: t('menu.saveAttachment'), onClick: () => onSaveAttachment?.(c) }
                              : null,
                            c.removable !== false && c.source !== 'pdf' ? { separator: true } : null,
                            c.removable !== false && c.source !== 'pdf'
                              ? { icon: IconTrash, label: t('common.delete'), onClick: () => onRemoveComment?.(c.id), danger: true }
                              : null,
                          ])}
                        >
                          <button
                            className={`side-item${activeCommentId === c.id ? ' active' : ''}`}
                            onClick={() => (onGoToComment ? onGoToComment(c) : onGoToPage(c.page))}
                            title={preview}
                          >
                            <span className="comment-row">
                              {c.kind === 'fileattachment' ? <IconClip size={14} /> : <IconComment size={14} />}
                              <span className="ol-title">{preview}</span>
                              <span className="ol-page">{c.page}</span>
                            </span>
                          </button>
                          {c.kind === 'fileattachment' && (c.fileData || c.data) ? (
                            <button className="icon-btn" onClick={() => onSaveAttachment?.(c)} title={t('menu.saveAttachment')}>
                              <IconDownload size={14} />
                            </button>
                          ) : null}
                          {c.removable !== false && c.source !== 'pdf' ? (
                            <button className="icon-btn" onClick={() => onRemoveComment?.(c.id)} title={t('common.delete')}>
                              <IconTrash size={14} />
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {panel === 'clips' && (
              clips.length === 0
                ? <p className="empty">{t('side.noClips')}</p>
                : (
                  <ul className="clip-list">
                    {clips.map((c) => (
                      <li
                        key={c.id}
                        onContextMenu={menu(() => [
                          { icon: IconCopy, label: t('menu.copy'), onClick: () => onCopyClip(c) },
                          { icon: IconDownload, label: t('common.save'), onClick: () => onSaveClip(c) },
                          { separator: true },
                          { icon: IconTrash, label: t('common.delete'), onClick: () => onRemoveClip(c.id), danger: true },
                        ])}
                      >
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

            {panel === 'favorites' && (
              <div className="side-section-row">
                <h5 className="side-section">{t('library.count', { n: favorites.length })}</h5>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onClearLibrary?.(favorites)}
                  disabled={!favorites.length}
                  title={t('library.removeAllTip')}
                >
                  {t('library.removeAll')}
                </button>
              </div>
            )}
            {panel === 'favorites' && (
              !favorites.length
                ? <p className="empty">{t('favorites.empty')}</p>
                : (
                  <ul className="fav-list">
                    {favorites.map((f) => (
                      <li key={f.path} className="fav-row" onContextMenu={menu(() => fileItems(f, { library: true }))}>
                        <button
                          type="button"
                          className={`side-item fav-item${isCurrent(f, currentEntry?.path) ? ' active' : ''}`}
                          title={f.path}
                          onClick={() => onOpenGalleryEntry?.(f)}
                        >
                          <GalleryThumb entry={f} onNeedThumb={onNeedGalleryThumb} className="gal-thumb mini" />
                          <span className="fav-text">
                            <span className="ol-title">{f.name}</span>
                            <span className="fav-dir">{f.dir}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="icon-btn row-del"
                          title={t('library.removeOne')}
                          aria-label={t('library.removeOne')}
                          onClick={() => onToggleFavorite?.(f, false)}
                        >
                          <IconClose size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )
            )}

            {panel === 'history' && (
              <>
                <div className="side-section-row">
                  <h5 className="side-section">{t('side.recentOpened')}</h5>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onForgetAllRecent?.()}
                    disabled={!recentFiles.length}
                    title={t('history.clearRecentTip')}
                  >
                    {t('history.clearAll')}
                  </button>
                </div>
                {!recentFiles.length
                  ? <p className="empty">{t('recent.empty')}</p>
                  : (
                    <ul className="recent-list">
                      {recentFiles.map((f) => (
                        <li key={f.path} className="fav-row" onContextMenu={menu(() => fileItems(f, { forget: true }))}>
                          <button
                            type="button"
                            className={`side-item${isCurrent(f, currentEntry?.path) ? ' active' : ''}`}
                            title={f.path}
                            onClick={() => onOpenGalleryEntry?.(f)}
                          >
                            <GalleryThumb entry={f} onNeedThumb={onNeedGalleryThumb} className="gal-thumb mini" />
                            <span className="ol-title">{f.name}</span>
                          </button>
                          <button
                            type="button"
                            className={`icon-btn row-fav${f.favorite ? ' on' : ''}`}
                            title={f.favorite ? t('gallery.unfavorite') : t('gallery.favorite')}
                            aria-label={f.favorite ? t('gallery.unfavorite') : t('gallery.favorite')}
                            aria-pressed={!!f.favorite}
                            onClick={() => onToggleFavorite?.(f, !f.favorite)}
                          >
                            <IconStar size={13} filled={!!f.favorite} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn row-del"
                            title={t('history.removeOne')}
                            aria-label={t('history.removeOne')}
                            onClick={() => onForgetRecent?.(f.path)}
                          >
                            <IconClose size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                <div className="side-section-row">
                  <h5 className="side-section">{t('side.editHistory')}</h5>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onClearEditHistory?.()}
                    disabled={!history?.pastEntries?.length}
                    title={t('history.clearEditTip')}
                  >
                    {t('history.clearAll')}
                  </button>
                </div>
              </>
            )}
            {panel === 'history' && (
              !(history?.pastEntries?.length)
                ? <p className="empty">{t('side.noHistory')}</p>
                : (
                  <ul className="hist-list">
                    <li>
                      <button className="side-item active" type="button" title={t('side.historyNow')}>
                        <IconHistory size={14} />
                        <span className="ol-title">{t('side.historyNow')}</span>
                      </button>
                    </li>
                    {historyList(history.pastEntries).map((item) => (
                      <li
                        key={`past-${item.index}`}
                        onContextMenu={menu(() => [
                          { icon: IconUndo, label: t('ctx.undoTo'), onClick: () => history.jumpToPast?.(item.index) },
                          currentEntry ? { separator: true } : null,
                          ...currentLibraryItems(),
                          { separator: true },
                          { icon: IconTrash, label: t('history.clearAll'), onClick: () => onClearEditHistory?.(), danger: true },
                        ])}
                      >
                        <button
                          className="side-item"
                          type="button"
                          title={item.label}
                          onClick={() => history.jumpToPast?.(item.index)}
                        >
                          <IconUndo size={14} />
                          <span className="ol-title">{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
            )}
          </div>
        </div>
      ) : null}

      {panel !== 'none' ? (
        <div
          className="side-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('side.resize')}
          title={t('side.resize')}
          onPointerDown={onSplitDown}
          onMouseDown={onSplitDown}
        />
      ) : null}
    </aside>
  );
}

// ── Outline tree ──────────────────────────────────────────
// A real tree: branches fold away, and parents are joined to their children by
// connector lines (drawn in CSS from the list items themselves).
function OutlineTree({ nodes, onGoToPage, currentPage, onControls, onMenu }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(() => outlineActiveId(nodes, currentPage));
  const fromClick = useRef(false);

  useEffect(() => {
    if (fromClick.current) {
      fromClick.current = false;
      return;
    }
    setSelectedId(outlineActiveId(nodes, currentPage));
  }, [nodes, currentPage]);

  const allParents = useMemo(() => {
    const ids = [];
    const walk = (list) => list.forEach((n) => { if (n.items.length) { ids.push(n.id); walk(n.items); } });
    walk(nodes);
    return ids;
  }, [nodes]);

  useEffect(() => {
    onControls?.({
      expandable: allParents.length > 0,
      expandAll: () => setCollapsed(new Set()),
      collapseAll: () => setCollapsed(new Set(allParents)),
    });
  }, [allParents, onControls]);

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
          <li
            key={node.id}
            className={hasKids ? 'branch' : 'leaf'}
            onContextMenu={onMenu ? onMenu(node, () => node.page && onGoToPage(node.page, node.loc)) : undefined}
          >
            <div className={`tree-row${node.id === selectedId ? ' current' : ''}`}>
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
                onClick={() => {
                  if (!node.page) {
                    if (hasKids) toggle(node.id);
                    return;
                  }
                  fromClick.current = true;
                  setSelectedId(node.id);
                  onGoToPage(node.page, node.loc);
                }}
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
      {renderLevel(nodes)}
    </div>
  );
}

// ── Thumbnails ────────────────────────────────────────────
function Thumbnails({ doc, current, onGoToPage, onMenu }) {
  if (!doc) return null;
  return (
    <ul className="thumb-list">
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
        <Thumb key={n} doc={doc} num={n} active={n === current} onClick={() => onGoToPage(n)} onContextMenu={onMenu?.(n)} />
      ))}
    </ul>
  );
}

function Thumb({ doc, num, active, onClick, onContextMenu }) {
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
    <li ref={ref} className={active ? 'active' : ''} onContextMenu={onContextMenu}>
      <button onClick={onClick} title={`${num}`}>
        <canvas ref={canvasRef} />
        <span>{num}</span>
      </button>
    </li>
  );
}

// ── Search ────────────────────────────────────────────────
function SearchPanel({ search, onGoToPage, onGoToSearchHit, onMenu }) {
  const { t } = useTranslation();
  const [term, setTerm] = useState(search.query || '');
  const go = onGoToSearchHit || ((h) => onGoToPage(h.page));

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
              <li key={i} onContextMenu={onMenu ? onMenu(h, () => go(h)) : undefined}>
                <button
                  className={`side-item${isSameSearchHit(search.active, h) ? ' active' : ''}`}
                  onClick={() => go(h)}
                  title={h.snippet}
                >
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

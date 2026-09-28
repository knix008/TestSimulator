import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import TitleBar from './components/TitleBar.jsx';
import TabBar from './components/TabBar.jsx';
import Toolbar from './components/Toolbar.jsx';
import LeftPanel from './components/LeftPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import BookView from './components/BookView.jsx';
import StatusBar from './components/StatusBar.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import DialogModal from './components/DialogModal.jsx';
import Tooltip from './components/Tooltip.jsx';
import Toasts from './components/Toasts.jsx';
import Gallery from './components/Gallery.jsx';
import MenuBar, { BAR_MENUS, MENU_KEYS } from './components/MenuBar.jsx';
import { IconPrev, IconNext } from './components/Icons.jsx';

/** letter → menu, for Alt+F and its neighbours. */
const MENU_KEYS_BY_LETTER = Object.fromEntries(
  BAR_MENUS.map((id) => [MENU_KEYS[id], id]),
);

import {
  api, isElectron, openFileDialog, pickBookPaths, pickImage, readPath, readTextPath,
  downloadUrl, copyText, copyImage, readClipboardText, saveText, writeTextTo, pickDirectory,
  listDirectory, baseName, dirName, pathExists, openExternal, appInfo, printHtml,
  win as platformWin,
} from './lib/platform.js';
import { openBook, isLibraryName, LIBRARY_EXT } from './lib/book.js';
import {
  loadSettings, persistSettings, DEFAULT_SETTINGS, addRecentFile, removeRecentFile,
  updateRecentFile, addRecentDir, applyFontSettings, applyTheme, clampPanelWidth,
  viewSettingsOf,
} from './lib/settings.js';
import { useHistory, newId } from './lib/history.js';
import {
  galleryEntry, addToGallery, updateGallery, removeFromGallery, galleryKey, makeThumbnail,
} from './lib/gallery.js';
import { galleryStore } from './lib/gallerystore.js';
import {
  EMPTY_READING, serializeLibrary, parseLibrary, libraryNameFor, addBookmark,
  addHighlight, addNote, addClip, removeById, marksForSection, readingIsEmpty,
  bookmarkLabel,
} from './lib/library.js';
import { searchBook, stepHit } from './lib/search.js';
import { menuRows, themeRows, parseChoice, activeCommands } from './lib/menus.js';
import { THEMES, nextTheme } from './lib/themes.js';
import {
  APP_NAME, failMessage, windowTitle, nextFontScale, nextZoom, clampSection,
  bookProgress, pickText, nextPanel,
} from './lib/view.js';
import {
  buildPrintHtml, buildImagePrintHtml, renderPdfPagesToImages, inlineImages,
} from './lib/print.js';
import { htmlToText } from './lib/html.js';
import { documentKey, tabLabel, findTabByFile, neighborTabId, nextTabId, anyTabDirty } from './lib/tabs.js';
import i18n, { setLanguage } from './i18n.js';
import buildInfo from './build-info.json';

const SHOW_PROGRESS_AFTER = 180;

export default function App() {
  const { t } = useTranslation();

  // ── Persistent settings ────────────────────────────────
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // ── The open book ──────────────────────────────────────
  const [book, setBook] = useState(null);
  const [section, setSection] = useState(0);
  const [content, setContent] = useState(null);
  const [progress, setProgress] = useState(0);
  const [columns, setColumns] = useState({ pages: 1, page: 0 });
  const [scale, setScale] = useState(1);
  // The gallery of books already read, shown over the reading pane so the book
  // underneath keeps its place. The shelf itself is kept out of the settings —
  // see lib/gallerystore.js — because thumbnails and a hundred thousand books
  // have no business in a file that is read at startup and written on every
  // change.
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [openMenuName, setOpenMenuName] = useState(null);
  const [shelf, setShelf] = useState([]);
  const shelfRef = useRef([]);
  shelfRef.current = shelf;

  // Writes the shelf both to the screen and to its store, which decides for
  // itself how much of it to write and when.
  const editShelf = useCallback((updater, changed) => {
    setShelf((current) => {
      const next = updater(current);
      galleryStore().write(next, changed);
      return next;
    });
  }, []);

  // ── Reading state (undo / redo) ────────────────────────
  const history = useHistory(EMPTY_READING);
  const reading = history.state;
  const [libraryPath, setLibraryPath] = useState(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // ── Tabs ───────────────────────────────────────────────
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const tabsRef = useRef([]);
  const activeTabIdRef = useRef(null);
  const sessionsRef = useRef(new Map());
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;

  // ── Interaction ────────────────────────────────────────
  const [selectionText, setSelectionText] = useState('');
  const selectionRef = useRef('');
  const [search, setSearch] = useState({ query: '', results: [], busy: false, activeIndex: -1 });
  const [activeHit, setActiveHit] = useState(null);
  const [menu, setMenu] = useState({ open: false, x: 0, y: 0, rows: [], name: '' });
  const [webDialog, setWebDialog] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [toasts, setToasts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  const viewRef = useRef(null);
  const searchAbort = useRef(null);
  const bookRef = useRef(null);
  const sectionRef = useRef(0);
  const dialogResolvers = useRef(new Map());
  const passwordRetry = useRef(null);
  const noteDraft = useRef(null);
  const printSetup = useRef({ paper: 'A4', landscape: false, marginMm: 14, showTitles: true });
  const leaveOrCancelRef = useRef(async () => true);
  const saveLibraryRef = useRef(async () => false);
  bookRef.current = book;
  sectionRef.current = section;

  // ── Small helpers ──────────────────────────────────────
  const toast = useCallback((text, kind = 'info') => {
    const id = newId();
    setToasts((list) => [...list, { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 2600);
  }, []);

  // ── Dialogs: a child window in Electron, a modal on the web ──
  const dialogPayload = useCallback((extra = {}) => ({
    language: settingsRef.current.lang,
    theme: settingsRef.current.theme,
    settings: settingsRef.current,
    ...extra,
  }), []);

  const openDialog = useCallback((name, extra = {}) => {
    const payload = dialogPayload(extra);
    if (isElectron) api.dialog.open(name, payload).catch(() => {});
    else setWebDialog({ name, payload });
  }, [dialogPayload]);

  const closeDialog = useCallback((name) => {
    if (isElectron) api.dialog.close(name).catch(() => {});
    else setWebDialog((current) => (current && (!name || current.name === name) ? null : current));
  }, []);

  /** Opens a dialog and resolves with the answer the user gives it. */
  const askDialog = useCallback((name, extra = {}) => new Promise((resolve) => {
    const previous = dialogResolvers.current.get(name);
    if (previous) previous(null);
    dialogResolvers.current.set(name, resolve);
    openDialog(name, extra);
  }), [openDialog]);

  const settleDialog = useCallback((name, value) => {
    const resolve = dialogResolvers.current.get(name);
    if (!resolve) return false;
    dialogResolvers.current.delete(name);
    resolve(value);
    return true;
  }, []);

  // Every failure the user can see goes through here, so the dialog always has
  // the operation, the message and the full technical detail — all copyable.
  const fail = useCallback((err, context, extra = {}) => {
    const raw = err?.message || String(err) || 'Unknown error';
    const message = failMessage(err);
    const details = [
      err?.name ? `${err.name}: ${raw}` : raw,
      err?.stack || '',
      extra.details || '',
    ].filter(Boolean).join('\n\n');
    setStatusMessage(message);
    openDialog('error', { error: { context, message, details, at: Date.now(), file: extra.file } });
  }, [openDialog]);

  /**
   * Wraps a slow operation in the progress dialog. The dialog only appears if
   * the work is still running after a moment — opening a small book should feel
   * instant rather than flashing a window on and off.
   */
  const withProgress = useCallback(async (kind, name, fn) => {
    const state = { kind, name, done: 0, total: 0, indeterminate: true };
    let shown = false;
    let live = true;
    let lastTick = 0;
    setBusy(true);
    const timer = setTimeout(() => {
      if (!live) return;
      shown = true;
      openDialog('progress', { progress: { ...state } });
    }, SHOW_PROGRESS_AFTER);
    try {
      return await fn((p) => {
        Object.assign(state, p, { indeterminate: !(p.total > 0) });
        if (!shown) return;
        const now = Date.now();
        if (now - lastTick < 90) return;
        lastTick = now;
        openDialog('progress', { progress: { ...state } });
      });
    } finally {
      live = false;
      clearTimeout(timer);
      setBusy(false);
      if (shown) closeDialog('progress');
    }
  }, [openDialog, closeDialog]);

  // ── Boot ───────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadSettings();
      if (!alive) return;
      setSettings(loaded);
      setSettingsReady(true);
      if (loaded.lang && loaded.lang !== i18n.language) await setLanguage(loaded.lang);
    })();
    return () => { alive = false; };
  }, []);

  // Apply theme + fonts whenever they change, and persist everything.
  useEffect(() => {
    applyTheme(settings.theme);
    applyFontSettings(settings);
    // A page-turn effect is something the reader asked for, so it runs even
    // where the system has asked for less animation; "none" leaves the decision
    // to the system, where it belongs.
    document.documentElement.dataset.motion = settings.pageTurn === 'none' ? 'system' : 'full';
    if (settingsReady) persistSettings(settings);
  }, [settings, settingsReady]);

  // ── Sessions (one per tab) ─────────────────────────────
  const captureSession = useCallback(() => ({
    book,
    section,
    content,
    progress,
    libraryPath,
    dirty,
    search,
    selectionText,
    history: history.exportSnapshot(),
    view: viewSettingsOf(settingsRef.current),
  }), [book, section, content, progress, libraryPath, dirty, search, selectionText, history]);

  const captureRef = useRef(captureSession);
  captureRef.current = captureSession;

  const applySession = useCallback((snapshot) => {
    if (!snapshot) return;
    setBook(snapshot.book || null);
    setSection(snapshot.section || 0);
    setContent(snapshot.content || null);
    setProgress(snapshot.progress || 0);
    setLibraryPath(snapshot.libraryPath || null);
    setDirty(!!snapshot.dirty);
    setSearch(snapshot.search || { query: '', results: [], busy: false, activeIndex: -1 });
    setSelectionText(snapshot.selectionText || '');
    history.restoreSnapshot(snapshot.history);
    if (snapshot.view) setSettings((s) => ({ ...s, ...snapshot.view }));
  }, [history]);

  const applySessionRef = useRef(applySession);
  applySessionRef.current = applySession;

  const parkCurrentTab = useCallback(() => {
    const id = activeTabIdRef.current;
    if (!id) return;
    const snapshot = captureRef.current();
    if (!snapshot.book) return;
    sessionsRef.current.set(id, snapshot);
    setTabs((list) => list.map((tab) => (
      tab.id === id
        ? {
          ...tab,
          dirty: !!snapshot.dirty,
          name: snapshot.book.fileName || tab.name,
          path: snapshot.book.filePath || '',
        }
        : tab
    )));
  }, []);

  const switchToTab = useCallback((id) => {
    if (!id || id === activeTabIdRef.current) return;
    parkCurrentTab();
    const snapshot = sessionsRef.current.get(id);
    if (!snapshot) return;
    applySessionRef.current(snapshot);
    setActiveTabId(id);
  }, [parkCurrentTab]);

  const clearLiveBook = useCallback(() => {
    setBook(null);
    setContent(null);
    setSection(0);
    setProgress(0);
    setLibraryPath(null);
    setDirty(false);
    setSearch({ query: '', results: [], busy: false, activeIndex: -1 });
    setSelectionText('');
    history.reset(EMPTY_READING);
  }, [history]);

  // The shelf is read once, after the window is up: it is never in the way of
  // the first book appearing.
  useEffect(() => {
    let cancelled = false;
    const store = galleryStore();
    store.load().then(async (rows) => {
      if (cancelled) return;
      // Shelves written by the first version of this feature lived in the
      // settings file, covers and all. Move them across once.
      const old = settingsRef.current.gallery;
      let shelved = rows;
      if (!shelved.length && old?.length) {
        const moved = [];
        for (const entry of old) {
          const cover = entry.cover;
          const key = galleryKey(entry);
          // eslint-disable-next-line no-await-in-loop
          if (cover?.startsWith('data:')) await store.putCover(key, cover).catch(() => {});
          moved.push({ ...entry, cover: cover ? true : '' });
        }
        shelved = moved;
        store.write(shelved);
        setSettings((s) => ({ ...s, gallery: [] }));
      }
      setShelf(shelved);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Opening ────────────────────────────────────────────
  const rememberOpened = useCallback((opened) => {
    const dir = opened.filePath ? dirName(opened.filePath) : '';
    // The gallery keeps every book that was read; the recent list keeps the
    // last ten, for the File menu.
    const entry = galleryEntry(opened, { dir });
    editShelf((rows) => addToGallery(rows, entry), { put: entry });
    setSettings((s) => ({
      ...s,
      recentFiles: addRecentFile(s.recentFiles, {
        path: opened.filePath || null,
        name: opened.fileName,
        dir: opened.filePath ? dirName(opened.filePath) : '',
        size: opened.fileSize,
        format: opened.format,
        section: 0,
      }),
      recentDirs: opened.filePath ? addRecentDir(s.recentDirs, dirName(opened.filePath)) : s.recentDirs,
      lastDir: opened.filePath ? dirName(opened.filePath) : s.lastDir,
    }));
  }, [editShelf]);

  const openPayload = useCallback(async (payload, { restore } = {}) => {
    const { data, name, path: filePath, size } = payload;
    try {
      const opened = await withProgress('parsing', name, (onProgress) => openBook({
        data,
        name,
        path: filePath || '',
        size,
        onProgress,
        onPassword: (retry, reason) => {
          passwordRetry.current = retry;
          openDialog('prompt', {
            prompt: { kind: 'password', error: reason === 2 ? t('error.passwordWrong') : '' },
          });
        },
      }));

      const existing = findTabByFile(tabsRef.current, { path: opened.filePath, name: opened.fileName, size: opened.fileSize });
      if (existing) {
        switchToTab(existing.id);
        setStatusMessage(t('status.loaded', { name }));
        return opened;
      }

      if (activeTabIdRef.current && bookRef.current) parkCurrentTab();

      // Where to start: what the reading file says, else where this book was
      // left last time, else the beginning.
      const remembered = settingsRef.current.rememberPosition
        ? settingsRef.current.recentFiles.find((f) => (f.path || f.name) === (opened.filePath || opened.fileName))
        : null;
      const startSection = clampSection(
        restore?.reading?.lastPosition?.section ?? remembered?.section ?? 0,
        opened.sectionCount,
      );

      setBook(opened);
      setSection(startSection);
      setContent(null);
      setProgress(0);
      setSearch({ query: '', results: [], busy: false, activeIndex: -1 });
      setSelectionText('');
      history.reset(restore?.reading || EMPTY_READING);
      setLibraryPath(restore?.libraryPath || null);
      setDirty(false);
      if (restore?.view) setSettings((s) => ({ ...s, ...restore.view }));

      const tabId = newId();
      const meta = {
        id: tabId,
        key: documentKey({ path: opened.filePath, name: opened.fileName, size: opened.fileSize }),
        name: tabLabel({ name: opened.fileName }) || opened.fileName,
        path: opened.filePath || '',
        dirty: false,
      };
      tabsRef.current = [...tabsRef.current, meta];
      setTabs(tabsRef.current);
      setActiveTabId(tabId);
      activeTabIdRef.current = tabId;

      rememberOpened(opened);
      setStatusMessage(t('status.loaded', { name }));
      toast(t('status.loaded', { name }), 'ok');
      return opened;
    } catch (err) {
      fail(err, 'open', { file: filePath || name });
      return null;
    }
  }, [fail, history, openDialog, parkCurrentTab, rememberOpened, switchToTab, t, toast, withProgress]);

  /** Opens an .ebkr reading file: loads the book it names, then the marks. */
  const openLibraryFile = useCallback(async (text, ownPath) => {
    const parsed = parseLibrary(text);
    if (!parsed.bookPath) {
      throw new Error(`This reading file does not record the path of its book, so the book cannot be reopened automatically. Open "${parsed.bookName || 'the book'}" yourself, then load this reading file again.`);
    }
    if (isElectron && !(await pathExists(parsed.bookPath))) {
      throw new Error(`The book this reading file refers to no longer exists:\n${parsed.bookPath}`);
    }
    const payload = await withProgress('opening', baseName(parsed.bookPath), (onProgress) =>
      readPath(parsed.bookPath, { onProgress }));
    await openPayload(payload, {
      restore: { reading: parsed.reading, view: parsed.view, libraryPath: ownPath || null },
    });
  }, [openPayload, withProgress]);

  const openByPath = useCallback(async (filePath) => {
    if (!filePath) return;
    try {
      if (isLibraryName(filePath)) {
        await openLibraryFile(await readTextPath(filePath), filePath);
        return;
      }
      const payload = await withProgress('opening', baseName(filePath), (onProgress) =>
        readPath(filePath, { onProgress }));
      await openPayload(payload);
    } catch (err) {
      fail(err, 'read', { file: filePath });
    }
  }, [fail, openLibraryFile, openPayload, withProgress]);

  const openByPathRef = useRef(openByPath);
  openByPathRef.current = openByPath;

  const openViaDialog = useCallback(async () => {
    try {
      if (!isElectron) {
        const picked = await openFileDialog({ multi: true });
        const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
        for (const item of list) {
          if (isLibraryName(item.name)) {
            await openLibraryFile(new TextDecoder().decode(item.data), null);
          } else {
            await openPayload(item);
          }
        }
        return;
      }
      const paths = await pickBookPaths({ defaultDir: settingsRef.current.lastDir, multi: true });
      if (!paths) return;
      for (const filePath of paths) await openByPathRef.current(filePath);
    } catch (err) {
      fail(err, 'open');
    }
  }, [fail, openLibraryFile, openPayload]);

  const openFromUrl = useCallback(async (url) => {
    try {
      const payload = await withProgress('downloading', url, (onProgress) => downloadUrl(url, { onProgress }));
      await openPayload({ ...payload, path: null });
    } catch (err) {
      fail(err, 'download', { file: url });
    }
  }, [fail, openPayload, withProgress]);

  // Files handed over by the OS (file association / "Open with") and by a
  // second launch of the app.
  useEffect(() => {
    if (!isElectron || !settingsReady) return undefined;
    api.takePendingOpen().then((p) => { if (p) openByPathRef.current(p); }).catch(() => {});
    return api.onOpenPath((p) => openByPathRef.current(p));
  }, [settingsReady]);

  // ── The section on screen ──────────────────────────────
  useEffect(() => {
    if (!book) { setContent(null); return; }
    try {
      setContent(book.loadSection(clampSection(section, book.sectionCount)));
    } catch (err) {
      setContent(null);
      fail(err, 'render');
    }
  }, [book, section, fail]);

  const goToSection = useCallback((index, anchor) => {
    const current = bookRef.current;
    if (!current) return;
    const next = clampSection(index, current.sectionCount);
    setSection(next);
    setProgress(0);
    if (anchor) setTimeout(() => viewRef.current?.scrollToAnchor(anchor), 80);
  }, []);

  const turnPage = useCallback((dir) => {
    const current = bookRef.current;
    if (!current) return;
    if (viewRef.current?.turnPage(dir)) return;
    // A two-page spread turns two pages at a time, like a real book.
    const step = (!current.reflowable && settingsRef.current.spread === 'double') ? 2 : 1;
    const next = sectionRef.current + (dir < 0 ? -step : step);
    if (next < 0 || next >= current.sectionCount) return;
    goToSection(next);
  }, [goToSection]);

  /** One chapter — or two pages, in a spread. */
  const turnSection = useCallback((dir) => {
    const current = bookRef.current;
    const step = (current && !current.reflowable && settingsRef.current.spread === 'double') ? 2 : 1;
    goToSection(sectionRef.current + dir * step);
  }, [goToSection]);

  // Remember where the reader stopped, per book.
  useEffect(() => {
    if (!book || !settings.rememberPosition) return;
    const key = book.filePath || book.fileName;
    setSettings((s) => ({
      ...s,
      recentFiles: updateRecentFile(s.recentFiles, key, { section }),
      lastSession: { path: book.filePath, section },
    }));
    const shelved = shelfRef.current.find((e) => galleryKey(e) === key);
    if (shelved) {
      const patch = { section, sections: book.sectionCount };
      editShelf(
        (rows) => updateGallery(rows, key, patch),
        { put: { ...shelved, ...patch }, position: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, book]);

  // ── Reading-state edits (undoable) ─────────────────────
  const editReading = useCallback((updater, label) => {
    history.commit(updater, label);
    setDirty(true);
  }, [history]);

  const addBookmarkHere = useCallback(() => {
    if (!book) return;
    const label = bookmarkLabel(
      pickText(selectionRef.current, content?.title),
      `${t('panel.section')} ${section + 1}`,
    );
    editReading((state) => addBookmark(state, {
      section,
      label,
      fracY: viewRef.current?.getFracY?.() ?? 0,
      text: selectionRef.current ? String(selectionRef.current).slice(0, 200) : '',
    }), t('cmd.addBookmark'));
    setSettings((s) => ({ ...s, leftPanel: 'bookmarks' }));
    setStatusMessage(t('status.bookmarkAdded'));
    toast(`${t('status.bookmarkAdded')} — ${label}`, 'ok');
  }, [book, content, editReading, section, t, toast]);

  const highlightSelection = useCallback(() => {
    const text = selectionRef.current;
    if (!text.trim()) { toast(t('error.noSelection'), 'warn'); return; }
    editReading((state) => addHighlight(state, { section, text: text.trim().slice(0, 600) }), t('cmd.highlight'));
    viewRef.current?.clearSelection();
    setSettings((s) => ({ ...s, rightPanel: 'notes' }));
    setStatusMessage(t('status.highlighted'));
    toast(t('status.highlighted'), 'ok');
  }, [editReading, section, t, toast]);

  const askNote = useCallback(async (initial = '') => {
    noteDraft.current = { section, selection: selectionRef.current };
    const answer = await askDialog('note', {
      note: { text: initial, selection: selectionRef.current },
    });
    const draft = noteDraft.current;
    noteDraft.current = null;
    if (!answer || answer.action !== 'submit' || !answer.value) return;
    editReading((state) => addNote(state, {
      section: draft?.section ?? section,
      text: (draft?.selection || '').trim().slice(0, 300),
      note: answer.value,
    }), t('cmd.addNote'));
    setSettings((s) => ({ ...s, rightPanel: 'notes' }));
    setStatusMessage(t('status.noteAdded'));
    toast(t('status.noteAdded'), 'ok');
  }, [askDialog, editReading, section, t, toast]);

  const copySelection = useCallback(async () => {
    const text = pickText(selectionRef.current, window.getSelection?.()?.toString());
    if (!text.trim()) { toast(t('error.noSelection'), 'warn'); return; }
    try {
      await copyText(text);
      editReading((state) => addClip(state, { section, content: text.slice(0, 4000) }), t('cmd.copySelection'));
      setStatusMessage(t('status.copiedChars', { n: text.length }));
      toast(t('status.copiedChars', { n: text.length }), 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [editReading, fail, section, t, toast]);

  const copyCurrentImage = useCallback(async () => {
    const picture = viewRef.current?.pageImage?.();
    if (!picture?.dataUrl) { toast(t('status.noImage'), 'warn'); return; }
    try {
      await copyImage(picture.dataUrl);
      const said = t('status.copiedImage', { w: picture.width, h: picture.height });
      setStatusMessage(said);
      toast(said, 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [fail, t, toast]);

  const copyCurrentSection = useCallback(async () => {
    if (!book) return;
    try {
      const text = content?.html ? htmlToText(content.html) : await book.readSectionText(section);
      if (!text) { toast(t('panel.empty'), 'warn'); return; }
      await copyText(text);
      setStatusMessage(t('status.copiedChars', { n: text.length }));
      toast(t('status.copiedChars', { n: text.length }), 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [book, content, fail, section, t, toast]);

  const pasteAsNote = useCallback(async () => {
    try {
      const text = await readClipboardText();
      if (!text?.trim()) { toast(t('panel.empty'), 'warn'); return; }
      await askNote(text.trim().slice(0, 2000));
    } catch (err) {
      fail(err, 'paste');
    }
  }, [askNote, fail, t, toast]);

  // ── The reading file ───────────────────────────────────
  const libraryJson = useCallback(() => serializeLibrary({
    book,
    reading: {
      ...reading,
      lastPosition: { section, fracY: viewRef.current?.getFracY?.() ?? 0 },
    },
    view: viewSettingsOf(settingsRef.current),
  }), [book, reading, section]);

  const saveLibraryAs = useCallback(async () => {
    if (!book) return false;
    try {
      const defaultName = libraryNameFor(book.fileName);
      const saved = await withProgress('saving', defaultName, (onProgress) => saveText({
        defaultName,
        defaultDir: settingsRef.current.lastDir || (book.filePath ? dirName(book.filePath) : ''),
        content: libraryJson(),
        filters: [{ name: 'MyEBookReader reading file', extensions: [LIBRARY_EXT] }],
        onProgress,
      }));
      if (!saved) return false;
      setLibraryPath(typeof saved === 'string' ? saved : null);
      setDirty(false);
      setStatusMessage(t('status.saved', { name: baseName(saved) }));
      toast(t('status.saved', { name: baseName(saved) }), 'ok');
      return true;
    } catch (err) {
      fail(err, 'library');
      return false;
    }
  }, [book, fail, libraryJson, t, toast, withProgress]);

  const saveLibrary = useCallback(async () => {
    if (!book) return false;
    if (!libraryPath || !isElectron) return saveLibraryAs();
    try {
      await writeTextTo(libraryPath, libraryJson());
      setDirty(false);
      setStatusMessage(t('status.saved', { name: baseName(libraryPath) }));
      toast(t('status.saved', { name: baseName(libraryPath) }), 'ok');
      return true;
    } catch (err) {
      fail(err, 'library', { file: libraryPath });
      return false;
    }
  }, [book, fail, libraryJson, libraryPath, saveLibraryAs, t, toast]);
  saveLibraryRef.current = saveLibrary;

  // Auto-save, when the reader asked for it.
  useEffect(() => {
    if (!settings.autoSaveLibrary || !dirty || !libraryPath || !isElectron) return;
    const timer = setTimeout(() => { saveLibraryRef.current(); }, 700);
    return () => clearTimeout(timer);
  }, [settings.autoSaveLibrary, dirty, libraryPath, reading]);

  // ── Leaving / closing ──────────────────────────────────
  const leaveOrCancel = useCallback(async () => {
    if (!dirtyRef.current || !settingsRef.current.confirmOnExit) return true;
    const answer = await askDialog('unsaved', {});
    if (!answer || answer.action === 'cancel') return false;
    if (answer.action === 'save') return !!(await saveLibraryRef.current());
    return true;
  }, [askDialog]);
  leaveOrCancelRef.current = leaveOrCancel;

  const closeTab = useCallback(async (id) => {
    if (!id) return;
    let target = id;
    const wasActive = target === activeTabIdRef.current;
    if (!wasActive) {
      const parked = sessionsRef.current.get(target);
      if (parked?.dirty) {
        switchToTab(target);
        if (!(await leaveOrCancelRef.current())) return;
        target = activeTabIdRef.current;
      }
    } else if (!(await leaveOrCancelRef.current())) {
      return;
    }

    const snapshot = sessionsRef.current.get(target) || captureRef.current();
    try { snapshot?.book?.destroy?.(); } catch { /* already gone */ }
    sessionsRef.current.delete(target);
    const nextId = neighborTabId(tabsRef.current, target);
    tabsRef.current = tabsRef.current.filter((tab) => tab.id !== target);
    setTabs(tabsRef.current);
    if (target === activeTabIdRef.current) {
      if (nextId && sessionsRef.current.has(nextId)) {
        applySessionRef.current(sessionsRef.current.get(nextId));
        setActiveTabId(nextId);
        activeTabIdRef.current = nextId;
      } else {
        clearLiveBook();
        setActiveTabId(null);
        activeTabIdRef.current = null;
      }
    }
  }, [clearLiveBook, switchToTab]);

  useEffect(() => {
    const id = activeTabId;
    if (!id) return;
    setTabs((list) => list.map((tab) => (tab.id === id && tab.dirty !== dirty ? { ...tab, dirty } : tab)));
  }, [dirty, activeTabId]);

  const handleAppClose = useCallback(async () => {
    parkCurrentTab();
    if (settingsRef.current.confirmOnExit
      && anyTabDirty(tabsRef.current, dirtyRef.current, activeTabIdRef.current)) {
      const answer = await askDialog('unsaved', {});
      if (!answer || answer.action === 'cancel') return;
      if (answer.action === 'save' && !(await saveLibraryRef.current())) return;
    }
    for (const snapshot of sessionsRef.current.values()) {
      try { snapshot?.book?.destroy?.(); } catch { /* already gone */ }
    }
    if (isElectron) {
      api.dialog.closeAll().catch(() => {});
      api.win.forceClose();
    } else {
      window.close();
    }
  }, [askDialog, parkCurrentTab]);

  useEffect(() => {
    if (!isElectron || !api.win?.onCloseRequest) return undefined;
    return api.win.onCloseRequest(() => { handleAppClose(); });
  }, [handleAppClose]);

  useEffect(() => {
    if (isElectron) return undefined;
    const onBefore = (e) => {
      if (!anyTabDirty(tabsRef.current, dirtyRef.current, activeTabIdRef.current)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);

  // ── Search ─────────────────────────────────────────────
  const runSearch = useCallback(async (query) => {
    if (!book) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearch({ query, results: [], busy: true, activeIndex: -1 });
    try {
      const results = await searchBook(book, query, { signal: controller.signal });
      setSearch({ query, results, busy: false, activeIndex: -1 });
      setStatusMessage(t('panel.results', { count: results.length }));
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setSearch({ query, results: [], busy: false, activeIndex: -1 });
      fail(err, 'search');
    }
  }, [book, fail, t]);

  const goToHit = useCallback((index) => {
    setSearch((s) => {
      const hit = s.results[index];
      if (!hit) return s;
      const before = s.results.filter((other, i) => i < index && other.section === hit.section).length;
      goToSection(hit.section);
      setActiveHit({ section: hit.section, pageHit: before, stamp: Date.now() });
      return { ...s, activeIndex: index };
    });
  }, [goToSection]);

  const stepSearch = useCallback((dir) => {
    setSearch((s) => {
      const next = stepHit(s.results, s.activeIndex, dir);
      if (next < 0) return s;
      setTimeout(() => goToHit(next), 0);
      return s;
    });
  }, [goToHit]);

  // ── Exporting ──────────────────────────────────────────
  const exportBook = useCallback(async (kind) => {
    if (!book) return;
    try {
      const chapters = [];
      await withProgress('exporting', book.fileName, async (onProgress) => {
        for (let i = 0; i < book.sectionCount; i++) {
          onProgress({ done: i, total: book.sectionCount });
          if (kind === 'html') {
            const loaded = book.loadSection(i);
            chapters.push({ label: book.sections[i]?.label || String(i + 1), html: loaded.html || '' });
          } else {
            chapters.push({
              label: book.sections[i]?.label || String(i + 1),
              text: await book.readSectionText(i),
            });
          }
        }
      });

      const base = (book.fileName || 'book').replace(/\.[^.]+$/, '');
      if (kind === 'html') {
        const html = await inlineImages(
          `<!doctype html><html><head><meta charset="utf-8"><title>${book.meta.title || base}</title></head><body>${
            chapters.map((c) => `<section><h2>${c.label}</h2>${c.html}</section>`).join('\n')
          }</body></html>`
        );
        const saved = await saveText({
          defaultName: `${base}.html`,
          defaultDir: settingsRef.current.lastDir,
          content: html,
          filters: [{ name: 'HTML', extensions: ['html'] }],
        });
        if (saved) toast(t('status.exported', { name: baseName(saved) }), 'ok');
        return;
      }

      const text = chapters
        .map((c) => `\n\n===== ${c.label} =====\n\n${c.text}`)
        .join('')
        .trim();
      const saved = await saveText({
        defaultName: `${base}.txt`,
        defaultDir: settingsRef.current.lastDir,
        content: text,
        filters: [{ name: 'Text', extensions: ['txt'] }],
      });
      if (saved) toast(t('status.exported', { name: baseName(saved) }), 'ok');
    } catch (err) {
      fail(err, 'export');
    }
  }, [book, fail, t, toast, withProgress]);

  // ── Printing ───────────────────────────────────────────
  const buildPreview = useCallback(async (request) => {
    const current = bookRef.current;
    if (!current) return {};
    const page = Math.max(1, Math.min(current.sectionCount, Number(request.page) || 1));
    printSetup.current = {
      paper: request.paper || 'A4',
      landscape: !!request.landscape,
      marginMm: request.marginMm ?? 14,
      showTitles: request.showTitles !== false,
    };
    const title = current.sections?.[page - 1]?.label || `${page}`;
    if (current.format === 'pdf' && current.pdf) {
      const [image] = await renderPdfPagesToImages({
        doc: current.pdf, pages: [page], rotation: settingsRef.current.rotation, scale: 1.2, quality: 0.8,
      });
      return { previewImage: image, previewHtml: '', previewTitle: title };
    }
    const loaded = current.loadSection(page - 1);
    if (loaded.kind === 'image') {
      return {
        previewImage: await inlineImages(`<img src="${loaded.src}">`).then((html) => /src="([^"]+)"/.exec(html)?.[1] || ''),
        previewHtml: '',
        previewTitle: title,
      };
    }
    return { previewImage: '', previewHtml: await inlineImages(loaded.html || ''), previewTitle: title };
  }, []);

  const openPrintDialog = useCallback(async () => {
    if (!book) return;
    const basePayload = {
      count: book.sectionCount,
      current: section + 1,
      scope: settingsRef.current.printScope,
      reflowable: book.reflowable,
      ...printSetup.current,
    };
    openDialog('print', { print: basePayload });
    try {
      const preview = await buildPreview({ page: section + 1, ...printSetup.current });
      openDialog('print', { print: { ...basePayload, ...preview } });
    } catch (err) {
      fail(err, 'print');
    }
  }, [book, buildPreview, fail, openDialog, section]);

  const doPrint = useCallback(async (request) => {
    const current = bookRef.current;
    if (!current || !request.pages?.length) return;
    setPrinting(true);
    try {
      setSettings((s) => ({ ...s, printScope: request.scope || s.printScope }));
      await withProgress('printing', current.fileName, async (onProgress) => {
        let html = '';
        if (current.format === 'pdf' && current.pdf) {
          const images = await renderPdfPagesToImages({
            doc: current.pdf,
            pages: request.pages,
            rotation: settingsRef.current.rotation,
            onProgress,
          });
          html = buildImagePrintHtml({
            images,
            title: current.meta.title || current.fileName,
            paper: request.paper,
            landscape: request.landscape,
            marginMm: request.marginMm,
          });
        } else if (!current.reflowable) {
          const images = [];
          for (const page of request.pages) {
            const loaded = current.loadSection(page - 1);
            if (loaded.src) images.push(loaded.src);
          }
          html = await inlineImages(buildImagePrintHtml({
            images,
            title: current.meta.title || current.fileName,
            paper: request.paper,
            landscape: request.landscape,
            marginMm: request.marginMm,
          }));
        } else {
          const chapters = request.pages.map((page) => {
            const loaded = current.loadSection(page - 1);
            return { label: current.sections[page - 1]?.label || String(page), html: loaded.html || '' };
          });
          html = await inlineImages(buildPrintHtml({
            chapters,
            title: current.meta.title || current.fileName,
            paper: request.paper,
            landscape: request.landscape,
            marginMm: request.marginMm,
            showTitles: request.showTitles,
            fontFamily: settingsRef.current.readerFont,
            fontSize: Math.round(12 * (settingsRef.current.fontScale || 1)),
            lineHeight: settingsRef.current.lineHeight,
          }));
        }
        await printHtml({ html, title: current.meta.title || current.fileName });
      });
      closeDialog('print');
      setStatusMessage(t('status.printed', { n: request.pages.length }));
      toast(t('status.printed', { n: request.pages.length }), 'ok');
    } catch (err) {
      fail(err, 'print');
    } finally {
      setPrinting(false);
    }
  }, [closeDialog, fail, t, toast, withProgress]);

  // ── Background image ───────────────────────────────────
  const pickBackground = useCallback(async () => {
    try {
      const picked = await pickImage({ defaultDir: settingsRef.current.lastDir });
      if (!picked) return;
      // Kept as a data URL: the picture has to survive a restart, and the size
      // is the user's choice — there is no limit imposed here.
      const blob = new Blob([picked.data]);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('The image could not be read.'));
        reader.readAsDataURL(blob);
      });
      setSettings((s) => ({ ...s, backgroundImage: String(dataUrl) }));
      setStatusMessage(t('status.backgroundSet'));
      toast(t('status.backgroundSet'), 'ok');
    } catch (err) {
      fail(err, 'background');
    }
  }, [fail, t, toast]);

  // ── Commands ───────────────────────────────────────────
  const setPanel = useCallback((side, value) => {
    setSettings((s) => ({ ...s, [side === 'left' ? 'leftPanel' : 'rightPanel']: value }));
  }, []);

  const changeLang = useCallback((lng) => {
    const current = String(i18n.language || '').startsWith('ko') ? 'ko' : 'en';
    const next = lng === 'ko' || lng === 'en' ? lng : (current === 'ko' ? 'en' : 'ko');
    setLanguage(next);
    setSettings((s) => ({ ...s, lang: next }));
  }, []);

  const runCommand = useCallback((id) => {
    const current = bookRef.current;
    switch (id) {
      case 'open': openViaDialog(); return;
      case 'openUrl':
        askDialog('prompt', { prompt: { kind: 'url', error: '' } }).then((answer) => {
          if (answer?.action === 'submit') openFromUrl(answer.value);
        });
        return;
      case 'openFolder':
        pickDirectory(settingsRef.current.folderRoot || settingsRef.current.lastDir).then((picked) => {
          if (!picked) return;
          setSettings((s) => ({
            ...s,
            folderRoot: picked,
            lastDir: picked,
            recentDirs: addRecentDir(s.recentDirs, picked),
            leftPanel: 'library',
          }));
        });
        return;
      case 'closeBook': if (activeTabIdRef.current) closeTab(activeTabIdRef.current); return;
      case 'saveLibrary': saveLibrary(); return;
      case 'saveLibraryAs': saveLibraryAs(); return;
      case 'exportText': exportBook('text'); return;
      case 'exportHtml': exportBook('html'); return;
      case 'print': openPrintDialog(); return;
      case 'properties':
        if (!current) return;
        openDialog('properties', {
          bookInfo: {
            meta: current.meta,
            formatLabel: current.formatLabel,
            reflowable: current.reflowable,
            sectionCount: current.sectionCount,
            fileName: current.fileName,
            filePath: current.filePath,
            fileSize: current.fileSize,
            libraryPath,
          },
        });
        return;
      case 'prevSection': turnSection(-1); return;
      case 'nextSection': turnSection(1); return;
      case 'firstSection': goToSection(0); return;
      case 'lastSection': goToSection((current?.sectionCount || 1) - 1); return;
      case 'modeScroll': setSettings((s) => ({ ...s, pageMode: 'scroll' })); return;
      case 'modePaged': setSettings((s) => ({ ...s, pageMode: 'paged' })); return;
      case 'twoColumns': setSettings((s) => ({ ...s, twoColumns: !s.twoColumns })); return;
      case 'textBigger': setSettings((s) => ({ ...s, fontScale: nextFontScale(s.fontScale, 1) })); return;
      case 'textSmaller': setSettings((s) => ({ ...s, fontScale: nextFontScale(s.fontScale, -1) })); return;
      case 'textReset': setSettings((s) => ({ ...s, fontScale: 1 })); return;
      case 'turnNone': setSettings((s) => ({ ...s, pageTurn: 'none' })); return;
      case 'turnSlide': setSettings((s) => ({ ...s, pageTurn: 'slide' })); return;
      case 'turnFlip': setSettings((s) => ({ ...s, pageTurn: 'flip' })); return;
      case 'justify': setSettings((s) => ({ ...s, justify: !s.justify })); return;
      case 'zoomIn': setSettings((s) => ({ ...s, zoomMode: 'custom', zoom: nextZoom(s.zoomMode === 'custom' ? s.zoom : scale, 1) })); return;
      case 'zoomOut': setSettings((s) => ({ ...s, zoomMode: 'custom', zoom: nextZoom(s.zoomMode === 'custom' ? s.zoom : scale, -1) })); return;
      case 'fitWidth': setSettings((s) => ({ ...s, zoomMode: 'fit-width' })); return;
      case 'fitPage': setSettings((s) => ({ ...s, zoomMode: 'fit-page' })); return;
      case 'fitHeight': setSettings((s) => ({ ...s, zoomMode: 'fit-height' })); return;
      case 'actualSize': setSettings((s) => ({ ...s, zoomMode: 'actual', zoom: 1 })); return;
      case 'spreadSingle': setSettings((s) => ({ ...s, spread: 'single' })); return;
      case 'spreadDouble': setSettings((s) => ({ ...s, spread: 'double' })); return;
      case 'rotateLeft': setSettings((s) => ({ ...s, rotation: (s.rotation + 270) % 360 })); return;
      case 'rotateRight': setSettings((s) => ({ ...s, rotation: (s.rotation + 90) % 360 })); return;
      case 'invertPages': setSettings((s) => ({ ...s, invertPages: !s.invertPages })); return;
      case 'toggleLeft': setSettings((s) => ({ ...s, leftPanel: nextPanel(s.leftPanel, 'contents') })); return;
      case 'toggleRight': setSettings((s) => ({ ...s, rightPanel: nextPanel(s.rightPanel, 'properties') })); return;
      case 'toggleMenuBar': setSettings((s) => ({ ...s, showMenuBar: !s.showMenuBar })); return;
      case 'toggleStatus': setSettings((s) => ({ ...s, showStatusBar: !s.showStatusBar })); return;
      case 'gallery': setGalleryOpen((open) => !open); return;
      case 'galleryIcons':
        setSettings((s) => ({ ...s, galleryView: 'icons' }));
        setGalleryOpen(true);
        return;
      case 'galleryDetails':
        setSettings((s) => ({ ...s, galleryView: 'details' }));
        setGalleryOpen(true);
        return;
      case 'toolbarLabels': setSettings((s) => ({ ...s, showToolbarLabels: !s.showToolbarLabels })); return;
      case 'background': pickBackground(); return;
      case 'clearBackground':
        setSettings((s) => ({ ...s, backgroundImage: '' }));
        setStatusMessage(t('status.backgroundCleared'));
        return;
      case 'addBookmark': addBookmarkHere(); return;
      case 'highlight': highlightSelection(); return;
      case 'addNote': askNote(); return;
      case 'copySelection': copySelection(); return;
      case 'copyImage': copyCurrentImage(); return;
      case 'copySection': copyCurrentSection(); return;
      case 'selectAll': viewRef.current?.selectAll(); return;
      case 'paste': pasteAsNote(); return;
      case 'find':
        setSettings((s) => ({ ...s, leftPanel: s.leftPanel === 'search' ? 'contents' : 'search' }));
        setTimeout(() => document.querySelector('[data-search-input]')?.focus(), 60);
        return;
      case 'undo': history.undo(); setDirty(true); return;
      case 'redo': history.redo(); setDirty(true); return;
      case 'settings':
        appInfo().then((info) => openDialog('settings', { storagePath: info.userData || '' }))
          .catch(() => openDialog('settings', {}));
        return;
      case 'shortcuts': openDialog('shortcuts', {}); return;
      case 'language': changeLang(); return;
      case 'about':
        appInfo()
          .then((info) => openDialog('about', { info, build: buildInfo }))
          .catch(() => openDialog('about', { build: buildInfo }));
        return;
      default: return;
    }
  }, [addBookmarkHere, askDialog, askNote, changeLang, closeTab, copyCurrentImage, copyCurrentSection, copySelection,
    exportBook, goToSection, highlightSelection, history, libraryPath, openDialog, openFromUrl,
    openPrintDialog, openViaDialog, pasteAsNote, pickBackground, saveLibrary, saveLibraryAs, scale,
    t, turnSection]);

  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  // ── Recent files ───────────────────────────────────────
  const openRecent = useCallback(async (entry) => {
    if (!entry?.path) { toast(t('recent.missing'), 'warn'); return; }
    if (isElectron && !(await pathExists(entry.path))) {
      fail(new Error(`${t('recent.missing')}:\n${entry.path}`), 'read', { file: entry.path });
      setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, entry.path) }));
      return;
    }
    openByPathRef.current(entry.path);
  }, [fail, t, toast]);

  // ── The gallery ────────────────────────────────────────
  const openFromGallery = useCallback(async (entry) => {
    if (!entry?.path) { toast(t('recent.missing'), 'warn'); return; }
    if (isElectron && !(await pathExists(entry.path))) {
      fail(new Error(`${t('recent.missing')}:
${entry.path}`), 'read', { file: entry.path });
      editShelf((rows) => removeFromGallery(rows, galleryKey(entry)), { removed: galleryKey(entry) });
      return;
    }
    setGalleryOpen(false);
    openByPathRef.current(entry.path);
  }, [editShelf, fail, t, toast]);

  const clearGallery = useCallback(async () => {
    const n = shelfRef.current.length;
    if (!n) return;
    const answer = await askDialog('confirm', {
      title: t('gallery.clear'),
      message: t('gallery.clearConfirm', { n }),
      confirmLabel: t('gallery.clear'),
      danger: true,
    });
    if (answer?.action !== 'confirm') return;
    setShelf([]);
    await galleryStore().clear().catch(() => {});
    toast(t('gallery.clear'), 'ok');
  }, [askDialog, t, toast]);

  // A cover for the shelf: the book's own, else the page on show. Taken once
  // per book — a shelved cover is never re-made — and small enough to store.
  useEffect(() => {
    if (!book) return undefined;
    const key = book.filePath || book.fileName;
    if (!key) return undefined;
    const shelved = shelfRef.current.find((e) => galleryKey(e) === key);
    if (!shelved || shelved.cover) return undefined;

    let cancelled = false;
    const timers = [];
    const attempt = async () => {
      if (cancelled) return;
      const source = (typeof book.cover === 'function' ? book.cover() : '')
        || viewRef.current?.pageImage?.()?.dataUrl
        || '';
      const thumb = await makeThumbnail(source);
      if (cancelled || !thumb) return;
      // The picture goes to the cover store; the shelf only remembers that
      // there is one.
      await galleryStore().putCover(key, thumb).catch(() => {});
      editShelf(
        (rows) => updateGallery(rows, key, { cover: true }),
        { put: { ...shelved, cover: true } },
      );
      cancelled = true; // one cover is enough
    };
    // Twice: a PDF page or a large picture is often still being painted when
    // the first attempt comes round.
    timers.push(setTimeout(attempt, 500), setTimeout(attempt, 1800));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, content]);

  // ── Menus ──────────────────────────────────────────────
  const menuState = useCallback(() => ({
    hasBook: !!bookRef.current,
    hasSelection: !!selectionRef.current.trim(),
    reflowable: bookRef.current ? bookRef.current.reflowable : true,
    hasImage: !!bookRef.current && !!viewRef.current?.hasImage?.(),
    active: activeCommands(settingsRef.current, bookRef.current),
    recentFiles: settingsRef.current.recentFiles,
    bookmarks: reading.bookmarks,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  }), [history.canUndo, history.canRedo, reading.bookmarks]);

  const handleChoice = useCallback((id) => {
    const choice = parseChoice(id);
    switch (choice.kind) {
      case 'recent': {
        const entry = settingsRef.current.recentFiles.find((f) => (f.path || f.name) === choice.value);
        if (entry) openRecent(entry);
        return;
      }
      case 'recent-forget':
        setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, choice.value) }));
        return;
      case 'theme':
        setSettings((s) => ({ ...s, theme: choice.value }));
        return;
      case 'bookmark': {
        const mark = reading.bookmarks.find((b) => b.id === choice.value);
        if (mark) {
          goToSection(mark.section);
          setTimeout(() => viewRef.current?.scrollToFrac(mark.fracY || 0), 120);
        }
        return;
      }
      default:
        runCommandRef.current(choice.value);
    }
  }, [goToSection, openRecent, reading.bookmarks]);

  const openMenu = useCallback(async (name, anchor) => {
    setOpenMenuName(name);
    const state = menuState();
    if (isElectron) {
      const bounds = await api.win.getContentBounds().catch(() => null);
      const at = bounds
        ? { x: bounds.x + anchor.x, y: bounds.y + anchor.y, width: anchor.width, height: anchor.height }
        : anchor;
      api.menu.open({
        menu: name,
        language: settingsRef.current.lang,
        theme: settingsRef.current.theme,
        state,
      }, at).catch(() => {});
      return;
    }
    const rows = name === 'theme' ? themeRows(THEMES, settingsRef.current.theme) : menuRows(name, state);
    setMenu({ open: true, x: anchor.x, y: anchor.y, rows, name });
  }, [menuState]);

  useEffect(() => {
    if (!isElectron || !api.menu?.onChosen) return undefined;
    return api.menu.onChosen((id) => {
      setOpenMenuName(null);
      handleChoice(id);
    });
  }, [handleChoice]);

  // A menu can also be dismissed without choosing anything — clicking away,
  // Escape — and the bar must stop looking open then too.
  useEffect(() => {
    if (!openMenuName) return undefined;
    const clear = () => setOpenMenuName(null);
    window.addEventListener('focus', clear);
    window.addEventListener('pointerdown', clear);
    return () => {
      window.removeEventListener('focus', clear);
      window.removeEventListener('pointerdown', clear);
    };
  }, [openMenuName]);

  const onViewContextMenu = useCallback((e) => {
    e.preventDefault();
    openMenu('context', { x: e.clientX, y: e.clientY, width: 0, height: 0 });
  }, [openMenu]);

  // ── Dialog results ─────────────────────────────────────
  const handleDialogResult = useCallback((name, result) => {
    if (!result) return;
    if (settleDialog(name, result)) {
      // A dialog someone is waiting on: the promise carries the answer, but a
      // password still has to reach pdf.js and a note its own handler.
      if (name === 'prompt' && result.action === 'submit' && result.kind === 'password') {
        try { passwordRetry.current?.(result.value); } catch (err) { fail(err, 'open'); }
      }
      return;
    }

    switch (result.action) {
      case 'settings': {
        const next = result.settings;
        if (next.lang !== settingsRef.current.lang) setLanguage(next.lang);
        setSettings(next);
        return;
      }
      case 'reset': {
        const kept = {
          recentFiles: settingsRef.current.recentFiles,
          recentDirs: settingsRef.current.recentDirs,
          lastDir: settingsRef.current.lastDir,
        };
        const next = { ...DEFAULT_SETTINGS, ...kept };
        setLanguage(next.lang);
        setSettings(next);
        toast(t('settings.done'), 'ok');
        // The open dialog is showing the old values.
        openDialog('settings', {});
        return;
      }
      case 'clearRecent':
        setSettings((s) => ({ ...s, recentFiles: [] }));
        openDialog('settings', {});
        return;
      case 'removeRecent':
        setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, result.key) }));
        openDialog('settings', {});
        return;
      case 'clearDirs':
        setSettings((s) => ({ ...s, recentDirs: [] }));
        openDialog('settings', {});
        return;
      case 'shortcuts':
        openDialog('shortcuts', {});
        return;
      case 'pickBackground':
        pickBackground().then(() => openDialog('settings', {}));
        return;
      case 'clearBackground':
        setSettings((s) => ({ ...s, backgroundImage: '' }));
        openDialog('settings', {});
        return;
      case 'preview':
        buildPreview(result).then((preview) => {
          const current = bookRef.current;
          if (!current) return;
          openDialog('print', {
            print: {
              count: current.sectionCount,
              current: sectionRef.current + 1,
              scope: settingsRef.current.printScope,
              reflowable: current.reflowable,
              ...printSetup.current,
              ...preview,
            },
          });
        }).catch((err) => fail(err, 'print'));
        return;
      case 'print':
        doPrint(result);
        return;
      case 'copyText':
        copyText(result.text).then(() => toast(t('status.copied'), 'ok')).catch((err) => fail(err, 'copy'));
        return;
      case 'openExternal':
        openExternal(result.url).catch((err) => fail(err, 'open'));
        return;
      case 'close':
        closeDialog(name);
        return;
      default:
        return;
    }
  }, [buildPreview, closeDialog, doPrint, fail, openDialog, pickBackground, settleDialog, t, toast]);

  useEffect(() => {
    if (!isElectron || !api.dialog?.onResult) return undefined;
    return api.dialog.onResult(({ name, result }) => handleDialogResult(name, result));
  }, [handleDialogResult]);

  // A popup window closed by its own X button: anything waiting on it is told.
  useEffect(() => {
    if (!isElectron || !api.dialog?.onClosed) return undefined;
    return api.dialog.onClosed((name) => {
      if (name === 'unsaved') settleDialog(name, { action: 'cancel' });
      else settleDialog(name, null);
      if (name === 'prompt') passwordRetry.current = null;
    });
  }, [settleDialog]);

  // ── Keyboard ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'o') { e.preventDefault(); runCommandRef.current('open'); return; }
      if (mod && key === 's') { e.preventDefault(); runCommandRef.current('saveLibrary'); return; }
      if (mod && key === 'p') { e.preventDefault(); runCommandRef.current('print'); return; }
      if (mod && key === 'b') { e.preventDefault(); runCommandRef.current('addBookmark'); return; }
      if (mod && key === 'h') { e.preventDefault(); runCommandRef.current('highlight'); return; }
      if (mod && key === 'f') { e.preventDefault(); runCommandRef.current('find'); return; }
      if (mod && key === 'w') {
        e.preventDefault();
        if (activeTabIdRef.current) closeTab(activeTabIdRef.current);
        return;
      }
      if (mod && e.key === 'Tab') {
        e.preventDefault();
        const next = nextTabId(tabsRef.current, activeTabIdRef.current, e.shiftKey ? -1 : 1);
        if (next) switchToTab(next);
        return;
      }
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); runCommandRef.current('undo'); return; }
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); runCommandRef.current('redo'); return; }
      if (mod && e.shiftKey && key === 'c' && !inField) { e.preventDefault(); runCommandRef.current('copyImage'); return; }
      if (mod && e.shiftKey && key === 'g' && !inField) { e.preventDefault(); runCommandRef.current('gallery'); return; }
      if (mod && key === 'c' && !inField) { e.preventDefault(); runCommandRef.current('copySelection'); return; }
      if (mod && key === 'v' && !inField) { e.preventDefault(); runCommandRef.current('paste'); return; }
      if (mod && key === 'a' && !inField) { e.preventDefault(); runCommandRef.current('selectAll'); return; }
      if (mod && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        runCommandRef.current(bookRef.current?.reflowable === false ? 'zoomIn' : 'textBigger');
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        runCommandRef.current(bookRef.current?.reflowable === false ? 'zoomOut' : 'textSmaller');
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        runCommandRef.current(bookRef.current?.reflowable === false ? 'actualSize' : 'textReset');
        return;
      }
      if (e.altKey && !mod && MENU_KEYS_BY_LETTER[key]) {
        const bar = document.querySelector(`.menubar-item[data-menu="${MENU_KEYS_BY_LETTER[key]}"]`);
        if (bar) { e.preventDefault(); bar.click(); return; }
      }
      if (e.key === 'F9') { e.preventDefault(); runCommandRef.current('toggleLeft'); return; }
      if (e.key === 'F10') { e.preventDefault(); runCommandRef.current('toggleRight'); return; }
      if (e.key === 'F3') { e.preventDefault(); stepSearch(e.shiftKey ? -1 : 1); return; }
      if (inField) return;

      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !mod) || e.key === ' ') { e.preventDefault(); turnPage(1); }
      else if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !mod)) { e.preventDefault(); turnPage(-1); }
      else if (e.key === 'Home' && mod) { runCommandRef.current('firstSection'); }
      else if (e.key === 'End' && mod) { runCommandRef.current('lastSection'); }
      else if (e.key === 'Escape') { viewRef.current?.clearSelection(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeTab, stepSearch, switchToTab, turnPage]);

  // ── Drag & drop ────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = [...(e.dataTransfer?.files || [])];
    if (!dropped.length) return;
    try {
      for (const file of dropped) {
        if (isElectron && file.path) { await openByPathRef.current(file.path); continue; }
        const buffer = await file.arrayBuffer();
        const payload = { data: new Uint8Array(buffer), name: file.name, path: null, size: file.size };
        if (isLibraryName(file.name)) await openLibraryFile(new TextDecoder().decode(payload.data), null);
        else await openPayload(payload);
      }
    } catch (err) {
      fail(err, 'open', { file: dropped[0]?.name });
    }
  }, [fail, openLibraryFile, openPayload]);

  // ── Window title ───────────────────────────────────────
  useEffect(() => {
    const title = windowTitle(book?.fileName, dirty);
    document.title = title;
    platformWin.setTitle(title);
  }, [book, dirty]);

  // ── Derived ────────────────────────────────────────────
  const marks = useMemo(() => marksForSection(reading, section), [reading, section]);
  const titleText = useMemo(
    () => (book ? `${book.meta.title || book.fileName}${dirty ? ' •' : ''}` : t('app.untitled')),
    [book, dirty, t],
  );
  const overall = useMemo(
    () => bookProgress({ section, sectionCount: book?.sectionCount || 1, fracY: progress }),
    [section, book, progress],
  );

  const onSelectionChange = useCallback((text) => {
    selectionRef.current = text || '';
    setSelectionText(text || '');
  }, []);

  return (
    <div
      className="app"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <TitleBar title={titleText} />

      {settings.showMenuBar ? (
        <MenuBar onOpenMenu={openMenu} openMenu={openMenuName} />
      ) : null}

      <Toolbar
        settings={settings}
        book={book}
        section={section}
        sectionCount={book?.sectionCount || 0}
        scale={scale}
        hasSelection={!!selectionText.trim()}
        history={history}
        bookmarkCount={reading.bookmarks.length}
        galleryOpen={galleryOpen}
        onOpenMenu={openMenu}
        onCommand={(id) => runCommandRef.current(id)}
        onGoToSection={goToSection}
        onTheme={(id) => setSettings((s) => ({ ...s, theme: id || nextTheme(s.theme) }))}
        onLang={changeLang}
      />

      <div className="workarea">
        <LeftPanel
          panel={settings.leftPanel}
          width={settings.leftWidth}
          onPanel={(p) => setPanel('left', p)}
          onResize={(w) => setSettings((s) => ({ ...s, leftWidth: clampPanelWidth(w) }))}
          book={book}
          section={section}
          toc={book?.toc || []}
          onGoTo={goToSection}
          bookmarks={reading.bookmarks}
          onGoToBookmark={(mark) => {
            goToSection(mark.section);
            setTimeout(() => viewRef.current?.scrollToFrac(mark.fracY || 0), 120);
          }}
          onRemoveBookmark={(id) => editReading(
            (state) => ({ ...state, bookmarks: removeById(state.bookmarks, id) }),
            t('common.delete'),
          )}
          onClearBookmarks={() => editReading((state) => ({ ...state, bookmarks: [] }), t('panel.removeAll'))}
          search={search}
          onSearch={runSearch}
          onGoToHit={goToHit}
          folderRoot={settings.folderRoot}
          currentPath={book?.filePath || ''}
          desktop={isElectron}
          onPickFolder={() => runCommandRef.current('openFolder')}
          onOpenFile={(p) => openByPathRef.current(p)}
          loadFolder={listDirectory}
          recentFiles={settings.recentFiles}
          onOpenRecent={openRecent}
          onRemoveRecent={(key) => setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, key) }))}
          onClearRecent={() => setSettings((s) => ({ ...s, recentFiles: [] }))}
        />

        <main className={`viewer${dragOver ? ' dragging' : ''}`}>
          <TabBar tabs={tabs} activeId={activeTabId} onSelect={switchToTab} onClose={closeTab} />
          <BookView
            key={activeTabId || 'empty'}
            ref={viewRef}
            book={book}
            section={section}
            content={content}
            settings={settings}
            marks={marks}
            searchQuery={search.query}
            activeHit={activeHit}
            onSelectionChange={onSelectionChange}
            onContextMenu={onViewContextMenu}
            onFollowLink={({ section: target, anchor }) => goToSection(target, anchor)}
            onOpenExternal={(url) => openExternal(url).catch((err) => fail(err, 'open'))}
            onProgress={setProgress}
            onPageInfo={setColumns}
            onScaleChange={setScale}
            onZoomStep={(dir) => runCommandRef.current(dir > 0 ? 'zoomIn' : 'zoomOut')}
            onTextStep={(dir) => runCommandRef.current(dir > 0 ? 'textBigger' : 'textSmaller')}
            onError={fail}
            emptyState={(
              <div className="welcome">
                <img src="./icon.svg" alt="" width="120" height="120" />
                <h2>{t('common.welcome')}</h2>
                <p>{t('common.welcomeHint')}</p>
                <div className="welcome-actions">
                  <button type="button" className="btn primary" onClick={() => runCommandRef.current('open')} title={t('tip.open')}>
                    {t('cmd.open')}
                  </button>
                  {shelf.length ? (
                    <button type="button" className="btn" onClick={() => setGalleryOpen(true)} title={t('tip.gallery')}>
                      {t('gallery.title')} · {shelf.length}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          />
          {/* Turning the page without reaching for the keyboard: two arrows
              over the page itself, quiet until they are wanted. They sit
              outside the scrolling pane, so they stay put as the page moves. */}
          {book && !galleryOpen ? (
            <div className="page-arrows">
              <button
                type="button"
                className="page-arrow left"
                onClick={() => turnPage(-1)}
                title={`${t('cmd.prevPage')} (PageUp)`}
                aria-label={t('cmd.prevPage')}
              >
                <IconPrev size={26} />
              </button>
              <button
                type="button"
                className="page-arrow right"
                onClick={() => turnPage(1)}
                title={`${t('cmd.nextPage')} (PageDown)`}
                aria-label={t('cmd.nextPage')}
              >
                <IconNext size={26} />
              </button>
            </div>
          ) : null}

          {galleryOpen ? (
            <Gallery
              entries={shelf}
              view={settings.galleryView}
              sort={settings.gallerySort}
              language={settings.lang}
              onOpen={openFromGallery}
              onForget={(key) => editShelf((rows) => removeFromGallery(rows, key), { removed: key })}
              onClear={clearGallery}
              onView={(view) => setSettings((s) => ({ ...s, galleryView: view }))}
              onSort={(sort) => setSettings((s) => ({ ...s, gallerySort: sort }))}
              onClose={() => setGalleryOpen(false)}
            />
          ) : null}
          {dragOver ? <div className="dropzone">{t('common.dropHere')}</div> : null}
        </main>

        <RightPanel
          panel={settings.rightPanel}
          width={settings.rightWidth}
          onPanel={(p) => setPanel('right', p)}
          onResize={(w) => setSettings((s) => ({ ...s, rightWidth: clampPanelWidth(w) }))}
          book={book}
          section={section}
          settings={settings}
          onSettings={setSettings}
          libraryPath={libraryPath}
          dirty={dirty}
          highlights={reading.highlights}
          notes={reading.notes}
          onGoToMark={(mark) => goToSection(mark.section)}
          onRemoveMark={(id, kind) => editReading((state) => ({
            ...state,
            highlights: kind === 'highlight' ? removeById(state.highlights, id) : state.highlights,
            notes: kind === 'note' ? removeById(state.notes, id) : state.notes,
          }), t('common.delete'))}
          onCopyMark={(mark) => copyText(mark.note || mark.text)
            .then(() => toast(t('status.copied'), 'ok'))
            .catch((err) => fail(err, 'copy'))}
        />
      </div>

      {settings.showStatusBar ? (
        <StatusBar
          book={book}
          section={section}
          progress={overall}
          scale={scale}
          columns={columns}
          selectionChars={selectionText.length}
          dirty={dirty}
          history={history}
          message={statusMessage}
          busy={busy || search.busy || printing}
          bookmarks={reading.bookmarks.length}
        />
      ) : null}

      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        rows={menu.rows}
        label={menu.name}
        onChoose={handleChoice}
        onClose={() => setMenu((m) => ({ ...m, open: false }))}
      />

      {/* The web build has no child windows, so dialogs render in-page. */}
      {!isElectron && webDialog ? (
        <DialogModal
          name={webDialog.name}
          payload={webDialog.payload}
          onResult={(result) => handleDialogResult(webDialog.name, result)}
          onClose={() => {
            const name = webDialog.name;
            if (name === 'unsaved') settleDialog(name, { action: 'cancel' });
            else settleDialog(name, null);
            setWebDialog(null);
          }}
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((item) => item.id !== id))} />
      <Tooltip />
    </div>
  );
}

export { APP_NAME, readingIsEmpty };

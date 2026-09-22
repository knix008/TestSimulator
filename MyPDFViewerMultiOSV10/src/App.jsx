import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import TitleBar from './components/TitleBar.jsx';
import TabBar from './components/TabBar.jsx';
import Toolbar from './components/Toolbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import PdfView from './components/PdfView.jsx';
import StatusBar from './components/StatusBar.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import Tooltip from './components/Tooltip.jsx';
import Toasts from './components/Toasts.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import AboutDialog from './components/AboutDialog.jsx';
import { ErrorDialog, ProgressDialog, PromptDialog, PropertiesDialog, UnsavedDialog } from './components/Dialogs.jsx';
import CaptureDialog from './components/CaptureDialog.jsx';
import PrintDialog from './components/PrintDialog.jsx';
import {
  IconCopy, IconSelectAll, IconMarquee, IconHighlight, IconBookmark, IconZoomIn,
  IconZoomOut, IconFitWidth, IconRotateRight, IconPrev, IconNext, IconImage,
  IconSelectText, IconDownload, IconClip, IconClose, IconComment,
} from './components/Icons.jsx';

import {
  loadDocument, getOutline, destToLocation, getDocumentInfo, getPageText, extractPageImages,
  searchDocument, getDocumentComments, getImageDataUrl, cropCanvas,
} from './lib/pdf.js';
import {
  isElectron, api, openFileDialog, readPath, downloadUrl, copyText, copyImage,
  saveText, writeTextTo, saveBinary, pickAnyFile, pickDirectory, listDirectory,
  baseName, dirName, pathExists, saveEncoded, openExternal,
} from './lib/platform.js';
import { namedActionPage } from './lib/nav.js';
import {
  loadSettings, persistSettings, DEFAULT_SETTINGS, addRecentFile, removeRecentFile,
  clampSidebarWidth,
  addRecentDir, applyFontSettings, applyTheme,
} from './lib/settings.js';
import { useHistory, EMPTY_WORKSPACE, newId } from './lib/history.js';
import {
  serializeWorkspace, parseWorkspace, isWorkspacePath, bytesToText, looksLikePdf, WORKSPACE_EXT,
} from './lib/workspace.js';
import { encodeImage, formatById, formatByExtension, saveFilters } from './lib/image.js';
import { renderPagesForPrint, printViaBrowser } from './lib/print.js';
import i18n, { setLanguage } from './i18n.js';
import {
  HIGHLIGHT_COLOR, cycleTool, nextZoom, clampPage, normalizeRotation,
  failMessage, windowTitle, bookmarkLabel, nextSidebar, pickCopyText,
  bookmarkRecord, bookmarkAnchorY,
} from './lib/view.js';
import { pageOccurrence } from './lib/search.js';
import { commentAnchorY, mergeCommentList } from './lib/comments.js';
import { documentKey, tabLabel, findTabByFile, neighborTabId, nextTabId, anyTabDirty } from './lib/tabs.js';
import {
  writeWorkspaceIntoPdf, attachmentRecord, base64ToBytes, MAX_ATTACHMENT_BYTES,
  suggestedPdfCopyName,
} from './lib/pdf-write.js';

export default function App() {
  const { t } = useTranslation();

  // ── Persistent settings ────────────────────────────────
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);

  // ── Document ───────────────────────────────────────────
  const [file, setFile] = useState(null);          // { name, path, dir, size, data }
  const [doc, setDoc] = useState(null);            // pdf.js document proxy
  const [docInfo, setDocInfo] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [outline, setOutline] = useState([]);
  const [images, setImages] = useState([]);
  const [extracting, setExtracting] = useState(false);

  // ── Workspace (undo/redo) ──────────────────────────────
  const history = useHistory(EMPTY_WORKSPACE);
  const workspace = history.state;
  const [workspacePath, setWorkspacePath] = useState(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const unsavedResolve = useRef(null);
  const leaveOrCancelRef = useRef(async () => true);
  const savePdfRef = useRef(async () => false);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const tabsRef = useRef([]);
  const activeTabIdRef = useRef(null);
  const sessionsRef = useRef(new Map());
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;

  // ── Interaction ────────────────────────────────────────
  const [selectionText, setSelectionText] = useState('');
  const selectionTextRef = useRef('');
  const [search, setSearch] = useState({ query: '', results: [], busy: false, active: null });
  const [activeBookmark, setActiveBookmark] = useState(null);
  const [activeComment, setActiveComment] = useState(null);
  const [docComments, setDocComments] = useState({ items: [], busy: false });
  const commentsKeyRef = useRef(null);
  const [menu, setMenu] = useState({ open: false, x: 0, y: 0, items: [] });

  // ── Dialogs / feedback ─────────────────────────────────
  const [error, setError] = useState(null);
  const [task, setTask] = useState(null);
  const [prompt, setPrompt] = useState({ open: false, kind: 'url', error: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const [capture, setCapture] = useState(null);        // { dataUrl, width, height, page }
  const [selectedImage, setSelectedImage] = useState(null); // { page, id, rect }
  const [showPrint, setShowPrint] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');

  const viewRef = useRef(null);
  const passwordRetry = useRef(null);
  const searchAbort = useRef(null);
  const commentDraft = useRef(null);
  const captureRef = useRef(() => ({}));
  const applySessionRef = useRef(() => {});
  const liveDocRef = useRef(null);
  const liveFileRef = useRef(null);
  const docLoadGen = useRef(0);
  liveDocRef.current = doc;
  liveFileRef.current = file;

  // Which mouse tool is active: select text, or select a region / picture.
  const tool = settings.tool;
  const setTool = useCallback((next) => setSettings((s) => ({ ...s, tool: next })), []);

  // ── Small helpers ──────────────────────────────────────
  const toast = useCallback((text, kind = 'info') => {
    const id = newId();
    setToasts((list) => [...list, { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 2600);
  }, []);

  // Every failure the user can see goes through here, so the dialog always has
  // the operation, the message and the full technical detail — all copyable.
  const fail = useCallback((err, context, extra = {}) => {
    // Electron wraps errors thrown in the main process as
    // "Error invoking remote method 'fs:readBinary': Error: …" — the user only
    // needs the part after that, while the raw text stays in the details.
    const raw = err?.message || String(err) || 'Unknown error';
    const message = failMessage(err);
    const details = [
      err?.name ? `${err.name}: ${raw}` : raw,
      err?.stack || '',
      extra.details || '',
    ].filter(Boolean).join('\n\n');
    setError({ context, message, details, at: Date.now(), file: extra.file });
    setStatusMessage(message);
  }, []);

  // Wraps a slow operation in the progress dialog. The dialog only appears if
  // the work is still running after a moment — opening a small file should feel
  // instant rather than flashing a modal on and off.
  const SHOW_PROGRESS_AFTER = 180;
  const withProgress = useCallback(async (kind, name, fn) => {
    const state = { kind, name, done: 0, total: 0, indeterminate: true };
    let shown = false;
    let live = true;
    const timer = setTimeout(() => { if (live) { shown = true; setTask({ ...state }); } }, SHOW_PROGRESS_AFTER);
    try {
      return await fn((p) => {
        Object.assign(state, p, { indeterminate: !(p.total > 0) });
        if (shown) setTask({ ...state });
      });
    } finally {
      live = false;
      clearTimeout(timer);
      if (shown) setTask(null);
    }
  }, []);

  // ── Boot: restore settings, then any file handed to us ──
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

  // A picture stays selected only while the image tool is active.
  useEffect(() => { if (tool !== 'image') setSelectedImage(null); }, [tool]);

  // Apply theme + font settings whenever they change, and persist everything.
  useEffect(() => {
    applyTheme(settings.theme);
    applyFontSettings(settings);
    if (settingsReady) persistSettings(settings);
  }, [settings, settingsReady]);

  const captureSession = useCallback(() => ({
    file,
    doc,
    docInfo,
    pageNumber,
    scale,
    outline,
    images,
    history: history.exportSnapshot(),
    workspacePath,
    dirty,
    search,
    activeBookmark,
    activeComment,
    docComments,
    selectedImage,
    selectionText,
    commentsKey: commentsKeyRef.current,
    view: {
      zoomMode: settings.zoomMode,
      zoom: settings.zoom,
      rotation: settings.rotation,
      pageLayout: settings.pageLayout,
    },
  }), [file, doc, docInfo, pageNumber, scale, outline, images, history, workspacePath, dirty,
    search, activeBookmark, activeComment, docComments, selectedImage, selectionText, settings]);
  captureRef.current = captureSession;

  const applySession = useCallback((s) => {
    if (!s) return;
    docLoadGen.current += 1;
    setFile(s.file || null);
    setDoc(s.doc || null);
    setDocInfo(s.docInfo || null);
    setPageNumber(s.pageNumber || 1);
    setScale(s.scale || 1);
    setOutline(s.outline || []);
    setImages(s.images || []);
    history.restoreSnapshot(s.history);
    setWorkspacePath(s.workspacePath || null);
    setDirty(!!s.dirty);
    setSearch(s.search || { query: '', results: [], busy: false, active: null });
    setActiveBookmark(s.activeBookmark || null);
    setActiveComment(s.activeComment || null);
    setDocComments(s.docComments || { items: [], busy: false });
    setSelectedImage(s.selectedImage || null);
    setSelectionText(s.selectionText || '');
    commentsKeyRef.current = s.commentsKey || null;
    if (s.view) {
      setSettings((prev) => ({
        ...prev,
        zoomMode: s.view.zoomMode ?? prev.zoomMode,
        zoom: s.view.zoom ?? prev.zoom,
        rotation: s.view.rotation ?? prev.rotation,
        pageLayout: s.view.pageLayout ?? prev.pageLayout,
      }));
    }
  }, [history]);
  applySessionRef.current = applySession;

  const parkCurrentTab = useCallback(() => {
    const id = activeTabIdRef.current;
    if (!id) return;
    const snap = captureRef.current();
    if (!snap.file && !snap.doc) return;
    sessionsRef.current.set(id, snap);
    setTabs((list) => list.map((t) => (
      t.id === id
        ? { ...t, dirty: !!snap.dirty, name: tabLabel(snap.file) || t.name, path: snap.file?.path || '', key: documentKey(snap.file) || t.key }
        : t
    )));
  }, []);

  const switchToTab = useCallback((id) => {
    if (!id || id === activeTabIdRef.current) return;
    parkCurrentTab();
    const snap = sessionsRef.current.get(id);
    if (!snap) return;
    applySessionRef.current(snap);
    setActiveTabId(id);
  }, [parkCurrentTab]);

  const clearLiveDocument = useCallback(() => {
    setDoc(null);
    setFile(null);
    setDocInfo(null);
    setOutline([]);
    setImages([]);
    history.reset(EMPTY_WORKSPACE);
    setWorkspacePath(null);
    setDirty(false);
    setSearch({ query: '', results: [], busy: false, active: null });
    setActiveBookmark(null);
    setActiveComment(null);
    setDocComments({ items: [], busy: false });
    setSelectedImage(null);
    setSelectionText('');
    commentsKeyRef.current = null;
    setPageNumber(1);
    docLoadGen.current += 1;
  }, [history]);

  const closeTab = useCallback(async (id) => {
    if (!id) return;
    const wasActive = id === activeTabIdRef.current;
    if (!wasActive) {
      const parked = sessionsRef.current.get(id);
      if (parked?.dirty) {
        switchToTab(id);
        if (!(await leaveOrCancelRef.current())) return;
        id = activeTabIdRef.current;
      }
    } else if (!(await leaveOrCancelRef.current())) {
      return;
    }

    const snap = sessionsRef.current.get(id) || captureRef.current();
    if (snap?.doc) {
      try { await snap.doc.destroy(); } catch { /* already gone */ }
    }
    sessionsRef.current.delete(id);
    const nextId = neighborTabId(tabsRef.current, id);
    setTabs((list) => list.filter((t) => t.id !== id));
    if (id === activeTabIdRef.current) {
      if (nextId && sessionsRef.current.has(nextId)) {
        applySessionRef.current(sessionsRef.current.get(nextId));
        setActiveTabId(nextId);
      } else {
        clearLiveDocument();
        setActiveTabId(null);
      }
    }
  }, [switchToTab, clearLiveDocument]);

  useEffect(() => {
    const id = activeTabId;
    if (!id) return;
    setTabs((list) => list.map((t) => (t.id === id && t.dirty !== dirty ? { ...t, dirty } : t)));
  }, [dirty, activeTabId]);

  // ── Opening documents ──────────────────────────────────

  // Turns raw bytes into an open document. Handles both PDFs and workspaces.
  // A new file becomes its own tab unless `replace` is set (Save-as reload).
  const openBytes = useCallback(async (payload, { restore, replace = false } = {}) => {
    const { data, name, path: filePath, size } = payload;
    try {
      // A .pdfvw workspace points at a PDF: load that, then restore the work.
      if (isWorkspacePath(name) || isWorkspacePath(filePath || '')) {
        const parsed = parseWorkspace(bytesToText(data));
        if (!parsed.pdfPath) {
          throw new Error(`This workspace does not record a PDF path, so the document it belongs to cannot be reopened automatically. Open "${parsed.pdfName || 'the PDF'}" manually, then load this workspace again.`);
        }
        if (isElectron && !(await pathExists(parsed.pdfPath))) {
          throw new Error(`The PDF this workspace refers to no longer exists:\n${parsed.pdfPath}`);
        }
        const pdfBytes = await withProgress('opening', baseName(parsed.pdfPath), (onProgress) =>
          readPath(parsed.pdfPath, { onProgress }));
        setWorkspacePath(filePath || null);
        await openBytes(pdfBytes, { restore: { ...parsed, workspaceFilePath: filePath || null } });
        return;
      }

      if (!looksLikePdf(data)) {
        throw new Error(`${t('error.notPdf')} (${name})`);
      }

      const loadingTask = await withProgress('parsing', name, async (onProgress) => {
        const lt = loadDocument({
          data,
          onProgress: ({ loaded, total }) => onProgress({ done: loaded, total }),
          onPassword: (retry, reason) => {
            passwordRetry.current = retry;
            setPrompt({ open: true, kind: 'password', error: reason === 2 ? t('error.passwordWrong') : '' });
          },
        });
        await lt.promise;   // resolves once (and if) the password is accepted
        return lt;
      });

      const pdf = await loadingTask.promise;
      const nextFile = {
        name,
        path: filePath || null,
        dir: filePath ? dirName(filePath) : null,
        size: size ?? data.length,
        data,
      };
      const key = documentKey(nextFile);
      const existing = !replace ? findTabByFile(tabsRef.current, nextFile) : null;
      if (existing) {
        switchToTab(existing.id);
        setStatusMessage(t('status.loaded', { name }));
        return;
      }

      if (replace) {
        const prev = sessionsRef.current.get(activeTabIdRef.current);
        const toDestroy = prev?.doc || liveDocRef.current;
        if (toDestroy && toDestroy !== pdf) {
          try { await toDestroy.destroy(); } catch { /* already gone */ }
        }
      } else if (activeTabIdRef.current && (liveFileRef.current || liveDocRef.current)) {
        parkCurrentTab();
      }

      setDoc(pdf);
      setFile(nextFile);
      setImages([]);
      setSearch({ query: '', results: [], busy: false, active: null });
      setActiveBookmark(null);
      setActiveComment(null);
      commentsKeyRef.current = null;
      setDocComments({ items: [], busy: false });
      setSelectionText('');

      setDocInfo(null);
      setOutline([]);
      const loadGen = ++docLoadGen.current;

      // Metadata and the outline are not needed to show page 1, and resolving
      // every outline destination costs a page lookup each — so both run after
      // the document is already on screen.
      (async () => {
        const patchParked = (partial) => {
          for (const [id, s] of sessionsRef.current) {
            if (s.doc === pdf) sessionsRef.current.set(id, { ...s, ...partial });
          }
        };
        try {
          const info = await getDocumentInfo(pdf);
          if (docLoadGen.current === loadGen) setDocInfo(info);
          else patchParked({ docInfo: info });
        } catch { /* properties stay empty */ }
        try {
          const raw = await getOutline(pdf);
          // Walk the tree, turning each destination into a page + in-page Y.
          const resolve = async (nodes) => {
            const out = [];
            for (const node of nodes) {
              const loc = node.dest ? await destToLocation(pdf, node.dest) : null;
              out.push({
                ...node,
                page: loc?.page ?? null,
                loc,
                items: node.items.length ? await resolve(node.items) : [],
              });
            }
            return out;
          };
          const nextOutline = await resolve(raw);
          if (docLoadGen.current === loadGen) setOutline(nextOutline);
          else patchParked({ outline: nextOutline });
        } catch { /* the document simply has no usable outline */ }
      })();

      // Restore either the saved workspace or the last session's position.
      let startPage = 1;
      if (restore) {
        history.reset(restore.workspace);
        startPage = Math.min(Math.max(1, restore.view?.page || 1), pdf.numPages);
        setPageNumber(startPage);
        setSettings((s) => ({
          ...s,
          zoomMode: restore.view?.zoomMode || s.zoomMode,
          zoom: restore.view?.zoom || s.zoom,
          rotation: restore.view?.rotation ?? s.rotation,
          pageLayout: restore.view?.pageLayout || s.pageLayout,
        }));
        setDirty(false);
        if (restore.workspaceFilePath) setWorkspacePath(restore.workspaceFilePath);
      } else {
        history.reset(EMPTY_WORKSPACE);
        setWorkspacePath(null);
        setDirty(false);
        const remembered = settings.rememberLastPage
          ? settings.recentFiles.find((f) => (f.path || f.name) === (filePath || name))?.page
          : null;
        startPage = Math.min(Math.max(1, remembered || 1), pdf.numPages);
        setPageNumber(startPage);
      }

      const tabId = (replace && activeTabIdRef.current) ? activeTabIdRef.current : newId();
      sessionsRef.current.set(tabId, {
        file: nextFile,
        doc: pdf,
        docInfo: null,
        pageNumber: startPage,
        scale: 1,
        outline: [],
        images: [],
        history: { state: restore?.workspace || EMPTY_WORKSPACE, past: [], future: [] },
        workspacePath: restore?.workspaceFilePath || (restore ? workspacePath : null) || null,
        dirty: false,
        search: { query: '', results: [], busy: false, active: null },
        activeBookmark: null,
        activeComment: null,
        docComments: { items: [], busy: false },
        selectedImage: null,
        selectionText: '',
        commentsKey: null,
        view: restore?.view || {
          zoomMode: settings.zoomMode,
          zoom: settings.zoom,
          rotation: settings.rotation,
          pageLayout: settings.pageLayout,
        },
      });
      const tabMeta = { id: tabId, key, name, path: filePath || '', dirty: false };
      if (replace && activeTabIdRef.current) {
        tabsRef.current = tabsRef.current.map((t) => (t.id === tabId ? tabMeta : t));
        setTabs(tabsRef.current);
      } else {
        tabsRef.current = [...tabsRef.current, tabMeta];
        setTabs(tabsRef.current);
        setActiveTabId(tabId);
        activeTabIdRef.current = tabId;
      }

      // Recent files / folders.
      setSettings((s) => ({
        ...s,
        recentFiles: addRecentFile(s.recentFiles, {
          path: filePath || null,
          name,
          dir: filePath ? dirName(filePath) : '',
          size: size ?? data.length,
          page: 1,
        }),
        recentDirs: filePath ? addRecentDir(s.recentDirs, dirName(filePath)) : s.recentDirs,
        lastDir: filePath ? dirName(filePath) : s.lastDir,
      }));

      setStatusMessage(t('status.loaded', { name }));
      toast(t('status.loaded', { name }), 'ok');
    } catch (err) {
      fail(err, 'open', { file: filePath || name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fail, history, parkCurrentTab, settings.rememberLastPage, settings.recentFiles,
    settings.pageLayout, settings.rotation, settings.zoom, settings.zoomMode, switchToTab,
    t, toast, withProgress, workspacePath]);

  const openViaDialog = useCallback(async () => {
    try {
      if (!isElectron) {
        const picked = await openFileDialog({ multi: true });
        const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
        for (const item of list) await openBytes(item);
        return;
      }
      // Ask for the path first — showing anything of our own beforehand only
      // delays the system dialog — then report progress while reading.
      const picked = await api.openPdfDialog({ defaultDir: settings.lastDir, multi: true });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      for (const filePath of paths) await openByPathRef.current(filePath);
    } catch (err) {
      fail(err, 'open');
    }
  }, [fail, openBytes, settings.lastDir]);

  const openByPath = useCallback(async (filePath) => {
    if (!filePath) return;
    try {
      const payload = await withProgress('opening', baseName(filePath), (onProgress) =>
        readPath(filePath, { onProgress }));
      await openBytes(payload);
    } catch (err) {
      fail(err, 'read', { file: filePath });
    }
  }, [fail, openBytes, withProgress]);

  const openByPathRef = useRef(openByPath);
  useEffect(() => { openByPathRef.current = openByPath; }, [openByPath]);

  const openFromUrl = useCallback(async (url) => {
    setPrompt({ open: false, kind: 'url', error: '' });
    try {
      const payload = await withProgress('downloading', url, (onProgress) =>
        downloadUrl(url, { onProgress }));
      await openBytes({ ...payload, path: null });
    } catch (err) {
      fail(err, 'download', { file: url });
    }
  }, [fail, openBytes, withProgress]);

  // Files handed over by the OS (file association / "Open with") and by a
  // second launch of the app.
  useEffect(() => {
    if (!isElectron || !settingsReady) return undefined;
    api.takePendingOpen().then((p) => { if (p) openByPath(p); }).catch(() => {});
    return api.onOpenPath(async (p) => {
      openByPath(p);
    });
  }, [settingsReady, openByPath]);

  // ── Saving the workspace ───────────────────────────────
  const workspaceJson = useCallback(() => serializeWorkspace({
    file,
    page: pageNumber,
    view: {
      zoomMode: settings.zoomMode,
      zoom: settings.zoomMode === 'custom' ? scale : settings.zoom,
      rotation: settings.rotation,
      pageLayout: settings.pageLayout,
    },
    workspace,
  }), [file, pageNumber, settings, scale, workspace]);

  const saveWorkspaceAs = useCallback(async () => {
    if (!doc) return false;
    try {
      const defaultName = `${(file?.name || 'document').replace(/\.pdf$/i, '')}.${WORKSPACE_EXT}`;
      const saved = await withProgress('saving', defaultName, (onProgress) => saveText({
        defaultName,
        defaultDir: settings.lastDir,
        content: workspaceJson(),
        filters: [{ name: 'MyPDFViewer Workspace', extensions: [WORKSPACE_EXT] }],
        onProgress,
      }));
      if (!saved) return false;
      setWorkspacePath(typeof saved === 'string' ? saved : null);
      setDirty(false);
      setStatusMessage(t('status.saved', { name: baseName(saved) }));
      toast(t('status.saved', { name: baseName(saved) }), 'ok');
      return true;
    } catch (err) {
      fail(err, 'workspace');
      return false;
    }
  }, [doc, file, fail, settings.lastDir, t, toast, withProgress, workspaceJson]);

  const saveWorkspace = useCallback(async () => {
    if (!doc) return false;
    if (!workspacePath || !isElectron) return saveWorkspaceAs();
    try {
      await withProgress('saving', baseName(workspacePath), async (onProgress) => {
        onProgress({ done: 0, total: 1 });
        await writeTextTo(workspacePath, workspaceJson());
        onProgress({ done: 1, total: 1 });
      });
      setDirty(false);
      setStatusMessage(t('status.saved', { name: baseName(workspacePath) }));
      toast(t('status.saved', { name: baseName(workspacePath) }), 'ok');
      return true;
    } catch (err) {
      fail(err, 'workspace', { file: workspacePath });
      return false;
    }
  }, [doc, fail, saveWorkspaceAs, t, toast, withProgress, workspaceJson, workspacePath]);

  const reloadAfterPdfSave = useCallback(async (bytes, filePath) => {
    await openBytes({
      data: bytes,
      name: filePath ? baseName(filePath) : (file?.name || 'document.pdf'),
      path: filePath || file?.path || null,
      size: bytes.length,
    }, {
      replace: true,
      restore: {
        workspace: {
          ...workspace,
          annotations: [],
          bookmarks: [],
          attachments: [],
        },
        view: {
          page: pageNumber,
          zoomMode: settings.zoomMode,
          zoom: settings.zoomMode === 'custom' ? scale : settings.zoom,
          rotation: settings.rotation,
          pageLayout: settings.pageLayout,
        },
      },
    });
    if (workspace.clips.length) setDirty(true);
  }, [file, openBytes, pageNumber, scale, settings, workspace]);

  const savePdfAs = useCallback(async () => {
    if (!doc || !file?.data) return false;
    try {
      const bytes = await withProgress('saving', file.name || 'document.pdf', async (onProgress) => {
        onProgress({ done: 0, total: 1 });
        const out = await writeWorkspaceIntoPdf(file.data, workspace);
        onProgress({ done: 1, total: 1 });
        return out;
      });
      const saved = await saveBinary({
        defaultName: suggestedPdfCopyName(file.name || 'document.pdf'),
        defaultDir: settings.lastDir,
        bytes,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!saved) return false;
      const nextPath = isElectron && typeof saved === 'string' ? saved : file.path;
      await reloadAfterPdfSave(bytes, nextPath);
      toast(t('status.savedPdf', { name: baseName(saved) }), 'ok');
      return true;
    } catch (err) {
      fail(err, 'pdf');
      return false;
    }
  }, [doc, fail, file, reloadAfterPdfSave, settings.lastDir, t, toast, withProgress, workspace]);

  const savePdf = useCallback(async () => savePdfAs(), [savePdfAs]);
  savePdfRef.current = savePdf;

  const askUnsaved = useCallback(() => {
    if (unsavedResolve.current) unsavedResolve.current('cancel');
    return new Promise((resolve) => {
      unsavedResolve.current = resolve;
      setUnsavedOpen(true);
    });
  }, []);

  const finishUnsaved = useCallback((choice) => {
    setUnsavedOpen(false);
    const resolve = unsavedResolve.current;
    unsavedResolve.current = null;
    resolve?.(choice);
  }, []);

  const leaveOrCancel = useCallback(async () => {
    if (!dirtyRef.current) return true;
    const choice = await askUnsaved();
    if (choice === 'cancel') return false;
    if (choice === 'save') return !!(await savePdfRef.current());
    return true;
  }, [askUnsaved]);
  leaveOrCancelRef.current = leaveOrCancel;

  const forceCloseApp = useCallback(() => {
    if (isElectron) api.win.forceClose();
    else window.close();
  }, []);

  const handleAppClose = useCallback(async () => {
    parkCurrentTab();
    if (anyTabDirty(tabsRef.current, dirtyRef.current, activeTabIdRef.current)) {
      const dirtyIds = [];
      if (dirtyRef.current && activeTabIdRef.current) dirtyIds.push(activeTabIdRef.current);
      for (const tab of tabsRef.current) {
        if (tab.dirty && tab.id !== activeTabIdRef.current) dirtyIds.push(tab.id);
      }
      const choice = await askUnsaved();
      if (choice === 'cancel') return;
      if (choice === 'save') {
        for (const id of dirtyIds) {
          if (id !== activeTabIdRef.current) switchToTab(id);
          if (!(await savePdfRef.current())) return;
        }
      }
    }
    for (const snap of sessionsRef.current.values()) {
      if (snap?.doc) {
        try { await snap.doc.destroy(); } catch { /* already gone */ }
      }
    }
    forceCloseApp();
  }, [askUnsaved, forceCloseApp, parkCurrentTab, switchToTab]);

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

  // ── Workspace edits (all undoable) ─────────────────────
  const editWorkspace = useCallback((updater, label) => {
    history.commit(updater, label);
    setDirty(true);
  }, [history]);

  const addClip = useCallback((clip, label) => {
    editWorkspace((w) => ({ ...w, clips: [{ id: newId(), at: Date.now(), ...clip }, ...w.clips].slice(0, 200) }), label);
  }, [editWorkspace]);

  // ── Copying ────────────────────────────────────────────
  const copyTextValue = useCallback(async (text, { warnIfEmpty = true } = {}) => {
    if (!text.trim()) {
      if (warnIfEmpty) toast(t('error.noSelection'), 'warn');
      return;
    }
    try {
      await copyText(text);
      addClip({ kind: 'text', page: pageNumber, content: text }, t('toolbar.copyText'));
      setStatusMessage(t('status.copiedChars', { n: text.length }));
      toast(t('status.copiedChars', { n: text.length }), 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [addClip, fail, pageNumber, t, toast]);

  const copySelection = useCallback(async (override) => {
    const text = pickCopyText(
      typeof override === 'string' ? override : '',
      selectionTextRef.current,
      window.getSelection()?.toString(),
    );
    await copyTextValue(text);
  }, [copyTextValue]);

  const onTextSelectionChange = useCallback((text) => {
    const next = text || '';
    selectionTextRef.current = next;
    setSelectionText(next);
    if (settings.autoCopyText && next.trim()) copyTextValue(next, { warnIfEmpty: false });
  }, [copyTextValue, settings.autoCopyText]);

  const copyPageText = useCallback(async () => {
    if (!doc) return;
    try {
      const page = await doc.getPage(pageNumber);
      const text = await getPageText(page);
      await copyText(text);
      addClip({ kind: 'text', page: pageNumber, content: text }, t('menu.copyPageText'));
      toast(t('status.copiedChars', { n: text.length }), 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [addClip, doc, fail, pageNumber, t, toast]);

  const copyCapture = useCallback(async ({ dataUrl, width, height }) => {
    try {
      await copyImage(dataUrl);
      setStatusMessage(t('status.copiedImage'));
      toast(`${t('status.copiedImage')} — ${width}×${height}`, 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [fail, t, toast]);

  // A dragged rectangle either opens the capture dialog (copy / save in any
  // format / keep as a clip) or is copied immediately, per the user's setting.
  const onRegionCapture = useCallback(async (shot) => {
    const keep = () => addClip(
      { kind: 'image', page: shot.page, content: shot.dataUrl, width: shot.width, height: shot.height },
      t('menu.copyAsImage')
    );
    if (settings.autoCopyRegion || settings.captureAction === 'copy') {
      await copyCapture(shot);
      keep();
      return;
    }
    // A finished rectangle offers its actions where it was released. The full
    // capture dialog — other formats, quality, a preview — is the last item, so
    // nothing that used to be reachable has gone away.
    setMenu({
      open: true,
      x: shot.clientX ?? 0,
      y: shot.clientY ?? 0,
      items: [
        { icon: IconCopy, label: t('menu.copyAsImage'), onClick: async () => { await copyCapture(shot); keep(); } },
        { icon: IconDownload, label: t('menu.saveImage'), onClick: () => saveImageItemRef.current?.(shot, 'area') },
        { icon: IconClip, label: t('capture.addClip'), onClick: keep },
        { separator: true },
        { icon: IconImage, label: t('capture.title'), onClick: () => setCapture(shot) },
      ],
    });
  }, [addClip, copyCapture, settings.autoCopyRegion, settings.captureAction, t]);

  // Reads the selected picture at its full embedded resolution, falling back to
  // a crop of the rendered page when the original bitmap cannot be decoded.
  const resolveImage = useCallback(async (sel) => {
    if (!doc || !sel) throw new Error(t('error.noSelection'));
    let dataUrl = null;
    let width = Math.round(sel.rect?.width || 0);
    let height = Math.round(sel.rect?.height || 0);
    try {
      const pdfPage = await doc.getPage(sel.page);
      dataUrl = await getImageDataUrl(pdfPage, sel.name || sel.id);
    } catch { dataUrl = null; }
    if (!dataUrl) {
      const canvas = viewRef.current?.getPageCanvas(sel.page);
      if (!canvas || !sel.rect) throw new Error('The picture could not be read from this page.');
      const shot = cropCanvas(canvas, sel.rect);
      return { dataUrl: shot.dataUrl, width: shot.width, height: shot.height, page: sel.page };
    }
    const probe = new Image();
    probe.src = dataUrl;
    if (probe.decode) {
      try { await probe.decode(); width = probe.naturalWidth; height = probe.naturalHeight; } catch { /* keep the rect size */ }
    }
    return { dataUrl, width, height, page: sel.page };
  }, [doc, t]);

  const copySelectedImage = useCallback(async (sel) => {
    try {
      const img = await resolveImage(sel);
      await copyImage(img.dataUrl);
      setStatusMessage(t('status.pickedImage', { w: img.width, h: img.height }));
      toast(t('status.pickedImage', { w: img.width, h: img.height }), 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [fail, resolveImage, t, toast]);

  // Clicking a picture selects it; copying, saving or keeping it is then offered
  // by the right-click menu, so nothing reaches the clipboard by surprise —
  // unless "copy on select" is turned on, which copies the click as well.
  const onImagePick = useCallback((hit) => {
    setSelectedImage(hit);
    setStatusMessage(hit
      ? t('status.imageSelected', { w: Math.round(hit.rect?.width || 0), h: Math.round(hit.rect?.height || 0) })
      : '');
    if (hit && settings.autoCopyImage) copySelectedImage(hit);
  }, [copySelectedImage, settings.autoCopyImage, t]);

  const keepSelectedImage = useCallback(async (sel) => {
    try {
      const img = await resolveImage(sel);
      addClip(
        { kind: 'image', page: img.page, content: img.dataUrl, width: img.width, height: img.height },
        t('menu.keepImage')
      );
      toast(t('capture.addClip'), 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [addClip, fail, resolveImage, t, toast]);

  // saveImageItem is defined further down; a ref keeps these menu handlers
  // free of declaration-order constraints.
  const saveImageItemRef = useRef(null);

  const saveSelectedImage = useCallback(async (sel) => {
    try {
      const img = await resolveImage(sel);
      await saveImageItemRef.current?.(img, 'picture');
    } catch (err) {
      fail(err, 'save');
    }
  }, [fail, resolveImage]);

  const copyImageItem = useCallback(async (im) => {
    try {
      await copyImage(im.dataUrl);
      toast(t('status.copiedImage'), 'ok');
    } catch (err) {
      fail(err, 'copy');
    }
  }, [fail, t, toast]);

  const dataUrlToBytes = (dataUrl) => {
    const base64 = dataUrl.split(',')[1] || '';
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  // Saves any captured/extracted image. The file type the user picks in the
  // save dialog decides the encoder, so PNG, JPEG, WebP, GIF and BMP all work
  // from the same flow.
  const saveImageItem = useCallback(async (im, prefix = 'image') => {
    const preferred = formatById(settings.captureFormat);
    const base = `${(file?.name || 'document').replace(/\.[^.]+$/, '')}-${prefix}-${im.width}x${im.height}`;
    try {
      let usedFormat = preferred;
      const saved = await withProgress('saving', `${base}.${preferred.ext}`, (onProgress) => saveEncoded({
        defaultName: `${base}.${preferred.ext}`,
        defaultDir: settings.lastDir,
        filters: saveFilters(preferred.id),
        fallbackExt: preferred.ext,
        onProgress,
        encode: async (ext) => {
          usedFormat = formatByExtension(ext) || preferred;
          return encodeImage(im.dataUrl, usedFormat.id, settings.captureQuality);
        },
      }));
      if (saved) {
        setStatusMessage(t('status.savedImage', { name: baseName(saved), format: usedFormat.label }));
        toast(t('status.savedImage', { name: baseName(saved), format: usedFormat.label }), 'ok');
      }
      return saved;
    } catch (err) {
      fail(err, 'save');
      return null;
    }
  }, [fail, file, settings.captureFormat, settings.captureQuality, settings.lastDir, t, toast, withProgress]);

  useEffect(() => { saveImageItemRef.current = saveImageItem; }, [saveImageItem]);

  const exportText = useCallback(async () => {
    if (!doc) return;
    try {
      const content = await withProgress('reading', file?.name || '', async (onProgress) => {
        let out = '';
        for (let p = 1; p <= doc.numPages; p++) {
          onProgress({ done: p, total: doc.numPages });
          const page = await doc.getPage(p);
          out += `\n\n===== ${t('common.page')} ${p} =====\n\n${await getPageText(page)}`;
          page.cleanup();
        }
        return out.trim();
      });
      const name = `${(file?.name || 'document').replace(/\.[^.]+$/, '')}.txt`;
      const saved = await withProgress('saving', name, (onProgress) => saveText({
        defaultName: name,
        defaultDir: settings.lastDir,
        content,
        filters: [{ name: 'Text', extensions: ['txt'] }],
        onProgress,
      }));
      if (saved) toast(t('status.saved', { name: baseName(saved) }), 'ok');
    } catch (err) {
      fail(err, 'save');
    }
  }, [doc, fail, file, settings.lastDir, t, toast, withProgress]);

  // ── Printing ───────────────────────────────────────────
  // On the desktop the original PDF goes to Chromium's PDF viewer and prints as
  // vector output; on the web the chosen pages are rasterised and printed from
  // a new window, because a browser cannot be told which pages to send.
  const printPages = useCallback(async ({ pages }) => {
    if (!doc || !file || !pages.length) return;
    setPrinting(true);
    try {
      if (isElectron) {
        await withProgress('printing', file.name, async (onProgress) => {
          const sheets = await renderPagesForPrint({
            doc, pages, rotation: settings.rotation, onProgress,
          });
          await api.printPages({ images: sheets.map((s) => s.bytes), title: file.name });
        });
      } else {
        await withProgress('printing', file.name, (onProgress) => printViaBrowser({
          doc,
          pages,
          rotation: settings.rotation,
          title: file.name,
          onProgress,
        }));
      }
      setShowPrint(false);
      setStatusMessage(t('status.printed', { n: pages.length }));
      toast(t('status.printed', { n: pages.length }), 'ok');
    } catch (err) {
      fail(err, 'print');
    } finally {
      setPrinting(false);
    }
  }, [doc, fail, file, settings.rotation, t, toast, withProgress]);

  // ── Images panel ───────────────────────────────────────
  const extractImages = useCallback(async (num) => {
    if (!doc) return;
    setExtracting(true);
    try {
      const found = await withProgress('extracting', `${t('common.page')} ${num}`, async (onProgress) => {
        const page = await doc.getPage(num);
        return extractPageImages(page, { minSize: settings.minImageSize, onProgress });
      });
      setImages(found.map((im) => ({ ...im, page: num })));
      setSettings((s) => ({ ...s, sidebar: 'images' }));
      if (!found.length) toast(t('side.noImages'), 'warn');
      else setStatusMessage(`${found.length} × ${t('side.images')}`);
    } catch (err) {
      fail(err, 'images');
    } finally {
      setExtracting(false);
    }
  }, [doc, fail, settings.minImageSize, t, toast, withProgress]);

  // ── Search ─────────────────────────────────────────────
  const runSearch = useCallback(async (query) => {
    if (!doc) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearch({ query, results: [], busy: true, active: null });
    try {
      const results = await searchDocument(doc, query, { signal: controller.signal });
      setSearch({ query, results, busy: false, active: null });
      setStatusMessage(t('side.results', { count: results.length }));
    } catch (err) {
      setSearch({ query, results: [], busy: false, active: null });
      fail(err, 'search');
    }
  }, [doc, fail, t]);

  // ── Annotations / bookmarks ────────────────────────────
  const applyHighlight = useCallback((sel) => {
    if (!sel?.rects?.length) { toast(t('error.noSelection'), 'warn'); return; }
    const annots = sel.rects.map((rect) => ({
      id: newId(), page: sel.page, kind: 'highlight', rect, color: HIGHLIGHT_COLOR,
      text: String(sel.text || '').slice(0, 200),
    }));
    editWorkspace((w) => ({ ...w, annotations: [...w.annotations, ...annots] }), t('toolbar.highlight'));
    viewRef.current?.clearSelection();
  }, [editWorkspace, t, toast]);

  const addHighlight = useCallback(() => {
    applyHighlight(viewRef.current?.getSelectionRects());
  }, [applyHighlight]);

  const addComment = useCallback((sel) => {
    const shot = sel?.rects?.length ? sel : viewRef.current?.getSelectionRects();
    if (!shot?.rects?.length) { toast(t('error.noSelection'), 'warn'); return; }
    commentDraft.current = shot;
    setPrompt({ open: true, kind: 'comment', error: '' });
  }, [t, toast]);

  const saveComment = useCallback((text) => {
    const shot = commentDraft.current;
    commentDraft.current = null;
    setPrompt({ open: false, kind: 'comment', error: '' });
    if (!shot?.rects?.length || !String(text || '').trim()) return;
    const note = {
      id: newId(),
      page: shot.page,
      kind: 'note',
      rect: shot.rects[0],
      rects: shot.rects,
      color: 'rgba(255, 196, 0, 0.42)',
      text: String(text).trim(),
    };
    editWorkspace((w) => ({ ...w, annotations: [...w.annotations, note] }), t('menu.comment'));
    viewRef.current?.clearSelection();
    setActiveComment({ id: note.id, stamp: Date.now() });
    setSettings((s) => ({ ...s, sidebar: 'comments' }));
    toast(t('menu.comment'), 'ok');
  }, [editWorkspace, t, toast]);

  const addBookmark = useCallback((textOverride, selectionOverride) => {
    if (!doc) return;
    const selection = selectionOverride?.rects?.length
      ? selectionOverride
      : viewRef.current?.getSelectionRects();
    const label = bookmarkLabel(
      pickCopyText(
        typeof textOverride === 'string' ? textOverride : '',
        selection?.text,
        selectionTextRef.current,
      ),
      `${t('common.page')} ${pageNumber}`,
    );
    const rec = bookmarkRecord({
      page: pageNumber,
      label,
      selection,
      viewY: viewRef.current?.getVisibleFracY?.(pageNumber),
    });
    const id = newId();
    editWorkspace((w) => ({ ...w, bookmarks: [...w.bookmarks, { id, ...rec }] }), t('menu.addBookmark'));
    setActiveBookmark({ id, stamp: Date.now() });
    setSettings((s) => ({ ...s, sidebar: 'bookmarks' }));
    toast(`${t('menu.addBookmark')} — ${label}`, 'ok');
  }, [doc, editWorkspace, pageNumber, t, toast]);

  const attachFile = useCallback(async () => {
    if (!doc) return;
    try {
      const picked = await pickAnyFile();
      if (!picked) return;
      if (picked.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Attachment is larger than ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`);
      }
      const rec = attachmentRecord({
        page: pageNumber,
        name: picked.name,
        mime: picked.mime,
        bytes: picked.data,
        y: viewRef.current?.getVisibleFracY?.(pageNumber) ?? 0.08,
      });
      editWorkspace(
        (w) => ({ ...w, attachments: [...(w.attachments || []), { id: newId(), ...rec }] }),
        t('menu.attachFile'),
      );
      setSettings((s) => ({ ...s, sidebar: 'comments' }));
      toast(t('status.attached', { name: picked.name }), 'ok');
    } catch (err) {
      fail(err, 'attach');
    }
  }, [doc, editWorkspace, fail, pageNumber, t, toast]);

  const saveAttachment = useCallback(async (item) => {
    const name = item?.filename || item?.name || 'attachment';
    const raw = item?.fileData || item?.data;
    const bytes = raw instanceof Uint8Array ? raw : base64ToBytes(raw);
    if (!bytes.length) return;
    try {
      const saved = await saveBinary({
        defaultName: name,
        defaultDir: settings.lastDir,
        bytes,
      });
      if (saved) toast(t('status.saved', { name: baseName(saved) }), 'ok');
    } catch (err) {
      fail(err, 'save');
    }
  }, [fail, settings.lastDir, t, toast]);

  // ── View controls ──────────────────────────────────────
  const goToPage = useCallback((n, loc) => {
    if (!doc) return;
    const clamped = clampPage(n, doc.numPages);
    setPageNumber(clamped);
    viewRef.current?.scrollToPage(clamped, 'smooth', loc || null);
  }, [doc]);

  const goToBookmark = useCallback((b) => {
    if (!b) return;
    setActiveBookmark({ id: b.id, stamp: Date.now() });
    goToPage(b.page, { fracY: bookmarkAnchorY(b) });
  }, [goToPage]);

  const goToComment = useCallback((c) => {
    if (!c) return;
    setActiveComment({ id: c.id, page: c.page, stamp: Date.now() });
    goToPage(c.page, { fracY: commentAnchorY(c) });
  }, [goToPage]);

  const commentItems = useMemo(
    () => mergeCommentList(docComments.items, workspace.annotations, workspace.attachments),
    [docComments.items, workspace.annotations, workspace.attachments],
  );

  useEffect(() => {
    if (!doc || settings.sidebar !== 'comments') return undefined;
    const key = `${file?.path || file?.name || ''}:${file?.size || 0}:${doc.numPages}`;
    if (commentsKeyRef.current === key) return undefined;
    commentsKeyRef.current = key;
    let cancelled = false;
    setDocComments({ items: [], busy: true });
    getDocumentComments(doc)
      .then((items) => { if (!cancelled) setDocComments({ items, busy: false }); })
      .catch(() => { if (!cancelled) setDocComments({ items: [], busy: false }); });
    return () => { cancelled = true; };
  }, [doc, file?.path, file?.name, file?.size, settings.sidebar]);

  const goToSearchHit = useCallback((hit) => {
    if (!hit) return;
    setSearch((s) => ({
      ...s,
      active: {
        page: hit.page,
        index: hit.index,
        pageHit: pageOccurrence(s.results, hit),
        stamp: Date.now(),
      },
    }));
    goToPage(hit.page);
  }, [goToPage]);

  const followLink = useCallback(async (link) => {
    if (!link) return;
    if (link.url) {
      try { await openExternal(link.url); }
      catch (err) { fail(err, 'open'); }
      return;
    }
    const named = namedActionPage(link.action, pageNumber, doc?.numPages || 1);
    if (named) { goToPage(named); return; }
    if (link.dest && doc) {
      try {
        const loc = await destToLocation(doc, link.dest);
        if (loc?.page) goToPage(loc.page, loc);
      } catch (err) { fail(err, 'open'); }
    }
  }, [doc, fail, goToPage, pageNumber]);

  const changeZoom = useCallback((dir) => {
    setSettings((s) => {
      const current = s.zoomMode === 'custom' ? s.zoom : scale;
      return { ...s, zoomMode: 'custom', zoom: nextZoom(current, dir) };
    });
  }, [scale]);

  const rotate = useCallback((delta) => {
    setSettings((s) => ({ ...s, rotation: normalizeRotation(s.rotation + delta) }));
  }, []);

  // ── Recent files ───────────────────────────────────────
  const openRecent = useCallback(async (entry) => {
    if (!entry.path) { toast(t('recent.missing'), 'warn'); return; }
    if (isElectron && !(await pathExists(entry.path))) {
      fail(new Error(`${t('recent.missing')}:\n${entry.path}`), 'read', { file: entry.path });
      setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, entry.path) }));
      return;
    }
    openByPath(entry.path);
  }, [fail, openByPath, t, toast]);

  // Remember where we left each document.
  useEffect(() => {
    if (!file || !settings.rememberLastPage) return;
    setSettings((s) => ({
      ...s,
      recentFiles: s.recentFiles.map((f) => (
        (f.path || f.name) === (file.path || file.name) ? { ...f, page: pageNumber } : f
      )),
      lastSession: { path: file.path, page: pageNumber },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, file]);

  // ── Window title ───────────────────────────────────────
  useEffect(() => {
    const title = windowTitle(file?.name, dirty);
    document.title = title;
    if (isElectron) api.win.setTitle(title).catch(() => {});
  }, [file, dirty]);

  // ── Keyboard shortcuts ─────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openViaDialog(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); savePdf(); return; }
      if (mod && e.key.toLowerCase() === 'w') {
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
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault(); history.redo(); return;
      }
      if (mod && e.key.toLowerCase() === 'c' && !inField) { e.preventDefault(); copySelection(); return; }
      if (mod && e.key.toLowerCase() === 'a' && !inField) {
        e.preventDefault();
        viewRef.current?.selectPageText(pageNumber);
        return;
      }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); if (doc) setShowPrint(true); return; }
      if (mod && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        // Cycle text → image → region → text.
        setTool(cycleTool(tool));
        return;
      }
      if (mod && e.key === '1') { e.preventDefault(); setTool('text'); return; }
      if (mod && e.key === '2') { e.preventDefault(); setTool('image'); return; }
      if (mod && e.key === '3') { e.preventDefault(); setTool('region'); return; }
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSettings((s) => ({ ...s, sidebar: 'search' }));
        setTimeout(() => document.querySelector('[data-search-input]')?.focus(), 60);
        return;
      }
      if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); changeZoom(1); return; }
      if (mod && e.key === '-') { e.preventDefault(); changeZoom(-1); return; }
      if (mod && e.key === '0') { e.preventDefault(); setSettings((s) => ({ ...s, zoomMode: 'actual' })); return; }
      if (e.key === 'F9') { e.preventDefault(); setSettings((s) => ({ ...s, sidebar: nextSidebar(s.sidebar) })); return; }
      if (inField) return;
      if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !mod)) { goToPage(pageNumber + 1); }
      else if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !mod)) { goToPage(pageNumber - 1); }
      else if (e.key === 'Home' && mod) { goToPage(1); }
      else if (e.key === 'End' && mod) { goToPage(doc?.numPages || 1); }
      else if (e.key === 'Escape') {
        if (selectedImage) setSelectedImage(null);
        else if (tool !== 'text') setTool('text');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeZoom, closeTab, copySelection, doc, goToPage, history, openViaDialog, pageNumber,
    savePdf, selectedImage, setTool, switchToTab, tool]);

  // ── Drag & drop ────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = [...(e.dataTransfer?.files || [])];
    if (!dropped.length) return;
    try {
      for (const item of dropped) {
        if (isElectron && item.path) { await openByPath(item.path); continue; }
        const buf = await item.arrayBuffer();
        await openBytes({
          data: new Uint8Array(buf), name: item.name, path: null, size: item.size,
        });
      }
    } catch (err) {
      fail(err, 'open', { file: dropped[0]?.name });
    }
  }, [fail, openByPath, openBytes]);

  // ── Context menu ───────────────────────────────────────
  const closeContextMenu = useCallback(() => {
    setMenu((m) => (m.open ? { ...m, open: false } : m));
  }, []);

  const openContextMenu = useCallback((e, ctx = {}) => {
    e.preventDefault();
    // Snapshot now. Clicking a menu item collapses the live range, so Copy /
    // Highlight / Bookmark must not read window.getSelection() later.
    const snapText = pickCopyText(
      ctx.selectionText,
      selectionTextRef.current,
      selectionText,
      window.getSelection()?.toString(),
    );
    const hasSel = !!snapText;
    const highlightShot = viewRef.current?.getSelectionRects()
      || (hasSel ? { page: pageNumber, text: snapText, rects: [] } : null);

    // A right-click straight onto a picture selects it and acts on that one.
    const picked = ctx.imageHit ? { page: ctx.page, ...ctx.imageHit } : selectedImage;
    if (ctx.imageHit) setSelectedImage(picked);

    const imageItems = picked ? [
      { icon: IconCopy, label: t('menu.copyImage'), onClick: () => copySelectedImage(picked) },
      { icon: IconDownload, label: t('menu.saveImage'), onClick: () => saveSelectedImage(picked) },
      { icon: IconClip, label: t('menu.keepImage'), onClick: () => keepSelectedImage(picked) },
      { icon: IconClose, label: t('menu.deselectImage'), onClick: () => setSelectedImage(null) },
      { separator: true },
    ] : [];

    const items = [
      ...imageItems,
      { icon: IconCopy, label: t('menu.copySelection'), onClick: () => copySelection(snapText), disabled: !hasSel },
      { icon: IconHighlight, label: t('menu.highlight'), onClick: () => applyHighlight(highlightShot), disabled: !hasSel || !highlightShot?.rects?.length },
      { icon: IconComment, label: t('menu.comment'), onClick: () => addComment(highlightShot), disabled: !hasSel || !highlightShot?.rects?.length },
      { icon: IconSelectAll, label: t('menu.selectAll'), onClick: () => viewRef.current?.selectPageText(pageNumber), disabled: !doc },
      { icon: IconCopy, label: t('menu.copyPageText'), onClick: () => copyPageText(), disabled: !doc },
      { separator: true },
      { icon: IconSelectText, label: t('menu.textTool'), onClick: () => setTool('text'), disabled: !doc },
      { icon: IconImage, label: t('menu.imageTool'), onClick: () => setTool('image'), disabled: !doc },
      { icon: IconMarquee, label: t('menu.regionTool'), onClick: () => setTool('region'), disabled: !doc },
      { icon: IconImage, label: t('toolbar.images'), onClick: () => extractImages(pageNumber), disabled: !doc },
      { icon: IconBookmark, label: t('menu.addBookmark'), onClick: () => addBookmark(snapText, highlightShot), disabled: !doc },
      { icon: IconClip, label: t('menu.attachFile'), onClick: () => attachFile(), disabled: !doc },
      { separator: true },
      { icon: IconPrev, label: t('menu.prev'), onClick: () => goToPage(pageNumber - 1), disabled: !doc || pageNumber <= 1 },
      { icon: IconNext, label: t('menu.next'), onClick: () => goToPage(pageNumber + 1), disabled: !doc || pageNumber >= (doc?.numPages || 1) },
      { icon: IconZoomIn, label: t('menu.zoomIn'), onClick: () => changeZoom(1), disabled: !doc },
      { icon: IconZoomOut, label: t('menu.zoomOut'), onClick: () => changeZoom(-1), disabled: !doc },
      { icon: IconFitWidth, label: t('menu.fitWidth'), onClick: () => setSettings((s) => ({ ...s, zoomMode: 'fit-width' })), disabled: !doc },
      { icon: IconRotateRight, label: t('menu.rotate'), onClick: () => rotate(90), disabled: !doc },
    ];
    setMenu({ open: true, x: e.clientX, y: e.clientY, items });
  }, [addBookmark, addComment, applyHighlight, attachFile, changeZoom, copyPageText, copySelection, copySelectedImage, doc, extractImages,
    goToPage, keepSelectedImage, pageNumber, rotate, saveSelectedImage, selectedImage, selectionText, setTool, t]);

  // ── Derived ────────────────────────────────────────────
  const titleText = useMemo(
    () => (file ? `${file.name}${dirty ? ' •' : ''}` : t('app.untitled')),
    [file, dirty, t]
  );

  const changeLang = useCallback((lng) => {
    const current = String(i18n.language || '').startsWith('ko') ? 'ko' : 'en';
    const next = lng === 'ko' || lng === 'en' ? lng : (current === 'ko' ? 'en' : 'ko');
    setLanguage(next);
    setSettings((s) => ({ ...s, lang: next }));
  }, []);

  const applySettings = useCallback((next) => {
    if (next.lang !== settings.lang) setLanguage(next.lang);
    setSettings(next);
  }, [settings.lang]);

  return (
    <div
      className="app"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <TitleBar title={titleText} />

      <Toolbar
        settings={settings}
        doc={doc}
        pageNumber={pageNumber}
        numPages={doc?.numPages || 0}
        scale={scale}
        hasSelection={!!selectionText}
        dirty={dirty}
        history={history}
        tool={tool}
        onTool={setTool}
        panel={settings.sidebar}
        onOpen={openViaDialog}
        onOpenUrl={() => setPrompt({ open: true, kind: 'url', error: '' })}
        onOpenRecent={openRecent}
        onRemoveRecent={(key) => setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, key) }))}
        onClearRecent={() => setSettings((s) => ({ ...s, recentFiles: [] }))}
        onSave={savePdf}
        onSaveAs={savePdfAs}
        onSaveWorkspace={saveWorkspace}
        onSaveWorkspaceAs={saveWorkspaceAs}
        onAttachFile={attachFile}
        onCopyText={copySelection}
        onSelectPage={() => viewRef.current?.selectPageText(pageNumber)}
        onExtractImages={extractImages}
        onExportText={exportText}
        onHighlight={addHighlight}
        onComment={addComment}
        onComments={() => setSettings((s) => ({ ...s, sidebar: s.sidebar === 'comments' ? 'none' : 'comments' }))}
        onBookmarks={() => setSettings((s) => ({ ...s, sidebar: s.sidebar === 'bookmarks' ? 'none' : 'bookmarks' }))}
        onBookmark={addBookmark}
        onGoToPage={goToPage}
        onZoom={changeZoom}
        onZoomMode={(mode) => setSettings((s) => ({ ...s, zoomMode: mode, zoom: mode === 'custom' ? scale : s.zoom }))}
        onRotate={rotate}
        onLayout={() => setSettings((s) => ({ ...s, pageLayout: s.pageLayout === 'single' ? 'continuous' : 'single' }))}
        onSearch={() => {
          setSettings((s) => ({
            ...s,
            sidebar: s.sidebar === 'search' ? 'none' : 'search',
          }));
          setTimeout(() => document.querySelector('[data-search-input]')?.focus(), 60);
        }}
        onTogglePanel={() => setSettings((s) => ({ ...s, sidebar: s.sidebar === 'none' ? 'thumbnails' : 'none' }))}
        onTheme={(id) => setSettings((s) => ({ ...s, theme: id }))}
        onLang={changeLang}
        onSettings={() => setShowSettings(true)}
        onAbout={() => setShowAbout(true)}
        onPrint={() => setShowPrint(true)}
      />

      <div className="workarea">
        <Sidebar
          panel={settings.sidebar}
          width={settings.sidebarWidth}
          onResize={(w) => setSettings((s) => ({ ...s, sidebarWidth: clampSidebarWidth(w) }))}
          onPanel={(p) => setSettings((s) => ({ ...s, sidebar: p }))}
          doc={doc}
          pageNumber={pageNumber}
          onGoToPage={goToPage}
          outline={outline}
          images={images}
          onExtractImages={extractImages}
          extracting={extracting}
          search={{ ...search, run: runSearch }}
          onGoToSearchHit={goToSearchHit}
          bookmarks={workspace.bookmarks}
          activeBookmarkId={activeBookmark?.id}
          onGoToBookmark={goToBookmark}
          comments={commentItems}
          commentsBusy={docComments.busy}
          activeCommentId={activeComment?.id}
          onGoToComment={goToComment}
          onAddComment={addComment}
          onAttachFile={attachFile}
          onSaveAttachment={saveAttachment}
          onRemoveComment={(id) => editWorkspace(
            (w) => ({
              ...w,
              annotations: w.annotations.filter((a) => a.id !== id),
              attachments: (w.attachments || []).filter((a) => a.id !== id),
            }),
            t('common.delete')
          )}
          clips={workspace.clips}
          onCopyImage={copyImageItem}
          onSaveImage={(im) => saveImageItem(im, 'extracted')}
          onRemoveBookmark={(id) => editWorkspace(
            (w) => ({ ...w, bookmarks: w.bookmarks.filter((b) => b.id !== id) }),
            t('common.delete')
          )}
          onCopyClip={async (c) => {
            try {
              if (c.kind === 'image') await copyImage(c.content);
              else await copyText(c.content);
              toast(t('status.copied'), 'ok');
            } catch (err) { fail(err, 'copy'); }
          }}
          onSaveClip={async (c) => {
            if (c.kind === 'image') await saveImageItem(c, 'clip');
            else {
              try {
                const saved = await saveText({
                  defaultName: `clip-p${c.page}.txt`,
                  defaultDir: settings.lastDir,
                  content: c.content,
                  filters: [{ name: 'Text', extensions: ['txt'] }],
                });
                if (saved) toast(t('status.saved', { name: baseName(saved) }), 'ok');
              } catch (err) { fail(err, 'save'); }
            }
          }}
          onRemoveClip={(id) => editWorkspace(
            (w) => ({ ...w, clips: w.clips.filter((c) => c.id !== id) }),
            t('common.delete')
          )}
          folderRoot={settings.folderRoot}
          currentFilePath={file?.path || ''}
          desktop={isElectron}
          onPickFolder={async () => {
            const picked = await pickDirectory(settings.folderRoot || settings.lastDir);
            if (!picked) return;
            setSettings((s) => ({
              ...s,
              folderRoot: picked,
              lastDir: picked,
              recentDirs: addRecentDir(s.recentDirs, picked),
              sidebar: 'folders',
            }));
          }}
          onOpenFolderFile={openByPath}
          loadFolder={listDirectory}
        />

        <main className={`viewer${dragOver ? ' dragging' : ''}`}>
          <TabBar
            tabs={tabs}
            activeId={activeTabId}
            onSelect={switchToTab}
            onClose={closeTab}
          />
          <PdfView
            key={activeTabId || 'empty'}
            ref={viewRef}
            doc={doc}
            pageNumber={pageNumber}
            onPageChange={setPageNumber}
            zoomMode={settings.zoomMode}
            zoom={settings.zoom}
            rotation={settings.rotation}
            layout={settings.pageLayout}
            invert={settings.invertPages}
            annotations={[...workspace.annotations, ...(workspace.attachments || [])]}
            tool={tool}
            onRegionCapture={onRegionCapture}
            onImagePick={onImagePick}
            selectedImage={selectedImage}
            onSelectionChange={onTextSelectionChange}
            autoCopyText={settings.autoCopyText}
            onContextMenu={openContextMenu}
            onScaleChange={setScale}
            onZoomStep={changeZoom}
            onError={fail}
            outline={outline}
            onFollowLink={followLink}
            onGoToPage={goToPage}
            searchQuery={search.query}
            searchActive={search.active}
            bookmarks={workspace.bookmarks}
            activeBookmarkId={activeBookmark?.id}
            activeCommentId={activeComment?.id}
            emptyState={(
              <div className="welcome">
                <img src="./icon.svg" alt="" width="120" height="120" />
                <h2>{t('common.welcome')}</h2>
                <p>{t('common.welcomeHint')}</p>
                <button className="btn primary" onClick={openViaDialog} title={t('tip.open')}>
                  {t('toolbar.open')}
                </button>
              </div>
            )}
          />
          {dragOver ? <div className="dropzone">{t('common.dropHere')}</div> : null}
        </main>
      </div>

      {settings.showStatusBar ? (
        <StatusBar
          file={file}
          doc={doc}
          pageNumber={pageNumber}
          scale={scale}
          selectionChars={selectionText.length}
          dirty={dirty}
          history={history}
          message={statusMessage}
          busy={!!task || extracting || search.busy}
        />
      ) : null}

      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        items={menu.items}
        onClose={closeContextMenu}
      />

      <SettingsDialog
        open={showSettings}
        settings={settings}
        onChange={applySettings}
        onClose={() => setShowSettings(false)}
        onClearRecent={() => setSettings((s) => ({ ...s, recentFiles: [] }))}
        onRemoveRecent={(key) => setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, key) }))}
        onClearDirs={() => setSettings((s) => ({ ...s, recentDirs: [] }))}
        onReset={() => {
          const kept = { recentFiles: settings.recentFiles, recentDirs: settings.recentDirs, lastDir: settings.lastDir };
          applySettings({ ...DEFAULT_SETTINGS, ...kept });
          toast(t('settings.done'), 'ok');
        }}
      />

      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />

      <PropertiesDialog
        open={showProps}
        doc={doc ? { ...file, numPages: doc.numPages, info: docInfo } : null}
        onClose={() => setShowProps(false)}
      />

      <UnsavedDialog
        open={unsavedOpen}
        onSave={() => finishUnsaved('save')}
        onDiscard={() => finishUnsaved('discard')}
        onCancel={() => finishUnsaved('cancel')}
      />

      <PromptDialog
        open={prompt.open}
        kind={prompt.kind}
        error={prompt.error}
        onClose={() => {
          if (prompt.kind === 'password') passwordRetry.current = null;
          if (prompt.kind === 'comment') commentDraft.current = null;
          setPrompt({ open: false, kind: prompt.kind, error: '' });
        }}
        onSubmit={(value) => {
          if (prompt.kind === 'url') { openFromUrl(value); return; }
          if (prompt.kind === 'comment') { saveComment(value); return; }
          setPrompt({ open: false, kind: 'password', error: '' });
          try { passwordRetry.current?.(value); } catch (err) { fail(err, 'open'); }
        }}
      />

      <CaptureDialog
        capture={capture}
        settings={settings}
        onChange={setSettings}
        onCopy={copyCapture}
        onSave={async (shot) => {
          const saved = await saveImageItem(shot, 'capture');
          if (saved) setCapture(null);
        }}
        onAddClip={(shot) => {
          addClip(
            { kind: 'image', page: shot.page, content: shot.dataUrl, width: shot.width, height: shot.height },
            t('menu.copyAsImage')
          );
          setCapture(null);
          toast(t('capture.addClip'), 'ok');
        }}
        onClose={() => setCapture(null)}
      />

      <PrintDialog
        open={showPrint}
        doc={doc}
        numPages={doc?.numPages || 0}
        pageNumber={pageNumber}
        rotation={settings.rotation}
        settings={settings}
        onChange={setSettings}
        onPrint={printPages}
        onClose={() => setShowPrint(false)}
        busy={printing}
      />

      <ProgressDialog task={task} />
      <ErrorDialog error={error} onClose={() => setError(null)} />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
      <Tooltip />
    </div>
  );
}

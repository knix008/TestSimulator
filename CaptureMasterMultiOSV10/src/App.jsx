import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { platform, isDesktop, isTauri, onProgress, newTaskId, emitProgress } from './lib/platform.js';
import { normalizeSettings, addRecent, removeRecent, imageFormatByExt, imageFormatsFor, micOptions } from './lib/settings.js';
import { applyTheme, applyFont, appearanceOf, themeById, nextThemeId, themeLabel } from './themes.js';
import { push as hPush, undo as hUndo, redo as hRedo, canUndo, canRedo } from './lib/history.js';
import {
  createImageDocument, createVideoDocument, isDirty, serializeCapture, parseCapture,
  kindForPath, nameOf, dirOf, stripExt, stampName, extOf, CAPTURE_EXT, IMAGE_EXTS, NATIVE_DECODE_EXTS, VIDEO_EXTS, newId,
} from './lib/document.js';
import { loadImage, bytesToDataUrl, dataUrlToBytes, normalizeToPng, cropImage, eraseRect, canvasToBlob, mimeForExt } from './lib/image.js';
import { renderToCanvas, drawAnnotation, moveAnnotation, boundsOf, measureText, preloadPictures } from './lib/render.js';
import { grabSourceFrame, startRecording as startRecorder, startGifRecording, supportedVideoFormats, pickVideoFormat } from './lib/capture.js';
import { describeError } from './lib/errors.js';
import { formatBytes, formatDuration } from './lib/format.js';

import { TitleBar, Tabs, StatusBar, Welcome } from './components/chrome.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { Editor, nextZoom, ZOOM_MIN, ZOOM_MAX } from './components/Editor.jsx';
import { VideoView, videoFrameDataUrl, videoControl, SPEEDS, SKIP } from './components/VideoView.jsx';
import { TooltipLayer, ContextMenu, Dropdown, ToastHost, useToasts } from './components/common.jsx';
import { Icon } from './components/Icons.jsx';
import { InPageDialogs, baseName } from './DialogHost.jsx';
import { MenuContent, themeMenuPayload, recentMenuPayload, itemsMenuPayload } from './components/Menus.jsx';
import { nativePopups, showPopup, anchorOf } from './lib/popupMenu.js';
import { HistoryPanel } from './components/HistoryPanel.jsx';
import { ToolPanel } from './components/ToolPanel.jsx';
import { SELECTION_SHAPES, SHAPE_ICON, selectionShape, maskToSelection } from './lib/selection.js';
import { installFallbackMenu } from './lib/contextMenu.js';
import { loadHistory, saveHistory, addEntry, removeEntry, thumbnailOf, videoThumbnail } from './lib/captureHistory.js';

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
// On Windows hideApp already waits for DWM to recompose without our windows.
const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform);
const HIDE_SETTLE_MS = isTauri && isWindows ? 30 : isMac ? 450 : 320;
/** Narrowest editor area the side panels must leave (CSS px). */
const EDITOR_MIN_W = 480;

function readFileAsBytes(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result));
    r.onerror = () => reject(new Error('Could not read ' + file.name));
    r.readAsArrayBuffer(file);
  });
}

// Poster frame of a video file that is not currently displayed (for printing).
function videoPosterFrame(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = url;
    v.onerror = () => reject(new Error('Video could not be decoded: ' + url));
    v.onloadeddata = () => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    v.load();
  });
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

export default function App() {
  const { t, i18n } = useTranslation();

  // ── State ──
  const [settings, setSettings] = useState(() => normalizeSettings(null));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [info, setInfo] = useState({});
  const [docs, setDocs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tool, setTool] = useState('select');
  const [recording, setRecording] = useState(null);
  const [capturing, setCapturing] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [message] = useState('');
  const [ctxMenu, setCtxMenu] = useState(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [webMenu, setWebMenu] = useState(null);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [toasts, toast] = useToasts();
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [missing, setMissing] = useState(() => new Set());
  // History entry id → the tab it was opened in (this session only).
  const entryDocs = useRef(new Map());

  const editorRef = useRef(null);
  const mainRef = useRef(null);
  const recentAnchorRef = useRef(null);
  const settingsRef = useRef(settings);
  const docsRef = useRef(docs);
  const activeRef = useRef(activeId);
  const recordingRef = useRef(null);
  const pending = useRef(new Map());
  const handlers = useRef({});
  const saveTimer = useRef(null);
  const panelOpenRef = useRef(null);
  settingsRef.current = settings;
  docsRef.current = docs;
  activeRef.current = activeId;

  const active = useMemo(() => docs.find((d) => d.id === activeId) || null, [docs, activeId]);

  const toolProps = useMemo(() => ({
    color: settings.annotation.color,
    strokeWidth: settings.annotation.strokeWidth,
    fill: settings.annotation.fill,
    font: { family: settings.annotation.fontFamily, size: settings.annotation.fontSize, bold: settings.annotation.bold, italic: settings.annotation.italic },
  }), [settings.annotation]);
  const toolPropsRef = useRef(toolProps);
  toolPropsRef.current = toolProps;

  // ── Dialog windows: open → promise of the result ──
  const appearance = useCallback(() => appearanceOf(settingsRef.current), []);

  const ask = useCallback((name, payload) => new Promise((resolve) => {
    pending.current.set(name, resolve);
    platform.dialogs.open(name, { ...payload, appearance: appearance() });
  }), [appearance]);

  useEffect(() => {
    const offR = platform.dialogs.onResult(({ name, data }) => {
      const r = pending.current.get(name);
      if (r) { pending.current.delete(name); r(data); }
      const base = baseName(name);
      if (base === 'recorder' && data && handlers.current.recorderAction) handlers.current.recorderAction(data.action);
      if (base === 'settings' && data && handlers.current.settingsMessage) handlers.current.settingsMessage(data);
    });
    const offC = platform.dialogs.onClosed(({ name }) => {
      const r = pending.current.get(name);
      if (r) { pending.current.delete(name); r(null); }
    });
    return () => { offR(); offC(); };
  }, []);

  const reportError = useCallback((err, context) => {
    const error = describeError(err, context);
    console.error('[CaptureMaster]', context, err);
    platform.dialogs.open(`error#${newId('e')}`, { title: t('error.title'), error, info, appearance: appearance() });
  }, [appearance, info, t]);

  useEffect(() => {
    const onErr = (e) => { if (e.error) reportError(e.error, t('error.unexpected')); };
    const onRej = (e) => { reportError(e.reason || new Error('Unhandled rejection'), t('error.unexpected')); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    // Exceptions in the main process are shown the same way.
    const offMain = platform.onMainError((e) => reportError(Object.assign(new Error(e.message), { stack: e.stack, name: e.name }), e.context || 'main process'));
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); offMain(); };
  }, [reportError, t]);

  const confirm = useCallback((payload) => ask(`confirm#${newId('c')}`, payload), [ask]);

  /**
   * Runs `fn(taskId)` and shows a progress window if it takes longer than a
   * moment. Progress ticks (from the main process or emitProgress) with the
   * same task id update the window.
   */
  const withProgress = useCallback(async (title, message, fn) => {
    const id = newTaskId();
    const name = `progress#${id}`;
    let shown = false;
    let finished = false;
    let last = { done: 0, total: 0 };
    const timer = setTimeout(() => {
      if (finished) return;
      shown = true;
      platform.dialogs.open(name, { title, message, ...last, appearance: appearance() });
    }, 250);
    const off = onProgress((p) => {
      if (p.id !== id) return;
      last = { done: p.done, total: p.total };
      if (shown) platform.dialogs.update(name, { title, message, ...last, appearance: appearance() });
    });
    try {
      return await fn(id);
    } finally {
      finished = true;
      clearTimeout(timer);
      off();
      if (shown) platform.dialogs.close(name);
    }
  }, [appearance]);

  // ── Settings: load, persist, apply ──
  useEffect(() => {
    let alive = true;
    (async () => {
      const [raw, appInfo] = await Promise.all([platform.loadSettings(), platform.getInfo()]);
      if (!alive) return;
      const s = normalizeSettings(raw);
      setInfo(appInfo || {});
      setSettings(s);
      setSettingsLoaded(true);
      const list = await loadHistory(appInfo && appInfo.userData);
      if (!alive) return;
      setHistory(list);
      setHistoryLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  const historySaveTimer = useRef(null);
  useEffect(() => {
    if (!historyLoaded) return;
    clearTimeout(historySaveTimer.current);
    historySaveTimer.current = setTimeout(() => { saveHistory(info.userData, history).catch((err) => console.warn('[CaptureMaster] history', err)); }, 300);
  }, [history, historyLoaded, info.userData]);

  // Entries whose file is gone are shown struck through; checked when the list is shown.
  const checkMissing = useCallback(async (list) => {
    if (!isDesktop) return;
    const gone = new Set();
    await Promise.all(list.filter((e) => e.path).map(async (e) => { if (!(await platform.fs.exists(e.path).catch(() => true))) gone.add(e.id); }));
    setMissing(gone);
  }, []);
  useEffect(() => {
    if (historyLoaded && settings.history.open) checkMissing(history);
    // Only when the panel opens or the list is loaded, not on every change.
  }, [historyLoaded, settings.history.open, checkMissing]);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => normalizeSettings({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    applyTheme(settings.theme, settings.customThemes);
    applyFont(settings.font);
    if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
    platform.dialogs.broadcastAppearance(appearanceOf(settings));
    const snap = `${settings.toolPanel.open}\0${settings.history.open}`;
    const panelsChanged = panelOpenRef.current !== null && panelOpenRef.current !== snap;
    panelOpenRef.current = snap;
    clearTimeout(saveTimer.current);
    const write = () => { platform.saveSettings(settings).catch((err) => reportError(err, 'settings')); };
    // Folding a panel must land on disk before a quick quit; other edits can wait.
    if (panelsChanged) write();
    else saveTimer.current = setTimeout(write, 300);
  }, [settings, settingsLoaded, i18n, reportError]);

  // The native window stays hidden until this render, so the first frame already
  // has the saved panel fold instead of the default open panels.
  useLayoutEffect(() => {
    if (!settingsLoaded) return;
    platform.windowControls.show();
  }, [settingsLoaded]);

  // The settings window pushes every change live; reset comes from there too.
  handlers.current.settingsMessage = (data) => {
    if (data.type === 'change' && data.settings) setSettings(normalizeSettings(data.settings));
    if (data.type === 'reset') {
      const fresh = normalizeSettings(null);
      setSettings(fresh);
      platform.dialogs.update('settings', { title: t('settings.title'), settings: fresh, videoFormats: supportedVideoFormats(), appearance: appearanceOf(fresh) });
      toast(t('toast.settingsReset'));
    }
  };

  // ── Window title & min width ──
  useEffect(() => {
    const parts = [`CaptureMaster${info.version ? ' v' + info.version : ''}`];
    if (active) parts.push(`${isDirty(active) ? '● ' : ''}${active.name}`);
    platform.windowControls.setTitle(parts.join(' — '));
  }, [active, info.version]);

  // Minimum window width: the toolbar row, or both side panels around the
  // narrowest usable editor, whichever is wider.
  const toolbarNeed = useRef(0);
  const applyMinWidth = useCallback(() => {
    const side = ['.tool-panel', '.history'].reduce((w, sel) => {
      const el = document.querySelector(sel);
      return w + (el ? el.offsetWidth : 0);
    }, 0);
    platform.windowControls.setMinWidth(Math.max(toolbarNeed.current, side + EDITOR_MIN_W));
  }, []);
  const onMeasure = useCallback((w) => { toolbarNeed.current = w; applyMinWidth(); }, [applyMinWidth]);

  // ── Documents ──
  const updateDoc = useCallback((id, fn) => {
    setDocs((list) => list.map((d) => (d.id === id ? fn(d) : d)));
  }, []);

  const addDoc = useCallback((doc) => {
    setDocs((list) => [...list, doc]);
    setActiveId(doc.id);
    setTool('select');
    return doc;
  }, []);

  const commit = useCallback((id, nextPresent, extra) => {
    updateDoc(id, (d) => ({ ...d, history: hPush(d.history, nextPresent), ...(extra && extra.nextNumber ? { nextNumber: extra.nextNumber } : {}) }));
  }, [updateDoc]);

  const rememberRecent = useCallback((path, kind, name) => {
    if (!path) return;
    updateSettings((s) => ({ recent: addRecent(s.recent, { path, kind, name: name || nameOf(path) }) }));
  }, [updateSettings]);

  // ── Capture history & automatic saving ──
  const captureDirectory = useCallback(() => {
    const dir = settingsRef.current.paths.captureDir;
    if (dir) return dir;
    const base = info.pictures || info.home || '';
    if (!base) return '';
    return `${base.replace(/[\\/]+$/, '')}${base.includes('\\') ? '\\' : '/'}CaptureMaster`;
  }, [info.home, info.pictures]);

  const addHistory = useCallback((entry, docId) => {
    const id = newId('h');
    setHistory((list) => addEntry(list, { ...entry, id }));
    if (docId) entryDocs.current.set(id, docId);
    return id;
  }, []);

  /** A free PNG path in the capture folder, or '' when this format is not written as the captured PNG. */
  const captureFilePath = useCallback(async (name) => {
    if ((settingsRef.current.image.format || 'png') !== 'png') return '';
    const dir = captureDirectory();
    if (!dir) throw new Error('No capture folder is set.');
    const base = `${dir.replace(/[\\/]+$/, '')}${dir.includes('\\') ? '\\' : '/'}${String(name).replace(/[\\/:*?"<>|]/g, '_')}`;
    let path = `${base}.png`;
    for (let n = 2; await platform.fs.exists(path); n++) path = `${base} (${n}).png`;
    return path;
  }, [captureDirectory]);

  /** Writes a new capture to the capture folder (desktop) and adds it to the history. */
  const recordCapture = useCallback(async (doc, img, source) => {
    const thumb = await thumbnailOf(img.dataUrl).catch(() => '');
    let path = '';
    let bytes = 0;
    if (isDesktop) {
      try {
        const dir = captureDirectory();
        if (!dir) throw new Error('No capture folder is set.');
        const formats = imageFormatsFor(!!platform.image);
        const fmt = formats.find((f) => f.id === settingsRef.current.image.format) || formats[0];
        const quality = settingsRef.current.image.quality;
        const base = `${dir.replace(/[\\/]+$/, '')}${dir.includes('\\') ? '\\' : '/'}${doc.name.replace(/[\\/:*?"<>|]/g, '_')}`;
        path = `${base}.${fmt.ext}`;
        for (let n = 2; await platform.fs.exists(path); n++) path = `${base} (${n}).${fmt.ext}`;
        // PNG is the bytes already in the data URL. Writing that base64 as a normal
        // command avoids the raw-body request that fails for a full capture.
        if (fmt.id === 'png' && isTauri) {
          const comma = String(img.dataUrl || '').indexOf(',');
          const payload = comma >= 0 ? img.dataUrl.slice(comma + 1) : '';
          if (!payload) throw new Error('Could not read image bytes.');
          bytes = Number(await platform.fs.writeBase64(path, payload)) || 0;
        } else {
          let data;
          if (fmt.native) data = await dataUrlToBytes(img.dataUrl);
          else {
            const el = await loadImage(img.dataUrl);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(el, 0, 0);
            data = new Uint8Array(await (await canvasToBlob(canvas, fmt.mime, quality / 100)).arrayBuffer());
          }
          if (platform.image) bytes = Number(await platform.image.export(path, data, fmt.native ? fmt.id : 'raw', quality)) || data.length;
          else { await platform.fs.writeBinary(path, data); bytes = data.length; }
        }
        const saved = doc.history.present;
        updateDoc(doc.id, (d) => ({ ...d, file: path, savedPresent: d.savedPresent || saved }));
      } catch (err) {
        path = '';
        toast(t('toast.autoSaveFailed', { message: (err && err.message) || String(err) }), 'warn');
      }
    }
    addHistory({ path, name: path ? stripExt(nameOf(path)) : doc.name, kind: 'image', source, width: img.width, height: img.height, bytes, thumb, time: doc.createdAt }, doc.id);
    return path;
  }, [addHistory, captureDirectory, t, toast, updateDoc]);

  const recordRecording = useCallback(async (doc, { path, width, height, bytes, gif }) => {
    const url = platform.mediaUrl(path);
    const thumb = await (gif ? thumbnailOf(url) : videoThumbnail(url)).catch(() => '');
    addHistory({ path, name: stripExt(nameOf(path)), kind: gif ? 'image' : 'video', source: 'recording', width, height, bytes, thumb, time: doc.createdAt }, doc.id);
  }, [addHistory]);

  // ── Opening files ──
  const openImageBytes = useCallback(async (bytes, name, path, mime) => {
    const raw = await bytesToDataUrl(bytes, mime || mimeForExt(extOf(name)));
    const img = await normalizeToPng(raw);
    const doc = createImageDocument(img, { name: stripExt(name), path: null, source: { type: 'file', path } });
    // Unchanged pictures opened from disk need no saving.
    if (path) { doc.file = path; doc.savedPresent = doc.history.present; }
    return addDoc(doc);
  }, [addDoc]);

  const openPath = useCallback(async (p) => {
    const kind = kindForPath(p);
    if (!kind) throw new Error(t('error.unsupported', { ext: extOf(p) || '?' }));
    const already = docsRef.current.find((d) => d.path === p);
    if (already) { setActiveId(already.id); return already; }
    if (kind === 'capture') {
      const text = await withProgress(t('progress.opening'), nameOf(p), (id) => platform.fs.readText(p, id));
      const doc = parseCapture(text, p);
      addDoc(doc);
      rememberRecent(p, 'capture', doc.name);
      return doc;
    }
    if (kind === 'image') {
      const doc = NATIVE_DECODE_EXTS.includes(extOf(p)) && platform.image
        ? await openImageBytes(await withProgress(t('progress.opening'), nameOf(p), () => platform.image.readPng(p)), nameOf(p), p, 'image/png')
        : await withProgress(t('progress.opening'), nameOf(p), (id) => platform.fs.readBinary(p, id)).then((res) => openImageBytes(res.data, res.name, p));
      rememberRecent(p, 'image', doc.name);
      return doc;
    }
    const st = await platform.fs.stat(p);
    if (!st) throw new Error('File not found: ' + p);
    const doc = addDoc(createVideoDocument({ path: p, name: stripExt(nameOf(p)), source: { type: 'file', path: p } }));
    rememberRecent(p, 'video', doc.name);
    return doc;
  }, [addDoc, openImageBytes, rememberRecent, t, withProgress]);

  const openPaths = useCallback(async (paths) => {
    for (const p of paths) {
      try {
        const doc = await openPath(p);
        if (doc) { toast(t('toast.opened', { name: doc.name })); updateSettings({ paths: { ...settingsRef.current.paths, lastOpenDir: dirOf(p) } }); }
      } catch (err) {
        updateSettings((s) => ({ recent: removeRecent(s.recent, p) }));
        reportError(err, t('error.open'));
      }
    }
  }, [openPath, reportError, t, toast, updateSettings]);

  const openWebFiles = useCallback(async (files) => {
    for (const f of files) {
      try {
        const kind = kindForPath(f.name);
        if (kind === 'capture') addDoc(parseCapture(await f.text(), f.name));
        else if (kind === 'image') await openImageBytes(await readFileAsBytes(f), f.name, null, f.type);
        else if (kind === 'video') addDoc({ ...createVideoDocument({ path: f.name, name: stripExt(f.name) }), blobUrl: URL.createObjectURL(f) });
        else throw new Error(t('error.unsupported', { ext: extOf(f.name) }));
      } catch (err) { reportError(err, t('error.open')); }
    }
  }, [addDoc, openImageBytes, reportError, t]);

  const openFile = useCallback(async () => {
    const filters = [
      { name: t('format.allSupported'), extensions: [CAPTURE_EXT, ...IMAGE_EXTS, ...VIDEO_EXTS] },
      { name: t('format.cmcap'), extensions: [CAPTURE_EXT] },
      { name: t('format.images'), extensions: IMAGE_EXTS },
      { name: t('format.video'), extensions: VIDEO_EXTS },
      { name: t('format.all'), extensions: ['*'] },
    ];
    const res = await platform.openFileDialog({ defaultDir: settingsRef.current.paths.lastOpenDir, filters, title: t('toolbar.open'), multi: true, accept: '.cmcap,image/*,video/*' });
    if (!res) return;
    if (isDesktop) await openPaths(Array.isArray(res) ? res : [res]);
    else await openWebFiles(Array.isArray(res) ? res : [res]);
  }, [openPaths, openWebFiles, t]);

  const openUrl = useCallback(async () => {
    const r = await ask('prompt#url', { title: t('prompt.openUrlTitle'), label: t('prompt.openUrlLabel'), placeholder: t('prompt.openUrlPlaceholder'), type: 'url', okLabel: t('common.open') });
    if (!r || !r.value) return;
    const url = r.value;
    try {
      const res = await withProgress(t('progress.downloading'), url, (id) => platform.download(url, id));
      const ct = String(res.contentType || '');
      const ext = extOf(res.name);
      if (!ct.startsWith('image/') && !IMAGE_EXTS.includes(ext)) throw new Error(t('error.notImage', { type: ct || ext || '?' }));
      const doc = await openImageBytes(res.data, res.name || 'download.png', null, ct.startsWith('image/') ? ct : undefined);
      updateDoc(doc.id, (d) => ({ ...d, source: { type: 'url', url } }));
      toast(t('toast.opened', { name: doc.name }));
    } catch (err) { reportError(err, t('error.download')); }
  }, [ask, openImageBytes, reportError, t, toast, updateDoc, withProgress]);

  // Files from the shell (association / "Open with") and drag & drop.
  useEffect(() => {
    if (!settingsLoaded) return undefined;
    platform.takePendingOpen().then((p) => { if (p) openPaths([p]); });
    return platform.onOpenPath((p) => { if (p) openPaths([p]); });
  }, [settingsLoaded, openPaths]);

  useEffect(() => {
    const over = (e) => { e.preventDefault(); if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) setDropping(true); };
    const leave = (e) => { if (!e.relatedTarget) setDropping(false); };
    const drop = async (e) => {
      e.preventDefault();
      setDropping(false);
      if (isTauri) return;
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      if (isDesktop) {
        const paths = files.map((f) => (window.electronAPI && window.electronAPI.getPathForFile ? window.electronAPI.getPathForFile(f) : f.path)).filter(Boolean);
        if (paths.length) await openPaths(paths); else await openWebFiles(files);
      } else await openWebFiles(files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [openPaths, openWebFiles]);

  useEffect(() => {
    if (!isTauri) return undefined;
    let unlisten = () => {};
    let dead = false;
    import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((event) => {
      const kind = event.payload && event.payload.type;
      if (kind === 'over' || kind === 'enter') setDropping(true);
      if (kind === 'leave') setDropping(false);
      if (kind === 'drop') {
        setDropping(false);
        const paths = (event.payload && event.payload.paths) || [];
        if (paths.length) openPaths(paths);
      }
    })).then((fn) => { if (dead) fn(); else unlisten = fn; }).catch(() => {});
    return () => { dead = true; unlisten(); };
  }, [openPaths]);

  // Reinstall detected (Linux / macOS): ask about the old data once.
  useEffect(() => {
    if (!settingsLoaded) return;
    platform.takeInstallCheck().then(async (need) => {
      if (!need) return;
      const r = await confirm({
        title: t('confirm.deleteDataTitle'), message: t('confirm.deleteData'), icon: 'info',
        buttons: [{ id: 'keep', label: t('confirm.keepData'), kind: 'primary' }, { id: 'wipe', label: t('confirm.wipeData'), kind: 'danger' }],
      });
      const wipe = !!(r && r.id === 'wipe');
      await platform.resolveInstallCheck(wipe);
      if (wipe) setSettings(normalizeSettings(null));
    });
  }, [settingsLoaded, confirm, t]);

  // ── Saving ──
  const saveDoc = useCallback(async (doc, saveAs) => {
    if (!doc) return false;
    try {
      if (doc.kind === 'video') {
        if (!isDesktop) return false;
        const target = await platform.pickSavePath({ defaultName: nameOf(doc.path), defaultDir: settingsRef.current.paths.lastSaveDir || dirOf(doc.path), filters: [{ name: t('format.video'), extensions: [extOf(doc.path) || 'webm'] }], title: t('toolbar.saveAs') });
        if (!target) return false;
        await withProgress(t('progress.copying'), nameOf(target), (id) => platform.fs.copyFile(doc.path, target, id));
        rememberRecent(target, 'video');
        toast(t('toast.saved', { name: nameOf(target) }));
        return true;
      }
      const current = docsRef.current.find((d) => d.id === doc.id) || doc;
      const text = serializeCapture(current);
      if (!isDesktop) {
        platform.webDownload(new TextEncoder().encode(text), `${current.name}.${CAPTURE_EXT}`, 'application/json');
        updateDoc(current.id, (d) => ({ ...d, savedPresent: d.history.present }));
        return true;
      }
      let target = !saveAs && current.path && extOf(current.path) === CAPTURE_EXT ? current.path : null;
      if (!target) {
        target = await platform.pickSavePath({
          defaultName: `${current.name.replace(/[\\/:*?"<>|]/g, '_')}.${CAPTURE_EXT}`,
          defaultDir: settingsRef.current.paths.captureDir || settingsRef.current.paths.lastSaveDir || current.dir || info.pictures,
          filters: [{ name: t('format.cmcap'), extensions: [CAPTURE_EXT] }],
          title: t('toolbar.save'),
        });
        if (!target) return false;
        if (extOf(target) !== CAPTURE_EXT) target += '.' + CAPTURE_EXT;
      }
      await withProgress(t('progress.saving'), nameOf(target), (id) => platform.fs.writeText(target, text, id));
      const savedPresent = current.history.present;
      updateDoc(current.id, (d) => ({ ...d, path: target, dir: dirOf(target), name: stripExt(nameOf(target)), savedPresent }));
      rememberRecent(target, 'capture', stripExt(nameOf(target)));
      updateSettings({ paths: { ...settingsRef.current.paths, lastSaveDir: dirOf(target) } });
      toast(t('toast.saved', { name: nameOf(target) }));
      return true;
    } catch (err) {
      reportError(err, t('error.save'));
      return false;
    }
  }, [info.pictures, rememberRecent, reportError, t, toast, updateDoc, updateSettings, withProgress]);

  const exportImage = useCallback(async (doc, region) => {
    if (!doc || doc.kind !== 'image') return;
    try {
      const formats = imageFormatsFor(!!platform.image);
      const fmt = formats.find((f) => f.id === settingsRef.current.image.format) || formats[0];
      const baseName2 = doc.name.replace(/[\\/:*?"<>|]/g, '_');
      const p = doc.history.present;
      const img = await loadImage(p.image.dataUrl);
      await preloadPictures(p.annotations);
      if (!isDesktop) {
        const canvas = renderToCanvas(p, img, { region });
        const blob = await canvasToBlob(canvas, fmt.mime, settingsRef.current.image.quality / 100);
        platform.webDownload(new Uint8Array(await blob.arrayBuffer()), `${baseName2}.${fmt.ext}`, fmt.mime);
        return;
      }
      const filters = [
        { name: t(`format.${fmt.id}`), extensions: [fmt.ext] },
        ...formats.filter((f) => f.id !== fmt.id).map((f) => ({ name: t(`format.${f.id}`), extensions: [f.ext] })),
      ];
      const target = await platform.pickSavePath({ defaultName: `${baseName2}.${fmt.ext}`, defaultDir: settingsRef.current.paths.captureDir || settingsRef.current.paths.lastExportDir || info.pictures, filters, title: t('toolbar.export') });
      if (!target) return;
      const byExt = imageFormatByExt(extOf(target));
      const chosen = byExt && formats.includes(byExt) ? byExt : fmt;
      const finalPath = byExt ? target : `${target}.${fmt.ext}`;
      const quality = settingsRef.current.image.quality;
      await withProgress(t('progress.exporting'), nameOf(finalPath), async (id) => {
        const canvas = renderToCanvas(p, img, { region });
        // Native formats are sent as lossless PNG and re-encoded on the desktop side.
        const blob = await canvasToBlob(canvas, chosen.native ? 'image/png' : chosen.mime, quality / 100);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (platform.image) await platform.image.export(finalPath, bytes, chosen.native ? chosen.id : 'raw', quality);
        else await platform.fs.writeBinary(finalPath, bytes, id);
      });
      rememberRecent(finalPath, 'image', stripExt(nameOf(finalPath)));
      updateSettings({ paths: { ...settingsRef.current.paths, lastExportDir: dirOf(finalPath) } });
      toast(t('toast.exported', { name: nameOf(finalPath) }));
    } catch (err) { reportError(err, t('error.export')); }
  }, [info.pictures, rememberRecent, reportError, t, toast, updateSettings, withProgress]);

  // ── Closing documents ──
  const closeDoc = useCallback(async (id) => {
    const doc = docsRef.current.find((d) => d.id === id);
    if (!doc) return true;
    if (isDirty(doc)) {
      const r = await confirm({
        title: t('confirm.saveTitle'), message: t('confirm.saveOne', { name: doc.name }),
        buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'discard', label: t('common.dontSave') }, { id: 'save', label: t('common.save'), kind: 'primary' }],
      });
      if (!r || r.id === 'cancel') return false;
      if (r.id === 'save' && !(await saveDoc(doc, false))) return false;
    }
    if (doc.blobUrl) URL.revokeObjectURL(doc.blobUrl);
    setDocs((list) => {
      const idx = list.findIndex((d) => d.id === id);
      const next = list.filter((d) => d.id !== id);
      if (activeRef.current === id) setActiveId(next.length ? next[Math.min(idx, next.length - 1)].id : null);
      return next;
    });
    return true;
  }, [confirm, saveDoc, t]);

  // The main window asked to close: save or discard first, then quit. A second
  // request while the first is still being answered is ignored.
  const closingRef = useRef(false);
  useEffect(() => platform.onCloseRequested(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try { await handlers.current.closeFlow(); } finally { closingRef.current = false; }
  }), []);
  handlers.current.closeFlow = async () => {
    if (recordingRef.current) {
      const r = await confirm({ title: t('confirm.discardRecordingTitle'), message: t('confirm.discardRecording'), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'ok', label: t('common.ok'), kind: 'danger' }] });
      if (!r || r.id !== 'ok') return;
      await handlers.current.recorderAction('discard');
    }
    const dirty = docsRef.current.filter(isDirty);
    if (dirty.length) {
      const r = await confirm({
        title: t('confirm.saveTitle'),
        message: dirty.length === 1 ? t('confirm.saveOne', { name: dirty[0].name }) : t('confirm.saveMany', { n: dirty.length }),
        buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'discard', label: dirty.length === 1 ? t('common.dontSave') : t('confirm.discardAll') }, { id: 'save', label: dirty.length === 1 ? t('common.save') : t('confirm.saveAll'), kind: 'primary' }],
      });
      if (!r || r.id === 'cancel') return;
      if (r.id === 'save') {
        for (const d of dirty) { setActiveId(d.id); if (!(await saveDoc(d, false))) return; }
      }
    }
    clearTimeout(saveTimer.current);
    try { await platform.saveSettings(settingsRef.current); } catch (err) { console.warn('[CaptureMaster] settings', err); }
    platform.quit();
  };

  // ── Capture ──
  const performCapture = useCallback(async (grab, label, opts = {}) => {
    const s = settingsRef.current;
    const hide = s.capture.hideWindow && !opts.keepVisible;
    try {
      setCapturing(t('status.capturing'));
      if (s.capture.delay > 0) {
        for (let n = s.capture.delay; n > 0; n--) {
          if (s.capture.showCountdown) setCountdown(n);
          setCapturing(t('status.countdown', { n }));
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCountdown(0);
      }
      const name = stampName(label || 'Capture');
      // PNG is written by the capture itself, so a full-screen image is not sent back over IPC.
      let directPath = '';
      if (isDesktop) {
        try { directPath = await captureFilePath(name); } catch { directPath = ''; }
      }
      if (hide) { await platform.capture.hideApp(); await new Promise((r) => setTimeout(r, HIDE_SETTLE_MS)); }
      let result;
      try {
        result = await grab(directPath);
      } finally {
        if (hide) await platform.capture.showApp();
      }
      if (!result) return null;
      const img = result.width && result.dataUrl.startsWith('data:image/png') ? { dataUrl: result.dataUrl, width: result.width, height: result.height } : await normalizeToPng(result.dataUrl);
      const doc = addDoc(createImageDocument(img, { name, source: { type: result.kind || 'screen', name: result.name || '' } }));
      if (s.capture.copyToClipboard) platform.clipboard.writeImage(img.dataUrl).catch(() => {});
      const source = result.kind === 'window' ? 'window' : 'screen';
      let file = result.savedPath || '';
      let savedBytes = Number(result.savedBytes) || 0;
      // The grab kept the PNG. Save it here when the capture itself did not.
      if (!file && result.shotId && directPath && isTauri) {
        try {
          savedBytes = Number(await platform.capture.saveShot({ shotId: result.shotId, path: directPath })) || 0;
          file = directPath;
        } catch { file = ''; }
      }
      if (file) {
        const saved = doc.history.present;
        updateDoc(doc.id, (d) => ({ ...d, file, savedPresent: d.savedPresent || saved }));
        const thumb = await thumbnailOf(img.dataUrl).catch(() => '');
        addHistory({ path: file, name: stripExt(nameOf(file)), kind: 'image', source, width: img.width, height: img.height, bytes: savedBytes, thumb, time: doc.createdAt }, doc.id);
      } else {
        file = await recordCapture(doc, img, source);
      }
      toast(file ? t('toast.capturedSaved', { name: nameOf(file), w: img.width, h: img.height }) : t('toast.captured', { w: img.width, h: img.height }));
      return doc;
    } catch (err) {
      reportError(err, t('error.capture'));
      return null;
    } finally {
      setCapturing('');
      setCountdown(0);
    }
  }, [addDoc, addHistory, captureFilePath, recordCapture, reportError, t, toast, updateDoc]);

  const pickScreen = useCallback(async (kind) => {
    // Thumbnails mean grabbing every monitor, so only fetch them when there is a choice to make.
    let screens = (await platform.capture.listSources({ types: ['screen'], thumbWidth: 0 })).filter((x) => x.kind === 'screen');
    if (!screens.length) throw new Error(t('error.noScreen'));
    if (screens.length === 1) return screens[0];
    screens = (await platform.capture.listSources({ types: ['screen'], thumbWidth: 360 })).filter((x) => x.kind === 'screen');
    const r = await ask('sources', { title: kind === 'record' ? t('sources.titleRecord') : t('sources.titleScreen'), kind, sources: screens });
    return r ? screens.find((x) => x.id === r.id) || null : null;
  }, [ask, t]);

  const pickRecordSource = useCallback(async () => {
    if (!isTauri) return pickScreen('record');
    const includeSelf = settingsRef.current.capture.allowSelf !== false;
    const sources = await platform.capture.listSources({ types: ['screen', 'window'], thumbWidth: 360, includeSelf });
    if (!sources.some((x) => x.kind === 'screen')) throw new Error(t('error.noScreen'));
    const r = await ask('sources', { title: t('sources.titleRecord'), kind: 'record', sources, includeSelf });
    if (!r) return null;
    const src = sources.find((x) => x.id === r.id) || r;
    const screens = sources.filter((x) => x.kind === 'screen' && x.bounds).map((x) => x.bounds);
    return src.kind === 'screen' ? { ...src, display: { bounds: src.bounds, screens } } : src;
  }, [ask, pickScreen, t]);

  const captureScreen = useCallback(async () => {
    if (!isDesktop) { await performCapture(() => grabSourceFrame(null), 'Screen'); return; }
    try {
      const src = await pickScreen('screen');
      if (!src) return;
      await performCapture((savePath) => platform.capture.grabScreen(src.id, savePath), 'Screen');
    } catch (err) { reportError(err, t('error.capture')); }
  }, [performCapture, pickScreen, reportError, t]);

  const captureWindow = useCallback(async () => {
    if (!isDesktop) { await performCapture(() => grabSourceFrame(null), 'Window'); return; }
    try {
      const includeSelf = settingsRef.current.capture.allowSelf !== false;
      const sources = await platform.capture.listSources({ types: ['window'], thumbWidth: 360, includeSelf });
      const r = await ask('sources', { title: t('sources.titleWindow'), kind: 'window', sources, includeSelf });
      if (!r) return;
      const self = !!(r.self || (sources.find((x) => x.id === r.id) || {}).self);
      await performCapture(async (savePath) => {
        try {
          const frame = isTauri ? await platform.capture.grabWindow(r.id, savePath) : await grabSourceFrame(r.id);
          return { ...frame, kind: 'window', name: r.name };
        } catch (err) {
          throw new Error(`${t('error.noSource')} (${err.message})`);
        }
      }, 'Window', { keepVisible: self });
    } catch (err) { reportError(err, t('error.capture')); }
  }, [ask, performCapture, reportError, t]);

  const captureRegion = useCallback(async () => {
    try {
      let shot;
      let displayId = null;
      if (isDesktop) {
        displayId = await platform.capture.cursorDisplay();
        const sources = await platform.capture.listSources({ types: ['screen'], thumbWidth: 0 });
        const src = sources.find((x) => String(x.displayId) === String(displayId)) || sources[0];
        if (!src) throw new Error(t('error.noScreen'));
        const s = settingsRef.current;
        setCapturing(t('status.capturing'));
        if (s.capture.delay > 0) {
          for (let n = s.capture.delay; n > 0; n--) { if (s.capture.showCountdown) setCountdown(n); setCapturing(t('status.countdown', { n })); await new Promise((r) => setTimeout(r, 1000)); }
          setCountdown(0);
        }
        const hide = s.capture.hideWindow;
        if (hide) {
          await platform.capture.hideApp();
          await new Promise((r) => setTimeout(r, HIDE_SETTLE_MS));
        }
        try { shot = await platform.capture.grabScreen(src.id); } finally { setCapturing(''); }
      } else {
        shot = await grabSourceFrame(null);
      }
      const rect = await ask('region', { title: t('toolbar.captureRegion'), dataUrl: shot.dataUrl, width: shot.width, height: shot.height, displayId });
      if (isDesktop && settingsRef.current.capture.hideWindow) await platform.capture.showApp();
      if (!rect) { platform.capture.dropShot(shot && shot.shotId); return; }
      const img = await cropImage(shot.dataUrl, rect);
      const name = stampName('Region');
      const doc = addDoc(createImageDocument(img, { name, source: { type: 'region', name: shot.name || '' } }));
      if (settingsRef.current.capture.copyToClipboard) platform.clipboard.writeImage(img.dataUrl).catch(() => {});
      // Crop the PNG Rust already has, instead of uploading the picture again.
      let file = '';
      let savedBytes = 0;
      if (isTauri && shot.shotId) {
        try {
          const path = await captureFilePath(name);
          if (path) {
            savedBytes = Number(await platform.capture.saveShot({ shotId: shot.shotId, path, x: rect.x, y: rect.y, w: rect.w, h: rect.h })) || 0;
            file = path;
          }
        } catch { file = ''; }
      }
      if (file) {
        const saved = doc.history.present;
        updateDoc(doc.id, (d) => ({ ...d, file, savedPresent: d.savedPresent || saved }));
        const thumb = await thumbnailOf(img.dataUrl).catch(() => '');
        addHistory({ path: file, name: stripExt(nameOf(file)), kind: 'image', source: 'region', width: img.width, height: img.height, bytes: savedBytes, thumb, time: doc.createdAt }, doc.id);
      } else {
        file = await recordCapture(doc, img, 'region');
      }
      toast(file ? t('toast.capturedSaved', { name: nameOf(file), w: img.width, h: img.height }) : t('toast.captured', { w: img.width, h: img.height }));
      return doc;
    } catch (err) {
      if (isDesktop) platform.capture.showApp();
      reportError(err, t('error.capture'));
    } finally {
      setCapturing('');
      setCountdown(0);
    }
    return null;
  }, [addDoc, addHistory, ask, captureFilePath, recordCapture, reportError, t, toast, updateDoc]);

  // ── Recording ──
  const finishRecording = useCallback(async (discard) => {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    setRecording(null);
    platform.dialogs.close('recorder');
    try {
      const gif = !!rec.controller.format.gif;
      // A GIF is finished by its encoder on stop, which can take a moment.
      if (gif && !discard) await withProgress(t('progress.finishing'), nameOf(rec.path), () => rec.controller.stop());
      else await rec.controller.stop();
      await rec.drain();
      if (isDesktop) {
        if (discard) {
          if (rec.sinkId) await platform.rec.discard(rec.sinkId, rec.path);
          else await platform.fs.remove(rec.path);
          toast(t('toast.recordingDiscarded'), 'warn');
        } else {
          const res = gif ? rec.controller.result : await withProgress(t('progress.finishing'), nameOf(rec.path), () => platform.rec.close(rec.sinkId));
          const doc = addDoc(createVideoDocument({ path: rec.path, name: stripExt(nameOf(rec.path)), width: rec.controller.width, height: rec.controller.height, source: { type: 'recording' } }));
          rememberRecent(rec.path, 'video', doc.name);
          toast(t('toast.recordingSaved', { name: nameOf(rec.path) }) + ` (${formatBytes(res ? res.bytes : 0)})`);
          recordRecording(doc, { path: rec.path, width: rec.controller.width, height: rec.controller.height, bytes: res ? res.bytes : 0, gif });
        }
      } else if (!discard) {
        const blob = new Blob(rec.chunks, { type: rec.controller.format.mime });
        const name = `${stampName('Recording')}.${rec.controller.format.ext}`;
        addDoc({ ...createVideoDocument({ path: name, name: stripExt(name), width: rec.controller.width, height: rec.controller.height }), blobUrl: URL.createObjectURL(blob) });
        platform.webDownload(new Uint8Array(await blob.arrayBuffer()), name, blob.type);
      }
    } catch (err) {
      reportError(err, t('error.record'));
    } finally {
      if (rec.minimized) platform.capture.restoreApp();
    }
  }, [addDoc, recordRecording, rememberRecent, reportError, t, toast, withProgress]);

  const stopRecording = useCallback(() => finishRecording(false), [finishRecording]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) { await stopRecording(); return; }
    const s = settingsRef.current;
    try {
      const fmt = pickVideoFormat(s.video.format);
      if (!fmt) throw new Error(t('error.recorderUnsupported'));
      let sourceId = null;
      let windowSourceId = null;
      let recordingSelf = false;
      let display = null;
      if (isDesktop) {
        const src = await pickRecordSource();
        if (!src) return;
        sourceId = src.id;
        display = src.display || null;
        if (isTauri && src.kind === 'window') {
          windowSourceId = src.id;
          recordingSelf = !!src.self;
        }
      }
      if (fmt.gif && (s.video.systemAudio || s.video.microphone)) toast(t('toast.gifNoAudio'), 'warn');

      // Where the file goes is settled before the first frame is captured, so
      // no chunk (the first one carries the file header) arrives without a sink.
      let path = null;
      let sinkId = null;
      const chunks = [];
      let queue = Promise.resolve();
      if (isDesktop) {
        const dir = s.paths.videoDir || info.videos || info.home || '';
        const defaultName = `${stampName('Recording')}.${fmt.ext}`;
        if (s.video.askPath) {
          path = await platform.pickSavePath({ defaultName, defaultDir: dir, filters: [{ name: fmt.labelKey ? t(fmt.labelKey) : fmt.label, extensions: [fmt.ext] }], title: t('toolbar.record') });
          if (!path) return;
        } else {
          path = `${dir}${dir && !/[\\/]$/.test(dir) ? (info.platform === 'win32' ? '\\' : '/') : ''}${defaultName}`;
        }
      }

      const onEnded = () => {
        if (windowSourceId) toast(t('toast.windowClosedRecording'), 'warn');
        finishRecording(false);
      };
      let controller;
      if (fmt.gif) {
        controller = await startGifRecording({ sourceId, path, fps: s.video.fps, onEnded });
      } else {
        if (isDesktop) sinkId = await platform.rec.open(path);
        try {
          controller = await startRecorder({
            sourceId, windowSourceId, display, fps: s.video.fps, systemAudio: s.video.systemAudio, systemAudioGain: s.video.systemAudioGain / 100, microphone: micOptions(s), format: fmt.id, bitrateMbps: s.video.bitrateMbps,
            onChunk: (blob) => {
              if (isDesktop) {
                queue = queue.then(async () => {
                  const bytes = new Uint8Array(await blob.arrayBuffer());
                  await platform.rec.append(sinkId, bytes);
                }).catch((err) => reportError(err, t('error.record')));
              } else chunks.push(blob);
            },
            onEnded,
            onError: (err) => reportError(err, t('error.record')),
          });
        } catch (err) {
          if (sinkId) await platform.rec.discard(sinkId, path).catch(() => {});
          throw err;
        }
      }
      if (controller.micWarning) toast(t('error.micDenied'), 'warn');
      if (controller.audioWarning) toast(t('error.systemAudioUnavailable'), 'warn');

      // Recording this program's own window: minimizing it would leave nothing to record.
      const minimized = s.video.minimizeWhileRecording && !recordingSelf;
      const rec = { controller, sinkId, path, chunks, startedAt: controller.startedAt, pausedMs: 0, pausedAt: 0, paused: false, minimized, drain: () => queue };
      recordingRef.current = rec;
      setRecording({ startedAt: rec.startedAt, pausedMs: 0 });
      toast(t('toast.recordingStarted'));
      platform.dialogs.open('recorder', { title: t('recorder.title'), startedAt: rec.startedAt, pausedMs: 0, paused: false, appearance: appearance() });
      if (minimized) platform.capture.minimizeApp();
    } catch (err) {
      const gone = String(err && (err.message || err)).includes('window-gone');
      reportError(gone ? new Error(t('error.noSource')) : err, t('error.record'));
    }
  }, [appearance, finishRecording, info, pickRecordSource, reportError, stopRecording, t, toast]);

  handlers.current.recorderAction = async (action) => {
    const rec = recordingRef.current;
    if (!rec) return;
    if (action === 'stop') await finishRecording(false);
    else if (action === 'discard') await finishRecording(true);
    else if (action === 'pause' && !rec.paused) {
      rec.controller.pause(); rec.paused = true; rec.pausedAt = Date.now();
      platform.dialogs.update('recorder', { title: t('recorder.title'), startedAt: rec.startedAt, pausedMs: rec.pausedMs, paused: true, pausedAt: rec.pausedAt, appearance: appearance() });
    } else if (action === 'resume' && rec.paused) {
      rec.controller.resume(); rec.paused = false; rec.pausedMs += Date.now() - rec.pausedAt;
      setRecording({ startedAt: rec.startedAt, pausedMs: rec.pausedMs });
      platform.dialogs.update('recorder', { title: t('recorder.title'), startedAt: rec.startedAt, pausedMs: rec.pausedMs, paused: false, appearance: appearance() });
    }
  };

  // ── Editing ──
  const setZoom = useCallback((z, autoFit = false) => {
    if (!activeRef.current) return;
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    updateDoc(activeRef.current, (d) => (d.zoom === zoom && d.autoFit === autoFit ? d : { ...d, zoom, autoFit }));
  }, [updateDoc]);
  const zoomFit = useCallback(() => { if (activeRef.current) updateDoc(activeRef.current, (d) => ({ ...d, autoFit: true })); }, [updateDoc]);
  const zoomTo = useCallback((z) => { if (editorRef.current) editorRef.current.zoomTo(z); else setZoom(z); }, [setZoom]);
  const zoom100 = useCallback(() => zoomTo(1), [zoomTo]);
  const zoomIn = useCallback(() => { if (editorRef.current) editorRef.current.zoomBy(1); else setZoom(nextZoom(active ? active.zoom : 1, 1)); }, [active, setZoom]);
  const zoomOut = useCallback(() => { if (editorRef.current) editorRef.current.zoomBy(-1); else setZoom(nextZoom(active ? active.zoom : 1, -1)); }, [active, setZoom]);

  const undo = useCallback(() => { const id = activeRef.current; if (id) updateDoc(id, (d) => (d.history ? { ...d, history: hUndo(d.history), selectedId: null } : d)); }, [updateDoc]);
  const redo = useCallback(() => { const id = activeRef.current; if (id) updateDoc(id, (d) => (d.history ? { ...d, history: hRedo(d.history), selectedId: null } : d)); }, [updateDoc]);

  const selectAnnotation = useCallback((sid) => { const id = activeRef.current; if (id) updateDoc(id, (d) => (d.selectedId === sid ? d : { ...d, selectedId: sid })); }, [updateDoc]);
  const setSelection = useCallback((rect) => { const id = activeRef.current; if (id) updateDoc(id, (d) => ({ ...d, selection: rect })); }, [updateDoc]);
  const setSelectionShape = useCallback((shape) => {
    updateSettings((s) => ({ editor: { ...s.editor, selectionShape: shape } }));
    const id = activeRef.current;
    if (id) updateDoc(id, (d) => (d.selection ? { ...d, selection: { ...d.selection, shape } } : d));
  }, [updateDoc, updateSettings]);

  const deleteSelected = useCallback(() => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image' || !doc.selectedId) return;
    const p = doc.history.present;
    commit(doc.id, { ...p, annotations: p.annotations.filter((a) => a.id !== doc.selectedId) });
    selectAnnotation(null);
  }, [commit, selectAnnotation]);

  const reorder = useCallback((toFront) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image' || !doc.selectedId) return;
    const p = doc.history.present;
    const a = p.annotations.find((x) => x.id === doc.selectedId);
    if (!a) return;
    const rest = p.annotations.filter((x) => x.id !== a.id);
    commit(doc.id, { ...p, annotations: toFront ? [...rest, a] : [a, ...rest] });
  }, [commit]);

  const duplicateSelected = useCallback(() => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image' || !doc.selectedId) return;
    const p = doc.history.present;
    const a = p.annotations.find((x) => x.id === doc.selectedId);
    if (!a) return;
    const copy = { ...moveAnnotation(a, 20, 20), id: newId('a') };
    commit(doc.id, { ...p, annotations: [...p.annotations, copy] });
    selectAnnotation(copy.id);
  }, [commit, selectAnnotation]);

  const nudge = useCallback((dx, dy) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image' || !doc.selectedId) return;
    const p = doc.history.present;
    commit(doc.id, { ...p, annotations: p.annotations.map((a) => (a.id === doc.selectedId ? moveAnnotation(a, dx, dy) : a)) });
  }, [commit]);

  const applyCrop = useCallback(async () => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image' || !doc.selection) return;
    try {
      const p = doc.history.present;
      const r = doc.selection;
      const img = await cropImage(p.image.dataUrl, r);
      const annotations = p.annotations.map((a) => moveAnnotation(a, -r.x, -r.y));
      commit(doc.id, { image: img, annotations });
      updateDoc(doc.id, (d) => ({ ...d, selection: null, selectedId: null, autoFit: true }));
      setTool('select');
      toast(t('toast.cropped'));
    } catch (err) { reportError(err, 'crop'); }
  }, [commit, reportError, t, toast, updateDoc]);

  // ── Clipboard ──
  const compositeDataUrl = useCallback(async (doc, region) => {
    const p = doc.history.present;
    const img = await loadImage(p.image.dataUrl);
    await preloadPictures(p.annotations);
    return maskToSelection(renderToCanvas(p, img, { region }), region).toDataURL('image/png');
  }, []);

  /** Annotations as a standalone picture, so other applications can paste them. */
  const annotationsDataUrl = useCallback(async (doc, annotations) => {
    const p = doc.history.present;
    const img = await loadImage(p.image.dataUrl);
    await preloadPictures(annotations);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const a of annotations) {
      const b = boundsOf(a);
      const pad = (Number(a.strokeWidth) || 4) * 2;
      x1 = Math.min(x1, b.x - pad); y1 = Math.min(y1, b.y - pad); x2 = Math.max(x2, b.x + b.w + pad); y2 = Math.max(y2, b.y + b.h + pad);
    }
    const region = { x: Math.floor(x1), y: Math.floor(y1), w: Math.max(1, Math.ceil(x2 - x1)), h: Math.max(1, Math.ceil(y2 - y1)) };
    const c = document.createElement('canvas');
    c.width = region.w;
    c.height = region.h;
    const ctx = c.getContext('2d');
    ctx.translate(-region.x, -region.y);
    // The base picture is passed (pixelate samples it) but not drawn.
    for (const a of annotations) drawAnnotation(ctx, a, img);
    return c.toDataURL('image/png');
  }, []);

  // The annotations last copied, with the clipboard picture they were copied
  // as: pasting that same picture back brings the editable annotations back.
  const internalClip = useRef(null);

  const copy = useCallback(async ({ regionOnly = false, cut = false } = {}) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image') { toast(t('toast.nothingToCopy'), 'warn'); return; }
    try {
      const p = doc.history.present;
      const sel = doc.selectedId ? p.annotations.find((a) => a.id === doc.selectedId) : null;
      if (sel && !regionOnly) {
        await platform.clipboard.writeImage(await annotationsDataUrl(doc, [sel]));
        const back = await platform.clipboard.readImage().catch(() => null);
        internalClip.current = { annotations: [sel], fingerprint: back ? back.dataUrl : null, pastes: 0 };
        if (cut) deleteSelected();
        toast(t(cut ? 'toast.cutAnnotation' : 'toast.copiedAnnotation'));
        return;
      }
      const region = regionOnly || doc.selection ? doc.selection : null;
      if (cut && !region) { toast(t('toast.nothingSelected'), 'warn'); return; }
      await platform.clipboard.writeImage(await compositeDataUrl(doc, region));
      internalClip.current = null;
      if (cut) {
        // Cutting a region leaves it transparent and takes the annotations lying wholly inside it.
        const inside = (a) => { const b = boundsOf(a); return b.x >= region.x && b.y >= region.y && b.x + b.w <= region.x + region.w && b.y + b.h <= region.y + region.h; };
        const image = await eraseRect(p.image.dataUrl, region);
        commit(doc.id, { image, annotations: p.annotations.filter((a) => !inside(a)) });
        updateDoc(doc.id, (d) => ({ ...d, selection: null, selectedId: null }));
        toast(t('toast.cutImage'));
        return;
      }
      toast(t('toast.copiedImage'));
    } catch (err) { reportError(err, t('error.clipboard')); }
  }, [annotationsDataUrl, commit, compositeDataUrl, deleteSelected, reportError, t, toast, updateDoc]);

  const eraseSelection = useCallback(async () => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image' || !doc.selection) return;
    try {
      const p = doc.history.present;
      commit(doc.id, { ...p, image: await eraseRect(p.image.dataUrl, doc.selection) });
      updateDoc(doc.id, (d) => ({ ...d, selection: null }));
      toast(t('toast.erased'));
    } catch (err) { reportError(err, 'erase'); }
  }, [commit, reportError, t, toast, updateDoc]);

  const deleteSelection = useCallback(() => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (doc && doc.selectedId) deleteSelected();
    else eraseSelection();
  }, [deleteSelected, eraseSelection]);
  const deselect = useCallback(() => { setSelection(null); selectAnnotation(null); }, [selectAnnotation, setSelection]);

  const selectAll = useCallback(() => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image') return;
    const { width, height } = doc.history.present.image;
    setTool('select');
    updateDoc(doc.id, (d) => ({ ...d, selectedId: null, selection: { x: 0, y: 0, w: width, h: height } }));
  }, [updateDoc]);

  const paste = useCallback(async ({ asNewDocument = false } = {}) => {
    try {
      const doc = docsRef.current.find((d) => d.id === activeRef.current);
      const img = await platform.clipboard.readImage().catch(() => null);
      const into = doc && doc.kind === 'image' && !asNewDocument ? doc : null;
      if (!into) {
        if (!img) { toast(t('error.clipboardEmpty'), 'warn'); return; }
        const norm = await normalizeToPng(img.dataUrl);
        addDoc(createImageDocument(norm, { name: stampName('Pasted'), source: { type: 'clipboard' } }));
        toast(t('toast.pasted'));
        return;
      }
      const p = into.history.present;
      const W = p.image.width;
      const H = p.image.height;
      const add = (list) => {
        commit(into.id, { ...p, annotations: [...p.annotations, ...list] });
        setTool('select');
        updateDoc(into.id, (d) => ({ ...d, selection: null, selectedId: list[list.length - 1].id }));
      };
      const clip = internalClip.current;
      if (img && clip && clip.fingerprint && clip.fingerprint === img.dataUrl) {
        clip.pastes += 1;
        add(clip.annotations.map((a) => ({ ...moveAnnotation(a, 20 * clip.pastes, 20 * clip.pastes), id: newId('a') })));
        toast(t('toast.pasted'));
        return;
      }
      if (img) {
        const norm = await normalizeToPng(img.dataUrl);
        // Pasted at full size unless larger than the picture; at the selection if there is one.
        const s = Math.min(1, W / norm.width, H / norm.height);
        const w = norm.width * s;
        const h = norm.height * s;
        const at = into.selection ? { x: into.selection.x, y: into.selection.y } : { x: (W - w) / 2, y: (H - h) / 2 };
        add([{ id: newId('a'), type: 'image', x: Math.round(at.x), y: Math.round(at.y), w, h, src: norm.dataUrl }]);
        toast(t('toast.pasted'));
        return;
      }
      const text = (await platform.clipboard.readText().catch(() => '')).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
      if (!text) { toast(t('error.clipboardEmpty'), 'warn'); return; }
      const tp = toolPropsRef.current;
      const a = { id: newId('a'), type: 'text', x: 0, y: 0, text, color: tp.color, font: { ...tp.font }, bg: false };
      const m = measureText(a);
      const at = into.selection ? { x: into.selection.x, y: into.selection.y } : { x: Math.max(0, (W - m.w) / 2), y: Math.max(0, (H - m.h) / 2) };
      add([{ ...a, x: Math.round(at.x), y: Math.round(at.y) }]);
      toast(t('toast.pastedText'));
    } catch (err) { reportError(err, t('error.clipboard')); }
  }, [addDoc, commit, reportError, t, toast, updateDoc]);

  // ── Printing ──
  /** Each document as the picture that goes on paper: a temp file (desktop) or a data URL. */
  const printPicture = useCallback(async (d) => {
    let dataUrl;
    if (d.kind === 'image') {
      const p = d.history.present;
      const img = await loadImage(p.image.dataUrl);
      await preloadPictures(p.annotations);
      dataUrl = renderToCanvas(p, img).toDataURL('image/png');
    } else {
      dataUrl = (d.id === activeRef.current && mainRef.current ? videoFrameDataUrl(mainRef.current) : null) || await videoPosterFrame(d.blobUrl || platform.mediaUrl(d.path));
    }
    const size = await loadImage(dataUrl).then((im) => ({ width: im.naturalWidth, height: im.naturalHeight }));
    if (!isTauri) return { src: dataUrl, ...size };
    const file = await platform.fs.tempPath('png');
    await platform.fs.writeBinary(file, await dataUrlToBytes(dataUrl));
    return { src: platform.mediaUrl(file), file, ...size };
  }, []);

  const print = useCallback(async () => {
    const list = docsRef.current;
    if (!list.length) { toast(t('toast.nothingToPrint'), 'warn'); return; }
    const cur = list.find((d) => d.id === activeRef.current);
    // The dialog lays out and previews the pages; on the desktop it also prints them itself.
    const files = [];
    let r;
    try {
      const docs = [];
      for (const d of list) {
        const pic = await printPicture(d);
        if (pic.file) files.push(pic.file);
        docs.push({ id: d.id, name: d.name, kind: d.kind, src: pic.src, width: pic.width, height: pic.height, selection: d.kind === 'image' ? d.selection : null });
      }
      r = await ask('print', { title: t('print.title'), docs, currentId: cur ? cur.id : null, hasSelection: !!(cur && cur.selection), direct: platform.printer.available });
    } catch (err) {
      reportError(err, t('error.print'));
      return;
    } finally {
      for (const f of files) platform.fs.remove(f).catch(() => {});
    }
    if (r && r.pdf) { toast(t('toast.savedPdf', { name: nameOf(r.pdf) })); return; }
    if (r && r.printed) { toast(t('toast.printed')); return; }
    if (!r || !r.docIds || !r.docIds.length) return;
    try {
      await withProgress(t('progress.printing'), t('print.pages', { n: r.docIds.length }), async (id) => {
        const images = [];
        let i = 0;
        for (const docId of r.docIds) {
          const d = list.find((x) => x.id === docId);
          if (!d) continue;
          let dataUrl;
          if (d.kind === 'image') {
            const p = d.history.present;
            const img = await loadImage(p.image.dataUrl);
            await preloadPictures(p.annotations);
            const region = r.selectionOnly && d.selection && d.id === (cur && cur.id) ? d.selection : null;
            dataUrl = renderToCanvas(p, img, { region }).toDataURL('image/jpeg', 0.92);
          } else {
            dataUrl = (d.id === activeRef.current && mainRef.current ? videoFrameDataUrl(mainRef.current) : null) || await videoPosterFrame(d.blobUrl || platform.mediaUrl(d.path));
          }
          images.push(await dataUrlToBytes(dataUrl));
          i += 1;
          emitProgress({ id, done: i, total: r.docIds.length });
        }
        const res = await platform.printImages({ images, title: cur ? cur.name : 'CaptureMaster', landscape: r.landscape, fitToPage: r.fit });
        if (res && res.printed) toast(t('toast.printed'));
      });
    } catch (err) { reportError(err, t('error.print')); }
  }, [ask, printPicture, reportError, t, toast, withProgress]);

  // ── Dialog launchers ──
  const openSettings = useCallback(() => {
    platform.dialogs.open('settings', { title: t('settings.title'), settings: settingsRef.current, videoFormats: supportedVideoFormats(), appearance: appearance() });
  }, [appearance, t]);
  const openAbout = useCallback(() => {
    platform.dialogs.open('about', { title: t('about.title'), info, appearance: appearance() });
  }, [appearance, info, t]);

  // ── Menus: their own popup window on desktop (may extend past the main
  // window), an in-page dropdown on the web ──
  const chooseTheme = useCallback((id) => {
    if (id === 'manage') {
      platform.dialogs.open('settings', { title: t('settings.title'), settings: settingsRef.current, videoFormats: supportedVideoFormats(), appearance: appearance(), page: 'theme' });
    } else if (typeof id === 'string' && id.startsWith('theme:')) {
      updateSettings({ theme: id.slice(6) });
    }
  }, [appearance, t, updateSettings]);

  const openThemeMenu = useCallback((el) => {
    if (!nativePopups) { setWebMenu((m) => (m && m.kind === 'theme' ? null : { kind: 'theme', anchor: el })); return; }
    const handle = showPopup('theme', { ...themeMenuPayload(settingsRef.current, i18n.language, t), anchor: anchorOf(el), appearance: appearance() }, {
      onChoose: chooseTheme,
      onClose: () => setThemeMenuOpen(false),
    });
    if (handle) setThemeMenuOpen(true);
  }, [appearance, chooseTheme, i18n.language, t]);

  const chooseRecent = useCallback((id, handle) => {
    if (typeof id !== 'string') return;
    if (id.startsWith('open:')) {
      if (isDesktop) openPaths([id.slice(5)]);
    } else if (id.startsWith('remove:')) {
      const next = removeRecent(settingsRef.current.recent, id.slice(7));
      updateSettings({ recent: next });
      if (handle) handle.update({ ...recentMenuPayload(next, t), anchor: handle.anchor, appearance: appearance() });
    } else if (id === 'clear') {
      updateSettings({ recent: [] });
    }
  }, [appearance, openPaths, t, updateSettings]);

  const openRecentMenu = useCallback((el) => {
    if (!nativePopups) { setRecentOpen((v) => !v); return; }
    const anchor = anchorOf(el);
    let handle = null;
    handle = showPopup('recent', { ...recentMenuPayload(settingsRef.current.recent, t), anchor, appearance: appearance() }, {
      onChoose: (id) => chooseRecent(id, handle),
    });
    if (handle) handle.anchor = anchor;
  }, [appearance, chooseRecent, t]);

  const openContextMenu = useCallback((x, y, items) => {
    if (!nativePopups) { setCtxMenu({ x, y, items }); return; }
    const list = items.filter(Boolean);
    showPopup(`context-${Date.now()}`, { ...itemsMenuPayload(list), mode: 'point', anchor: { x, y, w: 0, h: 0 }, appearance: appearance() }, {
      onChoose: (id) => { const it = list[id]; if (it && it !== 'sep' && !it.disabled && it.onClick) it.onClick(); },
    });
  }, [appearance]);

  const openZoomMenu = useCallback((el) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc) return;
    const r = el.getBoundingClientRect();
    const items = ZOOM_PRESETS.slice().reverse().map((z) => ({
      label: `${Math.round(z * 100)}%`,
      icon: z > 1 ? 'zoomIn' : z < 1 ? 'zoomOut' : 'actual',
      checked: !doc.autoFit && Math.abs(z - doc.zoom) < 1e-6,
      onClick: () => zoomTo(z),
    }));
    openContextMenu(r.left, r.bottom + 2, [...items, 'sep', { label: t('zoomBar.fitShort'), icon: 'fit', checked: !!doc.autoFit, onClick: zoomFit }]);
  }, [openContextMenu, t, zoomFit, zoomTo]);

  // ── Context menus ──
  /**
   * Save / export / print / file-location items shared by the document menus;
   * a tab gets only "save as" and the file location (it may not be the active document).
   */
  const fileItems = useCallback((doc, { tab = false } = {}) => {
    const file = doc.path || doc.file || '';
    const image = doc.kind === 'image';
    const isActive = doc.id === activeRef.current;
    return [
      image && !tab ? { label: t('menu.save'), icon: 'save', shortcut: 'Ctrl+S', onClick: () => saveDoc(doc, false) } : null,
      { label: t('menu.saveAs'), icon: 'saveAs', shortcut: image && isActive ? 'Ctrl+Shift+S' : undefined, onClick: () => saveDoc(doc, true) },
      image && !tab ? { label: t('menu.export'), icon: 'export', shortcut: 'Ctrl+E', onClick: () => exportImage(doc) } : null,
      tab ? null : { label: t('menu.print'), icon: 'print', shortcut: 'Ctrl+P', onClick: print },
      'sep',
      { label: t('tabs.showInFolder'), icon: 'folder', disabled: !isDesktop || !file, onClick: () => platform.shell.showItem(file) },
      { label: t('history.copyPath'), icon: 'copy', disabled: !file, onClick: () => platform.clipboard.writeText(file).then(() => toast(t('toast.pathCopied'))) },
    ].filter(Boolean);
  }, [exportImage, print, saveDoc, t, toast]);

  const editorContextMenu = useCallback((e, { annotation }) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc) return;
    const items = [];
    if (annotation) {
      if (annotation.type === 'text') items.push({ label: t('menu.editText'), icon: 'text', onClick: () => editorRef.current && editorRef.current.editText(annotation.id) });
      items.push(
        { label: t('menu.cut'), icon: 'cut', shortcut: 'Ctrl+X', onClick: () => copy({ cut: true }) },
        { label: t('menu.copy'), icon: 'copy', shortcut: 'Ctrl+C', onClick: () => copy() },
        { label: t('menu.paste'), icon: 'paste', shortcut: 'Ctrl+V', onClick: () => paste() },
        { label: t('menu.duplicate'), icon: 'duplicate', shortcut: 'Ctrl+D', onClick: duplicateSelected },
        { label: t('menu.delete'), icon: 'trash', shortcut: 'Del', danger: true, onClick: deleteSelected },
        'sep',
        { label: t('menu.bringFront'), icon: 'front', onClick: () => reorder(true) },
        { label: t('menu.sendBack'), icon: 'back', onClick: () => reorder(false) },
        'sep',
      );
    } else {
      items.push(
        { label: t('menu.cutSelection'), icon: 'cut', shortcut: 'Ctrl+X', disabled: !doc.selection, onClick: () => { selectAnnotation(null); copy({ regionOnly: true, cut: true }); } },
        { label: t('menu.copySelection'), icon: 'region', shortcut: 'Ctrl+C', disabled: !doc.selection, onClick: () => copy({ regionOnly: true }) },
        { label: t('menu.copyImage'), icon: 'copy', onClick: () => { selectAnnotation(null); copy({ regionOnly: false }); } },
        { label: t('menu.paste'), icon: 'paste', shortcut: 'Ctrl+V', onClick: () => paste() },
        { label: t('menu.pasteAsNew'), icon: 'paste', shortcut: 'Ctrl+Alt+V', onClick: () => paste({ asNewDocument: true }) },
        'sep',
        { label: t('menu.selectAll'), icon: 'region', shortcut: 'Ctrl+A', onClick: selectAll },
        { label: t('menu.eraseSelection'), icon: 'trash', shortcut: 'Del', disabled: !doc.selection, onClick: eraseSelection },
        { label: t('menu.cropToSelection'), icon: 'crop', shortcut: 'Enter', disabled: !doc.selection, onClick: applyCrop },
        { label: t('menu.deselect'), icon: 'close', shortcut: 'Esc', disabled: !doc.selection && !doc.selectedId, onClick: () => { setSelection(null); selectAnnotation(null); } },
        'sep',
        ...SELECTION_SHAPES.map((shape) => ({ label: t(`selShape.${shape}`), icon: SHAPE_ICON[shape], checked: selectionShape(doc.selection || { shape: settingsRef.current.editor.selectionShape }) === shape, onClick: () => setSelectionShape(shape) })),
        'sep',
      );
    }
    items.push(
      { label: t('toolbar.undo'), icon: 'undo', shortcut: 'Ctrl+Z', disabled: !canUndo(doc.history), onClick: undo },
      { label: t('toolbar.redo'), icon: 'redo', shortcut: 'Ctrl+Y', disabled: !canRedo(doc.history), onClick: redo },
      'sep',
      { label: t('menu.zoomIn'), icon: 'zoomIn', shortcut: 'Ctrl++', disabled: doc.zoom >= ZOOM_MAX, onClick: zoomIn },
      { label: t('menu.zoomOut'), icon: 'zoomOut', shortcut: 'Ctrl+-', disabled: doc.zoom <= ZOOM_MIN, onClick: zoomOut },
      { label: t('menu.zoomFit'), icon: 'fit', shortcut: 'Ctrl+0', checked: !!doc.autoFit, onClick: zoomFit },
      { label: t('menu.zoom100'), icon: 'actual', shortcut: 'Ctrl+1', checked: !doc.autoFit && Math.abs(doc.zoom - 1) < 1e-6, onClick: zoom100 },
    );
    if (!annotation) items.push('sep', ...fileItems(doc));
    openContextMenu(e.clientX, e.clientY, items);
  }, [applyCrop, copy, deleteSelected, duplicateSelected, eraseSelection, fileItems, openContextMenu, paste, redo, reorder, selectAll, selectAnnotation, setSelection, setSelectionShape, t, undo, zoom100, zoomFit, zoomIn, zoomOut]);

  const videoFrameToImage = useCallback(async (player, doc, toClipboard) => {
    try {
      const png = player && player.framePng();
      if (!png) { toast(t('error.noFrame'), 'warn'); return; }
      if (toClipboard) {
        await platform.clipboard.writeImage(png);
        toast(t('toast.frameCopied'));
        return;
      }
      const img = await normalizeToPng(png);
      addDoc(createImageDocument(img, { name: `${doc.name} ${formatDuration(player.time).replace(/:/g, '-')}`, source: { type: 'frame', video: doc.path || '', time: player.time } }));
      toast(t('toast.frameOpened'));
    } catch (err) { reportError(err, t('error.clipboard')); }
  }, [addDoc, reportError, t, toast]);

  const videoContextMenu = useCallback((e) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc) return;
    const p = videoControl(mainRef.current);
    const items = [];
    if (p) {
      const i = SPEEDS.indexOf(p.rate);
      items.push(
        { label: p.paused ? t('player.playLabel') : t('player.pauseLabel'), icon: p.paused ? 'play' : 'pause', shortcut: 'Space', onClick: p.togglePlay },
        { label: t('player.backLabel', { n: SKIP }), icon: 'rewind', shortcut: '←', onClick: () => p.skip(-SKIP) },
        { label: t('player.forwardLabel', { n: SKIP }), icon: 'forward', shortcut: '→', onClick: () => p.skip(SKIP) },
        { label: t('player.toStartLabel'), icon: 'skipStart', shortcut: 'Home', onClick: p.toStart },
        'sep',
        { label: t('player.faster'), icon: 'plus', sub: `${p.rate}×`, disabled: i === SPEEDS.length - 1, onClick: () => p.setRate(SPEEDS[Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.indexOf(1) : i) + 1)]) },
        { label: t('player.slower'), icon: 'minus', disabled: i === 0, onClick: () => p.setRate(SPEEDS[Math.max(0, (i < 0 ? SPEEDS.indexOf(1) : i) - 1)]) },
        { label: t('player.normalSpeed'), icon: 'refresh', disabled: p.rate === 1, onClick: () => p.setRate(1) },
        'sep',
        { label: t('player.muteLabel'), icon: 'mute', shortcut: 'M', checked: p.muted, onClick: p.toggleMute },
        { label: t('player.loop'), icon: 'loop', checked: p.loop, onClick: p.toggleLoop },
        { label: t('player.fullscreenLabel'), icon: 'fullscreen', shortcut: 'F', checked: p.fullscreen, onClick: p.toggleFullscreen },
        'sep',
        { label: t('menu.copyFrame'), icon: 'copy', onClick: () => videoFrameToImage(p, doc, true) },
        { label: t('menu.frameAsImage'), icon: 'image', onClick: () => videoFrameToImage(p, doc, false) },
        'sep',
      );
    }
    items.push(...fileItems(doc));
    openContextMenu(e.clientX, e.clientY, items);
  }, [fileItems, openContextMenu, t, videoFrameToImage]);

  const tabContextMenu = useCallback((e, d) => {
    const others = docsRef.current.filter((x) => x.id !== d.id);
    const i = docsRef.current.findIndex((x) => x.id === d.id);
    openContextMenu(e.clientX, e.clientY, [
      { label: t('tabs.closeMenu'), icon: 'close', shortcut: d.id === activeRef.current ? 'Ctrl+W' : undefined, onClick: () => closeDoc(d.id) },
      { label: t('tabs.closeOthers'), icon: 'close', disabled: !others.length, onClick: async () => { for (const o of others) if (!(await closeDoc(o.id))) break; } },
      { label: t('tabs.closeRight'), icon: 'close', disabled: i === docsRef.current.length - 1, onClick: async () => { for (const o of docsRef.current.slice(i + 1)) if (!(await closeDoc(o.id))) break; } },
      { label: t('tabs.closeAll'), icon: 'close', onClick: async () => { for (const o of [...docsRef.current]) if (!(await closeDoc(o.id))) break; } },
      'sep',
      { label: t('tabs.rename'), icon: 'text', disabled: d.kind !== 'image', onClick: async () => { const r = await ask('prompt#rename', { title: t('prompt.renameTitle'), label: t('prompt.renameLabel'), value: d.name }); if (r && r.value) updateDoc(d.id, (x) => ({ ...x, name: r.value })); } },
      'sep',
      ...fileItems(d, { tab: true }),
    ]);
  }, [ask, closeDoc, fileItems, openContextMenu, t, updateDoc]);

  // ── Capture history panel ──
  const docForPath = (p) => docsRef.current.find((d) => d.file === p || d.path === p || (d.source && d.source.path === p));
  const toggleHistory = useCallback(() => updateSettings((s) => ({ history: { ...s.history, open: !s.history.open } })), [updateSettings]);
  // A side panel may grow only into the editor's spare width (never below EDITOR_MIN_W),
  // so dragging it does not widen the window.
  const fitPanel = useCallback((width, current) => {
    if (width <= current || !mainRef.current) return width;
    return Math.min(width, Math.max(current, current + mainRef.current.offsetWidth - EDITOR_MIN_W));
  }, []);
  const resizeHistory = useCallback((width) => updateSettings((s) => ({ history: { ...s.history, width: fitPanel(width, s.history.width) } })), [fitPanel, updateSettings]);
  const toggleToolPanel = useCallback(() => updateSettings((s) => ({ toolPanel: { ...s.toolPanel, open: !s.toolPanel.open } })), [updateSettings]);
  const resizeToolPanel = useCallback((width) => updateSettings((s) => ({ toolPanel: { ...s.toolPanel, width: fitPanel(width, s.toolPanel.width) } })), [fitPanel, updateSettings]);

  useEffect(() => {
    if (!settingsLoaded) return;
    applyMinWidth();
  }, [applyMinWidth, settingsLoaded, settings.toolPanel.open, settings.toolPanel.width, settings.history.open, settings.history.width]);

  // The minimum height lets the tool panel scroll, but the window opens tall
  // enough to show all of it (within the screen). Measured after the start-up
  // sizing and font loading have settled.
  useEffect(() => {
    if (!settingsLoaded) return undefined;
    let cancelled = false;
    const timers = [];
    const fit = async () => {
      const size = await platform.windowControls.getSize();
      if (cancelled || (size && size.restored)) return;
      const list = document.querySelector('.tool-list, .tool-strip');
      const missing = list ? list.scrollHeight - list.clientHeight : 0;
      if (missing > 0) {
        platform.windowControls.setSize({ width: window.innerWidth, height: Math.min(window.screen.availHeight, window.innerHeight + missing) });
      }
    };
    timers.push(setTimeout(fit, 600));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!cancelled) timers.push(setTimeout(fit, 600)); });
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [settingsLoaded]);

  const markMissing = useCallback((entry, gone) => {
    setMissing((m) => {
      if (m.has(entry.id) === gone) return m;
      const next = new Set(m);
      if (gone) next.add(entry.id); else next.delete(entry.id);
      return next;
    });
  }, []);

  /** False (with a message) when the entry's file is gone. */
  const entryExists = useCallback(async (entry) => {
    if (!entry.path || !isDesktop) return false;
    const ok = await platform.fs.exists(entry.path).catch(() => false);
    markMissing(entry, !ok);
    if (!ok) toast(t('toast.historyMissing', { name: nameOf(entry.path) }), 'warn');
    return ok;
  }, [markMissing, t, toast]);

  const openHistoryEntry = useCallback(async (entry) => {
    const docId = entryDocs.current.get(entry.id);
    const open = (docId && docsRef.current.find((d) => d.id === docId)) || (entry.path && docForPath(entry.path));
    if (open) { setActiveId(open.id); return; }
    if (!(await entryExists(entry))) return;
    try {
      const doc = await openPath(entry.path);
      if (doc) entryDocs.current.set(entry.id, doc.id);
    } catch (err) { reportError(err, t('error.open')); }
  }, [entryExists, openPath, reportError, t]);

  const revealHistoryEntry = useCallback(async (entry) => {
    if (await entryExists(entry)) platform.shell.showItem(entry.path);
  }, [entryExists]);

  const removeHistoryEntry = useCallback((entry) => {
    setHistory((list) => removeEntry(list, entry.id));
    entryDocs.current.delete(entry.id);
    toast(t('toast.historyRemoved'));
  }, [t, toast]);

  const clearHistory = useCallback(async () => {
    const n = history.length;
    if (!n) return;
    const r = await confirm({
      title: t('history.clearTitle'), message: t('history.clearConfirm', { n }), icon: 'warning',
      buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'ok', label: t('history.clearOk'), kind: 'danger' }],
    });
    if (!r || r.id !== 'ok') return;
    setHistory([]);
    setMissing(new Set());
    entryDocs.current.clear();
    toast(t('toast.historyCleared'));
  }, [confirm, history.length, t, toast]);

  const openCaptureFolder = useCallback(async () => {
    const dir = captureDirectory();
    if (!dir) return;
    try {
      await platform.fs.ensureDir(dir);
      await platform.shell.openPath(dir);
    } catch (err) { reportError(err, dir); }
  }, [captureDirectory, reportError]);

  const historyContextMenu = useCallback((e, entry) => {
    openContextMenu(e.clientX, e.clientY, [
      { label: t('history.open'), icon: 'open', onClick: () => openHistoryEntry(entry) },
      { label: t('history.reveal'), icon: 'folder', disabled: !isDesktop || !entry.path, onClick: () => revealHistoryEntry(entry) },
      { label: t('history.copyPath'), icon: 'copy', disabled: !entry.path, onClick: () => platform.clipboard.writeText(entry.path).then(() => toast(t('toast.pathCopied'))) },
      { label: t('history.openFolder'), icon: 'open', disabled: !isDesktop, onClick: openCaptureFolder },
      'sep',
      { label: t('history.remove'), icon: 'close', onClick: () => removeHistoryEntry(entry) },
      { label: t('history.clear'), icon: 'trash', danger: true, onClick: clearHistory },
      'sep',
      { label: t('history.collapseMenu'), icon: 'chevronRight', shortcut: 'Ctrl+H', onClick: toggleHistory },
    ]);
  }, [clearHistory, openCaptureFolder, openContextMenu, openHistoryEntry, removeHistoryEntry, revealHistoryEntry, t, toast, toggleHistory]);

  // Right-clicks nothing else handled: text fields get an edit menu, the rest of the window this one.
  useEffect(() => installFallbackMenu({
    t,
    open: openContextMenu,
    generalItems: () => {
      const s = settingsRef.current;
      const canCapture = platform.capture.available;
      const rec = !!recordingRef.current;
      return [
        { label: t('toolbar.captureScreen'), icon: 'screen', shortcut: 'Ctrl+N', disabled: !canCapture || rec, onClick: captureScreen },
        { label: t('toolbar.captureWindow'), icon: 'window', shortcut: 'Ctrl+Shift+W', disabled: !canCapture || rec, onClick: captureWindow },
        { label: t('toolbar.captureRegion'), icon: 'region', shortcut: 'Ctrl+Shift+R', disabled: !canCapture || rec, onClick: captureRegion },
        rec
          ? { label: t('toolbar.stopRecord'), icon: 'stop', shortcut: 'Ctrl+Shift+V', onClick: stopRecording }
          : { label: t('toolbar.record'), icon: 'record', shortcut: 'Ctrl+Shift+V', disabled: !canCapture, onClick: startRecording },
        'sep',
        { label: t('toolbar.open'), icon: 'open', shortcut: 'Ctrl+O', onClick: openFile },
        { label: t('toolbar.openUrl'), icon: 'link', shortcut: 'Ctrl+L', onClick: openUrl },
        { label: t('menu.paste'), icon: 'paste', shortcut: 'Ctrl+V', onClick: () => paste() },
        'sep',
        { label: t('toolPanel.title'), icon: 'tools', shortcut: 'Ctrl+B', checked: s.toolPanel.open, onClick: toggleToolPanel },
        { label: t('history.title'), icon: 'recent', shortcut: 'Ctrl+H', checked: s.history.open, onClick: toggleHistory },
        'sep',
        { label: t('toolbar.settings'), icon: 'settings', shortcut: 'Ctrl+,', onClick: openSettings },
        { label: t('toolbar.about'), icon: 'info', shortcut: 'F1', onClick: openAbout },
      ];
    },
  }), [captureRegion, captureScreen, captureWindow, openAbout, openContextMenu, openFile, openSettings, openUrl, paste, startRecording, stopRecording, t, toggleHistory, toggleToolPanel]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (ctrl && !e.shiftKey && k === 'n') { stop(); captureScreen(); return; }
      if (ctrl && e.shiftKey && k === 'w') { stop(); captureWindow(); return; }
      if (ctrl && e.shiftKey && k === 'r') { stop(); captureRegion(); return; }
      if (ctrl && e.shiftKey && k === 'v') { stop(); if (recordingRef.current) stopRecording(); else startRecording(); return; }
      if (ctrl && k === 'o') { stop(); openFile(); return; }
      if (ctrl && k === 'l') { stop(); openUrl(); return; }
      if (ctrl && k === 'p') { stop(); print(); return; }
      if (ctrl && k === ',') { stop(); openSettings(); return; }
      if (e.key === 'F1') { stop(); openAbout(); return; }
      if (ctrl && !e.shiftKey && k === 'h') { stop(); toggleHistory(); return; }
      if (ctrl && !e.shiftKey && k === 'b') { stop(); toggleToolPanel(); return; }
      if (typing) return;
      const doc = docsRef.current.find((d) => d.id === activeRef.current);
      if (ctrl && k === 's') { stop(); if (doc) saveDoc(doc, e.shiftKey); return; }
      if (ctrl && k === 'e') { stop(); if (doc) exportImage(doc); return; }
      if (ctrl && k === 'w') { stop(); if (doc) closeDoc(doc.id); return; }
      if (ctrl && k === 'z' && !e.shiftKey) { stop(); undo(); return; }
      if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { stop(); redo(); return; }
      if (ctrl && k === 'c') { stop(); copy(); return; }
      if (ctrl && k === 'x') { stop(); copy({ cut: true }); return; }
      if (ctrl && k === 'v') { stop(); paste({ asNewDocument: e.altKey }); return; }
      if (ctrl && k === 'a') { stop(); selectAll(); return; }
      if (ctrl && k === 'd') { stop(); duplicateSelected(); return; }
      if (ctrl && (k === '=' || k === '+')) { stop(); zoomIn(); return; }
      if (ctrl && k === '-') { stop(); zoomOut(); return; }
      if (ctrl && k === '0') { stop(); zoomFit(); return; }
      if (ctrl && k === '1') { stop(); zoom100(); return; }
      if (ctrl && e.key === 'Tab') {
        stop();
        const list = docsRef.current;
        if (list.length > 1) { const i = list.findIndex((d) => d.id === activeRef.current); setActiveId(list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length].id); }
        return;
      }
      if (!doc || doc.kind !== 'image') return;
      if (e.key === 'Delete' || e.key === 'Backspace') { stop(); deleteSelection(); return; }
      if (e.key === 'Escape') { stop(); deselect(); setTool('select'); return; }
      if (e.key === 'Enter' && doc.selection) { stop(); applyCrop(); return; }
      if (e.key.startsWith('Arrow') && doc.selectedId) {
        stop();
        const step = e.shiftKey ? 10 : 1;
        nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
        return;
      }
      if (!ctrl && !e.altKey) {
        const map = { v: 'select', p: 'pen', r: 'rect', o: 'ellipse', a: 'arrow', l: 'line', t: 'text', h: 'highlight', m: 'pixelate', n: 'number', c: 'crop' };
        if (map[k]) { stop(); setTool(map[k]); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyCrop, captureRegion, captureScreen, captureWindow, closeDoc, copy, deleteSelection, deselect, duplicateSelected, exportImage, nudge, openAbout, openFile, openSettings, openUrl, paste, print, redo, saveDoc, selectAll, startRecording, stopRecording, toggleHistory, toggleToolPanel, undo, zoom100, zoomFit, zoomIn, zoomOut]);

  // ── Toolbar wiring ──
  const setAnn = useCallback((patch) => updateSettings((s) => ({ annotation: { ...s.annotation, ...patch } })), [updateSettings]);
  const actions = useMemo(() => ({
    captureScreen, captureWindow, captureRegion, startRecording, stopRecording,
    open: openFile, openUrl, recent: openRecentMenu,
    nextTheme: () => updateSettings((s) => ({ theme: nextThemeId(s.theme, s.customThemes) })),
    openThemeMenu,
    save: () => active && saveDoc(active, false), saveAs: () => active && saveDoc(active, true), exportImage: () => active && exportImage(active), print,
    undo, redo, copy: () => copy(), cut: () => copy({ cut: true }), paste: () => paste(), zoomIn, zoomOut, zoomFit, zoom100,
    settings: openSettings, about: openAbout,
    toggleLanguage: () => updateSettings((s) => ({ language: s.language === 'ko' ? 'en' : 'ko' })),
    setTool, onMeasure, openZoomMenu,
  }), [active, openZoomMenu, captureRegion, captureScreen, captureWindow, copy, exportImage, onMeasure, openAbout, openFile, openRecentMenu, openSettings, openThemeMenu, openUrl, paste, print, redo, saveDoc, startRecording, stopRecording, undo, updateSettings, zoom100, zoomFit, zoomIn, zoomOut]);

  const annotationActions = useMemo(() => ({
    setColor: (v) => setAnn({ color: v }), setStrokeWidth: (v) => setAnn({ strokeWidth: v }), setFill: (v) => setAnn({ fill: v }), setFontSize: (v) => setAnn({ fontSize: v }),
  }), [setAnn]);

  const selectionActions = useMemo(() => ({
    setShape: setSelectionShape, selectAll, crop: applyCrop, remove: deleteSelection, deselect,
  }), [applyCrop, deleteSelection, deselect, selectAll, setSelectionShape]);

  const tbState = useMemo(() => ({
    canCapture: platform.capture.available, recording, hasDoc: !!active, isImage: !!(active && active.kind === 'image'),
    canUndo: !!(active && active.history && canUndo(active.history)), canRedo: !!(active && active.history && canRedo(active.history)),
    zoom: active ? active.zoom : 1,
    undoCount: active && active.history ? active.history.past.length : 0, redoCount: active && active.history ? active.history.future.length : 0,
    themeId: settings.theme,
    customThemes: settings.customThemes,
    themeMenuOpen: themeMenuOpen || !!(webMenu && webMenu.kind === 'theme'),
    nextThemeLabel: themeLabel(themeById(nextThemeId(settings.theme, settings.customThemes), settings.customThemes), i18n.language),
    selectedId: active ? active.selectedId : null, hasSelection: !!(active && active.selection),
    fontKey: `${settings.font.family}|${settings.font.size}|${settings.font.bold}|${settings.font.italic}`,
  }), [active, recording, settings, i18n.language, themeMenuOpen, webMenu]);

  const onEditorCommit = useCallback((next, extra) => { if (activeRef.current) commit(activeRef.current, next, extra); }, [commit]);
  const onVideoMeta = useCallback((m) => { if (activeRef.current) updateDoc(activeRef.current, (d) => (d.width === m.width && d.duration === m.duration ? d : { ...d, ...m })); }, [updateDoc]);

  const welcomeAction = useCallback((what) => {
    ({ screen: captureScreen, window: captureWindow, region: captureRegion, record: startRecording, open: openFile, paste }[what] || (() => {}))();
  }, [captureRegion, captureScreen, captureWindow, openFile, paste, startRecording]);

  const theme = themeById(settings.theme, settings.customThemes);

  // Development hook for scripted smoke tests (never in a packaged build).
  useEffect(() => {
    if (info.packaged !== false) return undefined;
    window.__capturemaster = { openPaths, saveDoc, exportImage, print, closeDoc, commit, updateDoc, get docs() { return docsRef.current; }, get active() { return docsRef.current.find((d) => d.id === activeRef.current); }, reportError, settings: settingsRef, updateSettings, history, captureScreen, captureRegion };
    return () => { delete window.__capturemaster; };
  }, [captureRegion, captureScreen, closeDoc, commit, exportImage, history, info.packaged, openPaths, print, reportError, saveDoc, updateDoc, updateSettings]);

  if (!settingsLoaded) return <div className="app booting" />;

  return (
    <div className={`app${platform.windowControls.available ? '' : ' no-frame'}`} style={{ '--side-w': `${settings.history.open ? settings.history.width : 30}px` }}>
      <TitleBar version={info.version} docName={active ? active.name : ''} dirty={!!(active && isDirty(active))} isMac={isMac} />
      <Toolbar s={tbState} a={actions} recentAnchorRef={recentAnchorRef} />
      <Tabs docs={docs} activeId={activeId} onSelect={setActiveId} onClose={closeDoc} onContextMenu={tabContextMenu} />
      <div className="workspace">
      <ToolPanel
        open={settings.toolPanel.open}
        width={settings.toolPanel.width}
        tool={tool}
        enabled={!!(active && active.kind === 'image')}
        selection={{
          shape: active && active.selection ? selectionShape(active.selection) : settings.editor.selectionShape,
          hasSelection: !!(active && active.selection),
          hasAnnotation: !!(active && active.selectedId),
        }}
        onSelection={selectionActions}
        annotation={{ color: toolProps.color, strokeWidth: toolProps.strokeWidth, fill: toolProps.fill, fontSize: toolProps.font.size }}
        onAnnotation={annotationActions}
        onSetTool={actions.setTool}
        onToggle={toggleToolPanel}
        onResize={resizeToolPanel}
      />
      <div className="main" ref={mainRef}>
        {!active ? <Welcome onAction={welcomeAction} canCapture={platform.capture.available} /> : null}
        {active && active.kind === 'image' ? (
          <Editor
            key={active.id}
            ref={editorRef}
            doc={active}
            zoom={active.zoom}
            tool={tool}
            toolProps={toolProps}
            selectionShape={settings.editor.selectionShape}
            selectedId={active.selectedId}
            onZoomChange={setZoom}
            onSelect={selectAnnotation}
            onCommit={onEditorCommit}
            onSelectionChange={setSelection}
            onCursor={setCursor}
            onContextMenu={editorContextMenu}
          />
        ) : null}
        {active && active.kind === 'video' ? <VideoView key={active.id} doc={active} onMeta={onVideoMeta} onContextMenu={videoContextMenu} /> : null}
        {dropping ? <div className="drop-hint">{t('welcome.drop')}</div> : null}
        {countdown ? <div className="countdown"><div>{countdown}</div></div> : null}
      </div>
      <HistoryPanel
        items={history}
        open={settings.history.open}
        width={settings.history.width}
        activePath={active ? active.file || active.path || (active.source && active.source.path) || '' : ''}
        missing={missing}
        canReveal={isDesktop}
        onToggle={toggleHistory}
        onResize={resizeHistory}
        onOpen={openHistoryEntry}
        onReveal={revealHistoryEntry}
        onRemove={removeHistoryEntry}
        onClear={clearHistory}
        onOpenFolder={openCaptureFolder}
        onContextMenu={historyContextMenu}
      />
      </div>
      <StatusBar
        doc={active}
        zoom={active ? active.zoom : 1}
        cursor={cursor}
        tool={tool}
        message={message}
        recording={recording}
        capturing={capturing}
        themeLabel={i18n.language === 'ko' ? theme.label : theme.labelEn}
        docsCount={docs.length}
      />

      {recentOpen ? (
        <Dropdown anchor={recentAnchorRef.current} onClose={() => setRecentOpen(false)}>
          <MenuContent
            payload={recentMenuPayload(settings.recent, t)}
            onChoose={(id, keepOpen) => { if (!keepOpen) setRecentOpen(false); chooseRecent(id, null); }}
          />
        </Dropdown>
      ) : null}
      {webMenu && webMenu.kind === 'theme' ? (
        <Dropdown anchor={webMenu.anchor} onClose={() => setWebMenu(null)}>
          <MenuContent
            payload={themeMenuPayload(settings, i18n.language, t)}
            onChoose={(id) => { setWebMenu(null); chooseTheme(id); }}
          />
        </Dropdown>
      ) : null}

      {ctxMenu ? <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} /> : null}
      <ToastHost toasts={toasts} />
      <TooltipLayer />
      {!platform.dialogs.windowed ? <InPageDialogs /> : null}
    </div>
  );
}

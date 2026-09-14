import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { platform, isElectron, onProgress, newTaskId, emitProgress } from './lib/platform.js';
import { normalizeSettings, addRecent, removeRecent, imageFormatById, imageFormatByExt, IMAGE_FORMATS } from './lib/settings.js';
import { applyTheme, applyFont, appearanceOf, themeById } from './themes.js';
import { push as hPush, undo as hUndo, redo as hRedo, canUndo, canRedo } from './lib/history.js';
import {
  createImageDocument, createVideoDocument, isDirty, serializeCapture, parseCapture,
  kindForPath, nameOf, dirOf, stripExt, stampName, extOf, CAPTURE_EXT, IMAGE_EXTS, VIDEO_EXTS, newId,
} from './lib/document.js';
import { loadImage, bytesToDataUrl, dataUrlToBytes, normalizeToPng, cropImage, canvasToBlob, mimeForExt } from './lib/image.js';
import { renderToCanvas, moveAnnotation } from './lib/render.js';
import { grabSourceFrame, startRecording as startRecorder, supportedVideoFormats } from './lib/capture.js';
import { describeError } from './lib/errors.js';
import { formatBytes } from './lib/format.js';

import { TitleBar, Tabs, StatusBar, Welcome } from './components/chrome.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { Editor, nextZoom, ZOOM_MIN, ZOOM_MAX } from './components/Editor.jsx';
import { VideoView, videoFrameDataUrl } from './components/VideoView.jsx';
import { TooltipLayer, ContextMenu, Dropdown, ToastHost, useToasts } from './components/common.jsx';
import { Icon } from './components/Icons.jsx';
import { InPageDialogs, baseName } from './DialogHost.jsx';

const ANNOTATION_CLIP_PREFIX = 'capturemaster-annotation:';
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

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
  const [dropping, setDropping] = useState(false);
  const [toasts, toast] = useToasts();

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
    })();
    return () => { alive = false; };
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => normalizeSettings({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    applyTheme(settings.theme);
    applyFont(settings.font);
    if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
    document.documentElement.lang = settings.language;
    platform.windowControls.setOpacity(Math.max(0.15, settings.opacity / 100));
    platform.dialogs.broadcastAppearance(appearanceOf(settings));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { platform.saveSettings(settings).catch((err) => reportError(err, 'settings')); }, 300);
  }, [settings, settingsLoaded, i18n, reportError]);

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

  const onMeasure = useCallback((w) => { platform.windowControls.setMinWidth(w); }, []);

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

  // ── Opening files ──
  const openImageBytes = useCallback(async (bytes, name, path, mime) => {
    const raw = await bytesToDataUrl(bytes, mime || mimeForExt(extOf(name)));
    const img = await normalizeToPng(raw);
    return addDoc(createImageDocument(img, { name: stripExt(name), path: null, source: { type: 'file', path } }));
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
      const res = await withProgress(t('progress.opening'), nameOf(p), (id) => platform.fs.readBinary(p, id));
      const doc = await openImageBytes(res.data, res.name, p);
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
    if (isElectron) await openPaths(Array.isArray(res) ? res : [res]);
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
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      if (isElectron) {
        const paths = files.map((f) => (window.electronAPI.getPathForFile ? window.electronAPI.getPathForFile(f) : f.path)).filter(Boolean);
        if (paths.length) await openPaths(paths); else await openWebFiles(files);
      } else await openWebFiles(files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [openPaths, openWebFiles]);

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
        if (!isElectron) return false;
        const target = await platform.pickSavePath({ defaultName: nameOf(doc.path), defaultDir: settingsRef.current.paths.lastSaveDir || dirOf(doc.path), filters: [{ name: t('format.video'), extensions: [extOf(doc.path) || 'webm'] }], title: t('toolbar.saveAs') });
        if (!target) return false;
        await withProgress(t('progress.copying'), nameOf(target), (id) => platform.fs.copyFile(doc.path, target, id));
        rememberRecent(target, 'video');
        toast(t('toast.saved', { name: nameOf(target) }));
        return true;
      }
      const current = docsRef.current.find((d) => d.id === doc.id) || doc;
      const text = serializeCapture(current);
      if (!isElectron) {
        platform.webDownload(new TextEncoder().encode(text), `${current.name}.${CAPTURE_EXT}`, 'application/json');
        updateDoc(current.id, (d) => ({ ...d, savedPresent: d.history.present }));
        return true;
      }
      let target = !saveAs && current.path && extOf(current.path) === CAPTURE_EXT ? current.path : null;
      if (!target) {
        target = await platform.pickSavePath({
          defaultName: `${current.name.replace(/[\\/:*?"<>|]/g, '_')}.${CAPTURE_EXT}`,
          defaultDir: settingsRef.current.paths.lastSaveDir || current.dir || info.pictures,
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
      const fmt = imageFormatById(settingsRef.current.image.format);
      const baseName2 = doc.name.replace(/[\\/:*?"<>|]/g, '_');
      const p = doc.history.present;
      const img = await loadImage(p.image.dataUrl);
      if (!isElectron) {
        const canvas = renderToCanvas(p, img, { region });
        const blob = await canvasToBlob(canvas, fmt.mime, settingsRef.current.image.quality / 100);
        platform.webDownload(new Uint8Array(await blob.arrayBuffer()), `${baseName2}.${fmt.ext}`, fmt.mime);
        return;
      }
      const filters = [
        { name: t(`format.${fmt.id}`), extensions: [fmt.ext] },
        ...IMAGE_FORMATS.filter((f) => f.id !== fmt.id).map((f) => ({ name: t(`format.${f.id}`), extensions: [f.ext] })),
      ];
      const target = await platform.pickSavePath({ defaultName: `${baseName2}.${fmt.ext}`, defaultDir: settingsRef.current.paths.lastExportDir || info.pictures, filters, title: t('toolbar.export') });
      if (!target) return;
      const chosen = imageFormatByExt(extOf(target)) || fmt;
      const finalPath = imageFormatByExt(extOf(target)) ? target : `${target}.${fmt.ext}`;
      await withProgress(t('progress.exporting'), nameOf(finalPath), async (id) => {
        const canvas = renderToCanvas(p, img, { region });
        const blob = await canvasToBlob(canvas, chosen.mime, settingsRef.current.image.quality / 100);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await platform.fs.writeBinary(finalPath, bytes, id);
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
    platform.quit();
  };

  // ── Capture ──
  const performCapture = useCallback(async (grab, label) => {
    const s = settingsRef.current;
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
      if (s.capture.hideWindow) { await platform.capture.hideApp(); await new Promise((r) => setTimeout(r, isMac ? 450 : 320)); }
      let result;
      try {
        result = await grab();
      } finally {
        if (s.capture.hideWindow) await platform.capture.showApp();
      }
      if (!result) return null;
      const img = result.width && result.dataUrl.startsWith('data:image/png') ? { dataUrl: result.dataUrl, width: result.width, height: result.height } : await normalizeToPng(result.dataUrl);
      const doc = addDoc(createImageDocument(img, { name: stampName(label || 'Capture'), source: { type: result.kind || 'screen', name: result.name || '' } }));
      toast(t('toast.captured', { w: img.width, h: img.height }));
      if (s.capture.copyToClipboard) platform.clipboard.writeImage(img.dataUrl).catch(() => {});
      return doc;
    } catch (err) {
      reportError(err, t('error.capture'));
      return null;
    } finally {
      setCapturing('');
      setCountdown(0);
    }
  }, [addDoc, reportError, t, toast]);

  const pickScreen = useCallback(async (kind) => {
    const sources = await platform.capture.listSources({ types: ['screen'], thumbWidth: 360 });
    const screens = sources.filter((x) => x.kind === 'screen');
    if (!screens.length) throw new Error(t('error.noScreen'));
    if (screens.length === 1) return screens[0];
    const r = await ask('sources', { title: kind === 'record' ? t('sources.titleRecord') : t('sources.titleScreen'), kind, sources });
    return r ? screens.find((x) => x.id === r.id) || null : null;
  }, [ask, t]);

  const captureScreen = useCallback(async () => {
    if (!isElectron) { await performCapture(() => grabSourceFrame(null), 'Screen'); return; }
    try {
      const src = await pickScreen('screen');
      if (!src) return;
      await performCapture(() => platform.capture.grabScreen(src.id), 'Screen');
    } catch (err) { reportError(err, t('error.capture')); }
  }, [performCapture, pickScreen, reportError, t]);

  const captureWindow = useCallback(async () => {
    if (!isElectron) { await performCapture(() => grabSourceFrame(null), 'Window'); return; }
    try {
      const sources = await platform.capture.listSources({ types: ['window'], thumbWidth: 360 });
      const r = await ask('sources', { title: t('sources.titleWindow'), kind: 'window', sources });
      if (!r) return;
      await performCapture(async () => {
        try {
          const frame = await grabSourceFrame(r.id);
          return { ...frame, kind: 'window', name: r.name };
        } catch (err) {
          throw new Error(`${t('error.noSource')} (${err.message})`);
        }
      }, 'Window');
    } catch (err) { reportError(err, t('error.capture')); }
  }, [ask, performCapture, reportError, t]);

  const captureRegion = useCallback(async () => {
    try {
      let shot;
      let displayId = null;
      if (isElectron) {
        displayId = await platform.capture.cursorDisplay();
        const sources = await platform.capture.listSources({ types: ['screen'], thumbWidth: 8 });
        const src = sources.find((x) => String(x.displayId) === String(displayId)) || sources[0];
        if (!src) throw new Error(t('error.noScreen'));
        const s = settingsRef.current;
        setCapturing(t('status.capturing'));
        if (s.capture.delay > 0) {
          for (let n = s.capture.delay; n > 0; n--) { if (s.capture.showCountdown) setCountdown(n); setCapturing(t('status.countdown', { n })); await new Promise((r) => setTimeout(r, 1000)); }
          setCountdown(0);
        }
        await platform.capture.hideApp();
        await new Promise((r) => setTimeout(r, isMac ? 450 : 320));
        try { shot = await platform.capture.grabScreen(src.id); } finally { setCapturing(''); }
      } else {
        shot = await grabSourceFrame(null);
      }
      const rect = await ask('region', { title: t('toolbar.captureRegion'), dataUrl: shot.dataUrl, width: shot.width, height: shot.height, displayId });
      if (isElectron) await platform.capture.showApp();
      if (!rect) return;
      const img = await cropImage(shot.dataUrl, rect);
      const doc = addDoc(createImageDocument(img, { name: stampName('Region'), source: { type: 'region', name: shot.name || '' } }));
      toast(t('toast.captured', { w: img.width, h: img.height }));
      if (settingsRef.current.capture.copyToClipboard) platform.clipboard.writeImage(img.dataUrl).catch(() => {});
      return doc;
    } catch (err) {
      if (isElectron) platform.capture.showApp();
      reportError(err, t('error.capture'));
    } finally {
      setCapturing('');
      setCountdown(0);
    }
    return null;
  }, [addDoc, ask, reportError, t, toast]);

  // ── Recording ──
  const finishRecording = useCallback(async (discard) => {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    setRecording(null);
    platform.dialogs.close('recorder');
    try {
      await rec.controller.stop();
      await rec.drain();
      if (isElectron) {
        if (discard) {
          await platform.rec.discard(rec.sinkId);
          toast(t('toast.recordingDiscarded'), 'warn');
        } else {
          const res = await withProgress(t('progress.finishing'), nameOf(rec.path), () => platform.rec.close(rec.sinkId));
          const doc = addDoc(createVideoDocument({ path: rec.path, name: stripExt(nameOf(rec.path)), width: rec.controller.width, height: rec.controller.height, source: { type: 'recording' } }));
          rememberRecent(rec.path, 'video', doc.name);
          toast(t('toast.recordingSaved', { name: nameOf(rec.path) }) + ` (${formatBytes(res ? res.bytes : 0)})`);
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
      if (settingsRef.current.video.minimizeWhileRecording) platform.capture.restoreApp();
    }
  }, [addDoc, rememberRecent, reportError, t, toast, withProgress]);

  const stopRecording = useCallback(() => finishRecording(false), [finishRecording]);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) { await stopRecording(); return; }
    const s = settingsRef.current;
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error(t('error.recorderUnsupported'));
      let sourceId = null;
      if (isElectron) {
        const src = await pickScreen('record');
        if (!src) return;
        sourceId = src.id;
      }
      // Where the file goes is settled before the first frame is captured.
      let path = null;
      let sinkId = null;
      const chunks = [];
      let queue = Promise.resolve();
      const fmtProbe = supportedVideoFormats();
      if (!fmtProbe.length) throw new Error(t('error.recorderUnsupported'));

      const controller = await startRecorder({
        sourceId, fps: s.video.fps, systemAudio: s.video.systemAudio, microphone: s.video.microphone, format: s.video.format, bitrateMbps: s.video.bitrateMbps,
        onChunk: (blob) => {
          if (isElectron) {
            queue = queue.then(async () => {
              if (!sinkId) return;
              const bytes = new Uint8Array(await blob.arrayBuffer());
              await platform.rec.append(sinkId, bytes);
            }).catch((err) => reportError(err, t('error.record')));
          } else chunks.push(blob);
        },
        onEnded: () => finishRecording(false),
        onError: (err) => reportError(err, t('error.record')),
      });
      if (controller.micWarning) toast(t('error.micDenied'), 'warn');

      if (isElectron) {
        const ext = controller.format.ext;
        const dir = s.paths.videoDir || info.videos || info.home || '';
        const defaultName = `${stampName('Recording')}.${ext}`;
        if (s.video.askPath) {
          path = await platform.pickSavePath({ defaultName, defaultDir: dir, filters: [{ name: controller.format.label, extensions: [ext] }], title: t('toolbar.record') });
          if (!path) { await controller.stop(); return; }
        } else {
          path = `${dir}${dir && !/[\\/]$/.test(dir) ? (info.platform === 'win32' ? '\\' : '/') : ''}${defaultName}`;
        }
        sinkId = await platform.rec.open(path);
      }

      const rec = { controller, sinkId, path, chunks, startedAt: controller.startedAt, pausedMs: 0, pausedAt: 0, paused: false, drain: () => queue };
      recordingRef.current = rec;
      setRecording({ startedAt: rec.startedAt, pausedMs: 0 });
      toast(t('toast.recordingStarted'));
      platform.dialogs.open('recorder', { title: t('recorder.title'), startedAt: rec.startedAt, pausedMs: 0, paused: false, appearance: appearance() });
      if (s.video.minimizeWhileRecording) platform.capture.minimizeApp();
    } catch (err) {
      reportError(err, t('error.record'));
    }
  }, [appearance, finishRecording, info, pickScreen, reportError, stopRecording, t, toast]);

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
  const setZoom = useCallback((z) => { if (activeRef.current) updateDoc(activeRef.current, (d) => ({ ...d, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) })); }, [updateDoc]);
  const zoomFit = useCallback(() => { if (activeRef.current) updateDoc(activeRef.current, (d) => ({ ...d, fitRequested: true })); }, [updateDoc]);
  const zoom100 = useCallback(() => setZoom(1), [setZoom]);
  const zoomIn = useCallback(() => { if (editorRef.current) editorRef.current.zoomBy(1); else setZoom(nextZoom(active ? active.zoom : 1, 1)); }, [active, setZoom]);
  const zoomOut = useCallback(() => { if (editorRef.current) editorRef.current.zoomBy(-1); else setZoom(nextZoom(active ? active.zoom : 1, -1)); }, [active, setZoom]);

  const undo = useCallback(() => { const id = activeRef.current; if (id) updateDoc(id, (d) => (d.history ? { ...d, history: hUndo(d.history), selectedId: null } : d)); }, [updateDoc]);
  const redo = useCallback(() => { const id = activeRef.current; if (id) updateDoc(id, (d) => (d.history ? { ...d, history: hRedo(d.history), selectedId: null } : d)); }, [updateDoc]);

  const selectAnnotation = useCallback((sid) => { const id = activeRef.current; if (id) updateDoc(id, (d) => (d.selectedId === sid ? d : { ...d, selectedId: sid })); }, [updateDoc]);
  const setSelection = useCallback((rect) => { const id = activeRef.current; if (id) updateDoc(id, (d) => ({ ...d, selection: rect })); }, [updateDoc]);

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
      updateDoc(doc.id, (d) => ({ ...d, selection: null, selectedId: null, fitRequested: true }));
      setTool('select');
      toast(t('toast.cropped'));
    } catch (err) { reportError(err, 'crop'); }
  }, [commit, reportError, t, toast, updateDoc]);

  // ── Clipboard ──
  const compositeDataUrl = useCallback(async (doc, region) => {
    const p = doc.history.present;
    const img = await loadImage(p.image.dataUrl);
    return renderToCanvas(p, img, { region }).toDataURL('image/png');
  }, []);

  const copy = useCallback(async ({ regionOnly = false, cut = false } = {}) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc || doc.kind !== 'image') { toast(t('toast.nothingToCopy'), 'warn'); return; }
    try {
      const p = doc.history.present;
      const sel = doc.selectedId ? p.annotations.find((a) => a.id === doc.selectedId) : null;
      if (sel && !regionOnly) {
        await platform.clipboard.writeText(ANNOTATION_CLIP_PREFIX + JSON.stringify(sel));
        if (cut) deleteSelected();
        toast(t('toast.copiedAnnotation'));
        return;
      }
      const region = regionOnly || doc.selection ? doc.selection : null;
      await platform.clipboard.writeImage(await compositeDataUrl(doc, region));
      toast(t('toast.copiedImage'));
    } catch (err) { reportError(err, t('error.clipboard')); }
  }, [compositeDataUrl, deleteSelected, reportError, t, toast]);

  const paste = useCallback(async () => {
    try {
      const doc = docsRef.current.find((d) => d.id === activeRef.current);
      const text = await platform.clipboard.readText().catch(() => '');
      if (text && text.startsWith(ANNOTATION_CLIP_PREFIX) && doc && doc.kind === 'image') {
        const a = JSON.parse(text.slice(ANNOTATION_CLIP_PREFIX.length));
        const copyA = { ...moveAnnotation(a, 20, 20), id: newId('a') };
        const p = doc.history.present;
        commit(doc.id, { ...p, annotations: [...p.annotations, copyA] });
        selectAnnotation(copyA.id);
        toast(t('toast.pasted'));
        return;
      }
      const img = await platform.clipboard.readImage();
      if (!img) { toast(t('error.clipboardEmpty'), 'warn'); return; }
      const norm = await normalizeToPng(img.dataUrl);
      addDoc(createImageDocument(norm, { name: stampName('Pasted'), source: { type: 'clipboard' } }));
      toast(t('toast.pasted'));
    } catch (err) { reportError(err, t('error.clipboard')); }
  }, [addDoc, commit, reportError, selectAnnotation, t, toast]);

  // ── Printing ──
  const print = useCallback(async () => {
    const list = docsRef.current;
    if (!list.length) { toast(t('toast.nothingToPrint'), 'warn'); return; }
    const cur = list.find((d) => d.id === activeRef.current);
    const r = await ask('print', {
      title: t('print.title'),
      docs: list.map((d) => ({ id: d.id, name: d.name, kind: d.kind, width: d.kind === 'image' ? d.history.present.image.width : d.width, height: d.kind === 'image' ? d.history.present.image.height : d.height })),
      currentId: cur ? cur.id : null,
      hasSelection: !!(cur && cur.selection),
    });
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
  }, [ask, reportError, t, toast, withProgress]);

  // ── Dialog launchers ──
  const openSettings = useCallback(() => {
    platform.dialogs.open('settings', { title: t('settings.title'), settings: settingsRef.current, videoFormats: supportedVideoFormats(), appearance: appearance() });
  }, [appearance, t]);
  const openAbout = useCallback(() => {
    platform.dialogs.open('about', { title: t('about.title'), info, appearance: appearance() });
  }, [appearance, info, t]);

  // ── Context menus ──
  const editorContextMenu = useCallback((e, { annotation }) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc) return;
    const items = [];
    if (annotation) {
      if (annotation.type === 'text') items.push({ label: t('menu.editText'), icon: 'text', onClick: () => editorRef.current && editorRef.current.editText(annotation.id) });
      items.push(
        { label: t('menu.cut'), icon: 'copy', shortcut: 'Ctrl+X', onClick: () => copy({ cut: true }) },
        { label: t('menu.copy'), icon: 'copy', shortcut: 'Ctrl+C', onClick: () => copy() },
        { label: t('menu.duplicate'), icon: 'duplicate', shortcut: 'Ctrl+D', onClick: duplicateSelected },
        { label: t('menu.delete'), icon: 'trash', shortcut: 'Del', danger: true, onClick: deleteSelected },
        'sep',
        { label: t('menu.bringFront'), icon: 'front', onClick: () => reorder(true) },
        { label: t('menu.sendBack'), icon: 'back', onClick: () => reorder(false) },
        'sep',
      );
    } else {
      items.push(
        { label: t('menu.paste'), icon: 'paste', shortcut: 'Ctrl+V', onClick: paste },
        { label: t('menu.copyImage'), icon: 'copy', onClick: () => { selectAnnotation(null); copy({ regionOnly: false }); } },
        { label: t('menu.copySelection'), icon: 'region', disabled: !doc.selection, onClick: () => copy({ regionOnly: true }) },
        { label: t('menu.cropToSelection'), icon: 'crop', shortcut: 'Enter', disabled: !doc.selection, onClick: applyCrop },
        { label: t('menu.deselect'), icon: 'close', shortcut: 'Esc', disabled: !doc.selection && !doc.selectedId, onClick: () => { setSelection(null); selectAnnotation(null); } },
        'sep',
      );
    }
    items.push(
      { label: t('toolbar.undo'), icon: 'undo', shortcut: 'Ctrl+Z', disabled: !canUndo(doc.history), onClick: undo },
      { label: t('toolbar.redo'), icon: 'redo', shortcut: 'Ctrl+Y', disabled: !canRedo(doc.history), onClick: redo },
      'sep',
      { label: t('menu.zoomFit'), icon: 'fit', shortcut: 'Ctrl+0', onClick: zoomFit },
      { label: t('menu.zoom100'), icon: 'actual', shortcut: 'Ctrl+1', onClick: zoom100 },
    );
    setCtxMenu({ x: e.clientX, y: e.clientY, items });
  }, [applyCrop, copy, deleteSelected, duplicateSelected, paste, redo, reorder, selectAnnotation, setSelection, t, undo, zoom100, zoomFit]);

  const videoContextMenu = useCallback((e) => {
    const doc = docsRef.current.find((d) => d.id === activeRef.current);
    if (!doc) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, items: [
      { label: t('toolbar.saveAs'), icon: 'saveAs', onClick: () => saveDoc(doc, true) },
      { label: t('tabs.showInFolder'), icon: 'folder', disabled: !isElectron || !doc.path, onClick: () => platform.shell.showItem(doc.path) },
      { label: t('toolbar.print'), icon: 'print', onClick: print },
    ] });
  }, [print, saveDoc, t]);

  const tabContextMenu = useCallback((e, d) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, items: [
      { label: t('tabs.close'), icon: 'close', onClick: () => closeDoc(d.id) },
      { label: t('tabs.closeOthers'), icon: 'close', disabled: docsRef.current.length < 2, onClick: async () => { for (const o of docsRef.current.filter((x) => x.id !== d.id)) if (!(await closeDoc(o.id))) break; } },
      { label: t('tabs.closeAll'), icon: 'close', onClick: async () => { for (const o of [...docsRef.current]) if (!(await closeDoc(o.id))) break; } },
      'sep',
      { label: t('tabs.rename'), icon: 'text', disabled: d.kind !== 'image', onClick: async () => { const r = await ask('prompt#rename', { title: t('prompt.renameTitle'), label: t('prompt.renameLabel'), value: d.name }); if (r && r.value) updateDoc(d.id, (x) => ({ ...x, name: r.value })); } },
      { label: t('tabs.showInFolder'), icon: 'folder', disabled: !isElectron || !d.path, onClick: () => platform.shell.showItem(d.path) },
    ] });
  }, [ask, closeDoc, t, updateDoc]);

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
      if (typing) return;
      const doc = docsRef.current.find((d) => d.id === activeRef.current);
      if (ctrl && k === 's') { stop(); if (doc) saveDoc(doc, e.shiftKey); return; }
      if (ctrl && k === 'e') { stop(); if (doc) exportImage(doc); return; }
      if (ctrl && k === 'w') { stop(); if (doc) closeDoc(doc.id); return; }
      if (ctrl && k === 'z' && !e.shiftKey) { stop(); undo(); return; }
      if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { stop(); redo(); return; }
      if (ctrl && k === 'c') { stop(); copy(); return; }
      if (ctrl && k === 'x') { stop(); copy({ cut: true }); return; }
      if (ctrl && k === 'v') { stop(); paste(); return; }
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
      if (e.key === 'Delete' || e.key === 'Backspace') { stop(); deleteSelected(); return; }
      if (e.key === 'Escape') { stop(); setSelection(null); selectAnnotation(null); setTool('select'); return; }
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
  }, [applyCrop, captureRegion, captureScreen, captureWindow, closeDoc, copy, deleteSelected, duplicateSelected, exportImage, nudge, openAbout, openFile, openSettings, openUrl, paste, print, redo, saveDoc, selectAnnotation, setSelection, startRecording, stopRecording, undo, zoom100, zoomFit, zoomIn, zoomOut]);

  // ── Toolbar wiring ──
  const setAnn = useCallback((patch) => updateSettings((s) => ({ annotation: { ...s.annotation, ...patch } })), [updateSettings]);
  const actions = useMemo(() => ({
    captureScreen, captureWindow, captureRegion, startRecording, stopRecording,
    open: openFile, openUrl, recent: () => setRecentOpen((v) => !v),
    save: () => active && saveDoc(active, false), saveAs: () => active && saveDoc(active, true), exportImage: () => active && exportImage(active), print,
    undo, redo, copy: () => copy(), paste, zoomIn, zoomOut, zoomFit, zoom100,
    settings: openSettings, about: openAbout,
    toggleLanguage: () => updateSettings((s) => ({ language: s.language === 'ko' ? 'en' : 'ko' })),
    setOpacity: (v) => updateSettings({ opacity: v }),
    setTool, setColor: (v) => setAnn({ color: v }), setStrokeWidth: (v) => setAnn({ strokeWidth: v }), setFill: (v) => setAnn({ fill: v }), setFontSize: (v) => setAnn({ fontSize: v }),
    deleteSelected, applyCrop, onMeasure,
  }), [active, applyCrop, captureRegion, captureScreen, captureWindow, copy, deleteSelected, exportImage, onMeasure, openAbout, openFile, openSettings, openUrl, paste, print, redo, saveDoc, setAnn, startRecording, stopRecording, undo, updateSettings, zoom100, zoomFit, zoomIn, zoomOut]);

  const tbState = useMemo(() => ({
    canCapture: platform.capture.available, recording, hasDoc: !!active, isImage: !!(active && active.kind === 'image'),
    canUndo: !!(active && active.history && canUndo(active.history)), canRedo: !!(active && active.history && canRedo(active.history)),
    tool, color: toolProps.color, strokeWidth: toolProps.strokeWidth, fill: toolProps.fill, fontSize: toolProps.font.size,
    opacity: settings.opacity, selectedId: active ? active.selectedId : null, hasSelection: !!(active && active.selection),
    fontKey: `${settings.font.family}|${settings.font.size}|${settings.font.bold}|${settings.font.italic}`,
  }), [active, recording, settings, tool, toolProps]);

  const onEditorCommit = useCallback((next, extra) => { if (activeRef.current) commit(activeRef.current, next, extra); }, [commit]);
  const onFitDone = useCallback(() => { if (activeRef.current) updateDoc(activeRef.current, (d) => (d.fitRequested ? { ...d, fitRequested: false } : d)); }, [updateDoc]);
  const onVideoMeta = useCallback((m) => { if (activeRef.current) updateDoc(activeRef.current, (d) => (d.width === m.width && d.duration === m.duration ? d : { ...d, ...m })); }, [updateDoc]);

  const welcomeAction = useCallback((what) => {
    ({ screen: captureScreen, window: captureWindow, region: captureRegion, record: startRecording, open: openFile, paste }[what] || (() => {}))();
  }, [captureRegion, captureScreen, captureWindow, openFile, paste, startRecording]);

  const theme = themeById(settings.theme);

  // Development hook for scripted smoke tests (never in a packaged build).
  useEffect(() => {
    if (info.packaged !== false) return undefined;
    window.__capturemaster = { openPaths, saveDoc, exportImage, print, closeDoc, get docs() { return docsRef.current; }, get active() { return docsRef.current.find((d) => d.id === activeRef.current); }, reportError, settings: settingsRef, updateSettings };
    return () => { delete window.__capturemaster; };
  }, [closeDoc, exportImage, info.packaged, openPaths, print, reportError, saveDoc, updateSettings]);

  return (
    <div className={`app${platform.windowControls.available ? '' : ' no-frame'}`}>
      <TitleBar version={info.version} docName={active ? active.name : ''} dirty={!!(active && isDirty(active))} isMac={isMac} />
      <Toolbar s={tbState} a={actions} recentAnchorRef={recentAnchorRef} />
      <Tabs docs={docs} activeId={activeId} onSelect={setActiveId} onClose={closeDoc} onContextMenu={tabContextMenu} />
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
            selectedId={active.selectedId}
            checkerboard={settings.editor.checkerboard}
            onZoomChange={setZoom}
            onSelect={selectAnnotation}
            onCommit={onEditorCommit}
            onSelectionChange={setSelection}
            onCursor={setCursor}
            onContextMenu={editorContextMenu}
            onFitDone={onFitDone}
          />
        ) : null}
        {active && active.kind === 'video' ? <VideoView key={active.id} doc={active} onMeta={onVideoMeta} onContextMenu={videoContextMenu} /> : null}
        {dropping ? <div className="drop-hint">{t('welcome.drop')}</div> : null}
        {countdown ? <div className="countdown"><div>{countdown}</div></div> : null}
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
          {settings.recent.length ? settings.recent.map((r) => (
            <div key={r.path} className="dd-item" onClick={() => { setRecentOpen(false); if (isElectron) openPaths([r.path]); }} title={r.path}>
              <Icon name={r.kind === 'video' ? 'video' : r.kind === 'image' ? 'image' : 'file'} size={15} />
              <div className="name"><div>{r.name}</div><div className="path">{r.path}</div></div>
              <button className="x" data-tip={t('menu.removeRecent')} onClick={(e) => { e.stopPropagation(); updateSettings((s) => ({ recent: removeRecent(s.recent, r.path) })); }}><Icon name="close" /></button>
            </div>
          )) : <div className="dd-empty">{t('recent.empty')}</div>}
          <div className="dd-footer">
            <button className="btn small" disabled={!settings.recent.length} onClick={() => { updateSettings({ recent: [] }); setRecentOpen(false); }}><Icon name="trash" />{t('menu.clearRecent')}</button>
          </div>
        </Dropdown>
      ) : null}

      {ctxMenu ? <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} /> : null}
      <ToastHost toasts={toasts} />
      <TooltipLayer />
      {!platform.dialogs.windowed ? <InPageDialogs /> : null}
    </div>
  );
}

// The main window: the start screen or the editor, under one title bar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLanguage, setLanguage, t } from './i18n.js';
import { loadSettings, saveSettings, SESSION_KEY, PRINT_KEY } from './lib/settings.js';
import { applyTheme } from './lib/themes.js';
import { createHistory } from './lib/history.js';
import {
  CANVAS, alignObject, bbox, buildIco, buildIcoEach, buildIcns, buildPngs, cloneObject, createObject, moveObject, pngDataUrl, resizeObject, selectionSvg, serializeSvg,
} from './lib/iconCanvas.js';
import { addRecent, baseName, emptyDesign, FILE_EXTENSION, parseDesign, serializeDesign } from './lib/project.js';
import { TEMPLATE_BY_ID } from './lib/templates.js';
import { EXAMPLE_BY_ID } from './lib/examples.js';
import {
  USER_EMOJI_KEY, USER_EXAMPLES_KEY, addUserEmoji, addUserExample, loadUserEmoji, loadUserExamples, removeUserEmoji, removeUserExample,
} from './lib/userLibrary.js';
import { ALL_INPUT_EXTS, toDisplayable } from './lib/decode.js';
import { MODEL_EXTS, isModelFile, loadModel } from './lib/model3d.js';
import Model3DDialog from './components/Model3DDialog.jsx';
import {
  chooseOpenPaths, invoke, isDesktop, openBrowserWindow, openGuide, pickBrowserFiles, saveBytes, saveMany, currentWindow,
} from './lib/platform.js';
import IconCanvas from './components/IconCanvas.jsx';
import LeftPanel, { isShapeTool, objectName, TOOL_KEYS, TOOLS } from './components/LeftPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import Rulers from './components/Rulers.jsx';
import { PreviewStrip, StatusBar, TitleBar, Toolbar, useListen } from './components/Chrome.jsx';
import { AboutDialog, ConfirmDialog, ErrorDialog } from './components/Dialogs.jsx';
import { Btn, ContextMenu, Icon, Modal } from './components/controls.jsx';
import StartScreen from './start/StartScreen.jsx';
import { SETTINGS_TAB_KEY } from './windows/SettingsWindow.jsx';

const ERROR_KEYS = { BAD_FILE: 'error.badFile', NEWER_FILE: 'error.newerFile', NO_SIZES: 'export.pickSize' };
const toError = (err) => {
  const e = err instanceof Error ? err : new Error(String(err));
  if (ERROR_KEYS[e.message]) return new Error(t(ERROR_KEYS[e.message]));
  return e;
};

function loadDims(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 512, h: img.naturalHeight || 512 });
    img.onerror = () => reject(new Error(t('error.image')));
    img.src = src;
  });
}

/** A picture reduced to at most `max` pixels (PNG) when it is a bigger bitmap; SVG stays as it is. */
async function shrinkPicture(url, max) {
  if (url.startsWith('data:image/svg')) return url;
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale >= 1 && url.startsWith('data:')) return url;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function readSession() {
  try {
    const text = localStorage.getItem(SESSION_KEY);
    if (!text) return null;
    const { design, path, name } = JSON.parse(text);
    return { design: parseDesign(design), path: path ?? null, name: name ?? '' };
  } catch {
    return null;
  }
}

export default function App({ startupFiles = [] }) {
  const [settings, setSettingsState] = useState(() => loadSettings());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const setSettings = useCallback((patch) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  const [, setLangTick] = useState(0);
  const lang = settings.language;

  const [screen, setScreen] = useState(() => (settings.showStartScreen && !startupFiles.length ? 'start' : 'editor'));
  const [design, setDesignState] = useState(() => (settings.showStartScreen ? emptyDesign() : readSession()?.design ?? emptyDesign()));
  const designRef = useRef(design);
  designRef.current = design;
  const [file, setFile] = useState({ path: null, name: '' });
  const [dirty, setDirty] = useState(false);
  const historyRef = useRef(createHistory());
  const [, setHistoryTick] = useState(0);

  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select');
  const [category, setCategory] = useState('basic');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cursor, setCursor] = useState(null);
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState('');
  const [ctx, setCtx] = useState(null);
  const [about, setAbout] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [popupFrame, setPopupFrame] = useState(null); // web: 'print' | 'settings' in a frame
  const [exporting, setExporting] = useState(false);
  const clipboard = useRef(null);
  const hostRef = useRef(null);
  const hasSession = useMemo(() => Boolean(localStorage.getItem(SESSION_KEY)), [screen]);

  // ── Language and theme ─────────────────────────────────────────────
  useEffect(() => {
    setLanguage(lang);
    setLangTick((n) => n + 1);
    if (isDesktop()) invoke('set_language', { language: lang }).catch(() => {});
  }, [lang]);
  useEffect(() => { applyTheme(settings.theme, undefined, settings.customTheme); }, [settings.theme, settings.customTheme]);
  // Other windows (guide, print) change the shared settings too.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === 'myicomaker.settings') setSettingsState(loadSettings()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // The window appears once the page has drawn.
  useEffect(() => {
    if (isDesktop()) requestAnimationFrame(() => invoke('main_ready').catch(() => {}));
  }, []);

  const flash = useCallback((text) => {
    setToast(text);
    setMessage(text);
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => setToast(''), 2600);
  }, []);
  const showError = useCallback((err) => setError(toError(err)), []);

  // ── Design changes (undo/redo) ─────────────────────────────────────
  const record = useCallback((key = null) => {
    historyRef.current.push(designRef.current, key);
    setHistoryTick((n) => n + 1);
  }, []);
  const apply = useCallback((fn, { record: rec = true, key = null } = {}) => {
    if (rec) record(key);
    setDesignState((prev) => {
      const next = fn(prev);
      designRef.current = next;
      return next;
    });
    setDirty(true);
  }, [record]);
  const setDesign = useCallback((patch, key = null) => apply((d) => ({ ...d, ...patch }), { key }), [apply]);
  const replaceDesign = useCallback((next, nextFile = { path: null, name: '' }) => {
    historyRef.current.clear();
    setHistoryTick((n) => n + 1);
    designRef.current = next;
    setDesignState(next);
    setFile(nextFile);
    setDirty(false);
    setSelectedId(null);
    setTool('select');
    setPan({ x: 0, y: 0 });
  }, []);
  const undo = useCallback(() => {
    const prev = historyRef.current.undo(designRef.current);
    if (!prev) return;
    designRef.current = prev;
    setDesignState(prev);
    setDirty(true);
    setHistoryTick((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const next = historyRef.current.redo(designRef.current);
    if (!next) return;
    designRef.current = next;
    setDesignState(next);
    setDirty(true);
    setHistoryTick((n) => n + 1);
  }, []);

  // The work in progress survives a restart (start screen › Continue).
  useEffect(() => {
    if (screen !== 'editor') return undefined;
    const timer = setTimeout(() => {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ design: serializeDesign(design), path: file.path, name: file.name })); } catch { /* too big for the storage: not kept */ }
    }, 800);
    return () => clearTimeout(timer);
  }, [design, file, screen]);

  const sel = design.objects.find((o) => o.id === selectedId) ?? null;
  const updateSel = useCallback((patch, key = null) => {
    if (!selectedId) return;
    apply((d) => ({ ...d, objects: d.objects.map((o) => (o.id === selectedId ? { ...o, ...patch } : o)) }), { key: key ? `${selectedId}:${key}` : null });
  }, [selectedId, apply]);
  const updateFx = useCallback((patch, key = null) => {
    if (!selectedId) return;
    apply((d) => ({ ...d, objects: d.objects.map((o) => (o.id === selectedId ? { ...o, fx: { ...o.fx, ...patch } } : o)) }), { key: key ? `${selectedId}:fx:${key}` : null });
  }, [selectedId, apply]);
  const mapSelected = useCallback((fn, key = null) => {
    if (!selectedId) return;
    apply((d) => ({ ...d, objects: d.objects.map((o) => (o.id === selectedId ? fn(o) : o)) }), { key });
  }, [selectedId, apply]);

  const deleteObject = useCallback((id) => {
    apply((d) => ({ ...d, objects: d.objects.filter((o) => o.id !== id) }));
    setSelectedId((s) => (s === id ? null : s));
  }, [apply]);
  const duplicate = useCallback((id) => {
    const o = designRef.current.objects.find((x) => x.id === id);
    if (!o) return;
    const copy = cloneObject(o);
    apply((d) => ({ ...d, objects: [...d.objects, copy] }));
    setSelectedId(copy.id);
  }, [apply]);
  const reorder = useCallback((id, dir) => {
    apply((d) => {
      const i = d.objects.findIndex((o) => o.id === id);
      if (i < 0) return d;
      const arr = [...d.objects];
      const [o] = arr.splice(i, 1);
      if (dir === 'front') arr.push(o);
      else if (dir === 'back') arr.unshift(o);
      else if (dir === 'up') arr.splice(Math.min(arr.length, i + 1), 0, o);
      else arr.splice(Math.max(0, i - 1), 0, o);
      return { ...d, objects: arr };
    });
  }, [apply]);
  const onLayer = useCallback((id, what) => {
    if (what === 'delete') deleteObject(id);
    else if (what === 'up' || what === 'down') reorder(id, what);
    else apply((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, [what]: !o[what] } : o)) }));
  }, [apply, deleteObject, reorder]);

  const onAction = useCallback((action, arg) => {
    if (!selectedId) return undefined;
    switch (action) {
      case 'align': return mapSelected((o) => alignObject(o, arg));
      case 'center': return mapSelected((o) => alignObject(alignObject(o, 'hcenter'), 'vcenter'));
      case 'fillCanvas': return mapSelected((o) => ({ ...resizeObject(o, { x: 32, y: 32, w: CANVAS - 64, h: CANVAS - 64 }), rotate: 0 }));
      case 'flipH': return mapSelected((o) => ({ ...o, flipX: !o.flipX }));
      case 'flipV': return mapSelected((o) => ({ ...o, flipY: !o.flipY }));
      case 'rotate': return mapSelected((o) => ({ ...o, rotate: ((((o.rotate || 0) + arg) % 360) + 360) % 360 }));
      case 'order': return reorder(selectedId, arg);
      case 'duplicate': return duplicate(selectedId);
      case 'delete': return deleteObject(selectedId);
      default: return undefined;
    }
  }, [selectedId, mapSelected, reorder, duplicate, deleteObject]);

  // ── Zoom ───────────────────────────────────────────────────────────
  const fitZoom = useCallback(() => {
    const host = hostRef.current;
    if (!host) { setZoom(1); return; }
    const r = host.getBoundingClientRect();
    setZoom(Math.max(0.2, Math.min(4, (Math.min(r.width, r.height) - 56) / CANVAS)));
    setPan({ x: 0, y: 0 });
  }, []);
  useEffect(() => { if (screen === 'editor') requestAnimationFrame(fitZoom); }, [screen, fitZoom]);

  // ── Files ──────────────────────────────────────────────────────────
  const rememberRecent = useCallback(async (path, doc) => {
    let thumb = '';
    try { thumb = await pngDataUrl(doc, 48); } catch { /* no thumbnail */ }
    setSettings({ recent: addRecent(settingsRef.current.recent, { path, name: baseName(path), time: Date.now(), thumb }) });
  }, [setSettings]);

  /** Runs `next` now, or after asking when there are unsaved changes. */
  const whenSaved = useCallback((next) => {
    if (!dirty || !designRef.current.objects.length) { next(); return; }
    setConfirm({
      title: t('confirm.unsavedTitle'),
      message: t('confirm.unsaved'),
      okLabel: t('confirm.discard'),
      okIcon: 'trash',
      onOk: () => { setConfirm(null); next(); },
      extra: <Btn icon="save" label={t('action.save')} onClick={async () => { setConfirm(null); if (await saveRef.current(false)) next(); }} />,
    });
  }, [dirty]);

  const openPath = useCallback(async (path) => {
    try {
      const text = await invoke('read_text_file', { path });
      const doc = parseDesign(text);
      replaceDesign(doc, { path, name: baseName(path) });
      setScreen('editor');
      rememberRecent(path, doc);
      flash(t('file.opened', { name: baseName(path) }));
    } catch (err) {
      if (/os error 2|not found|찾을 수 없/i.test(String(err?.message ?? err))) {
        setSettings({ recent: settingsRef.current.recent.filter((r) => r.path !== path) });
      }
      showError(err);
    }
  }, [replaceDesign, rememberRecent, flash, showError, setSettings]);

  const openDesign = useCallback(() => whenSaved(async () => {
    try {
      if (isDesktop()) {
        const [path] = await chooseOpenPaths(t('file.filter'), [FILE_EXTENSION]);
        if (path) await openPath(path);
      } else {
        const [f] = await pickBrowserFiles(`.${FILE_EXTENSION},application/json`);
        if (!f) return;
        replaceDesign(parseDesign(await f.text()), { path: null, name: baseName(f.name) });
        setScreen('editor');
      }
    } catch (err) { showError(err); }
  }), [whenSaved, openPath, replaceDesign, showError]);

  const saveDesign = useCallback(async (as) => {
    try {
      const name = file.name || t('doc.defaultName');
      const text = serializeDesign(designRef.current, name);
      if (isDesktop()) {
        let path = as ? null : file.path;
        if (!path) {
          const { chooseSavePath } = await import('./lib/platform.js');
          path = await chooseSavePath(`${name}.${FILE_EXTENSION}`, t('file.filter'), [FILE_EXTENSION]);
        }
        if (!path) return false;
        await invoke('write_text_file', { path, content: text });
        setFile({ path, name: baseName(path) });
        rememberRecent(path, designRef.current);
        flash(t('file.saved', { path }));
      } else {
        const { download } = await import('./lib/platform.js');
        download(new TextEncoder().encode(text), `${name}.${FILE_EXTENSION}`);
        flash(t('file.downloaded', { name: `${name}.${FILE_EXTENSION}` }));
      }
      setDirty(false);
      return true;
    } catch (err) { showError(err); return false; }
  }, [file, rememberRecent, flash, showError]);
  const saveRef = useRef(saveDesign);
  saveRef.current = saveDesign;

  const addImage = useCallback(async (source) => {
    const url = await toDisplayable(source);
    const { w, h } = await loadDims(url);
    const s = Math.min(400 / w, 400 / h, 1.5);
    const dw = Math.round(w * s);
    const dh = Math.round(h * s);
    const o = { ...createObject('image', Math.round((CANVAS - dw) / 2), Math.round((CANVAS - dh) / 2)), w: dw, h: dh, href: url, name: source.name };
    apply((d) => ({ ...d, objects: [...d.objects, o] }));
    setSelectedId(o.id);
    setTool('select');
  }, [apply]);

  /** An emoji in the middle of the canvas (vector art, 288 px), selected. */
  const addEmoji = useCallback((id) => {
    const size = 288;
    const o = { ...createObject('emoji', (CANVAS - size) / 2, (CANVAS - size) / 2), w: size, h: size, emoji: id };
    apply((d) => ({ ...d, objects: [...d.objects, o] }));
    setSelectedId(o.id);
    setTool('select');
  }, [apply]);

  /** Picture files chosen by the user, as sources for toDisplayable(). */
  const pickPictures = useCallback(async () => {
    if (isDesktop()) {
      const paths = await chooseOpenPaths(t('file.imageFilter'), ALL_INPUT_EXTS, true);
      const out = [];
      for (const path of paths) {
        const base64 = await invoke('read_base64_file', { path });
        out.push({ name: path.split(/[\\/]/).pop(), dataUrl: `data:application/octet-stream;base64,${base64}`, ext: path.split('.').pop().toLowerCase() });
      }
      return out;
    }
    const files = await pickBrowserFiles(`image/*,${ALL_INPUT_EXTS.map((e) => `.${e}`).join(',')}`, true);
    return files.map((f) => ({ name: f.name, file: f }));
  }, []);

  const importImages = useCallback(async () => {
    try {
      for (const source of await pickPictures()) await addImage(source);
    } catch (err) { showError(err); }
  }, [addImage, pickPictures, showError]);

  // ── My emoji and my examples (what the user adds) ──────────────────
  const [userEmoji, setUserEmoji] = useState(() => loadUserEmoji());
  const [userExamples, setUserExamples] = useState(() => loadUserExamples());
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === USER_EMOJI_KEY) setUserEmoji(loadUserEmoji());
      if (e.key === USER_EXAMPLES_KEY) setUserExamples(loadUserExamples());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const libraryError = useCallback((err) => {
    const code = String(err?.message ?? err);
    if (code === 'STORAGE_FULL' || code === 'LIBRARY_FULL') flash(t(`library.${code === 'STORAGE_FULL' ? 'storageFull' : 'full'}`));
    else showError(err);
  }, [flash, showError]);

  /** Pictures from files become "My emoji" (big bitmaps are reduced to 256 px to keep the list small). */
  const addUserEmojiFromFiles = useCallback(async () => {
    try {
      let added = 0;
      for (const source of await pickPictures()) {
        const href = await shrinkPicture(await toDisplayable(source), 256);
        addUserEmoji({ name: source.name.replace(/\.[^.]+$/, ''), href });
        added += 1;
      }
      setUserEmoji(loadUserEmoji());
      if (added) flash(t('library.emojiAdded', { n: added }));
    } catch (err) { libraryError(err); }
  }, [pickPictures, flash, libraryError]);

  /** The selected object (as vector art, cropped to it) becomes one of "My emoji". */
  const addUserEmojiFromSelection = useCallback(() => {
    const o = designRef.current.objects.find((x) => x.id === selectedId);
    if (!o) { flash(t('library.selectFirst')); return; }
    try {
      const svg = selectionSvg([o]);
      addUserEmoji({ name: objectName(o), href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      setUserEmoji(loadUserEmoji());
      flash(t('library.emojiAdded', { n: 1 }));
    } catch (err) { libraryError(err); }
  }, [selectedId, flash, libraryError]);

  /** One of "My emoji" in the middle of the canvas, as a picture (at most 288 px). */
  const insertUserEmoji = useCallback(async (item) => {
    try {
      const { w, h } = await loadDims(item.href);
      const s = Math.min(288 / w, 288 / h);
      const dw = Math.max(1, Math.round(w * s));
      const dh = Math.max(1, Math.round(h * s));
      const o = { ...createObject('image', Math.round((CANVAS - dw) / 2), Math.round((CANVAS - dh) / 2)), w: dw, h: dh, href: item.href, name: item.name };
      apply((d) => ({ ...d, objects: [...d.objects, o] }));
      setSelectedId(o.id);
      setTool('select');
    } catch (err) { showError(err); }
  }, [apply, showError]);

  const deleteUserEmoji = useCallback((item) => setConfirm({
    title: t('library.removeEmojiTitle'), message: t('library.removeEmoji', { name: item.name }), okLabel: t('edit.delete'), okIcon: 'trash',
    onOk: () => { setConfirm(null); try { setUserEmoji(removeUserEmoji(item.id)); } catch (err) { libraryError(err); } },
  }), [libraryError]);

  /** The current design becomes one of "My examples" on the start screen. */
  const saveAsExample = useCallback(() => {
    const doc = designRef.current;
    if (!doc.objects.length) { flash(t('library.emptyDesign')); return; }
    try {
      const name = file.name || t('library.exampleName', { n: loadUserExamples().length + 1 });
      addUserExample({ name, design: doc, thumb: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeSvg(doc, 96))}` });
      setUserExamples(loadUserExamples());
      flash(t('library.exampleAdded', { name }));
    } catch (err) { libraryError(err); }
  }, [file.name, flash, libraryError]);

  const deleteUserExample = useCallback((item) => setConfirm({
    title: t('library.removeExampleTitle'), message: t('library.removeExample', { name: item.name }), okLabel: t('edit.delete'), okIcon: 'trash',
    onOk: () => { setConfirm(null); try { setUserExamples(removeUserExample(item.id)); } catch (err) { libraryError(err); } },
  }), [libraryError]);

  // ── 3D models ──────────────────────────────────────────────────────
  const [model3d, setModel3d] = useState(null); // { name, object } while the import window is open
  const openModel = useCallback(async (name, buffer) => {
    // A big model takes a moment: the pointer shows it is busy (no message to clear afterwards).
    document.documentElement.classList.add('busy');
    try {
      setModel3d({ name, object: await loadModel(name, buffer) });
    } catch (err) {
      if (err?.message === 'BAD_MODEL') showError(new Error(t('model3d.bad', { name, detail: err.cause?.message ?? '' })));
      else showError(err);
    } finally {
      document.documentElement.classList.remove('busy');
    }
  }, [showError]);
  const placeModel = useCallback(async ({ name, url }) => {
    setModel3d(null);
    setScreen('editor');
    try { await addImage({ name, dataUrl: url, ext: 'png' }); } catch (err) { showError(err); }
  }, [addImage, showError]);
  const importModel = useCallback(async () => {
    try {
      if (isDesktop()) {
        const [path] = await chooseOpenPaths(t('model3d.filter'), MODEL_EXTS, false);
        if (path) await openIncoming([{ name: path.split(/[\\/]/).pop(), path }]);
      } else {
        const [file] = await pickBrowserFiles(MODEL_EXTS.map((e) => `.${e}`).join(','), false);
        if (file) await openIncoming([{ name: file.name, file }]);
      }
    } catch (err) { showError(err); }
  }, [showError]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Files from outside (dropped on the window — desktop paths or browser files — or pasted):
   * a design opens, pictures go on the canvas, a 3D model opens the 3D import window.
   */
  const openIncoming = useCallback(async (items) => {
    const bytes = async (item) => (item.file ? new Uint8Array(await item.file.arrayBuffer())
      : Uint8Array.from(atob(await invoke('read_base64_file', { path: item.path })), (c) => c.charCodeAt(0)));
    const skipped = [];
    try {
      for (const item of items) {
        const ext = (item.name.split('.').pop() || '').toLowerCase();
        if (ext === FILE_EXTENSION) {
          if (item.path) whenSaved(() => openPath(item.path));
          else {
            const text = await item.file.text();
            whenSaved(() => { replaceDesign(parseDesign(text), { path: null, name: baseName(item.name) }); setScreen('editor'); });
          }
          return;
        }
        if (isModelFile(item.name)) {
          const data = await bytes(item);
          await openModel(item.name, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
          return;
        }
        if (ALL_INPUT_EXTS.includes(ext) || item.file?.type?.startsWith('image/')) {
          setScreen('editor');
          if (item.file) await addImage({ name: item.name, file: item.file });
          else await addImage({ name: item.name, dataUrl: `data:application/octet-stream;base64,${await invoke('read_base64_file', { path: item.path })}`, ext });
          continue;
        }
        skipped.push(item.name);
      }
      if (skipped.length) flash(t('drop.unsupported', { names: skipped.join(', ') }));
    } catch (err) { showError(err); }
  }, [addImage, openModel, openPath, replaceDesign, whenSaved, flash, showError]);
  const onDropFiles = useCallback((files) => openIncoming([...files].map((file) => ({ name: file.name, file }))), [openIncoming]);

  // Dropping files anywhere on the window. Desktop: Tauri hands over the paths (the webview gets
  // no HTML file drops); web: the page's own drag-and-drop events.
  const [dropping, setDropping] = useState(false);
  const dropBlocked = useRef(false);
  dropBlocked.current = Boolean(confirm || error || model3d);
  useEffect(() => {
    if (isDesktop()) {
      let off = () => {};
      let live = true;
      import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((event) => {
        const { type, paths } = event.payload;
        if (type === 'enter' || type === 'over') setDropping(!dropBlocked.current);
        else if (type === 'leave') setDropping(false);
        else if (type === 'drop') {
          setDropping(false);
          if (!dropBlocked.current && paths?.length) openIncoming(paths.map((path) => ({ name: path.split(/[\\/]/).pop(), path })));
        }
      })).then((fn) => { if (live) off = fn; else fn(); }).catch(() => {});
      return () => { live = false; off(); };
    }
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth += 1; setDropping(!dropBlocked.current); };
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDropping(false); };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      if (!dropBlocked.current) onDropFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [openIncoming, onDropFiles]);

  // ── Export ─────────────────────────────────────────────────────────
  const exportAs = useCallback(async (kind) => {
    const doc = designRef.current;
    if (!doc.objects.length && (!doc.background || doc.background === 'transparent')) { showError(new Error(t('export.noContent'))); return; }
    const base = (file.name || 'icon').replace(/[\\/:*?"<>|]/g, '_');
    setExporting(true);
    setMessage(t('export.working'));
    try {
      let saved = null;
      if (kind === 'ico' && doc.perSize) {
        saved = await saveMany(await buildIcoEach(doc, doc.sizes, base), `${base}-ico.zip`);
      } else if (kind === 'ico') {
        saved = await saveBytes(await buildIco(doc, doc.sizes), `${base}.ico`, t('export.icoFilter'), ['ico']);
      } else if (kind === 'png') {
        const sizes = doc.sizes.length ? doc.sizes : [256];
        saved = await saveMany(await buildPngs(doc, sizes, base), `${base}-png.zip`);
      } else if (kind === 'icns') {
        saved = await saveBytes(await buildIcns(doc), `${base}.icns`, t('export.icnsFilter'), ['icns']);
      } else if (kind === 'svg') {
        saved = await saveBytes(new TextEncoder().encode(serializeSvg(doc, 512)), `${base}.svg`, t('export.svgFilter'), ['svg']);
      }
      if (saved) flash(t('export.savedTo', { path: saved }));
      else setMessage('');
    } catch (err) { showError(err); } finally { setExporting(false); }
  }, [file.name, flash, showError]);

  // ── Print ──────────────────────────────────────────────────────────
  const openPrint = useCallback(async () => {
    const doc = designRef.current;
    const payload = { svg: serializeSvg(doc, 512), name: file.name || t('doc.untitled'), sizes: doc.sizes, time: Date.now() };
    try { localStorage.setItem(PRINT_KEY, JSON.stringify(payload)); } catch (err) { showError(err); return; }
    if (isDesktop()) {
      try { await invoke('open_popup', { kind: 'print', title: `${t('print.title')} — MyICOMaker` }); } catch (err) { showError(err); }
    } else if (!openBrowserWindow(`${location.pathname}?popup=print`, 'myicomaker-print', 1120, 800)) {
      setPopupFrame('print'); // the browser blocked the window: the print page in a frame instead
    }
  }, [file.name, showError]);

  // ── Settings window ────────────────────────────────────────────────
  const openSettings = useCallback(async (tab) => {
    localStorage.setItem(SETTINGS_TAB_KEY, tab);
    if (isDesktop()) {
      try { await invoke('open_popup', { kind: 'settings', title: `${t('action.settings')} — MyICOMaker` }); } catch (err) { showError(err); }
    } else {
      setPopupFrame('settings');
    }
  }, [showError]);
  useEffect(() => {
    const onMessage = (e) => { if (e.data?.myicomaker === 'close-popup') setPopupFrame(null); };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // ── Commands (toolbar, start screen, keys) ─────────────────────────
  const newDesign = useCallback((template = 'blank') => whenSaved(() => {
    // A template, an example or one of "My examples" (opened as a new, unsaved design named after it).
    const mine = loadUserExamples().find((e) => e.id === template);
    if (mine) {
      replaceDesign(parseDesign(serializeDesign(mine.design, mine.name)), { path: null, name: mine.name });
      setScreen('editor');
      return;
    }
    const example = EXAMPLE_BY_ID[template];
    const build = example?.build ?? TEMPLATE_BY_ID[template]?.build ?? emptyDesign;
    replaceDesign(build(), { path: null, name: example ? example[getLanguage() === 'en' ? 'en' : 'ko'] : '' });
    setScreen('editor');
  }), [whenSaved, replaceDesign]);

  const onCommand = useCallback((command) => {
    switch (command) {
      case 'start': setScreen('start'); break;
      case 'editor': setScreen('editor'); break;
      case 'new': newDesign('blank'); break;
      case 'newFromImage': whenSaved(() => { replaceDesign(emptyDesign()); setScreen('editor'); setTimeout(importImages, 50); }); break;
      case 'continue': {
        const s = readSession();
        if (s) { replaceDesign(s.design, { path: s.path, name: s.name }); setDirty(true); }
        setScreen('editor');
        break;
      }
      case 'open': openDesign(); break;
      case 'save': saveDesign(false); break;
      case 'saveAs': saveDesign(true); break;
      case 'saveExample': saveAsExample(); break;
      case 'importImage': importImages(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'copy': if (sel) { clipboard.current = JSON.parse(JSON.stringify(sel)); flash(t('edit.copied')); } break;
      case 'paste': if (clipboard.current) { const c = cloneObject(clipboard.current); clipboard.current = c; apply((d) => ({ ...d, objects: [...d.objects, c] })); setSelectedId(c.id); } break;
      case 'duplicate': if (selectedId) duplicate(selectedId); break;
      case 'delete': if (selectedId) deleteObject(selectedId); break;
      case 'zoomIn': setZoom((z) => Math.min(8, z * 1.25)); break;
      case 'zoomOut': setZoom((z) => Math.max(0.2, z / 1.25)); break;
      case 'fit': fitZoom(); break;
      case 'actual': setZoom(1); setPan({ x: 0, y: 0 }); break;
      case 'exportIco': exportAs('ico'); break;
      case 'print': openPrint(); break;
      case 'guide': openGuide(getLanguage(), `${t('action.guide')} — MyICOMaker`).catch(showError); break;
      case 'about': setAbout(true); break;
      case 'settings': openSettings('general'); break;
      case 'themeSettings': openSettings('theme'); break;
      case 'exit': whenSaved(() => invoke('quit_app')); break;
      default: break;
    }
  }, [openSettings, newDesign, whenSaved, replaceDesign, importImages, openDesign, saveDesign, undo, redo, sel, selectedId, apply, duplicate, deleteObject, fitZoom, exportAs, openPrint, flash, showError]);

  // ── Start-up files, files from a second start ──────────────────────
  useEffect(() => { if (startupFiles[0]) openPath(startupFiles[0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useListen('open-files', (paths) => { if (paths?.[0]) whenSaved(() => openPath(paths[0])); });

  // Closing the window with unsaved changes asks first.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty && design.objects.length > 0;
  useEffect(() => {
    if (!isDesktop()) {
      const before = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
      window.addEventListener('beforeunload', before);
      return () => window.removeEventListener('beforeunload', before);
    }
    let off = () => {};
    currentWindow().then((win) => win.onCloseRequested((e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      setConfirm({
        title: t('confirm.unsavedTitle'), message: t('confirm.unsavedExit'), okLabel: t('confirm.exitWithout'), okIcon: 'exit',
        onOk: () => { setConfirm(null); invoke('quit_app'); },
      });
    })).then((fn) => { off = fn; });
    return () => off();
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F1') { e.preventDefault(); onCommand('guide'); return; }
      if (screen !== 'editor' || confirm || about || error) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); saveDesign(e.shiftKey); return; }
      if (mod && k === 'o') { e.preventDefault(); openDesign(); return; }
      if (mod && k === 'n') { e.preventDefault(); onCommand('new'); return; }
      if (mod && k === 'p') { e.preventDefault(); openPrint(); return; }
      if (mod && k === 'e') { e.preventDefault(); exportAs('ico'); return; }
      if (typing) return;
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 'c') { e.preventDefault(); onCommand('copy'); return; }
      if (mod && k === 'v') { if (clipboard.current) { e.preventDefault(); onCommand('paste'); } return; }
      if (mod && k === 'd') { e.preventDefault(); onCommand('duplicate'); return; }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); onCommand('zoomIn'); return; }
      if (mod && k === '-') { e.preventDefault(); onCommand('zoomOut'); return; }
      if (mod && k === '0') { e.preventDefault(); fitZoom(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteObject(selectedId); return; }
      if (e.key === 'Escape') { setSelectedId(null); setTool('select'); return; }
      if (e.key.startsWith('Arrow') && selectedId) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        mapSelected((o) => moveObject(o, dx, dy), `${selectedId}:nudge`);
        return;
      }
      if (!mod && !e.altKey) {
        const toolId = TOOLS.find((id) => TOOL_KEYS[id].toLowerCase() === k);
        if (toolId) setTool(toolId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, confirm, about, error, saveDesign, openDesign, onCommand, openPrint, exportAs, undo, redo, fitZoom, selectedId, deleteObject, mapSelected]);

  // Pictures pasted from the system clipboard become image objects.
  useEffect(() => {
    const onPaste = (e) => {
      if (screen !== 'editor' || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length && !clipboard.current) { e.preventDefault(); onDropFiles(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [screen, onDropFiles]);

  // The GUI tests (test/gui.mjs) look inside through this hook; the user never sees it.
  useEffect(() => {
    globalThis.__myicomaker = {
      openModel: (name, base64) => openModel(name, Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer),
      openIncoming: (items) => openIncoming(items),
      design: () => designRef.current,
      screen: () => screen,
      select: (id) => setSelectedId(id),
      tool: (id) => setTool(id),
      zoom: () => zoom,
      async exportBytes(kind) {
        const doc = designRef.current;
        const bytes = kind === 'ico' ? await buildIco(doc, doc.sizes)
          : kind === 'icns' ? await buildIcns(doc)
            : kind === 'png' ? (await buildPngs(doc, [64]))[0].bytes
              : new TextEncoder().encode(serializeSvg(doc, 512));
        return { length: bytes.length, head: [...bytes.slice(0, 8)] };
      },
    };
  });

  // ── Context menu ───────────────────────────────────────────────────
  const ctxItems = () => {
    if (ctx?.objId) {
      const id = ctx.objId;
      return [
        { icon: 'copy', label: t('edit.copy'), shortcut: 'Ctrl+C', onClick: () => onCommand('copy') },
        { icon: 'duplicate', label: t('edit.duplicate'), shortcut: 'Ctrl+D', onClick: () => duplicate(id) },
        { separator: true },
        { icon: 'bringFront', label: t('arrange.front'), onClick: () => reorder(id, 'front') },
        { icon: 'forward', label: t('arrange.forward'), onClick: () => reorder(id, 'up') },
        { icon: 'backward', label: t('arrange.backward'), onClick: () => reorder(id, 'down') },
        { icon: 'sendBack', label: t('arrange.back'), onClick: () => reorder(id, 'back') },
        { separator: true },
        { icon: 'center', label: t('arrange.center'), onClick: () => onAction('center') },
        { icon: 'flipH', label: t('arrange.flipH'), onClick: () => onAction('flipH') },
        { icon: 'flipV', label: t('arrange.flipV'), onClick: () => onAction('flipV') },
        { icon: 'lock', label: t('layers.lock'), onClick: () => onLayer(id, 'locked') },
        { separator: true },
        { icon: 'trash', label: t('edit.delete'), shortcut: 'Del', danger: true, onClick: () => deleteObject(id) },
      ];
    }
    return [
      { icon: 'paste', label: t('edit.paste'), shortcut: 'Ctrl+V', disabled: !clipboard.current, onClick: () => onCommand('paste') },
      { icon: 'importImage', label: t('action.importImage'), onClick: importImages },
      { separator: true },
      { icon: 'fit', label: t('view.fit'), shortcut: 'Ctrl+0', onClick: fitZoom },
      { icon: 'actual', label: t('view.actual'), onClick: () => onCommand('actual') },
      { icon: 'grid', label: t('view.grid'), onClick: () => setSettings({ grid: !settings.grid }) },
      { icon: 'deselect', label: t('edit.deselect'), shortcut: 'Esc', onClick: () => setSelectedId(null) },
    ];
  };

  const view = { grid: settings.grid, snap: settings.snap, guides: settings.guides, preview: settings.preview, rulers: settings.rulers };
  const style = { fill: settings.fill, fill2: settings.fill2, stroke: settings.stroke, strokeWidth: settings.strokeWidth };
  const statusTool = isShapeTool(tool) ? `shape:${tool}` : tool;
  const selInfo = sel ? (() => { const b = bbox(sel); return `${objectName(sel)} · ${Math.round(b.w)}×${Math.round(b.h)}`; })() : '';

  const onTheme = (id) => setSettings({ theme: id });
  const onLanguage = (l) => setSettings({ language: l });

  return (
    <div className={`app screen-${screen}`}>
      <TitleBar fileName={screen === 'editor' ? file.name : undefined} dirty={dirty} lang={lang} theme={settings.theme} onTheme={onTheme} onLanguage={onLanguage}
        onGuide={() => onCommand('guide')} onAbout={() => setAbout(true)} onSettings={() => onCommand('settings')} onThemeSettings={() => onCommand('themeSettings')}
        onStart={screen === 'editor' ? () => setScreen('start') : null} onHome={screen === 'start' ? () => setScreen('editor') : null} />

      {screen === 'start' ? (
        <StartScreen settings={settings} setSettings={setSettings} hasSession={hasSession} onCommand={onCommand}
          onTemplate={(id) => newDesign(id)} onExample={(id) => newDesign(id)} userExamples={userExamples} onRemoveExample={deleteUserExample} onOpenRecent={(path) => whenSaved(() => openPath(path))}
          onRemoveRecent={(path) => setSettings({ recent: settings.recent.filter((r) => r.path !== path) })}
          onClearRecent={() => setSettings({ recent: [] })} onTheme={onTheme} onLanguage={onLanguage} />
      ) : (
        <>
          <Toolbar canUndo={historyRef.current.canUndo} canRedo={historyRef.current.canRedo} hasSelection={!!sel} hasObjects={design.objects.length > 0}
            view={view} setView={setSettings} onCommand={onCommand} exporting={exporting} />
          <div className="workspace">
            <aside className="side side-left" aria-label={t('panel.tools')}>
              <LeftPanel tool={tool} setTool={setTool} onImportImage={importImages} onImportModel={importModel} onEmoji={addEmoji} userEmoji={userEmoji} onUserEmoji={insertUserEmoji} onAddUserEmoji={addUserEmojiFromFiles} onAddSelectionEmoji={addUserEmojiFromSelection} onRemoveUserEmoji={deleteUserEmoji} hasSelection={Boolean(sel)} objects={design.objects} selectedId={selectedId} onSelect={setSelectedId}
                onLayer={onLayer} category={category} setCategory={setCategory} />
            </aside>
            <main className="center">
              <div className={`canvas-host ${settings.rulers ? 'with-rulers' : ''}`}>
                {settings.rulers && <Rulers zoom={zoom} pan={pan} cursor={cursor} theme={`${settings.theme}${JSON.stringify(settings.customTheme)}`} />}
                <div className="canvas-area" ref={hostRef}>
                <IconCanvas design={design} selectedId={selectedId} onSelect={setSelectedId} tool={tool} setTool={setTool}
                  zoom={zoom} setZoom={setZoom} pan={pan} setPan={setPan} view={view} style={style}
                  apply={apply} record={record} onCursor={setCursor}
                  onContextMenu={(e, objId) => setCtx({ x: e.clientX, y: e.clientY, objId })}
                  onDropFiles={onDropFiles}
                  onPickColor={(o) => { const c = o.hasFill ? o.fill : o.stroke; setSettings({ fill: c }); flash(t('tool.picked', { color: c })); setTool('select'); }} />
                </div>
              </div>
              {settings.preview && <PreviewStrip design={design} />}
            </main>
            <aside className="side side-right" aria-label={t('panel.properties')}>
              <RightPanel sel={sel} update={updateSel} updateFx={updateFx} onBox={(box) => mapSelected((o) => resizeObject(o, box), `${selectedId}:box`)}
                style={style} setStyle={setSettings} design={design} setDesign={setDesign} onAction={(a, arg) => (a === 'print' || a === 'save' ? onCommand(a) : onAction(a, arg))} onExport={exportAs} exporting={exporting} />
            </aside>
          </div>
          <StatusBar tool={statusTool} selection={selInfo} cursor={cursor} zoom={zoom} count={design.objects.length} message={message} />
        </>
      )}
      {screen === 'start' && <StatusBar tool="select" selection="" cursor={null} zoom={1} count={design.objects.length} message={message || t('status.startHint')} />}

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems()} onClose={() => setCtx(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      {model3d && <Model3DDialog model={model3d} onPlace={placeModel} onClose={() => setModel3d(null)} />}
      {dropping && (
        <div className="drop-overlay" data-testid="drop-overlay" aria-hidden="true">
          <div className="drop-card"><Icon name="importImage" size={40} /><b>{t('drop.title')}</b><span>{t('drop.hint')}</span></div>
        </div>
      )}
      <ErrorDialog error={error} onClose={() => setError(null)} />
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      {popupFrame && (
        <Modal icon={popupFrame === 'print' ? 'print' : 'settings'} title={t(popupFrame === 'print' ? 'print.title' : 'action.settings')} onClose={() => setPopupFrame(null)} className="print-frame-modal">
          <iframe title={popupFrame} src={`${location.pathname}?popup=${popupFrame}&frame=1`} className="print-frame" />
        </Modal>
      )}
    </div>
  );
}

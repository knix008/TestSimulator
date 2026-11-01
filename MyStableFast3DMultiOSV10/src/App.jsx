import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Toolbar from './components/Toolbar.jsx';
import InputPanel from './components/InputPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import ViewerPane from './components/ViewerPane.jsx';
import LogPanel from './components/LogPanel.jsx';
import StatusBar from './components/StatusBar.jsx';
import StartScreen from './components/StartScreen.jsx';
import EngineCard, { engineSummary } from './components/EngineCard.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import AboutDialog from './components/AboutDialog.jsx';
import { ErrorDialog } from './components/Dialogs.jsx';
import Tooltip from './components/Tooltip.jsx';
import Toasts from './components/Toasts.jsx';
import {
  DEFAULT_SETTINGS, loadSettings, normalize, persistSettings, applyFontSettings, applyTheme,
  publishThemePalette, addRecentFile, removeRecentFile,
} from './lib/settings.js';
import { isDarkTheme } from './lib/themes.js';
import {
  api, isDesktop, openFilesDialog, readPath, readSibling, saveBinary, saveText, copyText,
  baseName, dirName, writeBinaryTo, filesToPayloads,
} from './lib/platform.js';
import {
  IMAGE_EXTENSIONS, MODEL_EXTENSIONS, IMPORT_FORMATS, isImageFile, isModelFile, formatOf, gatherFiles,
  loadModel, exportModel, exportFormat, exportName, modelStats, baseOf, extOf,
} from './lib/formats.js';
import { EngineClient, convertWithEngine, convertWithStability, engineUrlFor } from './lib/engine.js';
import { appendLines, makeLine } from './lib/logs.js';
import i18n, { setLanguage } from './i18n.js';

const IMAGE_FILTERS = [{ name: 'Images', extensions: IMAGE_EXTENSIONS }, { name: 'All Files', extensions: ['*'] }];
const MODEL_FILTERS = [
  { name: '3D models', extensions: MODEL_EXTENSIONS },
  ...IMPORT_FORMATS.map((f) => ({ name: f.name, extensions: f.ext })),
  { name: 'All Files', extensions: ['*'] },
];
const MAX_HISTORY = 20;

let toastSeq = 0;
let historySeq = 0;

function imageInfo(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = url;
  });
}

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function thumbFrom(dataUrl, size = 96) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = Math.min(img.width, img.height);
      c.width = size;
      c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

export default function App() {
  const { t } = useTranslation();
  const [settings, setSettingsState] = useState(null);
  const settingsRef = useRef(null);
  settingsRef.current = settings;
  const setSettings = useCallback((fn) => {
    setSettingsState((s) => normalize(typeof fn === 'function' ? fn(s) : { ...s, ...fn }));
  }, []);

  const [lines, setLines] = useState([]);
  const [health, setHealth] = useState(null);
  const [connection, setConnection] = useState('starting');
  const [engineUrl, setEngineUrl] = useState('');
  const [image, setImage] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [current, setCurrent] = useState(null);      // { id, object, animations, name, format, path, stats, fromImage, bytes }
  const [transform, setTransform] = useState({ rotation: [0, 0, 0], scale: 1 });
  const [history, setHistory] = useState([]);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastJob, setLastJob] = useState(null);
  const [selectedLight, setSelectedLight] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [message, setMessage] = useState('');
  const [homeOpen, setHomeOpen] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const viewerRef = useRef(null);
  const abortRef = useRef(null);
  const logSeq = useRef(0);
  const engineUptime = useRef(0);

  // ── Logging, toasts, errors ─────────────────────────────
  const log = useCallback((level, msg, src = 'app') => {
    setLines((list) => appendLines(list, [makeLine(level, msg, src)]));
  }, []);

  const toast = useCallback((text, kind = 'info') => {
    const id = ++toastSeq;
    setToasts((list) => [...list, { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 2600);
  }, []);

  const fail = useCallback((err, context, file) => {
    const msg = err?.message || String(err);
    if (err?.code === 'cancelled' || msg === 'cancelled') return;
    log('error', `${context ? `${t(`error.ctx.${context}`, context)}: ` : ''}${msg}`);
    setError({ message: msg, context, file, details: err?.stack || '', at: Date.now() });
  }, [log, t]);

  // ── Settings: load, apply, persist ─────────────────────
  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => {
      if (!alive) return;
      setSettingsState(s);
      setHomeOpen(s.showStartPage);
      log('info', t('log.started', { version: '' }).trim());
    }).catch(() => setSettingsState(normalize(null)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settings) return undefined;
    applyTheme(settings.theme, settings.customThemes);
    applyFontSettings(settings);
    const dark = publishThemePalette(settings.theme, settings.customThemes);
    if (isDesktop) api.win.setThemeKind?.(dark).catch(() => {});
    if (i18n.language !== settings.lang) setLanguage(settings.lang);
    const id = setTimeout(() => persistSettings(settings), 250);
    return () => clearTimeout(id);
  }, [settings]);

  // The window's title follows what is in the view.
  useEffect(() => {
    const name = current?.name || image?.name || '';
    const title = name ? `${name} — MyStableFast3D` : 'MyStableFast3D';
    if (isDesktop) api.win.setTitle(title).catch(() => {});
    else document.title = title;
  }, [current?.name, image?.name]);

  // ── The engine ─────────────────────────────────────────
  // Desktop: the host starts it and reports its log and state.
  useEffect(() => {
    if (!isDesktop || !api.engine) return undefined;
    const offLog = api.engine.onLog((p) => {
      const list = Array.isArray(p) ? p : [p];
      setLines((all) => appendLines(all, list.map((l) => makeLine(l.level || 'info', l.msg ?? l, 'host'))));
    });
    const offState = api.engine.onState((s) => {
      if (s?.url) setEngineUrl(s.url);
      if (s?.state === 'failed' || s?.state === 'stopped') setConnection('down');
    });
    api.engine.url().then((u) => { if (u) setEngineUrl(u); }).catch(() => {});
    return () => { offLog(); offState(); };
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (isDesktop && settings.backend === 'local') return; // from the host
    engineUrlFor(settings).then(setEngineUrl);
  }, [settings?.backend, settings?.engineUrl, settings?.remoteUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const client = useMemo(() => (engineUrl ? new EngineClient(engineUrl) : null), [engineUrl]);

  // Health: every second until the engine is ready, then every few seconds.
  useEffect(() => {
    if (!client) return undefined;
    let alive = true;
    let timer = 0;
    let wasUp = false;
    const tick = async () => {
      try {
        const h = await client.health();
        if (!alive) return;
        if (h.uptime < engineUptime.current) logSeq.current = 0;  // a restarted engine numbers its log anew
        engineUptime.current = h.uptime;
        setHealth(h);
        setConnection('up');
        if (!wasUp) log('info', t('log.engineConnected', { url: client.base }));
        wasUp = true;
        timer = setTimeout(tick, h.state === 'ready' && !h.busy ? 3000 : 1000);
      } catch {
        if (!alive) return;
        if (wasUp) log('warn', t('log.engineLost', { url: client.base }));
        wasUp = false;
        setHealth(null);
        setConnection((c) => (c === 'starting' && !isDesktop ? 'down' : c === 'up' ? 'down' : c));
        timer = setTimeout(tick, 2000);
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [client, log, t]);

  // The engine's log lines.
  useEffect(() => {
    if (!client || connection !== 'up') return undefined;
    let alive = true;
    let timer = 0;
    const pull = async () => {
      try {
        const r = await client.logs(logSeq.current);
        if (!alive) return;
        if (r.lines?.length) {
          logSeq.current = r.last;
          setLines((all) => appendLines(all, r.lines.map((l) => makeLine(l.level, l.msg, l.src === 'engine' ? 'engine' : l.src, l.t))));
        } else if (r.last < logSeq.current) {
          logSeq.current = 0;
        }
      } catch { /* the health poll reports a lost engine */ }
      if (alive) timer = setTimeout(pull, 700);
    };
    pull();
    return () => { alive = false; clearTimeout(timer); };
  }, [client, connection]);

  // Keep the engine's device and model in step with the settings.
  useEffect(() => {
    if (!client || !health || !settings || settings.backend === 'stability') return;
    const body = {};
    if (health.device?.preference !== settings.device) body.device = settings.device;
    if (health.model !== settings.model && (health.models || []).some((m) => m.id === settings.model)) body.model = settings.model;
    if (Object.keys(body).length) client.config(body).catch(() => {});
  }, [client, health, settings?.device, settings?.model, settings?.backend]); // eslint-disable-line react-hooks/exhaustive-deps

  const models = health?.models || [];
  const effectiveConnection = settings?.backend === 'stability' ? 'stability' : connection;

  // ── Opening ────────────────────────────────────────────
  const remember = useCallback((file, kind) => {
    if (!file?.path && isDesktop) return;
    setSettings((s) => ({
      ...s,
      lastDir: file.dir || s.lastDir,
      recentFiles: file.path ? addRecentFile(s.recentFiles, { path: file.path, name: file.name, dir: file.dir || dirName(file.path), kind }) : s.recentFiles,
    }));
  }, [setSettings]);

  const setInputImage = useCallback(async (file) => {
    const blob = new Blob([file.data], { type: `image/${extOf(file.name) === 'jpg' ? 'jpeg' : extOf(file.name)}` });
    const url = URL.createObjectURL(blob);
    const dims = await imageInfo(url);
    setImage((old) => {
      if (old?.url) URL.revokeObjectURL(old.url);
      return { ...file, url, ...dims };
    });
    setPrepared(null);
    setHomeOpen(false);
    remember(file, 'image');
    log('info', t('log.imageOpened', { name: file.name, w: dims.width || '?', h: dims.height || '?' }));
    setMessage(t('status.imageReady', { name: file.name }));
  }, [log, remember, t]);

  const showModel = useCallback(async ({ object, animations, name, format, path, fromImage, bytes, kind, job: j }) => {
    const id = ++historySeq;
    const stats = modelStats(object);
    setTransform({ rotation: [0, 0, 0], scale: 1 });
    setCurrent({ id, object, animations, name, format, path, stats, fromImage, bytes });
    setHomeOpen(false);
    // A thumbnail of the first frame for the history list.
    setTimeout(async () => {
      const shot = viewerRef.current?.snapshot();
      const thumb = shot ? await thumbFrom(shot) : '';
      setHistory((list) => [{
        id, name, kind, format, path, bytes, fromImage, thumb,
        modelName: j?.modelName || '', elapsed: j?.elapsed || 0, device: j?.deviceName || '',
      }, ...list.filter((h) => h.id !== id)].slice(0, MAX_HISTORY));
    }, 400);
    return id;
  }, []);

  const openModelFiles = useCallback(async (files) => {
    const main = files.find((f) => isModelFile(f.name));
    if (!main) return false;
    setMessage(t('status.loadingModel', { name: main.name }));
    try {
      const byName = new Map(files.map((f) => [baseOf(f.name).toLowerCase(), f.data]));
      const extra = await gatherFiles(main, async (rel) => (main.path
        ? readSibling(main.path, rel)
        : byName.get(baseOf(rel).toLowerCase()) || null));
      const { object, animations, format } = await loadModel(main.name, main.data, extra);
      await showModel({ object, animations, name: main.name, format, path: main.path, bytes: main.data, kind: 'model' });
      remember(main, 'model');
      const st = modelStats(object);
      log('info', t('log.modelOpened', { name: main.name, fmt: format.toUpperCase(), v: st.vertices, f: st.triangles }));
      setMessage(t('status.modelReady', { name: main.name }));
      return true;
    } catch (err) {
      setMessage('');
      fail(err, 'openModel', main.path || main.name);
      return true;
    }
  }, [fail, log, remember, showModel, t]);

  const openFiles = useCallback(async (files) => {
    if (!files?.length) return;
    if (await openModelFiles(files)) return;
    const img = files.find((f) => isImageFile(f.name));
    if (img) { await setInputImage(img); return; }
    fail(new Error(t('error.unsupported', { name: files[0].name })), 'open');
  }, [fail, openModelFiles, setInputImage, t]);

  const openPaths = useCallback(async (paths) => {
    try {
      const files = [];
      for (const p of paths) files.push(await readPath(p));
      await openFiles(files);
    } catch (err) { fail(err, 'open', paths[0]); }
  }, [fail, openFiles]);

  const openImage = useCallback(async () => {
    try {
      const files = await openFilesDialog({ filters: IMAGE_FILTERS, defaultDir: settingsRef.current?.lastDir, multi: false });
      if (files?.length) await setInputImage(files[0]);
    } catch (err) { fail(err, 'open'); }
  }, [fail, setInputImage]);

  const openModel = useCallback(async () => {
    try {
      const files = await openFilesDialog({ filters: MODEL_FILTERS, defaultDir: settingsRef.current?.lastDir, multi: !isDesktop });
      if (files?.length) await openFiles(files);
    } catch (err) { fail(err, 'openModel'); }
  }, [fail, openFiles]);

  const openRecent = useCallback(async (f) => {
    if (!isDesktop || !f.path) return;
    try {
      if (!(await api.exists(f.path))) {
        toast(t('recent.missing', { name: f.name }), 'warn');
        setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, f.path) }));
        return;
      }
      await openPaths([f.path]);
    } catch (err) { fail(err, 'open', f.path); }
  }, [fail, openPaths, setSettings, t, toast]);

  // Files handed over by the shell (open with…, a second launch) and dropped.
  useEffect(() => {
    if (!isDesktop || !settings) return undefined;
    api.takePendingOpen().then((p) => { if (p) openPaths([p]); }).catch(() => {});
    const offOpen = api.onOpenPath((p) => openPaths([p]));
    const offDrop = api.onFileDrop((e) => {
      if (e.type === 'enter' || e.type === 'over') setDragOver(true);
      else setDragOver(false);
      if (e.type === 'drop' && e.paths?.length) openPaths(e.paths);
    });
    return () => { offOpen(); offDrop(); };
  }, [!!settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const onWebDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (isDesktop) return;
    const files = await filesToPayloads(e.dataTransfer?.files);
    openFiles(files);
  };

  // ── Converting ─────────────────────────────────────────
  const convert = useCallback(async () => {
    const s = settingsRef.current;
    if (!image || busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setHomeOpen(false);
    const started = Date.now();
    const options = s.convertOptions?.[s.model] || {};
    setJob({ state: 'queued', stage: 'queued', progress: 0, modelName: s.backend === 'stability' ? 'Stability AI API' : (models.find((m) => m.id === s.model)?.name || s.model) });
    setMessage(t('status.converting', { name: image.name }));
    log('info', t('log.convertStart', { name: image.name, model: s.backend === 'stability' ? 'Stability AI API' : s.model }));
    try {
      let result;
      if (s.backend === 'stability') {
        result = await convertWithStability({ data: image.data, name: image.name, options, key: s.stabilityKey, onProgress: setJob, signal: ctrl.signal });
      } else {
        if (!client) throw new Error(t('engine.unreachable'));
        result = await convertWithEngine(client, {
          data: image.data, name: image.name, model: s.model, options, signal: ctrl.signal,
          onProgress: (j) => setJob({ ...j, elapsed: j.elapsed || (Date.now() - started) / 1000 }),
        });
      }
      const name = `${image.name.replace(/\.[^.]+$/, '')}.glb`;
      const { object, animations } = await loadModel(name, result.glb);
      await showModel({ object, animations, name, format: 'glb', fromImage: image.name, bytes: result.glb, kind: 'conversion', job: result.job });
      if (result.input) {
        const url = URL.createObjectURL(new Blob([result.input], { type: 'image/png' }));
        setPrepared((old) => { if (old) URL.revokeObjectURL(old); return url; });
      }
      setLastJob(result.job);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      setMessage(t('status.converted', { name, secs }));
      toast(t('status.converted', { name, secs }), 'ok');
      if (s.autoSave && isDesktop && image.path) {
        const fmt = exportFormat(s.autoSaveFormat);
        const target = `${dirName(image.path)}${/\\/.test(image.path) ? '\\' : '/'}${exportName(image.name, fmt.id)}`;
        setTimeout(async () => {
          try {
            const root = viewerRef.current?.exportRoot();
            const bytes = fmt.id === 'glb' ? result.glb : await exportModel(root, fmt.id);
            await writeBinaryTo(target, bytes);
            log('info', t('log.autoSaved', { path: target }));
          } catch (err) { fail(err, 'save', target); }
        }, 500);
      }
    } catch (err) {
      setMessage('');
      if (err?.code === 'cancelled' || err?.message === 'cancelled') {
        log('warn', t('log.convertCancelled'));
        toast(t('status.cancelled'), 'warn');
      } else {
        fail(err, 'convert', image.path || image.name);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setJob(null);
    }
  }, [busy, client, fail, image, log, models, showModel, t, toast]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  // ── Saving ─────────────────────────────────────────────
  const exportCurrent = useCallback(async (formatId) => {
    const s = settingsRef.current;
    if (!current) return;
    const fmt = exportFormat(formatId || s.exportFormat);
    setSettings((x) => ({ ...x, exportFormat: fmt.id }));
    try {
      setMessage(t('status.exporting', { fmt: fmt.name }));
      const root = viewerRef.current?.exportRoot();
      const untouched = current.format === 'glb' && fmt.id === 'glb'
        && transform.scale === 1 && transform.rotation.every((r) => r === 0) && current.bytes;
      const bytes = untouched ? current.bytes : await exportModel(root, fmt.id);
      const saved = await saveBinary({
        defaultName: exportName(current.name, fmt.id),
        defaultDir: s.lastDir,
        bytes,
        filters: [{ name: fmt.name, extensions: [fmt.ext] }],
      });
      if (saved) {
        log('info', t('log.saved', { path: saved, fmt: fmt.name }));
        toast(t('status.saved', { name: baseName(saved) }), 'ok');
        setMessage(t('status.saved', { name: baseName(saved) }));
      } else setMessage('');
    } catch (err) { setMessage(''); fail(err, 'save'); }
  }, [current, fail, log, setSettings, t, toast, transform]);

  const screenshot = useCallback(async () => {
    const shot = viewerRef.current?.snapshot();
    if (!shot) return;
    try {
      const name = `${(current?.name || 'view').replace(/\.[^.]+$/, '')}.png`;
      const saved = await saveBinary({ defaultName: name, defaultDir: settingsRef.current?.lastDir, bytes: dataUrlToBytes(shot), filters: [{ name: 'PNG', extensions: ['png'] }] });
      if (saved) toast(t('status.saved', { name: baseName(saved) }), 'ok');
    } catch (err) { fail(err, 'save'); }
  }, [current, fail, t, toast]);

  const showHistory = useCallback(async (h) => {
    try {
      const { object, animations } = await loadModel(h.name, h.bytes);
      setTransform({ rotation: [0, 0, 0], scale: 1 });
      setCurrent({ id: h.id, object, animations, name: h.name, format: h.format, path: h.path, stats: modelStats(object), fromImage: h.fromImage, bytes: h.bytes });
      setHomeOpen(false);
    } catch (err) { fail(err, 'openModel', h.name); }
  }, [fail]);

  const saveHistory = useCallback(async (h) => {
    try {
      const saved = await saveBinary({ defaultName: h.name, defaultDir: settingsRef.current?.lastDir, bytes: h.bytes, filters: [{ name: extOf(h.name).toUpperCase(), extensions: [extOf(h.name)] }] });
      if (saved) toast(t('status.saved', { name: baseName(saved) }), 'ok');
    } catch (err) { fail(err, 'save'); }
  }, [fail, t, toast]);

  // ── Engine commands ────────────────────────────────────
  const sendToken = useCallback(async (token) => {
    if (!client) return;
    try {
      await client.config({ hfToken: token });
      toast(t('engine.tokenSaved'), 'ok');
      log('info', t('log.tokenSaved'));
    } catch (err) { fail(err, 'engine'); }
  }, [client, fail, log, t, toast]);

  const retryEngine = useCallback(async () => {
    try {
      if (client && connection === 'up') await client.retry();
      else if (isDesktop) await api.engine.restart();
    } catch (err) { fail(err, 'engine'); }
  }, [client, connection, fail]);

  const pickModel = useCallback((id) => {
    setSettings((s) => ({ ...s, model: id, backend: s.backend === 'stability' ? 'local' : s.backend }));
    const name = models.find((m) => m.id === id)?.name || id;
    log('info', t('log.modelPicked', { name }));
  }, [log, models, setSettings, t]);

  const installModel = useCallback(async (id) => {
    try { await client?.installModel(id); } catch (err) { fail(err, 'engine'); }
  }, [client, fail]);

  const openGuide = useCallback(() => {
    const page = settingsRef.current?.lang === 'en' ? 'Guide.en.html' : 'Guide.html';
    if (isDesktop) api.win.openGuide(page).catch((err) => fail(err, 'guide'));
    else window.open(`./doc/${page}`, '_blank', 'noopener');
  }, [fail]);

  const saveLog = useCallback(async (text) => {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const saved = await saveText({ defaultName: `mystablefast3d-${stamp}.log`, defaultDir: settingsRef.current?.lastDir, content: text, filters: [{ name: 'Log', extensions: ['log', 'txt'] }] });
      if (saved) toast(t('status.saved', { name: baseName(saved) }), 'ok');
    } catch (err) { fail(err, 'save'); }
  }, [fail, t, toast]);

  // ── Keyboard ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); if (e.shiftKey) openModel(); else openImage(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportCurrent(); }
      else if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); setSettings((s) => ({ ...s, logPanel: !s.logPanel })); }
      else if (e.key === 'F5' || (mod && e.key === 'Enter')) { e.preventDefault(); convert(); }
      else if (e.key === 'Escape' && busy) cancel();
      else if (!mod && e.key.toLowerCase() === 'f' && current) viewerRef.current?.fit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, cancel, convert, current, exportCurrent, openImage, openModel, setSettings]);

  // Show the window once the first frame is up (desktop).
  useEffect(() => {
    if (!settings) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { api?.ready?.().catch(() => {}); }));
  }, [!!settings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { viewerRef.current?.setTransform(transform); }, [transform]);

  if (!settings) return <div className="app app-loading" />;

  const startVisible = homeOpen !== false && (homeOpen === true || (!current && !image));
  const modelName = settings.backend === 'stability' ? 'Stability AI API' : (models.find((m) => m.id === settings.model)?.name || settings.model);
  const sum = engineSummary(health, effectiveConnection, t);
  const sel = models.find((m) => m.id === health?.model);
  const needsAttention = settings.backend !== 'stability' && !startVisible
    && (sum.kind === 'error' || health?.state === 'installing' || sel?.status === 'installing');

  return (
    <div
      className="app"
      onDragOver={(e) => { if (!isDesktop) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onWebDrop}
    >
      <Toolbar
        settings={settings}
        onSettings={setSettings}
        hasModel={!!current}
        hasImage={!!image}
        busy={busy}
        models={models}
        homeOpen={startVisible}
        onHome={() => setHomeOpen(!startVisible)}
        onOpenImage={openImage}
        onOpenModel={openModel}
        onOpenRecent={openRecent}
        onRemoveRecent={(key) => setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, key) }))}
        onClearRecent={() => setSettings((s) => ({ ...s, recentFiles: [] }))}
        onConvert={convert}
        onCancel={cancel}
        onPickModel={pickModel}
        onInstallModel={installModel}
        onExport={exportCurrent}
        onScreenshot={screenshot}
        onFit={() => viewerRef.current?.fit()}
        onView={(name) => viewerRef.current?.setView(name)}
        onTheme={(id) => setSettings((s) => ({ ...s, theme: id }))}
        onLang={() => setSettings((s) => ({ ...s, lang: s.lang === 'en' ? 'ko' : 'en' }))}
        onHelp={openGuide}
        onShowSettings={() => setShowSettings(true)}
        onAbout={() => setShowAbout(true)}
      />

      <div className="workarea">
        <InputPanel
          settings={settings}
          onSettings={setSettings}
          image={image}
          prepared={prepared}
          history={history}
          currentId={current?.id}
          onOpenImage={openImage}
          onConvert={convert}
          busy={busy}
          onShowHistory={showHistory}
          onSaveHistory={saveHistory}
          onRemoveHistory={(h) => setHistory((list) => list.filter((x) => x.id !== h.id))}
        />
        <ViewerPane
          ref={viewerRef}
          view={settings.view}
          lights={settings.lights}
          object={current?.object || null}
          animations={current?.animations}
          job={job}
          busy={busy}
          dragOver={dragOver}
          onCancel={cancel}
          onOpenImage={openImage}
          onOpenModel={openModel}
          selectedLight={selectedLight}
          onLightSelect={(id) => {
            setSelectedLight(id);
            if (id) setSettings((s) => ({ ...s, rightPanel: true, rightTab: 'lights' }));
          }}
          onLightMove={(id, position) => setSettings((s) => ({ ...s, lights: s.lights.map((l) => (l.id === id ? { ...l, position } : l)) }))}
          banner={needsAttention ? (
            <div className="engine-banner">
              <EngineCard
                health={health}
                connection={effectiveConnection}
                onRetry={retryEngine}
                onToken={sendToken}
                onUseModel={pickModel}
                onShowLog={() => setSettings((s) => ({ ...s, logPanel: true }))}
                compact
              />
            </div>
          ) : null}
        />
        <RightPanel
          settings={settings}
          onSettings={setSettings}
          models={models}
          health={health}
          lastJob={lastJob}
          onDevice={(id) => setSettings((s) => ({ ...s, device: id }))}
          modelInfo={current}
          transform={transform}
          onTransform={setTransform}
          selectedLight={selectedLight}
          onSelectLight={setSelectedLight}
          onView={(name) => viewerRef.current?.setView(name)}
          onFit={() => viewerRef.current?.fit()}
        />
        {startVisible ? (
          <StartScreen
            settings={settings}
            onSettings={setSettings}
            health={health}
            connection={effectiveConnection}
            models={models}
            onOpenImage={openImage}
            onOpenModel={openModel}
            onOpenRecent={openRecent}
            onRemoveRecent={(key) => setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, key) }))}
            onGuide={openGuide}
            onRetry={retryEngine}
            onToken={sendToken}
            onShowLog={() => setSettings((s) => ({ ...s, logPanel: true }))}
            onPickModel={pickModel}
            onClose={() => setHomeOpen(false)}
          />
        ) : null}
      </div>

      <LogPanel
        settings={settings}
        onSettings={setSettings}
        lines={lines}
        onClear={() => setLines([])}
        onCopy={async (text) => { try { await copyText(text); toast(t('status.copied'), 'ok'); } catch (err) { fail(err, 'copy'); } }}
        onSave={saveLog}
      />

      {settings.showStatusBar ? (
        <StatusBar
          message={message}
          busy={busy}
          health={health}
          connection={effectiveConnection}
          modelName={modelName}
          job={job}
          stats={current?.stats}
          onEngineClick={() => setSettings((s) => ({ ...s, logPanel: true }))}
        />
      ) : null}

      <SettingsDialog
        open={showSettings}
        settings={settings}
        onChange={(next) => setSettings(() => next)}
        onClose={() => setShowSettings(false)}
        onReset={() => {
          const kept = { recentFiles: settings.recentFiles, lastDir: settings.lastDir };
          setSettings(() => ({ ...DEFAULT_SETTINGS, ...kept }));
          toast(t('settings.done'), 'ok');
        }}
        health={health}
        onToken={sendToken}
        onClearToken={() => client?.config({ hfToken: '' }).catch((err) => fail(err, 'engine'))}
        onReinstall={async () => {
          try {
            if (client) await client.reinstall();
            log('warn', t('log.reinstall'));
          } catch (err) { fail(err, 'engine'); }
        }}
        onRestartEngine={() => api?.engine?.restart().catch((err) => fail(err, 'engine'))}
        onOpenEngineFolder={async () => {
          try { await api.openPath(await api.engine.folder()); } catch (err) { fail(err, 'engine'); }
        }}
      />
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} health={health} />
      <ErrorDialog error={error} onClose={() => setError(null)} />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
      <Tooltip />
    </div>
  );
}


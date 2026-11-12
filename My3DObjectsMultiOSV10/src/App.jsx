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
import ConvertSettingsDialog from './components/ConvertSettingsDialog.jsx';
import { groupOptions, optionValues, valueOf } from './components/ConvertOptions.jsx';
import { CertDialog, ErrorDialog, LicenseDialog } from './components/Dialogs.jsx';
import { pickVersion, needsLicense } from './lib/modelFamilies.js';
import PrintDialog from './components/PrintDialog.jsx';
import Print3DDialog from './components/Print3DDialog.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import Tutorial, { TutorialAsk } from './components/Tutorial.jsx';
import { STEPS } from './lib/tutorialSteps.js';
import {
  IconFit, IconEye, IconOrbit, IconWireframe, IconGrid, IconAxes, IconRuler, IconBox, IconBulb, IconSave, IconExport,
  IconPrint, IconCamera, IconCopy, IconImage, IconCube, IconWand, IconTrash, IconTerminal, IconSettings, IconClose,
  IconPrinter3D,
} from './components/Icons.jsx';
import { collectMeshes } from './lib/exporters.js';
import { preparePrint, writePrint, printFileName, canvasTextureSampler } from './lib/print3d.js';
import { framePages, printViaBrowser } from './lib/print.js';
import { loadSampleIndex, fetchSample, sampleImageFor } from './lib/samples.js';
import Tooltip from './components/Tooltip.jsx';
import Toasts from './components/Toasts.jsx';
import {
  DEFAULT_SETTINGS, loadSettings, normalize, persistSettings, applyFontSettings, applyTheme,
  publishThemePalette, addRecentFile, removeRecentFile,
} from './lib/settings.js';
import { isDarkTheme } from './lib/themes.js';
import {
  api, isDesktop, openFilesDialog, readPath, readSibling, saveBinary, saveText, copyText, copyImage,
  baseName, dirName, writeBinaryTo, filesToPayloads,
} from './lib/platform.js';
import {
  IMAGE_EXTENSIONS, MODEL_EXTENSIONS, IMPORT_FORMATS, isImageFile, isModelFile, formatOf, gatherFiles,
  loadModel, exportModel, exportFormat, exportName, modelStats, baseOf, extOf, normalizeImage, imageMime,
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
  const [current, setCurrent] = useState(null);      // { id, object, animations, name, format, path, stats, fromImage, bytes, jobId }
  const [transform, setTransform] = useState({ rotation: [0, 0, 0], scale: 1 });
  const [history, setHistory] = useState([]);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastJob, setLastJob] = useState(null);
  const [selectedLight, setSelectedLight] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showConvertSettings, setShowConvertSettings] = useState(false);
  const [refining, setRefining] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showPrint3d, setShowPrint3d] = useState(false);
  const [savingPrint3d, setSavingPrint3d] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [menu, setMenu] = useState({ open: false, x: 0, y: 0, items: [] });
  const [samples, setSamples] = useState(null);
  const [tourActive, setTourActive] = useState(false);
  const [askTour, setAskTour] = useState(false);
  const [settingsTab, setSettingsTab] = useState(null);

  useEffect(() => { loadSampleIndex().then(setSamples); }, []);
  const [error, setError] = useState(null);
  const [licenseFor, setLicenseFor] = useState(null);   // a model waiting for its license to be accepted
  const [certFor, setCertFor] = useState(null);         // a model whose download server's certificate has expired
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
      setAskTour(s.tutorialAsk);
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
    const title = name ? `${name} — My3DObjects` : 'My3DObjects';
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
    // AVIF, GIF, BMP, ICO, SVG …: shown and sent as a PNG copy (`png`);
    // the original name, size and path stay what the user opened.
    const png = await normalizeImage(file.name, file.data);
    const blob = png ? new Blob([png], { type: 'image/png' }) : new Blob([file.data], { type: imageMime(file.name) });
    const url = URL.createObjectURL(blob);
    const dims = await imageInfo(url);
    setImage((old) => {
      if (old?.url) URL.revokeObjectURL(old.url);
      return { ...file, url, png, ...dims };
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
    // jobId: the engine job behind a conversion, whose surface can be refined.
    setCurrent({ id, object, animations, name, format, path, stats, fromImage, bytes, jobId: kind === 'conversion' ? j?.id : undefined });
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

  // A 3D example brings its picture into the input panel as well, so what it
  // was made from is in view (and can be converted again).
  const openSample = useCallback(async (entry) => {
    try {
      const picture = sampleImageFor(entry, samples);
      if (picture) await setInputImage((await fetchSample(picture))[0]);
      await openFiles(await fetchSample(entry));
    } catch (err) { fail(err, 'open', entry.file); }
  }, [fail, openFiles, samples, setInputImage]);

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

  const clearRecent = useCallback(() => {
    setSettings((s) => ({ ...s, recentFiles: [] }));
    toast(t('recent.cleared'), 'ok');
  }, [setSettings, t, toast]);

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
    const chosen = s.backend === 'stability' ? null : models.find((m) => m.id === s.model);
    if (needsLicense(chosen)) { setLicenseFor(chosen); return; }
    if (chosen?.status === 'needs-cert') { setCertFor(chosen); return; }
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
      // A picture the web view turned into PNG (AVIF, GIF, …) goes as that.
      const send = image.png
        ? { data: image.png, name: image.name.replace(/\.[^.]+$/, '.png') }
        : { data: image.data, name: image.name };
      if (s.backend === 'stability') {
        result = await convertWithStability({ ...send, options, key: s.stabilityKey, onProgress: setJob, signal: ctrl.signal });
      } else {
        if (!client) throw new Error(t('engine.unreachable'));
        result = await convertWithEngine(client, {
          ...send, model: s.model, options, signal: ctrl.signal,
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
            const bytes = fmt.id === 'glb' ? result.glb : await exportModel(root, fmt.id, { units: s.view?.units });
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

  // The surface options (smoothing, subdividing, …) applied again to the
  // conversion on screen: the engine redoes only the clean-up of the model's
  // raw mesh, in a second or two, and the result replaces the one shown.
  const canRefine = !!client && !!current?.jobId && !busy;
  const refine = useCallback(async () => {
    const s = settingsRef.current;
    if (!client || !current?.jobId || refining || busy) return;
    const model = models.find((m) => m.id === s.model);
    const values = optionValues(s, s.model);
    const options = Object.fromEntries(groupOptions(model).surface.map((o) => [o.key, valueOf(values, o)]));
    setRefining(true);
    setMessage(t('status.refining'));
    log('info', t('log.refineStart', { name: current.name }));
    try {
      const done = await client.refine(current.jobId, options);
      const glb = await client.file(done.id, 'result.glb');
      const { object, animations } = await loadModel(current.name, glb);
      await showModel({ object, animations, name: current.name, format: 'glb', fromImage: current.fromImage, bytes: glb, kind: 'conversion', job: done });
      setLastJob(done);
      const faces = (done.stats?.faces || 0).toLocaleString();
      setMessage(t('status.refined', { faces }));
      toast(t('status.refined', { faces }), 'ok');
    } catch (err) {
      setMessage('');
      fail(err, 'refine', current.name);
    } finally {
      setRefining(false);
    }
  }, [busy, client, current, fail, log, models, refining, showModel, t, toast]);

  // ── Saving ─────────────────────────────────────────────
  // Export: the format given (or the last one used), remembered for next
  // time. Save (below) is always GLB and does not change that choice.
  const exportCurrent = useCallback(async (formatId, { remember = true } = {}) => {
    const s = settingsRef.current;
    if (!current) return;
    const fmt = exportFormat(formatId || s.exportFormat);
    if (remember) setSettings((x) => ({ ...x, exportFormat: fmt.id }));
    try {
      setMessage(t('status.exporting', { fmt: fmt.name }));
      const root = viewerRef.current?.exportRoot();
      const untouched = current.format === 'glb' && fmt.id === 'glb'
        && transform.scale === 1 && transform.rotation.every((r) => r === 0) && current.bytes;
      const bytes = untouched ? current.bytes : await exportModel(root, fmt.id, { units: s.view?.units });
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

  const saveGlb = useCallback(() => exportCurrent('glb', { remember: false }), [exportCurrent]);

  // ── 3D printing ────────────────────────────────────────
  // The model as shown (scale and turn included), made printable
  // (lib/print3d.js): millimetres, Z up, on the bed, welded, holes closed.
  const printMeshes = useCallback(() => {
    const root = viewerRef.current?.exportRoot();
    if (!root) throw new Error(t('print3d.noModel'));
    return collectMeshes(root, { sampleTexture: canvasTextureSampler() });
  }, [t]);

  const analyzePrint = useCallback(async (opts) => preparePrint(printMeshes(), opts).report, [printMeshes]);

  const savePrint3d = useCallback(async (opts) => {
    if (!current) return;
    setSavingPrint3d(true);
    try {
      const prepared = preparePrint(printMeshes(), opts);
      const bytes = writePrint(prepared, baseOf(current.name) || 'model');
      const fmt = prepared.options.format;
      const saved = await saveBinary({
        defaultName: printFileName(current.name, fmt),
        defaultDir: settingsRef.current?.lastDir,
        bytes,
        filters: [{ name: fmt === 'stl' ? 'STL (mm)' : '3MF (mm)', extensions: [fmt] }],
      });
      if (saved) {
        const r = prepared.report;
        log('info', t('log.print3dSaved', {
          path: saved, size: r.size.map((n) => n.toFixed(1)).join(' × '), state: r.watertight ? t('print3d.watertight') : t('print3d.notWatertightShort'),
        }));
        toast(t('status.saved', { name: baseName(saved) }), 'ok');
        setMessage(t('status.saved', { name: baseName(saved) }));
        setShowPrint3d(false);
      }
    } catch (err) { fail(err, 'save'); } finally { setSavingPrint3d(false); }
  }, [current, fail, log, printMeshes, t, toast]);

  // ── Printing ───────────────────────────────────────────
  const doPrint = useCallback(async ({ pages, printer, copies, landscape, viaSystem }) => {
    const title = current?.name || 'My3DObjects';
    setPrinting(true);
    try {
      if (isDesktop && !viaSystem && api.printTo) {
        const n = await api.printTo({ pages: framePages(pages), printer, copies, landscape, title });
        toast(t('print.sent', { n: n || pages.length }), 'ok');
        log('info', `${t('print.sent', { n: n || pages.length })} — ${printer}`);
      } else {
        await printViaBrowser(pages, title);
      }
      setShowPrint(false);
    } catch (err) {
      if (!/PRINT_CANCELLED/.test(String(err?.message || err))) fail(err, 'print');
    } finally {
      setPrinting(false);
    }
  }, [current, fail, log, t, toast]);

  const printInfo = useMemo(() => {
    if (!current) return { title: 'My3DObjects', lines: [] };
    const st = current.stats || {};
    const unit = settings?.view?.units === 'none' ? '' : ` ${settings?.view?.units || ''}`;
    const size = (st.size || []).map((n) => (n * (transform.scale || 1)).toFixed(3)).join(' × ');
    return {
      title: current.name,
      lines: [
        `${t('modelTab.size')}: ${size}${unit}`,
        `${t('right.vertices')} ${(st.vertices || 0).toLocaleString()} · ${t('modelTab.triangles')} ${(st.triangles || 0).toLocaleString()} · ${t('modelTab.materials')} ${st.materials || 0} · ${t('modelTab.textures')} ${st.textures || 0}`,
        current.fromImage ? `${t('modelTab.from')}: ${current.fromImage}${lastJob ? ` · ${lastJob.modelName} · ${lastJob.deviceName}` : ''}` : (current.path || current.format?.toUpperCase() || ''),
        new Date().toLocaleString(),
      ].filter(Boolean),
    };
  }, [current, lastJob, settings?.view?.units, t, transform.scale]);

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
    const m = models.find((x) => x.id === id);
    // A region-limited license is shown and accepted first.
    if (needsLicense(m)) { setLicenseFor(m); return; }
    if (m?.status === 'needs-cert') { setCertFor(m); return; }
    setSettings((s) => ({ ...pickVersion(s, models, id), backend: s.backend === 'stability' ? 'local' : s.backend }));
    log('info', t('log.modelPicked', { name: m?.name || id }));
  }, [log, models, setSettings, t]);

  const installModel = useCallback(async (id) => {
    const m = models.find((x) => x.id === id);
    if (needsLicense(m)) { setLicenseFor(m); return; }
    if (m?.status === 'needs-cert') { setCertFor(m); return; }
    try { await client?.installModel(id); } catch (err) { fail(err, 'engine'); }
  }, [client, fail, models]);

  // A download server's certificate has expired: the engine stopped and
  // waits. Asked once per host on its own; the model panel asks again.
  const certAsked = useRef(new Set());
  useEffect(() => {
    const m = models.find((x) => x.status === 'needs-cert' && x.certHost && !certAsked.current.has(x.certHost));
    if (m) { certAsked.current.add(m.certHost); setCertFor(m); }
  }, [models]);
  const allowCert = useCallback(async (m) => {
    setCertFor(null);
    try {
      await client?.config({ allowExpiredCert: m.certHost });
      log('warn', t('cert.allowed', { host: m.certHost, name: m.name }));
      toast(t('cert.allowed', { host: m.certHost, name: m.name }), 'warn');
    } catch (err) { fail(err, 'engine'); }
  }, [client, fail, log, t, toast]);

  // The user ticked the box and accepted: the engine records it for the
  // whole family, and the model becomes the one in use.
  const acceptLicense = useCallback(async (m) => {
    setLicenseFor(null);
    try {
      await client?.config({ acceptLicense: m.family || m.id });
      setSettings((s) => ({ ...pickVersion(s, models, m.id), backend: s.backend === 'stability' ? 'local' : s.backend }));
      log('info', t('license.accepted', { name: m.familyName || m.name }));
      toast(t('license.accepted', { name: m.familyName || m.name }), 'ok');
    } catch (err) { fail(err, 'engine'); }
  }, [client, fail, log, models, setSettings, t, toast]);

  const openGuide = useCallback(() => {
    const page = settingsRef.current?.lang === 'en' ? 'Guide.en.html' : 'Guide.html';
    if (isDesktop) api.win.openGuide(page).catch((err) => fail(err, 'guide'));
    else window.open(`./doc/${page}`, '_blank', 'noopener');
  }, [fail]);

  const saveLog = useCallback(async (text) => {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const saved = await saveText({ defaultName: `my3dobjects-${stamp}.log`, defaultDir: settingsRef.current?.lastDir, content: text, filters: [{ name: 'Log', extensions: ['log', 'txt'] }] });
      if (saved) toast(t('status.saved', { name: baseName(saved) }), 'ok');
    } catch (err) { fail(err, 'save'); }
  }, [fail, t, toast]);

  // ── Context menus (every item has an icon) ─────────────
  const closeMenu = useCallback(() => setMenu((m) => ({ ...m, open: false })), []);
  const openMenu = useCallback((x, y, items) => setMenu({ open: true, x, y, items }), []);

  const copyView = useCallback(async () => {
    const shot = viewerRef.current?.snapshot();
    if (!shot) return;
    try { await copyImage(shot); toast(t('status.copied'), 'ok'); } catch (err) { fail(err, 'copy'); }
  }, [fail, t, toast]);

  const viewMenu = useCallback((x, y) => {
    const v = settingsRef.current.view;
    const toggle = (key) => () => setSettings((s) => ({ ...s, view: { ...s.view, [key]: !s.view[key] } }));
    const on = (b) => (b ? ' ✓' : '');
    const has = !!current;
    openMenu(x, y, [
      { icon: IconFit, label: t('toolbar.fit'), onClick: () => viewerRef.current?.fit(), disabled: !has },
      { icon: IconEye, label: t('view.front'), onClick: () => viewerRef.current?.setView('front'), disabled: !has },
      { icon: IconEye, label: t('view.top'), onClick: () => viewerRef.current?.setView('top'), disabled: !has },
      { icon: IconEye, label: t('view.iso'), onClick: () => viewerRef.current?.setView('iso'), disabled: !has },
      { separator: true },
      { icon: IconOrbit, label: t('toolbar.autoRotate') + on(v.autoRotate), onClick: toggle('autoRotate') },
      { icon: IconWireframe, label: t('toolbar.wireframe') + on(v.wireframe), onClick: toggle('wireframe') },
      { icon: IconGrid, label: t('toolbar.grid') + on(v.grid), onClick: toggle('grid') },
      { icon: IconAxes, label: t('toolbar.axes') + on(v.axes), onClick: toggle('axes') },
      { icon: IconRuler, label: t('toolbar.rulers') + on(v.rulers), onClick: toggle('rulers') },
      { icon: IconBox, label: t('toolbar.bbox') + on(v.boundingBox), onClick: toggle('boundingBox') },
      { icon: IconBulb, label: t('toolbar.lights') + on(v.showLightHelpers), onClick: toggle('showLightHelpers') },
      { separator: true },
      { icon: IconSave, label: t('toolbar.save'), onClick: saveGlb, disabled: !has },
      { icon: IconExport, label: `${t('toolbar.export')} (${settingsRef.current.exportFormat.toUpperCase()})`, onClick: () => exportCurrent(), disabled: !has },
      { icon: IconPrint, label: t('toolbar.print'), onClick: () => setShowPrint(true), disabled: !has },
      { icon: IconPrinter3D, label: t('toolbar.print3d'), onClick: () => setShowPrint3d(true), disabled: !has },
      { icon: IconCamera, label: t('toolbar.screenshot'), onClick: screenshot, disabled: !has },
      { icon: IconCopy, label: t('menu.copyView'), onClick: copyView, disabled: !has },
      { separator: true },
      { icon: IconImage, label: t('toolbar.openImage'), onClick: openImage },
      { icon: IconCube, label: t('toolbar.openModel'), onClick: openModel },
      { icon: IconSettings, label: t('menu.viewSettings'), onClick: () => setSettings((s) => ({ ...s, rightPanel: true, rightTab: 'scene' })) },
    ]);
  }, [copyView, current, exportCurrent, openImage, openMenu, openModel, saveGlb, setSettings, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const imageMenu = useCallback((x, y) => {
    openMenu(x, y, [
      { icon: IconImage, label: t('left.choose'), onClick: openImage },
      { icon: IconWand, label: t('toolbar.convert'), onClick: () => convert(), disabled: !image || busy },
      { icon: IconCopy, label: t('menu.copyName'), onClick: () => copyText(image?.path || image?.name || '').then(() => toast(t('status.copied'), 'ok')), disabled: !image },
      { separator: true },
      { icon: IconClose, label: t('menu.clearImage'), onClick: () => { setImage(null); setPrepared(null); }, disabled: !image || busy, danger: true },
    ]);
  }, [busy, convert, image, openImage, openMenu, t, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const historyMenu = useCallback((x, y, h) => {
    openMenu(x, y, [
      { icon: IconCube, label: t('menu.showItem'), onClick: () => showHistory(h) },
      { icon: IconSave, label: t('left.saveItem'), onClick: () => saveHistory(h) },
      { icon: IconCopy, label: t('menu.copyName'), onClick: () => copyText(h.path || h.name).then(() => toast(t('status.copied'), 'ok')) },
      { separator: true },
      { icon: IconTrash, label: t('left.removeItem'), onClick: () => setHistory((list) => list.filter((x2) => x2.id !== h.id)), danger: true },
    ]);
  }, [openMenu, t, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const logMenu = useCallback((x, y, line, shownText) => {
    openMenu(x, y, [
      { icon: IconCopy, label: t('menu.copyLine'), onClick: () => copyText(line.msg).then(() => toast(t('status.copied'), 'ok')), disabled: !line },
      { icon: IconCopy, label: t('log.copy'), onClick: () => copyText(shownText).then(() => toast(t('status.copied'), 'ok')) },
      { icon: IconSave, label: t('log.save'), onClick: () => saveLog(shownText) },
      { separator: true },
      { icon: IconTrash, label: t('log.clear'), onClick: () => setLines([]), danger: true },
      { icon: IconTerminal, label: t('log.close'), onClick: () => setSettings((s) => ({ ...s, logPanel: false })) },
    ]);
  }, [openMenu, saveLog, setSettings, t, toast]);

  // ── Tutorial ───────────────────────────────────────────
  // What the tour's steps need from the app (components/Tutorial.jsx).
  const tourRef = useRef({});
  tourRef.current = { samples, current, openSample, setSettings };
  const tourApi = useMemo(() => ({
    closeTransient: async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      setMenu((m) => ({ ...m, open: false }));
      setShowSettings(false);
      setShowPrint(false);
      setSelectedLight(null);
    },
    showStart: (on) => setHomeOpen(!!on),
    openSample: async (file, kind) => {
      const { samples: list, current: cur, openSample: open } = tourRef.current;
      const entry = list && ['images', 'models', 'results'].flatMap((g) => list[g]).find((e) => e.file === file);
      if (!entry) return;
      const name = file.split('/').pop();
      if (kind === 'model' && cur?.name === name) { setHomeOpen(false); return; }
      await open(entry);
      setHomeOpen(false);
      if (kind === 'model') {
        const end = Date.now() + 8000;
        while (Date.now() < end && !window.__my3dobjectsViewer?.model) await new Promise((r) => { setTimeout(r, 100); });
      }
    },
    selectTab: (id) => { setHomeOpen(false); tourRef.current.setSettings((s) => ({ ...s, rightPanel: true, rightTab: id })); },
    showPanels: () => { setHomeOpen(false); tourRef.current.setSettings((s) => ({ ...s, leftPanel: true, rightPanel: true, logPanel: true })); },
    openSettings: (tab) => { setSettingsTab(tab); setShowSettings(true); },
    openPrint: () => { if (tourRef.current.current) setShowPrint(true); },
    selectLight: (id) => setSelectedLight(id),
  }), []);

  const startTour = useCallback((resume = false) => {
    setAskTour(false);
    if (!resume) setSettings((s) => ({ ...s, tutorialIndex: 0 }));
    setTourActive(true);
  }, [setSettings]);

  const stopTour = useCallback((done) => {
    setTourActive(false);
    setSettings((s) => ({ ...s, tutorialDone: s.tutorialDone || !!done, tutorialIndex: done ? 0 : s.tutorialIndex }));
  }, [setSettings]);

  // ── Keyboard ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); if (e.shiftKey) openModel(); else openImage(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (e.shiftKey) exportCurrent(); else saveGlb(); }
      else if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); if (current) { if (e.shiftKey) setShowPrint3d(true); else setShowPrint(true); } }
      else if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); setSettings((s) => ({ ...s, logPanel: !s.logPanel })); }
      else if (e.key === 'F5' || (mod && e.key === 'Enter')) { e.preventDefault(); convert(); }
      else if (e.key === 'F1') { e.preventDefault(); openGuide(); }
      else if (e.key === 'Escape' && busy) cancel();
      else if (!mod && e.key.toLowerCase() === 'f' && current) viewerRef.current?.fit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, cancel, convert, current, exportCurrent, openGuide, openImage, openModel, saveGlb, setSettings]);

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
        panelsLocked={startVisible}
        onHome={() => setHomeOpen(!startVisible)}
        onOpenImage={openImage}
        onOpenModel={openModel}
        onOpenRecent={openRecent}
        samples={samples}
        onOpenSample={openSample}
        onRemoveRecent={(key) => setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, key) }))}
        onClearRecent={clearRecent}
        onConvert={convert}
        onConvertSettings={() => setShowConvertSettings(true)}
        onCancel={cancel}
        onPickModel={pickModel}
        onInstallModel={installModel}
        onSave={saveGlb}
        onExport={exportCurrent}
        onPrint={() => setShowPrint(true)}
        onPrint3d={() => setShowPrint3d(true)}
        onScreenshot={screenshot}
        onFit={() => viewerRef.current?.fit()}
        onView={(name) => viewerRef.current?.setView(name)}
        onTheme={(id) => setSettings((s) => ({ ...s, theme: id }))}
        onLang={() => setSettings((s) => ({ ...s, lang: s.lang === 'en' ? 'ko' : 'en' }))}
        onHelp={openGuide}
        onTutorial={() => startTour(true)}
        onShowSettings={() => setShowSettings(true)}
        onAbout={() => setShowAbout(true)}
      />

      <div className="workarea">
        {/* The start screen takes the whole work area: no side or log panels
            under it (their toolbar buttons are disabled meanwhile). */}
        {startVisible ? null : (
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
          onClearHistory={() => setHistory([])}
          onOpenRecent={openRecent}
          onRemoveRecent={(key) => setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, key) }))}
          onClearRecent={clearRecent}
          onImageMenu={imageMenu}
          onHistoryMenu={historyMenu}
        />
        )}
        {/* The middle column: the 3D view and, under it, the log. The side
            panels run the full height beside it. */}
        <div className="center-col">
        <div className="center-stage">
        <ViewerPane
          ref={viewerRef}
          view={settings.view}
          lights={settings.lights}
          object={current?.object || null}
          animations={current?.animations}
          job={job}
          busy={busy}
          hasImage={!!image}
          dragOver={dragOver}
          onCancel={cancel}
          onOpenImage={openImage}
          onOpenModel={openModel}
          selectedLight={selectedLight}
          onContextMenu={viewMenu}
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
        </div>
        {startVisible ? null : (
        <LogPanel
          settings={settings}
          onSettings={setSettings}
          lines={lines}
          onClear={() => setLines([])}
          onCopy={async (text) => { try { await copyText(text); toast(t('status.copied'), 'ok'); } catch (err) { fail(err, 'copy'); } }}
          onSave={saveLog}
          onLineMenu={logMenu}
        />
        )}
        </div>
        {startVisible ? null : (
        <RightPanel
          settings={settings}
          onSettings={setSettings}
          models={models}
          health={health}
          lastJob={lastJob}
          onDevice={(id) => setSettings((s) => ({ ...s, device: id }))}
          onPickModel={pickModel}
          modelInfo={current}
          transform={transform}
          onTransform={setTransform}
          selectedLight={selectedLight}
          onSelectLight={setSelectedLight}
          onView={(name) => viewerRef.current?.setView(name)}
          onFit={() => viewerRef.current?.fit()}
          onOpenConvertSettings={() => setShowConvertSettings(true)}
          onRefine={refine}
          canRefine={canRefine}
          refining={refining}
        />
        )}
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
            samples={samples}
            onOpenSample={openSample}
            onRemoveRecent={(key) => setSettings((s) => ({ ...s, recentFiles: removeRecentFile(s.recentFiles, key) }))}
            onClearRecent={clearRecent}
            onGuide={openGuide}
            onTutorial={() => startTour(true)}
            onRetry={retryEngine}
            onToken={sendToken}
            onShowLog={() => { setHomeOpen(false); setSettings((s) => ({ ...s, logPanel: true })); }}
            onPickModel={pickModel}
            onClose={() => setHomeOpen(false)}
          />
        ) : null}
      </div>

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
        tab={settingsTab}
        onTutorial={() => { setShowSettings(false); startTour(false); }}
        open={showSettings}
        settings={settings}
        onChange={(next) => setSettings(() => next)}
        onClose={() => { setShowSettings(false); setSettingsTab(null); }}
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
      <PrintDialog
        open={showPrint && !!current}
        settings={settings}
        onChange={(next) => setSettings(() => next)}
        onPrint={doPrint}
        onClose={() => setShowPrint(false)}
        busy={printing}
        capture={(opts) => viewerRef.current?.viewer()?.capture(opts)}
        info={printInfo}
        listPrinters={isDesktop && api.listPrinters ? api.listPrinters : null}
      />
      <Print3DDialog
        open={showPrint3d && !!current}
        options={settings.print3d}
        onChange={(print3d) => setSettings((s) => ({ ...s, print3d }))}
        analyze={analyzePrint}
        onSave={savePrint3d}
        onClose={() => setShowPrint3d(false)}
        busy={savingPrint3d}
        name={current?.name || ''}
      />
      <ContextMenu open={menu.open} x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />
      <ConvertSettingsDialog
        open={showConvertSettings}
        onClose={() => setShowConvertSettings(false)}
        settings={settings}
        onSettings={setSettings}
        models={models}
        health={health}
        onConvert={convert}
        canConvert={!!image && !busy}
        onRefine={refine}
        canRefine={canRefine}
        refining={refining}
      />
      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} health={health} />
      <ErrorDialog error={error} onClose={() => setError(null)} />
      <LicenseDialog model={licenseFor} onAccept={acceptLicense} onCancel={() => setLicenseFor(null)} />
      <CertDialog model={certFor} onAllow={allowCert} onCancel={() => setCertFor(null)} />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
      <Tooltip />
      <Tutorial
        active={tourActive}
        index={Math.min(settings.tutorialIndex, STEPS.length - 1)}
        onIndex={(i) => setSettings((s) => ({ ...s, tutorialIndex: i }))}
        onStop={stopTour}
        app={tourApi}
      />
      <TutorialAsk
        open={askTour && !tourActive}
        settings={settings}
        onStart={startTour}
        onLater={() => setAskTour(false)}
        onChange={(on) => setSettings((s) => ({ ...s, tutorialAsk: on }))}
      />
    </div>
  );
}


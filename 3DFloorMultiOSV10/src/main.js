import './style.css';
import { SceneApp } from './scene/SceneApp.js';
import { analyzeFloorPlan } from './api/client.js';
import { detectHeuristic } from './detect/heuristic.js';
import { detectDreamspace } from './detect/dreamspace.js';
import { demoFloorPlan } from './data/demoFloorPlan.js';
import {
  mountToolbar,
  setToolbarActive,
  setToolbarToggle,
  updateThemeToolbarButton,
  updateLangToolbarButton,
  refreshToolbarLabels,
} from './ui/toolbar.js';
import { initTheme, toggleTheme, getTheme } from './ui/theme.js';
import {
  initLocale,
  toggleLocale,
  getLocale,
  t,
  translateError,
  i18nError,
} from './i18n/index.js';
import {
  showErrorDialog,
  refreshErrorDialogLocale,
  isSeriousError,
  installGlobalErrorHandlers,
} from './ui/errorDialog.js';
import { showInfoDialog, refreshInfoDialogLocale } from './ui/infoDialog.js';
import {
  ACCEPT_OPEN_FILES,
  ACCEPT_MODEL_FILES,
  isImageFile,
  isModelFile,
  isSupportedOpenFile,
  loadModelFromFiles,
} from './loaders/modelLoader.js';
import {
  isDesktopApp,
  openDesktopFiles,
  rememberDesktopFiles,
  saveExportFile,
} from './desktop/bridge.js';
import { exportObject, getExportFormat } from './exporters/modelExport.js';
import { showSaveDialog, refreshSaveDialogLocale } from './ui/saveDialog.js';

const appRoot = document.getElementById('app');
mountToolbar(appRoot);

const viewport = document.getElementById('viewport');
const app = new SceneApp(viewport);

const initialTheme = initTheme();
app.setTheme(initialTheme);

const initialLocale = initLocale();
updateThemeToolbarButton(initialTheme);
updateLangToolbarButton(initialLocale);

document.addEventListener('themechange', (e) => {
  const theme = e.detail?.theme || getTheme();
  app.setTheme(theme);
  updateThemeToolbarButton(theme);
  refreshStatusBarMeta();
  // Dialog chrome follows CSS vars; refresh report text for theme label.
  refreshErrorDialogLocale();
});

document.addEventListener('localechange', (e) => {
  const locale = e.detail?.locale || getLocale();
  refreshToolbarLabels();
  updateThemeToolbarButton(getTheme());
  updateLangToolbarButton(locale);
  refreshErrorDialogLocale();
  refreshInfoDialogLocale();
  refreshSaveDialogLocale();
  refreshStatus();
});

function reportSeriousError({ summary, summaryKey = '', error = null, context = {}, details = '' }) {
  const message = summary || translateError(error) || t('errorDialog.unexpected');
  setStatus('status.seriousError', 'error');
  showErrorDialog({
    summary: message,
    summaryKey,
    details,
    error,
    context,
  });
}

installGlobalErrorHandlers(({ summary, summaryKey, error, context }) => {
  reportSeriousError({ summary, summaryKey, error, context });
});

const els = {
  imageInput: document.getElementById('imageInput'),
  modelInput: document.getElementById('modelInput'),
  openInput: document.getElementById('openInput'),
  dropOverlay: document.getElementById('dropOverlay'),
  modeSelect: document.getElementById('modeSelect'),
  apiUrlField: document.getElementById('apiUrlField'),
  apiUrl: document.getElementById('apiUrl'),
  dreamspaceHint: document.getElementById('dreamspaceHint'),
  convertBtn: document.getElementById('convertBtn'),
  statusBar: document.getElementById('statusBar'),
  status: document.getElementById('status'),
  statusDot: document.getElementById('statusDot'),
  sbContent: document.getElementById('sbContent'),
  sbMode: document.getElementById('sbMode'),
  sbTool: document.getElementById('sbTool'),
  sbSegments: document.getElementById('sbSegments'),
  sbTheme: document.getElementById('sbTheme'),
  sbLocale: document.getElementById('sbLocale'),
  scaleRange: document.getElementById('scaleRange'),
  wallHeight: document.getElementById('wallHeight'),
  wallHeightValue: document.getElementById('wallHeightValue'),
  wallThickness: document.getElementById('wallThickness'),
  wallThicknessValue: document.getElementById('wallThicknessValue'),
  wallColor: document.getElementById('wallColor'),
  floorColor: document.getElementById('floorColor'),
  showAxes: document.getElementById('showAxes'),
  showGrid: document.getElementById('showGrid'),
  mainIntensity: document.getElementById('mainIntensity'),
  fillIntensity: document.getElementById('fillIntensity'),
  hemiIntensity: document.getElementById('hemiIntensity'),
  lightColor: document.getElementById('lightColor'),
  lightX: document.getElementById('lightX'),
  lightY: document.getElementById('lightY'),
  lightZ: document.getElementById('lightZ'),
  lightXRange: document.getElementById('lightXRange'),
  lightYRange: document.getElementById('lightYRange'),
  lightZRange: document.getElementById('lightZRange'),
  castShadow: document.getElementById('castShadow'),
  lightGizmo: document.getElementById('lightGizmo'),
  lightHud: document.getElementById('lightHud'),
  lightHudDrag: document.getElementById('lightHudDrag'),
};

let selectedFile = null;
let lastDetection = null;
let syncingUi = false;
let lastStatus = { key: 'status.ready', vars: {}, kind: '' };
/** @type {{ kind: 'empty' | 'demo' | 'floorplan' | 'model', name?: string, format?: string }} */
let contentInfo = { kind: 'empty', name: '' };
/** @type {'none' | 'rotate' | 'scale' | 'light'} */
let activeTool = 'none';

function isMessageKey(value) {
  return typeof value === 'string' && /^[a-z]+(?:\.[a-zA-Z0-9]+)+$/.test(value);
}

function setStatus(keyOrText, kind = '', vars = {}) {
  if (isMessageKey(keyOrText)) {
    lastStatus = { key: keyOrText, vars, kind };
    if (els.status) els.status.textContent = t(keyOrText, vars);
  } else {
    lastStatus = { key: null, vars: {}, kind, text: keyOrText };
    if (els.status) els.status.textContent = keyOrText;
  }
  if (els.statusBar) {
    els.statusBar.className = `statusbar ${kind}`.trim();
  }
  refreshStatusBarMeta();
}

function refreshStatus() {
  if (!els.status) return;
  if (lastStatus.key) {
    els.status.textContent = t(lastStatus.key, lastStatus.vars);
  } else if (lastStatus.text) {
    els.status.textContent = lastStatus.text;
  }
  if (els.statusBar) {
    els.statusBar.className = `statusbar ${lastStatus.kind || ''}`.trim();
  }
  refreshStatusBarMeta();
}

function metaLabel(labelKey, value) {
  return `${t(labelKey)}: ${value}`;
}

function refreshStatusBarMeta() {
  if (!els.sbContent) return;

  let contentValue = t('statusbar.contentEmpty');
  if (contentInfo.kind === 'model') {
    contentValue = contentInfo.name
      ? `${t('statusbar.contentModel')} · ${contentInfo.name}`
      : t('statusbar.contentModel');
  } else if (contentInfo.kind === 'floorplan') {
    contentValue = contentInfo.name
      ? `${t('statusbar.contentFloorplan')} · ${contentInfo.name}`
      : t('statusbar.contentFloorplan');
  } else if (contentInfo.kind === 'demo') {
    contentValue = t('statusbar.contentDemo');
  }
  els.sbContent.textContent = metaLabel('statusbar.content', contentValue);
  els.sbContent.title = contentValue;

  const modeKey = `mode.${els.modeSelect?.value || 'heuristic'}`;
  els.sbMode.textContent = metaLabel('statusbar.mode', t(modeKey));

  const toolKey =
    activeTool === 'rotate'
      ? 'statusbar.toolRotate'
      : activeTool === 'scale'
        ? 'statusbar.toolScale'
        : activeTool === 'light'
          ? 'statusbar.toolLight'
          : 'statusbar.toolNone';
  els.sbTool.textContent = metaLabel('statusbar.tool', t(toolKey));

  const segCount =
    contentInfo.kind === 'model' || !lastDetection?.points
      ? '—'
      : String(lastDetection.points.length);
  els.sbSegments.textContent = metaLabel('statusbar.segments', segCount);

  const theme = getTheme();
  els.sbTheme.textContent = metaLabel(
    'statusbar.theme',
    theme === 'light' ? t('statusbar.themeLight') : t('statusbar.themeDark'),
  );

  const locale = getLocale();
  els.sbLocale.textContent = metaLabel(
    'statusbar.locale',
    locale === 'en' ? 'EN' : 'KO',
  );
}

function syncModeUi() {
  const mode = els.modeSelect.value;
  els.apiUrlField?.classList.toggle('hidden', mode !== 'api');
  els.dreamspaceHint?.classList.toggle('hidden', mode !== 'dreamspace');
  refreshStatusBarMeta();
}

function buildOptions() {
  return {
    scale: Number(els.scaleRange.value),
    wallHeight: Number(els.wallHeight.value),
    wallThickness: Number(els.wallThickness.value),
  };
}

function syncWallDimensionLabels() {
  if (els.wallHeightValue) {
    els.wallHeightValue.textContent = `${Number(els.wallHeight.value).toFixed(2)} m`;
  }
  if (els.wallThicknessValue) {
    els.wallThicknessValue.textContent = `${Number(els.wallThickness.value).toFixed(2)} m`;
  }
}

function applyAppearance() {
  app.applyColors({
    wall: els.wallColor.value,
    floor: els.floorColor.value,
  });
}

function rebuild() {
  applyAppearance();
  // Keep the 2D plan preview on canvas until a detection exists
  if (!lastDetection) return;
  app.rebuild(lastDetection, buildOptions());
}

function applyAxesFromUi() {
  app.setAxesVisible(els.showAxes?.checked !== false);
  app.setGridVisible(Boolean(els.showGrid?.checked));
}

function readFiniteNumber(el, fallback = 0) {
  const n = Number(el?.value);
  return Number.isFinite(n) ? n : fallback;
}

function syncLightAxisPair(axis, value) {
  const num = els[`light${axis}`];
  const range = els[`light${axis}Range`];
  const text = Number(value).toFixed(1);
  if (num) num.value = text;
  if (range) {
    const min = Number(range.min);
    const max = Number(range.max);
    const clamped = Math.min(max, Math.max(min, Number(value)));
    range.value = String(clamped);
  }
}

function applyLightFromUi(event) {
  if (syncingUi) return;

  // Keep slider ↔ number pairs in sync (do not rewrite the number while typing)
  const src = event?.target;
  const fromRange = (axis) => {
    const range = els[`light${axis}Range`];
    const num = els[`light${axis}`];
    if (!range || !num) return;
    num.value = Number(range.value).toFixed(1);
  };
  const fromNumber = (axis) => {
    const range = els[`light${axis}Range`];
    const num = els[`light${axis}`];
    if (!range || !num) return;
    const n = Number(num.value);
    if (!Number.isFinite(n)) return;
    const min = Number(range.min);
    const max = Number(range.max);
    range.value = String(Math.min(max, Math.max(min, n)));
  };
  if (src === els.lightXRange) fromRange('X');
  if (src === els.lightYRange) fromRange('Y');
  if (src === els.lightZRange) fromRange('Z');
  if (src === els.lightX) fromNumber('X');
  if (src === els.lightY) fromNumber('Y');
  if (src === els.lightZ) fromNumber('Z');

  app.setLightState({
    mainIntensity: readFiniteNumber(els.mainIntensity, 1.35),
    fillIntensity: readFiniteNumber(els.fillIntensity, 0.45),
    hemiIntensity: readFiniteNumber(els.hemiIntensity, 0.55),
    color: els.lightColor.value,
    position: {
      x: readFiniteNumber(els.lightX, 8),
      y: readFiniteNumber(els.lightY, 14),
      z: readFiniteNumber(els.lightZ, 6),
    },
    castShadow: els.castShadow.checked,
  });
}

function syncLightUi() {
  syncingUi = true;
  const L = app.getLightState();
  els.mainIntensity.value = String(L.mainIntensity);
  els.fillIntensity.value = String(L.fillIntensity);
  els.hemiIntensity.value = String(L.hemiIntensity);
  els.lightColor.value = L.color;
  syncLightAxisPair('X', L.position.x);
  syncLightAxisPair('Y', L.position.y);
  syncLightAxisPair('Z', L.position.z);
  els.castShadow.checked = L.castShadow;
  syncingUi = false;
}

function setLightMoveUi(on, { announce = true } = {}) {
  if (els.lightGizmo) els.lightGizmo.checked = on;
  if (on) {
    app.attachLightGizmo(true);
    activeTool = 'light';
    setToolbarActive('transform', '');
    setToolbarToggle('tbLight', true);
    syncLightUi();
    if (announce) setStatus('status.lightGizmoOn');
    else refreshStatusBarMeta();
  } else {
    app.attachLightGizmo(false);
    app.clearTransformTool();
    setToolbarActive('transform', '');
    setToolbarToggle('tbLight', false);
    activeTool = 'none';
    if (announce) setStatus('status.lightGizmoOff');
    else refreshStatusBarMeta();
  }
}

function setTransformModeUi(mode) {
  // Model translate is disabled; light gizmo may still use translate internally
  const next = mode === 'translate' ? 'rotate' : mode;
  if (els.lightGizmo?.checked) {
    setLightMoveUi(false, { announce: false });
  }
  app.setTransformMode(next);
  setToolbarActive('transform', next);
  activeTool = next === 'scale' ? 'scale' : 'rotate';
  if (next === 'rotate') {
    setStatus('status.rotateMouse');
  } else {
    refreshStatusBarMeta();
  }
}

/** Default view: world axes only, no model transform gizmo. */
function clearTransformToolUi() {
  if (els.lightGizmo?.checked) {
    setLightMoveUi(false, { announce: false });
    return;
  }
  app.clearTransformTool();
  setToolbarActive('transform', '');
  activeTool = 'none';
  refreshStatusBarMeta();
}

function syncToolbarToggles() {
  setToolbarToggle('tbAxes', els.showAxes?.checked);
  setToolbarToggle('tbGrid', els.showGrid?.checked);
  setToolbarToggle('tbLight', els.lightGizmo?.checked);
}

function resetTransformUi() {
  const keepLight = Boolean(els.lightGizmo?.checked);
  app.resetModelTransform();
  app.resetView();
  // Light default is based on content bounds — set after framing, never at (0,0,0)
  app.resetLightToDefault();
  syncLightUi();
  setLightMoveUi(keepLight, { announce: false });
  refreshStatusBarMeta();
}

function defaultExportBaseName() {
  return (contentInfo.name || 'floorplan-3d')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\-가-힣]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'floorplan-3d';
}

function exportFilterFor(format) {
  const name = format.ext.toUpperCase();
  return [{ name: `${name} (*.${format.ext})`, extensions: [format.ext] }];
}

async function saveResult() {
  const mode = app.contentMode;
  if (mode === 'empty' || mode === 'plan2d') {
    setStatus('status.saveEmpty', 'warn');
    return;
  }

  const formatId = await showSaveDialog({ defaultFormat: 'glb' });
  if (!formatId) {
    setStatus('status.saveCanceled');
    return;
  }

  const format = getExportFormat(formatId);
  if (!format) {
    setStatus('status.saveFailed', 'error');
    return;
  }

  const fileName = `${defaultExportBaseName()}.${format.ext}`;

  try {
    setStatus('status.saveBusy', 'busy');
    let result;

    if (format.id === 'png') {
      const dataUrl = app.captureTransparentPngDataUrl();
      if (!dataUrl?.startsWith('data:image/png')) {
        setStatus('status.saveFailed', 'error');
        return;
      }
      result = await saveExportFile({
        defaultName: fileName,
        dataUrl,
        mime: format.mime,
        filters: exportFilterFor(format),
        title: t('saveDialog.title'),
      });
    } else {
      const exported = await exportObject(app.getExportRoot(), format.id);
      result = await saveExportFile({
        defaultName: fileName,
        bytes: exported.bytes,
        text: exported.text,
        mime: format.mime,
        filters: exportFilterFor(format),
        title: t('saveDialog.title'),
      });
    }

    if (result?.canceled) {
      setStatus('status.saveCanceled');
      return;
    }
    if (result?.ok === false) {
      setStatus('status.saveFailed', 'error');
      return;
    }
    setStatus('status.saveOk', 'ok', { name: result?.name || fileName });
  } catch (err) {
    console.error(err);
    setStatus('status.saveFailed', 'error');
  }
}

async function convert() {
  const mode = els.modeSelect.value;
  els.convertBtn.disabled = true;
  setStatus('status.converting', 'busy');

  try {
    // When a floor-plan image is selected, always derive walls from that image
    // using the selected analysis mode — never substitute canned demo geometry.
    if (mode === 'demo') {
      if (selectedFile) {
        lastDetection = await detectHeuristic(selectedFile);
        contentInfo = { kind: 'floorplan', name: selectedFile.name };
        setStatus('status.heuristicDone', 'ok', { count: lastDetection.points.length });
      } else {
        lastDetection = structuredClone(demoFloorPlan);
        contentInfo = { kind: 'demo', name: '' };
        setStatus('status.demoDone', 'ok');
      }
    } else if (mode === 'dreamspace') {
      // With an image: detect from pixels. Without: offline mock apartment layout.
      lastDetection = await detectDreamspace(selectedFile);
      contentInfo = {
        kind: selectedFile ? 'floorplan' : 'demo',
        name: selectedFile?.name || 'DreamSpaceAI',
      };
      setStatus(
        selectedFile ? 'status.dreamspaceImageDone' : 'status.dreamspaceDone',
        'ok',
        { count: lastDetection.points.length },
      );
    } else if (mode === 'heuristic') {
      if (!selectedFile) {
        throw i18nError('error.selectImage');
      }
      lastDetection = await detectHeuristic(selectedFile);
      contentInfo = { kind: 'floorplan', name: selectedFile.name };
      setStatus('status.heuristicDone', 'ok', { count: lastDetection.points.length });
    } else if (mode === 'api') {
      if (!selectedFile) {
        throw i18nError('error.selectImage');
      }
      lastDetection = await analyzeFloorPlan(els.apiUrl.value, selectedFile);
      contentInfo = { kind: 'floorplan', name: selectedFile.name };
      setStatus('status.apiDone', 'ok', { count: lastDetection.points.length });
    } else {
      throw i18nError('error.unknownMode', { mode });
    }
    rebuild();
  } catch (err) {
    console.error(err);
    const message = translateError(err);
    if (isSeriousError(err)) {
      reportSeriousError({
        summary: message,
        error: err,
        context: {
          action: 'convert',
          mode: els.modeSelect.value,
          apiUrl: els.apiUrl.value,
          fileName: selectedFile?.name || '',
        },
      });
    } else {
      setStatus(message, 'error');
    }
  } finally {
    els.convertBtn.disabled = false;
  }
}

async function setSelectedImage(file) {
  if (!file) return;
  selectedFile = file;
  lastDetection = null;
  contentInfo = { kind: 'floorplan', name: file.name };
  setStatus('status.imageLoading', 'busy', { name: file.name });
  try {
    await app.showPlanImage(file);
    setStatus('status.imageReady', 'ok', { name: file.name });
  } catch (err) {
    reportOpenError(err, { action: 'showPlanImage', fileName: file.name });
  }
}

function reportOpenError(err, context = {}) {
  console.error(err);
  const message = translateError(err);
  if (isSeriousError(err)) {
    reportSeriousError({
      summary: message,
      error: err,
      context,
    });
  } else {
    setStatus(message, 'error');
  }
}

async function openModelFiles(fileList) {
  const files = [...(fileList || [])].filter(Boolean);
  const primary = files.find(isModelFile) || files[0];
  setStatus('status.modelLoading', 'busy', { name: primary?.name || '' });
  try {
    await rememberDesktopFiles(files);
    const { object, fileName, format } = await loadModelFromFiles(files);
    lastDetection = null;
    selectedFile = null;
    contentInfo = { kind: 'model', name: fileName, format };
    app.loadExternalModel(object);
    setStatus('status.modelReady', 'ok', { name: fileName, format: format.toUpperCase() });
  } catch (err) {
    reportOpenError(err, {
      action: 'openModel',
      files: files.map((f) => f.name).join(', '),
    });
  }
}

async function openFiles(fileList) {
  const files = [...(fileList || [])].filter(Boolean);
  if (!files.length) return;
  await rememberDesktopFiles(files);

  // Prefer 3D model when the selection/drop contains one (keep companions: mtl, bin, textures).
  if (files.some(isModelFile)) {
    await openModelFiles(files);
    return;
  }

  const imageFile = files.find(isImageFile);
  if (imageFile) {
    await setSelectedImage(imageFile);
    return;
  }

  reportOpenError(i18nError('error.unsupportedFormat', { name: files[0].name }), {
    action: 'openFiles',
    fileName: files[0].name,
  });
}

async function pickAndOpen({ mode = 'any', multiple = true } = {}) {
  if (isDesktopApp()) {
    const files = await openDesktopFiles({ mode, multiple });
    if (!files.length) return;
    if (mode === 'image') {
      await setSelectedImage(files[0]);
      return;
    }
    if (mode === 'model') {
      await openModelFiles(files);
      return;
    }
    await openFiles(files);
    return;
  }

  if (mode === 'image') {
    els.imageInput?.click();
  } else if (mode === 'model') {
    els.modelInput?.click();
  } else {
    (els.openInput || els.imageInput)?.click();
  }
}

if (els.openInput) els.openInput.accept = ACCEPT_OPEN_FILES;
if (els.modelInput) els.modelInput.accept = ACCEPT_MODEL_FILES;

els.imageInput?.addEventListener('change', async () => {
  const file = els.imageInput.files?.[0];
  if (!file) {
    selectedFile = null;
    return;
  }
  await rememberDesktopFiles([file]);
  await setSelectedImage(file);
  els.imageInput.value = '';
});

els.modelInput?.addEventListener('change', async () => {
  const files = els.modelInput.files;
  if (!files?.length) return;
  await openModelFiles(files);
  els.modelInput.value = '';
});

els.openInput?.addEventListener('change', async () => {
  const files = els.openInput.files;
  if (!files?.length) return;
  await openFiles(files);
  els.openInput.value = '';
});

let dragDepth = 0;
function setDragOver(active) {
  viewport.classList.toggle('drag-over', active);
  els.dropOverlay?.classList.toggle('hidden', !active);
}

viewport.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth += 1;
  setDragOver(true);
});
viewport.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) setDragOver(false);
});
viewport.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});
viewport.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  setDragOver(false);
  const all = [...(e.dataTransfer?.files || [])];
  if (!all.length) return;
  if (!all.some((f) => isSupportedOpenFile(f) || /\.mtl$/i.test(f.name))) {
    reportOpenError(
      i18nError('error.unsupportedFormat', { name: all[0].name }),
      { action: 'drop' },
    );
    return;
  }
  await openFiles(all);
});

els.modeSelect.addEventListener('change', () => {
  syncModeUi();
  refreshStatusBarMeta();
});
els.convertBtn.addEventListener('click', convert);

for (const el of [els.scaleRange, els.wallHeight, els.wallThickness]) {
  el.addEventListener('input', () => {
    syncWallDimensionLabels();
    if (lastDetection) rebuild();
  });
}

for (const el of [els.wallColor, els.floorColor]) {
  el.addEventListener('input', () => {
    applyAppearance();
  });
}

for (const el of [els.showAxes, els.showGrid]) {
  el?.addEventListener('change', () => {
    applyAxesFromUi();
    syncToolbarToggles();
  });
}

for (const el of [
  els.mainIntensity, els.fillIntensity, els.hemiIntensity,
  els.lightColor,
  els.lightX, els.lightY, els.lightZ,
  els.lightXRange, els.lightYRange, els.lightZRange,
  els.castShadow,
]) {
  if (!el) continue;
  el.addEventListener('input', applyLightFromUi);
  el.addEventListener('change', applyLightFromUi);
}

els.lightGizmo?.addEventListener('change', () => {
  setLightMoveUi(Boolean(els.lightGizmo.checked));
});

// Keep HUD interactions from bubbling into the 3D view
els.lightHud?.addEventListener('pointerdown', (e) => e.stopPropagation());
els.lightHud?.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

/** Drag the light control panel by its title bar. */
function initLightHudDrag() {
  const hud = els.lightHud;
  const handle = els.lightHudDrag;
  if (!hud || !handle) return;

  let drag = null;

  const clamp = (left, top) => {
    const parent = hud.offsetParent || document.getElementById('viewport') || document.body;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const maxL = Math.max(0, pw - hud.offsetWidth);
    const maxT = Math.max(0, ph - hud.offsetHeight);
    return {
      left: Math.min(maxL, Math.max(0, left)),
      top: Math.min(maxT, Math.max(0, top)),
    };
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = hud.getBoundingClientRect();
    const parent = hud.offsetParent || document.getElementById('viewport');
    const parentRect = parent.getBoundingClientRect();
    drag = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      parentLeft: parentRect.left,
      parentTop: parentRect.top,
    };
    hud.classList.add('is-dragging');
    hud.style.right = 'auto';
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const pos = clamp(
      e.clientX - drag.parentLeft - drag.offsetX,
      e.clientY - drag.parentTop - drag.offsetY,
    );
    hud.style.left = `${pos.left}px`;
    hud.style.top = `${pos.top}px`;
  });

  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    hud.classList.remove('is-dragging');
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    if (!hud.style.left && !hud.style.top) return;
    const pos = clamp(parseFloat(hud.style.left) || 0, parseFloat(hud.style.top) || 0);
    hud.style.left = `${pos.left}px`;
    hud.style.top = `${pos.top}px`;
    hud.style.right = 'auto';
  });
}

initLightHudDrag();

app.onModelGizmoMove(refreshStatusBarMeta);
app.onLightGizmoMove(syncLightUi);

document.querySelector('.toolbar')?.addEventListener('click', (event) => {
  const btn = event.target.closest('.toolbar-btn');
  if (!btn) return;

  switch (btn.id) {
    case 'tbImage':
      pickAndOpen({ mode: 'image', multiple: false });
      break;
    case 'tbModel':
      pickAndOpen({ mode: 'model', multiple: true });
      break;
    case 'tbConvert':
      convert();
      break;
    case 'tbSave':
      saveResult();
      break;
    case 'tbRotate':
      setTransformModeUi('rotate');
      break;
    case 'tbScale':
      setTransformModeUi('scale');
      break;
    case 'tbAxes':
      els.showAxes.checked = !els.showAxes.checked;
      applyAxesFromUi();
      setToolbarToggle('tbAxes', els.showAxes.checked);
      setStatus(els.showAxes.checked ? 'status.axesOn' : 'status.axesOff');
      break;
    case 'tbGrid':
      els.showGrid.checked = !els.showGrid.checked;
      applyAxesFromUi();
      setToolbarToggle('tbGrid', els.showGrid.checked);
      setStatus(els.showGrid.checked ? 'status.gridOn' : 'status.gridOff');
      break;
    case 'tbLight':
      setLightMoveUi(!els.lightGizmo?.checked);
      break;
    case 'tbReset':
      resetTransformUi();
      break;
    case 'tbTheme': {
      const theme = toggleTheme();
      setStatus(theme === 'light' ? 'status.themeLight' : 'status.themeDark');
      break;
    }
    case 'tbLang': {
      const locale = toggleLocale();
      refreshStatus();
      setStatus(locale === 'en' ? 'status.langEn' : 'status.langKo');
      break;
    }
    case 'tbInfo':
      showInfoDialog();
      break;
    default:
      break;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.code === 'KeyR') setTransformModeUi('rotate');
  if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) setTransformModeUi('scale');
  // While rotate tool is active: X / Y / Z locks mouse-drag to that world axis (full 360°)
  if (activeTool === 'rotate' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.code === 'KeyX' || e.code === 'KeyY' || e.code === 'KeyZ') {
      const axis = e.code === 'KeyX' ? 'x' : e.code === 'KeyY' ? 'y' : 'z';
      const lock = app.setRotateAxisLock(axis);
      if (lock === 'x') setStatus('status.rotateLockX');
      else if (lock === 'y') setStatus('status.rotateLockY');
      else if (lock === 'z') setStatus('status.rotateLockZ');
      else setStatus('status.rotateLockOff');
    }
  }
});

syncModeUi();
applyAxesFromUi();
applyLightFromUi();
syncWallDimensionLabels();
app.clearContent();
syncLightUi();
app.setMode('orbit');
setLightMoveUi(true, { announce: false });
syncToolbarToggles();
setStatus('status.ready');

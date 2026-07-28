import './style.css';
import { SceneApp } from './scene/SceneApp.js';
import { analyzeFloorPlan } from './api/client.js';
import { detectHeuristic } from './detect/heuristic.js';
import { detectDreamspace } from './detect/dreamspace.js';
import {
  DEFAULT_DREAMSPACE_PARAMS,
  loadDreamspaceParams,
  saveDreamspaceParams,
  resetDreamspaceParams,
  normalizeDreamspaceParams,
} from './detect/dreamspaceParams.js';
import {
  DEFAULT_UNITY_PARAMS,
  loadUnityParams,
  saveUnityParams,
  resetUnityParams,
  normalizeUnityParams,
} from './unityApi/params.js';
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
import { refreshProgressDialogLocale, runWithProgressDialog } from './ui/progressDialog.js';
import { ensureDreamspaceWithUi, getDreamspaceInstallStatus } from './dreamspace/ensure.js';
import { ensureFloorplanApiWithUi, getFloorplanApiStatus } from './unityApi/ensure.js';
import { getFloorPattern, normalizeFloorPatternId } from './data/floorPatterns.js';

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
  refreshProgressDialogLocale();
  refreshStatus();
});

function reportSeriousError({
  summary,
  summaryKey = '',
  titleKey = 'errorDialog.title',
  error = null,
  context = {},
  details = '',
  statusKey = 'status.seriousError',
  statusVars = {},
} = {}) {
  const message = summary || translateError(error) || t('errorDialog.unexpected');
  setStatus(statusKey, 'error', statusVars);
  showErrorDialog({
    summary: message,
    summaryKey,
    titleKey,
    details,
    error,
    context,
  });
}

function reportDreamspaceInstallError(errorText, extra = {}) {
  const details = typeof errorText === 'string' ? errorText : translateError(errorText);
  const err = errorText instanceof Error ? errorText : new Error(details);
  reportSeriousError({
    summary: t('status.dreamspaceInstallFailed', { error: details }),
    titleKey: 'errorDialog.dreamspaceInstallTitle',
    statusKey: 'status.dreamspaceInstallFailed',
    statusVars: { error: details },
    error: err,
    details,
    context: {
      action: 'dreamspaceInstall',
      ...extra,
    },
  });
}

function reportUnityApiInstallError(errorText, extra = {}) {
  const details = typeof errorText === 'string' ? errorText : translateError(errorText);
  const err = errorText instanceof Error ? errorText : new Error(details);
  reportSeriousError({
    summary: t('status.unityApiInstallFailed', { error: details }),
    titleKey: 'errorDialog.unityApiInstallTitle',
    statusKey: 'status.unityApiInstallFailed',
    statusVars: { error: details },
    error: err,
    details,
    context: {
      action: 'unityApiInstall',
      ...extra,
    },
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
  dreamspaceHint: document.getElementById('dreamspaceHint'),
  dreamspaceParams: document.getElementById('dreamspaceParams'),
  dsMaxSide: document.getElementById('dsMaxSide'),
  dsMaxSideValue: document.getElementById('dsMaxSideValue'),
  dsInkMeanScale: document.getElementById('dsInkMeanScale'),
  dsInkMeanScaleValue: document.getElementById('dsInkMeanScaleValue'),
  dsMinRunRatioH: document.getElementById('dsMinRunRatioH'),
  dsMinRunRatioHValue: document.getElementById('dsMinRunRatioHValue'),
  dsMinRunRatioV: document.getElementById('dsMinRunRatioV'),
  dsMinRunRatioVValue: document.getElementById('dsMinRunRatioVValue'),
  dsVerticalDilate: document.getElementById('dsVerticalDilate'),
  dsVerticalDilateValue: document.getElementById('dsVerticalDilateValue'),
  dsVerticalMergeScale: document.getElementById('dsVerticalMergeScale'),
  dsVerticalMergeScaleValue: document.getElementById('dsVerticalMergeScaleValue'),
  dsExtraDilate: document.getElementById('dsExtraDilate'),
  dsExtraDilateValue: document.getElementById('dsExtraDilateValue'),
  dsMergeGapRatio: document.getElementById('dsMergeGapRatio'),
  dsMergeGapRatioValue: document.getElementById('dsMergeGapRatioValue'),
  dsParallelGapRatio: document.getElementById('dsParallelGapRatio'),
  dsParallelGapRatioValue: document.getElementById('dsParallelGapRatioValue'),
  dsDoorWidthM: document.getElementById('dsDoorWidthM'),
  dsDoorWidthMValue: document.getElementById('dsDoorWidthMValue'),
  dsWindowWidthM: document.getElementById('dsWindowWidthM'),
  dsWindowWidthMValue: document.getElementById('dsWindowWidthMValue'),
  dsMorphOpen: document.getElementById('dsMorphOpen'),
  dsParamsReset: document.getElementById('dsParamsReset'),
  apiRuntimeField: document.getElementById('apiRuntimeField'),
  apiRuntime: document.getElementById('apiRuntime'),
  apiUrlField: document.getElementById('apiUrlField'),
  unityParams: document.getElementById('unityParams'),
  unMinConfidence: document.getElementById('unMinConfidence'),
  unMinConfidenceValue: document.getElementById('unMinConfidenceValue'),
  unMaxDetections: document.getElementById('unMaxDetections'),
  unMaxDetectionsValue: document.getElementById('unMaxDetectionsValue'),
  unMinBoxSidePx: document.getElementById('unMinBoxSidePx'),
  unMinBoxSidePxValue: document.getElementById('unMinBoxSidePxValue'),
  unDoorWidthM: document.getElementById('unDoorWidthM'),
  unDoorWidthMValue: document.getElementById('unDoorWidthMValue'),
  unDoorFallbackRatio: document.getElementById('unDoorFallbackRatio'),
  unDoorFallbackRatioValue: document.getElementById('unDoorFallbackRatioValue'),
  unCarveBandScale: document.getElementById('unCarveBandScale'),
  unCarveBandScaleValue: document.getElementById('unCarveBandScaleValue'),
  unParallelGapRatio: document.getElementById('unParallelGapRatio'),
  unParallelGapRatioValue: document.getElementById('unParallelGapRatioValue'),
  unIncludeWalls: document.getElementById('unIncludeWalls'),
  unIncludeWindows: document.getElementById('unIncludeWindows'),
  unIncludeDoors: document.getElementById('unIncludeDoors'),
  unMergeParallel: document.getElementById('unMergeParallel'),
  unCarveOpenings: document.getElementById('unCarveOpenings'),
  unParamsReset: document.getElementById('unParamsReset'),
  apiUrl: document.getElementById('apiUrl'),
  selectedImageCard: document.getElementById('selectedImageCard'),
  selectedImageThumb: document.getElementById('selectedImageThumb'),
  selectedImagePlaceholder: document.getElementById('selectedImagePlaceholder'),
  selectedImageName: document.getElementById('selectedImageName'),
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
  floorPattern: document.getElementById('floorPattern'),
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
/** @type {string | null} */
let selectedImageThumbUrl = null;
let lastDetection = null;
let syncingUi = false;
let lastStatus = { key: 'status.ready', vars: {}, kind: '' };
/** @type {{ kind: 'empty' | 'floorplan' | 'model', name?: string, format?: string }} */
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

const API_RUNTIME_STORAGE_KEY = 'fp3d.apiRuntime';

function currentApiRuntime() {
  const v = els.apiRuntime?.value;
  return v === 'docker' ? 'docker' : 'venv';
}

function loadApiRuntimePreference() {
  if (!els.apiRuntime) return;
  try {
    const saved = localStorage.getItem(API_RUNTIME_STORAGE_KEY);
    if (saved === 'docker' || saved === 'venv') els.apiRuntime.value = saved;
  } catch { /* ignore */ }
}

function saveApiRuntimePreference() {
  try {
    localStorage.setItem(API_RUNTIME_STORAGE_KEY, currentApiRuntime());
  } catch { /* ignore */ }
}

function syncModeUi() {
  const mode = els.modeSelect.value;
  els.dreamspaceHint?.classList.toggle('hidden', mode !== 'dreamspace');
  els.dreamspaceParams?.classList.toggle('hidden', mode !== 'dreamspace');
  els.apiRuntimeField?.classList.toggle('hidden', mode !== 'unity');
  els.apiUrlField?.classList.toggle('hidden', mode !== 'unity');
  els.unityParams?.classList.toggle('hidden', mode !== 'unity');
  refreshStatusBarMeta();
}

function readDreamspaceParamsFromUi() {
  return normalizeDreamspaceParams({
    maxSide: Number(els.dsMaxSide?.value),
    inkMeanScale: Number(els.dsInkMeanScale?.value),
    minRunRatioH: Number(els.dsMinRunRatioH?.value),
    minRunRatioV: Number(els.dsMinRunRatioV?.value),
    verticalDilate: Number(els.dsVerticalDilate?.value),
    verticalMergeScale: Number(els.dsVerticalMergeScale?.value),
    extraDilate: Number(els.dsExtraDilate?.value),
    mergeGapRatio: Number(els.dsMergeGapRatio?.value),
    parallelGapRatio: Number(els.dsParallelGapRatio?.value),
    doorWidthM: Number(els.dsDoorWidthM?.value),
    windowWidthM: Number(els.dsWindowWidthM?.value),
    morphOpen: Boolean(els.dsMorphOpen?.checked),
  });
}

function applyDreamspaceParamsToUi(params) {
  const p = normalizeDreamspaceParams(params || DEFAULT_DREAMSPACE_PARAMS);
  const set = (input, output, value, digits = null) => {
    if (!input) return;
    input.value = String(value);
    if (output) {
      output.textContent = digits == null ? String(value) : Number(value).toFixed(digits);
    }
  };
  set(els.dsMaxSide, els.dsMaxSideValue, p.maxSide);
  set(els.dsInkMeanScale, els.dsInkMeanScaleValue, p.inkMeanScale, 2);
  set(els.dsMinRunRatioH, els.dsMinRunRatioHValue, p.minRunRatioH, 3);
  set(els.dsMinRunRatioV, els.dsMinRunRatioVValue, p.minRunRatioV, 3);
  set(els.dsVerticalDilate, els.dsVerticalDilateValue, p.verticalDilate);
  set(els.dsVerticalMergeScale, els.dsVerticalMergeScaleValue, p.verticalMergeScale, 1);
  set(els.dsExtraDilate, els.dsExtraDilateValue, p.extraDilate);
  set(els.dsMergeGapRatio, els.dsMergeGapRatioValue, p.mergeGapRatio, 3);
  set(els.dsParallelGapRatio, els.dsParallelGapRatioValue, p.parallelGapRatio, 3);
  set(els.dsDoorWidthM, els.dsDoorWidthMValue, p.doorWidthM, 2);
  set(els.dsWindowWidthM, els.dsWindowWidthMValue, p.windowWidthM, 2);
  if (els.dsMorphOpen) els.dsMorphOpen.checked = Boolean(p.morphOpen);
}

function persistDreamspaceParamsFromUi() {
  return saveDreamspaceParams(readDreamspaceParamsFromUi());
}

function bindDreamspaceParamsUi() {
  const bindings = [
    [els.dsMaxSide, els.dsMaxSideValue, 0],
    [els.dsInkMeanScale, els.dsInkMeanScaleValue, 2],
    [els.dsMinRunRatioH, els.dsMinRunRatioHValue, 3],
    [els.dsMinRunRatioV, els.dsMinRunRatioVValue, 3],
    [els.dsVerticalDilate, els.dsVerticalDilateValue, 0],
    [els.dsVerticalMergeScale, els.dsVerticalMergeScaleValue, 1],
    [els.dsExtraDilate, els.dsExtraDilateValue, 0],
    [els.dsMergeGapRatio, els.dsMergeGapRatioValue, 3],
    [els.dsParallelGapRatio, els.dsParallelGapRatioValue, 3],
    [els.dsDoorWidthM, els.dsDoorWidthMValue, 2],
    [els.dsWindowWidthM, els.dsWindowWidthMValue, 2],
  ];
  for (const [input, output, digits] of bindings) {
    if (!input) continue;
    const sync = () => {
      if (output) {
        output.textContent = digits === 0
          ? String(Math.round(Number(input.value)))
          : Number(input.value).toFixed(digits);
      }
      persistDreamspaceParamsFromUi();
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
  }
  els.dsMorphOpen?.addEventListener('change', () => {
    persistDreamspaceParamsFromUi();
  });
  els.dsParamsReset?.addEventListener('click', () => {
    const defaults = resetDreamspaceParams();
    applyDreamspaceParamsToUi(defaults);
  });
  applyDreamspaceParamsToUi(loadDreamspaceParams());
}

function readUnityParamsFromUi() {
  return normalizeUnityParams({
    minConfidence: Number(els.unMinConfidence?.value),
    maxDetections: Number(els.unMaxDetections?.value),
    minBoxSidePx: Number(els.unMinBoxSidePx?.value),
    doorWidthM: Number(els.unDoorWidthM?.value),
    doorFallbackRatio: Number(els.unDoorFallbackRatio?.value),
    carveBandScale: Number(els.unCarveBandScale?.value),
    parallelGapRatio: Number(els.unParallelGapRatio?.value),
    includeWalls: Boolean(els.unIncludeWalls?.checked),
    includeWindows: Boolean(els.unIncludeWindows?.checked),
    includeDoors: Boolean(els.unIncludeDoors?.checked),
    mergeParallel: Boolean(els.unMergeParallel?.checked),
    carveOpenings: Boolean(els.unCarveOpenings?.checked),
  });
}

function applyUnityParamsToUi(params) {
  const p = normalizeUnityParams(params || DEFAULT_UNITY_PARAMS);
  const set = (input, output, value, digits = null) => {
    if (!input) return;
    input.value = String(value);
    if (output) {
      output.textContent = digits == null ? String(value) : Number(value).toFixed(digits);
    }
  };
  set(els.unMinConfidence, els.unMinConfidenceValue, p.minConfidence, 2);
  set(els.unMaxDetections, els.unMaxDetectionsValue, p.maxDetections);
  set(els.unMinBoxSidePx, els.unMinBoxSidePxValue, p.minBoxSidePx);
  set(els.unDoorWidthM, els.unDoorWidthMValue, p.doorWidthM, 2);
  set(els.unDoorFallbackRatio, els.unDoorFallbackRatioValue, p.doorFallbackRatio, 3);
  set(els.unCarveBandScale, els.unCarveBandScaleValue, p.carveBandScale, 2);
  set(els.unParallelGapRatio, els.unParallelGapRatioValue, p.parallelGapRatio, 3);
  if (els.unIncludeWalls) els.unIncludeWalls.checked = Boolean(p.includeWalls);
  if (els.unIncludeWindows) els.unIncludeWindows.checked = Boolean(p.includeWindows);
  if (els.unIncludeDoors) els.unIncludeDoors.checked = Boolean(p.includeDoors);
  if (els.unMergeParallel) els.unMergeParallel.checked = Boolean(p.mergeParallel);
  if (els.unCarveOpenings) els.unCarveOpenings.checked = Boolean(p.carveOpenings);
}

function persistUnityParamsFromUi() {
  return saveUnityParams(readUnityParamsFromUi());
}

function bindUnityParamsUi() {
  const bindings = [
    [els.unMinConfidence, els.unMinConfidenceValue, 2],
    [els.unMaxDetections, els.unMaxDetectionsValue, 0],
    [els.unMinBoxSidePx, els.unMinBoxSidePxValue, 0],
    [els.unDoorWidthM, els.unDoorWidthMValue, 2],
    [els.unDoorFallbackRatio, els.unDoorFallbackRatioValue, 3],
    [els.unCarveBandScale, els.unCarveBandScaleValue, 2],
    [els.unParallelGapRatio, els.unParallelGapRatioValue, 3],
  ];
  const applyLiveBuilderParams = () => {
    persistUnityParamsFromUi();
    if (lastDetection?.source === 'unity-api') {
      lastDetection = {
        ...lastDetection,
        unityParams: readUnityParamsFromUi(),
      };
      rebuild();
    }
  };
  for (const [input, output, digits] of bindings) {
    if (!input) continue;
    const sync = () => {
      if (output) {
        output.textContent = digits === 0
          ? String(Math.round(Number(input.value)))
          : Number(input.value).toFixed(digits);
      }
      // Builder-side params update live; API-side need re-convert.
      if (
        input === els.unDoorWidthM
        || input === els.unDoorFallbackRatio
        || input === els.unCarveBandScale
        || input === els.unParallelGapRatio
      ) {
        applyLiveBuilderParams();
      } else {
        persistUnityParamsFromUi();
      }
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
  }
  for (const el of [
    els.unIncludeWalls,
    els.unIncludeWindows,
    els.unIncludeDoors,
    els.unMergeParallel,
    els.unCarveOpenings,
  ]) {
    el?.addEventListener('change', () => {
      // Class filters need a new API call; merge/carve can rebuild locally.
      if (el === els.unMergeParallel || el === els.unCarveOpenings) {
        applyLiveBuilderParams();
      } else {
        persistUnityParamsFromUi();
      }
    });
  }
  els.unParamsReset?.addEventListener('click', () => {
    const defaults = resetUnityParams();
    applyUnityParamsToUi(defaults);
    if (lastDetection?.source === 'unity-api') {
      lastDetection = { ...lastDetection, unityParams: defaults };
      rebuild();
    }
  });
  applyUnityParamsToUi(loadUnityParams());
}

/**
 * Download DreamSpaceAI from GitHub when missing (progress popup).
 * Does not block 3D convert — in-app DreamSpace mode uses local detection.
 * @returns {Promise<boolean>} true when installed (or already present)
 */
async function ensureDreamspaceReady({ announce = true, required = false } = {}) {
  try {
    const status = await getDreamspaceInstallStatus();
    if (status.installed) return true;

    if (announce) setStatus('status.dreamspaceDownloading', 'busy');
    const result = await ensureDreamspaceWithUi();
    if (result?.canceled) {
      if (announce) setStatus('status.dreamspaceInstallCanceled', 'error');
      return !required;
    }
    if (result?.ok === false) {
      const error = result.error || t('progressDialog.dreamspaceFailed');
      reportDreamspaceInstallError(error, {
        path: status?.path || '',
        broken: Boolean(status?.broken),
      });
      return !required;
    }
    if (announce) setStatus('status.dreamspaceInstalled', 'ok');
    return true;
  } catch (err) {
    reportDreamspaceInstallError(err);
    // Allow convert to continue — folder install is optional for image→3D
    return !required;
  }
}

/**
 * Install FloorPlanTo3D-API from GitHub and start application.py (progress popup).
 * @returns {Promise<boolean>}
 */
async function ensureUnityApiReady({ announce = true, required = true } = {}) {
  try {
    const status = await getFloorplanApiStatus();
    if (status.running) {
      if (announce) setStatus('status.unityApiReady', 'ok');
      if (status.url && els.apiUrl && !els.apiUrl.value) {
        els.apiUrl.value = status.url;
      }
      return true;
    }

    if (announce) setStatus('status.unityApiPreparing', 'busy');
    const result = await ensureFloorplanApiWithUi({ runtime: currentApiRuntime() });
    if (result?.canceled) {
      if (announce) setStatus('status.unityApiCanceled', 'error');
      return !required;
    }
    if (result?.ok === false) {
      if (result.needsManualWeights) {
        try {
          if (result.weightsDir && window.fp3dDesktop?.openPath) {
            await window.fp3dDesktop.openPath(result.weightsDir);
          }
          if (result.weightsUrl && window.fp3dDesktop?.openExternal) {
            await window.fp3dDesktop.openExternal(result.weightsUrl);
          }
        } catch { /* ignore */ }
        if (announce) setStatus('status.unityApiWeightsManual', 'error');
      }
      reportUnityApiInstallError(result.error || t('progressDialog.unityApiFailed'), {
        path: status?.path || result.path || '',
        hasPython: status?.hasPython,
        needsManualWeights: Boolean(result.needsManualWeights),
        weightsDir: result.weightsDir || '',
        weightsUrl: result.weightsUrl || '',
      });
      return !required;
    }
    if (result?.url && els.apiUrl) {
      els.apiUrl.value = result.url;
    }
    if (announce) setStatus('status.unityApiReady', 'ok');
    return true;
  } catch (err) {
    reportUnityApiInstallError(err);
    return !required;
  }
}

/** Floor surface: 'image' = 2D plan texture, 'pattern' = Floor pattern fill */
let floorMode = 'image';

function currentFloorPatternId() {
  return normalizeFloorPatternId(els.floorPattern?.value || 'wood');
}

function buildOptions() {
  const unityParams = readUnityParamsFromUi();
  return {
    scale: Number(els.scaleRange.value),
    wallHeight: Math.max(0, Math.min(5, Number(els.wallHeight.value) || 0)),
    wallThickness: Number(els.wallThickness.value),
    floorMode,
    floorPattern: currentFloorPatternId(),
    unityParams,
  };
}

function setFloorModeUi(mode, { announce = true } = {}) {
  floorMode = mode === 'pattern' ? 'pattern' : 'image';
  setToolbarActive('floor', floorMode);
  if (lastDetection) rebuild();
  if (announce) {
    setStatus(floorMode === 'pattern' ? 'status.floorPattern' : 'status.floorImage');
  }
}

function applyFloorPatternFromUi({ announce = true } = {}) {
  const patternId = currentFloorPatternId();
  // Selecting a pattern implies pattern-floor mode
  if (floorMode !== 'pattern') {
    floorMode = 'pattern';
    setToolbarActive('floor', floorMode);
  }
  if (lastDetection) rebuild();
  if (announce) {
    const name = t(getFloorPattern(patternId).labelKey);
    setStatus('status.floorPatternChanged', 'ok', { name });
  }
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

function rebuild({ fresh = false } = {}) {
  applyAppearance();
  // Keep the 2D plan preview on canvas until a detection exists
  if (!lastDetection) return;
  app.rebuild(lastDetection, { ...buildOptions(), fresh });
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

/**
 * Ensure a floor-plan image is selected. If none, open the image picker dialog.
 * @returns {Promise<File | null>} null if the user canceled
 */
async function ensureImageForConvert() {
  if (selectedFile) return selectedFile;

  setStatus('status.pickImage', 'busy');
  const file = await pickImageFile();
  if (!file) {
    setStatus('status.pickImageCanceled', '');
    return null;
  }
  await rememberDesktopFiles([file]);
  await setSelectedImage(file);
  return selectedFile;
}

/** @type {((file: File | null) => void) | null} */
let imagePickWaiter = null;

/** Native / HTML file dialog for a single floor-plan image. */
async function pickImageFile() {
  const title = t('dialog.selectImageTitle');
  if (isDesktopApp()) {
    const files = await openDesktopFiles({ mode: 'image', multiple: false, title });
    return files[0] || null;
  }

  const input = els.imageInput;
  if (!input) return null;

  return new Promise((resolve) => {
    let settled = false;
    let focusTimer = 0;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      if (focusTimer) window.clearTimeout(focusTimer);
      if (imagePickWaiter === finish) imagePickWaiter = null;
      resolve(file);
    };
    imagePickWaiter = finish;
    // After the system dialog closes, focus returns; change may fire just after.
    const onWindowFocus = () => {
      focusTimer = window.setTimeout(() => finish(null), 800);
    };
    window.addEventListener('focus', onWindowFocus, { once: true });
    input.click();
  });
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function convert() {
  const mode = els.modeSelect.value;
  els.convertBtn.disabled = true;

  try {
    const image = await ensureImageForConvert();
    if (!image) return;

    setStatus('status.converting', 'busy');

    // Wipe previous 3D result (and transform) before building a new one
    lastDetection = null;
    app.clearBuiltContent({ restorePlanPreview: true });
    refreshStatusBarMeta();

    if (mode === 'dreamspace') {
      // Best-effort folder install (separate Next UI). Image convert does not depend on it.
      await ensureDreamspaceReady({ announce: true, required: false });
      // Convert the selected floor-plan image (not the sample apartment demo)
      lastDetection = await detectDreamspace(image, readDreamspaceParamsFromUi());
      contentInfo = {
        kind: 'floorplan',
        name: image.name,
      };
      setStatus('status.dreamspaceImageDone', 'ok', {
        count: lastDetection.points.length,
        rooms: lastDetection.rooms?.length ?? 0,
      });
    } else if (mode === 'heuristic') {
      lastDetection = await detectHeuristic(image);
      contentInfo = { kind: 'floorplan', name: image.name };
      setStatus('status.heuristicDone', 'ok', { count: lastDetection.points.length });
    } else if (mode === 'unity') {
      // Same Mask R-CNN API path as FloorPlanTo3D-unityClient
      const ready = await ensureUnityApiReady({ announce: true, required: true });
      if (!ready) return;
      const apiResult = await runWithProgressDialog({
        titleKey: 'progressDialog.unityCallTitle',
        cancelable: true,
        run: async (update, signal) => {
          const started = Date.now();
          let analyzeTimer = 0;
          const tickElapsed = (extra = {}) => {
            update({
              ...extra,
              elapsedMs: Date.now() - started,
            });
          };

          tickElapsed({
            percent: 0,
            indeterminate: false,
            phase: 'upload',
            message: t('progressDialog.unityCallUploading'),
          });

          try {
            return await analyzeFloorPlan(els.apiUrl?.value, image, {
              signal,
              params: readUnityParamsFromUi(),
              onProgress: (info) => {
                if (info.stage === 'upload') {
                  if (analyzeTimer) {
                    clearInterval(analyzeTimer);
                    analyzeTimer = 0;
                  }
                  const ratio = Number.isFinite(info.ratio) ? info.ratio : 0;
                  // Upload is usually quick; reserve 0–20% for it.
                  tickElapsed({
                    indeterminate: false,
                    percent: Math.round(ratio * 20),
                    phase: 'upload',
                    message: t('progressDialog.unityCallUploading'),
                    detail: Number.isFinite(info.total) && info.total > 0
                      ? t('progressDialog.bytes', {
                        loaded: formatBytes(info.loaded || 0),
                        total: formatBytes(info.total),
                      })
                      : '',
                  });
                  return;
                }

                if (info.stage === 'analyze') {
                  // Server-side Mask R-CNN has no % — show indeterminate + elapsed.
                  tickElapsed({
                    indeterminate: true,
                    phase: 'analyze',
                    message: t('progressDialog.unityCallAnalyzing'),
                  });
                  if (!analyzeTimer) {
                    analyzeTimer = window.setInterval(() => {
                      tickElapsed({
                        indeterminate: true,
                        phase: 'analyze',
                        message: t('progressDialog.unityCallAnalyzing'),
                      });
                    }, 500);
                  }
                  return;
                }

                if (info.stage === 'download') {
                  if (analyzeTimer) {
                    clearInterval(analyzeTimer);
                    analyzeTimer = 0;
                  }
                  const ratio = Number.isFinite(info.ratio) ? info.ratio : 0;
                  tickElapsed({
                    indeterminate: false,
                    percent: 85 + Math.round(ratio * 10),
                    phase: 'download',
                    message: t('progressDialog.unityCallDownloading'),
                  });
                  return;
                }

                if (info.stage === 'done') {
                  if (analyzeTimer) {
                    clearInterval(analyzeTimer);
                    analyzeTimer = 0;
                  }
                  tickElapsed({
                    indeterminate: false,
                    percent: 100,
                    phase: 'done',
                    message: t('progressDialog.unityCallDone'),
                  });
                }
              },
            });
          } finally {
            if (analyzeTimer) clearInterval(analyzeTimer);
          }
        },
      });
      if (apiResult?.canceled) {
        setStatus('status.unityCallCanceled', 'error');
        return;
      }
      lastDetection = apiResult;
      contentInfo = { kind: 'floorplan', name: image.name };
      setStatus('status.unityDone', 'ok', { count: lastDetection.points.length });
    } else {
      throw i18nError('error.unknownMode', { mode });
    }
    rebuild({ fresh: true });
  } catch (err) {
    console.error(err);
    const message = translateError(err);
    reportSeriousError({
      summary: message,
      error: err,
      context: {
        action: 'convert',
        mode: els.modeSelect.value,
        apiUrl: els.apiUrl?.value || '',
        fileName: selectedFile?.name || '',
        serious: isSeriousError(err),
      },
    });
  } finally {
    els.convertBtn.disabled = false;
  }
}

function clearSelectedImageUi() {
  if (selectedImageThumbUrl) {
    URL.revokeObjectURL(selectedImageThumbUrl);
    selectedImageThumbUrl = null;
  }
  if (els.selectedImageThumb) {
    els.selectedImageThumb.src = '';
    els.selectedImageThumb.classList.add('hidden');
    els.selectedImageThumb.alt = '';
  }
  els.selectedImagePlaceholder?.classList.remove('hidden');
  if (els.selectedImageName) {
    els.selectedImageName.setAttribute('data-i18n', 'selectedImage.noneName');
    els.selectedImageName.textContent = t('selectedImage.noneName');
    els.selectedImageName.title = '';
  }
  els.selectedImageCard?.classList.remove('has-image');
}

function syncSelectedImageUi(file) {
  if (!file) {
    clearSelectedImageUi();
    return;
  }
  if (selectedImageThumbUrl) {
    URL.revokeObjectURL(selectedImageThumbUrl);
    selectedImageThumbUrl = null;
  }
  selectedImageThumbUrl = URL.createObjectURL(file);
  if (els.selectedImageThumb) {
    els.selectedImageThumb.src = selectedImageThumbUrl;
    els.selectedImageThumb.alt = file.name;
    els.selectedImageThumb.classList.remove('hidden');
  }
  els.selectedImagePlaceholder?.classList.add('hidden');
  if (els.selectedImageName) {
    els.selectedImageName.textContent = file.name;
    els.selectedImageName.title = file.name;
    els.selectedImageName.removeAttribute('data-i18n');
  }
  els.selectedImageCard?.classList.add('has-image');
}

async function setSelectedImage(file) {
  if (!file) return;
  selectedFile = file;
  lastDetection = null;
  contentInfo = { kind: 'floorplan', name: file.name };
  syncSelectedImageUi(file);
  refreshStatusBarMeta();
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
  reportSeriousError({
    summary: message,
    error: err,
    context: {
      ...context,
      serious: isSeriousError(err),
    },
  });
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
    syncSelectedImageUi(null);
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
  const file = els.imageInput.files?.[0] || null;
  els.imageInput.value = '';

  // Convert (or other) flow waiting on the HTML file dialog
  if (imagePickWaiter) {
    const resolve = imagePickWaiter;
    imagePickWaiter = null;
    resolve(file);
    return;
  }

  if (!file) {
    selectedFile = null;
    syncSelectedImageUi(null);
    return;
  }
  await rememberDesktopFiles([file]);
  await setSelectedImage(file);
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

els.modeSelect.addEventListener('change', async () => {
  syncModeUi();
  refreshStatusBarMeta();
  if (els.modeSelect.value === 'dreamspace') {
    await ensureDreamspaceReady({ announce: true });
  } else if (els.modeSelect.value === 'unity') {
    await ensureUnityApiReady({ announce: true, required: false });
  }
});

els.apiRuntime?.addEventListener('change', async () => {
  saveApiRuntimePreference();
  if (els.modeSelect?.value === 'unity') {
    await ensureUnityApiReady({ announce: true, required: false });
  }
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

els.floorPattern?.addEventListener('change', () => {
  applyFloorPatternFromUi();
});

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
    case 'tbFloorImage':
      setFloorModeUi('image');
      break;
    case 'tbFloorPattern':
      setFloorModeUi('pattern');
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

bindDreamspaceParamsUi();
bindUnityParamsUi();
loadApiRuntimePreference();
syncModeUi();
applyAxesFromUi();
applyLightFromUi();
syncWallDimensionLabels();
app.clearContent();
syncLightUi();
app.setMode('orbit');
setLightMoveUi(true, { announce: false });
syncToolbarToggles();
setToolbarActive('floor', floorMode);
setStatus('status.ready');

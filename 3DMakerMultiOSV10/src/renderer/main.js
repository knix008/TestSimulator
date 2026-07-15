import './styles.css'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { estimateDepth, yieldToUi } from './depth/estimate.js'
import {
  DEFAULT_MODEL_ID,
  DEPTH_MODELS,
  DEFAULT_OBJECT_MODEL_ID,
  formatModelSummary,
  getDefaultModelIdByMode,
  getModelsByMode,
  getModelById
} from './depth/models.js'
import { loadSupportedImage } from './image/loadImage.js'
import { buildSpaceFromDepth } from './scene/buildSpace.js'
import { buildObjectFromDepth } from './scene/buildObject.js'
import { SpaceExplorer } from './scene/explorer.js'
import { showErrorDialog } from './ui/errorDialog.js'
import {
  hideProgressDialog,
  showProgressDialog,
  updateProgressDialog
} from './ui/progressDialog.js'
import {
  applyDocumentTranslations,
  getLanguage,
  getTheme,
  initUiPreferences,
  onLanguageChange,
  setLanguage,
  setTheme,
  t
} from './ui/i18n.js'
import { bindViewportToolbar } from './ui/toolbar.js'

const imageInput = document.getElementById('imageInput')
const previewWrap = document.getElementById('previewWrap')
const buildBtn = document.getElementById('buildBtn')
const depthScaleEl = document.getElementById('depthScale')
const depthScaleValueEl = document.getElementById('depthScaleValue')
const bgRemovalModeGroupEl = document.getElementById('bgRemovalModeGroup')
const bgRemovalModeEl = document.getElementById('bgRemovalMode')
const alphaThresholdGroupEl = document.getElementById('alphaThresholdGroup')
const alphaThresholdEl = document.getElementById('alphaThreshold')
const alphaThresholdValueEl = document.getElementById('alphaThresholdValue')
const meshResEl = document.getElementById('meshRes')
const modelSelectEl = document.getElementById('modelSelect')
const outputModeSelectEl = document.getElementById('outputModeSelect')
const modelInfoEl = document.getElementById('modelInfo')
const statusEl = document.getElementById('status')
const overlayEl = document.getElementById('overlay')
const hudEl = document.getElementById('hud')
const crosshairEl = document.getElementById('crosshair')
const canvas = document.getElementById('scene')
const menuImageBtn = document.getElementById('menuImageBtn')
const menuBuildBtn = document.getElementById('menuBuildBtn')
const menuBuildLabelEl = document.getElementById('menuBuildLabel')
const menuAboutBtn = document.getElementById('menuAboutBtn')
const langSelectEl = document.getElementById('langSelect')
const themeSelectEl = document.getElementById('themeSelect')
const aboutDialogEl = document.getElementById('aboutDialog')
const aboutDialogCloseBtn = document.getElementById('aboutDialogClose')
const canvasContextMenuEl = document.getElementById('canvasContextMenu')
const ctxSavePngBtn = document.getElementById('ctxSavePng')
const ctxSaveGlbBtn = document.getElementById('ctxSaveGlb')
const ctxCloseBtn = document.getElementById('ctxClose')
const buildBtnLabelEl = document.getElementById('buildBtnLabel')

/** @type {import('./image/loadImage.js').LoadedSpaceImage | null} */
let current = null
let currentMode = outputModeSelectEl?.value === 'object' ? 'object' : 'space'
const lastModelByMode = {
  space: DEFAULT_MODEL_ID,
  object: DEFAULT_OBJECT_MODEL_ID
}
const ALPHA_THRESHOLD_STORAGE_KEY = 'space-maker.object.alpha-threshold'
const BG_REMOVAL_MODE_STORAGE_KEY = 'space-maker.object.bg-removal-mode'
const explorer = new SpaceExplorer(canvas)
const runtimeBenchByModel = new Map()
const runtimeBenchHistoryByModel = new Map()
const BENCH_HISTORY_LIMIT = 12
const BENCH_RECENT_WINDOW = 5
let objectAlphaThresholdPct = 0.5
let objectBgRemovalMode = 'auto'

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function modelBenchKey(mode, modelId) {
  return `${mode}:${modelId}`
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

function pushRuntimeBenchHistory(mode, modelId, sample) {
  const key = modelBenchKey(mode, modelId)
  const history = runtimeBenchHistoryByModel.get(key) || []
  history.push(sample)
  if (history.length > BENCH_HISTORY_LIMIT) {
    history.splice(0, history.length - BENCH_HISTORY_LIMIT)
  }
  runtimeBenchHistoryByModel.set(key, history)
}

function summarizeRuntimeBench(history, recentWindow = BENCH_RECENT_WINDOW) {
  if (!Array.isArray(history) || history.length === 0) return null
  const recent = history.slice(-Math.max(1, recentWindow))
  let latTotal = 0
  let edgeTotal = 0
  let latMin = Infinity
  let latMax = -Infinity
  let edgeMin = Infinity
  let edgeMax = -Infinity

  for (const item of recent) {
    latTotal += item.latencyMs
    edgeTotal += item.edgeScore
    latMin = Math.min(latMin, item.latencyMs)
    latMax = Math.max(latMax, item.latencyMs)
    edgeMin = Math.min(edgeMin, item.edgeScore)
    edgeMax = Math.max(edgeMax, item.edgeScore)
  }

  return {
    count: recent.length,
    avgLatencyMs: Math.round(latTotal / recent.length),
    minLatencyMs: Math.round(latMin),
    maxLatencyMs: Math.round(latMax),
    avgEdgeScore: Math.round(edgeTotal / recent.length),
    minEdgeScore: Math.round(edgeMin),
    maxEdgeScore: Math.round(edgeMax)
  }
}

function computeDepthEdgeScore(depth) {
  const data = depth?.data
  const width = depth?.width || 0
  const height = depth?.height || 0
  if (!data || width < 2 || height < 2) return 0

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = Math.max(1e-6, max - min)

  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 90000)))
  let sum = 0
  let count = 0

  for (let y = 0; y < height - step; y += step) {
    for (let x = 0; x < width - step; x += step) {
      const i = y * width + x
      const r = i + step
      const d = i + step * width

      const v = (data[i] - min) / range
      const vr = (data[r] - min) / range
      const vd = (data[d] - min) / range

      const grad = Math.abs(vr - v) + Math.abs(vd - v)
      sum += grad
      count++
    }
  }

  if (!count) return 0
  const meanGrad = sum / count
  return Math.round(clamp01(meanGrad * 11.5) * 100)
}

function setStatus(text, kind = '') {
  statusEl.textContent = text
  statusEl.classList.remove('ok', 'error')
  if (kind) statusEl.classList.add(kind)
}

function syncMenuBuildButton() {
  if (!menuBuildBtn) return
  menuBuildBtn.disabled = buildBtn.disabled
}

function updateBuildButtonLabels() {
  const key = currentMode === 'object' ? 'menu.build.object' : 'menu.build.space'
  const label = t(key)
  if (menuBuildLabelEl) menuBuildLabelEl.textContent = label
  if (buildBtnLabelEl) buildBtnLabelEl.textContent = label
}

function hasConvertedSpace() {
  return Boolean(explorer.spaceMesh)
}

function makeExportBaseName() {
  const src = current?.file?.name || 'converted-space'
  const stem = src.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${stem}_${y}${m}${day}_${h}${min}${s}`
}

/**
 * @param {Blob} blob
 * @param {string} name
 */
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 800)
}

function closeCanvasContextMenu() {
  if (!canvasContextMenuEl) return
  canvasContextMenuEl.hidden = true
}

/**
 * @param {MouseEvent} event
 */
function openCanvasContextMenu(event) {
  if (!canvasContextMenuEl) return
  event.preventDefault()

  const canSave = hasConvertedSpace()
  if (ctxSavePngBtn) ctxSavePngBtn.disabled = !canSave
  if (ctxSaveGlbBtn) ctxSaveGlbBtn.disabled = !canSave

  canvasContextMenuEl.hidden = false
  const pad = 8
  const menuRect = canvasContextMenuEl.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.max(pad, Math.min(event.clientX, vw - menuRect.width - pad))
  const top = Math.max(pad, Math.min(event.clientY, vh - menuRect.height - pad))
  canvasContextMenuEl.style.left = `${Math.round(left)}px`
  canvasContextMenuEl.style.top = `${Math.round(top)}px`
}

function saveCanvasAsPng() {
  if (!hasConvertedSpace()) {
    setStatus(t('status.noResultToSave'), 'error')
    return
  }
  try {
    const dataUrl = explorer.renderer.domElement.toDataURL('image/png')
    const blob = dataUrlToBlob(dataUrl)
    const filename = `${makeExportBaseName()}.png`
    downloadBlob(blob, filename)
    setStatus(t('status.savedPng', { name: filename }), 'ok')
  } catch (err) {
    setStatus(
      t('status.saveFailed', {
        reason: err instanceof Error ? err.message : String(err)
      }),
      'error'
    )
  }
}

async function saveSpaceAsGlb() {
  if (!hasConvertedSpace()) {
    setStatus(t('status.noResultToSave'), 'error')
    return
  }
  try {
    const exporter = new GLTFExporter()
    const source = explorer.spaceMesh
    const glbBuffer = await new Promise((resolve, reject) => {
      exporter.parse(
        source,
        (result) => {
          if (result instanceof ArrayBuffer) resolve(result)
          else reject(new Error('GLB 바이너리 생성에 실패했습니다.'))
        },
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
        {
          binary: true,
          onlyVisible: true,
          trs: false
        }
      )
    })

    const filename = `${makeExportBaseName()}.glb`
    downloadBlob(new Blob([glbBuffer], { type: 'model/gltf-binary' }), filename)
    setStatus(t('status.savedGlb', { name: filename }), 'ok')
  } catch (err) {
    setStatus(
      t('status.saveFailed', {
        reason: err instanceof Error ? err.message : String(err)
      }),
      'error'
    )
  }
}

/**
 * @param {string} dataUrl
 */
function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const mimeMatch = /data:(.*?);base64/.exec(head || '')
  const mime = mimeMatch?.[1] || 'application/octet-stream'
  const bytes = atob(b64 || '')
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i)
  return new Blob([out], { type: mime })
}

bindViewportToolbar(explorer, {
  onStatus: (msg) => setStatus(msg),
  onExploreChange: (exploring) => {
    crosshairEl.hidden = true
    setStatus(
      exploring
        ? t('status.exploringOn')
        : t('status.exploringOff'),
      exploring ? 'ok' : undefined
    )
  }
})

function refreshLocalizedUi() {
  applyDocumentTranslations()
  updateBuildButtonLabels()
  updateAlphaThresholdVisibility()
  populateModels()
  updateDepthScaleLabel()
  updateAlphaThresholdLabel()
  if (!current && previewWrap.classList.contains('empty')) {
    previewWrap.textContent = t('menu.preview.empty')
  }
  if (!current) {
    overlayEl.innerHTML = t('overlay.ready')
    setStatus(t('status.idle'))
  } else if (explorer.spaceMesh && !hudEl.hidden) {
    renderHud(selectedModel())
  }
}

function populateModels() {
  const models = getModelsByMode(currentMode)
  const preferred =
    lastModelByMode[currentMode] || getDefaultModelIdByMode(currentMode)

  modelSelectEl.innerHTML = ''
  for (const model of models) {
    const opt = document.createElement('option')
    opt.value = model.id
    opt.textContent = `${model.shortName} — ${tierLabel(model.tier)}`
    if (model.id === preferred) opt.selected = true
    modelSelectEl.appendChild(opt)
  }

  if (!modelSelectEl.value && models.length) {
    modelSelectEl.value = getDefaultModelIdByMode(currentMode)
  }

  updateModelInfo()
}

function tierLabel(tier) {
  if (tier === 'fast') return t('tier.fast')
  if (tier === 'quality') return t('tier.quality')
  return t('tier.balanced')
}

async function updateModelInfo() {
  const model = getModelById(modelSelectEl.value)
  const benchKey = modelBenchKey(currentMode, model.id)
  const runtimeBench = runtimeBenchByModel.get(benchKey)
  const runtimeHistory = runtimeBenchHistoryByModel.get(benchKey) || []
  const runtimeStats = summarizeRuntimeBench(runtimeHistory)
  const bench = runtimeBench || model.benchmark
  const benchSourceText = runtimeBench
    ? t('model.benchmark.measured')
    : t('model.benchmark.referenceTag')
  const benchNoteText = runtimeBench
    ? t('model.benchmark.measuredNote', {
        depth: runtimeBench.depthMs,
        mesh: runtimeBench.meshMs
      })
    : t('model.benchmark.reference')

  const recentStatsRows = runtimeStats
    ? `
      <div class="model-info__bench-row"><span>${t('model.benchmark.recentWindow', { count: runtimeStats.count })}</span><strong>${t('model.benchmark.recentLabel')}</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.avgLatency')}</span><strong>${runtimeStats.avgLatencyMs} ms</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.minLatency')}</span><strong>${runtimeStats.minLatencyMs} ms</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.maxLatency')}</span><strong>${runtimeStats.maxLatencyMs} ms</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.avgEdge')}</span><strong>${runtimeStats.avgEdgeScore}/100</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.minEdge')}</span><strong>${runtimeStats.minEdgeScore}/100</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.maxEdge')}</span><strong>${runtimeStats.maxEdgeScore}/100</strong></div>
    `
    : ''

  const tierBadgeKey =
    model.tier === 'fast'
      ? 'model.badge.fast'
      : model.tier === 'quality'
        ? 'model.badge.quality'
        : 'model.badge.balanced'
  const badgeLabels = [t(tierBadgeKey)]
  if (Array.isArray(model.recommendedFor) && model.recommendedFor.includes(currentMode)) {
    badgeLabels.push(
      currentMode === 'object'
        ? t('model.badge.recommendedObject')
        : t('model.badge.recommendedSpace')
    )
  }
  if (model.usePolicy === 'non-commercial') badgeLabels.push(t('model.badge.nonCommercial'))

  const badgesHtml = badgeLabels
    .map((label) => `<span class="model-info__badge">${label}</span>`)
    .join('')

  let cacheLine =
    `<div class="model-info__cache model-info__cache--unknown">${t('model.cache.checking')}</div>`

  try {
    const status = await globalThis.modelCache?.status?.(model.id)
    if (status?.cached) {
      cacheLine = `<div class="model-info__cache model-info__cache--hit">${t('model.cache.hit', { bytes: status.bytesLabel })}</div>`
    } else {
      cacheLine =
        `<div class="model-info__cache model-info__cache--miss">${t('model.cache.miss')}</div>`
    }
  } catch {
    cacheLine =
      `<div class="model-info__cache model-info__cache--unknown">${t('model.cache.unknown')}</div>`
  }

  modelInfoEl.innerHTML = `
    <div class="model-info__title">${model.name}</div>
    <div class="model-info__meta">${model.family} · ${tierLabel(model.tier)} · ${model.sizeHint}</div>
    <div class="model-info__badges">${badgesHtml}</div>
    ${cacheLine}
    <p class="model-info__desc">${model.description}</p>
    <div class="model-info__kv"><strong>${t('model.license')}:</strong> ${model.license}</div>
    <div class="model-info__kv"><strong>${t('model.policy')}:</strong> ${t('model.policy.nonCommercial')}</div>
    <div class="model-info__bench">
      <div class="model-info__bench-title">${t('model.benchmark.title')}</div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.source')}</span><strong>${benchSourceText}</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.sample')}</span><strong>${bench.sample}</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.latency')}</span><strong>${bench.latencyMs} ms</strong></div>
      <div class="model-info__bench-row"><span>${t('model.benchmark.edge')}</span><strong>${bench.edgeScore}/100</strong></div>
      ${recentStatsRows}
      <div class="model-info__bench-note">${benchNoteText}</div>
    </div>
    <div class="model-info__id" title="${model.id}">${t('model.id')}: ${model.id}</div>
  `
}

function selectedModel() {
  return getModelById(modelSelectEl.value)
}

function selectedModeLabel() {
  return currentMode === 'object' ? t('mode.object') : t('mode.space')
}

function selectedHudControlsHint() {
  return currentMode === 'object' ? t('hud.controls.object') : t('hud.controls.space')
}

function selectedBgRemovalLabel() {
  if (objectBgRemovalMode === 'on') return t('bgRemoval.on')
  if (objectBgRemovalMode === 'off') return t('bgRemoval.off')
  return t('bgRemoval.auto')
}

/**
 * @param {import('./depth/models.js').DepthModelInfo} model
 */
function renderHud(model) {
  const bgRemovalRow =
    currentMode === 'object'
      ? `<span>${t('hud.bgRemoval')}: ${selectedBgRemovalLabel()}</span><br />`
      : ''

  hudEl.innerHTML = `
      <strong>${t('hud.model')}</strong><br />
      <span>${selectedModeLabel()}</span><br />
      ${model.name}<br />
      <span>${model.family} · ${tierLabel(model.tier)} · ${model.sizeHint}</span><br />
      ${bgRemovalRow}
      <span>${selectedHudControlsHint()}</span>
    `
}

function tByMode(baseKey, params) {
  const keyed = `${baseKey}.${currentMode}`
  const resolved = t(keyed, params)
  return resolved === keyed ? t(baseKey, params) : resolved
}

/**
 * @param {unknown} err
 * @param {{ title?: string, summary?: string, context?: string, statusText?: string }} options
 */
function reportError(err, options) {
  console.error(options.context || 'error', err)
  const short =
    options.statusText ||
    options.summary ||
    (err instanceof Error ? err.message : String(err))
  setStatus(short, 'error')
  showErrorDialog(err, {
    title: options.title,
    summary: options.summary,
    context: options.context
  })
}

function updateDepthScaleLabel() {
  const pct = Math.round(Number(depthScaleEl.value) * 100)
  depthScaleValueEl.textContent = `${pct}%`
  depthScaleEl.setAttribute('aria-valuetext', t('aria.depthScale', { percent: pct }))
  depthScaleEl.title = t('title.depthScale', { percent: pct })
}

function clampAlphaThresholdPct(value) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(5.0, Math.max(0.1, value))
}

function normalizeBgRemovalMode(value) {
  const v = String(value || '').toLowerCase()
  if (v === 'on' || v === 'off') return v
  return 'auto'
}

function updateAlphaThresholdVisibility() {
  const isObjectMode = currentMode === 'object'
  const isAuto = objectBgRemovalMode === 'auto'
  if (bgRemovalModeGroupEl) bgRemovalModeGroupEl.hidden = !isObjectMode
  if (bgRemovalModeEl) bgRemovalModeEl.disabled = !isObjectMode
  if (alphaThresholdGroupEl) alphaThresholdGroupEl.hidden = !isObjectMode || !isAuto
  if (alphaThresholdEl) alphaThresholdEl.disabled = !isObjectMode || !isAuto
}

function updateAlphaThresholdLabel() {
  const pct = Number(objectAlphaThresholdPct.toFixed(1))
  alphaThresholdValueEl.textContent = `${pct}%`
  alphaThresholdEl.setAttribute('aria-valuetext', t('aria.alphaThreshold', { percent: pct }))
  alphaThresholdEl.title = t('title.alphaThreshold', { percent: pct })
}

initUiPreferences()

if (langSelectEl) {
  langSelectEl.value = getLanguage()
  langSelectEl.addEventListener('change', () => {
    setLanguage(langSelectEl.value)
  })
}

if (themeSelectEl) {
  themeSelectEl.value = getTheme()
  themeSelectEl.addEventListener('change', () => {
    setTheme(themeSelectEl.value)
    explorer.setVisualTheme(themeSelectEl.value)
  })
}

if (outputModeSelectEl) {
  outputModeSelectEl.value = currentMode
  outputModeSelectEl.addEventListener('change', () => {
    currentMode = outputModeSelectEl.value === 'object' ? 'object' : 'space'
    updateAlphaThresholdVisibility()
    populateModels()
    updateBuildButtonLabels()
    if (current) {
      overlayEl.innerHTML = t(
        currentMode === 'object' ? 'overlay.buildHintObject' : 'overlay.buildHint'
      )
    }
    const modeLabel = selectedModeLabel()
    if (current) {
      setStatus(t('status.modeChangedReady', { mode: modeLabel }), 'ok')
    } else {
      setStatus(t('status.modeChangedIdle', { mode: modeLabel }))
    }
  })
}

explorer.setVisualTheme(getTheme())

menuImageBtn?.addEventListener('click', () => {
  imageInput.click()
})

menuBuildBtn?.addEventListener('click', () => {
  if (buildBtn.disabled) return
  buildBtn.click()
})

menuAboutBtn?.addEventListener('click', () => {
  aboutDialogEl.hidden = false
  aboutDialogCloseBtn?.focus()
})

aboutDialogCloseBtn?.addEventListener('click', () => {
  aboutDialogEl.hidden = true
})

aboutDialogEl?.addEventListener('click', (event) => {
  if (event.target === aboutDialogEl) aboutDialogEl.hidden = true
})

canvas.addEventListener('contextmenu', openCanvasContextMenu)
ctxSavePngBtn?.addEventListener('click', () => {
  closeCanvasContextMenu()
  saveCanvasAsPng()
})
ctxSaveGlbBtn?.addEventListener('click', async () => {
  closeCanvasContextMenu()
  await saveSpaceAsGlb()
})
ctxCloseBtn?.addEventListener('click', closeCanvasContextMenu)

window.addEventListener('click', (event) => {
  if (!canvasContextMenuEl || canvasContextMenuEl.hidden) return
  if (event.target instanceof Node && canvasContextMenuEl.contains(event.target)) return
  closeCanvasContextMenu()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeCanvasContextMenu()
})

window.addEventListener('blur', closeCanvasContextMenu)
window.addEventListener('resize', closeCanvasContextMenu)

onLanguageChange((lang) => {
  if (langSelectEl) langSelectEl.value = lang
  if (outputModeSelectEl) outputModeSelectEl.value = currentMode
  refreshLocalizedUi()
})

populateModels()
modelSelectEl.addEventListener('change', updateModelInfo)
modelSelectEl.addEventListener('change', () => {
  if (!modelSelectEl.value) return
  lastModelByMode[currentMode] = modelSelectEl.value
})
updateDepthScaleLabel()
depthScaleEl.addEventListener('input', updateDepthScaleLabel)

{
  const savedMode = localStorage.getItem(BG_REMOVAL_MODE_STORAGE_KEY)
  objectBgRemovalMode = normalizeBgRemovalMode(savedMode)
  bgRemovalModeEl.value = objectBgRemovalMode

  bgRemovalModeEl.addEventListener('change', () => {
    objectBgRemovalMode = normalizeBgRemovalMode(bgRemovalModeEl.value)
    localStorage.setItem(BG_REMOVAL_MODE_STORAGE_KEY, objectBgRemovalMode)
    updateAlphaThresholdVisibility()
    if (explorer.spaceMesh && !hudEl.hidden) renderHud(selectedModel())
  })

  const saved = Number(localStorage.getItem(ALPHA_THRESHOLD_STORAGE_KEY))
  objectAlphaThresholdPct = clampAlphaThresholdPct(saved)
  alphaThresholdEl.value = String(objectAlphaThresholdPct)
  updateAlphaThresholdVisibility()
  updateAlphaThresholdLabel()
  alphaThresholdEl.addEventListener('input', () => {
    objectAlphaThresholdPct = clampAlphaThresholdPct(Number(alphaThresholdEl.value))
    localStorage.setItem(ALPHA_THRESHOLD_STORAGE_KEY, String(objectAlphaThresholdPct))
    updateAlphaThresholdLabel()
  })
}

refreshLocalizedUi()
syncMenuBuildButton()

imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0]
  if (!file) return

  buildBtn.disabled = true
  syncMenuBuildButton()
  setStatus(t('status.loadingImage'))

  try {
    current = await loadSupportedImage(file)

    previewWrap.classList.remove('empty')
    previewWrap.innerHTML = ''
    const thumb = document.createElement('img')
    thumb.src = current.previewUrl
    thumb.alt = t('alt.selectedImage')
    previewWrap.appendChild(thumb)

    buildBtn.disabled = false
    syncMenuBuildButton()
    setStatus(t('status.imageReady', { label: current.label }))
    overlayEl.innerHTML = t(
      currentMode === 'object' ? 'overlay.buildHintObject' : 'overlay.buildHint'
    )
    overlayEl.classList.remove('hidden')
    hudEl.hidden = true
  } catch (err) {
    current = null
    previewWrap.classList.add('empty')
    previewWrap.textContent = t('menu.preview.empty')
    buildBtn.disabled = true
    syncMenuBuildButton()
    reportError(err, {
      title: t('error.openImage'),
      summary: err instanceof Error ? err.message : String(err),
      context: `이미지 선택 (${file.name})`,
      statusText: t('status.imageLoadFail')
    })
  } finally {
    imageInput.value = ''
  }
})

buildBtn.addEventListener('click', async () => {
  if (!current) return

  const model = selectedModel()
  const modeLabel = selectedModeLabel()
  buildBtn.disabled = true
  syncMenuBuildButton()
  imageInput.disabled = true
  modelSelectEl.disabled = true
  if (menuImageBtn) menuImageBtn.disabled = true
  overlayEl.classList.remove('hidden')
  overlayEl.textContent = t('status.buildingWithModel', {
    model: `${modeLabel} · ${model.shortName}`
  })
  setStatus(t('status.start', { summary: formatModelSummary(model) }))
  showProgressDialog({ title: tByMode('dialog.progress.building', { model: model.shortName }) })
  updateProgressDialog(t('status.start', { summary: formatModelSummary(model) }), 3)

  try {
    updateProgressDialog(t('status.depthBackground', { model: model.shortName }), 8)
    await yieldToUi()

    const depthStartedAt = nowMs()
    const depth = await estimateDepth(
      current.depthImage,
      (msg) => {
        setStatus(msg)
        overlayEl.textContent = msg
        // Map load % into roughly 10–75, inference toward 85.
        const parsed = typeof msg === 'string' ? msg.match(/(\d{1,3})\s*%/) : null
        if (parsed) {
          const raw = Number(parsed[1])
          updateProgressDialog(msg, 10 + Math.round((raw / 100) * 65))
        } else if (/메모리에 로드|재사용|캐시/.test(msg)) {
          updateProgressDialog(msg, 55)
        } else if (/깊이 추정/.test(msg)) {
          updateProgressDialog(msg, 80)
        } else {
          updateProgressDialog(msg, null)
        }
      },
      model.id
    )
    const depthMs = Math.round(nowMs() - depthStartedAt)

    updateProgressDialog(tByMode('status.meshBuilding'), 88)
    setStatus(tByMode('status.meshBuilding'))
    overlayEl.textContent = tByMode('status.meshBuilding')
    await yieldToUi()

    const meshStartedAt = nowMs()
    const space = await new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const options = {
            meshRes: Number(meshResEl.value),
            depthScale: Number(depthScaleEl.value),
            maxAnisotropy: explorer.renderer.capabilities.getMaxAnisotropy(),
            transparentBgThreshold: objectAlphaThresholdPct / 100,
            backgroundRemovalMode: objectBgRemovalMode
          }
          resolve(
            currentMode === 'object'
              ? buildObjectFromDepth(current.textureImage, depth, options)
              : buildSpaceFromDepth(current.textureImage, depth, options)
          )
        } catch (err) {
          reject(err)
        }
      }, 0)
    })
    const meshMs = Math.round(nowMs() - meshStartedAt)
    const edgeScore = computeDepthEdgeScore(depth)
    runtimeBenchByModel.set(modelBenchKey(currentMode, model.id), {
      sample: current?.file?.name || current?.label || 'current-image',
      latencyMs: depthMs + meshMs,
      edgeScore,
      depthMs,
      meshMs
    })
    pushRuntimeBenchHistory(currentMode, model.id, {
      sample: current?.file?.name || current?.label || 'current-image',
      latencyMs: depthMs + meshMs,
      edgeScore,
      depthMs,
      meshMs,
      createdAt: Date.now()
    })

    updateProgressDialog(tByMode('status.scenePlacing'), 96)
    await yieldToUi()

    explorer.setSpace(space)
    updateProgressDialog(t('status.done'), 100)
    await yieldToUi()
    hideProgressDialog()

    overlayEl.classList.add('hidden')
    crosshairEl.hidden = false
    hudEl.hidden = false
    renderHud(model)
    setStatus(
      t('status.completed', { model: model.shortName }),
      'ok'
    )
    updateModelInfo()
  } catch (err) {
    hideProgressDialog()
    overlayEl.textContent = t('status.buildFailedOverlay')
    reportError(err, {
      title: t('error.buildFailed'),
      summary: err instanceof Error ? err.message : String(err),
      context: `3D 공간 생성 (파일: ${current.file.name}, model: ${model.id}, meshRes: ${meshResEl.value}, depthScale: ${depthScaleEl.value})`,
      statusText: t('error.buildFailed')
    })
  } finally {
    hideProgressDialog()
    buildBtn.disabled = !current
    syncMenuBuildButton()
    imageInput.disabled = false
    modelSelectEl.disabled = false
    if (menuImageBtn) menuImageBtn.disabled = false
  }
})

window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, {
    title: t('error.unhandled'),
    summary: event.reason instanceof Error ? event.reason.message : String(event.reason),
    context: 'unhandledrejection',
    statusText: t('status.unexpected')
  })
})

window.addEventListener('error', (event) => {
  reportError(event.error || event.message, {
    title: t('error.runtime'),
    summary: event.message || t('error.script'),
    context: event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : 'window.error',
    statusText: t('error.runtime')
  })
})

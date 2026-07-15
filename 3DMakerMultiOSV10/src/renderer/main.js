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
const explorer = new SpaceExplorer(canvas)

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
  populateModels()
  updateDepthScaleLabel()
  if (!current && previewWrap.classList.contains('empty')) {
    previewWrap.textContent = t('menu.preview.empty')
  }
  if (!current) {
    overlayEl.innerHTML = t('overlay.ready')
    setStatus(t('status.idle'))
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
    ${cacheLine}
    <p class="model-info__desc">${model.description}</p>
    <div class="model-info__id" title="${model.id}">${t('model.id')}: ${model.id}</div>
  `
}

function selectedModel() {
  return getModelById(modelSelectEl.value)
}

function selectedModeLabel() {
  return currentMode === 'object' ? t('mode.object') : t('mode.space')
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
    populateModels()
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
  showProgressDialog({ title: t('dialog.progress.building', { model: model.shortName }) })
  updateProgressDialog(t('status.start', { summary: formatModelSummary(model) }), 3)

  try {
    updateProgressDialog(t('status.depthBackground', { model: model.shortName }), 8)
    await yieldToUi()

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

    updateProgressDialog(t('status.meshBuilding'), 88)
    setStatus(t('status.meshBuilding'))
    overlayEl.textContent = t('status.meshBuilding')
    await yieldToUi()

    const space = await new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const options = {
            meshRes: Number(meshResEl.value),
            depthScale: Number(depthScaleEl.value),
            maxAnisotropy: explorer.renderer.capabilities.getMaxAnisotropy()
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
    updateProgressDialog(t('status.scenePlacing'), 96)
    await yieldToUi()

    explorer.setSpace(space)
    updateProgressDialog(t('status.done'), 100)
    await yieldToUi()
    hideProgressDialog()

    overlayEl.classList.add('hidden')
    crosshairEl.hidden = false
    hudEl.hidden = false
    hudEl.innerHTML = `
      <strong>${t('hud.model')}</strong><br />
      <span>${selectedModeLabel()}</span><br />
      ${model.name}<br />
      <span>${model.family} · ${tierLabel(model.tier)} · ${model.sizeHint}</span>
    `
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

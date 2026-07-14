import './styles.css'
import { estimateDepth, yieldToUi } from './depth/estimate.js'
import {
  DEFAULT_MODEL_ID,
  DEPTH_MODELS,
  formatModelSummary,
  getModelById
} from './depth/models.js'
import { loadSupportedImage } from './image/loadImage.js'
import { buildSpaceFromDepth } from './scene/buildSpace.js'
import { SpaceExplorer } from './scene/explorer.js'
import { showErrorDialog } from './ui/errorDialog.js'
import {
  hideProgressDialog,
  showProgressDialog,
  updateProgressDialog
} from './ui/progressDialog.js'
import { bindViewportToolbar } from './ui/toolbar.js'

const imageInput = document.getElementById('imageInput')
const previewWrap = document.getElementById('previewWrap')
const buildBtn = document.getElementById('buildBtn')
const depthScaleEl = document.getElementById('depthScale')
const depthScaleValueEl = document.getElementById('depthScaleValue')
const meshResEl = document.getElementById('meshRes')
const modelSelectEl = document.getElementById('modelSelect')
const modelInfoEl = document.getElementById('modelInfo')
const statusEl = document.getElementById('status')
const overlayEl = document.getElementById('overlay')
const hudEl = document.getElementById('hud')
const crosshairEl = document.getElementById('crosshair')
const canvas = document.getElementById('scene')

/** @type {import('./image/loadImage.js').LoadedSpaceImage | null} */
let current = null
const explorer = new SpaceExplorer(canvas)

function setStatus(text, kind = '') {
  statusEl.textContent = text
  statusEl.classList.remove('ok', 'error')
  if (kind) statusEl.classList.add(kind)
}

bindViewportToolbar(explorer, {
  onStatus: (msg) => setStatus(msg),
  onExploreChange: (exploring) => {
    crosshairEl.hidden = true
    setStatus(
      exploring
        ? '탐색 중 — 드래그: 시야 · 휠: 확대/축소 · WASD 이동 · Esc: 이동 해제'
        : '이동 해제 — 드래그로 시야만 돌릴 수 있습니다. 「탐색」으로 이동을 켜세요.',
      exploring ? 'ok' : undefined
    )
  }
})

function populateModels() {
  modelSelectEl.innerHTML = ''
  for (const model of DEPTH_MODELS) {
    const opt = document.createElement('option')
    opt.value = model.id
    opt.textContent = `${model.shortName} — ${tierLabel(model.tier)}`
    if (model.id === DEFAULT_MODEL_ID) opt.selected = true
    modelSelectEl.appendChild(opt)
  }
  updateModelInfo()
}

function tierLabel(tier) {
  if (tier === 'fast') return '빠름'
  if (tier === 'quality') return '고품질'
  return '균형'
}

function updateModelInfo() {
  const model = getModelById(modelSelectEl.value)
  modelInfoEl.innerHTML = `
    <div class="model-info__title">${model.name}</div>
    <div class="model-info__meta">${model.family} · ${tierLabel(model.tier)} · ${model.sizeHint}</div>
    <p class="model-info__desc">${model.description}</p>
    <div class="model-info__id" title="${model.id}">ID: ${model.id}</div>
  `
}

function selectedModel() {
  return getModelById(modelSelectEl.value)
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
  depthScaleEl.setAttribute('aria-valuetext', `${pct}퍼센트`)
  depthScaleEl.title = `깊이 강도 ${pct}%`
}

populateModels()
modelSelectEl.addEventListener('change', updateModelInfo)
updateDepthScaleLabel()
depthScaleEl.addEventListener('input', updateDepthScaleLabel)

imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0]
  if (!file) return

  buildBtn.disabled = true
  setStatus('이미지 읽는 중…')

  try {
    current = await loadSupportedImage(file)

    previewWrap.classList.remove('empty')
    previewWrap.innerHTML = ''
    const thumb = document.createElement('img')
    thumb.src = current.previewUrl
    thumb.alt = '선택 이미지'
    previewWrap.appendChild(thumb)

    buildBtn.disabled = false
    setStatus(`이미지 준비됨: ${current.label}`)
    overlayEl.innerHTML =
      '“3D 공간 생성”을 누르면 선택한 깊이 모델로 공간을 만듭니다<br /><small>XYZ: X 빨강(좌우) · Y 초록(위) · Z 파랑(사진 안쪽)</small>'
    overlayEl.classList.remove('hidden')
    hudEl.hidden = true
  } catch (err) {
    current = null
    previewWrap.classList.add('empty')
    previewWrap.textContent = '미리보기 없음'
    buildBtn.disabled = true
    reportError(err, {
      title: '이미지를 열 수 없습니다',
      summary: err instanceof Error ? err.message : String(err),
      context: `이미지 선택 (${file.name})`,
      statusText: '이미지 로드 실패'
    })
  } finally {
    imageInput.value = ''
  }
})

buildBtn.addEventListener('click', async () => {
  if (!current) return

  const model = selectedModel()
  buildBtn.disabled = true
  imageInput.disabled = true
  modelSelectEl.disabled = true
  overlayEl.classList.remove('hidden')
  overlayEl.textContent = `${model.shortName}로 공간을 구성하는 중…`
  setStatus(`처리 시작 — ${formatModelSummary(model)}`)
  showProgressDialog({ title: `3D 공간 생성 — ${model.shortName}` })
  updateProgressDialog(`처리 시작 — ${formatModelSummary(model)}`, 3)

  try {
    updateProgressDialog(`${model.shortName} — 백그라운드에서 깊이 추정 중…`, 8)
    await yieldToUi()

    const depth = await estimateDepth(
      current.depthImage,
      (msg) => {
        setStatus(msg)
        overlayEl.textContent = msg
        // Map model download % into roughly 10–75, inference toward 85.
        const parsed = typeof msg === 'string' ? msg.match(/(\d{1,3})\s*%/) : null
        if (parsed) {
          const raw = Number(parsed[1])
          updateProgressDialog(msg, 10 + Math.round((raw / 100) * 65))
        } else if (/깊이 추정/.test(msg)) {
          updateProgressDialog(msg, 80)
        } else {
          updateProgressDialog(msg, null)
        }
      },
      model.id
    )

    updateProgressDialog('공간 메시 생성 중…', 88)
    setStatus('공간 메시 생성 중…')
    overlayEl.textContent = '공간 메시 생성 중…'
    await yieldToUi()

    const space = await new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(
            buildSpaceFromDepth(current.textureImage, depth, {
              meshRes: Number(meshResEl.value),
              depthScale: Number(depthScaleEl.value),
              maxAnisotropy: explorer.renderer.capabilities.getMaxAnisotropy()
            })
          )
        } catch (err) {
          reject(err)
        }
      }, 0)
    })
    updateProgressDialog('장면 배치 중…', 96)
    await yieldToUi()

    explorer.setSpace(space)
    updateProgressDialog('완료', 100)
    await yieldToUi()
    hideProgressDialog()

    overlayEl.classList.add('hidden')
    crosshairEl.hidden = false
    hudEl.hidden = false
    hudEl.innerHTML = `
      <strong>사용 모델</strong><br />
      ${model.name}<br />
      <span>${model.family} · ${tierLabel(model.tier)} · ${model.sizeHint}</span>
    `
    setStatus(
      `완료 — ${model.shortName}. 드래그로 시야 · 휠로 줌 · WASD로 이동하세요.`,
      'ok'
    )
  } catch (err) {
    hideProgressDialog()
    overlayEl.textContent = '생성에 실패했습니다. 아래 오류 내용을 확인해 주세요.'
    reportError(err, {
      title: '3D 공간 생성 실패',
      summary: err instanceof Error ? err.message : String(err),
      context: `3D 공간 생성 (파일: ${current.file.name}, model: ${model.id}, meshRes: ${meshResEl.value}, depthScale: ${depthScaleEl.value})`,
      statusText: '3D 공간 생성 실패'
    })
  } finally {
    hideProgressDialog()
    buildBtn.disabled = !current
    imageInput.disabled = false
    modelSelectEl.disabled = false
  }
})

window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, {
    title: '처리되지 않은 오류',
    summary: event.reason instanceof Error ? event.reason.message : String(event.reason),
    context: 'unhandledrejection',
    statusText: '예기치 않은 오류'
  })
})

window.addEventListener('error', (event) => {
  reportError(event.error || event.message, {
    title: '런타임 오류',
    summary: event.message || '스크립트 오류가 발생했습니다.',
    context: event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : 'window.error',
    statusText: '런타임 오류'
  })
})

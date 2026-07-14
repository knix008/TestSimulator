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
bindViewportToolbar(explorer, {
  onStatus: (msg) => setStatus(msg)
})

function setStatus(text, kind = '') {
  statusEl.textContent = text
  statusEl.classList.remove('ok', 'error')
  if (kind) statusEl.classList.add(kind)
}

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
      '“3D 공간 생성”을 누르면 선택한 깊이 모델로 공간을 만듭니다<br /><small>XYZ 축: X 빨강 · Y 초록 · Z 파랑</small>'
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

  try {
    overlayEl.textContent = `${model.shortName} — 백그라운드에서 깊이 추정 중…`
    await yieldToUi()

    const depth = await estimateDepth(
      current.depthImage,
      (msg) => {
        setStatus(msg)
        overlayEl.textContent = msg
      },
      model.id
    )

    setStatus('공간 메시 생성 중…')
    overlayEl.textContent = '공간 메시 생성 중… (UI는 계속 응답합니다)'
    await yieldToUi()

    // Mesh build still runs locally, but after a paint so status is visible.
    const space = await new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(
            buildSpaceFromDepth(current.textureImage, depth, {
              meshRes: Number(meshResEl.value),
              depthScale: Number(depthScaleEl.value)
            })
          )
        } catch (err) {
          reject(err)
        }
      }, 0)
    })
    await yieldToUi()

    explorer.setSpace(space)
    overlayEl.classList.add('hidden')
    crosshairEl.hidden = false
    hudEl.hidden = false
    hudEl.innerHTML = `
      <strong>사용 모델</strong><br />
      ${model.name}<br />
      <span>${model.family} · ${tierLabel(model.tier)} · ${model.sizeHint}</span>
    `
    setStatus(`완료 — ${model.shortName}. 뷰를 클릭한 뒤 WASD로 탐험하세요.`, 'ok')
  } catch (err) {
    overlayEl.textContent = '생성에 실패했습니다. 아래 오류 내용을 확인해 주세요.'
    reportError(err, {
      title: '3D 공간 생성 실패',
      summary: err instanceof Error ? err.message : String(err),
      context: `3D 공간 생성 (파일: ${current.file.name}, model: ${model.id}, meshRes: ${meshResEl.value}, depthScale: ${depthScaleEl.value})`,
      statusText: '3D 공간 생성 실패'
    })
  } finally {
    buildBtn.disabled = !current
    imageInput.disabled = false
    modelSelectEl.disabled = false
  }
})

explorer.controls.addEventListener('lock', () => {
  crosshairEl.hidden = false
  setStatus('탐색 중 — Esc로 마우스 해제', 'ok')
})

explorer.controls.addEventListener('unlock', () => {
  setStatus('마우스 해제됨. 다시 클릭하면 탐색을 계속합니다.')
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

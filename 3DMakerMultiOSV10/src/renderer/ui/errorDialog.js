/**
 * Error dialog with copyable details + Confirm button.
 */

let dialogEl = null
let titleEl = null
let summaryEl = null
let detailsEl = null
let copyBtn = null
let okBtn = null
let copyResetTimer = 0
let lastDetailsText = ''

function ensureDialog() {
  if (dialogEl) return

  dialogEl = document.getElementById('errorDialog')
  titleEl = document.getElementById('errorDialogTitle')
  summaryEl = document.getElementById('errorDialogSummary')
  detailsEl = document.getElementById('errorDialogDetails')
  copyBtn = document.getElementById('errorDialogCopy')
  okBtn = document.getElementById('errorDialogOk')

  if (!dialogEl || !detailsEl || !copyBtn || !okBtn) {
    throw new Error('오류 팝업 DOM이 없습니다. index.html을 확인하세요.')
  }

  copyBtn.addEventListener('click', async () => {
    const text = lastDetailsText || detailsEl.textContent || ''
    try {
      await navigator.clipboard.writeText(text)
      flashCopyLabel('복사됨')
    } catch {
      // Fallback when Clipboard API is unavailable.
      const range = document.createRange()
      range.selectNodeContents(detailsEl)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      const ok = document.execCommand('copy')
      selection?.removeAllRanges()
      flashCopyLabel(ok ? '복사됨' : '복사 실패')
    }
  })

  okBtn.addEventListener('click', () => hideErrorDialog())

  dialogEl.addEventListener('click', (event) => {
    if (event.target === dialogEl) hideErrorDialog()
  })

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialogEl && !dialogEl.hidden) {
      hideErrorDialog()
    }
  })
}

function flashCopyLabel(label) {
  if (!copyBtn) return
  const original = copyBtn.dataset.label || '복사'
  copyBtn.dataset.label = original
  copyBtn.textContent = label
  window.clearTimeout(copyResetTimer)
  copyResetTimer = window.setTimeout(() => {
    copyBtn.textContent = copyBtn.dataset.label || '복사'
  }, 1400)
}

/**
 * @param {unknown} err
 * @param {{ title?: string, context?: string }} [options]
 * @returns {string}
 */
export function formatErrorDetails(err, options = {}) {
  const lines = []
  const title = options.title || '오류'
  const when = new Date().toISOString()

  lines.push(`[${title}]`)
  lines.push(`시간: ${when}`)
  if (options.context) lines.push(`위치: ${options.context}`)

  if (typeof navigator !== 'undefined') {
    lines.push(`UserAgent: ${navigator.userAgent}`)
  }

  lines.push('')

  if (err instanceof Error) {
    lines.push(`이름: ${err.name}`)
    lines.push(`메시지: ${err.message || '(메시지 없음)'}`)
    if ('code' in err && err.code != null) lines.push(`코드: ${String(err.code)}`)
    if (err.cause != null) {
      lines.push('')
      lines.push('원인(cause):')
      lines.push(err.cause instanceof Error ? `${err.cause.name}: ${err.cause.message}` : String(err.cause))
    }
    if (err.stack) {
      lines.push('')
      lines.push('스택:')
      lines.push(err.stack)
    }
  } else if (typeof err === 'object' && err !== null) {
    try {
      lines.push(JSON.stringify(err, null, 2))
    } catch {
      lines.push(String(err))
    }
  } else {
    lines.push(String(err))
  }

  return lines.join('\n')
}

/**
 * @param {unknown} err
 * @param {{ title?: string, summary?: string, context?: string }} [options]
 */
export function showErrorDialog(err, options = {}) {
  ensureDialog()

  const title = options.title || '오류가 발생했습니다'
  const summary =
    options.summary ||
    (err instanceof Error ? err.message : String(err)) ||
    '알 수 없는 오류입니다.'

  lastDetailsText = formatErrorDetails(err, {
    title,
    context: options.context
  })

  titleEl.textContent = title
  summaryEl.textContent = summary
  detailsEl.textContent = lastDetailsText
  copyBtn.textContent = '복사'
  dialogEl.hidden = false
  okBtn.focus()
}

export function hideErrorDialog() {
  if (!dialogEl) return
  dialogEl.hidden = true
}

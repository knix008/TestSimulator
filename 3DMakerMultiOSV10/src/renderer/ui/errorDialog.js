/**
 * Error dialog with copyable details + Confirm button.
 */

import { t } from './i18n.js'

let dialogEl = null
let titleEl = null
let summaryEl = null
let detailsEl = null
let copyBtn = null
let okBtn = null
let copyLabelEl = null
let okLabelEl = null
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
  copyLabelEl = document.getElementById('errorDialogCopyLabel')
  okLabelEl = document.getElementById('errorDialogOkLabel')

  if (!dialogEl || !detailsEl || !copyBtn || !okBtn || !copyLabelEl || !okLabelEl) {
    throw new Error('오류 팝업 DOM이 없습니다. index.html을 확인하세요.')
  }

  copyBtn.addEventListener('click', async () => {
    const text = lastDetailsText || detailsEl.textContent || ''
    try {
      await navigator.clipboard.writeText(text)
      flashCopyLabel(t('error.copy.success'))
    } catch {
      // Fallback when Clipboard API is unavailable.
      const range = document.createRange()
      range.selectNodeContents(detailsEl)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      const ok = document.execCommand('copy')
      selection?.removeAllRanges()
      flashCopyLabel(ok ? t('error.copy.success') : t('error.copy.fail'))
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
  if (!copyBtn || !copyLabelEl) return
  const original = copyBtn.dataset.label || t('dialog.error.copy')
  copyBtn.dataset.label = original
  copyLabelEl.textContent = label
  window.clearTimeout(copyResetTimer)
  copyResetTimer = window.setTimeout(() => {
    copyLabelEl.textContent = copyBtn.dataset.label || t('dialog.error.copy')
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
  lines.push(`${t('error.meta.time')}: ${when}`)
  if (options.context) lines.push(`${t('error.meta.where')}: ${options.context}`)

  if (typeof navigator !== 'undefined') {
    lines.push(`${t('error.meta.userAgent')}: ${navigator.userAgent}`)
  }

  lines.push('')

  if (err instanceof Error) {
    lines.push(`${t('error.meta.name')}: ${err.name}`)
    lines.push(`${t('error.meta.message')}: ${err.message || '(no message)'}`)
    if ('code' in err && err.code != null) lines.push(`${t('error.meta.code')}: ${String(err.code)}`)
    if (err.cause != null) {
      lines.push('')
      lines.push(`${t('error.meta.cause')}:`)
      lines.push(err.cause instanceof Error ? `${err.cause.name}: ${err.cause.message}` : String(err.cause))
    }
    if (err.stack) {
      lines.push('')
      lines.push(`${t('error.meta.stack')}:`)
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

  const title = options.title || t('dialog.error.title')
  const summary =
    options.summary ||
    (err instanceof Error ? err.message : String(err)) ||
    t('dialog.error.summaryDefault')

  lastDetailsText = formatErrorDetails(err, {
    title,
    context: options.context
  })

  titleEl.textContent = title
  summaryEl.textContent = summary
  detailsEl.textContent = lastDetailsText
  copyBtn.dataset.label = t('dialog.error.copy')
  copyLabelEl.textContent = t('dialog.error.copy')
  okLabelEl.textContent = t('dialog.error.ok')
  dialogEl.hidden = false
  okBtn.focus()
}

export function hideErrorDialog() {
  if (!dialogEl) return
  dialogEl.hidden = true
}

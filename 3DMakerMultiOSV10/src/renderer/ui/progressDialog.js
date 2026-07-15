/**
 * Modal progress popup for 3D space generation.
 */

import { t } from './i18n.js'

let dialogEl = null
let titleEl = null
let messageEl = null
let percentEl = null
let barFillEl = null
let logEl = null
let lastPercent = 0

function ensureDialog() {
  if (dialogEl) return

  dialogEl = document.getElementById('progressDialog')
  titleEl = document.getElementById('progressDialogTitle')
  messageEl = document.getElementById('progressDialogMessage')
  percentEl = document.getElementById('progressDialogPercent')
  barFillEl = document.getElementById('progressDialogBarFill')
  logEl = document.getElementById('progressDialogLog')

  if (!dialogEl || !messageEl || !barFillEl || !percentEl) {
    throw new Error('진행률 팝업 DOM이 없습니다. index.html을 확인하세요.')
  }
}

/**
 * @param {{ title?: string }} [options]
 */
export function showProgressDialog(options = {}) {
  ensureDialog()
  lastPercent = 0
  titleEl.textContent = options.title || t('dialog.progress.title')
  messageEl.textContent = t('dialog.progress.preparing')
  percentEl.textContent = '0%'
  barFillEl.style.width = '0%'
  barFillEl.classList.remove('is-indeterminate')
  if (logEl) logEl.textContent = ''
  dialogEl.hidden = false
}

/**
 * @param {string} message
 * @param {number | null} [percent] 0–100, or null to keep / estimate
 */
export function updateProgressDialog(message, percent = null) {
  ensureDialog()
  if (dialogEl.hidden) showProgressDialog()

  const text = String(message || '').trim()
  if (text) {
    messageEl.textContent = text
    appendLog(text)
  }

  let next = percent
  if (next == null) {
    next = parsePercentFromMessage(text)
  }
  if (next == null) {
    // Gentle forward nudge so the bar keeps moving during long steps.
    next = Math.min(99, lastPercent + 1)
    barFillEl.classList.add('is-indeterminate')
  } else {
    barFillEl.classList.remove('is-indeterminate')
  }

  next = Math.max(lastPercent, Math.min(100, Math.round(next)))
  lastPercent = next
  percentEl.textContent = `${next}%`
  barFillEl.style.width = `${next}%`
  barFillEl.setAttribute('aria-valuenow', String(next))
}

export function hideProgressDialog() {
  if (!dialogEl) return
  dialogEl.hidden = true
  barFillEl.classList.remove('is-indeterminate')
}

/**
 * @param {string} message
 * @returns {number | null}
 */
function parsePercentFromMessage(message) {
  if (!message) return null
  const match = message.match(/(\d{1,3})\s*%/)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, value))
}

/**
 * @param {string} line
 */
function appendLog(line) {
  if (!logEl) return
  const prev = logEl.textContent ? `${logEl.textContent}\n` : ''
  const lines = (prev + line).split('\n').filter(Boolean)
  logEl.textContent = lines.slice(-8).join('\n')
  logEl.scrollTop = logEl.scrollHeight
}

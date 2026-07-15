/**
 * Viewport toolbar: zoom controls, scale readout, action buttons + tooltips.
 */

import { onLanguageChange, t } from './i18n.js'

/**
 * @param {import('../scene/explorer.js').SpaceExplorer} explorer
 * @param {{
 *   onStatus?: (msg: string) => void
 *   onExploreChange?: (exploring: boolean) => void
 * }} [options]
 */
export function bindViewportToolbar(explorer, options = {}) {
  const root = document.getElementById('viewportToolbar')
  const zoomLabel = document.getElementById('zoomLabel')
  if (!root || !zoomLabel) return

  const buttons = {
    zoomOut: root.querySelector('[data-action="zoom-out"]'),
    zoomIn: root.querySelector('[data-action="zoom-in"]'),
    zoomReset: root.querySelector('[data-action="zoom-reset"]'),
    axes: root.querySelector('[data-action="toggle-axes"]'),
    resetView: root.querySelector('[data-action="reset-view"]'),
    explore: root.querySelector('[data-action="explore"]')
  }

  const refreshZoom = (zoom) => {
    const percent = Math.round(zoom * 100)
    zoomLabel.textContent = `${percent}%`
    zoomLabel.title = t('zoom.currentTitle', { percent })
    zoomLabel.setAttribute('aria-label', t('zoom.currentAria', { percent }))
  }

  const refreshExplore = (exploring) => {
    if (!buttons.explore) return
    buttons.explore.classList.toggle('is-active', exploring)
    buttons.explore.setAttribute('aria-pressed', String(exploring))
  }

  explorer.onZoomChange = refreshZoom
  explorer.onExploreChange = (exploring) => {
    refreshExplore(exploring)
    options.onExploreChange?.(exploring)
  }
  refreshZoom(explorer.getZoom())
  refreshExplore(explorer.isExploring())

  const stopLanguageWatch = onLanguageChange(() => {
    refreshZoom(explorer.getZoom())
  })

  root.addEventListener('pointerdown', (e) => e.stopPropagation())
  root.addEventListener('mousedown', (e) => e.stopPropagation())
  root.addEventListener('click', (e) => e.stopPropagation())

  buttons.zoomOut?.addEventListener('click', () => {
    explorer.zoomBy(1 / 1.15)
    options.onStatus?.(
      t('status.zoomOut', { percent: Math.round(explorer.getZoom() * 100) })
    )
  })
  buttons.zoomIn?.addEventListener('click', () => {
    explorer.zoomBy(1.15)
    options.onStatus?.(
      t('status.zoomIn', { percent: Math.round(explorer.getZoom() * 100) })
    )
  })
  buttons.zoomReset?.addEventListener('click', () => {
    explorer.resetZoom()
    options.onStatus?.(t('status.zoomReset'))
  })
  buttons.axes?.addEventListener('click', () => {
    const visible = explorer.toggleAxes()
    buttons.axes.classList.toggle('is-active', visible)
    buttons.axes.setAttribute('aria-pressed', String(visible))
    options.onStatus?.(visible ? t('status.axesOn') : t('status.axesOff'))
  })
  const reportReset = (ok) => {
    options.onStatus?.(ok ? t('status.resetOk') : t('status.resetNoSpace'))
  }
  explorer.onResetView = reportReset
  buttons.resetView?.addEventListener('click', () => {
    reportReset(explorer.resetView())
  })
  buttons.explore?.addEventListener('click', () => {
    const state = explorer.beginExplore()
    if (state == null) {
      options.onStatus?.(t('status.needBuild'))
      return
    }
    buttons.explore.classList.toggle('is-active', state)
    buttons.explore.setAttribute('aria-pressed', String(state))
    options.onStatus?.(
      state
        ? t('status.moveOn')
        : t('status.moveOff')
    )
  })

  if (buttons.axes) {
    buttons.axes.classList.toggle('is-active', explorer.areAxesVisible())
    buttons.axes.setAttribute('aria-pressed', String(explorer.areAxesVisible()))
  }

  // Keep API compatible; return cleanup for callers that want it.
  return () => {
    stopLanguageWatch()
  }
}

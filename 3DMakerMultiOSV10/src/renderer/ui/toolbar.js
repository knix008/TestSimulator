/**
 * Viewport toolbar: zoom controls, scale readout, action buttons + tooltips.
 */

/**
 * @param {import('../scene/explorer.js').SpaceExplorer} explorer
 * @param {{
 *   onStatus?: (msg: string) => void
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
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`
    zoomLabel.title = `현재 배율 ${Math.round(zoom * 100)}%`
    zoomLabel.setAttribute('aria-label', `현재 배율 ${Math.round(zoom * 100)}퍼센트`)
  }

  explorer.onZoomChange = refreshZoom
  refreshZoom(explorer.getZoom())

  root.addEventListener('mousedown', (e) => e.stopPropagation())
  root.addEventListener('click', (e) => e.stopPropagation())

  buttons.zoomOut?.addEventListener('click', () => {
    explorer.zoomBy(1 / 1.15)
    options.onStatus?.(`축소 · 배율 ${Math.round(explorer.getZoom() * 100)}%`)
  })
  buttons.zoomIn?.addEventListener('click', () => {
    explorer.zoomBy(1.15)
    options.onStatus?.(`확대 · 배율 ${Math.round(explorer.getZoom() * 100)}%`)
  })
  buttons.zoomReset?.addEventListener('click', () => {
    explorer.resetZoom()
    options.onStatus?.('배율 100%로 초기화')
  })
  buttons.axes?.addEventListener('click', () => {
    const visible = explorer.toggleAxes()
    buttons.axes.classList.toggle('is-active', visible)
    buttons.axes.setAttribute('aria-pressed', String(visible))
    options.onStatus?.(visible ? 'XYZ 축 표시' : 'XYZ 축 숨김')
  })
  buttons.resetView?.addEventListener('click', () => {
    const ok = explorer.resetView()
    options.onStatus?.(ok ? '시점을 시작 위치로 되돌렸습니다' : '생성된 공간이 없습니다')
  })
  buttons.explore?.addEventListener('click', () => {
    const ok = explorer.beginExplore()
    options.onStatus?.(
      ok ? '탐색 모드 — 마우스로 시야, WASD로 이동' : '먼저 3D 공간을 생성하세요'
    )
  })

  if (buttons.axes) {
    buttons.axes.classList.toggle('is-active', explorer.areAxesVisible())
    buttons.axes.setAttribute('aria-pressed', String(explorer.areAxesVisible()))
  }
}

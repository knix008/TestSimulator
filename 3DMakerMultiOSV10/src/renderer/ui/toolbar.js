/**
 * Viewport toolbar: zoom controls, scale readout, action buttons + tooltips.
 */

import { onLanguageChange, t } from './i18n.js'

const LIGHT_CUSTOM_PRESET_STORAGE_KEY = 'space-maker.light-custom-preset'
const LIGHT_PANEL_COLLAPSED_STORAGE_KEY = 'space-maker.light-panel-collapsed'

const LIGHT_PRESETS = {
  studio: {
    exposure: 1.24,
    hemiMultiplier: 1.05,
    keyMultiplier: 1.3,
    keyAzimuthDeg: 54,
    keyElevationDeg: 58
  },
  soft: {
    exposure: 1.12,
    hemiMultiplier: 1.28,
    keyMultiplier: 0.76,
    keyAzimuthDeg: 38,
    keyElevationDeg: 70
  },
  dramatic: {
    exposure: 1.3,
    hemiMultiplier: 0.62,
    keyMultiplier: 2.05,
    keyAzimuthDeg: -32,
    keyElevationDeg: 34
  }
}

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
  const lightPresetLabel = document.getElementById('lightPresetLabel')
  const lightPanel = root?.querySelector('.toolbar-group-light')
  const lightPanelBody = document.getElementById('lightPanelBody')
  const lightPanelToggleLabel = document.getElementById('lightPanelToggleLabel')
  if (!root || !zoomLabel) return

  const buttons = {
    zoomOut: root.querySelector('[data-action="zoom-out"]'),
    zoomIn: root.querySelector('[data-action="zoom-in"]'),
    zoomReset: root.querySelector('[data-action="zoom-reset"]'),
    axes: root.querySelector('[data-action="toggle-axes"]'),
    resetView: root.querySelector('[data-action="reset-view"]'),
    explore: root.querySelector('[data-action="explore"]'),
    lightReset: root.querySelector('[data-action="light-reset"]'),
    lightPresetStudio: root.querySelector('[data-action="light-preset-studio"]'),
    lightPresetSoft: root.querySelector('[data-action="light-preset-soft"]'),
    lightPresetDramatic: root.querySelector('[data-action="light-preset-dramatic"]'),
    lightPresetCustom: root.querySelector('[data-action="light-preset-custom"]'),
    lightPresetSave: root.querySelector('[data-action="light-preset-save"]'),
    lightPanelToggle: root.querySelector('[data-action="toggle-light-panel"]')
  }

  let savedCustomPreset = loadCustomPreset()

  const lightControls = {
    exposure: document.getElementById('lightExposure'),
    ambient: document.getElementById('lightAmbient'),
    key: document.getElementById('lightKey'),
    azimuth: document.getElementById('lightAzimuth'),
    elevation: document.getElementById('lightElevation')
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

  const refreshLightingPresetLabel = (lighting) => {
    if (!lightPresetLabel) return
    const exposure = Math.round(lighting.exposure * 100)
    const ambient = Math.round(lighting.hemiMultiplier * 100)
    const key = Math.round(lighting.keyMultiplier * 100)
    const azimuth = Math.round(lighting.keyAzimuthDeg)
    const elevation = Math.round(lighting.keyElevationDeg)
    lightPresetLabel.textContent = t('toolbar.light.preset', {
      exposure,
      ambient,
      key,
      azimuth,
      elevation
    })
  }

  const presetButtons = [
    { key: 'studio', el: buttons.lightPresetStudio },
    { key: 'soft', el: buttons.lightPresetSoft },
    { key: 'dramatic', el: buttons.lightPresetDramatic },
    { key: 'custom', el: buttons.lightPresetCustom }
  ]

  const getPresetByName = (name) => {
    if (name === 'custom') return savedCustomPreset
    return LIGHT_PRESETS[name] || null
  }

  const detectPreset = (lighting) => {
    for (const name of ['studio', 'soft', 'dramatic', 'custom']) {
      const preset = getPresetByName(name)
      if (!preset) continue
      const matched =
        Math.abs(preset.exposure - lighting.exposure) <= 0.03 &&
        Math.abs(preset.hemiMultiplier - lighting.hemiMultiplier) <= 0.03 &&
        Math.abs(preset.keyMultiplier - lighting.keyMultiplier) <= 0.03 &&
        Math.abs(preset.keyAzimuthDeg - lighting.keyAzimuthDeg) <= 2 &&
        Math.abs(preset.keyElevationDeg - lighting.keyElevationDeg) <= 2
      if (matched) return name
    }
    return null
  }

  const refreshPresetButtons = (lighting) => {
    const active = detectPreset(lighting)
    for (const item of presetButtons) {
      if (!item.el) continue
      if (item.key === 'custom') item.el.disabled = !savedCustomPreset
      const on = active === item.key
      item.el.classList.toggle('is-active', on)
      item.el.setAttribute('aria-pressed', String(on))
    }
  }

  const refreshLightingUi = (lighting) => {
    if (lightControls.exposure) lightControls.exposure.value = String(lighting.exposure)
    if (lightControls.ambient) lightControls.ambient.value = String(lighting.hemiMultiplier)
    if (lightControls.key) lightControls.key.value = String(lighting.keyMultiplier)
    if (lightControls.azimuth) lightControls.azimuth.value = String(lighting.keyAzimuthDeg)
    if (lightControls.elevation) lightControls.elevation.value = String(lighting.keyElevationDeg)
    refreshLightingPresetLabel(lighting)
    refreshPresetButtons(lighting)
  }

  const updateLightingFromUi = () => {
    const next = {
      exposure: Number(lightControls.exposure?.value),
      hemiMultiplier: Number(lightControls.ambient?.value),
      keyMultiplier: Number(lightControls.key?.value),
      keyAzimuthDeg: Number(lightControls.azimuth?.value),
      keyElevationDeg: Number(lightControls.elevation?.value)
    }
    const applied = explorer.setLighting(next)
    refreshLightingUi(applied)
  }

  const reportLightingChanged = () => {
    const lighting = explorer.getLighting()
    options.onStatus?.(t('status.lightUpdated', {
      exposure: Math.round(lighting.exposure * 100),
      ambient: Math.round(lighting.hemiMultiplier * 100),
      key: Math.round(lighting.keyMultiplier * 100),
      azimuth: Math.round(lighting.keyAzimuthDeg),
      elevation: Math.round(lighting.keyElevationDeg)
    }))
  }

  const applyLightPreset = (presetName) => {
    const preset = getPresetByName(presetName)
    if (!preset) {
      options.onStatus?.(t('status.lightPresetMissing'))
      return
    }
    const applied = explorer.setLighting(preset)
    refreshLightingUi(applied)
    options.onStatus?.(t('status.lightPresetApplied', {
      name: t(`toolbar.light.preset${capitalize(presetName)}`)
    }))
  }

  const saveCustomPreset = () => {
    const lighting = explorer.getLighting()
    savedCustomPreset = sanitizeLightingPreset(lighting)
    try {
      localStorage.setItem(LIGHT_CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(savedCustomPreset))
    } catch {
      // Ignore storage failures and keep in-memory preset for current session.
    }
    refreshLightingUi(lighting)
    options.onStatus?.(t('status.lightPresetSaved', {
      name: t('toolbar.light.presetCustom')
    }))
  }

  const setLightPanelCollapsed = (collapsed, persist = true, notify = false) => {
    if (!lightPanel) return
    const next = Boolean(collapsed)
    lightPanel.classList.toggle('is-collapsed', next)
    if (lightPanelBody) lightPanelBody.hidden = next

    if (buttons.lightPanelToggle) {
      buttons.lightPanelToggle.setAttribute('aria-expanded', String(!next))
      const key = next ? 'toolbar.light.expand' : 'toolbar.light.collapse'
      const titleKey = next ? 'tooltip.light.expand' : 'tooltip.light.collapse'
      const ariaKey = next ? 'aria.light.expand' : 'aria.light.collapse'
      const label = t(key)
      if (lightPanelToggleLabel) lightPanelToggleLabel.textContent = label
      buttons.lightPanelToggle.setAttribute('title', t(titleKey))
      buttons.lightPanelToggle.setAttribute('data-tooltip', t(titleKey))
      buttons.lightPanelToggle.setAttribute('aria-label', t(ariaKey))
    }

    if (persist) {
      try {
        localStorage.setItem(LIGHT_PANEL_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
    }

    if (notify) {
      options.onStatus?.(next ? t('status.lightPanelCollapsed') : t('status.lightPanelExpanded'))
    }
  }

  explorer.onZoomChange = refreshZoom
  explorer.onExploreChange = (exploring) => {
    refreshExplore(exploring)
    options.onExploreChange?.(exploring)
  }
  refreshZoom(explorer.getZoom())
  refreshExplore(explorer.isExploring())
  explorer.onLightingChange = refreshLightingUi
  refreshLightingUi(explorer.getLighting())

  const initiallyCollapsed = localStorage.getItem(LIGHT_PANEL_COLLAPSED_STORAGE_KEY) === '1'
  setLightPanelCollapsed(initiallyCollapsed, false, false)

  const stopLanguageWatch = onLanguageChange(() => {
    refreshZoom(explorer.getZoom())
    refreshLightingPresetLabel(explorer.getLighting())
    setLightPanelCollapsed(lightPanel?.classList.contains('is-collapsed'), false, false)
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

  Object.values(lightControls).forEach((el) => {
    el?.addEventListener('input', updateLightingFromUi)
    el?.addEventListener('change', reportLightingChanged)
  })

  buttons.lightReset?.addEventListener('click', () => {
    const next = explorer.resetLighting()
    refreshLightingUi(next)
    options.onStatus?.(t('status.lightReset'))
  })

  buttons.lightPresetStudio?.addEventListener('click', () => applyLightPreset('studio'))
  buttons.lightPresetSoft?.addEventListener('click', () => applyLightPreset('soft'))
  buttons.lightPresetDramatic?.addEventListener('click', () => applyLightPreset('dramatic'))
  buttons.lightPresetCustom?.addEventListener('click', () => applyLightPreset('custom'))
  buttons.lightPresetSave?.addEventListener('click', saveCustomPreset)
  buttons.lightPanelToggle?.addEventListener('click', () => {
    const collapsed = lightPanel?.classList.contains('is-collapsed')
    setLightPanelCollapsed(!collapsed, true, true)
  })

  if (buttons.axes) {
    buttons.axes.classList.toggle('is-active', explorer.areAxesVisible())
    buttons.axes.setAttribute('aria-pressed', String(explorer.areAxesVisible()))
  }

  // Keep API compatible; return cleanup for callers that want it.
  return () => {
    explorer.onLightingChange = null
    stopLanguageWatch()
  }
}

function capitalize(value) {
  const v = String(value || '')
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : ''
}

function sanitizeLightingPreset(preset) {
  if (!preset || typeof preset !== 'object') return null
  const next = {
    exposure: Number(preset.exposure),
    hemiMultiplier: Number(preset.hemiMultiplier),
    keyMultiplier: Number(preset.keyMultiplier),
    keyAzimuthDeg: Number(preset.keyAzimuthDeg),
    keyElevationDeg: Number(preset.keyElevationDeg)
  }
  if (!Number.isFinite(next.exposure)) return null
  if (!Number.isFinite(next.hemiMultiplier)) return null
  if (!Number.isFinite(next.keyMultiplier)) return null
  if (!Number.isFinite(next.keyAzimuthDeg)) return null
  if (!Number.isFinite(next.keyElevationDeg)) return null
  return next
}

function loadCustomPreset() {
  try {
    const raw = localStorage.getItem(LIGHT_CUSTOM_PRESET_STORAGE_KEY)
    if (!raw) return null
    return sanitizeLightingPreset(JSON.parse(raw))
  } catch {
    return null
  }
}

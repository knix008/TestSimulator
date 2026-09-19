import type { PanelTab } from './lib/types'

/** The label key for a tab. */
export function panelLabelKey(tab: PanelTab) {
  const keys: Record<PanelTab, string> = {
    layers: 'layers', adjust: 'adjustments', history: 'history', channels: 'channels', actions: 'actions', timeline: 'timeline', info: 'info',
    properties: 'properties', navigator: 'navigator', color: 'colorPanel', swatches: 'swatches', gradients: 'gradientsPanel', patterns: 'patternsPanel',
    styles: 'stylesPanel', shapes: 'shapesPanel', brushes: 'brushesPanel', cloneSource: 'cloneSourcePanel', toolPresets: 'toolPresets', character: 'characterPanel',
    paragraph: 'paragraphPanel', glyphs: 'glyphs', comps: 'layerComps', measurementLog: 'measurementLog', notes: 'notesPanel', paths: 'pathsPanel',
  }
  return keys[tab]
}


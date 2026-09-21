import type { ComponentType, SVGProps } from 'react'
import {
  AlignLeft, Blend, Compass, Film, Grid3x3, History, Images, Info, LayoutGrid, Layers,
  Paintbrush, Palette, Pilcrow, Play, Ruler, Settings2, Shapes, SlidersHorizontal, Spline, Sparkles, Stamp,
  StickyNote, SwatchBook, Type, Wrench,
} from 'lucide-react'
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


/**
 * An icon for each tab.
 *
 * Twenty-five tabs, three to a row, is more than a column of that width can
 * spell out: "Adjustments", "Clone Source" and "Measurement Log" all came back
 * as an ellipsis, which is no help at all when you are hunting for a panel.
 * The icon carries the recognition and the name below it can be short.
 */
const icons: Record<PanelTab, ComponentType<SVGProps<SVGSVGElement> & { size?: number }>> = {
  layers: Layers,
  adjust: SlidersHorizontal,
  history: History,
  channels: Blend,
  actions: Play,
  timeline: Film,
  info: Info,
  properties: Settings2,
  navigator: Compass,
  color: Palette,
  swatches: SwatchBook,
  gradients: Blend,
  patterns: Grid3x3,
  styles: Sparkles,
  shapes: Shapes,
  brushes: Paintbrush,
  cloneSource: Stamp,
  toolPresets: Wrench,
  character: Type,
  paragraph: Pilcrow,
  glyphs: AlignLeft,
  comps: Images,
  measurementLog: Ruler,
  notes: StickyNote,
  paths: Spline,
}

export function panelIcon(tab: PanelTab) {
  return icons[tab] ?? LayoutGrid
}

/** A short name for the tab button, where the full one will not fit. */
export function panelShortKey(tab: PanelTab) {
  const short: Partial<Record<PanelTab, string>> = {
    adjust: 'panelShortAdjust',
    cloneSource: 'panelShortClone',
    toolPresets: 'panelShortPresets',
    comps: 'panelShortComps',
    measurementLog: 'panelShortLog',
  }
  return short[tab] ?? panelLabelKey(tab)
}

/** The unabridged name, for the tooltip. */
export { panelLabelKey as panelFullKey }

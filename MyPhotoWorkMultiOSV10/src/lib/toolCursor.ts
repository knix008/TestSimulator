import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { iconForTool } from '../catalog'
import { optionsForTool } from '../toolOptions'
import type { Tool } from './types'

/**
 * What the mouse pointer looks like over the picture, for each tool.
 *
 * A tool with a pointer everybody already knows gets that one: the hand, the
 * magnifier, the text caret. Every other tool gets a crosshair whose centre is
 * exactly the pixel it will act on, with the tool's own toolbar icon beside it, so
 * the pointer says which tool is active and stays precise. A tool that paints with
 * a size also gets a ring of that size on screen (the ring is a DOM element, since a
 * cursor image cannot be larger than 128px).
 */

/** The pixel of the cursor image that is the pointer's position. */
export const CURSOR_HOTSPOT = 8

const NATIVE: Partial<Record<Tool, string>> = {
  move: 'move',
  hand: 'grab',
  zoom: 'zoom-in',
  text: 'text',
  textMask: 'text',
  vtext: 'vertical-text',
  pathSelect: 'default',
  directSelect: 'default',
}

/** These act outside the picture too: panning, zooming and turning the view. */
const WORKS_ANYWHERE: Tool[] = ['hand', 'zoom', 'rotateView']

/** Alt picks the clone source with these, so the pointer turns into a plain target. */
const ALT_TARGET: Tool[] = ['clone', 'patternStamp', 'heal']

const cache = new Map<Tool, string>()

/** The crosshair and the tool's icon as an SVG cursor; both outlined, to show on any picture. */
function iconCursor(tool: Tool) {
  const known = cache.get(tool)
  if (known) return known
  const markup = renderToStaticMarkup(createElement(iconForTool(tool), { size: 24 }))
  const shape = markup.slice(markup.indexOf('>') + 1, markup.lastIndexOf('</svg>'))
  const c = CURSOR_HOTSPOT
  const cross = `M${c} 1V${c - 3}M${c} ${c + 3}V${c + 7}M1 ${c}H${c - 3}M${c + 3} ${c}H${c + 7}`
  const icon = (colour: string, width: number) => `<g fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${shape}</g>`
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + `<path d="${cross}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="${cross}" stroke="#000" stroke-width="1"/>`
    + `<g transform="translate(13 13) scale(0.75)">${icon('#fff', 5)}${icon('#000', 2)}</g></svg>`
  const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`
  cache.set(tool, cursor)
  return cursor
}

export function toolCursor(tool: Tool, state: { alt?: boolean; pressed?: boolean } = {}) {
  if (tool === 'hand' && state.pressed) return 'grabbing'
  if (tool === 'zoom' && state.alt) return 'zoom-out'
  if (state.alt && ALT_TARGET.includes(tool)) return 'crosshair'
  return NATIVE[tool] ?? iconCursor(tool)
}

/** Whether this tool's options bar has a size, which makes it a tool that works in a circle. */
export function paintsWithSize(tool: Tool) {
  return optionsForTool(tool).some((control) => control.kind === 'range' && control.key === 'brushSize')
}

export type PointerState = {
  tool: Tool
  /** Over the document's rectangle. */
  inImage: boolean
  /** Over a ruler strip, where a press does ruler things rather than tool things. */
  onRuler: boolean
  /** A button is down, so a drag keeps its pointer wherever it wanders. */
  pressed: boolean
  alt: boolean
  zoom: number
  brushSize: number
}

/** The cursor, and the diameter of the size ring in screen pixels (0: none). */
export function pointerLook(state: PointerState) {
  const { tool, inImage, onRuler, pressed, alt, zoom, brushSize } = state
  const active = pressed || (!onRuler && (inImage || WORKS_ANYWHERE.includes(tool)))
  if (!active) return { cursor: 'default', ring: 0 }
  const ring = inImage && paintsWithSize(tool) ? brushSize * zoom : 0
  return { cursor: toolCursor(tool, { alt, pressed }), ring }
}

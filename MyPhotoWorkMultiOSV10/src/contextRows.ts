/**
 * What the right mouse button offers, as command ids from the one catalog (`null` is a
 * separator). The rows go through runCommand like the menus do, so they behave the same,
 * show the same icons and shortcuts, and cannot drift from them.
 */
export type ContextRow = string | null
export type ContextKind = 'canvas' | 'layer'

const HISTORY: ContextRow[] = ['edit.undo', 'edit.redo', null]
const VIEW: ContextRow[] = ['view.zoomFit', 'view.actualPixels', 'view.grid', 'view.rulers', null, 'image.info']

/** On the picture: the selection first if there is one, since that is what the click is about. */
export function canvasContextRows(hasSelection: boolean): ContextRow[] {
  if (hasSelection) {
    return [
      ...HISTORY,
      'edit.cut', 'edit.copy', 'edit.paste', 'edit.deletePixels', null,
      'select.none', 'select.invert', 'select.feather', 'select.transform', null,
      'edit.fill', 'edit.stroke', 'edit.contentAware', null,
      'layer.newViaCopy', 'layer.newViaCut', 'layer.maskFromSelection', 'image.crop', null,
      ...VIEW,
    ]
  }
  return [
    ...HISTORY,
    'edit.paste', null,
    'select.all', 'select.reselect', 'select.subject', null,
    'layer.new', 'layer.duplicate', 'layer.delete', 'layer.style', 'layer.mergeDown', null,
    'edit.freeTransform', 'edit.fill', null,
    ...VIEW,
  ]
}

/** On a row of the Layers panel. */
export function layerContextRows(): ContextRow[] {
  return [
    ...HISTORY,
    'layer.new', 'layer.duplicate', 'layer.delete', null,
    'layer.style', 'layer.copyStyle', 'layer.pasteStyle', 'layer.clearStyle', null,
    'layer.mask', 'layer.clipMask', 'layer.toSmart', 'layer.rasterize', null,
    'layer.bringForward', 'layer.sendBackward', null,
    'layer.mergeDown', 'layer.mergeVisible', 'layer.flatten',
  ]
}

export const contextRows = (kind: ContextKind, hasSelection: boolean) => (kind === 'layer' ? layerContextRows() : canvasContextRows(hasSelection))

const MARGIN = 8

/** Beside the pointer, flipped or pushed back so all of it stays in the window. */
export function placeContextMenu(x: number, y: number, width: number, height: number, view: { width: number; height: number }) {
  let left = x
  let top = y
  if (left + width + MARGIN > view.width) left = Math.max(MARGIN, x - width)
  if (top + height + MARGIN > view.height) top = Math.max(MARGIN, view.height - height - MARGIN)
  return { left, top }
}

import {
  addNoise, clouds, emboss, findEdges, gaussianBlur, highPass, mosaic, motionBlur, offset, oilPaint,
  sharpen, solarize, vignette,
} from './filters'
import { pinch, radialBlur, ripple, spherize, twirl, wave } from './distort'
import {
  boxBlur, crystallize, dustAndScratches, lensFlare, maximumFilter, medianFilter, minimumFilter,
  unsharpMask,
} from './detail'
import { skinSmooth } from './ai'
import { extraFilters } from './moreFilters'
import type { Selection } from './types'

/**
 * One place that turns a gallery filter's id into the call that runs it.
 *
 * Both the Filter menu and the smart-filter stack go through here, which is the
 * point: a filter applied to the pixels and the same filter sitting on a smart
 * layer have to do the same thing, or the preview would lie.
 */

export type FilterSettings = {
  /** The Blur window's radius and the Sharpen window's amount, as the user
   *  last left them; each filter reads whichever of the two it needs. */
  radius: number
  amount: number
  /** A third free parameter the newer filters read: an angle, a threshold, a choice. */
  extra?: number
  /** The sketch filters draw in the foreground and background colours. */
  foreground?: string
  background?: string
}

/** The filters that are not a pixel operation at all: they open something. */
export const interactiveFilters = new Set(['cameraRaw', 'liquify'])

export function applyGalleryFilter(canvas: HTMLCanvasElement, id: string, settings: FilterSettings, selection: Selection | null) {
  const { radius, amount } = settings
  const rank = Math.max(1, Math.round(radius / 2))
  switch (id) {
    case 'gaussian': return gaussianBlur(canvas, radius, selection)
    case 'motion': return motionBlur(canvas, radius * 3, selection)
    case 'boxBlur': return boxBlur(canvas, radius, selection)
    case 'radialSpin': return radialBlur(canvas, amount, 'spin', selection)
    case 'radialZoom': return radialBlur(canvas, amount, 'zoom', selection)
    case 'sharpen': return sharpen(canvas, amount, selection)
    case 'unsharp': return unsharpMask(canvas, radius, amount, 4, selection)
    case 'highPass': return highPass(canvas, radius, selection)
    case 'addNoise': return addNoise(canvas, amount, selection)
    case 'median': return medianFilter(canvas, rank, selection)
    case 'dust': return dustAndScratches(canvas, rank, 16, selection)
    case 'mosaic': return mosaic(canvas, 12, selection)
    case 'crystallize': return crystallize(canvas, Math.max(3, radius * 3), selection)
    case 'findEdges': return findEdges(canvas, selection)
    case 'emboss': return emboss(canvas, selection)
    case 'solarize': return solarize(canvas, selection)
    case 'oil': return oilPaint(canvas, selection)
    case 'clouds': return clouds(canvas, selection)
    case 'vignette': return vignette(canvas, 0.65, selection)
    case 'lensFlare': return lensFlare(canvas, canvas.width * 0.32, canvas.height * 0.28, amount)
    case 'offset': return offset(canvas, 40, 40)
    case 'minimum': return minimumFilter(canvas, rank, selection)
    case 'maximum': return maximumFilter(canvas, rank, selection)
    case 'twirl': return twirl(canvas, amount * 2, selection)
    case 'ripple': return ripple(canvas, radius, selection)
    case 'wave': return wave(canvas, radius, canvas.height / 6, selection)
    case 'spherize': return spherize(canvas, amount, selection)
    case 'pinch': return pinch(canvas, amount, selection)
    case 'skinSmooth': return skinSmooth(canvas, Math.max(1, radius / 2), selection)
    default: {
      const extra = extraFilters[id]
      if (!extra) return undefined
      return extra.run(canvas, { radius, amount, extra: settings.extra, foreground: settings.foreground, background: settings.background }, selection)
    }
  }
}

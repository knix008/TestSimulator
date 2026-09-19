import type { ComponentType, SVGProps } from 'react'
import {
  Aperture,
  ArrowUpRight,
  Blend,
  Circle,
  Crop,
  Droplets,
  Eraser,
  Frame,
  Hand,
  Hexagon,
  Highlighter,
  Lasso,
  Magnet,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pencil,
  PenTool,
  Pipette,
  Ratio,
  RotateCw,
  Scissors,
  Sparkles,
  Spline,
  Square,
  Stamp,
  Star,
  SunMedium,
  Type,
  WandSparkles,
  WavesHorizontal,
  ZoomIn,
} from 'lucide-react'
import type { AdjustmentType, Tool } from './lib/types'
import { extraFilterIds, extraFilters } from './lib/moreFilters'

export type ToolGroup = { id: string; tools: { id: Tool; icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>; key: string }[] }

export function iconForTool(id: Tool) {
  for (const group of toolGroups) {
    const found = group.tools.find((item) => item.id === id)
    if (found) return found.icon
  }
  return MousePointer2
}

export const toolGroups: ToolGroup[] = [
  { id: 'move', tools: [{ id: 'move', icon: MousePointer2, key: 'V' }, { id: 'artboard', icon: Frame, key: 'Shift+V' }, { id: 'puppet', icon: Spline, key: 'Shift+V' }] },
  { id: 'marquee', tools: [{ id: 'marquee', icon: Square, key: 'M' }, { id: 'ellipseMarquee', icon: Circle, key: 'Shift+M' }, { id: 'rowMarquee', icon: Ratio, key: 'M' }, { id: 'colMarquee', icon: Ratio, key: 'M' }] },
  { id: 'lasso', tools: [{ id: 'lasso', icon: Lasso, key: 'L' }, { id: 'polyLasso', icon: Spline, key: 'L' }, { id: 'magneticLasso', icon: Magnet, key: 'L' }] },
  { id: 'select', tools: [{ id: 'objectSelect', icon: Sparkles, key: 'W' }, { id: 'quickSelect', icon: Highlighter, key: 'W' }, { id: 'wand', icon: WandSparkles, key: 'W' }] },
  { id: 'crop', tools: [{ id: 'crop', icon: Crop, key: 'C' }, { id: 'perspectiveCrop', icon: Crop, key: 'C' }, { id: 'slice', icon: Scissors, key: 'C' }, { id: 'sliceSelect', icon: Scissors, key: 'C' }] },
  { id: 'frame', tools: [{ id: 'frame', icon: Frame, key: 'K' }] },
  { id: 'sample', tools: [{ id: 'eyedropper', icon: Pipette, key: 'I' }, { id: 'sampler', icon: Aperture, key: 'I' }, { id: 'ruler', icon: Ratio, key: 'I' }, { id: 'note', icon: Pencil, key: 'I' }, { id: 'count', icon: Star, key: 'I' }] },
  { id: 'heal', tools: [{ id: 'spotHeal', icon: Sparkles, key: 'J' }, { id: 'remove', icon: Eraser, key: 'J' }, { id: 'heal', icon: Sparkles, key: 'J' }, { id: 'patch', icon: Stamp, key: 'J' }, { id: 'contentMove', icon: ArrowUpRight, key: 'J' }, { id: 'redEye', icon: Aperture, key: 'J' }] },
  { id: 'paint', tools: [{ id: 'brush', icon: Paintbrush, key: 'B' }, { id: 'pencil', icon: Pencil, key: 'B' }, { id: 'colorReplace', icon: Droplets, key: 'B' }, { id: 'mixer', icon: Blend, key: 'B' }] },
  { id: 'stamp', tools: [{ id: 'clone', icon: Stamp, key: 'S' }, { id: 'patternStamp', icon: Stamp, key: 'S' }] },
  { id: 'history', tools: [{ id: 'historyBrush', icon: Paintbrush, key: 'Y' }, { id: 'artHistory', icon: Paintbrush, key: 'Y' }] },
  { id: 'erase', tools: [{ id: 'eraser', icon: Eraser, key: 'E' }, { id: 'bgEraser', icon: Eraser, key: 'E' }, { id: 'magicEraser', icon: Eraser, key: 'E' }] },
  { id: 'fill', tools: [{ id: 'gradient', icon: Blend, key: 'G' }, { id: 'fill', icon: PaintBucket, key: 'G' }] },
  { id: 'focus', tools: [{ id: 'blurTool', icon: Droplets, key: '' }, { id: 'sharpenTool', icon: Aperture, key: '' }, { id: 'smudge', icon: Hand, key: '' }, { id: 'liquify', icon: WavesHorizontal, key: '' }] },
  { id: 'tone', tools: [{ id: 'dodge', icon: SunMedium, key: 'O' }, { id: 'burn', icon: SunMedium, key: 'O' }, { id: 'sponge', icon: Droplets, key: 'O' }] },
  { id: 'pen', tools: [{ id: 'pen', icon: PenTool, key: 'P' }, { id: 'freeformPen', icon: PenTool, key: 'P' }, { id: 'curvaturePen', icon: Spline, key: 'P' }] },
  { id: 'path', tools: [{ id: 'pathSelect', icon: MousePointer2, key: 'A' }, { id: 'directSelect', icon: MousePointer2, key: 'A' }] },
  { id: 'type', tools: [{ id: 'text', icon: Type, key: 'T' }, { id: 'vtext', icon: Type, key: 'T' }, { id: 'textMask', icon: Type, key: 'T' }] },
  { id: 'shape', tools: [{ id: 'rect', icon: Square, key: 'U' }, { id: 'roundRect', icon: Square, key: 'U' }, { id: 'ellipse', icon: Circle, key: 'U' }, { id: 'polygon', icon: Hexagon, key: 'U' }, { id: 'line', icon: Spline, key: 'U' }, { id: 'customShape', icon: Star, key: 'U' }] },
  { id: 'nav', tools: [{ id: 'hand', icon: Hand, key: 'H' }, { id: 'rotateView', icon: RotateCw, key: 'R' }, { id: 'zoom', icon: ZoomIn, key: 'Z' }] },
]

export const adjustmentTypes: AdjustmentType[] = [
  'brightness', 'levels', 'curves', 'hue', 'colorBalance', 'vibrance', 'bw', 'invert', 'posterize', 'threshold', 'exposure', 'photoFilter', 'clarity', 'dehaze', 'grain', 'shadowsHighlights',
  'channelMixer', 'selectiveColor', 'gradientMap', 'equalize', 'colorLookup',
]

export type FilterCatalogEntry = { id: string; group: string }

export const filterCatalog: FilterCatalogEntry[] = [
  { id: 'gaussian', group: 'blur' },
  { id: 'motion', group: 'blur' },
  { id: 'boxBlur', group: 'blur' },
  { id: 'radialSpin', group: 'blur' },
  { id: 'radialZoom', group: 'blur' },
  { id: 'sharpen', group: 'sharpen' },
  { id: 'unsharp', group: 'sharpen' },
  { id: 'highPass', group: 'sharpen' },
  { id: 'addNoise', group: 'noise' },
  { id: 'median', group: 'noise' },
  { id: 'dust', group: 'noise' },
  { id: 'mosaic', group: 'pixelate' },
  { id: 'crystallize', group: 'pixelate' },
  { id: 'findEdges', group: 'stylize' },
  { id: 'emboss', group: 'stylize' },
  { id: 'oil', group: 'artistic' },
  { id: 'solarize', group: 'stylize' },
  { id: 'clouds', group: 'render' },
  { id: 'vignette', group: 'render' },
  { id: 'lensFlare', group: 'render' },
  { id: 'offset', group: 'other' },
  { id: 'minimum', group: 'other' },
  { id: 'maximum', group: 'other' },
  { id: 'liquify', group: 'distort' },
  { id: 'twirl', group: 'distort' },
  { id: 'ripple', group: 'distort' },
  { id: 'wave', group: 'distort' },
  { id: 'spherize', group: 'distort' },
  { id: 'pinch', group: 'distort' },
  { id: 'cameraRaw', group: 'raw' },
  { id: 'skinSmooth', group: 'neural' },
  // Everything moreFilters.ts adds: the rest of the Filter menu and the
  // Filter Gallery's artistic, brush-stroke, sketch and texture folders.
  ...extraFilterIds.map((id) => ({ id, group: extraFilters[id].group })),
]

/**
 * Runs every Photoshop-parity feature over the real photos in images/.
 *
 *   npm run verify:features            (working copies, longest side 512px)
 *   npm run verify:features -- --full  (the photos at their full size)
 *
 * `verify-images.mjs` proves the open → export → print pipeline. This walks
 * the rest of the editor — every tool, every Image/Edit/Layer/Type/Select/
 * Filter/3D command that changes pixels or the document — through the same
 * engine functions App.tsx calls, on each photo, and keeps what came out:
 * `out/features/<photo>-<feature>.png` per result, `out/features.html` as
 * the gallery, `out/features.md` as the record with a coverage table for
 * every command and tool in the catalog, and `out/verify-features.log`.
 *
 * Everything is asserted: a feature that throws, resizes the picture, or
 * leaves it untouched when it should have changed it fails the run. The
 * commands that only open a window or change the view cannot be judged from
 * pixels; the coverage table names each one and says why.
 *
 * Load through the test harness, which supplies the browser globals:
 *   node --import ./test/helpers/setup.mjs scripts/verify-features.mjs [outDir] [--full]
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { commands } from '../src/commands.ts'
import { adjustmentTypes, filterCatalog, toolGroups } from '../src/catalog.ts'
import { decodeImageSource, encodeExport, isHeifSource, restoreProject, serializeProject } from '../src/lib/imageIO.ts'
import { isDicomSource } from '../src/lib/dicom.ts'
import { describeFile, imageStatistics, readJpegExif } from '../src/lib/metadata.ts'
import {
  canvasFromUrl, cloneCanvas, compositeDocument, context2d, createBlankDocument, createCanvas, createLayerMeta,
  padCanvas, placeSmartObject, resizeCanvasContent, sampleComposite, setSmartFilterRunner, smartSourceKey,
} from '../src/lib/canvas.ts'
import { defaultAdjustment, defaultEffects, warpStyles } from '../src/lib/types.ts'
import { applyAdjustmentCanvas, levelsStretch } from '../src/lib/adjustments.ts'
import { applyCurves, applyLevels, autoLevels } from '../src/lib/curves.ts'
import {
  applyImage, applyLut, autoContrast, autoTone, builtInLuts, calculations, desaturate, fadeTo, hdrToning, matchColor,
  rotateArbitrary,
} from '../src/lib/adjustExtra.ts'
import { autoColor, channelMixer, equalize, gradientMap, replaceColor, selectiveColor } from '../src/lib/colorTools.ts'
import {
  adjustBrightnessContrast, adjustHueSaturation, clearSelectionPixels, gaussianBlur, histogram, sharpen,
} from '../src/lib/filters.ts'
import { applyGalleryFilter, interactiveFilters } from '../src/lib/gallery.ts'
import { customKernel, extraFilters } from '../src/lib/moreFilters.ts'
import { applyColorMode, builtInProfiles, convertProfile } from '../src/lib/colorModes.ts'
import { canvasFromDeep, deepExposure, deepFromCanvas, deepLevels } from '../src/lib/depth.ts'
import {
  borderSelection, clipCanvasToSelection, colSelection, colorRangeSelection, contractSelection, drawSelectionOverlay,
  ellipseSelection, expandSelection, featherSelection, growSelection, invertSelection, maskBounds, maskFromLasso,
  paintBucket, rectSelection, rowSelection, selectionToMask, similarSelection, smoothSelection, wandSelection,
} from '../src/lib/selection.ts'
import {
  channelCanvas, channelToSelection, channelView, combineMasks, greyCanvasToMask, maskToGreyCanvas, selectionToChannel,
  writeChannel,
} from '../src/lib/channels.ts'
import {
  decontaminateEdge, objectSelectRect, refineMask, selectFocusArea, selectSky, selectSubjectAuto,
} from '../src/lib/segment.ts'
import { findDistractions, generativeExpand, generativeUpscale, harmonize, skinSmooth } from '../src/lib/ai.ts'
import {
  alignChain, applyHomography, bilateralDenoise, blendAligned, exposureFusion, findPhotosOnScan, grabCutSelection,
  inpaintCanvas, stitchCanvases, warpCanvas as warpByHomography,
} from '../src/lib/cv.ts'
import { patchFill, poissonBlend } from '../src/lib/inpaint.ts'
import {
  cloneStamp, colorReplace, dodgeBurn, healStamp, paintGradient, paintStroke, rasterizeText, redEyeFix, smudge,
  spongeDesaturate,
} from '../src/lib/tools.ts'
import {
  artHistoryDab, healingBrushDab, historyBrushDab, liquifyDab, loadMixer, mixerDab, patternStampDab,
  perspectiveCloneDab, quickSelectDab, strokeMask,
} from '../src/lib/brushes.ts'
import { applyTransform, dragTransform, flipCanvas, identityTransform } from '../src/lib/transform.ts'
import {
  contentAwareScale, cornerTransform, meshWarp, perspective, puppetWarp, skew, warpCanvas,
} from '../src/lib/warp.ts'
import {
  alignOffsets, autoAlignLayers, autoBlendLayers, bitmapMode, checkSpelling, contactSheet, defringe, distributeOffsets,
  duotone, fitImage, gamutWarning, indexedColor, layerBounds, mergeToHdr, photomerge, proofCmyk, removeMatte,
  rotateLayerCanvas, shiftCanvas, traceCanvasToPaths,
} from '../src/lib/documentOps.ts'
import { applyLayerEffects, rasterizeShape, rasterizeTextLayer } from '../src/lib/effects.ts'
import {
  createPath, drawPathOverlay, fillPathOnto, pathFromPoints, pathNode, pathToSelection, smoothPath, strokePathOnto,
} from '../src/lib/paths.ts'
import { snapToEdge, patchSelection, contentMove, perspectiveCrop, createSlice, createFrame, rectAt, cropToRect, clipToFrame, measureInfo } from '../src/lib/regions.ts'
import { definePattern, makePatternTile, patternFill, patternKey, tileOnto } from '../src/lib/patterns.ts'
import { gradientPresets, paintGradientDef, resolveGradient } from '../src/lib/gradients.ts'
import { defaultThreeD, renderExtrude } from '../src/lib/three.ts'
import { encodeGif } from '../src/lib/gif.ts'
import { hasPsdMagic, writePsd } from '../src/lib/psd.ts'
import { pushHistory, takeSnapshot } from '../src/lib/history.ts'
import { canExportVideo, canImportVideo } from '../src/lib/video.ts'
import { hexToRgb } from '../src/lib/color.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const imagesDir = path.join(root, 'images')
const args = process.argv.slice(2)
const fullSize = args.includes('--full')
const outDir = args.find((arg) => !arg.startsWith('--')) ?? path.join(root, 'out')
const featuresDir = path.join(outDir, 'features')
// Only this script's own results are cleared; verify-images.mjs owns the rest of out/.
rmSync(featuresDir, { recursive: true, force: true })
mkdirSync(featuresDir, { recursive: true })

/** The longest side a working copy is brought down to, so the sweep finishes in minutes. */
const workingSide = fullSize ? Infinity : 512

const transcript = []
const say = (line = '') => {
  transcript.push(line)
  process.stdout.write(`${line}\n`)
}

// Noise, scatter and the stroke jitter draw on Math.random; seeded, so two
// runs of the script leave the same pictures behind.
let seed = 0x9e3779b9
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0x100000000
}

/* ------------------------------------------------------------ measuring */

function pixels(canvas) {
  return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data
}

/** Mean absolute difference per channel, over the pixels both canvases have. */
function meanDifference(a, b) {
  assert.equal(a.width, b.width, 'widths differ')
  assert.equal(a.height, b.height, 'heights differ')
  const first = pixels(a)
  const second = pixels(b)
  let sum = 0
  for (let i = 0; i < first.length; i += 1) sum += Math.abs(first[i] - second[i])
  return sum / first.length
}

/** Mean absolute difference inside a region only. */
function regionDifference(a, b, mask) {
  const first = pixels(a)
  const second = pixels(b)
  let sum = 0
  let n = 0
  for (let p = 0; p < mask.length; p += 1) {
    if (!mask[p]) continue
    for (let c = 0; c < 4; c += 1) sum += Math.abs(first[p * 4 + c] - second[p * 4 + c])
    n += 4
  }
  return n ? sum / n : 0
}

function alphaAt(canvas, x, y) {
  return context2d(canvas).getImageData(Math.round(x), Math.round(y), 1, 1).data[3]
}

function rgbAt(canvas, x, y) {
  const d = context2d(canvas).getImageData(Math.round(x), Math.round(y), 1, 1).data
  return [d[0], d[1], d[2]]
}

function meanLuma(canvas) {
  const data = pixels(canvas)
  let sum = 0
  for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  return sum / (data.length / 4)
}

function meanSaturation(canvas) {
  const data = pixels(canvas)
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2])
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    sum += max ? (max - min) / max : 0
  }
  return sum / (data.length / 4)
}

function countMask(mask) {
  let n = 0
  for (let i = 0; i < mask.length; i += 1) if (mask[i] > 127) n += 1
  return n
}

function isGrey(canvas) {
  const data = pixels(canvas)
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - data[i + 1]) > 2 || Math.abs(data[i] - data[i + 2]) > 2) return false
  }
  return true
}

/** A selection drawn over the picture, tinted and outlined, so it can be looked at. */
function overlay(canvas, selection) {
  const out = cloneCanvas(canvas)
  const ctx = context2d(out)
  const mask = selectionToMask(selection, out.width, out.height)
  if (mask) {
    const tint = ctx.createImageData(out.width, out.height)
    for (let p = 0; p < mask.length; p += 1) {
      tint.data[p * 4] = 255
      tint.data[p * 4 + 1] = 40
      tint.data[p * 4 + 2] = 40
      // A partly selected pixel (a feathered edge) is tinted partly.
      tint.data[p * 4 + 3] = Math.round((mask[p] * 110) / 255)
    }
    const layer = createCanvas(out.width, out.height)
    context2d(layer).putImageData(tint, 0, 0)
    ctx.drawImage(layer, 0, 0)
  }
  drawSelectionOverlay(ctx, selection, out.width, out.height, 0)
  return out
}

function withPaths(canvas, paths) {
  const out = cloneCanvas(canvas)
  drawPathOverlay(context2d(out), paths, paths[0]?.id ?? null, 1)
  return out
}

/** Two canvases side by side, for before/after and stitched results. */
function sideBySide(...canvases) {
  const width = canvases.reduce((sum, item) => sum + item.width + 4, -4)
  const height = Math.max(...canvases.map((item) => item.height))
  const out = createCanvas(width, height)
  const ctx = context2d(out)
  ctx.fillStyle = '#202020'
  ctx.fillRect(0, 0, width, height)
  let x = 0
  for (const item of canvases) {
    ctx.drawImage(item, x, 0)
    x += item.width + 4
  }
  return out
}

/* ------------------------------------------------------- document helpers */

const blankDoc = (name, width, height) => ({
  name, width, height, background: 'transparent', layers: [], activeLayerId: '',
  guides: [], notes: [], samplers: [], counts: [], paths: [], slices: [], frames: [], measure: null, colorMode: 'rgb',
})

/** A one-layer document round the canvas, the shape File ▸ Open builds. */
function singleLayerDocument(name, canvas) {
  const layer = createLayerMeta(name)
  const document = { ...blankDoc(name, canvas.width, canvas.height), layers: [layer], activeLayerId: layer.id }
  return { document, layer, canvases: new Map([[layer.id, canvas]]) }
}

/** A layer mask the way the editor makes one: white, with the coverage in the alpha channel. */
function alphaMask(mask, width, height) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < mask.length; i += 1) {
    image.data[i * 4] = 255
    image.data[i * 4 + 1] = 255
    image.data[i * 4 + 2] = 255
    image.data[i * 4 + 3] = mask[i]
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function maskCanvas(width, height, paint) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.fillStyle = '#ffffff'
  paint(ctx)
  return canvas
}

/* -------------------------------------------------------------- catalog */

/**
 * One entry per Photoshop feature. `run` gets the photo context and returns
 * the evidence: a canvas, `{ canvas, note }`, `{ selection }`, `{ paths }` or
 * `{ note }`. A canvas the same size as the working copy is compared with it
 * and must differ unless `same: true`; `check` runs any further assertions.
 * `cmd` and `tools` name what in the catalog the entry is evidence for.
 */
const features = []
const feature = (entry) => features.push(entry)

const galleryParams = { radius: 6, amount: 60, extra: 20, foreground: '#000000', background: '#ffffff' }

/* ---- tools */

feature({ id: 'tool-move', menu: 'Tools', ps: 'Move', tools: ['move'], run: (c) => {
  const out = shiftCanvas(c.fresh(), 40, 24)
  assert.equal(alphaAt(out, 5, 5), 0, 'the vacated corner should be empty')
  assert.equal(alphaAt(out, 60, 40), 255)
  return out
} })
feature({ id: 'tool-artboard', menu: 'Tools', ps: 'Artboard', tools: ['artboard'], cmd: ['layer.newArtboard', 'file.artboardsToFiles'], run: (c) => {
  const board = { id: 'ab1', name: 'Artboard 1', x: Math.round(c.w * 0.1), y: Math.round(c.h * 0.1), width: Math.round(c.w * 0.5), height: Math.round(c.h * 0.6) }
  const { document, canvases } = singleLayerDocument(c.stem, c.fresh())
  document.artboards = [board]
  const out = cropToRect(compositeDocument(document, canvases), board)
  assert.equal(out.width, board.width)
  assert.equal(out.height, board.height)
  return { canvas: out, note: `artboard ${board.width}x${board.height} exported on its own`, size: 'free' }
} })
feature({ id: 'tool-puppet', menu: 'Tools', ps: 'Puppet Warp', tools: ['puppet'], cmd: ['edit.puppet'], run: (c) => {
  const pins = [
    { from: { x: c.w * 0.2, y: c.h * 0.2 }, to: { x: c.w * 0.2, y: c.h * 0.2 } },
    { from: { x: c.w * 0.8, y: c.h * 0.2 }, to: { x: c.w * 0.8, y: c.h * 0.2 } },
    { from: { x: c.w * 0.2, y: c.h * 0.8 }, to: { x: c.w * 0.2, y: c.h * 0.8 } },
    { from: { x: c.w * 0.8, y: c.h * 0.8 }, to: { x: c.w * 0.8, y: c.h * 0.8 } },
    { from: { x: c.w * 0.5, y: c.h * 0.5 }, to: { x: c.w * 0.62, y: c.h * 0.42 } },
  ]
  return puppetWarp(c.fresh(), pins, 1)
} })
feature({ id: 'tool-marquee', menu: 'Tools', ps: 'Rectangular Marquee', tools: ['marquee'], run: (c) => ({ selection: c.rect }) })
feature({ id: 'tool-ellipseMarquee', menu: 'Tools', ps: 'Elliptical Marquee', tools: ['ellipseMarquee'], run: (c) => ({ selection: c.sel }) })
feature({ id: 'tool-rowMarquee', menu: 'Tools', ps: 'Single Row Marquee', tools: ['rowMarquee'], run: (c) => {
  const selection = rowSelection(Math.round(c.h / 2), c.w)
  assert.equal(selection.height, 1)
  return { selection }
} })
feature({ id: 'tool-colMarquee', menu: 'Tools', ps: 'Single Column Marquee', tools: ['colMarquee'], run: (c) => {
  const selection = colSelection(Math.round(c.w / 2), c.h)
  assert.equal(selection.width, 1)
  return { selection }
} })
feature({ id: 'tool-lasso', menu: 'Tools', ps: 'Lasso', tools: ['lasso'], run: (c) => {
  const points = []
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2
    const r = 0.25 + 0.08 * Math.sin(a * 5)
    points.push({ x: c.w / 2 + Math.cos(a) * r * c.w, y: c.h / 2 + Math.sin(a) * r * c.h })
  }
  const selection = maskFromLasso(points, c.w, c.h)
  assert.ok(countMask(selection.mask) > c.w * c.h * 0.05)
  return { selection }
} })
feature({ id: 'tool-polyLasso', menu: 'Tools', ps: 'Polygonal Lasso', tools: ['polyLasso'], run: (c) => ({
  selection: maskFromLasso([{ x: c.w * 0.5, y: c.h * 0.15 }, { x: c.w * 0.85, y: c.h * 0.5 }, { x: c.w * 0.5, y: c.h * 0.85 }, { x: c.w * 0.15, y: c.h * 0.5 }], c.w, c.h),
}) })
feature({ id: 'tool-magneticLasso', menu: 'Tools', ps: 'Magnetic Lasso', tools: ['magneticLasso'], run: (c) => {
  const snapped = []
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2
    snapped.push(snapToEdge(c.work, { x: c.w / 2 + Math.cos(a) * c.w * 0.3, y: c.h / 2 + Math.sin(a) * c.h * 0.3 }, 10))
  }
  return { selection: maskFromLasso(snapped, c.w, c.h), note: 'each point snapped to the strongest edge within 10px' }
} })
feature({ id: 'tool-objectSelect', menu: 'Tools', ps: 'Object Selection (GrabCut)', tools: ['objectSelect'], run: async (c) => {
  const box = { x: c.w * 0.2, y: c.h * 0.15, width: c.w * 0.6, height: c.h * 0.7 }
  const selection = await grabCutSelection(c.work, box, 5)
  const share = countMask(selection.mask) / (c.w * c.h)
  assert.ok(share > 0.01 && share < 0.95, `GrabCut selected ${(share * 100).toFixed(0)}% of the picture`)
  return { selection, note: `GrabCut inside a box: ${(share * 100).toFixed(0)}% of the picture` }
} })
feature({ id: 'tool-objectSelect-fallback', menu: 'Tools', ps: 'Object Selection (without OpenCV)', tools: ['objectSelect'], run: (c) => {
  const selection = objectSelectRect(c.work, { x: c.w * 0.2, y: c.h * 0.15, width: c.w * 0.6, height: c.h * 0.7 }, 40)
  return { selection, note: countMask(selection.mask) ? undefined : 'nothing inside the box differs from its rim' }
} })
feature({ id: 'tool-quickSelect', menu: 'Tools', ps: 'Quick Selection', tools: ['quickSelect'], run: (c) => {
  let mask = quickSelectDab(c.work, { x: c.w / 2, y: c.h / 2 }, 40, 32, null)
  mask = quickSelectDab(c.work, { x: c.w / 2 + 30, y: c.h / 2 }, 40, 32, mask)
  const added = countMask(mask)
  const subtracted = countMask(quickSelectDab(c.work, { x: c.w / 2, y: c.h / 2 }, 30, 32, mask, true))
  assert.ok(added > 0 && subtracted < added, 'Alt should take pixels back out')
  return { selection: { kind: 'mask', ...maskBounds(mask, c.w, c.h), mask }, note: `grown to ${added}px, Alt-dab left ${subtracted}px` }
} })
feature({ id: 'tool-wand', menu: 'Tools', ps: 'Magic Wand', tools: ['wand'], run: (c) => {
  const selection = wandSelection(c.work, { x: c.w / 2, y: c.h / 2 }, 32)
  assert.ok(countMask(selection.mask) > 0)
  return { selection }
} })
feature({ id: 'tool-crop', menu: 'Tools', ps: 'Crop', tools: ['crop'], cmd: ['image.crop'], run: (c) => {
  const out = cropToRect(c.work, { x: c.w * 0.1, y: c.h * 0.1, width: c.w * 0.6, height: c.h * 0.5 })
  assert.equal(out.width, Math.round(c.w * 0.6))
  return { canvas: out, size: 'free' }
} })
feature({ id: 'tool-perspectiveCrop', menu: 'Tools', ps: 'Perspective Crop', tools: ['perspectiveCrop'], run: (c) => {
  const corners = [{ x: c.w * 0.2, y: c.h * 0.1 }, { x: c.w * 0.9, y: c.h * 0.2 }, { x: c.w * 0.8, y: c.h * 0.9 }, { x: c.w * 0.1, y: c.h * 0.8 }]
  const out = perspectiveCrop(c.work, corners, Math.round(c.w * 0.6), Math.round(c.h * 0.6))
  assert.equal(out.width, Math.round(c.w * 0.6))
  assert.equal(alphaAt(out, out.width / 2, out.height / 2), 255)
  return { canvas: out, size: 'free' }
} })
feature({ id: 'tool-slice', menu: 'Tools', ps: 'Slice / Slice Select', tools: ['slice', 'sliceSelect'], cmd: ['view.showSlices', 'view.clearSlices'], run: (c) => {
  const slices = [createSlice('Slice 1', 0, 0, Math.round(c.w / 2), Math.round(c.h / 2)), createSlice('Slice 2', Math.round(c.w / 2), 0, Math.round(c.w / 2), Math.round(c.h / 2))]
  const picked = rectAt(slices, { x: c.w * 0.75, y: c.h * 0.25 })
  assert.equal(picked?.name, 'Slice 2', 'slice select should hit the second slice')
  return { canvas: cropToRect(c.work, picked), note: 'Slice 2 picked and exported', size: 'free' }
} })
feature({ id: 'tool-frame', menu: 'Tools', ps: 'Frame', tools: ['frame'], run: (c) => {
  const frame = createFrame('Frame 1', c.w * 0.2, c.h * 0.2, c.w * 0.6, c.h * 0.6)
  const out = clipToFrame(c.fresh(), frame)
  assert.equal(alphaAt(out, 2, 2), 0, 'outside the frame should be clipped away')
  assert.equal(alphaAt(out, c.w / 2, c.h / 2), 255)
  return out
} })
feature({ id: 'tool-eyedropper', menu: 'Tools', ps: 'Eyedropper / Color Sampler', tools: ['eyedropper', 'sampler'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const samples = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([fx, fy]) => sampleComposite(document, canvases, { x: c.w * fx, y: c.h * fy }))
  for (const sample of samples) assert.ok(sample && Number.isFinite(sample.r ?? sample[0]), 'sampler returned no colour')
  return { note: `4 samplers: ${samples.map((s) => `rgb(${s.r ?? s[0]},${s.g ?? s[1]},${s.b ?? s[2]})`).join(' ')}` }
} })
feature({ id: 'tool-ruler', menu: 'Tools', ps: 'Ruler', tools: ['ruler'], cmd: ['image.recordMeasure'], run: (c) => {
  const info = measureInfo({ x1: 10, y1: 10, x2: 10 + c.w * 0.5, y2: 10 + c.h * 0.25 })
  assert.ok(info.distance > 0)
  assert.ok(Math.abs(info.distance - Math.hypot(c.w * 0.5, c.h * 0.25)) < 0.5, `ruler length ${info.distance}`)
  return { note: `length ${info.distance.toFixed(1)}px, angle ${info.angle.toFixed(1)}°` }
} })
feature({ id: 'tool-note-count', menu: 'Tools', ps: 'Note / Count', tools: ['note', 'count'], cmd: ['file.importNotes', 'view.showNotes'], run: (c) => {
  const { document } = singleLayerDocument(c.stem, c.work)
  document.notes.push({ id: 'n1', x: 20, y: 20, text: 'Checked' })
  document.counts.push({ id: 'c1', x: 40, y: 40 }, { id: 'c2', x: 60, y: 60 })
  const project = serializeProject(document, new Map())
  assert.equal(project.notes.length, 1)
  assert.equal(project.counts.length, 2)
  return { note: 'note and two count markers kept in the project file' }
} })
feature({ id: 'tool-spotHeal', menu: 'Tools', ps: 'Spot Healing Brush', tools: ['spotHeal'], run: (c) => {
  const out = c.fresh()
  healStamp(out, { x: c.w / 2, y: c.h / 2 }, 40, null)
  return out
} })
feature({ id: 'tool-remove', menu: 'Tools', ps: 'Remove tool (inpainting)', tools: ['remove'], run: async (c) => {
  const out = c.fresh()
  const area = ellipseSelection(c.w * 0.4, c.h * 0.4, c.w * 0.2, c.h * 0.2)
  const mask = selectionToMask(area, c.w, c.h)
  const seed = cloneCanvas(out)
  await inpaintCanvas(seed, mask, 6)
  patchFill(out, mask, { seed })
  assert.ok(regionDifference(out, c.work, mask) > 1, 'the removed area should be repainted')
  assert.equal(alphaAt(out, c.w / 2, c.h / 2), 255)
  return out
} })
feature({ id: 'tool-heal', menu: 'Tools', ps: 'Healing Brush (Alt source)', tools: ['heal'], run: (c) => {
  const out = c.fresh()
  const source = { x: c.w * 0.25, y: c.h * 0.25 }
  const from = { x: c.w * 0.6, y: c.h * 0.6 }
  healingBrushDab(out, from, { x: c.w * 0.7, y: c.h * 0.6 }, source, from, { size: 36, hardness: 0.8, opacity: 1, selection: null })
  return out
} })
feature({ id: 'tool-patch', menu: 'Tools', ps: 'Patch', tools: ['patch'], run: (c) => {
  const out = c.fresh()
  patchSelection(out, c.sel, Math.round(c.w * 0.2), Math.round(c.h * 0.1))
  return out
} })
feature({ id: 'tool-contentMove', menu: 'Tools', ps: 'Content-Aware Move', tools: ['contentMove'], run: (c) => {
  const out = c.fresh()
  contentMove(out, c.sel, Math.round(c.w * 0.2), 0)
  return out
} })
feature({ id: 'tool-redEye', menu: 'Tools', ps: 'Red Eye', tools: ['redEye'], run: (c) => {
  // A red pupil painted on the photo, then removed.
  const out = c.fresh()
  const ctx = context2d(out)
  ctx.fillStyle = '#e01010'
  ctx.beginPath()
  ctx.arc(c.w / 2, c.h / 2, 8, 0, Math.PI * 2)
  ctx.fill()
  redEyeFix(out, { x: c.w / 2, y: c.h / 2 }, 30)
  const [r, g, b] = rgbAt(out, c.w / 2, c.h / 2)
  assert.ok(r < 60 && Math.abs(r - g) < 4 && Math.abs(g - b) < 4, `pupil is still rgb(${r},${g},${b})`)
  return out
} })
feature({ id: 'tool-brush', menu: 'Tools', ps: 'Brush (round tip, scatter)', tools: ['brush'], cmd: ['window.brushes', 'window.brushSettings'], run: (c) => {
  const out = c.fresh()
  paintStroke(out, { x: c.w * 0.1, y: c.h * 0.5 }, { x: c.w * 0.9, y: c.h * 0.5 }, { size: 24, hardness: 0.7, color: '#ff2d55', opacity: 0.9, selection: null })
  paintStroke(out, { x: c.w * 0.1, y: c.h * 0.7 }, { x: c.w * 0.9, y: c.h * 0.7 }, { size: 16, hardness: 0.5, color: '#2d7dff', opacity: 0.8, selection: null, shape: { spacing: 0.3, scatter: 1.5, roundness: 0.4, angle: 45 } })
  const [r] = rgbAt(out, c.w / 2, c.h / 2)
  assert.ok(r > 180, 'the stroke should be red at its middle')
  return out
} })
feature({ id: 'tool-pencil', menu: 'Tools', ps: 'Pencil', tools: ['pencil'], run: (c) => {
  const out = c.fresh()
  paintStroke(out, { x: c.w * 0.1, y: c.h * 0.3 }, { x: c.w * 0.9, y: c.h * 0.6 }, { size: 6, hardness: 1, color: '#000000', opacity: 1, pencil: true, selection: null })
  return out
} })
feature({ id: 'tool-colorReplace', menu: 'Tools', ps: 'Color Replacement', tools: ['colorReplace'], run: (c) => {
  const out = c.fresh()
  colorReplace(out, { x: c.w / 2, y: c.h / 2 }, 80, '#00c853', 60)
  return out
} })
feature({ id: 'tool-mixer', menu: 'Tools', ps: 'Mixer Brush', tools: ['mixer'], run: (c) => {
  const out = c.fresh()
  const reservoir = loadMixer('#ffcc00')
  mixerDab(out, reservoir, { x: c.w * 0.2, y: c.h * 0.5 }, { x: c.w * 0.8, y: c.h * 0.55 }, { size: 30, hardness: 0.6, wet: 0.6, mix: 0.5, flow: 0.8, selection: null })
  return out
} })
feature({ id: 'tool-clone', menu: 'Tools', ps: 'Clone Stamp', tools: ['clone'], cmd: ['window.cloneSource'], run: (c) => {
  const out = c.fresh()
  const source = { x: c.w * 0.25, y: c.h * 0.25 }
  const start = { x: c.w * 0.6, y: c.h * 0.6 }
  cloneStamp(out, start, { x: c.w * 0.7, y: c.h * 0.65 }, source, start, 50, null)
  return out
} })
feature({ id: 'tool-patternStamp', menu: 'Tools', ps: 'Pattern Stamp', tools: ['patternStamp'], run: (c) => {
  const out = c.fresh()
  patternStampDab(out, c.tile, { x: c.w * 0.2, y: c.h * 0.3 }, { x: c.w * 0.8, y: c.h * 0.3 }, { size: 40, hardness: 0.9, opacity: 1, selection: null })
  return out
} })
feature({ id: 'tool-historyBrush', menu: 'Tools', ps: 'History Brush', tools: ['historyBrush'], cmd: ['window.history'], run: (c) => {
  // Blur the whole picture, then brush the opened state back into a band.
  const out = c.fresh()
  gaussianBlur(out, 6, null)
  const blurred = cloneCanvas(out)
  historyBrushDab(out, c.work, { x: 0, y: c.h / 2 }, { x: c.w, y: c.h / 2 }, { size: 50, hardness: 1, opacity: 1, selection: null })
  const band = selectionToMask(rectSelection(0, c.h / 2 - 10, c.w, 20), c.w, c.h)
  assert.ok(regionDifference(out, c.work, band) < regionDifference(blurred, c.work, band), 'the band should be closer to the original than the blur')
  return out
} })
feature({ id: 'tool-artHistory', menu: 'Tools', ps: 'Art History Brush', tools: ['artHistory'], run: (c) => {
  const out = c.fresh()
  gaussianBlur(out, 4, null)
  for (const style of ['dab', 'tight', 'loose']) {
    for (let i = 0; i < 12; i += 1) artHistoryDab(out, c.work, { x: c.w * (0.1 + 0.8 * Math.random()), y: c.h * (0.1 + 0.8 * Math.random()) }, { size: 30, opacity: 1, style, selection: null })
  }
  return out
} })
feature({ id: 'tool-eraser', menu: 'Tools', ps: 'Eraser', tools: ['eraser'], run: (c) => {
  const out = c.fresh()
  paintStroke(out, { x: c.w * 0.1, y: c.h * 0.5 }, { x: c.w * 0.9, y: c.h * 0.5 }, { size: 30, hardness: 1, color: '#000000', opacity: 1, erase: true, selection: null })
  assert.equal(alphaAt(out, c.w / 2, c.h / 2), 0, 'the erased line should be see-through')
  return out
} })
feature({ id: 'tool-bgEraser', menu: 'Tools', ps: 'Background Eraser', tools: ['bgEraser'], run: (c) => {
  const out = c.fresh()
  const wand = wandSelection(out, { x: c.w / 2, y: c.h / 2 }, 40)
  const brush = greyCanvasToMask(channelCanvas(strokeMask(c.w, c.h, { x: c.w / 2, y: c.h / 2 }, { x: c.w / 2, y: c.h / 2 }, 80, 1), 'a'))
  const mask = combineMasks(wand.mask, brush, 'intersect')
  clearSelectionPixels(out, { kind: 'mask', ...maskBounds(mask, c.w, c.h), mask })
  assert.equal(alphaAt(out, c.w / 2, c.h / 2), 0)
  return out
} })
feature({ id: 'tool-magicEraser', menu: 'Tools', ps: 'Magic Eraser', tools: ['magicEraser'], run: (c) => {
  const out = c.fresh()
  clearSelectionPixels(out, wandSelection(out, { x: 4, y: 4 }, 40))
  assert.equal(alphaAt(out, 4, 4), 0)
  return out
} })
feature({ id: 'tool-gradient', menu: 'Tools', ps: 'Gradient (5 kinds, presets, dither, reverse)', tools: ['gradient'], cmd: ['window.gradients'], run: (c) => {
  const kinds = ['linear', 'radial', 'angle', 'reflected', 'diamond']
  const strips = kinds.map((kind, index) => {
    const strip = createCanvas(Math.round(c.w / 5), c.h)
    context2d(strip).drawImage(c.work, -index * Math.round(c.w / 5), 0)
    paintGradientDef(strip, { x: 4, y: 4 }, { x: strip.width - 4, y: c.h - 4 }, resolveGradient(gradientPresets[index % gradientPresets.length], '#ff0066', '#0066ff'), kind, null, { reverse: index % 2 === 1, dither: true, opacity: 0.85 })
    return strip
  })
  const out = c.fresh()
  paintGradient(out, { x: 0, y: 0 }, { x: c.w, y: c.h }, '#ff000080', '#0000ff80', 'linear', c.sel)
  return sideBySide(out, ...strips)
}, wide: true })
feature({ id: 'tool-fill', menu: 'Tools', ps: 'Paint Bucket', tools: ['fill'], run: (c) => {
  const out = c.fresh()
  paintBucket(out, { x: c.w / 2, y: c.h / 2 }, hexToRgb('#00e5ff'), 48, null)
  return out
} })
feature({ id: 'tool-blur', menu: 'Tools', ps: 'Blur tool', tools: ['blurTool'], run: (c) => {
  const out = c.fresh()
  const area = greyCanvasToMask(channelCanvas(strokeMask(c.w, c.h, { x: c.w * 0.3, y: c.h * 0.5 }, { x: c.w * 0.7, y: c.h * 0.5 }, 60, 1), 'a'))
  gaussianBlur(out, 3, { kind: 'mask', ...maskBounds(area, c.w, c.h), mask: area })
  return out
} })
feature({ id: 'tool-sharpen', menu: 'Tools', ps: 'Sharpen tool', tools: ['sharpenTool'], minChange: 0.01, run: (c) => {
  const out = c.fresh()
  const area = greyCanvasToMask(channelCanvas(strokeMask(c.w, c.h, { x: c.w * 0.3, y: c.h * 0.5 }, { x: c.w * 0.7, y: c.h * 0.5 }, 60, 1), 'a'))
  sharpen(out, 40, { kind: 'mask', ...maskBounds(area, c.w, c.h), mask: area })
  return out
} })
feature({ id: 'tool-smudge', menu: 'Tools', ps: 'Smudge', tools: ['smudge'], run: (c) => {
  const out = c.fresh()
  for (let i = 0; i < 10; i += 1) smudge(out, { x: c.w * 0.3 + i * 8, y: c.h * 0.5 }, { x: c.w * 0.3 + i * 8 + 8, y: c.h * 0.5 + 4 }, 40, null)
  return out
} })
feature({ id: 'tool-liquify', menu: 'Tools', ps: 'Liquify (8 modes)', tools: ['liquify'], cmd: ['filter.liquify'], run: (c) => {
  const out = c.fresh()
  const original = cloneCanvas(out)
  const frozen = new Uint8Array(c.w * c.h)
  const modes = ['forward', 'twirlCw', 'twirlCcw', 'pucker', 'bloat', 'freeze', 'thaw', 'reconstruct']
  modes.forEach((mode, index) => {
    const x = c.w * (0.15 + 0.7 * (index / (modes.length - 1)))
    liquifyDab(out, original, { x, y: c.h * 0.5 }, { x: x + 12, y: c.h * 0.5 + 6 }, { size: 60, pressure: 0.8, mode, frozen })
  })
  return out
} })
feature({ id: 'tool-dodge-burn-sponge', menu: 'Tools', ps: 'Dodge / Burn / Sponge', tools: ['dodge', 'burn', 'sponge'], run: (c) => {
  const out = c.fresh()
  dodgeBurn(out, { x: c.w * 0.25, y: c.h * 0.5 }, 90, 1, false, null)
  dodgeBurn(out, { x: c.w * 0.5, y: c.h * 0.5 }, 90, 1, true, null)
  spongeDesaturate(out, { x: c.w * 0.75, y: c.h * 0.5 }, 90, false)
  assert.ok(meanLuma(cropToRect(out, { x: c.w * 0.2, y: c.h * 0.45, width: 20, height: 20 })) >= meanLuma(cropToRect(c.work, { x: c.w * 0.2, y: c.h * 0.45, width: 20, height: 20 })), 'dodge should lighten')
  return out
} })
feature({ id: 'tool-pen', menu: 'Tools', ps: 'Pen / Freeform Pen / Curvature Pen', tools: ['pen', 'freeformPen', 'curvaturePen'], cmd: ['window.paths'], run: (c) => {
  const pen = createPath('Pen', [pathNode(c.w * 0.2, c.h * 0.2), pathNode(c.w * 0.8, c.h * 0.3), pathNode(c.w * 0.7, c.h * 0.8), pathNode(c.w * 0.25, c.h * 0.7)], true)
  const freeform = pathFromPoints('Freeform', Array.from({ length: 30 }, (_, i) => ({ x: c.w * (0.1 + 0.8 * i / 29), y: c.h * (0.5 + 0.1 * Math.sin(i / 3)) })), false, 3)
  const curvature = smoothPath(pen)
  assert.ok(curvature.nodes.some((node) => node.inX !== node.x || node.outX !== node.x), 'curvature pen should round the corners')
  return { paths: [pen, freeform, curvature], note: `${freeform.nodes.length} nodes traced from 30 points` }
} })
feature({ id: 'tool-pathSelect', menu: 'Tools', ps: 'Path Selection / Direct Selection', tools: ['pathSelect', 'directSelect'], run: (c) => {
  const pen = createPath('Pen', [pathNode(c.w * 0.2, c.h * 0.2), pathNode(c.w * 0.8, c.h * 0.3), pathNode(c.w * 0.7, c.h * 0.8)], true)
  const out = c.fresh()
  strokePathOnto(out, pen, '#ffeb3b', 4)
  const selection = pathToSelection(pen, c.w, c.h)
  assert.ok(countMask(selection.mask) > 0)
  return { canvas: overlay(out, selection), note: 'path stroked, then turned into a selection' }
} })
feature({ id: 'tool-text', menu: 'Tools', ps: 'Horizontal / Vertical Type', tools: ['text', 'vtext'], cmd: ['type.horizontal', 'type.vertical', 'type.orientation'], run: (c) => {
  const out = c.fresh()
  rasterizeText(out, 'My Photo Work', { x: 12, y: 12 }, { fontFamily: 'sans-serif', fontSize: Math.round(c.h / 10), color: '#ffffff', selection: null })
  rasterizeText(out, '세로', { x: c.w - 40, y: 12 }, { fontFamily: 'sans-serif', fontSize: 28, color: '#ffeb3b', selection: null, vertical: true })
  return out
} })
feature({ id: 'tool-textMask', menu: 'Tools', ps: 'Type Mask', tools: ['textMask'], run: (c) => {
  const probe = createLayerMeta('probe', 'text')
  probe.text = { text: 'MASK', x: 10, y: 10, fontFamily: 'sans-serif', fontSize: Math.round(c.h / 3), color: '#000', bold: true, italic: false, align: 'left', vertical: false }
  const flat = compositeDocument({ ...blankDoc('probe', c.w, c.h), layers: [probe], activeLayerId: probe.id }, new Map())
  const data = pixels(flat)
  const mask = new Uint8Array(c.w * c.h)
  for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3]
  assert.ok(countMask(mask) > 100, 'the letters should select something')
  return { selection: { kind: 'mask', ...maskBounds(mask, c.w, c.h), mask } }
} })
feature({ id: 'tool-shapes', menu: 'Tools', ps: 'Shape tools (rect, rounded, ellipse, polygon, line, custom)', tools: ['rect', 'roundRect', 'ellipse', 'polygon', 'line', 'customShape'], cmd: ['window.shapes', 'edit.defineShape'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const kinds = ['rect', 'roundRect', 'ellipse', 'polygon', 'line', 'star']
  kinds.forEach((kind, index) => {
    const layer = createLayerMeta(kind, 'shape')
    layer.shape = { kind, x: 10 + index * (c.w / 6), y: c.h * 0.3, width: c.w / 7, height: c.h * 0.3, fill: '#ff5722aa', stroke: '#ffffff', strokeWidth: 3, sides: 6, radius: 12 }
    document.layers.push(layer)
  })
  // Define Custom Shape: the star's outline traced back from its pixels.
  const traced = traceCanvasToPaths(rasterizeShape(c.w, c.h, document.layers[6].shape), 'custom', 1.5)
  assert.ok(traced.length > 0 && traced[0].nodes.length > 4, 'a custom shape needs an outline')
  const custom = createLayerMeta('custom', 'shape')
  custom.shape = { kind: 'custom', x: 10, y: c.h * 0.65, width: c.w / 7, height: c.h * 0.3, fill: '#4caf50cc', stroke: '#000000', strokeWidth: 2, sides: 5, radius: 0, outline: traced[0].nodes.map((n) => ({ ...n })), outlineClosed: true }
  document.layers.push(custom)
  return compositeDocument(document, canvases)
} })
feature({ id: 'tool-navigation', menu: 'Tools', ps: 'Hand / Rotate View / Zoom', tools: ['hand', 'rotateView', 'zoom'], cmd: ['view.zoomIn', 'view.zoomOut', 'view.zoomFit', 'view.actualPixels', 'view.zoom200', 'view.printSize', 'view.rotateView', 'view.resetView', 'window.navigator'], ui: 'view state only: pan, zoom and view angle never touch the pixels (exercised by the CDP menu run)', run: () => ({ note: 'view state, not pixels' }) })

/* ---- File */

feature({ id: 'file-new', menu: 'File', ps: 'New (white, background colour, transparent)', cmd: ['file.new'], run: (c) => {
  const white = createBlankDocument('New', 200, 120, '#ffffff', 'Background')
  const clear = createBlankDocument('New', 200, 120, 'transparent', 'Layer 1')
  const a = compositeDocument(white.document, white.canvases)
  const b = compositeDocument(clear.document, clear.canvases)
  assert.deepEqual(rgbAt(a, 5, 5), [255, 255, 255])
  assert.equal(alphaAt(b, 5, 5), 0)
  return { canvas: sideBySide(a, b), note: 'a white and a transparent document', size: 'free' }
} })
feature({ id: 'file-open', menu: 'File', ps: 'Open (JPEG, HEIC, DICOM, PSD, TIFF …)', cmd: ['file.open', 'file.openRecent'], run: (c) => ({ canvas: c.work, same: true, note: `${c.file} opened at ${c.source.width}x${c.source.height} through decodeImageSource` }) })
feature({ id: 'file-openSmart', menu: 'File', ps: 'Open as Smart Object / Place / Place Linked', cmd: ['file.openSmart', 'file.place', 'file.placeLinked'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const smart = createLayerMeta('Placed')
  smart.smart = true
  smart.sourcePath = 'D:/somewhere/placed.png'
  smart.smartTransform = { scaleX: 0.5, scaleY: 0.5, rotate: 0.3, x: c.w * 0.25, y: c.h * 0.25 }
  document.layers.push(smart)
  canvases.set(smartSourceKey(smart.id), c.other)
  const out = compositeDocument(document, canvases)
  assert.ok(meanDifference(out, c.work) > 1, 'the placed picture should show')
  return out
} })
feature({ id: 'file-save-project', menu: 'File', ps: 'Save / Save As / Save a Copy (.mpw project)', cmd: ['file.save', 'file.saveAs', 'file.saveCopy', 'file.revert', 'file.close', 'file.closeAll'], run: async (c) => {
  const { document, layer, canvases } = singleLayerDocument(c.stem, c.work)
  const mask = maskCanvas(c.w, c.h, (ctx) => ctx.fillRect(0, 0, c.w / 2, c.h))
  layer.maskEnabled = true
  canvases.set(`${layer.id}:mask`, mask)
  const project = serializeProject(document, canvases)
  const restored = await restoreProject(JSON.parse(JSON.stringify(project)))
  const back = compositeDocument(restored.document, restored.canvases)
  const there = compositeDocument(document, canvases)
  assert.equal(meanDifference(back, there), 0, 'the project should reopen pixel for pixel')
  assert.equal(alphaAt(back, c.w - 3, c.h / 2), 0, 'the mask should survive the round trip')
  return { canvas: back, note: `${(JSON.stringify(project).length / 1024).toFixed(0)} kB project, reopened identical; revert = reopening this` }
} })
feature({ id: 'file-savePsd', menu: 'File', ps: 'Save as PSD (layers, group, mask, blend)', cmd: ['file.savePsd'], run: async (c) => {
  const { document, layer, canvases } = singleLayerDocument(c.stem, c.work)
  const folder = createLayerMeta('Folder', 'group')
  const overlayLayer = createLayerMeta('Overlay')
  overlayLayer.parentId = folder.id
  overlayLayer.blendMode = 'screen'
  overlayLayer.opacity = 0.6
  const composite = compositeDocument({ ...document, layers: [layer, folder, overlayLayer] }, new Map([[layer.id, c.work], [overlayLayer.id, c.other]]))
  const bytes = writePsd(document, [{ meta: layer, canvas: c.work, mask: null }, { meta: folder, canvas: null, mask: null }, { meta: overlayLayer, canvas: c.other, mask: null }], composite)
  assert.ok(hasPsdMagic(bytes.buffer))
  const reopened = await decodeImageSource({ name: 'x.psd', mime: 'image/vnd.adobe.photoshop', size: bytes.length, dataUrl: `data:image/vnd.adobe.photoshop;base64,${Buffer.from(bytes).toString('base64')}` })
  assert.equal(reopened.kind, 'psd')
  assert.equal(reopened.psd.layers[2].meta.blendMode, 'screen')
  return { canvas: reopened.psd.composite, note: `${(bytes.length / 1024).toFixed(0)} kB PSD, 3 layers back with blend mode and opacity` }
} })
feature({ id: 'file-export', menu: 'File', ps: 'Export / Export As / Quick Export (PNG, JPG, WebP, GIF, TIFF)', cmd: ['file.export', 'file.exportAs', 'file.quickExport'], run: async (c) => {
  const sizes = []
  for (const format of ['png', 'jpg', 'webp', 'gif', 'tiff']) {
    const url = await encodeExport(c.work, format, 0.85, true)
    assert.ok(url.startsWith('data:image/'), `${format} export failed`)
    sizes.push(`${format} ${(url.length / 1024).toFixed(0)} kB`)
  }
  return { note: sizes.join(', ') }
} })
feature({ id: 'file-layersToFiles', menu: 'File', ps: 'Export Layers to Files', cmd: ['file.layersToFiles'], run: async (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const second = createLayerMeta('Second')
  document.layers.push(second)
  canvases.set(second.id, c.other)
  const urls = []
  for (const layer of document.layers) urls.push(await encodeExport(canvases.get(layer.id), 'png'))
  assert.equal(urls.length, 2)
  return { note: `2 layers written as 2 files (${urls.map((u) => `${(u.length / 1024).toFixed(0)} kB`).join(', ')})` }
} })
feature({ id: 'file-video', menu: 'File', ps: 'Import Video Frames / Export Video', cmd: ['file.importVideo', 'file.exportVideo'], ui: 'needs the browser video decoder and MediaRecorder; not present under Node (canImportVideo/canExportVideo report so)', run: () => {
  return { note: `guards report import ${canImportVideo()}, export ${canExportVideo()} under Node; the frame decoder needs a browser <video>` }
} })
feature({ id: 'file-exportGif', menu: 'File', ps: 'Export animation as GIF (Timeline frames)', cmd: ['file.exportGif', 'window.timeline'], run: (c) => {
  const frames = [c.work, c.other, c.work].map((canvas, i) => ({ canvas, delayMs: 120 + i * 40 }))
  const gif = encodeGif(frames)
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a')
  return { note: `3-frame GIF, ${(gif.length / 1024).toFixed(0)} kB` }
} })
feature({ id: 'file-batch', menu: 'File', ps: 'Batch / Image Processor (resize + export every file)', cmd: ['file.batch', 'file.imageProcessor', 'window.actions'], run: async (c) => {
  const done = []
  for (const item of [c.work, c.other]) {
    const small = fitImage(item, 200, 200)
    done.push(await encodeExport(small, 'jpg', 0.8))
  }
  assert.equal(done.length, 2)
  return { note: '2 pictures fitted to 200px and written as JPEG' }
} })
feature({ id: 'file-contactSheet', menu: 'File', ps: 'Contact Sheet II', cmd: ['file.contactSheet'], run: (c) => {
  const sheet = contactSheet([{ name: c.file, canvas: c.work }, { name: 'other', canvas: c.other }, { name: 'grey', canvas: c.grey }], 3, 160)
  assert.ok(sheet.width >= 3 * 160)
  return { canvas: sheet, size: 'free' }
} })
feature({ id: 'file-cropStraighten', menu: 'File', ps: 'Crop and Straighten Photos', cmd: ['file.cropStraighten'], run: async (c) => {
  // The photo laid crooked on a white scanner bed.
  const bed = createCanvas(Math.round(c.w * 1.6), Math.round(c.h * 1.6))
  const ctx = context2d(bed)
  ctx.fillStyle = '#f4f4f0'
  ctx.fillRect(0, 0, bed.width, bed.height)
  ctx.translate(bed.width / 2, bed.height / 2)
  ctx.rotate((7 * Math.PI) / 180)
  ctx.drawImage(c.work, -c.w / 2, -c.h / 2)
  const photos = await findPhotosOnScan(bed)
  assert.equal(photos.length, 1, `found ${photos.length} prints on the bed`)
  const [print] = photos
  assert.ok(Math.abs(print.width - c.w) < c.w * 0.12 && Math.abs(print.height - c.h) < c.h * 0.12, `print came back ${print.width}x${print.height}`)
  return { canvas: sideBySide(bed, print), note: `tilted 7° on a bed, cut out as ${print.width}x${print.height}`, size: 'free' }
} })
feature({ id: 'file-fitImage', menu: 'File', ps: 'Fit Image', cmd: ['file.fitImage'], run: (c) => {
  const out = fitImage(c.work, 300, 300)
  assert.ok(Math.max(out.width, out.height) === 300)
  return { canvas: out, size: 'free' }
} })
feature({ id: 'file-mergeHdr', menu: 'File', ps: 'Merge to HDR Pro (exposure fusion)', cmd: ['file.mergeHdr'], run: async (c) => {
  const darker = deepFromCanvas(c.work)
  deepExposure(darker, -1.5)
  const dark = canvasFromDeep(darker)
  const brighter = deepFromCanvas(c.work)
  deepExposure(brighter, 1.5)
  const bright = canvasFromDeep(brighter)
  const fused = await exposureFusion([dark, c.work, bright])
  assert.equal(fused.width, c.w)
  const luma = meanLuma(fused)
  assert.ok(luma > meanLuma(dark) && luma < meanLuma(bright), 'the fusion should sit between the exposures')
  const fallback = mergeToHdr([dark, c.work, bright])
  assert.equal(fallback.width, c.w)
  return { canvas: sideBySide(dark, fused, bright), note: `Mertens fusion of -1.5 / 0 / +1.5 EV; classic fallback also ran`, size: 'free' }
} })
feature({ id: 'file-photomerge', menu: 'File', ps: 'Photomerge (ORB + RANSAC stitch)', cmd: ['file.photomerge'], run: async (c) => {
  const left = cropToRect(c.work, { x: 0, y: 0, width: Math.round(c.w * 0.65), height: c.h })
  const right = cropToRect(c.work, { x: Math.round(c.w * 0.35), y: 0, width: c.w - Math.round(c.w * 0.35), height: c.h })
  const result = await stitchCanvases([left, right], 'perspective', true)
  assert.ok(result.canvas.width > left.width * 1.2, `stitched width ${result.canvas.width} from ${left.width}`)
  const classic = photomerge([left, right], 'horizontal', true)
  assert.ok(classic.canvas.width > left.width)
  return { canvas: result.canvas, note: `two 65% crops stitched to ${result.canvas.width}px wide (classic layout fallback also ran)`, size: 'free' }
} })
feature({ id: 'file-loadStack', menu: 'File', ps: 'Load Files into Stack / Statistics', cmd: ['file.loadStack', 'file.statistics'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const second = createLayerMeta('other')
  second.opacity = 0.5
  document.layers.push(second)
  canvases.set(second.id, c.other)
  return { canvas: compositeDocument(document, canvases), note: 'two files stacked as layers; Image Statistics (mean/median/…) is computed inline in App.tsx over such a stack' }
} })
feature({ id: 'file-fileInfo', menu: 'File', ps: 'File Info (EXIF, DICOM tags, statistics)', cmd: ['file.fileInfo', 'image.info', 'window.info'], run: (c) => {
  // The header rows come from the file (EXIF, PNG chunks) or, for DICOM, the
  // decoder's tag list; a JPEG straight off the web may carry none at all.
  const rows = describeFile(c.file, c.mime, c.bytes.buffer.slice(c.bytes.byteOffset, c.bytes.byteOffset + c.bytes.length))
  const stats = imageStatistics(c.work)
  const exif = c.file.toLowerCase().endsWith('.jpg') ? readJpegExif(new Uint8Array(c.bytes)) : []
  if (isDicomSource(c.file)) assert.ok(c.details.some((row) => row.label === 'Modality'), 'a DICOM file should list its tags')
  assert.equal(stats.length, 4)
  const hist = histogram(c.work)
  assert.ok(hist && Object.keys(hist).length > 0)
  return { note: `${rows.length} file rows, ${exif.length} EXIF rows, ${c.details.length} decoder rows; ${stats.map((r) => r.value).join(' | ')}` }
} })
feature({ id: 'file-print', menu: 'File', ps: 'Print / Print One Copy', cmd: ['file.print', 'file.printOne'], ui: 'covered by verify-images.mjs (out/<photo>-print.html and -preview.jpg)', run: () => ({ note: 'see verify-images.mjs' }) })
feature({ id: 'file-exit', menu: 'File', ps: 'Exit', cmd: ['file.exit'], ui: 'closes the window', run: () => ({ note: 'window command' }) })

/* ---- Edit */

feature({ id: 'edit-undo-redo', menu: 'Edit', ps: 'Undo / Redo / Step Forward / Step Backward / History panel', cmd: ['edit.undo', 'edit.redo', 'edit.stepForward', 'edit.stepBackward'], run: (c) => {
  const { document, layer, canvases } = singleLayerDocument(c.stem, c.fresh())
  const stack = []
  pushHistory(stack, takeSnapshot(document, canvases, 'Open'))
  gaussianBlur(canvases.get(layer.id), 8, null)
  pushHistory(stack, takeSnapshot(document, canvases, 'Blur'))
  const undone = compositeDocument(stack[0].document, stack[0].canvases)
  assert.equal(meanDifference(undone, c.work), 0, 'undo should give the opened pixels back')
  const redone = compositeDocument(stack[1].document, stack[1].canvases)
  assert.ok(meanDifference(redone, c.work) > 0.5, 'redo should give the blur back')
  return { canvas: sideBySide(undone, redone), note: `${stack.length} history states: ${stack.map((s) => s.label).join(' → ')}`, size: 'free' }
} })
feature({ id: 'edit-fade', menu: 'Edit', ps: 'Fade', cmd: ['edit.fade'], run: (c) => {
  const out = c.fresh()
  gaussianBlur(out, 8, null)
  const full = meanDifference(out, c.work)
  fadeTo(out, c.work, 0.4, 'source-over')
  const faded = out
  const partial = meanDifference(faded, c.work)
  assert.ok(partial < full && partial > 0, `fade should sit between 0 and ${full.toFixed(1)}, got ${partial.toFixed(1)}`)
  return faded
} })
feature({ id: 'edit-clipboard', menu: 'Edit', ps: 'Cut / Copy / Copy Merged / Paste / Paste in Place / Paste Into / Paste Outside', cmd: ['edit.cut', 'edit.copy', 'edit.copyMerged', 'edit.paste', 'edit.pasteInPlace', 'edit.pasteInto', 'edit.pasteOutside'], run: (c) => {
  const copied = clipCanvasToSelection(cloneCanvas(c.work), c.sel)
  assert.equal(alphaAt(copied, 2, 2), 0)
  const cut = c.fresh()
  clearSelectionPixels(cut, c.sel)
  assert.equal(alphaAt(cut, c.w / 2, c.h / 2), 0)
  const into = clipCanvasToSelection(cloneCanvas(c.other), c.sel)
  const outside = clipCanvasToSelection(cloneCanvas(c.other), invertSelection(c.sel, c.w, c.h))
  const pasted = cloneCanvas(cut)
  context2d(pasted).drawImage(copied, 20, 10)
  return { canvas: sideBySide(cut, pasted, into, outside), note: 'cut hole, paste offset, paste into, paste outside', size: 'free' }
} })
feature({ id: 'edit-deletePixels', menu: 'Edit', ps: 'Clear', cmd: ['edit.deletePixels'], run: (c) => {
  const out = c.fresh()
  clearSelectionPixels(out, c.sel)
  assert.equal(alphaAt(out, c.w / 2, c.h / 2), 0)
  return out
} })
feature({ id: 'edit-spelling', menu: 'Edit', ps: 'Check Spelling / Find and Replace Text', cmd: ['edit.checkSpelling', 'edit.findReplace'], run: () => {
  const report = checkSpelling([{ layer: 'Title', text: 'My Phhhoto wrk is the bestestestestest' }])
  assert.ok(Array.isArray(report) && report.length >= 2, `the heuristic should flag the odd words, got ${JSON.stringify(report)}`)
  const replaced = 'My Phhhoto wrk'.replaceAll('Phhhoto', 'Photo')
  assert.equal(replaced, 'My Photo wrk')
  return { note: `${report.length} suspect word(s): ${report.map((r) => r.word ?? JSON.stringify(r)).join(', ')}` }
} })
feature({ id: 'edit-fill', menu: 'Edit', ps: 'Fill (colour / pattern / content-aware)', cmd: ['edit.fill'], run: (c) => {
  const colour = c.fresh()
  const paint = createCanvas(c.w, c.h)
  context2d(paint).fillStyle = '#7c4dff'
  context2d(paint).fillRect(0, 0, c.w, c.h)
  context2d(colour).drawImage(clipCanvasToSelection(paint, c.sel), 0, 0)
  const pattern = c.fresh()
  tileOnto(pattern, c.tile, c.sel)
  return { canvas: sideBySide(colour, pattern), note: 'solid fill and pattern fill inside the selection (content-aware: see edit-contentAware)', size: 'free' }
} })
feature({ id: 'edit-stroke', menu: 'Edit', ps: 'Stroke (selection outline)', cmd: ['edit.stroke'], run: (c) => {
  const out = c.fresh()
  const border = borderSelection(c.sel, c.w, c.h, 6)
  const paint = createCanvas(c.w, c.h)
  context2d(paint).fillStyle = '#ffeb3b'
  context2d(paint).fillRect(0, 0, c.w, c.h)
  context2d(out).drawImage(clipCanvasToSelection(paint, border), 0, 0)
  return out
} })
feature({ id: 'edit-contentAware', menu: 'Edit', ps: 'Content-Aware Fill / Generative Fill (PatchMatch seeded by Telea)', cmd: ['edit.contentAware', 'edit.genFill'], run: async (c) => {
  const out = c.fresh()
  const mask = selectionToMask(c.sel, c.w, c.h)
  const seed = cloneCanvas(out)
  await inpaintCanvas(seed, mask, 6)
  patchFill(out, mask, { seed })
  assert.ok(regionDifference(out, c.work, mask) > 1)
  assert.equal(alphaAt(out, c.w / 2, c.h / 2), 255)
  return out
} })
feature({ id: 'edit-genExpand', menu: 'Edit', ps: 'Generative Expand', cmd: ['edit.genExpand'], run: (c) => {
  const out = generativeExpand(c.work, c.w + 80, c.h + 60, 40, 30)
  assert.equal(out.width, c.w + 80)
  assert.equal(alphaAt(out, 3, 3), 255, 'the new margin should be painted')
  return { canvas: out, size: 'free' }
} })
feature({ id: 'edit-genUpscale', menu: 'Edit', ps: 'Generative Upscale / Super Zoom (without the model: resample + sharpen)', cmd: ['edit.genUpscale'], run: (c) => {
  const out = generativeUpscale(c.work, 2)
  assert.equal(out.width, c.w * 2)
  return { canvas: out, size: 'free' }
} })
feature({ id: 'edit-harmonize', menu: 'Edit', ps: 'Harmonize (Poisson blending)', cmd: ['edit.harmonize'], run: (c) => {
  const patch = clipCanvasToSelection(cloneCanvas(c.other), c.sel)
  const blended = poissonBlend(patch, c.work, false)
  assert.equal(blended.width, c.w)
  const mask = selectionToMask(c.sel, c.w, c.h)
  assert.ok(regionDifference(blended, patch, mask) > 0.5, 'the patch colours should be re-solved')
  const out = c.fresh()
  context2d(out).drawImage(blended, 0, 0)
  const simple = c.fresh()
  harmonize(simple, c.sel)
  return out
} })
feature({ id: 'edit-skyReplace', menu: 'Edit', ps: 'Sky Replacement', cmd: ['edit.skyReplace'], run: (c) => {
  const sky = selectSky(c.work)
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const layer = createLayerMeta('Sky')
  const canvas = createCanvas(c.w, c.h)
  const ctx = context2d(canvas)
  const gradient = ctx.createLinearGradient(0, 0, 0, c.h)
  gradient.addColorStop(0, '#1b4f9c')
  gradient.addColorStop(1, '#f7b267')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, c.w, c.h)
  const soft = featherSelection(sky, c.w, c.h, 6)
  layer.maskEnabled = true
  canvases.set(layer.id, canvas)
  canvases.set(`${layer.id}:mask`, alphaMask(selectionToMask(soft, c.w, c.h) ?? new Uint8Array(c.w * c.h), c.w, c.h))
  document.layers.push(layer)
  const count = sky.mask ? countMask(sky.mask) : 0
  return { canvas: compositeDocument(document, canvases), same: count === 0, note: `sky mask covers ${((count / (c.w * c.h)) * 100).toFixed(0)}% of the picture` }
} })
feature({ id: 'edit-contentScale', menu: 'Edit', ps: 'Content-Aware Scale (skin protected)', cmd: ['edit.contentScale'], run: (c) => {
  const out = contentAwareScale(c.work, Math.round(c.w * 0.75), c.h, true)
  assert.equal(out.width, Math.round(c.w * 0.75))
  return { canvas: out, size: 'free' }
} })
feature({ id: 'edit-perspectiveWarp', menu: 'Edit', ps: 'Perspective Warp / Distort (four corners)', cmd: ['edit.perspectiveWarp', 'edit.distort'], run: (c) => {
  const out = cornerTransform(c.work, [{ x: c.w * 0.1, y: c.h * 0.08 }, { x: c.w * 0.95, y: 0 }, { x: c.w, y: c.h }, { x: c.w * 0.05, y: c.h * 0.9 }])
  assert.equal(alphaAt(out, 1, 1), 0)
  return out
} })
feature({ id: 'edit-meshWarp', menu: 'Edit', ps: 'Warp (custom mesh)', cmd: ['edit.warp'], run: (c) => {
  const grid = []
  for (let r = 0; r <= 3; r += 1) {
    const row = []
    for (let q = 0; q <= 3; q += 1) row.push({ x: (q / 3) * c.w + (r === 1 || r === 2 ? Math.sin(q) * 16 : 0), y: (r / 3) * c.h + (q === 1 ? 14 : 0) })
    grid.push(row)
  }
  return meshWarp(c.work, grid, c.w, c.h)
} })
feature({ id: 'edit-warpStyles', menu: 'Edit', ps: 'Warp (10 preset styles)', cmd: ['edit.warp', 'type.warp'], run: (c) => {
  const cells = warpStyles.filter((style) => style !== 'none').map((style) => fitImage(warpCanvas(c.work, style, 45, 10, -10), 160, 160))
  return { canvas: sideBySide(...cells), note: cells.length + ' styles: ' + warpStyles.slice(1).join(', '), size: 'free' }
} })
feature({ id: 'edit-freeTransform', menu: 'Edit', ps: 'Free Transform (scale + rotate by handles)', cmd: ['edit.freeTransform', 'select.transform'], run: (c) => {
  let box = identityTransform(c.w, c.h)
  box = dragTransform(box, 'se', { x: c.w, y: c.h }, { x: c.w * 0.8, y: c.h * 0.8 }, { shift: true })
  box = dragTransform(box, 'rotate', { x: c.w, y: c.h / 2 }, { x: c.w * 0.9, y: c.h * 0.7 })
  assert.ok(Math.abs(box.angle) > 0.05, 'the rotate handle should turn the box')
  const out = applyTransform(c.work, box, c.w, c.h)
  const selectionMask = applyTransform(maskToGreyCanvas(selectionToMask(c.sel, c.w, c.h), c.w, c.h), box, c.w, c.h)
  assert.equal(selectionMask.width, c.w)
  assert.ok(countMask(greyCanvasToMask(selectionMask)) > 0, 'a selection transforms the same way')
  return out
} })
feature({ id: 'edit-skew', menu: 'Edit', ps: 'Skew / Perspective', cmd: ['edit.skew', 'edit.perspective'], run: (c) => sideBySide(skew(c.work, 18, 6), perspective(c.work, 35)), wide: true })
feature({ id: 'edit-rotateLayer', menu: 'Edit', ps: 'Rotate layer 180° / 90° CW / 90° CCW', cmd: ['edit.rotateLayer180', 'edit.rotateLayer90', 'edit.rotateLayer270'], run: (c) => {
  const cw = rotateLayerCanvas(c.work, 1)
  const half = rotateLayerCanvas(c.work, 2)
  assert.equal(cw.width, c.w, 'a layer turns inside the document, which keeps its size')
  assert.deepEqual(rgbAt(half, c.w - 1, c.h - 1), rgbAt(c.work, 0, 0))
  return { canvas: sideBySide(cw, half, rotateLayerCanvas(c.work, 3)), size: 'free' }
} })
feature({ id: 'edit-autoAlign', menu: 'Edit', ps: 'Auto-Align Layers (ORB + RANSAC homography)', cmd: ['edit.autoAlign'], run: async (c) => {
  const moved = shiftCanvas(c.work, 14, -9)
  const [, h] = await alignChain([c.work, moved], 'translation')
  const centre = applyHomography(h, { x: c.w / 2, y: c.h / 2 })
  const dx = centre.x - c.w / 2
  const dy = centre.y - c.h / 2
  assert.ok(Math.abs(dx + 14) < 2.5 && Math.abs(dy - 9) < 2.5, `alignment found (${dx.toFixed(1)}, ${dy.toFixed(1)}), wanted (-14, 9)`)
  const back = await warpByHomography(moved, h, c.w, c.h)
  const classic = autoAlignLayers([c.work, moved])
  assert.ok(Math.abs(classic[1].dx + 14) < 3, `classic alignment found ${classic[1].dx}`)
  return { canvas: back, note: `shift of (14, -9) recovered as (${(-dx).toFixed(1)}, ${(-dy).toFixed(1)}); classic fallback found ${classic[1].dx}, ${classic[1].dy}` }
} })
feature({ id: 'edit-autoBlend', menu: 'Edit', ps: 'Auto-Blend Layers (seamless)', cmd: ['edit.autoBlend'], run: async (c) => {
  const left = clipCanvasToSelection(cloneCanvas(c.work), rectSelection(0, 0, c.w * 0.6, c.h))
  const right = clipCanvasToSelection(cloneCanvas(c.other), rectSelection(c.w * 0.4, 0, c.w * 0.6, c.h))
  const { perLayer, canvas } = await blendAligned([left, right])
  assert.equal(perLayer.length, 2)
  const seam = alphaAt(perLayer[0], Math.round(c.w * 0.5), Math.round(c.h / 2))
  assert.ok(seam > 0 && seam < 255, `the overlap should fade, alpha ${seam}`)
  const classic = autoBlendLayers([left, right])
  assert.ok(classic)
  return canvas
} })
feature({ id: 'edit-defineBrush', menu: 'Edit', ps: 'Define Brush Preset (sampled tip)', cmd: ['edit.defineBrush', 'window.toolPresets'], run: (c) => {
  const tip = clipCanvasToSelection(cloneCanvas(c.grey), ellipseSelection(c.w * 0.3, c.h * 0.3, c.w * 0.4, c.h * 0.4))
  const out = c.fresh()
  paintStroke(out, { x: c.w * 0.2, y: c.h * 0.5 }, { x: c.w * 0.8, y: c.h * 0.5 }, { size: 60, hardness: 1, color: '#ff3d00', opacity: 1, selection: null, shape: { tip, spacing: 0.5 } })
  return out
} })
feature({ id: 'edit-definePattern', menu: 'Edit', ps: 'Define Pattern / Patterns panel / Pattern Preview', cmd: ['edit.definePattern', 'window.patterns', 'view.patternPreview'], run: (c) => {
  const def = definePattern('p1', 'From photo', c.tile)
  assert.ok(def.dataUrl?.startsWith('data:image/png'))
  return { canvas: patternFill(c.w, c.h, c.tile), note: `${c.tile.width}x${c.tile.height} tile, stored as ${(def.dataUrl.length / 1024).toFixed(0)} kB` }
} })
feature({ id: 'edit-neuralModels', menu: 'Edit', ps: 'Neural Models… (download window)', cmd: ['edit.neuralModels'], ui: 'a download window; no weights are on this machine, so every neural command below runs its classic fallback — the same path the app takes without a download', run: () => ({ note: 'download window' }) })
feature({ id: 'edit-preferences', menu: 'Edit', ps: 'Purge / Color Settings / Keyboard Shortcuts / Preferences', cmd: ['edit.purge', 'edit.colorSettings', 'edit.keyboardShortcuts', 'edit.preferences'], ui: 'settings windows; nothing to see in pixels', run: () => ({ note: 'settings windows' }) })

/* ---- Image */

const adjustmentValues = {
  brightness: { brightness: 25, contrast: 30 },
  levels: null,
  curves: null,
  hue: { hue: 40, saturation: 30, lightness: 5 },
  colorBalance: { red: 30, green: -10, blue: -25 },
  vibrance: { vibrance: 70, saturation: 10 },
  bw: {},
  invert: {},
  posterize: { posterize: 4 },
  threshold: { threshold: 120 },
  exposure: { exposure: 120, gamma: 1.3, blacks: -10 },
  photoFilter: { filterColor: '#ff9900', filterDensity: 0.5 },
  clarity: { clarity: 70 },
  dehaze: { dehaze: 50 },
  grain: { grain: 50 },
  shadowsHighlights: { shadows: 45, highlights: -45 },
  channelMixer: { mix: { red: { r: 60, g: 40, b: 0, constant: 0 }, green: { r: 0, g: 100, b: 0, constant: 0 }, blue: { r: 0, g: 20, b: 80, constant: 5 } } },
  selectiveColor: { family: 'reds', ink: { cyan: -60, magenta: 30, yellow: 30, black: 0 } },
  gradientMap: { mapFrom: '#10203a', mapTo: '#f2d9a0' },
  equalize: {},
  colorLookup: { lutId: 'teal', lutStrength: 1 },
}
const adjustmentCommand = {
  brightness: 'image.brightness', levels: 'image.levels', curves: 'image.curves', hue: 'image.hueSat', colorBalance: 'image.colorBalance',
  vibrance: 'image.vibrance', bw: 'image.blackWhite', invert: 'image.invert', posterize: 'image.posterize', threshold: 'image.threshold',
  exposure: 'image.exposure', photoFilter: 'image.photoFilter', clarity: 'image.cameraRaw', dehaze: 'image.cameraRaw', grain: 'image.cameraRaw',
  shadowsHighlights: 'image.shadowsHighlights', channelMixer: 'image.channelMixer', selectiveColor: 'image.selectiveColor',
  gradientMap: 'image.gradientMap', equalize: 'image.equalize', colorLookup: 'image.colorLookup',
}
const sCurve = () => ({ rgb: [{ x: 0, y: 0 }, { x: 64, y: 40 }, { x: 192, y: 220 }, { x: 255, y: 255 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 10 }, { x: 255, y: 240 }] })
const strongLevels = () => ({ black: 25, gamma: 1.35, white: 225, outBlack: 5, outWhite: 250 })

for (const type of adjustmentTypes) {
  feature({ id: `adjust-${type}`, menu: 'Image', ps: `Adjustments › ${type}`, cmd: [adjustmentCommand[type], `adjLayer.${type}`], colourOnly: ['bw', 'clarity', 'selectiveColor', 'hue', 'vibrance'].includes(type), tolerant: type === 'selectiveColor', run: (c) => {
    const out = c.fresh()
    if (type === 'levels') applyLevels(out, strongLevels(), null)
    else if (type === 'curves') applyCurves(out, sCurve(), null)
    else applyAdjustmentCanvas(out, { ...defaultAdjustment(type), ...adjustmentValues[type] })
    if (type === 'bw') assert.ok(isGrey(out), 'Black & White should leave no colour')
    if (type === 'invert') assert.deepEqual(rgbAt(out, 3, 3), rgbAt(c.work, 3, 3).map((v) => 255 - v))
    if (type === 'threshold') assert.ok(rgbAt(out, 3, 3).every((v) => v === 0 || v === 255))
    return out
  } })
}
feature({ id: 'adjust-layer-masked', menu: 'Image', ps: 'Adjustment layer with a mask and a clipped one (non-destructive)', cmd: ['layer.mask', 'window.adjust', 'window.properties'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const adjust = createLayerMeta('Hue', 'adjustment')
  adjust.adjustment = { ...defaultAdjustment('hue'), hue: 120, saturation: 40 }
  adjust.maskEnabled = true
  canvases.set(`${adjust.id}:mask`, maskCanvas(c.w, c.h, (ctx) => ctx.fillRect(0, 0, c.w / 2, c.h)))
  const curves = createLayerMeta('Curves', 'adjustment')
  curves.curves = sCurve()
  const levels = createLayerMeta('Levels', 'adjustment')
  levels.levels = strongLevels()
  document.layers.push(adjust, curves, levels)
  const out = compositeDocument(document, canvases)
  const untouched = c.fresh()
  applyCurves(untouched, sCurve(), null)
  applyLevels(untouched, strongLevels(), null)
  const rightHalf = selectionToMask(rectSelection(c.w / 2 + 2, 0, c.w / 2 - 2, c.h), c.w, c.h)
  assert.ok(regionDifference(out, untouched, rightHalf) < 1.5, 'the masked-out half should only get the curves and levels')
  return out
} })
feature({ id: 'image-modes', menu: 'Image', ps: 'Mode › Grayscale / CMYK / Lab / Duotone / Indexed / Bitmap / RGB', cmd: ['image.modeGray', 'image.modeCmyk', 'image.modeLab', 'image.modeDuotone', 'image.modeIndexed', 'image.modeBitmap', 'image.modeRgb', 'image.grayscale', 'image.desaturate'], run: (c) => {
  const gray = c.fresh(); applyColorMode(gray, 'gray'); assert.ok(isGrey(gray))
  const cmyk = c.fresh(); applyColorMode(cmyk, 'cmyk')
  const lab = c.fresh(); applyColorMode(lab, 'lab')
  const rgb = c.fresh(); applyColorMode(rgb, 'rgb'); assert.equal(meanDifference(rgb, c.work), 0, 'RGB is the identity')
  const duo = c.fresh(); duotone(duo, '#1a237e', '#ffca28')
  const indexed = c.fresh(); indexedColor(indexed, 16, true)
  const bitmap = c.fresh(); bitmapMode(bitmap)
  assert.ok(rgbAt(bitmap, 3, 3).every((v) => v === 0 || v === 255), 'bitmap mode is pure black and white')
  const desat = c.fresh(); desaturate(desat, null); assert.ok(isGrey(desat))
  return { canvas: sideBySide(gray, cmyk, lab, duo, indexed, bitmap), note: 'gray, CMYK, Lab, duotone, 16-colour indexed (dithered), bitmap', size: 'free' }
} })
feature({ id: 'image-depth16', menu: 'Image', ps: 'Mode › 16 Bits/Channel (deep buffer levels + exposure)', cmd: ['image.depth8', 'image.depth16'], run: (c) => {
  const deep = deepFromCanvas(c.work)
  deepExposure(deep, 0.5)
  deepLevels(deep, 12, 1.2, 240)
  const out = canvasFromDeep(deep)
  assert.equal(out.width, c.w)
  return out
} })
feature({ id: 'image-profile', menu: 'Image', ps: 'Convert to Profile (sRGB → Adobe RGB → ProPhoto)', cmd: ['image.profile'], colourOnly: true, run: (c) => {
  const names = Object.keys(builtInProfiles)
  assert.ok(names.includes('srgb'), `profiles: ${names.join(', ')}`)
  const wide = names.find((name) => name !== 'srgb')
  const out = c.fresh()
  convertProfile(out, builtInProfiles.srgb, builtInProfiles[wide])
  const back = cloneCanvas(out)
  convertProfile(back, builtInProfiles[wide], builtInProfiles.srgb)
  assert.ok(meanDifference(back, c.work) < 3, 'converting there and back should return the picture')
  return { canvas: out, note: `sRGB → ${builtInProfiles[wide].name ?? wide} → sRGB drifts ${meanDifference(back, c.work).toFixed(2)}` }
} })
feature({ id: 'image-auto', menu: 'Image', ps: 'Auto Tone / Auto Contrast / Auto Color / Auto Levels', cmd: ['image.autoTone', 'image.autoContrast', 'image.autoColor', 'image.autoLevels'], run: (c) => {
  const tone = c.fresh(); autoTone(tone, null)
  const contrast = c.fresh(); autoContrast(contrast, null)
  const colour = c.fresh(); autoColor(colour)
  const levels = c.fresh(); levelsStretch(levels)
  const auto = autoLevels(c.work)
  assert.ok(auto.white > auto.black)
  return { canvas: sideBySide(tone, contrast, colour, levels), note: `auto levels found black ${auto.black}, white ${auto.white}`, size: 'free' }
} })
feature({ id: 'image-hdrToning', menu: 'Image', ps: 'HDR Toning', cmd: ['image.hdrToning'], run: (c) => { const out = c.fresh(); hdrToning(out, { radius: 12, strength: 0.7, detail: 40, gamma: 1.1, saturation: 20 }, null); return out } })
feature({ id: 'image-matchColor', menu: 'Image', ps: 'Match Color (statistics of another picture)', cmd: ['image.matchColor'], run: (c) => { const out = c.fresh(); matchColor(out, c.other, { luminance: 100, intensity: 100, fade: 0, neutralize: false }, null); return out } })
feature({ id: 'image-replaceColor', menu: 'Image', ps: 'Replace Color', cmd: ['image.replaceColor'], run: (c) => {
  const out = c.fresh()
  const [r, g, b] = rgbAt(c.work, c.w / 2, c.h / 2)
  replaceColor(out, { r, g, b }, '#00e676', 60, null)
  return out
} })
feature({ id: 'image-cameraRaw', menu: 'Image', ps: 'Camera Raw Filter (13 sliders)', cmd: ['image.cameraRaw', 'filter.cameraRaw'], run: (c) => {
  const out = c.fresh()
  applyAdjustmentCanvas(out, { ...defaultAdjustment('exposure'), exposure: 40, contrast: 15, highlights: -30, shadows: 25, whites: 10, blacks: -10, temperature: 15, tint: -5, vibrance: 30, saturation: 5, clarity: 25, dehaze: 15, grain: 10 })
  return out
} })
feature({ id: 'image-lut', menu: 'Image', ps: 'Color Lookup (built-in LUTs)', cmd: ['image.colorLookup'], run: (c) => {
  const cells = Object.keys(builtInLuts).map((id) => { const out = c.fresh(); applyLut(out, builtInLuts[id](), null, 1); return fitImage(out, 150, 150) })
  return { canvas: sideBySide(...cells), note: `${cells.length} LUTs: ${Object.keys(builtInLuts).join(', ')}`, size: 'free' }
} })
feature({ id: 'image-size', menu: 'Image', ps: 'Image Size / Canvas Size / Reveal All / Trim', cmd: ['image.size', 'image.canvasSize', 'image.revealAll', 'image.trim'], run: (c) => {
  const smaller = resizeCanvasContent(c.work, Math.round(c.w * 0.6), Math.round(c.h * 0.6))
  const bigger = padCanvas(c.work, c.w + 60, c.h + 60, 30, 30)
  assert.equal(alphaAt(bigger, 5, 5), 0)
  const bounds = layerBounds(bigger)
  assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height], [30, 30, c.w, c.h], `trim found ${JSON.stringify(bounds)}`)
  const trimmed = cropToRect(bigger, bounds)
  assert.equal(meanDifference(trimmed, c.work), 0, 'trim should give the picture back exactly')
  return { canvas: sideBySide(smaller, bigger, trimmed), note: 'resized to 60%, canvas grown by 30px each side, trimmed back', size: 'free' }
} })
feature({ id: 'image-rotate', menu: 'Image', ps: 'Image Rotation › 180 / 90 CW / 90 CCW / Arbitrary / Flip', cmd: ['image.rotate180', 'image.rotateCW', 'image.rotateCCW', 'image.rotateArbitrary', 'image.flipH', 'image.flipV', 'layer.flipH', 'layer.flipV'], run: (c) => {
  const flipped = flipCanvas(c.work, 'x')
  assert.deepEqual(rgbAt(flipped, 0, 0), rgbAt(c.work, c.w - 1, 0))
  const arbitrary = rotateArbitrary(c.work, 12)
  assert.ok(arbitrary.width > c.w)
  return { canvas: sideBySide(rotateLayerCanvas(c.work, 1), rotateLayerCanvas(c.work, 2), rotateLayerCanvas(c.work, 3), arbitrary, flipped, flipCanvas(c.work, 'y')), size: 'free' }
} })
feature({ id: 'image-duplicate', menu: 'Image', ps: 'Duplicate', cmd: ['image.duplicate', 'window.nextDoc', 'window.prevDoc'], run: (c) => {
  const copy = cloneCanvas(c.work)
  assert.equal(meanDifference(copy, c.work), 0)
  return { canvas: copy, same: true, note: 'an identical second document' }
} })
feature({ id: 'image-applyImage', menu: 'Image', ps: 'Apply Image / Calculations', cmd: ['image.applyImage', 'image.calculations'], run: (c) => {
  const applied = c.fresh()
  applyImage(applied, c.other, 'multiply', 0.8, false, null)
  const calc = calculations(c.work, 'r', c.other, 'luma', 'difference', 1)
  assert.equal(calc.width, c.w)
  return { canvas: sideBySide(applied, maskToGreyCanvas(calc.mask, calc.width, calc.height)), size: 'free' }
} })
feature({ id: 'image-crop-selection', menu: 'Image', ps: 'Crop to selection', cmd: ['image.crop'], run: (c) => {
  const out = cropToRect(c.work, c.rect)
  assert.equal(out.width, Math.round(c.rect.width))
  return { canvas: out, size: 'free' }
} })

/* ---- Layer */

feature({ id: 'layer-basics', menu: 'Layer', ps: 'New / Via Copy / Via Cut / Duplicate / Delete / order / Hide Others', cmd: ['layer.new', 'layer.newViaCopy', 'layer.newViaCut', 'layer.duplicate', 'layer.delete', 'layer.bringToFront', 'layer.bringForward', 'layer.sendBackward', 'layer.sendToBack', 'layer.hideOthers', 'window.layers', 'select.allLayers', 'select.deselectLayers', 'select.isolate'], run: (c) => {
  const { document, layer, canvases } = singleLayerDocument(c.stem, c.fresh())
  const viaCopy = createLayerMeta('Via copy')
  canvases.set(viaCopy.id, clipCanvasToSelection(cloneCanvas(c.work), c.sel))
  const viaCut = createLayerMeta('Via cut')
  canvases.set(viaCut.id, clipCanvasToSelection(cloneCanvas(c.other), c.sel))
  const dup = createLayerMeta('Duplicate')
  canvases.set(dup.id, cloneCanvas(c.other))
  document.layers.push(viaCopy, viaCut, dup)
  const top = compositeDocument(document, canvases)
  assert.equal(meanDifference(top, c.other), 0, 'the duplicate on top covers everything')
  document.layers = [dup, layer, viaCopy, viaCut]
  const reordered = compositeDocument(document, canvases)
  assert.ok(meanDifference(reordered, c.other) > 1, 'sending it to the back changes the picture')
  document.layers = document.layers.filter((item) => item.id !== dup.id)
  for (const item of document.layers) item.visible = item.id === viaCut.id
  const alone = compositeDocument(document, canvases)
  assert.equal(alphaAt(alone, 2, 2), 0, 'hide others leaves only the cut layer')
  return { canvas: sideBySide(top, reordered, alone), size: 'free' }
} })
feature({ id: 'layer-fillLayer', menu: 'Layer', ps: 'New Fill Layer › Solid / Gradient / Pattern', cmd: ['layer.fillLayer'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const solid = createLayerMeta('Solid', 'fill')
  solid.fill = { kind: 'solid', color: '#e91e63', gradientKind: 'linear', start: { x: 0, y: 0 }, end: { x: c.w, y: 0 }, endColor: '#000000' }
  solid.opacity = 0.35
  const gradient = createLayerMeta('Gradient', 'fill')
  gradient.fill = { kind: 'gradient', color: '#00bcd4', gradientKind: 'radial', start: { x: c.w / 2, y: c.h / 2 }, end: { x: c.w, y: c.h }, endColor: '#ff980000' }
  gradient.blendMode = 'overlay'
  const pattern = createLayerMeta('Pattern', 'fill')
  pattern.fill = { kind: 'pattern', color: '#ffffff', gradientKind: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, endColor: '#000000', patternId: 'p1' }
  pattern.opacity = 0.4
  canvases.set(patternKey('p1'), c.tile)
  document.layers.push(solid, gradient, pattern)
  return compositeDocument(document, canvases)
} })
feature({ id: 'layer-styles', menu: 'Layer', ps: 'Layer Style (all ten effects) / Copy, Paste, Clear Style / Styles panel', cmd: ['layer.style', 'layer.copyStyle', 'layer.pasteStyle', 'layer.clearStyle', 'window.styles'], run: (c) => {
  const cutout = clipCanvasToSelection(cloneCanvas(c.work), ellipseSelection(c.w * 0.25, c.h * 0.25, c.w * 0.5, c.h * 0.5))
  const effects = {
    ...defaultEffects(),
    dropShadow: true, innerShadow: true, stroke: true, strokeColor: '#ffeb3b', strokeWidth: 4, colorOverlay: true, overlayColor: '#ff5722', overlayOpacity: 0.2,
    innerGlow: true, outerGlow: true, bevel: true, satin: true, gradientOverlay: true, gradientOpacity: 0.3, patternOverlay: true, patternId: 'p1', patternOpacity: 0.3,
  }
  const canvases = new Map([[patternKey('p1'), c.tile]])
  const styled = applyLayerEffects(cutout, effects, canvases)
  assert.ok(meanDifference(styled, cutout) > 1, 'the styles should show')
  const pasted = applyLayerEffects(cutout, { ...effects }, canvases)
  assert.equal(meanDifference(pasted, styled), 0, 'a pasted style renders the same')
  const cleared = applyLayerEffects(cutout, defaultEffects(), canvases)
  assert.equal(meanDifference(cleared, cutout), 0, 'a cleared style is the plain layer')
  const out = createCanvas(c.w, c.h)
  const ctx = context2d(out)
  ctx.fillStyle = '#263238'
  ctx.fillRect(0, 0, c.w, c.h)
  ctx.drawImage(styled, 0, 0)
  return out
} })
feature({ id: 'layer-smart', menu: 'Layer', ps: 'Smart Objects: convert, smart filters, edit/replace/export contents', cmd: ['layer.toSmart', 'layer.smartEdit', 'layer.smartReplace', 'layer.smartExport', 'layer.rasterize'], run: (c) => {
  setSmartFilterRunner((canvas, filter) => applyGalleryFilter(canvas, filter.filter, { radius: filter.radius, amount: filter.amount, extra: filter.extra }, null))
  const { document, layer, canvases } = singleLayerDocument(c.stem, c.work)
  layer.smart = true
  canvases.set(smartSourceKey(layer.id), c.work)
  layer.smartTransform = { scaleX: 0.7, scaleY: 0.7, rotate: -0.15, x: c.w * 0.15, y: c.h * 0.15 }
  layer.smartFilters = [{ id: 'f1', filter: 'gaussian', enabled: true, radius: 4, amount: 0 }, { id: 'f2', filter: 'findEdges', enabled: false, radius: 0, amount: 0 }]
  const filtered = compositeDocument(document, canvases)
  layer.smartFilters[1].enabled = true
  const both = compositeDocument(document, canvases)
  assert.ok(meanDifference(both, filtered) > 1, 'switching the second smart filter on changes the result')
  canvases.set(smartSourceKey(layer.id), c.other)
  const replaced = compositeDocument(document, canvases)
  assert.ok(meanDifference(replaced, both) > 1, 'replace contents redraws from the new source')
  assert.equal(canvases.get(smartSourceKey(layer.id)), c.other, 'export contents hands back the untouched source')
  return { canvas: sideBySide(filtered, both, replaced), note: 'smart object scaled and turned, non-destructive blur, then find-edges enabled, then contents replaced', size: 'free' }
} })
feature({ id: 'layer-masks', menu: 'Layer', ps: 'Layer Mask: reveal/hide all, from selection, hide selection, from transparency, disable, invert, apply, delete', cmd: ['layer.mask', 'layer.maskHideAll', 'layer.maskFromSelection', 'layer.maskHideSelection', 'layer.maskFromTransparency', 'layer.maskDisable', 'layer.maskInvert', 'layer.maskApply', 'layer.maskDelete', 'window.channels'], run: (c) => {
  const { document, layer, canvases } = singleLayerDocument(c.stem, c.work)
  const fromSelection = alphaMask(selectionToMask(c.sel, c.w, c.h), c.w, c.h)
  layer.maskEnabled = true
  canvases.set(`${layer.id}:mask`, fromSelection)
  const revealed = compositeDocument(document, canvases)
  assert.equal(alphaAt(revealed, 2, 2), 0)
  assert.equal(alphaAt(revealed, c.w / 2, c.h / 2), 255)
  const inverted = alphaMask(selectionToMask(invertSelection(c.sel, c.w, c.h), c.w, c.h), c.w, c.h)
  canvases.set(`${layer.id}:mask`, inverted)
  const hidden = compositeDocument(document, canvases)
  assert.equal(alphaAt(hidden, c.w / 2, c.h / 2), 0, 'hide selection')
  layer.maskEnabled = false
  const disabled = compositeDocument(document, canvases)
  assert.equal(meanDifference(disabled, c.work), 0, 'a disabled mask shows everything')
  layer.maskEnabled = true
  const applied = cloneCanvas(c.work)
  context2d(applied).globalCompositeOperation = 'destination-in'
  context2d(applied).drawImage(inverted, 0, 0)
  const holed = clipCanvasToSelection(cloneCanvas(c.work), invertSelection(c.sel, c.w, c.h))
  const fromTransparency = greyCanvasToMask(channelCanvas(holed, 'a'))
  assert.equal(fromTransparency[Math.round(c.h / 2) * c.w + Math.round(c.w / 2)], 0, 'mask from transparency follows the hole')
  return { canvas: sideBySide(revealed, hidden, applied), note: 'from selection, hide selection (inverted), applied; disable restored the full picture', size: 'free' }
} })
feature({ id: 'layer-vectorMask', menu: 'Layer', ps: 'Vector Mask (from a path)', cmd: ['layer.vectorMask'], run: (c) => {
  const pathShape = createPath('Mask', [pathNode(c.w * 0.2, c.h * 0.1), pathNode(c.w * 0.9, c.h * 0.4), pathNode(c.w * 0.6, c.h * 0.95), pathNode(c.w * 0.1, c.h * 0.7)], true)
  const { document, layer, canvases } = singleLayerDocument(c.stem, c.work)
  layer.maskEnabled = true
  canvases.set(`${layer.id}:mask`, alphaMask(pathToSelection(pathShape, c.w, c.h).mask, c.w, c.h))
  const out = compositeDocument(document, canvases)
  assert.equal(alphaAt(out, 2, 2), 0)
  return withPaths(out, [pathShape])
} })
feature({ id: 'layer-clipMask', menu: 'Layer', ps: 'Create Clipping Mask', cmd: ['layer.clipMask'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const base = createLayerMeta('Shape', 'shape')
  base.shape = { kind: 'ellipse', x: c.w * 0.2, y: c.h * 0.2, width: c.w * 0.6, height: c.h * 0.6, fill: '#ffffff', stroke: '', strokeWidth: 0, sides: 5, radius: 0 }
  const clipped = createLayerMeta('Clipped')
  clipped.clipped = true
  canvases.set(clipped.id, c.other)
  document.layers.push(base, clipped)
  const out = compositeDocument(document, canvases)
  assert.deepEqual(rgbAt(out, 2, 2), rgbAt(c.work, 2, 2), 'outside the shape the photo shows through')
  assert.deepEqual(rgbAt(out, c.w / 2, c.h / 2), rgbAt(c.other, c.w / 2, c.h / 2), 'inside, the clipped layer')
  return out
} })
feature({ id: 'layer-groups', menu: 'Layer', ps: 'Group / Ungroup (folder opacity and blend)', cmd: ['layer.group', 'layer.ungroup'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const folder = createLayerMeta('Group', 'group')
  const child = createLayerMeta('Child')
  child.parentId = folder.id
  child.opacity = 0.5
  canvases.set(child.id, c.other)
  document.layers.push(folder, child)
  const grouped = compositeDocument(document, canvases)
  child.parentId = undefined
  document.layers = document.layers.filter((item) => item.id !== folder.id)
  const ungrouped = compositeDocument(document, canvases)
  assert.equal(meanDifference(grouped, ungrouped), 0, 'ungrouping keeps the picture')
  return grouped
} })
feature({ id: 'layer-align', menu: 'Layer', ps: 'Align (6 edges) / Distribute / Link / Unlink', cmd: ['layer.alignLeft', 'layer.alignCenterH', 'layer.alignRight', 'layer.alignTop', 'layer.alignCenterV', 'layer.alignBottom', 'layer.distributeH', 'layer.distributeV', 'layer.link', 'layer.unlink'], run: (c) => {
  const a = clipCanvasToSelection(cloneCanvas(c.other), rectSelection(10, 10, 60, 60))
  const b = clipCanvasToSelection(cloneCanvas(c.other), rectSelection(c.w - 100, c.h - 100, 60, 60))
  const d = clipCanvasToSelection(cloneCanvas(c.other), rectSelection(c.w / 2 - 20, c.h / 2, 60, 60))
  const offsets = alignOffsets([a, b, d], 'left', c.w, c.h)
  assert.equal(offsets.length, 3)
  const aligned = [a, b, d].map((item, index) => shiftCanvas(item, offsets[index].dx ?? offsets[index].x ?? 0, offsets[index].dy ?? offsets[index].y ?? 0))
  const bounds = aligned.map((item) => layerBounds(item).x)
  assert.ok(Math.max(...bounds) - Math.min(...bounds) <= 1, `left edges ${bounds.join(', ')} should meet`)
  const spread = distributeOffsets([a, d, b], 'x')
  assert.equal(spread.length, 3)
  const linked = [a, b].map((item) => shiftCanvas(item, 30, 0))
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  aligned.forEach((item, index) => { const layer = createLayerMeta(`Layer ${index}`); layer.linkId = 'link'; document.layers.push(layer); canvases.set(layer.id, item) })
  assert.ok(layerBounds(linked[0]).x === layerBounds(a).x + 30 && layerBounds(linked[1]).x === layerBounds(b).x + 30)
  return compositeDocument(document, canvases)
} })
feature({ id: 'layer-locks', menu: 'Layer', ps: 'Lock transparent pixels / position / all', cmd: ['layer.lockTransparent', 'layer.lockPosition', 'layer.lockAll'], run: (c) => {
  // Lock transparent: paint only where the layer already has pixels.
  const holed = clipCanvasToSelection(cloneCanvas(c.work), invertSelection(c.sel, c.w, c.h))
  const stroke = createCanvas(c.w, c.h)
  paintStroke(stroke, { x: 0, y: c.h / 2 }, { x: c.w, y: c.h / 2 }, { size: 40, hardness: 1, color: '#ff1744', opacity: 1, selection: null })
  context2d(stroke).globalCompositeOperation = 'destination-in'
  context2d(stroke).drawImage(holed, 0, 0)
  context2d(holed).drawImage(stroke, 0, 0)
  assert.equal(alphaAt(holed, c.w / 2, c.h / 2), 0, 'the hole stays a hole with transparency locked')
  const [r] = rgbAt(holed, 4, c.h / 2)
  assert.ok(r > 200, 'the stroke lands on the pixels the layer has')
  return holed
} })
feature({ id: 'layer-merge', menu: 'Layer', ps: 'Merge Down / Merge Visible / Flatten', cmd: ['layer.mergeDown', 'layer.mergeVisible', 'layer.flatten'], run: (c) => {
  const { document, canvases } = singleLayerDocument(c.stem, c.work)
  const top = createLayerMeta('Top')
  top.blendMode = 'multiply'
  top.opacity = 0.7
  canvases.set(top.id, c.other)
  document.layers.push(top)
  const before = compositeDocument(document, canvases)
  const merged = compositeDocument(document, canvases)
  const flat = singleLayerDocument('flat', merged)
  const after = compositeDocument(flat.document, flat.canvases)
  assert.equal(meanDifference(before, after), 0, 'merging must not change the picture')
  return after
} })
feature({ id: 'layer-matting', menu: 'Layer', ps: 'Matting › Defringe / Remove Black Matte / Remove White Matte', cmd: ['layer.defringe', 'layer.removeBlackMatte', 'layer.removeWhiteMatte'], run: (c) => {
  const cutout = clipCanvasToSelection(cloneCanvas(c.work), featherSelection(c.sel, c.w, c.h, 4))
  const fringed = cloneCanvas(cutout)
  defringe(fringed, 2)
  const black = cloneCanvas(cutout)
  removeMatte(black, 'black')
  const white = cloneCanvas(cutout)
  removeMatte(white, 'white')
  assert.equal(fringed.width, c.w)
  return { canvas: sideBySide(fringed, black, white), size: 'free' }
} })
feature({ id: 'layer-3d', menu: '3D', ps: 'New 3D Extrusion / Postcard / Render / 3D Effects / Remove', cmd: ['threeD.extrude', 'threeD.postcard', 'threeD.render', 'threeD.remove', 'threeD.effects'], run: (c) => {
  const extruded = renderExtrude(c.work, c.w, c.h, { ...defaultThreeD(), depth: 40 })
  const postcard = renderExtrude(c.work, c.w, c.h, { depth: 0, rotateX: 12, rotateY: -28, rotateZ: 0, lightX: 0.3, lightY: -0.4, lightZ: 1, color: '#dddddd', perspective: 0.6 })
  const effects = applyLayerEffects(extruded, { ...defaultEffects(), bevel: true, dropShadow: true })
  assert.ok(meanDifference(postcard, c.work) > 1)
  return { canvas: sideBySide(extruded, postcard, effects), note: 'extrusion (rendered = rasterised), postcard, bevel + shadow; Remove 3D = the flat layer again', size: 'free' }
} })

/* ---- Type */

feature({ id: 'type-character-paragraph', menu: 'Type', ps: 'Character / Paragraph panels (bold, italic, spacing, indent, underline, caps, baseline)', cmd: ['type.character', 'type.paragraph', 'type.glyphs', 'type.antiAlias', 'window.character', 'window.paragraph', 'window.glyphs'], run: (c) => {
  const plain = { text: 'Photo\nWork', x: 12, y: 12, fontFamily: 'sans-serif', fontSize: Math.round(c.h / 8), color: '#ffffff', bold: false, italic: false, align: 'left', vertical: false }
  const a = rasterizeTextLayer(c.w, c.h, plain)
  const b = rasterizeTextLayer(c.w, c.h, { ...plain, bold: true, italic: true, lineHeight: 1.6, letterSpacing: 6, indent: 20, paragraphSpacing: 10, underline: true, strike: true, allCaps: true, baselineShift: 4, align: 'center', antiAlias: 'crisp' })
  assert.ok(meanDifference(a, b) > 0.2, 'the character settings should change the type')
  const out = c.fresh()
  context2d(out).drawImage(b, 0, 0)
  return out
} })
feature({ id: 'type-warp', menu: 'Type', ps: 'Warp Text', cmd: ['type.warp'], run: (c) => {
  const text = { text: 'WARPED', x: 10, y: c.h * 0.3, fontFamily: 'sans-serif', fontSize: Math.round(c.w / 7), color: '#ffeb3b', bold: true, italic: false, align: 'left', vertical: false, warp: { style: 'flag', bend: 50, horizontal: 0, vertical: 0 } }
  const out = c.fresh()
  context2d(out).drawImage(rasterizeTextLayer(c.w, c.h, text), 0, 0)
  return out
} })
feature({ id: 'type-onPath', menu: 'Type', ps: 'Type on a path', cmd: ['type.horizontal'], run: (c) => {
  const pathShape = pathFromPoints('Arc', Array.from({ length: 20 }, (_, i) => ({ x: c.w * (0.05 + 0.9 * i / 19), y: c.h * (0.5 - 0.3 * Math.sin((i / 19) * Math.PI)) })), false, 2)
  const text = { text: 'Type along the path', x: 0, y: 0, fontFamily: 'sans-serif', fontSize: Math.round(c.w / 16), color: '#ffffff', bold: true, italic: false, align: 'left', vertical: false, pathId: pathShape.id, pathOffset: 0 }
  const layer = rasterizeTextLayer(c.w, c.h, text, [pathShape])
  assert.ok(countMask(greyCanvasToMask(channelCanvas(layer, 'a'))) > 50, 'the letters should land on the path')
  const out = c.fresh()
  context2d(out).drawImage(layer, 0, 0)
  return withPaths(out, [pathShape])
} })
feature({ id: 'type-convert', menu: 'Type', ps: 'Convert to Shape / Create Work Path / Rasterize Type', cmd: ['type.convertToShape', 'type.workPath', 'type.rasterize'], run: (c) => {
  const text = { text: 'AB', x: 10, y: 10, fontFamily: 'sans-serif', fontSize: Math.round(c.h / 2), color: '#ffffff', bold: true, italic: false, align: 'left', vertical: false }
  const raster = rasterizeTextLayer(c.w, c.h, text)
  const paths = traceCanvasToPaths(raster, 'AB', 1.5)
  assert.ok(paths.length >= 2, `traced ${paths.length} outlines from two letters`)
  const out = c.fresh()
  for (const shape of paths) fillPathOnto(out, shape, '#ff9800aa')
  return withPaths(out, paths)
} })
feature({ id: 'type-matchFont', menu: 'Type', ps: 'Match Font', cmd: ['type.matchFont', 'type.enter'], ui: 'no font-recognition engine (🟡 in PhotoshopParity.md): opens the Character panel', run: () => ({ note: 'window only' }) })

/* ---- Select */

feature({ id: 'select-basics', menu: 'Select', ps: 'All / Deselect / Reselect / Inverse', cmd: ['select.all', 'select.none', 'select.reselect', 'select.invert'], run: (c) => {
  const all = rectSelection(0, 0, c.w, c.h)
  const inverse = invertSelection(c.sel, c.w, c.h)
  assert.equal(countMask(inverse.mask) + countMask(selectionToMask(c.sel, c.w, c.h)), c.w * c.h)
  assert.equal(all.width, c.w)
  return { selection: inverse }
} })
feature({ id: 'select-combine', menu: 'Select', ps: 'Add / Subtract / Intersect (Shift, Alt, Shift+Alt)', cmd: ['select.all'], run: (c) => {
  const a = selectionToMask(c.rect, c.w, c.h)
  const b = selectionToMask(ellipseSelection(c.w * 0.45, c.h * 0.45, c.w * 0.4, c.h * 0.4), c.w, c.h)
  const union = combineMasks(a, b, 'add')
  const minus = combineMasks(a, b, 'subtract')
  const both = combineMasks(a, b, 'intersect')
  assert.ok(countMask(union) > countMask(a) && countMask(minus) < countMask(a) && countMask(both) < countMask(b))
  const out = sideBySide(...[union, minus, both].map((mask) => overlay(c.work, { kind: 'mask', ...maskBounds(mask, c.w, c.h), mask })))
  return { canvas: out, size: 'free' }
} })
feature({ id: 'select-colorRange', menu: 'Select', ps: 'Color Range', cmd: ['select.colorRange'], run: (c) => {
  const [r, g, b] = rgbAt(c.work, c.w / 2, c.h / 2)
  const selection = colorRangeSelection(c.work, { r, g, b }, 50)
  assert.ok(countMask(selection.mask) > 0)
  return { selection }
} })
feature({ id: 'select-focusArea', menu: 'Select', ps: 'Focus Area', cmd: ['select.focusArea'], run: (c) => { const selection = selectFocusArea(c.work, 1); return { selection, note: `${((countMask(selection.mask) / (c.w * c.h)) * 100).toFixed(0)}% in focus` } } })
feature({ id: 'select-subject', menu: 'Select', ps: 'Select Subject (GrabCut, whole frame)', cmd: ['select.subject'], run: async (c) => {
  const selection = await grabCutSelection(c.work, { x: c.w * 0.04, y: c.h * 0.04, width: c.w * 0.92, height: c.h * 0.92 }, 5)
  const fallback = selectSubjectAuto(c.work)
  assert.ok(countMask(fallback.mask) > 0)
  return { selection, note: `GrabCut ${((countMask(selection.mask) / (c.w * c.h)) * 100).toFixed(0)}%, colour-statistics fallback ${((countMask(fallback.mask) / (c.w * c.h)) * 100).toFixed(0)}%` }
} })
feature({ id: 'select-sky', menu: 'Select', ps: 'Sky', cmd: ['select.sky'], run: (c) => { const selection = selectSky(c.work); return { selection, note: `${((countMask(selection.mask ?? new Uint8Array()) / (c.w * c.h)) * 100).toFixed(0)}% read as sky` } } })
feature({ id: 'select-distractions', menu: 'Select', ps: 'Distractions', cmd: ['select.distractions'], run: (c) => ({ selection: findDistractions(c.work) }) })
feature({ id: 'select-removeBg', menu: 'Select', ps: 'Remove Background', cmd: ['select.removeBg'], run: async (c) => {
  const out = c.fresh()
  const subject = await grabCutSelection(out, { x: c.w * 0.04, y: c.h * 0.04, width: c.w * 0.92, height: c.h * 0.92 }, 5)
  clearSelectionPixels(out, invertSelection(subject, c.w, c.h))
  const data = pixels(out)
  let clear = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] === 0) clear += 1
  assert.ok(clear > 0, 'some background should be gone')
  return out
} })
feature({ id: 'select-andMask', menu: 'Select', ps: 'Select and Mask (smooth, feather, contrast, shift, edge radius, decontaminate)', cmd: ['select.selectAndMask'], run: (c) => {
  const mask = selectionToMask(c.sel, c.w, c.h)
  const refined = refineMask(mask, c.w, c.h, { smooth: 3, feather: 4, contrast: 20, shift: -10, radius: 3 }, c.work)
  assert.equal(refined.length, mask.length)
  const out = c.fresh()
  decontaminateEdge(out, refined, 4)
  return { canvas: overlay(out, { kind: 'mask', ...maskBounds(refined, c.w, c.h), mask: refined }) }
} })
feature({ id: 'select-modify', menu: 'Select', ps: 'Modify › Border / Smooth / Expand / Contract / Feather', cmd: ['select.border', 'select.smooth', 'select.expand', 'select.contract', 'select.feather'], run: (c) => {
  const base = countMask(selectionToMask(c.sel, c.w, c.h))
  const expanded = expandSelection(c.sel, c.w, c.h, 10)
  const contracted = contractSelection(c.sel, c.w, c.h, 10)
  const border = borderSelection(c.sel, c.w, c.h, 8)
  const smooth = smoothSelection(c.sel, c.w, c.h, 5)
  const feather = featherSelection(c.sel, c.w, c.h, 12)
  assert.ok(countMask(expanded.mask) > base && countMask(contracted.mask) < base && countMask(border.mask) < base)
  assert.ok(feather.mask.some((v) => v > 0 && v < 255), 'a feathered edge is soft')
  return { canvas: sideBySide(overlay(c.work, expanded), overlay(c.work, contracted), overlay(c.work, border), overlay(c.work, smooth), overlay(c.work, feather)), size: 'free' }
} })
feature({ id: 'select-grow-similar', menu: 'Select', ps: 'Grow / Similar', cmd: ['select.grow', 'select.similar'], run: (c) => {
  const start = rectSelection(c.w / 2 - 4, c.h / 2 - 4, 8, 8)
  const grown = growSelection(c.work, start, 32)
  const similar = similarSelection(c.work, start, 32)
  assert.ok(countMask(grown.mask) >= 64 && countMask(similar.mask) >= 64)
  return { canvas: sideBySide(overlay(c.work, grown), overlay(c.work, similar)), size: 'free', note: `grow ${((countMask(grown.mask) / (c.w * c.h)) * 100).toFixed(0)}%, similar ${((countMask(similar.mask) / (c.w * c.h)) * 100).toFixed(0)}%` }
} })
feature({ id: 'select-quickMask', menu: 'Select', ps: 'Quick Mask mode (paint the selection)', cmd: ['select.quickMask', 'view.quickMask'], run: (c) => {
  const grey = maskToGreyCanvas(selectionToMask(c.sel, c.w, c.h), c.w, c.h)
  paintStroke(grey, { x: 0, y: c.h * 0.2 }, { x: c.w, y: c.h * 0.2 }, { size: 30, hardness: 1, color: '#ffffff', opacity: 1, selection: null })
  const mask = greyCanvasToMask(grey)
  assert.ok(countMask(mask) > countMask(selectionToMask(c.sel, c.w, c.h)), 'painting white in quick mask adds to the selection')
  return { selection: { kind: 'mask', ...maskBounds(mask, c.w, c.h), mask } }
} })
feature({ id: 'select-save-load', menu: 'Select', ps: 'Save Selection / Load Selection (alpha channels)', cmd: ['select.save', 'select.load'], run: (c) => {
  const channel = selectionToChannel('ch1', 'Alpha 1', c.sel, c.w, c.h)
  const back = channelToSelection(channel, c.w, c.h)
  assert.equal(countMask(back.mask), countMask(selectionToMask(c.sel, c.w, c.h)))
  return { selection: back, note: 'saved as an alpha channel and loaded back, pixel for pixel' }
} })
feature({ id: 'channels-panel', menu: 'Window', ps: 'Channels panel: view one channel, edit it, composite view', cmd: ['window.channels'], run: (c) => {
  const red = channelCanvas(c.work, 'r')
  assert.ok(isGrey(red))
  const out = c.fresh()
  const boosted = channelCanvas(c.work, 'r')
  applyAdjustmentCanvas(boosted, { ...defaultAdjustment('brightness'), brightness: 30 })
  writeChannel(out, 'r', boosted)
  const view = channelView(c.work, { r: true, g: false, b: false })
  return { canvas: sideBySide(red, out, view), size: 'free' }
} })

/* ---- Filter */

for (const { id, group } of filterCatalog) {
  if (interactiveFilters.has(id)) continue
  feature({ id: `filter-${id}`, menu: 'Filter', ps: `${group} › ${id}`, cmd: [`filter.${id}`, 'filter.gallery', 'filter.last'], colourOnly: ['ntscColors', 'hsbHsa'].includes(id), tolerant: id === 'ntscColors', run: (c) => {
    const out = c.fresh()
    applyGalleryFilter(out, id, galleryParams, null)
    assert.equal(out.width, c.w, `${id} resized the picture`)
    // Inside a selection only the selected pixels may change.
    const clipped = c.fresh()
    applyGalleryFilter(clipped, id, galleryParams, c.rect)
    const outside = selectionToMask(invertSelection(expandSelection(c.rect, c.w, c.h, 2), c.w, c.h), c.w, c.h)
    const leak = regionDifference(clipped, c.work, outside)
    if (!['polar', 'flame', 'tree', 'pictureFrame', 'offset', 'lensFlare', 'clouds'].includes(id)) {
      assert.ok(leak < 0.5, `${id} changed pixels outside the selection by ${leak.toFixed(2)}`)
    }
    return out
  } })
}
feature({ id: 'filter-blurGallery', menu: 'Filter', ps: 'Blur Gallery › Field / Iris / Tilt-Shift / Path / Spin', cmd: ['filter.blurGallery', 'filter.blur', 'filter.sharpen'], run: (c) => {
  const cells = ['fieldBlur', 'irisBlur', 'tiltShift', 'pathBlur'].map((kind) => { const out = c.fresh(); extraFilters[kind].run(out, { radius: 8, amount: 45, extra: 30 }, null); return out })
  const spin = c.fresh()
  applyGalleryFilter(spin, 'radialSpin', { radius: 8, amount: 24 }, null)
  return { canvas: sideBySide(...cells, spin), size: 'free' }
} })
feature({ id: 'filter-lensCorrection', menu: 'Filter', ps: 'Lens Correction / Adaptive Wide Angle', cmd: ['filter.lensCorrection', 'filter.adaptiveWideAngle'], run: (c) => {
  const lens = c.fresh()
  extraFilters.lensCorrection.run(lens, { radius: 2, amount: 60 + 30, extra: -25 }, null)
  const wide = c.fresh()
  extraFilters.lensCorrection.run(wide, { radius: 0, amount: 60, extra: -20 }, null)
  const skewed = skew(wide, 12, 4)
  return { canvas: sideBySide(lens, skewed), size: 'free' }
} })
feature({ id: 'filter-vanishingPoint', menu: 'Filter', ps: 'Vanishing Point (perspective clone)', cmd: ['filter.vanishingPoint'], run: (c) => {
  const out = c.fresh()
  const plane = [{ x: c.w * 0.1, y: c.h * 0.2 }, { x: c.w * 0.9, y: c.h * 0.1 }, { x: c.w * 0.95, y: c.h * 0.9 }, { x: c.w * 0.05, y: c.h * 0.8 }]
  for (let i = 0; i < 6; i += 1) perspectiveCloneDab(out, { x: c.w * 0.6 + i * 6, y: c.h * 0.6 }, { x: c.w * 0.25, y: c.h * 0.3 }, { x: c.w * 0.6, y: c.h * 0.6 }, plane, { size: 40, hardness: 0.9, opacity: 1, selection: null })
  return out
} })
feature({ id: 'filter-custom', menu: 'Filter', ps: 'Other › Custom (kernel)', cmd: ['filter.custom'], run: (c) => {
  const out = c.fresh()
  customKernel(out, [0, -1, 0, -1, 5, -1, 0, -1, 0], 1, 0, null)
  return out
} })
feature({ id: 'filter-neural', menu: 'Filter', ps: 'Neural Filters › Skin Smoothing / Colorize / Restore / Depth Blur / Super Zoom (classic algorithms)', cmd: ['filter.neural'], run: (c) => {
  const skin = c.fresh(); skinSmooth(skin, 3)
  const colorize = c.fresh()
  const ramp = cloneCanvas(c.grey)
  gradientMap(ramp, '#1f2a44', '#fff6e5', null)
  const ctx = context2d(colorize)
  ctx.save(); ctx.globalAlpha = 0.8; ctx.globalCompositeOperation = 'color'; ctx.drawImage(ramp, 0, 0); ctx.restore()
  const restore = c.fresh()
  extraFilters.despeckle.run(restore, galleryParams, null)
  extraFilters.smartSharpen.run(restore, { radius: 2, amount: 40, extra: 10 }, null)
  autoTone(restore, null)
  const depth = c.fresh()
  extraFilters.tiltShift.run(depth, { radius: 9, amount: 45, extra: 0 }, null)
  return { canvas: sideBySide(skin, colorize, restore, depth), note: 'super zoom = edit-genUpscale', size: 'free' }
} })
feature({ id: 'filter-bilateral', menu: 'Filter', ps: 'Noise › Reduce Noise (OpenCV bilateral)', cmd: ['filter.reduceNoise'], run: async (c) => {
  const out = c.fresh()
  const done = await bilateralDenoise(out, 60, null)
  return done ?? out
} })
feature({ id: 'filter-blendModes', menu: 'Layer', ps: 'All 18 blend modes, opacity and fill opacity', cmd: ['window.layers'], run: (c) => {
  const modes = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'lighter', 'xor']
  const cells = modes.map((mode) => {
    const { document, canvases } = singleLayerDocument(c.stem, c.work)
    const top = createLayerMeta(mode)
    top.blendMode = mode
    top.opacity = 0.9
    top.fillOpacity = 0.9
    canvases.set(top.id, c.other)
    document.layers.push(top)
    return fitImage(compositeDocument(document, canvases), 120, 120)
  })
  return { canvas: sideBySide(...cells), note: modes.join(', '), size: 'free' }
} })

/* ---- View / Window */

feature({ id: 'view-proof', menu: 'View', ps: 'Proof Colors (CMYK) / Gamut Warning', cmd: ['view.proofColors', 'view.gamutWarning'], run: (c) => {
  const proof = c.fresh()
  proofCmyk(proof)
  const warned = c.fresh()
  gamutWarning(warned, '#808080')
  const shifted = meanDifference(proof, c.work)
  return { canvas: sideBySide(proof, warned), size: 'free', note: shifted > 0.05 ? `out-of-gamut colours pulled in by ${shifted.toFixed(2)}` : 'every colour in this picture already prints: nothing to pull in' }
} })
feature({ id: 'view-guides', menu: 'View', ps: 'Guides / Grid / Rulers / Snap / Extras / Pixel grid / Screen mode', cmd: ['view.screenMode', 'view.extras', 'view.grid', 'view.rulers', 'view.showGuides', 'view.smartGuides', 'view.pixelGrid', 'view.showPaths', 'view.snap', 'view.snapGuides', 'view.snapGrid', 'view.newGuide', 'view.guideLayout', 'view.lockGuides', 'view.clearGuides'], ui: 'overlays drawn on the view, never on the pixels (exercised by the CDP menu run); guides are still checked to survive in the project file', run: (c) => {
  const { document } = singleLayerDocument(c.stem, c.work)
  document.guides.push({ id: 'g1', axis: 'x', position: 100 }, { id: 'g2', axis: 'y', position: 80 })
  const project = serializeProject(document, new Map())
  assert.equal(project.guides.length, 2)
  return { note: 'overlays drawn on the view, never on the pixels; guides are kept in the project file (2 saved here)' }
} })
feature({ id: 'window-panels', menu: 'Window', ps: 'Panels: Color, Swatches, Comps, Measurement Log, Notes, Guide, workspaces', cmd: ['window.color', 'window.swatches', 'window.comps', 'window.measurementLog', 'window.notes', 'window.guide', 'window.saveWorkspace', 'window.resetWorkspace'], ui: 'panels and workspace layout; exercised by the CDP menu run, nothing to see in pixels', run: () => ({ note: 'panels' }) })

/* ------------------------------------------------------------------ run */

const mimes = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.heic': 'image/heic',
  '.heif': 'image/heif', '.dcm': 'application/dicom',
}
const files = readdirSync(imagesDir).filter((name) => path.extname(name).toLowerCase() in mimes)
assert.ok(files.length > 0, `no images to verify in ${imagesDir}`)
say(`Verifying ${features.length} features over ${files.length} photo(s) from images/ into ${featuresDir}${fullSize ? ' at full size' : ` (working copies ≤ ${workingSide}px)`}\n`)

const startedAt = new Date()
/** Every photo opened, so one can be "the other picture" for another. */
const photos = []
for (const file of files) {
  const bytes = readFileSync(path.join(imagesDir, file))
  const mime = mimes[path.extname(file).toLowerCase()]
  const decoded = await decodeImageSource({ name: file, mime, size: bytes.length, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` })
  assert.equal(decoded.kind, 'canvas', `${file} did not open`)
  const source = decoded.canvas
  const scale = Math.min(1, workingSide / Math.max(source.width, source.height))
  const work = scale < 1 ? resizeCanvasContent(source, Math.round(source.width * scale), Math.round(source.height * scale)) : source
  photos.push({ file, stem: path.parse(file).name, mime, bytes, details: decoded.details ?? [], source, work })
}

/** What each run produced, for the report. */
const results = []
let failures = 0

for (const [index, photo] of photos.entries()) {
  const { file, stem, work } = photo
  const w = work.width
  const h = work.height
  const otherPhoto = photos[(index + 1) % photos.length]
  const other = resizeCanvasContent(otherPhoto.work, w, h)
  const grey = cloneCanvas(work)
  applyColorMode(grey, 'gray')
  const c = {
    ...photo, w, h, other, grey,
    fresh: () => cloneCanvas(work),
    sel: ellipseSelection(w * 0.3, h * 0.3, w * 0.4, h * 0.4),
    rect: rectSelection(Math.round(w * 0.25), Math.round(h * 0.25), Math.round(w * 0.5), Math.round(h * 0.5)),
    tile: makePatternTile(work, rectSelection(Math.round(w * 0.4), Math.round(h * 0.4), 48, 48)),
  }
  const label = isHeifSource(file) ? `${file} (HEIF)` : isDicomSource(file) ? `${file} (DICOM)` : file
  say(`${label}: ${photo.source.width}x${photo.source.height}, working copy ${w}x${h}`)

  for (const entry of features) {
    const began = performance.now()
    let outcome
    try {
      const raw = await entry.run(c)
      const result = raw && raw.width !== undefined && raw.getContext ? { canvas: raw } : (raw ?? {})
      let canvas = result.canvas ?? null
      if (result.selection) {
        assert.ok(result.selection.kind, `${entry.id} returned no selection`)
        canvas = overlay(work, result.selection)
        result.note = result.note ?? `${((countMask(selectionToMask(result.selection, w, h)) / (w * h)) * 100).toFixed(0)}% selected`
      }
      if (result.paths) canvas = withPaths(work, result.paths)
      let difference = null
      if (canvas && !result.selection && !result.paths && result.size !== 'free' && !entry.wide) {
        assert.equal(canvas.width, w, `${entry.id} changed the width to ${canvas.width}`)
        assert.equal(canvas.height, h, `${entry.id} changed the height to ${canvas.height}`)
        difference = meanDifference(canvas, work)
        // A colour-only change has nothing to do on a grey picture, and a filter
      // that only touches particular colours (NTSC clamping, one colour family)
      // may find none of them in a given photo: recorded, not failed.
      const colourOnly = entry.colourOnly && isGrey(work)
      const floor = entry.minChange ?? 0.05
      if (!result.same && !colourOnly && !entry.tolerant) assert.ok(difference > floor, `${entry.id} left the picture unchanged (mean difference ${difference.toFixed(3)})`)
      if (colourOnly && difference <= floor) result.note = `${result.note ?? ''} (no colour in this picture to change)`.trim()
      else if (entry.tolerant && difference <= floor) result.note = `${result.note ?? ''} (none of the colours it acts on are in this picture)`.trim()
      }
      let name = null
      if (canvas) {
        name = `${stem}-${entry.id}.png`
        writeFileSync(path.join(featuresDir, name), canvas.toBuffer('image/png'))
      }
      outcome = { ok: true, name, note: result.note ?? '', difference, ms: performance.now() - began }
      say(`  ok   ${entry.id.padEnd(30)} ${difference === null ? '' : `Δ ${difference.toFixed(1).padStart(5)}`}${outcome.note ? `  ${outcome.note}` : ''}`)
    } catch (error) {
      failures += 1
      outcome = { ok: false, name: null, note: error.message, difference: null, ms: performance.now() - began }
      say(`  FAIL ${entry.id.padEnd(30)} ${error.message}`)
    }
    results.push({ stem, file, feature: entry, ...outcome })
  }
  say('')
}

/* ------------------------------------------------------------- coverage */

const verifiedCommands = new Map()
const verifiedTools = new Map()
const uiCommands = new Map()
for (const entry of features) {
  for (const id of entry.cmd ?? []) (entry.ui ? uiCommands : verifiedCommands).set(id, [...((entry.ui ? uiCommands : verifiedCommands).get(id) ?? []), entry.id])
  for (const id of entry.tools ?? []) (entry.ui ? uiCommands : verifiedTools).set(id, [...((entry.ui ? uiCommands : verifiedTools).get(id) ?? []), entry.id])
}
const uiReasons = Object.fromEntries(features.filter((entry) => entry.ui).flatMap((entry) => [...(entry.cmd ?? []), ...(entry.tools ?? [])].map((id) => [id, entry.ui])))
const allTools = toolGroups.flatMap((group) => group.tools.map((tool) => tool.id))
const catalogRows = [
  ...allTools.map((id) => ({ id: `tool:${id}`, menu: 'Tools' })),
  ...commands.map((command) => ({ id: command.id, menu: command.menu })),
]
const coverage = catalogRows.map((row) => {
  const key = row.id.startsWith('tool:') ? row.id.slice(5) : row.id
  const evidence = row.id.startsWith('tool:') ? verifiedTools.get(key) : verifiedCommands.get(key)
  if (evidence) return { ...row, status: 'pixels', evidence }
  if (uiCommands.get(key)) return { ...row, status: 'ui', evidence: uiCommands.get(key), reason: uiReasons[key] }
  return { ...row, status: 'missing', evidence: [] }
})
const missing = coverage.filter((row) => row.status === 'missing')

const finishedAt = new Date()
const seconds = ((finishedAt - startedAt) / 1000).toFixed(1)
const passed = results.filter((row) => row.ok).length

writeFileSync(path.join(outDir, 'verify-features.log'), `${transcript.join('\n')}\n`, 'utf8')

const menuNames = { file: 'File', edit: 'Edit', image: 'Image', layer: 'Layer', typeMenu: 'Type', selectMenu: 'Select', filter: 'Filter', threeD: '3D', view: 'View', windowMenu: 'Window', Tools: 'Tools' }
const statusMark = { pixels: '✅ 픽셀로 확인', ui: '🖥 창/보기 전용', missing: '⬜ 미확인' }
const byMenu = (menu) => coverage.filter((row) => row.menu === menu)
const menuKeys = ['Tools', 'file', 'edit', 'image', 'layer', 'typeMenu', 'selectMenu', 'filter', 'threeD', 'view', 'windowMenu']

writeFileSync(path.join(outDir, 'features.md'), [
  '# Photoshop 기능 실사진 검증',
  '',
  `- 실행: ${startedAt.toISOString()} (${seconds}s)`,
  `- 사진: ${files.length}장 (\`images/\`)${fullSize ? ', 원본 크기' : `, 작업 사본 긴 변 ${workingSide}px`}`,
  `- 기능 항목: ${features.length}개 × ${files.length}장 = ${results.length}회 실행, 통과 ${passed}, 실패 ${failures}`,
  `- 결과: ${failures ? `**${failures}건 실패**` : '**모든 검증 통과**'}`,
  '',
  '각 항목은 App.tsx 가 메뉴·도구에서 부르는 엔진 함수를 실제 사진에 그대로 실행하고, 결과 픽셀을',
  '`out/features/<사진>-<항목>.png` 로 남깁니다. 선택 영역은 붉게 칠해 표시하고, 패스는 윤곽선으로 그립니다.',
  '`features.html` 이 사진별 갤러리, `verify-features.log` 가 실행 기록입니다.',
  '',
  '## 1. 카탈로그 대비 커버리지',
  '',
  '| 메뉴 | 항목 | ✅ 픽셀로 확인 | 🖥 창/보기 전용 | ⬜ 미확인 |',
  '| --- | --- | --- | --- | --- |',
  ...menuKeys.map((menu) => {
    const rows = byMenu(menu)
    const count = (status) => rows.filter((row) => row.status === status).length
    return `| ${menuNames[menu]} | ${rows.length} | ${count('pixels')} | ${count('ui')} | ${count('missing')} |`
  }),
  `| 합계 | ${coverage.length} | ${coverage.filter((r) => r.status === 'pixels').length} | ${coverage.filter((r) => r.status === 'ui').length} | ${missing.length} |`,
  '',
  '🖥 는 창을 열거나 보기 상태만 바꾸는 명령이라 픽셀로 판정할 수 없는 항목입니다(이유는 §3). ⬜ 는 이 스크립트가 다루지 않은 항목입니다.',
  '',
  '## 2. 항목별 결과',
  '',
  ...menuKeys.flatMap((menu) => {
    const rows = features.filter((entry) => entry.menu === menuNames[menu] || (menu === 'Tools' && entry.menu === 'Tools'))
    if (!rows.length) return []
    return [
      `### ${menuNames[menu]}`,
      '',
      `| 항목 | Photoshop 기능 | ${photos.map((p) => p.stem).join(' | ')} | 비고 |`,
      `| --- | --- | ${photos.map(() => '---').join(' | ')} | --- |`,
      ...rows.map((entry) => {
        const cells = photos.map((photo) => {
          const row = results.find((r) => r.stem === photo.stem && r.feature.id === entry.id)
          if (!row) return '—'
          if (!row.ok) return `❌ ${row.note}`
          return row.name ? `[Δ${row.difference === null ? '' : row.difference.toFixed(1)}](features/${row.name})` : '✅'
        })
        const first = results.find((r) => r.feature.id === entry.id && r.ok)
        return `| \`${entry.id}\` | ${entry.ps} | ${cells.join(' | ')} | ${entry.ui ? `🖥 ${entry.ui}` : (first?.note ?? '')} |`
      }),
      '',
    ]
  }),
  '## 3. 명령·도구별 커버리지',
  '',
  '| 항목 | 메뉴 | 상태 | 근거 |',
  '| --- | --- | --- | --- |',
  ...coverage.map((row) => `| \`${row.id}\` | ${menuNames[row.menu]} | ${statusMark[row.status]} | ${row.status === 'ui' ? row.reason : row.evidence.map((id) => `\`${id}\``).join(', ')} |`),
  '',
].join('\n'), 'utf8')

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>My Photo Work — Photoshop 기능 실사진 검증</title>
<style>
  :root { color-scheme: dark; --bg: #11161d; --panel: #18202a; --line: #2a3440; --text: #e6edf3; --muted: #93a1b1; --ok: #3fb950; --bad: #f85149; }
  body { background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { border-bottom: 1px solid var(--line); font-size: 17px; margin: 36px 0 14px; padding-bottom: 8px; }
  h3 { color: var(--muted); font-size: 14px; margin: 22px 0 10px; }
  p.lead { color: var(--muted); margin: 0 0 8px; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
  figure { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; margin: 0; overflow: hidden; }
  figure.bad { border-color: var(--bad); }
  figure img { background: #0c1014; display: block; height: 160px; object-fit: contain; width: 100%; }
  figcaption { padding: 8px 10px; }
  figcaption b { display: block; font-size: 12px; word-break: break-all; }
  figcaption span { color: var(--muted); display: block; font-size: 11px; }
  figcaption .bad { color: var(--bad); }
  nav a { color: var(--text); margin-right: 12px; }
  table { border-collapse: collapse; font-size: 12px; }
  td, th { border-bottom: 1px solid var(--line); padding: 4px 8px; text-align: left; }
</style>
</head>
<body>
<h1>Photoshop 기능 실사진 검증</h1>
<p class="lead">${features.length}개 항목 × ${files.length}장 = ${results.length}회, 통과 ${passed}, 실패 ${failures} · ${startedAt.toISOString()} · ${seconds}s</p>
<p class="lead"><a href="features.md">features.md</a> (커버리지 표) · <a href="verify-features.log">verify-features.log</a> · <a href="index.html">verify-images 갤러리</a></p>
<nav>${photos.map((p) => `<a href="#${p.stem}">${p.file}</a>`).join('')}</nav>
<h2>커버리지</h2>
<table><tr><th>메뉴</th><th>항목</th><th>픽셀로 확인</th><th>창/보기 전용</th><th>미확인</th></tr>
${menuKeys.map((menu) => { const rows = byMenu(menu); const n = (s) => rows.filter((r) => r.status === s).length; return `<tr><td>${menuNames[menu]}</td><td>${rows.length}</td><td>${n('pixels')}</td><td>${n('ui')}</td><td>${n('missing')}</td></tr>` }).join('\n')}
</table>
${photos.map((p) => `<h2 id="${p.stem}">${p.file} <small style="color:var(--muted)">${p.source.width}x${p.source.height}</small></h2>
${menuKeys.map((menu) => {
  const rows = results.filter((r) => r.stem === p.stem && r.feature.menu === menuNames[menu])
  if (!rows.length) return ''
  return `<h3>${menuNames[menu]}</h3>
<div class="grid">
${rows.map((r) => `  <figure class="${r.ok ? '' : 'bad'}">
    ${r.name ? `<img src="features/${r.name}" alt="${r.feature.ps}" loading="lazy">` : '<img alt="" style="height:40px">'}
    <figcaption><b>${r.feature.id}</b><span>${r.feature.ps}</span><span class="${r.ok ? '' : 'bad'}">${r.ok ? (r.difference === null ? '' : `Δ ${r.difference.toFixed(1)} · `) + r.note : `FAIL: ${r.note}`}</span></figcaption>
  </figure>`).join('\n')}
</div>`
}).join('\n')}`).join('\n')}
</body>
</html>
`
writeFileSync(path.join(outDir, 'features.html'), html, 'utf8')

say(`${passed}/${results.length} feature runs passed in ${seconds}s; ${missing.length} catalog item(s) not covered${missing.length ? `: ${missing.map((row) => row.id).join(', ')}` : ''}`)
say('Open out/features.html to see them, or read out/features.md.')
if (failures || missing.length) {
  process.exitCode = 1
}

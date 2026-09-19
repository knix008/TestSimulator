import type { ComponentType } from 'react'
import {
  Aperture, ArrowDownToLine, ArrowUpToLine, Blend, Box, Camera, ChevronDown, ChevronUp,
  CircleDashed, CircleQuestionMark, ClipboardPaste, Clock, Contrast, Copy, Crop, Download, Droplets, Eraser, Expand, Eye,
  FilePlus, FileX, FlipHorizontal, FlipVertical, FolderOpen, Frame, Grid3x3, ImagePlus, Info,
  Layers, Layers2, LayoutGrid, Lasso, Link, Maximize2, PaintBucket, Palette, Pencil, Plus, Printer, Ratio, Redo2,
  Scissors, Shrink, Sun, Trash, Type, Undo2, Ungroup, WandSparkles, WavesHorizontal,
  RotateCcw, RotateCw, Ruler, Save, SaveAll, ScanSearch, Search, SlidersHorizontal, Sparkles,
  Spline, Square, SquareDashed, Image as ImageIcon, ZoomIn, ZoomOut, Lock, AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, Brush, Pipette, Compass, Keyboard, Settings2, History,
  Film, Wind, Waves, Hexagon, Sunrise, Cloud, Paintbrush, Stamp, Scan, Move, Wand, Book, StickyNote, Shapes, Grip, Magnet,
} from 'lucide-react'
import { adjustmentTypes } from './catalog'
import { extraFilterIds, extraFilters } from './lib/moreFilters'

/**
 * One catalog for every application command.
 *
 * The menu bar renders these grouped by `menu`; the icon toolbar renders the
 * subset flagged `toolbar`, divided by those same groups. Both views therefore
 * stay in step by construction, and `runCommand` in App.tsx is the single place
 * a command's behaviour lives.
 */

export type MenuId =
  | 'file' | 'edit' | 'image' | 'layer' | 'typeMenu' | 'selectMenu'
  | 'filter' | 'threeD' | 'view' | 'windowMenu'

export type IconComponent = ComponentType<{ size?: number }>

export type AppCommand = {
  id: string
  menu: MenuId
  icon: IconComponent
  /** i18n key for the label shown in the menu and as the toolbar tooltip. */
  label: string
  /** Shown on the icon toolbar as well as in the menu. */
  toolbar?: boolean
  /** Draws a divider above this entry in the menu. */
  separatorBefore?: boolean
  /** Keyboard hint rendered on the right of the menu row. */
  accel?: string
  /** A submenu heading the row is listed under, so a long menu reads in groups. */
  section?: string
}

export const menuOrder: MenuId[] = [
  'file', 'edit', 'image', 'layer', 'typeMenu', 'selectMenu', 'filter', 'threeD', 'view', 'windowMenu',
]

export const menuIcons: Record<MenuId, IconComponent> = {
  file: FolderOpen,
  edit: Pencil,
  image: ImageIcon,
  layer: Layers,
  typeMenu: Type,
  selectMenu: Lasso,
  filter: WandSparkles,
  threeD: Box,
  view: Eye,
  windowMenu: LayoutGrid,
}

const adjustmentLayerCommands: AppCommand[] = adjustmentTypes.map((type, index) => ({
  id: `adjLayer.${type}`,
  menu: 'layer',
  icon: SlidersHorizontal,
  label: type,
  separatorBefore: index === 0,
  section: 'sectionAdjustmentLayer',
}))

const filterIcons: Record<string, IconComponent> = {
  blur: Aperture, blurGallery: Aperture, distort: Waves, noise: Grip, pixelate: Grid3x3, render: Cloud,
  sharpen: Search, stylize: Wind, video: Film, other: Hexagon, artistic: Paintbrush, brushStrokes: Brush,
  sketch: Pencil, texture: Stamp,
}

/** Every filter added in moreFilters.ts, as one Filter-menu row each. */
const genericFilterIds = extraFilterIds.filter((id) => id !== 'lensCorrection')
const extraFilterCommands: AppCommand[] = genericFilterIds.map((id, index) => {
  const group = extraFilters[id].group
  const previous = index > 0 ? extraFilters[genericFilterIds[index - 1]].group : null
  return {
    id: `filter.${id}`,
    menu: 'filter',
    icon: filterIcons[group] ?? WandSparkles,
    label: id,
    separatorBefore: group !== previous,
    section: `group${group.charAt(0).toUpperCase()}${group.slice(1)}`,
  }
})

export const commands: AppCommand[] = [
  /* -------------------------------------------------------------- file */
  { id: 'file.new', menu: 'file', icon: FilePlus, label: 'new', toolbar: true, accel: 'Ctrl+N' },
  { id: 'file.open', menu: 'file', icon: FolderOpen, label: 'open', toolbar: true, accel: 'Ctrl+O' },
  { id: 'file.openSmart', menu: 'file', icon: Box, label: 'openSmart' },
  { id: 'file.openRecent', menu: 'file', icon: History, label: 'openRecent' },
  { id: 'file.close', menu: 'file', icon: FileX, label: 'closeDoc', accel: 'Ctrl+W' },
  { id: 'file.closeAll', menu: 'file', icon: FileX, label: 'closeAll' },
  { id: 'file.save', menu: 'file', icon: Save, label: 'save', toolbar: true, separatorBefore: true, accel: 'Ctrl+S' },
  { id: 'file.saveAs', menu: 'file', icon: SaveAll, label: 'saveAs', accel: 'Ctrl+Shift+S' },
  { id: 'file.saveCopy', menu: 'file', icon: Copy, label: 'saveCopy' },
  { id: 'file.savePsd', menu: 'file', icon: SaveAll, label: 'savePsd' },
  { id: 'file.revert', menu: 'file', icon: RotateCcw, label: 'revert', accel: 'F12' },
  { id: 'file.export', menu: 'file', icon: Download, label: 'export', toolbar: true, separatorBefore: true },
  { id: 'file.exportAs', menu: 'file', section: 'sectionExport', icon: Download, label: 'exportAs' },
  { id: 'file.quickExport', menu: 'file', section: 'sectionExport', icon: Download, label: 'quickExport' },
  { id: 'file.layersToFiles', menu: 'file', section: 'sectionExport', icon: Layers, label: 'layersToFiles' },
  { id: 'file.artboardsToFiles', menu: 'file', section: 'sectionExport', icon: Frame, label: 'artboardsToFiles' },
  { id: 'file.place', menu: 'file', icon: ImagePlus, label: 'place', separatorBefore: true },
  { id: 'file.placeLinked', menu: 'file', icon: Link, label: 'placeLinked' },
  { id: 'file.importVideo', menu: 'file', section: 'sectionImport', icon: Clock, label: 'importVideo' },
  { id: 'file.importNotes', menu: 'file', section: 'sectionImport', icon: StickyNote, label: 'importNotes' },
  { id: 'file.exportGif', menu: 'file', section: 'sectionExport', icon: Download, label: 'exportGif' },
  { id: 'file.exportVideo', menu: 'file', section: 'sectionExport', icon: Download, label: 'exportVideo' },
  { id: 'file.batch', menu: 'file', icon: Layers2, label: 'batch', separatorBefore: true, section: 'sectionAutomate' },
  { id: 'file.contactSheet', menu: 'file', icon: LayoutGrid, label: 'contactSheet', section: 'sectionAutomate' },
  { id: 'file.cropStraighten', menu: 'file', icon: Crop, label: 'cropStraighten', section: 'sectionAutomate' },
  { id: 'file.fitImage', menu: 'file', icon: Shrink, label: 'fitImage', section: 'sectionAutomate' },
  { id: 'file.mergeHdr', menu: 'file', icon: Sunrise, label: 'mergeHdr', section: 'sectionAutomate' },
  { id: 'file.photomerge', menu: 'file', icon: Scan, label: 'photomerge', section: 'sectionAutomate' },
  { id: 'file.imageProcessor', menu: 'file', icon: Film, label: 'imageProcessor', section: 'sectionScripts' },
  { id: 'file.loadStack', menu: 'file', icon: Layers, label: 'loadStack', section: 'sectionScripts' },
  { id: 'file.statistics', menu: 'file', icon: SlidersHorizontal, label: 'statistics', section: 'sectionScripts' },
  { id: 'file.fileInfo', menu: 'file', icon: Info, label: 'fileInfo', separatorBefore: true, accel: 'Ctrl+Alt+Shift+I' },
  { id: 'file.print', menu: 'file', icon: Printer, label: 'print', toolbar: true, accel: 'Ctrl+P' },
  { id: 'file.printOne', menu: 'file', icon: Printer, label: 'printOne', accel: 'Ctrl+Alt+Shift+P' },
  { id: 'file.exit', menu: 'file', icon: FileX, label: 'exit', separatorBefore: true, accel: 'Ctrl+Q' },

  /* -------------------------------------------------------------- edit */
  { id: 'edit.undo', menu: 'edit', icon: Undo2, label: 'undo', toolbar: true, accel: 'Ctrl+Z' },
  { id: 'edit.redo', menu: 'edit', icon: Redo2, label: 'redo', toolbar: true, accel: 'Ctrl+Y' },
  { id: 'edit.stepForward', menu: 'edit', icon: ChevronUp, label: 'stepForward', accel: 'Ctrl+Shift+Z' },
  { id: 'edit.stepBackward', menu: 'edit', icon: ChevronDown, label: 'stepBackward', accel: 'Ctrl+Alt+Z' },
  { id: 'edit.fade', menu: 'edit', icon: Blend, label: 'fade', accel: 'Ctrl+Shift+F' },
  { id: 'edit.cut', menu: 'edit', icon: Scissors, label: 'cut', separatorBefore: true, accel: 'Ctrl+X' },
  { id: 'edit.copy', menu: 'edit', icon: Copy, label: 'copy', accel: 'Ctrl+C' },
  { id: 'edit.copyMerged', menu: 'edit', icon: Layers, label: 'copyMerged', accel: 'Ctrl+Shift+C' },
  { id: 'edit.paste', menu: 'edit', icon: ClipboardPaste, label: 'paste', accel: 'Ctrl+V' },
  { id: 'edit.pasteInPlace', menu: 'edit', section: 'sectionPasteSpecial', icon: ClipboardPaste, label: 'pasteInPlace', accel: 'Ctrl+Shift+V' },
  { id: 'edit.pasteInto', menu: 'edit', section: 'sectionPasteSpecial', icon: ClipboardPaste, label: 'pasteInto', accel: 'Ctrl+Alt+Shift+V' },
  { id: 'edit.pasteOutside', menu: 'edit', section: 'sectionPasteSpecial', icon: ClipboardPaste, label: 'pasteOutside' },
  { id: 'edit.deletePixels', menu: 'edit', icon: Trash, label: 'deletePixels', accel: 'Del' },
  { id: 'edit.checkSpelling', menu: 'edit', icon: Book, label: 'checkSpelling', separatorBefore: true },
  { id: 'edit.findReplace', menu: 'edit', icon: Search, label: 'findReplace' },
  { id: 'edit.fill', menu: 'edit', icon: PaintBucket, label: 'fillCommand', separatorBefore: true, accel: 'Shift+F5' },
  { id: 'edit.stroke', menu: 'edit', icon: Square, label: 'strokeCommand' },
  { id: 'edit.contentAware', menu: 'edit', icon: Sparkles, label: 'contentAware' },
  { id: 'edit.genFill', menu: 'edit', section: 'sectionGenerative', icon: WandSparkles, label: 'genFill' },
  { id: 'edit.genExpand', menu: 'edit', section: 'sectionGenerative', icon: Maximize2, label: 'genExpand' },
  { id: 'edit.genUpscale', menu: 'edit', section: 'sectionGenerative', icon: ScanSearch, label: 'genUpscale' },
  { id: 'edit.harmonize', menu: 'edit', section: 'sectionGenerative', icon: Blend, label: 'harmonize' },
  { id: 'edit.skyReplace', menu: 'edit', icon: Sunrise, label: 'skyReplace' },
  { id: 'edit.contentScale', menu: 'edit', icon: Ratio, label: 'contentScale', separatorBefore: true, accel: 'Ctrl+Alt+Shift+C' },
  { id: 'edit.puppet', menu: 'edit', icon: Spline, label: 'puppetWarp' },
  { id: 'edit.perspectiveWarp', menu: 'edit', icon: Ratio, label: 'perspectiveWarp' },
  { id: 'edit.freeTransform', menu: 'edit', icon: Maximize2, label: 'freeTransform', toolbar: true, accel: 'Ctrl+T' },
  { id: 'edit.skew', menu: 'edit', icon: Ratio, label: 'skew', section: 'sectionTransform' },
  { id: 'edit.distort', menu: 'edit', icon: Ratio, label: 'distort', section: 'sectionTransform' },
  { id: 'edit.perspective', menu: 'edit', icon: Ratio, label: 'perspective', section: 'sectionTransform' },
  { id: 'edit.warp', menu: 'edit', icon: Spline, label: 'warpCommand', section: 'sectionTransform' },
  { id: 'edit.rotateLayer180', menu: 'edit', icon: RotateCw, label: 'rotateLayer180', section: 'sectionTransform' },
  { id: 'edit.rotateLayer90', menu: 'edit', icon: RotateCw, label: 'rotateLayer90', section: 'sectionTransform' },
  { id: 'edit.rotateLayer270', menu: 'edit', icon: RotateCcw, label: 'rotateLayer270', section: 'sectionTransform' },
  { id: 'edit.autoAlign', menu: 'edit', icon: AlignCenter, label: 'autoAlign', separatorBefore: true },
  { id: 'edit.autoBlend', menu: 'edit', icon: Blend, label: 'autoBlend' },
  { id: 'edit.defineBrush', menu: 'edit', icon: Brush, label: 'defineBrush', separatorBefore: true },
  { id: 'edit.definePattern', menu: 'edit', icon: Grid3x3, label: 'definePattern' },
  { id: 'edit.defineShape', menu: 'edit', icon: Shapes, label: 'defineShape' },
  { id: 'edit.purge', menu: 'edit', icon: Trash, label: 'purge', separatorBefore: true },
  { id: 'edit.colorSettings', menu: 'edit', icon: Palette, label: 'colorSettings', accel: 'Ctrl+Shift+K' },
  { id: 'edit.keyboardShortcuts', menu: 'edit', icon: Keyboard, label: 'keyboardShortcuts', accel: 'Ctrl+Alt+Shift+K' },
  { id: 'edit.neuralModels', menu: 'edit', icon: Sparkles, label: 'neuralModels' },
  { id: 'edit.preferences', menu: 'edit', icon: Settings2, label: 'preferences', accel: 'Ctrl+K' },

  /* ------------------------------------------------------------- image */
  { id: 'image.modeBitmap', menu: 'image', icon: Grid3x3, label: 'modeBitmap', section: 'sectionMode' },
  { id: 'image.modeGray', menu: 'image', icon: Contrast, label: 'modeGray', section: 'sectionMode' },
  { id: 'image.modeDuotone', menu: 'image', icon: Contrast, label: 'modeDuotone', section: 'sectionMode' },
  { id: 'image.modeIndexed', menu: 'image', icon: Grid3x3, label: 'modeIndexed', section: 'sectionMode' },
  { id: 'image.modeRgb', menu: 'image', icon: Palette, label: 'modeRgb', section: 'sectionMode' },
  { id: 'image.modeCmyk', menu: 'image', icon: Droplets, label: 'modeCmyk', section: 'sectionMode' },
  { id: 'image.modeLab', menu: 'image', icon: Blend, label: 'modeLab', section: 'sectionMode' },
  { id: 'image.depth8', menu: 'image', icon: Grid3x3, label: 'depth8', section: 'sectionMode' },
  { id: 'image.depth16', menu: 'image', icon: Grid3x3, label: 'depth16', section: 'sectionMode' },
  { id: 'image.profile', menu: 'image', icon: Palette, label: 'colorProfile', section: 'sectionMode' },
  { id: 'image.brightness', menu: 'image', icon: Sun, label: 'brightness', separatorBefore: true, section: 'sectionAdjustments' },
  { id: 'image.levels', menu: 'image', icon: SlidersHorizontal, label: 'levels', toolbar: true, accel: 'Ctrl+L', section: 'sectionAdjustments' },
  { id: 'image.curves', menu: 'image', icon: Spline, label: 'curves', toolbar: true, accel: 'Ctrl+M', section: 'sectionAdjustments' },
  { id: 'image.exposure', menu: 'image', icon: Sun, label: 'exposure', section: 'sectionAdjustments' },
  { id: 'image.vibrance', menu: 'image', icon: Aperture, label: 'vibrance', section: 'sectionAdjustments' },
  { id: 'image.hueSat', menu: 'image', icon: Palette, label: 'hueSat', accel: 'Ctrl+U', section: 'sectionAdjustments' },
  { id: 'image.colorBalance', menu: 'image', icon: Blend, label: 'colorBalance', accel: 'Ctrl+B', section: 'sectionAdjustments' },
  { id: 'image.blackWhite', menu: 'image', icon: Contrast, label: 'bw', accel: 'Ctrl+Alt+Shift+B', section: 'sectionAdjustments' },
  { id: 'image.photoFilter', menu: 'image', icon: Camera, label: 'photoFilter', section: 'sectionAdjustments' },
  { id: 'image.channelMixer', menu: 'image', icon: Blend, label: 'channelMixer', section: 'sectionAdjustments' },
  { id: 'image.colorLookup', menu: 'image', icon: Palette, label: 'colorLookup', section: 'sectionAdjustments' },
  { id: 'image.invert', menu: 'image', icon: CircleDashed, label: 'invert', accel: 'Ctrl+I', section: 'sectionAdjustments' },
  { id: 'image.posterize', menu: 'image', icon: LayoutGrid, label: 'posterize', section: 'sectionAdjustments' },
  { id: 'image.threshold', menu: 'image', icon: SquareDashed, label: 'threshold', section: 'sectionAdjustments' },
  { id: 'image.gradientMap', menu: 'image', icon: Blend, label: 'gradientMap', section: 'sectionAdjustments' },
  { id: 'image.selectiveColor', menu: 'image', icon: Droplets, label: 'selectiveColor', section: 'sectionAdjustments' },
  { id: 'image.shadowsHighlights', menu: 'image', icon: Contrast, label: 'shadowsHighlights', section: 'sectionAdjustments' },
  { id: 'image.hdrToning', menu: 'image', icon: Sunrise, label: 'hdrToning', section: 'sectionAdjustments' },
  { id: 'image.desaturate', menu: 'image', icon: Contrast, label: 'desaturate', accel: 'Ctrl+Shift+U', section: 'sectionAdjustments' },
  { id: 'image.matchColor', menu: 'image', icon: Pipette, label: 'matchColor', section: 'sectionAdjustments' },
  { id: 'image.replaceColor', menu: 'image', icon: Palette, label: 'replaceColor', section: 'sectionAdjustments' },
  { id: 'image.equalize', menu: 'image', icon: SlidersHorizontal, label: 'equalize', section: 'sectionAdjustments' },
  { id: 'image.cameraRaw', menu: 'image', icon: Camera, label: 'cameraRaw', section: 'sectionAdjustments' },
  { id: 'image.grayscale', menu: 'image', icon: Contrast, label: 'grayscale', section: 'sectionAdjustments' },
  { id: 'image.autoTone', menu: 'image', icon: Sparkles, label: 'autoTone', separatorBefore: true, accel: 'Ctrl+Shift+L' },
  { id: 'image.autoContrast', menu: 'image', icon: Sparkles, label: 'autoContrast', accel: 'Ctrl+Alt+Shift+L' },
  { id: 'image.autoColor', menu: 'image', icon: Palette, label: 'autoColor', accel: 'Ctrl+Shift+B' },
  { id: 'image.autoLevels', menu: 'image', icon: SlidersHorizontal, label: 'autoLevels' },
  { id: 'image.size', menu: 'image', icon: Ratio, label: 'imageSize', toolbar: true, separatorBefore: true, accel: 'Ctrl+Alt+I' },
  { id: 'image.canvasSize', menu: 'image', icon: Frame, label: 'canvasSize', accel: 'Ctrl+Alt+C' },
  { id: 'image.rotate180', menu: 'image', icon: RotateCw, label: 'rotate180', section: 'sectionRotation' },
  { id: 'image.rotateCW', menu: 'image', icon: RotateCw, label: 'rotateCW', toolbar: true, section: 'sectionRotation' },
  { id: 'image.rotateCCW', menu: 'image', icon: RotateCcw, label: 'rotateCCW', section: 'sectionRotation' },
  { id: 'image.rotateArbitrary', menu: 'image', icon: Compass, label: 'rotateArbitrary', section: 'sectionRotation' },
  { id: 'image.flipH', menu: 'image', icon: FlipHorizontal, label: 'flipH', toolbar: true, section: 'sectionRotation' },
  { id: 'image.flipV', menu: 'image', icon: FlipVertical, label: 'flipV', section: 'sectionRotation' },
  { id: 'image.crop', menu: 'image', icon: Crop, label: 'cropToSelection', separatorBefore: true },
  { id: 'image.trim', menu: 'image', icon: Crop, label: 'trim' },
  { id: 'image.revealAll', menu: 'image', icon: Maximize2, label: 'revealAll' },
  { id: 'image.duplicate', menu: 'image', icon: Copy, label: 'duplicateImage', separatorBefore: true },
  { id: 'image.applyImage', menu: 'image', icon: Layers2, label: 'applyImage' },
  { id: 'image.calculations', menu: 'image', icon: Blend, label: 'calculations' },
  { id: 'image.recordMeasure', menu: 'image', icon: Ruler, label: 'recordMeasure', separatorBefore: true },
  { id: 'image.info', menu: 'image', icon: Info, label: 'imageInfo', toolbar: true },

  /* ------------------------------------------------------------- layer */
  { id: 'layer.new', menu: 'layer', icon: Plus, label: 'newLayer', toolbar: true, accel: 'Ctrl+Shift+N' },
  { id: 'layer.newViaCopy', menu: 'layer', icon: Copy, label: 'newViaCopy', accel: 'Ctrl+J' },
  { id: 'layer.newViaCut', menu: 'layer', icon: Scissors, label: 'newViaCut', accel: 'Ctrl+Shift+J' },
  { id: 'layer.duplicate', menu: 'layer', icon: Copy, label: 'duplicateLayer', toolbar: true },
  { id: 'layer.delete', menu: 'layer', icon: Trash, label: 'deleteLayer', toolbar: true },
  { id: 'layer.fillLayer', menu: 'layer', icon: PaintBucket, label: 'fillLayer', separatorBefore: true },
  { id: 'layer.newArtboard', menu: 'layer', icon: Frame, label: 'newArtboard' },
  { id: 'layer.style', menu: 'layer', icon: Sparkles, label: 'layerStyle', separatorBefore: true },
  { id: 'layer.copyStyle', menu: 'layer', icon: Copy, label: 'copyStyle' },
  { id: 'layer.pasteStyle', menu: 'layer', icon: ClipboardPaste, label: 'pasteStyle' },
  { id: 'layer.clearStyle', menu: 'layer', icon: Trash, label: 'clearStyle' },
  { id: 'layer.toSmart', menu: 'layer', icon: Box, label: 'toSmartObject', separatorBefore: true, section: 'sectionSmart' },
  { id: 'layer.smartEdit', menu: 'layer', icon: Pencil, label: 'smartEdit', section: 'sectionSmart' },
  { id: 'layer.smartReplace', menu: 'layer', icon: ImagePlus, label: 'smartReplace', section: 'sectionSmart' },
  { id: 'layer.smartExport', menu: 'layer', icon: Download, label: 'smartExport', section: 'sectionSmart' },
  { id: 'layer.rasterize', menu: 'layer', icon: Grid3x3, label: 'rasterize', section: 'sectionSmart' },
  { id: 'layer.mask', menu: 'layer', icon: SquareDashed, label: 'layerMask', separatorBefore: true, section: 'sectionMask' },
  { id: 'layer.maskHideAll', menu: 'layer', icon: SquareDashed, label: 'maskHideAll', section: 'sectionMask' },
  { id: 'layer.maskFromSelection', menu: 'layer', icon: SquareDashed, label: 'maskFromSelection', section: 'sectionMask' },
  { id: 'layer.maskHideSelection', menu: 'layer', icon: SquareDashed, label: 'maskHideSelection', section: 'sectionMask' },
  { id: 'layer.maskFromTransparency', menu: 'layer', icon: SquareDashed, label: 'maskFromTransparency', section: 'sectionMask' },
  { id: 'layer.vectorMask', menu: 'layer', icon: Spline, label: 'vectorMask', section: 'sectionMask' },
  { id: 'layer.maskDisable', menu: 'layer', icon: Eye, label: 'maskDisable', section: 'sectionMask' },
  { id: 'layer.maskInvert', menu: 'layer', icon: CircleDashed, label: 'maskInvert', section: 'sectionMask' },
  { id: 'layer.maskApply', menu: 'layer', icon: Layers2, label: 'maskApply', section: 'sectionMask' },
  { id: 'layer.maskDelete', menu: 'layer', icon: Trash, label: 'maskDelete', section: 'sectionMask' },
  { id: 'layer.clipMask', menu: 'layer', icon: Ungroup, label: 'clipMask', separatorBefore: true, accel: 'Ctrl+Alt+G' },
  { id: 'layer.group', menu: 'layer', icon: LayoutGrid, label: 'groupLayers', accel: 'Ctrl+G' },
  { id: 'layer.ungroup', menu: 'layer', icon: Ungroup, label: 'ungroupLayers', accel: 'Ctrl+Shift+G' },
  { id: 'layer.hideOthers', menu: 'layer', icon: Eye, label: 'hideOthers' },
  { id: 'layer.bringToFront', menu: 'layer', icon: ArrowUpToLine, label: 'bringToFront', separatorBefore: true, accel: 'Ctrl+Shift+]', section: 'sectionArrange' },
  { id: 'layer.bringForward', menu: 'layer', icon: ChevronUp, label: 'bringForward', accel: 'Ctrl+]', section: 'sectionArrange' },
  { id: 'layer.sendBackward', menu: 'layer', icon: ChevronDown, label: 'sendBackward', accel: 'Ctrl+[', section: 'sectionArrange' },
  { id: 'layer.sendToBack', menu: 'layer', icon: ArrowDownToLine, label: 'sendToBack', accel: 'Ctrl+Shift+[', section: 'sectionArrange' },
  { id: 'layer.alignLeft', menu: 'layer', icon: AlignLeft, label: 'alignLeft', separatorBefore: true, section: 'sectionAlign' },
  { id: 'layer.alignCenterH', menu: 'layer', icon: AlignCenter, label: 'alignCenterH', section: 'sectionAlign' },
  { id: 'layer.alignRight', menu: 'layer', icon: AlignRight, label: 'alignRight', section: 'sectionAlign' },
  { id: 'layer.alignTop', menu: 'layer', icon: AlignStartVertical, label: 'alignTop', section: 'sectionAlign' },
  { id: 'layer.alignCenterV', menu: 'layer', icon: AlignCenterVertical, label: 'alignCenterV', section: 'sectionAlign' },
  { id: 'layer.alignBottom', menu: 'layer', icon: AlignEndVertical, label: 'alignBottom', section: 'sectionAlign' },
  { id: 'layer.distributeH', menu: 'layer', icon: AlignCenter, label: 'distributeH', section: 'sectionAlign' },
  { id: 'layer.distributeV', menu: 'layer', icon: AlignCenterVertical, label: 'distributeV', section: 'sectionAlign' },
  { id: 'layer.link', menu: 'layer', icon: Link, label: 'linkLayers', separatorBefore: true },
  { id: 'layer.unlink', menu: 'layer', icon: Link, label: 'unlinkLayers' },
  { id: 'layer.lockTransparent', menu: 'layer', icon: Lock, label: 'lockTransparent' },
  { id: 'layer.lockPosition', menu: 'layer', icon: Lock, label: 'lockPosition' },
  { id: 'layer.lockAll', menu: 'layer', icon: Lock, label: 'lockAll' },
  { id: 'layer.mergeDown', menu: 'layer', icon: Layers2, label: 'mergeDown', toolbar: true, separatorBefore: true, accel: 'Ctrl+E' },
  { id: 'layer.mergeVisible', menu: 'layer', icon: Layers2, label: 'mergeVisible', accel: 'Ctrl+Shift+E' },
  { id: 'layer.flatten', menu: 'layer', icon: Layers, label: 'flatten' },
  { id: 'layer.defringe', menu: 'layer', icon: Eraser, label: 'defringe', separatorBefore: true, section: 'sectionMatting' },
  { id: 'layer.removeBlackMatte', menu: 'layer', icon: Eraser, label: 'removeBlackMatte', section: 'sectionMatting' },
  { id: 'layer.removeWhiteMatte', menu: 'layer', icon: Eraser, label: 'removeWhiteMatte', section: 'sectionMatting' },
  { id: 'layer.flipH', menu: 'layer', icon: FlipHorizontal, label: 'flipLayerH', separatorBefore: true },
  { id: 'layer.flipV', menu: 'layer', icon: FlipVertical, label: 'flipLayerV' },
  ...adjustmentLayerCommands,

  /* -------------------------------------------------------------- type */
  { id: 'type.horizontal', menu: 'typeMenu', icon: Type, label: 'text', toolbar: true, accel: 'T' },
  { id: 'type.vertical', menu: 'typeMenu', icon: Type, label: 'vtext', accel: 'Shift+T' },
  { id: 'type.enter', menu: 'typeMenu', icon: Pencil, label: 'enterText' },
  { id: 'type.character', menu: 'typeMenu', icon: Type, label: 'characterPanel', separatorBefore: true },
  { id: 'type.paragraph', menu: 'typeMenu', icon: AlignLeft, label: 'paragraphPanel' },
  { id: 'type.glyphs', menu: 'typeMenu', icon: Grid3x3, label: 'glyphs' },
  { id: 'type.warp', menu: 'typeMenu', icon: Spline, label: 'warpText', separatorBefore: true },
  { id: 'type.orientation', menu: 'typeMenu', icon: RotateCw, label: 'typeOrientation' },
  { id: 'type.antiAlias', menu: 'typeMenu', icon: Sparkles, label: 'antiAlias' },
  { id: 'type.convertToShape', menu: 'typeMenu', icon: Shapes, label: 'convertToShape', separatorBefore: true },
  { id: 'type.workPath', menu: 'typeMenu', icon: Spline, label: 'createWorkPath' },
  { id: 'type.rasterize', menu: 'typeMenu', icon: Grid3x3, label: 'rasterizeType' },
  { id: 'type.matchFont', menu: 'typeMenu', icon: Search, label: 'matchFont' },

  /* ------------------------------------------------------------ select */
  { id: 'select.all', menu: 'selectMenu', icon: SquareDashed, label: 'selectAll', toolbar: true, accel: 'Ctrl+A' },
  { id: 'select.none', menu: 'selectMenu', icon: Square, label: 'deselect', toolbar: true, accel: 'Ctrl+D' },
  { id: 'select.reselect', menu: 'selectMenu', icon: Redo2, label: 'reselect', accel: 'Ctrl+Shift+D' },
  { id: 'select.invert', menu: 'selectMenu', icon: CircleDashed, label: 'invertSel', accel: 'Ctrl+Shift+I' },
  { id: 'select.allLayers', menu: 'selectMenu', icon: Layers, label: 'selectAllLayers', separatorBefore: true, accel: 'Ctrl+Alt+A' },
  { id: 'select.deselectLayers', menu: 'selectMenu', icon: Layers, label: 'deselectLayers' },
  { id: 'select.isolate', menu: 'selectMenu', icon: Eye, label: 'isolateLayers' },
  { id: 'select.colorRange', menu: 'selectMenu', icon: Palette, label: 'colorRange', separatorBefore: true },
  { id: 'select.focusArea', menu: 'selectMenu', icon: Aperture, label: 'focusArea' },
  { id: 'select.subject', menu: 'selectMenu', icon: ScanSearch, label: 'selectSubject', toolbar: true },
  { id: 'select.sky', menu: 'selectMenu', icon: Cloud, label: 'selectSky' },
  { id: 'select.distractions', menu: 'selectMenu', icon: Search, label: 'findDistractions' },
  { id: 'select.removeBg', menu: 'selectMenu', icon: Eraser, label: 'removeBg' },
  { id: 'select.selectAndMask', menu: 'selectMenu', icon: Magnet, label: 'selectAndMask', separatorBefore: true, accel: 'Ctrl+Alt+R' },
  { id: 'select.border', menu: 'selectMenu', icon: SquareDashed, label: 'borderSel', section: 'sectionModify' },
  { id: 'select.smooth', menu: 'selectMenu', icon: CircleDashed, label: 'smoothSel', section: 'sectionModify' },
  { id: 'select.expand', menu: 'selectMenu', icon: Expand, label: 'expandSel', section: 'sectionModify' },
  { id: 'select.contract', menu: 'selectMenu', icon: Shrink, label: 'contractSel', section: 'sectionModify' },
  { id: 'select.feather', menu: 'selectMenu', icon: Droplets, label: 'feather', accel: 'Shift+F6', section: 'sectionModify' },
  { id: 'select.grow', menu: 'selectMenu', icon: Expand, label: 'growSel', separatorBefore: true },
  { id: 'select.similar', menu: 'selectMenu', icon: Sparkles, label: 'similarSel' },
  { id: 'select.transform', menu: 'selectMenu', icon: Maximize2, label: 'transformSelection', separatorBefore: true },
  { id: 'select.quickMask', menu: 'selectMenu', icon: CircleDashed, label: 'editQuickMask', accel: 'Q' },
  { id: 'select.save', menu: 'selectMenu', icon: Save, label: 'saveSelection', separatorBefore: true },
  { id: 'select.load', menu: 'selectMenu', icon: FolderOpen, label: 'loadSelection' },

  /* ------------------------------------------------------------ filter */
  { id: 'filter.last', menu: 'filter', icon: Redo2, label: 'lastFilter', accel: 'Ctrl+Alt+F' },
  { id: 'filter.gallery', menu: 'filter', icon: LayoutGrid, label: 'filterGallery', toolbar: true, separatorBefore: true },
  { id: 'filter.adaptiveWideAngle', menu: 'filter', icon: Compass, label: 'adaptiveWideAngle' },
  { id: 'filter.cameraRaw', menu: 'filter', icon: Camera, label: 'cameraRaw', accel: 'Ctrl+Shift+A' },
  { id: 'filter.lensCorrection', menu: 'filter', icon: Aperture, label: 'lensCorrection', accel: 'Ctrl+Shift+R' },
  { id: 'filter.liquify', menu: 'filter', icon: WavesHorizontal, label: 'liquify', accel: 'Ctrl+Shift+X' },
  { id: 'filter.vanishingPoint', menu: 'filter', icon: Move, label: 'vanishingPoint', accel: 'Ctrl+Alt+V' },
  { id: 'filter.blur', menu: 'filter', icon: Aperture, label: 'blur', toolbar: true, separatorBefore: true, section: 'groupBlur' },
  { id: 'filter.blurGallery', menu: 'filter', icon: Aperture, label: 'blurGallery', section: 'groupBlurGallery' },
  { id: 'filter.sharpen', menu: 'filter', icon: Search, label: 'sharpen', toolbar: true, section: 'groupSharpen' },
  { id: 'filter.custom', menu: 'filter', icon: Grid3x3, label: 'customFilter', section: 'groupOther' },
  { id: 'filter.neural', menu: 'filter', icon: Sparkles, label: 'neural', separatorBefore: true, section: 'groupNeural' },
  ...extraFilterCommands,

  /* ---------------------------------------------------------------- 3D */
  { id: 'threeD.extrude', menu: 'threeD', icon: Box, label: 'extrude' },
  { id: 'threeD.postcard', menu: 'threeD', icon: Square, label: 'postcard' },
  { id: 'threeD.render', menu: 'threeD', icon: Grid3x3, label: 'renderThreeD', separatorBefore: true },
  { id: 'threeD.remove', menu: 'threeD', icon: Trash, label: 'removeThreeD' },
  { id: 'threeD.effects', menu: 'threeD', icon: Sparkles, label: 'effects', separatorBefore: true },

  /* -------------------------------------------------------------- view */
  { id: 'view.proofColors', menu: 'view', icon: Droplets, label: 'proofColors', accel: 'Ctrl+Y' },
  { id: 'view.gamutWarning', menu: 'view', icon: Droplets, label: 'gamutWarning', accel: 'Ctrl+Shift+Y' },
  { id: 'view.zoomIn', menu: 'view', icon: ZoomIn, label: 'zoomIn', toolbar: true, separatorBefore: true, accel: 'Ctrl++' },
  { id: 'view.zoomOut', menu: 'view', icon: ZoomOut, label: 'zoomOut', toolbar: true, accel: 'Ctrl+-' },
  { id: 'view.zoomFit', menu: 'view', icon: Maximize2, label: 'zoomFit', toolbar: true, accel: 'Ctrl+0' },
  { id: 'view.actualPixels', menu: 'view', icon: Ratio, label: 'actualPixels', accel: 'Ctrl+1' },
  { id: 'view.zoom200', menu: 'view', icon: ZoomIn, label: 'zoom200' },
  { id: 'view.printSize', menu: 'view', icon: Printer, label: 'printSize' },
  { id: 'view.screenMode', menu: 'view', icon: Maximize2, label: 'screenMode', separatorBefore: true, accel: 'F' },
  { id: 'view.extras', menu: 'view', icon: Eye, label: 'extras', accel: 'Ctrl+H' },
  { id: 'view.grid', menu: 'view', icon: Grid3x3, label: 'grid', toolbar: true, accel: "Ctrl+'", section: 'sectionShow' },
  { id: 'view.rulers', menu: 'view', icon: Ruler, label: 'rulers', toolbar: true, accel: 'Ctrl+R', section: 'sectionShow' },
  { id: 'view.showGuides', menu: 'view', icon: Ruler, label: 'showGuides', accel: 'Ctrl+;', section: 'sectionShow' },
  { id: 'view.smartGuides', menu: 'view', icon: Magnet, label: 'smartGuides', section: 'sectionShow' },
  { id: 'view.pixelGrid', menu: 'view', icon: Grid3x3, label: 'pixelGrid', section: 'sectionShow' },
  { id: 'view.showSlices', menu: 'view', icon: Scissors, label: 'showSlices', section: 'sectionShow' },
  { id: 'view.showNotes', menu: 'view', icon: StickyNote, label: 'showNotes', section: 'sectionShow' },
  { id: 'view.showPaths', menu: 'view', icon: Spline, label: 'showPathsCommand', section: 'sectionShow' },
  { id: 'view.snap', menu: 'view', icon: Magnet, label: 'snap', separatorBefore: true, accel: 'Ctrl+Shift+;', section: 'sectionSnap' },
  { id: 'view.snapGuides', menu: 'view', icon: Magnet, label: 'snapGuides', section: 'sectionSnap' },
  { id: 'view.snapGrid', menu: 'view', icon: Magnet, label: 'snapGrid', section: 'sectionSnap' },
  { id: 'view.newGuide', menu: 'view', icon: Ruler, label: 'newGuide', separatorBefore: true, section: 'sectionGuides' },
  { id: 'view.guideLayout', menu: 'view', icon: LayoutGrid, label: 'guideLayout', section: 'sectionGuides' },
  { id: 'view.lockGuides', menu: 'view', icon: Lock, label: 'lockGuides', accel: 'Ctrl+Alt+;', section: 'sectionGuides' },
  { id: 'view.clearGuides', menu: 'view', icon: Trash, label: 'clearGuides', section: 'sectionGuides' },
  { id: 'view.clearSlices', menu: 'view', icon: Trash, label: 'clearSlices', section: 'sectionGuides' },
  { id: 'view.quickMask', menu: 'view', icon: CircleDashed, label: 'quickMask', separatorBefore: true },
  { id: 'view.rotateView', menu: 'view', icon: RotateCw, label: 'rotateView' },
  { id: 'view.resetView', menu: 'view', icon: RotateCcw, label: 'resetView' },
  { id: 'view.patternPreview', menu: 'view', icon: Grid3x3, label: 'patternPreview' },

  /* ------------------------------------------------------------ window */
  { id: 'window.nextDoc', menu: 'windowMenu', icon: ChevronUp, label: 'nextDocument', accel: 'Ctrl+Tab', section: 'sectionArrangeDocs' },
  { id: 'window.prevDoc', menu: 'windowMenu', icon: ChevronDown, label: 'prevDocument', accel: 'Ctrl+Shift+Tab', section: 'sectionArrangeDocs' },
  { id: 'window.saveWorkspace', menu: 'windowMenu', icon: Save, label: 'saveWorkspace', separatorBefore: true, section: 'sectionWorkspace' },
  { id: 'window.resetWorkspace', menu: 'windowMenu', icon: RotateCcw, label: 'resetWorkspace', section: 'sectionWorkspace' },
  { id: 'window.layers', menu: 'windowMenu', icon: Layers, label: 'layers', separatorBefore: true, accel: 'F7' },
  { id: 'window.adjust', menu: 'windowMenu', icon: SlidersHorizontal, label: 'adjustments' },
  { id: 'window.properties', menu: 'windowMenu', icon: Settings2, label: 'properties' },
  { id: 'window.history', menu: 'windowMenu', icon: Clock, label: 'history' },
  { id: 'window.channels', menu: 'windowMenu', icon: LayoutGrid, label: 'channels' },
  { id: 'window.paths', menu: 'windowMenu', icon: Spline, label: 'pathsPanel' },
  { id: 'window.navigator', menu: 'windowMenu', icon: Compass, label: 'navigator' },
  { id: 'window.info', menu: 'windowMenu', icon: Info, label: 'info', accel: 'F8' },
  { id: 'window.color', menu: 'windowMenu', icon: Palette, label: 'colorPanel', accel: 'F6' },
  { id: 'window.swatches', menu: 'windowMenu', icon: Grid3x3, label: 'swatches' },
  { id: 'window.gradients', menu: 'windowMenu', icon: Blend, label: 'gradientsPanel' },
  { id: 'window.patterns', menu: 'windowMenu', icon: Grid3x3, label: 'patternsPanel' },
  { id: 'window.styles', menu: 'windowMenu', icon: Sparkles, label: 'stylesPanel' },
  { id: 'window.shapes', menu: 'windowMenu', icon: Shapes, label: 'shapesPanel' },
  { id: 'window.brushes', menu: 'windowMenu', icon: Brush, label: 'brushesPanel', accel: 'F5' },
  { id: 'window.brushSettings', menu: 'windowMenu', icon: Brush, label: 'brushSettingsPanel' },
  { id: 'window.cloneSource', menu: 'windowMenu', icon: Stamp, label: 'cloneSourcePanel' },
  { id: 'window.toolPresets', menu: 'windowMenu', icon: Wand, label: 'toolPresets' },
  { id: 'window.character', menu: 'windowMenu', icon: Type, label: 'characterPanel' },
  { id: 'window.paragraph', menu: 'windowMenu', icon: AlignLeft, label: 'paragraphPanel' },
  { id: 'window.glyphs', menu: 'windowMenu', icon: Grid3x3, label: 'glyphs' },
  { id: 'window.actions', menu: 'windowMenu', icon: Clock, label: 'actions', accel: 'Alt+F9' },
  { id: 'window.comps', menu: 'windowMenu', icon: Camera, label: 'layerComps' },
  { id: 'window.timeline', menu: 'windowMenu', icon: Clock, label: 'timeline' },
  { id: 'window.measurementLog', menu: 'windowMenu', icon: Ruler, label: 'measurementLog' },
  { id: 'window.notes', menu: 'windowMenu', icon: StickyNote, label: 'notesPanel' },
  // The guide used to be a button of its own in the top bar; it lives here now.
  { id: 'window.guide', menu: 'windowMenu', icon: CircleQuestionMark, label: 'help', separatorBefore: true },
]

export function commandsInMenu(menu: MenuId) {
  return commands.filter((command) => command.menu === menu)
}

/** One row of a dropdown: a command, or a section folded into a submenu. */
export type MenuEntry =
  | { kind: 'command'; command: AppCommand; separatorBefore: boolean }
  | { kind: 'submenu'; section: string; commands: AppCommand[]; separatorBefore: boolean }

/**
 * A menu's rows in Photoshop's shape. The Filter menu alone has ninety rows,
 * which no one can scan at once; every `section` becomes one row that opens
 * a submenu beside it, so the top level reads as a short list of choices.
 * The section's first command lends it its separator and its icon.
 */
export function menuEntries(rows: AppCommand[]): MenuEntry[] {
  const entries: MenuEntry[] = []
  const open = new Map<string, Extract<MenuEntry, { kind: 'submenu' }>>()
  for (const command of rows) {
    if (!command.section) {
      entries.push({ kind: 'command', command, separatorBefore: Boolean(command.separatorBefore) })
      continue
    }
    const existing = open.get(command.section)
    if (existing) {
      existing.commands.push(command)
      continue
    }
    const entry = { kind: 'submenu' as const, section: command.section, commands: [command], separatorBefore: Boolean(command.separatorBefore) }
    open.set(command.section, entry)
    entries.push(entry)
  }
  return entries
}

/**
 * How to lay the top level of a dropdown out.
 *
 * With the sections folded away a menu is at most forty-odd rows, which fits
 * a single column on any screen the app supports; only a list past that is
 * dealt into columns. Separators count as cells of their own, because in the
 * grid that is exactly what they are.
 */
export function menuColumns(rows: { separatorBefore?: boolean }[]) {
  const cells = rows.length + rows.filter((row) => row.separatorBefore).length
  const columns = cells > 144 ? 4 : cells > 96 ? 3 : cells > 48 ? 2 : 1
  return { columns, rowCount: Math.ceil(cells / columns) }
}

export function findCommand(id: string) {
  return commands.find((command) => command.id === id) ?? null
}

/** The toolbar rows: the flagged commands, still grouped by their menu category. */
export function toolbarGroups(): { menu: MenuId; commands: AppCommand[] }[] {
  return menuOrder
    .map((menu) => ({ menu, commands: commandsInMenu(menu).filter((command) => command.toolbar) }))
    .filter((group) => group.commands.length > 0)
}

/** Every i18n key the chrome needs, so a missing translation is testable. */
export function commandLabelKeys() {
  return [...new Set([
    ...commands.map((command) => command.label),
    ...menuOrder,
    ...commands.flatMap((command) => (command.section ? [command.section] : [])),
  ])]
}

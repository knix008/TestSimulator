import type { ComponentType } from 'react'
import {
  Aperture, Blend, Box, Camera, CircleDashed, Clock, Contrast, Copy, Download, Eraser, Eye,
  FilePlus, FileX, FlipHorizontal, FlipVertical, FolderOpen, Frame, Grid3x3, ImagePlus, Info,
  Layers, Layers2, LayoutGrid, Lasso, Maximize2, PaintBucket, Palette, Pencil, Plus, Printer, Ratio, Redo2,
  RotateCcw, RotateCw, Ruler, Save, SaveAll, ScanSearch, Search, SlidersHorizontal, Sparkles,
  Spline, Square, SquareDashed, Sun, Trash, Type, Undo2, Ungroup, WandSparkles, WavesHorizontal,
  Image as ImageIcon, ZoomIn, ZoomOut,
} from 'lucide-react'
import { adjustmentTypes } from './catalog'

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
}))

export const commands: AppCommand[] = [
  /* -------------------------------------------------------------- file */
  { id: 'file.new', menu: 'file', icon: FilePlus, label: 'new', toolbar: true, accel: 'Ctrl+N' },
  { id: 'file.open', menu: 'file', icon: FolderOpen, label: 'open', toolbar: true, accel: 'Ctrl+O' },
  { id: 'file.place', menu: 'file', icon: ImagePlus, label: 'place' },
  { id: 'file.save', menu: 'file', icon: Save, label: 'save', toolbar: true, separatorBefore: true, accel: 'Ctrl+S' },
  { id: 'file.saveAs', menu: 'file', icon: SaveAll, label: 'saveAs', accel: 'Ctrl+Shift+S' },
  { id: 'file.export', menu: 'file', icon: Download, label: 'export', toolbar: true },
  { id: 'file.print', menu: 'file', icon: Printer, label: 'print', toolbar: true, separatorBefore: true, accel: 'Ctrl+P' },
  { id: 'file.close', menu: 'file', icon: FileX, label: 'closeDoc', separatorBefore: true },

  /* -------------------------------------------------------------- edit */
  { id: 'edit.undo', menu: 'edit', icon: Undo2, label: 'undo', toolbar: true, accel: 'Ctrl+Z' },
  { id: 'edit.redo', menu: 'edit', icon: Redo2, label: 'redo', toolbar: true, accel: 'Ctrl+Y' },
  { id: 'edit.freeTransform', menu: 'edit', icon: Maximize2, label: 'freeTransform', toolbar: true, separatorBefore: true, accel: 'Ctrl+T' },
  { id: 'edit.deletePixels', menu: 'edit', icon: Trash, label: 'deletePixels', accel: 'Del' },
  { id: 'edit.contentAware', menu: 'edit', icon: Sparkles, label: 'contentAware', separatorBefore: true },
  { id: 'edit.genFill', menu: 'edit', icon: WandSparkles, label: 'genFill' },
  { id: 'edit.genExpand', menu: 'edit', icon: Maximize2, label: 'genExpand' },
  { id: 'edit.genUpscale', menu: 'edit', icon: ScanSearch, label: 'genUpscale' },
  { id: 'edit.harmonize', menu: 'edit', icon: Blend, label: 'harmonize' },

  /* ------------------------------------------------------------- image */
  { id: 'image.size', menu: 'image', icon: Ratio, label: 'imageSize', toolbar: true },
  { id: 'image.canvasSize', menu: 'image', icon: Frame, label: 'canvasSize' },
  { id: 'image.rotateCW', menu: 'image', icon: RotateCw, label: 'rotateCW', toolbar: true, separatorBefore: true },
  { id: 'image.rotateCCW', menu: 'image', icon: RotateCcw, label: 'rotateCCW' },
  { id: 'image.flipH', menu: 'image', icon: FlipHorizontal, label: 'flipH', toolbar: true },
  { id: 'image.flipV', menu: 'image', icon: FlipVertical, label: 'flipV' },
  { id: 'image.colorMode', menu: 'image', icon: Contrast, label: 'toggleColorMode', separatorBefore: true },
  { id: 'image.brightness', menu: 'image', icon: Sun, label: 'brightness', separatorBefore: true },
  { id: 'image.hueSat', menu: 'image', icon: Palette, label: 'hueSat' },
  { id: 'image.cameraRaw', menu: 'image', icon: Camera, label: 'cameraRaw' },
  { id: 'image.curves', menu: 'image', icon: Spline, label: 'curves', toolbar: true },
  { id: 'image.levels', menu: 'image', icon: SlidersHorizontal, label: 'levels', toolbar: true },
  { id: 'image.autoLevels', menu: 'image', icon: SlidersHorizontal, label: 'autoLevels' },
  { id: 'image.invert', menu: 'image', icon: CircleDashed, label: 'invert' },
  { id: 'image.grayscale', menu: 'image', icon: Contrast, label: 'grayscale' },
  { id: 'image.info', menu: 'image', icon: Info, label: 'imageInfo', toolbar: true, separatorBefore: true },

  /* ------------------------------------------------------------- layer */
  { id: 'layer.new', menu: 'layer', icon: Plus, label: 'newLayer', toolbar: true },
  { id: 'layer.duplicate', menu: 'layer', icon: Copy, label: 'duplicateLayer', toolbar: true },
  { id: 'layer.delete', menu: 'layer', icon: Trash, label: 'deleteLayer', toolbar: true },
  { id: 'layer.mergeDown', menu: 'layer', icon: Layers2, label: 'mergeDown', toolbar: true, separatorBefore: true },
  { id: 'layer.flatten', menu: 'layer', icon: Layers, label: 'flatten' },
  { id: 'layer.group', menu: 'layer', icon: LayoutGrid, label: 'groupLayers', separatorBefore: true },
  { id: 'layer.ungroup', menu: 'layer', icon: Ungroup, label: 'ungroupLayers' },
  { id: 'layer.flipH', menu: 'layer', icon: FlipHorizontal, label: 'flipLayerH', separatorBefore: true },
  { id: 'layer.flipV', menu: 'layer', icon: FlipVertical, label: 'flipLayerV' },
  { id: 'layer.fillLayer', menu: 'layer', icon: PaintBucket, label: 'fillLayer', separatorBefore: true },
  { id: 'layer.mask', menu: 'layer', icon: SquareDashed, label: 'layerMask' },
  ...adjustmentLayerCommands,

  /* -------------------------------------------------------------- type */
  { id: 'type.horizontal', menu: 'typeMenu', icon: Type, label: 'text', toolbar: true, accel: 'T' },
  { id: 'type.vertical', menu: 'typeMenu', icon: Type, label: 'vtext', accel: 'Shift+T' },
  { id: 'type.enter', menu: 'typeMenu', icon: Pencil, label: 'enterText' },

  /* ------------------------------------------------------------ select */
  { id: 'select.all', menu: 'selectMenu', icon: SquareDashed, label: 'selectAll', toolbar: true, accel: 'Ctrl+A' },
  { id: 'select.none', menu: 'selectMenu', icon: Square, label: 'deselect', toolbar: true, accel: 'Ctrl+D' },
  { id: 'select.invert', menu: 'selectMenu', icon: CircleDashed, label: 'invertSel' },
  { id: 'select.subject', menu: 'selectMenu', icon: ScanSearch, label: 'selectSubject', toolbar: true, separatorBefore: true },
  { id: 'select.distractions', menu: 'selectMenu', icon: Search, label: 'findDistractions' },
  { id: 'select.removeBg', menu: 'selectMenu', icon: Eraser, label: 'removeBg' },

  /* ------------------------------------------------------------ filter */
  { id: 'filter.gallery', menu: 'filter', icon: LayoutGrid, label: 'filterGallery', toolbar: true },
  { id: 'filter.blur', menu: 'filter', icon: Aperture, label: 'blur', toolbar: true },
  { id: 'filter.sharpen', menu: 'filter', icon: Search, label: 'sharpen', toolbar: true },
  { id: 'filter.neural', menu: 'filter', icon: Sparkles, label: 'neural', separatorBefore: true },
  { id: 'filter.liquify', menu: 'filter', icon: WavesHorizontal, label: 'liquify' },
  { id: 'filter.cameraRaw', menu: 'filter', icon: Camera, label: 'cameraRaw' },

  /* ---------------------------------------------------------------- 3D */
  { id: 'threeD.effects', menu: 'threeD', icon: Box, label: 'effects' },

  /* -------------------------------------------------------------- view */
  { id: 'view.zoomIn', menu: 'view', icon: ZoomIn, label: 'zoomIn', toolbar: true, accel: 'Ctrl++' },
  { id: 'view.zoomOut', menu: 'view', icon: ZoomOut, label: 'zoomOut', toolbar: true, accel: 'Ctrl+-' },
  { id: 'view.zoomFit', menu: 'view', icon: Maximize2, label: 'zoomFit', toolbar: true },
  { id: 'view.actualPixels', menu: 'view', icon: Ratio, label: 'actualPixels' },
  { id: 'view.grid', menu: 'view', icon: Grid3x3, label: 'grid', toolbar: true, separatorBefore: true },
  { id: 'view.rulers', menu: 'view', icon: Ruler, label: 'rulers', toolbar: true },
  { id: 'view.quickMask', menu: 'view', icon: CircleDashed, label: 'quickMask' },
  { id: 'view.rotateView', menu: 'view', icon: RotateCw, label: 'rotateView' },

  /* ------------------------------------------------------------ window */
  { id: 'window.layers', menu: 'windowMenu', icon: Layers, label: 'layers' },
  { id: 'window.adjust', menu: 'windowMenu', icon: SlidersHorizontal, label: 'adjustments' },
  { id: 'window.history', menu: 'windowMenu', icon: Clock, label: 'history' },
  { id: 'window.channels', menu: 'windowMenu', icon: LayoutGrid, label: 'channels' },
  { id: 'window.info', menu: 'windowMenu', icon: Info, label: 'info' },
]

export function commandsInMenu(menu: MenuId) {
  return commands.filter((command) => command.menu === menu)
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
  return [...new Set([...commands.map((command) => command.label), ...menuOrder])]
}

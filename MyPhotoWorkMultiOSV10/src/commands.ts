import type { ComponentType } from 'react'
import {
  ALargeSmall, AlignCenterHorizontal, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignHorizontalSpaceAround, AlignJustify, AlignLeft, AlignRight,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalSpaceAround, Anchor, Aperture, ArrowDownToLine, ArrowLeftToLine,
  ArrowRightToLine, ArrowUpNarrowWide, ArrowUpToLine, BadgeHelp, BadgeMinus, Ban, Barcode, Baseline,
  BetweenHorizontalStart, Binary, Binoculars, Blend, Blocks, Bolt, Book, BookLock, Bookmark, BookMarked,
  BookmarkPlus, BookOpenCheck, Box, Boxes, Brain, BrainCircuit, Brush, BrushCleaning, Calculator, Camera,
  CameraOff, CaseSensitive, ChartColumn, ChartColumnIncreasing, ChartNoAxesColumnIncreasing, ChartSpline,
  ChevronDown, ChevronsUpDown, ChevronUp, CircleDashed, CircleGauge, CircleHelp, CircleMinus, CircleOff,
  CirclePlus, CircleSlash, CircleSlash2, CircleSmall, Clipboard, ClipboardCheck, ClipboardCopy,
  ClipboardList, ClipboardPaste, ClipboardType, ClipboardX, Clock, Cloud, CloudDrizzle, CloudFog,
  CloudSunRain, Cloudy, Cog, Columns2, Columns3, Combine, Compass, Cone, Contrast, Copy, CopyCheck,
  CopyMinus, CopyPlus, Copyright, CornerDownLeft, Crop as CropIcon, Crosshair, Cuboid, Delete, Download,
  DropletOff, Droplets, Eclipse, Equal, EqualApproximately, Eraser, Expand, Eye, EyeClosed, EyeOff, Feather,
  FileClock, FileDown, FileImage, FileOutput, FilePen, FilePlus, FilePlus2, Files, FileStack, FileText,
  FileType, FileVideo, FileX, Film, Filter, FlaskConical, FlipHorizontal, FlipVertical, FlipVertical2,
  Flower2, Focus, FolderClock, FolderInput, FolderMinus, FolderOpen, FolderSymlink, FolderX, FoldHorizontal,
  FoldVertical, Frame, Fullscreen, GalleryThumbnails, GalleryVerticalEnd, Gauge, Gem, GitMerge, Glasses,
  Grid2x2, Grid2x2Check, Grid2x2X, Grid3x3, Grip, Group, Hash, Hexagon, Highlighter, History,
  Image as ImageIcon, ImageMinus, ImagePlus, Images, ImageUpscale, Info, IterationCcw, IterationCw,
  Keyboard, LampCeiling, Languages, Lasso, LassoSelect, Layers, Layers2, LayersMinus, LayersPlus,
  LayoutDashboard, LayoutGrid, LayoutPanelLeft, LayoutTemplate, LibraryBig, LineChart, Link, Link2,
  ListChecks, ListFilter, ListFilterPlus, ListRestart, ListTree, Lock, LockKeyhole, LogOut, Logs,
  Magnet as MagnetIcon, Maximize, Maximize2, Medal, Merge, MessageSquareDashed, Minimize, Monitor, MoonStar,
  Move, MoveDiagonal, Newspaper, NotebookPen, Package, PackageOpen, PaintBucket, Palette, PanelRight,
  Pencil, PenLine, Pentagon, PenTool, Pilcrow, Pin, Pipette, Play, Plus, Printer, PrinterCheck, Proportions,
  Pyramid, Radius, Rainbow, Ratio, RectangleHorizontal, RectangleVertical, Recycle, Redo2, RefreshCcw,
  RefreshCw, RemoveFormatting, Repeat, Repeat1, Repeat2, Replace, ReplaceAll, RotateCcw, RotateCcwSquare,
  RotateCw, RotateCwSquare, Route, Rows2, Rows4, Ruler, RulerDimensionLine, Save, SaveAll, SaveCheck, Scale,
  Scale3d, Scaling, Scan, ScanEye, ScanFace, ScanLine, ScanSearch, Scissors, Search, SeparatorHorizontal,
  SeparatorVertical, Settings, Settings2, Shapes, Share2, ShieldCheck, Shrink, Sigma, SkipBack, SkipForward,
  Slice, SlidersHorizontal, SlidersVertical, Sparkle, Sparkles, Spline, SplinePointer, Square,
  SquareAsterisk, SquareCheck, SquareChevronRight, SquareDashed, SquareDashedBottom,
  SquareDashedMousePointer, SquareDot, SquareEqual, SquareMinus, SquareOff, SquarePen, SquareRoundCorner,
  SquareSlash, SquareSplitHorizontal, SquareSplitVertical, SquareStack, SquareX, StickyNote, Sun, SunDim,
  SunMedium, SunMoon, Sunrise, Sunset, SunSnow, SwatchBook, SwitchCamera, Table, Table2, TableProperties,
  Telescope, TextAlignCenter, TextSelect, ToggleLeft, ToolCase, Tornado, Trash, Triangle, TriangleAlert,
  Type, TypeOutline, Undo2, Ungroup, Unlink, VenetianMask, Wallpaper, WandSparkles, Waves, WavesArrowUp,
  Waypoints, Wrench, ZoomIn, ZoomOut
} from 'lucide-react'
import { adjustmentTypes } from './catalog'
import { filterIcon } from './filterInfo'
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
  /** A row the user can take off the menu, such as a recent file. */
  forgettable?: boolean
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

/** An icon per adjustment, so the Layer menu's twenty-one rows are told apart. */
export const adjustmentIcons: Record<string, IconComponent> = {
  brightness: LampCeiling,
  levels: ChartColumnIncreasing,
  curves: ChartSpline,
  hue: Flower2,
  colorBalance: Scale3d,
  vibrance: SunSnow,
  bw: Columns3,
  invert: ToggleLeft,
  posterize: Barcode,
  threshold: AlignVerticalJustifyStart,
  exposure: CircleSlash2,
  photoFilter: Glasses,
  clarity: Focus,
  dehaze: CloudSunRain,
  grain: Grip,
  shadowsHighlights: MoonStar,
  channelMixer: GitMerge,
  selectiveColor: ListFilterPlus,
  gradientMap: Rows4,
  equalize: AlignHorizontalDistributeCenter,
  colorLookup: TableProperties,
}

const adjustmentLayerCommands: AppCommand[] = adjustmentTypes.map((type, index) => ({
  id: `adjLayer.${type}`,
  menu: 'layer',
  icon: adjustmentIcons[type] ?? SlidersHorizontal,
  label: type,
  separatorBefore: index === 0,
  section: 'sectionAdjustmentLayer',
}))


/** Every filter added in moreFilters.ts, as one Filter-menu row each. */
const genericFilterIds = extraFilterIds.filter((id) => id !== 'lensCorrection')
const extraFilterCommands: AppCommand[] = genericFilterIds.map((id, index) => {
  const group = extraFilters[id].group
  const previous = index > 0 ? extraFilters[genericFilterIds[index - 1]].group : null
  return {
    id: `filter.${id}`,
    menu: 'filter',
    // The same icon the Filter Gallery shows, so the menu and the gallery
    // agree and no two rows of one group look alike.
    icon: filterIcon(id),
    label: id,
    separatorBefore: group !== previous,
    section: `group${group.charAt(0).toUpperCase()}${group.slice(1)}`,
  }
})

export const commands: AppCommand[] = [
  /* -------------------------------------------------------------- file */
  { id: 'file.new', menu: 'file', icon: FilePlus, label: 'new', toolbar: true, accel: 'Ctrl+N' },
  { id: 'file.open', menu: 'file', icon: FolderOpen, label: 'open', toolbar: true, accel: 'Ctrl+O' },
  { id: 'file.openSmart', menu: 'file', icon: PackageOpen, label: 'openSmart' },
  { id: 'file.openRecent', menu: 'file', icon: FolderClock, label: 'openRecent' },
  { id: 'file.close', menu: 'file', icon: FileX, label: 'closeDoc', accel: 'Ctrl+W' },
  { id: 'file.closeAll', menu: 'file', icon: FolderX, label: 'closeAll' },
  { id: 'file.save', menu: 'file', icon: Save, label: 'save', toolbar: true, separatorBefore: true, accel: 'Ctrl+S' },
  { id: 'file.saveAs', menu: 'file', icon: SaveAll, label: 'saveAs', accel: 'Ctrl+Shift+S' },
  { id: 'file.saveCopy', menu: 'file', icon: FilePlus2, label: 'saveCopy' },
  { id: 'file.savePsd', menu: 'file', icon: SaveCheck, label: 'savePsd' },
  { id: 'file.revert', menu: 'file', icon: FileClock, label: 'revert', accel: 'F12' },
  { id: 'file.export', menu: 'file', icon: Download, label: 'export', toolbar: true, separatorBefore: true },
  { id: 'file.exportAs', menu: 'file', section: 'sectionExport', icon: FileOutput, label: 'exportAs' },
  { id: 'file.quickExport', menu: 'file', section: 'sectionExport', icon: FileDown, label: 'quickExport' },
  { id: 'file.layersToFiles', menu: 'file', section: 'sectionExport', icon: FileStack, label: 'layersToFiles' },
  { id: 'file.artboardsToFiles', menu: 'file', section: 'sectionExport', icon: FolderSymlink, label: 'artboardsToFiles' },
  { id: 'file.place', menu: 'file', icon: ImagePlus, label: 'place', separatorBefore: true },
  { id: 'file.placeLinked', menu: 'file', icon: Link, label: 'placeLinked' },
  { id: 'file.importVideo', menu: 'file', section: 'sectionImport', icon: Clock, label: 'importVideo' },
  { id: 'file.importNotes', menu: 'file', section: 'sectionImport', icon: NotebookPen, label: 'importNotes' },
  { id: 'file.exportGif', menu: 'file', section: 'sectionExport', icon: FileImage, label: 'exportGif' },
  { id: 'file.exportVideo', menu: 'file', section: 'sectionExport', icon: FileVideo, label: 'exportVideo' },
  { id: 'file.batch', menu: 'file', icon: Repeat, label: 'batch', separatorBefore: true, section: 'sectionAutomate' },
  { id: 'file.contactSheet', menu: 'file', icon: LayoutGrid, label: 'contactSheet', section: 'sectionAutomate' },
  { id: 'file.cropStraighten', menu: 'file', icon: ScanLine, label: 'cropStraighten', section: 'sectionAutomate' },
  { id: 'file.fitImage', menu: 'file', icon: Shrink, label: 'fitImage', section: 'sectionAutomate' },
  { id: 'file.mergeHdr', menu: 'file', icon: SunMedium, label: 'mergeHdr', section: 'sectionAutomate' },
  { id: 'file.photomerge', menu: 'file', icon: Scan, label: 'photomerge', section: 'sectionAutomate' },
  { id: 'file.imageProcessor', menu: 'file', icon: Cog, label: 'imageProcessor', section: 'sectionScripts' },
  { id: 'file.loadStack', menu: 'file', icon: LibraryBig, label: 'loadStack', section: 'sectionScripts' },
  { id: 'file.statistics', menu: 'file', icon: ChartColumn, label: 'statistics', section: 'sectionScripts' },
  { id: 'file.fileInfo', menu: 'file', icon: FileText, label: 'fileInfo', separatorBefore: true, accel: 'Ctrl+Alt+Shift+I' },
  { id: 'file.print', menu: 'file', icon: Printer, label: 'print', toolbar: true, accel: 'Ctrl+P' },
  { id: 'file.printOne', menu: 'file', icon: PrinterCheck, label: 'printOne', accel: 'Ctrl+Alt+Shift+P' },
  { id: 'file.exit', menu: 'file', icon: LogOut, label: 'exit', separatorBefore: true, accel: 'Ctrl+Q' },

  /* -------------------------------------------------------------- edit */
  { id: 'edit.undo', menu: 'edit', icon: Undo2, label: 'undo', toolbar: true, accel: 'Ctrl+Z' },
  { id: 'edit.redo', menu: 'edit', icon: Redo2, label: 'redo', toolbar: true, accel: 'Ctrl+Y' },
  { id: 'edit.stepForward', menu: 'edit', icon: SkipForward, label: 'stepForward', accel: 'Ctrl+Shift+Z' },
  { id: 'edit.stepBackward', menu: 'edit', icon: SkipBack, label: 'stepBackward', accel: 'Ctrl+Alt+Z' },
  { id: 'edit.fade', menu: 'edit', icon: CloudDrizzle, label: 'fade', accel: 'Ctrl+Shift+F' },
  { id: 'edit.cut', menu: 'edit', icon: Scissors, label: 'cut', separatorBefore: true, accel: 'Ctrl+X' },
  { id: 'edit.copy', menu: 'edit', icon: Copy, label: 'copy', accel: 'Ctrl+C' },
  { id: 'edit.copyMerged', menu: 'edit', icon: CopyPlus, label: 'copyMerged', accel: 'Ctrl+Shift+C' },
  { id: 'edit.paste', menu: 'edit', icon: ClipboardPaste, label: 'paste', accel: 'Ctrl+V' },
  { id: 'edit.pasteInPlace', menu: 'edit', section: 'sectionPasteSpecial', icon: ClipboardCheck, label: 'pasteInPlace', accel: 'Ctrl+Shift+V' },
  { id: 'edit.pasteInto', menu: 'edit', section: 'sectionPasteSpecial', icon: ClipboardType, label: 'pasteInto', accel: 'Ctrl+Alt+Shift+V' },
  { id: 'edit.pasteOutside', menu: 'edit', section: 'sectionPasteSpecial', icon: ClipboardX, label: 'pasteOutside' },
  { id: 'edit.deletePixels', menu: 'edit', icon: Eraser, label: 'deletePixels', accel: 'Del' },
  { id: 'edit.checkSpelling', menu: 'edit', icon: Book, label: 'checkSpelling', separatorBefore: true },
  { id: 'edit.findReplace', menu: 'edit', icon: Search, label: 'findReplace' },
  { id: 'edit.fill', menu: 'edit', icon: PaintBucket, label: 'fillCommand', separatorBefore: true, accel: 'Shift+F5' },
  { id: 'edit.stroke', menu: 'edit', icon: Square, label: 'strokeCommand' },
  { id: 'edit.contentAware', menu: 'edit', icon: Sparkles, label: 'contentAware' },
  { id: 'edit.genFill', menu: 'edit', section: 'sectionGenerative', icon: WandSparkles, label: 'genFill' },
  { id: 'edit.genExpand', menu: 'edit', section: 'sectionGenerative', icon: Expand, label: 'genExpand' },
  { id: 'edit.genUpscale', menu: 'edit', section: 'sectionGenerative', icon: ImageUpscale, label: 'genUpscale' },
  { id: 'edit.harmonize', menu: 'edit', section: 'sectionGenerative', icon: Combine, label: 'harmonize' },
  { id: 'edit.skyReplace', menu: 'edit', icon: Sunrise, label: 'skyReplace' },
  { id: 'edit.contentScale', menu: 'edit', icon: Scaling, label: 'contentScale', separatorBefore: true, accel: 'Ctrl+Alt+Shift+C' },
  { id: 'edit.puppet', menu: 'edit', icon: Pin, label: 'puppetWarp' },
  { id: 'edit.perspectiveWarp', menu: 'edit', icon: Cone, label: 'perspectiveWarp' },
  { id: 'edit.freeTransform', menu: 'edit', icon: MoveDiagonal, label: 'freeTransform', toolbar: true, accel: 'Ctrl+T' },
  { id: 'edit.skew', menu: 'edit', icon: Triangle, label: 'skew', section: 'sectionTransform' },
  { id: 'edit.distort', menu: 'edit', icon: Tornado, label: 'distort', section: 'sectionTransform' },
  { id: 'edit.perspective', menu: 'edit', icon: Pyramid, label: 'perspective', section: 'sectionTransform' },
  { id: 'edit.warp', menu: 'edit', icon: WavesArrowUp, label: 'warpCommand', section: 'sectionTransform' },
  { id: 'edit.rotateLayer180', menu: 'edit', icon: RefreshCcw, label: 'rotateLayer180', section: 'sectionTransform' },
  { id: 'edit.rotateLayer90', menu: 'edit', icon: RotateCwSquare, label: 'rotateLayer90', section: 'sectionTransform' },
  { id: 'edit.rotateLayer270', menu: 'edit', icon: RotateCcwSquare, label: 'rotateLayer270', section: 'sectionTransform' },
  { id: 'edit.autoAlign', menu: 'edit', icon: TextAlignCenter, label: 'autoAlign', separatorBefore: true },
  { id: 'edit.autoBlend', menu: 'edit', icon: Merge, label: 'autoBlend' },
  { id: 'edit.defineBrush', menu: 'edit', icon: Brush, label: 'defineBrush', separatorBefore: true },
  { id: 'edit.definePattern', menu: 'edit', icon: Blocks, label: 'definePattern' },
  { id: 'edit.defineShape', menu: 'edit', icon: Hexagon, label: 'defineShape' },
  { id: 'edit.purge', menu: 'edit', icon: Recycle, label: 'purge', separatorBefore: true },
  { id: 'edit.colorSettings', menu: 'edit', icon: Settings, label: 'colorSettings', accel: 'Ctrl+Shift+K' },
  { id: 'edit.keyboardShortcuts', menu: 'edit', icon: Keyboard, label: 'keyboardShortcuts', accel: 'Ctrl+Alt+Shift+K' },
  { id: 'edit.neuralModels', menu: 'edit', icon: BrainCircuit, label: 'neuralModels' },
  { id: 'edit.preferences', menu: 'edit', icon: Settings2, label: 'preferences', accel: 'Ctrl+K' },

  /* ------------------------------------------------------------- image */
  { id: 'image.modeBitmap', menu: 'image', icon: Binary, label: 'modeBitmap', section: 'sectionMode' },
  { id: 'image.modeGray', menu: 'image', icon: Columns2, label: 'modeGray', section: 'sectionMode' },
  { id: 'image.modeDuotone', menu: 'image', icon: Eclipse, label: 'modeDuotone', section: 'sectionMode' },
  { id: 'image.modeIndexed', menu: 'image', icon: Table2, label: 'modeIndexed', section: 'sectionMode' },
  { id: 'image.modeRgb', menu: 'image', icon: CircleSmall, label: 'modeRgb', section: 'sectionMode' },
  { id: 'image.modeCmyk', menu: 'image', icon: Droplets, label: 'modeCmyk', section: 'sectionMode' },
  { id: 'image.modeLab', menu: 'image', icon: FlaskConical, label: 'modeLab', section: 'sectionMode' },
  { id: 'image.depth8', menu: 'image', icon: Hash, label: 'depth8', section: 'sectionMode' },
  { id: 'image.depth16', menu: 'image', icon: Bolt, label: 'depth16', section: 'sectionMode' },
  { id: 'image.profile', menu: 'image', icon: BookMarked, label: 'colorProfile', section: 'sectionMode' },
  { id: 'image.brightness', menu: 'image', icon: Sun, label: 'brightness', separatorBefore: true, section: 'sectionAdjustments' },
  { id: 'image.levels', menu: 'image', icon: SlidersHorizontal, label: 'levels', toolbar: true, accel: 'Ctrl+L', section: 'sectionAdjustments' },
  { id: 'image.curves', menu: 'image', icon: LineChart, label: 'curves', toolbar: true, accel: 'Ctrl+M', section: 'sectionAdjustments' },
  { id: 'image.exposure', menu: 'image', icon: Aperture, label: 'exposure', section: 'sectionAdjustments' },
  { id: 'image.vibrance', menu: 'image', icon: SunDim, label: 'vibrance', section: 'sectionAdjustments' },
  { id: 'image.hueSat', menu: 'image', icon: Rainbow, label: 'hueSat', accel: 'Ctrl+U', section: 'sectionAdjustments' },
  { id: 'image.colorBalance', menu: 'image', icon: Scale, label: 'colorBalance', accel: 'Ctrl+B', section: 'sectionAdjustments' },
  { id: 'image.blackWhite', menu: 'image', icon: Contrast, label: 'bw', accel: 'Ctrl+Alt+Shift+B', section: 'sectionAdjustments' },
  { id: 'image.photoFilter', menu: 'image', icon: Camera, label: 'photoFilter', section: 'sectionAdjustments' },
  { id: 'image.channelMixer', menu: 'image', icon: SlidersVertical, label: 'channelMixer', section: 'sectionAdjustments' },
  { id: 'image.colorLookup', menu: 'image', icon: Table, label: 'colorLookup', section: 'sectionAdjustments' },
  { id: 'image.invert', menu: 'image', icon: CircleOff, label: 'invert', accel: 'Ctrl+I', section: 'sectionAdjustments' },
  { id: 'image.posterize', menu: 'image', icon: SquareStack, label: 'posterize', section: 'sectionAdjustments' },
  { id: 'image.threshold', menu: 'image', icon: SeparatorHorizontal, label: 'threshold', section: 'sectionAdjustments' },
  { id: 'image.gradientMap', menu: 'image', icon: Rows2, label: 'gradientMap', section: 'sectionAdjustments' },
  { id: 'image.selectiveColor', menu: 'image', icon: Filter, label: 'selectiveColor', section: 'sectionAdjustments' },
  { id: 'image.shadowsHighlights', menu: 'image', icon: SunMoon, label: 'shadowsHighlights', section: 'sectionAdjustments' },
  { id: 'image.hdrToning', menu: 'image', icon: Sunset, label: 'hdrToning', section: 'sectionAdjustments' },
  { id: 'image.desaturate', menu: 'image', icon: DropletOff, label: 'desaturate', accel: 'Ctrl+Shift+U', section: 'sectionAdjustments' },
  { id: 'image.matchColor', menu: 'image', icon: EqualApproximately, label: 'matchColor', section: 'sectionAdjustments' },
  { id: 'image.replaceColor', menu: 'image', icon: Replace, label: 'replaceColor', section: 'sectionAdjustments' },
  { id: 'image.equalize', menu: 'image', icon: AlignVerticalJustifyCenter, label: 'equalize', section: 'sectionAdjustments' },
  { id: 'image.cameraRaw', menu: 'image', icon: CameraOff, label: 'cameraRaw', section: 'sectionAdjustments' },
  { id: 'image.grayscale', menu: 'image', icon: CircleSlash, label: 'grayscale', section: 'sectionAdjustments' },
  { id: 'image.autoTone', menu: 'image', icon: Gauge, label: 'autoTone', separatorBefore: true, accel: 'Ctrl+Shift+L' },
  { id: 'image.autoContrast', menu: 'image', icon: CircleGauge, label: 'autoContrast', accel: 'Ctrl+Alt+Shift+L' },
  { id: 'image.autoColor', menu: 'image', icon: Blend, label: 'autoColor', accel: 'Ctrl+Shift+B' },
  { id: 'image.autoLevels', menu: 'image', icon: ChartNoAxesColumnIncreasing, label: 'autoLevels' },
  { id: 'image.size', menu: 'image', icon: Ratio, label: 'imageSize', toolbar: true, separatorBefore: true, accel: 'Ctrl+Alt+I' },
  { id: 'image.canvasSize', menu: 'image', icon: Proportions, label: 'canvasSize', accel: 'Ctrl+Alt+C' },
  { id: 'image.rotate180', menu: 'image', icon: IterationCcw, label: 'rotate180', section: 'sectionRotation' },
  { id: 'image.rotateCW', menu: 'image', icon: RotateCw, label: 'rotateCW', toolbar: true, section: 'sectionRotation' },
  { id: 'image.rotateCCW', menu: 'image', icon: RotateCcw, label: 'rotateCCW', section: 'sectionRotation' },
  { id: 'image.rotateArbitrary', menu: 'image', icon: RefreshCw, label: 'rotateArbitrary', section: 'sectionRotation' },
  { id: 'image.flipH', menu: 'image', icon: FlipHorizontal, label: 'flipH', toolbar: true, section: 'sectionRotation' },
  { id: 'image.flipV', menu: 'image', icon: FlipVertical, label: 'flipV', section: 'sectionRotation' },
  { id: 'image.crop', menu: 'image', icon: CropIcon, label: 'cropToSelection', separatorBefore: true },
  { id: 'image.trim', menu: 'image', icon: Slice, label: 'trim' },
  { id: 'image.revealAll', menu: 'image', icon: ScanSearch, label: 'revealAll' },
  { id: 'image.duplicate', menu: 'image', icon: Files, label: 'duplicateImage', separatorBefore: true },
  { id: 'image.applyImage', menu: 'image', icon: Images, label: 'applyImage' },
  { id: 'image.calculations', menu: 'image', icon: Calculator, label: 'calculations' },
  { id: 'image.recordMeasure', menu: 'image', icon: ClipboardList, label: 'recordMeasure', separatorBefore: true },
  { id: 'image.info', menu: 'image', icon: Info, label: 'imageInfo', toolbar: true },

  /* ------------------------------------------------------------- layer */
  { id: 'layer.new', menu: 'layer', icon: Plus, label: 'newLayer', toolbar: true, accel: 'Ctrl+Shift+N' },
  { id: 'layer.newViaCopy', menu: 'layer', icon: CopyCheck, label: 'newViaCopy', accel: 'Ctrl+J' },
  { id: 'layer.newViaCut', menu: 'layer', icon: SquareSplitHorizontal, label: 'newViaCut', accel: 'Ctrl+Shift+J' },
  { id: 'layer.duplicate', menu: 'layer', icon: LayersPlus, label: 'duplicateLayer', toolbar: true },
  { id: 'layer.delete', menu: 'layer', icon: Trash, label: 'deleteLayer', toolbar: true },
  { id: 'layer.fillLayer', menu: 'layer', icon: SquareDot, label: 'fillLayer', separatorBefore: true },
  { id: 'layer.newArtboard', menu: 'layer', icon: Frame, label: 'newArtboard' },
  { id: 'layer.style', menu: 'layer', icon: Gem, label: 'layerStyle', separatorBefore: true },
  { id: 'layer.copyStyle', menu: 'layer', icon: ClipboardCopy, label: 'copyStyle' },
  { id: 'layer.pasteStyle', menu: 'layer', icon: Clipboard, label: 'pasteStyle' },
  { id: 'layer.clearStyle', menu: 'layer', icon: BadgeMinus, label: 'clearStyle' },
  { id: 'layer.toSmart', menu: 'layer', icon: Package, label: 'toSmartObject', separatorBefore: true, section: 'sectionSmart' },
  { id: 'layer.smartEdit', menu: 'layer', icon: FilePen, label: 'smartEdit', section: 'sectionSmart' },
  { id: 'layer.smartReplace', menu: 'layer', icon: ReplaceAll, label: 'smartReplace', section: 'sectionSmart' },
  { id: 'layer.smartExport', menu: 'layer', icon: Share2, label: 'smartExport', section: 'sectionSmart' },
  { id: 'layer.rasterize', menu: 'layer', icon: Boxes, label: 'rasterize', section: 'sectionSmart' },
  { id: 'layer.mask', menu: 'layer', icon: SquareDashedBottom, label: 'layerMask', separatorBefore: true, section: 'sectionMask' },
  { id: 'layer.maskHideAll', menu: 'layer', icon: SquareOff, label: 'maskHideAll', section: 'sectionMask' },
  { id: 'layer.maskFromSelection', menu: 'layer', icon: SquareChevronRight, label: 'maskFromSelection', section: 'sectionMask' },
  { id: 'layer.maskHideSelection', menu: 'layer', icon: SquareX, label: 'maskHideSelection', section: 'sectionMask' },
  { id: 'layer.maskFromTransparency', menu: 'layer', icon: SquareAsterisk, label: 'maskFromTransparency', section: 'sectionMask' },
  { id: 'layer.vectorMask', menu: 'layer', icon: PenLine, label: 'vectorMask', section: 'sectionMask' },
  { id: 'layer.maskDisable', menu: 'layer', icon: EyeClosed, label: 'maskDisable', section: 'sectionMask' },
  { id: 'layer.maskInvert', menu: 'layer', icon: SquareSlash, label: 'maskInvert', section: 'sectionMask' },
  { id: 'layer.maskApply', menu: 'layer', icon: SquareCheck, label: 'maskApply', section: 'sectionMask' },
  { id: 'layer.maskDelete', menu: 'layer', icon: SquareMinus, label: 'maskDelete', section: 'sectionMask' },
  { id: 'layer.clipMask', menu: 'layer', icon: Ungroup, label: 'clipMask', separatorBefore: true, accel: 'Ctrl+Alt+G' },
  { id: 'layer.group', menu: 'layer', icon: Group, label: 'groupLayers', accel: 'Ctrl+G' },
  { id: 'layer.ungroup', menu: 'layer', icon: FolderMinus, label: 'ungroupLayers', accel: 'Ctrl+Shift+G' },
  { id: 'layer.hideOthers', menu: 'layer', icon: EyeOff, label: 'hideOthers' },
  { id: 'layer.bringToFront', menu: 'layer', icon: ArrowUpToLine, label: 'bringToFront', separatorBefore: true, accel: 'Ctrl+Shift+]', section: 'sectionArrange' },
  { id: 'layer.bringForward', menu: 'layer', icon: ChevronUp, label: 'bringForward', accel: 'Ctrl+]', section: 'sectionArrange' },
  { id: 'layer.sendBackward', menu: 'layer', icon: ChevronDown, label: 'sendBackward', accel: 'Ctrl+[', section: 'sectionArrange' },
  { id: 'layer.sendToBack', menu: 'layer', icon: ArrowDownToLine, label: 'sendToBack', accel: 'Ctrl+Shift+[', section: 'sectionArrange' },
  { id: 'layer.alignLeft', menu: 'layer', icon: AlignStartHorizontal, label: 'alignLeft', separatorBefore: true, section: 'sectionAlign' },
  { id: 'layer.alignCenterH', menu: 'layer', icon: AlignCenterHorizontal, label: 'alignCenterH', section: 'sectionAlign' },
  { id: 'layer.alignRight', menu: 'layer', icon: AlignRight, label: 'alignRight', section: 'sectionAlign' },
  { id: 'layer.alignTop', menu: 'layer', icon: AlignStartVertical, label: 'alignTop', section: 'sectionAlign' },
  { id: 'layer.alignCenterV', menu: 'layer', icon: AlignCenterVertical, label: 'alignCenterV', section: 'sectionAlign' },
  { id: 'layer.alignBottom', menu: 'layer', icon: AlignEndVertical, label: 'alignBottom', section: 'sectionAlign' },
  { id: 'layer.distributeH', menu: 'layer', icon: AlignHorizontalSpaceAround, label: 'distributeH', section: 'sectionAlign' },
  { id: 'layer.distributeV', menu: 'layer', icon: AlignVerticalSpaceAround, label: 'distributeV', section: 'sectionAlign' },
  { id: 'layer.link', menu: 'layer', icon: Link2, label: 'linkLayers', separatorBefore: true },
  { id: 'layer.unlink', menu: 'layer', icon: Unlink, label: 'unlinkLayers' },
  { id: 'layer.lockTransparent', menu: 'layer', icon: Lock, label: 'lockTransparent' },
  { id: 'layer.lockPosition', menu: 'layer', icon: LockKeyhole, label: 'lockPosition' },
  { id: 'layer.lockAll', menu: 'layer', icon: ShieldCheck, label: 'lockAll' },
  { id: 'layer.mergeDown', menu: 'layer', icon: Layers2, label: 'mergeDown', toolbar: true, separatorBefore: true, accel: 'Ctrl+E' },
  { id: 'layer.mergeVisible', menu: 'layer', icon: CopyMinus, label: 'mergeVisible', accel: 'Ctrl+Shift+E' },
  { id: 'layer.flatten', menu: 'layer', icon: AlignVerticalJustifyEnd, label: 'flatten' },
  { id: 'layer.defringe', menu: 'layer', icon: SquareDashedMousePointer, label: 'defringe', separatorBefore: true, section: 'sectionMatting' },
  { id: 'layer.removeBlackMatte', menu: 'layer', icon: CircleMinus, label: 'removeBlackMatte', section: 'sectionMatting' },
  { id: 'layer.removeWhiteMatte', menu: 'layer', icon: CirclePlus, label: 'removeWhiteMatte', section: 'sectionMatting' },
  { id: 'layer.flipH', menu: 'layer', icon: FoldHorizontal, label: 'flipLayerH', separatorBefore: true },
  { id: 'layer.flipV', menu: 'layer', icon: FoldVertical, label: 'flipLayerV' },
  ...adjustmentLayerCommands,

  /* -------------------------------------------------------------- type */
  { id: 'type.horizontal', menu: 'typeMenu', icon: Type, label: 'text', toolbar: true, accel: 'T' },
  { id: 'type.vertical', menu: 'typeMenu', icon: TextSelect, label: 'vtext', accel: 'Shift+T' },
  { id: 'type.enter', menu: 'typeMenu', icon: CornerDownLeft, label: 'enterText' },
  { id: 'type.character', menu: 'typeMenu', icon: CaseSensitive, label: 'characterPanel', separatorBefore: true },
  { id: 'type.paragraph', menu: 'typeMenu', icon: Pilcrow, label: 'paragraphPanel' },
  { id: 'type.glyphs', menu: 'typeMenu', icon: Languages, label: 'glyphs' },
  { id: 'type.warp', menu: 'typeMenu', icon: Waypoints, label: 'warpText', separatorBefore: true },
  { id: 'type.orientation', menu: 'typeMenu', icon: FlipVertical2, label: 'typeOrientation' },
  { id: 'type.antiAlias', menu: 'typeMenu', icon: Feather, label: 'antiAlias' },
  { id: 'type.convertToShape', menu: 'typeMenu', icon: Pentagon, label: 'convertToShape', separatorBefore: true },
  { id: 'type.workPath', menu: 'typeMenu', icon: PenTool, label: 'createWorkPath' },
  { id: 'type.rasterize', menu: 'typeMenu', icon: TypeOutline, label: 'rasterizeType' },
  { id: 'type.matchFont', menu: 'typeMenu', icon: FileType, label: 'matchFont' },

  /* ------------------------------------------------------------ select */
  { id: 'select.all', menu: 'selectMenu', icon: SquareDashed, label: 'selectAll', toolbar: true, accel: 'Ctrl+A' },
  { id: 'select.none', menu: 'selectMenu', icon: Ban, label: 'deselect', toolbar: true, accel: 'Ctrl+D' },
  { id: 'select.reselect', menu: 'selectMenu', icon: Repeat1, label: 'reselect', accel: 'Ctrl+Shift+D' },
  { id: 'select.invert', menu: 'selectMenu', icon: CircleDashed, label: 'invertSel', accel: 'Ctrl+Shift+I' },
  { id: 'select.allLayers', menu: 'selectMenu', icon: ListChecks, label: 'selectAllLayers', separatorBefore: true, accel: 'Ctrl+Alt+A' },
  { id: 'select.deselectLayers', menu: 'selectMenu', icon: LayersMinus, label: 'deselectLayers' },
  { id: 'select.isolate', menu: 'selectMenu', icon: ListTree, label: 'isolateLayers' },
  { id: 'select.colorRange', menu: 'selectMenu', icon: Pipette, label: 'colorRange', separatorBefore: true },
  { id: 'select.focusArea', menu: 'selectMenu', icon: Crosshair, label: 'focusArea' },
  // Not on the toolbar row: the task group at the end of that same row
  // already carries it, and it was appearing twice, side by side.
  { id: 'select.subject', menu: 'selectMenu', icon: ScanFace, label: 'selectSubject' },
  { id: 'select.sky', menu: 'selectMenu', icon: Cloud, label: 'selectSky' },
  { id: 'select.distractions', menu: 'selectMenu', icon: ScanEye, label: 'findDistractions' },
  { id: 'select.removeBg', menu: 'selectMenu', icon: ImageMinus, label: 'removeBg' },
  { id: 'select.selectAndMask', menu: 'selectMenu', icon: LassoSelect, label: 'selectAndMask', separatorBefore: true, accel: 'Ctrl+Alt+R' },
  { id: 'select.border', menu: 'selectMenu', icon: SquareRoundCorner, label: 'borderSel', section: 'sectionModify' },
  { id: 'select.smooth', menu: 'selectMenu', icon: SplinePointer, label: 'smoothSel', section: 'sectionModify' },
  { id: 'select.expand', menu: 'selectMenu', icon: Maximize, label: 'expandSel', section: 'sectionModify' },
  { id: 'select.contract', menu: 'selectMenu', icon: Minimize, label: 'contractSel', section: 'sectionModify' },
  { id: 'select.feather', menu: 'selectMenu', icon: Cloudy, label: 'feather', accel: 'Shift+F6', section: 'sectionModify' },
  { id: 'select.grow', menu: 'selectMenu', icon: ChevronsUpDown, label: 'growSel', separatorBefore: true },
  { id: 'select.similar', menu: 'selectMenu', icon: Equal, label: 'similarSel' },
  { id: 'select.transform', menu: 'selectMenu', icon: SquarePen, label: 'transformSelection', separatorBefore: true },
  { id: 'select.quickMask', menu: 'selectMenu', icon: Highlighter, label: 'editQuickMask', accel: 'Q' },
  { id: 'select.save', menu: 'selectMenu', icon: BookmarkPlus, label: 'saveSelection', separatorBefore: true },
  { id: 'select.load', menu: 'selectMenu', icon: FolderInput, label: 'loadSelection' },

  /* ------------------------------------------------------------ filter */
  { id: 'filter.last', menu: 'filter', icon: ListFilter, label: 'lastFilter', accel: 'Ctrl+Alt+F' },
  { id: 'filter.gallery', menu: 'filter', icon: LayoutPanelLeft, label: 'filterGallery', toolbar: true, separatorBefore: true },
  { id: 'filter.adaptiveWideAngle', menu: 'filter', icon: Radius, label: 'adaptiveWideAngle' },
  { id: 'filter.cameraRaw', menu: 'filter', icon: SwitchCamera, label: 'cameraRaw', accel: 'Ctrl+Shift+A' },
  { id: 'filter.lensCorrection', menu: 'filter', icon: Telescope, label: 'lensCorrection', accel: 'Ctrl+Shift+R' },
  { id: 'filter.liquify', menu: 'filter', icon: Waves, label: 'liquify', accel: 'Ctrl+Shift+X' },
  { id: 'filter.vanishingPoint', menu: 'filter', icon: Move, label: 'vanishingPoint', accel: 'Ctrl+Alt+V' },
  { id: 'filter.blur', menu: 'filter', icon: CloudFog, label: 'blur', toolbar: true, separatorBefore: true, section: 'groupBlur' },
  { id: 'filter.blurGallery', menu: 'filter', icon: GalleryThumbnails, label: 'blurGallery', section: 'groupBlurGallery' },
  { id: 'filter.sharpen', menu: 'filter', icon: ArrowUpNarrowWide, label: 'sharpen', toolbar: true, section: 'groupSharpen' },
  { id: 'filter.custom', menu: 'filter', icon: Sigma, label: 'customFilter', section: 'groupOther' },
  { id: 'filter.neural', menu: 'filter', icon: Brain, label: 'neural', separatorBefore: true, section: 'groupNeural' },
  ...extraFilterCommands,

  /* ---------------------------------------------------------------- 3D */
  { id: 'threeD.extrude', menu: 'threeD', icon: Box, label: 'extrude' },
  { id: 'threeD.postcard', menu: 'threeD', icon: RectangleVertical, label: 'postcard' },
  { id: 'threeD.render', menu: 'threeD', icon: Cuboid, label: 'renderThreeD', separatorBefore: true },
  { id: 'threeD.remove', menu: 'threeD', icon: RemoveFormatting, label: 'removeThreeD' },
  { id: 'threeD.effects', menu: 'threeD', icon: Sparkle, label: 'effects', separatorBefore: true },

  /* -------------------------------------------------------------- view */
  { id: 'view.proofColors', menu: 'view', icon: BookOpenCheck, label: 'proofColors', accel: 'Ctrl+Y' },
  { id: 'view.gamutWarning', menu: 'view', icon: TriangleAlert, label: 'gamutWarning', accel: 'Ctrl+Shift+Y' },
  // Out, then the reading, then in: the toolbar runs left to right and so
  // should the scale. The menu keeps the same order for the same reason.
  { id: 'view.zoomOut', menu: 'view', icon: ZoomOut, label: 'zoomOut', toolbar: true, separatorBefore: true, accel: 'Ctrl+-' },
  { id: 'view.zoomIn', menu: 'view', icon: ZoomIn, label: 'zoomIn', toolbar: true, accel: 'Ctrl++' },
  { id: 'view.zoomFit', menu: 'view', icon: Maximize2, label: 'zoomFit', toolbar: true, accel: 'Ctrl+0' },
  { id: 'view.actualPixels', menu: 'view', icon: SquareEqual, label: 'actualPixels', accel: 'Ctrl+1' },
  { id: 'view.zoom200', menu: 'view', icon: Binoculars, label: 'zoom200' },
  { id: 'view.printSize', menu: 'view', icon: Newspaper, label: 'printSize' },
  { id: 'view.screenMode', menu: 'view', icon: Monitor, label: 'screenMode', separatorBefore: true, accel: 'F' },
  { id: 'view.extras', menu: 'view', icon: Eye, label: 'extras', accel: 'Ctrl+H' },
  { id: 'view.grid', menu: 'view', icon: Grid3x3, label: 'grid', toolbar: true, accel: "Ctrl+'", section: 'sectionShow' },
  { id: 'view.rulers', menu: 'view', icon: Ruler, label: 'rulers', toolbar: true, accel: 'Ctrl+R', section: 'sectionShow' },
  { id: 'view.showGuides', menu: 'view', icon: SeparatorVertical, label: 'showGuides', accel: 'Ctrl+;', section: 'sectionShow' },
  { id: 'view.smartGuides', menu: 'view', icon: RulerDimensionLine, label: 'smartGuides', section: 'sectionShow' },
  { id: 'view.pixelGrid', menu: 'view', icon: Grid2x2, label: 'pixelGrid', section: 'sectionShow' },
  { id: 'view.showSlices', menu: 'view', icon: SquareSplitVertical, label: 'showSlices', section: 'sectionShow' },
  { id: 'view.showNotes', menu: 'view', icon: MessageSquareDashed, label: 'showNotes', section: 'sectionShow' },
  { id: 'view.showPaths', menu: 'view', icon: Route, label: 'showPathsCommand', section: 'sectionShow' },
  { id: 'view.snap', menu: 'view', icon: Anchor, label: 'snap', separatorBefore: true, accel: 'Ctrl+Shift+;', section: 'sectionSnap' },
  { id: 'view.snapGuides', menu: 'view', icon: MagnetIcon, label: 'snapGuides', section: 'sectionSnap' },
  { id: 'view.snapGrid', menu: 'view', icon: Grid2x2Check, label: 'snapGrid', section: 'sectionSnap' },
  { id: 'view.newGuide', menu: 'view', icon: BetweenHorizontalStart, label: 'newGuide', separatorBefore: true, section: 'sectionGuides' },
  { id: 'view.guideLayout', menu: 'view', icon: LayoutTemplate, label: 'guideLayout', section: 'sectionGuides' },
  { id: 'view.lockGuides', menu: 'view', icon: BookLock, label: 'lockGuides', accel: 'Ctrl+Alt+;', section: 'sectionGuides' },
  { id: 'view.clearGuides', menu: 'view', icon: Delete, label: 'clearGuides', section: 'sectionGuides' },
  { id: 'view.clearSlices', menu: 'view', icon: Grid2x2X, label: 'clearSlices', section: 'sectionGuides' },
  { id: 'view.quickMask', menu: 'view', icon: VenetianMask, label: 'quickMask', separatorBefore: true },
  { id: 'view.rotateView', menu: 'view', icon: IterationCw, label: 'rotateView' },
  { id: 'view.resetView', menu: 'view', icon: Fullscreen, label: 'resetView' },
  { id: 'view.patternPreview', menu: 'view', icon: Repeat2, label: 'patternPreview' },

  /* ------------------------------------------------------------ window */
  { id: 'window.nextDoc', menu: 'windowMenu', icon: ArrowRightToLine, label: 'nextDocument', accel: 'Ctrl+Tab', section: 'sectionArrangeDocs' },
  { id: 'window.prevDoc', menu: 'windowMenu', icon: ArrowLeftToLine, label: 'prevDocument', accel: 'Ctrl+Shift+Tab', section: 'sectionArrangeDocs' },
  { id: 'window.saveWorkspace', menu: 'windowMenu', icon: LayoutDashboard, label: 'saveWorkspace', separatorBefore: true, section: 'sectionWorkspace' },
  { id: 'window.resetWorkspace', menu: 'windowMenu', icon: ListRestart, label: 'resetWorkspace', section: 'sectionWorkspace' },
  { id: 'window.layers', menu: 'windowMenu', icon: Layers, label: 'layers', separatorBefore: true, accel: 'F7' },
  { id: 'window.adjust', menu: 'windowMenu', icon: Wrench, label: 'adjustments' },
  { id: 'window.properties', menu: 'windowMenu', icon: PanelRight, label: 'properties' },
  { id: 'window.history', menu: 'windowMenu', icon: History, label: 'history' },
  { id: 'window.channels', menu: 'windowMenu', icon: AlignJustify, label: 'channels' },
  { id: 'window.paths', menu: 'windowMenu', icon: Spline, label: 'pathsPanel' },
  { id: 'window.navigator', menu: 'windowMenu', icon: Compass, label: 'navigator' },
  { id: 'window.info', menu: 'windowMenu', icon: CircleHelp, label: 'info', accel: 'F8' },
  { id: 'window.color', menu: 'windowMenu', icon: Palette, label: 'colorPanel', accel: 'F6' },
  { id: 'window.swatches', menu: 'windowMenu', icon: SwatchBook, label: 'swatches' },
  { id: 'window.gradients', menu: 'windowMenu', icon: RectangleHorizontal, label: 'gradientsPanel' },
  { id: 'window.patterns', menu: 'windowMenu', icon: Wallpaper, label: 'patternsPanel' },
  { id: 'window.styles', menu: 'windowMenu', icon: Medal, label: 'stylesPanel' },
  { id: 'window.shapes', menu: 'windowMenu', icon: Shapes, label: 'shapesPanel' },
  { id: 'window.brushes', menu: 'windowMenu', icon: BrushCleaning, label: 'brushesPanel', accel: 'F5' },
  { id: 'window.brushSettings', menu: 'windowMenu', icon: ToolCase, label: 'brushSettingsPanel' },
  { id: 'window.cloneSource', menu: 'windowMenu', icon: Copyright, label: 'cloneSourcePanel' },
  { id: 'window.toolPresets', menu: 'windowMenu', icon: Bookmark, label: 'toolPresets' },
  { id: 'window.character', menu: 'windowMenu', icon: ALargeSmall, label: 'characterPanel' },
  { id: 'window.paragraph', menu: 'windowMenu', icon: AlignLeft, label: 'paragraphPanel' },
  { id: 'window.glyphs', menu: 'windowMenu', icon: Baseline, label: 'glyphs' },
  { id: 'window.actions', menu: 'windowMenu', icon: Play, label: 'actions', accel: 'Alt+F9' },
  { id: 'window.comps', menu: 'windowMenu', icon: GalleryVerticalEnd, label: 'layerComps' },
  { id: 'window.timeline', menu: 'windowMenu', icon: Film, label: 'timeline' },
  { id: 'window.measurementLog', menu: 'windowMenu', icon: Logs, label: 'measurementLog' },
  { id: 'window.notes', menu: 'windowMenu', icon: StickyNote, label: 'notesPanel' },
  // The guide used to be a button of its own in the top bar; it lives here now.
  { id: 'window.guide', menu: 'windowMenu', icon: BadgeHelp, label: 'help', separatorBefore: true },
]

export function commandsInMenu(menu: MenuId) {
  return commands.filter((command) => command.menu === menu)
}

/** The prefix that marks a menu row standing for one recent file. */
export const RECENT_PREFIX = 'file.recent:'

/** The same row's ✕: take this one file off the list, or all of them. */
export const RECENT_FORGET_PREFIX = 'file.forgetRecent:'

/**
 * The File menu with the recent files folded into it.
 *
 * The list used to live behind a window of its own, which is a poor place for
 * something reached for constantly and a worse one for something to be pruned:
 * it could only be emptied wholesale. Here each file is a row of the Open
 * Recent submenu, each row can be dropped on its own, and the last row empties
 * the list.
 */
export function fileMenuWithRecents(recentFiles: string[], icons: { file: IconComponent; clear: IconComponent }): AppCommand[] {
  const rows = commandsInMenu('file')
  if (!recentFiles.length) return rows
  const recents: AppCommand[] = recentFiles.map((filePath) => ({
    id: `${RECENT_PREFIX}${filePath}`,
    menu: 'file',
    section: 'openRecent',
    icon: icons.file,
    // The path is its own label; `t()` hands back a key it does not know.
    label: filePath,
    forgettable: true,
  }))
  recents.push({
    id: RECENT_PREFIX,
    menu: 'file',
    section: 'openRecent',
    icon: icons.clear,
    label: 'clearRecent',
    separatorBefore: true,
  })
  // The submenu takes the place of the row that used to open a window.
  return rows.flatMap((command) => (command.id === 'file.openRecent' ? recents : [command]))
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

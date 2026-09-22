import { createElement, type ComponentType } from 'react'
import {
  ArrowLeftRight, ArrowRightLeft, BookOpen, Clipboard, ClipboardCopy, ClipboardPaste, Columns2, Copy, Eye, FileCode, FileDown, FileInput, FileOutput, FilePlus, FileText, FileType,
  Files, FolderOpen, Globe, History, Image, ImageOff, Info, Keyboard, Languages, LayoutPanelLeft, LayoutPanelTop, ListRestart, LogOut, Maximize, Palette, Pencil, PencilLine,
  Play, Printer, Redo2, RefreshCw, Save, SaveAll, Scissors, Settings, SlidersHorizontal, SquareDashedMousePointer, Tag, TextSelect, Trash, Undo2, WrapText, X, XSquare, ZoomIn, ZoomOut, Hash, Sigma, BarChart3,
} from 'lucide-react'
import { formats, groupNames, readableFormats, writableFormats, type FormatGroup } from './lib/doc/formats'
import type { Language } from './lib/settings'
import { themes } from './themes'
import type { RecentFile } from './lib/settings'

/**
 * 'theme' is the toolbar's theme dropdown and 'from'/'to' the format pickers
 * of the Tools panel: rows of the View and Convert menus shown on their own.
 * They replace native <select>s, whose popup takes the OS highlight colours
 * and could not be read on every theme.
 */
export type MenuId = 'file' | 'edit' | 'view' | 'convert' | 'tools' | 'help' | 'context' | 'outputContext' | 'theme' | 'from' | 'to'

export type AppCommand = {
  id: string
  /** The i18n key of the label. */
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
  menu: MenuId
  /** A command with a section is shown in a submenu named after it. */
  section?: string
  /** Within that submenu, commands sharing a group fold once more into a nested submenu, so a long list stays short. */
  group?: string
  accel?: string
  toolbar?: boolean
  separatorBefore?: boolean
  /** Rows the user may take off the menu (recent files). */
  forgettable?: boolean
}

export const RECENT_PREFIX = 'recent:'
export const RECENT_FORGET_PREFIX = 'recent-forget:'
export const THEME_PREFIX = 'theme.'
export const FROM_PREFIX = 'from.'
export const TO_PREFIX = 'to.'
export const GROUP_PREFIX = 'formatGroup.'

export const menuOrder: MenuId[] = ['file', 'edit', 'view', 'convert', 'tools', 'help']

export const menuIcons: Record<MenuId, AppCommand['icon']> = {
  file: FileText,
  edit: Pencil,
  view: Eye,
  convert: ArrowRightLeft,
  tools: SlidersHorizontal,
  help: Info,
  context: SquareDashedMousePointer,
  outputContext: SquareDashedMousePointer,
  theme: Palette,
  from: FileInput,
  to: FileDown,
}

/** A swatch of the theme's own colours, so every theme row (menu, dropdown) carries a distinct icon. */
export function themeIcon(theme: { id: string; accent: string; appA: string; appB: string }): AppCommand['icon'] {
  const gradient = `theme-swatch-${theme.id}`
  const Icon = ({ size = 16, className }: { size?: number; className?: string }) =>
    createElement('svg', { width: size, height: size, viewBox: '0 0 16 16', className, 'aria-hidden': true },
      createElement('defs', null, createElement('linearGradient', { id: gradient, x1: '0', y1: '0', x2: '1', y2: '1' },
        createElement('stop', { offset: '0', stopColor: theme.appA }), createElement('stop', { offset: '1', stopColor: theme.appB }))),
      createElement('circle', { cx: 8, cy: 8, r: 7, fill: `url(#${gradient})`, stroke: 'rgba(127,127,127,0.5)', strokeWidth: 1 }),
      createElement('circle', { cx: 8, cy: 8, r: 3, fill: theme.accent }))
  Icon.displayName = `ThemeIcon(${theme.id})`
  return Icon
}

export const commands: AppCommand[] = [
  // File
  { id: 'file.new', label: 'file.new', icon: FilePlus, menu: 'file', accel: 'Ctrl+N', toolbar: true },
  { id: 'file.open', label: 'file.open', icon: FolderOpen, menu: 'file', accel: 'Ctrl+O', toolbar: true },
  { id: 'file.openUrl', label: 'file.openUrl', icon: Globe, menu: 'file', accel: 'Ctrl+Shift+O' },
  { id: 'file.recentList', label: 'file.recentList', icon: History, menu: 'file', section: 'file.openRecent' },
  { id: 'file.save', label: 'file.save', icon: Save, menu: 'file', accel: 'Ctrl+S', toolbar: true, separatorBefore: true },
  { id: 'file.saveAs', label: 'file.saveAs', icon: SaveAll, menu: 'file', accel: 'Ctrl+Shift+S', toolbar: true },
  { id: 'file.saveProject', label: 'file.saveProject', icon: FileType, menu: 'file' },
  { id: 'file.export', label: 'file.export', icon: FileOutput, menu: 'file', accel: 'Ctrl+E', toolbar: true },
  { id: 'file.batch', label: 'file.batch', icon: Files, menu: 'file', accel: 'Ctrl+B', separatorBefore: true },
  { id: 'file.print', label: 'file.print', icon: Printer, menu: 'file', accel: 'Ctrl+P', toolbar: true, separatorBefore: true },
  { id: 'file.closeTab', label: 'file.closeTab', icon: X, menu: 'file', accel: 'Ctrl+W', separatorBefore: true },
  { id: 'file.closeAll', label: 'file.closeAll', icon: XSquare, menu: 'file', accel: 'Ctrl+Shift+W' },
  { id: 'file.exit', label: 'file.exit', icon: LogOut, menu: 'file', accel: 'Alt+F4', separatorBefore: true },

  // Edit
  { id: 'edit.undo', label: 'edit.undo', icon: Undo2, menu: 'edit', accel: 'Ctrl+Z', toolbar: true },
  { id: 'edit.redo', label: 'edit.redo', icon: Redo2, menu: 'edit', accel: 'Ctrl+Y', toolbar: true },
  { id: 'edit.cut', label: 'edit.cut', icon: Scissors, menu: 'edit', accel: 'Ctrl+X', toolbar: true, separatorBefore: true },
  { id: 'edit.copy', label: 'edit.copy', icon: Copy, menu: 'edit', accel: 'Ctrl+C', toolbar: true },
  { id: 'edit.paste', label: 'edit.paste', icon: ClipboardPaste, menu: 'edit', accel: 'Ctrl+V', toolbar: true },
  { id: 'edit.selectAll', label: 'edit.selectAll', icon: TextSelect, menu: 'edit', accel: 'Ctrl+A' },
  { id: 'edit.copyOutput', label: 'edit.copyOutput', icon: ClipboardCopy, menu: 'edit', accel: 'Ctrl+Shift+C', separatorBefore: true },
  { id: 'edit.metadata', label: 'edit.metadata', icon: Tag, menu: 'edit', separatorBefore: true },
  { id: 'edit.preferences', label: 'edit.preferences', icon: Settings, menu: 'edit', accel: 'Ctrl+,', separatorBefore: true },

  // View
  { id: 'view.source', label: 'view.source', icon: PencilLine, menu: 'view' },
  { id: 'view.split', label: 'view.split', icon: Columns2, menu: 'view' },
  { id: 'view.output', label: 'view.output', icon: Eye, menu: 'view' },
  { id: 'view.leftPanel', label: 'view.leftPanel', icon: LayoutPanelLeft, menu: 'view', accel: 'Ctrl+1', toolbar: true, separatorBefore: true },
  { id: 'view.rightPanel', label: 'view.rightPanel', icon: LayoutPanelTop, menu: 'view', accel: 'Ctrl+2', toolbar: true },
  { id: 'view.zoomIn', label: 'view.zoomIn', icon: ZoomIn, menu: 'view', accel: 'Ctrl++', toolbar: true, separatorBefore: true },
  { id: 'view.zoomOut', label: 'view.zoomOut', icon: ZoomOut, menu: 'view', accel: 'Ctrl+-', toolbar: true },
  { id: 'view.zoomReset', label: 'view.zoomReset', icon: Maximize, menu: 'view', accel: 'Ctrl+0' },
  { id: 'view.wordWrap', label: 'view.wordWrap', icon: WrapText, menu: 'view', separatorBefore: true },
  { id: 'view.lineNumbers', label: 'view.lineNumbers', icon: Hash, menu: 'view' },
  { id: 'view.refresh', label: 'view.refresh', icon: RefreshCw, menu: 'view', accel: 'F5' },
  { id: 'view.nextTheme', label: 'view.nextTheme', icon: Palette, menu: 'view', accel: 'Ctrl+T', separatorBefore: true },
  ...themes.map((theme) => ({ id: `${THEME_PREFIX}${theme.id}`, label: `${THEME_PREFIX}${theme.id}`, icon: themeIcon(theme), menu: 'view' as MenuId, section: 'view.theme' })),
  { id: 'lang.ko', label: 'lang.ko', icon: Languages, menu: 'view', section: 'view.language' },
  { id: 'lang.en', label: 'lang.en', icon: Languages, menu: 'view', section: 'view.language' },

  // Convert
  { id: 'convert.run', label: 'convert.run', icon: Play, menu: 'convert', accel: 'F9', toolbar: true },
  { id: 'convert.swap', label: 'convert.swap', icon: ArrowLeftRight, menu: 'convert', accel: 'Ctrl+Shift+X', toolbar: true },
  { id: 'convert.autoConvert', label: 'convert.autoConvert', icon: ListRestart, menu: 'convert' },
  ...readableFormats.map((format) => ({ id: `${FROM_PREFIX}${format.id}`, label: `${FROM_PREFIX}${format.id}`, icon: FileInput, menu: 'convert' as MenuId, section: 'convert.from', group: `${GROUP_PREFIX}${format.group}` })),
  ...writableFormats.map((format) => ({ id: `${TO_PREFIX}${format.id}`, label: `${TO_PREFIX}${format.id}`, icon: FileDown, menu: 'convert' as MenuId, section: 'convert.to', group: `${GROUP_PREFIX}${format.group}` })),
  { id: 'convert.useOutputAsSource', label: 'convert.useOutputAsSource', icon: FileCode, menu: 'convert', separatorBefore: true },
  { id: 'convert.formats', label: 'convert.formats', icon: BookOpen, menu: 'convert', separatorBefore: true },

  // Tools
  { id: 'tools.stats', label: 'tools.stats', icon: BarChart3, menu: 'tools' },
  { id: 'tools.showInFolder', label: 'tools.showInFolder', icon: FolderOpen, menu: 'tools' },
  { id: 'tools.background', label: 'tools.background', icon: Image, menu: 'tools', separatorBefore: true },
  { id: 'tools.clearBackground', label: 'tools.clearBackground', icon: ImageOff, menu: 'tools' },
  { id: 'tools.settings', label: 'tools.settings', icon: Settings, menu: 'tools', separatorBefore: true },

  // Help
  { id: 'help.shortcuts', label: 'help.shortcuts', icon: Keyboard, menu: 'help', accel: 'F1' },
  { id: 'help.about', label: 'help.about', icon: Info, menu: 'help', separatorBefore: true },

  // Context menu of the editor
  { id: 'ctx.undo', label: 'edit.undo', icon: Undo2, menu: 'context' },
  { id: 'ctx.redo', label: 'edit.redo', icon: Redo2, menu: 'context' },
  { id: 'ctx.cut', label: 'edit.cut', icon: Scissors, menu: 'context', separatorBefore: true },
  { id: 'ctx.copy', label: 'edit.copy', icon: Copy, menu: 'context' },
  { id: 'ctx.paste', label: 'edit.paste', icon: Clipboard, menu: 'context' },
  { id: 'ctx.selectAll', label: 'edit.selectAll', icon: TextSelect, menu: 'context' },
  { id: 'ctx.convert', label: 'convert.run', icon: Play, menu: 'context', separatorBefore: true },
  { id: 'ctx.copyOutput', label: 'edit.copyOutput', icon: ClipboardCopy, menu: 'context' },
  { id: 'ctx.export', label: 'file.export', icon: FileOutput, menu: 'context' },
  { id: 'ctx.stats', label: 'tools.stats', icon: Sigma, menu: 'context', separatorBefore: true },
  { id: 'ctx.closeTab', label: 'file.closeTab', icon: X, menu: 'context', separatorBefore: true },

  // Context menu of the converted-output pane
  { id: 'octx.export', label: 'file.export', icon: FileOutput, menu: 'outputContext' },
  { id: 'octx.copyOutput', label: 'edit.copyOutput', icon: ClipboardCopy, menu: 'outputContext' },
  { id: 'octx.useAsSource', label: 'convert.useOutputAsSource', icon: FileCode, menu: 'outputContext', separatorBefore: true },
  { id: 'octx.convert', label: 'convert.run', icon: Play, menu: 'outputContext', separatorBefore: true },
  { id: 'octx.swap', label: 'convert.swap', icon: ArrowLeftRight, menu: 'outputContext' },
  { id: 'octx.print', label: 'file.print', icon: Printer, menu: 'outputContext', separatorBefore: true },
  { id: 'octx.stats', label: 'tools.stats', icon: Sigma, menu: 'outputContext' },
]

export const toolbarCommands = commands.filter((command) => command.toolbar)

export function commandsInMenu(menu: MenuId): AppCommand[] {
  if (menu === 'theme') return commands.filter((command) => command.section === 'view.theme').map((command) => ({ ...command, menu: 'theme' as MenuId, section: undefined }))
  // The format pickers: the groups become the sections, so the formats fold into one submenu per group.
  if (menu === 'from' || menu === 'to') return commands.filter((command) => command.section === (menu === 'from' ? 'convert.from' : 'convert.to')).map((command) => ({ ...command, menu, section: command.group, group: undefined }))
  return commands.filter((command) => command.menu === menu)
}

export function commandById(id: string): AppCommand | undefined {
  return commands.find((command) => command.id === id)
}

export type MenuEntry =
  | { kind: 'command'; command: AppCommand; separatorBefore: boolean }
  | { kind: 'submenu'; section: string; commands: AppCommand[]; separatorBefore: boolean }

/**
 * Folds commands that share a section into one submenu row, in place of the
 * first of them. Inside that submenu a command's group becomes its section,
 * so the same fold applied to the submenu's rows yields the nested level
 * (Output format ▸ Wiki ▸ DokuWiki).
 */
export function menuEntries(rows: AppCommand[]): MenuEntry[] {
  const entries: MenuEntry[] = []
  const seen = new Set<string>()
  for (const command of rows) {
    if (!command.section) {
      entries.push({ kind: 'command', command, separatorBefore: Boolean(command.separatorBefore) })
      continue
    }
    if (seen.has(command.section)) continue
    seen.add(command.section)
    const commands = rows.filter((row) => row.section === command.section).map((row) => ({ ...row, section: row.group, group: undefined }))
    entries.push({ kind: 'submenu', section: command.section, commands, separatorBefore: Boolean(command.separatorBefore) })
  }
  return entries
}

/** The label of a submenu row: an i18n key, or a format group folded under Input/Output format. */
export function sectionLabel(language: Language, section: string, translate: (key: string) => string): string {
  if (section.startsWith(GROUP_PREFIX)) {
    const group = section.slice(GROUP_PREFIX.length) as FormatGroup
    return groupNames[group]?.[language] ?? group
  }
  return translate(section)
}

/** Whether any command inside a submenu (at any depth) is active — the parent row shows a marker so the user can find the current choice. */
export function submenuHasActive(commands: AppCommand[], isActive: (id: string) => boolean): boolean {
  return commands.some((command) => isActive(command.id))
}

/** The File menu with the recent files folded into its "Open recent" submenu. */
export function fileMenuWithRecents(recent: RecentFile[], icons: { file: AppCommand['icon']; clear: AppCommand['icon'] }): AppCommand[] {
  const rows = commandsInMenu('file')
  const out: AppCommand[] = []
  for (const command of rows) {
    if (command.id === 'file.recentList') {
      for (const item of recent) {
        out.push({ id: `${RECENT_PREFIX}${item.path}`, label: item.name, icon: icons.file, menu: 'file', section: 'file.openRecent', forgettable: true })
      }
      if (recent.length === 0) out.push({ id: 'recent.none', label: 'noRecent', icon: icons.file, menu: 'file', section: 'file.openRecent' })
      out.push({ ...command, separatorBefore: true })
      out.push({ id: 'recent.clear', label: 'recent.clear', icon: icons.clear, menu: 'file', section: 'file.openRecent' })
      continue
    }
    out.push(command)
  }
  return out
}

export const formatIds = formats.map((format) => format.id)
export { Trash as ForgetIcon }

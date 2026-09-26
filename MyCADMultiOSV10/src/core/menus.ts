import { menuIcon, type MessageKey } from './i18n'

export interface MenuEntry {
  id: string
  labelKey: MessageKey
  icon: string
}

export interface MenuDef {
  id: string
  labelKey: MessageKey
  items: MenuEntry[]
}

export const MENUS: MenuDef[] = [
  { id: 'file', labelKey: 'file', items: [
    { id: 'new', labelKey: 'new', icon: menuIcon('new') },
    { id: 'open', labelKey: 'open', icon: menuIcon('open') },
    { id: 'save', labelKey: 'save', icon: menuIcon('save') },
    { id: 'saveAs', labelKey: 'saveAs', icon: menuIcon('saveAs') },
    { id: 'importStl', labelKey: 'importStl', icon: menuIcon('importStl') },
    { id: 'exportStl', labelKey: 'exportStl', icon: menuIcon('exportStl') },
    { id: 'exportObj', labelKey: 'exportObj', icon: menuIcon('exportObj') },
    { id: 'exportSvg', labelKey: 'exportSvg', icon: menuIcon('exportSvg') },
    { id: 'exportDxf', labelKey: 'exportDxf', icon: menuIcon('exportDxf') },
    { id: 'openUrl', labelKey: 'openUrl', icon: menuIcon('openUrl') },
    { id: 'download', labelKey: 'download', icon: menuIcon('download') }
  ]},
  { id: 'edit', labelKey: 'edit', items: [
    { id: 'undo', labelKey: 'undo', icon: menuIcon('undo') },
    { id: 'redo', labelKey: 'redo', icon: menuIcon('redo') },
    { id: 'copy', labelKey: 'copy', icon: menuIcon('copy') },
    { id: 'paste', labelKey: 'paste', icon: menuIcon('paste') },
    { id: 'duplicate', labelKey: 'duplicate', icon: menuIcon('duplicate') },
    { id: 'delete', labelKey: 'delete', icon: menuIcon('delete') },
    { id: 'selectAll', labelKey: 'selectAll', icon: menuIcon('selectAll') }
  ]},
  { id: 'view', labelKey: 'view', items: [
    { id: 'front', labelKey: 'front', icon: menuIcon('front') },
    { id: 'back', labelKey: 'back', icon: menuIcon('back') },
    { id: 'left', labelKey: 'left', icon: menuIcon('left') },
    { id: 'right', labelKey: 'right', icon: menuIcon('right') },
    { id: 'top', labelKey: 'top', icon: menuIcon('top') },
    { id: 'bottom', labelKey: 'bottom', icon: menuIcon('bottom') },
    { id: 'iso', labelKey: 'iso', icon: menuIcon('iso') },
    { id: 'grid', labelKey: 'grid', icon: menuIcon('grid') },
    { id: 'ruler', labelKey: 'ruler', icon: menuIcon('ruler') },
    { id: 'shaded', labelKey: 'shaded', icon: menuIcon('shaded') },
    { id: 'wireframe', labelKey: 'wireframe', icon: menuIcon('wireframe') },
    { id: 'zoomIn', labelKey: 'zoomIn', icon: menuIcon('zoomIn') },
    { id: 'zoomOut', labelKey: 'zoomOut', icon: menuIcon('zoomOut') },
    { id: 'fit', labelKey: 'fit', icon: menuIcon('fit') }
  ]},
  { id: 'insert', labelKey: 'insert', items: [
    { id: 'box', labelKey: 'box', icon: menuIcon('box') },
    { id: 'sphere', labelKey: 'sphere', icon: menuIcon('sphere') },
    { id: 'cylinder', labelKey: 'cylinder', icon: menuIcon('cylinder') },
    { id: 'cone', labelKey: 'cone', icon: menuIcon('cone') },
    { id: 'torus', labelKey: 'torus', icon: menuIcon('torus') },
    { id: 'plane', labelKey: 'plane', icon: menuIcon('plane') }
  ]},
  { id: 'part', labelKey: 'part', items: [
    { id: 'sketchRect', labelKey: 'sketchRect', icon: menuIcon('sketchRect') },
    { id: 'sketchCircle', labelKey: 'sketchCircle', icon: menuIcon('sketchCircle') },
    { id: 'sketchPolygon', labelKey: 'sketchPolygon', icon: menuIcon('sketchPolygon') },
    { id: 'pad', labelKey: 'pad', icon: menuIcon('pad') },
    { id: 'pocket', labelKey: 'pocket', icon: menuIcon('pocket') },
    { id: 'revolve', labelKey: 'revolve', icon: menuIcon('revolve') },
    { id: 'loft', labelKey: 'loft', icon: menuIcon('loft') },
    { id: 'pipe', labelKey: 'pipe', icon: menuIcon('pipe') },
    { id: 'helix', labelKey: 'helix', icon: menuIcon('helix') },
    { id: 'fillet', labelKey: 'fillet', icon: menuIcon('fillet') },
    { id: 'chamfer', labelKey: 'chamfer', icon: menuIcon('chamfer') },
    { id: 'union', labelKey: 'union', icon: menuIcon('union') },
    { id: 'cut', labelKey: 'cut', icon: menuIcon('cut') },
    { id: 'common', labelKey: 'common', icon: menuIcon('common') },
    { id: 'mirror', labelKey: 'mirror', icon: menuIcon('mirror') },
    { id: 'linearPattern', labelKey: 'linearPattern', icon: menuIcon('linearPattern') },
    { id: 'polarPattern', labelKey: 'polarPattern', icon: menuIcon('polarPattern') },
    { id: 'hole', labelKey: 'hole', icon: menuIcon('hole') },
    { id: 'align', labelKey: 'align', icon: menuIcon('align') },
    { id: 'section', labelKey: 'section', icon: menuIcon('section') },
    { id: 'shaft', labelKey: 'shaft', icon: menuIcon('shaft') },
    { id: 'groove', labelKey: 'groove', icon: menuIcon('groove') },
    { id: 'draft', labelKey: 'draft', icon: menuIcon('draft') },
    { id: 'shell', labelKey: 'shell', icon: menuIcon('shell') },
    { id: 'rectPattern', labelKey: 'rectPattern', icon: menuIcon('rectPattern') },
    { id: 'translate', labelKey: 'translate', icon: menuIcon('translate') },
    { id: 'rotateBody', labelKey: 'rotateBody', icon: menuIcon('rotateBody') },
    { id: 'scaleBody', labelKey: 'scaleBody', icon: menuIcon('scaleBody') },
    { id: 'counterbore', labelKey: 'counterbore', icon: menuIcon('counterbore') },
    { id: 'countersink', labelKey: 'countersink', icon: menuIcon('countersink') },
    { id: 'refPlane', labelKey: 'refPlane', icon: menuIcon('refPlane') },
    { id: 'parameter', labelKey: 'parameter', icon: menuIcon('parameter') },
    { id: 'coincidence', labelKey: 'coincidence', icon: menuIcon('coincidence') },
    { id: 'offsetMate', labelKey: 'offsetMate', icon: menuIcon('offsetMate') },
    { id: 'inertia', labelKey: 'inertia', icon: menuIcon('inertia') },
    { id: 'updatePart', labelKey: 'updatePart', icon: menuIcon('updatePart') }
  ]},
  { id: 'tools', labelKey: 'tools', items: [
    { id: 'select', labelKey: 'select', icon: menuIcon('select') },
    { id: 'measure', labelKey: 'measure', icon: menuIcon('measure') },
    { id: 'settings', labelKey: 'settings', icon: menuIcon('settings') }
  ]},
  { id: 'help', labelKey: 'help', items: [
    { id: 'about', labelKey: 'about', icon: menuIcon('about') },
    { id: 'usage', labelKey: 'usage', icon: menuIcon('usage') }
  ]}
]

export const TOOLBAR = [
  'new', 'open', 'save', 'undo', 'redo', 'select', 'box', 'sphere', 'cylinder', 'cone', 'torus', 'plane',
  'delete', 'copy', 'paste', 'front', 'top', 'iso', 'zoomIn', 'zoomOut', 'fit', 'grid', 'ruler', 'print', 'settings', 'about'
] as const

export const CONTEXT_ITEMS: MenuEntry[] = [
  { id: 'copy', labelKey: 'copy', icon: menuIcon('copy') },
  { id: 'paste', labelKey: 'paste', icon: menuIcon('paste') },
  { id: 'duplicate', labelKey: 'duplicate', icon: menuIcon('duplicate') },
  { id: 'delete', labelKey: 'delete', icon: menuIcon('delete') },
  { id: 'hide', labelKey: 'hide', icon: menuIcon('hide') },
  { id: 'fit', labelKey: 'fit', icon: menuIcon('fit') }
]

export function menuIsSingleColumn(items: MenuEntry[]): boolean {
  return items.every((item) => item.icon.length > 0 && item.labelKey.length > 0)
}

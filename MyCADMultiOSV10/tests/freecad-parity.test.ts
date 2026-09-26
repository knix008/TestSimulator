import { describe, expect, it } from 'vitest'
import { MENUS, TOOLBAR } from '../src/core/menus'
import { WORKBENCHES } from '../src/core/workbenches'
import { TOOL_CATEGORIES, categoryById, categoryName, groupTools, toolCategory } from '../src/core/toolgroups'
import { COMMAND_LABELS } from '../src/core/labels'
import { menuIcon } from '../src/core/i18n'
import { DRAW_STYLES, drawStyleSpec, isShadeMode } from '../src/core/model'
import { NAVIGATION_STYLES, navAction } from '../src/core/viewnav'
import { UNIT_SCHEMAS, formatArea, formatLength, formatVolume, fromDisplay, isUnitSchema, toDisplay, unitSuffix } from '../src/core/units'
import { defaultClip, defaultSettings, sanitizeClip, sanitizeSettings } from '../src/core/settings'
import { licenseLines, shortcutLines } from '../src/core/knowledge'
import { parseDocument, serializeDocument } from '../src/core/serialize'
import { createDocument } from '../src/core/model'

describe('unit schemas', () => {
  it('[Units] convert both ways and read back as FreeCAD writes them', () => {
    expect(UNIT_SCHEMAS).toEqual(['mm', 'cm', 'm', 'inch', 'foot'])
    for (const schema of UNIT_SCHEMAS) {
      expect(fromDisplay(toDisplay(123.456, schema), schema)).toBeCloseTo(123.456, 9)
    }
    expect(toDisplay(25.4, 'inch')).toBeCloseTo(1, 12)
    expect(toDisplay(304.8, 'foot')).toBeCloseTo(1, 12)
    expect(toDisplay(1000, 'm')).toBeCloseTo(1, 12)
    expect(formatLength(20, 'mm')).toBe('20 mm')
    expect(formatLength(25.4, 'inch')).toBe('1 in')
    // One square inch is 645.16 mm², one cubic inch 16 387.064 mm³.
    expect(formatArea(645.16, 'inch')).toBe('1 in²')
    expect(formatVolume(16387.064, 'inch')).toBe('1 in³')
    expect(formatVolume(1e9, 'm')).toBe('1 m³')
    expect(unitSuffix('cm')).toBe('cm')
    expect(isUnitSchema('furlong')).toBe(false)
    expect(sanitizeSettings({ units: 'inch' }).units).toBe('inch')
    expect(sanitizeSettings({ units: 'furlong' }).units).toBe('mm')
  })
})

describe('draw styles', () => {
  it('[View] every FreeCAD draw style has its own rendering', () => {
    expect(DRAW_STYLES).toHaveLength(7)
    expect(drawStyleSpec('shaded')).toMatchObject({ lit: true, wireframe: false, edges: false })
    expect(drawStyleSpec('wireframe').wireframe).toBe(true)
    expect(drawStyleSpec('points').points).toBe(true)
    expect(drawStyleSpec('flatLines')).toMatchObject({ lit: true, edges: true, flat: true })
    expect(drawStyleSpec('hiddenLine')).toMatchObject({ lit: false, edges: true, blank: true })
    expect(drawStyleSpec('noShading')).toMatchObject({ lit: false, edges: false })
    expect(isShadeMode('hiddenLine')).toBe(true)
    expect(isShadeMode('sketch')).toBe(false)
    // The style survives a round trip, and a broken one falls back.
    const doc = createDocument('d1', 'Part')
    doc.shade = 'hiddenLine'
    expect(parseDocument(serializeDocument(doc), 'd2').shade).toBe('hiddenLine')
    expect(parseDocument(serializeDocument({ ...doc, shade: 'nope' as never }), 'd3').shade).toBe('shaded')
  })

  it('[View] the view menu offers the styles and the projection', () => {
    const view = MENUS.find((menu) => menu.id === 'view')!
    for (const id of ['asIs', 'flatLines', 'points', 'hiddenLine', 'noShading', 'projection', 'resetView']) {
      expect(view.items.some((item) => item.id === id), id).toBe(true)
    }
    expect(defaultSettings().projection).toBe('perspective')
    expect(sanitizeSettings({ projection: 'orthographic' }).projection).toBe('orthographic')
    expect(sanitizeSettings({ projection: 'tilted' }).projection).toBe('perspective')
  })
})

describe('navigation styles', () => {
  it('[View] each style maps the mouse the way its host application does', () => {
    expect(NAVIGATION_STYLES).toEqual(['cad', 'blender', 'touchpad', 'maya'])
    const gesture = (button: number, keys: Partial<{ shift: boolean; ctrl: boolean; alt: boolean }> = {}) => ({
      button,
      shift: false,
      ctrl: false,
      alt: false,
      ...keys
    })
    expect(navAction('cad', gesture(0))).toBe('rotate')
    expect(navAction('cad', gesture(2))).toBe('pan')
    expect(navAction('blender', gesture(1))).toBe('rotate')
    expect(navAction('blender', gesture(1, { shift: true }))).toBe('pan')
    expect(navAction('blender', gesture(0))).toBe('none')
    expect(navAction('touchpad', gesture(0))).toBe('none')
    expect(navAction('touchpad', gesture(0, { shift: true }))).toBe('pan')
    expect(navAction('touchpad', gesture(0, { ctrl: true }))).toBe('rotate')
    expect(navAction('maya', gesture(0))).toBe('none')
    expect(navAction('maya', gesture(0, { alt: true }))).toBe('rotate')
    expect(navAction('maya', gesture(1, { alt: true }))).toBe('pan')
    expect(sanitizeSettings({ navigation: 'blender' }).navigation).toBe('blender')
    expect(sanitizeSettings({ navigation: 'mouse' }).navigation).toBe('cad')
  })
})

describe('clipping planes', () => {
  it('[View] three axis planes with offset and flip, sanitised', () => {
    const planes = defaultClip()
    expect(planes.map((plane) => plane.axis)).toEqual(['x', 'y', 'z'])
    expect(planes.every((plane) => !plane.enabled && plane.offset === 0)).toBe(true)
    const restored = sanitizeClip([{ axis: 'y', enabled: true, offset: 12.5, flip: true }])
    expect(restored[1]).toEqual({ axis: 'y', enabled: true, offset: 12.5, flip: true })
    expect(restored[0].enabled).toBe(false)
    expect(sanitizeClip('nope')).toEqual(defaultClip())
    expect(sanitizeClip([{ axis: 'x', offset: 1e9 }])[0].offset).toBe(100000)
    expect(sanitizeSettings({ clip: [{ axis: 'z', enabled: true, offset: -5, flip: false }] }).clip[2].offset).toBe(-5)
  })
})

describe('help', () => {
  it('[Help] the menu carries the reference items and each has an icon', () => {
    const help = MENUS.find((menu) => menu.id === 'help')!
    expect(help.items.map((item) => item.id)).toEqual(['usage', 'shortcuts', 'license', 'homepage', 'about'])
    for (const item of help.items) {
      expect(item.icon.length, item.id).toBeGreaterThan(0)
      expect(item.icon).not.toBe('•')
    }
    expect(shortcutLines('ko').some((line) => line.includes('Escape'))).toBe(true)
    expect(shortcutLines('en').length).toBe(shortcutLines('ko').length)
    expect(licenseLines('ko')[0]).toContain('MIT')
    expect(licenseLines('en')[0]).toContain('MIT')
  })
})

describe('icons', () => {
  it('[Icons] every command, menu and toolbar id has its own icon', () => {
    const menuIds = MENUS.flatMap((menu) => [menu.id, ...menu.items.map((item) => item.id)])
    const ids = [...new Set<string>([...Object.keys(COMMAND_LABELS), ...TOOLBAR, ...menuIds])]
    const owners = new Map<string, string[]>()
    for (const id of ids) {
      const icon = menuIcon(id)
      expect(icon, id).not.toBe('')
      // '•' is the fallback for an id with no icon of its own.
      expect(icon, id).not.toBe('•')
      owners.set(icon, [...(owners.get(icon) ?? []), id])
    }
    const shared = [...owners].filter(([, list]) => list.length > 1)
    expect(shared.map(([icon, list]) => `${icon}: ${list.join(', ')}`)).toEqual([])
    expect(ids.length).toBeGreaterThan(380)
  })
})

describe('tool groups', () => {
  it('[Layout] every workbench tool lands in a named group', () => {
    const known = new Set(TOOL_CATEGORIES.map((category) => category.id))
    const loose: string[] = []
    for (const workbench of WORKBENCHES) {
      for (const tool of workbench.tools) {
        const id = toolCategory(tool)
        expect(known.has(id), `${tool} -> ${id}`).toBe(true)
        if (id === 'other') loose.push(tool)
      }
    }
    // Nothing falls through to the catch-all group.
    expect(loose).toEqual([])
    expect(toolCategory('draft')).toBe('dress')
    expect(toolCategory('draftLine')).toBe('draft2d')
    expect(toolCategory('smWall')).toBe('manufacture')
    expect(toolCategory('suPushPull')).toBe('sketchup')
    expect(categoryName('ko', 'boolean')).toBe('불리언')
    expect(categoryName('en', 'boolean')).toBe('Booleans')
    expect(categoryById('nope').id).toBe('other')
  })

  it('[Layout] a workbench keeps its tools, in group order', () => {
    const part = WORKBENCHES.find((workbench) => workbench.id === 'partDesign')!
    const groups = groupTools(part.tools)
    expect(groups.length).toBeGreaterThan(3)
    // Every tool appears once, and the groups follow the declared order.
    expect(groups.flatMap((group) => group.tools).sort()).toEqual([...part.tools].sort())
    const order = TOOL_CATEGORIES.map((category) => category.id)
    const seen = groups.map((group) => group.category.id)
    expect(seen).toEqual([...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    expect(seen).toContain('sketch')
    expect(seen).toContain('boolean')
    // Tools inside a group keep the workbench's own order.
    const booleans = groups.find((group) => group.category.id === 'boolean')!.tools
    expect(booleans).toEqual(['union', 'cut', 'common', 'xor'])
    expect(groupTools([])).toEqual([])
  })
})

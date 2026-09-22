// The application layer that does not need a window: commands and menus,
// translations, settings, undo history, project files, themes and helpers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commands, commandsInMenu, fileMenuWithRecents, menuEntries, menuOrder, menuIcons, toolbarCommands, RECENT_PREFIX } from '../src/commands.ts'
import { t, hasString, formatBytes } from '../src/i18n.ts'
import { themes, getTheme, isTheme, themeLabel } from '../src/themes.ts'
import { defaultSettings, addRecent, removeRecent, MAX_RECENT } from '../src/lib/settings.ts'
import { createHistory, push, undo, redo, COALESCE_MS } from '../src/lib/history.ts'
import { serializeProject, parseProject, isProjectName } from '../src/lib/project.ts'
import { buildErrorReport, describeError } from '../src/lib/errors.ts'
import { joinPath, directoryOf, baseName, stripExtension, isTextName, bytesToBase64 } from '../src/lib/platform.ts'
import { formats, formatForFile, getFormat, isFormatId } from '../src/lib/doc/formats.ts'
import { defaultWriterOptions, normalizeOptions } from '../src/lib/doc/options.ts'
import { dialogTitle, keepsWindowOpen } from '../src/dialogMeta.ts'
import { isLikelyMonospace } from '../src/lib/fonts.ts'

const check = (category, name, fn) => test(`${category} › ${name}`, fn)

/* ------------------------------------------------------------ commands */

check('commands', 'every command has a unique id, an icon, a label and a menu', () => {
  const ids = new Set()
  for (const command of commands) {
    assert.ok(!ids.has(command.id), `duplicate ${command.id}`)
    ids.add(command.id)
    assert.ok(command.icon && (typeof command.icon === 'function' || typeof command.icon === 'object'), `${command.id} has no icon`)
    assert.ok(command.label, `${command.id} has no label`)
    assert.ok([...menuOrder, 'context', 'outputContext'].includes(command.menu), `${command.id} in unknown menu`)
  }
})

check('commands', 'every menu in the bar has commands and an icon', () => {
  for (const menu of menuOrder) {
    assert.ok(commandsInMenu(menu).length >= 2, `${menu} is empty`)
    assert.ok(menuIcons[menu], `${menu} has no icon`)
  }
  assert.ok(commandsInMenu('context').length >= 8)
})

check('commands', 'toolbar commands all carry accelerators and belong to visible menus', () => {
  assert.ok(toolbarCommands.length >= 14)
  for (const command of toolbarCommands) assert.ok(command.menu !== 'context', command.id)
})

check('commands', 'sections fold into submenus (themes, formats, recent files)', () => {
  const view = menuEntries(commandsInMenu('view'))
  const themeMenu = view.find((entry) => entry.kind === 'submenu' && entry.section === 'view.theme')
  assert.ok(themeMenu, 'no theme submenu')
  assert.equal(themeMenu.commands.length, themes.length)
  const convert = menuEntries(commandsInMenu('convert'))
  assert.ok(convert.some((entry) => entry.kind === 'submenu' && entry.section === 'convert.from'))
  assert.ok(convert.some((entry) => entry.kind === 'submenu' && entry.section === 'convert.to'))
})

check('commands', 'the File menu lists recent files with a removable row each, and a clear entry', () => {
  const recent = [{ path: 'C:/a/one.md', name: 'one.md', format: 'markdown', at: 1 }, { path: '/b/two.html', name: 'two.html', format: 'html', at: 2 }]
  const rows = fileMenuWithRecents(recent, { file: () => null, clear: () => null })
  const recentRows = rows.filter((row) => row.id.startsWith(RECENT_PREFIX))
  assert.equal(recentRows.length, 2)
  assert.ok(recentRows.every((row) => row.forgettable && row.section === 'file.openRecent'))
  assert.ok(rows.some((row) => row.id === 'recent.clear'))
  const empty = fileMenuWithRecents([], { file: () => null, clear: () => null })
  assert.ok(empty.some((row) => row.id === 'recent.none'))
})

/* ---------------------------------------------------------------- i18n */

check('i18n', 'every command label, menu name and section has Korean and English text', () => {
  const keys = new Set([...menuOrder, 'context'])
  for (const command of commands) {
    if (command.id.startsWith('theme.') || command.id.startsWith('from.') || command.id.startsWith('to.')) continue
    keys.add(command.label)
    if (command.section) keys.add(command.section)
  }
  for (const key of keys) {
    assert.ok(hasString(key), `missing string ${key}`)
    assert.ok(t('ko', key) && t('en', key), `empty translation ${key}`)
    assert.notEqual(t('ko', key), key, `untranslated ${key}`)
  }
})

check('i18n', 'every dialog has a title in both languages', () => {
  for (const name of ['settings', 'about', 'error', 'unsaved', 'progress', 'print', 'openRecent', 'openUrl', 'shortcuts', 'formats', 'metadata', 'stats', 'batch']) {
    assert.ok(hasString(`dialog.${name}`), name)
    assert.ok(dialogTitle(name, 'ko') && dialogTitle(name, 'en'), name)
    assert.notEqual(dialogTitle(name, 'ko'), dialogTitle(name, 'en'), name)
  }
})

check('i18n', 'parameters are substituted and bytes are formatted', () => {
  assert.equal(t('en', 'converted', { ms: 12 }), 'Converted in 12 ms')
  assert.equal(t('ko', 'saved', { name: 'a.md' }), '저장됨: a.md')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2.0 KB')
  assert.equal(formatBytes(3 * 1024 * 1024), '3.00 MB')
})

/* -------------------------------------------------------------- themes */

check('themes', 'there are 20 themes, each with both names and a full token set', () => {
  assert.equal(themes.length, 20)
  const ids = new Set()
  for (const theme of themes) {
    assert.ok(!ids.has(theme.id), `duplicate ${theme.id}`)
    ids.add(theme.id)
    assert.ok(theme.names.ko && theme.names.en, theme.id)
    assert.ok(['dark', 'light'].includes(theme.kind))
    for (const token of ['--accent', '--app-bg-a', '--panel-bg', '--text-primary', '--menu-bg']) assert.ok(theme.vars[token], `${theme.id} lacks ${token}`)
  }
  assert.ok(themes.some((theme) => theme.kind === 'light') && themes.some((theme) => theme.kind === 'dark'))
})

check('themes', 'lookup helpers', () => {
  assert.ok(isTheme('ocean'))
  assert.ok(!isTheme('nope'))
  assert.equal(getTheme('nope').id, themes[0].id)
  assert.equal(themeLabel('ko', 'light'), '라이트')
  assert.equal(themeLabel('en', 'light'), 'Light')
})

/* ------------------------------------------------------------ settings */

check('settings', 'recent files keep at most ten, newest first, without duplicates', () => {
  let list = []
  for (let i = 0; i < 14; i += 1) list = addRecent(list, { path: `/f${i}.md`, name: `f${i}.md`, format: 'markdown', at: i })
  assert.equal(list.length, MAX_RECENT)
  assert.equal(list[0].path, '/f13.md')
  list = addRecent(list, { path: '/f5.md', name: 'f5.md', format: 'markdown', at: 99 })
  assert.equal(list.filter((item) => item.path === '/f5.md').length, 1)
  assert.equal(list[0].path, '/f5.md')
  assert.equal(removeRecent(list, '/f5.md').length, MAX_RECENT - 1)
})

check('settings', 'defaults are sane', () => {
  assert.equal(defaultSettings.recentFiles.length, 0)
  assert.ok(isFormatId(defaultSettings.defaultFrom) && isFormatId(defaultSettings.defaultTo))
  assert.ok(defaultSettings.backgroundOpacity === 30 && defaultSettings.zoom === 100)
  assert.deepEqual(defaultSettings.writerDefaults, defaultWriterOptions)
})

/* ------------------------------------------------------------- history */

check('history', 'undo and redo walk the stack', () => {
  let history = createHistory()
  history = push(history, { source: 'a' }, 'labelTyping')
  history = push(history, { source: 'b' }, 'labelOption')
  const first = undo(history, { source: 'c' })
  assert.equal(first.state.source, 'b')
  assert.equal(first.label, 'labelOption')
  const second = undo(first.history, first.state)
  assert.equal(second.state.source, 'a')
  assert.equal(undo(second.history, second.state), null)
  const again = redo(second.history, second.state)
  assert.equal(again.state.source, 'b')
  assert.equal(redo(redo(again.history, again.state).history, { source: 'c' }), null)
})

check('history', 'typing bursts coalesce into one step and a new edit clears redo', () => {
  let history = createHistory()
  history = push(history, { source: 'a' }, 'labelTyping', true)
  history = push(history, { source: 'ab' }, 'labelTyping', true)
  assert.equal(history.undo.length, 1)
  history.undo[0].at -= COALESCE_MS + 10
  history = push(history, { source: 'abc' }, 'labelTyping', true)
  assert.equal(history.undo.length, 2)
  const undone = undo(history, { source: 'abcd' })
  assert.equal(undone.history.redo.length, 1)
  const pushed = push(undone.history, undone.state, 'labelOption')
  assert.equal(pushed.redo.length, 0)
})

check('history', 'the stack is bounded', () => {
  let history = createHistory(5)
  for (let i = 0; i < 20; i += 1) history = push(history, { source: String(i) }, `l${i}`)
  assert.equal(history.undo.length, 5)
})

/* ------------------------------------------------------------- project */

check('project', 'serialize and parse a .mdcv project', () => {
  const text = serializeProject({ name: 'demo', from: 'markdown', to: 'docx', source: '# Hi', options: { toc: true } })
  const parsed = parseProject(text)
  assert.equal(parsed.format, 'mdcv')
  assert.equal(parsed.name, 'demo')
  assert.equal(parsed.to, 'docx')
  assert.equal(parsed.source, '# Hi')
  assert.equal(parsed.options.toc, true)
  assert.ok(parsed.savedAt)
  assert.ok(isProjectName('x.MDCV') && !isProjectName('x.md'))
})

check('project', 'other JSON is rejected and unknown formats fall back', () => {
  assert.throws(() => parseProject('{"format":"other","source":"x"}'))
  const parsed = parseProject(JSON.stringify({ format: 'mdcv', source: 'x', from: 'bogus', to: 'bogus' }))
  assert.equal(parsed.from, 'markdown')
  assert.equal(parsed.to, 'html')
})

/* -------------------------------------------------------------- errors */

check('errors', 'a report carries the action, the message, the stack and the environment', () => {
  const report = buildErrorReport(new TypeError('boom'), { action: 'Saving', source: 'main', extra: { Document: 'a.md' } }, '1.0.0')
  assert.equal(report.title, 'Saving')
  assert.equal(report.message, 'boom')
  for (const part of ['My Document Converter 1.0.0', 'Action: Saving', 'Source: main', 'Document: a.md', 'TypeError: boom']) assert.ok(report.details.includes(part), part)
  assert.equal(describeError('plain string').message, 'plain string')
  assert.equal(describeError({ message: 'obj' }).message, 'obj')
})

/* ------------------------------------------------------------- helpers */

check('helpers', 'path helpers work with both separators', () => {
  assert.equal(joinPath('C:\\a\\b', 'c.md'), 'C:\\a\\b\\c.md')
  assert.equal(joinPath('/a/b/', 'c.md'), '/a/b/c.md')
  assert.equal(joinPath('', 'c.md'), 'c.md')
  assert.equal(directoryOf('C:\\a\\b\\c.md'), 'C:\\a\\b')
  assert.equal(directoryOf('/a/b/c.md'), '/a/b')
  assert.equal(baseName('/a/b/c.md'), 'c.md')
  assert.equal(stripExtension('c.tar.md'), 'c.tar')
  assert.ok(isTextName('x.md') && isTextName('x.mdcv') && !isTextName('x.docx'))
  assert.equal(bytesToBase64(new Uint8Array([104, 105])), 'aGk=')
})

check('helpers', 'file names map to formats', () => {
  assert.equal(formatForFile('notes.MD'), 'markdown')
  assert.equal(formatForFile('a.docx'), 'docx')
  assert.equal(formatForFile('a.unknownext'), 'markdown')
  assert.equal(getFormat('pdf').write, 'binary')
  assert.equal(getFormat('pdf').read, undefined)
  assert.equal(formats.find((format) => format.id === 'epub').group, 'ebook')
})

check('helpers', 'writer options normalise and dialogs know which results keep them open', () => {
  const options = normalizeOptions({ toc: true })
  assert.equal(options.toc, true)
  assert.equal(options.columns, defaultWriterOptions.columns)
  assert.ok(keepsWindowOpen('settings') && !keepsWindowOpen('print'))
  assert.ok(isLikelyMonospace('Consolas') && !isLikelyMonospace('Georgia'))
})

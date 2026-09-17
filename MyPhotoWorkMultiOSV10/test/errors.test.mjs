// Error reporting: the description a user sees and can paste, and the wiring
// that makes sure a failure reaches them instead of dying in the console.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildErrorReport, copyText, describeError } from '../src/lib/errors.ts'
import { t } from '../src/i18n.ts'

const root = new URL('..', import.meta.url)
const read = (relative) => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8')
const appSource = read('src/App.tsx')

/** `globalThis.navigator` is getter-only in Node, so it has to be redefined. */
function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
}
const dialogSource = read('src/dialogs.tsx')

/* ------------------------------------------------------------- describing */

test('describeError keeps an Error name, message and stack', () => {
  const error = new TypeError('canvas is not a function')
  const described = describeError(error)
  assert.equal(described.name, 'TypeError')
  assert.equal(described.message, 'canvas is not a function')
  assert.ok(described.stack.includes('TypeError'), 'the stack is lost')
})

test('describeError copes with whatever else gets thrown', () => {
  assert.deepEqual(describeError('plain string'), { name: 'Error', message: 'plain string', stack: '' })
  assert.equal(describeError(42).message, '42')
  assert.equal(describeError(null).message, 'null')
  assert.equal(describeError(undefined).message, 'undefined')

  const thrownObject = describeError({ name: 'IpcError', message: 'channel closed', stack: 'at ipc' })
  assert.deepEqual(thrownObject, { name: 'IpcError', message: 'channel closed', stack: 'at ipc' })
})

test('describeError serialises an object with no message rather than printing [object Object]', () => {
  const described = describeError({ code: 'ENOENT', path: 'C:/missing.png' })
  assert.ok(described.message.includes('ENOENT'), `unhelpful message: ${described.message}`)
  assert.ok(described.message.includes('C:/missing.png'))
})

test('describeError survives a circular object', () => {
  const circular = { code: 'LOOP' }
  circular.self = circular
  const described = describeError(circular)
  assert.ok(described.message.length > 0)
})

/* --------------------------------------------------------------- reports */

test('a report names the action, the error and the stack', () => {
  const report = buildErrorReport(new Error('boom'), { action: '파일 열기', source: 'main' })
  assert.equal(report.title, '파일 열기')
  assert.equal(report.message, 'boom')
  assert.ok(report.details.includes('Action: 파일 열기'), 'the action is missing from the copyable text')
  assert.ok(report.details.includes('Source: main'))
  assert.ok(report.details.includes('Error: boom'))
  assert.ok(report.details.includes('at '), 'the stack is missing')
})

test('a report carries the version, a timestamp and the environment', () => {
  const report = buildErrorReport(new Error('boom'), { action: 'x' }, '2.3.4')
  assert.ok(report.details.startsWith('My Photo Work 2.3.4'), report.details.slice(0, 40))
  assert.match(report.details, /Time: \d{4}-\d{2}-\d{2}T/)
  assert.ok(report.details.includes('Window: '), 'the window size is missing')
  assert.ok(report.details.includes('Shell: '), 'the shell is missing')
})

test('extra context is included, and empty values are left out', () => {
  const report = buildErrorReport(new Error('boom'), {
    action: 'x',
    extra: { Document: 'Untitled 1280x720', Layers: 3, Tool: 'brush', Missing: undefined, Blank: '' },
  })
  assert.ok(report.details.includes('Document: Untitled 1280x720'))
  assert.ok(report.details.includes('Layers: 3'))
  assert.ok(!report.details.includes('Missing:'), 'an undefined value should not be listed')
  assert.ok(!report.details.includes('Blank:'), 'an empty value should not be listed')
})

test('a report is still useful when the error has no message or stack', () => {
  const report = buildErrorReport({}, { action: 'x' })
  assert.ok(report.message.length > 0, 'the popup would show an empty message')
  assert.ok(report.details.includes('Action: x'))
})

test('the details are plain text, ready to paste', () => {
  const report = buildErrorReport(new Error('boom'), { action: 'x' })
  assert.equal(typeof report.details, 'string')
  assert.ok(report.details.split('\n').length > 4, 'the report is a single line')
})

/* --------------------------------------------------------------- copying */

test('copyText falls back when the async clipboard is unavailable', async () => {
  // A packaged popup is loaded over file://, which is not a secure context, so
  // navigator.clipboard is undefined there and the button used to do nothing.
  const originalNavigator = globalThis.navigator
  const calls = []
  setNavigator({})
  document.execCommand = (command) => { calls.push(command); return true }
  try {
    assert.equal(await copyText('hello'), true)
    assert.deepEqual(calls, ['copy'], 'the synchronous fallback was not used')
  } finally {
    setNavigator(originalNavigator)
    delete document.execCommand
  }
})

test('copyText reports failure rather than pretending it worked', async () => {
  const originalNavigator = globalThis.navigator
  setNavigator({})
  document.execCommand = () => false
  try {
    assert.equal(await copyText('hello'), false)
  } finally {
    setNavigator(originalNavigator)
    delete document.execCommand
  }
})

test('copyText prefers the async clipboard when it is there', async () => {
  const originalNavigator = globalThis.navigator
  let written = null
  setNavigator({ clipboard: { writeText: async (value) => { written = value } } })
  try {
    assert.equal(await copyText('report text'), true)
    assert.equal(written, 'report text')
  } finally {
    setNavigator(originalNavigator)
  }
})

/* ----------------------------------------------------------------- wiring */

test('every error string used by the reporter is translated', () => {
  const keys = [
    'error', 'details', 'openFailed', 'saveFailed', 'exportFailed', 'copied', 'copyFailed',
    'copyDetails', 'errorHint', 'errorUnexpected', 'errorWhileCommand', 'errorWhileFilter',
    'errorWhileDialog', 'errorInWindow', 'noLayerTitle', 'noLayerBody', 'lockedLayerTitle',
    'lockedLayerBody',
  ]
  for (const language of ['ko', 'en']) {
    for (const key of keys) {
      assert.notEqual(t(language, key), key, `${language} has no text for "${key}"`)
    }
  }
})

test('nothing escapes silently: the app installs global handlers', () => {
  assert.match(appSource, /window\.addEventListener\('error', onError\)/, 'uncaught errors are not reported')
  assert.match(appSource, /window\.addEventListener\('unhandledrejection', onRejection\)/, 'rejected promises are not reported')
  assert.match(appSource, /const reportError = useCallback/, 'there is no single reporter')
  assert.match(appSource, /buildErrorReport\(error, \{/, 'the reporter does not build a report')
})

test('commands, filters and dialog results all run inside the guard', () => {
  assert.match(appSource, /const guard = useCallback/, 'there is no guard helper')
  for (const [wrapper, inner] of [
    ['runCommand', 'runCommandUnguarded'],
    ['applyDialogResult', 'applyDialogResultUnguarded'],
    ['applyNamedFilter', 'applyNamedFilterUnguarded'],
  ]) {
    assert.ok(appSource.includes(`const ${inner} =`), `${wrapper} has no guarded inner function`)
    const call = `() => ${inner}(`
    assert.ok(appSource.includes(call), `${wrapper} never calls its guarded inner function`)
    const at = appSource.indexOf(call)
    assert.ok(appSource.lastIndexOf('guard(', at) > at - 140, `${wrapper} does not run inside the guard`)
  }
})

test('the guard reports a rejected promise as well as a thrown error', () => {
  const body = appSource.slice(appSource.indexOf('const guard = useCallback'), appSource.indexOf('// Anything that escapes a handler'))
  assert.match(body, /catch \(error\) \{/, 'a thrown error is not caught')
  assert.match(body, /\.catch\(\(error\) => reportErrorRef\.current/, 'a rejected promise is not reported')
})

test('a missing or locked layer is explained, not just flagged in the status bar', () => {
  const withLayer = appSource.slice(appSource.indexOf('const withLayer = useCallback'), appSource.indexOf('const applyCrop'))
  assert.ok(withLayer.includes("'noLayerTitle'"), 'a missing layer is still silent')
  assert.ok(withLayer.includes("'lockedLayerTitle'"), 'a locked layer is still silent')
  assert.ok(withLayer.includes('reportErrorRef.current'), 'neither case reaches the popup')
})

test('a failure inside a popup window is forwarded to the main window', () => {
  for (const file of ['src/DialogHost.tsx', 'src/MenuHost.tsx']) {
    const source = read(file)
    assert.match(source, /window\.addEventListener\('error', onError\)/, `${file} swallows its errors`)
    assert.match(source, /electronDialogApi\?\.reportError/, `${file} never forwards them`)
  }
  assert.match(read('electron/preload.cjs'), /reportError: \(report\) => ipcRenderer\.invoke\('dialog:error'/, 'no error channel')
  assert.match(read('electron/childwindows.cjs'), /ipcMain\.handle\('dialog:error'/, 'the main process does not route it')
  assert.match(appSource, /electronDialogApi\?\.onError/, 'the main window never listens')
})

test('the error popup shows the full detail and can copy it', () => {
  const body = dialogSource.slice(dialogSource.indexOf("case 'error':"), dialogSource.indexOf("    default:"))
  assert.match(body, /className="error-details"/, 'there is no detail block')
  assert.match(body, /readOnly/, 'the detail block should not be editable')
  assert.match(body, /onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}/, 'the text is not easy to select')
  assert.match(body, /copyText\(payload\.error\?\.details/, 'the copy button does not copy the details')
  assert.match(body, /copied \? tr\(copied\) : tr\('copyDetails'\)/, 'the copy gives no feedback')

  const css = read('src/App.css')
  assert.ok(css.includes('.error-details'), 'the detail block is unstyled')
  assert.ok(css.includes('user-select: text'), 'the detail text is not selectable')
})

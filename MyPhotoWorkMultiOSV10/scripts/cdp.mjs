// A small Chrome DevTools Protocol client: WebView2 (the Tauri windows) and a headless
// Edge both expose every page on one debugging port. Uses Node's fetch and WebSocket.
import { existsSync } from 'node:fs'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  return (await response.json()).filter((target) => target.type === 'page')
}

export async function waitForTarget(port, match, ms = 60000) {
  const start = Date.now()
  let last = []
  while (Date.now() - start < ms) {
    try {
      last = await listTargets(port)
      const hit = last.find(match)
      if (hit) return hit
    } catch { /* still starting */ }
    await sleep(150)
  }
  throw new Error(`no matching page after ${ms} ms (have: ${last.map((target) => target.url).join(', ') || 'none'})`)
}

export async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
  })
  let sequence = 0
  const pending = new Map()
  const listeners = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString())
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    } else if (message.method) {
      for (const listener of listeners.get(message.method) ?? []) listener(message.params)
    }
  })
  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('CDP socket closed'))
    pending.clear()
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    sequence += 1
    pending.set(sequence, { resolve, reject })
    socket.send(JSON.stringify({ id: sequence, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails
      throw new Error(detail.exception?.description ?? detail.text)
    }
    return result.result?.value
  }
  const until = async (expression, ms = 30000) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      // Boolean: an element does not survive returnByValue, and would read as undefined.
      if (await evaluate(`Boolean(${expression})`).catch(() => false)) return true
      await sleep(80)
    }
    throw new Error(`timed out waiting for: ${expression}`)
  }
  const screenshot = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
  const on = (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener])
  return { send, on, evaluate, until, screenshot, close: () => socket.close() }
}

/** Edge, or Chrome, for the headless runs. */
export function findBrowser() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  const found = candidates.find((file) => existsSync(file))
  if (!found) throw new Error('no Edge or Chrome found')
  return found
}

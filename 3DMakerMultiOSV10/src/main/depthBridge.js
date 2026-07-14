import { app, ipcMain, utilityProcess } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** @type {Electron.UtilityProcess | null} */
let child = null
/** @type {Promise<Electron.UtilityProcess> | null} */
let starting = null
/** @type {Map<string, { resolve: Function, reject: Function, sender: Electron.WebContents }>} */
const pending = new Map()

function childScriptPath() {
  return join(__dirname, 'depthChild.js')
}

function modelCacheDir() {
  return join(app.getPath('userData'), 'hf-model-cache')
}

function rejectAllPending(error) {
  for (const [, entry] of pending) {
    entry.reject(error)
  }
  pending.clear()
}

/**
 * @param {Electron.UtilityProcess} proc
 */
function attachRuntimeHandlers(proc) {
  proc.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return

    if (msg.type === 'progress') {
      const entry = pending.get(msg.requestId)
      if (entry?.sender && !entry.sender.isDestroyed()) {
        entry.sender.send('depth:progress', msg.message)
      }
      return
    }

    if (msg.type === 'result') {
      const entry = pending.get(msg.requestId)
      if (!entry) return
      pending.delete(msg.requestId)
      entry.resolve({
        width: msg.width,
        height: msg.height,
        modelId: msg.modelId,
        data: msg.data
      })
      return
    }

    if (msg.type === 'error') {
      const entry = pending.get(msg.requestId)
      if (!entry) return
      pending.delete(msg.requestId)
      const err = new Error(msg.message || '깊이 추정 실패')
      if (msg.stack) err.stack = msg.stack
      entry.reject(err)
    }
  })

  proc.on('exit', (code) => {
    if (child === proc) child = null
    rejectAllPending(new Error(`깊이 워커가 종료되었습니다 (code=${code})`))
  })

  if (proc.stdout) {
    proc.stdout.on('data', (buf) => console.log('[depthChild]', buf.toString().trim()))
  }
  if (proc.stderr) {
    proc.stderr.on('data', (buf) => console.error('[depthChild]', buf.toString().trim()))
  }
}

function ensureChild() {
  if (child) return Promise.resolve(child)
  if (starting) return starting

  starting = new Promise((resolve, reject) => {
    let settled = false
    const proc = utilityProcess.fork(childScriptPath(), [], {
      serviceName: 'depth-estimation',
      stdio: 'pipe'
    })

    const finish = (fn, value) => {
      if (settled) return
      settled = true
      starting = null
      clearTimeout(timer)
      fn(value)
    }

    const onMessage = (msg) => {
      if (msg?.type === 'boot') {
        proc.postMessage({ type: 'init', cacheDir: modelCacheDir() })
        return
      }
      if (msg?.type === 'ready') {
        proc.off('message', onMessage)
        child = proc
        attachRuntimeHandlers(proc)
        finish(resolve, proc)
      }
    }

    const onExit = (code) => {
      proc.off('message', onMessage)
      finish(reject, new Error(`깊이 워커 시작 실패 (exit ${code})`))
    }

    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        /* ignore */
      }
      finish(reject, new Error('깊이 워커 시작 시간 초과'))
    }, 45000)

    proc.on('message', onMessage)
    proc.once('exit', onExit)
  })

  return starting
}

export function registerDepthBridge() {
  ipcMain.handle('depth:estimate', async (event, payload) => {
    const proc = await ensureChild()
    const requestId = randomUUID()

    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, sender: event.sender })

      try {
        proc.postMessage({
          type: 'estimate',
          requestId,
          modelId: payload.modelId,
          width: payload.width,
          height: payload.height,
          rgba: payload.rgba
        })
      } catch (err) {
        pending.delete(requestId)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  })

  app.on('before-quit', () => {
    if (child) {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      child = null
    }
  })
}

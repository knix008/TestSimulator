/**
 * The line protocol between this Node host and the Tauri program
 * (src-tauri/src/host.rs). One JSON object per line; stdout carries nothing
 * else, so console.log goes to stderr.
 *
 *   Tauri → host   { t:'req', id, m, a }   a page call (m = the old Electron IPC channel, a = argument list)
 *   host → Tauri   { t:'res', id, ok, v | e }
 *                  { t:'emit', ch, p }     an event for the page (webContents.send)
 *                  { t:'ready' }           sent once the handlers are registered
 *
 * The host exits when its stdin closes (the program has gone).
 */
import readline from 'node:readline'

console.log = console.error
console.info = console.error

type Handler = (...args: any[]) => unknown

const handlers = new Map<string, Handler>()

function write(msg: unknown): void {
  try {
    process.stdout.write(`${JSON.stringify(msg)}\n`)
  } catch (err) {
    console.error('[host] write failed', err)
  }
}

export function handle(channel: string, fn: Handler): void {
  handlers.set(channel, fn)
}

export function emit(channel: string, payload: unknown): void {
  write({ t: 'emit', ch: channel, p: payload === undefined ? null : payload })
}

function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as Error).message)
  return String(err)
}

async function onRequest(msg: { id: number; m: string; a?: unknown }): Promise<void> {
  const fn = handlers.get(msg.m)
  if (!fn) {
    write({ t: 'res', id: msg.id, ok: false, e: `unknown channel: ${msg.m}` })
    return
  }
  try {
    const args = Array.isArray(msg.a) ? msg.a : msg.a == null ? [] : [msg.a]
    const value = await fn(...args)
    write({ t: 'res', id: msg.id, ok: true, v: value === undefined ? null : value })
  } catch (err) {
    write({ t: 'res', id: msg.id, ok: false, e: errorText(err) })
  }
}

/** Starts reading requests; `onExit` runs when the program closes our stdin. */
export function serve(onExit: () => void): void {
  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    if (!line.trim()) return
    let msg: any
    try {
      msg = JSON.parse(line)
    } catch {
      console.error('[host] bad line', line)
      return
    }
    if (msg?.t === 'req') void onRequest(msg)
  })
  rl.on('close', () => {
    onExit()
    process.exit(0)
  })
  write({ t: 'ready' })
}

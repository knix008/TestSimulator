// The real Rust engine (src-tauri/isohost, the same code the program calls) driven over its
// stdio binary `isomaker-host`: one JSON request per line, answers matched by id. Each client
// gets its own temp folder for settings and packages.
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

export const root = path.resolve(import.meta.dirname, '..')
let built = false
export const hostExe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'isomaker-host.exe' : 'isomaker-host')

/** Builds the engine's stdio binary (incremental: fast after the first time). */
export function buildHost() {
  if (built) return
  execFileSync('cargo', ['build', '--quiet', '--manifest-path', path.join(root, 'src-tauri', 'isohost', 'Cargo.toml')], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  built = true
}

export function startHost(prefix = 'isomaker-test-') {
  buildHost()
  const work = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const env = { ...process.env, ISOMAKER_USER_DATA: path.join(work, 'config'), ISOMAKER_TOOLS_DIR: path.join(work, 'tools') }
  delete env.ELECTRON_RUN_AS_NODE
  const proc = spawn(hostExe, [], { cwd: root, env, stdio: ['pipe', 'pipe', 'inherit'] })
  const pending = new Map()
  const events = []
  let next = 1
  readline.createInterface({ input: proc.stdout }).on('line', (line) => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg.t === 'emit') events.push(msg)
    if (msg.t === 'res' && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.ok) resolve(msg.v)
      else reject(new Error(msg.e))
    }
  })
  const call = (m, ...a) =>
    new Promise((resolve, reject) => {
      const id = next++
      pending.set(id, { resolve, reject })
      proc.stdin.write(`${JSON.stringify({ t: 'req', id, m, a })}\n`)
    })
  const stop = () =>
    new Promise((resolve) => {
      proc.once('exit', () => {
        try {
          fs.rmSync(work, { recursive: true, force: true })
        } catch {
          /* a mounted image or a scanner may still hold a file for a moment */
        }
        resolve()
      })
      proc.stdin.end()
      setTimeout(() => proc.kill(), 3000)
    })
  const write = (rel, data, base = path.join(work, 'src')) => {
    const p = path.join(base, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, data)
    return p
  }
  return { call, stop, work, events, write }
}

export function flatten(nodes, out = new Map()) {
  for (const n of nodes) {
    out.set(n.path, n)
    if (n.children) flatten(n.children, out)
  }
  return out
}

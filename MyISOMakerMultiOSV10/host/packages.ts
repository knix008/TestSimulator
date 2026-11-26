/**
 * External packages MyISOMaker needs, and installing them.
 *
 *   xorriso         create ISO, bootable ISO, full extract      (required)
 *   squashfs-tools  unsquashfs / mksquashfs for AppImage        (optional)
 *
 * Windows: the MSYS2 packages (the program and the few runtime libraries it
 * links) are downloaded from repo.msys2.org and unpacked into the app's own
 * folder (%LOCALAPPDATA%\MyISOMaker\tools\msys\usr\bin) — no MSYS2 install, no
 * administrator rights. The repository index (msys.db) gives file names,
 * dependencies and SHA-256 sums; .pkg.tar.zst is unpacked with Node's zstd.
 * macOS: Homebrew. Linux: the system package manager through pkexec.
 *
 * Progress goes to the page as `pkg:progress` events.
 */
import { spawn, execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

export type PackageId = 'xorriso' | 'squashfs'

export type PackageStatus = {
  id: PackageId
  required: boolean
  /** app = installed by MyISOMaker, system = found elsewhere, missing */
  state: 'app' | 'system' | 'missing'
  path: string | null
  version: string | null
  /** Install / reinstall / remove are offered on this system. */
  canInstall: boolean
  /** How the install works here (shown in Settings). */
  method: string
}

export type PackageProgress = {
  id: PackageId
  action: 'install' | 'reinstall' | 'remove'
  phase: 'index' | 'resolve' | 'download' | 'verify' | 'unpack' | 'run' | 'done' | 'error' | 'canceled'
  percent: number | null
  message: string
  /** download: bytes so far / total */
  bytes?: number
  total?: number
}

type Emit = (p: PackageProgress) => void

const MSYS_REPO = process.env.ISOMAKER_MSYS_REPO || 'https://repo.msys2.org/msys/x86_64'
const ROOT_PKG: Record<PackageId, string> = { xorriso: 'xorriso', squashfs: 'squashfs-tools' }
const MAIN_EXE: Record<PackageId, string[]> = {
  xorriso: ['xorriso'],
  squashfs: ['unsquashfs', 'mksquashfs'],
}
const BREW: Record<PackageId, string> = { xorriso: 'xorriso', squashfs: 'squashfs' }
const LINUX: Record<PackageId, string> = { xorriso: 'xorriso', squashfs: 'squashfs-tools' }

// ── Where the app keeps its own copies ───────────────────────

export function toolsDir(): string {
  if (process.env.ISOMAKER_TOOLS_DIR) return process.env.ISOMAKER_TOOLS_DIR
  const base =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
      : path.join(os.homedir(), '.local', 'share')
  return path.join(base, 'MyISOMaker', 'tools')
}

/** The bin folder of the app's MSYS copy (Windows). */
export function toolsBinDir(): string {
  return path.join(toolsDir(), 'msys', 'usr', 'bin')
}

/** The app's own copy of a program, if installed. */
export function appToolPath(name: string): string | null {
  if (process.platform !== 'win32') return null
  const p = path.join(toolsBinDir(), `${name}.exe`)
  return fs.existsSync(p) ? p : null
}

type Manifest = { packages: Partial<Record<PackageId, { files: string[]; pkgs: string[]; at: string }>> }

function manifestPath(): string {
  return path.join(toolsDir(), 'manifest.json')
}

function readManifest(): Manifest {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath(), 'utf8'))
    return m && typeof m === 'object' && m.packages ? m : { packages: {} }
  } catch {
    return { packages: {} }
  }
}

function writeManifest(m: Manifest): void {
  fs.mkdirSync(toolsDir(), { recursive: true })
  fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2))
}

// ── Status ───────────────────────────────────────────────────

function which(command: string): string | null {
  try {
    const out =
      process.platform === 'win32'
        ? execFileSync('where', [command], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
        : execFileSync('which', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null
  } catch {
    return null
  }
}

function systemToolPath(name: string): string | null {
  if (process.platform === 'win32') {
    for (const root of [process.env.MSYS2_ROOT, 'C:\\msys64', 'C:\\msys32', process.env.CYGWIN_ROOT, 'C:\\cygwin64']) {
      if (!root) continue
      for (const c of [path.join(root, 'usr', 'bin', `${name}.exe`), path.join(root, 'bin', `${name}.exe`)]) {
        if (fs.existsSync(c)) return c
      }
    }
    return which(`${name}.exe`)
  }
  for (const c of [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`, `/usr/sbin/${name}`]) {
    if (fs.existsSync(c)) return c
  }
  return which(name)
}

function versionOf(binary: string, id: PackageId): string | null {
  try {
    const env = { ...process.env }
    if (process.platform === 'win32') env.PATH = `${path.dirname(binary)};${env.PATH ?? ''}`
    const out = execFileSync(binary, id === 'xorriso' ? ['-version'] : ['-version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const m = /xorriso\s+([\d.]+)/i.exec(out) || /version\s+([\d.]+)/i.exec(out) || /([\d]+\.[\d.]+)/.exec(out)
    return m ? m[1]! : null
  } catch (err: any) {
    const text = `${err?.stdout ?? ''}${err?.stderr ?? ''}`
    const m = /version\s+([\d.]+)/i.exec(text) || /([\d]+\.[\d.]+)/.exec(text)
    return m ? m[1]! : null
  }
}

function methodText(): string {
  if (process.platform === 'win32') return `MSYS2 → ${toolsDir()}`
  if (process.platform === 'darwin') return 'Homebrew (brew)'
  const pm = linuxPackageManager()
  return pm ? `${pm.name} (pkexec)` : 'none'
}

export function packageStatus(): PackageStatus[] {
  return (Object.keys(ROOT_PKG) as PackageId[]).map((id) => {
    const exe = MAIN_EXE[id][0]!
    const own = appToolPath(exe)
    const sys = own ? null : systemToolPath(exe)
    const p = own ?? sys
    return {
      id,
      required: id === 'xorriso',
      state: own ? 'app' : sys ? 'system' : 'missing',
      path: p,
      version: p ? versionOf(p, id) : null,
      canInstall:
        process.platform === 'win32' ||
        (process.platform === 'darwin' ? Boolean(systemToolPath('brew')) : Boolean(linuxPackageManager())),
      method: methodText(),
    }
  })
}

// ── Jobs ─────────────────────────────────────────────────────

let current: AbortController | null = null

export function cancelPackageJob(): boolean {
  if (!current) return false
  current.abort()
  return true
}

export async function runPackageJob(
  id: PackageId,
  action: 'install' | 'reinstall' | 'remove',
  emit: Emit,
): Promise<PackageStatus[]> {
  if (!(id in ROOT_PKG)) throw new Error(`unknown package: ${id}`)
  if (current) throw new Error('A package job is already running')
  const ctl = new AbortController()
  current = ctl
  const say = (phase: PackageProgress['phase'], message: string, percent: number | null = null, extra: Partial<PackageProgress> = {}) =>
    emit({ id, action, phase, percent, message, ...extra })
  try {
    if (process.platform === 'win32') {
      if (action === 'remove') removeMsys(id, say)
      else await installMsys(id, action === 'reinstall', ctl.signal, say)
    } else if (process.platform === 'darwin') {
      const verb = action === 'remove' ? 'uninstall' : action === 'reinstall' ? 'reinstall' : 'install'
      await runStreamed(systemToolPath('brew') || 'brew', [verb, BREW[id]], ctl.signal, say)
    } else {
      const pm = linuxPackageManager()
      if (!pm) throw new Error('No supported package manager (apt-get, dnf, pacman, zypper) was found.')
      await runStreamed('pkexec', pm.args(action, LINUX[id]), ctl.signal, say)
    }
    say('done', action === 'remove' ? 'Removed' : 'Installed', 100)
    return packageStatus()
  } catch (err: any) {
    if (ctl.signal.aborted) {
      say('canceled', 'Canceled')
      throw new Error('PKG_CANCELED')
    }
    say('error', err?.message ?? String(err))
    throw err
  } finally {
    if (current === ctl) current = null
  }
}

/** Installs what is missing and required (xorriso), unless a copy exists anywhere. */
export function missingRequired(): PackageId[] {
  return packageStatus().filter((p) => p.required && p.state === 'missing' && p.canInstall).map((p) => p.id)
}

// ── macOS / Linux ────────────────────────────────────────────

function linuxPackageManager(): { name: string; args: (a: string, pkg: string) => string[] } | null {
  if (process.platform !== 'linux') return null
  if (systemToolPath('apt-get'))
    return {
      name: 'apt-get',
      args: (a, p) => (a === 'remove' ? ['apt-get', 'remove', '-y', p] : ['apt-get', 'install', '-y', ...(a === 'reinstall' ? ['--reinstall'] : []), p]),
    }
  if (systemToolPath('dnf'))
    return { name: 'dnf', args: (a, p) => ['dnf', a === 'remove' ? 'remove' : a === 'reinstall' ? 'reinstall' : 'install', '-y', p] }
  if (systemToolPath('pacman'))
    return { name: 'pacman', args: (a, p) => (a === 'remove' ? ['pacman', '-R', '--noconfirm', p] : ['pacman', '-S', '--noconfirm', p]) }
  if (systemToolPath('zypper'))
    return {
      name: 'zypper',
      args: (a, p) => ['zypper', '--non-interactive', a === 'remove' ? 'remove' : 'install', ...(a === 'reinstall' ? ['-f'] : []), p],
    }
  return null
}

function runStreamed(cmd: string, args: string[], signal: AbortSignal, say: (phase: PackageProgress['phase'], m: string, pct?: number | null) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    say('run', `${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const onAbort = () => child.kill()
    signal.addEventListener('abort', onAbort, { once: true })
    let tail = ''
    const line = (buf: Buffer) => {
      for (const l of buf.toString('utf8').split(/\r?\n/)) {
        const s = l.trim()
        if (!s) continue
        tail = s
        const pct = /(\d{1,3})%/.exec(s)
        say('run', s, pct ? Math.min(99, Number(pct[1])) : null)
      }
    }
    child.stdout.on('data', line)
    child.stderr.on('data', line)
    child.on('error', (e) => reject(e))
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with ${code}${tail ? `: ${tail}` : ''}`))
    })
  })
}

// ── Windows: MSYS2 packages ──────────────────────────────────

type RepoPkg = { name: string; filename: string; version: string; depends: string[]; provides: string[]; sha256: string; csize: number }

export function decompress(buf: Buffer): Buffer {
  if (buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd) {
    const z = zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer }
    if (!z.zstdDecompressSync) throw new Error('This Node.js has no zstd support (needs 22.15+).')
    return z.zstdDecompressSync(buf)
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf)
  if (buf[0] === 0xfd && buf[1] === 0x37) throw new Error('xz-compressed packages are not supported')
  return buf
}

type TarEntry = { name: string; type: string; data: Buffer; linkname: string }

/** Minimal ustar / pax reader (enough for pacman packages and databases). */
export function readTar(buf: Buffer): TarEntry[] {
  const out: TarEntry[] = []
  let off = 0
  let paxName: string | null = null
  let longName: string | null = null
  const str = (b: Buffer) => {
    const i = b.indexOf(0)
    return b.subarray(0, i < 0 ? b.length : i).toString('utf8')
  }
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512)
    if (h.every((x) => x === 0)) break
    const sizeText = str(h.subarray(124, 136)).trim()
    const size = parseInt(sizeText || '0', 8)
    const type = String.fromCharCode(h[156] || 48)
    const prefix = str(h.subarray(345, 500))
    let name = str(h.subarray(0, 100))
    if (prefix) name = `${prefix}/${name}`
    const linkname = str(h.subarray(157, 257))
    const data = buf.subarray(off + 512, off + 512 + size)
    off += 512 + Math.ceil(size / 512) * 512
    if (type === 'x') {
      const m = /\d+ path=([^\n]*)\n/.exec(data.toString('utf8'))
      paxName = m ? m[1]! : null
      continue
    }
    if (type === 'L') {
      longName = str(data)
      continue
    }
    if (type === 'g') continue
    out.push({ name: paxName ?? longName ?? name, type, data, linkname })
    paxName = null
    longName = null
  }
  return out
}

function parseDesc(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  let key = ''
  for (const line of text.split('\n')) {
    const m = /^%([A-Z0-9]+)%$/.exec(line)
    if (m) {
      key = m[1]!
      out[key] = []
    } else if (key && line) out[key]!.push(line)
  }
  return out
}

const stripVersion = (dep: string) => dep.replace(/[<>=].*$/, '').trim()

async function fetchBuffer(
  url: string,
  signal: AbortSignal,
  onBytes?: (n: number) => void,
): Promise<Buffer> {
  let res: Response
  try {
    res = await fetch(url, { signal, redirect: 'follow' })
  } catch (err: any) {
    if (signal.aborted) throw err
    const cause = err?.cause?.code || err?.cause?.message || err?.message || String(err)
    throw new Error(`Could not download ${url} (${cause}). Check the internet connection.`)
  }
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`)
  const chunks: Buffer[] = []
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    onBytes?.(value.byteLength)
  }
  return Buffer.concat(chunks)
}

async function loadRepo(signal: AbortSignal): Promise<Map<string, RepoPkg>> {
  return parseRepoDb(await fetchBuffer(`${MSYS_REPO}/msys.db`, signal))
}

/** msys.db (zstd/gzip tar of <name-ver>/desc) → packages by name and by what they provide. */
export function parseRepoDb(raw: Buffer): Map<string, RepoPkg> {
  const db = readTar(decompress(raw))
  const map = new Map<string, RepoPkg>()
  for (const e of db) {
    if (!e.name.endsWith('/desc')) continue
    const d = parseDesc(e.data.toString('utf8'))
    const pkg: RepoPkg = {
      name: d.NAME?.[0] ?? '',
      filename: d.FILENAME?.[0] ?? '',
      version: d.VERSION?.[0] ?? '',
      depends: (d.DEPENDS ?? []).map(stripVersion),
      provides: (d.PROVIDES ?? []).map(stripVersion),
      sha256: d.SHA256SUM?.[0] ?? '',
      csize: Number(d.CSIZE?.[0] ?? 0),
    }
    if (pkg.name && pkg.filename) map.set(pkg.name, pkg)
  }
  // Virtual names (e.g. "sh") resolve to the package that provides them.
  for (const p of [...map.values()]) for (const v of p.provides) if (!map.has(v)) map.set(v, p)
  return map
}

/** The root package and everything it needs, without what a plain MSYS bin folder never uses. */
export function resolveDeps(repo: Map<string, RepoPkg>, root: string): RepoPkg[] {
  // Shells and the filesystem skeleton are run-time extras of MSYS; the tools work without them.
  const skip = new Set(['sh', 'bash', 'filesystem', 'coreutils', 'grep', 'sed', 'findutils', 'gawk', 'ncurses-terminfo'])
  const seen = new Map<string, RepoPkg>()
  const visit = (name: string) => {
    if (skip.has(name)) return
    const p = repo.get(name)
    if (!p || seen.has(p.name)) return
    seen.set(p.name, p)
    for (const d of p.depends) visit(d)
  }
  visit(root)
  // Every MSYS program links msys-2.0.dll; packages do not list it.
  if (seen.size) visit('msys2-runtime')
  if (!seen.size) throw new Error(`${root} was not found in the MSYS2 repository`)
  return [...seen.values()]
}

async function installMsys(
  id: PackageId,
  reinstall: boolean,
  signal: AbortSignal,
  say: (phase: PackageProgress['phase'], m: string, pct?: number | null, extra?: Partial<PackageProgress>) => void,
): Promise<void> {
  say('index', 'MSYS2 package index…', 2)
  const repo = await loadRepo(signal)
  say('resolve', 'Resolving dependencies…', 5)
  const pkgs = resolveDeps(repo, ROOT_PKG[id])
  const total = pkgs.reduce((a, p) => a + (p.csize || 0), 0) || 1
  let done = 0
  const bin = toolsBinDir()
  const manifest = readManifest()
  if (reinstall) removeFiles(id, manifest)
  fs.mkdirSync(bin, { recursive: true })
  const files = new Set<string>()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isomaker-pkg-'))
  try {
    const downloaded: { pkg: RepoPkg; data: Buffer }[] = []
    for (const pkg of pkgs) {
      say('download', `${pkg.name} ${pkg.version}`, 5 + Math.round((done / total) * 75), { bytes: done, total })
      const data = await fetchBuffer(`${MSYS_REPO}/${pkg.filename}`, signal, (n) => {
        done += n
        say('download', `${pkg.name} ${pkg.version}`, 5 + Math.min(75, Math.round((done / total) * 75)), { bytes: done, total })
      })
      say('verify', `${pkg.name}: SHA-256`, null)
      if (pkg.sha256) {
        const sum = crypto.createHash('sha256').update(data).digest('hex')
        if (sum !== pkg.sha256) throw new Error(`Checksum mismatch: ${pkg.filename}`)
      }
      downloaded.push({ pkg, data })
    }
    let n = 0
    for (const { pkg, data } of downloaded) {
      if (signal.aborted) throw new Error('aborted')
      n += 1
      say('unpack', `${pkg.name}`, 80 + Math.round((n / downloaded.length) * 18))
      for (const e of readTar(decompress(data))) {
        if (!e.name.startsWith('usr/bin/') || (e.type !== '0' && e.type !== '\0')) continue
        const rel = e.name.slice('usr/bin/'.length)
        if (!rel || rel.includes('/') || !/\.(exe|dll)$/i.test(rel)) continue
        fs.writeFileSync(path.join(bin, rel), e.data)
        files.add(rel)
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  for (const exe of MAIN_EXE[id]) {
    if (!fs.existsSync(path.join(bin, `${exe}.exe`))) throw new Error(`${exe}.exe is missing after unpacking`)
  }
  manifest.packages[id] = { files: [...files].sort(), pkgs: pkgs.map((p) => `${p.name}-${p.version}`), at: new Date().toISOString() }
  writeManifest(manifest)
  // MSYS wants these folders to exist next to usr/.
  for (const d of ['tmp', 'etc']) fs.mkdirSync(path.join(toolsDir(), 'msys', d), { recursive: true })
  say('verify', 'Checking the installed program…', 99)
  const v = versionOf(path.join(bin, `${MAIN_EXE[id][0]}.exe`), id)
  if (!v && id === 'xorriso') throw new Error('xorriso was unpacked but does not start')
}

/** Deletes the files of `id` that no other installed package also uses. */
function removeFiles(id: PackageId, manifest: Manifest): void {
  const mine = manifest.packages[id]?.files ?? []
  const others = new Set(
    Object.entries(manifest.packages)
      .filter(([k]) => k !== id)
      .flatMap(([, v]) => v?.files ?? []),
  )
  for (const f of mine) {
    if (others.has(f)) continue
    try {
      fs.rmSync(path.join(toolsBinDir(), f), { force: true })
    } catch {
      /* in use: left behind */
    }
  }
  delete manifest.packages[id]
}

function removeMsys(id: PackageId, say: (phase: PackageProgress['phase'], m: string, pct?: number | null) => void): void {
  say('run', 'Removing…', 30)
  const manifest = readManifest()
  removeFiles(id, manifest)
  if (!Object.keys(manifest.packages).length) {
    fs.rmSync(toolsDir(), { recursive: true, force: true })
  } else {
    writeManifest(manifest)
  }
}
